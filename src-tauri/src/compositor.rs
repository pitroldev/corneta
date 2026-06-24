//! Protetor com BUFFER próprio: lê o `live` cru, segura N segundos no nosso processo (delay REAL)
//! e desenha as tarjas no quadro NA SAÍDA → censura preventiva garantida (o segredo só sai depois
//! de checado). O guardião (detecção) publica as regiões ao vivo em `shared`; aqui a gente casa
//! com o quadro atrasado + backfill. Ver docs/FEATURE-PROTETOR-BUFFER.md.
//!
//! Usa `std::process` (não o tauri shell) porque o vídeo é BINÁRIO — o shell quebraria em linhas.

use std::collections::VecDeque;
use std::io::{Read, Write};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Emitter};

use crate::engine::{self, COMP_FPS, COMP_H, COMP_W};
use crate::guardian::Region;

const FSIZE: usize = COMP_W * COMP_H * 3 / 2; // yuv420p

/// Caminho do sidecar ffmpeg (fica ao lado do exe do app, em dev e em produção).
fn ffmpeg_path() -> Option<std::path::PathBuf> {
    let triple = tauri::utils::platform::target_triple().ok()?;
    let dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    let name = if cfg!(windows) {
        format!("ffmpeg-{triple}.exe")
    } else {
        format!("ffmpeg-{triple}")
    };
    Some(dir.join(name))
}

/// Quadro preto (Y=16, U=V=128) — emitido enquanto o buffer enche (pro encoder ter vídeo contínuo).
fn black_frame() -> Vec<u8> {
    let mut f = vec![128u8; FSIZE];
    for p in f.iter_mut().take(COMP_W * COMP_H) {
        *p = 16;
    }
    f
}

/// Pinta uma tarja preta (yuv420p) na região fracionária `r` = (fx, fy, fw, fh).
fn draw_box(f: &mut [u8], r: Region) {
    let (w, h) = (COMP_W, COMP_H);
    let bx = (r.0.clamp(0.0, 1.0) * w as f32) as usize;
    let by = (r.1.clamp(0.0, 1.0) * h as f32) as usize;
    let bw = (r.2.clamp(0.0, 1.0) * w as f32) as usize;
    let bh = (r.3.clamp(0.0, 1.0) * h as f32) as usize;
    if bw == 0 || bh == 0 {
        return;
    }
    let y_plane = w * h;
    let u_plane = y_plane + (w / 2) * (h / 2);
    for y in by..(by + bh).min(h) {
        for x in bx..(bx + bw).min(w) {
            f[y * w + x] = 16;
        }
    }
    let cw = w / 2;
    for y in (by / 2)..((by + bh) / 2).min(h / 2) {
        for x in (bx / 2)..((bx + bw) / 2).min(cw) {
            f[y_plane + y * cw + x] = 128;
            f[u_plane + y * cw + x] = 128;
        }
    }
}

/// É a região `r` "nova" (sem nenhuma equivalente próxima em `prev`)? → precisa de backfill.
fn is_new(r: &Region, prev: &[Region]) -> bool {
    let (cx, cy) = (r.0 + r.2 / 2.0, r.1 + r.3 / 2.0);
    !prev.iter().any(|p| {
        let (px, py) = (p.0 + p.2 / 2.0, p.1 + p.3 / 2.0);
        ((cx - px).powi(2) + (cy - py).powi(2)).sqrt() < 0.12
    })
}

fn spawn_ff(ffmpeg: &std::path::Path, args: &[String], pipe_out: bool) -> std::io::Result<std::process::Child> {
    let mut cmd = Command::new(ffmpeg);
    cmd.args(args);
    if pipe_out {
        cmd.stdout(Stdio::piped()).stdin(Stdio::null());
    } else {
        cmd.stdin(Stdio::piped()).stdout(Stdio::null());
    }
    cmd.stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd.spawn()
}

fn kill(child: &mut std::process::Child) {
    let pid = child.id();
    let _ = child.kill();
    let _ = child.wait();
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(0x0800_0000)
            .output();
    }
    #[cfg(not(windows))]
    {
        let _ = pid;
    }
}

