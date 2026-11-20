use super::hybrid::{effective_action, effective_preset, strictest_copy_limits};
use crate::config::{AppConfig, CropBox, InputFeed, Reframe, Target};

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
pub(crate) fn reframe_filter(reframe: Option<&Reframe>, out_w: u32, out_h: u32) -> String {
    if let Some(vf) = reframe.and_then(|r| split_filter(r, out_w, out_h)) {
        return vf;
    }
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

/// Heights of the camera and main regions: both even for 4:2:0 and at least 16 px.
pub(crate) fn split_heights(out_h: u32, ratio: f64) -> Option<(u32, u32)> {
    let ratio = if ratio.is_finite() {
        ratio.clamp(0.25, 0.5)
    } else {
        crate::config::DEFAULT_SPLIT_RATIO
    };
    let top = ((f64::from(out_h) * ratio).round() as u32) & !1;
    let bottom = out_h.checked_sub(top)? & !1;
    (top >= 16 && bottom >= 16).then_some((top, bottom))
}

/// A crop of the region's aspect that stays inside the source on both axes.
fn region_crop(region: CropBox, min_zoom: f64, out_w: u32, out_h: u32) -> String {
    let ar = f64::from(out_w) / f64::from(out_h);
    let x = region.x.clamp(0.0, 1.0);
    let y = region.y.clamp(0.0, 1.0);
    let z = region.zoom.clamp(min_zoom, 1.0);
    let ch = format!("min(ih*{z:.4}\\,iw/{ar:.4})");
    let cw = format!("{ch}*{ar:.4}");
    format!("crop={cw}:{ch}:(iw-{cw})*{x:.4}:(ih-{ch})*{y:.4},scale={out_w}:{out_h},setsar=1")
}

/// The camera region stacked over the main one, inside a single-input `-vf` graph so
/// renditions and the copy path keep treating it as one filter.
fn split_filter(reframe: &Reframe, out_w: u32, out_h: u32) -> Option<String> {
    let (camera, ratio) = reframe.split()?;
    let (top_h, bottom_h) = split_heights(out_h, ratio)?;
    let main = CropBox {
        x: reframe.x,
        y: reframe.y,
        zoom: reframe.zoom,
    };
    // A webcam in a corner needs a tighter crop than the main region allows.
    let camera = region_crop(camera, 0.1, out_w, top_h);
    let main = region_crop(main, 0.25, out_w, bottom_h);
    Some(format!(
        "split=2[cam][main];[cam]{camera}[top];[main]{main}[bottom];[top][bottom]vstack=inputs=2"
    ))
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

pub fn has_vertical_feed(config: &AppConfig) -> bool {
    config
        .targets
        .iter()
        .any(|t| t.enabled && t.encoding.source_feed == InputFeed::Vertical)
}

pub fn vertical_ingest_url(config: &AppConfig) -> String {
    format!(
        "{}://{}:{}/{}/{}_vertical",
        config.ingest.protocol,
        config.ingest.host,
        config.ingest.port,
        config.ingest.app,
        config.ingest.key
    )
}

pub fn vertical_ingest_path_name(config: &AppConfig) -> String {
    format!("{}/{}_vertical", config.ingest.app, config.ingest.key)
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
    ];
    if ingest.starts_with("rtmp://") || ingest.starts_with("rtmps://") {
        args.extend(["-rtmp_enhanced_codecs", "hvc1,av01"].map(String::from));
    }
    args.extend(["-i".into(), ingest]);

    if action == "copy" {
        args.extend(["-map", "0:v", "-c:v", "copy"].map(String::from));
    } else {
        let p = effective_preset(t);
        let codec = ffmpeg_video_codec(&t.encoding.encoder, auto_codec);
        let fps = p.fps.max(1);
        let gop = (fps * p.keyframe_sec.max(1)).to_string();
        let vf = if p.height > p.width && t.encoding.source_feed != InputFeed::Vertical {
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
        // x264's default preset cannot keep up with 1080p60 live on a typical streaming PC.
        if codec == "libx264" {
            args.extend(["-preset", "veryfast"].map(String::from));
        }
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

    if crate::platforms::needs_publisher_compat(&t.platform_id) {
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

/// Program PCM is s16le, 48 kHz stereo, aligned to video ticks.
pub(super) const PROG_AUDIO_HZ: u32 = 48_000;
pub(super) const PROG_AUDIO_CH: u32 = 2;

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

// 720p is enough unless a target needs more.
fn program_resolution(config: &AppConfig) -> (u32, u32) {
    let enabled: Vec<&Target> = config.targets.iter().filter(|t| t.enabled).collect();
    let needs_full_hd = enabled.is_empty()
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

/// Copy targets inherit the program bitrate, so it stays within the strictest of them.
pub fn program_spec(config: &AppConfig) -> ProgramSpec {
    let mut max_fps = 30u32;
    let mut max_kbps = 4500u32;
    for t in config.targets.iter().filter(|t| t.enabled) {
        let p = effective_preset(t);
        max_fps = max_fps.max(p.fps);
        max_kbps = max_kbps.max(p.video_bitrate_kbps);
    }
    let (w, h) = program_resolution(config);
    ProgramSpec {
        w,
        h,
        fps: max_fps.clamp(30, 60),
        video_kbps: max_kbps
            .clamp(2500, 12_000)
            .min(strictest_copy_limits(config).map_or(u32::MAX, |l| l.max_kbps)),
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
        "-rtmp_enhanced_codecs".into(),
        "hvc1,av01".into(),
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

pub const MEDIAMTX_API_PORT: u16 = 9997;

/// Enable only RTMP ingest and a loopback-only diagnostic API.
pub fn mediamtx_config(config: &AppConfig) -> String {
    let vertical_path = if has_vertical_feed(config) {
        format!("  {}:\n", vertical_ingest_path_name(config))
    } else {
        String::new()
    };
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
            // MediaMTX 1.19 enables MoQ by default on every interface and writes TLS files to the CWD.
            "moq: no\n",
            "api: yes\n",
            "apiAddress: 127.0.0.1:{api_port}\n",
            "metrics: no\n",
            "pprof: no\n",
            "playback: no\n",
            "paths:\n",
            "{vertical_path}",
            "  all_others:\n",
        ),
        host = config.ingest.host,
        port = config.ingest.port,
        api_port = MEDIAMTX_API_PORT,
        vertical_path = vertical_path
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{IngestConfig, Settings, TargetEncoding, VideoPreset};

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
                source_feed: InputFeed::Primary,
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
    fn mediamtx_config_opens_only_the_loopback_ingest_and_api() {
        let yml = mediamtx_config(&cfg("per-platform", vec![]));
        let lines: Vec<&str> = yml.lines().collect();
        for protocol in [
            "rtsp", "hls", "webrtc", "srt", "moq", "metrics", "pprof", "playback",
        ] {
            assert!(
                lines.contains(&format!("{protocol}: no").as_str()),
                "{protocol} must stay disabled"
            );
        }
        assert!(lines.contains(&"rtmpAddress: 127.0.0.1:1935"));
        assert!(lines.contains(&"apiAddress: 127.0.0.1:9997"));
        assert!(!yml.contains("live/obs_vertical:"));
    }

    #[test]
    fn mediamtx_registers_vertical_path_only_when_an_enabled_target_uses_it() {
        let mut tt = tgt("tiktok", Some(preset(1080, 1920, 60, 4000)));
        tt.encoding.source_feed = InputFeed::Vertical;
        let with_v = cfg("hybrid", vec![tt.clone()]);
        let yml = mediamtx_config(&with_v);
        assert!(yml.contains("  live/obs_vertical:\n"));
        assert!(yml.contains("rtmpAddress: 127.0.0.1:1935"));

        // Hybrid mode copies vertical feed directly (0% GPU) and transcode mode scales without cropping.
        let copy_args = ffmpeg_args_for_target(
            &with_v,
            &tt,
            "stream_key",
            None,
            &vertical_ingest_url(&with_v),
            None,
        );
        assert!(copy_args.windows(2).any(|w| w == ["-c:v", "copy"]));
        let transcode_cfg = cfg("per-platform", vec![tt.clone()]);
        let transcode_args = ffmpeg_args_for_target(
            &transcode_cfg,
            &tt,
            "stream_key",
            None,
            &vertical_ingest_url(&transcode_cfg),
            None,
        );
        let vf = transcode_args
            .windows(2)
            .find(|w| w[0] == "-vf")
            .map(|w| w[1].as_str())
            .unwrap();
        assert_eq!(vf, "scale=1080:1920");

        // Disabled vertical target does not register the vertical path.
        let mut disabled = tt;
        disabled.enabled = false;
        let without_v = cfg("hybrid", vec![disabled]);
        assert!(!mediamtx_config(&without_v).contains("live/obs_vertical:"));
    }

    #[test]
    fn program_audio_is_always_encoded_for_destinations() {
        let target = tgt("twitch", Some(preset(1280, 720, 30, 4000)));
        let mut config = cfg("per-platform", vec![target.clone()]);
        config.settings.brb_enabled = true;
        let audio = |config: &AppConfig, source: &str| {
            let args = ffmpeg_args_for_target(config, &target, "key", None, source, None);
            args.windows(2).find(|pair| pair[0] == "-c:a").unwrap()[1].clone()
        };
        assert_eq!(audio(&config, &program_url(&config)), "aac");
        assert_eq!(audio(&config, "rtmp://127.0.0.1/live/obs"), "aac");
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
                "vertical",
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
        assert!(crate::renditions::plan(
            &cfg("passthrough", vec![first, second]),
            "source",
            "vertical",
            None
        )
        .is_empty());
    }

    #[test]
    fn video_codec_mapping() {
        assert_eq!(ffmpeg_video_codec("nvenc", None), "h264_nvenc");
        assert_eq!(ffmpeg_video_codec("software", None), "libx264");
        assert_eq!(ffmpeg_video_codec("auto", Some("h264_qsv")), "h264_qsv");
        assert_eq!(ffmpeg_video_codec("auto", None), "libx264");
    }

    #[test]
    fn program_resolution_adapts() {
        let c = cfg(
            "hybrid",
            vec![tgt("facebook", Some(preset(1280, 720, 30, 4000)))],
        );
        assert_eq!(program_resolution(&c), (1280, 720));
        let c2 = cfg(
            "hybrid",
            vec![tgt("twitch", Some(preset(1920, 1080, 60, 6000)))],
        );
        assert_eq!(program_resolution(&c2), (1920, 1080));
        let c3 = cfg(
            "hybrid",
            vec![tgt("tiktok", Some(preset(720, 1280, 30, 3000)))],
        );
        assert_eq!(program_resolution(&c3), (1920, 1080));
    }

    #[test]
    fn program_spec_fps_and_bitrate() {
        let c = cfg(
            "hybrid",
            vec![tgt("twitch", Some(preset(1920, 1080, 60, 6000)))],
        );
        assert_eq!(program_spec(&c).fps, 60);
        let low = cfg(
            "hybrid",
            vec![tgt("facebook", Some(preset(1280, 720, 30, 1000)))],
        );
        assert!(program_spec(&low).video_kbps >= 2500);
    }

    #[test]
    fn program_bitrate_stays_within_the_strictest_copy_destination() {
        let targets = || {
            vec![
                tgt("youtube", Some(preset(1920, 1080, 60, 9000))),
                tgt("twitch", Some(preset(1920, 1080, 60, 6000))),
            ]
        };
        assert_eq!(
            program_spec(&cfg("hybrid", targets())).video_kbps,
            6000,
            "Twitch copies the program, so a 9000 kbps YouTube preset must not reach it"
        );
        assert_eq!(
            program_spec(&cfg("per-platform", targets())).video_kbps,
            9000,
            "every destination re-encodes, so the program keeps the highest preset"
        );
    }

    #[test]
    fn reframe_filter_crops_and_scales() {
        let vf = reframe_filter(None, 720, 1280);
        assert!(vf.contains("crop="));
        assert!(vf.contains("scale=720:1280"));
    }

    fn split_reframe(ratio: Option<f64>) -> Reframe {
        Reframe {
            x: 0.5,
            y: 0.5,
            zoom: 1.0,
            layout: Some("split".into()),
            top: Some(CropBox {
                x: 1.0,
                y: 1.0,
                zoom: 0.3,
            }),
            split_ratio: ratio,
        }
    }

    #[test]
    fn split_heights_are_even_and_fill_the_frame() {
        for out_h in [1280u32, 1920, 1366, 960] {
            for step in 0..=50 {
                let ratio = 0.2 + f64::from(step) * 0.01;
                let (top, bottom) = split_heights(out_h, ratio).unwrap();
                assert_eq!(top % 2, 0, "{out_h} {ratio}");
                assert_eq!(bottom % 2, 0, "{out_h} {ratio}");
                assert_eq!(top + bottom, out_h, "{out_h} {ratio}");
                assert!(top >= out_h / 4 - 1 && top <= out_h / 2 + 1);
            }
        }
        assert_eq!(split_heights(1280, 0.35), Some((448, 832)));
        assert_eq!(split_heights(1280, f64::NAN), Some((448, 832)));
        assert_eq!(split_heights(40, 0.25), None, "a region under 16 px");
    }

    #[test]
    fn a_split_reframe_stacks_the_camera_over_the_main_crop_in_one_graph() {
        let vf = reframe_filter(Some(&split_reframe(None)), 720, 1280);
        assert!(vf.starts_with("split=2[cam][main];[cam]crop="), "{vf}");
        assert!(vf.contains(",scale=720:448,setsar=1[top]"), "{vf}");
        assert!(vf.contains(",scale=720:832,setsar=1[bottom]"), "{vf}");
        assert!(vf.ends_with("[top][bottom]vstack=inputs=2"), "{vf}");
        assert!(
            vf.contains("min(ih*0.3000\\,iw/1.6071)"),
            "camera zoom: {vf}"
        );

        let mut single = split_reframe(None);
        single.layout = Some("single".into());
        assert_eq!(
            reframe_filter(Some(&single), 720, 1280),
            reframe_filter(
                Some(&Reframe {
                    x: 0.5,
                    y: 0.5,
                    zoom: 1.0,
                    layout: None,
                    top: None,
                    split_ratio: None,
                }),
                720,
                1280
            ),
            "switching back to one frame keeps the main crop"
        );
    }

    #[test]
    fn split_numbers_from_an_imported_config_are_clamped_into_the_graph() {
        let mut hostile = split_reframe(Some(9.0));
        hostile.x = -3.0;
        hostile.zoom = 40.0;
        hostile.top = Some(CropBox {
            x: f64::INFINITY,
            y: 2.0,
            zoom: 0.0,
        });
        let vf = reframe_filter(Some(&hostile), 720, 1280);
        assert!(vf.contains("scale=720:640,setsar=1[top]"), "{vf}");
        assert!(vf.contains("min(ih*0.1000\\,"), "{vf}");
        assert!(vf.contains("min(ih*1.0000\\,"), "{vf}");
        assert!(!vf.contains("inf") && !vf.contains("NaN"), "{vf}");
    }

    #[test]
    fn identical_split_destinations_produce_identical_encoder_arguments() {
        let mut tiktok = tgt("tiktok", Some(preset(720, 1280, 30, 3000)));
        tiktok.encoding.reframe = Some(split_reframe(Some(0.4)));
        let mut shorts = tiktok.clone();
        shorts.id = "shorts".into();
        let c = cfg("per-platform", vec![tiktok.clone(), shorts.clone()]);
        let args = |t: &Target| {
            ffmpeg_args_for_target(&c, t, "k", None, "rtmp://127.0.0.1:1935/live/obs", None)
        };
        let (a, b) = (args(&tiktok), args(&shorts));
        let vf = a.iter().position(|x| x == "-vf").unwrap();
        assert!(a[vf + 1].contains("vstack"));
        assert_eq!(
            a[..a.len() - 1],
            b[..b.len() - 1],
            "renditions group by these"
        );
    }

    #[test]
    #[ignore = "requires verified ffmpeg and ffprobe on PATH in a disposable contributor checkout"]
    fn a_split_graph_encodes_a_1080p_source_into_a_720x1280_portrait() {
        let vf = reframe_filter(Some(&split_reframe(Some(0.35))), 720, 1280);
        let out = std::env::temp_dir().join("corneta-split-reframe.mp4");
        let encoded = std::process::Command::new("ffmpeg")
            .args(["-y", "-hide_banner", "-loglevel", "error"])
            .args(["-f", "lavfi", "-i", "testsrc2=s=1920x1080:r=30:d=1"])
            .args(["-vf", &vf, "-c:v", "libx264", "-pix_fmt", "yuv420p"])
            .arg(&out)
            .status();
        assert!(encoded.is_ok_and(|s| s.success()), "encode with {vf}");
        let probe = std::process::Command::new("ffprobe")
            .args(["-v", "error", "-select_streams", "v:0"])
            .args([
                "-show_entries",
                "stream=width,height,pix_fmt,sample_aspect_ratio",
            ])
            .args(["-of", "csv=p=0"])
            .arg(&out)
            .output()
            .unwrap();
        let _ = std::fs::remove_file(&out);
        let line = String::from_utf8_lossy(&probe.stdout).trim().to_string();
        let mut fields: Vec<&str> = line.split(',').collect();
        fields.sort_unstable();
        assert_eq!(fields, ["1280", "1:1", "720", "yuv420p"], "{line}");
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
}
