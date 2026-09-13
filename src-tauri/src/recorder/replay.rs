use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime};

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

use super::replay_index::{self, IndexLayout};
use super::{disk, domain};
use crate::{engine::EngineActivityGuard, session, AppState};

const STATUS_CACHE_LIMIT: usize = 128;
const MIN_REMUX_OVERHEAD: u64 = 64 * 1024 * 1024;
const MAX_PREPARATION_TIME: Duration = Duration::from_secs(6 * 60 * 60);

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayPreparation {
    pub state: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub available_bytes: Option<u64>,
}

impl ReplayPreparation {
    fn new(state: &'static str, reason: Option<&'static str>) -> Self {
        Self {
            state,
            reason,
            required_bytes: None,
            available_bytes: None,
        }
    }

    pub fn unprepared(reason: &'static str) -> Self {
        Self::new("unprepared", Some(reason))
    }

    fn failed(reason: &'static str) -> Self {
        Self::new("failed", Some(reason))
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct Fingerprint {
    bytes: u64,
    modified: SystemTime,
    created: Option<SystemTime>,
}

fn fingerprint(path: &Path) -> Result<Fingerprint, ReplayPreparation> {
    let metadata = std::fs::symlink_metadata(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            ReplayPreparation::new("missing", None)
        } else {
            ReplayPreparation::failed("unreadable")
        }
    })?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(ReplayPreparation::failed("invalidFile"));
    }
    Ok(Fingerprint {
        bytes: metadata.len(),
        modified: metadata
            .modified()
            .map_err(|_| ReplayPreparation::failed("unreadable"))?,
        created: metadata.created().ok(),
    })
}

#[derive(Default)]
struct Registry {
    active: Option<PathBuf>,
    cache: HashMap<PathBuf, (Fingerprint, ReplayPreparation)>,
}

impl Registry {
    fn remember(&mut self, path: PathBuf, version: Fingerprint, status: ReplayPreparation) {
        if self.cache.len() >= STATUS_CACHE_LIMIT {
            self.cache.clear();
        }
        self.cache.insert(path, (version, status));
    }

    fn claim(&mut self, path: &Path) -> Result<(), ReplayPreparation> {
        if let Some(active) = &self.active {
            return Err(if active == path {
                ReplayPreparation::new("preparing", None)
            } else {
                ReplayPreparation::unprepared("busy")
            });
        }
        self.active = Some(path.to_path_buf());
        Ok(())
    }
}

fn registry() -> &'static Mutex<Registry> {
    static REGISTRY: OnceLock<Mutex<Registry>> = OnceLock::new();
    REGISTRY.get_or_init(Mutex::default)
}

fn path_key(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

pub fn is_preparing(path: &Path) -> bool {
    let key = path_key(path);
    registry()
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .active
        .as_ref()
        == Some(&key)
}

pub fn preparing_session(id: &str) -> bool {
    registry()
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .active
        .as_ref()
        .is_some_and(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .and_then(session::parse_video_name)
                .is_some_and(|(session_id, _)| session_id == id)
        })
}

fn inspect_file(path: &Path, version: &Fingerprint) -> ReplayPreparation {
    let Ok(mut file) = File::open(path) else {
        return ReplayPreparation::failed("unreadable");
    };
    match replay_index::inspect(&mut file, version.bytes) {
        Ok(IndexLayout::Ready) => ReplayPreparation::new("ready", None),
        Ok(IndexLayout::Fragmented) => ReplayPreparation::unprepared("fragmented"),
        Ok(IndexLayout::AtEnd) => ReplayPreparation::unprepared("indexAtEnd"),
        Err(()) => ReplayPreparation::failed("invalidFile"),
    }
}

pub fn replay_status(path: &Path) -> ReplayPreparation {
    let key = path_key(path);
    let version = match fingerprint(&key) {
        Ok(version) => version,
        Err(status) => return status,
    };
    {
        let state = registry().lock().unwrap_or_else(|error| error.into_inner());
        if state.active.as_ref() == Some(&key) {
            return ReplayPreparation::new("preparing", None);
        }
        if let Some((cached_version, cached)) = state.cache.get(&key) {
            if cached_version == &version {
                return cached.clone();
            }
        }
    }
    let status = inspect_file(&key, &version);
    registry()
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .remember(key, version, status.clone());
    status
}

