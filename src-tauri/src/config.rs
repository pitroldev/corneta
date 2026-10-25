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
pub struct DeckDevice {
    pub id: String,
    pub name: String,
    /// Unix ms.
    #[serde(default)]
    pub paired_at: u64,
}

/// One step of a phone deck combo; only the fields its action uses are set.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct DeckComboStep {
    /// mark | brb | mic | scene | say | pause | wait
    pub action: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub on: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub muted: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scene: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub platform: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub paused: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seconds: Option<u32>,
}

/// A named list of steps the phone runs in order, shared by every paired phone.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeckCombo {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub steps: Vec<DeckComboStep>,
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
    /// Empty until chosen: an update must not grab global keys the user never asked for.
    #[serde(default)]
    pub mark_moment_shortcut: String,
    #[serde(default)]
    pub brb_shortcut: String,
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
    /// Opt-in: single-pass loudness correction may pump or conflict with normalization in OBS.
    #[serde(default)]
    pub loudness_normalize: bool,
    /// Integrated loudness target in LUFS.
    #[serde(default = "default_loudness_target")]
    pub loudness_target_lufs: f64,
    /// Opt-in: a dark game scene can look like a failed capture.
    #[serde(default)]
    pub black_screen_alert: bool,
    #[serde(default = "default_true")]
    pub youtube_auto_live: bool,
    /// Privacy of the broadcast the auto-live creates; one of `YOUTUBE_PRIVACY`.
    #[serde(default = "default_youtube_privacy")]
    pub youtube_privacy: String,
    /// Sent as selfDeclaredMadeForKids; YouTube then turns the live chat off.
    #[serde(default)]
    pub youtube_made_for_kids: bool,
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
    /// Opt-in: the phone deck listens on the home network only while this is on.
    #[serde(default)]
    pub deck_enabled: bool,
    #[serde(default = "default_deck_port")]
    pub deck_port: u32,
    /// Deck action ids in key order; empty means the built-in layout.
    #[serde(default)]
    pub deck_layout: Vec<String>,
    /// Combos the streamer built on the phone; the layout refers to them as `combo:<id>`.
    #[serde(default)]
    pub deck_combos: Vec<DeckCombo>,
    /// Paired phones. Only native code adds or removes them; each verifier lives in the vault.
    #[serde(default)]
    pub deck_devices: Vec<DeckDevice>,
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
pub const YOUTUBE_PRIVACY: [&str; 3] = ["public", "unlisted", "private"];
fn default_youtube_privacy() -> String {
    "public".to_string()
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
fn default_deck_port() -> u32 {
    7394
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
            mark_moment_shortcut: String::new(),
            brb_shortcut: String::new(),
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
            loudness_normalize: false,
            loudness_target_lufs: -14.0,
            black_screen_alert: false,
            youtube_auto_live: true,
            youtube_privacy: default_youtube_privacy(),
            youtube_made_for_kids: false,
            stream_title: String::new(),
            chat_auto_connect: true,
            chat_popout_tab: default_popout_tab(),
            chat_show_alerts_panel: false,
            overlay_enabled: false,
            overlay_sound: true,
            overlay_position: default_overlay_position(),
            overlay_port: default_overlay_port(),
            deck_enabled: false,
            deck_port: default_deck_port(),
            deck_layout: Vec::new(),
            deck_combos: Vec::new(),
            deck_devices: Vec::new(),
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

        for target in &mut self.targets {
            normalize_target(target, l)?;
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
        if !YOUTUBE_PRIVACY.contains(&s.youtube_privacy.as_str()) {
            s.youtube_privacy = default_youtube_privacy();
        }
        s.chat_sources.truncate(32);
        s.alert_sources.truncate(16);
        for source in &mut s.chat_sources {
            source.has_send_token = false;
            // The Twitch channel is written into an IRC line; CR/LF would start a new command.
            source.value.retain(|c| !c.is_control());
            source.name.retain(|c| !c.is_control());
        }
        for source in &mut s.alert_sources {
            source.has_token = false;
        }
        if !(1..=65_535).contains(&s.overlay_port) {
            return Err(Msg::ConfigInvalidOverlayPort.text(l));
        }
        // Privileged ports need elevation on some systems, and the overlay port is loopback-only.
        if !(1024..=65_535).contains(&s.deck_port) || s.deck_port == s.overlay_port {
            s.deck_port = default_deck_port();
        }
        crate::deck::normalize_combos(&mut s.deck_combos);
        let mut seen = std::collections::HashSet::new();
        s.deck_layout.retain(|action| {
            crate::deck::is_layout_key(action, &s.deck_combos) && seen.insert(action.clone())
        });
        s.deck_layout.truncate(crate::deck::MAX_KEYS);
        let mut device_ids = std::collections::HashSet::new();
        s.deck_devices
            .retain(|device| valid_id(&device.id) && device_ids.insert(device.id.clone()));
        for device in &mut s.deck_devices {
            device.name =
                crate::deck::device_name(&device.name, &Msg::DeckDefaultDeviceName.text(l));
        }
        s.deck_devices.truncate(crate::deck::MAX_DEVICES);
        s.overlay_duration_secs = s.overlay_duration_secs.clamp(1, 60);
        s.overlay_chat_size = s.overlay_chat_size.clamp(8, 72);
        s.overlay_chat_max = s.overlay_chat_max.clamp(1, 100);
        s.chat_font_size = s.chat_font_size.clamp(8, 44);
        s.alert_font_size = s.alert_font_size.clamp(8, 44);
        s.chat_both_split = s.chat_both_split.clamp(15, 75);
        // FFmpeg's loudnorm rejects targets outside -70..-5 LUFS, which would fail every transcode.
        if !(-70.0..=-5.0).contains(&s.loudness_target_lufs) {
            s.loudness_target_lufs = default_loudness_target();
        }
        if !matches!(s.theme.as_str(), "dark" | "light") {
            s.theme = default_theme();
        }
        s.record_video_keep_gb = s.record_video_keep_gb.clamp(1, 2048);
        s.record_video_dir = s.record_video_dir.trim().chars().take(400).collect();
        Ok(self)
    }
}

fn normalize_target(target: &mut Target, l: Locale) -> Result<(), String> {
    if !valid_id(&target.id) || !crate::platforms::is_destination(&target.platform_id) {
        return Err(Msg::ConfigInvalidTarget.text(l));
    }
    limited(l, Msg::ConfigLabelTargetName, &target.name, 120)?;
    if !matches!(target.protocol.as_str(), "rtmp" | "rtmps") {
        return Err(Msg::ConfigUnsupportedProtocol.text(l));
    }
    // A NUL cannot be passed in a process argument, so FFmpeg would fail to spawn at all.
    target
        .ingest_url
        .retain(|c| c.is_whitespace() || !c.is_control());
    // A destination is saved as soon as it is added, before its URL is filled in. The
    // frontend blocks going live with it, and the engine skips it.
    if !target.ingest_url.is_empty() {
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
    if let Some(p) = &target.encoding.preset {
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
    Ok(())
}

fn has_duplicates<'a>(ids: impl IntoIterator<Item = &'a str>) -> bool {
    let mut seen = std::collections::HashSet::new();
    ids.into_iter().any(|id| !seen.insert(id))
}

fn url_has_userinfo(url: &str) -> bool {
    url.split_once("://").is_some_and(|(_, rest)| {
        rest.split(['/', '?', '#'])
            .next()
            .is_some_and(|authority| authority.contains('@'))
    })
}

/// Only a plain absolute path on a local drive; an empty value selects the session directory.
fn is_local_absolute_dir(value: &str) -> bool {
    use std::path::{Component, Path};
    if value.is_empty() {
        return true;
    }
    if value.chars().any(char::is_control) {
        return false;
    }
    let path = Path::new(value);
    let mut components = path.components();
    let rooted = match components.next() {
        #[cfg(windows)]
        Some(Component::Prefix(prefix)) => {
            matches!(prefix.kind(), std::path::Prefix::Disk(_))
                && components.next() == Some(Component::RootDir)
        }
        #[cfg(not(windows))]
        Some(Component::RootDir) => true,
        _ => false,
    };
    rooted
        && path
            .components()
            .all(|c| !matches!(c, Component::ParentDir | Component::CurDir))
}

/// A settings file is untrusted input. Credentials and machine-local paths stay as they are on
/// this machine: exports blank the credentials, and Corneta stats and prunes the recording folder.
pub(crate) fn config_from_import(
    raw: &str,
    current: &AppConfig,
    l: Locale,
) -> Result<AppConfig, String> {
    let imported: AppConfig = serde_json::from_str(raw)
        .map_err(|e| Msg::ConfigImportInvalidJson { e: &e.to_string() }.text(l))?;
    let mut cfg = imported.validate_and_normalize_for_locale(l)?;
    for profile in &mut cfg.profiles {
        for target in &mut profile.targets {
            normalize_target(target, l)?;
        }
    }
    // Target IDs key the vault entry and the running FFmpeg; a duplicate would share both.
    let target_lists = std::iter::once(&cfg.targets).chain(cfg.profiles.iter().map(|p| &p.targets));
    for targets in target_lists {
        if has_duplicates(targets.iter().map(|t| t.id.as_str())) {
            return Err(Msg::ConfigInvalidTarget.text(l));
        }
        if let Some(target) = targets.iter().find(|t| url_has_userinfo(&t.ingest_url)) {
            return Err(Msg::ConfigInvalidIngestUrl { name: &target.name }.text(l));
        }
    }
    if has_duplicates(cfg.profiles.iter().map(|p| p.id.as_str())) {
        return Err(Msg::ConfigInvalidProfile.text(l));
    }
    let s = &mut cfg.settings;
    let mut chat_ids = std::collections::HashSet::new();
    s.chat_sources
        .retain(|source| valid_id(&source.id) && chat_ids.insert(source.id.clone()));
    let mut alert_ids = std::collections::HashSet::new();
    s.alert_sources
        .retain(|source| valid_id(&source.id) && alert_ids.insert(source.id.clone()));
    s.obs_password = current.settings.obs_password.clone();
    s.youtube_api_key = current.settings.youtube_api_key.clone();
    // An imported file cannot pair phones; pairing only happens through the PC prompt.
    s.deck_devices = current.settings.deck_devices.clone();
    if !is_local_absolute_dir(&s.record_video_dir) {
        s.record_video_dir = current.settings.record_video_dir.clone();
    }
    cfg.revision = current.revision.saturating_add(1);
    Ok(cfg)
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
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    crate::deck::config_saved(app, config);
    Ok(())
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

    #[test]
    fn youtube_audience_defaults_to_public_and_rejects_unknown_privacy() {
        let defaults = AppConfig::default().settings;
        assert_eq!(defaults.youtube_privacy, "public");
        assert!(!defaults.youtube_made_for_kids);

        for (privacy, expected) in [
            ("unlisted", "unlisted"),
            ("private", "private"),
            ("friends", "public"),
        ] {
            let mut cfg = AppConfig::default();
            cfg.settings.youtube_privacy = privacy.into();
            let cfg = cfg.validate_and_normalize().expect("valid configuration");
            assert_eq!(
                cfg.settings.youtube_privacy, expected,
                "privacy {privacy:?}"
            );
        }
    }

    fn missing_keys(
        input: &serde_json::Value,
        output: &serde_json::Value,
        path: &str,
        missing: &mut Vec<String>,
    ) {
        use serde_json::Value;
        match (input, output) {
            (Value::Object(input), Value::Object(output)) => {
                for (key, value) in input {
                    let field = format!("{path}.{key}");
                    match output.get(key) {
                        Some(kept) => missing_keys(value, kept, &field, missing),
                        None if !value.is_null() => missing.push(field),
                        None => {}
                    }
                }
            }
            (Value::Array(input), Value::Array(output)) => {
                for (index, (value, kept)) in input.iter().zip(output).enumerate() {
                    missing_keys(value, kept, &format!("{path}[{index}]"), missing);
                }
            }
            _ => {}
        }
    }

    #[test]
    fn destinations_without_a_url_yet_are_saved_but_malformed_urls_are_not() {
        let mut cfg = AppConfig::default();
        let mut pending = target_fixture("target_1");
        pending.ingest_url = String::new();
        cfg.targets.push(pending);
        assert!(cfg.validate_and_normalize().is_ok());

        for url in [
            "live.example.com/app",
            "rtmp://",
            "rtmp:// spaced.example.com/app",
            " ",
        ] {
            let mut cfg = AppConfig::default();
            let mut malformed = target_fixture("target_1");
            malformed.ingest_url = url.into();
            cfg.targets.push(malformed);
            assert!(
                cfg.validate_and_normalize().is_err(),
                "{url:?} must be rejected"
            );
        }
    }

    /// scripts/config-contract.test.ts regenerates this fixture from the TS factory and config
    /// operations, so a config the UI can produce must validate here without losing fields.
    #[test]
    fn ts_generated_configs_pass_validation_without_losing_fields() {
        let scenarios: Vec<serde_json::Value> =
            serde_json::from_str(include_str!("../tests/fixtures/config-contract.json"))
                .expect("valid fixture");
        assert!(!scenarios.is_empty());
        for scenario in scenarios {
            let name = scenario["name"].as_str().unwrap_or("unnamed");
            let input = &scenario["config"];
            let config: AppConfig = serde_json::from_value(input.clone())
                .unwrap_or_else(|error| panic!("{name}: Rust cannot read it: {error}"));
            let normalized = config
                .validate_and_normalize()
                .unwrap_or_else(|error| panic!("{name}: rejected: {error}"));
            let output = serde_json::to_value(&normalized).expect("serializable");
            let mut missing = Vec::new();
            missing_keys(input, &output, "", &mut missing);
            assert!(missing.is_empty(), "{name}: Rust drops {missing:?}");
        }
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

    use serde_json::{json, Value};

    const KEY: &str = "live_sk_abc123";
    #[cfg(windows)]
    const LOCAL_DIR: &str = r"C:\Corneta\Lives";
    #[cfg(not(windows))]
    const LOCAL_DIR: &str = "/srv/corneta/lives";

    /// The configuration already on this machine, holding its own credentials.
    fn local_config() -> AppConfig {
        AppConfig {
            revision: 7,
            settings: Settings {
                obs_password: "local-obs-password".into(),
                youtube_api_key: "local-api-key".into(),
                record_video_dir: LOCAL_DIR.into(),
                ..Settings::default()
            },
            ..AppConfig::default()
        }
    }

    /// What export_config writes: the same shape, with blank credentials.
    fn exported_file() -> Value {
        let mut cfg = AppConfig::default();
        cfg.targets.push(target_fixture("tgt_a1"));
        cfg.profiles.push(Profile {
            id: "prof_a1".into(),
            name: "Sexta".into(),
            mode: "hybrid".into(),
            targets: vec![target_fixture("tgt_a1")],
        });
        cfg.active_profile_id = "prof_a1".into();
        cfg.settings.chat_sources.push(ChatSource {
            id: "src_a1".into(),
            platform: "twitch".into(),
            value: "fulano".into(),
            name: String::new(),
            enabled: true,
            has_send_token: false,
        });
        cfg.settings.alert_sources.push(AlertSource {
            id: "alert_a1".into(),
            kind: "streamlabs".into(),
            name: String::new(),
            enabled: true,
            has_token: false,
        });
        serde_json::to_value(cfg).unwrap()
    }

    fn import(file: &Value) -> Result<AppConfig, String> {
        config_from_import(&file.to_string(), &local_config(), Locale::En)
    }

    fn edited(edit: impl FnOnce(&mut Value)) -> Value {
        let mut file = exported_file();
        edit(&mut file);
        file
    }

    #[test]
    fn importing_an_export_keeps_local_credentials_and_bumps_the_revision() {
        let cfg = import(&exported_file()).expect("an exported file must import");
        assert_eq!(cfg.settings.obs_password, "local-obs-password");
        assert_eq!(cfg.settings.youtube_api_key, "local-api-key");
        assert_eq!(cfg.revision, 8);
        assert_eq!(cfg.targets[0].id, "tgt_a1");
    }

    #[test]
    fn import_never_takes_credentials_from_the_file() {
        let file = edited(|file| {
            file["settings"]["obsPassword"] = json!("file-obs-password");
            file["settings"]["youtubeApiKey"] = json!("file-api-key");
            file["targets"][0]["hasKey"] = json!(true);
            file["targets"][0]["streamKey"] = json!(KEY);
            file["targets"][0]["key"] = json!(KEY);
            file["profiles"][0]["targets"][0]["hasKey"] = json!(true);
            file["profiles"][0]["targets"][0]["streamKey"] = json!(KEY);
            file["settings"]["chatSources"][0]["hasSendToken"] = json!(true);
            file["settings"]["chatSources"][0]["sendToken"] = json!(KEY);
            file["settings"]["alertSources"][0]["hasToken"] = json!(true);
            file["settings"]["alertSources"][0]["token"] = json!(KEY);
            file["vault"] = json!({ "tgt_a1": KEY, "oauth_twitch": KEY });
        });
        let cfg = import(&file).expect("unknown fields are ignored, not fatal");
        assert_eq!(cfg.settings.obs_password, "local-obs-password");
        assert_eq!(cfg.settings.youtube_api_key, "local-api-key");
        assert!(!cfg.targets[0].has_key);
        assert!(!cfg.profiles[0].targets[0].has_key);
        assert!(!cfg.settings.chat_sources[0].has_send_token);
        assert!(!cfg.settings.alert_sources[0].has_token);
        let saved = serde_json::to_string(&cfg).unwrap();
        for secret in [KEY, "file-obs-password", "file-api-key", "vault"] {
            assert!(!saved.contains(secret), "{secret} reached the saved config");
        }
    }

    type Edit = Box<dyn Fn(&mut Value)>;

    #[test]
    fn import_rejects_hostile_structure_and_values() {
        let url = |value: &'static str| {
            move |file: &mut Value| file["targets"][0]["ingestUrl"] = json!(value)
        };
        let cases: Vec<(&str, Edit)> = vec![
            (
                "targets is not a list",
                Box::new(|f| f["targets"] = json!("tgt_a1")),
            ),
            (
                "port is a string",
                Box::new(|f| f["ingest"]["port"] = json!("1935")),
            ),
            (
                "negative port",
                Box::new(|f| f["ingest"]["port"] = json!(-1)),
            ),
            ("huge port", Box::new(|f| f["ingest"]["port"] = json!(1e20))),
            (
                "port out of range",
                Box::new(|f| f["ingest"]["port"] = json!(70_000)),
            ),
            (
                "negative retention",
                Box::new(|f| f["settings"]["recordVideoKeepGb"] = json!(-5)),
            ),
            (
                "enabled is a string",
                Box::new(|f| f["targets"][0]["enabled"] = json!("yes")),
            ),
            (
                "schema from the future",
                Box::new(|f| f["schemaVersion"] = json!(999)),
            ),
            (
                "ingest open to the network",
                Box::new(|f| f["ingest"]["host"] = json!("0.0.0.0")),
            ),
            (
                "overlay port zero",
                Box::new(|f| f["settings"]["overlayPort"] = json!(0)),
            ),
            ("javascript URL", Box::new(url("javascript:alert(1)"))),
            ("file URL", Box::new(url("file:///C:/Windows/win.ini"))),
            (
                "credentials in the URL",
                Box::new(url("rtmp://user:live_sk_abc123@live.example/app")),
            ),
            (
                "line break in the URL",
                Box::new(url("rtmp://live.example/app\r\nX-Injected: 1")),
            ),
            (
                "traversal in a target id",
                Box::new(|f| f["targets"][0]["id"] = json!("../tgt_a1")),
            ),
            (
                "unknown platform",
                Box::new(|f| f["targets"][0]["platformId"] = json!("evil")),
            ),
            (
                "zero-width preset",
                Box::new(|f| {
                    f["targets"][0]["encoding"]["preset"] = json!({
                        "width": 0, "height": 720, "fps": 30,
                        "videoBitrateKbps": 6000, "audioBitrateKbps": 160, "keyframeSec": 2
                    });
                }),
            ),
            (
                "huge bitrate",
                Box::new(|f| {
                    f["targets"][0]["encoding"]["preset"] = json!({
                        "width": 1280, "height": 720, "fps": 30,
                        "videoBitrateKbps": 4_294_967_295u32, "audioBitrateKbps": 160, "keyframeSec": 2
                    });
                }),
            ),
            (
                "javascript URL in a profile",
                Box::new(|f| {
                    f["profiles"][0]["targets"][0]["ingestUrl"] = json!("javascript:alert(1)");
                }),
            ),
            (
                "credentials in a profile URL",
                Box::new(|f| {
                    f["profiles"][0]["targets"][0]["ingestUrl"] =
                        json!("rtmps://user:live_sk_abc123@live.example/app");
                }),
            ),
            (
                "traversal in a profile target id",
                Box::new(|f| {
                    f["profiles"][0]["targets"][0]["id"] = json!("../../vault");
                }),
            ),
            (
                "duplicated target id",
                Box::new(|f| {
                    let target = f["targets"][0].clone();
                    f["targets"].as_array_mut().unwrap().push(target);
                }),
            ),
            (
                "duplicated target id in a profile",
                Box::new(|f| {
                    let target = f["profiles"][0]["targets"][0].clone();
                    f["profiles"][0]["targets"]
                        .as_array_mut()
                        .unwrap()
                        .push(target);
                }),
            ),
            (
                "duplicated profile id",
                Box::new(|f| {
                    let profile = f["profiles"][0].clone();
                    f["profiles"].as_array_mut().unwrap().push(profile);
                }),
            ),
            (
                "too many targets",
                Box::new(|f| {
                    let targets: Vec<Value> = (0..=MAX_TARGETS)
                        .map(|i| serde_json::to_value(target_fixture(&format!("tgt_{i}"))).unwrap())
                        .collect();
                    f["targets"] = json!(targets);
                }),
            ),
            (
                "traversal in the active profile",
                Box::new(|f| f["activeProfileId"] = json!("../x")),
            ),
        ];
        for (name, edit) in cases {
            let error = import(&edited(|file| edit(file)))
                .expect_err(&format!("{name}: a hostile file must be rejected"));
            assert!(
                !error.contains(KEY),
                "{name}: the error echoes the key: {error}"
            );
        }
    }

    #[test]
    fn import_sanitizes_out_of_range_numbers() {
        for (field, value, check) in [
            (
                "recordVideoKeepGb",
                json!(u64::MAX),
                (|c: &Settings| c.record_video_keep_gb == 2048) as fn(&Settings) -> bool,
            ),
            ("recordVideoKeepGb", json!(0), |c| {
                c.record_video_keep_gb == 1
            }),
            ("loudnessTargetLufs", json!(1e300), |c| {
                c.loudness_target_lufs == -14.0
            }),
            ("loudnessTargetLufs", json!(-1e300), |c| {
                c.loudness_target_lufs == -14.0
            }),
            ("loudnessTargetLufs", json!(0), |c| {
                c.loudness_target_lufs == -14.0
            }),
            ("loudnessTargetLufs", json!(-16), |c| {
                c.loudness_target_lufs == -16.0
            }),
            ("chatBothSplit", json!(u32::MAX), |c| {
                c.chat_both_split == 75
            }),
            ("chatBothSplit", json!(0), |c| c.chat_both_split == 15),
            ("overlayDurationSecs", json!(u32::MAX), |c| {
                c.overlay_duration_secs == 60
            }),
            ("overlayChatMax", json!(0), |c| c.overlay_chat_max == 1),
            ("chatFontSize", json!(u32::MAX), |c| c.chat_font_size == 44),
        ] {
            let cfg = import(&edited(|file| file["settings"][field] = value.clone()))
                .unwrap_or_else(|error| panic!("{field}={value}: {error}"));
            assert!(
                check(&cfg.settings),
                "{field}={value} was not brought into range"
            );
        }
    }

    #[test]
    fn import_keeps_the_local_recording_folder_unless_the_file_names_a_plain_local_path() {
        for hostile in [
            r"..\..\Windows\System32",
            "../../etc",
            "recordings",
            r"\\attacker.example\share\lives",
            "//attacker.example/share/lives",
            r"\\?\C:\Lives",
            r"\\.\pipe\corneta",
            r"C:\Users\..\Windows",
            "C:relative",
            "/srv/../etc",
            "C:\\Lives\u{0}",
            "/srv/lives\u{0}",
        ] {
            let cfg = import(&edited(|file| {
                file["settings"]["recordVideoDir"] = json!(hostile)
            }))
            .unwrap_or_else(|error| panic!("{hostile:?}: {error}"));
            assert_eq!(cfg.settings.record_video_dir, LOCAL_DIR, "{hostile:?}");
        }
        #[cfg(windows)]
        let plain = r"D:\Lives";
        #[cfg(not(windows))]
        let plain = "/media/lives";
        for accepted in [plain, ""] {
            let cfg = import(&edited(|file| {
                file["settings"]["recordVideoDir"] = json!(accepted)
            }))
            .unwrap();
            assert_eq!(cfg.settings.record_video_dir, accepted);
        }
    }

    #[test]
    fn import_drops_chat_and_alert_sources_whose_ids_cannot_name_a_vault_entry() {
        let file = edited(|file| {
            let chat = file["settings"]["chatSources"][0].clone();
            let alert = file["settings"]["alertSources"][0].clone();
            for (list, first) in [("chatSources", chat), ("alertSources", alert)] {
                let mut entries = vec![first.clone(), first.clone()];
                for id in ["../oauth_twitch", "", "a b"] {
                    let mut entry = first.clone();
                    entry["id"] = json!(id);
                    entries.push(entry);
                }
                file["settings"][list] = json!(entries);
            }
        });
        let cfg = import(&file).unwrap();
        let chat: Vec<_> = cfg
            .settings
            .chat_sources
            .iter()
            .map(|s| s.id.as_str())
            .collect();
        let alerts: Vec<_> = cfg
            .settings
            .alert_sources
            .iter()
            .map(|s| s.id.as_str())
            .collect();
        assert_eq!(chat, ["src_a1"]);
        assert_eq!(alerts, ["alert_a1"]);
    }

    #[test]
    fn control_characters_cannot_reach_irc_or_process_arguments() {
        let mut cfg = AppConfig::default();
        let mut target = target_fixture("tgt_a1");
        target.ingest_url = "rtmp://live.example/app\u{0}\u{7f}".into();
        cfg.targets.push(target);
        cfg.settings.chat_sources.push(ChatSource {
            id: "src_a1".into(),
            platform: "twitch".into(),
            value: "fulano\r\nPRIVMSG #outro :spam".into(),
            name: "x\u{0}".into(),
            enabled: true,
            has_send_token: false,
        });
        let cfg = cfg.validate_and_normalize().unwrap();
        assert_eq!(cfg.targets[0].ingest_url, "rtmp://live.example/app");
        let source = &cfg.settings.chat_sources[0];
        assert!(
            !source.value.chars().any(char::is_control),
            "{:?}",
            source.value
        );
        assert!(!source.name.chars().any(char::is_control));
    }

    /// Nesting stays within the 2 MiB read limit and must not exhaust the stack.
    #[test]
    fn import_survives_deeply_nested_json() {
        let depth = 400_000;
        let nested = format!("{}{}", "[".repeat(depth), "]".repeat(depth));
        assert!((nested.len() as u64) < MAX_CONFIG_BYTES);
        let file = exported_file().to_string();
        let in_known_field = format!("{{\"targets\":{nested},{}", &file[1..]);
        assert!(config_from_import(&in_known_field, &local_config(), Locale::En).is_err());
        // serde_json skips unknown values iteratively, so this nesting is dropped, not parsed.
        let in_unknown_field = format!("{{\"extra\":{nested},{}", &file[1..]);
        let cfg = config_from_import(&in_unknown_field, &local_config(), Locale::En).unwrap();
        assert!(!serde_json::to_string(&cfg).unwrap().contains("extra"));
        assert_eq!(cfg.targets[0].id, "tgt_a1");
    }

    #[test]
    fn import_rejects_an_oversized_file_before_parsing_it() {
        let path = std::env::temp_dir().join(format!(
            "corneta-import-oversized-{}.json",
            uuid::Uuid::new_v4()
        ));
        std::fs::write(&path, vec![b' '; MAX_CONFIG_BYTES as usize + 1]).unwrap();
        let result = read_config_file(&path);
        let _ = std::fs::remove_file(&path);
        assert!(matches!(result, Err(ConfigReadError::TooLarge)));
    }
}
