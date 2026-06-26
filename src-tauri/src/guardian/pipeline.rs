//! Aplicação + adaptadores de I/O do guardião de privacidade.
//!
//! Segura o vídeo N s num buffer no nosso processo (delay REAL, fixo) e, na SAÍDA, troca o quadro
//! pela tela "JÁ VOLTO" quando um termo do usuário apareceu por perto. A thread de OCR lê o texto,
//! casa a watchlist e marca por ÍNDICE de quadro (`domain::Timeline`); quando ESSE quadro sai (N
//! depois), a gente já sabe se dá slate → no momento certo, preventivo. O atraso do OCR fica
//! escondido pelo buffer, e o diff pula quadros que não mudaram (barato em tela estática).
//!
//! Usa `std::process` (não o tauri shell) porque o vídeo é BINÁRIO — o shell quebraria em linhas.

use std::collections::VecDeque;
use std::io::{Read, Write};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use image::GrayImage;
use tauri::{AppHandle, Emitter, Manager};

use super::domain::{self, Timeline};
use super::ocr::build_ocr;
use super::Ocr;
use crate::engine::{self, COMP_FPS, COMP_H, COMP_W};

const FSIZE: usize = COMP_W * COMP_H * 3 / 2; // yuv420p
const YSIZE: usize = COMP_W * COMP_H; // plano Y (escala de cinza)

// Diff (pra pular OCR): resolução pequena + limiares. Sensível de propósito (erra pra MAIS OCR) —
// pega até um termo curto aparecendo, pra não depender da rede de segurança.
const DIFF_W: usize = 640;
const DIFF_PIX: u8 = 18; // ignora ruído de compressão
const DIFF_FRAC: f32 = 0.0008; // ~0,08% dos pixels mudou → re-OCR
const THROTTLE_MS: u64 = 100; // teto da taxa de diff (o buffer absorve de sobra)
// Rede de segurança: força um OCR cheio se passou TANTO sem OCR (pega mudança que o diff perdeu).
// Por tempo de PAREDE (não por nº de pulos) pra ser previsível. < delay → preventivo.
const FORCE_MS: u64 = 1200;
const SLOW_WARN_MS: u128 = 1500;

// ------------------------------ Adaptadores --------------------------------

/// Caminho do sidecar ffmpeg. O Tauri copia o externalBin pro lado do exe SEM o sufixo do triple
/// (vira `ffmpeg.exe`), tanto em dev (target/debug) quanto no bundle de produção.
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

/// Converte uma RGB → yuv420p (BT.601 limited). Usado UMA vez pra rasterizar o slate.
fn rgb_to_yuv420(rgb: &image::RgbImage) -> Vec<u8> {
    let (w, h) = (rgb.width() as usize, rgb.height() as usize);
    let mut out = vec![0u8; w * h * 3 / 2];
    let (cw, ch) = (w / 2, h / 2);
    let y_size = w * h;
    let c_size = cw * ch;
    for y in 0..h {
        for x in 0..w {
            let p = rgb.get_pixel(x as u32, y as u32);
            let (r, g, b) = (p[0] as f32, p[1] as f32, p[2] as f32);
            out[y * w + x] = (0.257 * r + 0.504 * g + 0.098 * b + 16.0).clamp(16.0, 235.0) as u8;
        }
    }
    for cy in 0..ch {
        for cx in 0..cw {
            let (mut rs, mut gs, mut bs) = (0f32, 0f32, 0f32);
            for dy in 0..2 {
                for dx in 0..2 {
                    let p = rgb.get_pixel((cx * 2 + dx) as u32, (cy * 2 + dy) as u32);
                    rs += p[0] as f32;
                    gs += p[1] as f32;
                    bs += p[2] as f32;
                }
            }
            let (r, g, b) = (rs / 4.0, gs / 4.0, bs / 4.0);
            let u = (-0.148 * r - 0.291 * g + 0.439 * b + 128.0).clamp(16.0, 240.0) as u8;
            let v = (0.439 * r - 0.368 * g - 0.071 * b + 128.0).clamp(16.0, 240.0) as u8;
            out[y_size + cy * cw + cx] = u;
            out[y_size + c_size + cy * cw + cx] = v;
        }
    }
    out
}

