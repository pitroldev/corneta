use crate::config::{AppConfig, Reframe, Target, VideoPreset};
use serde::Serialize;
use std::collections::HashMap;

// Keep default presets aligned with src/lib/platforms.ts.
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

// Imported presets are untrusted; bound derived bitrate/GOP arithmetic and FFmpeg arguments.
fn sanitize_preset(mut p: VideoPreset) -> VideoPreset {
    p.width = p.width.clamp(16, 7680);
    p.height = p.height.clamp(16, 7680);
    p.fps = p.fps.clamp(1, 240);
    p.video_bitrate_kbps = p.video_bitrate_kbps.clamp(100, 100_000);
    p.audio_bitrate_kbps = p.audio_bitrate_kbps.clamp(32, 512);
    p.keyframe_sec = p.keyframe_sec.clamp(1, 10);
    p
}

/// Shared by encoding and reports so the displayed preset matches the actual output.
pub(crate) fn effective_preset(t: &Target) -> VideoPreset {
    sanitize_preset(
        t.encoding
            .preset
            .clone()
            .unwrap_or_else(|| recommended_preset(&t.platform_id)),
    )
}

fn smart_hybrid_action(platform_id: &str) -> &'static str {
    let r = recommended_preset(platform_id);
    if r.height > r.width {
        "transcode"
    } else {
        "copy"
    }
}

pub fn effective_action<'a>(mode: &str, t: &'a Target) -> &'a str {
    match mode {
        "passthrough" => "copy",
        "per-platform" => "transcode",
        _ => match t.encoding.hybrid_override.as_deref() {
            Some(o) if !o.is_empty() => o,
            _ => smart_hybrid_action(&t.platform_id),
        },
    }
}

/// `auto_codec` must pass a real encode probe; `-encoders` does not prove hardware availability.
fn ffmpeg_video_codec<'a>(encoder: &str, auto_codec: Option<&'a str>) -> &'a str {
    match encoder {
        "nvenc" => "h264_nvenc",
        "qsv" => "h264_qsv",
        "amf" => "h264_amf",
        "videotoolbox" => "h264_videotoolbox",
        "software" => "libx264",
        _ => auto_codec.unwrap_or("libx264"),
    }
}

fn output_url(t: &Target, key: &str) -> String {
    compose_output_url(&t.ingest_url, key)
}

fn compose_output_url(ingest_url: &str, key: &str) -> String {
    let base = ingest_url.trim();
    let key = key.trim().trim_start_matches('/');

    if key.is_empty() {
        return base.trim_end_matches('/').to_string();
    }

    for placeholder in ["{stream_key}", "{streamKey}", "{key}"] {
        if base.contains(placeholder) {
            return base.replacen(placeholder, key, 1);
        }
    }

    // Queries must follow the combined path/key, not become part of the stream key.
    let (base_path, base_query) = base.split_once('?').unwrap_or((base, ""));
    let (key_path, key_query) = key.split_once('?').unwrap_or((key, ""));
    let base_path = base_path.trim_end_matches('/');

    // Require a slash boundary when deduplicating embedded keys, including hierarchical keys.
    let key_in_path = base_path
        .strip_suffix(key_path)
        .is_some_and(|prefix| prefix.ends_with('/'));
    let key_in_query = base_query.split('&').any(|part| {
        let value = part.split_once('=').map_or(part, |(_, value)| value);
        value == key_path
    });
    let already_has_key = key_in_path || key_in_query;
    let path = if already_has_key || key_path.is_empty() {
        base_path.to_string()
    } else {
        format!("{base_path}/{key_path}")
    };

    let query = match (base_query.is_empty(), key_query.is_empty()) {
        (true, true) => String::new(),
        (false, true) => format!("?{base_query}"),
        (true, false) => format!("?{key_query}"),
        (false, false) => format!("?{base_query}&{key_query}"),
    };
    format!("{path}{query}")
}

// Pan within the remaining source area so crops cannot extend beyond the input.
fn reframe_filter(reframe: Option<&Reframe>, out_w: u32, out_h: u32) -> String {
    let ar = out_w as f64 / out_h as f64;
    let (x, y, z) = match reframe {
        Some(r) => (
            r.x.clamp(0.0, 1.0),
            r.y.clamp(0.0, 1.0),
            r.zoom.clamp(0.25, 1.0),
        ),
        None => (0.5, 0.5, 1.0),
    };
    let cw = format!("min(iw\\,ih*{z:.4}*{ar:.4})");
    let ch = format!("ih*{z:.4}");
    format!("crop={cw}:{ch}:(iw-{cw})*{x:.4}:(ih-{ch})*{y:.4},scale={out_w}:{out_h}")
}

pub fn ingest_url(config: &AppConfig) -> String {
    format!(
        "{}://{}:{}/{}/{}",
        config.ingest.protocol,
        config.ingest.host,
        config.ingest.port,
        config.ingest.app,
        config.ingest.key
    )
}
/// The compositor publishes continuously here, keeping destination connections alive during input loss.
pub fn program_url(config: &AppConfig) -> String {
    format!(
        "{}://{}:{}/{}/{}_program",
        config.ingest.protocol,
        config.ingest.host,
        config.ingest.port,
        config.ingest.app,
        config.ingest.key
    )
}

