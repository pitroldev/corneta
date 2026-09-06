//! Adaptadores da porta [`SessionStore`](super::SessionStore).
//!
//! `DiskStore` é o de produção: NDJSON em disco com escrita bufferizada. `MemStore` (só em
//! teste) guarda tudo num mapa, e é ele que deixa a recuperação e a poda serem testadas
//! sem criar arquivo nenhum.

use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock, Weak};
use std::time::UNIX_EPOCH;

use serde_json::Value;

use super::writer::JournalWriter;
use super::SessionStore;

type FileEntry = Mutex<Option<JournalWriter>>;
static FILES: OnceLock<Mutex<HashMap<PathBuf, Weak<FileEntry>>>> = OnceLock::new();

fn file_entry(file: &Path) -> Arc<FileEntry> {
    let mut files = FILES
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap();
    if let Some(entry) = files.get(file).and_then(Weak::upgrade) {
        return entry;
    }
    // Only active workers/callers own entries. Reap expired keys on cold-path
    // acquisition, not on every live message, and never hold this lock for I/O.
    files.retain(|_, entry| entry.strong_count() > 0);
    let entry = Arc::new(Mutex::new(None));
    files.insert(file.to_path_buf(), Arc::downgrade(&entry));
    entry
}

/// O adaptador de produção.
pub struct DiskStore;

impl DiskStore {
    pub(super) fn prepare_chat(&self, file: &Path) {
        let entry = file_entry(file);
        let mut writer = entry.lock().unwrap();
        if writer.as_ref().is_some_and(|writer| !writer.close()) {
            return;
        }
        let Ok(handle) = File::create(file) else {
            return;
        };
        *writer = Some(JournalWriter::start(handle, 0, true, entry.clone()));
    }
}

impl SessionStore for DiskStore {
    fn append(&self, file: &Path, line: &Value, cap: u64) {
        let entry = file_entry(file);
        let mut writer = entry.lock().unwrap();
        if let Some(active) = writer.as_ref() {
            if active.append(line, cap) {
                return;
            }
            *writer = None;
        }
        let mut text = line.to_string();
        text.push('\n');
        // The old handle is closed. Keep this per-file lock through the length
        // check and append so concurrent post-live writes cannot interleave or
        // both consume the same remaining capacity. Other files stay independent.
        if self.len(file).saturating_add(text.len() as u64) > cap {
            return;
        }
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(file) {
            let _ = f.write_all(text.as_bytes());
        }
    }

    fn create(&self, file: &Path, first: &Value) {
        let entry = file_entry(file);
        let mut writer = entry.lock().unwrap();
        if writer.as_ref().is_some_and(|writer| !writer.close()) {
            return;
        }
        let Ok(mut handle) = File::create(file) else {
            return;
        };
        let text = format!("{first}\n");
        if handle.write_all(text.as_bytes()).is_err() || handle.flush().is_err() {
            return;
        }
        *writer = Some(JournalWriter::start(
            handle,
            text.len() as u64,
            false,
            entry.clone(),
        ));
    }

    fn close(&self, file: &Path) {
        let entry = file_entry(file);
        let mut writer = entry.lock().unwrap();
        if writer.as_ref().is_some_and(JournalWriter::close) {
            *writer = None;
        }
    }

    fn len(&self, file: &Path) -> u64 {
        fs::metadata(file).map(|m| m.len()).unwrap_or(0)
    }

    fn tail(&self, file: &Path, max: u64) -> Option<String> {
        let len = fs::metadata(file).ok()?.len();
        let mut handle = File::open(file).ok()?;
        let start = len.saturating_sub(max);
        handle.seek(SeekFrom::Start(start)).ok()?;
        let mut buf = Vec::with_capacity((len - start) as usize);
        handle.read_to_end(&mut buf).ok()?;
        Some(String::from_utf8_lossy(&buf).into_owned())
    }

    fn first_line(&self, file: &Path) -> Option<String> {
        let handle = File::open(file).ok()?;
        let mut first = String::new();
        BufReader::new(handle).read_line(&mut first).ok()?;
        Some(first)
    }

    fn read(&self, file: &Path) -> Option<String> {
        fs::read_to_string(file).ok()
    }

    fn modified_ms(&self, file: &Path) -> Option<u64> {
        fs::metadata(file)
            .ok()?
            .modified()
            .ok()?
            .duration_since(UNIX_EPOCH)
            .ok()
            .map(|d| d.as_millis() as u64)
    }

    fn list(&self, dir: &Path) -> Vec<PathBuf> {
        let Ok(entries) = fs::read_dir(dir) else {
            return vec![];
        };
        entries.flatten().map(|e| e.path()).collect()
    }

