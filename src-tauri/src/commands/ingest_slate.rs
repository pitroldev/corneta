use super::{get_config, kill_sidecar, save_native_config};
use crate::config::{self, AppConfig};
use crate::engine;
use crate::engine_policy::{
    brb_slate_is_video, is_brb_slate_path, is_loopback_host, mediamtx_port_conflict,
    parse_mediamtx_path_codec, parse_mediamtx_paths,
};
use crate::http_client as ureq;
use crate::i18n::Msg;
use crate::AppState;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

/// Moves the local ingest to a port nothing else is using, for when another program holds it.
#[tauri::command]
pub fn pick_ingest_port(app: AppHandle) -> Result<AppConfig, String> {
    let current = config::load(&app).ingest.port;
    let port = free_ingest_port(current).ok_or_else(|| Msg::EngineNoFreePort.now())?;
    save_native_config(&app, move |cfg| {
        cfg.ingest.port = port.into();
        // What was pasted into OBS by hand names the old port.
        cfg.settings.obs_manual = false;
    })
}

#[tauri::command]
pub async fn run_rehearsal(app: AppHandle) -> Result<crate::rehearsal::RehearsalReport, String> {
    crate::rehearsal::run(app).await
}

#[tauri::command]
pub fn cancel_rehearsal() {
    crate::rehearsal::cancel();
}

/// Starts the ingest server alone, for a rehearsal: the same port checks and readiness wait as a
/// live, without anything a live reports or records.
pub(crate) async fn start_rehearsal_ingest(
    app: &AppHandle,
    config: &AppConfig,
) -> Result<
    (
        tauri::async_runtime::Receiver<CommandEvent>,
        tauri_plugin_shell::process::CommandChild,
    ),
    String,
> {
    let ingest_port = u16::try_from(config.ingest.port).unwrap_or(1935);
    let mut listen_addresses = vec![("127.0.0.1", engine::MEDIAMTX_API_PORT)];
    if is_loopback_host(&config.ingest.host) {
        listen_addresses.insert(0, (config.ingest.host.as_str(), ingest_port));
    }
    let mut blocked = first_unavailable_port(&listen_addresses);
    for _ in 0..10 {
        if blocked.is_none() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        blocked = first_unavailable_port(&listen_addresses);
    }
    if let Some(port) = blocked {
        return Err(Msg::EngineIngestPortInUse { port }.now());
    }
    let yml = mediamtx_config_path(app)?;
    std::fs::write(&yml, engine::mediamtx_config(config))
        .map_err(|error| format!("MediaMTX config: {error}"))?;
    let (mut events, child) = app
        .shell()
        .sidecar("mediamtx")
        .map_err(|_| Msg::EngineMissingSidecar.now())?
        .args([yml.to_string_lossy().to_string()])
        .spawn()
        .map_err(|_| Msg::EngineMediamtxNoStart.now())?;
    crate::job::adopt_pid(child.pid());
    if let Err(failure) = wait_mediamtx_ready(
        &mut events,
        ingest_port,
        MEDIAMTX_READY_TIMEOUT,
        mediamtx_api_answers,
    )
    .await
    {
        kill_sidecar(child);
        return Err(failure.message().now());
    }
    Ok((events, child))
}

// Match exact paths: the compositor publisher must not count as OBS input.
// Byte counts reveal stalled input while MediaMTX still reports the publisher as ready.
pub(super) fn mediamtx_paths(ingest_name: &str, program_name: &str) -> (bool, u64, bool) {
    let (ready, bytes, prog, _) = mediamtx_paths_with_codec(ingest_name, program_name, false);
    (ready, bytes, prog)
}

pub(crate) fn mediamtx_paths_with_codec(
    ingest_name: &str,
    program_name: &str,
    use_program: bool,
) -> (bool, u64, bool, Option<crate::platforms::VideoCodec>) {
    let url = format!(
        "http://127.0.0.1:{}/v3/paths/list",
        engine::MEDIAMTX_API_PORT
    );
    let body = match ureq::get(&url)
        .timeout(std::time::Duration::from_millis(700))
        .call()
    {
        Ok(r) => r.into_string().unwrap_or_default(),
        Err(_) => return (false, 0, false, None),
    };
    let (ready, bytes, prog) = parse_mediamtx_paths(&body, ingest_name, program_name);
    let codec_path = if use_program {
        program_name
    } else {
        ingest_name
    };
    let codec = parse_mediamtx_path_codec(&body, codec_path);
    (ready, bytes, prog, codec)
}