/// Roda o protetor com buffer enquanto a transmissão estiver no ar.
pub async fn run_compositor(
    app: AppHandle,
    running: Arc<AtomicBool>,
    has_signal: Arc<AtomicBool>,
    shared: Arc<Mutex<Vec<Region>>>,
    delay_sec: u32,
    hw_codec: Option<String>,
) {
    let Some(ffmpeg) = ffmpeg_path() else {
        log::error!("compositor: sidecar ffmpeg não encontrado");
        return;
    };
    let cfg = crate::config::load(&app);
    let dec_args = engine::ffmpeg_args_for_decoder(&cfg);
    let enc_args = engine::ffmpeg_args_for_encoder(&cfg, delay_sec, hw_codec.as_deref());
    let delay_frames = (delay_sec.max(1) as usize) * COMP_FPS;
    let backfill = (COMP_FPS / 2).max(1); // ~0.5s pra trás cobre o atraso de detecção do OCR
    log::info!(
        "compositor: delay {delay_sec}s ({delay_frames} frames), {COMP_W}x{COMP_H}@{COMP_FPS}, hw={hw_codec:?}"
    );

    // Pipeline binário roda numa thread bloqueante (read/write crus).
    let _ = tauri::async_runtime::spawn_blocking(move || {
        let black = black_frame();
        while running.load(Ordering::Relaxed) {
            if !has_signal.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(400));
                continue;
            }
            // Sobe decoder (live → cru) e encoder (cru + áudio → _delayed).
            let mut dec = match spawn_ff(&ffmpeg, &dec_args, true) {
                Ok(c) => c,
                Err(e) => {
                    log::warn!("compositor: decoder não subiu: {e}");
                    std::thread::sleep(Duration::from_secs(2));
                    continue;
                }
            };
            let mut enc = match spawn_ff(&ffmpeg, &enc_args, false) {
                Ok(c) => c,
                Err(e) => {
                    log::warn!("compositor: encoder não subiu: {e}");
                    kill(&mut dec);
                    std::thread::sleep(Duration::from_secs(2));
                    continue;
                }
            };
            let mut dout = std::io::BufReader::with_capacity(FSIZE * 2, dec.stdout.take().unwrap());
            let mut ein = enc.stdin.take().unwrap();

            let mut buf: VecDeque<(Vec<u8>, Vec<Region>)> = VecDeque::with_capacity(delay_frames + 4);
            let mut prev_regions: Vec<Region> = vec![];
            let mut censoring = false;
            let mut frame = vec![0u8; FSIZE];

            // --- LOOP DE QUADROS ---
            loop {
                if !running.load(Ordering::Relaxed) {
                    break;
                }
                if dout.read_exact(&mut frame).is_err() {
                    break; // decoder morreu / EOF
                }
                // Regiões ao vivo (do guardião) pra ESTE quadro.
                let regions = shared.lock().unwrap().clone();
                // Backfill: regiões NOVAS entram nos quadros recentes (ainda no buffer, não airados).
                for r in &regions {
                    if is_new(r, &prev_regions) {
                        for (_, regs) in buf.iter_mut().rev().take(backfill) {
                            if is_new(r, regs) {
                                regs.push(*r);
                            }
                        }
                    }
                }
                prev_regions = regions.clone();
                buf.push_back((frame.clone(), regions));

                // Saída: quadro de `delay_frames` atrás (com tarjas), ou preto enquanto enche.
                let ok = if buf.len() > delay_frames {
                    let (mut f, regs) = buf.pop_front().unwrap();
                    let any = !regs.is_empty();
                    for r in &regs {
                        draw_box(&mut f, *r);
                    }
                    if any != censoring {
                        censoring = any;
                        let _ = app.emit("leak://censor", any);
                    }
                    ein.write_all(&f).is_ok()
                } else {
                    ein.write_all(&black).is_ok()
                };
                if !ok {
                    break; // encoder morreu
                }
            }

            let _ = app.emit("leak://censor", false);
            kill(&mut enc);
            kill(&mut dec);
            if !running.load(Ordering::Relaxed) {
                break;
            }
            std::thread::sleep(Duration::from_millis(800));
        }
        log::info!("compositor: encerrado");
    })
    .await;
}
