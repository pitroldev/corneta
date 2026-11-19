//! GPU-resident decode/crop/scale/encode. NVIDIA is on by default; Quick Sync and AMD stay
//! opt-in until measured on their hardware. Unsupported codecs, CPU filters and providers retain
//! the stable path, and a destination whose GPU pipeline exits before a healthy run goes back to
//! that path for the rest of the live.
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_shell::{process::CommandEvent, ShellExt};

const SWITCH: &str = "CORNETA_EXPERIMENTAL_GPU_PIPELINE";
const PROBE_TIMEOUT: Duration = Duration::from_millis(2500);
const MAX_HW_DIMENSION: u32 = 4096;

/// Probed video header of the active local feed (`out_source`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct SourceVideo {
    pub codec: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum FilterShape {
    Scale {
        width: u32,
        height: u32,
    },
    CropScale {
        crop: CropSpec,
        width: u32,
        height: u32,
    },
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum CropSpec {
    Reframe {
        ar: f64,
        x: f64,
        y: f64,
        zoom: f64,
    },
    Pixels {
        width: u32,
        height: u32,
        x: Option<u32>,
        y: Option<u32>,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct ResolvedCrop {
    cw: u32,
    ch: u32,
    left: u32,
    top: u32,
    right: u32,
    bottom: u32,
}

/// `0` turns the pipeline off, as a support escape hatch.
pub(crate) fn enabled() -> bool {
    std::env::var(SWITCH).map_or(true, |value| value != "0")
}

pub(crate) async fn candidate_for_live(
    app: &AppHandle,
    args: &[String],
    running: &AtomicBool,
) -> Option<Vec<String>> {
    let unmeasured = unmeasured_enabled();
    if !needs_source_video_for(args, unmeasured) {
        return candidate_for(args, None, unmeasured);
    }
    let source_url = input_url(args)?;
    let source = probe_source_video(app, source_url, running).await?;
    candidate_for(args, Some(&source), unmeasured)
}

fn unmeasured_enabled() -> bool {
    std::env::var(SWITCH).is_ok_and(|value| value == "1")
}

fn valid_even_dim(value: u32, min: u32) -> bool {
    (min..=MAX_HW_DIMENSION).contains(&value) && value.is_multiple_of(2)
}

fn valid_output_dims(width: u32, height: u32) -> bool {
    valid_even_dim(width, 16) && valid_even_dim(height, 16)
}

fn parse_scale_dims(spec: &str) -> Option<(u32, u32)> {
    let (w, h) = spec.split_once(':')?;
    let width: u32 = w.parse().ok()?;
    let height: u32 = h.parse().ok()?;
    valid_output_dims(width, height).then_some((width, height))
}

fn parse_crop_spec(spec: &str) -> Option<CropSpec> {
    let parts: Vec<&str> = spec.split(':').collect();
    match parts.as_slice() {
        [w, h] => {
            let width: u32 = w.parse().ok()?;
            let height: u32 = h.parse().ok()?;
            (width >= 16 && height >= 16).then_some(CropSpec::Pixels {
                width,
                height,
                x: None,
                y: None,
            })
        }
        [w, h, x, y] => {
            if let (Ok(width), Ok(height), Ok(px), Ok(py)) = (
                w.parse::<u32>(),
                h.parse::<u32>(),
                x.parse::<u32>(),
                y.parse::<u32>(),
            ) {
                return (width >= 16 && height >= 16).then_some(CropSpec::Pixels {
                    width,
                    height,
                    x: Some(px),
                    y: Some(py),
                });
            }
            let inner = w.strip_prefix("min(iw\\,ih*")?.strip_suffix(')')?;
            let (z_w, ar_str) = inner.split_once('*')?;
            let z_h = h.strip_prefix("ih*")?;
            if z_w != z_h {
                return None;
            }
            let (cw_repeat, x_str) = x.strip_prefix("(iw-")?.rsplit_once(")*")?;
            let (ch_repeat, y_str) = y.strip_prefix("(ih-")?.rsplit_once(")*")?;
            if cw_repeat != *w || ch_repeat != *h {
                return None;
            }
            let zoom: f64 = z_w.parse().ok()?;
            let ar: f64 = ar_str.parse().ok()?;
            let pan_x: f64 = x_str.parse().ok()?;
            let pan_y: f64 = y_str.parse().ok()?;
            if !zoom.is_finite()
                || !ar.is_finite()
                || !pan_x.is_finite()
                || !pan_y.is_finite()
                || !(0.25..=1.0).contains(&zoom)
                || !(0.0 < ar && ar <= 16.0)
                || !(0.0..=1.0).contains(&pan_x)
                || !(0.0..=1.0).contains(&pan_y)
            {
                return None;
            }
            Some(CropSpec::Reframe {
                ar,
                x: pan_x,
                y: pan_y,
                zoom,
            })
        }
        _ => None,
    }
}

fn parse_filter_shape(vf: &str) -> Option<FilterShape> {
    if let Some(scale) = vf.strip_prefix("scale=") {
        let (width, height) = parse_scale_dims(scale)?;
        return Some(FilterShape::Scale { width, height });
    }
    let (crop_part, scale_part) = vf.rsplit_once(",scale=")?;
    let crop = parse_crop_spec(crop_part.strip_prefix("crop=")?)?;
    let (width, height) = parse_scale_dims(scale_part)?;
    Some(FilterShape::CropScale {
        crop,
        width,
        height,
    })
}

impl CropSpec {
    // Align crops to 2x2 macroblock/chroma boundaries matching FFmpeg's 4:2:0 behavior.
    fn resolve(self, src_w: u32, src_h: u32) -> Option<ResolvedCrop> {
        if !valid_even_dim(src_w, 48) || !valid_even_dim(src_h, 16) {
            return None;
        }
        let (cw, ch, left, top) = match self {
            Self::Reframe { ar, x, y, zoom } => {
                let cw_f = (src_w as f64).min((src_h as f64) * zoom * ar);
                let ch_f = (src_h as f64) * zoom;
                let cw = ((cw_f as u32) & !1).min(src_w);
                let ch = ((ch_f as u32) & !1).min(src_h);
                if cw < 16 || ch < 16 {
                    return None;
                }
                let left = ((((src_w as f64) - cw_f).max(0.0) * x) as u32 & !1).min(src_w - cw);
                let top = ((((src_h as f64) - ch_f).max(0.0) * y) as u32 & !1).min(src_h - ch);
                (cw, ch, left, top)
            }
            Self::Pixels {
                width,
                height,
                x,
                y,
            } => {
                let cw = width & !1;
                let ch = height & !1;
                if cw < 16 || ch < 16 || cw > src_w || ch > src_h {
                    return None;
                }
                let left = x.unwrap_or((src_w - cw) / 2) & !1;
                let top = y.unwrap_or((src_h - ch) / 2) & !1;
                if left + cw > src_w || top + ch > src_h {
                    return None;
                }
                (cw, ch, left, top)
            }
        };
        Some(ResolvedCrop {
            cw,
            ch,
            left,
            top,
            right: src_w - left - cw,
            bottom: src_h - top - ch,
        })
    }
}

fn input_index(args: &[String]) -> Option<usize> {
    args.iter().position(|arg| arg == "-i")
}

fn input_url(args: &[String]) -> Option<&str> {
    let idx = input_index(args)?;
    args.get(idx + 1).map(String::as_str)
}

fn inspect_args(args: &[String]) -> Option<(usize, usize, &str, FilterShape)> {
    if args
        .iter()
        .any(|arg| matches!(arg.as_str(), "-hwaccel" | "-filter_complex" | "-lavfi"))
    {
        return None;
    }
    let input = input_index(args)?;
    if args[..input].windows(2).any(|pair| pair[0] == "-c:v") {
        return None;
    }
    let after_input = args.get(input + 2..)?;
    let codec = after_input
        .windows(2)
        .find(|pair| pair[0] == "-c:v")?
        .get(1)?
        .as_str();
    let filter_rel = after_input.iter().position(|arg| arg == "-vf")?;
    let filter_index = input + 2 + filter_rel;
    let shape = parse_filter_shape(args.get(filter_index + 1)?)?;
    Some((input, filter_index, codec, shape))
}

fn needs_source_video_for(args: &[String], unmeasured: bool) -> bool {
    let Some((_, _, codec, shape)) = inspect_args(args) else {
        return false;
    };
    matches!(
        (codec, shape),
        ("h264_nvenc", FilterShape::CropScale { .. })
            | ("h264_qsv", FilterShape::CropScale { .. }) if unmeasured || codec == "h264_nvenc"
    ) || (unmeasured && codec == "h264_amf" && matches!(shape, FilterShape::Scale { .. }))
}

fn is_cuda_supported_source(source_codec: &str) -> bool {
    source_codec.eq_ignore_ascii_case("h264")
        || source_codec.eq_ignore_ascii_case("hevc")
        || source_codec.eq_ignore_ascii_case("h265")
        || source_codec.eq_ignore_ascii_case("av1")
}

fn cuvid_decoder_for(source_codec: &str) -> Option<&'static str> {
    if source_codec.eq_ignore_ascii_case("h264") {
        Some("h264_cuvid")
    } else if source_codec.eq_ignore_ascii_case("hevc") || source_codec.eq_ignore_ascii_case("h265")
    {
        Some("hevc_cuvid")
    } else {
        None
    }
}

fn candidate_for(
    args: &[String],
    source: Option<&SourceVideo>,
    unmeasured: bool,
) -> Option<Vec<String>> {
    let (input, filter_index, codec, shape) = inspect_args(args)?;
    if let Some(src) = source {
        if codec == "h264_nvenc" {
            if !is_cuda_supported_source(&src.codec) {
                return None;
            }
        } else if !src.codec.eq_ignore_ascii_case("h264") {
            return None;
        }
    }
    let mut result = args.to_vec();
    match (codec, shape) {
        ("h264_nvenc", FilterShape::Scale { width, height }) => {
            result[filter_index + 1] = format!("scale_cuda=w={width}:h={height}:format=nv12");
            result.splice(
                input..input,
                ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"].map(String::from),
            );
            Some(result)
        }
        // scale_cuda ignores AVFrame->crop_* on CUDA surfaces; *_cuvid crops and scales in NVDEC/VRAM.
        (
            "h264_nvenc",
            FilterShape::CropScale {
                crop,
                width,
                height,
            },
        ) => {
            let src = source?;
            let resolved = crop.resolve(src.width, src.height)?;
            if let Some(decoder) = cuvid_decoder_for(&src.codec) {
                result.drain(filter_index..filter_index + 2);
                let mut prefix = vec![
                    "-hwaccel".to_string(),
                    "cuda".to_string(),
                    "-hwaccel_output_format".to_string(),
                    "cuda".to_string(),
                    "-c:v".to_string(),
                    decoder.to_string(),
                ];
                if resolved.top != 0
                    || resolved.bottom != 0
                    || resolved.left != 0
                    || resolved.right != 0
                {
                    prefix.push("-crop".into());
                    prefix.push(format!(
                        "{}x{}x{}x{}",
                        resolved.top, resolved.bottom, resolved.left, resolved.right
                    ));
                }
                prefix.push("-resize".into());
                prefix.push(format!("{width}x{height}"));
                result.splice(input..input, prefix);
                Some(result)
            } else if src.codec.eq_ignore_ascii_case("av1") {
                // av1_cuvid faults on pre-keyframe RTMP packets; native NVDEC hwaccel + crop + scale_cuda avoids cuvid.
                result[filter_index + 1] = format!(
                    "crop={}:{}:{}:{},hwupload_cuda,scale_cuda=w={width}:h={height}:format=nv12",
                    resolved.cw, resolved.ch, resolved.left, resolved.top
                );
                result.splice(input..input, ["-hwaccel", "cuda"].map(String::from));
                Some(result)
            } else {
                None
            }
        }
        ("h264_qsv", FilterShape::Scale { width, height }) if unmeasured => {
            result[filter_index + 1] = format!("scale_qsv=w={width}:h={height}:format=nv12");
            result.splice(
                input..input,
                ["-hwaccel", "qsv", "-hwaccel_output_format", "qsv"].map(String::from),
            );
            Some(result)
        }
        (
            "h264_qsv",
            FilterShape::CropScale {
                crop,
                width,
                height,
            },
        ) if unmeasured => {
            let src = source?;
            let r = crop.resolve(src.width, src.height)?;
            result[filter_index + 1] = format!(
                "vpp_qsv=cw={}:ch={}:cx={}:cy={}:w={width}:h={height}:format=nv12",
                r.cw, r.ch, r.left, r.top
            );
            result.splice(
                input..input,
                ["-hwaccel", "qsv", "-hwaccel_output_format", "qsv"].map(String::from),
            );
            Some(result)
        }
        // scale_d3d11 rejects D3D11 decoder array textures; only 1:1 re-encodes pass textures directly to AMF.
        ("h264_amf", FilterShape::Scale { width, height }) if unmeasured => {
            let src = source?;
            if src.width != width || src.height != height {
                return None;
            }
            result.drain(filter_index..filter_index + 2);
            result.splice(
                input..input,
                ["-hwaccel", "d3d11va", "-hwaccel_output_format", "d3d11"].map(String::from),
            );
            Some(result)
        }
        _ => None,
    }
}

fn strip_parenthesized(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut depth = 0u32;
    for ch in input.chars() {
        match ch {
            '(' => depth = depth.saturating_add(1),
            ')' => depth = depth.saturating_sub(1),
            _ if depth == 0 => out.push(ch),
            _ => {}
        }
    }
    out
}

pub(crate) fn parse_source_video(stderr: &str) -> Option<SourceVideo> {
    let mut found: Option<SourceVideo> = None;
    for line in stderr.lines() {
        let Some((_, rest)) = line.split_once("Video: ") else {
            continue;
        };
        let cleaned = strip_parenthesized(rest);
        let mut fields = cleaned.split(',');
        let codec = fields
            .next()?
            .split_whitespace()
            .next()?
            .trim()
            .to_ascii_lowercase();
        if codec.is_empty() {
            continue;
        }
        for field in fields {
            let token = field.split_whitespace().next().unwrap_or("");
            let mut nums = token.split(|ch: char| !ch.is_ascii_digit());
            let (Some(Ok(width)), Some(Ok(height)), None) = (
                nums.next().map(str::parse::<u32>),
                nums.next().map(str::parse::<u32>),
                nums.next(),
            ) else {
                continue;
            };
            if width >= 16 && height >= 16 && token == format!("{width}x{height}") {
                if codec == "wrapped_avframe" {
                    if let Some(prev) = &mut found {
                        prev.width = width;
                        prev.height = height;
                    }
                } else if found.is_none() {
                    found = Some(SourceVideo {
                        codec: codec.clone(),
                        width,
                        height,
                    });
                }
                break;
            }
        }
    }
    found
}

async fn probe_source_video(
    app: &AppHandle,
    source_url: &str,
    running: &AtomicBool,
) -> Option<SourceVideo> {
    let command = app.shell().sidecar("ffmpeg").ok()?;
    let mut args = vec!["-hide_banner".to_string()];
    if source_url.contains("://") {
        args.extend(["-rw_timeout".into(), "1500000".into()]);
    }
    if source_url.starts_with("rtmp://") || source_url.starts_with("rtmps://") {
        args.extend(["-rtmp_enhanced_codecs".into(), "hvc1,av01".into()]);
    }
    args.extend([
        "-analyzeduration".into(),
        "500000".into(),
        "-probesize".into(),
        "262144".into(),
        "-i".into(),
        source_url.to_string(),
        "-map".into(),
        "0:v:0".into(),
        "-frames:v".into(),
        "1".into(),
        "-an".into(),
        "-sn".into(),
        "-f".into(),
        "null".into(),
        "-".into(),
    ]);
    let (mut events, child) = command.args(args).spawn().ok()?;
    crate::job::adopt_pid(child.pid());

    let mut output = String::new();
    let deadline = tokio::time::Instant::now() + PROBE_TIMEOUT;
    let mut poll = tokio::time::interval(Duration::from_millis(100));
    poll.tick().await;
    let terminated = loop {
        tokio::select! {
            ev = events.recv() => match ev {
                Some(CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes)) => {
                    if output.len() < 32 * 1024 {
                        output.push_str(&String::from_utf8_lossy(&bytes));
                    }
                    if let Some(probed) = parse_source_video(&output) {
                        if !probed.codec.eq_ignore_ascii_case("av1")
                            || output.contains("wrapped_avframe")
                        {
                            break false;
                        }
                    }
                }
                Some(CommandEvent::Terminated(_)) | None => break true,
                _ => {}
            },
            _ = poll.tick() => {
                if !running.load(Ordering::Relaxed) || tokio::time::Instant::now() >= deadline {
                    break false;
                }
            }
        }
    };
    if !terminated {
        let _ = tauri::async_runtime::spawn_blocking(move || {
            crate::commands::kill_sidecar(child);
        })
        .await;
        return None;
    }
    parse_source_video(&output)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(codec: &str, filter: &str) -> Vec<String> {
        ["-i", "input", "-vf", filter, "-c:v", codec, "out"]
            .map(String::from)
            .to_vec()
    }

    fn h264_1080p() -> SourceVideo {
        SourceVideo {
            codec: "h264".into(),
            width: 1920,
            height: 1080,
        }
    }

    #[test]
    fn keeps_supported_landscape_and_portrait_scales_on_one_device() {
        for (filter, expected_cuda, expected_qsv) in [
            (
                "scale=1280:720",
                "scale_cuda=w=1280:h=720:format=nv12",
                "scale_qsv=w=1280:h=720:format=nv12",
            ),
            (
                "scale=720:1280",
                "scale_cuda=w=720:h=1280:format=nv12",
                "scale_qsv=w=720:h=1280:format=nv12",
            ),
            (
                "scale=1080:1920",
                "scale_cuda=w=1080:h=1920:format=nv12",
                "scale_qsv=w=1080:h=1920:format=nv12",
            ),
        ] {
            let nvenc = candidate_for(&args("h264_nvenc", filter), None, false).unwrap();
            assert!(nvenc.windows(2).any(|pair| pair == ["-hwaccel", "cuda"]));
            assert!(nvenc.iter().any(|arg| arg == expected_cuda));

            let qsv = candidate_for(&args("h264_qsv", filter), None, true).unwrap();
            assert!(qsv.windows(2).any(|pair| pair == ["-hwaccel", "qsv"]));
            assert!(qsv.iter().any(|arg| arg == expected_qsv));
            assert!(candidate_for(&args("h264_qsv", filter), None, false).is_none());
        }
    }

    #[test]
    fn a_split_portrait_graph_keeps_the_cpu_path() {
        let split = "split=2[cam][main];[cam]crop=min(ih*0.3000\\,iw/1.6071)*1.6071:min(ih*0.3000\\,iw/1.6071):(iw-min(ih*0.3000\\,iw/1.6071)*1.6071)*1.0000:(ih-min(ih*0.3000\\,iw/1.6071))*1.0000,scale=720:448,setsar=1[top];[main]crop=min(ih*1.0000\\,iw/0.8654)*0.8654:min(ih*1.0000\\,iw/0.8654):(iw-min(ih*1.0000\\,iw/0.8654)*0.8654)*0.5000:(ih-min(ih*1.0000\\,iw/0.8654))*0.5000,scale=720:832,setsar=1[bottom];[top][bottom]vstack=inputs=2";
        let src = h264_1080p();
        assert!(candidate_for(&args("h264_nvenc", split), Some(&src), true).is_none());
        assert!(candidate_for(&args("h264_qsv", split), Some(&src), true).is_none());
        assert!(!needs_source_video_for(&args("h264_nvenc", split), true));
    }

    #[test]
    fn resolves_vertical_reframe_crops_on_cuda_and_qsv_when_source_is_known() {
        let reframe = "crop=min(iw\\,ih*0.8000*0.5625):ih*0.8000:(iw-min(iw\\,ih*0.8000*0.5625))*0.2500:(ih-ih*0.8000)*0.5000,scale=720:1280";
        let src = h264_1080p();

        // Without source dimensions, CUDA refuses to guess rather than squishing 16:9 into 9:16.
        assert!(candidate_for(&args("h264_nvenc", reframe), None, false).is_none());
        assert!(needs_source_video_for(&args("h264_nvenc", reframe), false));

        // 1920x1080 at z=0.8, ar=0.5625, x=0.25, y=0.5 -> cw=486, ch=864, left=358, right=1076, top=108, bottom=108.
        let nvenc = candidate_for(&args("h264_nvenc", reframe), Some(&src), false).unwrap();
        assert!(nvenc.windows(2).any(|pair| pair == ["-c:v", "h264_cuvid"]));
        assert!(nvenc
            .windows(2)
            .any(|pair| pair == ["-crop", "108x108x358x1076"]));
        assert!(nvenc.windows(2).any(|pair| pair == ["-resize", "720x1280"]));
        assert!(!nvenc.iter().any(|arg| arg == "-vf"));
        assert_eq!(
            crate::engine_policy::video_codec(&nvenc),
            Some("h264_nvenc")
        );

        let qsv = candidate_for(&args("h264_qsv", reframe), Some(&src), true).unwrap();
        assert!(qsv.windows(2).any(|pair| pair == ["-hwaccel", "qsv"]));
        assert!(qsv
            .iter()
            .any(|arg| { arg == "vpp_qsv=cw=486:ch=864:cx=358:cy=108:w=720:h=1280:format=nv12" }));
        assert!(candidate_for(&args("h264_qsv", reframe), Some(&src), false).is_none());
    }

    #[test]
    fn enables_d3d11va_for_amf_only_on_matching_resolution_when_opted_in() {
        let src = h264_1080p();
        assert!(candidate_for(&args("h264_amf", "scale=1920:1080"), Some(&src), false).is_none());
        assert!(candidate_for(&args("h264_amf", "scale=1280:720"), Some(&src), true).is_none());
        assert!(candidate_for(&args("h264_amf", "scale=1920:1080"), None, true).is_none());

        let amf = candidate_for(&args("h264_amf", "scale=1920:1080"), Some(&src), true).unwrap();
        assert!(amf.windows(2).any(|pair| pair == ["-hwaccel", "d3d11va"]));
        assert!(amf
            .windows(2)
            .any(|pair| pair == ["-hwaccel_output_format", "d3d11"]));
        assert!(!amf.iter().any(|arg| arg == "-vf"));
    }

    #[test]
    fn leaves_copy_software_non_h264_inputs_and_unsupported_filters_untouched() {
        let src = h264_1080p();
        for codec in ["copy", "libx264", "h264_videotoolbox"] {
            assert!(candidate_for(&args(codec, "scale=1280:720"), Some(&src), true).is_none());
        }
        let hevc_src = SourceVideo {
            codec: "hevc".into(),
            width: 1920,
            height: 1080,
        };
        let nvenc_hevc = candidate_for(
            &args("h264_nvenc", "crop=608:1080:656:0,scale=720:1280"),
            Some(&hevc_src),
            false,
        )
        .unwrap();
        assert!(nvenc_hevc
            .windows(2)
            .any(|pair| pair == ["-c:v", "hevc_cuvid"]));
        assert!(
            candidate_for(&args("h264_qsv", "scale=1280:720"), Some(&hevc_src), true).is_none()
        );

        let av1_src = SourceVideo {
            codec: "av1".into(),
            width: 1920,
            height: 1080,
        };
        let nvenc_av1 = candidate_for(
            &args("h264_nvenc", "crop=608:1080:656:0,scale=720:1280"),
            Some(&av1_src),
            false,
        )
        .unwrap();
        assert!(nvenc_av1
            .windows(2)
            .any(|pair| pair == ["-hwaccel", "cuda"]));
        assert!(nvenc_av1.iter().any(|arg| {
            arg == "crop=608:1080:656:0,hwupload_cuda,scale_cuda=w=720:h=1280:format=nv12"
        }));
        assert!(candidate_for(&args("h264_qsv", "scale=1280:720"), Some(&av1_src), true).is_none());
        let vp9_src = SourceVideo {
            codec: "vp9".into(),
            width: 1920,
            height: 1080,
        };
        assert!(candidate_for(
            &args("h264_nvenc", "crop=608:1080:656:0,scale=720:1280"),
            Some(&vp9_src),
            true
        )
        .is_none());

        for filter in [
            "scale=1281:720",
            "scale=720:1281",
            "scale=14:1280",
            "scale=1280:720,fps=30",
            "crop=iw/2:ih:0:0,scale=720:1280",
            "split=2[a][b];[a]scale=720:1280[out]",
        ] {
            assert!(
                candidate_for(&args("h264_nvenc", filter), Some(&src), true).is_none(),
                "must reject {filter}"
            );
        }

        let mut complex = args("h264_nvenc", "scale=720:1280");
        complex.push("-filter_complex".into());
        complex.push("null".into());
        assert!(candidate_for(&complex, Some(&src), true).is_none());
    }

    #[test]
    fn parses_ffmpeg_stream_headers_ignoring_hex_tags_and_color_tuples() {
        let stderr = "\
Input #0, flv, from 'rtmp://127.0.0.1:1935/live/stream':
  Duration: N/A, start: 0.033000, bitrate: 6160 kb/s
  Stream #0:0: Video: h264 (High), 1 reference frame ([7][0][0][0] / 0x0007), yuv420p(tv, bt709/bt709/bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 6000 kb/s, 60 fps, 60 tbr, 1k tbn
  Stream #0:1: Audio: aac (LC), 48000 Hz, stereo, fltp, 160 kb/s";
        assert_eq!(parse_source_video(stderr), Some(h264_1080p()));

        let av1_stderr = "\
Input #0, flv, from 'rtmp://127.0.0.1:1935/live/av1':
  Stream #0:0: Video: av1 (libdav1d) (Main), yuv420p(tv), 1920x1080, 30 fps
Output #0, null, to 'pipe:':
  Stream #0:0: Video: wrapped_avframe, yuv420p(tv, progressive), 1280x720 [SAR 1:1 DAR 16:9], q=2-31, 200 kb/s, 30 fps";
        assert_eq!(
            parse_source_video(av1_stderr),
            Some(SourceVideo {
                codec: "av1".into(),
                width: 1280,
                height: 720,
            })
        );
    }

    #[test]
    fn handles_portrait_inputs_4k_inputs_and_rejects_dimensions_above_hardware_limit() {
        let reframe_center = "crop=min(iw\\,ih*1.0000*0.5625):ih*1.0000:(iw-min(iw\\,ih*1.0000*0.5625))*0.5000:(ih-ih*1.0000)*0.5000,scale=1080:1920";
        let portrait_src = SourceVideo {
            codec: "h264".into(),
            width: 1080,
            height: 1920,
        };
        let portrait_out = candidate_for(
            &args("h264_nvenc", reframe_center),
            Some(&portrait_src),
            false,
        )
        .unwrap();
        assert!(!portrait_out.iter().any(|arg| arg == "-crop"));
        assert!(portrait_out
            .windows(2)
            .any(|pair| pair == ["-resize", "1080x1920"]));

        let uhd_src = SourceVideo {
            codec: "h264".into(),
            width: 3840,
            height: 2160,
        };
        let uhd_out =
            candidate_for(&args("h264_nvenc", reframe_center), Some(&uhd_src), false).unwrap();
        assert!(uhd_out
            .windows(2)
            .any(|pair| pair == ["-crop", "0x0x1312x1314"]));

        let ultrawide_src = SourceVideo {
            codec: "h264".into(),
            width: 5120,
            height: 1440,
        };
        assert!(
            candidate_for(
                &args("h264_nvenc", reframe_center),
                Some(&ultrawide_src),
                true
            )
            .is_none(),
            "inputs wider than 4096 exceed CUVID limits and must stay on the standard path"
        );
    }

    #[test]
    #[ignore = "requires verified ffmpeg and ffprobe on PATH in a disposable contributor checkout"]
    fn e2e_rtmp_vertical_gpu_pipeline_and_fallback() {
        use crate::config::{AppConfig, Reframe, Target, TargetEncoding, VideoPreset};
        use std::process::{Command, Stdio};

        let dir = std::env::temp_dir().join(format!(
            "corneta-gpu-pipeline-e2e-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let src_flv = dir.join("obs_1080p.flv");
        let out_flv = dir.join("vertical_out.flv");

        let gen_ok = Command::new("ffmpeg")
            .args(["-y", "-hide_banner", "-loglevel", "error"])
            .args(["-f", "lavfi", "-i", "smptehdbars=size=1920x1080:rate=30"])
            .args(["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000"])
            .args([
                "-t", "5", "-c:v", "libx264", "-preset", "veryfast", "-g", "30",
            ])
            .args([
                "-pix_fmt",
                "yuv420p",
                "-color_range",
                "tv",
                "-colorspace",
                "bt709",
            ])
            .args(["-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "128k"])
            .args(["-f", "flv"])
            .arg(&src_flv)
            .status()
            .is_ok_and(|s| s.success());
        assert!(gen_ok, "generate 5s synthetic 1080p source");

        let probe_out = Command::new("ffmpeg")
            .args(["-hide_banner", "-i"])
            .arg(&src_flv)
            .output()
            .expect("probe synthetic source");
        let probed = parse_source_video(&String::from_utf8_lossy(&probe_out.stderr))
            .expect("parse source video header");
        assert_eq!(probed, h264_1080p());

        let cfg = AppConfig {
            mode: "per-platform".into(),
            ..Default::default()
        };
        let make_target = |encoder: &str, url: String| Target {
            id: "vertical_test".into(),
            platform_id: "custom".into(),
            name: "Vertical Test".into(),
            enabled: true,
            protocol: "rtmp".into(),
            ingest_url: url,
            has_key: false,
            encoding: TargetEncoding {
                action: "transcode".into(),
                preset: Some(VideoPreset {
                    width: 720,
                    height: 1280,
                    fps: 30,
                    video_bitrate_kbps: 3000,
                    audio_bitrate_kbps: 128,
                    keyframe_sec: 2,
                }),
                encoder: encoder.into(),
                hybrid_override: None,
                reframe: Some(Reframe {
                    x: 0.25,
                    y: 0.5,
                    zoom: 0.8,
                    layout: None,
                    top: None,
                    split_ratio: None,
                }),
            },
        };

        let send_over_ephemeral_rtmp = |args: &[String]| -> bool {
            let port = std::net::TcpListener::bind("127.0.0.1:0")
                .and_then(|listener| listener.local_addr())
                .unwrap()
                .port();
            let rtmp_url = format!("rtmp://127.0.0.1:{port}/live/vertical");
            let mut receiver = Command::new("ffmpeg")
                .args([
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-listen",
                    "1",
                    "-i",
                    &rtmp_url,
                ])
                .args(["-c", "copy", "-f", "flv"])
                .arg(&out_flv)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .unwrap();
            std::thread::sleep(Duration::from_millis(300));

            let mut patched = args.to_vec();
            if let Some(last) = patched.last_mut() {
                *last = rtmp_url;
            }
            let status = Command::new("ffmpeg")
                .args(&patched)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
            let ok = status.is_ok_and(|s| s.success());
            if !ok {
                let _ = receiver.kill();
            }
            let _ = receiver.wait();
            ok
        };

        let src_str = src_flv.to_string_lossy().into_owned();
        let nvenc_base = crate::engine::ffmpeg_args_for_target(
            &cfg,
            &make_target("nvenc", "rtmp://127.0.0.1/live/vertical".into()),
            "",
            None,
            &src_str,
            None,
        );
        let nvenc_gpu = candidate_for(&nvenc_base, Some(&probed), false)
            .expect("vertical NVENC args must produce a GPU candidate");

        // Verify that an unavailable GPU candidate exits quickly and falls back cleanly on every host.
        let mut forced_missing_gpu = nvenc_gpu.clone();
        let input_pos = forced_missing_gpu.iter().position(|a| a == "-i").unwrap();
        forced_missing_gpu.splice(
            input_pos..input_pos,
            ["-hwaccel_device".into(), "99".into()],
        );
        assert!(!send_over_ephemeral_rtmp(&forced_missing_gpu));

        // Run the real GPU candidate; on GPU-less CI runners, verify clean fallback to software.
        if !send_over_ephemeral_rtmp(&nvenc_gpu) {
            let sw_fallback = crate::engine::ffmpeg_args_for_target(
                &cfg,
                &make_target("software", "rtmp://127.0.0.1/live/vertical".into()),
                "",
                None,
                &src_str,
                None,
            );
            assert!(
                send_over_ephemeral_rtmp(&sw_fallback),
                "software fallback must succeed over ephemeral local RTMP"
            );
        }

        let probe_stream = Command::new("ffprobe")
            .args([
                "-hide_banner",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height,sample_aspect_ratio,color_range",
                "-of",
                "compact",
            ])
            .arg(&out_flv)
            .output()
            .expect("ffprobe received RTMP output");
        assert!(probe_stream.status.success());
        let meta = String::from_utf8_lossy(&probe_stream.stdout);
        let _ = std::fs::remove_dir_all(&dir);
        assert!(meta.contains("width=720"), "unexpected width: {meta}");
        assert!(meta.contains("height=1280"), "unexpected height: {meta}");
        assert!(
            meta.contains("color_range=tv"),
            "limited color range must be preserved: {meta}"
        );
    }
}
