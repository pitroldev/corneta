//! A bounded journal queue: producers never wait for disk I/O. Each active
//! journal owns one handle; shutdown drains it with a finite acknowledgement wait.
use serde_json::Value;
use std::collections::VecDeque;
use std::fs::File;
use std::io::{BufWriter, Seek, SeekFrom, Write};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

const MAX_PENDING_BYTES: usize = 512 * 1024;
const MAX_PENDING_LINES: usize = 1024;
const CONTROL_RESERVE: usize = 16 * 1024;
const FILE_RESERVE: u64 = 1024;

#[derive(Default)]
struct Pending {
    lines: VecDeque<String>,
    bytes: usize,
    accepted: u64,
    cap: u64,
    closing: bool,
    closed: bool,
    failed: bool,
    dropped: u64,
    gap: Option<(u64, u64)>,
    ending: Option<String>,
    invalidate_chat: bool,
}

pub(super) struct JournalWriter {
    shared: Arc<(Mutex<Pending>, Condvar)>,
    chat: bool,
}

impl JournalWriter {
    pub(super) fn start(
        file: File,
        initial_len: u64,
        chat: bool,
        keep_alive: impl Send + 'static,
    ) -> Self {
        Self::start_with_write_hook(file, initial_len, chat, keep_alive, || {})
    }

    // A one-shot write hook lets regression tests hold a detached batch behind
    // a barrier without depending on disk speed or sleeps.
    pub(super) fn start_with_write_hook(
        file: File,
        initial_len: u64,
        chat: bool,
        keep_alive: impl Send + 'static,
        before_write: impl FnOnce() + Send + 'static,
    ) -> Self {
        let shared = Arc::new((
            Mutex::new(Pending {
                accepted: initial_len,
                ..Default::default()
            }),
            Condvar::new(),
        ));
        let worker = shared.clone();
        std::thread::spawn(move || {
            // Keep the per-file coordinator discoverable until the handle is
            // actually released, even when close() reaches its waiting deadline.
            let _keep_alive = keep_alive;
            let mut before_write = Some(before_write);
            let mut writer = BufWriter::with_capacity(64 * 1024, file);
            let success = loop {
                let (lock, ready) = &*worker;
                let state = lock.lock().unwrap();
                let (mut state, _) = ready
                    .wait_timeout_while(state, Duration::from_millis(100), |state| {
                        state.lines.is_empty() && !state.closing && !state.invalidate_chat
                    })
                    .unwrap();
                // At most one bounded batch is detached; producers can refill only
                // another bounded queue while the disk is busy.
                let lines = std::mem::take(&mut state.lines);
                state.bytes = 0;
                let closing = state.closing;
                let invalid = state.invalidate_chat;
                let gap = state.gap.take();
                let ending = if closing { state.ending.take() } else { None };
                drop(state);
                if let Some(before_write) = before_write.take() {
                    before_write();
                }
                let result = (|| -> std::io::Result<()> {
                    if invalid {
                        // If moderation cannot be persisted, never present the old
                        // journal as an authoritative replay of moderated content.
                        writer.flush()?;
                        writer.get_ref().set_len(0)?;
                        writer.get_mut().seek(SeekFrom::Start(0))?;
                        writer.write_all(b"{\"unavailable\":true,\"t\":0}\n")?;
                    } else {
                        for line in lines {
                            writer.write_all(line.as_bytes())?;
                        }
                        if let Some((from, to)) = gap {
                            let line = format!("{{\"t\":{to},\"gap\":{from}}}\n");
                            let mut state = lock.lock().unwrap();
                            // The reserve is bounded too; never overflow the file.
                            if state.accepted + line.len() as u64 <= state.cap {
                                state.accepted += line.len() as u64;
                                drop(state);
                                writer.write_all(line.as_bytes())?;
                            }
                        }
                        if let Some(line) = ending {
                            writer.write_all(line.as_bytes())?;
                        }
                    }
                    writer.flush()
                })();
                if result.is_err() || invalid {
                    let mut state = lock.lock().unwrap();
                    state.failed = true;
                    state.lines.clear();
                    state.bytes = 0;
                    drop(writer);
                    state.closed = true;
                    ready.notify_all();
                    break result.is_ok();
                }
                if closing {
                    let mut state = lock.lock().unwrap();
                    // A recorder can enqueue recEnd/recFinalized while this
                    // batch flushes. Drain it too; never acknowledge too early.
                    if state.lines.is_empty()
                        && state.ending.is_none()
                        && state.gap.is_none()
                        && !state.invalidate_chat
                    {
                        drop(writer);
                        state.closed = true;
                        ready.notify_all();
                        break true;
                    }
                }
            };
            if !success {
                log::warn!("relatório: falha na escrita do journal");
            }
        });
        Self { shared, chat }
    }

