use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use tauri::{AppHandle, Manager};

use super::avc::{parse_video_seqhdr, tag_is_idr, AvcC};
use super::flv::{
    read_flv_header, read_tag, tag_is_audio_seqhdr, tag_is_video_coded_frame, tag_is_video_seqhdr,
};
use crate::compositor::Slate;
use crate::platforms::VideoCodec;

pub(super) const SLATE_FPS: u32 = 30;
/// Cap cached slate duration to bound setup time and encoded-frame memory.
pub(super) const SLATE_VIDEO_MAX_SEC: u64 = 30;

pub(super) struct SlateFrame {
    pub keyframe: bool,
    pub data: Vec<u8>, // AVC tag body: frame type, packet type, CTS, then NALUs.
}

pub(super) struct SlateMediaSpec {
    pub width: u32,
    pub height: u32,
    pub sample_rate: u32,
    pub channels: u8,
    /// Peak video bitrate; copy destinations receive the slate's packets unchanged.
    pub video_kbps: u32,
}

pub(super) fn map_profile(profile_idc: u8) -> Option<&'static str> {
    match profile_idc {
        66 => Some("baseline"),
        77 => Some("main"),
        100 => Some("high"),
        _ => None,
    }
}

/// Tauri places sidecars beside the executable without the target-triple suffix.
pub(super) fn ffmpeg_path() -> Option<PathBuf> {
    let dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    let name = if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };
    let p = dir.join(name);
    p.exists().then_some(p)
}

pub(super) fn base_cmd(ffmpeg: &Path) -> Command {
    let mut cmd = Command::new(ffmpeg);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}

