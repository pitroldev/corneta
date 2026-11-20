use super::{current_operation_id, get_config, notify, now_ms, quiet_command, update_tray};
use crate::chat;
use crate::config::{self, AppConfig};
use crate::engine::{self, EngineSnapshot};
use crate::engine_policy::{
    classify_target_line, is_current_live, parse_ingest_hostport, platform_check,
    platform_check_due, target_error_update, TargetErrorUpdate, TargetLine,
};
use crate::i18n::Msg;
use crate::platforms::provider::ProvisionedIngest;
use crate::session;
use crate::telemetry::{self, AppError};
use crate::AppState;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager};

// Reuse the terminal error ID in start_engine instead of reporting it twice.
#[track_caller]
pub(super) fn capture_engine_error(
    app: &AppHandle,
    code: &str,
    stage: &str,
    retryable: bool,
    source: Option<String>,
) -> String {
    let operation_id = current_operation_id(app);
    let error_id = app.state::<AppState>().telemetry.capture_error(
        AppError::new(code, stage, retryable, source),
        operation_id.as_deref(),
        true,
        "error",
    );
    let state = app.state::<AppState>();
    let mut engine = state.engine.lock().unwrap();
    engine.telemetry_last_error_id = Some(error_id.clone());
    engine.last_error_code = Some(code.to_string());
    engine.telemetry_last_error_operation_id = operation_id;
    error_id
}

pub(super) fn telemetry_encoder_kind(config: &AppConfig) -> String {
    if config.mode == "passthrough" {
        return "copy".into();
    }
    let mut encoders: std::collections::HashSet<&str> = config
        .targets
        .iter()
        .filter(|target| target.enabled)
        .map(|target| match target.encoding.encoder.as_str() {
            "auto" | "nvenc" | "qsv" | "amf" | "videotoolbox" | "software" => {
                target.encoding.encoder.as_str()
            }
            _ => "unknown",
        })
        .collect();
    if encoders.len() == 1 {
        encoders.drain().next().unwrap_or("unknown").into()
    } else {
        "mixed".into()
    }
}

fn capture_target_transition(
    app: &AppHandle,
    target_id: &str,
    from: &str,
    to: &str,
    error_code: Option<&str>,
) {
    let (operation_id, platform) = {
        let state = app.state::<AppState>();
        let engine = state.engine.lock().unwrap();
        (
            engine.operation_id.clone(),
            engine.target_platforms.get(target_id).cloned(),
        )
    };
    if let Some(platform) = platform {
        app.state::<AppState>().telemetry.capture_target_transition(
            operation_id.as_deref(),
            &platform,
            from,
            to,
            error_code,
        );
    }
}

pub(super) fn emit(app: &AppHandle, snap: &EngineSnapshot) {
    // Reject stale samples once the authoritative snapshot has stopped.
    {
        let state = app.state::<AppState>();
        let eng = state.engine.lock().unwrap();
        let authoritative_stopped = eng
            .snapshot
            .as_ref()
            .map(|s| s.state == "stopped")
            .unwrap_or(false);
        if authoritative_stopped && snap.state != "stopped" {
            return;
        }
    }
    let _ = app.emit("engine://status", snap);
    update_tray(app, snap);
    crate::deck::engine_changed(app);
}

// Input readiness must not mark the session live when an output is still failing.
pub(super) fn set_ingest_live(app: &AppHandle, live: bool, vertical_live: Option<bool>) {
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    let Some(snap) = eng.snapshot.as_mut() else {
        return;
    };
    if snap.state == "stopped"
        || (snap.ingest_live == live && snap.vertical_ingest_live == vertical_live)
    {
        return;
    }
    snap.ingest_live = live;
    snap.vertical_ingest_live = vertical_live;
    let out = snap.clone();
    drop(eng);
    emit(app, &out);
}

pub(super) fn slate_forced(app: &AppHandle) -> bool {
    let state = app.state::<AppState>();
    let eng = state.engine.lock().unwrap();
    eng.snapshot.as_ref().is_some_and(|snap| snap.forced_brb)
}

