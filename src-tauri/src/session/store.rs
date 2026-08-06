//! Adaptadores da porta [`SessionStore`](super::SessionStore).
//!
//! `DiskStore` é o de produção: NDJSON em disco com escrita bufferizada. `MemStore` (só em
//! teste) guarda tudo num mapa, e é ele que deixa a recuperação e a poda serem testadas
//! sem criar arquivo nenhum.

use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, BufWriter, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::UNIX_EPOCH;

use serde_json::Value;

use super::SessionStore;

/// Escrita bufferizada: uma live de 3h escreve dezenas de milhares de linhas, e um
/// `open`/`write`/`close` por linha seria I/O de sobra pra nada.
struct SessionWriter {
    writer: BufWriter<File>,
    pending_lines: u8,
}

static WRITERS: OnceLock<Mutex<HashMap<PathBuf, SessionWriter>>> = OnceLock::new();

fn writers() -> &'static Mutex<HashMap<PathBuf, SessionWriter>> {
    WRITERS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// O adaptador de produção.
pub struct DiskStore;

impl SessionStore for DiskStore {
    fn append(&self, file: &Path, line: &Value, cap: u64) {
        if !super::domain::fits_cap(self.len(file), cap) {
            log::warn!(
                "{} atingiu o limite de {cap} bytes; linha descartada",
                file.display()
            );
            return;
        }
        let mut text = line.to_string();
        text.push('\n');
        if let Ok(mut map) = writers().lock() {
            if let Some(session) = map.get_mut(file) {
                let _ = session.writer.write_all(text.as_bytes());
                session.pending_lines += 1;
                if session.pending_lines >= 10 {
                    let _ = session.writer.flush();
                    session.pending_lines = 0;
                }
                return;
            }
        }
        // Sem writer registrado (chat, ou processo que só anexa): abre e fecha na hora.
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(file) {
            let _ = f.write_all(text.as_bytes());
        }
    }

    fn create(&self, file: &Path, first: &Value) {
        let Ok(handle) = File::create(file) else {
            return;
        };
        let mut writer = BufWriter::new(handle);
        let _ = writeln!(writer, "{first}");
        let _ = writer.flush();
        if let Ok(mut map) = writers().lock() {
            map.insert(
                file.to_path_buf(),
                SessionWriter {
                    writer,
                    pending_lines: 0,
                },
            );
        }
    }

    fn close(&self, file: &Path) {
        if let Ok(mut map) = writers().lock() {
            if let Some(mut session) = map.remove(file) {
                let _ = session.writer.flush();
            }
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
        fs::remove_file(file).is_ok()
    }
}

// ---------------------------------------------------------------------------

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
