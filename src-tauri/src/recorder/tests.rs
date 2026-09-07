use std::path::{Path, PathBuf};

use super::domain::{
    self, AfterSegment, DirCheck, DirProblem, RestartBudget, SegmentProgress, DISK_FLOOR,
    DISK_START_FLOOR, MAX_RESTARTS, REASON_DIED, REASON_DISK, REASON_STOP, SOURCE_RETRY_MS,
    SYNC_EVERY_MS,
};

const GB: u64 = 1024 * 1024 * 1024;
const AFTER_SOURCE_WAIT: u128 = domain::WAIT_FOR_SOURCE_MS + 1;

#[cfg(windows)]
fn bundled_ffmpeg() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join("ffmpeg-x86_64-pc-windows-msvc.exe")
}

#[test]
fn out_time_is_parsed_in_milliseconds() {
    assert_eq!(
        domain::parse_out_time_ms("out_time=00:00:01.000000"),
        Some(1_000)
    );
    assert_eq!(
        domain::parse_out_time_ms("out_time=01:02:03.500000"),
        Some(3_723_500)
    );
    assert_eq!(
        domain::parse_out_time_ms("out_time=00:00:00.000000"),
        Some(0)
    );
}

#[test]
fn non_timestamp_progress_lines_are_ignored() {
    assert_eq!(domain::parse_out_time_ms("out_time_ms=1000000"), None);
    assert_eq!(domain::parse_out_time_ms("out_time=N/A"), None);
    assert_eq!(domain::parse_out_time_ms("frame=30"), None);
    assert_eq!(domain::parse_out_time_ms("progress=continue"), None);
    assert_eq!(domain::parse_out_time_ms(""), None);
    assert_eq!(domain::parse_out_time_ms("out_time=lixo"), None);
}

#[test]
fn segment_names_match_the_pruning_contract() {
    let d = Path::new("D:/Lives");
    assert!(domain::video_path(d, "1721400000000", 1).ends_with("1721400000000.mp4"));
    assert!(domain::video_path(d, "1721400000000", 3).ends_with("1721400000000.p3.mp4"));
    for seg in 1..4 {
        let p = domain::video_path(d, "1721400000000", seg);
        let name = p.file_name().unwrap().to_str().unwrap();
        assert!(
            crate::session::parse_video_name(name).is_some(),
            "pruning must recognize {name}"
        );
    }
}

#[test]
fn resuming_preserves_existing_segments() {
    let names = |v: &[&str]| v.iter().map(|s| (*s).to_string()).collect::<Vec<_>>();

    assert_eq!(domain::next_segment(&[], "1721400000000"), 1);
    assert_eq!(
        domain::next_segment(
            &names(&[
                "1721400000000.mp4",
                "1721400000000.p2.mp4",
                "1721400000000.p3.mp4"
            ]),
            "1721400000000"
        ),
        4
    );
    assert_eq!(
        domain::next_segment(
            &names(&["1799999999999.p9.mp4", "1721400000000.mp4"]),
            "1721400000000"
        ),
        2
    );
    assert_eq!(
        domain::next_segment(
            &names(&["ferias.mp4", "2024-07-30 21-15-03.mp4"]),
            "1721400000000"
        ),
        1
    );
}

#[test]
fn recording_uses_stream_copy_and_fragmented_mp4() {
    let a = domain::record_args("rtmp://x/live/obs_program", Path::new("D:/a.mp4"));
    let joined = a.join(" ");
    assert!(joined.contains("-c copy"), "recording must not re-encode");
    assert!(
        joined.contains("frag_keyframe"),
        "recording must survive interruption"
    );
    assert!(
        joined.contains("default_base_moof") && !joined.contains("default_base_is_moof"),
        "the flag must use the name accepted by FFmpeg's MP4 muxer"
    );
    assert!(
        joined.contains("-progress pipe:1"),
        "progress is required to create an anchor"
    );
    assert!(
        !joined.contains("faststart"),
        "faststart belongs to remuxing, not recording"
    );
}

