//! Lado do OCR do guardião de privacidade.
//!
//! A bomba de quadros (delay REAL + slate preventivo) mora no `compositor` — o guardião é o
//! MESMO feed de programa, com `delay_frames > 0` e esta thread de OCR pendurada. O compositor
//! oferece o quadro mais novo em `Shared::scan_slot`; esta thread lê o texto, casa a watchlist
//! e marca por ÍNDICE de quadro em `Shared::timeline` (`domain::Timeline`); quando ESSE quadro
//! sai (N s depois), o compositor já sabe se dá slate → preventivo. O atraso do OCR fica
//! escondido pelo buffer, e o diff pula quadros que não mudaram (barato em tela estática).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use image::GrayImage;
use tauri::{AppHandle, Emitter};

use super::domain::{self, Timeline};
use super::ocr::build_ocr;
use super::Ocr;

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

/// Estado compartilhado entre a thread de OCR e a bomba do compositor. Locks curtos e NUNCA
/// aninhados.
pub(crate) struct Shared {
    /// O quadro mais novo oferecido pro OCR (índice + plano Y). O worker dá `take()` quando livre.
    pub(crate) scan_slot: Mutex<Option<(u64, Vec<u8>)>>,
    /// Linha do tempo binária "tinha segredo no quadro X?".
    pub(crate) timeline: Mutex<Timeline>,
}

impl Shared {
    pub(crate) fn new() -> Self {
        Shared {
            scan_slot: Mutex::new(None),
            timeline: Mutex::new(Timeline::new()),
        }
    }
}

/// Constrói o OCR (cache-aware; o download do modelo fica no fundo) e sobe a thread do worker.
/// `w`/`h` = dimensões do plano Y que o compositor oferece no `scan_slot`.
pub(crate) fn spawn_ocr(
    app: AppHandle,
    running: Arc<AtomicBool>,
    shared: Arc<Shared>,
    watchlist: Vec<String>,
    w: usize,
    h: usize,
) {
    tauri::async_runtime::spawn(async move {
        let app_b = app.clone();
        match tauri::async_runtime::spawn_blocking(move || build_ocr(&app_b)).await {
            Ok(ocr) => {
                tauri::async_runtime::spawn_blocking(move || {
                    ocr_worker(app, running, shared, watchlist, ocr, w, h)
                });
            }
            Err(e) => log::error!("guardião/OCR: build falhou ({e}) — sem detecção nesta sessão"),
        }
    });
}

/// Encolhe o plano Y pra o buffer de diff (DIFF_W de largura).
fn diff_small(gray: &[u8], w: usize, h: usize) -> Vec<u8> {
    match GrayImage::from_raw(w as u32, h as u32, gray.to_vec()) {
        Some(img) => {
            let nh = (h * DIFF_W / w.max(1)).max(1) as u32;
            image::imageops::resize(
                &img,
                DIFF_W as u32,
                nh,
                image::imageops::FilterType::Triangle,
            )
            .into_raw()
        }
        None => vec![],
    }
}

/// Thread de OCR: pega o quadro oferecido, PULA se a tela não mudou (diff), senão lê o texto, casa
/// a watchlist e marca por índice. Avisa (toast) quando um termo NOVO aparece.
///
/// CRÍTICO: só grava na Timeline quando REALMENTE faz OCR. Gravar `false` nos pulos punha uma
/// amostra falsa BEM perto do quadro que airava e MASCARAVA a detecção verdadeira (mais longe) →
/// o termo vazava por um instante. Sem gravar nos pulos, o bracket pega a detecção real (vizinha
/// ≤ ou >), mesmo que distante.
#[allow(clippy::too_many_arguments)]
fn ocr_worker(
    app: AppHandle,
    running: Arc<AtomicBool>,
    shared: Arc<Shared>,
    watchlist: Vec<String>,
    ocr: Box<dyn Ocr>,
    w: usize,
    h: usize,
) {
    log::info!("guardião/OCR: {}", ocr.name());
    let _ = ocr.read_text(&vec![16u8; w * h], w, h); // warmup (paga o JIT)
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
        let small = diff_small(&gray, w, h);
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
        let text = ocr.read_text(&gray, w, h);
        let leaks = domain::find_watchlist(&text, &watchlist);
        let secret = !leaks.is_empty();
        last_ocr = Instant::now();
        if t.elapsed().as_millis() > SLOW_WARN_MS {
            log::warn!(
                "guardião/OCR: scan lento ({} ms) — tela muito cheia? o slate pode atrasar",
                t.elapsed().as_millis()
            );
        }
        // Diagnóstico sem conteúdo: texto reconhecido pode conter senhas, documentos e endereços.
        if last_diag.elapsed() >= Duration::from_secs(4) {
            last_diag = Instant::now();
            log::debug!(
                "guardião/OCR diag: match={secret} chars={} matches={}",
                text.chars().count(),
                leaks.len()
            );
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
