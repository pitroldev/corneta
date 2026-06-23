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

/// Corpo de upload que faz streaming de bytes até um deadline, contando o que envia.
struct UploadBody {
    deadline: std::time::Instant,
    sent: std::sync::Arc<std::sync::atomic::AtomicU64>,
}

impl std::io::Read for UploadBody {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if std::time::Instant::now() >= self.deadline {
            return Ok(0); // EOF → encerra o POST
        }
        buf.fill(0);
        self.sent
            .fetch_add(buf.len() as u64, std::sync::atomic::Ordering::Relaxed);
        Ok(buf.len())
    }
}

#[tauri::command]
pub async fn test_upload() -> Result<f64, String> {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    tauri::async_runtime::spawn_blocking(|| {
        // Várias conexões em paralelo, fazendo streaming por alguns segundos.
        // Mede só o regime estável (descarta o warm-up = fase de TCP slow-start),
        // o que dá uma estimativa muito melhor em conexões rápidas (gigabit).
        const CONNS: usize = 6;
        let warmup = Duration::from_millis(1200);
        let measure = Duration::from_secs(3);

        let sent = Arc::new(AtomicU64::new(0));
        let deadline = Instant::now() + warmup + measure + Duration::from_millis(500);

        let handles: Vec<_> = (0..CONNS)
            .map(|_| {
                let sent = sent.clone();
                std::thread::spawn(move || {
                    // Reconecta se o servidor cortar antes do deadline.
                    while Instant::now() < deadline {
                        let agent = ureq::AgentBuilder::new()
                            .timeout_write(Duration::from_secs(20))
                            .timeout_read(Duration::from_secs(20))
                            .build();
                        let body = UploadBody { deadline, sent: sent.clone() };
                        let _ = agent.post("https://speed.cloudflare.com/__up").send(body);
                    }
                })
            })
            .collect();

        std::thread::sleep(warmup);
        let c0 = sent.load(Ordering::Relaxed);
        let t0 = Instant::now();
        std::thread::sleep(measure);
        let c1 = sent.load(Ordering::Relaxed);
        let secs = t0.elapsed().as_secs_f64();

        for h in handles {
            let _ = h.join();
        }

        let bytes = c1.saturating_sub(c0);
        if bytes == 0 || secs <= 0.0 {
            return Err("não foi possível medir o upload".to_string());
        }
        let mbps = (bytes as f64 * 8.0) / secs / 1_000_000.0;
        Ok((mbps * 10.0).round() / 10.0)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let m = app.autolaunch();
    if enabled {
        m.enable().map_err(|e| e.to_string())
    } else {
        m.disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn obs_autoconfigure(app: AppHandle) -> Result<(), String> {
    let cfg = get_config(app);
    // Servidor que o OBS usa = rtmp://host:port/app (a chave vai separada).
    let server = format!(
        "{}://{}:{}/{}",
        cfg.ingest.protocol, cfg.ingest.host, cfg.ingest.port, cfg.ingest.app
    );
    let key = cfg.ingest.key.clone();
    let password = cfg.settings.obs_password.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::obs::autoconfigure("127.0.0.1", 4455, &password, &server, &key)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

// --------------------------- Motor (relay) ------------------------

fn emit(app: &AppHandle, snap: &EngineSnapshot) {
    let _ = app.emit("engine://status", snap);
}

fn mediamtx_config_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("mediamtx.yml"))
}

/// Coloca o motor em estado de erro com uma mensagem.
fn set_engine_error(app: &AppHandle, msg: &str) {
    log::error!("motor: {msg}");
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    let snap = eng.snapshot.get_or_insert_with(EngineSnapshot::stopped);
    snap.state = "error".into();
    snap.message = Some(msg.to_string());
    let out = snap.clone();
    drop(eng);
    emit(app, &out);
}

/// Marca um destino específico como "reconectando" (entre tentativas do seu FFmpeg).
fn set_target_reconnecting(app: &AppHandle, target_id: &str) {
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    if let Some(snap) = eng.snapshot.as_mut() {
        if snap.state == "stopped" {
            return;
        }
        if let Some(st) = snap.targets.get_mut(target_id) {
            st.state = "reconnecting".into();
            let out = snap.clone();
            drop(eng);
            emit(app, &out);
        }
    }
}

#[tauri::command]
pub async fn start_engine(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    let config = get_config(app.clone());
    let enabled: Vec<_> = config.targets.iter().filter(|t| t.enabled).collect();
    if enabled.is_empty() {
        return Err("Nenhuma plataforma ativa.".into());
    }

    // Chaves do cofre + hosts (para erros por destino).
    let mut keymap: HashMap<String, String> = HashMap::new();
    for t in &enabled {
        if let Some(k) = keys::get_key(&t.id) {
            keymap.insert(t.id.clone(), k);
        }
    }
    // 1) Gera o mediamtx.yml e sobe o MediaMTX (servidor de ingestão do OBS).
    let yml = mediamtx_config_path(&app)?;
    std::fs::write(&yml, engine::mediamtx_config(&config))
        .map_err(|e| format!("config mediamtx: {e}"))?;

    let (mut mtx_rx, mtx_child) = app
        .shell()
        .sidecar("mediamtx")
        .map_err(|e| format!("sidecar mediamtx indisponível (rode scripts/fetch-binaries.ps1): {e}"))?
        .args([yml.to_string_lossy().to_string()])
        .spawn()
        .map_err(|e| format!("falha ao iniciar o MediaMTX: {e}"))?;

    let started = now_ms();
    let snap = EngineSnapshot::starting(&config, started);
    let running = Arc::new(AtomicBool::new(true));
    {
        let mut eng = state.engine.lock().unwrap();
        eng.mediamtx = Some(mtx_child);
        eng.snapshot = Some(snap.clone());
        eng.started_ms = started;
        eng.running = running.clone();
    }
    emit(&app, &snap);
    log::info!("motor: iniciando — MediaMTX (ingestão) + FFmpeg fan-out");

    // 2) Leitor do MediaMTX: detecta erro fatal (porta de ingestão em uso).
    let app_m = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(ev) = mtx_rx.recv().await {
            if let CommandEvent::Stdout(b) | CommandEvent::Stderr(b) = ev {
                let line = String::from_utf8_lossy(&b).to_lowercase();
                if line.contains("address already in use") {
                    set_engine_error(&app_m, "A porta de ingestão já está em uso. Feche o que estiver usando a porta 1935.");
                }
            }
        }
    });

    // 3) Um supervisor de FFmpeg POR destino — métricas reais e reconexão independentes.
    for &t in &enabled {
        let key = keymap.get(&t.id).cloned().unwrap_or_default();
        let args = engine::ffmpeg_args_for_target(&config, t, &key);
        let target_id = t.id.clone();
        let app_t = app.clone();
        let run_flag = running.clone();
        tauri::async_runtime::spawn(async move {
            while run_flag.load(Ordering::Relaxed) {
                let spawned = app_t
                    .shell()
                    .sidecar("ffmpeg")
                    .and_then(|c| c.args(args.clone()).spawn());
                let (mut rx, child) = match spawned {
                    Ok(v) => v,
                    Err(e) => {
                        set_engine_error(&app_t, &format!("FFmpeg indisponível: {e}"));
                        break;
                    }
                };
                {
                    let st = app_t.state::<AppState>();
                    st.engine.lock().unwrap().ffmpegs.insert(target_id.clone(), child);
                }
                while let Some(ev) = rx.recv().await {
                    match ev {
                        CommandEvent::Stdout(b) | CommandEvent::Stderr(b) => {
                            update_target_metrics(&app_t, &target_id, &String::from_utf8_lossy(&b));
                        }
                        CommandEvent::Terminated(_) => break,
                        _ => {}
                    }
                }
                {
                    let st = app_t.state::<AppState>();
                    st.engine.lock().unwrap().ffmpegs.remove(&target_id);
                }
                if !run_flag.load(Ordering::Relaxed) {
                    break;
                }
                log::warn!("FFmpeg de um destino caiu — reconectando em 2s");
                set_target_reconnecting(&app_t, &target_id);
                let _ = tauri::async_runtime::spawn_blocking(|| {
                    std::thread::sleep(std::time::Duration::from_secs(2))
                })
                .await;
            }
        });
    }

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

/// Traduz uma linha de erro do FFmpeg para (estado, mensagem amigável).
fn friendly_error(low: &str) -> (&'static str, String) {
    if low.contains("403") || low.contains("forbidden") || low.contains("unauthorized")
        || low.contains("not authorized") || low.contains("rejected") || low.contains("auth")
    {
        ("error", "Chave recusada pela plataforma — confira a stream key.".into())
    } else if low.contains("connection refused")
        || low.contains("cannot open")
        || low.contains("failed to connect")
        || low.contains("no route")
        || low.contains("name or service not known")
    {
        ("reconnecting", "Sem conexão com a plataforma — tentando de novo.".into())
    } else if low.contains("broken pipe")
        || low.contains("connection reset")
        || low.contains("end of file")
        || low.contains("timed out")
    {
        ("reconnecting", "A conexão caiu — reconectando.".into())
    } else {
        ("reconnecting", "Instabilidade no envio — reconectando.".into())
    }
}

/// Atualiza as métricas REAIS de UM destino a partir do log do seu próprio FFmpeg.
fn update_target_metrics(app: &AppHandle, target_id: &str, line: &str) {
    let is_stats = line.contains("frame=") || line.contains("bitrate=");
    let low = line.to_lowercase();
    const ERR_KEYS: [&str; 8] = [
        "error", "failed", "connection refused", "broken pipe",
        "unable to", "connection reset", "i/o error", "end of file",
    ];
    let is_error = !is_stats && ERR_KEYS.iter().any(|k| low.contains(k));
    if !is_stats && !is_error {
        return;
    }

    let fps = parse_kv(line, "fps=").map(|v| v as u32);
    let bitrate = parse_kv(line, "bitrate=").map(|v| v as u32); // kbits/s ≈ kbps
    let dropped = parse_kv(line, "drop=").map(|v| v as u32);

    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    let started = eng.started_ms;
    let Some(snap) = eng.snapshot.as_mut() else {
        return;
    };
    let Some(st) = snap.targets.get_mut(target_id) else {
        return;
    };

    if is_stats {
        st.state = "live".into();
        st.message = None;
        st.uptime_sec = (now_ms().saturating_sub(started) as f64) / 1000.0;
        if let Some(f) = fps {
            st.fps = f;
        }
        if let Some(b) = bitrate {
            st.bitrate_kbps = b;
        }
        if let Some(d) = dropped {
            st.dropped_frames = d;
        }
        snap.state = "live".into();
    } else {
        let (state, msg) = friendly_error(&low);
        st.state = state.into();
        st.message = Some(msg);
    }

    let out = snap.clone();
    drop(eng);
    emit(app, &out);
}

/// Para o supervisor e mata FFmpeg + MediaMTX (e suas árvores), zerando o estado (§14.2).
pub fn kill_engine(app: &AppHandle) {
    use std::sync::atomic::Ordering;
    log::info!("motor: encerrando");
    let state = app.state::<AppState>();
    let (children, running) = {
        let mut eng = state.engine.lock().unwrap();
        eng.snapshot = Some(EngineSnapshot::stopped());
        let mut children: Vec<tauri_plugin_shell::process::CommandChild> =
            eng.ffmpegs.drain().map(|(_, c)| c).collect();
        if let Some(m) = eng.mediamtx.take() {
            children.push(m);
        }
        (children, eng.running.clone())
    };
    // Impede os supervisores de respawnar.
    running.store(false, Ordering::Relaxed);

    for child in children {
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