/// The opt-in watches over what OBS sends.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum WatchAlert {
    Black = 0,
    Frozen = 1,
    Silent = 2,
}

static LAST_WATCH_NOTIFY: std::sync::Mutex<[Option<std::time::Instant>; 3]> =
    std::sync::Mutex::new([None; 3]);

fn watch_notification_claimed(alert: WatchAlert) -> bool {
    let mut last = LAST_WATCH_NOTIFY
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let slot = &mut last[alert as usize];
    let now = std::time::Instant::now();
    let due = crate::engine_policy::watch_notification_due(*slot, now);
    if due {
        *slot = Some(now);
    }
    due
}

impl From<crate::black_screen::PictureAlert> for WatchAlert {
    fn from(alert: crate::black_screen::PictureAlert) -> Self {
        match alert {
            crate::black_screen::PictureAlert::Black => Self::Black,
            crate::black_screen::PictureAlert::Frozen => Self::Frozen,
        }
    }
}

pub(super) fn set_watch_alert(app: &AppHandle, alert: WatchAlert, on: bool) {
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    let Some(snap) = eng.snapshot.as_mut() else {
        return;
    };
    if snap.state == "stopped" {
        return;
    }
    let flag = match alert {
        WatchAlert::Black => &mut snap.black_screen,
        WatchAlert::Frozen => &mut snap.frozen_screen,
        WatchAlert::Silent => &mut snap.silent_audio,
    };
    if *flag == on {
        return;
    }
    *flag = on;
    let out = snap.clone();
    drop(eng);
    emit(app, &out);
    if on {
        let (what, title, body) = match alert {
            WatchAlert::Black => (
                "the OBS picture has stayed black",
                Msg::NotifyBlackScreenTitle,
                Msg::NotifyBlackScreenBody,
            ),
            WatchAlert::Frozen => (
                "the OBS picture has stayed frozen",
                Msg::NotifyFrozenScreenTitle,
                Msg::NotifyFrozenScreenBody,
            ),
            WatchAlert::Silent => (
                "OBS has sent no sound",
                Msg::NotifySilentAudioTitle,
                Msg::NotifySilentAudioBody,
            ),
        };
        log::warn!("engine: {what}");
        if watch_notification_claimed(alert) {
            notify(app, &title.now(), &body.now());
        }
    }
}

/// A destination whose platform can confirm the live through the signed-in account.
pub(super) struct PlatformCheckPlan {
    target_id: String,
    provider: &'static dyn crate::platforms::provider::AccountProvider,
    stream_key: String,
}

/// An account names one channel, so only a platform with a single enabled destination is checked.
pub(super) fn platform_check_plan(
    enabled: &[&config::Target],
    keymap: &HashMap<String, String>,
    provisioned: &HashMap<String, ProvisionedIngest>,
) -> Vec<PlatformCheckPlan> {
    let mut per_account: HashMap<&'static str, Vec<&config::Target>> = HashMap::new();
    for &target in enabled {
        if let Some(account) = crate::platforms::destination_account(&target.platform_id) {
            per_account.entry(account).or_default().push(target);
        }
    }
    per_account
        .into_iter()
        .filter_map(|(account, targets)| {
            let [target] = targets.as_slice() else {
                return None;
            };
            let provider = crate::platforms::account_provider(account)?;
            if !provider.signed_in() {
                return None;
            }
            let stream_key = provisioned
                .get(&target.id)
                .map(|ingest| ingest.key.clone())
                .or_else(|| keymap.get(&target.id).cloned())
                .unwrap_or_default();
            Some(PlatformCheckPlan {
                target_id: target.id.clone(),
                provider,
                stream_key,
            })
        })
        .collect()
}