    /// False only after the worker has released its file: synchronous appends
    /// are safe then. A bounded-queue/disk failure must not bypass its policy.
    pub(super) fn append(&self, line: &Value, cap: u64) -> bool {
        let mut text = line.to_string();
        text.push('\n');
        let (lock, ready) = &*self.shared;
        let Ok(mut state) = lock.lock() else {
            return true;
        };
        if state.closed {
            return false;
        }
        if state.failed || state.invalidate_chat {
            return true;
        }
        state.cap = if state.cap == 0 {
            cap
        } else {
            state.cap.min(cap)
        };
        let cap = state.cap;
        let ending = line.get("kind").and_then(Value::as_str) == Some("end");
        if ending && text.len() as u64 <= FILE_RESERVE && state.accepted + text.len() as u64 <= cap
        {
            if let Some(old) = state.ending.replace(text.clone()) {
                state.accepted -= old.len() as u64;
            }
            state.accepted += text.len() as u64;
            ready.notify_one();
            return true;
        }
        let critical = line.get("del").is_some()
            || (line.get("m").is_none()
                && line.get("kind").and_then(Value::as_str) != Some("sample"));
        let byte_budget = if critical {
            MAX_PENDING_BYTES
        } else {
            MAX_PENDING_BYTES - CONTROL_RESERVE
        };
        let line_budget = if critical {
            MAX_PENDING_LINES
        } else {
            MAX_PENDING_LINES - 32
        };
        let fits = state.lines.len() < line_budget
            && state.bytes + text.len() <= byte_budget
            && state.accepted + text.len() as u64 <= cap.saturating_sub(FILE_RESERVE);
        if !fits {
            state.dropped += 1;
            if state.dropped == 1 {
                log::warn!("relatório: limite de escrita atingido; descartes serão agregados");
            }
            if self.chat {
                if line.get("del").is_some() {
                    state.invalidate_chat = true;
                } else {
                    let timestamp = line.get("t").and_then(Value::as_u64).unwrap_or(0);
                    let from = state.gap.map(|gap| gap.0).unwrap_or(timestamp);
                    state.gap = Some((from, timestamp));
                }
            }
            ready.notify_one();
            return true;
        }
        state.accepted += text.len() as u64;
        state.bytes += text.len();
        state.lines.push_back(text);
        // Flush small traffic on the timer; wake early for a useful I/O batch.
        if state.closing || state.bytes >= 64 * 1024 {
            ready.notify_one();
        }
        true
    }

    /// A timeout does NOT transfer ownership of the file to another writer.
    pub(super) fn close(&self) -> bool {
        self.close_with_timeout(Duration::from_secs(2))
    }

