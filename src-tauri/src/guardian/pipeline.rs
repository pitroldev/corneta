//! Lado do OCR do guardião de privacidade.
//!
//! A bomba de quadros (delay REAL + slate preventivo) mora no `compositor` — o guardião é o
//! MESMO feed de programa, com `delay_frames > 0` e esta thread de OCR pendurada. O compositor
//! oferece o quadro mais novo em `Shared::scan_slot`; esta thread lê o texto, casa a watchlist
//! e marca por ÍNDICE de quadro em `Shared::timeline` (`domain::Timeline`); quando ESSE quadro
//! sai (N s depois), o compositor já sabe se dá slate → preventivo. O atraso do OCR fica
//! escondido pelo buffer, e o diff pula quadros que não mudaram (barato em tela estática).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

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
    scan_slot: Mutex<Option<(u64, Vec<u8>)>>,
    scan_ready: Condvar,
    /// Um único buffer reciclado evita alocar ~2 MiB a cada amostra em 1080p.
    scan_pool: Mutex<Option<Vec<u8>>>,
    /// Linha do tempo binária "tinha segredo no quadro X?".
    pub(crate) timeline: Mutex<Timeline>,
}

impl Shared {
    pub(crate) fn new() -> Self {
        Shared {
            scan_slot: Mutex::new(None),
            scan_ready: Condvar::new(),
            scan_pool: Mutex::new(None),
            timeline: Mutex::new(Timeline::new()),
        }
    }

    pub(crate) fn offer_scan(&self, idx: u64, gray: &[u8]) {
        // Há um único produtor (o compositor). Verificar antes de copiar poupa trabalho quando o
        // OCR ainda está ocupado; o segundo teste mantém a operação robusta caso isso mude.
        if self.scan_slot.lock().unwrap().is_some() {
            return;
        }
        let mut buffer = self.scan_pool.lock().unwrap().take().unwrap_or_default();
        buffer.clear();
        buffer.extend_from_slice(gray);
        let mut slot = self.scan_slot.lock().unwrap();
        if slot.is_none() {
            *slot = Some((idx, buffer));
            self.scan_ready.notify_one();
        } else {
            drop(slot);
            self.recycle_scan(buffer);
        }
    }

    fn take_scan(&self, running: &AtomicBool) -> Option<(u64, Vec<u8>)> {
        let slot = self.scan_slot.lock().unwrap();
        let (mut slot, _) = self
            .scan_ready
            .wait_timeout_while(slot, Duration::from_millis(250), |slot| {
                slot.is_none() && running.load(Ordering::Relaxed)
            })
            .unwrap();
        if running.load(Ordering::Relaxed) {
            slot.take()
        } else {
            None
        }
    }

    fn recycle_scan(&self, mut buffer: Vec<u8>) {
        buffer.clear();
        *self.scan_pool.lock().unwrap() = Some(buffer);
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

/// Encolhe o plano Y para o diff sem copiar o quadro inteiro para um `GrayImage`. A média da
/// célula visita cada pixel de origem uma vez e não perde traços finos entre pontos de amostragem.
fn diff_small_into(gray: &[u8], w: usize, h: usize, out: &mut Vec<u8>) {
    if w == 0 || h == 0 || gray.len() < w.saturating_mul(h) {
        out.clear();
        return;
    }
    let dw = DIFF_W.min(w);
    let dh = (h * dw / w).max(1).min(h);
    out.resize(dw * dh, 0);
    if dw == w && dh == h {
        out.copy_from_slice(&gray[..w * h]);
        return;
    }
    for dy in 0..dh {
        let y0 = dy * h / dh;
        let y1 = ((dy + 1) * h / dh).max(y0 + 1);
        let dst = &mut out[dy * dw..(dy + 1) * dw];
        for (dx, value) in dst.iter_mut().enumerate() {
            let x0 = dx * w / dw;
            let x1 = ((dx + 1) * w / dw).max(x0 + 1);
            let mut sum = 0u32;
            for sy in y0..y1 {
                sum += gray[sy * w + x0..sy * w + x1]
                    .iter()
                    .map(|pixel| *pixel as u32)
                    .sum::<u32>();
            }
            *value = (sum / ((x1 - x0) * (y1 - y0)) as u32) as u8;
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
    let watchlist = domain::prepare_watchlist(&watchlist);
    let mut last_small: Vec<u8> = vec![];
    let mut small: Vec<u8> = vec![];
    let mut had_secret = false;
    let mut last_ocr = Instant::now();
    let mut last_diag = Instant::now();
    while running.load(Ordering::Relaxed) {
        let iter = Instant::now();
        let job = shared.take_scan(&running);
        let Some((idx, gray)) = job else {
            continue;
        };
        diff_small_into(&gray, w, h, &mut small);
        // Faz OCR se a tela MUDOU OU se faz tempo demais sem OCR (rede de segurança por tempo).
        let force = last_ocr.elapsed() >= Duration::from_millis(FORCE_MS);
        let changed = force || domain::frames_differ(&last_small, &small, DIFF_PIX, DIFF_FRAC);
        std::mem::swap(&mut last_small, &mut small);
        if !changed {
            shared.recycle_scan(gray);
            // Tela igual → NÃO grava nada (não mascara a detecção real). Só descansa.
            let spent = iter.elapsed();
            if spent < Duration::from_millis(THROTTLE_MS) {
                std::thread::sleep(Duration::from_millis(THROTTLE_MS) - spent);
            }
            continue;
        }
        let t = Instant::now();
        let text = ocr.read_text(&gray, w, h);
        let leaks = domain::find_prepared_watchlist(&text, &watchlist);
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
        shared.recycle_scan(gray);

        let spent = iter.elapsed();
        if spent < Duration::from_millis(THROTTLE_MS) {
            std::thread::sleep(Duration::from_millis(THROTTLE_MS) - spent);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::diff_small_into;

    #[test]
    fn diff_resize_preserves_uniform_frame_and_reuses_buffer() {
        let frame = vec![73u8; 1920 * 12];
        let mut out = Vec::new();
        diff_small_into(&frame, 1920, 12, &mut out);
        assert_eq!(out.len(), 640 * 4);
        assert!(out.iter().all(|value| *value == 73));
        let capacity = out.capacity();

        diff_small_into(&frame, 1920, 12, &mut out);
        assert_eq!(out.capacity(), capacity);
    }

    #[test]
    fn diff_resize_clears_output_for_invalid_input() {
        let mut out = vec![1, 2, 3];
        diff_small_into(&[0; 3], 2, 2, &mut out);
        assert!(out.is_empty());
    }
}