/// Asks each platform whether it really receives the live while Corneta sends it; network and
/// sign-in failures leave the row as it was, since the destination's own state still applies.
pub(super) fn spawn_platform_checks(
    app: AppHandle,
    generation: u64,
    running: std::sync::Arc<std::sync::atomic::AtomicBool>,
    plans: Vec<PlatformCheckPlan>,
) {
    struct Tracked {
        plan: PlatformCheckPlan,
        channel: Option<Option<crate::auth::AccountChannel>>,
        flowing_since: Option<std::time::Instant>,
        last_check_flowing_ms: Option<u64>,
        settled: bool,
        action: Option<String>,
    }
    let mut tracked: Vec<Tracked> = plans
        .into_iter()
        .map(|plan| Tracked {
            plan,
            channel: None,
            flowing_since: None,
            last_check_flowing_ms: None,
            settled: false,
            action: None,
        })
        .collect();
    tauri::async_runtime::spawn_blocking(move || {
        while running.load(std::sync::atomic::Ordering::Relaxed) {
            for item in &mut tracked {
                let flow = target_flow(&app, &item.plan.target_id);
                if let Some((_, action)) = &flow {
                    // A mid-live re-encode changes what the platform receives; its checks start over.
                    if item.action.as_ref().is_some_and(|seen| seen != action) {
                        item.flowing_since = None;
                        item.last_check_flowing_ms = None;
                        item.settled = false;
                    }
                    item.action = Some(action.clone());
                }
                let flowing = flow.is_some_and(|(state, _)| state == "live" || state == "brb");
                if !flowing {
                    if item.flowing_since.take().is_some() {
                        item.last_check_flowing_ms = None;
                        item.settled = false;
                        set_platform_check(&app, generation, &item.plan.target_id, None);
                    }
                    continue;
                }
                let since = *item
                    .flowing_since
                    .get_or_insert_with(std::time::Instant::now);
                let flowing_ms = since.elapsed().as_millis() as u64;
                let interval_ms = item.plan.provider.live_status_interval_ms();
                if !platform_check_due(
                    flowing_ms,
                    item.last_check_flowing_ms,
                    item.settled,
                    interval_ms,
                ) {
                    continue;
                }
                item.last_check_flowing_ms = Some(flowing_ms);
                let channel = item
                    .channel
                    .get_or_insert_with(|| item.plan.provider.account_channel(&app))
                    .clone();
                let Some(channel) = channel else {
                    continue;
                };
                let key =
                    (!item.plan.stream_key.is_empty()).then_some(item.plan.stream_key.as_str());
                match item.plan.provider.live_status(&app, &channel, key) {
                    Some(Ok(reading)) => {
                        if let Some(check) = platform_check(&reading, flowing_ms) {
                            item.settled = true;
                            set_platform_check(&app, generation, &item.plan.target_id, Some(check));
                        }
                    }
                    Some(Err(error)) => {
                        log::debug!(
                            "{}: live status unavailable: {error}",
                            item.plan.provider.id()
                        )
                    }
                    None => {}
                }
            }
            std::thread::sleep(std::time::Duration::from_secs(1));
        }
    });
}

/// A destination's state and how this live sends it.
fn target_flow(app: &AppHandle, target_id: &str) -> Option<(String, String)> {
    let state = app.state::<AppState>();
    let engine = state.engine.lock().unwrap();
    engine
        .snapshot
        .as_ref()?
        .targets
        .get(target_id)
        .map(|target| (target.state.clone(), target.action.clone()))
}

fn set_platform_check(
    app: &AppHandle,
    generation: u64,
    target_id: &str,
    check: Option<engine::PlatformCheck>,
) {
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    if !is_current_live(eng.live, eng.start_gen, generation) {
        return;
    }
    let Some(snap) = eng.snapshot.as_mut() else {
        return;
    };
    let Some(target) = snap.targets.get_mut(target_id) else {
        return;
    };
    if target.platform == check {
        return;
    }
    target.platform = check;
    let out = snap.clone();
    drop(eng);
    emit(app, &out);
}

