//! Recording arguments, replay anchors, and restart policy without process or filesystem access.

use std::path::{Path, PathBuf};

/// Missing progress is treated as a stalled encoder even without a termination event.
pub const STALL_MS: u128 = 10_000;
/// Periodic anchors bound wall-clock drift over long streams.
pub const SYNC_EVERY_MS: u64 = 5 * 60_000;
/// Stop before exhausting space needed by session logs, configuration, and the OS.
pub const DISK_FLOOR: u64 = 2 * 1024 * 1024 * 1024;
pub const DISK_START_FLOOR: u64 = 5 * 1024 * 1024 * 1024;
pub const DISK_CHECK_EVERY: std::time::Duration = std::time::Duration::from_secs(30);
/// Bound repeated spawns after persistent failures.
pub const MAX_RESTARTS: u32 = 5;
/// Allow OBS to start sending before failed encoder attempts consume the restart budget.
pub const WAIT_FOR_SOURCE_MS: u128 = 2 * 60_000;
/// Poll a missing source slowly because each attempt spawns a process.
pub const SOURCE_RETRY_MS: u64 = 2_000;
/// Estimate the replay anchor if the file grows without reporting progress.
pub const ANCHOR_TIMEOUT_MS: u128 = 15_000;

/// Persisted protocol codes translated by the frontend.
pub const REASON_STOP: &str = "stopped";
pub const REASON_DISK: &str = "disk";
pub const REASON_DIED: &str = "died";
pub const REASON_GIVEUP: &str = "giveup";

/// Keep this naming contract aligned with session::parse_video_name: pruning must never delete OBS recordings.
pub fn video_path(dir: &Path, id: &str, seg: u32) -> PathBuf {
    if seg <= 1 {
        dir.join(format!("{id}.mp4"))
    } else {
        dir.join(format!("{id}.p{seg}.mp4"))
    }
}

/// Reuse the encoded program stream without another encode.
pub fn record_args(source: &str, out: &Path) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "warning".into(),
        "-i".into(),
        source.into(),
        "-c".into(),
        "copy".into(),
        // Fragmented MP4 remains playable after an interrupted recording.
        "-movflags".into(),
        "+frag_keyframe+empty_moov+default_base_moof".into(),
        "-f".into(),
        "mp4".into(),
        "-y".into(),
        out.to_string_lossy().to_string(),
        // Progress drives replay anchors and stalled-encoder detection.
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
    ]
}

/// Build a seekable MP4 index without re-encoding.
pub fn remux_args(src: &Path, dst: &Path) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-i".into(),
        src.to_string_lossy().to_string(),
        "-c".into(),
        "copy".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-y".into(),
        dst.to_string_lossy().to_string(),
    ]
}

/// Synthetic input lets the user check recording and playback before starting OBS.
pub fn test_args(out: &Path) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-f".into(),
        "lavfi".into(),
        "-i".into(),
        "testsrc2=size=640x360:rate=30".into(),
        "-f".into(),
        "lavfi".into(),
        "-i".into(),
        "sine=frequency=440:sample_rate=48000".into(),
        "-t".into(),
        "5".into(),
        "-c:v".into(),
        "libx264".into(),
        "-preset".into(),
        "ultrafast".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-c:a".into(),
        "aac".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-y".into(),
        out.to_string_lossy().to_string(),
    ]
}

/// Share pruning's filename parser so retries cannot overwrite an existing segment.
pub fn next_segment(file_names: &[String], id: &str) -> u32 {
    file_names
        .iter()
        .filter_map(|n| crate::session::parse_video_name(n))
        .filter(|(video_id, _)| video_id == id)
        .map(|(_, seg)| seg)
        .max()
        .map_or(1, |largest| largest + 1)
}

// FFmpeg's out_time_ms is in microseconds; parse the formatted out_time instead.
pub fn parse_out_time_ms(line: &str) -> Option<u64> {
    let raw = line.trim().strip_prefix("out_time=")?;
    if raw.starts_with('N') {
        return None; // No timestamp is available before the first packet.
    }
    let mut parts = raw.split(':');
    let h: u64 = parts.next()?.trim().parse().ok()?;
    let m: u64 = parts.next()?.trim().parse().ok()?;
    let s: f64 = parts.next()?.trim().parse().ok()?;
    Some((h * 3600 + m * 60) * 1000 + (s * 1000.0) as u64)
}

#[derive(serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DirCheck {
    pub ok: bool,
    /// Frontend protocol values: missing, notDir, or readonly.
    pub error: Option<String>,
    pub free_bytes: Option<u64>,
    pub low_space: bool,
    pub removable_or_network: bool,
    pub long_path: bool,
}