pub fn program_path_name(config: &AppConfig) -> String {
    format!("{}/{}_program", config.ingest.app, config.ingest.key)
}

/// Check OBS input independently from the compositor's `_program` publisher.
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
        args.extend(["-map", "0:v", "-c:v", "copy"].map(String::from));
    } else {
        let p = effective_preset(t);
        let codec = ffmpeg_video_codec(&t.encoding.encoder, auto_codec);
        let fps = p.fps.max(1);
        let gop = (fps * p.keyframe_sec.max(1)).to_string();
        let vf = if p.height > p.width {
            reframe_filter(t.encoding.reframe.as_ref(), p.width.max(2), p.height.max(2))
        } else {
            format!("scale={}:{}", p.width.max(2), p.height.max(2))
        };
        // Overrides originate in raw config; bound them before computing `vbr * 2`.
        let vbr = br_override
            .unwrap_or(p.video_bitrate_kbps)
            .clamp(100, 100_000);

        args.extend(
            [
                "-map",
                "0:v",
                "-vf",
                &vf,
                "-r",
                &fps.to_string(),
                "-c:v",
                codec,
                "-b:v",
                &format!("{vbr}k"),
                "-maxrate",
                &format!("{vbr}k"),
                "-bufsize",
                &format!("{}k", vbr * 2),
                "-g",
                &gop,
            ]
            .map(String::from),
        );
    }

    // Optional mapping permits video-only sources.
    let audio_kbps = effective_preset(t).audio_bitrate_kbps;
    args.extend(["-map", "0:a?"].map(String::from));
    // Shared renditions normalize once; their egresses must not repeat this filter.
    if config.settings.loudness_normalize {
        args.push("-af".into());
        args.push(format!(
            "loudnorm=I={:.1}:TP=-1.5:LRA=11",
            config.settings.loudness_target_lufs
        ));
    }

    if t.platform_id == "custom" {
        // Some custom ingests require OBS-compatible publisher metadata and a separate playpath.
        args.extend(
            [
                "-rtmp_flashver",
                "WIN 10,0,32,18",
                "-rtmp_playpath",
                key.trim().trim_start_matches('/'),
                "-tcp_nodelay",
                "1",
            ]
            .map(String::from),
        );
    }
    args.extend(
        [
            "-c:a",
            "aac",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-b:a",
            &format!("{}k", audio_kbps),
            "-f",
            "flv",
            &url,
        ]
        .map(String::from),
    );

    // Only the raw Guardian program guarantees AAC-LC/48k/stereo/160k; other sources must be encoded.
    let known_audio = config.settings.guardian_enabled
        && config
            .settings
            .guardian_watchlist
            .iter()
            .any(|term| !term.trim().is_empty())
        && source_url == program_url(config)
        && audio_kbps == 160
        && !config.settings.loudness_normalize;
    if known_audio {
        copy_encoded_audio(&mut args);
    }
    args
}

fn copy_encoded_audio(args: &mut Vec<String>) {
    let mut index = 0;
    while index + 1 < args.len() {
        match args[index].as_str() {
            "-ar" | "-ac" | "-b:a" | "-af" => {
                args.drain(index..index + 2);
            }
            "-c:a" => {
                args[index + 1] = "copy".into();
                index += 2;
            }
            _ => index += 1,
        }
    }
}

/// Renditions already satisfy the target codec contract; preserve only destination-specific transport.
pub(crate) fn ffmpeg_args_for_rendition_egress(
    config: &AppConfig,
    target: &Target,
    key: &str,
    source: &str,
) -> Vec<String> {
    let mut config = config.clone();
    config.mode = "passthrough".into();
    config.settings.loudness_normalize = false;
    let mut args = ffmpeg_args_for_target(&config, target, key, None, source, None);
    copy_encoded_audio(&mut args);
    args
}

/// Must exceed full-frame OCR plus stationary-text rescan latency to keep protection preventive.
pub const GUARD_DELAY_SEC: u32 = 12;

/// Program PCM is s16le, 48 kHz stereo, aligned to video ticks.
pub const PROG_AUDIO_HZ: u32 = 48_000;
pub const PROG_AUDIO_CH: u32 = 2;

#[derive(Clone, Copy, Debug)]
pub struct ProgramSpec {
    pub w: u32,
    pub h: u32,
    pub fps: u32,
    pub video_kbps: u32,
}

impl ProgramSpec {
    /// Size of one yuv420p frame in bytes.
    pub fn frame_size(&self) -> usize {
        (self.w as usize) * (self.h as usize) * 3 / 2
    }
    /// PCM bytes per video tick; truncation follows the fixed-rate pump contract.
    pub fn audio_bytes_per_frame(&self) -> usize {
        ((PROG_AUDIO_HZ * PROG_AUDIO_CH * 2) / self.fps.max(1)) as usize
    }
}