pub(super) fn set_target_reconnecting(app: &AppHandle, target_id: &str) {
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    if let Some(snap) = eng.snapshot.as_mut() {
        if snap.state == "stopped" {
            return;
        }
        if let Some(st) = snap.targets.get_mut(target_id) {
            let was = st.state.clone();
            let name = st.name.clone();
            st.state = "reconnecting".into();
            st.message = None;
            let out = snap.clone();
            if was != "reconnecting" {
                eng.telemetry_reconnect_count = eng.telemetry_reconnect_count.saturating_add(1);
            }
            drop(eng);
            emit(app, &out);
            capture_target_transition(app, target_id, &was, "reconnecting", None);
            if was != "reconnecting" {
                notify(
                    app,
                    &Msg::NotifyTargetDownTitle.now(),
                    &Msg::NotifyTargetDownBody { name: &name }.now(),
                );
            }
        }
    }
}

// Pausing can overwrite a terminal error; restore it without repeated events.
pub(super) fn reaffirm_auth_error(app: &AppHandle, target_id: &str) {
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    let Some(snap) = eng.snapshot.as_mut() else {
        return;
    };
    if snap.state == "stopped" {
        return;
    }
    let Some(st) = snap.targets.get_mut(target_id) else {
        return;
    };
    if st.state == "error" {
        return;
    }
    let previous = st.state.clone();
    st.state = "error".into();
    st.message = Some(Msg::TargetErrorKeyRejected.now());
    let out = snap.clone();
    drop(eng);
    emit(app, &out);
    capture_target_transition(
        app,
        target_id,
        &previous,
        "auth-error",
        Some("target_auth_error"),
    );
}

// Distinguish initial input waiting from signal loss after the session went live.
pub(super) fn set_target_waiting(app: &AppHandle, target_id: &str) {
    use std::sync::atomic::{AtomicU64, Ordering};
    // Input loss affects every target; avoid duplicate notifications.
    static LAST_LOST_NOTIFY_MS: AtomicU64 = AtomicU64::new(0);

    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    let Some(snap) = eng.snapshot.as_mut() else {
        return;
    };
    if snap.state == "stopped" {
        return;
    }
    let mid_live = snap.state == "live";
    let Some(st) = snap.targets.get_mut(target_id) else {
        return;
    };
    let new_state = if mid_live { "signal-lost" } else { "waiting" };
    if st.state == new_state {
        return;
    }
    let previous = st.state.clone();
    st.state = new_state.into();
    st.message = if mid_live {
        Some(Msg::TargetSignalLostMessage.now())
    } else {
        None
    };
    let out = snap.clone();
    drop(eng);
    emit(app, &out);
    capture_target_transition(app, target_id, &previous, new_state, None);
    if new_state == "signal-lost" {
        let now = now_ms() as u64;
        let last = LAST_LOST_NOTIFY_MS.load(Ordering::Relaxed);
        if now.saturating_sub(last) > 10_000 {
            LAST_LOST_NOTIFY_MS.store(now, Ordering::Relaxed);
            notify(
                app,
                &Msg::NotifySignalLostTitle.now(),
                &Msg::NotifySignalLostBody.now(),
            );
        }
    }
}

pub(super) fn set_target_state(app: &AppHandle, target_id: &str, new_state: &str) {
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    if let Some(snap) = eng.snapshot.as_mut() {
        if snap.state == "stopped" {
            return;
        }
        if let Some(st) = snap.targets.get_mut(target_id) {
            if st.state == new_state {
                return;
            }
            st.state = new_state.into();
            st.message = None;
            let out = snap.clone();
            drop(eng);
            emit(app, &out);
        }
    }
}

