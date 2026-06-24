//! Aplicação + adaptadores de I/O do guardião.
//!
//! - **Protetor** (`run_protector`): segura o vídeo N s num buffer no nosso processo (delay REAL)
//!   e desenha as tarjas no quadro NA SAÍDA. A thread de OCR marca cada detecção pelo ÍNDICE do
//!   quadro (`domain::Coverage`); quando ESSE quadro sai (N depois), a gente cobre o segredo com
//!   o OCR dele → no lugar e na hora exatos, sem deriva e sem vazar (a "máquina do tempo").
//! - **Avisar** (`run_warn`): OCR periódico no frame do extrator (`guardlive.jpg`) + toast.
//!
//! Usa `std::process` (não o tauri shell) porque o vídeo é BINÁRIO — o shell quebraria em linhas.

use std::collections::VecDeque;
use std::io::{Read, Write};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};

use super::domain::{Coverage, Region};
use super::ocr::build_ocr;
use super::Ocr;
use crate::engine::{self, COMP_FPS, COMP_H, COMP_W};

const FSIZE: usize = COMP_W * COMP_H * 3 / 2; // yuv420p
const YSIZE: usize = COMP_W * COMP_H; // plano Y (escala de cinza)
const MAX_BOXES: usize = 12; // teto de tarjas simultâneas por quadro (depois do merge)
/// Teto do delay (s) — o buffer é delay×3,1MB/quadro; 15s ≈ 1,3GB. Trava abuso de config manual.
const MAX_DELAY_SEC: u32 = 15;

// ------------------------------ Adaptadores --------------------------------

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
    for p in f.iter_mut().take(YSIZE) {
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

fn spawn_ff(
    ffmpeg: &std::path::Path,
    args: &[String],
    pipe_out: bool,
) -> std::io::Result<std::process::Child> {
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

/// Decodifica um JPEG do extrator em escala de cinza → (pixels, largura, altura).
fn decode_jpeg_gray(jpeg: &[u8]) -> Option<(Vec<u8>, usize, usize)> {
    let img = image::load_from_memory_with_format(jpeg, image::ImageFormat::Jpeg).ok()?;
    let g = img.to_luma8();
    let (w, h) = (g.width() as usize, g.height() as usize);
    Some((g.into_raw(), w, h))
}

// ---------------------- Estado compartilhado OCR↔pump ----------------------

/// Tudo que a thread de OCR e o pump de quadros dividem. Locks são sempre curtos e NUNCA
/// aninhados (o OCR roda sem segurar lock nenhum) → sem contenção no caminho quente.
struct Shared {
    /// O quadro mais novo oferecido pro OCR (índice + plano Y). O worker dá `take()` quando livre
    /// → o pump só recopia (2 MB) na taxa de amostragem do OCR (~poucas vezes/s), barato.
    scan_slot: Mutex<Option<(u64, Vec<u8>)>>,
    /// Resultados do OCR por índice de quadro (a máquina do tempo).
    coverage: Mutex<Coverage>,
}

// ------------------------------- Protetor ----------------------------------

/// Roda o protetor com buffer enquanto a transmissão estiver no ar.
/// `censor`: detecta+desenha (no próprio vídeo). Senão, só atrasa (sem tarjas).
pub async fn run_protector(
    app: AppHandle,
    running: Arc<AtomicBool>,
    has_signal: Arc<AtomicBool>,
    delay_sec: u32,
    hw_codec: Option<String>,
    censor: bool,
    watchlist: Vec<String>,
) {
    let Some(ffmpeg) = ffmpeg_path() else {
        log::error!("protetor: sidecar ffmpeg não encontrado");
        return;
    };
    let delay_sec = delay_sec.clamp(1, MAX_DELAY_SEC);
    let cfg = crate::config::load(&app);
    let dec_args = engine::ffmpeg_args_for_decoder(&cfg);
    let enc_args = engine::ffmpeg_args_for_encoder(&cfg, delay_sec, hw_codec.as_deref());
    let delay_frames = (delay_sec as usize) * COMP_FPS;
    // Quanto uma detecção "segura" um quadro sem amostra nova: ~2/3 do buffer. Dá folga pra OCR
    // mais lento (tela cheia, ~1-2s) sem buraco entre amostras; bracket além disso = OCR travado.
    let max_hold = (delay_frames as u64 * 2 / 3).max(COMP_FPS as u64);
    log::info!(
        "protetor: delay {delay_sec}s ({delay_frames} frames), {COMP_W}x{COMP_H}@{COMP_FPS}, censor={censor}, hw={hw_codec:?}"
    );

    let shared = Arc::new(Shared {
        scan_slot: Mutex::new(None),
        coverage: Mutex::new(Coverage::new()),
    });

    // Thread de OCR (só se for censurar). Constrói o OCR ANTES do pump airar: o download/init do
    // modelo e o JIT da 1ª inferência são pagos durante o fill do buffer (3s), então quando o 1º
    // quadro real sai o OCR já está pronto E já varreu os quadros do começo → sem janela
    // descoberta no arranque (era um dos bugs críticos).
    if censor {
        let app_b = app.clone();
        match tauri::async_runtime::spawn_blocking(move || build_ocr(&app_b, true)).await {
            Ok(ocr) => {
                let (app_o, run_o, sh_o, wl) =
                    (app.clone(), running.clone(), shared.clone(), watchlist);
                tauri::async_runtime::spawn_blocking(move || ocr_worker(app_o, run_o, sh_o, wl, ocr));
            }
            Err(e) => log::error!("protetor/OCR: build falhou ({e}) — censura desligada nesta sessão"),
        }
    }

    // Pump binário (read/write crus) numa thread bloqueante.
    let _ = tauri::async_runtime::spawn_blocking(move || {
        let black = black_frame();
        let mut head: u64 = 0; // índice monotônico — NÃO zera nos reconnects (Coverage fica coerente)
        while running.load(Ordering::Relaxed) {
            if !has_signal.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(400));
                continue;
            }
            let mut dec = match spawn_ff(&ffmpeg, &dec_args, true) {
                Ok(c) => c,
                Err(e) => {
                    log::warn!("protetor: decoder não subiu: {e}");
                    std::thread::sleep(Duration::from_secs(2));
                    continue;
                }
            };
            let mut enc = match spawn_ff(&ffmpeg, &enc_args, false) {
                Ok(c) => c,
                Err(e) => {
                    log::warn!("protetor: encoder não subiu: {e}");
                    kill(&mut dec);
                    std::thread::sleep(Duration::from_secs(2));
                    continue;
                }
            };
            let mut dout =
                std::io::BufReader::with_capacity(FSIZE * 2, dec.stdout.take().unwrap());
            let mut ein = enc.stdin.take().unwrap();

            *shared.scan_slot.lock().unwrap() = None; // descarta quadro pendente da conexão anterior
            let broke = pump_frames(
                &mut dout, &mut ein, &app, &running, &shared, delay_frames, max_hold, censor, &black,
                &mut head,
            );

            let _ = app.emit("leak://censor", false);
            kill(&mut enc);
            kill(&mut dec);
            let _ = broke;
            if !running.load(Ordering::Relaxed) {
                break;
            }
            std::thread::sleep(Duration::from_millis(800));
        }
        log::info!("protetor: encerrado");
    })
    .await;
}

