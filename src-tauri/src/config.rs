//! Modelo de configuração (espelha src/lib/types.ts) e persistência em disco.
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

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
    #[serde(default = "default_true")]
    pub chat_show_viewers: bool,
    /// Tema da interface: "dark" | "light".
    #[serde(default = "default_theme")]
    pub theme: String,
    /// Tamanho da fonte do chat em pixels (slider). Aceita os antigos "sm/md/lg" salvos.
    #[serde(default = "default_font", deserialize_with = "de_font")]
    pub chat_font_size: u32,
    /// Tamanho da fonte dos ALERTAS em pixels (slider próprio, igual ao do chat).
    #[serde(default = "default_font", deserialize_with = "de_font")]
    pub alert_font_size: u32,
    /// Layout do modo "Ambos" da janela do chat: "auto" | "row" (lado a lado) | "col" (empilhado).
    #[serde(default = "default_both_layout")]
    pub chat_both_layout: String,
    /// No modo "Ambos", mostrar os alertas antes do chat.
    #[serde(default)]
    pub chat_both_alerts_first: bool,
    /// Posição do divisor do modo "Ambos": % que o painel de alertas ocupa (15–75).
    #[serde(default = "default_both_split")]
    pub chat_both_split: u32,
    /// Proteção contra quedas: se o sinal cair NO MEIO da live, o slate "JÁ VOLTO" entra SEM
    /// derrubar a conexão das plataformas. Sem o Guardião, usa o SPLICER (copia o sinal do OBS
    /// pro programa, sem re-encode — quase não pesa, ver splicer.rs); com o Guardião, é o
    /// compositor que recodifica (delay de 12s). Padrão DESLIGADO.
    #[serde(default)]
    pub brb_enabled: bool,
    /// Tela "JÁ VOLTO": "auto" (gerada pela Corneta) | "image" | "video" (arquivo escolhido pelo
    /// usuário, salvo como brb-slate.* na pasta de config). Vídeo pode ter som.
    #[serde(default = "default_brb_slate_kind")]
    pub brb_slate_kind: String,
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
    /// Normalizador de ÁUDIO: acerta o volume (loudness) pro alvo antes de enviar, via `loudnorm`
    /// no encode que a Corneta JÁ faz por destino → quase sem custo e sem tocar no vídeo. Opt-in
    /// (padrão DESLIGADO): a passada única pode bombear e briga com quem já normaliza no OBS.
    #[serde(default)]
    pub loudness_normalize: bool,
    /// Alvo de loudness integrado (LUFS) do normalizador. -14 é o comum de Twitch/YouTube.
    #[serde(default = "default_loudness_target")]
    pub loudness_target_lufs: f64,
    /// YouTube automático: ao dar BORA, a Corneta cria a transmissão (broadcast) e injeta a
    /// chave RTMP do YouTube sozinha — o streamer não abre o YouTube Studio.
    #[serde(default = "default_true")]
    pub youtube_auto_live: bool,
    /// Título da live, lembrado entre sessões. Alimenta o broadcast automático do YouTube.
    #[serde(default)]
    pub stream_title: String,
    /// Conectar o chat sozinho quando a transmissão entra no ar.
    #[serde(default = "default_true")]
    pub chat_auto_connect: bool,
    /// Última aba usada na janela flutuante do chat: "chat" | "alerts" | "both".
    #[serde(default = "default_popout_tab")]
    pub chat_popout_tab: String,
    /// Painel de alertas da tela de Chat aberto (persistido entre visitas).
    #[serde(default)]
    pub chat_show_alerts_panel: bool,
    /// Overlay de alertas pro OBS: mantém o servidor local (Browser Source) de pé. A URL é fixa
    /// (porta abaixo) pra colar no OBS UMA vez. Só loopback — nome/valor de quem doou não vaza
    /// pra LAN. Padrão DESLIGADO.
    #[serde(default)]
    pub overlay_enabled: bool,
    /// Overlay: tocar um som (chime) quando um alerta aparece.
    #[serde(default = "default_true")]
    pub overlay_sound: bool,
    /// Overlay: posição do card na tela (top | bottom | center | top-left | top-right | …).
    #[serde(default = "default_overlay_position")]
    pub overlay_position: String,
    /// Overlay: porta do servidor local (URL fixa pro OBS). Troque se a 7393 estiver ocupada.
    #[serde(default = "default_overlay_port")]
    pub overlay_port: u32,
    /// Overlay do CHAT: de onde a lista cresce na tela ("bottom" | "top").
    #[serde(default = "default_overlay_chat_position")]
    pub overlay_chat_position: String,
    /// Overlay de alertas: quanto tempo cada card fica na tela (segundos).
    #[serde(default = "default_overlay_duration")]
    pub overlay_duration_secs: u32,
    /// Overlay de alertas: escala do card ("sm" | "md" | "lg").
    #[serde(default = "default_overlay_scale")]
    pub overlay_scale: String,
    /// Overlay de alertas: mostrar alertas de seguidor (os mais frequentes — dá pra esconder).
    #[serde(default = "default_true")]
    pub overlay_show_follows: bool,
    /// Overlay do chat: tamanho da fonte (px).
    #[serde(default = "default_overlay_chat_size")]
    pub overlay_chat_size: u32,
    /// Overlay do chat: máximo de mensagens na tela.
    #[serde(default = "default_overlay_chat_max")]
    pub overlay_chat_max: u32,
    /// Overlay do chat: mostrar os selos (mod/sub/vip).
    #[serde(default = "default_true")]
    pub overlay_chat_badges: bool,
    /// Overlay do chat: mostrar o pontinho da plataforma.
    #[serde(default = "default_true")]
    pub overlay_chat_platform: bool,
    /// Overlay do chat: esconder mensagens de comando (começam com "!").
    #[serde(default)]
    pub overlay_chat_hide_commands: bool,
    /// Overlay do chat: sumir com a mensagem após N segundos (0 = nunca).
    #[serde(default)]
    pub overlay_chat_fade_secs: u32,
    /// Nome original do arquivo custom do "JÁ VOLTO" (só exibição; o arquivo vira brb-slate.*).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub brb_slate_file_name: Option<String>,
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
        Sz::N(n) => n.clamp(8, 44),
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
    /// Tem token de envio no cofre (`chat_send_<id>`)? Recomputado no get_config.
    #[serde(default)]
    pub has_send_token: bool,
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
            chat_show_viewers: true,
            theme: default_theme(),
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
            mode: "hybrid".into(),
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