fn space_budget(bytes: u64, available: Option<u64>) -> Result<u64, ReplayPreparation> {
    let required = bytes
        .saturating_add((bytes / 20).max(MIN_REMUX_OVERHEAD))
        .saturating_add(domain::DISK_FLOOR);
    if available.is_some_and(|free| free >= required) {
        return Ok(required);
    }
    let mut status = ReplayPreparation::failed(if available.is_some() {
        "insufficientSpace"
    } else {
        "spaceUnavailable"
    });
    status.required_bytes = Some(required);
    status.available_bytes = available;
    Err(status)
}

struct Reservation {
    path: PathBuf,
    version: Fingerprint,
    finished: bool,
    notification: Option<(AppHandle, String)>,
}

impl Reservation {
    fn notify(&self) {
        if let Some((app, id)) = &self.notification {
            let _ = app.emit_to(
                "main",
                "recorder://replay-preparation",
                serde_json::json!({ "id": id }),
            );
        }
    }

    fn announce(&mut self, app: &AppHandle, session_path: &Path) {
        if let Some(id) = session_path.file_stem().and_then(|stem| stem.to_str()) {
            self.notification = Some((app.clone(), id.to_owned()));
            self.notify();
        }
    }

    fn finish(mut self, status: ReplayPreparation) {
        let version = fingerprint(&self.path).unwrap_or_else(|_| self.version.clone());
        {
            let mut state = registry().lock().unwrap_or_else(|error| error.into_inner());
            state.remember(self.path.clone(), version, status);
            state.active = None;
        }
        self.finished = true;
        self.notify();
    }
}

impl Drop for Reservation {
    fn drop(&mut self) {
        if !self.finished {
            {
                let mut state = registry().lock().unwrap_or_else(|error| error.into_inner());
                state.active = None;
                state.remember(
                    self.path.clone(),
                    self.version.clone(),
                    ReplayPreparation::failed("interrupted"),
                );
            }
            self.notify();
        }
    }
}

fn reserve(path: &Path) -> Result<Reservation, ReplayPreparation> {
    let path = path_key(path);
    let current = replay_status(&path);
    if current.state == "ready" || current.state == "missing" || current.state == "preparing" {
        return Err(current);
    }
    let version = fingerprint(&path)?;
    registry()
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .claim(&path)?;
    Ok(Reservation {
        path,
        version,
        finished: false,
        notification: None,
    })
}

struct TemporaryFile(PathBuf);

impl TemporaryFile {
    fn new(source: &Path) -> Result<Self, ReplayPreparation> {
        let path = source.with_file_name(format!(".corneta-replay-{}.mp4", uuid::Uuid::new_v4()));
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|_| ReplayPreparation::failed("unreadable"))?;
        Ok(Self(path))
    }
}

impl Drop for TemporaryFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

struct PreparationChild(Option<CommandChild>);

impl Drop for PreparationChild {
    fn drop(&mut self) {
        if let Some(child) = self.0.take() {
            crate::commands::kill_child_tree(child);
        }
    }
}

fn source_unchanged(path: &Path, expected: &Fingerprint) -> bool {
    fingerprint(path).is_ok_and(|actual| &actual == expected)
}

fn commit_output(source: &Path, expected: &Fingerprint, output: &Path) -> ReplayPreparation {
    let Ok(output_version) = fingerprint(output) else {
        return ReplayPreparation::failed("failed");
    };
    if inspect_file(output, &output_version).state != "ready" {
        return ReplayPreparation::failed("invalidFile");
    }
    if !source_unchanged(source, expected) {
        return ReplayPreparation::failed("sourceChanged");
    }
    // Never delete the original to work around a sharing violation or a failed atomic replacement.
    if std::fs::rename(output, source).is_err() {
        return ReplayPreparation::failed("busy");
    }
    ReplayPreparation::new("ready", None)
}

