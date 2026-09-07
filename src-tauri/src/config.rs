//! Persisted configuration contract shared with src/lib/types.ts.
use crate::i18n::{self, Locale, Msg};
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub const CURRENT_SCHEMA_VERSION: u32 = 1;
const MAX_TARGETS: usize = 32;
const MAX_PROFILES: usize = 20;
pub(crate) const MAX_CONFIG_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Debug)]
pub(crate) enum ConfigReadError {
    TooLarge,
    Io(std::io::Error),
}

impl std::fmt::Display for ConfigReadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TooLarge => f.write_str(&Msg::ConfigImportTooBig.now()),
            Self::Io(error) => error.fmt(f),
        }
    }
}

/// Bound actual reads, including files that grow after being opened.
fn read_config_bytes(reader: impl Read) -> Result<String, ConfigReadError> {
    let mut bytes = Vec::new();
    reader
        .take(MAX_CONFIG_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(ConfigReadError::Io)?;
    if bytes.len() as u64 > MAX_CONFIG_BYTES {
        return Err(ConfigReadError::TooLarge);
    }
    String::from_utf8(bytes).map_err(|error| {
        ConfigReadError::Io(std::io::Error::new(std::io::ErrorKind::InvalidData, error))
    })
}

pub(crate) fn read_config_file(path: &std::path::Path) -> Result<String, ConfigReadError> {
    read_config_bytes(std::fs::File::open(path).map_err(ConfigReadError::Io)?)
}

fn default_schema_version() -> u32 {
    CURRENT_SCHEMA_VERSION
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 80
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
}

/// Render the field label in the same locale as its enclosing validation message.
fn limited(l: Locale, label: Msg<'_>, value: &str, max: usize) -> Result<(), String> {
    if value.len() > max {
        Err(Msg::ConfigLimitExceeded {
            label: &label.text(l),
            max,
        }
        .text(l))
    } else {
        Ok(())
    }
}

pub fn validate_secret_namespace(value: &str) -> Result<(), String> {
    let id = value
        .strip_prefix("alert_")
        .or_else(|| value.strip_prefix("chat_send_"))
        .unwrap_or(value);
    if valid_id(id) && !value.starts_with("oauth_") {
        Ok(())
    } else {
        Err(Msg::ConfigInvalidSecretNamespace.now())
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VideoPreset {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub video_bitrate_kbps: u32,
    pub audio_bitrate_kbps: u32,
    pub keyframe_sec: u32,
}

/// x/y pan across available space (0..1); zoom is the crop height fraction (0.25..1).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Reframe {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TargetEncoding {
    /// copy or transcode in per-platform mode; hybrid uses hybrid_override or automatic selection.
    pub action: String,
    #[serde(default)]
    pub preset: Option<VideoPreset>,
    /// auto | nvenc | qsv | amf | videotoolbox | software
    pub encoder: String,
    /// None lets hybrid mode select copy or transcode automatically.
    #[serde(default)]
    pub hybrid_override: Option<String>,
    /// None centers the portrait crop.
    #[serde(default)]
    pub reframe: Option<Reframe>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub id: String,
    pub platform_id: String,
    pub name: String,
    pub enabled: bool,
    pub protocol: String,
    pub ingest_url: String,
    pub has_key: bool,
    pub encoding: TargetEncoding,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IngestConfig {
    pub protocol: String,
    pub host: String,
    pub port: u32,
    pub app: String,
    pub key: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub minimize_to_tray: bool,
    pub autostart: bool,
    /// Empty means unauthenticated obs-websocket access.
    #[serde(default)]
    pub obs_password: String,
    #[serde(default = "default_true")]
    pub auto_start_obs: bool,
    #[serde(default = "default_live_shortcut")]
    pub live_shortcut: String,
    #[serde(default)]
    pub youtube_api_key: String,
    #[serde(default)]
    pub chat_sources: Vec<ChatSource>,
    /// Aggregator credentials live in the keyring, not these source records.
    #[serde(default)]
    pub alert_sources: Vec<AlertSource>,
    #[serde(default = "default_true")]
    pub chat_show_emotes: bool,
    #[serde(default = "default_true")]
    pub chat_show_badges: bool,
    #[serde(default = "default_true")]
    pub chat_show_platform: bool,
    #[serde(default)]
    pub chat_show_source: bool,
    #[serde(default)]
    pub chat_show_timestamps: bool,
    #[serde(default = "default_true")]
    pub chat_show_viewers: bool,
    #[serde(default = "default_theme")]
    pub theme: String,
    /// auto | pt-BR | en; auto follows the OS locale, including native user-facing errors.
    #[serde(default = "default_language")]
    pub language: String,
    /// Pixel size; also accepts persisted legacy sm/md/lg values.
    #[serde(default = "default_font", deserialize_with = "de_font")]
    pub chat_font_size: u32,
    #[serde(default = "default_font", deserialize_with = "de_font")]
    pub alert_font_size: u32,
    /// auto | row | col
    #[serde(default = "default_both_layout")]
    pub chat_both_layout: String,
    #[serde(default)]
    pub chat_both_alerts_first: bool,
    /// Percentage occupied by the alerts panel (15..75).
    #[serde(default = "default_both_split")]
    pub chat_both_split: u32,
    #[serde(default)]
    pub brb_enabled: bool,
    /// auto | image | video; custom files are stored as brb-slate.*.
    #[serde(default = "default_brb_slate_kind")]
    pub brb_slate_kind: String,
    /// Adaptive bitrate applies only to transcoded destinations.
    #[serde(default = "default_true")]
    pub auto_bitrate: bool,
    #[serde(default)]
    pub guardian_enabled: bool,
    /// Only explicitly supplied terms participate in privacy detection.
    #[serde(default)]
    pub guardian_watchlist: Vec<String>,
    /// Opt-in: single-pass loudness correction may pump or conflict with normalization in OBS.
    #[serde(default)]
    pub loudness_normalize: bool,
    /// Integrated loudness target in LUFS.
    #[serde(default = "default_loudness_target")]
    pub loudness_target_lufs: f64,
    #[serde(default = "default_true")]
    pub youtube_auto_live: bool,
    #[serde(default)]
    pub stream_title: String,
    #[serde(default = "default_true")]
    pub chat_auto_connect: bool,
    #[serde(default = "default_popout_tab")]
    pub chat_popout_tab: String,
    #[serde(default)]
    pub chat_show_alerts_panel: bool,
    /// Loopback-only server with a stable URL between restarts.
    #[serde(default)]
    pub overlay_enabled: bool,
    #[serde(default = "default_true")]
    pub overlay_sound: bool,
    /// top | bottom | center | top-left | top-right | bottom-left | bottom-right
    #[serde(default = "default_overlay_position")]
    pub overlay_position: String,
    #[serde(default = "default_overlay_port")]
    pub overlay_port: u32,
    /// bottom | top
    #[serde(default = "default_overlay_chat_position")]
    pub overlay_chat_position: String,
    #[serde(default = "default_overlay_duration")]
    pub overlay_duration_secs: u32,
    /// sm | md | lg
    #[serde(default = "default_overlay_scale")]
    pub overlay_scale: String,
    #[serde(default = "default_true")]
    pub overlay_show_follows: bool,
    #[serde(default = "default_overlay_chat_size")]
    pub overlay_chat_size: u32,
    #[serde(default = "default_overlay_chat_max")]
    pub overlay_chat_max: u32,
    #[serde(default = "default_true")]
    pub overlay_chat_badges: bool,
    #[serde(default = "default_true")]
    pub overlay_chat_platform: bool,
    #[serde(default)]
    pub overlay_chat_hide_commands: bool,
    /// Zero disables message fading.
    #[serde(default)]
    pub overlay_chat_fade_secs: u32,
    /// Display-only original filename; the stored file is renamed to brb-slate.*.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub brb_slate_file_name: Option<String>,
    #[serde(default)]
    pub record_video: bool,
    /// Empty resolves to the current session directory, keeping exported settings portable.
    #[serde(default)]
    pub record_video_dir: String,
    #[serde(default = "default_record_keep_gb")]
    pub record_video_keep_gb: u64,
    /// Separate consent: video consumes disk; chat stores other people's personal data.
    #[serde(default)]
    pub record_chat: bool,
}

fn default_record_keep_gb() -> u64 {
    20
}

fn default_true() -> bool {
    true
}
fn default_loudness_target() -> f64 {
    -14.0
}
fn default_popout_tab() -> String {
    "both".to_string()
}
fn default_overlay_position() -> String {
    "top".to_string()
}
fn default_overlay_port() -> u32 {
    7393
}
fn default_overlay_chat_position() -> String {
    "bottom".to_string()
}
fn default_overlay_duration() -> u32 {
    6
}
fn default_overlay_scale() -> String {
    "md".to_string()
}
fn default_overlay_chat_size() -> u32 {
    22
}
fn default_overlay_chat_max() -> u32 {
    12
}
fn default_brb_slate_kind() -> String {
    "auto".to_string()
}
fn default_live_shortcut() -> String {
    "CommandOrControl+Alt+L".to_string()
}
fn default_theme() -> String {
    "dark".to_string()
}
fn default_language() -> String {
    "auto".to_string()
}
fn default_font() -> u32 {
    14
}
/// Accept pixel values and persisted legacy sm/md/lg labels.
fn de_font<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u32, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Sz {
        N(u32),
        S(String),
    }
    Ok(match Sz::deserialize(d)? {
        Sz::N(n) => n.clamp(8, 44),
        Sz::S(s) => match s.as_str() {
            "sm" => 12,
            "lg" => 16,
            _ => 14,
        },
    })
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatSource {
    pub id: String,
    pub platform: String, // twitch | youtube | kick | cinefy
    pub value: String,    // channel, slug, or video identifier
    #[serde(default)]
    pub name: String,
    pub enabled: bool,
    /// Recomputed from chat_send_<id> in the vault during get_config.
    #[serde(default)]
    pub has_send_token: bool,
}

/// Credentials remain in alert_<id>; get_config recomputes has_token from the vault.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AlertSource {
    pub id: String,
    pub kind: String, // streamlabs | streamelements
    #[serde(default)]
    pub name: String,
    pub enabled: bool,
    #[serde(default)]
    pub has_token: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            minimize_to_tray: true,
            autostart: false,
            obs_password: String::new(),
            auto_start_obs: true,
            live_shortcut: default_live_shortcut(),
            youtube_api_key: String::new(),
            chat_sources: Vec::new(),
            alert_sources: Vec::new(),
            chat_show_emotes: true,
            chat_show_badges: true,
            chat_show_platform: true,
            chat_show_source: false,
            chat_show_timestamps: false,
            chat_show_viewers: true,
            theme: default_theme(),
            language: default_language(),
            chat_font_size: default_font(),
            alert_font_size: default_font(),
            chat_both_layout: default_both_layout(),
            chat_both_alerts_first: false,
            chat_both_split: default_both_split(),
            brb_enabled: false,
            brb_slate_kind: default_brb_slate_kind(),
            auto_bitrate: true,
            guardian_enabled: false,
            guardian_watchlist: Vec::new(),
            loudness_normalize: false,
            loudness_target_lufs: -14.0,
            youtube_auto_live: true,
            stream_title: String::new(),
            chat_auto_connect: true,
            chat_popout_tab: default_popout_tab(),
            chat_show_alerts_panel: false,
            overlay_enabled: false,
            overlay_sound: true,
            overlay_position: default_overlay_position(),
            overlay_port: default_overlay_port(),
            overlay_chat_position: default_overlay_chat_position(),
            overlay_duration_secs: default_overlay_duration(),
            overlay_scale: default_overlay_scale(),
            overlay_show_follows: true,
            overlay_chat_size: default_overlay_chat_size(),
            overlay_chat_max: default_overlay_chat_max(),
            overlay_chat_badges: true,
            overlay_chat_platform: true,
            overlay_chat_hide_commands: false,
            overlay_chat_fade_secs: 0,
            brb_slate_file_name: None,
            // Both require explicit consent: disk usage and third-party personal data are independent choices.
            record_video: false,
            record_video_dir: String::new(),
            record_video_keep_gb: default_record_keep_gb(),
            record_chat: false,
        }
    }
}

