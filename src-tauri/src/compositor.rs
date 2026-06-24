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
use crate::guardian::{
    build_paddle, ensure_paddle_models, ocr_scan_gray, paddle_scan_gray, Anchor, Region, Tracker,
};

const FSIZE: usize = COMP_W * COMP_H * 3 / 2; // yuv420p
const YSIZE: usize = COMP_W * COMP_H; // plano Y (escala de cinza)

/// Caminho do sidecar ffmpeg. O Tauri copia o externalBin pro lado do exe SEM o sufixo do
/// triple (vira `ffmpeg.exe`), tanto em dev (target/debug) quanto no bundle de produção.
fn ffmpeg_path() -> Option<std::path::PathBuf> {
    let dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    let name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    let p = dir.join(name);
    p.exists().then_some(p)
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
/// `censor`: detecta+rastreia+desenha (no próprio vídeo). Senão, só atrasa (sem tarjas).
pub async fn run_compositor(
    app: AppHandle,
    running: Arc<AtomicBool>,
    has_signal: Arc<AtomicBool>,
    delay_sec: u32,
    hw_codec: Option<String>,
    censor: bool,
    watchlist: Vec<String>,
) {
    let Some(ffmpeg) = ffmpeg_path() else {
        log::error!("compositor: sidecar ffmpeg não encontrado");
        return;
    };
    let cfg = crate::config::load(&app);
    let dec_args = engine::ffmpeg_args_for_decoder(&cfg);
    let enc_args = engine::ffmpeg_args_for_encoder(&cfg, delay_sec, hw_codec.as_deref());
    let delay_frames = (delay_sec.max(1) as usize) * COMP_FPS;
    let backfill = (COMP_FPS * 2 / 3).max(1); // ~0.66s pra trás cobre o atraso de detecção do OCR
    log::info!(
        "compositor: delay {delay_sec}s ({delay_frames} frames), {COMP_W}x{COMP_H}@{COMP_FPS}, censor={censor}, hw={hw_codec:?}"
    );

    // Estado compartilhado entre o pipeline e a thread de OCR.
    let latest_y: Arc<Mutex<Option<Vec<u8>>>> = Arc::new(Mutex::new(None));
    let anchor: Arc<Mutex<Anchor>> = Arc::new(Mutex::new(Anchor::default()));

    // Thread de OCR (só se for censurar): OCR no plano Y → publica âncora + toast. Roda no seu
    // ritmo (lento), sem travar o pipeline de quadros.
    if censor {
        let (app_o, run_o, ly, an) =
            (app.clone(), running.clone(), latest_y.clone(), anchor.clone());
        tauri::async_runtime::spawn_blocking(move || {
            // PaddleOCR (CPU — mais preciso e libera a GPU). Fallback pro Windows OCR se falhar.
            let paddle = ensure_paddle_models(&app_o)
                .and_then(|(d, r, di)| build_paddle(&d, &r, &di));
            match &paddle {
                Some(_) => log::info!("OCR: PaddleOCR (CPU — libera a GPU)"),
                None => log::warn!("OCR: PaddleOCR indisponível — usando Windows OCR"),
            }
            let mut had_leak = false;
            while run_o.load(Ordering::Relaxed) {
                let y = ly.lock().unwrap().clone();
                let Some(gray) = y else {
                    std::thread::sleep(Duration::from_millis(60));
                    continue;
                };
                let (leaks, regions) = match &paddle {
                    Some(o) => paddle_scan_gray(o, &gray, COMP_W, COMP_H, &watchlist),
                    None => ocr_scan_gray(&gray, COMP_W, COMP_H, &watchlist),
                };
                if !leaks.is_empty() && !had_leak {
                    for l in &leaks {
                        let _ = app_o.emit("leak://alert", l.clone());
                    }
                }
                had_leak = !leaks.is_empty();
                if let Ok(mut a) = an.lock() {
                    a.gen = a.gen.wrapping_add(1);
                    a.auto = true;
                    a.regions = regions;
                }
                // Cap ~3×/s: detecta vazamento novo em ~0.35s (o backfill cobre) e poupa GPU.
                std::thread::sleep(Duration::from_millis(250));
            }
        });
    }

    // Pipeline binário roda numa thread bloqueante (read/write crus).
    let _ = tauri::async_runtime::spawn_blocking(move || {
        let black = black_frame();
        let mut tracker = Tracker::new();
        while running.load(Ordering::Relaxed) {
            if !has_signal.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(400));
                continue;
            }
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
            let mut idx = 0u64;
            tracker.reset();

            // --- LOOP DE QUADROS ---
            loop {
                if !running.load(Ordering::Relaxed) {
                    break;
                }
                if dout.read_exact(&mut frame).is_err() {
                    break; // decoder morreu / EOF
                }
                // Detecta+rastreia NESTE quadro (plano Y) → regiões EXATAS pra ele.
                let regions = if censor {
                    if idx % 5 == 0 {
                        *latest_y.lock().unwrap() = Some(frame[..YSIZE].to_vec());
                    }
                    let a = anchor.lock().unwrap().clone();
                    tracker.update(&frame[..YSIZE], COMP_W, COMP_H, &a)
                } else {
                    vec![]
                };
                idx = idx.wrapping_add(1);

                // Backfill: regiões NOVAS entram nos quadros recentes (ainda no buffer, não airados)
                // → cobre o atraso de detecção do OCR sem expor.
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
