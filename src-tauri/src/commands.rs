use crate::chat;
use crate::config::{self, AppConfig};
use crate::engine::{self, EngineSnapshot};
use crate::engine_policy::{
    brb_slate_is_video, friendly_error, is_brb_slate_path, parse_ingest_hostport, parse_kv,
    parse_mediamtx_paths, quality_of, safe_ffmpeg_diagnostic, tray_tooltip,
};
use crate::http_client as ureq;
use crate::i18n::Msg;
use crate::keys;
use crate::recorder;
use crate::session;
use crate::telemetry::{self, AppError};
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

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

fn build_diagnostic_report(
    version: &str,
    os: &str,
    arch: &str,
    config: &AppConfig,
    telemetry_summary: &serde_json::Value,
) -> Result<String, String> {
    // Only allowlisted structures may enter a shareable report; raw logs stay local.
    let safe_config = telemetry::diagnostic_config_summary(config);
    let config = serde_json::to_string_pretty(&safe_config).map_err(|error| error.to_string())?;
    let mut report = Msg::DiagReportHeader {
        version,
        os,
        arch,
        config: &config,
    }
    .now();
    report.push_str("\n--- telemetry-and-operations.json ---\n");
    report.push_str(
        &serde_json::to_string_pretty(telemetry_summary).map_err(|error| error.to_string())?,
    );
    report.push('\n');
    Ok(report)
}

// Hide console windows for blocking utilities such as taskkill and nvidia-smi.
fn quiet_command(program: &str) -> std::process::Command {
    #[allow(unused_mut)]
    let mut cmd = std::process::Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}

const OBS_WS_HOST: &str = "127.0.0.1";
const OBS_WS_PORT: u16 = 4455;

/// Stable IPC cancellation code; the frontend suppresses its error toast.
pub const START_CANCELLED: &str = "corneta:start-cancelled";

fn current_operation_id(app: &AppHandle) -> Option<String> {
    app.state::<AppState>()
        .engine
        .lock()
        .unwrap()
        .operation_id
        .clone()
}

#[track_caller]
fn capture_native_error(
    app: &AppHandle,
    code: &str,
    stage: &str,
    retryable: bool,
    source: Option<String>,
) -> String {
    let operation_id = current_operation_id(app);
    app.state::<AppState>().telemetry.capture_error(
        AppError::new(code, stage, retryable, source),
        operation_id.as_deref(),
        true,
        "error",
    )
}

// Reuse the terminal error ID in start_engine instead of reporting it twice.
#[track_caller]
fn capture_engine_error(
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
    engine.telemetry_last_error_operation_id = operation_id;
    error_id
}

fn telemetry_platform(value: &str) -> &'static str {
    match value {
        "twitch" => "twitch",
        "youtube" => "youtube",
        "facebook" => "facebook",
        "kick" => "kick",
        "tiktok" => "tiktok",
        "x" => "x",
        "instagram" => "instagram",
        _ => "custom",
    }
}

fn telemetry_encoder_kind(config: &AppConfig) -> String {
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

/// Tauri sidecars only; std::process children also require wait() to be reaped.
pub(crate) fn kill_child_tree(child: tauri_plugin_shell::process::CommandChild) {
    let pid = child.pid();
    let _ = child.kill();
    #[cfg(windows)]
    {
        let _ = quiet_command("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .output();
    }
    #[cfg(not(windows))]
    {
        let _ = pid;
    }
}

#[tauri::command]
pub fn get_config(app: AppHandle) -> AppConfig {
    let mut cfg = config::load(&app);
    refresh_secret_presence(&app, &mut cfg);
    cfg
}

// Persistence clears credential flags; hydrate every config returned or emitted to a webview.
fn refresh_secret_presence(app: &AppHandle, config: &mut AppConfig) {
    refresh_secret_presence_with(config, keys::has_key);
    report_vanished_keys(app, config);
}

// Report unexpected credential loss without names, IDs, or secret values.
fn report_vanished_keys(app: &AppHandle, config: &AppConfig) {
    let current: Vec<(String, bool)> = config
        .targets
        .iter()
        .map(|t| (t.id.clone(), t.has_key))
        .collect();
    for _missing in keys::drain_vanished(&current) {
        log::error!("vault: a target key disappeared without an explicit deletion");
        app.state::<AppState>().telemetry.capture_error(
            crate::telemetry::AppError::new("vault_key_vanished", "config", false, None),
            None,
            true,
            "warning",
        );
    }
    keys::remember_present(
        config
            .targets
            .iter()
            .filter(|t| t.has_key)
            .map(|t| t.id.as_str()),
    );
}

fn refresh_secret_presence_with(config: &mut AppConfig, mut has_secret: impl FnMut(&str) -> bool) {
    for target in &mut config.targets {
        target.has_key = has_secret(&target.id);
    }
    // Profile switching uses these targets without another backend read.
    for profile in &mut config.profiles {
        for target in &mut profile.targets {
            target.has_key = has_secret(&target.id);
        }
    }
    for source in &mut config.settings.alert_sources {
        source.has_token = has_secret(&format!("alert_{}", source.id));
    }
    for source in &mut config.settings.chat_sources {
        source.has_send_token = has_secret(&format!("chat_send_{}", source.id));
    }
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: AppConfig) -> Result<AppConfig, String> {
    let mut config = config.validate_and_normalize()?;
    let disk_revision = config::load(&app).revision;
    if config.revision < disk_revision {
        return Err(Msg::ConfigSaveStaleRevision.now());
    }
    config.revision = disk_revision.saturating_add(1);
    config::save(&app, &config)?;
    crate::apply_native_language(&app, &config.settings.language);
    refresh_secret_presence(&app, &mut config);
    // Other webviews must update their save baseline without persisting this event again.
    let _ = app.emit("config://changed", &config);
    Ok(config)
}

fn secret_namespace_exists(config: &AppConfig, namespace: &str) -> bool {
    config.targets.iter().any(|target| target.id == namespace)
        || namespace.strip_prefix("alert_").is_some_and(|id| {
            config
                .settings
                .alert_sources
                .iter()
                .any(|source| source.id == id)
        })
        || namespace.strip_prefix("chat_send_").is_some_and(|id| {
            config
                .settings
                .chat_sources
                .iter()
                .any(|source| source.id == id)
        })
}

#[tauri::command]
pub fn set_key(app: AppHandle, target_id: String, key: String) -> Result<(), String> {
    config::validate_secret_namespace(&target_id)?;
    if !secret_namespace_exists(&config::load(&app), &target_id) {
        return Err(Msg::VaultNamespaceNotInConfig.now());
    }
    if key.len() > 8_192 {
        return Err(Msg::VaultSecretTooBig.now());
    }
    keys::set_key(&target_id, &key)
}

#[tauri::command]
pub fn clear_key(app: AppHandle, target_id: String) -> Result<(), String> {
    config::validate_secret_namespace(&target_id)?;
    if !secret_namespace_exists(&config::load(&app), &target_id) {
        return Err(Msg::VaultNamespaceNotInConfig.now());
    }
    keys::clear_key(&target_id)
}

#[tauri::command]
pub fn has_key(app: AppHandle, target_id: String) -> bool {
    config::validate_secret_namespace(&target_id).is_ok()
        && secret_namespace_exists(&config::load(&app), &target_id)
        && keys::has_key(&target_id)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EncoderInfo {
    pub kind: String,
    pub label: String,
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_sessions: Option<u32>,
}

// Automatic encoder priority: (kind, label, FFmpeg codec, typical session limit).
const HW_ENCODERS: [(&str, &str, &str, Option<u32>); 4] = [
    ("nvenc", "NVIDIA NVENC", "h264_nvenc", Some(8)),
    ("qsv", "Intel Quick Sync", "h264_qsv", None),
    ("amf", "AMD AMF", "h264_amf", None),
    (
        "videotoolbox",
        "Apple VideoToolbox",
        "h264_videotoolbox",
        None,
    ),
];

// Share concurrent probes from settings and stream startup.
static HW_PROBE: tokio::sync::OnceCell<[bool; 4]> = tokio::sync::OnceCell::const_new();
const ENCODER_CACHE_SCHEMA: u8 = 1;
const ENCODER_CACHE_TTL_SEC: u64 = 30 * 24 * 60 * 60;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncoderProbeCache {
    schema: u8,
    signature: String,
    saved_at: u64,
    available: [bool; 4],
}

fn epoch_sec() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn encoder_cache_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    Some(app.path().app_config_dir().ok()?.join("encoder-probe.json"))
}

fn cached_encoder_probe(app: &AppHandle, signature: &str) -> Option<[bool; 4]> {
    let path = encoder_cache_path(app)?;
    if std::fs::metadata(&path).ok()?.len() > 16 * 1024 {
        return None;
    }
    let cache: EncoderProbeCache = serde_json::from_slice(&std::fs::read(path).ok()?).ok()?;
    encoder_cache_is_valid(&cache, signature, epoch_sec()).then_some(cache.available)
}

fn encoder_cache_is_valid(cache: &EncoderProbeCache, signature: &str, now: u64) -> bool {
    cache.schema == ENCODER_CACHE_SCHEMA
        && cache.signature == signature
        && now.saturating_sub(cache.saved_at) <= ENCODER_CACHE_TTL_SEC
}

fn save_encoder_probe(app: &AppHandle, signature: String, available: [bool; 4]) {
    let Some(path) = encoder_cache_path(app) else {
        return;
    };
    let Some(dir) = path.parent() else { return };
    if std::fs::create_dir_all(dir).is_err() {
        return;
    }
    let cache = EncoderProbeCache {
        schema: ENCODER_CACHE_SCHEMA,
        signature,
        saved_at: epoch_sec(),
        available,
    };
    let Ok(bytes) = serde_json::to_vec(&cache) else {
        return;
    };
    let tmp = path.with_extension("json.tmp");
    if std::fs::write(&tmp, bytes).is_ok() {
        let _ = std::fs::remove_file(&path);
        if std::fs::rename(&tmp, &path).is_err() {
            let _ = std::fs::remove_file(tmp);
        }
    }
}

#[cfg(windows)]
fn gpu_driver_signature() -> String {
    // Hardware or driver changes invalidate the persisted probe result.
    let script = "Get-CimInstance Win32_VideoController | Sort-Object PNPDeviceID | ForEach-Object { '{0}:{1}:{2}' -f $_.PNPDeviceID,$_.DriverVersion,$_.VideoProcessor }";
    quiet_command("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned())
        .filter(|signature| !signature.is_empty())
        .unwrap_or_else(|| "gpu-desconhecida".into())
}

#[cfg(not(windows))]
fn gpu_driver_signature() -> String {
    // Include the OS version to invalidate VideoToolbox results after system updates.
    sysinfo::System::long_os_version().unwrap_or_else(|| "sistema-desconhecido".into())
}

async fn encoder_environment_signature(app: &AppHandle) -> String {
    let ffmpeg_version = async {
        match app.shell().sidecar("ffmpeg") {
            Ok(command) => command
                .args(["-version"])
                .output()
                .await
                .ok()
                .and_then(|output| {
                    String::from_utf8_lossy(&output.stdout)
                        .lines()
                        .next()
                        .map(str::to_owned)
                })
                .unwrap_or_else(|| "ffmpeg-desconhecido".into()),
            Err(_) => "ffmpeg-indisponível".into(),
        }
    };
    let (ffmpeg, gpu) = tokio::join!(
        ffmpeg_version,
        tauri::async_runtime::spawn_blocking(gpu_driver_signature)
    );
    let gpu = gpu.unwrap_or_else(|_| "gpu-desconhecida".into());
    format!(
        "{}|{}|{}|{}|{}",
        ENCODER_CACHE_SCHEMA,
        app.package_info().version,
        std::env::consts::OS,
        ffmpeg.trim(),
        gpu.trim()
    )
}

async fn probe_encoder(app: AppHandle, codec: &'static str) -> bool {
    let Ok(command) = app.shell().sidecar("ffmpeg") else {
        return false;
    };
    let result = command
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=1280x720:r=30",
            "-frames:v",
            "3",
            "-c:v",
            codec,
            "-f",
            "null",
            "-",
        ])
        .output()
        .await;
    matches!(result, Ok(ref output) if output.status.success())
}

// A listed codec may lack usable hardware; validate it with an actual encode.
async fn probe_hw_encoders(app: &AppHandle) -> [bool; 4] {
    let app = app.clone();
    *HW_PROBE
        .get_or_init(|| async move {
            let signature = encoder_environment_signature(&app).await;
            let app_for_cache = app.clone();
            let signature_for_cache = signature.clone();
            if let Ok(Some(cached)) = tauri::async_runtime::spawn_blocking(move || {
                cached_encoder_probe(&app_for_cache, &signature_for_cache)
            })
            .await
            {
                log::info!("hardware encoders: valid persisted cache");
                return cached;
            }

            let (nvenc, qsv, amf, videotoolbox) = tokio::join!(
                probe_encoder(app.clone(), HW_ENCODERS[0].2),
                probe_encoder(app.clone(), HW_ENCODERS[1].2),
                probe_encoder(app.clone(), HW_ENCODERS[2].2),
                probe_encoder(app.clone(), HW_ENCODERS[3].2),
            );
            let available = [nvenc, qsv, amf, videotoolbox];
            log::info!(
                "verified hardware encoders: {}",
                HW_ENCODERS
                    .iter()
                    .zip(available)
                    .filter(|(_, works)| *works)
                    .map(|((kind, ..), _)| *kind)
                    .collect::<Vec<_>>()
                    .join(", ")
            );
            let app_for_cache = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                save_encoder_probe(&app_for_cache, signature, available)
            })
            .await
            .ok();
            available
        })
        .await
}