async fn remux(
    app: &AppHandle,
    reservation: &Reservation,
    stop_on_live: bool,
) -> ReplayPreparation {
    let source = &reservation.path;
    let Some(directory) = source.parent() else {
        return ReplayPreparation::failed("invalidFile");
    };
    if let Err(status) = space_budget(reservation.version.bytes, disk::free_bytes(directory)) {
        return status;
    }
    let temporary = match TemporaryFile::new(source) {
        Ok(temporary) => temporary,
        Err(status) => return status,
    };
    let spawned = app.shell().sidecar("ffmpeg").and_then(|command| {
        command
            .args(domain::remux_args(source, &temporary.0))
            .spawn()
    });
    let Ok((mut events, child)) = spawned else {
        return ReplayPreparation::failed("failed");
    };
    let mut child = PreparationChild(Some(child));
    let mut checks = tokio::time::interval(Duration::from_millis(500));
    checks.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let started = Instant::now();
    let mut disk_checked = Instant::now();
    loop {
        tokio::select! {
            event = events.recv() => match event {
                Some(CommandEvent::Terminated(exit)) => {
                    child.0.take();
                    if exit.code != Some(0) {
                        return ReplayPreparation::failed("failed");
                    }
                    break;
                }
                Some(CommandEvent::Error(_)) | None => return ReplayPreparation::failed("failed"),
                Some(_) => {}
            },
            _ = checks.tick() => {
                if stop_on_live && app.state::<AppState>().engine.lock().unwrap().live {
                    return ReplayPreparation::failed("interrupted");
                }
                if started.elapsed() > MAX_PREPARATION_TIME {
                    return ReplayPreparation::failed("interrupted");
                }
                if disk_checked.elapsed() >= Duration::from_secs(2) {
                    if !source_unchanged(source, &reservation.version) {
                        return ReplayPreparation::failed("sourceChanged");
                    }
                    if domain::hit_floor(disk::free_bytes(directory)) {
                        return ReplayPreparation::failed("insufficientSpace");
                    }
                    disk_checked = Instant::now();
                }
            }
        }
    }
    commit_output(source, &reservation.version, &temporary.0)
}

async fn run_preparation(
    app: &AppHandle,
    session_path: &Path,
    seg: u32,
    reservation: Reservation,
    stop_on_live: bool,
) {
    let status = remux(app, &reservation, stop_on_live).await;
    if status.state == "ready" {
        session::record_rec_finalized(session_path, seg, &reservation.path.to_string_lossy());
    } else {
        log::warn!(
            "recording: replay preparation did not complete ({})",
            status.reason.unwrap_or("failed")
        );
    }
    reservation.finish(status);
}

pub fn prepare_replay(
    app: AppHandle,
    session_path: PathBuf,
    seg: u32,
    path: PathBuf,
    activity: EngineActivityGuard,
) -> ReplayPreparation {
    let mut reservation = match reserve(&path) {
        Ok(reservation) => reservation,
        Err(status) => return status,
    };
    reservation.announce(&app, &session_path);
    tauri::async_runtime::spawn(async move {
        let _activity = activity;
        run_preparation(&app, &session_path, seg, reservation, true).await;
    });
    ReplayPreparation::new("preparing", None)
}

