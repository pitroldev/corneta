//! Experimental GPU-resident decode/scale/encode. Opt-in until measured across
//! devices; unsupported codecs, CPU filters and providers retain the stable path.
pub(crate) fn enabled() -> bool {
    std::env::var("CORNETA_EXPERIMENTAL_GPU_PIPELINE").is_ok_and(|value| value == "1")
}

pub(crate) fn candidate(args: &[String]) -> Option<Vec<String>> {
    let codec = args.windows(2).find(|pair| pair[0] == "-c:v")?.get(1)?;
    let (device, format, scaler) = match codec.as_str() {
        "h264_nvenc" => ("cuda", "cuda", "scale_cuda"),
        "h264_qsv" => ("qsv", "qsv", "scale_qsv"),
        // The bundled FFmpeg has no scale_amf/scale_d3d11. No CPU→GPU→CPU detour.
        _ => return None,
    };
    if args.iter().any(|arg| arg == "-hwaccel") {
        return None;
    }
    let filter_index = args.iter().position(|arg| arg == "-vf")?;
    let scale = args.get(filter_index + 1)?.strip_prefix("scale=")?;
    let (width, height) = scale.split_once(':')?;
    let width: u32 = width.parse().ok()?;
    let height: u32 = height.parse().ok()?;
    if width < height
        || width < 16
        || !width.is_multiple_of(2)
        || height < 16
        || !height.is_multiple_of(2)
    {
        return None;
    }
    let mut result = args.to_vec();
    result[filter_index + 1] = format!("{scaler}=w={width}:h={height}:format=nv12");
    let input = result.iter().position(|arg| arg == "-i")?;
    result.splice(
        input..input,
        ["-hwaccel", device, "-hwaccel_output_format", format].map(String::from),
    );
    Some(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn args(codec: &str, filter: &str) -> Vec<String> {
        ["-i", "input", "-vf", filter, "-c:v", codec, "out"]
            .map(String::from)
            .to_vec()
    }
    #[test]
    fn keeps_supported_simple_pipeline_on_one_device() {
        let result = candidate(&args("h264_nvenc", "scale=1280:720")).unwrap();
        assert!(result.windows(2).any(|pair| pair == ["-hwaccel", "cuda"]));
        assert!(result
            .iter()
            .any(|arg| arg == "scale_cuda=w=1280:h=720:format=nv12"));
        assert!(candidate(&args("h264_qsv", "scale=1280:720")).is_some());
    }
    #[test]
    fn leaves_copy_unsupported_providers_and_cpu_filters_untouched() {
        for codec in ["copy", "libx264", "h264_amf"] {
            assert!(candidate(&args(codec, "scale=1280:720")).is_none());
        }
        for filter in [
            "crop=640:720,scale=720:1280",
            "scale=720:1280",
            "scale=1281:720",
            "scale=1280:720,fps=30",
        ] {
            assert!(candidate(&args("h264_nvenc", filter)).is_none());
        }
    }
}