#[tauri::command]
pub async fn detect_encoders(app: AppHandle) -> Vec<EncoderInfo> {
    let ok = probe_hw_encoders(&app).await;
    let mut out: Vec<EncoderInfo> = HW_ENCODERS
        .iter()
        .zip(ok)
        .map(|((kind, label, _, max_sessions), available)| EncoderInfo {
            kind: (*kind).into(),
            label: (*label).into(),
            available,
            max_sessions: *max_sessions,
        })
        .collect();
    out.push(EncoderInfo {
        kind: "software".into(),
        label: "Software (x264)".into(),
        available: true,
        max_sessions: Some(1),
    });
    out
}

struct UploadBody {
    deadline: std::time::Instant,
    sent: std::sync::Arc<std::sync::atomic::AtomicU64>,
}

impl std::io::Read for UploadBody {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if std::time::Instant::now() >= self.deadline {
            return Ok(0);
        }
        buf.fill(0);
        self.sent
            .fetch_add(buf.len() as u64, std::sync::atomic::Ordering::Relaxed);
        Ok(buf.len())
    }
}

#[tauri::command]
pub async fn test_upload() -> Result<f64, String> {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    tauri::async_runtime::spawn_blocking(|| {
        // Exclude TCP slow-start from the measured interval.
        const CONNS: usize = 6;
        let warmup = Duration::from_millis(1200);
        let measure = Duration::from_secs(3);

        let sent = Arc::new(AtomicU64::new(0));
        let deadline = Instant::now() + warmup + measure + Duration::from_millis(500);

        let handles: Vec<_> = (0..CONNS)
            .map(|_| {
                let sent = sent.clone();
                std::thread::spawn(move || {
                    while Instant::now() < deadline {
                        let agent = ureq::AgentBuilder::new()
                            .timeout_write(Duration::from_secs(20))
                            .timeout_read(Duration::from_secs(20))
                            .build();
                        let body = UploadBody {
                            deadline,
                            sent: sent.clone(),
                        };
                        let _ = agent.post("https://speed.cloudflare.com/__up").send(body);
                    }
                })
            })
            .collect();

        std::thread::sleep(warmup);
        let c0 = sent.load(Ordering::Relaxed);
        let t0 = Instant::now();
        std::thread::sleep(measure);
        let c1 = sent.load(Ordering::Relaxed);
        let secs = t0.elapsed().as_secs_f64();

        for h in handles {
            let _ = h.join();
        }

        let bytes = c1.saturating_sub(c0);
        if bytes == 0 || secs <= 0.0 {
            return Err(Msg::UploadMeasureFailed.now());
        }
        let mbps = (bytes as f64 * 8.0) / secs / 1_000_000.0;
        Ok((mbps * 10.0).round() / 10.0)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let m = app.autolaunch();
    if enabled {
        m.enable().map_err(|e| e.to_string())
    } else {
        m.disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn obs_autoconfigure(app: AppHandle) -> Result<(), String> {
    let cfg = get_config(app);
    // OBS expects the stream key separately from the server URL.
    let server = format!(
        "{}://{}:{}/{}",
        cfg.ingest.protocol, cfg.ingest.host, cfg.ingest.port, cfg.ingest.app
    );
    let key = cfg.ingest.key.clone();
    let password = cfg.settings.obs_password.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::obs::autoconfigure(OBS_WS_HOST, OBS_WS_PORT, &password, &server, &key)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

fn emit(app: &AppHandle, snap: &EngineSnapshot) {
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
}

pub(crate) fn notify(app: &AppHandle, title: &str, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
}

pub(crate) fn update_tray(app: &AppHandle, snap: &EngineSnapshot) {
    // Compare rendered titles so language changes update an otherwise unchanged state.
    let title = match snap.state.as_str() {
        "live" => Msg::WindowTitleLive,
        "starting" => Msg::WindowTitleStarting,
        "error" => Msg::WindowTitleError,
        _ => Msg::WindowTitleIdle,
    }
    .now();
    let title_changed = {
        let state = app.state::<AppState>();
        let mut eng = state.engine.lock().unwrap();
        if eng.win_title != title {
            eng.win_title.clone_from(&title);
            true
        } else {
            false
        }
    };
    if title_changed {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.set_title(&title);
        }
    }

    let Some(tray) = app.tray_by_id("corneta-tray") else {
        return;
    };
    let quality = quality_of(snap);
    let changed = {
        let state = app.state::<AppState>();
        let mut eng = state.engine.lock().unwrap();
        if eng.tray_quality != quality {
            eng.tray_quality = quality.to_string();
            true
        } else {
            false
        }
    };
    if changed {
        let bytes: &[u8] = match quality {
            "good" => include_bytes!("../icons/tray-good.png"),
            "warn" => include_bytes!("../icons/tray-warn.png"),
            "bad" => include_bytes!("../icons/tray-bad.png"),
            _ => include_bytes!("../icons/tray-idle.png"),
        };
        if let Ok(img) = tauri::image::Image::from_bytes(bytes) {
            let _ = tray.set_icon(Some(img));
        }
    }
    let _ = tray.set_tooltip(Some(tray_tooltip(snap, crate::i18n::locale())));
}

// Match exact paths: the compositor publisher must not count as OBS input.
// Byte counts reveal stalled input while MediaMTX still reports the publisher as ready.
fn mediamtx_paths(ingest_name: &str, program_name: &str) -> (bool, u64, bool) {
    let body = match ureq::get("http://127.0.0.1:9997/v3/paths/list")
        .timeout(std::time::Duration::from_millis(700))
        .call()
    {
        Ok(r) => r.into_string().unwrap_or_default(),
        Err(_) => return (false, 0, false),
    };
    parse_mediamtx_paths(&body, ingest_name, program_name)
}

fn mediamtx_ingest_ready(config: &crate::config::AppConfig) -> bool {
    let (ready, _, _) = mediamtx_paths(
        &engine::ingest_path_name(config),
        &engine::program_path_name(config),
    );
    ready
}

// Input readiness must not mark the session live when an output is still failing.
fn set_ingest_live(app: &AppHandle, live: bool) {
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    let Some(snap) = eng.snapshot.as_mut() else {
        return;
    };
    if snap.state == "stopped" || snap.ingest_live == live {
        return;
    }
    snap.ingest_live = live;
    let out = snap.clone();
    drop(eng);
    emit(app, &out);
}

fn mediamtx_config_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("mediamtx.yml"))
}

// Generated and custom slates share this namespace; only one file should exist.
fn brb_slate_file(app: &AppHandle) -> Option<std::path::PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    for entry in std::fs::read_dir(&dir).ok()?.flatten() {
        let p = entry.path();
        if is_brb_slate_path(&p) && p.is_file() {
            return Some(p);
        }
    }
    None
}

fn remove_brb_slate_files(dir: &std::path::Path) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if is_brb_slate_path(&p) && p.is_file() {
                let _ = std::fs::remove_file(&p);
            }
        }
    }
}