    pub(super) fn close_with_timeout(&self, timeout: Duration) -> bool {
        let (lock, ready) = &*self.shared;
        let Ok(mut state) = lock.lock() else {
            return false;
        };
        state.closing = true;
        ready.notify_all();
        let (state, _) = ready
            .wait_timeout_while(state, timeout, |state| !state.closed)
            .unwrap();
        if !state.closed {
            log::warn!("relatório: journal ainda drenando após o prazo de encerramento");
        }
        state.closed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temporary_chat() -> (std::path::PathBuf, JournalWriter) {
        temporary_chat_with_hook(|| {})
    }

    fn temporary_chat_with_hook(
        before_write: impl FnOnce() + Send + 'static,
    ) -> (std::path::PathBuf, JournalWriter) {
        let path = std::env::temp_dir().join(format!(
            "corneta-chat-journal-{}-{}.ndjson",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let file = std::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&path)
            .unwrap();
        let writer = JournalWriter::start_with_write_hook(file, 0, true, (), before_write);
        (path, writer)
    }

    #[test]
    fn late_moderation_during_shutdown_cannot_skip_chat_invalidation() {
        let (entered_tx, entered_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let (path, writer) = temporary_chat_with_hook(move || {
            entered_tx.send(()).unwrap();
            let _ = release_rx.recv();
        });
        writer.append(&json!({"t":1,"m":"must not reappear","i":"1"}), 2048);
        assert!(!writer.close_with_timeout(Duration::ZERO));
        entered_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        // First closing batch is already detached, but the moderation record
        // cannot fit. Shutdown must still process the fail-closed control flag.
        assert!(writer.append(&json!({"t":2,"del":"1"}), 1024));
        release_tx.send(()).unwrap();
        assert!(writer.close());
        assert!(writer.close(), "close remains idempotent for every caller");
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "{\"unavailable\":true,\"t\":0}\n"
        );
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn dropped_chat_is_an_explicit_gap_and_never_exceeds_file_cap() {
        let (path, writer) = temporary_chat();
        writer.append(&json!({"t":1000, "m":"x".repeat(3000)}), 2048);
        writer.close();
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.len() <= 2048);
        let gap: Value = serde_json::from_str(text.trim()).unwrap();
        assert_eq!(gap, json!({"t":1000,"gap":1000}));
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn a_lost_deletion_invalidates_old_chat_instead_of_reviving_it() {
        let (path, writer) = temporary_chat();
        writer.append(&json!({"t":1,"m":"previously visible","i":"1"}), 2048);
        // Simulate a full file: even a tiny control record cannot fit.
        writer.append(&json!({"t":2,"del":"1"}), 1024);
        writer.close();
        let text = std::fs::read_to_string(&path).unwrap();
        assert_eq!(text, "{\"unavailable\":true,\"t\":0}\n");
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn cap_cannot_be_relaxed_after_the_writer_has_accepted_it() {
        let (path, writer) = temporary_chat();
        writer.append(&json!({"t":1,"m":"first"}), 2048);
        writer.append(&json!({"t":2,"m":"x".repeat(3000)}), 10000);
        writer.close();
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.len() <= 2048);
        assert!(text.contains("first"));
        assert!(!text.contains(&"x".repeat(100)));
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn writes_in_order_drains_and_reserves_space_for_end() {
        let path = std::env::temp_dir().join(format!(
            "corneta-journal-{}-{}.ndjson",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let file = std::fs::OpenOptions::new()
            .create_new(true)
            .append(true)
            .open(&path)
            .unwrap();
        let writer = JournalWriter::start(file, 0, false, ());
        for i in 0..200 {
            writer.append(&json!({"kind":"sample", "t":i}), 2048);
        }
        writer.append(&json!({"kind":"end", "endedAt":201}), 2048);
        writer.close();
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.len() <= 2048);
        let lines: Vec<Value> = text
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();
        assert_eq!(lines.last().unwrap()["kind"], "end");
        let samples = &lines[..lines.len() - 1];
        assert!(samples.len() > 1);
        for (i, sample) in samples.iter().enumerate() {
            assert_eq!(sample["t"], i as u64);
        }
        std::fs::remove_file(path).unwrap();
    }
}
