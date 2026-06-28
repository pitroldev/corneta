//! Comandos expostos ao frontend (invoke) + supervisão do sidecar FFmpeg.
use crate::config::{self, AppConfig};
use crate::chat;
use crate::engine::{self, EngineSnapshot};
use crate::keys;
use crate::session;
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

/// `std::process::Command` que NÃO pisca uma janela de console no Windows. Os sidecars
/// (ffmpeg/mediamtx) já sobem sem janela pelo plugin shell; isto cobre os utilitários
/// crus daqui — sobretudo o `nvidia-smi` do amostrador (a cada ~2s ao vivo) e os
/// `taskkill` da limpeza — que senão piscavam um CMD cada vez que rodavam.
fn quiet_command(program: &str) -> std::process::Command {
    #[allow(unused_mut)]
    let mut cmd = std::process::Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}

// ----------------------------- Config -----------------------------

#[tauri::command]
pub fn get_config(app: AppHandle) -> AppConfig {
    let mut cfg = config::load(&app);
    // A verdade sobre "tem chave?" vem do cofre, não do arquivo.
    for t in cfg.targets.iter_mut() {
        t.has_key = keys::has_key(&t.id);
    }
    for a in cfg.settings.alert_sources.iter_mut() {
        a.has_token = keys::has_key(&format!("alert_{}", a.id));
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
    update_tray(app, snap);
}

/// Notificação nativa do SO (entrou no ar / destino caiu).
fn notify(app: &AppHandle, title: &str, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
}

fn fmt_mbps(kbps: u32) -> String {
    if kbps >= 1000 {
        format!("{:.1} Mbps", kbps as f64 / 1000.0)
    } else {
        format!("{kbps} kbps")
    }
}

/// Qualidade geral do multistream → cor do ícone da bandeja.
fn quality_of(snap: &EngineSnapshot) -> &'static str {
    match snap.state.as_str() {
        "stopped" => "idle",
        "error" => "bad",
        "starting" => "warn",
        _ => {
            let mut bad = false;
            let mut warn = false;
            for st in snap.targets.values() {
                match st.state.as_str() {
                    "error" => bad = true,
                    "reconnecting" | "connecting" | "waiting" | "brb" => warn = true,
                    _ => {}
                }
            }
            if bad {
                "bad"
            } else if warn {
                "warn"
            } else {
                "good"
            }
        }
    }
}

/// Tooltip da bandeja: cabeçalho + uma linha por plataforma (métrica/estado).
fn tray_tooltip(snap: &EngineSnapshot) -> String {
    if snap.state == "stopped" {
        return "Corneta".into();
    }
    let header = match snap.state.as_str() {
        "starting" => "Corneta · aguardando OBS".to_string(),
        "error" => "Corneta · erro".to_string(),
        _ => format!("Corneta · no ar ({})", snap.targets.len()),
    };
    let mut items: Vec<&engine::TargetStatus> = snap.targets.values().collect();
    items.sort_by(|a, b| a.name.cmp(&b.name));
    let mut lines = vec![header];
    for st in items {
        let (mark, detail) = match st.state.as_str() {
            "live" => ("✓", fmt_mbps(st.bitrate_kbps)),
            "reconnecting" => ("⚠", "reconectando".to_string()),
            "error" => ("✕", "erro".to_string()),
            "paused" => ("⏸", "pausado".to_string()),
            "waiting" => ("◌", "aguardando sinal".to_string()),
            "brb" => ("◷", "JÁ VOLTO (slate no ar)".to_string()),
            _ => ("…", "conectando".to_string()),
        };
        lines.push(format!("{mark} {} · {detail}", st.name));
    }
    lines.join("\n")
}

/// Atualiza o ícone (só quando a qualidade muda) e o tooltip da bandeja.
fn update_tray(app: &AppHandle, snap: &EngineSnapshot) {
    let Some(tray) = app.tray_by_id("corneta-tray") else {
        return;
    };
    let quality = quality_of(snap);
    let changed = {
        let state = app.state::<AppState>();
        let mut eng = state.engine.lock().unwrap();
        if eng.tray_quality != quality {
            eng.tray_quality = quality.to_string();
            true
        } else {
            false
        }
    };
    if changed {
        let bytes: &[u8] = match quality {
            "good" => include_bytes!("../icons/tray-good.png"),
            "warn" => include_bytes!("../icons/tray-warn.png"),
            "bad" => include_bytes!("../icons/tray-bad.png"),
            _ => include_bytes!("../icons/tray-idle.png"),
        };
        if let Ok(img) = tauri::image::Image::from_bytes(bytes) {
            let _ = tray.set_icon(Some(img));
        }
    }
    let _ = tray.set_tooltip(Some(tray_tooltip(snap)));
}

/// O MediaMTX tem algum publisher ativo? (= o OBS está mandando sinal pra ingestão.)
fn mediamtx_has_publisher() -> bool {
    let body = match ureq::get("http://127.0.0.1:9997/v3/paths/list")
        .timeout(std::time::Duration::from_millis(700))
        .call()
    {
        Ok(r) => r.into_string().unwrap_or_default(),
        Err(_) => return false,
    };
    serde_json::from_str::<serde_json::Value>(&body)
        .ok()
        .and_then(|v| {
            v.get("items").and_then(|i| i.as_array()).map(|arr| {
                arr.iter()
                    .any(|p| p.get("ready").and_then(|r| r.as_bool()) == Some(true))
            })
        })
        .unwrap_or(false)
}

