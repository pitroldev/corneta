//! Modelo de configuração (espelha src/lib/types.ts) e persistência em disco.
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VideoPreset {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub video_bitrate_kbps: u32,
    pub audio_bitrate_kbps: u32,
    pub keyframe_sec: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TargetEncoding {
    /// "copy" | "transcode" (legado — não usado; o híbrido decide via hybrid_override/auto)
    pub action: String,
    #[serde(default)]
    pub preset: Option<VideoPreset>,
    /// "auto" | "nvenc" | "qsv" | "amf" | "videotoolbox" | "software"
    pub encoder: String,
    /// No modo híbrido: override manual ("copy"/"transcode"). None = decisão automática.
    #[serde(default)]
    pub hybrid_override: Option<String>,
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
    /// Senha do obs-websocket (vazio = sem autenticação). Usada no auto-config do OBS.
    #[serde(default)]
    pub obs_password: String,
    /// Chat: API key do YouTube Data API v3 (compartilhada entre as fontes do YouTube).
    #[serde(default)]
    pub youtube_api_key: String,
    /// Chat: lista de fontes (várias por plataforma).
    #[serde(default)]
    pub chat_sources: Vec<ChatSource>,
    /// Exibição do chat.
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
}

fn default_true() -> bool {
    true
}

/// Uma fonte de chat (um canal de uma plataforma).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatSource {
    pub id: String,
    pub platform: String, // twitch | youtube | kick
    pub value: String,    // canal/slug/vídeo
    #[serde(default)]
    pub name: String,
    pub enabled: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            minimize_to_tray: true,
            autostart: false,
            obs_password: String::new(),
            youtube_api_key: String::new(),
            chat_sources: Vec::new(),
            chat_show_emotes: true,
            chat_show_badges: true,
            chat_show_platform: true,
            chat_show_source: false,
            chat_show_timestamps: false,
        }
    }
}

/// Um perfil salvo = um conjunto de destinos + modo de encoding.
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
    pub ingest: IngestConfig,
    /// "per-platform" | "passthrough" | "hybrid"
    pub mode: String,
    pub targets: Vec<Target>,
    #[serde(default)]
    pub settings: Settings,
    /// Perfis salvos (espelham o working set ativo). Migrados no frontend se vazios.
    #[serde(default)]
    pub profiles: Vec<Profile>,
    #[serde(default)]
    pub active_profile_id: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            ingest: IngestConfig {
                protocol: "rtmp".into(),
                host: "127.0.0.1".into(),
                port: 1935,
                app: "live".into(),
                key: "obs".into(),
            },
            mode: "per-platform".into(),
            targets: vec![],
            settings: Settings::default(),
            profiles: vec![],
            active_profile_id: String::new(),
        }
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

pub fn load(app: &AppHandle) -> AppConfig {
    let path = match config_path(app) {
        Ok(p) => p,
        Err(_) => return AppConfig::default(),
    };
    match std::fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
}

pub fn save(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let raw = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(&path, raw).map_err(|e| e.to_string())
}