pub(crate) fn mediamtx_source_codec(source_url: &str) -> Option<crate::platforms::VideoCodec> {
    let after_scheme = source_url.split("://").nth(1).unwrap_or(source_url);
    let (_, path_name) = after_scheme.split_once('/')?;
    let path_name = path_name.trim_matches('/');
    if path_name.is_empty() {
        return None;
    }
    let url = format!(
        "http://127.0.0.1:{}/v3/paths/list",
        engine::MEDIAMTX_API_PORT
    );
    let body = ureq::get(&url)
        .timeout(std::time::Duration::from_millis(500))
        .call()
        .ok()?
        .into_string()
        .ok()?;
    parse_mediamtx_path_codec(&body, path_name)
}

// Retain publisher lifecycle failures without frame-grab noise.
pub(super) fn log_mediamtx_line(raw: &str) {
    let line = raw.to_lowercase();
    const KEEP: [&str; 8] = [
        "publish",
        "available",
        "online",
        "destroyed",
        "queue",
        "too slow",
        "timed out",
        "err",
    ];
    if KEEP.iter().any(|word| line.contains(word)) {
        log::warn!("mediamtx: {}", raw.trim());
    }
}

/// MediaMTX serves its API only after binding every listener, so an answer means OBS can connect.
pub(super) fn mediamtx_api_answers() -> bool {
    let url = format!(
        "http://127.0.0.1:{}/v3/paths/list",
        engine::MEDIAMTX_API_PORT
    );
    match ureq::get(&url)
        .timeout(std::time::Duration::from_millis(400))
        .call()
    {
        Ok(_) | Err(ureq::Error::Status(..)) => true,
        Err(_) => false,
    }
}

/// A busy PC can delay the first answer; past this, the start provisions anyway and the
/// supervisor still catches a later crash.
pub(super) const MEDIAMTX_READY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(8);

/// Holds the start until MediaMTX answers, so no broadcast opens on a platform when the ingest
/// server already exited or lost its port.
pub(super) async fn wait_mediamtx_ready(
    events: &mut tauri::async_runtime::Receiver<CommandEvent>,
    ingest_port: u16,
    timeout: std::time::Duration,
    answers: fn() -> bool,
) -> Result<(), EngineFailure> {
    let deadline = tokio::time::Instant::now() + timeout;
    let mut probe = tokio::time::interval(std::time::Duration::from_millis(150));
    loop {
        tokio::select! {
            event = events.recv() => match event {
                Some(CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes)) => {
                    let raw = String::from_utf8_lossy(&bytes);
                    log_mediamtx_line(&raw);
                    if let Some(port) = mediamtx_port_conflict(&raw, ingest_port) {
                        return Err(EngineFailure::IngestPortInUse { port });
                    }
                }
                Some(CommandEvent::Terminated(_)) | None => {
                    return Err(EngineFailure::MediamtxExited);
                }
                Some(_) => {}
            },
            _ = probe.tick() => {
                if tauri::async_runtime::spawn_blocking(answers).await.unwrap_or(false) {
                    return Ok(());
                }
                if tokio::time::Instant::now() >= deadline {
                    log::warn!("engine: MediaMTX API silent after {timeout:?}; provisioning anyway");
                    return Ok(());
                }
            }
        }
    }
}

fn mediamtx_ingest_ready(config: &AppConfig) -> bool {
    let (ready, _, _) = mediamtx_paths(
        &engine::ingest_path_name(config),
        &engine::program_path_name(config),
    );
    ready
}

pub(super) fn mediamtx_config_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("mediamtx.yml"))
}