fn default_both_split() -> u32 {
    35
}
fn default_both_layout() -> String {
    "auto".to_string()
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub mode: String,
    pub targets: Vec<Target>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub revision: u64,
    pub ingest: IngestConfig,
    /// per-platform | passthrough | hybrid
    pub mode: String,
    pub targets: Vec<Target>,
    #[serde(default)]
    pub settings: Settings,
    #[serde(default)]
    pub profiles: Vec<Profile>,
    #[serde(default)]
    pub active_profile_id: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            schema_version: CURRENT_SCHEMA_VERSION,
            revision: 0,
            ingest: IngestConfig {
                protocol: "rtmp".into(),
                host: "127.0.0.1".into(),
                port: 1935,
                app: "live".into(),
                key: "obs".into(),
            },
            mode: "hybrid".into(),
            targets: vec![],
            settings: Settings::default(),
            profiles: vec![],
            active_profile_id: String::new(),
        }
    }
}

impl AppConfig {
    pub fn validate_and_normalize(self) -> Result<Self, String> {
        // Capture one locale so a concurrent language change cannot mix validation messages.
        self.validate_and_normalize_for_locale(i18n::locale())
    }

    fn validate_and_normalize_for_locale(mut self, l: Locale) -> Result<Self, String> {
        if self.schema_version > CURRENT_SCHEMA_VERSION {
            return Err(Msg::ConfigSchemaTooNew {
                n: self.schema_version,
            }
            .text(l));
        }
        self.schema_version = CURRENT_SCHEMA_VERSION;
        if self.targets.len() > MAX_TARGETS || self.profiles.len() > MAX_PROFILES {
            return Err(Msg::ConfigTooManyTargetsOrProfiles.text(l));
        }
        if self.ingest.protocol != "rtmp" {
            return Err(Msg::ConfigIngestMustBeRtmp.text(l));
        }
        self.ingest.host = match self.ingest.host.trim().to_ascii_lowercase().as_str() {
            "127.0.0.1" | "localhost" => "127.0.0.1".into(),
            _ => return Err(Msg::ConfigIngestMustBeLoopback.text(l)),
        };
        if !(1..=65_535).contains(&self.ingest.port) {
            return Err(Msg::ConfigInvalidIngestPort.text(l));
        }
        for (label, value) in [
            (Msg::ConfigLabelIngestApp, &self.ingest.app),
            (Msg::ConfigLabelIngestKey, &self.ingest.key),
        ] {
            if !valid_id(value) {
                return Err(Msg::ConfigInvalidValue {
                    label: &label.text(l),
                }
                .text(l));
            }
        }
        if !matches!(
            self.mode.as_str(),
            "per-platform" | "passthrough" | "hybrid"
        ) {
            return Err(Msg::ConfigInvalidEncodingMode.text(l));
        }

        let allowed_platforms = [
            "twitch",
            "youtube",
            "facebook",
            "kick",
            "tiktok",
            "x",
            "instagram",
            "custom",
        ];
        for target in &mut self.targets {
            if !valid_id(&target.id) || !allowed_platforms.contains(&target.platform_id.as_str()) {
                return Err(Msg::ConfigInvalidTarget.text(l));
            }
            limited(l, Msg::ConfigLabelTargetName, &target.name, 120)?;
            if !matches!(target.protocol.as_str(), "rtmp" | "rtmps") {
                return Err(Msg::ConfigUnsupportedProtocol.text(l));
            }
            let protocol = if target
                .ingest_url
                .get(..8)
                .is_some_and(|prefix| prefix.eq_ignore_ascii_case("rtmps://"))
            {
                "rtmps"
            } else if target
                .ingest_url
                .get(..7)
                .is_some_and(|prefix| prefix.eq_ignore_ascii_case("rtmp://"))
            {
                "rtmp"
            } else {
                return Err(Msg::ConfigInvalidIngestUrl { name: &target.name }.text(l));
            };
            target.protocol = protocol.into();
            let scheme_len = protocol.len() + 3;
            if target.ingest_url.len() > 2_048
                || target.ingest_url[scheme_len..].trim_matches('/').is_empty()
                || target.ingest_url.chars().any(char::is_whitespace)
            {
                return Err(Msg::ConfigInvalidIngestUrl { name: &target.name }.text(l));
            }
            if !matches!(target.encoding.action.as_str(), "copy" | "transcode")
                || !matches!(
                    target.encoding.encoder.as_str(),
                    "auto" | "nvenc" | "qsv" | "amf" | "videotoolbox" | "software"
                )
                || target
                    .encoding
                    .hybrid_override
                    .as_deref()
                    .is_some_and(|v| !matches!(v, "copy" | "transcode"))
            {
                return Err(Msg::ConfigInvalidEncodingIn { name: &target.name }.text(l));
            }
            if let Some(p) = &mut target.encoding.preset {
                if !(160..=7_680).contains(&p.width)
                    || !(160..=4_320).contains(&p.height)
                    || !(1..=120).contains(&p.fps)
                    || !(100..=100_000).contains(&p.video_bitrate_kbps)
                    || !(32..=1_536).contains(&p.audio_bitrate_kbps)
                    || !(1..=10).contains(&p.keyframe_sec)
                {
                    return Err(Msg::ConfigPresetOutOfRange { name: &target.name }.text(l));
                }
            }
            target.has_key = false;
        }
        for profile in &mut self.profiles {
            if !valid_id(&profile.id) || profile.targets.len() > MAX_TARGETS {
                return Err(Msg::ConfigInvalidProfile.text(l));
            }
            limited(l, Msg::ConfigLabelProfileName, &profile.name, 120)?;
            if !matches!(
                profile.mode.as_str(),
                "per-platform" | "passthrough" | "hybrid"
            ) {
                return Err(Msg::ConfigInvalidProfileMode.text(l));
            }
            for target in &mut profile.targets {
                target.has_key = false;
            }
        }
        if !self.active_profile_id.is_empty() && !valid_id(&self.active_profile_id) {
            return Err(Msg::ConfigInvalidActiveProfile.text(l));
        }
        let s = &mut self.settings;
        s.obs_password = s.obs_password.chars().take(512).collect();
        s.youtube_api_key = s.youtube_api_key.chars().take(512).collect();
        s.stream_title = s.stream_title.chars().take(200).collect();
        s.guardian_watchlist.truncate(100);
        for term in &mut s.guardian_watchlist {
            *term = term.trim().chars().take(200).collect();
        }
        s.chat_sources.truncate(32);
        s.alert_sources.truncate(16);
        for source in &mut s.chat_sources {
            source.has_send_token = false;
        }
        for source in &mut s.alert_sources {
            source.has_token = false;
        }
        if !(1..=65_535).contains(&s.overlay_port) {
            return Err(Msg::ConfigInvalidOverlayPort.text(l));
        }
        s.overlay_duration_secs = s.overlay_duration_secs.clamp(1, 60);
        s.overlay_chat_size = s.overlay_chat_size.clamp(8, 72);
        s.overlay_chat_max = s.overlay_chat_max.clamp(1, 100);
        s.chat_font_size = s.chat_font_size.clamp(8, 44);
        s.alert_font_size = s.alert_font_size.clamp(8, 44);
        if !matches!(s.theme.as_str(), "dark" | "light") {
            s.theme = default_theme();
        }
        s.record_video_keep_gb = s.record_video_keep_gb.clamp(1, 2048);
        s.record_video_dir = s.record_video_dir.trim().chars().take(400).collect();
        Ok(self)
    }
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("config dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {e}"))?;
    Ok(dir.join("config.json"))
}

