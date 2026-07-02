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

/// Sanitiza um preset vindo da config: import_config aceita qualquer JSON, então os campos
/// não são confiáveis — clampa cada um numa faixa sã pra evitar overflow nos cálculos
/// derivados (`vbr * 2`, `fps * keyframe_sec`) e args absurdos no FFmpeg.
fn sanitize_preset(mut p: VideoPreset) -> VideoPreset {
    p.width = p.width.clamp(16, 7680);
    p.height = p.height.clamp(16, 7680);
    p.fps = p.fps.clamp(1, 240);
    p.video_bitrate_kbps = p.video_bitrate_kbps.clamp(100, 100_000);
    p.audio_bitrate_kbps = p.audio_bitrate_kbps.clamp(32, 512);
    p.keyframe_sec = p.keyframe_sec.clamp(1, 10);
    p
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

/// Codec de vídeo do FFmpeg pra escolha do usuário. `auto_codec` = o melhor encoder de
/// HARDWARE que realmente funciona nesta máquina (sondado com um encode de verdade em
/// `detect_hw_encoder` — a listagem `-encoders` mente), na prioridade NVENC > QSV > AMF >
/// VideoToolbox. "Automático" usa ele; sem hardware, x264.
fn ffmpeg_video_codec<'a>(encoder: &str, auto_codec: Option<&'a str>) -> &'a str {
    match encoder {
        "nvenc" => "h264_nvenc",
        "qsv" => "h264_qsv",
        "amf" => "h264_amf",
        "videotoolbox" => "h264_videotoolbox",
        "software" => "libx264",
        _ => auto_codec.unwrap_or("libx264"), // "auto": melhor hardware REAL, senão x264
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
    let cw = format!("min(iw\\,ih*{z:.4}*{ar:.4})");
    let ch = format!("ih*{z:.4}");
    format!("crop={cw}:{ch}:(iw-{cw})*{x:.4}:(ih-{ch})*{y:.4},scale={out_w}:{out_h}")
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
/// URL do **feed de programa** — o sinal contínuo republicado pelo compositor (com ou sem
/// delay do guardião). Os destinos leem DAQUI quando o compositor está ativo: como o encoder
/// do programa nunca para de publicar, a conexão com as plataformas nunca cai.
pub fn program_url(config: &AppConfig) -> String {
    format!(
        "{}://{}:{}/{}/{}_program",
        config.ingest.protocol, config.ingest.host, config.ingest.port, config.ingest.app, config.ingest.key
    )
}

/// Nome do path do programa na API do MediaMTX (`<app>/<key>_program`).
pub fn program_path_name(config: &AppConfig) -> String {
    format!("{}/{}_program", config.ingest.app, config.ingest.key)
}

/// Nome do path de ingestão na API do MediaMTX (`<app>/<key>`). Usado pra checar o sinal do
/// OBS SEM confundir com o publisher do próprio compositor (que fica em `_program`).
pub fn ingest_path_name(config: &AppConfig) -> String {
    format!("{}/{}", config.ingest.app, config.ingest.key)
}

pub fn ffmpeg_args_for_target(
    config: &AppConfig,
    t: &Target,
    key: &str,
    br_override: Option<u32>,
    source_url: &str,
    auto_codec: Option<&str>,
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
        let p = sanitize_preset(
            t.encoding
                .preset
                .clone()
                .unwrap_or_else(|| recommended_preset(&t.platform_id)),
        );
        let codec = ffmpeg_video_codec(&t.encoding.encoder, auto_codec);
        let fps = p.fps.max(1);
        let gop = (fps * p.keyframe_sec.max(1)).to_string();
        // Saída vertical → recorta/enquadra 9:16; saída landscape → só escala.
        let vf = if p.height > p.width {
            reframe_filter(t.encoding.reframe.as_ref(), p.width.max(2), p.height.max(2))
        } else {
            format!("scale={}:{}", p.width.max(2), p.height.max(2))
        };
        // Bitrate efetivo: o auto-bitrate pode estar empurrando um valor menor. O clamp
        // protege o `vbr * 2` do bufsize (o override parte do preset cru da config).
        let vbr = br_override.unwrap_or(p.video_bitrate_kbps).clamp(100, 100_000);

        args.extend(
            [
                "-map", "0:v",
                "-vf", &vf,
                "-r", &fps.to_string(),
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
        .clone()
        .map(|p| sanitize_preset(p).audio_bitrate_kbps)
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

/// Delay FIXO (s) do guardião de privacidade — não-configurável. É o mínimo que viabiliza a
/// proteção de forma PREVENTIVA mesmo numa tela SATURADA de texto (ex.: Google Search), onde o
/// OCR sobe pra ~6s (medido). A máquina do tempo só funciona se OCR < delay → 12s dá folga pro
/// OCR de tela cheia + pra re-confirmar um termo PARADO (cadência de OCR forçado + scan). A
/// transmissão inteira (e o chat) fica esse tanto atrás do tempo real — o preço da cobertura.
pub const GUARD_DELAY_SEC: u32 = 12;

// --- Compositor (feed de programa): vídeo CRU pelo nosso processo, saída CONTÍNUA ---
// O vídeo passa CRU por uma bomba no nosso processo e a saída (encoder → `_program`) nunca
// para: sinal caiu → a bomba injeta o slate "JÁ VOLTO" + silêncio NO MESMO fluxo, sem trocar
// processo — a conexão com as plataformas não cai. O guardião roda em cima disto (delay+OCR).
// Ver docs/FEATURE-PROTETOR-BUFFER.md.

/// Áudio do programa: sempre s16le 48 kHz estéreo (a bomba alinha vídeo e áudio por tick).
pub const PROG_AUDIO_HZ: u32 = 48_000;
pub const PROG_AUDIO_CH: u32 = 2;

/// Dimensões/taxa/bitrate do feed de programa.
#[derive(Clone, Copy, Debug)]
pub struct ProgramSpec {
    pub w: u32,
    pub h: u32,
    pub fps: u32,
    pub video_kbps: u32,
}

impl ProgramSpec {
    /// Bytes de um quadro yuv420p.
    pub fn frame_size(&self) -> usize {
        (self.w as usize) * (self.h as usize) * 3 / 2
    }
    /// Bytes de áudio (s16le estéreo 48 kHz) por quadro de vídeo — mantém A/V casados por tick.
    pub fn audio_bytes_per_frame(&self) -> usize {
        ((PROG_AUDIO_HZ * PROG_AUDIO_CH * 2) / self.fps.max(1)) as usize
    }
}

/// Deriva o spec do programa dos destinos ativos: fps acompanha o maior preset (cap 60;
/// TRAVADO em 30 com o guardião — o buffer de 12s a 60fps dobraria pra ~2 GB de RAM) e o
/// bitrate acompanha o maior destino (os "copy" empurram o encode do programa como está).
/// Resolução fixa 1920x1080 (fonte OBS típica; o scale normaliza qualquer entrada).
pub fn program_spec(config: &AppConfig, guard: bool) -> ProgramSpec {
    let mut max_fps = 30u32;
    let mut max_kbps = 4500u32;
    for t in config.targets.iter().filter(|t| t.enabled) {
        let p = sanitize_preset(
            t.encoding
                .preset
                .clone()
                .unwrap_or_else(|| recommended_preset(&t.platform_id)),
        );
        max_fps = max_fps.max(p.fps);
        max_kbps = max_kbps.max(p.video_bitrate_kbps);
    }
    ProgramSpec {
        w: 1920,
        h: 1080,
        fps: if guard { 30 } else { max_fps.clamp(30, 60) },
        video_kbps: max_kbps.clamp(2500, 12_000),
    }
}

/// **Decoder de vídeo**: lê o `live` e cospe vídeo CRU (yuv420p, tamanho/fps do spec) no
/// stdout, que a bomba lê. Sem áudio aqui (o áudio tem decoder próprio).
pub fn ffmpeg_args_for_decoder(config: &AppConfig, spec: &ProgramSpec) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        // Decodifica no HARDWARE (NVDEC na NVIDIA) — tira o custo da CPU. `auto` cai pra software
        // se não houver GPU, sem quebrar. O scale/fps seguem na CPU (leve).
        "-hwaccel".into(),
        "auto".into(),
        "-i".into(),
        ingest_url(config),
        "-map".into(),
        "0:v".into(),
        "-vf".into(),
        format!("scale={}:{},fps={}", spec.w, spec.h, spec.fps),
        "-f".into(),
        "rawvideo".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-".into(),
    ]
}

/// **Decoder de áudio**: lê o `live` e cospe PCM cru (s16le 48 kHz estéreo) no stdout.
/// Se a fonte não tiver áudio, o FFmpeg sai na hora (sem stream de saída) e a bomba
/// preenche com silêncio — mesma resiliência da queda de sinal.
pub fn ffmpeg_args_for_audio_decoder(config: &AppConfig) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-i".into(),
        ingest_url(config),
        "-vn".into(),
        "-map".into(),
        "0:a".into(),
        "-f".into(),
        "s16le".into(),
        "-ar".into(),
        PROG_AUDIO_HZ.to_string(),
        "-ac".into(),
        PROG_AUDIO_CH.to_string(),
        "-".into(),
    ]
}

