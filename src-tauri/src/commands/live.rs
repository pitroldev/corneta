use super::encoders::detect_hw_encoder;
use super::ingest_slate::{
    brb_slate_file, brb_slate_has_audio, first_unavailable_port, log_mediamtx_line,
    mark_port_failure, mediamtx_api_answers, mediamtx_config_path, mediamtx_paths_with_codec,
    wait_mediamtx_ready, EngineFailure, MEDIAMTX_READY_TIMEOUT,
};
use super::live_status::{
    capture_engine_error, emit, platform_check_plan, read_gpu, reaffirm_auth_error,
    set_ingest_live, set_target_reconnecting, set_target_state, set_target_waiting,
    set_watch_alert, slate_forced, spawn_platform_checks, telemetry_encoder_kind, update_obs_stats,
    update_target_metrics, update_usage, WatchAlert,
};
use super::obs::pin_smart_choices;
use super::{capture_native_error, get_config, kill_sidecar, notify, now_ms, OBS_WS_HOST};
use crate::chat;
use crate::engine::{self, EngineSnapshot};
use crate::engine_policy::{
    brb_slate_is_video, hardware_encoder_failed, is_current_live, is_hardware_video_codec,
    is_loopback_host, mediamtx_port_conflict, parse_kv, safe_ffmpeg_diagnostic, stats_written_kb,
    video_codec, ProgressWatch, RestartBudget,
};
use crate::i18n::Msg;
use crate::keys;
use crate::platforms::provider::{AutoBroadcastFailure, ProvisionedIngest};
use crate::recorder;
use crate::session;
use crate::telemetry::{self, AppError};
use crate::AppState;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

/// Stable IPC cancellation code; the frontend suppresses its error toast.
const START_CANCELLED: &str = "corneta:start-cancelled";

/// Recheck cancellation after the timer before allowing retry work.
async fn supervisor_wait(
    running: &std::sync::atomic::AtomicBool,
    duration: std::time::Duration,
) -> bool {
    use std::sync::atomic::Ordering;
    if !running.load(Ordering::Relaxed) {
        return false;
    }
    tokio::time::sleep(duration).await;
    running.load(Ordering::Relaxed)
}

// Preserve track_caller through capture_engine_error for distinct failure fingerprints.
#[track_caller]
fn set_engine_error(app: &AppHandle, failure: EngineFailure, generation: u64) {
    // Child exits after shutdown, or from the live a quick restart replaced, must not end this one.
    if !live_is_current(app, generation) {
        log::debug!("engine: ignoring {failure} from a stopped live");
        return;
    }
    log::error!("engine: {failure}");
    let msg = failure.message().now();
    let error_id = capture_engine_error(
        app,
        failure.code(),
        failure.stage(),
        true,
        Some(msg.clone()),
    );
    if let EngineFailure::IngestPortInUse { port } = failure {
        mark_port_failure(app, port);
    }
    log::error!("engine: error_id={error_id}");
    stop_engine_internal(app, Some(msg), "error");
    close_auto_broadcasts_later(app, generation);
}

/// Crashes allowed within a burst before the live ends; a quiet stretch earns them back.
const MEDIAMTX_RESTARTS: u32 = 3;
const MEDIAMTX_QUIET_MS: u64 = 120_000;

fn live_is_current(app: &AppHandle, generation: u64) -> bool {
    let state = app.state::<AppState>();
    let engine = state.engine.lock().unwrap();
    is_current_live(engine.live, engine.start_gen, generation)
}

/// Starts MediaMTX again for a running live; None when that live ended meanwhile.
fn restart_mediamtx(
    app: &AppHandle,
    yml: &std::path::Path,
    generation: u64,
) -> Result<Option<tauri::async_runtime::Receiver<CommandEvent>>, String> {
    let (events, child) = app
        .shell()
        .sidecar("mediamtx")
        .map_err(|e| e.to_string())?
        .args([yml.to_string_lossy().to_string()])
        .spawn()
        .map_err(|e| e.to_string())?;
    crate::job::adopt_pid(child.pid());
    let state = app.state::<AppState>();
    let mut engine = state.engine.lock().unwrap();
    if !is_current_live(engine.live, engine.start_gen, generation) {
        drop(engine);
        let _ = child.kill();
        return Ok(None);
    }
    engine.mediamtx = Some(child);
    Ok(Some(events))
}

/// Platform autostop is off so broadcasts survive reconnects; a live that ends without the stop
/// button, by an error or an aborted start, must still end what it opened.
fn close_auto_broadcasts_later(app: &AppHandle, generation: u64) {
    let activity = app
        .state::<AppState>()
        .engine
        .lock()
        .unwrap()
        .begin_pending_activity();
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _activity = activity;
        close_auto_broadcasts(&app, generation, true);
    });
}

// Manual fallback may still lack a YouTube broadcast; notify instead of implying success.
fn auto_broadcast_fallback(
    app: &AppHandle,
    failure: AutoBroadcastFailure,
    target_id: &str,
    generation: u64,
    err: &str,
) {
    let state = app.state::<AppState>();
    {
        let engine = state.engine.lock().unwrap();
        if !engine.live || engine.start_gen != generation {
            return;
        }
    }
    let error_id = capture_native_error(app, failure.error_code, "oauth", true, None);
    log::warn!("automatic broadcast: error_id={error_id}");
    notify(app, &failure.title, &failure.body);
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    if !eng.live || eng.start_gen != generation {
        return;
    }
    if let Some(snap) = eng.snapshot.as_mut() {
        if let Some(st) = snap.targets.get_mut(target_id) {
            st.message = Some(format!("{} {err}", failure.target_note));
        }
        let out = snap.clone();
        drop(eng);
        emit(app, &out);
    }
}

/// Ends the broadcasts accounts opened for that live; failures stay recoverable on the next start.
pub(crate) fn close_auto_broadcasts(app: &AppHandle, generation: u64, notify_user: bool) {
    for provider in crate::platforms::account_providers() {
        let Some(auto) = provider.auto_broadcast() else {
            continue;
        };
        if auto.close(app, generation).is_err() {
            log::warn!("{}: automatic broadcast cleanup_pending", provider.id());
            if notify_user {
                let (title, body) = auto.close_failure();
                notify(app, &title, &body);
            }
        }
    }
}

// Failed or cancelled setup must release the session and clean partially started sidecars.
struct StartGuard<'a> {
    app: &'a AppHandle,
    generation: u64,
    armed: bool,
}
impl Drop for StartGuard<'_> {
    fn drop(&mut self) {
        if self.armed {
            kill_engine(self.app);
            close_auto_broadcasts_later(self.app, self.generation);
        }
    }
}