pub(super) fn kill(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

/// Cap every encoder at the program bitrate with a one-second buffer. Hardware encoders aim at
/// half of it so they stay in VBR instead of padding a still slate up to the cap.
fn rate_args(encoder: &str, kbps: u32) -> Vec<String> {
    let mut args: Vec<String> = match encoder {
        "libx264" => vec!["-crf".into(), "23".into()],
        "libsvtav1" => vec!["-crf".into(), "35".into()],
        _ => vec!["-b:v".into(), format!("{}k", (kbps / 2).max(1))],
    };
    let peak = format!("{kbps}k");
    args.extend(["-maxrate".into(), peak.clone(), "-bufsize".into(), peak]);
    args
}

pub(super) fn slate_encoder_candidates(
    obs: &AvcC,
    hw_codec: Option<&str>,
    gop: &str,
    kbps: u32,
) -> Option<Vec<Vec<String>>> {
    let hardware = |enc: &str| -> Vec<String> {
        let mut args: Vec<String> = ["-c:v", enc, "-g", gop, "-bf", "0", "-pix_fmt", "yuv420p"]
            .map(String::from)
            .to_vec();
        args.extend(rate_args(enc, kbps));
        args
    };
    match obs.codec() {
        VideoCodec::H264 => {
            let profile = map_profile(obs.info.profile_idc)?;
            let mut args: Vec<String> = [
                "-c:v",
                "libx264",
                "-profile:v",
                profile,
                "-preset",
                "veryfast",
                "-pix_fmt",
                "yuv420p",
                "-x264-params",
                &format!("keyint={gop}:min-keyint={gop}:scenecut=0"),
                "-bf",
                "0",
            ]
            .map(String::from)
            .to_vec();
            args.extend(rate_args("libx264", kbps));
            Some(vec![args])
        }
        // Use only hardware HEVC encoders; fall back to the H.264 compositor when unavailable.
        VideoCodec::Hevc => {
            let order = match hw_codec {
                Some("h264_qsv") => ["hevc_qsv", "hevc_nvenc", "hevc_amf"],
                Some("h264_amf") => ["hevc_amf", "hevc_nvenc", "hevc_qsv"],
                _ => ["hevc_nvenc", "hevc_qsv", "hevc_amf"],
            };
            Some(order.into_iter().map(hardware).collect())
        }
        VideoCodec::Av1 => {
            let hw_order = match hw_codec {
                Some("h264_qsv") => ["av1_qsv", "av1_nvenc", "av1_amf"],
                Some("h264_amf") => ["av1_amf", "av1_nvenc", "av1_qsv"],
                _ => ["av1_nvenc", "av1_qsv", "av1_amf"],
            };
            let mut list: Vec<Vec<String>> = hw_order.into_iter().map(hardware).collect();
            let mut software: Vec<String> = [
                "-c:v",
                "libsvtav1",
                "-preset",
                "12",
                "-g",
                gop,
                "-pix_fmt",
                "yuv420p",
            ]
            .map(String::from)
            .to_vec();
            software.extend(rate_args("libsvtav1", kbps));
            list.push(software);
            Some(list)
        }
    }
}

/// Encode slate media once during setup; live forwarding remains stream copy.
pub(super) fn build_slate_media(
    app: &AppHandle,
    ffmpeg: &Path,
    slate: &Slate,
    obs: &AvcC,
    hw_codec: Option<&str>,
    spec: &SlateMediaSpec,
) -> Option<(Vec<SlateFrame>, Vec<Vec<u8>>)> {
    match slate {
        Slate::Still(still) => {
            let frames = build_slate_still(app, ffmpeg, still, spec, obs, hw_codec)?;
            Some((frames, Vec::new()))
        }
        Slate::Video { path, has_audio } => {
            build_slate_video(app, ffmpeg, path, *has_audio, obs, hw_codec, spec)
        }
    }
}

fn build_slate_still(
    app: &AppHandle,
    ffmpeg: &Path,
    still: &[u8],
    spec: &SlateMediaSpec,
    obs: &AvcC,
    hw_codec: Option<&str>,
) -> Option<Vec<SlateFrame>> {
    let gop = (SLATE_FPS * 2).to_string();
    let candidates = slate_encoder_candidates(obs, hw_codec, &gop, spec.video_kbps)?;
    let dir = app.path().app_config_dir().ok()?.join("splice-tmp");
    let _ = std::fs::create_dir_all(&dir);
    let src = dir.join("slate_src.yuv");
    let out = dir.join("slate.flv");
    std::fs::write(&src, still).ok()?;
    let mut frames_out = None;
    for enc_args in candidates {
        let mut args: Vec<String> = vec![
            "-hide_banner".into(),
            "-loglevel".into(),
            "error".into(),
            "-y".into(),
            "-f".into(),
            "rawvideo".into(),
            "-pix_fmt".into(),
            "yuv420p".into(),
            "-s".into(),
            format!("{}x{}", spec.width, spec.height),
            "-framerate".into(),
            SLATE_FPS.to_string(),
            "-stream_loop".into(),
            "-1".into(),
            "-i".into(),
            src.to_string_lossy().to_string(),
            "-t".into(),
            "2".into(),
            "-vf".into(),
            format!("scale={}:{}", obs.info.width, obs.info.height),
        ];
        args.extend(enc_args);
        args.extend([
            "-an".into(),
            "-f".into(),
            "flv".into(),
            out.to_string_lossy().to_string(),
        ]);
        let ok = base_cmd(ffmpeg)
            .args(&args)
            .stdin(Stdio::null()) // Never prompt on inherited stdin when a temporary output already exists.
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|s| s.success());
        if !ok {
            continue;
        }
        if let Ok(flv) = std::fs::read(&out) {
            if let Some((frames, _audio)) = extract_slate_media(&flv) {
                if frames.first().is_some_and(|f| f.keyframe) {
                    frames_out = Some(frames);
                    break;
                }
            }
        }
    }
    let _ = std::fs::remove_file(&src);
    let _ = std::fs::remove_file(&out);
    frames_out
}

/// Disable B-frames to keep slate CTS zero across loop boundaries.
fn build_slate_video(
    app: &AppHandle,
    ffmpeg: &Path,
    path: &str,
    has_audio: bool,
    obs: &AvcC,
    hw_codec: Option<&str>,
    spec: &SlateMediaSpec,
) -> Option<(Vec<SlateFrame>, Vec<Vec<u8>>)> {
    let (sr, ch) = (spec.sample_rate, spec.channels);
    let gop = (SLATE_FPS * 2).to_string();
    let candidates = slate_encoder_candidates(obs, hw_codec, &gop, spec.video_kbps)?;
    let dir = app.path().app_config_dir().ok()?.join("splice-tmp");
    let _ = std::fs::create_dir_all(&dir);
    let out = dir.join("slate_vid.flv");
    let mut media_out = None;
    for enc_args in candidates {
        let mut args: Vec<String> = vec![
            "-hide_banner".into(),
            "-loglevel".into(),
            "error".into(),
            "-y".into(),
            "-i".into(),
            path.into(),
            "-t".into(),
            SLATE_VIDEO_MAX_SEC.to_string(),
            "-vf".into(),
            format!(
                "scale={}:{},fps={}",
                obs.info.width, obs.info.height, SLATE_FPS
            ),
        ];
        args.extend(enc_args);
        if has_audio {
            // Match OBS's out-of-band AAC-LC configuration, sample rate, and channel count.
            args.extend(
                [
                    "-c:a",
                    "aac",
                    "-ar",
                    &sr.to_string(),
                    "-ac",
                    &ch.to_string(),
                    "-b:a",
                    "160k",
                ]
                .map(String::from),
            );
        } else {
            args.push("-an".into());
        }
        args.extend(["-f".into(), "flv".into(), out.to_string_lossy().to_string()]);
        let ok = base_cmd(ffmpeg)
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|s| s.success());
        if !ok {
            continue;
        }
        if let Ok(flv) = std::fs::read(&out) {
            if let Some(media) = extract_slate_media(&flv) {
                if media.0.first().is_some_and(|f| f.keyframe) {
                    media_out = Some(media);
                    break;
                }
            }
        }
    }
    let _ = std::fs::remove_file(&out);
    media_out
}

