//! Motor de relay: monta o comando FFmpeg a partir da config (decode-once → encode-N),
//! supervisiona o sidecar e emite status para a UI. Ver PLANEJAMENTO.md §8 e §14.2/§14.3.
use crate::config::{AppConfig, Reframe, Target, VideoPreset};
use serde::Serialize;
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Presets de referência (espelham src/lib/platforms.ts)
// ---------------------------------------------------------------------------
pub fn recommended_preset(platform_id: &str) -> VideoPreset {
    let v = |width, height, fps, vb, ab| VideoPreset {
        width,
        height,
        fps,
        video_bitrate_kbps: vb,
        audio_bitrate_kbps: ab,
        keyframe_sec: 2,
    };
    match platform_id {
        "twitch" => v(1920, 1080, 60, 6000, 160),
        "youtube" => v(1920, 1080, 60, 9000, 192),
        "facebook" => v(1280, 720, 30, 4000, 128),
        "kick" => v(1920, 1080, 60, 6000, 160),
        "tiktok" => v(720, 1280, 30, 3000, 128),
        "x" => v(1280, 720, 30, 3000, 128),
        "instagram" => v(720, 1280, 30, 2500, 128),
        _ => v(1920, 1080, 30, 4500, 160),
    }
}

/// No híbrido sem override: copia plataformas landscape, recodifica as verticais
/// (ex.: TikTok/Instagram), que precisam de formato diferente do stream do OBS.
fn smart_hybrid_action(platform_id: &str) -> &'static str {
    let r = recommended_preset(platform_id);
    if r.height > r.width {
        "transcode"
    } else {
        "copy"
    }
}

/// Ação efetiva considerando o modo global.
pub fn effective_action<'a>(mode: &str, t: &'a Target) -> &'a str {
    match mode {
        "passthrough" => "copy",
        "per-platform" => "transcode",
        // híbrido: override manual, senão decide sozinho.
        _ => match t.encoding.hybrid_override.as_deref() {
            Some(o) if !o.is_empty() => o,
            _ => smart_hybrid_action(&t.platform_id),
        },
    }
}

fn ffmpeg_video_codec(encoder: &str) -> &'static str {
    match encoder {
        "nvenc" => "h264_nvenc",
        "qsv" => "h264_qsv",
        "amf" => "h264_amf",
        "videotoolbox" => "h264_videotoolbox",
        _ => "libx264", // "software" e "auto" caem aqui (auto real escolheria o melhor disponível)
    }
}

/// URL completa de saída (destino + chave).
fn output_url(t: &Target, key: &str) -> String {
    format!("{}/{}", t.ingest_url.trim_end_matches('/'), key)
}

/// Filtro de vídeo pra saída vertical: recorta um 9:16 (posição/zoom do enquadramento)
/// do sinal landscape e escala pra resolução final — sem distorcer. A panorâmica usa o
/// espaço disponível `(iw - crop)`, então o recorte nunca sai da fonte (qualquer aspecto).
fn reframe_filter(reframe: Option<&Reframe>, out_w: u32, out_h: u32) -> String {
    let ar = out_w as f64 / out_h as f64;
    let (x, y, z) = match reframe {
        Some(r) => (r.x.clamp(0.0, 1.0), r.y.clamp(0.0, 1.0), r.zoom.clamp(0.25, 1.0)),
        None => (0.5, 0.5, 1.0), // centralizado, altura cheia
    };
    format!(
        "crop=ih*{z:.4}*{ar:.4}:ih*{z:.4}:(iw-ih*{z:.4}*{ar:.4})*{x:.4}:(ih-ih*{z:.4})*{y:.4},scale={out_w}:{out_h}"
    )
}

/// Monta os argumentos de UM FFmpeg para UM destino (lê do MediaMTX → 1 saída).
/// Um processo por plataforma → métricas REAIS por destino e reconexão independente.
/// URL de leitura ao vivo (ingestão do OBS).
pub fn ingest_url(config: &AppConfig) -> String {
    format!(
        "{}://{}:{}/{}/{}",
        config.ingest.protocol, config.ingest.host, config.ingest.port, config.ingest.app, config.ingest.key
    )
}
/// URL do sinal ATRASADO (republicado pelo delayer) — usada quando o delay de proteção está ligado.
pub fn delayed_url(config: &AppConfig) -> String {
    format!(
        "{}://{}:{}/{}/{}_delayed",
        config.ingest.protocol, config.ingest.host, config.ingest.port, config.ingest.app, config.ingest.key
    )
}