#[tauri::command]
pub async fn start_engine(
    app: AppHandle,
    state: State<'_, AppState>,
    operation_id: Option<String>,
) -> Result<(), String> {
    let operation_id = telemetry::normalize_or_new_id(operation_id);

    let result = start_engine_inner(app.clone(), state, operation_id.clone()).await;
    if result
        .as_ref()
        .err()
        .is_some_and(|error| error == crate::updater::START_UPDATE_BLOCKED)
    {
        // An expected refusal must not replace the current snapshot with an error.
        return Err(Msg::UpdateInProgress.now());
    }
    if let Err(error) = &result {
        let cancelled = error == START_CANCELLED;
        let mut properties = serde_json::Map::new();
        properties.insert(
            "operation_id".into(),
            serde_json::Value::String(operation_id.clone()),
        );
        properties.insert(
            "stage".into(),
            serde_json::Value::String(if cancelled { "shutdown" } else { "native" }.into()),
        );
        properties.insert(
            "error_code".into(),
            serde_json::Value::String(
                if cancelled {
                    "start_cancelled"
                } else {
                    "engine_start_failed"
                }
                .into(),
            ),
        );
        properties.insert("cancelled".into(), serde_json::Value::Bool(cancelled));
        properties.insert("retryable".into(), serde_json::Value::Bool(true));
        let _ = app
            .state::<AppState>()
            .telemetry
            .capture("live_start_failed", properties);
    }
    match result {
        Err(error) if error != START_CANCELLED => {
            // Reuse a stage-specific error ID when one was already reported.
            let (existing_error_id, error_code) = {
                let state = app.state::<AppState>();
                let engine = state.engine.lock().unwrap();
                if engine.telemetry_last_error_operation_id.as_deref()
                    == Some(operation_id.as_str())
                {
                    (
                        engine.telemetry_last_error_id.clone(),
                        engine.last_error_code.clone(),
                    )
                } else {
                    (None, None)
                }
            };
            let error_id = existing_error_id.unwrap_or_else(|| {
                app.state::<AppState>().telemetry.capture_error(
                    AppError::new("engine_start_failed", "native", true, Some(error.clone())),
                    Some(&operation_id),
                    true,
                    "error",
                )
            });
            // StartGuard has cleaned up; publish failure details without reclaiming the session.
            let snapshot = {
                let state = app.state::<AppState>();
                let mut engine = state.engine.lock().unwrap();
                let mut snapshot = EngineSnapshot::stopped();
                snapshot.state = "error".into();
                snapshot.message = Some(error.clone());
                snapshot.operation_id = Some(operation_id.clone());
                snapshot.error_id = Some(error_id.clone());
                snapshot.error_code = error_code;
                engine.snapshot = Some(snapshot.clone());
                snapshot
            };
            emit(&app, &snapshot);
            Err(format!(
                "{error}\n(error_id: {error_id}; operation_id: {operation_id})"
            ))
        }
        other => other,
    }
}

