//! Comandos expostos ao frontend (invoke) + supervisão do sidecar FFmpeg.
use crate::chat;
use crate::config::{self, AppConfig};
use crate::engine::{self, EngineSnapshot};
use crate::engine_policy::{
    brb_slate_is_video, friendly_error, is_brb_slate_path, parse_ingest_hostport, parse_kv,
    parse_mediamtx_paths, quality_of, tray_tooltip,
};
use crate::http_client as ureq;
use crate::i18n::Msg;
use crate::keys;
use crate::recorder;
use crate::session;
use crate::telemetry::{self, AppError};
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn build_diagnostic_report(
    version: &str,
    os: &str,
    arch: &str,
    config: &AppConfig,
    telemetry_summary: &serde_json::Value,
) -> Result<String, String> {
    // O arquivo compartilhável nasce exclusivamente de estruturas allowlisted.
    // Logs são texto livre e ficam fora deste caminho; a inspeção local continua
    // disponível pelo comando separado `open_logs_dir`.
    let safe_config = telemetry::diagnostic_config_summary(config);
    let config = serde_json::to_string_pretty(&safe_config).map_err(|error| error.to_string())?;
    let mut report = Msg::DiagReportHeader {
        version,
        os,
        arch,
        config: &config,
    }
    .now();
    report.push_str("\n--- telemetry-and-operations.json ---\n");
    report.push_str(
        &serde_json::to_string_pretty(telemetry_summary).map_err(|error| error.to_string())?,
    );
    report.push('\n');
    Ok(report)
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

/// Endereço padrão do obs-websocket (o OBS abre o servidor em 127.0.0.1:4455).
const OBS_WS_HOST: &str = "127.0.0.1";
const OBS_WS_PORT: u16 = 4455;

/// Código devolvido quando o próprio usuário cancelou o início da live.
///
/// É CÓDIGO, não mensagem: o front compara este valor pra engolir o toast de
/// erro (quem cancelou sabe o que fez). Enquanto isto era a frase
/// "Início cancelado.", traduzir o backend quebrava a comparação em silêncio —
/// e o cancelamento voltava a aparecer como falha. O texto que a pessoa lê vive
/// no dicionário do front, com o resto da copy.
pub const START_CANCELLED: &str = "corneta:start-cancelled";

fn current_operation_id(app: &AppHandle) -> Option<String> {
    app.state::<AppState>()
        .engine
        .lock()
        .unwrap()
        .operation_id
        .clone()
}

#[track_caller]
fn capture_native_error(
    app: &AppHandle,
    code: &str,
    stage: &str,
    retryable: bool,
    source: Option<String>,
) -> String {
    let operation_id = current_operation_id(app);
    app.state::<AppState>().telemetry.capture_error(
        AppError::new(code, stage, retryable, source),
        operation_id.as_deref(),
        true,
        "error",
    )
}

/// Captura uma causa terminal do motor e memoriza o issue para que o wrapper de
/// BORA devolva exatamente o mesmo ID, sem abrir uma exceção genérica duplicada.
#[track_caller]
fn capture_engine_error(
    app: &AppHandle,
    code: &str,
    stage: &str,
    retryable: bool,
    source: Option<String>,
) -> String {
    let operation_id = current_operation_id(app);
    let error_id = app.state::<AppState>().telemetry.capture_error(
        AppError::new(code, stage, retryable, source),
        operation_id.as_deref(),
        true,
        "error",
    );
    let state = app.state::<AppState>();
    let mut engine = state.engine.lock().unwrap();
    engine.telemetry_last_error_id = Some(error_id.clone());
    engine.telemetry_last_error_operation_id = operation_id;
    error_id
}

fn telemetry_platform(value: &str) -> &'static str {
    match value {
        "twitch" => "twitch",
        "youtube" => "youtube",
        "facebook" => "facebook",
        "kick" => "kick",
        "tiktok" => "tiktok",
        "x" => "x",
        "instagram" => "instagram",
        _ => "custom",
    }
}

fn telemetry_encoder_kind(config: &AppConfig) -> String {
    if config.mode == "passthrough" {
        return "copy".into();
    }
    let mut encoders: std::collections::HashSet<&str> = config
        .targets
        .iter()
        .filter(|target| target.enabled)
        .map(|target| match target.encoding.encoder.as_str() {
            "auto" | "nvenc" | "qsv" | "amf" | "videotoolbox" | "software" => {
                target.encoding.encoder.as_str()
            }
            _ => "unknown",
        })
        .collect();
    if encoders.len() == 1 {
        encoders.drain().next().unwrap_or("unknown").into()
    } else {
        "mixed".into()
    }
}

fn capture_target_transition(
    app: &AppHandle,
    target_id: &str,
    from: &str,
    to: &str,
    error_code: Option<&str>,
) {
    let (operation_id, platform) = {
        let state = app.state::<AppState>();
        let engine = state.engine.lock().unwrap();
        (
            engine.operation_id.clone(),
            engine.target_platforms.get(target_id).cloned(),
        )
    };
    if let Some(platform) = platform {
        app.state::<AppState>().telemetry.capture_target_transition(
            operation_id.as_deref(),
            &platform,
            from,
            to,
            error_code,
        );
    }
}

/// Mata um sidecar (FFmpeg/MediaMTX) e seus netos órfãos — `taskkill /T /F` no Windows, onde
/// `child.kill()` sozinho não leva a árvore junto. Fonte ÚNICA do encerramento de processo.
pub(crate) fn kill_child_tree(child: tauri_plugin_shell::process::CommandChild) {
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
    for c in cfg.settings.chat_sources.iter_mut() {
        c.has_send_token = keys::has_key(&format!("chat_send_{}", c.id));
    }
    cfg
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: AppConfig) -> Result<AppConfig, String> {
    let mut config = config.validate_and_normalize()?;
    let disk_revision = config::load(&app).revision;
    if config.revision < disk_revision {
        return Err(Msg::ConfigSaveStaleRevision.now());
    }
    config.revision = disk_revision.saturating_add(1);
    config::save(&app, &config)?;
    // Sincroniza as OUTRAS janelas (o popout do chat é outro webview, com store zustand próprio):
    // sem isto, cada janela persistia sua cópia inteira do AppConfig e revertia em disco as
    // mudanças da outra. Cada janela reassina `config://changed` e atualiza a base SEM re-persistir.
    let _ = app.emit("config://changed", &config);
    Ok(config)
}

// ----------------------------- Cofre ------------------------------

fn secret_namespace_exists(config: &AppConfig, namespace: &str) -> bool {
    config.targets.iter().any(|target| target.id == namespace)
        || namespace.strip_prefix("alert_").is_some_and(|id| {
            config
                .settings
                .alert_sources
                .iter()
                .any(|source| source.id == id)
        })
        || namespace.strip_prefix("chat_send_").is_some_and(|id| {
            config
                .settings
                .chat_sources
                .iter()
                .any(|source| source.id == id)
        })
}

#[tauri::command]
pub fn set_key(app: AppHandle, target_id: String, key: String) -> Result<(), String> {
    config::validate_secret_namespace(&target_id)?;
    if !secret_namespace_exists(&config::load(&app), &target_id) {
        return Err(Msg::VaultNamespaceNotInConfig.now());
    }
    if key.len() > 8_192 {
        return Err(Msg::VaultSecretTooBig.now());
    }
    keys::set_key(&target_id, &key)
}

#[tauri::command]
pub fn clear_key(app: AppHandle, target_id: String) -> Result<(), String> {
    config::validate_secret_namespace(&target_id)?;
    if !secret_namespace_exists(&config::load(&app), &target_id) {
        return Err(Msg::VaultNamespaceNotInConfig.now());
    }
    keys::clear_key(&target_id)
}

#[tauri::command]
pub fn has_key(app: AppHandle, target_id: String) -> bool {
    config::validate_secret_namespace(&target_id).is_ok()
        && secret_namespace_exists(&config::load(&app), &target_id)
        && keys::has_key(&target_id)
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

/// Encoders de hardware, em ORDEM DE PRIORIDADE do "Automático":
/// (kind, rótulo, codec do FFmpeg, sessões simultâneas típicas).
const HW_ENCODERS: [(&str, &str, &str, Option<u32>); 4] = [
    ("nvenc", "NVIDIA NVENC", "h264_nvenc", Some(8)),
    ("qsv", "Intel Quick Sync", "h264_qsv", None),
    ("amf", "AMD AMF", "h264_amf", None),
    (
        "videotoolbox",
        "Apple VideoToolbox",
        "h264_videotoolbox",
        None,
    ),
];

/// Deduplica chamadas simultâneas vindas da tela de Qualidade e do BORA.
static HW_PROBE: tokio::sync::OnceCell<[bool; 4]> = tokio::sync::OnceCell::const_new();
const ENCODER_CACHE_SCHEMA: u8 = 1;
const ENCODER_CACHE_TTL_SEC: u64 = 30 * 24 * 60 * 60;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncoderProbeCache {
    schema: u8,
    signature: String,
    saved_at: u64,
    available: [bool; 4],
}

fn epoch_sec() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn encoder_cache_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    Some(app.path().app_config_dir().ok()?.join("encoder-probe.json"))
}

fn cached_encoder_probe(app: &AppHandle, signature: &str) -> Option<[bool; 4]> {
    let path = encoder_cache_path(app)?;
    if std::fs::metadata(&path).ok()?.len() > 16 * 1024 {
        return None;
    }
    let cache: EncoderProbeCache = serde_json::from_slice(&std::fs::read(path).ok()?).ok()?;
    encoder_cache_is_valid(&cache, signature, epoch_sec()).then_some(cache.available)
}

fn encoder_cache_is_valid(cache: &EncoderProbeCache, signature: &str, now: u64) -> bool {
    cache.schema == ENCODER_CACHE_SCHEMA
        && cache.signature == signature
        && now.saturating_sub(cache.saved_at) <= ENCODER_CACHE_TTL_SEC
}

fn save_encoder_probe(app: &AppHandle, signature: String, available: [bool; 4]) {
    let Some(path) = encoder_cache_path(app) else {
        return;
    };
    let Some(dir) = path.parent() else { return };
    if std::fs::create_dir_all(dir).is_err() {
        return;
    }
    let cache = EncoderProbeCache {
        schema: ENCODER_CACHE_SCHEMA,
        signature,
        saved_at: epoch_sec(),
        available,
    };
    let Ok(bytes) = serde_json::to_vec(&cache) else {
        return;
    };
    let tmp = path.with_extension("json.tmp");
    if std::fs::write(&tmp, bytes).is_ok() {
        let _ = std::fs::remove_file(&path);
        if std::fs::rename(&tmp, &path).is_err() {
            let _ = std::fs::remove_file(tmp);
        }
    }
}

#[cfg(windows)]
fn gpu_driver_signature() -> String {
    // PNPDeviceID + versão do driver invalidam o cache quando a placa ou seu driver muda.
    let script = "Get-CimInstance Win32_VideoController | Sort-Object PNPDeviceID | ForEach-Object { '{0}:{1}:{2}' -f $_.PNPDeviceID,$_.DriverVersion,$_.VideoProcessor }";
    quiet_command("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned())
        .filter(|signature| !signature.is_empty())
        .unwrap_or_else(|| "gpu-desconhecida".into())
}

#[cfg(not(windows))]
fn gpu_driver_signature() -> String {
    // VideoToolbox acompanha o hardware/driver do SO; a versão do sistema invalida o cache.
    sysinfo::System::long_os_version().unwrap_or_else(|| "sistema-desconhecido".into())
}

async fn encoder_environment_signature(app: &AppHandle) -> String {
    let ffmpeg_version = async {
        match app.shell().sidecar("ffmpeg") {
            Ok(command) => command
                .args(["-version"])
                .output()
                .await
                .ok()
                .and_then(|output| {
                    String::from_utf8_lossy(&output.stdout)
                        .lines()
                        .next()
                        .map(str::to_owned)
                })
                .unwrap_or_else(|| "ffmpeg-desconhecido".into()),
            Err(_) => "ffmpeg-indisponível".into(),
        }
    };
    let (ffmpeg, gpu) = tokio::join!(
        ffmpeg_version,
        tauri::async_runtime::spawn_blocking(gpu_driver_signature)
    );
    let gpu = gpu.unwrap_or_else(|_| "gpu-desconhecida".into());
    format!(
        "{}|{}|{}|{}|{}",
        ENCODER_CACHE_SCHEMA,
        app.package_info().version,
        std::env::consts::OS,
        ffmpeg.trim(),
        gpu.trim()
    )
}

async fn probe_encoder(app: AppHandle, codec: &'static str) -> bool {
    let Ok(command) = app.shell().sidecar("ffmpeg") else {
        return false;
    };
    let result = command
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=1280x720:r=30",
            "-frames:v",
            "3",
            "-c:v",
            codec,
            "-f",
            "null",
            "-",
        ])
        .output()
        .await;
    matches!(result, Ok(ref output) if output.status.success())
}

