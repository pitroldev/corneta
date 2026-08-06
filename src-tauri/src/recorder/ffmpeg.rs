//! Adaptador do ENCODER: sobe o FFmpeg sidecar, lê o `-progress`, remuxa e mata a árvore.
//!
//! Este arquivo não decide nada. Ele traduz evento do processo em pergunta pro
//! [`super::domain`] e obedece a resposta — quem manda em ancorar, desistir ou retomar é
//! o núcleo puro.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use super::domain::{
    self, AfterSegment, RestartBudget, SegmentProgress, DISK_CHECK_EVERY, REASON_DIED, REASON_DISK,
    REASON_GIVEUP,
};
use super::{disk, RECORDER_KEY};
use crate::session;
use crate::telemetry::AppError;
use crate::AppState;

/// `#[track_caller]` OBRIGATÓRIO: sem ele o `Location::caller()` lá dentro resolve
/// para ESTE wrapper, e todo erro de gravação chega com
/// `top_app_frame = recorder.rs:<linha daqui>` — foi o que aconteceu com o primeiro
/// `recording_gave_up` reportado por um beta, que apontou pro helper em vez do laço.
#[track_caller]
fn capture_recording_error(app: &AppHandle, code: &str, retryable: bool) {
    let state = app.state::<AppState>();
    let operation_id = state.engine.lock().unwrap().operation_id.clone();
    state.telemetry.capture_error(
        AppError::new(code, "recording", retryable, None),
        operation_id.as_deref(),
        true,
        "warning",
    );
}