#[derive(Debug, PartialEq, Eq)]
enum ConfigLoadError {
    Structure,
    Validation,
}

impl std::fmt::Display for ConfigLoadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::Structure => "invalid_structure",
            Self::Validation => "invalid_values",
        })
    }
}

fn config_from_value(
    value: serde_json::Value,
    locale: Locale,
) -> Result<AppConfig, ConfigLoadError> {
    serde_json::from_value::<AppConfig>(value)
        .map_err(|_| ConfigLoadError::Structure)?
        .validate_and_normalize_for_locale(locale)
        .map_err(|_| ConfigLoadError::Validation)
}

pub fn load(app: &AppHandle) -> AppConfig {
    let path = match config_path(app) {
        Ok(p) => p,
        Err(_) => return AppConfig::default(),
    };
    match read_config_file(&path) {
        Ok(raw) => match serde_json::from_str::<serde_json::Value>(&raw) {
            Ok(value) => {
                let old_schema = value
                    .get("schemaVersion")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u32;
                match config_from_value(value, i18n::locale()) {
                    Ok(cfg) => {
                        if old_schema < CURRENT_SCHEMA_VERSION {
                            let backup =
                                path.with_extension(format!("schema-{old_schema}.json.bak"));
                            let _ = std::fs::copy(&path, backup);
                            if let Err(e) = save(app, &cfg) {
                                log::warn!("could not persist configuration migration: {e}");
                            }
                        }
                        cfg
                    }
                    Err(e) => {
                        log::error!("config.json rejected: {e}");
                        AppConfig::default()
                    }
                }
            }
            Err(e) => {
                log::error!("config.json invalid ({e}); preserving as .corrupt and using defaults");
                let ts = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                let _ = std::fs::rename(&path, path.with_extension(format!("corrupt-{ts}.json")));
                AppConfig::default()
            }
        },
        Err(ConfigReadError::TooLarge) => {
            log::error!("config.json exceeds the 2 MiB limit");
            AppConfig::default()
        }
        Err(_) => AppConfig::default(),
    }
}