pub enum DirProblem {
    Missing,
    NotDir,
    /// ACLs and cloud-sync folders require a write probe; permission attributes are insufficient.
    ReadOnly,
}

impl DirProblem {
    pub fn code(&self) -> &'static str {
        match self {
            DirProblem::Missing => "missing",
            DirProblem::NotDir => "notDir",
            DirProblem::ReadOnly => "readonly",
        }
    }
}

impl DirCheck {
    pub fn problem(p: DirProblem) -> Self {
        DirCheck {
            error: Some(p.code().into()),
            ..Default::default()
        }
    }

    pub fn healthy(path: &str, free: Option<u64>) -> Self {
        DirCheck {
            ok: true,
            error: None,
            free_bytes: free,
            low_space: blocks_start(free),
            removable_or_network: path.starts_with("\\\\") || path.starts_with("//"),
            long_path: path.chars().count() > 200,
        }
    }
}

/// Unknown free space does not block recording on unsupported platforms.
pub fn blocks_start(free: Option<u64>) -> bool {
    free.is_some_and(|f| f < DISK_START_FLOOR)
}

pub fn hit_floor(free: Option<u64>) -> bool {
    free.is_some_and(|f| f < DISK_FLOOR)
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct ProgressActions {
    /// File time zero is now minus out_ms, not spawn time: stream copy waits for a keyframe.
    pub anchor_out_ms: Option<u64>,
    pub sync_out_ms: Option<u64>,
    pub advanced: bool,
}

#[derive(Default)]
pub struct SegmentProgress {
    anchored: bool,
    last_out: u64,
    last_sync_out: u64,
}

impl SegmentProgress {
    pub fn anchored(&self) -> bool {
        self.anchored
    }

    pub fn estimate_anchor(&mut self) {
        self.anchored = true;
    }

    pub fn observe(&mut self, out_ms: u64) -> ProgressActions {
        let advanced = out_ms > self.last_out;
        if advanced {
            self.last_out = out_ms;
        }
        let anchor_out_ms = if self.anchored {
            None
        } else {
            self.anchored = true;
            Some(out_ms)
        };
        let sync_out_ms = if out_ms.saturating_sub(self.last_sync_out) >= SYNC_EVERY_MS {
            self.last_sync_out = out_ms;
            Some(out_ms)
        } else {
            None
        };
        ProgressActions {
            anchor_out_ms,
            sync_out_ms,
            advanced,
        }
    }
}

/// Stall detection starts after the first anchor; initial source waiting has its own timeout.
pub fn is_stalled(anchored: bool, since_advance_ms: u128) -> bool {
    anchored && since_advance_ms > STALL_MS
}

pub fn should_estimate_anchor(anchored: bool, since_spawn_ms: u128, bytes_written: u64) -> bool {
    !anchored && since_spawn_ms > ANCHOR_TIMEOUT_MS && bytes_written > 0
}

/// A requested stop takes precedence over failure diagnostics.
pub fn final_reason(stopping: bool, reason: &'static str) -> &'static str {
    if stopping {
        REASON_STOP
    } else {
        reason
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum AfterSegment {
    Stop,
    DiskFull,
    /// Reuse the segment number and restart budget until the source first produces video.
    WaitingForSource {
        seg: u32,
        backoff_ms: u64,
    },
    /// Increasing backoff prevents a spawn loop on persistent failures.
    Resume {
        seg: u32,
        backoff_ms: u64,
    },
    GiveUp,
}

/// Successful recording resets the budget so independent outages do not accumulate.
#[derive(Default)]
pub struct RestartBudget {
    used: u32,
    /// Before any recorded packet, encoder exits may mean OBS has not started sending yet.
    ever_recorded: bool,
}

impl RestartBudget {
    pub fn earned(&mut self) {
        self.used = 0;
        self.ever_recorded = true;
    }

    #[cfg(test)]
    pub fn used(&self) -> u32 {
        self.used
    }

    /// since_start_ms measures this recorder run, not the current segment.
    pub fn after_segment(
        &mut self,
        seg: u32,
        stopping: bool,
        reason: &str,
        since_start_ms: u128,
    ) -> AfterSegment {
        if stopping {
            return AfterSegment::Stop;
        }
        if reason == REASON_DISK {
            return AfterSegment::DiskFull;
        }
        if !self.ever_recorded && since_start_ms < WAIT_FOR_SOURCE_MS {
            return AfterSegment::WaitingForSource {
                seg,
                backoff_ms: SOURCE_RETRY_MS,
            };
        }
        self.used += 1;
        if self.used > MAX_RESTARTS {
            return AfterSegment::GiveUp;
        }
        AfterSegment::Resume {
            seg: seg + 1,
            backoff_ms: 500 * self.used as u64,
        }
    }
}
