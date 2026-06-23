//! Comandos expostos ao frontend (invoke) + supervisão do sidecar FFmpeg.
use crate::config::{self, AppConfig};
use crate::engine::{self, EngineSnapshot};
use crate::keys;
use crate::AppState;
use serde::Serialize;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

// ----------------------------- Config -----------------------------

#[tauri::command]
pub fn get_config(app: AppHandle) -> AppConfig {
    let mut cfg = config::load(&app);
    // A verdade sobre "tem chave?" vem do cofre, não do arquivo.
    for t in cfg.targets.iter_mut() {
        t.has_key = keys::has_key(&t.id);
    }
    cfg
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    config::save(&app, &config)
}

// ----------------------------- Cofre ------------------------------

#[tauri::command]
pub fn set_key(target_id: String, key: String) -> Result<(), String> {
    keys::set_key(&target_id, &key)
}

#[tauri::command]
pub fn clear_key(target_id: String) -> Result<(), String> {
    keys::clear_key(&target_id)
}

#[tauri::command]
pub fn has_key(target_id: String) -> bool {
    keys::has_key(&target_id)
}

// ------------------------- Encoders / banda -----------------------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EncoderInfo {
    pub kind: String,
    pub label: String,
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_sessions: Option<u32>,
}

#[tauri::command]
pub async fn detect_encoders(app: AppHandle) -> Vec<EncoderInfo> {
    let listing = match app.shell().sidecar("ffmpeg") {
        Ok(cmd) => cmd
            .args(["-hide_banner", "-encoders"])
            .output()
            .await
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default(),
        Err(_) => String::new(),
    };
    let has = |needle: &str| listing.contains(needle);

    vec![
        EncoderInfo { kind: "nvenc".into(), label: "NVIDIA NVENC".into(), available: has("h264_nvenc"), max_sessions: Some(8) },
        EncoderInfo { kind: "qsv".into(), label: "Intel Quick Sync".into(), available: has("h264_qsv"), max_sessions: None },
        EncoderInfo { kind: "amf".into(), label: "AMD AMF".into(), available: has("h264_amf"), max_sessions: None },
        EncoderInfo { kind: "videotoolbox".into(), label: "Apple VideoToolbox".into(), available: has("h264_videotoolbox"), max_sessions: None },
        // Software está sempre disponível (libx264).
        EncoderInfo { kind: "software".into(), label: "Software (x264)".into(), available: true, max_sessions: Some(1) },
    ]
}

#[tauri::command]
pub fn test_upload() -> Result<f64, String> {
    // TODO(§4.2): medir o upload real. Por ora, não implementado.
    Err("Teste de upload ainda não implementado".into())
}

#[tauri::command]
pub fn obs_autoconfigure() -> Result<(), String> {
    // TODO(§4.1): integrar obs-websocket para preencher serviço/URL/chave no OBS.
    Err("Auto-configuração do OBS ainda não implementada".into())
}

// --------------------------- Motor (relay) ------------------------

fn emit(app: &AppHandle, snap: &EngineSnapshot) {
    let _ = app.emit("engine://status", snap);
}

#[tauri::command]
pub async fn start_engine(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let config = get_config(app.clone());
    let enabled: Vec<_> = config.targets.iter().filter(|t| t.enabled).collect();
    if enabled.is_empty() {
        return Err("Nenhuma plataforma ativa.".into());
    }

    // Junta as chaves do cofre para os destinos ativos.
    let mut keymap: HashMap<String, String> = HashMap::new();
    for t in &enabled {
        if let Some(k) = keys::get_key(&t.id) {
            keymap.insert(t.id.clone(), k);
        }
    }

    let args = engine::build_ffmpeg_args(&config, &keymap);

    let sidecar = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("sidecar ffmpeg indisponível (rode scripts/fetch-binaries.ps1): {e}"))?;
    let (mut rx, child) = sidecar
        .args(args)
        .spawn()
        .map_err(|e| format!("falha ao iniciar o FFmpeg: {e}"))?;

    let started = now_ms();
    let snap = EngineSnapshot::live(&config, started);
    {
        let mut eng = state.engine.lock().unwrap();
        eng.child = Some(child);
        eng.snapshot = Some(snap.clone());
        eng.started_ms = started;
    }
    emit(&app, &snap);

    // Leitor: parseia o progresso do FFmpeg e emite status (§14.3).
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                    let line = String::from_utf8_lossy(&bytes);
                    update_from_stats(&app2, &line);
                }
                CommandEvent::Terminated(_) => {
                    let state = app2.state::<AppState>();
                    let mut eng = state.engine.lock().unwrap();
                    eng.child = None;
                    let snap = EngineSnapshot::stopped();
                    eng.snapshot = Some(snap.clone());
                    drop(eng);
                    emit(&app2, &snap);
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn stop_engine(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    kill_engine(&app);
    let _ = state; // o kill já usa o state via app
    Ok(())
}

/// Lê uma chave numérica do tipo "fps= 60" / "drop=5" do log do FFmpeg.
fn parse_kv(line: &str, key: &str) -> Option<f64> {
    let idx = line.find(key)?;
    let rest = line[idx + key.len()..].trim_start();
    let num: String = rest
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    num.parse().ok()
}

fn update_from_stats(app: &AppHandle, line: &str) {
    if !line.contains("frame=") && !line.contains("bitrate=") {
        return;
    }
    let fps = parse_kv(line, "fps=").map(|v| v as u32);
    let drop = parse_kv(line, "drop=").map(|v| v as u32);

    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    let started = eng.started_ms;
    let Some(snap) = eng.snapshot.as_mut() else {
        return;
    };
    let uptime = ((now_ms().saturating_sub(started)) as f64) / 1000.0;
    for st in snap.targets.values_mut() {
        st.state = "live".into();
        st.uptime_sec = uptime;
        if let Some(f) = fps {
            st.fps = f;
        }
        if let Some(d) = drop {
            st.dropped_frames = d;
        }
    }
    let out = snap.clone();
    drop(eng);
    emit(app, &out);
}

/// Mata o sidecar e sua árvore de processos, e zera o estado (§14.2).
pub fn kill_engine(app: &AppHandle) {
    let state = app.state::<AppState>();
    let child = {
        let mut eng = state.engine.lock().unwrap();
        eng.snapshot = Some(EngineSnapshot::stopped());
        eng.child.take()
    };
    if let Some(child) = child {
        let pid = child.pid();
        let _ = child.kill();
        // Mata eventuais subprocessos (netos órfãos) — Windows-first.
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .output();
        }
        #[cfg(not(windows))]
        {
            let _ = pid; // em Unix, child.kill() já encerra; árvore tratada no futuro
        }
    }
    emit(app, &EngineSnapshot::stopped());
}
