//! Bounded NDJSON journals for post-stream reports and chat replay.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::config::AppConfig;
use crate::engine::EngineSnapshot;
use crate::i18n::Msg;

pub mod domain;
mod store;
mod writer;

use domain::{MAX_CHAT_BYTES, MAX_SESSION_BYTES};
use store::DiskStore;

pub(crate) use domain::parse_video_name;
pub use domain::{chat_path, valid_session_id, SessionMeta};

/// Storage failures must not interrupt the live stream.
pub trait SessionStore {
    /// Append within this file's independent capacity limit.
    fn append(&self, file: &Path, line: &Value, cap: u64);
    /// Create or truncate the journal with its first record.
    fn create(&self, file: &Path, first: &Value);
    /// Request a bounded drain; a timeout does not release an active writer's ownership.
    fn close(&self, file: &Path);
    /// Byte length, or zero when missing.
    fn len(&self, file: &Path) -> u64;
    /// Read at most max bytes from the tail.
    fn tail(&self, file: &Path, max: u64) -> Option<String>;
    fn first_line(&self, file: &Path) -> Option<String>;
    fn read(&self, file: &Path) -> Option<String>;
    /// Modification time in epoch milliseconds.
    fn modified_ms(&self, file: &Path) -> Option<u64>;
    /// Return unfiltered directory entries; callers enforce filename policy.
    fn list(&self, dir: &Path) -> Vec<PathBuf>;
    /// Return whether the file was actually removed.
    fn remove(&self, file: &Path) -> bool;
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn sessions_dir(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?.join("sessions");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

fn session_path(app: &AppHandle, id: &str) -> Option<PathBuf> {
    if !valid_session_id(id) {
        return None;
    }
    Some(sessions_dir(app)?.join(domain::session_file_name(id)))
}

/// Cache this per-message decision to avoid configuration I/O in the chat path.
static RECORD_CHAT: AtomicBool = AtomicBool::new(false);

pub fn set_chat_recording(on: bool) {
    RECORD_CHAT.store(on, Ordering::Relaxed);
}

pub fn chat_recording() -> bool {
    RECORD_CHAT.load(Ordering::Relaxed)
}

/// Compare wall time against a monotonic anchor to detect clock adjustments.
static CLOCK: OnceLock<Mutex<Option<(Instant, u64)>>> = OnceLock::new();

fn detect_clock_jump(store: &dyn SessionStore, path: &Path) {
    let cell = CLOCK.get_or_init(|| Mutex::new(None));
    let Ok(mut last) = cell.lock() else { return };
    let now_wall = now_ms();
    let now_mono = Instant::now();
    if let Some((prev_mono, prev_wall)) = *last {
        let drift = domain::clock_drift_ms(
            now_mono.duration_since(prev_mono).as_millis() as i64,
            now_wall as i64 - prev_wall as i64,
        );
        if domain::is_clock_jump(drift) {
            log::warn!("system clock jumped {drift}ms; recording the adjustment");
            store.append(
                path,
                &domain::clock_jump_line(now_ms(), drift),
                MAX_SESSION_BYTES,
            );
        }
    }
    *last = Some((now_mono, now_wall));
}

/// Do not compare across sessions: Windows QPC pauses during sleep, unlike wall time.
fn reset_clock_anchor() {
    if let Some(cell) = CLOCK.get() {
        if let Ok(mut last) = cell.lock() {
            *last = None;
        }
    }
}

pub fn start_session(app: &AppHandle, config: &AppConfig) -> Option<PathBuf> {
    let dir = sessions_dir(app)?;
    prune_sessions(&DiskStore, &dir, domain::KEEP);
    let id = now_ms();
    let path = dir.join(domain::session_file_name(&id.to_string()));
    let platforms: Vec<Value> = config
        .targets
        .iter()
        .filter(|t| t.enabled)
        .map(|t| json!({ "id": t.id, "name": t.name, "platformId": t.platform_id }))
        .collect();
    DiskStore.create(&path, &domain::meta_line(id, &config.mode, platforms));
    if config.settings.record_chat {
        DiskStore.prepare_chat(&chat_path(&path));
    }
    reset_clock_anchor();
    log::info!("report: recording session to {}", path.display());
    Some(path)
}

pub fn end_session(path: &Path) {
    DiskStore.append(path, &domain::end_line(now_ms()), MAX_SESSION_BYTES);
    DiskStore.close(path);
    // Chat has its own writer and must also drain before process shutdown.
    DiskStore.close(&chat_path(path));
}

/// Recover interrupted sessions at startup, before another session can begin.
pub fn recover_incomplete_sessions(app: &AppHandle) {
    let Some(dir) = sessions_dir(app) else { return };
    recover_all(&DiskStore, &dir, now_ms());
}

fn recover_all(store: &dyn SessionStore, dir: &Path, now: u64) {
    for path in store
        .list(dir)
        .into_iter()
        .filter(|p| domain::is_session_file(p))
    {
        if !domain::worth_recovering(store.len(&path)) {
            continue;
        }
        let Some(tail) = store.tail(&path, domain::TAIL_BYTES) else {
            continue;
        };
        let domain::Recovery::Interrupted { was_recording } = domain::recovery_from_tail(&tail)
        else {
            continue;
        };
        if was_recording {
            store.append(
                &path,
                &domain::truncated_rec_end_line(now),
                MAX_SESSION_BYTES,
            );
        }
        store.append(&path, &domain::recovered_end_line(now), MAX_SESSION_BYTES);
    }
}

pub fn record_sample(
    path: &Path,
    snap: &EngineSnapshot,
    chat_by_channel: &HashMap<String, u64>,
    apps: &[crate::resources::ResourceAppSample],
) {
    detect_clock_jump(&DiskStore, path);
    DiskStore.append(
        path,
        &domain::sample_line(now_ms(), snap, chat_by_channel, apps),
        MAX_SESSION_BYTES,
    );
}

pub fn record_viewers(path: &Path, total: u64, items: &[Value]) {
    DiskStore.append(
        path,
        &domain::viewers_line(now_ms(), total, items),
        MAX_SESSION_BYTES,
    );
}

pub fn record_followers(path: &Path, items: &[Value]) {
    if let Some(line) = domain::followers_line(now_ms(), items) {
        DiskStore.append(path, &line, MAX_SESSION_BYTES);
    }
}

pub fn record_alert(
    path: &Path,
    platform: &str,
    source: &str,
    kind: &str,
    user: &str,
    amount: Option<f64>,
) {
    DiskStore.append(
        path,
        &domain::alert_line(now_ms(), platform, source, kind, user, amount),
        MAX_SESSION_BYTES,
    );
}

pub fn record_marker(path: &Path, label: &str) {
    record_marker_at(path, now_ms(), label);
}

/// Use the replayed instant, not the time the user clicked the marker button.
pub fn record_marker_at(path: &Path, t: u64, label: &str) {
    DiskStore.append(path, &domain::marker_line(t, label), MAX_SESSION_BYTES);
}

pub fn record_recording(
    path: &Path,
    seg: u32,
    started_at: u64,
    file: &str,
    codec: &str,
    estimated: bool,
) {
    DiskStore.append(
        path,
        &domain::recording_line(seg, started_at, file, codec, estimated),
        MAX_SESSION_BYTES,
    );
}

pub fn record_rec_sync(path: &Path, seg: u32, out_ms: u64) {
    DiskStore.append(
        path,
        &domain::rec_sync_line(now_ms(), seg, out_ms),
        MAX_SESSION_BYTES,
    );
}

pub fn record_rec_end(path: &Path, seg: u32, reason: &str) {
    DiskStore.append(
        path,
        &domain::rec_end_line(now_ms(), seg, reason),
        MAX_SESSION_BYTES,
    );
}

pub fn record_rec_finalized(path: &Path, seg: u32, file: &str) {
    DiskStore.append(
        path,
        &domain::rec_finalized_line(seg, file),
        MAX_SESSION_BYTES,
    );
}

pub fn record_offset(path: &Path, offset_ms: i64) {
    DiskStore.append(path, &domain::offset_line(offset_ms), MAX_SESSION_BYTES);
}

#[allow(clippy::too_many_arguments)]
pub fn record_chat_msg(
    session: &Path,
    t: u64,
    platform: &str,
    source: &str,
    author: &str,
    color: Option<&str>,
    text: &str,
    native_id: Option<&str>,
) {
    DiskStore.append(
        &chat_path(session),
        &domain::chat_msg_line(t, platform, source, author, color, text, native_id),
        MAX_CHAT_BYTES,
    );
}

pub fn record_chat_gap(session: &Path, from: u64) {
    DiskStore.append(
        &chat_path(session),
        &domain::chat_gap_line(now_ms(), from),
        MAX_CHAT_BYTES,
    );
}

pub fn record_chat_delete(session: &Path, native_id: &str) {
    DiskStore.append(
        &chat_path(session),
        &domain::chat_delete_line(now_ms(), native_id),
        MAX_CHAT_BYTES,
    );
}

pub fn list_sessions(app: &AppHandle, video_dir: Option<&Path>) -> Vec<SessionMeta> {
    let Some(dir) = sessions_dir(app) else {
        return vec![];
    };
    // Share one directory scan across the list, especially for slow external drives.
    let recorded: Vec<String> = video_dirs(app, video_dir)
        .iter()
        .flat_map(|d| video_files(&DiskStore, d))
        .filter(|f| f.len > 0)
        .map(|f| f.id)
        .collect();
    list_in(&DiskStore, &dir, &recorded)
}

fn list_in(store: &dyn SessionStore, dir: &Path, recorded: &[String]) -> Vec<SessionMeta> {
    let mut out: Vec<SessionMeta> = store
        .list(dir)
        .into_iter()
        .filter(|p| domain::is_session_file(p))
        .filter_map(|p| {
            let mut m = domain::parse_meta_line(&store.first_line(&p)?, store.modified_ms(&p))?;
            // Prefer a recorded end: copying files or editing markers changes mtime, not live duration.
            if let Some(ended_at) = store
                .tail(&p, domain::TAIL_BYTES)
                .as_deref()
                .and_then(|tail| domain::ended_at_from_tail(tail, m.started_at))
            {
                m.ended_at = Some(ended_at);
                m.duration_sec = ended_at.saturating_sub(m.started_at) / 1000;
            }
            m.has_video = recorded.iter().any(|id| id == &m.id);
            m.has_chat = store.len(&chat_path(&p)) > 0;
            m.source_revision = format!("{}:{}", store.len(&p), store.modified_ms(&p).unwrap_or(0));
            Some(m)
        })
        .collect();
    out.sort_by_key(|item| std::cmp::Reverse(item.started_at));
    out
}

pub fn read_session(app: &AppHandle, id: &str) -> Option<String> {
    let path = session_path(app, id)?;
    if DiskStore.len(&path) > MAX_SESSION_BYTES {
        log::warn!("session rejected: file exceeds {MAX_SESSION_BYTES} bytes");
        return None;
    }
    DiskStore.read(&path)
}

pub fn read_chat(app: &AppHandle, id: &str) -> Option<String> {
    let path = chat_path(&session_path(app, id)?);
    if DiskStore.len(&path) > MAX_CHAT_BYTES {
        return None;
    }
    DiskStore.read(&path)
}

/// Binary IPC avoids JSON escaping and caps the read itself against concurrent file growth.
pub fn read_bytes(app: &AppHandle, id: &str, chat: bool) -> Option<Vec<u8>> {
    use std::io::Read;
    let path = session_path(app, id)?;
    let path = if chat { chat_path(&path) } else { path };
    let cap = if chat {
        MAX_CHAT_BYTES
    } else {
        MAX_SESSION_BYTES
    };
    let file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(error) if chat && error.kind() == std::io::ErrorKind::NotFound => return Some(vec![]),
        Err(_) => return None,
    };
    let len = file.metadata().ok()?.len();
    if len > cap {
        return None;
    }
    let mut bytes = Vec::with_capacity(len as usize);
    file.take(cap + 1).read_to_end(&mut bytes).ok()?;
    (bytes.len() as u64 <= cap).then_some(bytes)
}

pub fn delete_session(app: &AppHandle, id: &str, video_dir: Option<&Path>) -> Result<(), String> {
    let path = session_path(app, id).ok_or_else(|| Msg::SessionInvalidId.now())?;
    DiskStore.remove(&chat_path(&path));
    delete_recordings(app, id, video_dir)?;
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(Msg::SessionDeleteFailed { e: &e.to_string() }.now()),
    }
}

