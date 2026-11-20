use crate::config::{AppConfig, InputFeed, Target, VideoPreset};
use crate::platforms::{accepts_codec, recommended_preset, VideoCodec};
pub use crate::platforms::{copy_limits, CopyLimits};

// Imported presets are untrusted; bound derived bitrate/GOP arithmetic and FFmpeg arguments.
pub(super) fn sanitize_preset(mut p: VideoPreset) -> VideoPreset {
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

fn smart_hybrid_action_for(platform_id: &str, source_feed: InputFeed) -> &'static str {
    if source_feed == InputFeed::Primary && crate::platforms::is_vertical(platform_id) {
        "transcode"
    } else {
        "copy"
    }
}

/// What OBS is set to send, read over obs-websocket or local profile settings.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SourceSignal {
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    /// Known only in OBS's simple output mode.
    pub video_kbps: Option<u32>,
    pub video_codec: VideoCodec,
}

fn exceeds(signal: &SourceSignal, limits: &CopyLimits) -> bool {
    !limits.accepts_codec(signal.video_codec)
        || signal.width.min(signal.height) > limits.max_height
        || signal.fps > f64::from(limits.max_fps) + 0.5
        || signal.video_kbps.is_some_and(|kbps| kbps > limits.max_kbps)
}

/// Smart copies what a destination accepts and transcodes where the source codec or dimensions exceed it.
fn signal_hybrid_action(
    platform_id: &str,
    source_feed: InputFeed,
    signal: Option<&SourceSignal>,
) -> &'static str {
    let action = smart_hybrid_action_for(platform_id, source_feed);
    if action != "copy" {
        return action;
    }
    let Some(signal) = signal else {
        return action;
    };
    if !accepts_codec(platform_id, signal.video_codec) {
        return "transcode";
    }
    match copy_limits(platform_id) {
        Some(limits) if exceeds(signal, &limits) => "transcode",
        _ => action,
    }
}

/// Pins Smart's choice for this live; a per-destination choice made by the user is kept.
pub fn apply_source_signal(config: &mut AppConfig, signal: &SourceSignal) -> Vec<String> {
    if config.mode != "hybrid" {
        return Vec::new();
    }
    let mut transcoded = Vec::new();
    for target in config
        .targets
        .iter_mut()
        .filter(|t| t.enabled && t.encoding.source_feed == InputFeed::Primary)
    {
        if target
            .encoding
            .hybrid_override
            .as_deref()
            .is_some_and(|choice| !choice.is_empty())
        {
            continue;
        }
        if signal_hybrid_action(
            &target.platform_id,
            target.encoding.source_feed,
            Some(signal),
        ) == "transcode"
            && smart_hybrid_action_for(&target.platform_id, target.encoding.source_feed) == "copy"
        {
            target.encoding.hybrid_override = Some("transcode".into());
            transcoded.push(target.platform_id.clone());
        }
    }
    transcoded
}

/// The tightest limits among the enabled destinations that receive OBS's primary signal as-is.
pub fn strictest_copy_limits(config: &AppConfig) -> Option<CopyLimits> {
    config
        .targets
        .iter()
        .filter(|t| {
            t.enabled
                && t.encoding.source_feed == InputFeed::Primary
                && effective_action(&config.mode, t) == "copy"
        })
        .filter_map(|t| copy_limits(&t.platform_id))
        .reduce(|a, b| CopyLimits {
            max_height: a.max_height.min(b.max_height),
            max_fps: a.max_fps.min(b.max_fps),
            max_kbps: a.max_kbps.min(b.max_kbps),
            accepted_codecs: a.accepted_codecs.intersect(b.accepted_codecs),
        })
}

pub fn destination_accepts_codec(platform_id: &str, codec: VideoCodec) -> bool {
    accepts_codec(platform_id, codec)
}