/// Slate "JÁ VOLTO" como quadro yuv420p (1920x1080). Usa o PNG que a UI desenhou (brb-slate.png);
/// se não houver, cor sólida da marca (papel escuro).
fn load_slate_yuv(app: &AppHandle) -> Vec<u8> {
    if let Ok(dir) = app.path().app_config_dir() {
        if let Ok(img) = image::open(dir.join("brb-slate.png")) {
            let rgb = img
                .resize_to_fill(COMP_W as u32, COMP_H as u32, image::imageops::FilterType::Triangle)
                .to_rgb8();
            return rgb_to_yuv420(&rgb);
        }
    }
    log::warn!("guardião: slate brb-slate.png ausente/inválido — usando cor sólida");
    let solid = image::RgbImage::from_pixel(COMP_W as u32, COMP_H as u32, image::Rgb([20, 16, 10]));
    rgb_to_yuv420(&solid)
}

/// Encolhe o plano Y pra o buffer de diff (DIFF_W de largura).
fn diff_small(gray: &[u8]) -> Vec<u8> {
    match GrayImage::from_raw(COMP_W as u32, COMP_H as u32, gray.to_vec()) {
        Some(img) => {
            let nh = (COMP_H * DIFF_W / COMP_W).max(1) as u32;
            image::imageops::resize(&img, DIFF_W as u32, nh, image::imageops::FilterType::Triangle)
                .into_raw()
        }
        None => vec![],
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

/// Estado compartilhado entre a thread de OCR e o pump de quadros. Locks curtos e NUNCA aninhados.
struct Shared {
    /// O quadro mais novo oferecido pro OCR (índice + plano Y). O worker dá `take()` quando livre.
    scan_slot: Mutex<Option<(u64, Vec<u8>)>>,
    /// Linha do tempo binária "tinha segredo no quadro X?".
    timeline: Mutex<Timeline>,
}

// ------------------------------- Guardião ----------------------------------

/// Roda o guardião de privacidade enquanto a transmissão estiver no ar: atrasa o vídeo (delay FIXO)
/// e troca pelo slate "JÁ VOLTO" quando um termo da `watchlist` aparece. `watchlist` é garantida
/// não-vazia pelo chamador (sem termos, a feature não roda).
pub async fn run_guard(
    app: AppHandle,
    running: Arc<AtomicBool>,
    has_signal: Arc<AtomicBool>,
    hw_codec: Option<String>,
    watchlist: Vec<String>,
) {
    let Some(ffmpeg) = ffmpeg_path() else {
        log::error!("guardião: sidecar ffmpeg não encontrado");
        return;
    };
    let cfg = crate::config::load(&app);
    let delay_sec = engine::GUARD_DELAY_SEC;
    let dec_args = engine::ffmpeg_args_for_decoder(&cfg);
    let enc_args = engine::ffmpeg_args_for_encoder(&cfg, delay_sec, hw_codec.as_deref());
    let delay_frames = (delay_sec as usize) * COMP_FPS;
    // O slate "segura" uma detecção por quase o buffer todo (~5s) → bracketa a latência do OCR
    // (até ~3-5s numa tela cheia) SEM buraco. Como os pulos não gravam, não há amostra falsa
    // mascarando; o trailing real some rápido (o próximo OCR confirma "saiu").
    let max_gap = (delay_frames as u64).saturating_sub(COMP_FPS as u64);
    log::info!(
        "guardião: delay {delay_sec}s ({delay_frames} frames), {COMP_W}x{COMP_H}@{COMP_FPS}, termos={}, hw={hw_codec:?}",
        watchlist.len()
    );

    let slate = Arc::new(load_slate_yuv(&app));
    let shared = Arc::new(Shared {
        scan_slot: Mutex::new(None),
        timeline: Mutex::new(Timeline::new()),
    });

    // Constrói o OCR ANTES do pump airar (cache-aware → retorna rápido; download fica no fundo).
    let app_b = app.clone();
    match tauri::async_runtime::spawn_blocking(move || build_ocr(&app_b)).await {
        Ok(ocr) => {
            let (app_o, run_o, sh_o, wl) =
                (app.clone(), running.clone(), shared.clone(), watchlist);
            tauri::async_runtime::spawn_blocking(move || ocr_worker(app_o, run_o, sh_o, wl, ocr));
        }
        Err(e) => log::error!("guardião/OCR: build falhou ({e}) — sem detecção nesta sessão"),
    }

    let _ = tauri::async_runtime::spawn_blocking(move || {
        let black = black_frame();
        let mut head: u64 = 0; // índice monotônico — NÃO zera nos reconnects (Timeline coerente)
        while running.load(Ordering::Relaxed) {
            if !has_signal.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(400));
                continue;
            }
            let mut dec = match spawn_ff(&ffmpeg, &dec_args, true) {
                Ok(c) => c,
                Err(e) => {
                    log::warn!("guardião: decoder não subiu: {e}");
                    std::thread::sleep(Duration::from_secs(2));
                    continue;
                }
            };
            let mut enc = match spawn_ff(&ffmpeg, &enc_args, false) {
                Ok(c) => c,
                Err(e) => {
                    log::warn!("guardião: encoder não subiu: {e}");
                    kill(&mut dec);
                    std::thread::sleep(Duration::from_secs(2));
                    continue;
                }
            };
            let mut dout =
                std::io::BufReader::with_capacity(FSIZE * 2, dec.stdout.take().unwrap());
            let mut ein = enc.stdin.take().unwrap();

            *shared.scan_slot.lock().unwrap() = None;
            let _ = pump_frames(
                &mut dout, &mut ein, &app, &running, &shared, delay_frames, max_gap, &slate, &black,
                &mut head,
            );

            let _ = app.emit("leak://censor", false);
            kill(&mut enc);
            kill(&mut dec);
            if !running.load(Ordering::Relaxed) {
                break;
            }
            std::thread::sleep(Duration::from_millis(800));
        }
        log::info!("guardião: encerrado");
    })
    .await;
}

