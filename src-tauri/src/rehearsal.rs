//! A short private run of the whole chain (OBS, the ingest server and the platforms that have a
//! way to receive without showing anything) so the first real live is not the first test.
//!
//! Nothing here can go public: a destination only receives data through a platform test mode
//! declared in its `destination.json`, or through a broadcast its account provider opens as
//! private. Every other destination is reported as skipped and never contacted.
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

use crate::config::{AppConfig, Settings, Target};
use crate::engine;
use crate::engine_policy::{
    classify_target_line, stats_written_kb, target_error_update, TargetErrorUpdate, TargetLine,
};
use crate::http_client as ureq;
use crate::platforms::provider::{AccountProvider, PlatformIssue, ProvisionedIngest};
use crate::AppState;

/// OBS gets this long to deliver its first frame after being asked to start.
const SIGNAL_WAIT: Duration = Duration::from_secs(15);
/// How long the platforms receive once the signal is there.
const SEND_FOR: Duration = Duration::from_secs(24);
/// A platform's own verdict is asked once, late enough for it to have graded the ingest.
const VERDICT_AFTER: Duration = Duration::from_secs(18);

static CANCEL: AtomicBool = AtomicBool::new(false);

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TestRoute {
    /// The platform's own test mode: it receives, and shows nothing on the channel.
    BandwidthTest,
    /// A broadcast opened as private for this rehearsal.
    PrivateBroadcast,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RehearsalOutcome {
    Pending,
    Received,
    /// Received, and the platform asked for a settings change.
    Warned,
    /// The platform refused the key or the account.
    Refused,
    Failed,
    /// No private way to test this destination; it was not contacted.
    Skipped,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SkipReason {
    /// The platform has a test mode, but there is no stream key to use it with yet.
    NoKey,
    /// The platform has no private way to receive from this server.
    NoTestMode,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RehearsalTarget {
    pub target_id: String,
    pub platform_id: String,
    pub name: String,
    pub route: Option<TestRoute>,
    pub outcome: RehearsalOutcome,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub issues: Vec<PlatformIssue>,
    /// Localized reason for a refusal or failure.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    /// Why a skipped destination was left out.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skip: Option<SkipReason>,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RehearsalPhase {
    Starting,
    WaitingObs,
    Sending,
    Done,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RehearsalReport {
    pub phase: RehearsalPhase,
    /// Corneta pressed play in OBS itself; false means the user has to.
    pub obs_started: bool,
    pub signal_arrived: bool,
    pub has_audio: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signal_kbps: Option<u32>,
    pub seconds_left: u32,
    pub targets: Vec<RehearsalTarget>,
    /// A frame of what arrived, as a JPEG data URL.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<String>,
    pub cancelled: bool,
}

fn host_of(url: &str) -> Option<String> {
    let rest = url.split_once("://")?.1;
    let authority = rest.split(['/', '?']).next()?;
    let host = authority.rsplit('@').next()?;
    let host = host.split(':').next()?.trim().to_ascii_lowercase();
    (!host.is_empty()).then_some(host)
}

/// The test flag only hides the stream on the platform's own servers, so any other host is out.
pub(crate) fn test_mode_applies(target: &Target) -> bool {
    let Some(rule) = crate::platforms::destination(&target.platform_id)
        .and_then(|destination| destination.rehearsal.as_ref())
    else {
        return false;
    };
    host_of(&target.ingest_url).is_some_and(|host| {
        rule.hosts
            .iter()
            .any(|allowed| host == *allowed || host.ends_with(&format!(".{allowed}")))
    })
}

/// Appends the platform's test flag to the stream key, which travels as the RTMP play path.
pub(crate) fn test_mode_key(target: &Target, key: &str) -> Option<String> {
    let rule = crate::platforms::destination(&target.platform_id)?
        .rehearsal
        .as_ref()?;
    let key = key.trim();
    if key.is_empty() || rule.test_flag.is_empty() {
        return None;
    }
    if key.contains(&rule.test_flag) {
        return Some(key.to_string());
    }
    let joiner = if key.contains('?') { '&' } else { '?' };
    Some(format!("{key}{joiner}{}", rule.test_flag))
}

/// Why a destination without a route stays out: a usable test mode only lacks the key.
pub(crate) fn skip_reason(target: &Target, has_key: bool) -> SkipReason {
    if test_mode_applies(target) && !has_key {
        SkipReason::NoKey
    } else {
        SkipReason::NoTestMode
    }
}

pub(crate) fn route_for(
    target: &Target,
    has_key: bool,
    private_target_id: Option<&str>,
) -> Option<TestRoute> {
    if private_target_id == Some(target.id.as_str()) {
        return Some(TestRoute::PrivateBroadcast);
    }
    (has_key && test_mode_applies(target)).then_some(TestRoute::BandwidthTest)
}

/// Copies OBS's signal as it is: a rehearsal checks delivery, not Corneta's encoders.
fn copy_args(config: &AppConfig, target: &Target, key: &str) -> Vec<String> {
    let mut passthrough = config.clone();
    passthrough.mode = "passthrough".into();
    engine::ffmpeg_args_for_target(
        &passthrough,
        target,
        key,
        None,
        &engine::ingest_url(config),
        None,
    )
}

struct IngestProbe {
    ready: bool,
    bytes: u64,
    has_audio: bool,
}

fn parse_ingest_probe(body: &str, ingest_name: &str) -> Option<IngestProbe> {
    let value: serde_json::Value = serde_json::from_str(body).ok()?;
    let item = value
        .get("items")?
        .as_array()?
        .iter()
        .find(|item| item.get("name").and_then(|name| name.as_str()) == Some(ingest_name))?;
    let has_audio = item
        .get("tracks")
        .and_then(|tracks| tracks.as_array())
        .is_some_and(|tracks| {
            tracks
                .iter()
                .filter_map(|track| track.as_str())
                .any(|track| {
                    let track = track.to_ascii_lowercase();
                    track.contains("audio") || track == "opus"
                })
        });
    Some(IngestProbe {
        ready: item.get("ready").and_then(|ready| ready.as_bool()) == Some(true),
        bytes: item
            .get("bytesReceived")
            .and_then(|bytes| bytes.as_u64())
            .unwrap_or(0),
        has_audio,
    })
}

fn probe_ingest(config: &AppConfig) -> Option<IngestProbe> {
    let url = format!(
        "http://127.0.0.1:{}/v3/paths/list",
        engine::MEDIAMTX_API_PORT
    );
    let body = ureq::get(&url)
        .timeout(Duration::from_millis(700))
        .call()
        .ok()?
        .into_string()
        .ok()?;
    parse_ingest_probe(&body, &engine::ingest_path_name(config))
}

/// The engine's own start claim, so a live and a rehearsal can never share the ingest port.
struct Claim<'a> {
    app: &'a AppHandle,
    generation: u64,
}

impl Claim<'_> {
    fn take(app: &AppHandle) -> Result<Claim<'_>, String> {
        let state = app.state::<AppState>();
        let mut eng = state.engine.lock().unwrap();
        crate::updater::claim_start(&mut eng)?;
        eng.rehearsing = true;
        eng.start_gen = eng.start_gen.wrapping_add(1);
        Ok(Claim {
            app,
            generation: eng.start_gen,
        })
    }

    fn held(&self) -> bool {
        let state = self.app.state::<AppState>();
        let eng = state.engine.lock().unwrap();
        eng.live && eng.start_gen == self.generation
    }
}

impl Drop for Claim<'_> {
    fn drop(&mut self) {
        let state = self.app.state::<AppState>();
        let mut eng = state.engine.lock().unwrap();
        if eng.start_gen == self.generation {
            eng.live = false;
            eng.rehearsing = false;
        }
    }
}

