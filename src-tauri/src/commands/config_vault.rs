use crate::config::{self, AppConfig};
use crate::i18n::Msg;
use crate::keys;
use crate::AppState;
use tauri::{AppHandle, Emitter, Manager};

#[tauri::command]
pub fn take_config_notice() -> Option<String> {
    config::take_set_aside_notice()
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
    let current = config::load(&app);
    let disk_revision = current.revision;
    if config.revision < disk_revision {
        return Err(Msg::ConfigSaveStaleRevision.now());
    }
    config.revision = disk_revision.saturating_add(1);
    // Phones pair and unpair through native prompts; a webview's copy may be stale.
    config.settings.deck_devices = current.settings.deck_devices;
    config::save(&app, &config)?;
    crate::apply_native_language(&app, &config.settings.language);
    refresh_secret_presence(&app, &mut config);
    // Other webviews must update their save baseline without persisting this event again.
    let _ = app.emit("config://changed", &config);
    Ok(config)
}

/// Native edits (deck pairing and layout) take the same validation, save and broadcast as the webview's.
pub(crate) fn save_native_config(
    app: &AppHandle,
    edit: impl FnOnce(&mut AppConfig),
) -> Result<AppConfig, String> {
    let mut config = config::load(app);
    edit(&mut config);
    let mut config = config.validate_and_normalize()?;
    config.revision = config.revision.saturating_add(1);
    config::save(app, &config)?;
    refresh_secret_presence(app, &mut config);
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
    let current = config::load(&app);
    let mut cfg = config::config_from_import(&content, &current, crate::i18n::locale())?;
    // Preserve the current configuration before replacing profiles and settings.
    if let Ok(dir) = app.path().app_config_dir() {
        if let Ok(json) = serde_json::to_string_pretty(&current) {
            let _ = std::fs::write(dir.join("corneta-backup-antes-do-import.json"), json);
        }
    }
    config::save(&app, &cfg)?;
    crate::apply_native_language(&app, &cfg.settings.language);
    refresh_secret_presence(&app, &mut cfg);
    let _ = app.emit("config://changed", &cfg);
    Ok(true)
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
            ..Default::default()
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