/// O laço quente: lê um quadro, oferece o mais novo pro OCR, bufferiza N s e, ao sair, cobre o
/// segredo com o OCR DAQUELE quadro (Coverage). Devolve quando o decoder/encoder morre.
///
/// Ritmo: lê 1 / escreve 1, ditado pelo decoder (tempo real) e pelo encoder. Com NVENC (GPU, custo
/// fixo) o encoder acompanha o tempo real e o delay fica TRAVADO em `delay_frames`. Se o encoder
/// atrasar (ex.: fallback libx264 em CPU fraca), o `write_all` segura o pump (contrapressão) — o
/// delay não cresce, mas o MediaMTX pode descartar quadros. Por isso o protetor prioriza o encoder
/// de hardware. O OCR roda em OUTRA thread (na CPU) e NUNCA trava o pump (só oferece/lê via
/// `scan_slot`) — a GPU fica só com decode+encode, o que evita a disputa que matava o OCR.
#[allow(clippy::too_many_arguments)]
fn pump_frames(
    dout: &mut impl Read,
    ein: &mut impl Write,
    app: &AppHandle,
    running: &AtomicBool,
    shared: &Shared,
    delay_frames: usize,
    max_hold: u64,
    censor: bool,
    black: &[u8],
    head: &mut u64,
) -> bool {
    let mut buf: VecDeque<(u64, Vec<u8>)> = VecDeque::with_capacity(delay_frames + 4);
    let mut censoring = false;
    let mut frame = vec![0u8; FSIZE];
    loop {
        if !running.load(Ordering::Relaxed) {
            return false;
        }
        if dout.read_exact(&mut frame).is_err() {
            return true; // decoder morreu / EOF
        }
        *head += 1;
        let idx = *head;

        // Oferece o quadro mais novo pro OCR se ele estiver livre (≈ taxa de amostragem do OCR).
        if censor {
            let mut slot = shared.scan_slot.lock().unwrap();
            if slot.is_none() {
                *slot = Some((idx, frame[..YSIZE].to_vec()));
            }
        }

        buf.push_back((idx, frame.clone()));

        // Saída: quadro de `delay_frames` atrás (com as tarjas DELE), ou preto enquanto enche.
        let ok = if buf.len() > delay_frames {
            let (out_idx, mut f) = buf.pop_front().unwrap();
            let regs = if censor {
                draw_regions_for(shared, out_idx, max_hold)
            } else {
                vec![]
            };
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
            ein.write_all(black).is_ok()
        };
        if !ok {
            return true; // encoder morreu
        }
    }
}