pub fn ffmpeg_args_for_target(
    config: &AppConfig,
    t: &Target,
    key: &str,
    br_override: Option<u32>,
    source_url: &str,
) -> Vec<String> {
    let ingest = source_url.to_string();
    let url = output_url(t, key);
    let action = effective_action(&config.mode, t);

    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "warning".into(),
        "-stats".into(),
        "-i".into(),
        ingest,
    ];

    if action == "copy" {
        // Vídeo sem reencode (lossless).
        args.extend(["-map", "0:v", "-c:v", "copy"].map(String::from));
    } else {
        let p = t
            .encoding
            .preset
            .clone()
            .unwrap_or_else(|| recommended_preset(&t.platform_id));
        let codec = ffmpeg_video_codec(&t.encoding.encoder);
        let gop = (p.fps * p.keyframe_sec).to_string();
        // Saída vertical → recorta/enquadra 9:16; saída landscape → só escala.
        let vf = if p.height > p.width {
            reframe_filter(t.encoding.reframe.as_ref(), p.width, p.height)
        } else {
            format!("scale={}:{}", p.width, p.height)
        };
        // Bitrate efetivo: o auto-bitrate pode estar empurrando um valor menor.
        let vbr = br_override.unwrap_or(p.video_bitrate_kbps);

        args.extend(
            [
                "-map", "0:v",
                "-vf", &vf,
                "-r", &p.fps.to_string(),
                "-c:v", codec,
                "-b:v", &format!("{vbr}k"),
                "-maxrate", &format!("{vbr}k"),
                "-bufsize", &format!("{}k", vbr * 2),
                "-g", &gop,
            ]
            .map(String::from),
        );
    }

    // Áudio: sempre AAC 48 kHz estéreo (todas as plataformas exigem AAC).
    // `0:a?` torna o mapeamento opcional, para não falhar se a fonte não tiver áudio.
    let audio_kbps = t
        .encoding
        .preset
        .as_ref()
        .map(|p| p.audio_bitrate_kbps)
        .unwrap_or_else(|| recommended_preset(&t.platform_id).audio_bitrate_kbps);
    args.extend(
        [
            "-map", "0:a?",
            "-c:a", "aac",
            "-ar", "48000",
            "-ac", "2",
            "-b:a", &format!("{}k", audio_kbps),
            "-f", "flv",
            &url,
        ]
        .map(String::from),
    );

    args
}

/// Porta do `zmq` do protetor (default do filtro — evita escapar `:` no filtergraph).
pub const GUARD_ZMQ_PORT: u16 = 5555;
/// Quantas tarjas o protetor pré-aloca (drawbox escondidos, controlados por zmq).
pub const GUARD_BOXES: usize = 6;