pub fn save(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let raw = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, raw).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_load_diagnostics_do_not_reuse_localized_validation_or_user_values() {
        for locale in [Locale::PtBr, Locale::En] {
            let mut config = AppConfig::default();
            config.ingest.host = "private-fixture.invalid".into();
            let message = config
                .clone()
                .validate_and_normalize_for_locale(locale)
                .unwrap_err();
            assert_eq!(message, Msg::ConfigIngestMustBeLoopback.text(locale));
            let error =
                config_from_value(serde_json::to_value(config).unwrap(), locale).unwrap_err();
            assert_eq!(error, ConfigLoadError::Validation);
            assert_eq!(error.to_string(), "invalid_values");
            assert!(!error.to_string().contains(&message));

            let error = config_from_value(
                serde_json::json!({ "ingest": "segredo private-fixture" }),
                locale,
            )
            .unwrap_err();
            assert_eq!(error, ConfigLoadError::Structure);
            assert_eq!(error.to_string(), "invalid_structure");
            assert!(!error.to_string().contains("private-fixture"));
        }
    }

    #[test]
    fn config_read_limits_actual_bytes_and_rejects_invalid_utf8() {
        assert_eq!(read_config_bytes(&b"{}"[..]).unwrap(), "{}");
        let exact = vec![b' '; MAX_CONFIG_BYTES as usize];
        assert_eq!(
            read_config_bytes(exact.as_slice()).unwrap().len(),
            exact.len()
        );
        assert!(matches!(
            read_config_bytes(std::io::repeat(b' ')),
            Err(ConfigReadError::TooLarge)
        ));
        assert!(matches!(
            read_config_bytes(&[0xff][..]),
            Err(ConfigReadError::Io(error)) if error.kind() == std::io::ErrorKind::InvalidData
        ));
    }

    #[test]
    fn config_reader_never_consumes_more_than_limit_plus_one() {
        struct GrowingReader(u64);
        impl Read for GrowingReader {
            fn read(&mut self, output: &mut [u8]) -> std::io::Result<usize> {
                output.fill(b' ');
                self.0 += output.len() as u64;
                Ok(output.len())
            }
        }
        let mut reader = GrowingReader(0);
        assert!(matches!(
            read_config_bytes(&mut reader),
            Err(ConfigReadError::TooLarge)
        ));
        assert_eq!(reader.0, MAX_CONFIG_BYTES + 1);
    }

    #[test]
    fn rejects_network_listener_and_unsupported_protocol() {
        let mut cfg = AppConfig::default();
        cfg.ingest.host = "0.0.0.0".into();
        assert!(cfg.validate_and_normalize().is_err());

        let mut cfg = AppConfig::default();
        cfg.targets.push(Target {
            id: "target_1".into(),
            platform_id: "custom".into(),
            name: "SRT".into(),
            enabled: true,
            protocol: "srt".into(),
            ingest_url: "srt://host:9000".into(),
            has_key: true,
            encoding: TargetEncoding {
                action: "copy".into(),
                preset: None,
                encoder: "auto".into(),
                hybrid_override: None,
                reframe: None,
            },
        });
        assert!(cfg.validate_and_normalize().is_err());
    }

    fn target_fixture(id: &str) -> Target {
        Target {
            id: id.into(),
            platform_id: "twitch".into(),
            name: "Twitch".into(),
            enabled: true,
            protocol: "rtmp".into(),
            ingest_url: "rtmp://live.twitch.tv/app".into(),
            has_key: false,
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
    fn destination_protocol_follows_the_ingest_url_scheme() {
        let mut cfg = AppConfig::default();
        let mut target = target_fixture("target_secure");
        target.protocol = "rtmp".into();
        target.ingest_url = "rtmps://ingest.example.test/app".into();
        cfg.targets.push(target);

        let cfg = cfg
            .validate_and_normalize()
            .expect("a valid RTMPS URL must not prevent saving the destination");
        assert_eq!(cfg.targets[0].protocol, "rtmps");
    }

    /// Normalization must preserve destination IDs because they index vault credentials.
    #[test]
    fn normalization_must_preserve_destination_ids() {
        let mut cfg = AppConfig::default();
        let ids = ["target_1", "target-abc", "a", "A_9-z"];
        for id in ids {
            cfg.targets.push(target_fixture(id));
        }
        cfg.profiles.push(Profile {
            id: "perfil_1".into(),
            name: "Live de sexta".into(),
            mode: "per-platform".into(),
            targets: ids.iter().map(|id| target_fixture(id)).collect(),
        });
        let cfg = cfg.validate_and_normalize().expect("valid configuration");

        assert_eq!(
            cfg.targets
                .iter()
                .map(|t| t.id.as_str())
                .collect::<Vec<_>>(),
            ids,
            "normalization changed the destination ID and orphaned its vault credential"
        );
        assert_eq!(
            cfg.profiles[0]
                .targets
                .iter()
                .map(|t| t.id.as_str())
                .collect::<Vec<_>>(),
            ids,
            "normalization changed a profile destination ID and orphaned its credential"
        );
        assert_eq!(
            cfg.targets.len(),
            ids.len(),
            "a destination disappeared from the configuration"
        );
    }

    /// Never trust persisted credential presence; derive it from the vault.
    #[test]
    fn normalization_clears_persisted_credential_presence() {
        let mut cfg = AppConfig::default();
        let mut with_key = target_fixture("target_1");
        with_key.has_key = true;
        cfg.targets.push(with_key.clone());
        cfg.profiles.push(Profile {
            id: "perfil_1".into(),
            name: "Podcast".into(),
            mode: "hybrid".into(),
            targets: vec![with_key],
        });

        let cfg = cfg.validate_and_normalize().expect("valid configuration");
        assert!(
            !cfg.targets[0].has_key,
            "persisted has_key must not claim stale vault presence"
        );
        assert!(
            !cfg.profiles[0].targets[0].has_key,
            "profile credential presence must also be cleared"
        );
    }

    /// Destination validation and vault lookup must accept the same identifier namespace.
    #[test]
    fn valid_destination_ids_are_valid_vault_namespaces() {
        for id in ["target_1", "abc", "A-9_z"] {
            let mut cfg = AppConfig::default();
            cfg.targets.push(target_fixture(id));
            assert!(
                cfg.validate_and_normalize().is_ok(),
                "configuration rejected ID {id:?}"
            );
            assert!(
                validate_secret_namespace(id).is_ok(),
                "ID {id:?} is valid in configuration but not in the vault"
            );
        }
    }

    #[test]
    fn validates_secret_namespaces() {
        assert!(validate_secret_namespace("target_abc-1").is_ok());
        assert!(validate_secret_namespace("alert_source_1").is_ok());
        assert!(validate_secret_namespace("../oauth_token").is_err());
        assert!(validate_secret_namespace("oauth_refresh").is_err());
    }
}