// Guardian OCR is calibrated at 1080p; other streams can use 720p unless a target needs more.
fn program_resolution(config: &AppConfig, guard: bool) -> (u32, u32) {
    let enabled: Vec<&Target> = config.targets.iter().filter(|t| t.enabled).collect();
    let needs_full_hd = guard
        || enabled.is_empty()
        || enabled.iter().any(|t| {
            let p = effective_preset(t);
            p.height > p.width || p.width.min(p.height) > 720
        });
    if needs_full_hd {
        (1920, 1080)
    } else {
        (1280, 720)
    }
}

// Guardian stays at 30 fps to bound the raw delay buffer; copy targets inherit the program bitrate.
pub fn program_spec(config: &AppConfig, guard: bool) -> ProgramSpec {
    let mut max_fps = 30u32;
    let mut max_kbps = 4500u32;
    for t in config.targets.iter().filter(|t| t.enabled) {
        let p = effective_preset(t);
        max_fps = max_fps.max(p.fps);
        max_kbps = max_kbps.max(p.video_bitrate_kbps);
    }
    let (w, h) = program_resolution(config, guard);
    ProgramSpec {
        w,
        h,
        fps: if guard { 30 } else { max_fps.clamp(30, 60) },
        video_kbps: max_kbps.clamp(2500, 12_000),
    }
}

/// Decodes live video to yuv420p on stdout; audio uses a separate decoder.
pub fn ffmpeg_args_for_decoder(config: &AppConfig, spec: &ProgramSpec) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        // `auto` permits software fallback when hardware decoding is unavailable.
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

/// Missing audio ends this decoder; the program pump supplies silence instead.
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

/// Pace the looping file to wall time so it can replace live frames in the continuous program.
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

/// The pump supplies aligned video on stdin and PCM over loopback, even while OBS is disconnected.
pub fn ffmpeg_args_for_encoder(
    config: &AppConfig,
    spec: &ProgramSpec,
    hw_codec: Option<&str>,
    audio_port: u16,
) -> Vec<String> {
    let gop = (spec.fps * 2).to_string();
    let vbr = spec.video_kbps;
    // Disable probing on both fully specified raw inputs: waiting for audio analysis can block
    // video writes in the same pump that supplies the audio, deadlocking startup.
    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "warning".into(),
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
        // Loopback connect can queue before the pump accepts.
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
                "-c:v",
                codec,
                "-b:v",
                &format!("{vbr}k"),
                "-maxrate",
                &format!("{vbr}k"),
                "-bufsize",
                &format!("{}k", vbr * 2),
                "-g",
                &gop,
            ]
            .map(String::from),
        ),
        None => args.extend(
            [
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-b:v",
                &format!("{vbr}k"),
                "-maxrate",
                &format!("{vbr}k"),
                "-bufsize",
                &format!("{}k", vbr * 2),
                "-g",
                &gop,
                "-keyint_min",
                &gop,
                "-sc_threshold",
                "0",
                "-pix_fmt",
                "yuv420p",
            ]
            .map(String::from),
        ),
    }
    args.extend(
        [
            "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "160k", "-f", "flv",
        ]
        .map(String::from),
    );
    args.push(program_url(config));
    args
}