/// **Protetor**: UM FFmpeg persistente que lê a ingestão e republica em `_delayed`, aplicando:
/// - `zmq` (recebe comandos em tempo real → mover/mostrar/esconder as tarjas SEM reiniciar nada),
/// - `tpad`/`adelay` (delay de proteção, opcional → censura preventiva),
/// - N `drawbox` escondidos (w=0) que o guardião posiciona via zmq pra cobrir cada segredo.
///
/// As plataformas leem do `_delayed` e NUNCA reiniciam → zero drop, e a tarja segue o texto.
/// `hw_codec`: codec de hardware confirmado (ex.: "h264_nvenc") ou None → libx264 leve.
/// O encoder é o gargalo: ele PRECISA acompanhar o tempo real, senão o MediaMTX derruba o
/// leitor lento (I/O error → respawn em loop → live caindo). Hardware = custo de CPU ~zero.
pub fn ffmpeg_args_for_protector(
    config: &AppConfig,
    delay_sec: u32,
    hw_codec: Option<&str>,
) -> Vec<String> {
    // Vídeo: zmq → (tpad se delay) → drawboxes escondidos. drawbox DEPOIS do tpad: a tarja age
    // sobre o stream já atrasado, então dá pra cobrir o segredo ANTES dele airar (preventivo).
    let mut vf = String::from("zmq");
    if delay_sec > 0 {
        vf.push_str(&format!(",tpad=start_duration={delay_sec}:start_mode=clone"));
    }
    for i in 0..GUARD_BOXES {
        vf.push_str(&format!(",drawbox@b{i}=x=0:y=0:w=0:h=0:color=black@1.0:t=fill"));
    }

    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "warning".into(),
        "-i".into(),
        ingest_url(config),
        "-map".into(),
        "0:v".into(),
        "-vf".into(),
        vf,
    ];
    match hw_codec {
        // Hardware (GPU): só codec + caps de bitrate, como os destinos fazem (sem preset do libx264).
        Some(codec) => args.extend(
            [
                "-c:v", codec, "-b:v", "6000k", "-maxrate", "6000k", "-bufsize", "6000k", "-g",
                "120",
            ]
            .map(String::from),
        ),
        // Software: libx264 ultrafast + zerolatency (o mais leve possível na CPU).
        None => args.extend(
            [
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-tune",
                "zerolatency",
                "-b:v",
                "6000k",
                "-maxrate",
                "6000k",
                "-bufsize",
                "6000k",
                "-g",
                "120",
                "-pix_fmt",
                "yuv420p",
            ]
            .map(String::from),
        ),
    }
    args.push("-map".into());
    args.push("0:a?".into());
    if delay_sec > 0 {
        args.push("-af".into());
        args.push(format!("adelay=delays={}:all=1", delay_sec * 1000));
    }
    args.extend(
        ["-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "160k", "-f", "flv"].map(String::from),
    );
    args.push(delayed_url(config));
    args
}

/// Monta o FFmpeg do **slate "JÁ VOLTO"**: gera vídeo a partir de uma imagem (ou cor sólida)
/// + áudio silencioso e empurra pra plataforma — mantém a live de pé quando o sinal cai.
pub fn ffmpeg_args_for_slate(t: &Target, key: &str, slate_png: Option<&str>) -> Vec<String> {
    let url = output_url(t, key);
    let p = t
        .encoding
        .preset
        .clone()
        .unwrap_or_else(|| recommended_preset(&t.platform_id));
    let fps = p.fps.max(1);
    let gop = (fps * 2).to_string(); // keyframe 2s
    let vbitrate = p.video_bitrate_kbps.clamp(1000, 3000); // slate é leve
    let scale = format!("scale={}:{},format=yuv420p", p.width, p.height);

    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "warning".into(),
        "-stats".into(),
        "-re".into(),
    ];
    match slate_png {
        Some(path) => args.extend(["-loop", "1", "-i", path].map(String::from)),
        None => args.extend(
            [
                "-f",
                "lavfi",
                "-i",
                &format!("color=c=0x14100a:s={}x{}:r={fps}", p.width, p.height),
            ]
            .map(String::from),
        ),
    }
    // Áudio silencioso (a plataforma exige uma trilha).
    args.extend(
        [
            "-f", "lavfi",
            "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
        ]
        .map(String::from),
    );
    args.extend(
        [
            "-map", "0:v",
            "-vf", &scale,
            "-r", &fps.to_string(),
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-tune", "stillimage",
            "-b:v", &format!("{vbitrate}k"),
            "-maxrate", &format!("{vbitrate}k"),
            "-bufsize", &format!("{}k", vbitrate * 2),
            "-g", &gop,
            "-keyint_min", &gop,
            "-sc_threshold", "0",
            "-map", "1:a",
            "-c:a", "aac",
            "-ar", "48000",
            "-ac", "2",
            "-b:a", "128k",
            "-f", "flv",
            &url,
        ]
        .map(String::from),
    );
    args
}

/// Gera um mediamtx.yml mínimo: só o servidor RTMP de ingestão, na porta configurada.
/// Os demais servidores (RTSP/HLS/WebRTC/SRT/API) ficam desligados.
pub fn mediamtx_config(config: &AppConfig) -> String {
    format!(
        concat!(
            "logLevel: info\n",
            "logDestinations: [stdout]\n",
            // Folga de buffer + timeouts generosos: evita derrubar leitor/publisher que atrase um pouco.
            "writeQueueSize: 4096\n",
            "readTimeout: 20s\n",
            "writeTimeout: 20s\n",
            "rtmp: yes\n",
            "rtmpAddress: {host}:{port}\n",
            "rtsp: no\n",
            "hls: no\n",
            "webrtc: no\n",
            "srt: no\n",
            "api: yes\n",
            "apiAddress: 127.0.0.1:9997\n",
            "metrics: no\n",
            "pprof: no\n",
            "playback: no\n",
            "paths:\n",
            "  all_others:\n",
        ),
        host = config.ingest.host,
        port = config.ingest.port
    )
}

