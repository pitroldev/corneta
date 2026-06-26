//! Gravação da sessão de transmissão em NDJSON (uma linha por amostra/evento)
//! para o relatório pós-live. Ver docs/RELATORIO-POS-LIVE.md.
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::config::AppConfig;
use crate::engine::EngineSnapshot;

/// Quantas sessões manter no disco (as mais antigas são podadas).
const KEEP: usize = 50;

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
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(path) {
        let mut line = value.to_string();
        line.push('\n');
        let _ = f.write_all(line.as_bytes());
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
        "id": id.to_string(),
        "startedAt": id,
        "mode": config.mode,
        "platforms": platforms,
    });
    if let Ok(mut f) = File::create(&path) {
        let _ = writeln!(f, "{meta}");
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
}

/// Crava um marcador ("momento") na sessão — aparece na linha do tempo do relatório.
pub fn record_marker(path: &Path, label: &str) {
    append_line(path, &json!({ "kind": "marker", "t": now_ms(), "label": label }));
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
    out.sort_by(|a, b| b.started_at.cmp(&a.started_at));
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
        mode: v.get("mode").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        platforms: v.get("platforms").cloned().unwrap_or_else(|| json!([])),
    })
}

/// Conteúdo NDJSON cru de uma sessão (o frontend parseia e analisa).
pub fn read_session(app: &AppHandle, id: &str) -> Option<String> {
    let dir = sessions_dir(app)?;
    fs::read_to_string(dir.join(format!("{id}.ndjson"))).ok()
}

pub fn delete_session(app: &AppHandle, id: &str) {
    if let Some(dir) = sessions_dir(app) {
        let _ = fs::remove_file(dir.join(format!("{id}.ndjson")));
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
