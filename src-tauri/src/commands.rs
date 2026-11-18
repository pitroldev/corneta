mod chat_alerts;
mod config_vault;
mod desktop;
mod encoders;
mod ingest_slate;
mod live;
mod live_status;
mod obs;
mod reports;

pub use chat_alerts::*;
pub(crate) use config_vault::save_native_config;
pub use config_vault::*;
pub use desktop::*;
pub use encoders::*;
pub(crate) use ingest_slate::start_rehearsal_ingest;
pub use ingest_slate::*;
pub use live::*;
pub(crate) use live::{close_auto_broadcasts, kill_engine_for_shutdown};
pub use live_status::*;
pub use obs::*;
pub use reports::*;

use crate::engine::EngineSnapshot;
use crate::engine_policy::{quality_of, tray_tooltip};
use crate::i18n::Msg;
use crate::telemetry::AppError;
use crate::AppState;
use tauri::{AppHandle, Manager};

pub(crate) const OBS_WS_HOST: &str = "127.0.0.1";

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

// Hide console windows for blocking utilities such as nvidia-smi.
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

/// Tauri sidecars only; std::process children also require wait() to be reaped.
pub(crate) fn kill_sidecar(child: tauri_plugin_shell::process::CommandChild) {
    let _ = child.kill();
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

#[cfg(test)]
mod vault_contract_tests {
    // Source-level guard because emitting commands require an AppHandle.
    #[test]
    fn every_config_changed_event_follows_secret_presence_refresh() {
        let sources = [
            ("commands.rs", include_str!("commands.rs")),
            (
                "commands/chat_alerts.rs",
                include_str!("commands/chat_alerts.rs"),
            ),
            (
                "commands/config_vault.rs",
                include_str!("commands/config_vault.rs"),
            ),
            ("commands/desktop.rs", include_str!("commands/desktop.rs")),
            ("commands/encoders.rs", include_str!("commands/encoders.rs")),
            (
                "commands/ingest_slate.rs",
                include_str!("commands/ingest_slate.rs"),
            ),
            ("commands/live.rs", include_str!("commands/live.rs")),
            (
                "commands/live_status.rs",
                include_str!("commands/live_status.rs"),
            ),
            ("commands/obs.rs", include_str!("commands/obs.rs")),
            ("commands/reports.rs", include_str!("commands/reports.rs")),
        ];
        let mut emitters = 0;

        for (file, source) in sources {
            let lines: Vec<&str> = source.lines().collect();
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
                    "{file}:{}: emits config://changed without refresh_secret_presence in the \
                     preceding 12 lines; receiving webviews would lose credential-presence indicators",
                    n + 1
                );
            }
        }

        // Fail if the event pattern stops matching rather than passing without checking emitters.
        assert!(
            emitters >= 2,
            "expected config://changed emitters, found {emitters}; \
             check whether the event was renamed and the source pattern no longer matches"
        );
    }
}