/// Sonda quais encoders de hardware REALMENTE funcionam (codifica 3 frames de verdade).
/// A listagem `ffmpeg -encoders` MENTE: o build do BtbN lista nvenc/qsv/amf mesmo sem a GPU
/// presente — só um encode real confirma. Resultado cacheado pra sessão do app.
async fn probe_hw_encoders(app: &AppHandle) -> [bool; 4] {
    let app = app.clone();
    *HW_PROBE
        .get_or_init(|| async move {
            let signature = encoder_environment_signature(&app).await;
            let app_for_cache = app.clone();
            let signature_for_cache = signature.clone();
            if let Ok(Some(cached)) = tauri::async_runtime::spawn_blocking(move || {
                cached_encoder_probe(&app_for_cache, &signature_for_cache)
            })
            .await
            {
                log::info!("encoders de hardware: cache persistente válido");
                return cached;
            }

            // As quatro sondagens são independentes. Em paralelo, o cold path custa o tempo da
            // mais lenta (na máquina de referência ~1,3 s), não a soma (~2,4 s).
            let (nvenc, qsv, amf, videotoolbox) = tokio::join!(
                probe_encoder(app.clone(), HW_ENCODERS[0].2),
                probe_encoder(app.clone(), HW_ENCODERS[1].2),
                probe_encoder(app.clone(), HW_ENCODERS[2].2),
                probe_encoder(app.clone(), HW_ENCODERS[3].2),
            );
            let available = [nvenc, qsv, amf, videotoolbox];
            log::info!(
                "encoders de hardware reais: {}",
                HW_ENCODERS
                    .iter()
                    .zip(available)
                    .filter(|(_, works)| *works)
                    .map(|((kind, ..), _)| *kind)
                    .collect::<Vec<_>>()
                    .join(", ")
            );
            let app_for_cache = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                save_encoder_probe(&app_for_cache, signature, available)
            })
            .await
            .ok();
            available
        })
        .await
}

#[tauri::command]
pub async fn detect_encoders(app: AppHandle) -> Vec<EncoderInfo> {
    let ok = probe_hw_encoders(&app).await;
    let mut out: Vec<EncoderInfo> = HW_ENCODERS
        .iter()
        .zip(ok)
        .map(|((kind, label, _, max_sessions), available)| EncoderInfo {
            kind: (*kind).into(),
            label: (*label).into(),
            available,
            max_sessions: *max_sessions,
        })
        .collect();
    // Software está sempre disponível (libx264).
    out.push(EncoderInfo {
        kind: "software".into(),
        label: "Software (x264)".into(),
        available: true,
        max_sessions: Some(1),
    });
    out
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
                        let body = UploadBody {
                            deadline,
                            sent: sent.clone(),
                        };
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
            return Err(Msg::UploadMeasureFailed.now());
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
        crate::obs::autoconfigure(OBS_WS_HOST, OBS_WS_PORT, &password, &server, &key)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

// --------------------------- Motor (relay) ------------------------

fn emit(app: &AppHandle, snap: &EngineSnapshot) {
    // Barra um snapshot ATRASADO (ex.: amostra de CPU/métrica clonada antes do stop) de
    // ressuscitar a UI depois que o motor já parou: se o estado autoritativo é "stopped" e
    // este snapshot não é, ignora. Fecha a corrida "emit fora do lock" (o kill_engine grava
    // "stopped" sob o lock; qualquer emit posterior relê e desiste).
    {
        let state = app.state::<AppState>();
        let eng = state.engine.lock().unwrap();
        let authoritative_stopped = eng
            .snapshot
            .as_ref()
            .map(|s| s.state == "stopped")
            .unwrap_or(false);
        if authoritative_stopped && snap.state != "stopped" {
            return;
        }
    }
    let _ = app.emit("engine://status", snap);
    update_tray(app, snap);
}

/// Notificação nativa do SO (entrou no ar / destino caiu).
pub(crate) fn notify(app: &AppHandle, title: &str, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
}

/// Atualiza o ícone (só quando a qualidade muda) e o tooltip da bandeja.
fn update_tray(app: &AppHandle, snap: &EngineSnapshot) {
    // Título da janela espelha o estado — na taskbar (ou minimizado) dá pra ver a live de pé.
    // A memoização compara o texto JÁ RENDERIZADO: assim uma troca de idioma no meio da live
    // (estado do motor idêntico, texto diferente) também dispara o set_title.
    let title = match snap.state.as_str() {
        "live" => Msg::WindowTitleLive,
        "starting" => Msg::WindowTitleStarting,
        "error" => Msg::WindowTitleError,
        _ => Msg::WindowTitleIdle,
    }
    .now();
    let title_changed = {
        let state = app.state::<AppState>();
        let mut eng = state.engine.lock().unwrap();
        if eng.win_title != title {
            eng.win_title.clone_from(&title);
            true
        } else {
            false
        }
    };
    if title_changed {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.set_title(&title);
        }
    }

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

/// Estado dos paths no MediaMTX: (ingestão pronta, bytes recebidos na ingestão, programa
/// pronto). Filtra pelo NOME EXATO — o publisher do próprio compositor (`_program`) não pode
/// contar como "sinal do OBS", senão o JÁ VOLTO nunca detectaria a queda. O byte count
/// distingue OBS no ar de OBS travado/caído — num crash (sem desconexão limpa) o MediaMTX
/// segura o `ready` true por até o readTimeout, mas os bytes param de subir na hora.
fn mediamtx_paths(ingest_name: &str, program_name: &str) -> (bool, u64, bool) {
    let body = match ureq::get("http://127.0.0.1:9997/v3/paths/list")
        .timeout(std::time::Duration::from_millis(700))
        .call()
    {
        Ok(r) => r.into_string().unwrap_or_default(),
        Err(_) => return (false, 0, false),
    };
    parse_mediamtx_paths(&body, ingest_name, program_name)
}

/// O OBS está publicando na ingestão? (Path exato — ignora o `_program` do compositor.)
fn mediamtx_ingest_ready(config: &crate::config::AppConfig) -> bool {
    let (ready, _, _) = mediamtx_paths(
        &engine::ingest_path_name(config),
        &engine::program_path_name(config),
    );
    ready
}

fn mediamtx_config_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("mediamtx.yml"))
}

/// Procura o slate "JÁ VOLTO" na pasta de config: `brb-slate.<ext>` (qualquer extensão).
/// No modo "auto" é o `brb-slate.png` gerado pela UI; no custom, a imagem/vídeo escolhido.
/// Só pode existir UM por vez (set/clear/save garantem isso).
fn brb_slate_file(app: &AppHandle) -> Option<std::path::PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    for entry in std::fs::read_dir(&dir).ok()?.flatten() {
        let p = entry.path();
        if is_brb_slate_path(&p) && p.is_file() {
            return Some(p);
        }
    }
    None
}

/// Apaga qualquer `brb-slate.*` da pasta de config (best-effort). Só existe um slate por vez.
fn remove_brb_slate_files(dir: &std::path::Path) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if is_brb_slate_path(&p) && p.is_file() {
                let _ = std::fs::remove_file(&p);
            }
        }
    }
}

/// O vídeo do slate tem trilha de áudio? Leitura RÁPIDA dos cabeçalhos (`ffmpeg -i` sem saída
/// só lista os streams e sai — não decodifica), pra decidir entre o áudio do vídeo e a trilha
/// silenciosa (a plataforma exige áudio; um vídeo mudo faria o -map do áudio real falhar).
async fn brb_slate_has_audio(app: &AppHandle, path: &str) -> bool {
    let Ok(cmd) = app.shell().sidecar("ffmpeg") else {
        return false;
    };
    match cmd.args(["-hide_banner", "-i", path]).output().await {
        // `-i` sem saída sai com erro (esperado), mas imprime os streams no stderr.
        Ok(o) => String::from_utf8_lossy(&o.stderr).contains("Audio:"),
        Err(_) => false,
    }
}

const GENERATED_SLATE_MARKER: &str = "generated-slate.version";

/// O PNG padrão só precisa ser redesenhado quando a geração visual muda ou o arquivo sumiu.
#[tauri::command]
pub fn brb_slate_needs_refresh(app: AppHandle, generation: String) -> bool {
    let Ok(dir) = app.path().app_config_dir() else {
        return true;
    };
    let marker = std::fs::read_to_string(dir.join(GENERATED_SLATE_MARKER)).unwrap_or_default();
    marker.trim() != generation || !dir.join("brb-slate.png").is_file()
}

/// Salva o slate "JÁ VOLTO" (PNG em base64) que a UI desenhou (modo "auto" — tela gerada).
#[tauri::command]
pub fn save_brb_slate(
    app: AppHandle,
    data: String,
    generation: Option<String>,
) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.trim())
        .map_err(|e| e.to_string())?;
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // Some qualquer custom anterior — no modo "auto" só vale o PNG gerado.
    remove_brb_slate_files(&dir);
    std::fs::write(dir.join("brb-slate.png"), bytes).map_err(|e| e.to_string())?;
    if let Some(generation) = generation {
        std::fs::write(dir.join(GENERATED_SLATE_MARKER), generation).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Info do slate escolhido: a kind detectada + o nome original (só exibição na UI).
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrbSlateInfo {
    kind: String,
    file_name: String,
}

/// Escolhe um arquivo (imagem OU vídeo) como slate do "JÁ VOLTO". Apaga o slate anterior,
/// copia o escolhido pra `brb-slate.<ext>` (extensão original em minúsculas) e devolve
/// `{ kind, fileName }`. Cancelou o seletor → devolve None (o front trata como "sem
/// mudança"). NÃO grava brb_slate_kind aqui — o front persiste via setSettings.
#[tauri::command]
pub async fn set_brb_slate(app: AppHandle) -> Result<Option<BrbSlateInfo>, String> {
    use tauri_plugin_dialog::DialogExt;
    let app2 = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app2.dialog()
            .file()
            // Filtro ÚNICO: o botão da UI já diz "imagem ou vídeo" — dois filtros
            // separados escondiam metade dos arquivos até o usuário achar o seletor "Tipo".
            .add_filter(
                Msg::BrbFilePickerFilter.now(),
                &[
                    "png", "jpg", "jpeg", "webp", "gif", "bmp", "mp4", "mov", "mkv", "webm", "m4v",
                ],
            )
            .blocking_pick_file()
    })
    .await
    .map_err(|e| format!("join: {e}"))?;
    let Some(file) = picked else {
        return Ok(None); // cancelou
    };
    let src = file.into_path().map_err(|e| e.to_string())?;
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| !e.is_empty())
        .ok_or_else(|| Msg::BrbFileNoExtension.now())?;
    let file_name = src
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("arquivo")
        .to_string();
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    remove_brb_slate_files(&dir); // só um slate por vez
    let _ = std::fs::remove_file(dir.join(GENERATED_SLATE_MARKER));
    let dest = dir.join(format!("brb-slate.{ext}"));
    std::fs::copy(&src, &dest).map_err(|e| Msg::BrbCopyFailed { e: &e.to_string() }.now())?;
    let kind = if brb_slate_is_video(&dest) {
        "video"
    } else {
        "image"
    }
    .to_string();
    Ok(Some(BrbSlateInfo { kind, file_name }))
}

/// Miniatura (JPEG base64) da tela do "JÁ VOLTO" atual — o streamer VÊ o que vai ao ar
/// antes de precisar. Imagem: converte direto; vídeo: extrai 1 frame. "" = sem slate.
#[tauri::command]
pub async fn get_brb_slate_preview(app: AppHandle) -> Result<String, String> {
    use base64::Engine;
    let Some(src) = brb_slate_file(&app) else {
        return Ok(String::new());
    };
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let out = dir.join("brb-slate-preview.jpg");
    // Mesmo caminho pra imagem e vídeo: 1 frame, reduzido a 480px de largura (é só um preview).
    let args: Vec<String> = vec![
        "-y".into(),
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-i".into(),
        src.to_string_lossy().to_string(),
        "-frames:v".into(),
        "1".into(),
        "-vf".into(),
        "scale=480:-2".into(),
        "-q:v".into(),
        "5".into(),
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
        return Ok(String::new()); // sem preview não é erro — a UI só esconde
    }
    let bytes = std::fs::read(&out).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&out);
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// Remove todo `brb-slate.*` → volta ao modo "auto" (o App.tsx regenera o PNG gerado).
#[tauri::command]
pub fn clear_brb_slate(app: AppHandle) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    remove_brb_slate_files(&dir);
    let _ = std::fs::remove_file(dir.join(GENERATED_SLATE_MARKER));
    Ok(())
}