async fn start_engine_inner(
    app: AppHandle,
    state: State<'_, AppState>,
    operation_id: String,
) -> Result<(), String> {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    // Claim startup atomically before any await or side effect to prevent duplicate supervisors.
    let (my_gen, _startup_activity) = {
        let mut eng = state.engine.lock().unwrap();
        crate::updater::claim_start(&mut eng)?;
        eng.start_gen = eng.start_gen.wrapping_add(1);
        eng.operation_id = Some(operation_id.clone());
        eng.telemetry_reconnect_count = 0;
        eng.telemetry_last_error_id = None;
        eng.last_error_code = None;
        eng.telemetry_last_error_operation_id = None;
        (eng.start_gen, eng.begin_pending_activity())
    };
    let mut start_guard = StartGuard {
        app: &app,
        generation: my_gen,
        armed: true,
    };

    let mut config = get_config(app.clone());
    pin_smart_choices(&mut config).await;
    // The frontend blocks going live with a destination that has no URL yet; never start one.
    let enabled: Vec<_> = config
        .targets
        .iter()
        .filter(|t| t.enabled && !t.ingest_url.is_empty())
        .collect();
    {
        let mut eng = state.engine.lock().unwrap();
        eng.target_platforms = enabled
            .iter()
            .map(|target| {
                (
                    target.id.clone(),
                    crate::platforms::known_destination_id(&target.platform_id).to_string(),
                )
            })
            .collect();
        eng.telemetry_encoder_kind = telemetry_encoder_kind(&config);
    }
    if enabled.is_empty() {
        return Err(Msg::EngineNoPlatformEnabled.now());
    }

    // Publish progress before blocking orphan cleanup so startup responds immediately.
    let started = now_ms();
    let mut snap = EngineSnapshot::starting(&config, started);
    snap.operation_id = Some(operation_id.clone());
    {
        let mut eng = state.engine.lock().unwrap();
        eng.snapshot = Some(snap.clone());
        eng.started_ms = started;
        eng.telemetry_start_requested_ms = started;
    }
    emit(&app, &snap);

    for provider in crate::platforms::account_providers() {
        provider.before_go_live(&app);
    }

    let mut keymap: HashMap<String, String> = HashMap::new();
    for t in &enabled {
        if let Some(k) = keys::get_key(&t.id) {
            keymap.insert(t.id.clone(), k);
        }
    }
    let ingest_port = u16::try_from(config.ingest.port).unwrap_or(1935);
    let mut listen_addresses = vec![("127.0.0.1", engine::MEDIAMTX_API_PORT)];
    // Listening on a LAN address would make Windows Firewall prompt for Corneta itself; MediaMTX's
    // own bind error still reports a taken LAN ingest port.
    if is_loopback_host(&config.ingest.host) {
        listen_addresses.insert(0, (config.ingest.host.as_str(), ingest_port));
    }
    let mut blocked = first_unavailable_port(&listen_addresses);
    // Stopping does not wait for the process tree, so the previous MediaMTX may still hold a port.
    for _ in 0..10 {
        if blocked.is_none() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        blocked = first_unavailable_port(&listen_addresses);
    }
    if let Some(port) = blocked {
        let message = Msg::EngineIngestPortInUse { port }.now();
        capture_engine_error(
            &app,
            "ingest_port_in_use",
            "mediamtx",
            true,
            Some(message.clone()),
        );
        mark_port_failure(&app, port);
        return Err(message);
    }
    let yml = mediamtx_config_path(&app).inspect_err(|error| {
        capture_engine_error(
            &app,
            "mediamtx_config_path_failed",
            "config",
            true,
            Some(error.clone()),
        );
    })?;
    std::fs::write(&yml, engine::mediamtx_config(&config)).map_err(|error| {
        capture_engine_error(
            &app,
            "mediamtx_config_write_failed",
            "config",
            true,
            Some(error.to_string()),
        );
        format!("MediaMTX config: {error}")
    })?;

    let (mut mtx_rx, mtx_child) = app
        .shell()
        .sidecar("mediamtx")
        .map_err(|e| {
            // Keep raw sidecar details in logs and actionable localized errors in the UI.
            log::error!("MediaMTX sidecar unavailable: {e}");
            capture_engine_error(
                &app,
                "mediamtx_sidecar_missing",
                "mediamtx",
                false,
                Some(e.to_string()),
            );
            Msg::EngineMissingSidecar.now()
        })?
        .args([yml.to_string_lossy().to_string()])
        .spawn()
        .map_err(|e| {
            log::error!("MediaMTX failed to start: {e}");
            capture_engine_error(
                &app,
                "mediamtx_spawn_failed",
                "mediamtx",
                true,
                Some(e.to_string()),
            );
            Msg::EngineMediamtxNoStart.now()
        })?;
    crate::job::adopt_pid(mtx_child.pid());

    let running = Arc::new(AtomicBool::new(true));
    let has_signal = Arc::new(AtomicBool::new(false));
    let prog_ready = Arc::new(AtomicBool::new(false));
    let slate_on = Arc::new(AtomicBool::new(false));
    let session_path = session::start_session(&app, &config);
    chat::reset_msg_counts();
    session::set_chat_recording(config.settings.record_chat);
    let pause_flags: HashMap<String, Arc<AtomicBool>> = enabled
        .iter()
        .map(|t| (t.id.clone(), Arc::new(AtomicBool::new(false))))
        .collect();
    // Terminal authentication failures stay paused until an explicit retry clears the flag.
    let auth_flags: HashMap<String, Arc<AtomicBool>> = enabled
        .iter()
        .map(|t| (t.id.clone(), Arc::new(AtomicBool::new(false))))
        .collect();
    let reencode_flags: HashMap<String, Arc<AtomicBool>> = enabled
        .iter()
        .map(|t| (t.id.clone(), Arc::new(AtomicBool::new(false))))
        .collect();
    {
        let mut eng = state.engine.lock().unwrap();
        // An await may outlive cancellation or a newer startup; do not install stale handles.
        if !eng.live || eng.start_gen != my_gen {
            drop(eng);
            log::info!("engine: startup cancelled during setup; aborting");
            let _ = mtx_child.kill();
            // This session never went live, so its newly created report has no replay value.
            if let Some(p) = session_path {
                let _ = std::fs::remove_file(p);
            }
            start_guard.armed = false;
            return Err(START_CANCELLED.into());
        }
        eng.mediamtx = Some(mtx_child);
        eng.snapshot = Some(snap.clone());
        eng.started_ms = started;
        eng.running = running.clone();
        eng.session_path = session_path;
        eng.paused = pause_flags.clone();
        eng.auth_error = auth_flags.clone();
        eng.reencode = reencode_flags.clone();
    }
    emit(&app, &snap);

    if let Err(failure) = wait_mediamtx_ready(
        &mut mtx_rx,
        ingest_port,
        MEDIAMTX_READY_TIMEOUT,
        mediamtx_api_answers,
    )
    .await
    {
        log::error!("engine: {failure} before provisioning");
        let message = failure.message().now();
        capture_engine_error(
            &app,
            failure.code(),
            failure.stage(),
            true,
            Some(message.clone()),
        );
        return Err(message);
    }
    {
        let eng = state.engine.lock().unwrap();
        if !eng.live || eng.start_gen != my_gen {
            drop(eng);
            log::info!("engine: startup cancelled while MediaMTX started; aborting");
            start_guard.armed = false;
            return Err(START_CANCELLED.into());
        }
    }

    // Provision only after local startup succeeds to avoid broadcasts orphaned by setup failure.
    let mut provisioned: HashMap<String, ProvisionedIngest> = HashMap::new();
    for provider in crate::platforms::account_providers() {
        let Some(auto) = provider.auto_broadcast() else {
            continue;
        };
        if !auto.enabled(&config.settings) {
            continue;
        }
        let Some(target) = enabled
            .iter()
            .find(|t| crate::platforms::destination_account(&t.platform_id) == Some(provider.id()))
        else {
            continue;
        };
        let target_id = target.id.clone();
        let (app2, settings) = (app.clone(), config.settings.clone());
        match tauri::async_runtime::spawn_blocking(move || auto.open(&app2, &settings, my_gen))
            .await
        {
            Ok(Ok(ingest)) => {
                log::info!("{}: broadcast provisioned automatically", provider.id());
                provisioned.insert(target_id, ingest);
            }
            Ok(Err(e)) => {
                auto_broadcast_fallback(&app, auto.open_failure(), &target_id, my_gen, &e)
            }
            Err(_) => {
                let failure = auto.open_failure();
                let reason = failure.unknown_reason.clone();
                auto_broadcast_fallback(&app, failure, &target_id, my_gen, &reason)
            }
        }
    }

    log::info!("engine: starting MediaMTX ingest and FFmpeg fan-out");

    let app_m = app.clone();
    let yml_m = yml.clone();
    tauri::async_runtime::spawn(async move {
        // OBS reconnects to a restarted ingest server on its own, and so do the outputs, so a
        // crash mid-live costs a few seconds instead of the whole live.
        let mut budget = RestartBudget::new(MEDIAMTX_RESTARTS, MEDIAMTX_QUIET_MS);
        'supervise: loop {
            while let Some(ev) = mtx_rx.recv().await {
                match ev {
                    CommandEvent::Stdout(b) | CommandEvent::Stderr(b) => {
                        let raw = String::from_utf8_lossy(&b);
                        log_mediamtx_line(&raw);
                        if let Some(port) = mediamtx_port_conflict(&raw, ingest_port) {
                            set_engine_error(
                                &app_m,
                                EngineFailure::IngestPortInUse { port },
                                my_gen,
                            );
                        }
                    }
                    CommandEvent::Terminated(_) => break,
                    _ => {}
                }
            }
            // A port conflict or a stop already ended the live; there is nothing to restart.
            loop {
                if !live_is_current(&app_m, my_gen) {
                    break 'supervise;
                }
                let Some(wait_ms) = budget.next_delay(now_ms() as u64) else {
                    set_engine_error(&app_m, EngineFailure::MediamtxExited, my_gen);
                    break 'supervise;
                };
                if budget.episode_started() {
                    capture_native_error(
                        &app_m,
                        "mediamtx_died",
                        "mediamtx",
                        true,
                        Some("restarting".into()),
                    );
                }
                log::warn!("engine: MediaMTX exited mid-live; restarting in {wait_ms} ms");
                tokio::time::sleep(std::time::Duration::from_millis(wait_ms)).await;
                match restart_mediamtx(&app_m, &yml_m, my_gen) {
                    Ok(Some(events)) => {
                        mtx_rx = events;
                        log::info!("engine: MediaMTX restarted");
                        notify(
                            &app_m,
                            &Msg::NotifyIngestRestartedTitle.now(),
                            &Msg::NotifyIngestRestartedBody.now(),
                        );
                        crate::deck::notice(&app_m, crate::deck::DeckNotice::IngestRestarted);
                        continue 'supervise;
                    }
                    Ok(None) => break 'supervise,
                    Err(error) => log::warn!("engine: MediaMTX restart failed: {error}"),
                }
            }
        }
    });

    let run_sig = running.clone();
    let sig = has_signal.clone();
    let prog_sig = prog_ready.clone();
    let app_sig = app.clone();
    let ingest_name = engine::ingest_path_name(&config);
    let program_name = engine::program_path_name(&config);
    let auto_reencode_targets: Vec<(String, String)> = if config.mode == "hybrid" {
        enabled
            .iter()
            .filter(|t| {
                t.encoding
                    .hybrid_override
                    .as_deref()
                    .is_none_or(str::is_empty)
                    && engine::effective_action(&config.mode, t) == "copy"
            })
            .map(|t| (t.id.clone(), t.platform_id.clone()))
            .collect()
    } else {
        Vec::new()
    };
    let reencode_sig = reencode_flags.clone();
    let brb_for_codec = config.settings.brb_enabled;
    tauri::async_runtime::spawn_blocking(move || {
        // Two polls without byte changes count as stalled even if MediaMTX still reports ready.
        let mut last_bytes = 0u64;
        let mut stalls = 0u32;
        let mut checked_codec = false;
        while run_sig.load(Ordering::Relaxed) {
            let (ready, bytes, prog, source_codec) =
                mediamtx_paths_with_codec(&ingest_name, &program_name, brb_for_codec);
            let flowing = bytes != last_bytes; // Counter resets also indicate activity.
            last_bytes = bytes;
            if ready && flowing {
                stalls = 0;
            } else {
                stalls = stalls.saturating_add(1);
            }
            let live = ready && stalls < 2;
            let source_ready = if brb_for_codec { prog } else { live };
            if source_ready && !checked_codec {
                if let Some(codec) = source_codec {
                    checked_codec = true;
                    if codec != crate::platforms::VideoCodec::H264 {
                        for (tid, pid) in &auto_reencode_targets {
                            if !engine::destination_accepts_codec(pid, codec) {
                                if let Some(flag) = reencode_sig.get(tid) {
                                    flag.store(true, Ordering::Relaxed);
                                }
                                let _ = reencode_target(app_sig.clone(), tid.clone());
                            }
                        }
                    }
                }
            }
            sig.store(live, Ordering::Relaxed);
            prog_sig.store(prog, Ordering::Relaxed);
            set_ingest_live(&app_sig, live);
            std::thread::sleep(std::time::Duration::from_millis(700));
        }
    });

    let picture_alerts = crate::black_screen::Alerts {
        black: config.settings.black_screen_alert,
        frozen: config.settings.frozen_frame_alert,
    };
    let watch_ffmpeg = (picture_alerts.any() || config.settings.silent_audio_alert)
        .then(crate::compositor::ffmpeg_path)
        .flatten();
    if let Some(ffmpeg) = watch_ffmpeg.clone().filter(|_| picture_alerts.any()) {
        let (app_b, run_b, sig_b) = (app.clone(), running.clone(), has_signal.clone());
        let url = engine::ingest_url(&config);
        tauri::async_runtime::spawn_blocking(move || {
            let app_p = app_b.clone();
            crate::black_screen::run(
                &ffmpeg,
                run_b,
                sig_b,
                url,
                picture_alerts,
                move || slate_forced(&app_p),
                move |alert, on| set_watch_alert(&app_b, alert.into(), on),
            );
        });
    }
    if let Some(ffmpeg) = watch_ffmpeg.filter(|_| config.settings.silent_audio_alert) {
        let (app_s, run_s, sig_s) = (app.clone(), running.clone(), has_signal.clone());
        let url = engine::ingest_url(&config);
        tauri::async_runtime::spawn_blocking(move || {
            let app_p = app_s.clone();
            crate::silence_watch::run(
                &ffmpeg,
                run_s,
                sig_s,
                url,
                move || slate_forced(&app_p),
                move |on| set_watch_alert(&app_s, WatchAlert::Silent, on),
            );
        });
    }

    let brb_enabled = config.settings.brb_enabled;
    let auto_bitrate = config.settings.auto_bitrate;

    // A continuous program feed keeps output connections alive while the input is replaced.
    let compositor_on = brb_enabled;
    let out_source = if compositor_on {
        engine::program_url(&config)
    } else {
        engine::ingest_url(&config)
    };
    log::info!(
        "engine: compositor={compositor_on} output-source={}",
        if compositor_on { "_program" } else { "live" }
    );

    // Record the actual output source: _program does not exist without a compositor.
    // Recording failures are best-effort and must not abort stream startup.
    if config.settings.record_video {
        let sess = {
            let eng = state.engine.lock().unwrap();
            eng.session_path.clone()
        };
        match (
            recorder::resolve_dir(&app, &config.settings.record_video_dir),
            sess,
        ) {
            (Some(dir), Some(sp)) => {
                // Prune before recording to preserve headroom; unrecognized files are not ours to delete.
                let leftover =
                    session::prune_videos(&app, Some(&dir), config.settings.record_video_keep_gb);
                if leftover > 0 {
                    log::warn!(
                        "recording: unrecognized files exceed the storage limit by {leftover} bytes"
                    );
                }
                let free = recorder::free_bytes(&dir);
                if free.is_some_and(|f| f < recorder::DISK_START_FLOOR) {
                    log::warn!(
                        "recording: insufficient disk space at {}; skipping recording",
                        dir.display()
                    );
                    let _ = app.emit(
                        "recorder://status",
                        serde_json::json!({ "kind": "diskFull", "detail": null }),
                    );
                } else {
                    let id = sp
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or_default()
                        .to_string();
                    let launch = engine::RecorderLaunch {
                        source: out_source.clone(),
                        dir,
                        session_path: sp,
                        id,
                    };
                    let activity = {
                        let mut eng = state.engine.lock().unwrap();
                        eng.recorder_launch = Some(launch.clone());
                        eng.begin_pending_activity()
                    };
                    let (a, run) = (app.clone(), running.clone());
                    tauri::async_runtime::spawn(recorder::run(
                        a,
                        launch.source,
                        launch.dir,
                        launch.session_path,
                        launch.id,
                        run,
                        activity,
                    ));
                }
            }
            (None, _) => {
                // Do not silently recreate or substitute a missing configured recording directory.
                log::warn!("recording: directory unavailable; streaming without recording");
                let _ = app.emit(
                    "recorder://status",
                    serde_json::json!({ "kind": "noDir", "detail": null }),
                );
            }
            (_, None) => {}
        }
    }
    // Avoid probing hardware unless a compositor or automatic transcode needs it.
    let needs_hw = compositor_on
        || enabled.iter().any(|t| {
            engine::effective_action(&config.mode, t) == "transcode" && t.encoding.encoder == "auto"
        });
    let hw_codec: Option<String> = if needs_hw {
        detect_hw_encoder(&app).await
    } else {
        None
    };
    // Recheck generation after slow provisioning/probes before starting new supervisors.
    {
        let eng = state.engine.lock().unwrap();
        if !eng.live || eng.start_gen != my_gen {
            drop(eng);
            log::info!("engine: startup cancelled after setup; aborting before supervisors");
            start_guard.armed = false;
            // A stop during provisioning ran before the broadcast existed.
            close_auto_broadcasts_later(&app, my_gen);
            return Err(START_CANCELLED.into());
        }
    }
    if compositor_on {
        let slate_file = brb_slate_file(&app);
        let slate_is_video = slate_file
            .as_deref()
            .map(brb_slate_is_video)
            .unwrap_or(false);
        let spec = engine::program_spec(&config);
        let slate = match (&slate_file, slate_is_video) {
            (Some(p), true) => {
                let path = p.to_string_lossy().to_string();
                let has_audio = brb_slate_has_audio(&app, &path).await;
                crate::compositor::Slate::Video { path, has_audio }
            }
            _ => crate::compositor::Slate::Still(crate::compositor::load_slate_still(
                &app,
                &spec,
                slate_file.as_deref(),
            )),
        };
        let force_brb = Arc::new(AtomicBool::new(false));
        {
            let mut eng = state.engine.lock().unwrap();
            eng.force_brb = Some(force_brb.clone());
        }
        let opts = crate::compositor::CompositorOpts {
            spec,
            hw_codec: hw_codec.clone(),
            slate,
            force_slate: force_brb,
            config: config.clone(),
        };
        let (app_c, run_c, sig_c, slate_c) = (
            app.clone(),
            running.clone(),
            has_signal.clone(),
            slate_on.clone(),
        );
        // The splicer copies the OBS bitstream and falls back to the compositor when it cannot.
        tauri::async_runtime::spawn(async move {
            crate::splicer::run(app_c, run_c, sig_c, slate_c, opts).await;
        });
    }

    let shared_signal = if compositor_on {
        &prog_ready
    } else {
        &has_signal
    };
    let shared_renditions = crate::renditions::start(
        &app,
        crate::renditions::plan(&config, &out_source, hw_codec.as_deref()),
        &running,
        shared_signal,
    );

    for &t in &enabled {
        let mut target = t.clone();
        let mut key = keymap.get(&t.id).cloned().unwrap_or_default();
        if let Some(ingest) = provisioned.get(&t.id) {
            target.ingest_url = ingest.url.clone();
            key = ingest.key.clone();
        }
        let cfg = config.clone();
        let is_transcode = engine::effective_action(&config.mode, t) == "transcode";
        let base_kbps = engine::effective_preset(t).video_bitrate_kbps;
        let floor_kbps = ((base_kbps as f64 * 0.4) as u32).max(800);
        let target_id = t.id.clone();
        let target_name = t.name.clone();
        let app_t = app.clone();
        let run_flag = running.clone();
        let pause_flag = pause_flags.get(&t.id).cloned().unwrap_or_default();
        let auth_flag = auth_flags.get(&t.id).cloned().unwrap_or_default();
        // Provisioned broadcast credentials override the vault and must survive retries.
        let has_provisioned = provisioned.contains_key(&t.id);
        // Outputs follow program readiness so OBS loss alone does not restart their connections.
        let signal = if compositor_on {
            prog_ready.clone()
        } else {
            has_signal.clone()
        };
        let brb_flag = slate_on.clone();
        let auto_codec = hw_codec.clone();
        let out_source = out_source.clone();
        let rendition = shared_renditions.get(&t.id).cloned();
        let reencode_flag = reencode_flags.get(&t.id).cloned().unwrap_or_default();
        // A mid-live re-encode follows the destination's preset, as per-platform mode would.
        let reencode_cfg = {
            let mut c = config.clone();
            c.mode = "per-platform".into();
            c
        };
        tauri::async_runtime::spawn(async move {
            // Preserve bitrate adaptation across FFmpeg restarts.
            let mut abr = engine::AutoBitrate::new(base_kbps, floor_kbps);
            // Notify once per degradation episode, not once per bitrate step.
            let mut drop_notified = false;
            let mut gpu_pipeline = crate::gpu_pipeline::enabled();
            // The start probes GPU encoders only when something encodes; a re-encode probes then.
            let mut auto_codec = auto_codec;
            let mut probed = auto_codec.is_some();
            // After a GPU encoder fails, this destination stays on x264 until the live ends.
            let mut software_encoder = false;
            let mut software_target = target.clone();
            software_target.encoding.encoder = "software".into();
            while run_flag.load(Ordering::Relaxed) {
                if pause_flag.load(Ordering::Relaxed) {
                    set_target_state(&app_t, &target_id, "paused");
                    if !supervisor_wait(&run_flag, std::time::Duration::from_millis(300)).await {
                        break;
                    }
                    continue;
                }

                // Keep terminal errors stable until explicit retry, including after pause/resume.
                if auth_flag.load(Ordering::Relaxed) {
                    reaffirm_auth_error(&app_t, &target_id);
                    if !supervisor_wait(&run_flag, std::time::Duration::from_millis(300)).await {
                        break;
                    }
                    // A retry may follow a credential edit made while the stream stayed live.
                    if !auth_flag.load(Ordering::Relaxed) && !has_provisioned {
                        let tid = target_id.clone();
                        if let Ok(Some(k)) =
                            tauri::async_runtime::spawn_blocking(move || keys::get_key(&tid)).await
                        {
                            key = k;
                        }
                    }
                    continue;
                }

                if !signal.load(Ordering::Relaxed) {
                    set_target_waiting(&app_t, &target_id);
                    if !supervisor_wait(&run_flag, std::time::Duration::from_millis(700)).await {
                        break;
                    }
                    continue;
                }

                let shared = rendition.as_ref().filter(|rendition| {
                    abr.current() == base_kbps && !rendition.failed.load(Ordering::Relaxed)
                });
                let _lease = shared.map(|rendition| rendition.acquire());
                if shared.is_some_and(|rendition| !rendition.ready.load(Ordering::Relaxed)) {
                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    continue;
                }
                let reencoding = !is_transcode && reencode_flag.load(Ordering::Relaxed);
                if reencoding && !probed {
                    probed = true;
                    auto_codec = detect_hw_encoder(&app_t).await;
                }
                let transcoding = is_transcode || reencoding;
                let mut args = if let Some(shared) = shared {
                    engine::ffmpeg_args_for_rendition_egress(&cfg, &target, &key, &shared.url)
                } else {
                    engine::ffmpeg_args_for_target(
                        if reencoding { &reencode_cfg } else { &cfg },
                        if software_encoder {
                            &software_target
                        } else {
                            &target
                        },
                        &key,
                        Some(abr.current()),
                        &out_source,
                        auto_codec.as_deref(),
                    )
                };
                let accelerated = if gpu_pipeline {
                    crate::gpu_pipeline::candidate_for_live(&app_t, &args, &run_flag).await
                } else {
                    None
                };
                if !run_flag.load(Ordering::Relaxed) {
                    break;
                }
                if pause_flag.load(Ordering::Relaxed) || !signal.load(Ordering::Relaxed) {
                    continue;
                }
                let used_gpu_pipeline = accelerated.is_some();
                if let Some(accelerated) = accelerated {
                    args = accelerated;
                }
                // A failing GPU pipeline is retried without it first; only plain GPU encoding
                // failures move the destination to x264.
                let hardware_codec = video_codec(&args)
                    .filter(|codec| !used_gpu_pipeline && is_hardware_video_codec(codec))
                    .map(str::to_owned);
                let spawned = app_t
                    .shell()
                    .sidecar("ffmpeg")
                    .and_then(|c| c.args(args).spawn());
                let (mut rx, child) = match spawned {
                    Ok(v) => v,
                    Err(e) => {
                        log::error!("FFmpeg sidecar unavailable: {e}");
                        set_engine_error(&app_t, EngineFailure::FfmpegUnavailable, my_gen);
                        break;
                    }
                };
                crate::job::adopt_pid(child.pid());
                {
                    let st = app_t.state::<AppState>();
                    st.engine
                        .lock()
                        .unwrap()
                        .ffmpegs
                        .insert(target_id.clone(), child);
                }
                // Stop can drain the map before this insert; its flag is written under the same lock.
                // Kill any late child rather than allowing it to transmit after shutdown.
                if !run_flag.load(Ordering::Relaxed) {
                    let leftover = {
                        let st = app_t.state::<AppState>();
                        let removed = st.engine.lock().unwrap().ffmpegs.remove(&target_id);
                        removed
                    };
                    if let Some(c) = leftover {
                        kill_sidecar(c);
                    }
                    break;
                }
                abr.on_reconnect();
                let mut rebitrate = false;
                let mut signal_lost = false;
                let mut paused_kill = false;
                let mut stalled = false;
                let mut encoder_failed = false;
                let mut reencode_restart = false;
                let mut progress = ProgressWatch::new(now_ms() as u64);
                let mut recent_speed = crate::engine_policy::SpeedWindow::default();
                // Release the output promptly if its input stalls or it is paused.
                let mut watchdog = tokio::time::interval(std::time::Duration::from_millis(250));
                watchdog.tick().await; // Skip the interval's immediate first tick.
                loop {
                    tokio::select! {
                        ev = rx.recv() => {
                            let Some(ev) = ev else { break };
                            match ev {
                                CommandEvent::Stdout(b) | CommandEvent::Stderr(b) => {
                                    let line = String::from_utf8_lossy(&b);
                                    if let Some(diagnostic) =
                                        safe_ffmpeg_diagnostic(&line, &key)
                                    {
                                        log::warn!("target FFmpeg: {diagnostic}");
                                    }
                                    update_target_metrics(
                                        &app_t,
                                        &target_id,
                                        &line,
                                        signal.load(Ordering::Relaxed),
                                        brb_flag.load(Ordering::Relaxed),
                                    );
                                    progress.on_stats(stats_written_kb(&line), now_ms() as u64);
                                    if let Some(codec) = hardware_codec.as_deref() {
                                        if hardware_encoder_failed(&line.to_lowercase(), codec) {
                                            encoder_failed = true;
                                        }
                                    }
                                    // Adaptation updates the bitrate; restart FFmpeg to apply the selected value.
                                    if auto_bitrate && transcoding {
                                        let stats_speed = parse_kv(&line, "speed=");
                                        let windowed = recent_speed.on_stats(
                                            crate::engine_policy::stats_media_secs(&line),
                                            now_ms() as u64,
                                        );
                                        if let Some(speed) = windowed.or(stats_speed) {
                                            match abr.on_speed(speed) {
                                                engine::BitrateAction::Down(kbps) => {
                                                    log::info!("auto-bitrate: reducing target to {kbps} kbps");
                                                    if !drop_notified {
                                                        drop_notified = true;
                                                        notify(
                                                            &app_t,
                                                            &Msg::NotifyBitrateDownTitle.now(),
                                                            &Msg::NotifyBitrateDownBody { target_name: &target_name }.now(),
                                                        );
                                                    }
                                                    rebitrate = true;
                                                    break;
                                                }
                                                engine::BitrateAction::Up(kbps) => {
                                                    log::info!("auto-bitrate: increasing target to {kbps} kbps");
                                                    if kbps >= base_kbps && drop_notified {
                                                        drop_notified = false;
                                                        notify(
                                                            &app_t,
                                                            &Msg::NotifyBitrateUpTitle.now(),
                                                            &Msg::NotifyBitrateUpBody { target_name: &target_name }.now(),
                                                        );
                                                    }
                                                    rebitrate = true;
                                                    break;
                                                }
                                                engine::BitrateAction::Hold => {}
                                            }
                                        }
                                    }
                                }
                                CommandEvent::Terminated(_) => break,
                                _ => {}
                            }
                        }
                        _ = watchdog.tick() => {
                            // Pause may arrive between spawn and insertion, before set_target_paused sees the handle.
                            if pause_flag.load(Ordering::Relaxed) {
                                paused_kill = true;
                                break;
                            }
                            if !signal.load(Ordering::Relaxed) {
                                signal_lost = true;
                                break;
                            }
                            if shared.is_some_and(|rendition| !rendition.ready.load(Ordering::Relaxed)) {
                                signal_lost = true;
                                break;
                            }
                            if progress.stalled(now_ms() as u64) {
                                stalled = true;
                                break;
                            }
                            if !reencoding && !is_transcode && reencode_flag.load(Ordering::Relaxed) {
                                reencode_restart = true;
                                break;
                            }
                        }
                    }
                }
                let leftover = {
                    let st = app_t.state::<AppState>();
                    let removed = st.engine.lock().unwrap().ffmpegs.remove(&target_id);
                    removed
                };
                let killed = rebitrate || signal_lost || paused_kill || stalled || reencode_restart;
                if killed {
                    if let Some(c) = leftover {
                        kill_sidecar(c);
                    }
                }
                if !run_flag.load(Ordering::Relaxed) {
                    break;
                }
                let unexpected_exit =
                    !rebitrate && !signal_lost && !paused_kill && !reencode_restart;
                let mut gpu_fallback_retry = false;
                if used_gpu_pipeline && unexpected_exit && !progress.healthy_run() {
                    gpu_pipeline = false;
                    if !progress.wrote_any() && !stalled && !auth_flag.load(Ordering::Relaxed) {
                        log::info!(
                            "target GPU pipeline exited before output; retrying on standard decode"
                        );
                        gpu_fallback_retry = true;
                    }
                }
                if encoder_failed && !killed && !software_encoder {
                    software_encoder = true;
                    log::warn!("target GPU encoder failed; this destination moves to x264");
                    capture_native_error(&app_t, "target_encoder_fallback", "encoder", true, None);
                    notify(
                        &app_t,
                        &Msg::NotifyEncoderFallbackTitle.now(),
                        &Msg::NotifyEncoderFallbackBody {
                            target_name: &target_name,
                        }
                        .now(),
                    );
                }
                if pause_flag.load(Ordering::Relaxed) {
                    continue;
                }
                // Bitrate, encoder and re-encode changes do not need the network-reconnect backoff.
                if rebitrate
                    || reencode_restart
                    || gpu_fallback_retry
                    || (encoder_failed && software_encoder && !stalled)
                {
                    continue;
                }
                if stalled {
                    log::warn!("target FFmpeg is not writing; reconnecting");
                    capture_native_error(&app_t, "target_output_stalled", "target", true, None);
                }
                if !signal.load(Ordering::Relaxed) {
                    continue;
                }
                // Terminal errors remain parked instead of becoming reconnect notifications.
                if auth_flag.load(Ordering::Relaxed) {
                    continue;
                }
                log::warn!("target FFmpeg exited; reconnecting in 2s");
                set_target_reconnecting(&app_t, &target_id);
                if !supervisor_wait(&run_flag, std::time::Duration::from_secs(2)).await {
                    break;
                }
            }
        });
    }

    let app_u = app.clone();
    let run_u = running.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut sampler = crate::resources::ResourceSampler::new();
        // Disable the NVIDIA utility fallback for this session after a failed sample.
        let mut fallback_gpu_ok = true;
        let mut fallback_gpu = None;
        let mut fallback_sampled_at: Option<std::time::Instant> = None;
        while run_u.load(Ordering::Relaxed) {
            std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
            let mut usage = sampler.sample();
            if usage.gpu.is_none() && fallback_gpu_ok {
                if fallback_sampled_at
                    .is_none_or(|last| last.elapsed() >= std::time::Duration::from_secs(10))
                {
                    fallback_gpu = read_gpu(&run_u);
                    fallback_sampled_at = Some(std::time::Instant::now());
                    if fallback_gpu.is_none() {
                        fallback_gpu_ok = false;
                    }
                }
                usage.gpu = fallback_gpu;
            }
            update_usage(&app_u, usage);
            std::thread::sleep(std::time::Duration::from_secs(2));
        }
    });

    let app_o = app.clone();
    let run_o = running.clone();
    let obs_pw = crate::obs_env::password(&config.settings.obs_password);
    tauri::async_runtime::spawn_blocking(move || {
        while run_o.load(Ordering::Relaxed) {
            crate::obs::poll_stats(
                OBS_WS_HOST,
                crate::obs_env::port(),
                &obs_pw,
                &run_o,
                |stats| {
                    update_obs_stats(&app_o, stats);
                },
            );
            for _ in 0..25 {
                if !run_o.load(Ordering::Relaxed) {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
        }
    });

    let platform_checks = platform_check_plan(&enabled, &keymap, &provisioned);
    if !platform_checks.is_empty() {
        spawn_platform_checks(app.clone(), my_gen, running.clone(), platform_checks);
    }

    start_guard.armed = false;
    Ok(())
}

// Blocking process cleanup stays off the event loop; kill_engine publishes stopped first.
#[tauri::command]
pub async fn stop_engine(app: AppHandle, operation_id: Option<String>) -> Result<(), String> {
    let (generation, activity) = {
        let state = app.state::<AppState>();
        let engine = state.engine.lock().unwrap();
        (engine.start_gen, engine.begin_pending_activity())
    };
    if operation_id
        .as_deref()
        .is_some_and(|value| uuid::Uuid::parse_str(value).is_err())
    {
        return Err("invalid operationId".into());
    }
    if let Some(operation_id) = operation_id {
        let state = app.state::<AppState>();
        let mut engine = state.engine.lock().unwrap();
        // Preserve the startup ID; use the argument only when restoring missing correlation.
        if engine.operation_id.is_none() {
            engine.operation_id = Some(operation_id);
        }
    }
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || kill_engine(&app2))
        .await
        .map_err(|e| e.to_string())?;
    // Platform autostop is disabled for reconnects; failed cleanup stays recoverable.
    let app3 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _activity = activity;
        close_auto_broadcasts(&app3, generation, true);
    });
    Ok(())
}

