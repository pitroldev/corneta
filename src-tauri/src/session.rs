//! Gravação da sessão de transmissão em NDJSON (uma linha por amostra/evento)
//! para o relatório pós-live. Ver docs/RELATORIO-POS-LIVE.md.
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, BufWriter, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::config::AppConfig;
use crate::engine::EngineSnapshot;

/// Quantas sessões manter no disco (as mais antigas são podadas).
const KEEP: usize = 50;
const MAX_SESSION_BYTES: u64 = 32 * 1024 * 1024;
struct SessionWriter {
    writer: BufWriter<File>,
    pending_lines: u8,
}
static WRITERS: OnceLock<Mutex<HashMap<PathBuf, SessionWriter>>> = OnceLock::new();

fn writers() -> &'static Mutex<HashMap<PathBuf, SessionWriter>> {
    WRITERS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn valid_session_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 20 && id.bytes().all(|b| b.is_ascii_digit())
}

fn session_path(app: &AppHandle, id: &str) -> Option<PathBuf> {
    if !valid_session_id(id) {
        return None;
    }
    Some(sessions_dir(app)?.join(format!("{id}.ndjson")))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// `app_data_dir/sessions` (criada se não existir).
pub fn sessions_dir(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?.join("sessions");
    fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

fn append_line(path: &Path, value: &Value) {
    if std::fs::metadata(path).map(|m| m.len()).unwrap_or(0) >= MAX_SESSION_BYTES {
        log::warn!("sessão atingiu o limite de {MAX_SESSION_BYTES} bytes; amostra descartada");
        return;
    }
    let mut line = value.to_string();
    line.push('\n');
    if let Ok(mut map) = writers().lock() {
        if let Some(session) = map.get_mut(path) {
            let _ = session.writer.write_all(line.as_bytes());
            session.pending_lines += 1;
            if session.pending_lines >= 10 {
                let _ = session.writer.flush();
                session.pending_lines = 0;
            }
            return;
        }
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(line.as_bytes());
    }
}

/// Inicia uma sessão: poda antigas, cria o NDJSON e escreve o cabeçalho.
pub fn start_session(app: &AppHandle, config: &AppConfig) -> Option<PathBuf> {
    let dir = sessions_dir(app)?;
    prune(&dir, KEEP);
    let id = now_ms();
    let path = dir.join(format!("{id}.ndjson"));
    let platforms: Vec<Value> = config
        .targets
        .iter()
        .filter(|t| t.enabled)
        .map(|t| json!({ "id": t.id, "name": t.name, "platformId": t.platform_id }))
        .collect();
    let meta = json!({
        "kind": "meta",
        "schemaVersion": 1,
        "id": id.to_string(),
        "startedAt": id,
        "mode": config.mode,
        "platforms": platforms,
    });
    if let Ok(file) = File::create(&path) {
        let mut writer = BufWriter::new(file);
        let _ = writeln!(writer, "{meta}");
        let _ = writer.flush();
        if let Ok(mut map) = writers().lock() {
            map.insert(
                path.clone(),
                SessionWriter {
                    writer,
                    pending_lines: 0,
                },
            );
        }
    }
    log::info!("relatório: gravando sessão em {}", path.display());
    Some(path)
}

/// Grava uma amostra (estado dos destinos + CPU/GPU + nº de mensagens de chat na janela).
pub fn record_sample(path: &Path, snap: &EngineSnapshot, chat_count: u64) {
    let targets: Vec<Value> = snap
        .targets
        .values()
        .map(|t| {
            json!({
                "id": t.target_id,
                "name": t.name,
                "state": t.state,
                "bitrate": t.bitrate_kbps,
                "fps": t.fps,
                "dropped": t.dropped_frames,
            })
        })
        .collect();
    let sample = json!({
        "kind": "sample",
        "t": now_ms(),
        "cpu": snap.cpu,
        "gpu": snap.gpu,
        "obs": snap.obs,
        "chat": chat_count,
        "targets": targets,
    });
    append_line(path, &sample);
}

/// Grava a contagem de viewers (total + por fonte) — pra curva de retenção do relatório.
pub fn record_viewers(path: &Path, total: u64, items: &[Value]) {
    append_line(
        path,
        &json!({ "kind": "viewers", "t": now_ms(), "total": total, "items": items }),
    );
}

/// Grava um alerta (sub/raid/bits…) na sessão — pra timeline e momentos de destaque.
pub fn record_alert(path: &Path, platform: &str, kind: &str, user: &str, amount: Option<f64>) {
    append_line(
        path,
        &json!({
            "kind": "alert", "t": now_ms(),
            "platform": platform, "alertKind": kind, "user": user, "amount": amount,
        }),
    );
}

/// Fecha a sessão (marca o fim).
pub fn end_session(path: &Path) {
    append_line(path, &json!({ "kind": "end", "endedAt": now_ms() }));
    if let Ok(mut map) = writers().lock() {
        if let Some(mut session) = map.remove(path) {
            let _ = session.writer.flush();
        }
    }
}

/// Fecha sessões deixadas sem evento `end` por queda de energia/processo. Executado uma vez no
/// boot, antes que uma nova sessão possa ser iniciada.
pub fn recover_incomplete_sessions(app: &AppHandle) {
    let Some(dir) = sessions_dir(app) else { return };
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for path in entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("ndjson"))
    {
        let Ok(meta) = fs::metadata(&path) else {
            continue;
        };
        if meta.len() == 0 || meta.len() > MAX_SESSION_BYTES {
            continue;
        }
        // O estado da sessão está na última linha. Ler só a cauda evita carregar até 32 MiB
        // para cada uma das 50 sessões durante o boot.
        const TAIL_BYTES: u64 = 64 * 1024;
        let Ok(mut file) = File::open(&path) else {
            continue;
        };
        let start = meta.len().saturating_sub(TAIL_BYTES);
        if file.seek(SeekFrom::Start(start)).is_err() {
            continue;
        }
        let mut tail = Vec::with_capacity((meta.len() - start) as usize);
        if file.read_to_end(&mut tail).is_err() {
            continue;
        }
        let raw = String::from_utf8_lossy(&tail);
        let ended = raw
            .lines()
            .rev()
            .find(|line| !line.trim().is_empty())
            .and_then(|line| serde_json::from_str::<Value>(line).ok())
            .and_then(|value| value.get("kind").and_then(Value::as_str).map(str::to_owned))
            .as_deref()
            == Some("end");
        if !ended {
            append_line(
                &path,
                &json!({ "kind": "end", "endedAt": now_ms(), "recovered": true }),
            );
        }
    }
}

/// Crava um marcador ("momento") na sessão — aparece na linha do tempo do relatório.
pub fn record_marker(path: &Path, label: &str) {
    append_line(
        path,
        &json!({ "kind": "marker", "t": now_ms(), "label": label }),
    );
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMeta {
    pub id: String,
    pub started_at: u64,
    pub ended_at: Option<u64>,
    pub duration_sec: u64,
    pub mode: String,
    pub platforms: Value,
}

/// Lista as sessões gravadas (mais recente primeiro).
pub fn list_sessions(app: &AppHandle) -> Vec<SessionMeta> {
    let Some(dir) = sessions_dir(app) else {
        return vec![];
    };
    let Ok(entries) = fs::read_dir(&dir) else {
        return vec![];
    };
    let mut out: Vec<SessionMeta> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|x| x.to_str()) == Some("ndjson"))
        .filter_map(|p| read_meta(&p))
        .collect();
    out.sort_by_key(|item| std::cmp::Reverse(item.started_at));
    out
}