/// Captura 1 frame do sinal atual (MediaMTX) como bytes JPEG. Helper reusável
/// (preview do enquadramento + guardião anti-vazamento). `name` = arquivo temp.
pub(crate) async fn grab_frame_named(app: &AppHandle, name: &str) -> Result<Vec<u8>, String> {
    let cfg = get_config(app.clone());
    if !mediamtx_ingest_ready(&cfg) {
        return Err(Msg::FrameNoSignal.now());
    }
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
        return Err(Msg::FrameGrabFailed.now());
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

/// Erro FATAL do motor: derruba sidecars + supervisores e SOLTA a trava de sessão (pra o
/// "Tentar de novo" ser aceito), preservando a mensagem no snapshot ("error"). Antes, o motor
/// só trocava o snapshot pra "error" e deixava `live=true`/supervisores rodando — todo retry
/// batia em "já está no ar." e o usuário ficava preso até fechar pela bandeja.
/// `#[track_caller]` porque o `capture_engine_error` também é: sem os DOIS, o frame
/// resolve pra linha daqui e todo erro fatal do motor divide o mesmo fingerprint.
#[track_caller]
fn set_engine_error(app: &AppHandle, code: &str, stage: &str, msg: &str) {
    // Motor já parado = este "erro" é eco do nosso próprio encerramento. Sem esta
    // guarda, terminar a live normalmente reportava `mediamtx_died` toda vez: o
    // `stop_engine_internal` abaixo já ignora (`if !eng.live { return }`), mas a
    // telemetria disparava ANTES dele e virava erro fantasma no painel.
    if !app.state::<AppState>().engine.lock().unwrap().live {
        log::debug!("motor: {code} depois do encerramento — ignorando");
        return;
    }
    log::error!("motor: {msg}");
    let error_id = capture_engine_error(app, code, stage, true, Some(msg.to_string()));
    log::error!("motor: error_id={error_id}");
    stop_engine_internal(app, Some(msg.to_string()), "error");
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
            // Limpa a mensagem de erro velha — senão "Chave recusada" ficava pendurada
            // sob o pill "Reconectando", contando uma história que já passou.
            st.message = None;
            let out = snap.clone();
            if was != "reconnecting" {
                eng.telemetry_reconnect_count = eng.telemetry_reconnect_count.saturating_add(1);
            }
            drop(eng);
            emit(app, &out);
            capture_target_transition(app, target_id, &was, "reconnecting", None);
            if was != "reconnecting" {
                notify(
                    app,
                    &Msg::NotifyTargetDownTitle.now(),
                    &Msg::NotifyTargetDownBody { name: &name }.now(),
                );
            }
        }
    }
}

/// Reafirma o estado de erro terminal de um destino parqueado (idempotente — só emite se
/// algo mudou). Sem isto, um pausar/despausar deixava o card em "Conectando…" pra sempre.
fn reaffirm_auth_error(app: &AppHandle, target_id: &str) {
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    let Some(snap) = eng.snapshot.as_mut() else {
        return;
    };
    if snap.state == "stopped" {
        return;
    }
    let Some(st) = snap.targets.get_mut(target_id) else {
        return;
    };
    if st.state == "error" {
        return;
    }
    let previous = st.state.clone();
    st.state = "error".into();
    st.message = Some(Msg::TargetErrorKeyRejected.now());
    let out = snap.clone();
    drop(eng);
    emit(app, &out);
    capture_target_transition(
        app,
        target_id,
        &previous,
        "auth-error",
        Some("target_auth_error"),
    );
}