/// Enable only RTMP ingest and a loopback-only diagnostic API.
pub fn mediamtx_config(config: &AppConfig) -> String {
    format!(
        concat!(
            "logLevel: info\n",
            "logDestinations: [stdout]\n",
            // Allow brief reader/publisher stalls without dropping their connections.
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

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TargetStatus {
    pub target_id: String,
    pub name: String,
    pub state: String, // idle | connecting | live | reconnecting | error | paused | waiting | signal-lost | brb
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
    /// OBS input can be live even when no destination accepts output.
    pub ingest_live: bool,
    /// Opaque attempt ID, safe to include in copied diagnostics.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub operation_id: Option<String>,
    /// Set only for a native failure already recorded and redacted.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_id: Option<String>,
    pub targets: HashMap<String, TargetStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// CPU and GPU usage are percentages.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memory_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub obs: Option<ObsStats>,
    /// Manual slate activation, independent of input loss.
    pub forced_brb: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub guardian_status: Option<crate::guardian::GuardianStatus>,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ObsStats {
    pub active_fps: f64,
    pub avg_render_ms: f64,
    pub render_skipped: u32,
    pub output_skipped: u32,
    /// Output congestion as a ratio in 0..1.
    pub congestion: f64,
}

impl EngineSnapshot {
    pub fn stopped() -> Self {
        EngineSnapshot {
            state: "stopped".into(),
            started_at: None,
            ingest_live: false,
            operation_id: None,
            error_id: None,
            targets: HashMap::new(),
            message: None,
            cpu: None,
            gpu: None,
            memory_pct: None,
            obs: None,
            forced_brb: false,
            guardian_status: None,
        }
    }

    pub fn starting(config: &AppConfig, started_at: u128) -> Self {
        let mut s = Self::live(config, started_at);
        s.state = "starting".into();
        s
    }

    pub fn live(config: &AppConfig, started_at: u128) -> Self {
        let mut targets = HashMap::new();
        for t in config.targets.iter().filter(|t| t.enabled) {
            targets.insert(
                t.id.clone(),
                TargetStatus {
                    target_id: t.id.clone(),
                    name: t.name.clone(),
                    state: "connecting".into(),
                    // Do not seed metrics from presets: only measured output may appear healthy.
                    bitrate_kbps: 0,
                    fps: 0,
                    dropped_frames: 0,
                    uptime_sec: 0.0,
                    message: None,
                },
            );
        }
        EngineSnapshot {
            state: "live".into(),
            started_at: Some(started_at),
            ingest_live: false,
            operation_id: None,
            error_id: None,
            targets,
            message: None,
            cpu: None,
            gpu: None,
            memory_pct: None,
            obs: None,
            forced_brb: false,
            guardian_status: (config.settings.guardian_enabled
                && config
                    .settings
                    .guardian_watchlist
                    .iter()
                    .any(|term| term.trim().chars().count() >= 3))
            .then_some(crate::guardian::GuardianStatus::Starting),
        }
    }
}

/// Bitrate changes are in kbps and require the supervisor to restart the encoder.
pub enum BitrateAction {
    Hold,
    Down(u32),
    Up(u32),
}

/// AIMD controller; cooldown counts speed samples because each change reconnects the destination.
pub struct AutoBitrate {
    base: u32,
    floor: u32,
    current: u32,
    slow: u32,
    fast: u32,
    cooldown: u32,
}

impl AutoBitrate {
    const SLOW: f64 = 0.9;
    const SEVERE: f64 = 0.6;
    const COOLDOWN: u32 = 5;
    const RECOVER: u32 = 45;
    const NEED_MILD: u32 = 8;
    const NEED_SEVERE: u32 = 3;

    pub fn new(base: u32, floor: u32) -> Self {
        let floor = floor.min(base);
        Self {
            base,
            floor,
            current: base,
            slow: 0,
            fast: 0,
            cooldown: 0,
        }
    }

    pub fn current(&self) -> u32 {
        self.current
    }

    /// Preserve bitrate and cooldown across the restart caused by the last bitrate change.
    pub fn on_reconnect(&mut self) {
        self.slow = 0;
        self.fast = 0;
    }

    /// Up/Down decisions also update `current`.
    pub fn on_speed(&mut self, speed: f64) -> BitrateAction {
        if self.cooldown > 0 {
            self.cooldown -= 1;
        }
        if speed < Self::SLOW {
            self.fast = 0;
            self.slow += 1;
            if self.cooldown == 0 && self.current > self.floor {
                let severe = speed < Self::SEVERE;
                let need = if severe {
                    Self::NEED_SEVERE
                } else {
                    Self::NEED_MILD
                };
                if self.slow >= need {
                    let cut = if severe { 0.6 } else { 0.8 };
                    let next = ((self.current as f64 * cut) as u32).max(self.floor);
                    if next < self.current {
                        self.current = next;
                        self.slow = 0;
                        self.cooldown = Self::COOLDOWN;
                        return BitrateAction::Down(next);
                    }
                }
            }
        } else {
            self.slow = 0;
            self.fast += 1;
            if self.cooldown == 0 && self.fast >= Self::RECOVER && self.current < self.base {
                // Additive recovery avoids overshooting into another congestion/restart cycle.
                let step = (self.base / 8).max(300);
                let next = (self.current + step).min(self.base);
                self.current = next;
                self.fast = 0;
                self.cooldown = Self::COOLDOWN;
                return BitrateAction::Up(next);
            }
        }
        BitrateAction::Hold
    }
}

#[derive(Clone)]
pub struct RecorderLaunch {
    /// Must match the source read by destinations, whether live or composited.
    pub source: String,
    pub dir: std::path::PathBuf,
    pub session_path: std::path::PathBuf,
    pub id: String,
}

#[derive(Default)]
pub struct EngineRuntime {
    pub ffmpegs: std::collections::HashMap<String, tauri_plugin_shell::process::CommandChild>,
    pub mediamtx: Option<tauri_plugin_shell::process::CommandChild>,
    /// Claim under the engine mutex before startup work; release on stop/fatal error to prevent double starts.
    pub live: bool,
    /// Hold from updater download through restart; startup checks the same engine mutex.
    pub update_in_progress: bool,
    /// Background work can outlive `live`; reserve under the mutex before exposing stopped state.
    pub pending_activity: std::sync::Arc<std::sync::atomic::AtomicUsize>,
    pub running: std::sync::Arc<std::sync::atomic::AtomicBool>,
    pub snapshot: Option<EngineSnapshot>,
    pub started_ms: u128,
    /// Cached to avoid redrawing an unchanged tray icon.
    pub tray_quality: String,
    /// Cached to avoid a window-title update on every metric emission.
    pub win_title: String,
    pub session_path: Option<std::path::PathBuf>,
    /// Retry must reuse the original source, not recompute a possibly changed compositor decision.
    pub recorder_launch: Option<RecorderLaunch>,
    /// A true flag prevents the target supervisor from respawning FFmpeg.
    pub paused: std::collections::HashMap<String, std::sync::Arc<std::sync::atomic::AtomicBool>>,
    /// Terminal failures park the supervisor until retry_target clears the flag.
    pub auth_error:
        std::collections::HashMap<String, std::sync::Arc<std::sync::atomic::AtomicBool>>,
    /// Available only while the compositor is running.
    pub force_brb: Option<std::sync::Arc<std::sync::atomic::AtomicBool>>,
    /// Revalidate `live` and this generation after awaits so stopped/superseded setup cannot install children.
    pub start_gen: u64,
    /// Throttle metrics in milliseconds without suppressing state transitions.
    pub last_emit_ms: u128,
    /// Random operation ID; never derive it from target names or IDs.
    pub operation_id: Option<String>,
    /// Map target IDs to safe platform enums; target IDs must not enter telemetry.
    pub target_platforms: std::collections::HashMap<String, String>,
    pub telemetry_encoder_kind: String,
    /// Aggregate off the hot path and emit only at session end.
    pub telemetry_reconnect_count: u32,
    /// Request time in Unix ms; unlike started_ms, it is not reset when output first goes live.
    pub telemetry_start_requested_ms: u128,
    /// Reference the existing setup error without capturing the exception twice.
    pub telemetry_last_error_id: Option<String>,
    /// Bind the last error to its operation so stale diagnostics cannot attach to a new start.
    pub telemetry_last_error_operation_id: Option<String>,
}

/// Keep updates excluded until background work ends; cancellation releases without locking the engine.
#[must_use = "Keep the activity guard alive until all reserved work finishes"]
pub struct EngineActivityGuard {
    pending: std::sync::Arc<std::sync::atomic::AtomicUsize>,
}

impl EngineRuntime {
    /// Call only while holding the engine mutex, before releasing/spawning the work.
    pub fn begin_pending_activity(&self) -> EngineActivityGuard {
        self.pending_activity
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        EngineActivityGuard {
            pending: self.pending_activity.clone(),
        }
    }
}

impl Drop for EngineActivityGuard {
    fn drop(&mut self) {
        self.pending
            .fetch_sub(1, std::sync::atomic::Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{IngestConfig, Settings, TargetEncoding};

    #[test]
    fn pending_activity_outlives_stopped_state_until_every_owner_finishes() {
        use std::sync::atomic::Ordering;
        use std::sync::Mutex;

        let engine = Mutex::new(EngineRuntime::default());
        let (cleanup, recording, pending) = {
            let mut runtime = engine.lock().unwrap();
            runtime.live = true;
            let cleanup = runtime.begin_pending_activity();
            let recording = runtime.begin_pending_activity();
            runtime.live = false;
            runtime.snapshot = Some(EngineSnapshot::stopped());
            (cleanup, recording, runtime.pending_activity.clone())
        };
        assert_eq!(pending.load(Ordering::Acquire), 2);
        drop(cleanup);
        assert_eq!(pending.load(Ordering::Acquire), 1);
        drop(recording);
        assert_eq!(pending.load(Ordering::Acquire), 0);
    }

    #[test]
    fn unpolled_activity_is_reserved_and_released_when_cancelled() {
        use std::sync::atomic::Ordering;
        use std::sync::Mutex;

        let engine = Mutex::new(EngineRuntime::default());
        let (activity, pending) = {
            let runtime = engine.lock().unwrap();
            (
                runtime.begin_pending_activity(),
                runtime.pending_activity.clone(),
            )
        };
        let task = async move {
            let _activity = activity;
            std::future::pending::<()>().await;
        };
        assert_eq!(pending.load(Ordering::Acquire), 1);
        drop(task);
        assert_eq!(pending.load(Ordering::Acquire), 0);
    }

    #[tokio::test]
    async fn aborting_pending_activity_releases_its_reservation() {
        use std::sync::atomic::Ordering;
        use std::sync::Mutex;

        let engine = Mutex::new(EngineRuntime::default());
        let (activity, pending) = {
            let runtime = engine.lock().unwrap();
            (
                runtime.begin_pending_activity(),
                runtime.pending_activity.clone(),
            )
        };
        let (ready, waiting) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(async move {
            let _activity = activity;
            ready.send(()).unwrap();
            std::future::pending::<()>().await;
        });
        waiting.await.unwrap();
        assert_eq!(pending.load(Ordering::Acquire), 1);
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        assert_eq!(pending.load(Ordering::Acquire), 0);
    }

    fn preset(w: u32, h: u32, fps: u32, vb: u32) -> VideoPreset {
        VideoPreset {
            width: w,
            height: h,
            fps,
            video_bitrate_kbps: vb,
            audio_bitrate_kbps: 160,
            keyframe_sec: 2,
        }
    }
    fn tgt(platform: &str, preset: Option<VideoPreset>) -> Target {
        Target {
            id: "t".into(),
            platform_id: platform.into(),
            name: platform.into(),
            enabled: true,
            protocol: "rtmp".into(),
            ingest_url: "rtmp://x/app".into(),
            has_key: true,
            encoding: TargetEncoding {
                action: "transcode".into(),
                preset,
                encoder: "auto".into(),
                hybrid_override: None,
                reframe: None,
            },
        }
    }
    fn cfg(mode: &str, targets: Vec<Target>) -> AppConfig {
        AppConfig {
            schema_version: crate::config::CURRENT_SCHEMA_VERSION,
            revision: 0,
            ingest: IngestConfig {
                protocol: "rtmp".into(),
                host: "127.0.0.1".into(),
                port: 1935,
                app: "live".into(),
                key: "obs".into(),
            },
            mode: mode.into(),
            targets,
            settings: Settings::default(),
            profiles: vec![],
            active_profile_id: String::new(),
        }
    }

    #[test]
    fn audio_copy_requires_a_proven_program_contract() {
        let target = tgt("twitch", Some(preset(1280, 720, 30, 4000)));
        let mut config = cfg("per-platform", vec![target.clone()]);
        config.settings.guardian_enabled = true;
        config.settings.guardian_watchlist = vec!["private".into()];
        let audio = |config: &AppConfig, target: &Target, source: &str| {
            let args = ffmpeg_args_for_target(config, target, "key", None, source, None);
            args.windows(2).find(|pair| pair[0] == "-c:a").unwrap()[1].clone()
        };
        assert_eq!(audio(&config, &target, &program_url(&config)), "copy");
        assert_eq!(audio(&config, &target, "rtmp://127.0.0.1/live/obs"), "aac");
        let mut different = target.clone();
        different
            .encoding
            .preset
            .as_mut()
            .unwrap()
            .audio_bitrate_kbps = 128;
        assert_eq!(audio(&config, &different, &program_url(&config)), "aac");
        config.settings.loudness_normalize = true;
        assert_eq!(audio(&config, &target, &program_url(&config)), "aac");
        config.settings.loudness_normalize = false;
        config.settings.guardian_watchlist.clear();
        assert_eq!(audio(&config, &target, &program_url(&config)), "aac");
    }

    #[test]
    fn rendition_egress_copies_both_tracks_but_preserves_custom_handshake() {
        let target = tgt("custom", None);
        let mut config = cfg("per-platform", vec![target.clone()]);
        config.settings.loudness_normalize = true;
        let args = ffmpeg_args_for_rendition_egress(
            &config,
            &target,
            "secret-key",
            "rtmp://127.0.0.1/live/rendition",
        );
        for flag in ["-c:v", "-c:a"] {
            assert!(args.windows(2).any(|pair| pair == [flag, "copy"]));
        }
        assert!(!args
            .iter()
            .any(|arg| ["-vf", "-af", "-b:v", "-b:a"].contains(&arg.as_str())));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["-rtmp_playpath", "secret-key"]));
        assert_eq!(args.last().unwrap(), "rtmp://x/app/secret-key");
    }

    #[test]
    fn rendition_groups_compare_the_complete_effective_encoding() {
        let first = tgt("twitch", Some(preset(1280, 720, 30, 4000)));
        let mut second = first.clone();
        second.id = "b".into();
        second.platform_id = "custom".into();
        second.ingest_url = "rtmp://another/app".into();
        let grouped = |second: Target| {
            crate::renditions::plan(
                &cfg("per-platform", vec![first.clone(), second]),
                "source",
                Some("h264_nvenc"),
            )
        };
        assert_eq!(grouped(second.clone())[0].targets, ["t", "b"]);
        for field in [
            "audio", "bitrate", "fps", "gop", "width", "encoder", "disabled",
        ] {
            let mut different = second.clone();
            let p = different.encoding.preset.as_mut().unwrap();
            match field {
                "audio" => p.audio_bitrate_kbps = 128,
                "bitrate" => p.video_bitrate_kbps = 3500,
                "fps" => p.fps = 60,
                "gop" => p.keyframe_sec = 1,
                "width" => p.width = 1920,
                "encoder" => different.encoding.encoder = "software".into(),
                "disabled" => different.enabled = false,
                _ => unreachable!(),
            }
            assert!(grouped(different).is_empty(), "must not group {field}");
        }
        assert!(
            crate::renditions::plan(&cfg("passthrough", vec![first, second]), "source", None)
                .is_empty()
        );
    }

    #[test]
    fn effective_action_by_mode() {
        assert_eq!(
            effective_action("passthrough", &tgt("twitch", None)),
            "copy"
        );
        assert_eq!(
            effective_action("per-platform", &tgt("twitch", None)),
            "transcode"
        );
        assert_eq!(effective_action("hybrid", &tgt("twitch", None)), "copy");
        assert_eq!(
            effective_action("hybrid", &tgt("tiktok", None)),
            "transcode"
        );
    }

    #[test]
    fn effective_action_respects_override() {
        let mut t = tgt("twitch", None);
        t.encoding.hybrid_override = Some("transcode".into());
        assert_eq!(effective_action("hybrid", &t), "transcode");
    }

    #[test]
    fn video_codec_mapping() {
        assert_eq!(ffmpeg_video_codec("nvenc", None), "h264_nvenc");
        assert_eq!(ffmpeg_video_codec("software", None), "libx264");
        assert_eq!(ffmpeg_video_codec("auto", Some("h264_qsv")), "h264_qsv");
        assert_eq!(ffmpeg_video_codec("auto", None), "libx264");
    }

    #[test]
    fn sanitize_clamps_absurd_values() {
        let p = sanitize_preset(preset(999_999, 0, 999, 5));
        assert_eq!(p.width, 7680);
        assert_eq!(p.height, 16);
        assert_eq!(p.fps, 240);
        assert_eq!(p.video_bitrate_kbps, 100);
    }

    #[test]
    fn effective_preset_is_single_source() {
        let t = tgt("twitch", None);
        assert_eq!(
            effective_preset(&t),
            sanitize_preset(recommended_preset("twitch"))
        );
        let t2 = tgt("twitch", Some(preset(999_999, 1080, 60, 6000)));
        assert_eq!(effective_preset(&t2).width, 7680);
    }

    #[test]
    fn program_resolution_adapts() {
        let c = cfg(
            "hybrid",
            vec![tgt("facebook", Some(preset(1280, 720, 30, 4000)))],
        );
        assert_eq!(program_resolution(&c, false), (1280, 720));
        let c2 = cfg(
            "hybrid",
            vec![tgt("twitch", Some(preset(1920, 1080, 60, 6000)))],
        );
        assert_eq!(program_resolution(&c2, false), (1920, 1080));
        let c3 = cfg(
            "hybrid",
            vec![tgt("tiktok", Some(preset(720, 1280, 30, 3000)))],
        );
        assert_eq!(program_resolution(&c3, false), (1920, 1080));
        assert_eq!(program_resolution(&c, true), (1920, 1080));
    }

    #[test]
    fn program_spec_fps_and_bitrate() {
        let c = cfg(
            "hybrid",
            vec![tgt("twitch", Some(preset(1920, 1080, 60, 6000)))],
        );
        assert_eq!(program_spec(&c, false).fps, 60);
        assert_eq!(program_spec(&c, true).fps, 30);
        let low = cfg(
            "hybrid",
            vec![tgt("facebook", Some(preset(1280, 720, 30, 1000)))],
        );
        assert!(program_spec(&low, false).video_kbps >= 2500);
    }

    #[test]
    fn reframe_filter_crops_and_scales() {
        let vf = reframe_filter(None, 720, 1280);
        assert!(vf.contains("crop="));
        assert!(vf.contains("scale=720:1280"));
    }

    #[test]
    fn ffmpeg_args_copy_path() {
        let c = cfg("passthrough", vec![tgt("twitch", None)]);
        let args = ffmpeg_args_for_target(
            &c,
            &c.targets[0],
            "streamkey",
            None,
            "rtmp://127.0.0.1:1935/live/obs",
            None,
        );
        let s = args.join(" ");
        assert!(s.contains("-c:v copy"), "lossless video copy: {s}");
        assert!(s.contains("-c:a aac"), "audio must remain AAC");
        assert!(s.contains("-f flv"));
        assert!(s.ends_with("streamkey"), "output ends with the key: {s}");
        assert!(
            !s.contains("-b:v"),
            "copy must not set a video bitrate: {s}"
        );
    }

    #[test]
    fn custom_output_url_places_key_before_query() {
        assert_eq!(
            compose_output_url("rtmps://ingest.example.test/live?token=abc", "stream-1"),
            "rtmps://ingest.example.test/live/stream-1?token=abc"
        );
        assert_eq!(
            compose_output_url(
                "rtmp://ingest.example.test/app?token=abc",
                "stream-1?bandwidthtest=true"
            ),
            "rtmp://ingest.example.test/app/stream-1?token=abc&bandwidthtest=true"
        );
    }

    #[test]
    fn custom_output_url_does_not_duplicate_embedded_key() {
        assert_eq!(
            compose_output_url("rtmp://ingest.example.test/app/stream-1", "stream-1"),
            "rtmp://ingest.example.test/app/stream-1"
        );
        assert_eq!(
            compose_output_url("rtmps://ingest.example.test/app/{stream_key}", "/stream-1"),
            "rtmps://ingest.example.test/app/stream-1"
        );
        assert_eq!(
            compose_output_url(
                "rtmp://ingest.example.test/app/account/stream-1",
                "account/stream-1"
            ),
            "rtmp://ingest.example.test/app/account/stream-1"
        );
        assert_eq!(
            compose_output_url(
                "rtmps://ingest.example.test/live?stream_key=stream-1",
                "stream-1"
            ),
            "rtmps://ingest.example.test/live?stream_key=stream-1"
        );
    }

    #[test]
    fn custom_target_uses_obs_compatible_rtmp_handshake() {
        let c = cfg("passthrough", vec![tgt("custom", None)]);
        let args = ffmpeg_args_for_target(
            &c,
            &c.targets[0],
            "/stream-1?token=abc",
            None,
            "rtmp://127.0.0.1:1935/live/obs",
            None,
        );
        let s = args.join(" ");
        assert!(s.contains("-rtmp_flashver WIN 10,0,32,18"), "{s}");
        assert!(s.contains("-rtmp_playpath stream-1?token=abc"), "{s}");
        assert!(s.contains("-tcp_nodelay 1"), "{s}");
    }

    #[test]
    fn ffmpeg_args_transcode_path() {
        let c = cfg(
            "per-platform",
            vec![tgt("twitch", Some(preset(1920, 1080, 60, 6000)))],
        );
        let args = ffmpeg_args_for_target(
            &c,
            &c.targets[0],
            "sk",
            Some(4500),
            "rtmp://x/live/obs",
            Some("h264_nvenc"),
        );
        let s = args.join(" ");
        assert!(s.contains("-c:v h264_nvenc"), "encoder auto→nvenc: {s}");
        assert!(s.contains("-b:v 4500k"), "br_override applied: {s}");
        assert!(s.contains("-maxrate 4500k"));
        assert!(s.contains("-bufsize 9000k"), "bufsize = vbr*2");
        assert!(s.contains("-vf scale=1920:1080"), "landscape scaling: {s}");
        assert!(s.contains("-g 120"), "gop = fps*keyframe_sec (60*2): {s}");
        assert!(!s.contains("loudnorm"));
    }

    #[test]
    fn ffmpeg_args_loudnorm_when_enabled() {
        let mut c = cfg("passthrough", vec![tgt("twitch", None)]);
        c.settings.loudness_target_lufs = -16.0;
        assert!(
            !ffmpeg_args_for_target(&c, &c.targets[0], "k", None, "rtmp://x/live/obs", None)
                .join(" ")
                .contains("loudnorm")
        );
        c.settings.loudness_normalize = true;
        let s = ffmpeg_args_for_target(&c, &c.targets[0], "k", None, "rtmp://x/live/obs", None)
            .join(" ");
        assert!(s.contains("-af loudnorm=I=-16.0:TP=-1.5:LRA=11"), "{s}");
        assert!(
            s.contains("-c:v copy"),
            "audio is normalized while video remains a copy: {s}"
        );
        assert!(s.contains("-c:a aac"));
    }

    fn feed_down(abr: &mut AutoBitrate, speed: f64, n: u32) -> Option<u32> {
        let mut last = None;
        for _ in 0..n {
            if let BitrateAction::Down(k) = abr.on_speed(speed) {
                last = Some(k);
            }
        }
        last
    }

    #[test]
    fn abr_starts_at_base() {
        assert_eq!(AutoBitrate::new(6000, 2400).current(), 6000);
    }

    #[test]
    fn abr_mild_congestion_cuts_20pct_after_8() {
        let mut a = AutoBitrate::new(6000, 2400);
        assert_eq!(feed_down(&mut a, 0.85, 7), None);
        assert_eq!(feed_down(&mut a, 0.85, 1), Some(4800));
        assert_eq!(a.current(), 4800);
    }

    #[test]
    fn abr_severe_congestion_cuts_40pct_fast() {
        let mut a = AutoBitrate::new(6000, 2400);
        assert_eq!(feed_down(&mut a, 0.5, 3), Some(3600));
        assert_eq!(a.current(), 3600);
    }

    #[test]
    fn abr_never_below_floor() {
        let mut a = AutoBitrate::new(6000, 2400);
        for _ in 0..200 {
            a.on_speed(0.3);
        }
        assert_eq!(a.current(), 2400);
    }

    #[test]
    fn abr_recovers_additively_capped_at_base() {
        let mut a = AutoBitrate::new(6000, 2400);
        feed_down(&mut a, 0.85, 8);
        assert_eq!(a.current(), 4800);
        let mut ups = vec![];
        for _ in 0..300 {
            if let BitrateAction::Up(k) = a.on_speed(1.0) {
                ups.push(k);
            }
        }
        assert!(ups.contains(&5550), "first additive step 4800+750: {ups:?}");
        assert_eq!(a.current(), 6000);
        assert!(
            ups.iter().all(|&k| k <= 6000),
            "never above the base: {ups:?}"
        );
    }

    #[test]
    fn abr_cooldown_blocks_immediate_rethrash() {
        let mut a = AutoBitrate::new(6000, 2400);
        feed_down(&mut a, 0.5, 3);
        for _ in 0..4 {
            assert!(matches!(a.on_speed(0.5), BitrateAction::Hold));
        }
        assert!(matches!(a.on_speed(0.5), BitrateAction::Down(_)));
    }

    #[test]
    fn abr_on_reconnect_keeps_bitrate() {
        let mut a = AutoBitrate::new(6000, 2400);
        feed_down(&mut a, 0.85, 8);
        a.on_reconnect();
        assert_eq!(a.current(), 4800);
    }
}