pub fn effective_action<'a>(mode: &str, t: &'a Target) -> &'a str {
    match mode {
        "passthrough" => "copy",
        "per-platform" => "transcode",
        _ => match t.encoding.hybrid_override.as_deref() {
            Some(o) if !o.is_empty() => o,
            _ => smart_hybrid_action_for(&t.platform_id, t.encoding.source_feed),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::TargetEncoding;

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

    fn signal(width: u32, height: u32, fps: f64, video_kbps: Option<u32>) -> SourceSignal {
        SourceSignal {
            width,
            height,
            fps,
            video_kbps,
            video_codec: VideoCodec::H264,
        }
    }

    fn codec_signal(
        video_codec: VideoCodec,
        width: u32,
        height: u32,
        fps: f64,
        video_kbps: Option<u32>,
    ) -> SourceSignal {
        SourceSignal {
            width,
            height,
            fps,
            video_kbps,
            video_codec,
        }
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
    fn smart_mode_transcodes_only_what_the_obs_signal_exceeds() {
        let full_hd = signal(1920, 1080, 60.0, Some(6000));
        assert_eq!(
            signal_hybrid_action("twitch", InputFeed::Primary, Some(&full_hd)),
            "copy"
        );
        assert_eq!(
            signal_hybrid_action("youtube", InputFeed::Primary, Some(&full_hd)),
            "copy"
        );
        assert_eq!(
            signal_hybrid_action(
                "twitch",
                InputFeed::Primary,
                Some(&signal(2560, 1440, 60.0, None))
            ),
            "transcode"
        );
        assert_eq!(
            signal_hybrid_action(
                "youtube",
                InputFeed::Primary,
                Some(&signal(2560, 1440, 60.0, None))
            ),
            "copy"
        );
        assert_eq!(
            signal_hybrid_action(
                "twitch",
                InputFeed::Primary,
                Some(&signal(1920, 1080, 59.94, None))
            ),
            "copy",
            "NTSC rates count as 60"
        );
        assert_eq!(
            signal_hybrid_action(
                "twitch",
                InputFeed::Primary,
                Some(&signal(1920, 1080, 120.0, None))
            ),
            "transcode"
        );
        assert_eq!(
            signal_hybrid_action(
                "twitch",
                InputFeed::Primary,
                Some(&signal(1920, 1080, 60.0, Some(9000)))
            ),
            "transcode"
        );
        assert_eq!(
            signal_hybrid_action(
                "kick",
                InputFeed::Primary,
                Some(&signal(1920, 1080, 60.0, Some(8000)))
            ),
            "copy"
        );
        assert_eq!(
            signal_hybrid_action("twitch", InputFeed::Primary, None),
            "copy"
        );
        assert_eq!(
            signal_hybrid_action("tiktok", InputFeed::Primary, Some(&full_hd)),
            "transcode",
            "vertical destinations fed from primary landscape canvas transcode"
        );
        assert_eq!(
            signal_hybrid_action("tiktok", InputFeed::Vertical, None),
            "copy",
            "vertical destinations fed from dedicated vertical canvas copy at 0% GPU"
        );
        assert_eq!(
            signal_hybrid_action(
                "x",
                InputFeed::Primary,
                Some(&signal(3840, 2160, 60.0, None))
            ),
            "copy",
            "unknown limits keep the copy"
        );
    }

    #[test]
    fn the_obs_signal_pins_smart_choices_for_one_live() {
        let mut config = AppConfig {
            mode: "hybrid".into(),
            targets: vec![tgt("twitch", None), tgt("youtube", None), tgt("kick", None)],
            ..Default::default()
        };
        config.targets[2].encoding.hybrid_override = Some("copy".into());
        let pinned = apply_source_signal(&mut config, &signal(2560, 1440, 60.0, None));
        assert_eq!(pinned, ["twitch"]);
        assert_eq!(
            config.targets[0].encoding.hybrid_override.as_deref(),
            Some("transcode")
        );
        assert_eq!(config.targets[1].encoding.hybrid_override, None);
        assert_eq!(
            config.targets[2].encoding.hybrid_override.as_deref(),
            Some("copy"),
            "the user's own choice wins"
        );

        config.mode = "passthrough".into();
        config.targets[0].encoding.hybrid_override = None;
        assert!(apply_source_signal(&mut config, &signal(2560, 1440, 60.0, None)).is_empty());
    }

    #[test]
    fn obs_fits_the_strictest_destination_that_copies() {
        let mut config = AppConfig {
            mode: "hybrid".into(),
            targets: vec![tgt("youtube", None), tgt("kick", None), tgt("tiktok", None)],
            ..Default::default()
        };
        assert_eq!(
            strictest_copy_limits(&config),
            Some(CopyLimits {
                max_height: 1080,
                max_fps: 60,
                max_kbps: 8000,
                accepted_codecs: crate::platforms::AcceptedCodecs::H264_ONLY,
            })
        );
        config.targets.push(tgt("twitch", None));
        assert_eq!(
            strictest_copy_limits(&config).map(|l| l.max_kbps),
            Some(6000)
        );
        config.mode = "per-platform".into();
        assert_eq!(strictest_copy_limits(&config), None, "nothing is copied");
    }

    #[test]
    fn smart_mode_copies_enhanced_rtmp_to_youtube_and_shares_one_h264_rendition_for_legacy_targets()
    {
        for codec in [VideoCodec::Hevc, VideoCodec::Av1] {
            let obs = codec_signal(codec, 2560, 1440, 60.0, Some(7000));
            assert_eq!(
                signal_hybrid_action("youtube", InputFeed::Primary, Some(&obs)),
                "copy"
            );
            assert_eq!(
                signal_hybrid_action("custom", InputFeed::Primary, Some(&obs)),
                "copy"
            );
            for legacy in ["twitch", "kick", "facebook", "x", "tiktok", "instagram"] {
                assert_eq!(
                    signal_hybrid_action(legacy, InputFeed::Primary, Some(&obs)),
                    "transcode",
                    "{legacy} must transcode {codec:?}"
                );
            }

            let mut yt = tgt("youtube", None);
            yt.id = "yt".into();
            let mut tw = tgt("twitch", None);
            tw.id = "tw".into();
            let mut kk = tgt("kick", None);
            kk.id = "kk".into();
            let mut config = AppConfig {
                mode: "hybrid".into(),
                targets: vec![yt, tw, kk],
                ..Default::default()
            };
            let pinned = apply_source_signal(&mut config, &obs);
            assert_eq!(pinned, ["twitch", "kick"]);
            assert_eq!(effective_action(&config.mode, &config.targets[0]), "copy");
            assert_eq!(
                effective_action(&config.mode, &config.targets[1]),
                "transcode"
            );
            assert_eq!(
                effective_action(&config.mode, &config.targets[2]),
                "transcode"
            );

            let plans = crate::renditions::plan(
                &config,
                "rtmp://127.0.0.1:1935/live/obs",
                "rtmp://127.0.0.1:1935/live/obs_vertical",
                Some("h264_nvenc"),
            );
            assert_eq!(
                plans.len(),
                1,
                "Twitch and Kick must share one H.264 rendition"
            );
            assert_eq!(plans[0].targets, ["tw", "kk"]);
        }
    }
}