pub(super) fn extract_slate_media(flv: &[u8]) -> Option<(Vec<SlateFrame>, Vec<Vec<u8>>)> {
    let mut r = flv;
    read_flv_header(&mut r).ok()?;
    let mut avcc: Option<AvcC> = None;
    let mut frames = Vec::new();
    let mut audio = Vec::new();
    while let Ok(Some(tag)) = read_tag(&mut r) {
        if tag.tag_type == 8 {
            if !tag_is_audio_seqhdr(&tag.data) {
                audio.push(tag.data);
            }
            continue;
        }
        if tag.tag_type != 9 {
            continue;
        }
        if tag_is_video_seqhdr(&tag.data) {
            avcc = parse_video_seqhdr(&tag.data);
            continue;
        }
        if !tag_is_video_coded_frame(&tag.data) {
            continue;
        }
        let Some(cfg) = &avcc else { continue };
        let is_key = tag_is_idr(&tag.data, cfg.length_size);
        let data = if is_key {
            cfg.decorate_keyframe(&tag.data)
        } else {
            tag.data.clone()
        };
        frames.push(SlateFrame {
            keyframe: is_key,
            data,
        });
    }
    if frames.is_empty() || avcc.is_none() {
        return None;
    }
    // Remove AAC encoder priming for cleaner loops, without emptying a one-frame track.
    if audio.len() > 1 {
        audio.remove(0);
    }
    Some((frames, audio))
}

pub(super) fn build_silence(app: &AppHandle, ffmpeg: &Path, sr: u32, ch: u8) -> Vec<u8> {
    let fallback = |ch: u8| -> Vec<u8> {
        // Rate-independent AAC-LC silence access units for stereo and mono.
        let mut v = vec![0xAF, 0x01];
        if ch >= 2 {
            v.extend_from_slice(&[0x21, 0x10, 0x04, 0x60, 0x8C, 0x1C]);
        } else {
            v.extend_from_slice(&[0x01, 0x18, 0x20, 0x07]);
        }
        v
    };
    let Some(dir) = app
        .path()
        .app_config_dir()
        .ok()
        .map(|d| d.join("splice-tmp"))
    else {
        return fallback(ch);
    };
    let _ = std::fs::create_dir_all(&dir);
    let out = dir.join("silence.flv");
    let cl = if ch >= 2 { "stereo" } else { "mono" };
    let ok = base_cmd(ffmpeg)
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            &format!("anullsrc=r={sr}:cl={cl}"),
            "-t",
            "1",
            "-c:a",
            "aac",
            "-ar",
            &sr.to_string(),
            "-ac",
            &ch.to_string(),
            "-b:a",
            "160k",
            "-f",
            "flv",
            &out.to_string_lossy(),
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if !ok {
        return fallback(ch);
    }
    let Ok(flv) = std::fs::read(&out) else {
        return fallback(ch);
    };
    let _ = std::fs::remove_file(&out);
    let mut r = &flv[..];
    if read_flv_header(&mut r).is_err() {
        return fallback(ch);
    }
    // Skip the sequence header and priming frame; use a stable silence frame.
    let mut audio_frames = Vec::new();
    while let Ok(Some(tag)) = read_tag(&mut r) {
        if tag.tag_type == 8 && !tag_is_audio_seqhdr(&tag.data) {
            audio_frames.push(tag.data);
        }
    }
    audio_frames
        .into_iter()
        .nth(1)
        .unwrap_or_else(|| fallback(ch))
}
