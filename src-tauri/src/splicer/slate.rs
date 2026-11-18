use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use tauri::{AppHandle, Manager};

use super::avc::{parse_avcc, prefix_param_sets, tag_is_idr, AvcC, SpsInfo};
use super::flv::{read_flv_header, read_tag, tag_is_audio_seqhdr, tag_is_video_seqhdr};
use crate::compositor::Slate;

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

/// Encode slate media once during setup; live forwarding remains stream copy.
pub(super) fn build_slate_media(
    app: &AppHandle,
    ffmpeg: &Path,
    slate: &Slate,
    obs: &SpsInfo,
    spec: &SlateMediaSpec,
) -> Option<(Vec<SlateFrame>, Vec<Vec<u8>>)> {
    match slate {
        Slate::Still(still) => {
            let frames = build_slate_still(app, ffmpeg, still, spec.width, spec.height, obs)?;
            Some((frames, Vec::new()))
        }
        Slate::Video { path, has_audio } => build_slate_video(
            app,
            ffmpeg,
            path,
            *has_audio,
            obs,
            spec.sample_rate,
            spec.channels,
        ),
    }
}

fn build_slate_still(
    app: &AppHandle,
    ffmpeg: &Path,
    still: &[u8],
    spec_w: u32,
    spec_h: u32,
    obs: &SpsInfo,
) -> Option<Vec<SlateFrame>> {
    let profile = map_profile(obs.profile_idc)?;
    let dir = app.path().app_config_dir().ok()?.join("splice-tmp");
    let _ = std::fs::create_dir_all(&dir);
    let src = dir.join("slate_src.yuv");
    let out = dir.join("slate.flv");
    std::fs::write(&src, still).ok()?;
    let gop = (SLATE_FPS * 2).to_string();
    let status = base_cmd(ffmpeg)
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "yuv420p",
            "-s",
            &format!("{spec_w}x{spec_h}"),
            "-framerate",
            &SLATE_FPS.to_string(),
            "-stream_loop",
            "-1",
            "-i",
            &src.to_string_lossy(),
            "-t",
            "2",
            "-vf",
            &format!("scale={}:{}", obs.width, obs.height),
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
            "-an",
            "-f",
            "flv",
            &out.to_string_lossy(),
        ])
        .stdin(Stdio::null()) // Never prompt on inherited stdin when a temporary output already exists.
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .ok()?;
    if !status.success() {
        return None;
    }
    let flv = std::fs::read(&out).ok()?;
    let (frames, _audio) = extract_slate_media(&flv)?;
    let _ = std::fs::remove_file(&src);
    let _ = std::fs::remove_file(&out);
    Some(frames)
}

/// Disable B-frames to keep slate CTS zero across loop boundaries.
fn build_slate_video(
    app: &AppHandle,
    ffmpeg: &Path,
    path: &str,
    has_audio: bool,
    obs: &SpsInfo,
    sr: u32,
    ch: u8,
) -> Option<(Vec<SlateFrame>, Vec<Vec<u8>>)> {
    let profile = map_profile(obs.profile_idc)?;
    let dir = app.path().app_config_dir().ok()?.join("splice-tmp");
    let _ = std::fs::create_dir_all(&dir);
    let out = dir.join("slate_vid.flv");
    let gop = (SLATE_FPS * 2).to_string();
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
        format!("scale={}:{},fps={}", obs.width, obs.height, SLATE_FPS),
        "-c:v".into(),
        "libx264".into(),
        "-profile:v".into(),
        profile.into(),
        "-preset".into(),
        "veryfast".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-x264-params".into(),
        format!("keyint={gop}:min-keyint={gop}:scenecut=0"),
        "-bf".into(),
        "0".into(),
    ];
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
    let status = base_cmd(ffmpeg)
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .ok()?;
    if !status.success() {
        return None;
    }
    let flv = std::fs::read(&out).ok()?;
    let media = extract_slate_media(&flv)?;
    let _ = std::fs::remove_file(&out);
    Some(media)
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
            avcc = parse_avcc(&tag.data[5..]);
            continue;
        }
        let Some(cfg) = &avcc else { continue };
        let is_key = tag_is_idr(&tag.data, cfg.length_size);
        let data = if is_key {
            // Reassert slate SPS/PPS before each slate IDR.
            let mut d = tag.data[..5].to_vec();
            d.extend_from_slice(&prefix_param_sets(&cfg.sps, &cfg.pps, cfg.length_size));
            d.extend_from_slice(&tag.data[5..]);
            d
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