/// Sem fonte pra ler: distingue "esperando a 1ª conexão" (waiting, azul calmo) do "sinal
/// SUMIU no meio da live" (signal-lost — urgente, com notificação única). Sem o compositor
/// (JÁ VOLTO desligado), a queda do OBS caía no MESMO pill calmo do pré-live e o streamer
/// só descobria pelo chat que a live congelou.
fn set_target_waiting(app: &AppHandle, target_id: &str) {
    use std::sync::atomic::{AtomicU64, Ordering};
    // Dedup entre destinos: todos perdem o sinal juntos — uma notificação basta.
    static LAST_LOST_NOTIFY_MS: AtomicU64 = AtomicU64::new(0);

    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    let Some(snap) = eng.snapshot.as_mut() else {
        return;
    };
    if snap.state == "stopped" {
        return;
    }
    // "No meio da live" = o snapshot global já chegou a "live" nesta sessão.
    let mid_live = snap.state == "live";
    let Some(st) = snap.targets.get_mut(target_id) else {
        return;
    };
    let new_state = if mid_live { "signal-lost" } else { "waiting" };
    if st.state == new_state {
        return;
    }
    let previous = st.state.clone();
    st.state = new_state.into();
    st.message = if mid_live {
        Some(Msg::TargetSignalLostMessage.now())
    } else {
        None
    };
    let out = snap.clone();
    drop(eng);
    emit(app, &out);
    capture_target_transition(app, target_id, &previous, new_state, None);
    if new_state == "signal-lost" {
        let now = now_ms() as u64;
        let last = LAST_LOST_NOTIFY_MS.load(Ordering::Relaxed);
        if now.saturating_sub(last) > 10_000 {
            LAST_LOST_NOTIFY_MS.store(now, Ordering::Relaxed);
            notify(
                app,
                &Msg::NotifySignalLostTitle.now(),
                &Msg::NotifySignalLostBody.now(),
            );
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

/// Mata sidecars (ffmpeg/mediamtx do Corneta) ÓRFÃOS de sessões que não morreram direito
/// (app fechado à força, crash). Eles SEGURAM PORTAS — sobretudo a 1935 do MediaMTX — e fazem
/// o boot falhar em loop ("a live nunca fica online").
///
/// Filtra pelo CAMINHO do executável (o diretório do corneta.exe), não pelo nome da imagem:
/// (1) o processo pode se chamar `ffmpeg.exe` OU `ffmpeg-<triple>.exe` dependendo de como o
/// Tauri empacota o sidecar — matar por `/IM <nome>` errado era um no-op; (2) filtrar pelo
/// diretório da instalação evita matar um ffmpeg/mediamtx alheio do usuário.
fn kill_orphan_sidecars() {
    let Some(dir) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
    else {
        return;
    };
    #[cfg(windows)]
    {
        // Casa qualquer processo cujo ExecutablePath comece no nosso diretório e cujo nome
        // comece com ffmpeg/mediamtx. Aspas simples escapadas ('' ) pro literal do PowerShell.
        let dir_s = dir.to_string_lossy().replace('\'', "''");
        let script = format!(
            "Get-CimInstance Win32_Process | Where-Object {{ $_.ExecutablePath -like '{dir_s}\\*' -and ($_.Name -like 'ffmpeg*' -or $_.Name -like 'mediamtx*') }} | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}"
        );
        let _ = quiet_command("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output();
    }
    #[cfg(not(windows))]
    {
        // pkill -f pelo caminho <dir>/<base>: casa o sidecar sem casar o próprio corneta.
        let base_dir = dir.to_string_lossy();
        let base_dir = base_dir.trim_end_matches('/');
        for base in ["ffmpeg", "mediamtx"] {
            let _ = quiet_command("pkill")
                .args(["-f", &format!("{base_dir}/{base}")])
                .output();
        }
    }
}

/// O MELHOR encoder de hardware que realmente funciona (1º da prioridade que passou na
/// sonda real). É o que o "Automático" dos destinos usa — e o compositor/guardião também,
/// pra rodar na GPU (CPU ~zero) e acompanhar o tempo real. `None` = só x264.
async fn detect_hw_encoder(app: &AppHandle) -> Option<String> {
    let ok = probe_hw_encoders(app).await;
    HW_ENCODERS
        .iter()
        .zip(ok)
        .find(|(_, works)| *works)
        .map(|((_, _, codec, _), _)| (*codec).to_string())
}

/// YouTube automático falhou (token expirado, quota): avisa e anota no destino — a live
/// segue com a URL/chave manual do usuário, mas ele PRECISA saber que o canal pode estar
/// sem live nenhuma enquanto a Corneta parece "no ar".
fn yt_auto_fallback(app: &AppHandle, target_id: &str, err: &str) {
    log::warn!("YouTube auto-broadcast: {err}");
    let error_id = capture_native_error(
        app,
        "youtube_auto_provision_failed",
        "oauth",
        true,
        Some(err.to_string()),
    );
    log::warn!("YouTube auto-broadcast: error_id={error_id}");
    notify(
        app,
        &Msg::NotifyYoutubeAutoFailedTitle.now(),
        &Msg::NotifyYoutubeAutoFailedBody.now(),
    );
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    if let Some(snap) = eng.snapshot.as_mut() {
        if let Some(st) = snap.targets.get_mut(target_id) {
            st.message = Some(Msg::TargetYoutubeAutoFallback.now());
        }
        let out = snap.clone();
        drop(eng);
        emit(app, &out);
    }
}

/// Guarda RAII da trava de sessão: se o setup do start_engine abortar (erro/`?`/panic) antes de
/// confirmar, solta a trava e limpa qualquer sidecar parcial. Sem isto, um start meio-feito
/// (ex.: disco cheio, MediaMTX ausente) deixaria `live=true` e travaria todo BORA futuro com
/// "já está no ar.".
struct StartGuard<'a> {
    app: &'a AppHandle,
    armed: bool,
}
impl Drop for StartGuard<'_> {
    fn drop(&mut self) {
        if self.armed {
            kill_engine(self.app);
        }
    }
}

#[tauri::command]
pub async fn start_engine(
    app: AppHandle,
    state: State<'_, AppState>,
    operation_id: Option<String>,
) -> Result<(), String> {
    let operation_id = telemetry::normalize_or_new_id(operation_id);

    let result = start_engine_inner(app.clone(), state, operation_id.clone()).await;
    if let Err(error) = &result {
        let cancelled = error == START_CANCELLED;
        let mut properties = serde_json::Map::new();
        properties.insert(
            "operation_id".into(),
            serde_json::Value::String(operation_id.clone()),
        );
        properties.insert(
            "stage".into(),
            serde_json::Value::String(if cancelled { "shutdown" } else { "native" }.into()),
        );
        properties.insert(
            "error_code".into(),
            serde_json::Value::String(
                if cancelled {
                    "start_cancelled"
                } else {
                    "engine_start_failed"
                }
                .into(),
            ),
        );
        properties.insert("cancelled".into(), serde_json::Value::Bool(cancelled));
        properties.insert("retryable".into(), serde_json::Value::Bool(true));
        let _ = app
            .state::<AppState>()
            .telemetry
            .capture("live_start_failed", properties);
    }
    match result {
        Err(error) if error != START_CANCELLED => {
            // Alguns ramos críticos já registraram uma exceção específica. Os
            // demais recebem um erro genérico aqui; em ambos os casos o mesmo
            // ID pesquisável volta ao frontend sem duplicar o issue no PostHog.
            let existing_error_id = {
                let state = app.state::<AppState>();
                let engine = state.engine.lock().unwrap();
                (engine.telemetry_last_error_operation_id.as_deref() == Some(operation_id.as_str()))
                    .then(|| engine.telemetry_last_error_id.clone())
                    .flatten()
            };
            let error_id = existing_error_id.unwrap_or_else(|| {
                app.state::<AppState>().telemetry.capture_error(
                    AppError::new("engine_start_failed", "native", true, Some(error.clone())),
                    Some(&operation_id),
                    true,
                    "error",
                )
            });
            // StartGuard já fez a limpeza idempotente. Publica então um estado
            // terminal estruturado para a UI oferecer cópia dos dois IDs, sem
            // ressuscitar sidecars nem a trava de sessão.
            let snapshot = {
                let state = app.state::<AppState>();
                let mut engine = state.engine.lock().unwrap();
                let mut snapshot = EngineSnapshot::stopped();
                snapshot.state = "error".into();
                snapshot.message = Some(error.clone());
                snapshot.operation_id = Some(operation_id.clone());
                snapshot.error_id = Some(error_id.clone());
                engine.snapshot = Some(snapshot.clone());
                snapshot
            };
            emit(&app, &snapshot);
            Err(format!(
                "{error}\n(error_id: {error_id}; operation_id: {operation_id})"
            ))
        }
        other => other,
    }
}

async fn start_engine_inner(
    app: AppHandle,
    state: State<'_, AppState>,
    operation_id: String,
) -> Result<(), String> {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    // Trava de sessão ATÔMICA: reivindica a sessão sob UM lock, ANTES de qualquer trabalho lento
    // (kill_orphan/keyring/spawn). Sem isto, dois cliques em BORA (ou dois disparos do atalho)
    // passavam ambos pela checagem e subiam dois MediaMTX + dois conjuntos de supervisores no
    // mesmo mapa (TOCTOU → FFmpeg vazado, publish duplicado, supervisor imortal).
    let my_gen = {
        let mut eng = state.engine.lock().unwrap();
        if eng.live {
            return Err(Msg::EngineAlreadyLive.now());
        }
        eng.live = true;
        eng.start_gen = eng.start_gen.wrapping_add(1);
        eng.operation_id = Some(operation_id.clone());
        eng.telemetry_reconnect_count = 0;
        eng.telemetry_last_error_id = None;
        eng.telemetry_last_error_operation_id = None;
        eng.start_gen
    };
    // Daqui pra frente qualquer saída por erro solta a trava e limpa parciais (Drop). Só o
    // sucesso desarma a guarda (no fim da função).
    let mut start_guard = StartGuard {
        app: &app,
        armed: true,
    };

    let config = get_config(app.clone());
    let enabled: Vec<_> = config.targets.iter().filter(|t| t.enabled).collect();
    {
        let mut eng = state.engine.lock().unwrap();
        eng.target_platforms = enabled
            .iter()
            .map(|target| {
                (
                    target.id.clone(),
                    telemetry_platform(&target.platform_id).to_string(),
                )
            })
            .collect();
        eng.telemetry_encoder_kind = telemetry_encoder_kind(&config);
    }
    if enabled.is_empty() {
        return Err(Msg::EngineNoPlatformEnabled.now());
    }

    // Feedback IMEDIATO: a UI sai do "Fora do ar" ANTES da limpeza de órfãos (PowerShell,
    // 1-3s no Windows) — sem isto o clique no BORA parecia não ter pego.
    let started = now_ms();
    let mut snap = EngineSnapshot::starting(&config, started);
    snap.operation_id = Some(operation_id.clone());
    {
        let mut eng = state.engine.lock().unwrap();
        eng.snapshot = Some(snap.clone());
        eng.started_ms = started;
        eng.telemetry_start_requested_ms = started;
    }
    emit(&app, &snap);

    // Renova a sessão da Kick agora, em paralelo com o resto do start: é o único refresh que
    // depende da nossa setup API, e vencer no meio da live derruba envio/moderação. Destacado —
    // não entra no caminho crítico do BORA.
    crate::auth::warm_kick_session(&app);

    // Limpeza de órfãos fora do event-loop (o PowerShell bloqueia).
    let _ = tauri::async_runtime::spawn_blocking(kill_orphan_sidecars).await;

    // Chaves do cofre + hosts (para erros por destino).
    let mut keymap: HashMap<String, String> = HashMap::new();
    for t in &enabled {
        if let Some(k) = keys::get_key(&t.id) {
            keymap.insert(t.id.clone(), k);
        }
    }
    // 1) Gera o mediamtx.yml e sobe o MediaMTX (servidor de ingestão do OBS).
    let yml = mediamtx_config_path(&app).inspect_err(|error| {
        capture_engine_error(
            &app,
            "mediamtx_config_path_failed",
            "config",
            true,
            Some(error.clone()),
        );
    })?;
    std::fs::write(&yml, engine::mediamtx_config(&config)).map_err(|error| {
        capture_engine_error(
            &app,
            "mediamtx_config_write_failed",
            "config",
            true,
            Some(error.to_string()),
        );
        format!("config mediamtx: {error}")
    })?;

    let (mut mtx_rx, mtx_child) = app
        .shell()
        .sidecar("mediamtx")
        .map_err(|e| {
            // Detalhe cru só no log — pra UI, uma frase que o streamer consegue agir em cima.
            log::error!("sidecar mediamtx indisponível (fetch-binaries?): {e}");
            capture_engine_error(
                &app,
                "mediamtx_sidecar_missing",
                "mediamtx",
                false,
                Some(e.to_string()),
            );
            Msg::EngineMissingSidecar.now()
        })?
        .args([yml.to_string_lossy().to_string()])
        .spawn()
        // Mesmo tratamento do sidecar ausente três linhas acima: o erro cru do SO (e o
        // nome do sidecar) ficam no log; pra tela vai uma frase que dá pra agir em cima.
        .map_err(|e| {
            log::error!("mediamtx não subiu: {e}");
            capture_engine_error(
                &app,
                "mediamtx_spawn_failed",
                "mediamtx",
                true,
                Some(e.to_string()),
            );
            Msg::EngineMediamtxNoStart.now()
        })?;

    let running = Arc::new(AtomicBool::new(true));
    // Sinal de ingestão: true quando o OBS está publicando no MediaMTX.
    let has_signal = Arc::new(AtomicBool::new(false));
    // O feed de programa (`_program`, publicado pelo compositor) está de pé?
    let prog_ready = Arc::new(AtomicBool::new(false));
    // "JÁ VOLTO no ar" (slate ou censura) — o compositor liga/desliga; a UI mostra nos destinos.
    let slate_on = Arc::new(AtomicBool::new(false));
    let session_path = session::start_session(&app, &config);
    chat::reset_msg_counts(); // a contagem de chat da sessão começa do zero
    session::set_chat_recording(config.settings.record_chat);
    // Uma flag de pausa por destino (controle ao vivo).
    let pause_flags: HashMap<String, Arc<AtomicBool>> = enabled
        .iter()
        .map(|t| (t.id.clone(), Arc::new(AtomicBool::new(false))))
        .collect();
    // Erro terminal por destino (chave recusada): o supervisor parqueia até o retry limpar.
    let auth_flags: HashMap<String, Arc<AtomicBool>> = enabled
        .iter()
        .map(|t| (t.id.clone(), Arc::new(AtomicBool::new(false))))
        .collect();
    {
        let mut eng = state.engine.lock().unwrap();
        // O usuário pode ter CANCELADO durante os awaits do setup (a UI já mostra
        // "starting" desde o emit lá em cima) — instalar por cima deixaria um motor
        // zumbi com eng.live=false que o Cortar não consegue mais parar.
        if !eng.live || eng.start_gen != my_gen {
            drop(eng);
            log::info!("motor: início cancelado durante o setup — abortando");
            let _ = mtx_child.kill();
            // Sessão de relatório recém-criada não teve live nenhuma — apaga o arquivo.
            if let Some(p) = session_path {
                let _ = std::fs::remove_file(p);
            }
            start_guard.armed = false;
            // CÓDIGO, não frase: o front compara este valor pra saber que foi o
            // próprio usuário que cancelou e engolir o toast de erro. Texto
            // traduzível aqui quebraria a comparação no primeiro idioma novo.
            // O rótulo que a pessoa lê fica no dicionário do front.
            return Err(START_CANCELLED.into());
        }
        eng.mediamtx = Some(mtx_child);
        eng.snapshot = Some(snap.clone());
        eng.started_ms = started;
        eng.running = running.clone();
        eng.session_path = session_path;
        eng.paused = pause_flags.clone();
        eng.auth_error = auth_flags.clone();
    }
    emit(&app, &snap);

    // YouTube automático: cria a transmissão (broadcast público + autostart) AGORA — com o motor
    // local já no ar e a UI em "starting", uma falha de MediaMTX não pode deixar broadcast órfão.
    // A URL+chave entram como override por-destino (aplicado no loop). Falha aqui não derruba a
    // live: o destino YouTube cai pra config manual do usuário.
    let mut yt_override: Option<(String, String, String)> = None;
    if config.settings.youtube_auto_live && keys::has_key("youtube_refresh") {
        if let Some(yt) = enabled.iter().find(|t| t.platform_id == "youtube") {
            let yid = yt.id.clone();
            let title = {
                let t = config.settings.stream_title.trim();
                if t.is_empty() {
                    Msg::YoutubeDefaultBroadcastTitle.now()
                } else {
                    t.to_string()
                }
            };
            let app2 = app.clone();
            match tauri::async_runtime::spawn_blocking(move || {
                crate::auth::youtube_provision_broadcast(&app2, &title)
            })
            .await
            {
                Ok(Ok((addr, key))) => {
                    log::info!("YouTube: transmissão criada automaticamente");
                    yt_override = Some((yid, addr, key));
                }
                // Falha (token expirado, quota): cai pra config manual — mas AVISA, senão o
                // streamer acha que está no ar no YouTube e o canal não tem live nenhuma.
                Ok(Err(e)) => yt_auto_fallback(&app, &yid, &e),
                Err(e) => yt_auto_fallback(&app, &yid, &e.to_string()),
            }
        }
    }

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
            match ev {
                CommandEvent::Stdout(b) | CommandEvent::Stderr(b) => {
                    let raw = String::from_utf8_lossy(&b);
                    let line = raw.to_lowercase();
                    if line.contains("address already in use") {
                        set_engine_error(
                            &app_m,
                            "ingest_port_in_use",
                            "mediamtx",
                            &Msg::EngineIngestPortInUse.now(),
                        );
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
                // MediaMTX morreu (yml inválido, permissão, crash) sem a mensagem específica de
                // porta acima: se o motor ainda se considera no ar, é fatal — senão o snapshot
                // ficaria preso em "starting"/"aguardando OBS" pra sempre. No-op se já parou
                // (ex.: fomos nós que matamos o MediaMTX no stop_engine).
                CommandEvent::Terminated(_) => {
                    set_engine_error(
                        &app_m,
                        "mediamtx_died",
                        "mediamtx",
                        &Msg::EngineMediamtxDied.now(),
                    );
                    break;
                }
                _ => {}
            }
        }
    });

    // 2b) Poller do sinal de ingestão (API do MediaMTX): há publisher (OBS no ar)?
    let run_sig = running.clone();
    let sig = has_signal.clone();
    let prog_sig = prog_ready.clone();
    let ingest_name = engine::ingest_path_name(&config);
    let program_name = engine::program_path_name(&config);
    tauri::async_runtime::spawn_blocking(move || {
        // Sinal vivo = publisher pronto E bytes subindo. Dois polls sem fluxo (~1.4s) = caiu,
        // mesmo que o MediaMTX ainda mostre `ready` (crash do OBS segura o ready por ~20s).
        let mut last_bytes = 0u64;
        let mut stalls = 0u32;
        while run_sig.load(Ordering::Relaxed) {
            let (ready, bytes, prog) = mediamtx_paths(&ingest_name, &program_name);
            let flowing = bytes != last_bytes; // qualquer mudança (sobe ou reseta) = atividade
            last_bytes = bytes;
            if ready && flowing {
                stalls = 0;
            } else {
                stalls = stalls.saturating_add(1);
            }
            let live = ready && stalls < 2;
            sig.store(live, Ordering::Relaxed);
            prog_sig.store(prog, Ordering::Relaxed);
            std::thread::sleep(std::time::Duration::from_millis(700));
        }
    });

    // 3) Um supervisor de FFmpeg POR destino — métricas reais e reconexão independentes.
    let brb_enabled = config.settings.brb_enabled;
    let auto_bitrate = config.settings.auto_bitrate;

    // COMPOSITOR (feed de programa): com JÁ VOLTO e/ou guardião ligados, o vídeo passa pela
    // bomba e os destinos leem o `_program` CONTÍNUO — queda do OBS troca o CONTEÚDO pelo
    // slate sem derrubar a conexão com as plataformas. Guardião = mesmo pipeline + delay/OCR.
    // Sem os dois → destinos leem o `live` direto (zero custo extra; queda = "aguardando").
    let compositor_on = brb_enabled || guard;
    let out_source = if compositor_on {
        engine::program_url(&config)
    } else {
        engine::ingest_url(&config)
    };
    log::info!(
        "motor: compositor={compositor_on} guardião={guard} saídas-leem={}",
        if compositor_on { "_program" } else { "live" }
    );

    // GRAVAÇÃO da live. Herda a MESMA fonte que os destinos leem (`out_source`) em vez de
    // cravar `_program`: sem compositor esse path não existe, e um gravador apontado pra
    // ele morreria calado justamente na configuração mais simples de todas.
    //
    // Tudo aqui é best-effort e sem `?`: nenhuma falha de gravação pode abortar o start.
    if config.settings.record_video {
        let sess = {
            let eng = state.engine.lock().unwrap();
            eng.session_path.clone()
        };
        match (
            recorder::resolve_dir(&app, &config.settings.record_video_dir),
            sess,
        ) {
            (Some(dir), Some(sp)) => {
                // Poda ANTES de gravar: abrir espaço agora é o que evita bater no piso no
                // meio da live. Sobra acima do teto = só arquivos que não são nossos.
                let leftover =
                    session::prune_videos(&app, Some(&dir), config.settings.record_video_keep_gb);
                if leftover > 0 {
                    log::warn!(
                        "gravação: {leftover} bytes acima do teto em arquivos não reconhecidos"
                    );
                }
                let free = recorder::free_bytes(&dir);
                if free.is_some_and(|f| f < recorder::DISK_START_FLOOR) {
                    log::warn!(
                        "gravação: pouco espaço em {} — não vou gravar",
                        dir.display()
                    );
                    let _ = app.emit(
                        "recorder://status",
                        serde_json::json!({ "kind": "diskFull", "detail": null }),
                    );
                } else {
                    let id = sp
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or_default()
                        .to_string();
                    let (a, src, run) = (app.clone(), out_source.clone(), running.clone());
                    tauri::async_runtime::spawn(recorder::run(a, src, dir, sp, id, run));
                }
            }
            (None, _) => {
                // Pasta configurada sumiu: avisa e segue SEM gravar. Recriar caminho no
                // escuro (ou cair pra outra pasta) esconderia o problema do streamer.
                log::warn!("gravação: pasta indisponível — a live segue sem gravar");
                let _ = app.emit(
                    "recorder://status",
                    serde_json::json!({ "kind": "noDir", "detail": null }),
                );
            }
            (_, None) => {}
        }
    }
    // Melhor encoder de HARDWARE real (sonda cacheada) — é o que o "Automático" dos destinos
    // em transcode usa, e o compositor também. Só sonda se alguém for precisar.
    let needs_hw = compositor_on
        || enabled.iter().any(|t| {
            engine::effective_action(&config.mode, t) == "transcode" && t.encoding.encoder == "auto"
        });
    let hw_codec: Option<String> = if needs_hw {
        detect_hw_encoder(&app).await
    } else {
        None
    };
    // Revalida a sessão após os awaits lentos (YouTube/sonda de encoder): um Cortar nesse
    // meio-tempo já derrubou o MediaMTX — subir compositor/supervisores agora criaria
    // processos órfãos de uma sessão morta (ou atropelaria um segundo BORA).
    {
        let eng = state.engine.lock().unwrap();
        if !eng.live || eng.start_gen != my_gen {
            drop(eng);
            log::info!("motor: início cancelado após o setup — abortando antes dos supervisores");
            start_guard.armed = false;
            // CÓDIGO, não frase: o front compara este valor pra saber que foi o
            // próprio usuário que cancelou e engolir o toast de erro. Texto
            // traduzível aqui quebraria a comparação no primeiro idioma novo.
            // O rótulo que a pessoa lê fica no dicionário do front.
            return Err(START_CANCELLED.into());
        }
    }
    if compositor_on {
        // Slate do "JÁ VOLTO": imagem OU vídeo (custom) ou o PNG gerado. Detecta vídeo pela
        // extensão e, se for vídeo, sonda uma vez se tem trilha de áudio.
        let slate_file = brb_slate_file(&app);
        let slate_is_video = slate_file
            .as_deref()
            .map(brb_slate_is_video)
            .unwrap_or(false);
        // JÁ VOLTO "leve" (splicer, sem re-encode): só com o guardião DESLIGADO (ele precisa dos
        // pixels decodificados pro OCR). Slate de imagem OU vídeo — o vídeo é transcodado UMA vez
        // no setup e reproduzido em loop na queda; a live saudável segue em cópia pura nos dois
        // casos. Fora do splicer, o compositor de sempre. O splicer produz o MESMO `_program`
        // (cópia + emenda do slate), então tudo a jusante (destinos lendo `prog_ready`) é idêntico.
        let use_splicer = brb_enabled && !guard;
        let spec = engine::program_spec(&config, guard);
        let slate = match (&slate_file, slate_is_video) {
            (Some(p), true) => {
                let path = p.to_string_lossy().to_string();
                let has_audio = brb_slate_has_audio(&app, &path).await;
                crate::compositor::Slate::Video { path, has_audio }
            }
            _ => crate::compositor::Slate::Still(crate::compositor::load_slate_still(
                &app,
                &spec,
                slate_file.as_deref(),
            )),
        };
        // "JÁ VOLTO agora" (pausa manual): só existe com o compositor no ar.
        let force_brb = Arc::new(AtomicBool::new(false));
        {
            let mut eng = state.engine.lock().unwrap();
            eng.force_brb = Some(force_brb.clone());
        }
        let opts = crate::compositor::CompositorOpts {
            spec,
            delay_sec: if guard { engine::GUARD_DELAY_SEC } else { 0 },
            hw_codec: hw_codec.clone(),
            watchlist: if guard { guard_watchlist } else { Vec::new() },
            slate,
            force_slate: force_brb,
        };
        let (app_c, run_c, sig_c, slate_c) = (
            app.clone(),
            running.clone(),
            has_signal.clone(),
            slate_on.clone(),
        );
        if use_splicer {
            // Cópia direta do OBS pro `_program` (zero re-encode); slate emendado na queda.
            tauri::async_runtime::spawn(async move {
                crate::splicer::run(app_c, run_c, sig_c, slate_c, opts).await;
            });
        } else {
            tauri::async_runtime::spawn(async move {
                crate::compositor::run(app_c, run_c, sig_c, slate_c, opts).await;
            });
        }
    }

    for &t in &enabled {
        let mut target = t.clone();
        let mut key = keymap.get(&t.id).cloned().unwrap_or_default();
        // YouTube automático: usa a URL+chave provisionadas pela API (vencem a config manual).
        if let Some((yid, yurl, ykey)) = &yt_override {
            if target.id == *yid {
                target.ingest_url = yurl.clone();
                key = ykey.clone();
            }
        }
        let cfg = config.clone();
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
        let auth_flag = auth_flags.get(&t.id).cloned().unwrap_or_default();
        // Chave provisionada pelo YouTube automático vence o cofre — não reler no retry.
        let has_yt_override = yt_override.as_ref().is_some_and(|(yid, _, _)| *yid == t.id);
        // Com o compositor, a ENTRADA do destino é o `_program` — que fica de pé mesmo com o
        // OBS caído. O "sinal" do destino passa a ser o programa; a queda do OBS não derruba
        // nem reinicia este FFmpeg (o slate entra no MESMO fluxo, lá no compositor).
        let signal = if compositor_on {
            prog_ready.clone()
        } else {
            has_signal.clone()
        };
        let brb_flag = slate_on.clone();
        let auto_codec = hw_codec.clone();
        let out_source = out_source.clone();
        tauri::async_runtime::spawn(async move {
            // Auto-bitrate: state machine PURO decide baixar/subir; persiste entre respawns.
            let mut abr = engine::AutoBitrate::new(base_kbps, floor_kbps);
            // Notifica UMA vez por sequência de aperto (não a cada degrau).
            let mut drop_notified = false;
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

                // Erro TERMINAL (ex.: chave recusada): parqueia SEM respawn — o card fica
                // cravado em "Erro" com a mensagem e o "Tentar de novo" estáveis, em vez do
                // pisca-pisca Erro↔Reconectando com notificação a cada 2s. O estado é
                // REAFIRMADO (idempotente): pausar/despausar sobrescrevia pra "connecting"
                // e o "Tentar de novo" sumia — beco sem saída.
                if auth_flag.load(Ordering::Relaxed) {
                    reaffirm_auth_error(&app_t, &target_id);
                    let _ = tauri::async_runtime::spawn_blocking(|| {
                        std::thread::sleep(std::time::Duration::from_millis(300))
                    })
                    .await;
                    // Saiu do parque (retry_target): relê a chave do cofre — o caso nº 1 é o
                    // streamer ter colado a chave nova em Plataformas no meio da live.
                    if !auth_flag.load(Ordering::Relaxed) && !has_yt_override {
                        let tid = target_id.clone();
                        if let Ok(Some(k)) =
                            tauri::async_runtime::spawn_blocking(move || keys::get_key(&tid)).await
                        {
                            key = k;
                        }
                    }
                    continue;
                }

                // Sem fonte pra ler (OBS sem compositor; `_program` ainda não subiu com ele):
                // aguarda. Com o compositor no ar isto praticamente não ocorre depois do começo —
                // a queda do OBS NÃO passa por aqui (o programa segue publicando o slate).
                if !signal.load(Ordering::Relaxed) {
                    set_target_waiting(&app_t, &target_id);
                    let _ = tauri::async_runtime::spawn_blocking(|| {
                        std::thread::sleep(std::time::Duration::from_millis(700))
                    })
                    .await;
                    continue;
                }

                // Com sinal: FFmpeg normal (lê do MediaMTX → plataforma) no bitrate atual.
                let args = engine::ffmpeg_args_for_target(
                    &cfg,
                    &target,
                    &key,
                    Some(abr.current()),
                    &out_source,
                    auto_codec.as_deref(),
                );
                let spawned = app_t
                    .shell()
                    .sidecar("ffmpeg")
                    .and_then(|c| c.args(args).spawn());
                let (mut rx, child) = match spawned {
                    Ok(v) => v,
                    Err(e) => {
                        log::error!("sidecar ffmpeg indisponível: {e}");
                        set_engine_error(
                            &app_t,
                            "ffmpeg_spawn_failed",
                            "encoder",
                            &Msg::EngineMissingSidecar.now(),
                        );
                        break;
                    }
                };
                {
                    let st = app_t.state::<AppState>();
                    st.engine
                        .lock()
                        .unwrap()
                        .ffmpegs
                        .insert(target_id.clone(), child);
                }
                // Corrida com o stop: o kill_engine pode ter drenado o mapa ENTRE o topo do laço
                // e este insert (o FFmpeg recém-spawnado escaparia do kill e transmitiria segundos
                // após o "Cortar"). Como o kill grava running=false sob o mesmo lock antes de
                // drenar, aqui já vemos a flag: mata o filho recém-inserido e sai.
                if !run_flag.load(Ordering::Relaxed) {
                    let leftover = {
                        let st = app_t.state::<AppState>();
                        let removed = st.engine.lock().unwrap().ffmpegs.remove(&target_id);
                        removed
                    };
                    if let Some(c) = leftover {
                        kill_child_tree(c);
                    }
                    break;
                }
                // Contadores por-instância do auto-bitrate zeram a cada (re)conexão.
                abr.on_reconnect();
                let mut rebitrate = false;
                let mut signal_lost = false;
                let mut paused_kill = false;
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
                                        brb_flag.load(Ordering::Relaxed),
                                    );
                                    // Auto-bitrate (só em transcode): o state machine puro decide a
                                    // partir do `speed=`. Down/Up já ajustam o bitrate interno; aqui
                                    // só notificamos e quebramos pra respawnar o FFmpeg com o valor novo.
                                    if auto_bitrate && is_transcode {
                                        if let Some(speed) = parse_kv(&line, "speed=") {
                                            match abr.on_speed(speed) {
                                                engine::BitrateAction::Down(kbps) => {
                                                    log::info!("auto-bitrate: destino baixando pra {kbps} kbps");
                                                    // Uma notificação por sequência de aperto (degraus
                                                    // seguintes ficam só no log — sem spam).
                                                    if !drop_notified {
                                                        drop_notified = true;
                                                        notify(
                                                            &app_t,
                                                            &Msg::NotifyBitrateDownTitle.now(),
                                                            &Msg::NotifyBitrateDownBody { target_name: &target_name }.now(),
                                                        );
                                                    }
                                                    rebitrate = true;
                                                    break;
                                                }
                                                engine::BitrateAction::Up(kbps) => {
                                                    log::info!("auto-bitrate: destino subindo pra {kbps} kbps");
                                                    // Recuperou TUDO: fecha o ciclo avisando (senão fica
                                                    // a impressão de que a qualidade caiu pra sempre).
                                                    if kbps >= base_kbps && drop_notified {
                                                        drop_notified = false;
                                                        notify(
                                                            &app_t,
                                                            &Msg::NotifyBitrateUpTitle.now(),
                                                            &Msg::NotifyBitrateUpBody { target_name: &target_name }.now(),
                                                        );
                                                    }
                                                    rebitrate = true;
                                                    break;
                                                }
                                                engine::BitrateAction::Hold => {}
                                            }
                                        }
                                    }
                                }
                                CommandEvent::Terminated(_) => break,
                                _ => {}
                            }
                        }
                        _ = watchdog.tick() => {
                            // Pausou no meio: derruba este FFmpeg. Sem isto, se a pausa chegar na
                            // janela entre o spawn e o insert, o set_target_paused não acha o handle
                            // (remove→None) e o processo segue transmitindo com o usuário em "pausa".
                            if pause_flag.load(Ordering::Relaxed) {
                                paused_kill = true;
                                break;
                            }
                            if !signal.load(Ordering::Relaxed) {
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
                if rebitrate || signal_lost || paused_kill {
                    if let Some(c) = leftover {
                        kill_child_tree(c);
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
                // Erro terminal detectado no log (chave recusada): NÃO é "reconectando" —
                // o parque no topo do laço assume, com estado/mensagem estáveis.
                if auth_flag.load(Ordering::Relaxed) {
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
            crate::obs::poll_stats(OBS_WS_HOST, OBS_WS_PORT, &obs_pw, &run_o, |stats| {
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

    // Setup completo: confirma a sessão (desarma a limpeza automática do StartGuard).
    start_guard.armed = false;
    Ok(())
}

// ASYNC: kill_engine roda `taskkill /T /F` (bloqueante ~50-300ms) por processo. Como comando
// síncrono, isso congelava a thread do event-loop por até ~1-2s no encerramento (o momento mais
// sensível). spawn_blocking tira do event-loop; o snapshot "stopped" é emitido no começo do
// kill_engine, então a UI responde na hora mesmo com o taskkill ainda rolando.
#[tauri::command]
pub async fn stop_engine(app: AppHandle, operation_id: Option<String>) -> Result<(), String> {
    if operation_id
        .as_deref()
        .is_some_and(|value| uuid::Uuid::parse_str(value).is_err())
    {
        return Err("operationId inválido".into());
    }
    if let Some(operation_id) = operation_id {
        let state = app.state::<AppState>();
        let mut engine = state.engine.lock().unwrap();
        // O ID criado no start é a fonte de verdade; o argumento mantém
        // correlação em chamadas legadas/recuperadas nas quais ele não exista.
        if engine.operation_id.is_none() {
            engine.operation_id = Some(operation_id);
        }
    }
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || kill_engine(&app2))
        .await
        .map_err(|e| e.to_string())?;
    // Encerra na hora o broadcast automático do YouTube (best-effort — o enableAutoStop também
    // encerraria sozinho ~1min depois).
    let app3 = app.clone();
    tauri::async_runtime::spawn_blocking(move || crate::auth::youtube_complete_active(&app3));
    Ok(())
}

/// Pausa/retoma UM destino ao vivo (sem derrubar os outros).
// ASYNC: o taskkill do FFmpeg pausado bloqueia (~50-300ms); síncrono, congelava o event-loop.
// O estado otimista é emitido ANTES de matar, então a UI responde na hora.
#[tauri::command]
pub async fn set_target_paused(
    app: AppHandle,
    target_id: String,
    paused: bool,
) -> Result<(), String> {
    use std::sync::atomic::Ordering;

    // Grava a flag e retira o handle do mapa (o supervisor vê a flag e não respawna). Escopo
    // fechado: não segura o `State`/lock através do await do spawn_blocking.
    let child = {
        let state = app.state::<AppState>();
        let mut eng = state.engine.lock().unwrap();
        match eng.paused.get(&target_id) {
            Some(flag) => flag.store(paused, Ordering::Relaxed),
            None => return Err(Msg::TargetNotLive.now()),
        }
        if paused {
            eng.ffmpegs.remove(&target_id)
        } else {
            None
        }
    };

    // Estado otimista imediato (o supervisor confirma na sequência).
    let out = {
        let state = app.state::<AppState>();
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

    // Mata o FFmpeg pausado FORA da thread do event-loop.
    if let Some(child) = child {
        tauri::async_runtime::spawn_blocking(move || {
            kill_child_tree(child);
        })
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Destino parqueado em erro terminal (chave recusada): limpa a flag e deixa o supervisor
/// tentar de novo — relendo a chave do cofre no caminho (o streamer colou a nova em
/// Plataformas SEM precisar cortar a live inteira).
#[tauri::command]
pub fn retry_target(app: AppHandle, target_id: String) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    match eng.auth_error.get(&target_id) {
        Some(flag) => flag.store(false, Ordering::Relaxed),
        None => return Err(Msg::TargetNotInThisStream.now()),
    }
    // Estado otimista: sai do "Erro" pra "Conectando" já no clique.
    let out = eng.snapshot.as_mut().map(|snap| {
        if let Some(st) = snap.targets.get_mut(&target_id) {
            st.state = "connecting".into();
            st.message = None;
        }
        snap.clone()
    });
    drop(eng);
    if let Some(out) = out {
        emit(&app, &out);
    }
    Ok(())
}

/// "JÁ VOLTO agora": liga/desliga o slate manual no compositor (pausa pro banheiro/água,
/// com o mic mudo). Só existe quando a live subiu com o JÁ VOLTO/Guardião armado.
#[tauri::command]
pub fn set_force_brb(app: AppHandle, on: bool) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();
    if !eng.live {
        return Err(Msg::BrbStreamNotLive.now());
    }
    let Some(flag) = &eng.force_brb else {
        return Err(Msg::BrbNotArmed.now());
    };
    flag.store(on, Ordering::Relaxed);
    let out = eng.snapshot.as_mut().map(|snap| {
        snap.forced_brb = on;
        snap.clone()
    });
    drop(eng);
    if let Some(out) = out {
        emit(&app, &out);
    }
    Ok(())
}

/// Atualiza as métricas REAIS de UM destino a partir do log do seu próprio FFmpeg.
/// `brb_on` = o compositor está com o slate "JÁ VOLTO" no ar → o destino continua
/// transmitindo (stats fluindo), mas a UI mostra "brb" em vez de "live".
fn update_target_metrics(
    app: &AppHandle,
    target_id: &str,
    line: &str,
    has_signal: bool,
    brb_on: bool,
) {
    let is_stats = line.contains("frame=") || line.contains("bitrate=");
    const ERR_KEYS: [&str; 8] = [
        "error",
        "failed",
        "connection refused",
        "broken pipe",
        "unable to",
        "connection reset",
        "i/o error",
        "end of file",
    ];
    let low = if is_stats {
        String::new()
    } else {
        line.to_lowercase()
    };
    let is_error = !is_stats && ERR_KEYS.iter().any(|k| low.contains(k));
    if !is_stats && !is_error {
        return;
    }

    let fps = parse_kv(line, "fps=").map(|v| v as u32);
    let bitrate = parse_kv(line, "bitrate=").map(|v| v as u32); // kbits/s ≈ kbps
    let dropped = parse_kv(line, "drop=").map(|v| v as u32);

    let state = app.state::<AppState>();
    let mut eng = state.engine.lock().unwrap();

    if eng
        .paused
        .get(target_id)
        .is_some_and(|f| f.load(std::sync::atomic::Ordering::Relaxed))
    {
        return;
    }
    let was_starting = matches!(
        eng.snapshot.as_ref().map(|s| s.state.as_str()),
        Some("starting")
    );
    // O cronômetro "no ar" começa quando o sinal real chega — não no clique de BORA.
    if is_stats && was_starting {
        eng.started_ms = now_ms();
    }
    let started = eng.started_ms;
    let last_emit = eng.last_emit_ms;
    // Clonado ANTES do empréstimo do snapshot (st borrows snap borrows eng).
    let auth_flag = eng.auth_error.get(target_id).cloned();
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
        st.state = if brb_on { "brb" } else { "live" }.into();
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
        // OBS ainda não publicou: é falta de sinal, não erro do destino. O estado urgente
        // "signal-lost" (posto pelo supervisor no meio da live) não é rebaixado aqui.
        if st.state != "signal-lost" {
            st.state = "waiting".into();
            st.message = None;
        }
    } else {
        let (estate, msg) = friendly_error(&low);
        st.state = estate.into();
        if estate == "error" {
            err_msg = Some(msg.clone());
            // Erro TERMINAL: o supervisor para de respawnar até o "Tentar de novo".
            if let Some(f) = &auth_flag {
                f.store(true, std::sync::atomic::Ordering::Relaxed);
            }
        }
        st.message = Some(msg);
    }

    let new_state = st.state.clone();
    // Throttle: transição de estado emite na hora; atualização de métrica pura, no
    // máximo a cada ~250ms (evita N emits/s do snapshot inteiro com vários destinos).
    let now = now_ms();
    let should_emit =
        new_state != prev_target || was_starting || now.saturating_sub(last_emit) >= 250;
    let out = if should_emit {
        Some(snap.clone())
    } else {
        None
    };
    if should_emit {
        eng.last_emit_ms = now;
    }
    let live_started_context = if is_stats && was_starting {
        Some((
            eng.operation_id.clone(),
            eng.telemetry_encoder_kind.clone(),
            eng.telemetry_start_requested_ms,
        ))
    } else {
        None
    };
    drop(eng);
    if let Some(out) = out {
        emit(app, &out);
    }

    if new_state != prev_target {
        capture_target_transition(
            app,
            target_id,
            &prev_target,
            &new_state,
            if new_state == "error" {
                Some("target_auth_error")
            } else {
                None
            },
        );
    }

    if let Some((Some(operation_id), encoder_kind, requested_ms)) = live_started_context {
        let mut properties = serde_json::Map::new();
        properties.insert(
            "operation_id".into(),
            serde_json::Value::String(operation_id),
        );
        properties.insert(
            "duration_bucket".into(),
            serde_json::Value::String(
                telemetry::duration_bucket(std::time::Duration::from_millis(
                    now_ms().saturating_sub(requested_ms).min(u64::MAX as u128) as u64,
                ))
                .into(),
            ),
        );
        properties.insert(
            "encoder_kind".into(),
            serde_json::Value::String(encoder_kind),
        );
        let _ = app
            .state::<AppState>()
            .telemetry
            .capture("live_start_completed", properties);
    }

    if is_stats && was_starting {
        notify(app, &Msg::NotifyLiveTitle.now(), &Msg::NotifyLiveBody.now());
    } else if let Some(msg) = err_msg {
        if prev_target != "error" {
            notify(
                app,
                &Msg::NotifyTargetErrorTitle.now(),
                &Msg::NotifyTargetErrorBody {
                    name: &name,
                    msg: &msg,
                }
                .now(),
            );
        }
    }
}

/// Lê a utilização da GPU NVIDIA (%) via nvidia-smi. None se não houver NVIDIA.
fn read_gpu() -> Option<f64> {
    let out = quiet_command("nvidia-smi")
        .args([
            "--query-gpu=utilization.gpu",
            "--format=csv,noheader,nounits",
        ])
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
    // Grava a amostra desta janela (~2s) no NDJSON, com o chat por canal (lê+zera).
    if let Some(path) = session {
        session::record_sample(&path, &out, &chat::drain_msg_counts());
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
    stop_engine_internal(app, None, "user");
}

/// Encerramento provocado pela saída do aplicativo, distinto do botão Cortar.
pub fn kill_engine_for_shutdown(app: &AppHandle) {
    stop_engine_internal(app, None, "app_exit");
}

/// Núcleo de encerramento do motor. `error=None` → parada normal (snapshot "stopped");
/// `error=Some(msg)` → erro fatal (snapshot "error" com a mensagem, mas mesma limpeza).
/// IDEMPOTENTE: se a sessão já não está no ar, é no-op (o primeiro a encerrar vence — evita que
/// um erro duplicado clobbere o estado, ou que o taskkill rode duas vezes).
fn stop_engine_internal(app: &AppHandle, error: Option<String>, reason: &str) {
    use std::sync::atomic::Ordering;
    let state = app.state::<AppState>();
    let (children, session_path, out, telemetry_end, target_transitions) = {
        let mut eng = state.engine.lock().unwrap();
        if !eng.live {
            return;
        }
        eng.live = false;
        log::info!(
            "motor: encerrando{}",
            if error.is_some() { " (erro)" } else { "" }
        );
        // Sinaliza os supervisores a pararem ANTES de drenar (sob o MESMO lock que eles usam pra
        // inserir): fecha a janela em que um FFmpeg recém-spawnado escaparia da drenagem.
        eng.running.store(false, Ordering::Relaxed);
        let was_live = eng
            .snapshot
            .as_ref()
            .is_some_and(|snapshot| snapshot.state == "live");
        let operation_id = eng.operation_id.clone();
        let last_error_id = eng.telemetry_last_error_id.clone();
        let duration = now_ms().saturating_sub(eng.started_ms);
        let reconnect_count = eng.telemetry_reconnect_count;
        let target_transitions: Vec<_> = eng
            .snapshot
            .as_ref()
            .map(|snapshot| {
                snapshot
                    .targets
                    .iter()
                    .filter_map(|(target_id, target)| {
                        eng.target_platforms
                            .get(target_id)
                            .cloned()
                            .map(|platform| (platform, target.state.clone()))
                    })
                    .collect()
            })
            .unwrap_or_default();
        let mut out = match &error {
            Some(msg) => {
                let mut s = EngineSnapshot::stopped();
                s.state = "error".into();
                s.message = Some(msg.clone());
                s.error_id = last_error_id;
                s
            }
            None => EngineSnapshot::stopped(),
        };
        out.operation_id = operation_id.clone();
        eng.snapshot = Some(out.clone());
        eng.paused.clear();
        eng.auth_error.clear();
        eng.force_brb = None;
        eng.target_platforms.clear();
        eng.operation_id = None;
        let session_path = eng.session_path.take();
        let mut children: Vec<tauri_plugin_shell::process::CommandChild> =
            eng.ffmpegs.drain().map(|(_, c)| c).collect();
        if let Some(m) = eng.mediamtx.take() {
            children.push(m);
        }
        (
            children,
            session_path,
            out,
            (was_live, operation_id, duration, reconnect_count),
            target_transitions,
        )
    };
    // Emite o estado final JÁ (a UI responde na hora), ANTES do taskkill pesado.
    emit(app, &out);

    let (was_live, operation_id, duration_ms, reconnect_count) = telemetry_end;
    for (platform, previous) in target_transitions {
        state.telemetry.capture_target_transition(
            operation_id.as_deref(),
            &platform,
            &previous,
            "stopped",
            None,
        );
    }
    if was_live {
        if let Some(operation_id) = operation_id {
            let mut properties = serde_json::Map::new();
            properties.insert(
                "operation_id".into(),
                serde_json::Value::String(operation_id),
            );
            properties.insert(
                "reason".into(),
                serde_json::Value::String(
                    if error.is_some() {
                        "engine_error"
                    } else {
                        reason
                    }
                    .into(),
                ),
            );
            properties.insert(
                "duration_bucket".into(),
                serde_json::Value::String(
                    telemetry::duration_bucket(std::time::Duration::from_millis(
                        duration_ms.min(u64::MAX as u128) as u64,
                    ))
                    .into(),
                ),
            );
            properties.insert(
                "reconnect_count_bucket".into(),
                serde_json::Value::String(telemetry::reconnect_bucket(reconnect_count).into()),
            );
            let _ = state.telemetry.capture("live_ended", properties);
        }
    }

    for child in children {
        kill_child_tree(child);
    }
    // Fecha a gravação da sessão (relatório pós-live).
    session::set_chat_recording(false);
    if let Some(path) = session_path {
        session::end_session(&path);
    }
}

// --------------------- Relatórios (pós-live) ----------------------

/// Pasta de gravação configurada, já resolvida. `None` quando ela sumiu (unidade
/// arrancada, pasta renomeada) — quem chama trata como "sem gravação", nunca recriando
/// caminho no escuro.
fn recording_dir(app: &AppHandle) -> Option<std::path::PathBuf> {
    let cfg = config::load(app);
    recorder::resolve_dir(app, &cfg.settings.record_video_dir)
}

#[tauri::command]
pub fn list_sessions(app: AppHandle) -> Vec<session::SessionMeta> {
    let dir = recording_dir(&app);
    session::list_sessions(&app, dir.as_deref())
}

#[tauri::command]
pub fn read_session(app: AppHandle, id: String) -> Result<String, String> {
    session::read_session(&app, &id).ok_or_else(|| Msg::SessionNotFound.now())
}

/// NDJSON do chat gravado. String vazia (não erro) quando a sessão não gravou chat: a
/// ausência é o caso comum, e um erro aqui faria o relatório abrir com toast vermelho.
#[tauri::command]
pub fn read_session_chat(app: AppHandle, id: String) -> String {
    session::read_chat(&app, &id).unwrap_or_default()
}

#[tauri::command]
pub fn delete_session(app: AppHandle, id: String) -> Result<(), String> {
    let dir = recording_dir(&app);
    session::delete_session(&app, &id, dir.as_deref())
}

// --------------------- Gravação (vídeo + replay) ----------------------

/// Valida uma pasta candidata: existe, é pasta, e ESCREVE de verdade (no Windows o
/// atributo de permissão mente). Devolve também os avisos não-impeditivos.
#[tauri::command]
pub fn record_check_dir(app: AppHandle, dir: String) -> recorder::DirCheck {
    let path = if dir.trim().is_empty() {
        session::sessions_dir(&app).unwrap_or_default()
    } else {
        std::path::PathBuf::from(dir.trim())
    };
    recorder::check_dir(&path)
}

/// Diálogo nativo de pasta. `None` = o streamer cancelou (não é erro).
#[tauri::command]
pub async fn record_pick_dir(app: AppHandle) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |p| {
        let _ = tx.send(p);
    });
    rx.await
        .ok()
        .flatten()
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().to_string())
}

/// Grava 5s de barras e devolve o caminho — o teste do §9.2 do doc.
///
/// Vale mais que qualquer outra mitigação: em um clique valida pasta, escrita, espaço,
/// FFmpeg, remux, escopo do asset, CSP, codec e player. Converte quase toda falha de
/// configuração numa descoberta ANTES do BORA, em vez de uma decepção depois da live.
#[tauri::command]
pub async fn record_test(app: AppHandle, dir: String) -> Result<String, String> {
    let path = if dir.trim().is_empty() {
        session::sessions_dir(&app).ok_or_else(|| Msg::SessionDirUnavailable.now())?
    } else {
        std::path::PathBuf::from(dir.trim())
    };
    let check = recorder::check_dir(&path);
    if !check.ok {
        return Err(Msg::RecordDirUnusable.now());
    }
    let file = recorder::test_record(&app, &path).await?;
    allow_asset(&app, &file);
    Ok(file)
}

/// Libera UM arquivo no escopo do protocolo de asset, pra que o `<video>` consiga lê-lo.
///
/// Arquivo a arquivo, e não a pasta inteira do streamer: o escopo fica do tamanho do que a
/// tela está mostrando. Sem esta liberação o sintoma é dos piores de depurar — o vídeo
/// grava perfeitamente e o player fica mudo, sem erro nenhum.
///
/// A URL em si NÃO sai daqui: quem monta é o `convertFileSrc` do próprio Tauri, no front.
/// Montar `http://asset.localhost/...` na mão significaria reimplementar (e ter que manter
/// igual) o escape que o handler do protocolo espera — errar um caractere daria exatamente
/// o mesmo player mudo que esta função existe pra evitar.
#[tauri::command]
pub fn record_allow_file(app: AppHandle, path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    // Só arquivos que a Corneta criou: o nome é a trava (mesma da poda).
    let named = p
        .file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| session::parse_video_name(n).is_some() || n == "corneta-teste.mp4");
    if !named || !p.is_file() {
        return Err(Msg::SessionNotFound.now());
    }
    allow_asset(&app, &path);
    Ok(())
}

fn allow_asset(app: &AppHandle, path: &str) {
    app.asset_protocol_scope().allow_file(path).ok();
}

/// Ajuste manual de sincronia (ms), gravado na própria sessão. É a válvula de escape que
/// cobre a classe inteira de erro de sincronia: o que a automação errar, o streamer arrasta.
#[tauri::command]
pub fn set_session_offset(app: AppHandle, id: String, ms: i64) -> Result<(), String> {
    if !session::valid_session_id(&id) {
        return Err(Msg::SessionInvalidId.now());
    }
    let dir = session::sessions_dir(&app).ok_or_else(|| Msg::SessionDirUnavailable.now())?;
    session::record_offset(&dir.join(format!("{id}.ndjson")), ms.clamp(-30_000, 30_000));
    Ok(())
}

/// Apaga só os vídeos de uma sessão — o relatório e o chat ficam.
#[tauri::command]
pub fn delete_session_recordings(app: AppHandle, id: String) -> Result<(), String> {
    let dir = recording_dir(&app);
    session::delete_recordings(&app, &id, dir.as_deref())
}

/// Marca um instante durante o replay (depois da live). O `t` é o momento ASSISTIDO.
#[tauri::command]
pub fn add_session_marker(app: AppHandle, id: String, t: u64, label: String) -> Result<(), String> {
    if !session::valid_session_id(&id) {
        return Err(Msg::SessionInvalidId.now());
    }
    let dir = session::sessions_dir(&app).ok_or_else(|| Msg::SessionDirUnavailable.now())?;
    let clean: String = label.trim().chars().take(80).collect();
    session::record_marker_at(&dir.join(format!("{id}.ndjson")), t, &clean);
    Ok(())
}

/// Exporta um trecho da gravação. Cópia de bitstream: rápido e sem recodificar, então o
/// clipe sai com a qualidade que foi ao ar. `None` = o streamer cancelou o diálogo.
#[tauri::command]
pub async fn export_clip(
    app: AppHandle,
    path: String,
    start_ms: u64,
    end_ms: u64,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let src = std::path::PathBuf::from(&path);
    let named = src
        .file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| session::parse_video_name(n).is_some());
    if !named || !src.is_file() || end_ms <= start_ms {
        return Err(Msg::SessionNotFound.now());
    }
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("MP4", &["mp4"])
        .set_file_name("corneta-clipe.mp4")
        .save_file(move |p| {
            let _ = tx.send(p);
        });
    let Some(dest) = rx.await.ok().flatten().and_then(|p| p.into_path().ok()) else {
        return Ok(None);
    };
    let args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        // `-ss` ANTES do `-i` busca por keyframe (rápido); com `-c copy` o corte cai no
        // keyframe mais próximo de qualquer jeito, então não há precisão a ganhar depois.
        "-ss".into(),
        format!("{:.3}", start_ms as f64 / 1000.0),
        "-to".into(),
        format!("{:.3}", end_ms as f64 / 1000.0),
        "-i".into(),
        src.to_string_lossy().to_string(),
        "-c".into(),
        "copy".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-y".into(),
        dest.to_string_lossy().to_string(),
    ];
    let out = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(Some(dest.to_string_lossy().to_string()))
}

/// "Abrir pasta" do relatório: vai na pasta da GRAVAÇÃO, não na de sessões.
#[tauri::command]
pub fn open_recording_folder(app: AppHandle) -> Result<(), String> {
    let dir = recording_dir(&app)
        .or_else(|| session::sessions_dir(&app))
        .ok_or_else(|| Msg::SessionDirUnavailable.now())?;
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

#[tauri::command]
pub fn open_sessions_dir(app: AppHandle) -> Result<(), String> {
    let dir = session::sessions_dir(&app).ok_or_else(|| Msg::SessionDirUnavailable.now())?;
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

/// Abre somente URLs HTTPS no navegador padrão. A allowlist fica no backend para que um
/// webview comprometido não transforme a permissão de shell em execução arbitrária.
#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    if url.len() > 2_048 || !url.starts_with("https://") || url.chars().any(char::is_whitespace) {
        return Err(Msg::OpenExternalRefused.now());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| Msg::OpenExternalFailed { e: &e.to_string() }.now())
}

// ------------------------- Chat unificado -------------------------

#[tauri::command]
pub fn chat_start(app: AppHandle) {
    chat::start_chat(&app);
    // Sincroniza o estado "conectado" entre as janelas (principal + popout são webviews
    // distintos, cada um com seu chatConnected local).
    let _ = app.emit("chat://running", true);
}

#[tauri::command]
pub fn chat_stop(app: AppHandle) {
    chat::stop_chat(&app);
    let _ = app.emit("chat://running", false);
}

/// Estado atual do chat (há sessão no ar?). O popout consulta no mount pra nascer com o
/// mesmo estado da janela principal (o evento `chat://running` cobre as mudanças ao vivo).
#[tauri::command]
pub fn chat_running(app: AppHandle) -> bool {
    let st = app.state::<AppState>();
    let running = st.chat.lock().unwrap().running.clone();
    running.load(std::sync::atomic::Ordering::Relaxed)
}

// ASYNC: o envio (sobretudo o insert HTTP do YouTube) bloqueia; comando síncrono trava
// a thread principal (ver open_chat_window). spawn_blocking tira da thread do event-loop.
#[tauri::command]
pub async fn chat_send(
    app: AppHandle,
    text: String,
    sources: Option<Vec<String>>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || chat::send_message(&app, &text, sources))
        .await
        .map_err(|e| e.to_string())?
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
    tauri::WebviewWindowBuilder::new(&app, "chat", tauri::WebviewUrl::App("chat.html".into()))
        .title(Msg::WindowChatPopoutTitle.now())
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
    let password = get_config(app.clone()).settings.obs_password;
    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::obs::set_stream(OBS_WS_HOST, OBS_WS_PORT, &password, start)
    })
    .await;
    match result {
        Ok(Ok(())) => Ok(()),
        Ok(Err(error)) => {
            capture_native_error(
                &app,
                if start {
                    "obs_start_failed"
                } else {
                    "obs_stop_failed"
                },
                "obs",
                true,
                Some(error.clone()),
            );
            Err(error)
        }
        Err(error) => {
            let error = format!("join: {error}");
            capture_native_error(
                &app,
                "obs_stream_task_failed",
                "obs",
                true,
                Some(error.clone()),
            );
            Err(error)
        }
    }
}