// BRB output still transmits metrics, but its visible state must remain distinct from live.
pub(super) fn update_target_metrics(
    app: &AppHandle,
    target_id: &str,
    line: &str,
    has_signal: bool,
    brb_on: bool,
) {
    let kind = classify_target_line(line);
    if kind == TargetLine::Ignore {
        return;
    }
    let is_stats = matches!(kind, TargetLine::Stats { .. });

    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();

    if eng
        .paused
        .get(target_id)
        .is_some_and(|f| f.load(std::sync::atomic::Ordering::Relaxed))
    {
        return;
    }
    let was_starting = matches!(
        eng.snapshot.as_ref().map(|s| s.state.as_str()),
        Some("starting")
    );
    // Uptime starts with actual output, not the startup request.
    if is_stats && was_starting {
        eng.started_ms = now_ms();
    }
    let started = eng.started_ms;
    let last_emit = eng.last_emit_ms;
    let auth_flag = eng.auth_error.get(target_id).cloned();
    let Some(snap) = eng.snapshot.as_mut() else {
        return;
    };
    let Some(st) = snap.targets.get_mut(target_id) else {
        return;
    };
    let prev_target = st.state.clone();
    let name = st.name.clone();
    let mut err_msg = None;

    match kind {
        TargetLine::Stats {
            fps,
            bitrate_kbps,
            dropped,
        } => {
            if was_starting {
                snap.started_at = Some(started);
            }
            st.state = if brb_on { "brb" } else { "live" }.into();
            st.message = None;
            st.uptime_sec = (now_ms().saturating_sub(started) as f64) / 1000.0;
            if let Some(f) = fps {
                st.fps = f;
            }
            if let Some(b) = bitrate_kbps {
                st.bitrate_kbps = b;
            }
            if let Some(d) = dropped {
                st.dropped_frames = d;
            }
            snap.state = "live".into();
        }
        TargetLine::Error(low) => {
            match target_error_update(&low, has_signal, &st.state, crate::i18n::locale()) {
                TargetErrorUpdate::Keep => {}
                TargetErrorUpdate::Waiting => {
                    st.state = "waiting".into();
                    st.message = None;
                }
                TargetErrorUpdate::Failed {
                    state,
                    message,
                    park,
                } => {
                    st.state = state.into();
                    if park {
                        err_msg = Some(message.clone());
                        if let Some(f) = &auth_flag {
                            f.store(true, std::sync::atomic::Ordering::Relaxed);
                        }
                    }
                    st.message = Some(message);
                }
            }
        }
        TargetLine::Ignore => {}
    }

    let new_state = st.state.clone();
    // Emit transitions immediately, but limit metric-only snapshots to four per second.
    let now = now_ms();
    let should_emit =
        new_state != prev_target || was_starting || now.saturating_sub(last_emit) >= 250;
    let out = if should_emit {
        Some(snap.clone())
    } else {
        None
    };
    if should_emit {
        eng.last_emit_ms = now;
    }
    let live_started_context = if is_stats && was_starting {
        Some((
            eng.operation_id.clone(),
            eng.telemetry_encoder_kind.clone(),
            eng.telemetry_start_requested_ms,
        ))
    } else {
        None
    };
    drop(eng);
    if let Some(out) = out {
        emit(app, &out);
    }

    if new_state != prev_target {
        capture_target_transition(
            app,
            target_id,
            &prev_target,
            &new_state,
            if new_state == "error" {
                Some("target_auth_error")
            } else {
                None
            },
        );
    }

    if let Some((Some(operation_id), encoder_kind, requested_ms)) = live_started_context {
        let mut properties = serde_json::Map::new();
        properties.insert(
            "operation_id".into(),
            serde_json::Value::String(operation_id),
        );
        properties.insert(
            "duration_bucket".into(),
            serde_json::Value::String(
                telemetry::duration_bucket(std::time::Duration::from_millis(
                    now_ms().saturating_sub(requested_ms).min(u64::MAX as u128) as u64,
                ))
                .into(),
            ),
        );
        properties.insert(
            "encoder_kind".into(),
            serde_json::Value::String(encoder_kind),
        );
        let _ = app
            .state::<AppState>()
            .telemetry
            .capture("live_start_completed", properties);
    }

    if is_stats && was_starting {
        notify(app, &Msg::NotifyLiveTitle.now(), &Msg::NotifyLiveBody.now());
    } else if let Some(msg) = err_msg {
        if prev_target != "error" {
            notify(
                app,
                &Msg::NotifyTargetErrorTitle.now(),
                &Msg::NotifyTargetErrorBody {
                    name: &name,
                    msg: &msg,
                }
                .now(),
            );
        }
    }
}