// Emit the pause state before blocking process cleanup.
#[tauri::command]
pub async fn set_target_paused(
    app: AppHandle,
    target_id: String,
    paused: bool,
) -> Result<(), String> {
    use std::sync::atomic::Ordering;

    // Publish the flag and remove its child under one lock; release it before awaiting cleanup.
    let child = {
        let state = app.state::<AppState>();
        let mut eng = state.engine.lock().unwrap();
        match eng.paused.get(&target_id) {
            Some(flag) => flag.store(paused, Ordering::Relaxed),
            None => return Err(Msg::TargetNotLive.now()),
        }
        if paused {
            eng.ffmpegs.remove(&target_id)
        } else {
            None
        }
    };

    let out = {
        let state = app.state::<AppState>();
        let mut eng = state.engine.lock().unwrap();
        eng.snapshot.as_mut().map(|snap| {
            if let Some(st) = snap.targets.get_mut(&target_id) {
                st.state = if paused { "paused" } else { "connecting" }.into();
                st.message = None;
            }
            snap.clone()
        })
    };
    if let Some(out) = out {
        emit(&app, &out);
    }

    if let Some(child) = child {
        tauri::async_runtime::spawn_blocking(move || {
            kill_sidecar(child);
        })
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// The supervisor reloads credentials after an explicit retry of a terminal failure.
#[tauri::command]
pub fn retry_target(app: AppHandle, target_id: String) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    match eng.auth_error.get(&target_id) {
        Some(flag) => flag.store(false, Ordering::Relaxed),
        None => return Err(Msg::TargetNotInThisStream.now()),
    }
    let out = eng.snapshot.as_mut().map(|snap| {
        if let Some(st) = snap.targets.get_mut(&target_id) {
            st.state = "connecting".into();
            st.message = None;
        }
        snap.clone()
    });
    drop(eng);
    if let Some(out) = out {
        emit(&app, &out);
    }
    Ok(())
}

/// Re-encodes a destination that receives OBS's signal as-is, until the live ends, so its
/// keyframes, bitrate and frame rate follow its preset. OBS's encoder settings are out of
/// obs-websocket's reach, so this is the fix Corneta can apply mid-live.
#[tauri::command]
pub fn reencode_target(app: AppHandle, target_id: String) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    let Some(flag) = eng.reencode.get(&target_id).cloned() else {
        return Err(Msg::TargetNotInThisStream.now());
    };
    let out = eng.snapshot.as_mut().and_then(|snap| {
        let st = snap.targets.get_mut(&target_id)?;
        if st.action == "transcode" {
            return None;
        }
        flag.store(true, Ordering::Relaxed);
        st.action = "transcode".into();
        st.reencoded = true;
        // The platform's verdict described the copied signal; the next check describes this one.
        st.platform = None;
        Some(snap.clone())
    });
    drop(eng);
    if let Some(out) = out {
        log::info!("engine: re-encoding a destination until the live ends");
        emit(&app, &out);
    }
    Ok(())
}

