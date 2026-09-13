use crate::{recorder, replay_media, session, AppState};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager, Webview};

const ACCESS_DENIED: &str = "Recording access denied.";
const JOURNAL_LINE_LIMIT: u64 = 64 * 1024;

static MUTATIONS: std::sync::Mutex<()> = std::sync::Mutex::new(());

pub(crate) fn mutation_guard() -> std::sync::MutexGuard<'static, ()> {
    MUTATIONS.lock().unwrap_or_else(|error| error.into_inner())
}

fn main_window(webview: &Webview) -> Result<(), String> {
    if webview.label() != "main" {
        return Err(ACCESS_DENIED.into());
    }
    Ok(())
}

fn recording_path(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    let named = path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            session::parse_video_name(name).is_some_and(|(_, segment)| segment > 0)
                || name == "corneta-teste.mp4"
        });
    if !path.is_absolute() || !named {
        return Err(ACCESS_DENIED.into());
    }
    Ok(path)
}

fn session_recording(id: &str, path: &Path) -> Result<u32, String> {
    let (file_id, segment) = path
        .file_name()
        .and_then(|name| name.to_str())
        .and_then(session::parse_video_name)
        .ok_or(ACCESS_DENIED)?;
    if !session::valid_session_id(id) || file_id != id || segment == 0 {
        return Err(ACCESS_DENIED.into());
    }
    Ok(segment)
}

fn journal_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    if !session::valid_session_id(id) {
        return Err(ACCESS_DENIED.into());
    }
    let path = app
        .path()
        .app_data_dir()
        .map_err(|_| ACCESS_DENIED)?
        .join("sessions")
        .join(session::domain::session_file_name(id));
    if !path.is_file() {
        return Err(ACCESS_DENIED.into());
    }
    Ok(path)
}

// A destructive repair requires the journal's exact file association, not just a matching filename.
fn authorize_repair(journal: &Path, id: &str, path: &Path) -> Result<(PathBuf, u32), String> {
    let segment = session_recording(id, path)?;
    let source = std::fs::symlink_metadata(path).map_err(|_| ACCESS_DENIED)?;
    if !source.is_file() || source.file_type().is_symlink() {
        return Err(ACCESS_DENIED.into());
    }
    let canonical = path.canonicalize().map_err(|_| ACCESS_DENIED)?;
    let file = std::fs::File::open(journal).map_err(|_| ACCESS_DENIED)?;
    if file.metadata().map_err(|_| ACCESS_DENIED)?.len() > session::domain::MAX_SESSION_BYTES {
        return Err(ACCESS_DENIED.into());
    }
    let mut reader = BufReader::new(file.take(session::domain::MAX_SESSION_BYTES + 1));
    let mut line = Vec::new();
    let mut total = 0;
    loop {
        line.clear();
        let count = reader
            .by_ref()
            .take(JOURNAL_LINE_LIMIT + 1)
            .read_until(b'\n', &mut line)
            .map_err(|_| ACCESS_DENIED)?;
        total += count as u64;
        if count == 0 {
            break;
        }
        if count as u64 > JOURNAL_LINE_LIMIT || total > session::domain::MAX_SESSION_BYTES {
            return Err(ACCESS_DENIED.into());
        }
        let Ok(record) = serde_json::from_slice::<serde_json::Value>(&line) else {
            continue;
        };
        if record["kind"] != "recording" || record["seg"].as_u64() != Some(u64::from(segment)) {
            continue;
        }
        let Some(recorded) = record["path"].as_str() else {
            continue;
        };
        if Path::new(recorded).canonicalize().ok().as_ref() == Some(&canonical) {
            return Ok((canonical, segment));
        }
    }
    Err(ACCESS_DENIED.into())
}

#[tauri::command]
pub async fn record_video_url(webview: Webview, path: String) -> Result<String, String> {
    main_window(&webview)?;
    let path = recording_path(&path)?;
    let path = tauri::async_runtime::spawn_blocking(move || {
        let canonical = path
            .canonicalize()
            .map_err(|_| "Replay file could not be opened")?;
        if recorder::is_preparing(&canonical) {
            return Err("Recording preparation is in progress.");
        }
        Ok(canonical)
    })
    .await
    .map_err(|_| "Replay file could not be opened")??;
    replay_media::open(path).await
}

