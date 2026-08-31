//! Modelo de configuração (espelha src/lib/types.ts) e persistência em disco.
use crate::i18n::{self, Locale, Msg};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub const CURRENT_SCHEMA_VERSION: u32 = 1;
const MAX_TARGETS: usize = 32;
const MAX_PROFILES: usize = 20;

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

/// O rótulo entra como `Msg` (não como `&str`) porque a frase é MONTADA: o texto do
/// rótulo é uma mensagem própria, renderizada no mesmo idioma da moldura.
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
    /// Idioma da interface: "auto" | "pt-BR" | "en". Em "auto" segue o idioma
    /// do Windows. O Rust também lê isto: as mensagens de erro que ele devolve
    /// aparecem na tela, então precisam sair no idioma escolhido.
    #[serde(default = "default_language")]
    pub language: String,
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
    /// GRAVAÇÃO da live (vídeo do programa em disco, pro replay do relatório).
    ///
    /// Padrão DESLIGADO, e é uma decisão de produto, não de implementação: a 6000 kbps são
    /// ~2,7 GB/hora. Ligar isso sem o streamer pedir encheria o SSD de alguém em duas
    /// semanas. Ver docs/FEATURE-GRAVACAO-E-REPLAY.md §2.
    #[serde(default)]
    pub record_video: bool,
    /// Pasta das gravações. VAZIO = pasta de sessões, resolvida na hora.
    ///
    /// Vazio em vez de um caminho concreto de propósito: este config viaja entre perfis e é
    /// lido pelo Rust e pelo TS — um caminho gravado amarraria a configuração a uma máquina
    /// e continuaria errado depois que o `app_data_dir` mudasse.
    #[serde(default)]
    pub record_video_dir: String,
    /// Teto de disco das gravações, em GB. A poda de vídeo é por ESPAÇO (a de sessões é por
    /// contagem): 50 relatórios são alguns MB, 50 vídeos são centenas de GB.
    #[serde(default = "default_record_keep_gb")]
    pub record_video_keep_gb: u64,
    /// GRAVAÇÃO do chat (mensagens com autor e texto, pro replay).
    ///
    /// Chave SEPARADA da de vídeo porque os motivos de recusar cada uma são diferentes: uma
    /// custa disco, a outra guarda dado pessoal de terceiros na máquina do streamer.
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
    pub platform: String, // twitch | youtube | kick | cinefy
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
            // As duas gravações nascem DESLIGADAS: uma custa disco, a outra guarda dado
            // pessoal de terceiros. Nenhuma das duas é decisão da Corneta.
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
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub revision: u64,
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
    pub fn validate_and_normalize(mut self) -> Result<Self, String> {
        // UMA leitura do idioma ativo pra função inteira: duas leituras poderiam divergir
        // se o streamer trocasse o idioma no meio da validação.
        let l = i18n::locale();
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
            let expected = format!("{}://", target.protocol);
            if !target.ingest_url.starts_with(&expected)
                || target.ingest_url.len() > 2_048
                || target.ingest_url[expected.len()..]
                    .trim_matches('/')
                    .is_empty()
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
        // Teto de gravação: 1 GB não cabe nem meia hora e o zero desligaria a retenção
        // (deixando o disco crescer sem freio). 2 TB é o limite de sanidade.
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

pub fn load(app: &AppHandle) -> AppConfig {
    let path = match config_path(app) {
        Ok(p) => p,
        Err(_) => return AppConfig::default(),
    };
    match std::fs::read_to_string(&path) {
        Ok(raw) if raw.len() <= 2 * 1024 * 1024 => {
            match serde_json::from_str::<serde_json::Value>(&raw) {
                Ok(value) => {
                    let old_schema = value
                        .get("schemaVersion")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as u32;
                    match serde_json::from_value::<AppConfig>(value)
                        .map_err(|e| e.to_string())
                        .and_then(AppConfig::validate_and_normalize)
                    {
                        Ok(cfg) => {
                            if old_schema < CURRENT_SCHEMA_VERSION {
                                let backup =
                                    path.with_extension(format!("schema-{old_schema}.json.bak"));
                                let _ = std::fs::copy(&path, backup);
                                if let Err(e) = save(app, &cfg) {
                                    log::warn!("não foi possível persistir a migração: {e}");
                                }
                            }
                            cfg
                        }
                        Err(e) => {
                            log::error!("config.json rejeitado: {e}");
                            AppConfig::default()
                        }
                    }
                }
                Err(e) => {
                    log::error!(
                        "config.json inválido ({e}); preservando como .corrupt e usando o padrão"
                    );
                    let ts = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    let _ =
                        std::fs::rename(&path, path.with_extension(format!("corrupt-{ts}.json")));
                    AppConfig::default()
                }
            }
        }
        Ok(_) => {
            log::error!("config.json excede o limite de 2 MiB");
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

    fn alvo(id: &str) -> Target {
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

    // ------------------------------------------------------------------
    // O contrato que sustenta "minha chave sumiu"
    // ------------------------------------------------------------------
    //
    // A stream key NUNCA entra no config.json: ela vive no cofre do Windows,
    // indexada pelo `target.id`. O `has_key` daqui é só um espelho, recomputado a
    // cada `get_config` com `keys::has_key(&t.id)`.
    //
    // Disso saem dois invariantes, e quebrar qualquer um faz a chave "sumir" da
    // tela sem ter sumido do cofre.

    /// 1. O ID do destino é a CHAVE DE BUSCA no cofre. Se a normalização o
    ///    reescrevesse, a credencial ficaria órfã: continua gravada, mas ninguém
    ///    mais acha — que é exatamente o sintoma "sumiu a chave".
    #[test]
    fn normalizar_nao_pode_reescrever_o_id_do_destino() {
        let mut cfg = AppConfig::default();
        let ids = ["target_1", "target-abc", "a", "A_9-z"];
        for id in ids {
            cfg.targets.push(alvo(id));
        }
        cfg.profiles.push(Profile {
            id: "perfil_1".into(),
            name: "Live de sexta".into(),
            mode: "per-platform".into(),
            targets: ids.iter().map(|id| alvo(id)).collect(),
        });
        let cfg = cfg.validate_and_normalize().expect("config válida");

        assert_eq!(
            cfg.targets
                .iter()
                .map(|t| t.id.as_str())
                .collect::<Vec<_>>(),
            ids,
            "id de destino mudou na normalização — a chave no cofre vira órfã"
        );
        assert_eq!(
            cfg.profiles[0]
                .targets
                .iter()
                .map(|t| t.id.as_str())
                .collect::<Vec<_>>(),
            ids,
            "id dentro do perfil mudou — mesma órfã, só que ao trocar de perfil"
        );
        assert_eq!(cfg.targets.len(), ids.len(), "destino sumiu da config");
    }

    /// 2. `has_key` NUNCA é persistido como `true`. Um `true` velho no disco faria
    ///    a tela jurar que a chave está lá depois de ela ter sido apagada do cofre
    ///    — e o erro só apareceria ao vivo, na recusa da plataforma.
    #[test]
    fn has_key_nunca_e_persistido_como_verdadeiro() {
        let mut cfg = AppConfig::default();
        let mut com_chave = alvo("target_1");
        com_chave.has_key = true;
        cfg.targets.push(com_chave.clone());
        cfg.profiles.push(Profile {
            id: "perfil_1".into(),
            name: "Podcast".into(),
            mode: "hybrid".into(),
            targets: vec![com_chave],
        });

        let cfg = cfg.validate_and_normalize().expect("config válida");
        assert!(
            !cfg.targets[0].has_key,
            "has_key foi persistido — o disco passaria a mentir sobre o cofre"
        );
        assert!(
            !cfg.profiles[0].targets[0].has_key,
            "has_key persistido dentro do perfil"
        );
    }

    /// O `valid_id` é o mesmo portão do `validate_secret_namespace`: id que passa
    /// aqui tem que servir de chave no cofre, senão salvar a chave falha depois
    /// que o destino já existe na tela.
    #[test]
    fn todo_id_de_destino_aceito_serve_de_chave_no_cofre() {
        for id in ["target_1", "abc", "A-9_z"] {
            let mut cfg = AppConfig::default();
            cfg.targets.push(alvo(id));
            assert!(
                cfg.validate_and_normalize().is_ok(),
                "id {id:?} recusado na config"
            );
            assert!(
                validate_secret_namespace(id).is_ok(),
                "id {id:?} vale na config mas não vale no cofre"
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