/// Regiões a desenhar no quadro `out_idx`: o bracket das amostras vizinhas (cobre o intervalo
/// inteiro entre amostras, sem buraco e sem atraso de janela). Também poda o que já saiu.
fn draw_regions_for(shared: &Shared, out_idx: u64, max_hold: u64) -> Vec<Region> {
    let mut cov = shared.coverage.lock().unwrap();
    let regs = cov.regions_at(out_idx, max_hold, MAX_BOXES);
    cov.prune(out_idx.saturating_sub(max_hold + 2));
    regs
}

/// A thread de OCR: pega o quadro oferecido, reconhece o texto, marca o resultado pelo índice e
/// avisa (toast) no vazamento novo. O `ocr` já vem CONSTRUÍDO (build pago antes do pump airar).
fn ocr_worker(
    app: AppHandle,
    running: Arc<AtomicBool>,
    shared: Arc<Shared>,
    watchlist: Vec<String>,
    ocr: Box<dyn Ocr>,
) {
    log::info!("protetor/OCR: {}", ocr.name());
    // Warmup: paga o JIT do detector já (antes de qualquer quadro real sair).
    let _ = ocr.scan(&vec![16u8; YSIZE], COMP_W, COMP_H, &watchlist);
    let mut had_leak = false;
    while running.load(Ordering::Relaxed) {
        let job = shared.scan_slot.lock().unwrap().take();
        let Some((idx, gray)) = job else {
            std::thread::sleep(Duration::from_millis(8));
            continue;
        };
        let t = Instant::now();
        let (leaks, regions) = ocr.scan(&gray, COMP_W, COMP_H, &watchlist);
        // Diagnóstico: OCR perto do limite do buffer (tela MUITO cheia / CPU lenta) → amostragem
        // fica grossa. Avisa em vez de degradar em silêncio (o usuário pode aumentar o delay).
        if t.elapsed() > Duration::from_millis(1500) {
            log::warn!(
                "protetor/OCR: scan lento ({} ms) — tela muito cheia? considere aumentar o delay",
                t.elapsed().as_millis()
            );
        }
        shared.coverage.lock().unwrap().record(idx, regions);
        if !leaks.is_empty() && !had_leak {
            for l in &leaks {
                let _ = app.emit("leak://alert", l.clone());
            }
        }
        had_leak = !leaks.is_empty();
    }
}

// -------------------------------- Avisar -----------------------------------

/// Guardião em modo "AVISAR": OCR leve e periódico no frame do extrator (`guardlive.jpg`) +
/// toast no vazamento novo. (No modo "censurar" quem detecta+desenha é o protetor, nos frames crus.)
pub fn run_warn(app: AppHandle, running: Arc<AtomicBool>, has_signal: Arc<AtomicBool>) {
    let frame_path = crate::commands::guard_frame_path(&app);
    tauri::async_runtime::spawn_blocking(move || {
        let ocr = build_ocr(&app, false); // Windows OCR: leve, sem baixar modelo
        log::info!("guardião(avisar): OCR {}", ocr.name());
        let mut tick = 0u32;
        let mut watchlist: Vec<String> = vec![];
        let mut had_leak = false;
        while running.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(200));
            if tick % 5 == 0 {
                watchlist = crate::config::load(&app).settings.guardian_watchlist;
            }
            tick = tick.wrapping_add(1);
            if !has_signal.load(Ordering::Relaxed) {
                continue;
            }
            let jpeg = match frame_path.as_ref().and_then(|p| std::fs::read(p).ok()) {
                Some(b) if !b.is_empty() => b,
                _ => continue,
            };
            let Some((gray, w, h)) = decode_jpeg_gray(&jpeg) else {
                continue;
            };
            let (leaks, _) = ocr.scan(&gray, w, h, &watchlist);
            if !leaks.is_empty() && !had_leak {
                for l in &leaks {
                    let _ = app.emit("leak://alert", l.clone());
                }
            }
            had_leak = !leaks.is_empty();
        }
        log::info!("guardião: desligado");
    });
}
