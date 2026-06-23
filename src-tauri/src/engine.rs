//! Motor de relay: monta o comando FFmpeg a partir da config (decode-once → encode-N),
//! supervisiona o sidecar e emite status para a UI. Ver PLANEJAMENTO.md §8 e §14.2/§14.3.
use crate::config::{AppConfig, Target, VideoPreset};
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

/// Ação efetiva considerando o modo global.
pub fn effective_action(mode: &str, t: &Target) -> &'static str {
    match mode {
        "passthrough" => "copy",
        "per-platform" => "transcode",
        _ => {
            if t.encoding.action == "transcode" {
                "transcode"
            } else {
                "copy"
            }
        }
    }
}

/// Menor denominador comum de bitrate (modo "Encodar uma vez").
pub fn lowest_common_denominator(config: &AppConfig) -> u32 {
    config
        .targets
        .iter()
        .filter(|t| t.enabled)
        .map(|t| recommended_preset(&t.platform_id).video_bitrate_kbps)
        .min()
        .unwrap_or(6000)
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

/// Monta os argumentos do FFmpeg: 1 input, N outputs (copy e/ou transcode).
pub fn build_ffmpeg_args(config: &AppConfig, keys: &HashMap<String, String>) -> Vec<String> {
    let ingest = format!(
        "{}://{}:{}/{}/{}",
        config.ingest.protocol, config.ingest.host, config.ingest.port, config.ingest.app, config.ingest.key
    );
    let lcd = lowest_common_denominator(config);

    // FFmpeg LÊ do MediaMTX (servidor de ingestão) e distribui para os destinos
    // (decode-once → encode-N). O MediaMTX é quem escuta o OBS. Ver PLANEJAMENTO.md §6.2.
    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "warning".into(),
        "-stats".into(),
        "-i".into(),
        ingest,
    ];

    for t in config.targets.iter().filter(|t| t.enabled) {
        let key = keys.get(&t.id).cloned().unwrap_or_default();
        let url = output_url(t, &key);
        let action = effective_action(&config.mode, t);

        if action == "copy" {
            args.extend(["-map", "0", "-c", "copy", "-f", "flv"].map(String::from));
            args.push(url);
        } else {
            let p = t
                .encoding
                .preset
                .clone()
                .unwrap_or_else(|| recommended_preset(&t.platform_id));
            // No copy puro o áudio também é copiado; aqui recodificamos o vídeo.
            let video_kbps = if action == "copy" { lcd } else { p.video_bitrate_kbps };
            let codec = ffmpeg_video_codec(&t.encoding.encoder);
            let gop = (p.fps * p.keyframe_sec).to_string();

            args.extend(
                [
                    "-map",
                    "0:v",
                    "-vf",
                    &format!("scale={}:{}", p.width, p.height),
                    "-r",
                    &p.fps.to_string(),
                    "-c:v",
                    codec,
                    "-b:v",
                    &format!("{}k", video_kbps),
                    "-maxrate",
                    &format!("{}k", video_kbps),
                    "-bufsize",
                    &format!("{}k", video_kbps * 2),
                    "-g",
                    &gop,
                    "-map",
                    "0:a",
                    "-c:a",
                    "aac",
                    "-b:a",
                    &format!("{}k", p.audio_bitrate_kbps),
                    "-f",
                    "flv",
                    &url,
                ]
                .map(String::from),
            );
        }
    }

    args
}

/// Gera um mediamtx.yml mínimo: só o servidor RTMP de ingestão, na porta configurada.
/// Os demais servidores (RTSP/HLS/WebRTC/SRT/API) ficam desligados.
pub fn mediamtx_config(config: &AppConfig) -> String {
    format!(
        concat!(
            "logLevel: error\n",
            "logDestinations: [stdout]\n",
            "rtmp: yes\n",
            "rtmpAddress: {host}:{port}\n",
            "rtsp: no\n",
            "hls: no\n",
            "webrtc: no\n",
            "srt: no\n",
            "api: no\n",
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
    pub state: String, // idle | connecting | live | reconnecting | error
    pub bitrate_kbps: u32,
    pub fps: u32,
    pub dropped_frames: u32,
    pub uptime_sec: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Extrai o host de uma URL de ingestão (para casar erros do FFmpeg por destino).
pub fn host_of(ingest_url: &str) -> String {
    let s = ingest_url.split("://").nth(1).unwrap_or(ingest_url);
    let s = s.split('/').next().unwrap_or(s);
    s.split(':').next().unwrap_or(s).to_lowercase()
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EngineSnapshot {
    pub state: String, // stopped | starting | live | error
    pub started_at: Option<u128>,
    pub targets: HashMap<String, TargetStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl EngineSnapshot {
    pub fn stopped() -> Self {
        EngineSnapshot {
            state: "stopped".into(),
            started_at: None,
            targets: HashMap::new(),
            message: None,
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
        }
    }
}

/// Runtime guardado no state do Tauri (handles dos sidecars + último snapshot).
#[derive(Default)]
pub struct EngineRuntime {
    pub ffmpeg: Option<tauri_plugin_shell::process::CommandChild>,
    pub mediamtx: Option<tauri_plugin_shell::process::CommandChild>,
    /// Liga/desliga o supervisor de respawn do FFmpeg (reconexão).
    pub running: std::sync::Arc<std::sync::atomic::AtomicBool>,
    pub snapshot: Option<EngineSnapshot>,
    pub started_ms: u128,
    /// target_id -> host do destino (para atribuir erros do FFmpeg por plataforma).
    pub hosts: std::collections::HashMap<String, String>,
}