fn toast(app: &AppHandle, kind: &str, detail: Option<String>) {
    let _ = app.emit(
        "recorder://status",
        serde_json::json!({ "kind": kind, "detail": detail }),
    );
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Sobe o gravador e supervisiona até `running` cair. Um segmento por vida do FFmpeg.
///
/// Roda numa task própria: nada aqui bloqueia o motor, e um erro aqui não tem caminho
/// nenhum de volta pro estado da transmissão.
pub async fn run(
    app: AppHandle,
    source: String,
    dir: PathBuf,
    session_path: PathBuf,
    id: String,
    running: Arc<AtomicBool>,
) {
    let mut seg: u32 = 1;
    let mut budget = RestartBudget::default();

    while running.load(Ordering::Relaxed) {
        let free = disk::free_bytes(&dir);
        if domain::blocks_start(free) {
            log::warn!(
                "gravação: espaço insuficiente ({} bytes) — não vou começar",
                free.unwrap_or(0)
            );
            capture_recording_error(&app, "recording_disk_low", true);
            session::record_rec_end(&session_path, seg, REASON_DISK);
            toast(&app, "diskFull", None);
            return;
        }
        let out = domain::video_path(&dir, &id, seg);
        let spawned = app
            .shell()
            .sidecar("ffmpeg")
            .and_then(|c| c.args(domain::record_args(&source, &out)).spawn());
        let (mut rx, child) = match spawned {
            Ok(v) => v,
            Err(e) => {
                log::error!("gravação: sidecar ffmpeg indisponível: {e}");
                capture_recording_error(&app, "recording_ffmpeg_spawn_failed", true);
                session::record_rec_end(&session_path, seg, REASON_GIVEUP);
                toast(&app, "failed", Some(e.to_string()));
                return;
            }
        };
        {
            let st = app.state::<AppState>();
            st.engine
                .lock()
                .unwrap()
                .ffmpegs
                .insert(RECORDER_KEY.into(), child);
        }
        // Mesma corrida do supervisor de destino: o stop pode ter drenado o mapa entre o
        // spawn e o insert. Como o stop grava running=false sob o mesmo lock antes de
        // drenar, aqui já vemos a flag — mata o recém-inserido e sai.
        if !running.load(Ordering::Relaxed) {
            take_and_kill(&app);
            break;
        }

        let spawn_at = Instant::now();
        let mut progress = SegmentProgress::default();
        let mut last_advance = Instant::now();
        let mut last_disk = Instant::now();
        let mut reason = REASON_DIED;

        loop {
            let ev = tokio::time::timeout(Duration::from_secs(2), rx.recv()).await;
            match ev {
                Ok(Some(CommandEvent::Stdout(b))) => {
                    let text = String::from_utf8_lossy(&b);
                    for line in text.lines() {
                        let Some(out_ms) = domain::parse_out_time_ms(line) else {
                            continue;
                        };
                        let act = progress.observe(out_ms);
                        if act.advanced {
                            last_advance = Instant::now();
                        }
                        if let Some(anchor_out) = act.anchor_out_ms {
                            session::record_recording(
                                &session_path,
                                seg,
                                now_ms().saturating_sub(anchor_out),
                                &out.to_string_lossy(),
                                "h264",
                                false,
                            );
                            budget.earned(); // gravou de verdade: o orçamento volta
                        }
                        if let Some(sync_out) = act.sync_out_ms {
                            session::record_rec_sync(&session_path, seg, sync_out);
                        }
                    }
                }
                Ok(Some(CommandEvent::Stderr(b))) => {
                    let raw = String::from_utf8_lossy(&b);
                    let t = raw.trim();
                    if !t.is_empty() {
                        log::warn!("gravação/ffmpeg: {t}");
                    }
                }
                Ok(Some(CommandEvent::Terminated(_))) | Ok(None) => break,
                Ok(Some(_)) => {}
                Err(_) => {
                    // Sem evento nesta janela: hora de olhar o relógio e o disco.
                    if !running.load(Ordering::Relaxed) {
                        reason = domain::REASON_STOP;
                        break;
                    }
                    if domain::is_stalled(progress.anchored(), last_advance.elapsed().as_millis()) {
                        log::warn!(
                            "gravação: sem progresso há {}ms — considerando morta",
                            domain::STALL_MS
                        );
                        break;
                    }
                    if domain::should_estimate_anchor(
                        progress.anchored(),
                        spawn_at.elapsed().as_millis(),
                        disk::file_len(&out),
                    ) {
                        session::record_recording(
                            &session_path,
                            seg,
                            now_ms().saturating_sub(spawn_at.elapsed().as_millis() as u64),
                            &out.to_string_lossy(),
                            "h264",
                            true,
                        );
                        progress.estimate_anchor();
                        toast(&app, "estimatedAnchor", None);
                    }
                    if last_disk.elapsed() >= DISK_CHECK_EVERY {
                        last_disk = Instant::now();
                        if domain::hit_floor(disk::free_bytes(&dir)) {
                            log::warn!("gravação: disco no piso — encerrando limpo");
                            reason = REASON_DISK;
                            break;
                        }
                    }
                }
            }
        }

        take_and_kill(&app);
        let stopping = !running.load(Ordering::Relaxed);
        let closed_with = domain::final_reason(stopping, reason);
        session::record_rec_end(&session_path, seg, closed_with);
        // Finaliza ESTE segmento agora, não no fim da live: se o app morrer daqui a duas
        // horas, o que já foi gravado continua navegável.
        finalize(&app, &session_path, seg, &out).await;

        match budget.after_segment(seg, stopping, closed_with) {
            AfterSegment::Stop => break,
            AfterSegment::DiskFull => {
                toast(&app, "diskFull", None);
                break;
            }
            AfterSegment::GiveUp => {
                log::error!(
                    "gravação: {} retomadas sem sucesso — desistindo",
                    domain::MAX_RESTARTS
                );
                capture_recording_error(&app, "recording_gave_up", false);
                session::record_rec_end(&session_path, seg, REASON_GIVEUP);
                toast(&app, "gaveUp", None);
                break;
            }
            AfterSegment::Resume {
                seg: next,
                backoff_ms,
            } => {
                toast(&app, "resumed", None);
                tokio::time::sleep(Duration::from_millis(backoff_ms)).await;
                seg = next;
            }
        }
    }
}

/// Tira o gravador do mapa de filhos e mata a árvore dele.
fn take_and_kill(app: &AppHandle) {
    let child = {
        let st = app.state::<AppState>();
        let mut eng = st.engine.lock().unwrap();
        eng.ffmpegs.remove(RECORDER_KEY)
    };
    if let Some(c) = child {
        crate::commands::kill_child_tree(c);
    }
}

/// Remux de finalização (§9.5). Falhar aqui não perde nada: o fMP4 continua tocando,
/// só navega pior.
async fn finalize(app: &AppHandle, session_path: &Path, seg: u32, src: &Path) {
    if disk::file_len(src) == 0 {
        let _ = std::fs::remove_file(src);
        return;
    }
    let tmp = src.with_extension("fin.mp4");
    let Ok(cmd) = app.shell().sidecar("ffmpeg") else {
        return;
    };
    match cmd.args(domain::remux_args(src, &tmp)).output().await {
        Ok(o) if o.status.success() => {
            if std::fs::rename(&tmp, src).is_ok() {
                session::record_rec_finalized(session_path, seg, &src.to_string_lossy());
            } else {
                let _ = std::fs::remove_file(&tmp);
            }
        }
        Ok(o) => {
            log::warn!(
                "gravação: remux falhou ({}) — o fMP4 segue tocável",
                String::from_utf8_lossy(&o.stderr).trim()
            );
            let _ = std::fs::remove_file(&tmp);
        }
        Err(e) => {
            log::warn!("gravação: remux não rodou: {e}");
            let _ = std::fs::remove_file(&tmp);
        }
    }
}

/// Grava 5s de barras e devolve o caminho — o teste do §9.2.
pub async fn test_record(app: &AppHandle, dir: &Path) -> Result<String, String> {
    let out = dir.join("corneta-teste.mp4");
    let cmd = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(domain::test_args(&out));
    let res = cmd.output().await.map_err(|e| e.to_string())?;
    if !res.status.success() {
        return Err(String::from_utf8_lossy(&res.stderr).trim().to_string());
    }
    Ok(out.to_string_lossy().to_string())
}