/// Estado da ingestão: (tem publisher pronto, total de bytes recebidos). O byte count
/// distingue OBS no ar de OBS travado/caído — num crash (sem desconexão limpa) o MediaMTX
/// segura o `ready` true por até o readTimeout, mas os bytes param de subir na hora.
fn mediamtx_ingest() -> (bool, u64) {
    let body = match ureq::get("http://127.0.0.1:9997/v3/paths/list")
        .timeout(std::time::Duration::from_millis(700))
        .call()
    {
        Ok(r) => r.into_string().unwrap_or_default(),
        Err(_) => return (false, 0),
    };
    let v: serde_json::Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(_) => return (false, 0),
    };
    let mut ready = false;
    let mut bytes = 0u64;
    if let Some(arr) = v.get("items").and_then(|i| i.as_array()) {
        for p in arr {
            if p.get("ready").and_then(|r| r.as_bool()) == Some(true) {
                ready = true;
                bytes = bytes.max(p.get("bytesReceived").and_then(|b| b.as_u64()).unwrap_or(0));
            }
        }
    }
    (ready, bytes)
}

fn mediamtx_config_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("mediamtx.yml"))
}

/// Caminho do slate "JÁ VOLTO" (PNG gerado pela interface).
fn brb_slate_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("brb-slate.png"))
}

/// Salva o slate "JÁ VOLTO" (PNG em base64) que a UI desenhou.
#[tauri::command]
pub fn save_brb_slate(app: AppHandle, data: String) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.trim())
        .map_err(|e| e.to_string())?;
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("brb-slate.png"), bytes).map_err(|e| e.to_string())?;
    Ok(())
}

/// Captura 1 frame do sinal atual (MediaMTX) como bytes JPEG. Helper reusável
/// (preview do enquadramento + guardião anti-vazamento). `name` = arquivo temp.
pub(crate) async fn grab_frame_named(app: &AppHandle, name: &str) -> Result<Vec<u8>, String> {
    if !mediamtx_has_publisher() {
        return Err("sem sinal — entre ao vivo no OBS pra capturar o frame".into());
    }
    let cfg = get_config(app.clone());
    let ingest = format!(
        "{}://{}:{}/{}/{}",
        cfg.ingest.protocol, cfg.ingest.host, cfg.ingest.port, cfg.ingest.app, cfg.ingest.key
    );
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let out = dir.join(name);
    let args: Vec<String> = vec![
        "-y".into(),
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-rw_timeout".into(),
        "5000000".into(),
        "-i".into(),
        ingest,
        "-frames:v".into(),
        "1".into(),
        "-q:v".into(),
        "3".into(),
        out.to_string_lossy().to_string(),
    ];
    let output = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err("não consegui capturar o frame (sinal instável?)".into());
    }
    std::fs::read(&out).map_err(|e| e.to_string())
}

/// Captura 1 frame como JPEG base64 — pro preview do enquadramento.
#[tauri::command]
pub async fn capture_frame(app: AppHandle) -> Result<String, String> {
    use base64::Engine;
    let bytes = grab_frame_named(&app, "frame.jpg").await?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
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
            let was = st.state.clone();
            let name = st.name.clone();
            st.state = "reconnecting".into();
            let out = snap.clone();
            drop(eng);
            emit(app, &out);
            if was != "reconnecting" {
                notify(app, "Destino caiu", &format!("{name} — reconectando…"));
            }
        }
    }
}

/// Define o estado de UM destino e emite (idempotente). Usado pelo controle de pausa.
fn set_target_state(app: &AppHandle, target_id: &str, new_state: &str) {
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    if let Some(snap) = eng.snapshot.as_mut() {
        if snap.state == "stopped" {
            return;
        }
        if let Some(st) = snap.targets.get_mut(target_id) {
            if st.state == new_state {
                return;
            }
            st.state = new_state.into();
            st.message = None;
            let out = snap.clone();
            drop(eng);
            emit(app, &out);
        }
    }
}