/// Laço quente: lê um quadro, oferece o mais novo pro OCR, bufferiza N s e, ao sair, troca pelo
/// slate se a `Timeline` mandar. Ritmo ditado pelo decoder (tempo real) + encoder (NVENC acompanha;
/// o OCR roda em OUTRA thread e nunca trava o pump). Devolve quando o decoder/encoder morre.
#[allow(clippy::too_many_arguments)]
fn pump_frames(
    dout: &mut impl Read,
    ein: &mut impl Write,
    app: &AppHandle,
    running: &AtomicBool,
    shared: &Shared,
    delay_frames: usize,
    max_gap: u64,
    slate: &[u8],
    black: &[u8],
    head: &mut u64,
) -> bool {
    let mut buf: VecDeque<(u64, Vec<u8>)> = VecDeque::with_capacity(delay_frames + 4);
    let mut censoring = false;
    loop {
        if !running.load(Ordering::Relaxed) {
            return false;
        }
        let mut frame = vec![0u8; FSIZE];
        if dout.read_exact(&mut frame).is_err() {
            return true; // decoder morreu / EOF
        }
        *head += 1;
        let idx = *head;

        if let Ok(mut slot) = shared.scan_slot.lock() {
            if slot.is_none() {
                *slot = Some((idx, frame[..YSIZE].to_vec()));
            }
        }
        buf.push_back((idx, frame));

        let ok = if buf.len() > delay_frames {
            let (out_idx, f) = buf.pop_front().unwrap();
            let slate_on = {
                let mut tl = shared.timeline.lock().unwrap();
                let s = tl.should_censor(out_idx, max_gap);
                tl.prune(out_idx.saturating_sub(max_gap + 2));
                s
            };
            if slate_on != censoring {
                censoring = slate_on;
                let _ = app.emit("leak://censor", slate_on);
            }
            let out: &[u8] = if slate_on { slate } else { &f };
            ein.write_all(out).is_ok()
        } else {
            ein.write_all(black).is_ok()
        };
        if !ok {
            return true; // encoder morreu
        }
    }
}