pub(super) fn read_gpu(running: &std::sync::atomic::AtomicBool) -> Option<f64> {
    use std::io::Read;
    use std::process::Stdio;
    use std::sync::atomic::Ordering;
    use std::time::{Duration, Instant};
    let mut child = quiet_command("nvidia-smi")
        .args([
            "--query-gpu=utilization.gpu",
            "--format=csv,noheader,nounits",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let stdout = child.stdout.take()?;
    let (send, receive) = std::sync::mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = stdout
            .take(4096)
            .read_to_end(&mut bytes)
            .ok()
            .map(|_| bytes);
        let _ = send.send(result);
    });
    let deadline = Instant::now() + Duration::from_secs(1);
    let success = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status.success(),
            Err(_) => break false,
            Ok(None) if Instant::now() >= deadline || !running.load(Ordering::Relaxed) => {
                break false
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
        }
    };
    if !success {
        let _ = child.kill();
    }
    let _ = child.wait();
    // A misbehaving utility must not hold the sampler on an inherited pipe.
    let bytes = receive.recv_timeout(Duration::from_millis(100)).ok()??;
    if !success || bytes.len() >= 4096 {
        return None;
    }
    let gpu = String::from_utf8_lossy(&bytes)
        .lines()
        .next()?
        .trim()
        .parse::<f64>()
        .ok()?;
    (0.0..=100.0).contains(&gpu).then_some(gpu)
}

pub(super) fn update_usage(app: &AppHandle, usage: crate::resources::ResourceUsage) {
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    let Some(snap) = eng.snapshot.as_mut() else {
        return;
    };
    if snap.state == "stopped" {
        return;
    }
    snap.cpu = Some((usage.cpu * 10.0).round() / 10.0);
    snap.gpu = usage.gpu.map(|g| (g * 10.0).round() / 10.0);
    snap.memory_pct = usage.memory_pct.map(|value| (value * 10.0).round() / 10.0);
    let out = snap.clone();
    let session = eng.session_path.clone();
    drop(eng);
    emit(app, &out);
    if let Some(path) = session {
        session::record_sample(&path, &out, &chat::drain_msg_counts(), &usage.apps);
    }
}

// The resource sampler publishes and records these OBS stats with its next sample.
pub(super) fn update_obs_stats(app: &AppHandle, stats: engine::ObsStats) {
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    if let Some(snap) = eng.snapshot.as_mut() {
        if snap.state != "stopped" {
            snap.obs = Some(stats);
        }
    }
}

/// Check TCP reachability only; this does not validate the stream key.
fn tcp_reach(ingest_url: &str) -> Result<String, String> {
    let (host, port) =
        parse_ingest_hostport(ingest_url).map_err(|_| Msg::EngineInvalidIngestUrl.now())?;
    use std::net::ToSocketAddrs;
    let addr = format!("{host}:{port}")
        .to_socket_addrs()
        .map_err(|_| Msg::TestHostUnresolved { host: &host }.now())?
        .next()
        .ok_or_else(|| Msg::TestAddressUnresolved { host: &host }.now())?;
    match std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_secs(5)) {
        Ok(_) => Ok(Msg::TestHostAnswered { host: &host }.now()),
        Err(_) => Err(Msg::TestNoAnswer { host: &host, port }.now()),
    }
}

#[tauri::command]
pub async fn test_target(app: AppHandle, target_id: String) -> Result<String, String> {
    let cfg = get_config(app);
    let t = cfg
        .targets
        .into_iter()
        .find(|t| t.id == target_id)
        .ok_or_else(|| Msg::TargetNotFound.now())?;
    let url = t.ingest_url;
    tauri::async_runtime::spawn_blocking(move || tcp_reach(&url))
        .await
        .map_err(|e| format!("join: {e}"))?
}
