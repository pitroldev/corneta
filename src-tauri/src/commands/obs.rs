use super::{capture_native_error, get_config, OBS_WS_HOST};
use crate::config::AppConfig;
use crate::engine;
use crate::AppState;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

/// Local facts about OBS (process, settings file); it opens no connection.
#[tauri::command]
pub async fn obs_environment() -> crate::obs_env::ObsEnvironment {
    tauri::async_runtime::spawn_blocking(crate::obs_env::environment)
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub fn open_obs() -> Result<(), String> {
    crate::obs_env::open()
}

const OBS_VIDEO_BACKUP: &str = "obs-video-backup.json";

fn obs_video_backup(app: &AppHandle) -> Result<std::path::PathBuf, crate::obs::ObsFailure> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| crate::obs::ObsFailure::exchange(e.to_string()))?;
    std::fs::create_dir_all(&dir).map_err(|e| crate::obs::ObsFailure::exchange(e.to_string()))?;
    Ok(dir.join(OBS_VIDEO_BACKUP))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObsVideoCheck {
    current: crate::obs::ObsVideo,
    proposal: Option<crate::obs::ObsVideo>,
    /// The strictest destination bitrate, for advanced output where Corneta cannot set it.
    limit_kbps: Option<u32>,
    can_undo: bool,
}

#[tauri::command]
pub async fn obs_video_check(app: AppHandle) -> Result<ObsVideoCheck, crate::obs::ObsFailure> {
    let config = get_config(app.clone());
    let limits = engine::strictest_copy_limits(&config);
    let backup = obs_video_backup(&app)?;
    let password = crate::obs_env::password(&config.settings.obs_password);
    let current = tauri::async_runtime::spawn_blocking(move || {
        crate::obs::read_video(OBS_WS_HOST, crate::obs_env::port(), &password)
    })
    .await
    .map_err(|e| crate::obs::ObsFailure::exchange(format!("join: {e}")))?
    .map_err(crate::obs::ObsFailure::from)?;
    Ok(ObsVideoCheck {
        proposal: limits.and_then(|limits| crate::obs::fit_video(&current, &limits)),
        current,
        limit_kbps: limits.map(|limits| limits.max_kbps),
        can_undo: backup.is_file(),
    })
}

#[tauri::command]
pub async fn obs_video_apply(
    app: AppHandle,
) -> Result<crate::obs::ObsVideo, crate::obs::ObsFailure> {
    let config = get_config(app.clone());
    let backup = obs_video_backup(&app)?;
    let password = crate::obs_env::password(&config.settings.obs_password);
    let Some(limits) = engine::strictest_copy_limits(&config) else {
        return tauri::async_runtime::spawn_blocking(move || {
            crate::obs::read_video(OBS_WS_HOST, crate::obs_env::port(), &password)
        })
        .await
        .map_err(|e| crate::obs::ObsFailure::exchange(format!("join: {e}")))?
        .map_err(crate::obs::ObsFailure::from);
    };
    tauri::async_runtime::spawn_blocking(move || {
        crate::obs::apply_fit(
            OBS_WS_HOST,
            crate::obs_env::port(),
            &password,
            &limits,
            &backup,
        )
    })
    .await
    .map_err(|e| crate::obs::ObsFailure::exchange(format!("join: {e}")))?
    .map_err(crate::obs::ObsFailure::from)
}

#[tauri::command]
pub async fn obs_video_undo(app: AppHandle) -> Result<(), crate::obs::ObsFailure> {
    let backup = obs_video_backup(&app)?;
    let password = crate::obs_env::password(&get_config(app).settings.obs_password);
    tauri::async_runtime::spawn_blocking(move || {
        crate::obs::undo_fit(OBS_WS_HOST, crate::obs_env::port(), &password, &backup)
    })
    .await
    .map_err(|e| crate::obs::ObsFailure::exchange(format!("join: {e}")))?
    .map_err(crate::obs::ObsFailure::from)
}

/// Smart reads what OBS sends before planning outputs; an unreachable OBS keeps the plain choice.
pub(super) async fn pin_smart_choices(config: &mut AppConfig) {
    if config.mode != "hybrid" {
        return;
    }
    let password = crate::obs_env::password(&config.settings.obs_password);
    let read = tauri::async_runtime::spawn_blocking(move || {
        crate::obs::read_video(OBS_WS_HOST, crate::obs_env::port(), &password)
    });
    // A hung OBS must not hold the live back.
    let Ok(Ok(Ok(video))) = tokio::time::timeout(std::time::Duration::from_secs(2), read).await
    else {
        return;
    };
    let pinned = engine::apply_source_signal(config, &video.signal());
    if !pinned.is_empty() {
        log::info!(
            "smart mode: transcoding {} for the OBS signal {}x{}",
            pinned.join(", "),
            video.output_width,
            video.output_height
        );
    }
}

#[tauri::command]
pub async fn obs_autoconfigure(app: AppHandle) -> Result<(), crate::obs::ObsFailure> {
    let cfg = get_config(app);
    // OBS expects the stream key separately from the server URL.
    let server = format!(
        "{}://{}:{}/{}",
        cfg.ingest.protocol, cfg.ingest.host, cfg.ingest.port, cfg.ingest.app
    );
    let key = cfg.ingest.key.clone();
    let password = crate::obs_env::password(&cfg.settings.obs_password);
    tauri::async_runtime::spawn_blocking(move || {
        crate::obs::autoconfigure(
            OBS_WS_HOST,
            crate::obs_env::port(),
            &password,
            &server,
            &key,
        )
    })
    .await
    .map_err(|e| crate::obs::ObsFailure::exchange(format!("join: {e}")))?
    .map_err(crate::obs::ObsFailure::from)
}

#[tauri::command]
pub async fn obs_set_stream(app: AppHandle, start: bool) -> Result<(), String> {
    let password = crate::obs_env::password(&get_config(app.clone()).settings.obs_password);
    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::obs::set_stream(OBS_WS_HOST, crate::obs_env::port(), &password, start)
    })
    .await;
    match result {
        Ok(Ok(())) => Ok(()),
        Ok(Err(error)) => {
            let report = !error.is_user_setup();
            let kind = error.to_string();
            let error = String::from(error);
            if report {
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
            } else {
                let action = if start { "start" } else { "stop" };
                log::info!("obs: stream {action} failed with {kind}");
            }
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

#[tauri::command]
pub async fn obs_check(app: AppHandle) -> Result<crate::obs::ObsCheck, String> {
    let cfg = get_config(app.clone());
    let server = format!(
        "{}://{}:{}/{}",
        cfg.ingest.protocol, cfg.ingest.host, cfg.ingest.port, cfg.ingest.app
    );
    let password = crate::obs_env::password(&cfg.settings.obs_password);
    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::obs::check(OBS_WS_HOST, crate::obs_env::port(), &password, &server)
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
    let password = crate::obs_env::password(&get_config(app).settings.obs_password);
    tauri::async_runtime::spawn_blocking(move || {
        crate::obs::add_or_update_browser_source(
            OBS_WS_HOST,
            crate::obs_env::port(),
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
    let password = crate::obs_env::password(&get_config(app).settings.obs_password);
    tauri::async_runtime::spawn_blocking(move || {
        crate::obs::remove_input(
            OBS_WS_HOST,
            crate::obs_env::port(),
            &password,
            MESA_OBS_SOURCE,
        )
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}
