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

/// Enquadramento pra saída vertical: posição/zoom do recorte 9:16 sobre o sinal landscape.
/// `x`/`y` são panorâmica (0..1) do espaço disponível; `zoom` é a altura do recorte (0.25..1).
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
    /// "copy" | "transcode" (legado — não usado; o híbrido decide via hybrid_override/auto)
    pub action: String,
    #[serde(default)]
    pub preset: Option<VideoPreset>,
    /// "auto" | "nvenc" | "qsv" | "amf" | "videotoolbox" | "software"
    pub encoder: String,
    /// No modo híbrido: override manual ("copy"/"transcode"). None = decisão automática.
    #[serde(default)]
    pub hybrid_override: Option<String>,
    /// Enquadramento do recorte vertical (saída portrait). None = centralizado.
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
    /// Senha do obs-websocket (vazio = sem autenticação). Usada no auto-config do OBS.
    #[serde(default)]
    pub obs_password: String,
    /// Ligar/parar o OBS junto com o BORA AO VIVO (via obs-websocket).
    #[serde(default = "default_true")]
    pub auto_start_obs: bool,
    /// Atalho global pra começar/parar (acelerador do Tauri).
    #[serde(default = "default_live_shortcut")]
    pub live_shortcut: String,
    /// Chat: API key do YouTube Data API v3 (compartilhada entre as fontes do YouTube).
    #[serde(default)]
    pub youtube_api_key: String,
    /// Chat: lista de fontes (várias por plataforma).
    #[serde(default)]
    pub chat_sources: Vec<ChatSource>,
    /// Alertas: fontes externas (Streamlabs/StreamElements). Token vai no keyring, não aqui.
    #[serde(default)]
    pub alert_sources: Vec<AlertSource>,
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
    /// Tema da interface: "dark" | "light".
    #[serde(default = "default_theme")]
    pub theme: String,
    /// Tamanho da fonte do chat em pixels (slider). Aceita os antigos "sm/md/lg" salvos.
    #[serde(default = "default_font", deserialize_with = "de_font")]
    pub chat_font_size: u32,
    /// Layout do modo "Ambos" da janela do chat: "auto" | "row" (lado a lado) | "col" (empilhado).
    #[serde(default = "default_both_layout")]
    pub chat_both_layout: String,
    /// No modo "Ambos", mostrar os alertas antes do chat.
    #[serde(default)]
    pub chat_both_alerts_first: bool,
    /// Posição do divisor do modo "Ambos": % que o painel de alertas ocupa (15–75).
    #[serde(default = "default_both_split")]
    pub chat_both_split: u32,
    /// Proteção contra quedas: empurra um slate "JÁ VOLTO" pras plataformas se o sinal
    /// cair NO MEIO da live (só após já ter tido sinal) — mantém a transmissão de pé.
    #[serde(default = "default_true")]
    pub brb_enabled: bool,
    /// Auto-bitrate: baixa o bitrate de um destino que recodifica quando a banda aperta
    /// (e sobe de volta quando estabiliza). Só vale pra destinos em transcode.
    #[serde(default = "default_true")]
    pub auto_bitrate: bool,
    /// Guardião de privacidade: mostra a tela "JÁ VOLTO" quando um TERMO da watchlist aparece na
    /// tela, antes de ir ao ar (preventivo, via delay fixo). Sem termos, não faz nada.
    #[serde(default)]
    pub guardian_enabled: bool,
    /// Termos EXPLÍCITOS a vigiar (endereço, nome real, @, placa…). É o único gatilho da feature.
    #[serde(default)]
    pub guardian_watchlist: Vec<String>,
}

fn default_true() -> bool {
    true
}
fn default_live_shortcut() -> String {
    "CommandOrControl+Alt+L".to_string()
}
fn default_theme() -> String {
    "dark".to_string()
}
fn default_font() -> u32 {
    14
}
/// Tamanho da fonte: aceita número (px) ou os rótulos antigos "sm/md/lg".
fn de_font<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u32, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Sz {
        N(u32),
        S(String),
    }
    Ok(match Sz::deserialize(d)? {
        Sz::N(n) => n.clamp(10, 28),
        Sz::S(s) => match s.as_str() {
            "sm" => 12,
            "lg" => 16,
            _ => 14,
        },
    })
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

/// Uma fonte de alerta externa (agregador). O token NUNCA fica aqui — só no keyring,
/// sob a chave `alert_<id>`. `has_token` é recomputado no get_config (igual Target.has_key).
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
            theme: default_theme(),
            chat_font_size: default_font(),
            chat_both_layout: default_both_layout(),
            chat_both_alerts_first: false,
            chat_both_split: default_both_split(),
            brb_enabled: true,
            auto_bitrate: true,
            guardian_enabled: false,
            guardian_watchlist: Vec::new(),
        }
    }
}

fn default_both_split() -> u32 {
    35
}
fn default_both_layout() -> String {
    "auto".to_string()
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
        Ok(raw) => match serde_json::from_str(&raw) {
            Ok(cfg) => cfg,
            Err(e) => {
                log::error!("config.json inválido ({e}); preservando como .corrupt e usando o padrão");
                let ts = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                let _ = std::fs::rename(&path, path.with_extension(format!("corrupt-{ts}.json")));
                AppConfig::default()
            }
        },
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