    fn remove(&self, file: &Path) -> bool {
        let entry = file_entry(file);
        let mut writer = entry.lock().unwrap();
        if writer.as_ref().is_some_and(|writer| !writer.close()) {
            return false;
        }
        *writer = None;
        fs::remove_file(file).is_ok()
    }
}

// ---------------------------------------------------------------------------

#[cfg(test)]
mod disk_tests {
    use super::*;
    use serde_json::json;
    use std::sync::{mpsc, Barrier};
    use std::time::Duration;

    struct TemporaryJournal(PathBuf);

    impl TemporaryJournal {
        fn new() -> Self {
            Self(std::env::temp_dir().join(format!(
                "corneta-journal-regression-{}.ndjson",
                uuid::Uuid::new_v4()
            )))
        }

        fn lines(&self) -> Vec<Value> {
            fs::read_to_string(&self.0)
                .unwrap()
                .lines()
                .map(|line| {
                    serde_json::from_str(line).expect("every NDJSON line must remain valid")
                })
                .collect()
        }
    }

    impl Drop for TemporaryJournal {
        fn drop(&mut self) {
            DiskStore.close(&self.0);
            let _ = fs::remove_file(&self.0);
        }
    }

    #[test]
    fn timed_out_close_keeps_ownership_and_drains_late_recorder_events() {
        let journal = TemporaryJournal::new();
        let meta = json!({"kind":"meta","startedAt":1000});
        let text = format!("{meta}\n");
        // The production open mode is intentional: a second append handle would
        // be overwritten by this fixed-position handle in the old implementation.
        let mut file = File::create(&journal.0).unwrap();
        file.write_all(text.as_bytes()).unwrap();
        let entry = file_entry(&journal.0);
        let identity = Arc::downgrade(&entry);
        let (entered_tx, entered_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        *entry.lock().unwrap() = Some(JournalWriter::start_with_write_hook(
            file,
            text.len() as u64,
            false,
            entry.clone(),
            move || {
                entered_tx.send(()).unwrap();
                let _ = release_rx.recv();
            },
        ));
        let cap = 32 * 1024;
        DiskStore.append(&journal.0, &json!({"kind":"end","endedAt":2000}), cap);
        assert!(!entry
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .close_with_timeout(Duration::ZERO));
        entered_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        // The worker alone keeps the coordinator alive after the caller times out.
        drop(entry);
        assert!(Arc::ptr_eq(
            &file_entry(&journal.0),
            &identity.upgrade().unwrap()
        ));
        DiskStore.append(
            &journal.0,
            &json!({"kind":"recEnd","seg":1,"t":2000,"reason":"stopped"}),
            cap,
        );
        let finalized = json!({"kind":"recFinalized","seg":1,"path":"synthetic-live.mp4"});
        DiskStore.append(&journal.0, &finalized, cap);
        release_tx.send(()).unwrap();
        DiskStore.close(&journal.0);
        let lines = journal.lines();
        assert_eq!(lines.len(), 4);
        assert_eq!(lines[0], meta);
        assert_eq!(lines[1]["kind"], "end");
        assert_eq!(lines[2]["kind"], "recEnd");
        assert_eq!(lines[3], finalized);
        // Subsequent post-live edits use the synchronous, serialized path.
        DiskStore.append(&journal.0, &json!({"kind":"offset","ms":250}), cap);
        assert_eq!(journal.lines().len(), 5);
    }

    #[test]
    fn concurrent_close_and_finalizations_preserve_every_record() {
        let journal = TemporaryJournal::new();
        let cap = 32 * 1024;
        DiskStore.create(&journal.0, &json!({"kind":"meta","startedAt":1000}));
        DiskStore.append(&journal.0, &json!({"kind":"end","endedAt":2000}), cap);
        let barrier = Barrier::new(9);
        std::thread::scope(|scope| {
            for segment in 1..=8 {
                let path = &journal.0;
                let barrier = &barrier;
                scope.spawn(move || {
                    barrier.wait();
                    for index in 0..16 {
                        DiskStore.append(path, &json!({"kind":"recFinalized","seg":segment,"index":index,"path":"synthetic.mp4"}), cap);
                    }
                });
            }
            barrier.wait();
            DiskStore.close(&journal.0);
        });
        DiskStore.close(&journal.0);
        let lines = journal.lines();
        assert_eq!(lines.len(), 130);
        assert_eq!(lines.iter().filter(|line| line["kind"] == "end").count(), 1);
        for segment in 1..=8 {
            let indices: Vec<_> = lines
                .iter()
                .filter(|line| line["seg"] == segment)
                .map(|line| line["index"].as_u64().unwrap())
                .collect();
            assert_eq!(indices, (0..16).collect::<Vec<_>>());
        }
    }

    #[test]
    fn concurrent_post_live_appends_share_the_file_capacity() {
        let journal = TemporaryJournal::new();
        DiskStore.create(&journal.0, &json!({"kind":"meta"}));
        DiskStore.close(&journal.0);
        let barrier = Barrier::new(8);
        let cap = 2048;
        std::thread::scope(|scope| {
            for _ in 0..8 {
                let path = &journal.0;
                let barrier = &barrier;
                scope.spawn(move || {
                    barrier.wait();
                    for index in 0..16 {
                        DiskStore.append(
                            path,
                            &json!({"kind":"marker","t":index,"label":"x".repeat(80)}),
                            cap,
                        );
                    }
                });
            }
        });
        assert!(DiskStore.len(&journal.0) <= cap);
        assert!(journal.lines().len() > 1);
    }

    #[test]
    fn a_busy_file_does_not_lock_another_journal() {
        let busy = TemporaryJournal::new();
        let other = TemporaryJournal::new();
        let entry = file_entry(&busy.0);
        let _busy = entry.lock().unwrap();
        std::thread::scope(|scope| {
            let (done_tx, done_rx) = mpsc::channel();
            let path = &other.0;
            scope.spawn(move || {
                DiskStore.create(path, &json!({"kind":"meta"}));
                DiskStore.append(path, &json!({"kind":"end","endedAt":2000}), 2048);
                DiskStore.close(path);
                done_tx.send(()).unwrap();
            });
            done_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        });
        assert_eq!(other.lines().len(), 2);
    }
}

/// Adaptador em memória — a bancada de testes da aplicação.
#[cfg(test)]
#[derive(Default)]
pub struct MemStore {
    files: Mutex<HashMap<PathBuf, String>>,
    /// mtime fingido, por arquivo (epoch ms).
    mtimes: Mutex<HashMap<PathBuf, u64>>,
}

#[cfg(test)]
impl MemStore {
    pub fn with(files: &[(&str, &str)]) -> Self {
        let store = Self::default();
        for (path, body) in files {
            store
                .files
                .lock()
                .unwrap()
                .insert(PathBuf::from(path), (*body).to_string());
        }
        store
    }