#[test]
fn remux_builds_an_index_without_reencoding() {
    let a = domain::remux_args(Path::new("a.mp4"), Path::new("b.mp4")).join(" ");
    assert!(a.contains("-c copy"));
    assert!(a.contains("+faststart"));
}

#[test]
fn five_second_recording_test_does_not_need_live_input() {
    let a = domain::test_args(Path::new("t.mp4")).join(" ");
    assert!(a.contains("lavfi"));
    assert!(a.contains("-t 5"));
    assert!(!a.contains("rtmp"));
}

#[test]
fn only_the_first_progress_line_creates_an_anchor() {
    let mut p = SegmentProgress::default();
    assert!(!p.anchored());

    let first = p.observe(240);
    assert_eq!(first.anchor_out_ms, Some(240));
    assert!(first.advanced);
    assert!(p.anchored());

    let second = p.observe(2_000);
    assert_eq!(
        second.anchor_out_ms, None,
        "each segment is anchored only once"
    );
    assert!(second.advanced);
}

#[test]
fn sync_anchors_are_spaced_five_minutes_apart() {
    let mut p = SegmentProgress::default();
    assert_eq!(p.observe(0).sync_out_ms, None);
    assert_eq!(p.observe(SYNC_EVERY_MS - 1).sync_out_ms, None);
    assert_eq!(p.observe(SYNC_EVERY_MS).sync_out_ms, Some(SYNC_EVERY_MS));
    assert_eq!(p.observe(SYNC_EVERY_MS + 1).sync_out_ms, None);
    assert_eq!(
        p.observe(2 * SYNC_EVERY_MS).sync_out_ms,
        Some(2 * SYNC_EVERY_MS)
    );
}

#[test]
fn repeated_progress_does_not_count_as_an_advance() {
    let mut p = SegmentProgress::default();
    p.observe(1_000);
    assert!(!p.observe(1_000).advanced);
    assert!(
        !p.observe(500).advanced,
        "backward progress must not reset the watchdog"
    );
    assert!(p.observe(1_001).advanced);
}

#[test]
fn stall_watchdog_starts_only_after_anchoring() {
    assert!(!domain::is_stalled(false, 60_000));
    assert!(!domain::is_stalled(true, domain::STALL_MS));
    assert!(domain::is_stalled(true, domain::STALL_MS + 1));
}

#[test]
fn estimated_anchor_requires_written_bytes() {
    assert!(!domain::should_estimate_anchor(
        false,
        domain::ANCHOR_TIMEOUT_MS + 1,
        0
    ));
    assert!(!domain::should_estimate_anchor(false, 1_000, 4_096));
    assert!(!domain::should_estimate_anchor(
        true,
        domain::ANCHOR_TIMEOUT_MS + 1,
        4_096
    ));
    assert!(domain::should_estimate_anchor(
        false,
        domain::ANCHOR_TIMEOUT_MS + 1,
        4_096
    ));
}

#[test]
fn unknown_free_space_does_not_block_recording() {
    assert!(!domain::blocks_start(None));
    assert!(!domain::hit_floor(None));
}

#[test]
fn starting_and_continuing_have_different_disk_thresholds() {
    assert!(domain::blocks_start(Some(3 * GB)));
    assert!(!domain::hit_floor(Some(3 * GB)));
    assert!(domain::hit_floor(Some(GB)));
    assert!(domain::blocks_start(Some(GB)));
    assert!(!domain::blocks_start(Some(DISK_START_FLOOR)));
    assert!(!domain::hit_floor(Some(DISK_FLOOR)));
}

#[test]
fn network_directory_warns_without_blocking_selection() {
    let network = DirCheck::healthy("\\\\servidor\\lives", Some(50 * GB));
    assert!(network.ok);
    assert!(network.removable_or_network);
    assert!(!network.low_space);
    assert!(network.error.is_none());

    let low_space = DirCheck::healthy("D:/Lives", Some(GB));
    assert!(
        low_space.ok,
        "low space warns without blocking directory selection"
    );
    assert!(low_space.low_space);

    let long_path = DirCheck::healthy(&format!("D:/{}", "a".repeat(250)), None);
    assert!(long_path.long_path);
    assert!(long_path.free_bytes.is_none());
}

