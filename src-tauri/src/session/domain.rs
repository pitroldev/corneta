//! Session format, recovery, and pruning policy with explicit timestamps and no I/O.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{json, Value};

use crate::engine::EngineSnapshot;
use crate::resources::ResourceAppSample;

pub const KEEP: usize = 50;
pub const MAX_SESSION_BYTES: u64 = 32 * 1024 * 1024;
/// A separate chat budget prevents busy chat from exhausting the metrics journal.
pub const MAX_CHAT_BYTES: u64 = 16 * 1024 * 1024;
pub const SCHEMA_VERSION: u32 = 4;
/// Inspect only the tail during startup instead of loading every journal in full.
pub const TAIL_BYTES: u64 = 64 * 1024;

pub fn valid_session_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 20 && id.bytes().all(|b| b.is_ascii_digit())
}

pub fn session_file_name(id: &str) -> String {
    format!("{id}.ndjson")
}

/// Separate chat storage supports independent erasure and capacity limits.
pub fn chat_path(session: &Path) -> PathBuf {
    let stem = session
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("sessao");
    session.with_file_name(format!("{stem}.chat.ndjson"))
}

pub fn is_session_file(path: &Path) -> bool {
    path.extension().and_then(|x| x.to_str()) == Some("ndjson")
        && path
            .file_stem()
            .and_then(|s| s.to_str())
            .is_some_and(valid_session_id)
}

/// Pruning may delete only recognized Corneta filenames, never arbitrary MP4s in a user-selected folder.
pub fn parse_video_name(name: &str) -> Option<(String, u32)> {
    let stem = name.strip_suffix(".mp4")?;
    match stem.split_once(".p") {
        Some((id, seg)) if valid_session_id(id) => Some((id.into(), seg.parse().ok()?)),
        Some(_) => None,
        None if valid_session_id(stem) => Some((stem.into(), 1)),
        None => None,
    }
}

pub fn video_id_of(path: &Path) -> Option<String> {
    let name = path.file_name()?.to_str()?;
    parse_video_name(name).map(|(id, _)| id)
}

pub fn meta_line(id: u64, mode: &str, platforms: Vec<Value>) -> Value {
    json!({
        "kind": "meta",
        "schemaVersion": SCHEMA_VERSION,
        "id": id.to_string(),
        "startedAt": id,
        "mode": mode,
        "platforms": platforms,
    })
}

/// Keep the total chat count for readers that predate per-channel chatBy counts.
pub fn sample_line(
    t: u64,
    snap: &EngineSnapshot,
    chat_by_channel: &HashMap<String, u64>,
    apps: &[ResourceAppSample],
) -> Value {
    let targets: Vec<Value> = snap
        .targets
        .values()
        .map(|x| {
            json!({
                "id": x.target_id,
                "name": x.name,
                "state": x.state,
                "bitrate": x.bitrate_kbps,
                "fps": x.fps,
                "dropped": x.dropped_frames,
            })
        })
        .collect();
    let mut sample = json!({
        "kind": "sample",
        "t": t,
        "cpu": snap.cpu,
        "gpu": snap.gpu,
        "memoryPct": snap.memory_pct,
        "obs": snap.obs,
        "chat": chat_by_channel.values().sum::<u64>(),
        "targets": targets,
    });
    // Omit empty collections to avoid repeated overhead in long sessions.
    if !chat_by_channel.is_empty() {
        sample["chatBy"] = json!(chat_by_channel);
    }
    if !apps.is_empty() {
        sample["apps"] = json!(apps);
    }
    sample
}

pub fn viewers_line(t: u64, total: u64, items: &[Value]) -> Value {
    json!({ "kind": "viewers", "t": t, "total": total, "items": items })
}

/// Store absolute follower totals so sampling start time does not distort later deltas.
pub fn followers_line(t: u64, items: &[Value]) -> Option<Value> {
    if items.is_empty() {
        return None;
    }
    Some(json!({ "kind": "followers", "t": t, "items": items }))
}