    pub fn set_mtime(&self, file: &str, ms: u64) {
        self.mtimes.lock().unwrap().insert(PathBuf::from(file), ms);
    }

    pub fn body(&self, file: &str) -> String {
        self.files
            .lock()
            .unwrap()
            .get(Path::new(file))
            .cloned()
            .unwrap_or_default()
    }

    pub fn exists(&self, file: &str) -> bool {
        self.files.lock().unwrap().contains_key(Path::new(file))
    }

    /// Linhas anexadas a um arquivo, já parseadas (ignora o que não for JSON).
    pub fn lines(&self, file: &str) -> Vec<Value> {
        self.body(file)
            .lines()
            .filter_map(|l| serde_json::from_str(l).ok())
            .collect()
    }
}

#[cfg(test)]
impl SessionStore for MemStore {
    fn append(&self, file: &Path, line: &Value, cap: u64) {
        if !super::domain::fits_cap(self.len(file), cap) {
            return;
        }
        let mut files = self.files.lock().unwrap();
        let body = files.entry(file.to_path_buf()).or_default();
        body.push_str(&line.to_string());
        body.push('\n');
    }

    fn create(&self, file: &Path, first: &Value) {
        self.files
            .lock()
            .unwrap()
            .insert(file.to_path_buf(), format!("{first}\n"));
    }

    fn close(&self, _file: &Path) {}

    fn len(&self, file: &Path) -> u64 {
        self.files
            .lock()
            .unwrap()
            .get(file)
            .map(|b| b.len() as u64)
            .unwrap_or(0)
    }

    fn tail(&self, file: &Path, max: u64) -> Option<String> {
        let body = self.files.lock().unwrap().get(file)?.clone();
        let start = body.len().saturating_sub(max as usize);
        // Corta em fronteira de caractere: o disco corta por byte, mas `String::from_utf8_lossy`
        // já normaliza lá — aqui basta não entrar em pânico.
        Some(body.get(start..).unwrap_or(&body).to_string())
    }

    fn first_line(&self, file: &Path) -> Option<String> {
        let body = self.files.lock().unwrap().get(file)?.clone();
        Some(body.lines().next().unwrap_or_default().to_string())
    }

    fn read(&self, file: &Path) -> Option<String> {
        self.files.lock().unwrap().get(file).cloned()
    }

    fn modified_ms(&self, file: &Path) -> Option<u64> {
        self.mtimes.lock().unwrap().get(file).copied()
    }

    fn list(&self, dir: &Path) -> Vec<PathBuf> {
        self.files
            .lock()
            .unwrap()
            .keys()
            .filter(|p| p.parent() == Some(dir))
            .cloned()
            .collect()
    }

    fn remove(&self, file: &Path) -> bool {
        self.files.lock().unwrap().remove(file).is_some()
    }
}