// Inspect headers only to choose real audio or silence without decoding the slate.
async fn brb_slate_has_audio(app: &AppHandle, path: &str) -> bool {
    let Ok(cmd) = app.shell().sidecar("ffmpeg") else {
        return false;
    };
    match cmd.args(["-hide_banner", "-i", path]).output().await {
        // An input-only probe exits with an error but still lists streams on stderr.
        Ok(o) => String::from_utf8_lossy(&o.stderr).contains("Audio:"),
        Err(_) => false,
    }
}

const GENERATED_SLATE_MARKER: &str = "generated-slate.version";

#[tauri::command]
pub fn brb_slate_needs_refresh(app: AppHandle, generation: String) -> bool {
    let Ok(dir) = app.path().app_config_dir() else {
        return true;
    };
    let marker = std::fs::read_to_string(dir.join(GENERATED_SLATE_MARKER)).unwrap_or_default();
    marker.trim() != generation || !dir.join("brb-slate.png").is_file()
}

#[tauri::command]
pub fn save_brb_slate(
    app: AppHandle,
    data: String,
    generation: Option<String>,
) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.trim())
        .map_err(|e| e.to_string())?;
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    remove_brb_slate_files(&dir);
    std::fs::write(dir.join("brb-slate.png"), bytes).map_err(|e| e.to_string())?;
    if let Some(generation) = generation {
        std::fs::write(dir.join(GENERATED_SLATE_MARKER), generation).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrbSlateInfo {
    kind: String,
    file_name: String,
}

/// None means cancellation; the frontend persists brb_slate_kind separately.
#[tauri::command]
pub async fn set_brb_slate(app: AppHandle) -> Result<Option<BrbSlateInfo>, String> {
    use tauri_plugin_dialog::DialogExt;
    let app2 = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app2.dialog()
            .file()
            // A single filter keeps both supported media types visible.
            .add_filter(
                Msg::BrbFilePickerFilter.now(),
                &[
                    "png", "jpg", "jpeg", "webp", "gif", "bmp", "mp4", "mov", "mkv", "webm", "m4v",
                ],
            )
            .blocking_pick_file()
    })
    .await
    .map_err(|e| format!("join: {e}"))?;
    let Some(file) = picked else {
        return Ok(None);
    };
    let src = file.into_path().map_err(|e| e.to_string())?;
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| !e.is_empty())
        .ok_or_else(|| Msg::BrbFileNoExtension.now())?;
    let file_name = src
        .file_name()
        .and_then(|n| n.to_str())
        .map(str::to_owned)
        .unwrap_or_else(|| Msg::BrbFileNameFallback.now());
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    remove_brb_slate_files(&dir);
    let _ = std::fs::remove_file(dir.join(GENERATED_SLATE_MARKER));
    let dest = dir.join(format!("brb-slate.{ext}"));
    std::fs::copy(&src, &dest).map_err(|e| Msg::BrbCopyFailed { e: &e.to_string() }.now())?;
    let kind = if brb_slate_is_video(&dest) {
        "video"
    } else {
        "image"
    }
    .to_string();
    Ok(Some(BrbSlateInfo { kind, file_name }))
}

/// Returns a base64 JPEG, or an empty string when no preview is available.
#[tauri::command]
pub async fn get_brb_slate_preview(app: AppHandle) -> Result<String, String> {
    use base64::Engine;
    let Some(src) = brb_slate_file(&app) else {
        return Ok(String::new());
    };
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let out = dir.join("brb-slate-preview.jpg");
    let args: Vec<String> = vec![
        "-y".into(),
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-i".into(),
        src.to_string_lossy().to_string(),
        "-frames:v".into(),
        "1".into(),
        "-vf".into(),
        "scale=480:-2".into(),
        "-q:v".into(),
        "5".into(),
        out.to_string_lossy().to_string(),
    ];
    let output = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Ok(String::new());
    }
    let bytes = std::fs::read(&out).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&out);
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
pub fn clear_brb_slate(app: AppHandle) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    remove_brb_slate_files(&dir);
    let _ = std::fs::remove_file(dir.join(GENERATED_SLATE_MARKER));
    Ok(())
}

/// Returns JPEG bytes; name identifies the temporary output file in the config directory.
pub(crate) async fn grab_frame_named(app: &AppHandle, name: &str) -> Result<Vec<u8>, String> {
    let cfg = get_config(app.clone());
    if !mediamtx_ingest_ready(&cfg) {
        return Err(Msg::FrameNoSignal.now());
    }
    let ingest = format!(
        "{}://{}:{}/{}/{}",
        cfg.ingest.protocol, cfg.ingest.host, cfg.ingest.port, cfg.ingest.app, cfg.ingest.key
    );
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let out = dir.join(name);
    let args: Vec<String> = vec![
        "-y".into(),
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-rw_timeout".into(),
        "5000000".into(),
        "-i".into(),
        ingest,
        "-frames:v".into(),
        "1".into(),
        "-q:v".into(),
        "3".into(),
        out.to_string_lossy().to_string(),
    ];
    let output = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(Msg::FrameGrabFailed.now());
    }
    std::fs::read(&out).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn capture_frame(app: AppHandle) -> Result<String, String> {
    use base64::Engine;
    let bytes = grab_frame_named(&app, "frame.jpg").await?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[derive(Clone, Copy, Debug)]
enum EngineFailure {
    IngestPortInUse,
    MediamtxExited,
    FfmpegUnavailable,
}

impl EngineFailure {
    fn code(self) -> &'static str {
        match self {
            Self::IngestPortInUse => "ingest_port_in_use",
            Self::MediamtxExited => "mediamtx_died",
            Self::FfmpegUnavailable => "ffmpeg_spawn_failed",
        }
    }

    fn stage(self) -> &'static str {
        match self {
            Self::IngestPortInUse | Self::MediamtxExited => "mediamtx",
            Self::FfmpegUnavailable => "encoder",
        }
    }

    fn message(self) -> Msg<'static> {
        match self {
            Self::IngestPortInUse => Msg::EngineIngestPortInUse,
            Self::MediamtxExited => Msg::EngineMediamtxDied,
            Self::FfmpegUnavailable => Msg::EngineMissingSidecar,
        }
    }
}

impl std::fmt::Display for EngineFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "code={} stage={}", self.code(), self.stage())
    }
}