/// Remove recordings without deleting the report or chat.
pub fn delete_recordings(
    app: &AppHandle,
    id: &str,
    video_dir: Option<&Path>,
) -> Result<(), String> {
    if !valid_session_id(id) {
        return Err(Msg::SessionInvalidId.now());
    }
    for dir in video_dirs(app, video_dir) {
        for f in video_files(&DiskStore, &dir) {
            if f.id == id {
                DiskStore.remove(&f.path);
            }
        }
    }
    Ok(())
}

fn video_dirs(app: &AppHandle, configured: Option<&Path>) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    if let Some(d) = configured {
        if !d.as_os_str().is_empty() {
            out.push(d.to_path_buf());
        }
    }
    if let Some(d) = sessions_dir(app) {
        if !out.contains(&d) {
            out.push(d);
        }
    }
    out
}

fn video_files(store: &dyn SessionStore, dir: &Path) -> Vec<domain::VideoFile> {
    store
        .list(dir)
        .into_iter()
        .filter_map(|path| {
            let id = domain::video_id_of(&path)?;
            let len = store.len(&path);
            Some(domain::VideoFile { path, len, id })
        })
        .collect()
}

fn known_ids(store: &dyn SessionStore, dir: &Path) -> Vec<String> {
    store
        .list(dir)
        .into_iter()
        .filter(|p| domain::is_session_file(p))
        .filter_map(|p| p.file_stem().and_then(|s| s.to_str()).map(str::to_owned))
        .collect()
}