/// source shares the viewers/chatBy channel namespace; aggregator platforms cannot imply a channel.
pub fn alert_line(
    t: u64,
    platform: &str,
    source: &str,
    kind: &str,
    user: &str,
    amount: Option<f64>,
) -> Value {
    json!({
        "kind": "alert", "t": t,
        "platform": platform, "source": source,
        "alertKind": kind, "user": user, "amount": amount,
    })
}

pub fn end_line(t: u64) -> Value {
    json!({ "kind": "end", "endedAt": t })
}

/// Recovery closes an interrupted session on the next startup.
pub fn recovered_end_line(t: u64) -> Value {
    json!({ "kind": "end", "endedAt": t, "recovered": true })
}

/// A spawn-time estimate can differ from the first copied keyframe by up to one GOP.
pub fn recording_line(
    seg: u32,
    started_at: u64,
    file: &str,
    codec: &str,
    estimated: bool,
) -> Value {
    json!({
        "kind": "recording", "seg": seg, "t": started_at,
        "path": file, "codec": codec, "estimated": estimated,
    })
}

/// Periodically map wall time to recorded milliseconds to bound replay clock drift.
pub fn rec_sync_line(t: u64, seg: u32, out_ms: u64) -> Value {
    json!({ "kind": "recSync", "seg": seg, "t": t, "out": out_ms })
}

pub fn rec_end_line(t: u64, seg: u32, reason: &str) -> Value {
    json!({ "kind": "recEnd", "seg": seg, "t": t, "reason": reason })
}

/// Recovery omits seg because the interrupted segment may be unknown.
pub fn truncated_rec_end_line(t: u64) -> Value {
    json!({ "kind": "recEnd", "t": t, "reason": "truncated" })
}

pub fn rec_finalized_line(seg: u32, file: &str) -> Value {
    json!({ "kind": "recFinalized", "seg": seg, "path": file })
}

/// Record wall-clock adjustments so report and video timelines can compensate.
pub fn clock_jump_line(t: u64, delta_ms: i64) -> Value {
    json!({ "kind": "clockJump", "t": t, "delta": delta_ms })
}

/// Append-only offset edits use the last value.
pub fn offset_line(offset_ms: i64) -> Value {
    json!({ "kind": "offset", "ms": offset_ms })
}

pub fn marker_line(t: u64, label: &str) -> Value {
    json!({ "kind": "marker", "t": t, "label": label })
}

/// Compact keys bound per-message journal overhead: t=time, p=platform, s=source, a=author,
/// c=color, m=text, i=native ID for matching deletions.
pub fn chat_msg_line(
    t: u64,
    platform: &str,
    source: &str,
    author: &str,
    color: Option<&str>,
    text: &str,
    native_id: Option<&str>,
) -> Value {
    let mut v = json!({ "t": t, "p": platform, "s": source, "a": author, "m": text });
    if let Some(c) = color {
        v["c"] = json!(c);
    }
    if let Some(id) = native_id {
        v["i"] = json!(id);
    }
    v
}

/// Distinguish a disconnected chat interval from genuine silence in replay.
pub fn chat_gap_line(t: u64, from: u64) -> Value {
    json!({ "t": t, "gap": from })
}

/// Replay must respect moderation deletions rather than republish removed messages.
pub fn chat_delete_line(t: u64, native_id: &str) -> Value {
    json!({ "t": t, "del": native_id })
}

/// Allow ordinary sampling delays under load without reporting a clock jump.
pub const CLOCK_TOLERANCE_MS: i64 = 2_000;

pub fn clock_drift_ms(mono_delta_ms: i64, wall_delta_ms: i64) -> i64 {
    wall_delta_ms - mono_delta_ms
}

pub fn is_clock_jump(drift_ms: i64) -> bool {
    drift_ms.abs() > CLOCK_TOLERANCE_MS
}

#[derive(Debug, PartialEq, Eq)]
pub enum Recovery {
    Complete,
    Interrupted { was_recording: bool },
}