struct Output {
    index: usize,
    events: tauri::async_runtime::Receiver<CommandEvent>,
    child: Option<CommandChild>,
    written_kb: f64,
}

fn emit(app: &AppHandle, report: &RehearsalReport) {
    let _ = app.emit("rehearsal://progress", report);
}

async fn set_obs_stream(app: &AppHandle, start: bool) -> bool {
    let password = crate::obs_env::password(
        &crate::commands::get_config(app.clone())
            .settings
            .obs_password,
    );
    tauri::async_runtime::spawn_blocking(move || {
        crate::obs::set_stream(
            crate::commands::OBS_WS_HOST,
            crate::obs_env::port(),
            &password,
            start,
        )
        .is_ok()
    })
    .await
    .unwrap_or(false)
}

async fn grab_frame(app: &AppHandle, config: &AppConfig) -> Option<String> {
    use base64::Engine as _;
    let file = std::env::temp_dir().join(format!("corneta-rehearsal-{}.jpg", std::process::id()));
    let _ = std::fs::remove_file(&file);
    let command = app.shell().sidecar("ffmpeg").ok()?.args([
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        &engine::ingest_url(config),
        "-frames:v",
        "1",
        "-vf",
        "scale=480:-2",
        "-q:v",
        "5",
        &file.to_string_lossy(),
    ]);
    let done = tokio::time::timeout(Duration::from_secs(8), command.output()).await;
    let bytes = std::fs::read(&file).ok();
    let _ = std::fs::remove_file(&file);
    done.ok()?.ok()?;
    let bytes = bytes.filter(|bytes| !bytes.is_empty() && bytes.len() < 600_000)?;
    Some(format!(
        "data:image/jpeg;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

fn private_provider(
    settings: &Settings,
    enabled: &[&Target],
) -> Option<(&'static dyn AccountProvider, String, Settings)> {
    crate::platforms::account_providers()
        .iter()
        .find_map(|provider| {
            let auto = provider.auto_broadcast()?;
            if !auto.enabled(settings) {
                return None;
            }
            let private = auto.rehearsal_settings(settings)?;
            let target = enabled.iter().find(|target| {
                crate::platforms::destination_account(&target.platform_id) == Some(provider.id())
            })?;
            Some((*provider, target.id.clone(), private))
        })
}

/// Runs the rehearsal to the end, or until it is cancelled, and always leaves everything stopped.
pub async fn run(app: AppHandle) -> Result<RehearsalReport, String> {
    CANCEL.store(false, Ordering::SeqCst);
    let claim = Claim::take(&app)?;
    let config = crate::commands::get_config(app.clone());
    let enabled: Vec<&Target> = config
        .targets
        .iter()
        .filter(|target| target.enabled && !target.ingest_url.is_empty())
        .collect();
    let keys: HashMap<String, String> = enabled
        .iter()
        .filter_map(|target| crate::keys::get_key(&target.id).map(|key| (target.id.clone(), key)))
        .collect();
    let private = private_provider(&config.settings, &enabled);
    let private_target_id = private.as_ref().map(|(_, id, _)| id.as_str());

    let mut report = RehearsalReport {
        phase: RehearsalPhase::Starting,
        obs_started: false,
        signal_arrived: false,
        has_audio: false,
        signal_kbps: None,
        seconds_left: (SIGNAL_WAIT + SEND_FOR).as_secs() as u32,
        targets: enabled
            .iter()
            .map(|target| {
                let has_key = keys.contains_key(&target.id);
                let route = route_for(target, has_key, private_target_id);
                RehearsalTarget {
                    target_id: target.id.clone(),
                    platform_id: target.platform_id.clone(),
                    name: target.name.clone(),
                    route,
                    outcome: if route.is_some() {
                        RehearsalOutcome::Pending
                    } else {
                        RehearsalOutcome::Skipped
                    },
                    issues: Vec::new(),
                    detail: None,
                    skip: route.is_none().then(|| skip_reason(target, has_key)),
                }
            })
            .collect(),
        thumbnail: None,
        cancelled: false,
    };
    emit(&app, &report);

    let (mut ingest_events, ingest) =
        crate::commands::start_rehearsal_ingest(&app, &config).await?;
    let stopped = |claim: &Claim<'_>| CANCEL.load(Ordering::SeqCst) || !claim.held();

    report.phase = RehearsalPhase::WaitingObs;
    report.obs_started = set_obs_stream(&app, true).await;
    emit(&app, &report);

    let wait_started = Instant::now();
    let mut ingest_alive = true;
    while !report.signal_arrived && wait_started.elapsed() < SIGNAL_WAIT && !stopped(&claim) {
        while let Ok(event) = ingest_events.try_recv() {
            if matches!(event, CommandEvent::Terminated(_)) {
                ingest_alive = false;
            }
        }
        if !ingest_alive {
            break;
        }
        let probed = {
            let config = config.clone();
            tauri::async_runtime::spawn_blocking(move || probe_ingest(&config))
                .await
                .ok()
                .flatten()
        };
        if let Some(probe) = probed.filter(|probe| probe.ready) {
            report.signal_arrived = true;
            report.has_audio = probe.has_audio;
        }
        report.seconds_left =
            (SIGNAL_WAIT.saturating_sub(wait_started.elapsed()) + SEND_FOR).as_secs() as u32;
        emit(&app, &report);
        if !report.signal_arrived {
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    }

    let mut outputs: Vec<Output> = Vec::new();
    let mut private_open: Option<ProvisionedIngest> = None;
    if report.signal_arrived && !stopped(&claim) {
        report.phase = RehearsalPhase::Sending;
        if let Some((provider, target_id, settings)) = &private {
            let (app2, settings, generation) = (app.clone(), settings.clone(), claim.generation);
            let provider: &'static dyn AccountProvider = *provider;
            let opened = tauri::async_runtime::spawn_blocking(move || {
                provider
                    .auto_broadcast()
                    .map(|auto| auto.open(&app2, &settings, generation))
            })
            .await
            .ok()
            .flatten();
            let entry = report
                .targets
                .iter_mut()
                .find(|target| &target.target_id == target_id);
            match (opened, entry) {
                (Some(Ok(ingest)), _) => private_open = Some(ingest),
                (Some(Err(reason)), Some(entry)) => {
                    log::warn!("rehearsal: private broadcast was not opened: {reason}");
                    entry.outcome = RehearsalOutcome::Failed;
                    entry.detail = provider
                        .auto_broadcast()
                        .map(|auto| auto.open_failure().body);
                }
                (_, Some(entry)) => entry.outcome = RehearsalOutcome::Failed,
                _ => {}
            }
        }
        for (index, entry) in report.targets.iter_mut().enumerate() {
            let Some(route) = entry.route else { continue };
            if entry.outcome != RehearsalOutcome::Pending {
                continue;
            }
            let Some(source) = enabled.iter().find(|target| target.id == entry.target_id) else {
                continue;
            };
            let mut target = (*source).clone();
            let key = match route {
                TestRoute::PrivateBroadcast => {
                    let Some(ingest) = &private_open else {
                        continue;
                    };
                    target.ingest_url = ingest.url.clone();
                    Some(ingest.key.clone())
                }
                TestRoute::BandwidthTest => keys
                    .get(&target.id)
                    .and_then(|key| test_mode_key(&target, key)),
            };
            // No test key means no private way in; never fall back to the real key.
            let Some(key) = key else {
                let blank = keys.get(&target.id).is_none_or(|key| key.trim().is_empty());
                entry.route = None;
                entry.outcome = RehearsalOutcome::Skipped;
                entry.skip = Some(if blank {
                    SkipReason::NoKey
                } else {
                    SkipReason::NoTestMode
                });
                continue;
            };
            let spawned = app
                .shell()
                .sidecar("ffmpeg")
                .and_then(|command| command.args(copy_args(&config, &target, &key)).spawn());
            match spawned {
                Ok((events, child)) => {
                    crate::job::adopt_pid(child.pid());
                    outputs.push(Output {
                        index,
                        events,
                        child: Some(child),
                        written_kb: 0.0,
                    });
                }
                Err(error) => {
                    log::warn!("rehearsal: FFmpeg did not start: {error}");
                    entry.outcome = RehearsalOutcome::Failed;
                }
            }
        }
        emit(&app, &report);

        let send_started = Instant::now();
        let first_bytes = {
            let config = config.clone();
            tauri::async_runtime::spawn_blocking(move || probe_ingest(&config))
                .await
                .ok()
                .flatten()
                .map(|probe| probe.bytes)
        };
        let mut verdict_asked = false;
        while send_started.elapsed() < SEND_FOR && !stopped(&claim) {
            for output in &mut outputs {
                while let Ok(event) = output.events.try_recv() {
                    let entry = &mut report.targets[output.index];
                    match event {
                        CommandEvent::Stderr(bytes) | CommandEvent::Stdout(bytes) => {
                            let text = String::from_utf8_lossy(&bytes).to_string();
                            for line in text.split(['\r', '\n']).filter(|line| !line.is_empty()) {
                                match classify_target_line(line) {
                                    TargetLine::Stats { .. } => {
                                        if let Some(kb) = stats_written_kb(line) {
                                            if kb > output.written_kb {
                                                output.written_kb = kb;
                                                if entry.outcome == RehearsalOutcome::Pending {
                                                    entry.outcome = RehearsalOutcome::Received;
                                                }
                                            }
                                        }
                                    }
                                    TargetLine::Error(low) => {
                                        if let TargetErrorUpdate::Failed { message, park, .. } =
                                            target_error_update(
                                                &low,
                                                true,
                                                "connecting",
                                                crate::i18n::locale(),
                                            )
                                        {
                                            entry.outcome = if park {
                                                RehearsalOutcome::Refused
                                            } else {
                                                RehearsalOutcome::Failed
                                            };
                                            entry.detail = Some(message);
                                        }
                                    }
                                    _ => {}
                                }
                            }
                        }
                        CommandEvent::Terminated(_) => {
                            output.child = None;
                            if matches!(
                                entry.outcome,
                                RehearsalOutcome::Pending | RehearsalOutcome::Received
                            ) {
                                entry.outcome = RehearsalOutcome::Failed;
                            }
                        }
                        _ => {}
                    }
                }
            }
            if !verdict_asked && send_started.elapsed() >= VERDICT_AFTER {
                verdict_asked = true;
                if let (Some((provider, target_id, _)), Some(ingest)) = (&private, &private_open) {
                    let (app2, key) = (app.clone(), ingest.key.clone());
                    let provider: &'static dyn AccountProvider = *provider;
                    let reading = tauri::async_runtime::spawn_blocking(move || {
                        let channel = provider.account_channel(&app2)?;
                        provider.live_status(&app2, &channel, Some(&key))?.ok()
                    })
                    .await
                    .ok()
                    .flatten();
                    if let (Some(reading), Some(entry)) = (
                        reading,
                        report
                            .targets
                            .iter_mut()
                            .find(|target| &target.target_id == target_id),
                    ) {
                        entry.issues = reading
                            .issues
                            .into_iter()
                            .filter(|issue| {
                                issue.severity != crate::platforms::provider::IssueSeverity::Info
                            })
                            .collect();
                        if entry.outcome == RehearsalOutcome::Received && !entry.issues.is_empty() {
                            entry.outcome = RehearsalOutcome::Warned;
                        }
                    }
                }
            }
            report.seconds_left = SEND_FOR.saturating_sub(send_started.elapsed()).as_secs() as u32;
            emit(&app, &report);
            tokio::time::sleep(Duration::from_millis(500)).await;
        }

        let elapsed = send_started.elapsed().as_secs_f64();
        let last = {
            let config = config.clone();
            tauri::async_runtime::spawn_blocking(move || probe_ingest(&config))
                .await
                .ok()
                .flatten()
        };
        if let (Some(first), Some(last)) = (first_bytes, &last) {
            if elapsed > 1.0 && last.bytes > first {
                report.signal_kbps =
                    Some(((last.bytes - first) as f64 * 8.0 / 1000.0 / elapsed) as u32);
            }
        }
        if let Some(last) = last {
            report.has_audio |= last.has_audio;
        }
        if !stopped(&claim) {
            report.thumbnail = grab_frame(&app, &config).await;
        }
    }

    for entry in &mut report.targets {
        if entry.outcome == RehearsalOutcome::Pending {
            entry.outcome = RehearsalOutcome::Failed;
        }
    }
    for output in &mut outputs {
        if let Some(child) = output.child.take() {
            crate::commands::kill_sidecar(child);
        }
    }
    // Stop OBS before the server goes away, so it does not sit retrying a dead address.
    set_obs_stream(&app, false).await;
    crate::commands::kill_sidecar(ingest);
    if let (Some((provider, _, _)), Some(_)) = (&private, &private_open) {
        let (app2, generation) = (app.clone(), claim.generation);
        let provider: &'static dyn AccountProvider = *provider;
        let closed = tauri::async_runtime::spawn_blocking(move || {
            provider
                .auto_broadcast()
                .map(|auto| auto.close(&app2, generation))
        })
        .await;
        if !matches!(closed, Ok(Some(Ok(())))) {
            log::warn!("rehearsal: the private broadcast was left for the next cleanup");
        }
    }

    report.phase = RehearsalPhase::Done;
    report.seconds_left = 0;
    report.cancelled = CANCEL.load(Ordering::SeqCst);
    drop(claim);
    emit(&app, &report);
    Ok(report)
}

pub fn cancel() {
    CANCEL.store(true, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target(platform_id: &str, ingest_url: &str) -> Target {
        let mut target: Target = serde_json::from_value(serde_json::json!({
            "id": "tgt_a1",
            "platformId": platform_id,
            "name": "Synthetic",
            "enabled": true,
            "protocol": "rtmp",
            "ingestUrl": ingest_url,
            "hasKey": true,
            "encoding": {
                "action": "copy",
                "encoder": "auto",
                "preset": { "width": 1280, "height": 720, "fps": 30, "videoBitrateKbps": 3000, "audioBitrateKbps": 128, "keyframeSec": 2 }
            }
        }))
        .unwrap();
        target.ingest_url = ingest_url.into();
        target
    }

    fn test_mode_destination() -> Option<&'static crate::platforms::Destination> {
        crate::platforms::destinations()
            .iter()
            .find(|destination| destination.rehearsal.is_some())
    }

    #[test]
    fn only_a_declared_test_mode_on_the_platforms_own_hosts_gets_a_test_key() {
        let destination = test_mode_destination().expect("one destination declares a test mode");
        let rule = destination.rehearsal.as_ref().unwrap();
        let host = &rule.hosts[0];
        let own = target(&destination.id, &format!("rtmp://live.{host}/app"));
        assert!(test_mode_applies(&own));
        assert_eq!(
            test_mode_key(&own, "abc").as_deref(),
            Some(format!("abc?{}", rule.test_flag).as_str())
        );
        assert_eq!(
            test_mode_key(&own, "abc?x=1").as_deref(),
            Some(format!("abc?x=1&{}", rule.test_flag).as_str())
        );
        // A key that already carries the flag is not flagged twice, and an empty key stays out.
        let flagged = format!("abc?{}", rule.test_flag);
        assert_eq!(
            test_mode_key(&own, &flagged).as_deref(),
            Some(flagged.as_str())
        );
        assert_eq!(test_mode_key(&own, "  "), None);

        for elsewhere in [
            "rtmp://127.0.0.1:19350/live".to_string(),
            format!("rtmp://{host}.example.org/app"),
            format!("rtmp://not{host}/app"),
            "not a url".to_string(),
        ] {
            assert!(
                !test_mode_applies(&target(&destination.id, &elsewhere)),
                "{elsewhere} is not the platform's own ingest"
            );
        }
    }

    #[test]
    fn destinations_without_a_private_way_in_are_never_routed() {
        let destination = test_mode_destination().unwrap();
        let host = &destination.rehearsal.as_ref().unwrap().hosts[0];
        let own = target(&destination.id, &format!("rtmp://live.{host}/app"));
        assert_eq!(route_for(&own, true, None), Some(TestRoute::BandwidthTest));
        assert_eq!(route_for(&own, false, None), None);
        assert_eq!(skip_reason(&own, false), SkipReason::NoKey);
        assert_eq!(
            route_for(&own, false, Some("tgt_a1")),
            Some(TestRoute::PrivateBroadcast)
        );
        let elsewhere = target(&destination.id, "rtmp://127.0.0.1:19350/live");
        assert_eq!(skip_reason(&elsewhere, false), SkipReason::NoTestMode);

        for other in crate::platforms::destinations()
            .iter()
            .filter(|destination| destination.rehearsal.is_none())
        {
            let plain = target(&other.id, &format!("rtmp://live.{host}/app"));
            assert_eq!(
                route_for(&plain, true, None),
                None,
                "{} has no test mode and must be skipped",
                other.id
            );
            assert_eq!(skip_reason(&plain, false), SkipReason::NoTestMode);
        }
    }

    #[test]
    fn a_rehearsal_copies_the_signal_whatever_the_quality_mode() {
        let config = AppConfig {
            mode: "per-platform".into(),
            ..Default::default()
        };
        let destination = test_mode_destination().unwrap();
        let host = &destination.rehearsal.as_ref().unwrap().hosts[0];
        let mut own = target(&destination.id, &format!("rtmp://live.{host}/app"));
        own.encoding.action = "transcode".into();
        let args = copy_args(&config, &own, "abc");
        let video = args.windows(2).find(|pair| pair[0] == "-c:v").unwrap();
        assert_eq!(video[1], "copy");
    }

    #[test]
    fn the_ingest_probe_reads_readiness_bytes_and_audio() {
        let body = r#"{"items":[
            {"name":"live/other","ready":true,"tracks":["H264"],"bytesReceived":5},
            {"name":"live/obs","ready":true,"tracks":["H264","MPEG-4 Audio"],"bytesReceived":4096}
        ]}"#;
        let probe = parse_ingest_probe(body, "live/obs").unwrap();
        assert!(probe.ready && probe.has_audio);
        assert_eq!(probe.bytes, 4096);
        let silent = parse_ingest_probe(body, "live/other").unwrap();
        assert!(!silent.has_audio);
        assert!(parse_ingest_probe(body, "live/missing").is_none());
        assert!(parse_ingest_probe("not json", "live/obs").is_none());
    }

    #[test]
    fn reads_the_host_of_an_ingest_url() {
        assert_eq!(
            host_of("rtmp://Live.Example.org:1935/app").as_deref(),
            Some("live.example.org")
        );
        assert_eq!(
            host_of("rtmps://user@a.example.org/app?x=1").as_deref(),
            Some("a.example.org")
        );
        assert_eq!(host_of("no scheme"), None);
    }
}