/// **Decoder do slate-vídeo**: loop INFINITO do arquivo escolhido pelo usuário → vídeo CRU
/// no ritmo real (`-re`), pro slate animado entrar no MESMO fluxo do programa.
pub fn ffmpeg_args_for_slate_video(path: &str, spec: &ProgramSpec) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-stream_loop".into(),
        "-1".into(),
        "-re".into(),
        "-i".into(),
        path.into(),
        "-map".into(),
        "0:v".into(),
        "-vf".into(),
        format!("scale={}:{},fps={}", spec.w, spec.h, spec.fps),
        "-f".into(),
        "rawvideo".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-".into(),
    ]
}

/// **Decoder do áudio do slate-vídeo**: loop infinito da trilha do arquivo → PCM cru.
pub fn ffmpeg_args_for_slate_audio(path: &str) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-stream_loop".into(),
        "-1".into(),
        "-re".into(),
        "-i".into(),
        path.into(),
        "-vn".into(),
        "-map".into(),
        "0:a".into(),
        "-f".into(),
        "s16le".into(),
        "-ar".into(),
        PROG_AUDIO_HZ.to_string(),
        "-ac".into(),
        PROG_AUDIO_CH.to_string(),
        "-".into(),
    ]
}

/// **Encoder do programa**: lê o vídeo CRU da bomba (stdin) + o áudio CRU da bomba (TCP
/// loopback — a bomba é o servidor) e publica CONTINUAMENTE em `_program`. Como as duas
/// entradas vêm da bomba (que nunca para), este processo sobrevive à queda do OBS — e é
/// isso que mantém a conexão das plataformas de pé. A/V já chegam alinhados (a bomba emite
/// 1 quadro + N bytes de áudio por tick), então não há `adelay`.
pub fn ffmpeg_args_for_encoder(
    config: &AppConfig,
    spec: &ProgramSpec,
    hw_codec: Option<&str>,
    audio_port: u16,
) -> Vec<String> {
    let gop = (spec.fps * 2).to_string(); // keyframe 2s
    let vbr = spec.video_kbps;
    // CRÍTICO: `-analyzeduration 0 -probesize 32` nas DUAS entradas cruas. Os formatos são
    // 100% forçados por flag (rawvideo/s16le + tamanho/taxa), então a sondagem do
    // find_stream_info é inútil — e o padrão dela (~5 s de dados!) criava um deadlock:
    // o FFmpeg segurava o stdin do vídeo enquanto esperava áudio suficiente pra análise,
    // a bomba travava no write do quadro e o áudio parava de chegar. Círculo perfeito.
    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "warning".into(),
        // Entrada 0: vídeo cru da bomba (stdin).
        "-analyzeduration".into(),
        "0".into(),
        "-probesize".into(),
        "32".into(),
        "-f".into(),
        "rawvideo".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-s".into(),
        format!("{}x{}", spec.w, spec.h),
        "-r".into(),
        spec.fps.to_string(),
        "-i".into(),
        "-".into(),
        // Entrada 1: áudio cru da bomba (TCP local — o connect entra na backlog do listener,
        // então não há deadlock com o accept).
        "-analyzeduration".into(),
        "0".into(),
        "-probesize".into(),
        "32".into(),
        "-f".into(),
        "s16le".into(),
        "-ar".into(),
        PROG_AUDIO_HZ.to_string(),
        "-ac".into(),
        PROG_AUDIO_CH.to_string(),
        "-i".into(),
        format!("tcp://127.0.0.1:{audio_port}"),
        "-map".into(),
        "0:v".into(),
        "-map".into(),
        "1:a".into(),
    ];
    match hw_codec {
        Some(codec) => args.extend(
            [
                "-c:v", codec,
                "-b:v", &format!("{vbr}k"),
                "-maxrate", &format!("{vbr}k"),
                "-bufsize", &format!("{}k", vbr * 2),
                "-g", &gop,
            ]
            .map(String::from),
        ),
        None => args.extend(
            [
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-b:v", &format!("{vbr}k"),
                "-maxrate", &format!("{vbr}k"),
                "-bufsize", &format!("{}k", vbr * 2),
                "-g", &gop,
                "-keyint_min", &gop,
                "-sc_threshold", "0",
                "-pix_fmt", "yuv420p",
            ]
            .map(String::from),
        ),
    }
    args.extend(
        [
            "-c:a", "aac",
            "-ar", "48000",
            "-ac", "2",
            "-b:a", "160k",
            "-f", "flv",
        ]
        .map(String::from),
    );
    args.push(program_url(config));
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
    /// Trava de sessão: `true` enquanto UM start_engine está no ar (ou subindo). É reivindicada
    /// ATOMICAMENTE sob o lock no topo do start (antes de qualquer trabalho lento) e solta por
    /// kill_engine/erro fatal — impede TOCTOU (dois cliques em BORA subindo dois motores).
    pub live: bool,
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