/// The byte-limited tail may start inside a line; ignore that incomplete JSON record.
pub fn recovery_from_tail(raw: &str) -> Recovery {
    let mut was_recording = None;
    for value in raw
        .lines()
        .rev()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
    {
        match value.get("kind").and_then(Value::as_str) {
            // Post-live edits may follow end without reopening the session.
            Some("end") => return Recovery::Complete,
            Some("recording") if was_recording.is_none() => was_recording = Some(true),
            Some("recEnd") if was_recording.is_none() => was_recording = Some(false),
            _ => {}
        }
    }
    Recovery::Interrupted {
        was_recording: was_recording.unwrap_or(false),
    }
}

/// Prefer the earliest valid end if an older version appended a later recovery end.
pub fn ended_at_from_tail(raw: &str, started_at: u64) -> Option<u64> {
    raw.lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .filter(|value| value.get("kind").and_then(Value::as_str) == Some("end"))
        .filter_map(|value| value.get("endedAt").and_then(Value::as_u64))
        .filter(|ended_at| *ended_at >= started_at)
        .min()
}

pub fn worth_recovering(len: u64) -> bool {
    len > 0 && len <= MAX_SESSION_BYTES
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMeta {
    pub source_revision: String,
    pub id: String,
    pub started_at: u64,
    pub ended_at: Option<u64>,
    pub duration_sec: u64,
    pub mode: String,
    pub platforms: Value,
    /// Determine video availability from files, not stale recording events.
    pub has_video: bool,
    pub has_chat: bool,
}

/// mtime is only a fallback end estimate for sessions without a recorded end.
pub fn parse_meta_line(first: &str, mtime_ms: Option<u64>) -> Option<SessionMeta> {
    let v: Value = serde_json::from_str(first.trim()).ok()?;
    if v.get("kind")?.as_str()? != "meta" {
        return None;
    }
    let started_at = v.get("startedAt")?.as_u64()?;
    let duration_sec = mtime_ms
        .map(|e| e.saturating_sub(started_at) / 1000)
        .unwrap_or(0);
    Some(SessionMeta {
        source_revision: String::new(),
        id: v.get("id")?.as_str()?.to_string(),
        started_at,
        ended_at: mtime_ms,
        duration_sec,
        mode: v
            .get("mode")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
        platforms: v.get("platforms").cloned().unwrap_or_else(|| json!([])),
        has_video: false, // Populated by one shared directory scan when listing sessions.
        has_chat: false,
    })
}

/// Count only session journals, excluding chat siblings. Callers remove associated chat and video files.
pub fn plan_session_prune(files: &[PathBuf], keep: usize) -> Vec<PathBuf> {
    let mut sessions: Vec<PathBuf> = files
        .iter()
        .filter(|p| is_session_file(p))
        .cloned()
        .collect();
    if sessions.len() <= keep {
        return vec![];
    }
    sessions.sort();
    let remove = sessions.len() - keep;
    sessions.truncate(remove);
    sessions
}

pub struct VideoFile {
    pub path: PathBuf,
    pub len: u64,
    pub id: String,
}

pub struct VideoPrunePlan {
    /// Orphaned recordings are removed before applying the space budget.
    pub orphans: Vec<PathBuf>,
    /// Oldest first, paired with file sizes.
    pub candidates: Vec<(PathBuf, u64)>,
    /// Only recordings with retained reports count toward the budget.
    pub total: u64,
    pub budget: u64,
}

/// Video retention uses bytes; session retention uses count.
pub fn plan_video_prune(
    files: Vec<VideoFile>,
    known_ids: &[String],
    keep_gb: u64,
) -> VideoPrunePlan {
    let budget = keep_gb.saturating_mul(1024 * 1024 * 1024);
    let mut orphans = Vec::new();
    let mut keepers: Vec<VideoFile> = Vec::new();
    let mut total: u64 = 0;
    for f in files {
        if known_ids.iter().any(|k| k == &f.id) {
            total += f.len;
            keepers.push(f);
        } else {
            orphans.push(f.path);
        }
    }
    keepers.sort_by(|a, b| a.id.cmp(&b.id));
    VideoPrunePlan {
        orphans,
        candidates: if total <= budget {
            vec![]
        } else {
            keepers.into_iter().map(|f| (f.path, f.len)).collect()
        },
        total,
        budget,
    }
}

#[cfg(test)]
pub fn fits_cap(current_len: u64, cap: u64) -> bool {
    current_len < cap
}