/// Empurra o slate "JÁ VOLTO" pra plataforma até o sinal voltar (ou parar/pausar).
async fn run_slate(
    app: &AppHandle,
    target_id: &str,
    slate_args: &[String],
    run_flag: &std::sync::Arc<std::sync::atomic::AtomicBool>,
    pause_flag: &std::sync::Arc<std::sync::atomic::AtomicBool>,
    signal: &std::sync::Arc<std::sync::atomic::AtomicBool>,
) {
    use std::sync::atomic::Ordering;
    set_target_state(app, target_id, "brb");
    let spawned = app
        .shell()
        .sidecar("ffmpeg")
        .and_then(|c| c.args(slate_args.to_vec()).spawn());
    let (mut rx, child) = match spawned {
        Ok(v) => v,
        Err(e) => {
            log::error!("slate (JÁ VOLTO) não subiu pra {target_id}: {e}");
            set_target_state(app, target_id, "waiting");
            let _ = tauri::async_runtime::spawn_blocking(|| {
                std::thread::sleep(std::time::Duration::from_millis(700))
            })
            .await;
            return;
        }
    };
    {
        let st = app.state::<AppState>();
        st.engine.lock().unwrap().ffmpegs.insert(target_id.to_string(), child);
    }
    // Mantém o slate até o sinal voltar / parar / pausar (checa a cada saída do FFmpeg).
    while let Some(ev) = rx.recv().await {
        if matches!(ev, CommandEvent::Terminated(_)) {
            break;
        }
        if !run_flag.load(Ordering::Relaxed)
            || pause_flag.load(Ordering::Relaxed)
            || signal.load(Ordering::Relaxed)
        {
            break;
        }
    }
    // Derruba o slate (se ainda vivo) e libera o slot.
    let child = {
        let st = app.state::<AppState>();
        let removed = st.engine.lock().unwrap().ffmpegs.remove(target_id);
        removed
    };
    if let Some(c) = child {
        let pid = c.pid();
        let _ = c.kill();
        #[cfg(windows)]
        {
            let _ = quiet_command("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .output();
        }
        #[cfg(not(windows))]
        {
            let _ = pid;
        }
    }
}

/// Mata sidecars (ffmpeg/mediamtx do Corneta) ÓRFÃOS de sessões que não morreram direito
/// (app fechado à força, crash). Eles SEGURAM PORTAS — sobretudo a zmq 5555 do protetor e a
/// 1935 do MediaMTX — e fazem o boot falhar em loop ("a live nunca fica online"). O nome do
/// binário tem o sufixo do target-triple (único do Corneta), então matar por nome é seguro.
fn kill_orphan_sidecars() {
    let triple = tauri::utils::platform::target_triple()
        .unwrap_or_else(|_| "x86_64-pc-windows-msvc".into());
    #[cfg(windows)]
    for base in ["ffmpeg", "mediamtx"] {
        let _ = quiet_command("taskkill")
            .args(["/F", "/IM", &format!("{base}-{triple}.exe")])
            .output();
    }
    #[cfg(not(windows))]
    for base in ["ffmpeg", "mediamtx"] {
        let _ = quiet_command("pkill")
            .args(["-f", &format!("{base}-{triple}")])
            .output();
    }
}

/// Testa qual encoder de hardware REALMENTE funciona (codifica 2 frames de uma cor sólida).
/// O `-encoders` lista nvenc/qsv/amf no build do BtbN mesmo SEM a GPU, então só o teste real
/// confirma. O protetor usa isso pra rodar na GPU (CPU ~zero) e acompanhar o tempo real —
/// senão o MediaMTX derruba o leitor lento e a live cai.
async fn detect_hw_encoder(app: &AppHandle) -> Option<String> {
    for codec in ["h264_nvenc", "h264_qsv", "h264_amf", "h264_videotoolbox"] {
        let Ok(cmd) = app.shell().sidecar("ffmpeg") else {
            continue;
        };
        // 1280x720 (NÃO 128x128!): NVENC/QSV têm resolução MÍNIMA — um teste pequeno demais
        // falha mesmo com a GPU presente (falso negativo → cai no libx264 → CPU estoura → live cai).
        let res = cmd
            .args([
                "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                "color=c=black:s=1280x720:r=30", "-frames:v", "3", "-c:v", codec, "-f", "null", "-",
            ])
            .output()
            .await;
        if matches!(res, Ok(ref o) if o.status.success()) {
            log::info!("protetor: encoder de hardware {codec} OK");
            return Some(codec.to_string());
        }
    }
    log::info!("protetor: sem encoder de hardware — libx264 ultrafast");
    None
}

#[tauri::command]
pub async fn start_engine(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    if state.engine.lock().unwrap().running.load(Ordering::Relaxed) {
        return Err("já está no ar.".into());
    }
    kill_orphan_sidecars();

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
    // Sinal de ingestão: true quando o OBS está publicando no MediaMTX.
    let has_signal = Arc::new(AtomicBool::new(false));
    // Já teve sinal ao menos uma vez nesta sessão? (slate "JÁ VOLTO" só vale em QUEDAS.)
    let signal_seen = Arc::new(AtomicBool::new(false));
    let session_path = session::start_session(&app, &config);
    chat::MSG_COUNT.store(0, Ordering::Relaxed); // taxa de chat começa do zero na sessão
    // Uma flag de pausa por destino (controle ao vivo).
    let pause_flags: HashMap<String, Arc<AtomicBool>> = enabled
        .iter()
        .map(|t| (t.id.clone(), Arc::new(AtomicBool::new(false))))
        .collect();
    {
        let mut eng = state.engine.lock().unwrap();
        eng.mediamtx = Some(mtx_child);
        eng.snapshot = Some(snap.clone());
        eng.started_ms = started;
        eng.running = running.clone();
        eng.session_path = session_path;
        eng.paused = pause_flags.clone();
    }
    emit(&app, &snap);

    // Guardião de privacidade: só roda se LIGADO e com termos válidos (sem termos = não faz nada).
    let guard_watchlist: Vec<String> = config
        .settings
        .guardian_watchlist
        .iter()
        .map(|t| t.trim().to_string())
        .filter(|t| t.chars().count() >= 3)
        .collect();
    let guard = config.settings.guardian_enabled && !guard_watchlist.is_empty();
    log::info!("motor: iniciando — MediaMTX (ingestão) + FFmpeg fan-out");

    // 2) Leitor do MediaMTX: detecta erro fatal (porta de ingestão em uso).
    let app_m = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(ev) = mtx_rx.recv().await {
            if let CommandEvent::Stdout(b) | CommandEvent::Stderr(b) = ev {
                let raw = String::from_utf8_lossy(&b);
                let line = raw.to_lowercase();
                if line.contains("address already in use") {
                    set_engine_error(&app_m, "A porta de ingestão já está em uso. Feche o que estiver usando a porta 1935.");
                }
                // Diagnóstico: ciclo de vida do publisher (OBS) + quedas. Sem o ruído dos grabs.
                if line.contains("publish")
                    || line.contains("available")
                    || line.contains("online")
                    || line.contains("destroyed")
                    || line.contains("queue")
                    || line.contains("too slow")
                    || line.contains("timed out")
                    || (line.contains("err") && !line.contains("address already"))
                {
                    log::warn!("mediamtx: {}", raw.trim());
                }
            }
        }
    });

    // 2b) Poller do sinal de ingestão (API do MediaMTX): há publisher (OBS no ar)?
    let run_sig = running.clone();
    let sig = has_signal.clone();
    let seen_sig = signal_seen.clone();
    tauri::async_runtime::spawn_blocking(move || {
        // Sinal vivo = publisher pronto E bytes subindo. Dois polls sem fluxo (~1.4s) = caiu,
        // mesmo que o MediaMTX ainda mostre `ready` (crash do OBS segura o ready por ~20s).
        let mut last_bytes = 0u64;
        let mut stalls = 0u32;
        while run_sig.load(Ordering::Relaxed) {
            let (ready, bytes) = mediamtx_ingest();
            let flowing = bytes != last_bytes; // qualquer mudança (sobe ou reseta) = atividade
            last_bytes = bytes;
            if ready && flowing {
                stalls = 0;
            } else {
                stalls = stalls.saturating_add(1);
            }
            let live = ready && stalls < 2;
            sig.store(live, Ordering::Relaxed);
            if live {
                seen_sig.store(true, Ordering::Relaxed);
            }
            std::thread::sleep(std::time::Duration::from_millis(700));
        }
    });

    // 3) Um supervisor de FFmpeg POR destino — métricas reais e reconexão independentes.
    let brb_enabled = config.settings.brb_enabled;
    let auto_bitrate = config.settings.auto_bitrate;
    let slate_png: Option<String> = brb_slate_path(&app)
        .filter(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string());

    // GUARDIÃO com BUFFER PRÓPRIO (compositor): segura o vídeo N segundos no nosso processo e, na
    // SAÍDA, troca pelo slate "JÁ VOLTO" quando um termo do usuário aparece → preventivo garantido.
    // As saídas leem o `_delayed` (genuinamente N atrás). Delay FIXO. Sem guardião → leem o `live`.
    let delay_sec = if guard { engine::GUARD_DELAY_SEC } else { 0 };
    let protect = guard;
    let out_source = if protect {
        engine::delayed_url(&config)
    } else {
        engine::ingest_url(&config)
    };
    log::info!(
        "motor: guardião={protect} delay={delay_sec}s saídas-leem={}",
        if protect { "_delayed" } else { "live" }
    );
    if protect {
        let hw = detect_hw_encoder(&app).await;
        let (app_c, run_c, sig_c) = (app.clone(), running.clone(), has_signal.clone());
        tauri::async_runtime::spawn(async move {
            crate::guardian::run_guard(app_c, run_c, sig_c, hw, guard_watchlist).await;
        });
    }

    for &t in &enabled {
        let key = keymap.get(&t.id).cloned().unwrap_or_default();
        let slate_args = engine::ffmpeg_args_for_slate(t, &key, slate_png.as_deref());
        let cfg = config.clone();
        let target = t.clone();
        let is_transcode = engine::effective_action(&config.mode, t) == "transcode";
        let base_kbps = t
            .encoding
            .preset
            .as_ref()
            .map(|p| p.video_bitrate_kbps)
            .unwrap_or_else(|| engine::recommended_preset(&t.platform_id).video_bitrate_kbps);
        let floor_kbps = ((base_kbps as f64 * 0.4) as u32).max(800);
        let target_id = t.id.clone();
        let target_name = t.name.clone();
        let app_t = app.clone();
        let run_flag = running.clone();
        let pause_flag = pause_flags.get(&t.id).cloned().unwrap_or_default();
        let signal = has_signal.clone();
        let seen = signal_seen.clone();
        let out_source = out_source.clone();
        tauri::async_runtime::spawn(async move {
            let mut current_kbps = base_kbps;
            while run_flag.load(Ordering::Relaxed) {
                // (A censura agora é feita pelo "protetor" via zmq — sem trocar este FFmpeg.)
                // Pausado: não sobe FFmpeg, mantém o estado "paused" e espera.
                if pause_flag.load(Ordering::Relaxed) {
                    set_target_state(&app_t, &target_id, "paused");
                    let _ = tauri::async_runtime::spawn_blocking(|| {
                        std::thread::sleep(std::time::Duration::from_millis(300))
                    })
                    .await;
                    continue;
                }

                // Sem sinal de ingestão: empurra o slate "JÁ VOLTO" — mas só se JÁ houve sinal
                // antes (proteção contra QUEDAS). No começo, sem ingestão ainda, só aguarda.
                if !signal.load(Ordering::Relaxed) {
                    if brb_enabled && seen.load(Ordering::Relaxed) {
                        run_slate(&app_t, &target_id, &slate_args, &run_flag, &pause_flag, &signal)
                            .await;
                    } else {
                        set_target_state(&app_t, &target_id, "waiting");
                        let _ = tauri::async_runtime::spawn_blocking(|| {
                            std::thread::sleep(std::time::Duration::from_millis(700))
                        })
                        .await;
                    }
                    continue;
                }

                // Com sinal: FFmpeg normal (lê do MediaMTX → plataforma) no bitrate atual.
                let args =
                    engine::ffmpeg_args_for_target(&cfg, &target, &key, Some(current_kbps), &out_source);
                let spawned = app_t
                    .shell()
                    .sidecar("ffmpeg")
                    .and_then(|c| c.args(args).spawn());
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
                let mut low = 0u32;
                let mut stable = 0u32;
                let mut rebitrate = false;
                let mut signal_lost = false;
                // Cão de guarda: tica a cada 250ms. Se o sinal caiu, mata este FFmpeg NA HORA —
                // senão ele segura a conexão da plataforma faminta (input morto) e a live cai.
                // O slate "JÁ VOLTO" entra logo em seguida (topo do laço, com !signal).
                let mut watchdog = tokio::time::interval(std::time::Duration::from_millis(250));
                watchdog.tick().await; // descarta o tick imediato inicial
                loop {
                    tokio::select! {
                        ev = rx.recv() => {
                            let Some(ev) = ev else { break };
                            match ev {
                                CommandEvent::Stdout(b) | CommandEvent::Stderr(b) => {
                                    let line = String::from_utf8_lossy(&b);
                                    update_target_metrics(
                                        &app_t,
                                        &target_id,
                                        &line,
                                        signal.load(Ordering::Relaxed),
                                    );
                                    // Auto-bitrate: vigia a velocidade do FFmpeg (só em transcode).
                                    if auto_bitrate && is_transcode {
                                        if let Some(speed) = parse_kv(&line, "speed=") {
                                            if speed < 0.9 {
                                                low += 1;
                                                stable = 0;
                                            } else {
                                                low = 0;
                                                stable += 1;
                                            }
                                            if low >= 8 && current_kbps > floor_kbps {
                                                current_kbps =
                                                    ((current_kbps as f64 * 0.75) as u32).max(floor_kbps);
                                                notify(
                                                    &app_t,
                                                    "Banda apertou",
                                                    &format!("{target_name}: baixei o bitrate pra {current_kbps} kbps"),
                                                );
                                                rebitrate = true;
                                                break;
                                            } else if stable >= 60 && current_kbps < base_kbps {
                                                current_kbps =
                                                    ((current_kbps as f64 * 1.2) as u32).min(base_kbps);
                                                log::info!(
                                                    "auto-bitrate: {target_name} subindo pra {current_kbps} kbps"
                                                );
                                                rebitrate = true;
                                                break;
                                            }
                                        }
                                    }
                                }
                                CommandEvent::Terminated(_) => break,
                                _ => {}
                            }
                        }
                        _ = watchdog.tick() => {
                            if !signal.load(Ordering::Relaxed) && !pause_flag.load(Ordering::Relaxed) {
                                signal_lost = true;
                                break;
                            }
                        }
                    }
                }
                // Remove o FFmpeg do mapa (e mata, se saiu por troca de bitrate).
                let leftover = {
                    let st = app_t.state::<AppState>();
                    let removed = st.engine.lock().unwrap().ffmpegs.remove(&target_id);
                    removed
                };
                if rebitrate || signal_lost {
                    if let Some(c) = leftover {
                        let pid = c.pid();
                        let _ = c.kill();
                        #[cfg(windows)]
                        {
                            let _ = quiet_command("taskkill")
                                .args(["/PID", &pid.to_string(), "/T", "/F"])
                                .output();
                        }
                        #[cfg(not(windows))]
                        {
                            let _ = pid;
                        }
                    }
                }
                if !run_flag.load(Ordering::Relaxed) {
                    break;
                }
                if pause_flag.load(Ordering::Relaxed) {
                    continue;
                }
                // Troca de bitrate: respawna já com o novo valor, sem espera de reconexão.
                if rebitrate {
                    continue;
                }
                // Sinal sumiu enquanto rodava → volta ao topo (slate ou waiting).
                if !signal.load(Ordering::Relaxed) {
                    continue;
                }
                // Sinal presente, mas o FFmpeg caiu → reconexão real.
                log::warn!("FFmpeg de um destino caiu — reconectando em 2s");
                set_target_reconnecting(&app_t, &target_id);
                let _ = tauri::async_runtime::spawn_blocking(|| {
                    std::thread::sleep(std::time::Duration::from_secs(2))
                })
                .await;
            }
        });
    }

    // 4) Amostrador de uso real de CPU/GPU enquanto transmite.
    let app_u = app.clone();
    let run_u = running.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut sys = sysinfo::System::new();
        let mut gpu_ok = true;
        while run_u.load(Ordering::Relaxed) {
            sys.refresh_cpu_usage();
            std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
            sys.refresh_cpu_usage();
            let cpu = sys.global_cpu_usage() as f64;
            let gpu = if gpu_ok {
                let g = read_gpu();
                if g.is_none() {
                    gpu_ok = false;
                }
                g
            } else {
                None
            };
            update_usage(&app_u, cpu, gpu);
            std::thread::sleep(std::time::Duration::from_secs(2));
        }
    });

    // 5) Coletor de stats do OBS (melhor-esforço): render/encode lag + congestionamento.
    let app_o = app.clone();
    let run_o = running.clone();
    let obs_pw = config.settings.obs_password.clone();
    tauri::async_runtime::spawn_blocking(move || {
        // Religa sozinho se a conexão cair, enquanto o motor estiver no ar.
        while run_o.load(Ordering::Relaxed) {
            crate::obs::poll_stats("127.0.0.1", 4455, &obs_pw, &run_o, |stats| {
                update_obs_stats(&app_o, stats);
            });
            for _ in 0..25 {
                if !run_o.load(Ordering::Relaxed) {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(200));
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

/// Pausa/retoma UM destino ao vivo (sem derrubar os outros).
#[tauri::command]
pub fn set_target_paused(app: AppHandle, target_id: String, paused: bool) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    let state = app.state::<AppState>();

    // Mata o FFmpeg desse destino FORA do lock (taskkill bloqueia); o supervisor vê a flag e não respawna.
    let child = {
        let mut eng = state.engine.lock().unwrap();
        match eng.paused.get(&target_id) {
            Some(flag) => flag.store(paused, Ordering::Relaxed),
            None => return Err("destino não está ao vivo".into()),
        }
        if paused {
            eng.ffmpegs.remove(&target_id)
        } else {
            None
        }
    };

    if let Some(child) = child {
        let pid = child.pid();
        let _ = child.kill();
        #[cfg(windows)]
        {
            let _ = quiet_command("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .output();
        }
        #[cfg(not(windows))]
        {
            let _ = pid;
        }
    }

    // Estado otimista (o supervisor confirma na sequência).
    let out = {
        let mut eng = state.engine.lock().unwrap();
        eng.snapshot.as_mut().map(|snap| {
            if let Some(st) = snap.targets.get_mut(&target_id) {
                st.state = if paused { "paused" } else { "connecting" }.into();
                st.message = None;
            }
            snap.clone()
        })
    };
    if let Some(out) = out {
        emit(&app, &out);
    }
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
fn update_target_metrics(app: &AppHandle, target_id: &str, line: &str, has_signal: bool) {
    let is_stats = line.contains("frame=") || line.contains("bitrate=");
    const ERR_KEYS: [&str; 8] = [
        "error", "failed", "connection refused", "broken pipe",
        "unable to", "connection reset", "i/o error", "end of file",
    ];
    let low = if is_stats { String::new() } else { line.to_lowercase() };
    let is_error = !is_stats && ERR_KEYS.iter().any(|k| low.contains(k));
    if !is_stats && !is_error {
        return;
    }

    let fps = parse_kv(line, "fps=").map(|v| v as u32);
    let bitrate = parse_kv(line, "bitrate=").map(|v| v as u32); // kbits/s ≈ kbps
    let dropped = parse_kv(line, "drop=").map(|v| v as u32);

    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    let was_starting = matches!(eng.snapshot.as_ref().map(|s| s.state.as_str()), Some("starting"));
    // O cronômetro "no ar" começa quando o sinal real chega — não no clique de BORA.
    if is_stats && was_starting {
        eng.started_ms = now_ms();
    }
    let started = eng.started_ms;
    let last_emit = eng.last_emit_ms;
    let Some(snap) = eng.snapshot.as_mut() else {
        return;
    };
    let Some(st) = snap.targets.get_mut(target_id) else {
        return;
    };
    let prev_target = st.state.clone();
    let name = st.name.clone();
    let mut err_msg = None;

    if is_stats {
        if was_starting {
            snap.started_at = Some(started);
        }
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
    } else if !has_signal {
        // OBS ainda não publicou: é falta de sinal, não erro do destino.
        st.state = "waiting".into();
        st.message = None;
    } else {
        let (estate, msg) = friendly_error(&low);
        st.state = estate.into();
        if estate == "error" {
            err_msg = Some(msg.clone());
        }
        st.message = Some(msg);
    }

    let new_state = st.state.clone();
    // Throttle: transição de estado emite na hora; atualização de métrica pura, no
    // máximo a cada ~250ms (evita N emits/s do snapshot inteiro com vários destinos).
    let now = now_ms();
    let should_emit =
        new_state != prev_target || was_starting || now.saturating_sub(last_emit) >= 250;
    let out = if should_emit { Some(snap.clone()) } else { None };
    if should_emit {
        eng.last_emit_ms = now;
    }
    drop(eng);
    if let Some(out) = out {
        emit(app, &out);
    }

    if is_stats && was_starting {
        notify(app, "Corneta no ar 📣", "Sua transmissão começou.");
    } else if let Some(msg) = err_msg {
        if prev_target != "error" {
            notify(app, "Destino com erro", &format!("{name}: {msg}"));
        }
    }
}

/// Lê a utilização da GPU NVIDIA (%) via nvidia-smi. None se não houver NVIDIA.
fn read_gpu() -> Option<f64> {
    let out = quiet_command("nvidia-smi")
        .args(["--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .next()?
        .trim()
        .parse::<f64>()
        .ok()
}

/// Atualiza CPU/GPU no snapshot e emite (chamado pelo amostrador).
fn update_usage(app: &AppHandle, cpu: f64, gpu: Option<f64>) {
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    let Some(snap) = eng.snapshot.as_mut() else {
        return;
    };
    if snap.state == "stopped" {
        return;
    }
    snap.cpu = Some((cpu * 10.0).round() / 10.0);
    snap.gpu = gpu.map(|g| (g * 10.0).round() / 10.0);
    let out = snap.clone();
    let session = eng.session_path.clone();
    drop(eng);
    emit(app, &out);
    // Grava a amostra desta janela (~2s) no NDJSON, com a taxa de chat (lê+zera o contador).
    if let Some(path) = session {
        let chat = chat::MSG_COUNT.swap(0, std::sync::atomic::Ordering::Relaxed);
        session::record_sample(&path, &out, chat);
    }
}

/// Atualiza as stats do OBS no snapshot (o amostrador de CPU emite/grava na sequência).
fn update_obs_stats(app: &AppHandle, stats: engine::ObsStats) {
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    if let Some(snap) = eng.snapshot.as_mut() {
        if snap.state != "stopped" {
            snap.obs = Some(stats);
        }
    }
}

/// Para o supervisor e mata FFmpeg + MediaMTX (e suas árvores), zerando o estado (§14.2).
pub fn kill_engine(app: &AppHandle) {
    use std::sync::atomic::Ordering;
    log::info!("motor: encerrando");
    let state = app.state::<AppState>();
    let (children, running, session_path) = {
        let mut eng = state.engine.lock().unwrap();
        eng.snapshot = Some(EngineSnapshot::stopped());
        eng.paused.clear();
        let session_path = eng.session_path.take();
        let mut children: Vec<tauri_plugin_shell::process::CommandChild> =
            eng.ffmpegs.drain().map(|(_, c)| c).collect();
        if let Some(m) = eng.mediamtx.take() {
            children.push(m);
        }
        (children, eng.running.clone(), session_path)
    };
    // Impede os supervisores de respawnar.
    running.store(false, Ordering::Relaxed);

    for child in children {
        let pid = child.pid();
        let _ = child.kill();
        // Mata eventuais subprocessos (netos órfãos) — Windows-first.
        #[cfg(windows)]
        {
            let _ = quiet_command("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .output();
        }
        #[cfg(not(windows))]
        {
            let _ = pid; // em Unix, child.kill() já encerra; árvore tratada no futuro
        }
    }
    // Fecha a gravação da sessão (relatório pós-live).
    if let Some(path) = session_path {
        session::end_session(&path);
    }
    emit(app, &EngineSnapshot::stopped());
}

// --------------------- Relatórios (pós-live) ----------------------

#[tauri::command]
pub fn list_sessions(app: AppHandle) -> Vec<session::SessionMeta> {
    session::list_sessions(&app)
}

#[tauri::command]
pub fn read_session(app: AppHandle, id: String) -> Result<String, String> {
    session::read_session(&app, &id).ok_or_else(|| "sessão não encontrada".to_string())
}

#[tauri::command]
pub fn delete_session(app: AppHandle, id: String) -> Result<(), String> {
    session::delete_session(&app, &id);
    Ok(())
}

#[tauri::command]
pub fn open_sessions_dir(app: AppHandle) -> Result<(), String> {
    let dir = session::sessions_dir(&app).ok_or("pasta de sessões indisponível")?;
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer").arg(&dir).spawn();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("xdg-open").arg(&dir).spawn();
    }
    Ok(())
}

// ------------------------- Chat unificado -------------------------

#[tauri::command]
pub fn chat_start(app: AppHandle) {
    chat::start_chat(&app);
}

#[tauri::command]
pub fn chat_stop(app: AppHandle) {
    chat::stop_chat(&app);
}

#[tauri::command]
pub fn alerts_start(app: AppHandle) {
    crate::alerts::start_alerts(&app);
}

#[tauri::command]
pub fn alerts_stop(app: AppHandle) {
    crate::alerts::stop_alerts(&app);
}

/// Abre (ou foca) a janela flutuante só do chat (always-on-top), pro streamer
/// deixar num canto/segundo monitor sem o app inteiro.
// IMPORTANTE: precisa ser ASYNC. Criar um webview a partir de um comando SÍNCRONO
// trava no Windows (o comando roda na thread principal e o build espera o event-loop
// dela → deadlock: janela em branco/inerte). Async roda fora da thread principal.
#[tauri::command]
pub async fn open_chat_window(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("chat") {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(
        &app,
        "chat",
        tauri::WebviewUrl::App("chat.html".into()),
    )
    .title("Corneta — Chat")
    .inner_size(380.0, 600.0)
    .min_inner_size(300.0, 360.0)
    .resizable(true)
    .always_on_top(true)
    .decorations(false) // borda/titlebar custom (igual a janela principal)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ------------------- UX: OBS junto, testes, atalhos, logs -------------------

/// Liga/desliga a transmissão no OBS junto com o BORA AO VIVO (melhor-esforço).
#[tauri::command]
pub async fn obs_set_stream(app: AppHandle, start: bool) -> Result<(), String> {
    let password = get_config(app).settings.obs_password;
    tauri::async_runtime::spawn_blocking(move || {
        crate::obs::set_stream("127.0.0.1", 4455, &password, start)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

/// Testa o ALCANCE do servidor de ingestão (TCP). Não valida a chave — só uma live real valida.
fn tcp_reach(ingest_url: &str) -> Result<String, String> {
    if ingest_url.starts_with("srt") {
        return Ok("SRT (UDP) — teste de alcance indisponível".into());
    }
    let after = ingest_url.split("://").nth(1).unwrap_or(ingest_url);
    let hostport = after.split('/').next().unwrap_or("");
    let (host, port) = match hostport.rsplit_once(':') {
        Some((h, p)) => (h.to_string(), p.parse::<u16>().unwrap_or(1935)),
        None => {
            let default = if ingest_url.starts_with("rtmps") { 443 } else { 1935 };
            (hostport.to_string(), default)
        }
    };
    if host.is_empty() {
        return Err("URL de ingestão inválida".into());
    }
    use std::net::ToSocketAddrs;
    let addr = format!("{host}:{port}")
        .to_socket_addrs()
        .map_err(|_| format!("não resolvi {host}"))?
        .next()
        .ok_or_else(|| format!("endereço não resolvido: {host}"))?;
    match std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_secs(5)) {
        Ok(_) => Ok(format!("{host} respondeu")),
        Err(_) => Err(format!("sem resposta de {host}:{port} — confira a URL/rede")),
    }
}

#[tauri::command]
pub async fn test_target(app: AppHandle, target_id: String) -> Result<String, String> {
    let cfg = get_config(app);
    let t = cfg
        .targets
        .into_iter()
        .find(|t| t.id == target_id)
        .ok_or("destino não encontrado")?;
    let url = t.ingest_url;
    tauri::async_runtime::spawn_blocking(move || tcp_reach(&url))
        .await
        .map_err(|e| format!("join: {e}"))?
}

#[tauri::command]
pub fn open_logs_dir(app: AppHandle) -> Result<(), String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    let _ = std::fs::create_dir_all(&dir);
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer").arg(&dir).spawn();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("xdg-open").arg(&dir).spawn();
    }
    Ok(())
}

/// (Re)registra o atalho global de começar/parar.
#[tauri::command]
pub fn register_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let sc = shortcut.trim();
    if !sc.is_empty() {
        gs.register(sc).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Check-up do OBS (acessível? apontando pra Corneta? resolução/fps).
#[tauri::command]
pub async fn obs_check(app: AppHandle) -> Result<crate::obs::ObsCheck, String> {
    let cfg = get_config(app);
    let server = format!(
        "{}://{}:{}/{}",
        cfg.ingest.protocol, cfg.ingest.host, cfg.ingest.port, cfg.ingest.app
    );
    let password = cfg.settings.obs_password;
    tauri::async_runtime::spawn_blocking(move || crate::obs::check("127.0.0.1", 4455, &password, &server))
        .await
        .map_err(|e| format!("join: {e}"))
}

// ------------------------------- Mesa (co-stream P2P) -------------------------------

/// Nome do Browser Source que a Mesa cria/atualiza no OBS.
const MESA_OBS_SOURCE: &str = "Corneta · Mesa";

/// Sobe (ou reaproveita) o servidor local da Mesa: HTTP da página de estúdio + relay de
/// sinalização WebRTC. Devolve porta + IP da LAN pra montar o convite.
#[tauri::command]
pub async fn mesa_start_server(
    state: State<'_, AppState>,
) -> Result<crate::studio::MesaServerInfo, String> {
    crate::studio::start(&state.studio).await
}

/// Encerra o servidor local da Mesa (fecha conexões vivas e libera a porta).
#[tauri::command]
pub fn mesa_stop_server(state: State<'_, AppState>) {
    crate::studio::stop(&state.studio);
}

/// Adiciona (ou atualiza) o Browser Source da Mesa na cena atual do OBS.
#[tauri::command]
pub async fn mesa_obs_add_source(app: AppHandle, url: String, width: u32, height: u32) -> Result<(), String> {
    let password = get_config(app).settings.obs_password;
    tauri::async_runtime::spawn_blocking(move || {
        crate::obs::add_or_update_browser_source("127.0.0.1", 4455, &password, MESA_OBS_SOURCE, &url, width, height)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

/// Remove o Browser Source da Mesa do OBS (limpeza ao encerrar).
#[tauri::command]
pub async fn mesa_obs_remove_source(app: AppHandle) -> Result<(), String> {
    let password = get_config(app).settings.obs_password;
    tauri::async_runtime::spawn_blocking(move || {
        crate::obs::remove_input("127.0.0.1", 4455, &password, MESA_OBS_SOURCE)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

/// Abre as Configurações de Privacidade do Windows (câmera/mic) quando o getUserMedia
/// falha por causa do bloqueio do SO (que o handler do WebView2 não consegue cobrir).
/// Vai pelo Rust porque o open() do plugin-shell no JS é barrado pelo escopo padrão.
#[tauri::command]
pub fn open_privacy_settings(app: AppHandle, which: String) -> Result<(), String> {
    let uri = match which.as_str() {
        "camera" => "ms-settings:privacy-webcam",
        "microphone" => "ms-settings:privacy-microphone",
        _ => return Err("configuração desconhecida".into()),
    };
    #[allow(deprecated)]
    app.shell().open(uri, None).map_err(|e| e.to_string())
}

/// Crava um marcador na sessão em gravação (relatório pós-live).
#[tauri::command]
pub fn mark_moment(app: AppHandle, label: Option<String>) -> Result<(), String> {
    let st = app.state::<AppState>();
    let path = st.engine.lock().unwrap().session_path.clone();
    match path {
        Some(p) => {
            session::record_marker(&p, label.as_deref().unwrap_or("Momento"));
            Ok(())
        }
        None => Err("não está gravando uma sessão".into()),
    }
}

/// Exporta a config (perfis/ajustes — sem chaves) num arquivo escolhido pelo usuário.
#[tauri::command]
pub fn export_config(app: AppHandle) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    let mut cfg = config::load(&app);
    cfg.settings.obs_password = String::new();
    cfg.settings.youtube_api_key = String::new();
    let json = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    match app
        .dialog()
        .file()
        .add_filter("Config da Corneta", &["json"])
        .set_file_name("corneta-config.json")
        .blocking_save_file()
    {
        Some(p) => {
            let pb = p.into_path().map_err(|e| e.to_string())?;
            std::fs::write(pb, json).map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => Ok(false),
    }
}

/// Importa a config de um arquivo (substitui perfis/ajustes).
#[tauri::command]
pub fn import_config(app: AppHandle) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(p) = app
        .dialog()
        .file()
        .add_filter("Config da Corneta", &["json"])
        .blocking_pick_file()
    else {
        return Ok(false);
    };
    let pb = p.into_path().map_err(|e| e.to_string())?;
    let content = std::fs::read_to_string(pb).map_err(|e| e.to_string())?;
    let cfg: AppConfig = serde_json::from_str(&content).map_err(|e| format!("config inválida: {e}"))?;
    config::save(&app, &cfg)?;
    Ok(true)
}