/// Thread de OCR: pega o quadro oferecido, PULA se a tela não mudou (diff), senão lê o texto, casa
/// a watchlist e marca por índice. Avisa (toast) quando um termo NOVO aparece.
///
/// CRÍTICO: só grava na Timeline quando REALMENTE faz OCR. Gravar `false` nos pulos punha uma
/// amostra falsa BEM perto do quadro que airava e MASCARAVA a detecção verdadeira (mais longe) →
/// o termo vazava por um instante. Sem gravar nos pulos, o bracket pega a detecção real (vizinha
/// ≤ ou >), mesmo que distante.
fn ocr_worker(
    app: AppHandle,
    running: Arc<AtomicBool>,
    shared: Arc<Shared>,
    watchlist: Vec<String>,
    ocr: Box<dyn Ocr>,
) {
    log::info!("guardião/OCR: {}", ocr.name());
    let _ = ocr.read_text(&vec![16u8; YSIZE], COMP_W, COMP_H); // warmup (paga o JIT)
    let mut last_small: Vec<u8> = vec![];
    let mut had_secret = false;
    let mut last_ocr = Instant::now();
    let mut last_diag = Instant::now();
    while running.load(Ordering::Relaxed) {
        let iter = Instant::now();
        let job = shared.scan_slot.lock().unwrap().take();
        let Some((idx, gray)) = job else {
            std::thread::sleep(Duration::from_millis(8));
            continue;
        };
        let small = diff_small(&gray);
        // Faz OCR se a tela MUDOU OU se faz tempo demais sem OCR (rede de segurança por tempo).
        let force = last_ocr.elapsed() >= Duration::from_millis(FORCE_MS);
        let changed = force || domain::frames_differ(&last_small, &small, DIFF_PIX, DIFF_FRAC);
        last_small = small;
        if !changed {
            // Tela igual → NÃO grava nada (não mascara a detecção real). Só descansa.
            let spent = iter.elapsed();
            if spent < Duration::from_millis(THROTTLE_MS) {
                std::thread::sleep(Duration::from_millis(THROTTLE_MS) - spent);
            }
            continue;
        }
        let t = Instant::now();
        let text = ocr.read_text(&gray, COMP_W, COMP_H);
        let leaks = domain::find_watchlist(&text, &watchlist);
        let secret = !leaks.is_empty();
        last_ocr = Instant::now();
        if t.elapsed().as_millis() > SLOW_WARN_MS {
            log::warn!(
                "guardião/OCR: scan lento ({} ms) — tela muito cheia? o slate pode atrasar",
                t.elapsed().as_millis()
            );
        }
        // Diagnóstico (a cada ~4s): mostra match + um trecho do que o OCR LEU. Ajuda a saber se a
        // falha é de LEITURA (o termo nem aparece no texto) ou de CASAMENTO. Log local (sua tela).
        if last_diag.elapsed() >= Duration::from_secs(4) {
            last_diag = Instant::now();
            let sample: String = text.chars().take(300).collect::<String>().replace('\n', " ");
            log::info!("guardião/OCR diag: match={secret} chars={} | leu: {sample}", text.len());
        }
        shared.timeline.lock().unwrap().record(idx, secret);
        if secret && !had_secret {
            for l in &leaks {
                let _ = app.emit("leak://alert", l.clone());
            }
        }
        had_secret = secret;

        let spent = iter.elapsed();
        if spent < Duration::from_millis(THROTTLE_MS) {
            std::thread::sleep(Duration::from_millis(THROTTLE_MS) - spent);
        }
    }
}