// Generated and custom slates share this namespace; only one file should exist.
pub(super) fn brb_slate_file(app: &AppHandle) -> Option<std::path::PathBuf> {
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
pub(super) async fn brb_slate_has_audio(app: &AppHandle, path: &str) -> bool {
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
async fn grab_frame_named(app: &AppHandle, name: &str) -> Result<Vec<u8>, String> {
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
        "-rtmp_enhanced_codecs".into(),
        "hvc1,av01".into(),
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
pub(super) enum EngineFailure {
    IngestPortInUse { port: u16 },
    MediamtxExited,
    FfmpegUnavailable,
}

impl EngineFailure {
    pub(super) fn code(self) -> &'static str {
        match self {
            Self::IngestPortInUse { .. } => "ingest_port_in_use",
            Self::MediamtxExited => "mediamtx_died",
            Self::FfmpegUnavailable => "ffmpeg_spawn_failed",
        }
    }

    pub(super) fn stage(self) -> &'static str {
        match self {
            Self::IngestPortInUse { .. } | Self::MediamtxExited => "mediamtx",
            Self::FfmpegUnavailable => "encoder",
        }
    }

    pub(super) fn message(self) -> Msg<'static> {
        match self {
            Self::IngestPortInUse { port } => Msg::EngineIngestPortInUse { port },
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

/// Probes listen addresses before MediaMTX starts: the error kind does not depend on the Windows
/// display language, unlike the text MediaMTX would log.
pub(super) fn first_unavailable_port(addresses: &[(&str, u16)]) -> Option<u16> {
    addresses.iter().find_map(
        |&(host, port)| match std::net::TcpListener::bind((host, port)) {
            Ok(_) => None,
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::AddrInUse | std::io::ErrorKind::PermissionDenied
                ) =>
            {
                Some(port)
            }
            Err(_) => None,
        },
    )
}

/// The code the UI reads for a taken port that is not the ingest's.
const LOCAL_PORT_IN_USE: &str = "local_port_in_use";

/// The UI offers to move the ingest port, which frees nothing when another local port is the taken
/// one, so that case gets its own code in the error snapshot.
pub(super) fn mark_port_failure(app: &AppHandle, taken: u16) {
    if u32::from(taken) == config::load(app).ingest.port {
        return;
    }
    let state = app.state::<AppState>();
    state.engine.lock().unwrap().last_error_code = Some(LOCAL_PORT_IN_USE.into());
}

/// Ports tried before an arbitrary free one, so the address pasted into OBS stays recognizable.
const INGEST_PORT_ALTERNATIVES: [u16; 4] = [1936, 1937, 1938, 1939];

fn free_ingest_port(current: u32) -> Option<u16> {
    INGEST_PORT_ALTERNATIVES
        .into_iter()
        .filter(|port| u32::from(*port) != current)
        .find(|port| first_unavailable_port(&[("127.0.0.1", *port)]).is_none())
        .or_else(|| {
            let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).ok()?;
            Some(listener.local_addr().ok()?.port())
        })
}

#[cfg(test)]
mod engine_failure_tests {
    use super::{first_unavailable_port, free_ingest_port, EngineFailure};
    use crate::i18n::{Locale, Msg};

    #[test]
    fn the_ingest_moves_to_a_port_that_is_free_and_not_the_current_one() {
        let port = free_ingest_port(1936).expect("a free port");
        assert_ne!(port, 1936);
        assert_eq!(first_unavailable_port(&[("127.0.0.1", port)]), None);
    }

    #[test]
    fn a_taken_local_port_is_found_before_mediamtx_starts() {
        let taken = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = taken.local_addr().unwrap().port();
        assert_eq!(
            first_unavailable_port(&[("127.0.0.1", 0), ("127.0.0.1", port)]),
            Some(port)
        );
        drop(taken);
        assert_eq!(first_unavailable_port(&[("127.0.0.1", port)]), None);
    }

    #[test]
    fn engine_failures_keep_stable_diagnostics_and_localized_ui_messages() {
        for (failure, code, stage, message) in [
            (
                EngineFailure::IngestPortInUse { port: 9997 },
                "ingest_port_in_use",
                "mediamtx",
                Msg::EngineIngestPortInUse { port: 9997 },
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
mod mediamtx_ready_tests {
    use super::{wait_mediamtx_ready, CommandEvent, EngineFailure};
    use std::time::Duration;
    use tauri_plugin_shell::process::TerminatedPayload;

    fn silent() -> bool {
        false
    }
    fn answering() -> bool {
        true
    }

    #[tokio::test]
    async fn an_exit_before_the_api_answers_fails_the_start() {
        let (events, mut rx) = tauri::async_runtime::channel(4);
        events
            .send(CommandEvent::Terminated(TerminatedPayload {
                code: Some(1),
                signal: None,
            }))
            .await
            .unwrap();
        let result = wait_mediamtx_ready(&mut rx, 1935, Duration::from_secs(5), silent).await;
        assert!(matches!(result, Err(EngineFailure::MediamtxExited)));
    }

    #[tokio::test]
    async fn a_taken_port_fails_the_start_with_that_port() {
        let (events, mut rx) = tauri::async_runtime::channel(4);
        let line = "2026/11/15 03:13:42 ERR listen tcp 127.0.0.1:19351: bind: Only one usage of each socket address (protocol/network address/port) is normally permitted.";
        events
            .send(CommandEvent::Stderr(line.as_bytes().to_vec()))
            .await
            .unwrap();
        let result = wait_mediamtx_ready(&mut rx, 1935, Duration::from_secs(5), silent).await;
        assert!(matches!(
            result,
            Err(EngineFailure::IngestPortInUse { port: 19351 })
        ));
    }

    #[tokio::test]
    async fn an_answering_api_lets_the_start_provision() {
        let (_events, mut rx) = tauri::async_runtime::channel::<CommandEvent>(4);
        let result = wait_mediamtx_ready(&mut rx, 1935, Duration::from_secs(5), answering).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn a_silent_but_running_server_does_not_hold_the_start_forever() {
        let (_events, mut rx) = tauri::async_runtime::channel::<CommandEvent>(4);
        let result = wait_mediamtx_ready(&mut rx, 1935, Duration::from_millis(300), silent).await;
        assert!(result.is_ok());
    }
}