fn prune_sessions(store: &dyn SessionStore, dir: &Path, keep: usize) {
    for path in domain::plan_session_prune(&store.list(dir), keep) {
        store.remove(&chat_path(&path));
        store.remove(&path);
    }
    // The next video prune collects recordings orphaned by this session prune.
}

/// Return bytes still over budget; never broaden deletion beyond recognized recordings.
pub fn prune_videos(app: &AppHandle, configured: Option<&Path>, keep_gb: u64) -> u64 {
    let Some(dir) = sessions_dir(app) else {
        return 0;
    };
    prune_videos_in(
        &DiskStore,
        &dir,
        configured,
        keep_gb,
        cfg!(corneta_contributor),
    )
}

fn prune_videos_in(
    store: &dyn SessionStore,
    sessions: &Path,
    configured: Option<&Path>,
    keep_gb: u64,
    contributor: bool,
) -> u64 {
    let ids = known_ids(store, sessions);
    let mut all = video_files(store, sessions);
    // Contributor builds may prune only their own session directory, not imported recording folders.
    // This isolation is a build-time decision, not a frontend-controlled flag.
    if !contributor {
        if let Some(dir) = configured.filter(|dir| !dir.as_os_str().is_empty() && *dir != sessions)
        {
            all.extend(video_files(store, dir));
        }
    }
    apply_video_prune(store, domain::plan_video_prune(all, &ids, keep_gb))
}

fn apply_video_prune(store: &dyn SessionStore, plan: domain::VideoPrunePlan) -> u64 {
    for path in &plan.orphans {
        log::info!("removing orphaned recording: {}", path.display());
        store.remove(path);
    }
    let mut total = plan.total;
    for (path, len) in plan.candidates {
        if total <= plan.budget {
            break;
        }
        log::info!(
            "pruning recording to satisfy space budget: {}",
            path.display()
        );
        if store.remove(&path) {
            total = total.saturating_sub(len);
        }
    }
    total.saturating_sub(plan.budget)
}

#[cfg(test)]
mod tests;