#[test]
fn invalid_directory_returns_a_translatable_protocol_code() {
    for (problem, code) in [
        (DirProblem::Missing, "missing"),
        (DirProblem::NotDir, "notDir"),
        (DirProblem::ReadOnly, "readonly"),
    ] {
        let c = DirCheck::problem(problem);
        assert!(!c.ok);
        assert_eq!(c.error.as_deref(), Some(code));
    }
}

#[test]
fn stopping_does_not_consume_a_restart_attempt() {
    let mut b = RestartBudget::default();
    assert_eq!(b.after_segment(1, true, REASON_STOP, 0), AfterSegment::Stop);
    assert_eq!(b.used(), 0);
    assert_eq!(b.after_segment(1, true, REASON_DIED, 0), AfterSegment::Stop);
    assert_eq!(b.used(), 0);
}

#[test]
fn disk_full_stops_without_consuming_a_restart_attempt() {
    let mut b = RestartBudget::default();
    assert_eq!(
        b.after_segment(1, false, REASON_DISK, 0),
        AfterSegment::DiskFull
    );
    assert_eq!(b.used(), 0);
}

#[test]
fn backoff_increases_with_each_restart() {
    let mut b = RestartBudget::default();
    b.earned();
    assert_eq!(
        b.after_segment(1, false, REASON_DIED, 0),
        AfterSegment::Resume {
            seg: 2,
            backoff_ms: 500
        }
    );
    assert_eq!(
        b.after_segment(2, false, REASON_DIED, 0),
        AfterSegment::Resume {
            seg: 3,
            backoff_ms: 1_000
        }
    );
    assert_eq!(
        b.after_segment(3, false, REASON_DIED, 0),
        AfterSegment::Resume {
            seg: 4,
            backoff_ms: 1_500
        }
    );
}

#[test]
fn recording_gives_up_after_the_restart_limit() {
    let mut b = RestartBudget::default();
    b.earned();
    for seg in 1..=MAX_RESTARTS {
        assert!(
            matches!(
                b.after_segment(seg, false, REASON_DIED, 0),
                AfterSegment::Resume { .. }
            ),
            "restart {seg} must still fit the budget"
        );
    }
    assert_eq!(
        b.after_segment(MAX_RESTARTS + 1, false, REASON_DIED, 0),
        AfterSegment::GiveUp
    );
}

#[test]
fn successful_recording_resets_the_restart_budget() {
    let mut b = RestartBudget::default();
    let mut progress;
    for hour in 1..=6u32 {
        progress = SegmentProgress::default();
        assert_eq!(progress.observe(1_000).anchor_out_ms, Some(1_000));
        b.earned();

        assert!(
            matches!(
                b.after_segment(hour, false, REASON_DIED, 0),
                AfterSegment::Resume { .. }
            ),
            "failure at hour {hour} must not exhaust the budget after successful recording"
        );
    }
}

#[test]
fn waiting_for_obs_does_not_exhaust_the_restart_budget() {
    let mut b = RestartBudget::default();
    for attempt in 0..20u128 {
        let decision = b.after_segment(1, false, REASON_DIED, attempt * SOURCE_RETRY_MS as u128);
        assert_eq!(
            decision,
            AfterSegment::WaitingForSource {
                seg: 1,
                backoff_ms: SOURCE_RETRY_MS
            },
            "attempt {attempt}: waiting for the source is not a failure"
        );
    }
    assert_eq!(
        b.used(),
        0,
        "waiting for OBS must not consume the restart budget"
    );

    b.earned();
    assert!(matches!(
        b.after_segment(1, false, REASON_DIED, 60_000),
        AfterSegment::Resume { seg: 2, .. }
    ));
}