/// Manual BRB requires a compositor, which runs only when BRB was enabled at start.
#[tauri::command]
pub fn set_force_brb(app: AppHandle, on: bool) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    if !eng.live {
        return Err(Msg::BrbStreamNotLive.now());
    }
    let Some(flag) = &eng.force_brb else {
        return Err(Msg::BrbNotArmed.now());
    };
    flag.store(on, Ordering::Relaxed);
    let out = eng.snapshot.as_mut().map(|snap| {
        snap.forced_brb = on;
        snap.clone()
    });
    drop(eng);
    if let Some(out) = out {
        emit(&app, &out);
    }
    Ok(())
}

fn kill_engine(app: &AppHandle) {
    stop_engine_internal(app, None, "user");
}

pub(crate) fn kill_engine_for_shutdown(app: &AppHandle) {
    stop_engine_internal(app, None, "app_exit");
}

// First shutdown wins; duplicate errors must not replace the terminal snapshot or kill twice.
fn stop_engine_internal(app: &AppHandle, error: Option<String>, reason: &str) {
    use std::sync::atomic::Ordering;
    let state = app.state::<AppState>();
    let (children, session_path, out, telemetry_end, target_transitions, _cleanup_activity) = {
        let mut eng = state.engine.lock().unwrap();
        if !eng.live {
            return;
        }
        let cleanup_activity = eng.begin_pending_activity();
        eng.live = false;
        log::info!(
            "engine: stopping{}",
            if error.is_some() { " (error)" } else { "" }
        );
        // Signal stop before draining under the insertion lock so late children can detect shutdown.
        eng.running.store(false, Ordering::Relaxed);
        let was_live = eng
            .snapshot
            .as_ref()
            .is_some_and(|snapshot| snapshot.state == "live");
        let operation_id = eng.operation_id.clone();
        let last_error_id = eng.telemetry_last_error_id.clone();
        let last_error_code = eng.last_error_code.clone();
        let duration = now_ms().saturating_sub(eng.started_ms);
        let reconnect_count = eng.telemetry_reconnect_count;
        let target_transitions: Vec<_> = eng
            .snapshot
            .as_ref()
            .map(|snapshot| {
                snapshot
                    .targets
                    .iter()
                    .filter_map(|(target_id, target)| {
                        eng.target_platforms
                            .get(target_id)
                            .cloned()
                            .map(|platform| (platform, target.state.clone()))
                    })
                    .collect()
            })
            .unwrap_or_default();
        let mut out = match &error {
            Some(msg) => {
                let mut s = EngineSnapshot::stopped();
                s.state = "error".into();
                s.message = Some(msg.clone());
                s.error_id = last_error_id;
                s.error_code = last_error_code;
                s
            }
            None => EngineSnapshot::stopped(),
        };
        out.operation_id = operation_id.clone();
        eng.snapshot = Some(out.clone());
        eng.paused.clear();
        eng.auth_error.clear();
        eng.reencode.clear();
        eng.force_brb = None;
        eng.target_platforms.clear();
        eng.operation_id = None;
        let session_path = eng.session_path.take();
        // Let FFmpeg flush the recording trailer; failed stdin writes fall back to forced cleanup.
        let recorder_stopping_gracefully = eng
            .ffmpegs
            .get_mut(recorder::RECORDER_KEY)
            .is_some_and(|child| child.write(b"q\n").is_ok());
        let recorder_child = recorder_stopping_gracefully
            .then(|| eng.ffmpegs.remove(recorder::RECORDER_KEY))
            .flatten();
        let mut children: Vec<tauri_plugin_shell::process::CommandChild> =
            eng.ffmpegs.drain().map(|(_, child)| child).collect();
        if let Some(child) = recorder_child {
            // The recorder supervisor owns termination and remux without blocking the stop command.
            eng.ffmpegs.insert(recorder::RECORDER_KEY.into(), child);
        }
        if let Some(m) = eng.mediamtx.take() {
            children.push(m);
        }
        (
            children,
            session_path,
            out,
            (was_live, operation_id, duration, reconnect_count),
            target_transitions,
            cleanup_activity,
        )
    };
    // Publish the terminal state before slow process-tree cleanup.
    emit(app, &out);

    let (was_live, operation_id, duration_ms, reconnect_count) = telemetry_end;
    for (platform, previous) in target_transitions {
        state.telemetry.capture_target_transition(
            operation_id.as_deref(),
            &platform,
            &previous,
            "stopped",
            None,
        );
    }
    if was_live {
        if let Some(operation_id) = operation_id {
            let mut properties = serde_json::Map::new();
            properties.insert(
                "operation_id".into(),
                serde_json::Value::String(operation_id),
            );
            properties.insert(
                "reason".into(),
                serde_json::Value::String(
                    if error.is_some() {
                        "engine_error"
                    } else {
                        reason
                    }
                    .into(),
                ),
            );
            properties.insert(
                "duration_bucket".into(),
                serde_json::Value::String(
                    telemetry::duration_bucket(std::time::Duration::from_millis(
                        duration_ms.min(u64::MAX as u128) as u64,
                    ))
                    .into(),
                ),
            );
            properties.insert(
                "reconnect_count_bucket".into(),
                serde_json::Value::String(telemetry::reconnect_bucket(reconnect_count).into()),
            );
            let _ = state.telemetry.capture("live_ended", properties);
        }
    }

    for child in children {
        kill_sidecar(child);
    }
    session::set_chat_recording(false);
    if let Some(path) = session_path {
        session::end_session(&path);
    }
}

#[cfg(test)]
mod supervisor_wait_tests {
    use super::supervisor_wait;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::Duration;

    #[tokio::test]
    async fn stopped_supervisors_do_not_resume_retry_work() {
        let running = AtomicBool::new(false);
        assert!(!supervisor_wait(&running, Duration::from_secs(60)).await);
        running.store(true, Ordering::Relaxed);
        let (resumed, ()) =
            tokio::join!(supervisor_wait(&running, Duration::from_millis(5)), async {
                tokio::task::yield_now().await;
                running.store(false, Ordering::Relaxed);
            });
        assert!(!resumed);
    }

    #[tokio::test]
    async fn independent_timers_keep_runtime_free_and_allow_retry() {
        let running = AtomicBool::new(true);
        let retry = AtomicBool::new(false);
        let (first, second, ()) = tokio::join!(
            supervisor_wait(&running, Duration::from_millis(2)),
            supervisor_wait(&running, Duration::from_millis(2)),
            async {
                tokio::task::yield_now().await;
                retry.store(true, Ordering::Relaxed);
            }
        );
        assert!(first && second && retry.load(Ordering::Relaxed));
    }
}