/// Testa o ALCANCE do servidor de ingestão (TCP). Não valida a chave — só uma live real valida.
fn tcp_reach(ingest_url: &str) -> Result<String, String> {
    let (host, port) = parse_ingest_hostport(ingest_url)?;
    use std::net::ToSocketAddrs;
    let addr = format!("{host}:{port}")
        .to_socket_addrs()
        .map_err(|_| Msg::TestHostUnresolved { host: &host }.now())?
        .next()
        .ok_or_else(|| Msg::TestAddressUnresolved { host: &host }.now())?;
    match std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_secs(5)) {
        Ok(_) => Ok(Msg::TestHostAnswered { host: &host }.now()),
        Err(_) => Err(Msg::TestNoAnswer { host: &host, port }.now()),
    }
}

#[tauri::command]
pub async fn test_target(app: AppHandle, target_id: String) -> Result<String, String> {
    let cfg = get_config(app);
    let t = cfg
        .targets
        .into_iter()
        .find(|t| t.id == target_id)
        .ok_or_else(|| Msg::TargetNotFound.now())?;
    let url = t.ingest_url;
    tauri::async_runtime::spawn_blocking(move || tcp_reach(&url))
        .await
        .map_err(|e| format!("join: {e}"))?
}

/// Verifica se a API key do YouTube (Data API v3) é válida — chamada barata (1 unidade de cota).
#[tauri::command]
pub async fn youtube_key_check(key: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || crate::chat::check_youtube_key(&key))
        .await
        .map_err(|e| format!("join: {e}"))?
}