#[test]
fn waiting_for_source_does_not_advance_the_segment() {
    let mut b = RestartBudget::default();
    for _ in 0..5 {
        assert_eq!(
            b.after_segment(1, false, REASON_DIED, 1_000),
            AfterSegment::WaitingForSource {
                seg: 1,
                backoff_ms: SOURCE_RETRY_MS
            }
        );
    }
}

#[test]
fn failures_consume_the_budget_after_source_wait_expires() {
    let mut b = RestartBudget::default();
    assert!(matches!(
        b.after_segment(1, false, REASON_DIED, domain::WAIT_FOR_SOURCE_MS - 1),
        AfterSegment::WaitingForSource { .. }
    ));
    assert_eq!(b.used(), 0);
    assert!(matches!(
        b.after_segment(1, false, REASON_DIED, domain::WAIT_FOR_SOURCE_MS),
        AfterSegment::Resume { seg: 2, .. }
    ));
    assert_eq!(b.used(), 1);
}

#[test]
fn stop_and_disk_full_take_precedence_over_source_waiting() {
    let mut b = RestartBudget::default();
    assert_eq!(b.after_segment(1, true, REASON_DIED, 0), AfterSegment::Stop);
    let mut b = RestartBudget::default();
    assert_eq!(
        b.after_segment(1, false, REASON_DISK, 0),
        AfterSegment::DiskFull
    );
}

#[test]
fn persistent_failure_without_recording_eventually_gives_up() {
    let mut b = RestartBudget::default();
    let mut last = AfterSegment::Stop;
    for seg in 1..=MAX_RESTARTS + 1 {
        last = b.after_segment(seg, false, REASON_DIED, AFTER_SOURCE_WAIT);
    }
    assert_eq!(last, AfterSegment::GiveUp);
}

#[test]
fn requested_stop_overrides_the_failure_reason() {
    assert_eq!(domain::final_reason(true, REASON_DIED), REASON_STOP);
    assert_eq!(domain::final_reason(true, REASON_DISK), REASON_STOP);
    assert_eq!(domain::final_reason(false, REASON_DIED), REASON_DIED);
    assert_eq!(domain::final_reason(false, REASON_DISK), REASON_DISK);
}

#[cfg(windows)]
#[test]
fn bundled_ffmpeg_accepts_and_decodes_the_recording() {
    use std::process::Command;

    let ffmpeg = bundled_ffmpeg();
    assert!(
        ffmpeg.is_file(),
        "the FFmpeg sidecar must exist to validate recording"
    );
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!(
        "corneta-recorder-test-{}-{nonce}",
        std::process::id()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let source = dir.join("source.mp4");
    let recorded = dir.join("recorded.mp4");

    let generated = Command::new(&ffmpeg)
        .args(domain::test_args(&source))
        .output()
        .unwrap();
    assert!(
        generated.status.success(),
        "synthetic source failed: {}",
        String::from_utf8_lossy(&generated.stderr)
    );

    let recording = Command::new(&ffmpeg)
        .args(domain::record_args(&source.to_string_lossy(), &recorded))
        .output()
        .unwrap();
    assert!(
        recording.status.success(),
        "production recording arguments were rejected: {}",
        String::from_utf8_lossy(&recording.stderr)
    );

    for selector in ["0:v:0", "0:a:0"] {
        let decoded = Command::new(&ffmpeg)
            .args([
                "-hide_banner",
                "-xerror",
                "-v",
                "error",
                "-i",
                &recorded.to_string_lossy(),
                "-map",
                selector,
                "-f",
                "null",
                "NUL",
            ])
            .output()
            .unwrap();
        assert!(
            decoded.status.success(),
            "stream {selector} did not decode cleanly: {}",
            String::from_utf8_lossy(&decoded.stderr)
        );
    }

    let _ = std::fs::remove_file(source);
    let _ = std::fs::remove_file(recorded);
    let _ = std::fs::remove_dir(dir);
}