#[tauri::command]
pub fn release_record_video(webview: Webview, url: String) -> Result<(), String> {
    main_window(&webview)?;
    replay_media::release(&url);
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayStats {
    #[serde(flatten)]
    reads: replay_media::ReplayReadStats,
    native_process_memory_bytes: Option<u64>,
}

#[tauri::command]
pub async fn record_video_stats(webview: Webview, url: String) -> Result<ReplayStats, String> {
    main_window(&webview)?;
    let reads = replay_media::stats(&url)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut system = sysinfo::System::new();
        let memory = sysinfo::get_current_pid().ok().and_then(|pid| {
            system.refresh_processes_specifics(
                sysinfo::ProcessesToUpdate::Some(&[pid]),
                true,
                sysinfo::ProcessRefreshKind::nothing().with_memory(),
            );
            system.process(pid).map(|process| process.memory())
        });
        ReplayStats {
            reads,
            native_process_memory_bytes: memory,
        }
    })
    .await
    .map_err(|_| "Replay diagnostics unavailable.".to_string())
}

#[tauri::command]
pub async fn recording_replay_status(
    app: AppHandle,
    webview: Webview,
    id: String,
    path: String,
) -> Result<recorder::ReplayPreparation, String> {
    main_window(&webview)?;
    let path = recording_path(&path)?;
    session_recording(&id, &path)?;
    tauri::async_runtime::spawn_blocking(move || {
        journal_path(&app, &id)?;
        Ok(recorder::replay_status(&path))
    })
    .await
    .map_err(|_| "Recording status unavailable.".to_string())?
}

#[tauri::command]
pub async fn prepare_recording_replay(
    app: AppHandle,
    webview: Webview,
    id: String,
    path: String,
) -> Result<recorder::ReplayPreparation, String> {
    main_window(&webview)?;
    let path = recording_path(&path)?;
    session_recording(&id, &path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let journal = journal_path(&app, &id)?;
        let (path, segment) = authorize_repair(&journal, &id, &path)?;
        let _mutation = mutation_guard();
        if !journal.is_file() {
            return Err(ACCESS_DENIED.into());
        }
        let activity = {
            let state = app.state::<AppState>();
            let engine = state
                .engine
                .lock()
                .map_err(|_| "Recording preparation unavailable.")?;
            if engine.live
                || engine.running.load(Ordering::Acquire)
                || engine.update_in_progress
                || !engine.ffmpegs.is_empty()
            {
                return Ok(recorder::ReplayPreparation::unprepared("busy"));
            }
            engine.begin_pending_activity()
        };
        replay_media::revoke_path(&path);
        Ok(recorder::prepare_replay(
            app, journal, segment, path, activity,
        ))
    })
    .await
    .map_err(|_| "Recording preparation unavailable.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("corneta-replay-auth-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir(&path).unwrap();
            Self(path)
        }
        fn file(&self, name: &str, bytes: &[u8]) -> PathBuf {
            let path = self.0.join(name);
            std::fs::write(&path, bytes).unwrap();
            path
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn rejects_relative_paths_and_foreign_recording_names() {
        assert!(recording_path("123.mp4").is_err());
        assert!(session_recording("123", Path::new("124.mp4")).is_err());
        assert!(session_recording("123", Path::new("123.p0.mp4")).is_err());
        assert!(session_recording("123", Path::new("123.p2.mp4")).is_ok());
    }

    #[test]
    fn repair_requires_the_exact_recording_in_the_session() {
        let fixture = Fixture::new();
        let recording = fixture.file("123.mp4", b"synthetic");
        let journal = fixture.file("123.ndjson", b"{\"kind\":\"meta\"}\n");
        assert!(authorize_repair(&journal, "123", &recording).is_err());
        let record = serde_json::json!({"kind":"recording", "seg":1,"path":recording});
        std::fs::write(&journal, serde_json::to_vec(&record).unwrap()).unwrap();
        assert_eq!(authorize_repair(&journal, "123", &recording).unwrap().1, 1);
        assert!(authorize_repair(&journal, "124", &recording).is_err());
        let other = fixture.0.join("other");
        std::fs::create_dir(&other).unwrap();
        let impostor = other.join("123.mp4");
        std::fs::write(&impostor, b"synthetic").unwrap();
        assert!(authorize_repair(&journal, "123", &impostor).is_err());
    }

    #[test]
    fn repair_caps_malformed_journal_lines() {
        let fixture = Fixture::new();
        let recording = fixture.file("123.mp4", b"synthetic");
        let journal = fixture.file("123.ndjson", &vec![b'x'; JOURNAL_LINE_LIMIT as usize + 1]);
        assert!(authorize_repair(&journal, "123", &recording).is_err());
    }
}
