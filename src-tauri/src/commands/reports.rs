use crate::config;
use crate::i18n::Msg;
use crate::platforms::provider::MarkOutcome;
use crate::recorder;
use crate::session;
use crate::AppState;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::ShellExt;

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
    let _mutation = crate::replay_commands::mutation_guard();
    if recorder::preparing_session(&id) {
        return Err(Msg::RecordingPreparationBusy.now());
    }
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
    recorder::test_record(&app, &path).await
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
    let _mutation = crate::replay_commands::mutation_guard();
    if recorder::preparing_session(&id) {
        return Err(Msg::RecordingPreparationBusy.now());
    }
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
pub async fn export_clip_slices(
    app: AppHandle,
    slices: Vec<crate::clips::ClipSegmentSlice>,
) -> Result<Option<String>, String> {
    crate::clips::export_single_slices(app, slices).await
}

#[tauri::command]
pub async fn export_clips_batch(
    app: AppHandle,
    dir: String,
    clips: Vec<crate::clips::BatchClipSpec>,
    format: Option<crate::clips::ClipExportFormat>,
    reframe: Option<crate::config::Reframe>,
) -> Result<crate::clips::BatchClipResult, String> {
    crate::clips::export_batch(app, dir, clips, format.unwrap_or_default(), reframe).await
}

#[tauri::command]
pub fn cancel_clips_batch() {
    crate::clips::cancel_batch();
}

#[tauri::command]
pub fn open_clips_export_folder() -> Result<(), String> {
    let dir = crate::clips::last_export_dir().ok_or_else(|| Msg::ClipsNoFolder.now())?;
    if !dir.is_dir() {
        return Err(Msg::ClipsInvalidDir.now());
    }
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformMark {
    platform: &'static str,
    outcome: MarkOutcome,
}

/// Platforms that refused markers during this live; asking again would only repeat the warning.
static MARK_REFUSED: std::sync::Mutex<(u64, Vec<&'static str>)> =
    std::sync::Mutex::new((0, Vec::new()));

fn mark_refused(generation: u64, platform: &'static str) -> bool {
    let refused = MARK_REFUSED.lock().unwrap();
    refused.0 == generation && refused.1.contains(&platform)
}

fn remember_mark_refusal(generation: u64, platform: &'static str) {
    let mut refused = MARK_REFUSED.lock().unwrap();
    if refused.0 != generation {
        *refused = (generation, Vec::new());
    }
    refused.1.push(platform);
}

/// The report marker is written before any platform call, so it keeps the instant the streamer asked for.
#[tauri::command]
pub async fn mark_moment(
    app: AppHandle,
    label: Option<String>,
) -> Result<Vec<PlatformMark>, String> {
    let label = label.unwrap_or_else(|| Msg::SessionDefaultMarkerLabel.now());
    let (path, generation, on_air) = {
        let st = app.state::<AppState>();
        let eng = st.engine.lock().unwrap();
        let on_air: Vec<&'static str> = eng
            .snapshot
            .iter()
            .flat_map(|snap| snap.targets.values())
            .filter(|target| target.state == "live" || target.state == "brb")
            .filter_map(|target| eng.target_platforms.get(&target.target_id))
            .filter_map(|platform| crate::platforms::destination_account(platform))
            .collect();
        (eng.session_path.clone(), eng.start_gen, on_air)
    };
    let path = path.ok_or_else(|| Msg::SessionNotRecording.now())?;
    session::record_marker(&path, &label);
    crate::deck::moment_marked(&app, &label);
    let mut marks = Vec::new();
    for &provider in crate::platforms::account_providers() {
        let platform = provider.id();
        if !on_air.contains(&platform) || mark_refused(generation, platform) {
            continue;
        }
        let (app, label) = (app.clone(), label.clone());
        let outcome = tauri::async_runtime::spawn_blocking(move || {
            provider
                .signed_in()
                .then(|| provider.mark_moment(&app, &label))
                .flatten()
        })
        .await
        .ok()
        .flatten();
        let Some(outcome) = outcome else {
            continue;
        };
        if outcome == MarkOutcome::Unavailable {
            remember_mark_refusal(generation, platform);
        }
        marks.push(PlatformMark { platform, outcome });
    }
    Ok(marks)
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