// ---------------------------------------------------------------------------
// Estado de execução (espelha EngineSnapshot do TS)
// ---------------------------------------------------------------------------
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TargetStatus {
    pub target_id: String,
    pub name: String,
    pub state: String, // idle | connecting | live | reconnecting | error | paused | waiting | brb
    pub bitrate_kbps: u32,
    pub fps: u32,
    pub dropped_frames: u32,
    pub uptime_sec: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EngineSnapshot {
    pub state: String, // stopped | starting | live | error
    pub started_at: Option<u128>,
    pub targets: HashMap<String, TargetStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// Uso real de CPU/GPU (%) enquanto transmite.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu: Option<f64>,
    /// Estatísticas do OBS (render/encode lag, congestionamento), se conectado.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub obs: Option<ObsStats>,
}

/// Estatísticas do OBS via obs-websocket `GetStats`/`GetStreamStatus`.
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ObsStats {
    pub active_fps: f64,
    pub avg_render_ms: f64,
    pub render_skipped: u32,
    pub output_skipped: u32,
    /// Congestionamento de saída (0..1) — alto = rede sofrendo.
    pub congestion: f64,
}

impl EngineSnapshot {
    pub fn stopped() -> Self {
        EngineSnapshot {
            state: "stopped".into(),
            started_at: None,
            targets: HashMap::new(),
            message: None,
            cpu: None,
            gpu: None,
            obs: None,
        }
    }

    /// Estado inicial: FFmpeg ouvindo, aguardando o OBS publicar.
    pub fn starting(config: &AppConfig, started_at: u128) -> Self {
        let mut s = Self::live(config, started_at);
        s.state = "starting".into();
        s
    }

    pub fn live(config: &AppConfig, started_at: u128) -> Self {
        let mut targets = HashMap::new();
        for t in config.targets.iter().filter(|t| t.enabled) {
            let p = t
                .encoding
                .preset
                .clone()
                .unwrap_or_else(|| recommended_preset(&t.platform_id));
            targets.insert(
                t.id.clone(),
                TargetStatus {
                    target_id: t.id.clone(),
                    name: t.name.clone(),
                    state: "connecting".into(),
                    bitrate_kbps: p.video_bitrate_kbps,
                    fps: p.fps,
                    dropped_frames: 0,
                    uptime_sec: 0.0,
                    message: None,
                },
            );
        }
        EngineSnapshot {
            state: "live".into(),
            started_at: Some(started_at),
            targets,
            message: None,
            cpu: None,
            gpu: None,
            obs: None,
        }
    }
}

/// Runtime guardado no state do Tauri (handles dos sidecars + último snapshot).
#[derive(Default)]
pub struct EngineRuntime {
    /// Um FFmpeg por destino (target_id -> processo).
    pub ffmpegs: std::collections::HashMap<String, tauri_plugin_shell::process::CommandChild>,
    pub mediamtx: Option<tauri_plugin_shell::process::CommandChild>,
    /// Liga/desliga os supervisores de respawn (reconexão).
    pub running: std::sync::Arc<std::sync::atomic::AtomicBool>,
    pub snapshot: Option<EngineSnapshot>,
    pub started_ms: u128,
    /// Última qualidade refletida no ícone da bandeja (evita redesenhar à toa).
    pub tray_quality: String,
    /// Arquivo NDJSON da sessão em gravação (relatório pós-live).
    pub session_path: Option<std::path::PathBuf>,
    /// Flag de pausa por destino (controle ao vivo): true = supervisor não sobe FFmpeg.
    pub paused: std::collections::HashMap<String, std::sync::Arc<std::sync::atomic::AtomicBool>>,
    /// Último emit pra UI (ms) — throttle das atualizações de métrica (mantém transições).
    pub last_emit_ms: u128,
}