/// Testa o token de uma fonte de alerta (Streamlabs/StreamElements) com UMA tentativa de conexão,
/// sem ligar o motor persistente. Ok(msg) = válido; Err(motivo) = inválido/rede.
#[tauri::command]
pub async fn alert_test(app: AppHandle, source_id: String) -> Result<String, String> {
    let cfg = get_config(app);
    let src = cfg
        .settings
        .alert_sources
        .into_iter()
        .find(|s| s.id == source_id)
        .ok_or_else(|| Msg::AlertSourceNotFound.now())?;
    let token = crate::keys::get_key(&format!("alert_{}", src.id))
        .filter(|t| !t.trim().is_empty())
        .ok_or_else(|| Msg::AlertSourcePasteTokenFirst.now())?;
    let kind = src.kind;
    tauri::async_runtime::spawn_blocking(move || crate::alerts::probe_alert(&kind, &token))
        .await
        .map_err(|e| format!("join: {e}"))?
        .map(|_| Msg::AlertSourceTokenOk.now())
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

/// Exporta um relatório de suporte estritamente estruturado. Não inclui logs crus,
/// tokens do keyring, watchlist, nomes, títulos, paths, URLs nem credenciais.
#[tauri::command]
pub fn export_diagnostics(
    app: AppHandle,
    include_telemetry_id: Option<bool>,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    let cfg = config::load(&app);
    let telemetry_state = &app.state::<AppState>().telemetry;
    let status = telemetry_state.status();
    let telemetry_id = if include_telemetry_id.unwrap_or(false) {
        status.installation_id.clone()
    } else {
        status
            .installation_id
            .as_ref()
            .map(|_| "<omitted; include only with explicit consent>".into())
    };
    let telemetry_summary = serde_json::json!({
        "schemaVersion": status.schema_version,
        "noticeVersion": status.notice_version,
        "usage": status.usage,
        "crashReports": status.crash_reports,
        "installationId": telemetry_id,
        "buildSha": option_env!("CORNETA_BUILD_SHA").unwrap_or("dev"),
        "structuredEvents": telemetry_state.diagnostic_events(),
    });
    let report = build_diagnostic_report(
        &app.package_info().version.to_string(),
        std::env::consts::OS,
        std::env::consts::ARCH,
        &cfg,
        &telemetry_summary,
    )?;
    let Some(path) = app
        .dialog()
        .file()
        .add_filter(Msg::DiagFilePickerFilter.now(), &["txt"])
        .set_file_name("corneta-diagnostico.txt")
        .blocking_save_file()
    else {
        let mut properties = serde_json::Map::new();
        properties.insert(
            "outcome".into(),
            serde_json::Value::String("cancelled".into()),
        );
        let _ = telemetry_state.capture("diagnostics_exported", properties);
        return Ok(false);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    if let Err(error) = std::fs::write(path, report) {
        let mut properties = serde_json::Map::new();
        properties.insert("outcome".into(), serde_json::Value::String("failed".into()));
        let _ = telemetry_state.capture("diagnostics_exported", properties);
        capture_native_error(
            &app,
            "diagnostics_write_failed",
            "diagnostics",
            true,
            Some(error.to_string()),
        );
        return Err(error.to_string());
    }
    let mut properties = serde_json::Map::new();
    properties.insert("outcome".into(), serde_json::Value::String("saved".into()));
    let _ = telemetry_state.capture("diagnostics_exported", properties);
    Ok(true)
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
    let cfg = get_config(app.clone());
    let server = format!(
        "{}://{}:{}/{}",
        cfg.ingest.protocol, cfg.ingest.host, cfg.ingest.port, cfg.ingest.app
    );
    let password = cfg.settings.obs_password;
    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::obs::check(OBS_WS_HOST, OBS_WS_PORT, &password, &server)
    })
    .await;
    let check = match result {
        Ok(check) => check,
        Err(error) => {
            let error = format!("join: {error}");
            capture_native_error(
                &app,
                "obs_check_task_failed",
                "obs",
                true,
                Some(error.clone()),
            );
            return Err(error);
        }
    };

    Ok(check)
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
pub async fn mesa_obs_add_source(
    app: AppHandle,
    url: String,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let password = get_config(app).settings.obs_password;
    tauri::async_runtime::spawn_blocking(move || {
        crate::obs::add_or_update_browser_source(
            OBS_WS_HOST,
            OBS_WS_PORT,
            &password,
            MESA_OBS_SOURCE,
            &url,
            width,
            height,
        )
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

/// Remove o Browser Source da Mesa do OBS (limpeza ao encerrar).
#[tauri::command]
pub async fn mesa_obs_remove_source(app: AppHandle) -> Result<(), String> {
    let password = get_config(app).settings.obs_password;
    tauri::async_runtime::spawn_blocking(move || {
        crate::obs::remove_input(OBS_WS_HOST, OBS_WS_PORT, &password, MESA_OBS_SOURCE)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

/// Nome do Browser Source que o overlay de alertas cria/atualiza no OBS.
const OVERLAY_OBS_SOURCE: &str = "Corneta · Alertas";

/// Sobe (ou reaproveita) o servidor local do overlay de alertas na porta configurada.
/// Devolve a URL fixa pra colar no OBS como Browser Source.
#[tauri::command]
pub async fn overlay_start(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<crate::overlay::OverlayInfo, String> {
    let port = get_config(app).settings.overlay_port as u16;
    crate::overlay::start(&state.overlay, port).await
}

/// Encerra o servidor local do overlay (fecha as páginas conectadas e libera a porta).
#[tauri::command]
pub fn overlay_stop(state: State<'_, AppState>) {
    crate::overlay::stop(&state.overlay);
}

/// Info do overlay agora (URL/porta) sem reiniciar — `null` se estiver parado.
#[tauri::command]
pub fn overlay_status(state: State<'_, AppState>) -> Option<crate::overlay::OverlayInfo> {
    crate::overlay::info(&state.overlay)
}

/// Empurra um alerta de EXEMPLO pro overlay (preview no OBS). Não passa pelo painel nem
/// pela gravação da sessão — é só pra ver o card animar.
#[tauri::command]
pub fn overlay_test(state: State<'_, AppState>) {
    let demo = chat::Alert {
        id: "overlay-test".into(),
        platform: "twitch".into(),
        source: Msg::OverlayDemoSource.now(),
        kind: "subgift".into(),
        user: "fulano_dtal".into(),
        amount: Some(5.0),
        currency: None,
        tier: None,
        message: Some(Msg::OverlayDemoAlertMessage.now()),
        fragments: Vec::new(),
        ts: 0,
    };
    crate::overlay::push(&state.overlay, &demo);
}

/// Empurra uma MENSAGEM de chat de EXEMPLO pro overlay de chat (preview no OBS), com um emote.
#[tauri::command]
pub fn overlay_chat_test(state: State<'_, AppState>) {
    let demo = chat::ChatMessage {
        id: "overlay-chat-test".into(),
        platform: "twitch".into(),
        source: Msg::OverlayDemoSource.now(),
        author: "fulano_dtal".into(),
        author_id: None,
        native_id: None,
        color: Some("#ffb323".into()),
        text: Msg::OverlayDemoChatText.now(),
        fragments: vec![
            chat::ChatFragment {
                kind: "text".into(),
                text: Some(Msg::OverlayDemoChatTextFragment.now()),
                url: None,
            },
            chat::ChatFragment {
                kind: "emote".into(),
                text: Some("Kappa".into()),
                url: Some("https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0".into()),
            },
        ],
        badges: vec![chat::ChatBadge {
            label: "sub".into(),
            kind: "subscriber".into(),
        }],
        ts: 0,
    };
    crate::overlay::push_chat(&state.overlay, &demo);
}

/// Adiciona (ou atualiza) o Browser Source do overlay na cena atual do OBS (canvas cheio,
/// transparente — a página posiciona os alertas). Um clique em vez de colar a URL na mão.
#[tauri::command]
pub async fn overlay_obs_add_source(app: AppHandle, url: String) -> Result<(), String> {
    let password = get_config(app).settings.obs_password;
    tauri::async_runtime::spawn_blocking(move || {
        crate::obs::add_or_update_browser_source(
            OBS_WS_HOST,
            OBS_WS_PORT,
            &password,
            OVERLAY_OBS_SOURCE,
            &url,
            1920,
            1080,
        )
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

/// Abre as Configurações de Privacidade do Windows (câmera/mic) quando o getUserMedia
/// falha por causa do bloqueio do SO (que o handler do WebView2 não consegue cobrir).
/// Vai pelo Rust para manter a abertura fora do webview e validar o destino.
#[tauri::command]
pub fn open_privacy_settings(app: AppHandle, which: String) -> Result<(), String> {
    let uri = match which.as_str() {
        "camera" => "ms-settings:privacy-webcam",
        "microphone" => "ms-settings:privacy-microphone",
        _ => return Err(Msg::PrivacySettingsUnknown.now()),
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
            let fallback = Msg::SessionDefaultMarkerLabel.now();
            session::record_marker(&p, label.as_deref().unwrap_or(&fallback));
            Ok(())
        }
        None => Err(Msg::SessionNotRecording.now()),
    }
}

/// Salva um texto no arquivo que o usuário escolher. Devolve `false` se ele cancelou.
///
/// Genérico de propósito: quem monta o conteúdo é o frontend (os exportadores de
/// relatório em HTML/CSV/JSON são funções puras testadas lá). Aqui só existe o
/// diálogo nativo e a escrita — o caminho vem do próprio diálogo, então é o usuário
/// que escolhe onde, não o app.
///
/// O conteúdo é gravado como UTF-8 tal e qual: quando o exportador precisa de BOM
/// (CSV pro Excel em português), ele já manda o `\u{FEFF}` na string.
#[tauri::command]
pub fn save_text_file(
    app: AppHandle,
    name: String,
    label: String,
    ext: String,
    content: String,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    match app
        .dialog()
        .file()
        .add_filter(&label, &[ext.as_str()])
        .set_file_name(&name)
        .blocking_save_file()
    {
        Some(p) => {
            let pb = p.into_path().map_err(|e| e.to_string())?;
            std::fs::write(pb, content).map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => Ok(false),
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
        .add_filter(Msg::ConfigFilePickerFilter.now(), &["json"])
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
        .add_filter(Msg::ConfigFilePickerFilter.now(), &["json"])
        .blocking_pick_file()
    else {
        return Ok(false);
    };
    let pb = p.into_path().map_err(|e| e.to_string())?;
    const MAX_IMPORT_BYTES: u64 = 2 * 1024 * 1024;
    if std::fs::metadata(&pb).map_err(|e| e.to_string())?.len() > MAX_IMPORT_BYTES {
        return Err(Msg::ConfigImportTooBig.now());
    }
    let content = std::fs::read_to_string(pb).map_err(|e| e.to_string())?;
    let cfg: AppConfig = serde_json::from_str(&content)
        .map_err(|e| Msg::ConfigImportInvalidJson { e: &e.to_string() }.now())?;
    let mut cfg = cfg.validate_and_normalize()?;
    // Rede de segurança: guarda a config ATUAL ao lado do config.json antes de sobrescrever —
    // importar substitui perfis/plataformas/ajustes e não tinha caminho de volta.
    if let Ok(dir) = app.path().app_config_dir() {
        let current = config::load(&app);
        if let Ok(json) = serde_json::to_string_pretty(&current) {
            let _ = std::fs::write(dir.join("corneta-backup-antes-do-import.json"), json);
        }
    }
    cfg.revision = config::load(&app).revision.saturating_add(1);
    config::save(&app, &cfg)?;
    let _ = app.emit("config://changed", &cfg);
    Ok(true)
}

#[cfg(test)]
mod encoder_cache_tests {
    use super::{
        encoder_cache_is_valid, EncoderProbeCache, ENCODER_CACHE_SCHEMA, ENCODER_CACHE_TTL_SEC,
    };

    fn cache(saved_at: u64) -> EncoderProbeCache {
        EncoderProbeCache {
            schema: ENCODER_CACHE_SCHEMA,
            signature: "app|ffmpeg|gpu|driver".into(),
            saved_at,
            available: [true, false, false, false],
        }
    }

    #[test]
    fn encoder_cache_requires_matching_environment() {
        let cache = cache(100);
        assert!(encoder_cache_is_valid(&cache, "app|ffmpeg|gpu|driver", 101));
        assert!(!encoder_cache_is_valid(&cache, "driver-novo", 101));
    }

    #[test]
    fn encoder_cache_expires() {
        let cache = cache(100);
        assert!(!encoder_cache_is_valid(
            &cache,
            "app|ffmpeg|gpu|driver",
            101 + ENCODER_CACHE_TTL_SEC,
        ));
    }
}

#[cfg(test)]
mod diagnostic_export_tests {
    use super::build_diagnostic_report;
    use crate::config::{ChatSource, Target, TargetEncoding};

    #[test]
    fn exported_diagnostic_omits_channel_destination_and_video_identifiers() {
        let channel = "canalSentinela19";
        let source = "fonteSentinela27";
        let destination = "destinoSentinela31";
        let video_id = "videoSentinela43";
        let mut config = crate::config::AppConfig::default();
        config.settings.stream_title = channel.into();
        config.settings.chat_sources.push(ChatSource {
            id: source.into(),
            platform: "youtube".into(),
            value: video_id.into(),
            name: channel.into(),
            enabled: true,
            has_send_token: false,
        });
        config.targets.push(Target {
            id: destination.into(),
            platform_id: "custom".into(),
            name: destination.into(),
            enabled: true,
            protocol: "rtmp".into(),
            ingest_url: format!("rtmp://example.invalid/live/{channel}"),
            has_key: false,
            encoding: TargetEncoding {
                action: "copy".into(),
                preset: None,
                encoder: "auto".into(),
                hybrid_override: None,
                reframe: None,
            },
        });
        let report = build_diagnostic_report(
            "0.0.0-test",
            "test-os",
            "test-arch",
            &config,
            &serde_json::json!({
                "schemaVersion": 1,
                "structuredEvents": [],
            }),
        )
        .unwrap();

        for forbidden in [channel, source, destination, video_id] {
            assert!(
                !report.contains(forbidden),
                "identificador livre vazou no diagnóstico: {forbidden}\n{report}"
            );
        }
        assert!(report.contains("telemetry-and-operations.json"));
        assert!(!report.contains("local-log-"));
    }
}
