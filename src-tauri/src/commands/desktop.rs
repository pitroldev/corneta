use super::capture_native_error;
use crate::config::{self, AppConfig};
use crate::i18n::Msg;
use crate::telemetry;
use crate::AppState;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::ShellExt;

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

#[cfg(not(corneta_store))]
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

#[cfg(corneta_store)]
#[tauri::command]
pub async fn set_autostart(enabled: bool) -> Result<(), String> {
    use windows::ApplicationModel::{StartupTask, StartupTaskState};
    let result = async {
        let task = StartupTask::GetAsync(&windows::core::HSTRING::from("CornetaStartup"))?.await?;
        if enabled {
            let state = task.RequestEnableAsync()?.await?;
            if !matches!(
                state,
                StartupTaskState::Enabled | StartupTaskState::EnabledByPolicy
            ) {
                return Err(windows::core::Error::new(
                    windows::core::HRESULT(0x80070005_u32 as i32),
                    "Windows has disabled this startup task. Enable Corneta in Windows Startup Apps settings.",
                ));
            }
        } else {
            task.Disable()?;
        }
        Ok(())
    };
    result
        .await
        .map_err(|error: windows::core::Error| error.to_string())
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
    action: Option<crate::shortcut::Action>,
) -> Result<(), crate::shortcut::ShortcutError> {
    let action = action.unwrap_or(crate::shortcut::Action::ToggleLive);
    crate::shortcut::register(&app, action, &shortcut)
}

#[tauri::command]
pub fn deck_status(app: AppHandle) -> crate::deck::DeckStatus {
    crate::deck::status(&app)
}

#[tauri::command]
pub fn deck_pair_start(app: AppHandle) -> Result<crate::deck::PairTicket, String> {
    crate::deck::pair_start(&app)
}

#[tauri::command]
pub fn deck_pair_answer(app: AppHandle, request_id: String, allow: bool) -> Result<(), String> {
    crate::deck::pair_answer(&app, &request_id, allow)
}

#[tauri::command]
pub fn deck_device_remove(app: AppHandle, id: String) -> Result<(), String> {
    crate::deck::remove_device(&app, &id)
}

/// The main window reports how a start or stop asked by the phone went.
#[tauri::command]
pub fn deck_request_done(app: AppHandle, id: String, ok: bool, message: Option<String>) {
    let outcome = if ok {
        Ok(())
    } else {
        Err(message.unwrap_or_default().chars().take(400).collect())
    };
    crate::deck::desktop_done(&app, &id, outcome);
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
                source_feed: crate::config::InputFeed::Primary,
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