pub(super) async fn finalize(app: &AppHandle, session_path: &Path, seg: u32, path: &Path) {
    let source = path.to_path_buf();
    let reservation = tauri::async_runtime::spawn_blocking(move || {
        let _mutation = crate::replay_commands::mutation_guard();
        reserve(&source)
    })
    .await;
    if let Ok(Ok(mut reservation)) = reservation {
        reservation.announce(app, session_path);
        run_preparation(app, session_path, seg, reservation, false).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FixtureDirectory(PathBuf);

    impl FixtureDirectory {
        fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("corneta-replay-test-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for FixtureDirectory {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn indexed_file() -> Vec<u8> {
        let mut bytes = vec![0, 0, 0, 24, b'm', b'o', b'o', b'v'];
        bytes.extend([0, 0, 0, 8, b'm', b'v', b'h', b'd']);
        bytes.extend([0, 0, 0, 8, b't', b'r', b'a', b'k']);
        bytes.extend([0, 0, 0, 9, b'm', b'd', b'a', b't', 1]);
        bytes
    }

    #[test]
    fn preparation_requires_a_second_copy_and_a_disk_reserve() {
        let bytes = 12 * 1024 * 1024 * 1024;
        let required = space_budget(bytes, Some(u64::MAX)).unwrap();
        assert!(required > bytes + domain::DISK_FLOOR);
        assert_eq!(space_budget(bytes, Some(required)), Ok(required));
        let low = space_budget(bytes, Some(required - 1)).unwrap_err();
        assert_eq!(low.reason, Some("insufficientSpace"));
        assert_eq!(low.required_bytes, Some(required));
        assert_eq!(
            space_budget(bytes, None).unwrap_err().reason,
            Some("spaceUnavailable")
        );
    }

    #[test]
    fn preparation_claims_are_serialized_and_duplicate_clicks_do_not_queue_jobs() {
        let mut jobs = Registry::default();
        let first = Path::new("first.mp4");
        assert_eq!(jobs.claim(first), Ok(()));
        assert_eq!(jobs.claim(first).unwrap_err().state, "preparing");
        assert_eq!(
            jobs.claim(Path::new("second.mp4")).unwrap_err().reason,
            Some("busy")
        );
        jobs.active = None;
        assert_eq!(jobs.claim(Path::new("second.mp4")), Ok(()));
    }

    #[test]
    fn status_cache_is_bounded() {
        let mut jobs = Registry::default();
        let version = Fingerprint {
            bytes: 1,
            modified: SystemTime::UNIX_EPOCH,
            created: None,
        };
        for index in 0..STATUS_CACHE_LIMIT * 3 {
            jobs.remember(
                PathBuf::from(format!("{index}.mp4")),
                version.clone(),
                ReplayPreparation::failed("failed"),
            );
            assert!(jobs.cache.len() <= STATUS_CACHE_LIMIT);
        }
    }

    #[test]
    fn malformed_output_never_replaces_the_original_recording() {
        let fixture = FixtureDirectory::new();
        let source = fixture.0.join("source.mp4");
        let output = fixture.0.join("output.mp4");
        std::fs::write(&source, b"original recording").unwrap();
        std::fs::write(&output, b"broken output").unwrap();
        let version = fingerprint(&source).unwrap();
        assert_eq!(
            commit_output(&source, &version, &output).reason,
            Some("invalidFile")
        );
        assert_eq!(std::fs::read(&source).unwrap(), b"original recording");
    }

    #[test]
    fn replaced_or_deleted_sources_are_not_recreated_by_a_finished_job() {
        let fixture = FixtureDirectory::new();
        let source = fixture.0.join("source.mp4");
        let output = fixture.0.join("output.mp4");
        std::fs::write(&source, b"original").unwrap();
        std::fs::write(&output, indexed_file()).unwrap();
        let version = fingerprint(&source).unwrap();
        std::fs::write(&source, b"a different recording").unwrap();
        assert_eq!(
            commit_output(&source, &version, &output).reason,
            Some("sourceChanged")
        );
        assert_eq!(std::fs::read(&source).unwrap(), b"a different recording");
        std::fs::remove_file(&source).unwrap();
        assert_eq!(
            commit_output(&source, &version, &output).reason,
            Some("sourceChanged")
        );
        assert!(!source.exists());
    }

    #[test]
    fn only_validated_output_atomically_replaces_an_unchanged_source() {
        let fixture = FixtureDirectory::new();
        let source = fixture.0.join("source.mp4");
        let output = fixture.0.join("output.mp4");
        std::fs::write(&source, b"original").unwrap();
        let indexed = indexed_file();
        std::fs::write(&output, &indexed).unwrap();
        assert_eq!(
            commit_output(&source, &fingerprint(&source).unwrap(), &output).state,
            "ready"
        );
        assert_eq!(std::fs::read(&source).unwrap(), indexed);
        assert!(!output.exists());
    }

    #[test]
    fn aborted_temporary_outputs_do_not_delete_the_original() {
        let fixture = FixtureDirectory::new();
        let source = fixture.0.join("source.mp4");
        std::fs::write(&source, b"original").unwrap();
        let temporary_path;
        {
            let temporary = TemporaryFile::new(&source).unwrap();
            temporary_path = temporary.0.clone();
            assert!(temporary_path.exists());
        }
        assert!(!temporary_path.exists());
        assert_eq!(std::fs::read(&source).unwrap(), b"original");
    }

    #[test]
    fn modified_file_invalidates_a_cached_status() {
        let fixture = FixtureDirectory::new();
        let source = fixture.0.join("source.mp4");
        std::fs::write(&source, indexed_file()).unwrap();
        assert_eq!(replay_status(&source).state, "ready");
        std::fs::write(&source, b"invalid").unwrap();
        assert_eq!(replay_status(&source).reason, Some("invalidFile"));
    }

    fn media_command(program: &str, arguments: &[String]) -> Vec<u8> {
        let mut command = std::process::Command::new(program);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let output = command
            .args(arguments)
            .output()
            .expect("verified media tools must be available on PATH");
        assert!(
            output.status.success(),
            "synthetic media command failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        output.stdout
    }

    fn media_probe(path: &Path) -> serde_json::Value {
        serde_json::from_slice(&media_command(
            "ffprobe",
            &[
                "-v".into(),
                "error".into(),
                "-show_entries".into(),
                "format=duration:stream=codec_name,codec_type:packet=stream_index,data_hash".into(),
                "-show_packets".into(),
                "-show_data_hash".into(),
                "sha256".into(),
                "-of".into(),
                "json".into(),
                path.to_string_lossy().into_owned(),
            ],
        ))
        .unwrap()
    }

    fn packet_hashes(probe: &serde_json::Value) -> HashMap<u64, Vec<String>> {
        let mut tracks: HashMap<u64, Vec<String>> = HashMap::new();
        for packet in probe["packets"].as_array().unwrap() {
            tracks
                .entry(packet["stream_index"].as_u64().unwrap())
                .or_default()
                .push(packet["data_hash"].as_str().unwrap().to_owned());
        }
        tracks
    }

    #[test]
    #[ignore = "requires verified ffmpeg and ffprobe on PATH in a disposable contributor checkout"]
    fn media_preparation_preserves_encoded_packets_and_opens_both_mp4_layouts() {
        let fixture = FixtureDirectory::new();
        let source = fixture.0.join("source.mp4");
        let recording = fixture.0.join("recording.mp4");
        let prepared = fixture.0.join("prepared.mp4");
        media_command("ffmpeg", &domain::test_args(&source));
        assert_eq!(replay_status(&source).state, "ready");
        media_command(
            "ffmpeg",
            &domain::record_args(&source.to_string_lossy(), &recording),
        );
        assert_eq!(replay_status(&recording).reason, Some("fragmented"));
        let before = media_probe(&recording);
        let version = fingerprint(&recording).unwrap();
        media_command("ffmpeg", &domain::remux_args(&recording, &prepared));
        assert_eq!(
            commit_output(&recording, &version, &prepared).state,
            "ready"
        );
        assert_eq!(replay_status(&recording).state, "ready");
        let after = media_probe(&recording);
        assert_eq!(
            before["streams"], after["streams"],
            "copy-only preparation must retain the video and audio codecs"
        );
        assert_eq!(
            packet_hashes(&before),
            packet_hashes(&after),
            "preparation must not re-encode or discard encoded packets"
        );
        let before_duration: f64 = before["format"]["duration"]
            .as_str()
            .unwrap()
            .parse()
            .unwrap();
        let after_duration: f64 = after["format"]["duration"]
            .as_str()
            .unwrap()
            .parse()
            .unwrap();
        assert!(
            (before_duration - after_duration).abs() < 0.1,
            "preparation must preserve the recording duration"
        );
        for path in [&source, &recording] {
            media_command(
                "ffmpeg",
                &[
                    "-hide_banner".into(),
                    "-v".into(),
                    "error".into(),
                    "-xerror".into(),
                    "-i".into(),
                    path.to_string_lossy().into_owned(),
                    "-map".into(),
                    "0:v:0".into(),
                    "-map".into(),
                    "0:a:0".into(),
                    "-f".into(),
                    "null".into(),
                    "-".into(),
                ],
            );
        }
    }
}