/// Lê o cabeçalho (primeira linha) e estima fim/duração pelo mtime do arquivo.
fn read_meta(path: &Path) -> Option<SessionMeta> {
    let f = File::open(path).ok()?;
    let mut first = String::new();
    BufReader::new(f).read_line(&mut first).ok()?;
    let v: Value = serde_json::from_str(first.trim()).ok()?;
    if v.get("kind")?.as_str()? != "meta" {
        return None;
    }
    let started_at = v.get("startedAt")?.as_u64()?;
    let ended_at = fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64);
    let duration_sec = ended_at
        .map(|e| e.saturating_sub(started_at) / 1000)
        .unwrap_or(0);
    Some(SessionMeta {
        id: v.get("id")?.as_str()?.to_string(),
        started_at,
        ended_at,
        duration_sec,
        mode: v
            .get("mode")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
        platforms: v.get("platforms").cloned().unwrap_or_else(|| json!([])),
    })
}

/// Conteúdo NDJSON cru de uma sessão (o frontend parseia e analisa).
pub fn read_session(app: &AppHandle, id: &str) -> Option<String> {
    let path = session_path(app, id)?;
    if fs::metadata(&path).ok()?.len() > MAX_SESSION_BYTES {
        log::warn!("sessão recusada: arquivo excede {MAX_SESSION_BYTES} bytes");
        return None;
    }
    fs::read_to_string(path).ok()
}

pub fn delete_session(app: &AppHandle, id: &str) -> Result<(), String> {
    let path = session_path(app, id).ok_or_else(|| "id de sessão inválido".to_string())?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("não foi possível apagar a sessão: {e}")),
    }
}

/// Mantém só as `keep` sessões mais recentes (nome do arquivo = timestamp).
fn prune(dir: &Path, keep: usize) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut files: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|x| x.to_str()) == Some("ndjson"))
        .collect();
    if files.len() <= keep {
        return;
    }
    files.sort();
    let remove = files.len() - keep;
    for p in files.into_iter().take(remove) {
        let _ = fs::remove_file(p);
    }
}

#[cfg(test)]
mod tests {
    use super::valid_session_id;

    #[test]
    fn session_id_accepts_only_timestamp_digits() {
        assert!(valid_session_id("1721400000000"));
        assert!(!valid_session_id("../config"));
        assert!(!valid_session_id("1/2"));
        assert!(!valid_session_id(""));
        assert!(!valid_session_id("123456789012345678901"));
    }
}