// Preserve track_caller through capture_engine_error for distinct failure fingerprints.
#[track_caller]
fn set_engine_error(app: &AppHandle, failure: EngineFailure) {
    // Expected child exits during shutdown must not create terminal errors.
    if !app.state::<AppState>().engine.lock().unwrap().live {
        log::debug!("engine: ignoring {failure} after shutdown");
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
    log::error!("engine: error_id={error_id}");
    stop_engine_internal(app, Some(msg), "error");
}

fn set_target_reconnecting(app: &AppHandle, target_id: &str) {
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
fn reaffirm_auth_error(app: &AppHandle, target_id: &str) {
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
fn set_target_waiting(app: &AppHandle, target_id: &str) {
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

fn set_target_state(app: &AppHandle, target_id: &str, new_state: &str) {
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

// Limit orphan cleanup to sidecars under this installation, not unrelated user processes.
fn kill_orphan_sidecars() {
    let Some(dir) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
    else {
        return;
    };
    #[cfg(windows)]
    {
        // Escape single quotes inside the PowerShell string literal.
        let dir_s = dir.to_string_lossy().replace('\'', "''");
        let script = format!(
            "Get-CimInstance Win32_Process | Where-Object {{ $_.ExecutablePath -like '{dir_s}\\*' -and ($_.Name -like 'ffmpeg*' -or $_.Name -like 'mediamtx*') }} | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}"
        );
        let _ = quiet_command("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output();
    }
    #[cfg(not(windows))]
    {
        let base_dir = dir.to_string_lossy();
        let base_dir = base_dir.trim_end_matches('/');
        for base in ["ffmpeg", "mediamtx"] {
            let _ = quiet_command("pkill")
                .args(["-f", &format!("{base_dir}/{base}")])
                .output();
        }
    }
}

async fn detect_hw_encoder(app: &AppHandle) -> Option<String> {
    let ok = probe_hw_encoders(app).await;
    HW_ENCODERS
        .iter()
        .zip(ok)
        .find(|(_, works)| *works)
        .map(|((_, _, codec, _), _)| (*codec).to_string())
}

// Manual fallback may still lack a YouTube broadcast; notify instead of implying success.
fn yt_auto_fallback(app: &AppHandle, target_id: &str, generation: u64, err: &str) {
    let state = app.state::<AppState>();
    {
        let engine = state.engine.lock().unwrap();
        if !engine.live || engine.start_gen != generation {
            return;
        }
    }
    let error_id = capture_native_error(app, "youtube_auto_provision_failed", "oauth", true, None);
    log::warn!("YouTube auto-broadcast: error_id={error_id}");
    notify(
        app,
        &Msg::NotifyYoutubeAutoFailedTitle.now(),
        &Msg::NotifyYoutubeAutoFailedBody.now(),
    );
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    if !eng.live || eng.start_gen != generation {
        return;
    }
    if let Some(snap) = eng.snapshot.as_mut() {
        if let Some(st) = snap.targets.get_mut(target_id) {
            st.message = Some(format!("{} {err}", Msg::TargetYoutubeAutoFallback.now()));
        }
        let out = snap.clone();
        drop(eng);
        emit(app, &out);
    }
}

// Failed or cancelled setup must release the session and clean partially started sidecars.
struct StartGuard<'a> {
    app: &'a AppHandle,
    armed: bool,
}
impl Drop for StartGuard<'_> {
    fn drop(&mut self) {
        if self.armed {
            kill_engine(self.app);
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
            let existing_error_id = {
                let state = app.state::<AppState>();
                let engine = state.engine.lock().unwrap();
                (engine.telemetry_last_error_operation_id.as_deref() == Some(operation_id.as_str()))
                    .then(|| engine.telemetry_last_error_id.clone())
                    .flatten()
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
        eng.telemetry_last_error_operation_id = None;
        (eng.start_gen, eng.begin_pending_activity())
    };
    let mut start_guard = StartGuard {
        app: &app,
        armed: true,
    };

    let config = get_config(app.clone());
    let enabled: Vec<_> = config.targets.iter().filter(|t| t.enabled).collect();
    {
        let mut eng = state.engine.lock().unwrap();
        eng.target_platforms = enabled
            .iter()
            .map(|target| {
                (
                    target.id.clone(),
                    telemetry_platform(&target.platform_id).to_string(),
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

    // Refresh without delaying startup to reduce mid-stream Kick token expiry.
    crate::auth::warm_kick_session(&app);

    // PowerShell cleanup must stay off the event loop.
    let _ = tauri::async_runtime::spawn_blocking(kill_orphan_sidecars).await;

    let mut keymap: HashMap<String, String> = HashMap::new();
    for t in &enabled {
        if let Some(k) = keys::get_key(&t.id) {
            keymap.insert(t.id.clone(), k);
        }
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
    }
    emit(&app, &snap);

    // Provision only after local startup succeeds to avoid broadcasts orphaned by setup failure.
    let mut yt_override: Option<(String, String, String)> = None;
    if config.settings.youtube_auto_live && keys::has_key("youtube_refresh") {
        if let Some(yt) = enabled.iter().find(|t| t.platform_id == "youtube") {
            let yid = yt.id.clone();
            let title = {
                let t = config.settings.stream_title.trim();
                if t.is_empty() {
                    Msg::YoutubeDefaultBroadcastTitle.now()
                } else {
                    t.to_string()
                }
            };
            let app2 = app.clone();
            match tauri::async_runtime::spawn_blocking(move || {
                crate::auth::youtube_provision_broadcast(&app2, &title, my_gen)
            })
            .await
            {
                Ok(Ok((addr, key))) => {
                    log::info!("YouTube: broadcast provisioned automatically");
                    yt_override = Some((yid, addr, key));
                }
                Ok(Err(e)) => yt_auto_fallback(&app, &yid, my_gen, &e),
                Err(_) => yt_auto_fallback(&app, &yid, my_gen, &Msg::AuthYoutubeBadResponse.now()),
            }
        }
    }

    let guard_watchlist: Vec<String> = config
        .settings
        .guardian_watchlist
        .iter()
        .map(|t| t.trim().to_string())
        .filter(|t| t.chars().count() >= 3)
        .collect();
    let guard = config.settings.guardian_enabled && !guard_watchlist.is_empty();
    log::info!("engine: starting MediaMTX ingest and FFmpeg fan-out");

    let app_m = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(ev) = mtx_rx.recv().await {
            match ev {
                CommandEvent::Stdout(b) | CommandEvent::Stderr(b) => {
                    let raw = String::from_utf8_lossy(&b);
                    let line = raw.to_lowercase();
                    if line.contains("address already in use") {
                        set_engine_error(&app_m, EngineFailure::IngestPortInUse);
                    }
                    // Retain publisher lifecycle failures without frame-grab noise.
                    if line.contains("publish")
                        || line.contains("available")
                        || line.contains("online")
                        || line.contains("destroyed")
                        || line.contains("queue")
                        || line.contains("too slow")
                        || line.contains("timed out")
                        || (line.contains("err") && !line.contains("address already"))
                    {
                        log::warn!("mediamtx: {}", raw.trim());
                    }
                }
                // Unexpected exit is terminal even without a recognized error line.
                CommandEvent::Terminated(_) => {
                    set_engine_error(&app_m, EngineFailure::MediamtxExited);
                    break;
                }
                _ => {}
            }
        }
    });

    let run_sig = running.clone();
    let sig = has_signal.clone();
    let prog_sig = prog_ready.clone();
    let app_sig = app.clone();
    let ingest_name = engine::ingest_path_name(&config);
    let program_name = engine::program_path_name(&config);
    tauri::async_runtime::spawn_blocking(move || {
        // Two polls without byte changes count as stalled even if MediaMTX still reports ready.
        let mut last_bytes = 0u64;
        let mut stalls = 0u32;
        while run_sig.load(Ordering::Relaxed) {
            let (ready, bytes, prog) = mediamtx_paths(&ingest_name, &program_name);
            let flowing = bytes != last_bytes; // Counter resets also indicate activity.
            last_bytes = bytes;
            if ready && flowing {
                stalls = 0;
            } else {
                stalls = stalls.saturating_add(1);
            }
            let live = ready && stalls < 2;
            sig.store(live, Ordering::Relaxed);
            prog_sig.store(prog, Ordering::Relaxed);
            set_ingest_live(&app_sig, live);
            std::thread::sleep(std::time::Duration::from_millis(700));
        }
    });

    let brb_enabled = config.settings.brb_enabled;
    let auto_bitrate = config.settings.auto_bitrate;

    // A continuous program feed keeps output connections alive while the input is replaced.
    let compositor_on = brb_enabled || guard;
    let out_source = if compositor_on {
        engine::program_url(&config)
    } else {
        engine::ingest_url(&config)
    };
    log::info!(
        "engine: compositor={compositor_on} guardian={guard} output-source={}",
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
            return Err(START_CANCELLED.into());
        }
    }
    if compositor_on {
        let slate_file = brb_slate_file(&app);
        let slate_is_video = slate_file
            .as_deref()
            .map(brb_slate_is_video)
            .unwrap_or(false);
        // OCR requires decoded pixels; only the BRB-only path can use the copy-based splicer.
        let use_splicer = brb_enabled && !guard;
        let spec = engine::program_spec(&config, guard);
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
            delay_sec: if guard { engine::GUARD_DELAY_SEC } else { 0 },
            hw_codec: hw_codec.clone(),
            watchlist: if guard { guard_watchlist } else { Vec::new() },
            slate,
            force_slate: force_brb,
        };
        let (app_c, run_c, sig_c, slate_c) = (
            app.clone(),
            running.clone(),
            has_signal.clone(),
            slate_on.clone(),
        );
        if use_splicer {
            tauri::async_runtime::spawn(async move {
                crate::splicer::run(app_c, run_c, sig_c, slate_c, opts).await;
            });
        } else {
            tauri::async_runtime::spawn(async move {
                crate::compositor::run(app_c, run_c, sig_c, slate_c, opts).await;
            });
        }
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
        if let Some((yid, yurl, ykey)) = &yt_override {
            if target.id == *yid {
                target.ingest_url = yurl.clone();
                key = ykey.clone();
            }
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
        // Provisioned YouTube credentials override the vault and must survive retries.
        let has_yt_override = yt_override.as_ref().is_some_and(|(yid, _, _)| *yid == t.id);
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
        tauri::async_runtime::spawn(async move {
            // Preserve bitrate adaptation across FFmpeg restarts.
            let mut abr = engine::AutoBitrate::new(base_kbps, floor_kbps);
            // Notify once per degradation episode, not once per bitrate step.
            let mut drop_notified = false;
            let mut gpu_pipeline = crate::gpu_pipeline::enabled();
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
                    if !auth_flag.load(Ordering::Relaxed) && !has_yt_override {
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
                let mut args = if let Some(shared) = shared {
                    engine::ffmpeg_args_for_rendition_egress(&cfg, &target, &key, &shared.url)
                } else {
                    engine::ffmpeg_args_for_target(
                        &cfg,
                        &target,
                        &key,
                        Some(abr.current()),
                        &out_source,
                        auto_codec.as_deref(),
                    )
                };
                let accelerated = if gpu_pipeline {
                    crate::gpu_pipeline::candidate(&args)
                } else {
                    None
                };
                let used_gpu_pipeline = accelerated.is_some();
                if let Some(accelerated) = accelerated {
                    args = accelerated;
                }
                let spawned = app_t
                    .shell()
                    .sidecar("ffmpeg")
                    .and_then(|c| c.args(args).spawn());
                let (mut rx, child) = match spawned {
                    Ok(v) => v,
                    Err(e) => {
                        log::error!("FFmpeg sidecar unavailable: {e}");
                        set_engine_error(&app_t, EngineFailure::FfmpegUnavailable);
                        break;
                    }
                };
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
                        kill_child_tree(c);
                    }
                    break;
                }
                abr.on_reconnect();
                let mut rebitrate = false;
                let mut signal_lost = false;
                let mut paused_kill = false;
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
                                    // Adaptation updates the bitrate; restart FFmpeg to apply the selected value.
                                    if auto_bitrate && is_transcode {
                                        if let Some(speed) = parse_kv(&line, "speed=") {
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
                        }
                    }
                }
                let leftover = {
                    let st = app_t.state::<AppState>();
                    let removed = st.engine.lock().unwrap().ffmpegs.remove(&target_id);
                    removed
                };
                if rebitrate || signal_lost || paused_kill {
                    if let Some(c) = leftover {
                        kill_child_tree(c);
                    }
                }
                if !run_flag.load(Ordering::Relaxed) {
                    break;
                }
                if used_gpu_pipeline && !rebitrate && !signal_lost && !paused_kill {
                    gpu_pipeline = false;
                }
                if pause_flag.load(Ordering::Relaxed) {
                    continue;
                }
                // Bitrate changes do not need the network-reconnect backoff.
                if rebitrate {
                    continue;
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
    let obs_pw = config.settings.obs_password.clone();
    tauri::async_runtime::spawn_blocking(move || {
        while run_o.load(Ordering::Relaxed) {
            crate::obs::poll_stats(OBS_WS_HOST, OBS_WS_PORT, &obs_pw, &run_o, |stats| {
                update_obs_stats(&app_o, stats);
            });
            for _ in 0..25 {
                if !run_o.load(Ordering::Relaxed) {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
        }
    });

    start_guard.armed = false;
    Ok(())
}

// Blocking process cleanup stays off the event loop; kill_engine publishes stopped first.
#[tauri::command]
pub async fn stop_engine(app: AppHandle, operation_id: Option<String>) -> Result<(), String> {
    let (youtube_generation, youtube_activity) = {
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
    // YouTube autostop is disabled for reconnects; failed cleanup stays recoverable.
    let app3 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _activity = youtube_activity;
        if crate::auth::youtube_complete_active(&app3, youtube_generation).is_err() {
            log::warn!("YouTube auto-broadcast: cleanup_pending");
            notify(
                &app3,
                &Msg::NotifyYoutubeCleanupFailedTitle.now(),
                &Msg::NotifyYoutubeCleanupFailedBody.now(),
            );
        }
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
            kill_child_tree(child);
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

/// Manual BRB requires a compositor started with BRB or the Privacy Guard enabled.
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

// BRB output still transmits metrics, but its visible state must remain distinct from live.
fn update_target_metrics(
    app: &AppHandle,
    target_id: &str,
    line: &str,
    has_signal: bool,
    brb_on: bool,
) {
    let is_stats = line.contains("frame=") || line.contains("bitrate=");
    const ERR_KEYS: [&str; 8] = [
        "error",
        "failed",
        "connection refused",
        "broken pipe",
        "unable to",
        "connection reset",
        "i/o error",
        "end of file",
    ];
    let low = if is_stats {
        String::new()
    } else {
        line.to_lowercase()
    };
    let is_error = !is_stats && ERR_KEYS.iter().any(|k| low.contains(k));
    if !is_stats && !is_error {
        return;
    }

    let fps = parse_kv(line, "fps=").map(|v| v as u32);
    let bitrate = parse_kv(line, "bitrate=").map(|v| v as u32);
    let dropped = parse_kv(line, "drop=").map(|v| v as u32);

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

    if is_stats {
        if was_starting {
            snap.started_at = Some(started);
        }
        st.state = if brb_on { "brb" } else { "live" }.into();
        st.message = None;
        st.uptime_sec = (now_ms().saturating_sub(started) as f64) / 1000.0;
        if let Some(f) = fps {
            st.fps = f;
        }
        if let Some(b) = bitrate {
            st.bitrate_kbps = b;
        }
        if let Some(d) = dropped {
            st.dropped_frames = d;
        }
        snap.state = "live".into();
    } else if !has_signal {
        // Missing input is not an output failure; preserve the stronger signal-lost state.
        if st.state != "signal-lost" {
            st.state = "waiting".into();
            st.message = None;
        }
    } else {
        let (estate, msg) = friendly_error(&low, crate::i18n::locale());
        st.state = estate.into();
        if estate == "error" {
            err_msg = Some(msg.clone());
            if let Some(f) = &auth_flag {
                f.store(true, std::sync::atomic::Ordering::Relaxed);
            }
        }
        st.message = Some(msg);
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

fn read_gpu(running: &std::sync::atomic::AtomicBool) -> Option<f64> {
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

fn update_usage(app: &AppHandle, usage: crate::resources::ResourceUsage) {
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
fn update_obs_stats(app: &AppHandle, stats: engine::ObsStats) {
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    if let Some(snap) = eng.snapshot.as_mut() {
        if snap.state != "stopped" {
            snap.obs = Some(stats);
        }
    }
}

pub fn kill_engine(app: &AppHandle) {
    stop_engine_internal(app, None, "user");
}

pub fn kill_engine_for_shutdown(app: &AppHandle) {
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
                s
            }
            None => EngineSnapshot::stopped(),
        };
        out.operation_id = operation_id.clone();
        eng.snapshot = Some(out.clone());
        eng.paused.clear();
        eng.auth_error.clear();
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
        kill_child_tree(child);
    }
    session::set_chat_recording(false);
    if let Some(path) = session_path {
        session::end_session(&path);
    }
}

// Missing configured directories stay unavailable rather than being silently recreated.
fn recording_dir(app: &AppHandle) -> Option<std::path::PathBuf> {
    let cfg = config::load(app);
    recorder::resolve_dir(app, &cfg.settings.record_video_dir)
}

#[tauri::command]
pub async fn list_sessions(app: AppHandle) -> Vec<session::SessionMeta> {
    let Ok(permit) = REPORT_READS.acquire().await else {
        return vec![];
    };
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        let dir = recording_dir(&app);
        session::list_sessions(&app, dir.as_deref())
    })
    .await
    .unwrap_or_default()
}

static REPORT_READS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(2);

#[tauri::command]
pub async fn read_session(app: AppHandle, id: String) -> Result<String, String> {
    let permit = REPORT_READS
        .acquire()
        .await
        .map_err(|_| Msg::SessionNotFound.now())?;
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        session::read_session(&app, &id).ok_or_else(|| Msg::SessionNotFound.now())
    })
    .await
    .map_err(|_| Msg::SessionNotFound.now())?
}

/// Missing chat recordings return an empty string, not a report-loading error.
#[tauri::command]
pub async fn read_session_chat(app: AppHandle, id: String) -> String {
    let Ok(permit) = REPORT_READS.acquire().await else {
        return String::new();
    };
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        session::read_chat(&app, &id).unwrap_or_default()
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
pub async fn read_session_bytes(
    app: AppHandle,
    id: String,
    chat: bool,
) -> Result<tauri::ipc::Response, String> {
    let permit = REPORT_READS
        .acquire()
        .await
        .map_err(|_| Msg::SessionNotFound.now())?;
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        session::read_bytes(&app, &id, chat)
    })
    .await
    .map_err(|_| Msg::SessionNotFound.now())?
    .ok_or_else(|| Msg::SessionNotFound.now())?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn delete_session(app: AppHandle, id: String) -> Result<(), String> {
    let dir = recording_dir(&app);
    session::delete_session(&app, &id, dir.as_deref())
}

// A real write probe is required; permission attributes alone are unreliable on Windows.
#[tauri::command]
pub fn record_check_dir(app: AppHandle, dir: String) -> recorder::DirCheck {
    let path = if dir.trim().is_empty() {
        session::sessions_dir(&app).unwrap_or_default()
    } else {
        std::path::PathBuf::from(dir.trim())
    };
    recorder::check_dir(&path)
}

/// None means the folder picker was cancelled or could not return a path.
#[tauri::command]
pub async fn record_pick_dir(app: AppHandle) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |p| {
        let _ = tx.send(p);
    });
    rx.await
        .ok()
        .flatten()
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().to_string())
}

/// Resume segment numbering within the current session without overwriting prior recordings.
#[tauri::command]
pub fn record_retry(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let (launch, running, activity) = {
        let eng = state.engine.lock().unwrap();
        if !eng.live {
            return Err(Msg::RecordRetryNotLive.now());
        }
        // Duplicate recorders would share output paths and overwrite a child handle.
        if eng.ffmpegs.contains_key(recorder::RECORDER_KEY) {
            return Err(Msg::RecordRetryAlreadyRunning.now());
        }
        (
            eng.recorder_launch.clone(),
            eng.running.clone(),
            eng.begin_pending_activity(),
        )
    };
    let launch = launch.ok_or_else(|| Msg::RecordRetryUnavailable.now())?;
    log::info!("recording: manual retry requested");
    tauri::async_runtime::spawn(recorder::run(
        app,
        launch.source,
        launch.dir,
        launch.session_path,
        launch.id,
        running,
        activity,
    ));
    Ok(())
}

#[tauri::command]
pub async fn record_test(app: AppHandle, dir: String) -> Result<String, String> {
    let path = if dir.trim().is_empty() {
        session::sessions_dir(&app).ok_or_else(|| Msg::SessionDirUnavailable.now())?
    } else {
        std::path::PathBuf::from(dir.trim())
    };
    let check = recorder::check_dir(&path);
    if !check.ok {
        return Err(Msg::RecordDirUnusable.now());
    }
    let file = recorder::test_record(&app, &path).await?;
    allow_asset(&app, &file);
    Ok(file)
}

/// Grant access to one recording, not its directory; the frontend uses convertFileSrc for its URL.
#[tauri::command]
pub fn record_allow_file(app: AppHandle, path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    // Accept recognized recording filenames, including the recording-test file.
    let named = p
        .file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| session::parse_video_name(n).is_some() || n == "corneta-teste.mp4");
    if !named || !p.is_file() {
        return Err(Msg::SessionNotFound.now());
    }
    allow_asset(&app, &path);
    Ok(())
}

fn allow_asset(app: &AppHandle, path: &str) {
    app.asset_protocol_scope().allow_file(path).ok();
}

/// Persist the manual replay offset in milliseconds, bounded to +/-30 seconds.
#[tauri::command]
pub fn set_session_offset(app: AppHandle, id: String, ms: i64) -> Result<(), String> {
    if !session::valid_session_id(&id) {
        return Err(Msg::SessionInvalidId.now());
    }
    let dir = session::sessions_dir(&app).ok_or_else(|| Msg::SessionDirUnavailable.now())?;
    session::record_offset(&dir.join(format!("{id}.ndjson")), ms.clamp(-30_000, 30_000));
    Ok(())
}

/// Delete recordings only; preserve the report and chat.
#[tauri::command]
pub fn delete_session_recordings(app: AppHandle, id: String) -> Result<(), String> {
    let dir = recording_dir(&app);
    session::delete_recordings(&app, &id, dir.as_deref())
}

/// t is the replayed timestamp, not the wall-clock time when the marker is created.
#[tauri::command]
pub fn add_session_marker(app: AppHandle, id: String, t: u64, label: String) -> Result<(), String> {
    if !session::valid_session_id(&id) {
        return Err(Msg::SessionInvalidId.now());
    }
    let dir = session::sessions_dir(&app).ok_or_else(|| Msg::SessionDirUnavailable.now())?;
    let clean: String = label.trim().chars().take(80).collect();
    session::record_marker_at(&dir.join(format!("{id}.ndjson")), t, &clean);
    Ok(())
}

/// Copy the recorded bitstream without re-encoding; None means the save dialog was cancelled.
#[tauri::command]
pub async fn export_clip(
    app: AppHandle,
    path: String,
    start_ms: u64,
    end_ms: u64,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let src = std::path::PathBuf::from(&path);
    let named = src
        .file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| session::parse_video_name(n).is_some());
    if !named || !src.is_file() || end_ms <= start_ms {
        return Err(Msg::SessionNotFound.now());
    }
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("MP4", &["mp4"])
        .set_file_name("corneta-clipe.mp4")
        .save_file(move |p| {
            let _ = tx.send(p);
        });
    let Some(dest) = rx.await.ok().flatten().and_then(|p| p.into_path().ok()) else {
        return Ok(None);
    };
    let args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        // Input-side seeking is faster; stream-copy cuts are keyframe-aligned either way.
        "-ss".into(),
        format!("{:.3}", start_ms as f64 / 1000.0),
        "-to".into(),
        format!("{:.3}", end_ms as f64 / 1000.0),
        "-i".into(),
        src.to_string_lossy().to_string(),
        "-c".into(),
        "copy".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-y".into(),
        dest.to_string_lossy().to_string(),
    ];
    let out = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(Some(dest.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn open_recording_folder(app: AppHandle) -> Result<(), String> {
    let dir = recording_dir(&app)
        .or_else(|| session::sessions_dir(&app))
        .ok_or_else(|| Msg::SessionDirUnavailable.now())?;
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer").arg(&dir).spawn();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("xdg-open").arg(&dir).spawn();
    }
    Ok(())
}

#[tauri::command]
pub fn open_sessions_dir(app: AppHandle) -> Result<(), String> {
    let dir = session::sessions_dir(&app).ok_or_else(|| Msg::SessionDirUnavailable.now())?;
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer").arg(&dir).spawn();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("xdg-open").arg(&dir).spawn();
    }
    Ok(())
}

// Enforce HTTPS here rather than exposing unrestricted shell URLs to webviews.
#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    if url.len() > 2_048 || !url.starts_with("https://") || url.chars().any(char::is_whitespace) {
        return Err(Msg::OpenExternalRefused.now());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| Msg::OpenExternalFailed { e: &e.to_string() }.now())
}

#[tauri::command]
pub fn chat_start(app: AppHandle) {
    chat::start_chat(&app);
    // Main and popout webviews maintain separate local chat state.
    let _ = app.emit("chat://running", true);
}
#[tauri::command]
pub fn chat_stop(app: AppHandle) {
    chat::stop_chat(&app);
    let _ = app.emit("chat://running", false);
}

/// Initial state for a new webview; chat://running carries subsequent changes.
#[tauri::command]
pub fn chat_running(app: AppHandle) -> bool {
    let st = app.state::<AppState>();
    let running = st.chat.lock().unwrap().running.clone();
    running.load(std::sync::atomic::Ordering::Relaxed)
}

// Provider HTTP requests must not block the event loop.
#[tauri::command]
pub async fn chat_send(
    app: AppHandle,
    text: String,
    sources: Option<Vec<String>>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || chat::send_message(&app, &text, sources))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn alerts_start(app: AppHandle) {
    crate::alerts::start_alerts(&app);
}

#[tauri::command]
pub fn alerts_stop(app: AppHandle) {
    crate::alerts::stop_alerts(&app);
}

// Webview creation must be async to avoid waiting on the Windows main thread from itself.
#[tauri::command]
pub async fn open_chat_window(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("chat") {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(&app, "chat", tauri::WebviewUrl::App("chat.html".into()))
        .title(Msg::WindowChatPopoutTitle.now())
        .inner_size(380.0, 600.0)
        .min_inner_size(300.0, 360.0)
        .resizable(true)
        .always_on_top(true)
        .decorations(false)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn obs_set_stream(app: AppHandle, start: bool) -> Result<(), String> {
    let password = get_config(app.clone()).settings.obs_password;
    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::obs::set_stream(OBS_WS_HOST, OBS_WS_PORT, &password, start)
    })
    .await;
    match result {
        Ok(Ok(())) => Ok(()),
        Ok(Err(error)) => {
            capture_native_error(
                &app,
                if start {
                    "obs_start_failed"
                } else {
                    "obs_stop_failed"
                },
                "obs",
                true,
                Some(error.clone()),
            );
            Err(error)
        }
        Err(error) => {
            let error = format!("join: {error}");
            capture_native_error(
                &app,
                "obs_stream_task_failed",
                "obs",
                true,
                Some(error.clone()),
            );
            Err(error)
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

#[tauri::command]
pub async fn youtube_key_check(key: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || crate::chat::check_youtube_key(&key))
        .await
        .map_err(|e| format!("join: {e}"))?
}

/// Probe once without starting the persistent alert connection.
#[tauri::command]
pub async fn alert_test(app: AppHandle, source_id: String) -> Result<String, String> {
    let cfg = get_config(app);
    let src = cfg
        .settings
        .alert_sources
        .into_iter()
        .find(|s| s.id == source_id)
        .ok_or_else(|| Msg::AlertSourceNotFound.now())?;
    let token = crate::keys::get_key(&format!("alert_{}", src.id))
        .filter(|t| !t.trim().is_empty())
        .ok_or_else(|| Msg::AlertSourcePasteTokenFirst.now())?;
    let kind = src.kind;
    tauri::async_runtime::spawn_blocking(move || crate::alerts::probe_alert(&kind, &token))
        .await
        .map_err(|e| format!("join: {e}"))?
        .map(|_| Msg::AlertSourceTokenOk.now())
}

#[tauri::command]
pub fn open_logs_dir(app: AppHandle) -> Result<(), String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    let _ = std::fs::create_dir_all(&dir);
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer").arg(&dir).spawn();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("xdg-open").arg(&dir).spawn();
    }
    Ok(())
}

/// Export allowlisted support data without raw logs, free-text identifiers, or credentials.
#[tauri::command]
pub fn export_diagnostics(
    app: AppHandle,
    include_telemetry_id: Option<bool>,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    let cfg = config::load(&app);
    let telemetry_state = &app.state::<AppState>().telemetry;
    let status = telemetry_state.status();
    let telemetry_id = if include_telemetry_id.unwrap_or(false) {
        status.installation_id.clone()
    } else {
        status
            .installation_id
            .as_ref()
            .map(|_| "<omitted; include only with explicit consent>".into())
    };
    let telemetry_summary = serde_json::json!({
        "schemaVersion": status.schema_version,
        "noticeVersion": status.notice_version,
        "usage": status.usage,
        "crashReports": status.crash_reports,
        "installationId": telemetry_id,
        "buildSha": option_env!("CORNETA_BUILD_SHA").unwrap_or("dev"),
        "structuredEvents": telemetry_state.diagnostic_events(),
    });
    let report = build_diagnostic_report(
        &app.package_info().version.to_string(),
        std::env::consts::OS,
        std::env::consts::ARCH,
        &cfg,
        &telemetry_summary,
    )?;
    let Some(path) = app
        .dialog()
        .file()
        .add_filter(Msg::DiagFilePickerFilter.now(), &["txt"])
        .set_file_name("corneta-diagnostico.txt")
        .blocking_save_file()
    else {
        let mut properties = serde_json::Map::new();
        properties.insert(
            "outcome".into(),
            serde_json::Value::String("cancelled".into()),
        );
        let _ = telemetry_state.capture("diagnostics_exported", properties);
        return Ok(false);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    if let Err(error) = std::fs::write(path, report) {
        let mut properties = serde_json::Map::new();
        properties.insert("outcome".into(), serde_json::Value::String("failed".into()));
        let _ = telemetry_state.capture("diagnostics_exported", properties);
        capture_native_error(
            &app,
            "diagnostics_write_failed",
            "diagnostics",
            true,
            Some(error.to_string()),
        );
        return Err(error.to_string());
    }
    let mut properties = serde_json::Map::new();
    properties.insert("outcome".into(), serde_json::Value::String("saved".into()));
    let _ = telemetry_state.capture("diagnostics_exported", properties);
    Ok(true)
}

#[tauri::command]
pub fn register_shortcut(
    app: AppHandle,
    shortcut: String,
) -> Result<(), crate::shortcut::ShortcutError> {
    crate::shortcut::register(&app, &shortcut)
}

#[tauri::command]
pub async fn obs_check(app: AppHandle) -> Result<crate::obs::ObsCheck, String> {
    let cfg = get_config(app.clone());
    let server = format!(
        "{}://{}:{}/{}",
        cfg.ingest.protocol, cfg.ingest.host, cfg.ingest.port, cfg.ingest.app
    );
    let password = cfg.settings.obs_password;
    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::obs::check(OBS_WS_HOST, OBS_WS_PORT, &password, &server)
    })
    .await;
    let check = match result {
        Ok(check) => check,
        Err(error) => {
            let error = format!("join: {error}");
            capture_native_error(
                &app,
                "obs_check_task_failed",
                "obs",
                true,
                Some(error.clone()),
            );
            return Err(error);
        }
    };

    Ok(check)
}

const MESA_OBS_SOURCE: &str = "Corneta · Mesa";

#[tauri::command]
pub async fn mesa_start_server(
    state: State<'_, AppState>,
) -> Result<crate::studio::MesaServerInfo, String> {
    crate::studio::start(&state.studio).await
}

#[tauri::command]
pub fn mesa_stop_server(state: State<'_, AppState>) {
    crate::studio::stop(&state.studio);
}

#[tauri::command]
pub async fn mesa_obs_add_source(
    app: AppHandle,
    url: String,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let password = get_config(app).settings.obs_password;
    tauri::async_runtime::spawn_blocking(move || {
        crate::obs::add_or_update_browser_source(
            OBS_WS_HOST,
            OBS_WS_PORT,
            &password,
            MESA_OBS_SOURCE,
            &url,
            width,
            height,
        )
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

#[tauri::command]
pub async fn mesa_obs_remove_source(app: AppHandle) -> Result<(), String> {
    let password = get_config(app).settings.obs_password;
    tauri::async_runtime::spawn_blocking(move || {
        crate::obs::remove_input(OBS_WS_HOST, OBS_WS_PORT, &password, MESA_OBS_SOURCE)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

// Persisted OBS input name; changing it would create a duplicate source.
const OVERLAY_OBS_SOURCE: &str = "Corneta · Alertas";

#[tauri::command]
pub async fn overlay_start(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<crate::overlay::OverlayInfo, String> {
    let port = get_config(app).settings.overlay_port as u16;
    crate::overlay::start(&state.overlay, port)
        .await
        .map_err(|error| error.message(crate::i18n::locale()))
}

#[tauri::command]
pub fn overlay_stop(state: State<'_, AppState>) {
    crate::overlay::stop(&state.overlay);
}

#[tauri::command]
pub fn overlay_status(state: State<'_, AppState>) -> Option<crate::overlay::OverlayInfo> {
    crate::overlay::info(&state.overlay)
}

// Preview alerts bypass session recording and the main alert panel.
#[tauri::command]
pub fn overlay_test(state: State<'_, AppState>) {
    let demo = chat::Alert {
        id: "overlay-test".into(),
        platform: "twitch".into(),
        source: Msg::OverlayDemoSource.now(),
        kind: "subgift".into(),
        user: "fulano_dtal".into(),
        amount: Some(5.0),
        currency: None,
        tier: None,
        message: Some(Msg::OverlayDemoAlertMessage.now()),
        fragments: Vec::new(),
        ts: 0,
    };
    crate::overlay::push(&state.overlay, &demo);
}

#[tauri::command]
pub fn overlay_chat_test(state: State<'_, AppState>) {
    let demo = chat::ChatMessage {
        id: "overlay-chat-test".into(),
        platform: "twitch".into(),
        source: Msg::OverlayDemoSource.now(),
        author: "fulano_dtal".into(),
        author_id: None,
        native_id: None,
        color: Some("#ffb323".into()),
        text: Msg::OverlayDemoChatText.now(),
        fragments: vec![
            chat::ChatFragment {
                kind: "text".into(),
                text: Some(Msg::OverlayDemoChatTextFragment.now()),
                url: None,
            },
            chat::ChatFragment {
                kind: "emote".into(),
                text: Some("Kappa".into()),
                url: Some("https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0".into()),
            },
        ],
        badges: vec![chat::ChatBadge {
            label: "sub".into(),
            kind: "subscriber".into(),
        }],
        ts: 0,
    };
    crate::overlay::push_chat(&state.overlay, &demo);
}

#[tauri::command]
pub async fn overlay_obs_add_source(app: AppHandle, url: String) -> Result<(), String> {
    let password = get_config(app).settings.obs_password;
    tauri::async_runtime::spawn_blocking(move || {
        crate::obs::add_or_update_browser_source(
            OBS_WS_HOST,
            OBS_WS_PORT,
            &password,
            OVERLAY_OBS_SOURCE,
            &url,
            1920,
            1080,
        )
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

// Keep OS settings destinations allowlisted outside the webview.
#[tauri::command]
pub fn open_privacy_settings(app: AppHandle, which: String) -> Result<(), String> {
    let uri = match which.as_str() {
        "camera" => "ms-settings:privacy-webcam",
        "microphone" => "ms-settings:privacy-microphone",
        _ => return Err(Msg::PrivacySettingsUnknown.now()),
    };
    #[allow(deprecated)]
    app.shell().open(uri, None).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mark_moment(app: AppHandle, label: Option<String>) -> Result<(), String> {
    let st = app.state::<AppState>();
    let path = st.engine.lock().unwrap().session_path.clone();
    match path {
        Some(p) => {
            let fallback = Msg::SessionDefaultMarkerLabel.now();
            session::record_marker(&p, label.as_deref().unwrap_or(&fallback));
            Ok(())
        }
        None => Err(Msg::SessionNotRecording.now()),
    }
}

/// Write frontend-rendered UTF-8 unchanged, including any BOM; false means cancellation.
#[tauri::command]
pub fn save_text_file(
    app: AppHandle,
    name: String,
    label: String,
    ext: String,
    content: String,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    match app
        .dialog()
        .file()
        .add_filter(&label, &[ext.as_str()])
        .set_file_name(&name)
        .blocking_save_file()
    {
        Some(p) => {
            let pb = p.into_path().map_err(|e| e.to_string())?;
            std::fs::write(pb, content).map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => Ok(false),
    }
}

/// Export profiles and settings without stored credentials.
#[tauri::command]
pub fn export_config(app: AppHandle) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    let mut cfg = config::load(&app);
    cfg.settings.obs_password = String::new();
    cfg.settings.youtube_api_key = String::new();
    let json = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    match app
        .dialog()
        .file()
        .add_filter(Msg::ConfigFilePickerFilter.now(), &["json"])
        .set_file_name("corneta-config.json")
        .blocking_save_file()
    {
        Some(p) => {
            let pb = p.into_path().map_err(|e| e.to_string())?;
            std::fs::write(pb, json).map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => Ok(false),
    }
}

#[tauri::command]
pub fn import_config(app: AppHandle) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(p) = app
        .dialog()
        .file()
        .add_filter(Msg::ConfigFilePickerFilter.now(), &["json"])
        .blocking_pick_file()
    else {
        return Ok(false);
    };
    let pb = p.into_path().map_err(|e| e.to_string())?;
    let content = config::read_config_file(&pb).map_err(|e| e.to_string())?;
    let cfg: AppConfig = serde_json::from_str(&content)
        .map_err(|e| Msg::ConfigImportInvalidJson { e: &e.to_string() }.now())?;
    let mut cfg = cfg.validate_and_normalize()?;
    // Preserve the current configuration before replacing profiles and settings.
    if let Ok(dir) = app.path().app_config_dir() {
        let current = config::load(&app);
        if let Ok(json) = serde_json::to_string_pretty(&current) {
            let _ = std::fs::write(dir.join("corneta-backup-antes-do-import.json"), json);
        }
    }
    cfg.revision = config::load(&app).revision.saturating_add(1);
    config::save(&app, &cfg)?;
    crate::apply_native_language(&app, &cfg.settings.language);
    refresh_secret_presence(&app, &mut cfg);
    let _ = app.emit("config://changed", &cfg);
    Ok(true)
}

#[cfg(test)]
mod engine_failure_tests {
    use super::EngineFailure;
    use crate::i18n::{Locale, Msg};

    #[test]
    fn engine_failures_keep_stable_diagnostics_and_localized_ui_messages() {
        for (failure, code, stage, message) in [
            (
                EngineFailure::IngestPortInUse,
                "ingest_port_in_use",
                "mediamtx",
                Msg::EngineIngestPortInUse,
            ),
            (
                EngineFailure::MediamtxExited,
                "mediamtx_died",
                "mediamtx",
                Msg::EngineMediamtxDied,
            ),
            (
                EngineFailure::FfmpegUnavailable,
                "ffmpeg_spawn_failed",
                "encoder",
                Msg::EngineMissingSidecar,
            ),
        ] {
            assert_eq!(failure.code(), code);
            assert_eq!(failure.stage(), stage);
            let diagnostic = format!("engine: {failure}");
            assert_eq!(diagnostic, format!("engine: code={code} stage={stage}"));
            for locale in [Locale::PtBr, Locale::En] {
                let text = failure.message().text(locale);
                assert_eq!(text, message.text(locale));
                assert!(!diagnostic.contains(&text));
            }
        }
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

#[cfg(test)]
mod secret_presence_tests {
    use super::refresh_secret_presence_with;
    use crate::config::{AlertSource, AppConfig, ChatSource, Profile, Target, TargetEncoding};
    use std::collections::HashSet;

    fn target(id: &str, has_key: bool) -> Target {
        Target {
            id: id.into(),
            platform_id: "custom".into(),
            name: id.into(),
            enabled: true,
            protocol: "rtmp".into(),
            ingest_url: "rtmp://example.invalid/live".into(),
            has_key,
            encoding: TargetEncoding {
                action: "copy".into(),
                preset: None,
                encoder: "auto".into(),
                hybrid_override: None,
                reframe: None,
            },
        }
    }

    #[test]
    fn rehydrates_every_secret_indicator_for_webviews() {
        let mut config = AppConfig {
            targets: vec![target("target_saved", false), target("target_empty", true)],
            ..AppConfig::default()
        };
        config.profiles.push(Profile {
            id: "profile_1".into(),
            name: "Evento".into(),
            mode: "hybrid".into(),
            targets: vec![
                target("profile_target_saved", false),
                target("profile_target_empty", true),
            ],
        });
        config.settings.alert_sources.push(AlertSource {
            id: "alerts_saved".into(),
            kind: "streamlabs".into(),
            name: "Alertas".into(),
            enabled: true,
            has_token: true,
        });
        config.settings.chat_sources.push(ChatSource {
            id: "chat_saved".into(),
            platform: "twitch".into(),
            value: "channel".into(),
            name: "Chat".into(),
            enabled: true,
            has_send_token: true,
        });

        let mut config = config.validate_and_normalize().unwrap();
        assert!(config.targets.iter().all(|target| !target.has_key));
        assert!(config.profiles[0]
            .targets
            .iter()
            .all(|target| !target.has_key));
        assert!(!config.settings.alert_sources[0].has_token);
        assert!(!config.settings.chat_sources[0].has_send_token);

        let present = HashSet::from([
            "target_saved",
            "profile_target_saved",
            "alert_alerts_saved",
            "chat_send_chat_saved",
        ]);
        refresh_secret_presence_with(&mut config, |namespace| present.contains(namespace));

        assert!(config.targets[0].has_key);
        assert!(!config.targets[1].has_key);
        assert!(config.profiles[0].targets[0].has_key);
        assert!(!config.profiles[0].targets[1].has_key);
        assert!(config.settings.alert_sources[0].has_token);
        assert!(config.settings.chat_sources[0].has_send_token);
    }
}

#[cfg(test)]
mod encoder_cache_tests {
    use super::{
        encoder_cache_is_valid, EncoderProbeCache, ENCODER_CACHE_SCHEMA, ENCODER_CACHE_TTL_SEC,
    };

    fn cache(saved_at: u64) -> EncoderProbeCache {
        EncoderProbeCache {
            schema: ENCODER_CACHE_SCHEMA,
            signature: "app|ffmpeg|gpu|driver".into(),
            saved_at,
            available: [true, false, false, false],
        }
    }

    #[test]
    fn encoder_cache_requires_matching_environment() {
        let cache = cache(100);
        assert!(encoder_cache_is_valid(&cache, "app|ffmpeg|gpu|driver", 101));
        assert!(!encoder_cache_is_valid(&cache, "new-driver", 101));
    }

    #[test]
    fn encoder_cache_expires() {
        let cache = cache(100);
        assert!(!encoder_cache_is_valid(
            &cache,
            "app|ffmpeg|gpu|driver",
            101 + ENCODER_CACHE_TTL_SEC,
        ));
    }
}

#[cfg(test)]
mod vault_contract_tests {
    // Source-level guard because emitting commands require an AppHandle.
    #[test]
    fn every_config_changed_event_follows_secret_presence_refresh() {
        let source = include_str!("commands.rs");
        let lines: Vec<&str> = source.lines().collect();
        let mut emitters = 0;

        for (n, line) in lines.iter().enumerate() {
            if !line.contains("emit(\"config://changed\"") {
                continue;
            }
            emitters += 1;
            let start = n.saturating_sub(12);
            let has_refresh = lines[start..n]
                .iter()
                .any(|previous| previous.contains("refresh_secret_presence("));
            assert!(
                has_refresh,
                "line {}: emits config://changed without refresh_secret_presence in the preceding \
                 12 lines; receiving webviews would lose credential-presence indicators",
                n + 1
            );
        }

        // Fail if the event pattern stops matching rather than passing without checking emitters.
        assert!(
            emitters >= 2,
            "expected config://changed emitters, found {emitters}; \
             check whether the event was renamed and the source pattern no longer matches"
        );
    }
}

#[cfg(test)]
mod diagnostic_export_tests {
    use super::build_diagnostic_report;
    use crate::config::{ChatSource, Target, TargetEncoding};

    #[test]
    fn exported_diagnostic_omits_channel_destination_and_video_identifiers() {
        let channel = "canalSentinela19";
        let source = "fonteSentinela27";
        let destination = "destinoSentinela31";
        let video_id = "videoSentinela43";
        let mut config = crate::config::AppConfig::default();
        config.settings.stream_title = channel.into();
        config.settings.chat_sources.push(ChatSource {
            id: source.into(),
            platform: "youtube".into(),
            value: video_id.into(),
            name: channel.into(),
            enabled: true,
            has_send_token: false,
        });
        config.targets.push(Target {
            id: destination.into(),
            platform_id: "custom".into(),
            name: destination.into(),
            enabled: true,
            protocol: "rtmp".into(),
            ingest_url: format!("rtmp://example.invalid/live/{channel}"),
            has_key: false,
            encoding: TargetEncoding {
                action: "copy".into(),
                preset: None,
                encoder: "auto".into(),
                hybrid_override: None,
                reframe: None,
            },
        });
        let report = build_diagnostic_report(
            "0.0.0-test",
            "test-os",
            "test-arch",
            &config,
            &serde_json::json!({
                "schemaVersion": 1,
                "structuredEvents": [],
            }),
        )
        .unwrap();

        for forbidden in [channel, source, destination, video_id] {
            assert!(
                !report.contains(forbidden),
                "free-text identifier leaked into diagnostics: {forbidden}\n{report}"
            );
        }
        assert!(report.contains("telemetry-and-operations.json"));
        assert!(!report.contains("local-log-"));
    }
}
