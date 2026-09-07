//! OCR results use compositor frame indices so delayed output retains the matching privacy verdict.

use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};

use super::domain::{self, Timeline};
use super::ocr::build_ocr;
use super::{GuardianStatus, Ocr};

// Sensitive thresholds favor extra scans over missing a short term.
const DIFF_W: usize = 640;
const DIFF_PIX: u8 = 18; // Ignore compression noise.
const DIFF_FRAC: f32 = 0.0008;
const THROTTLE_MS: u64 = 100;
// A wall-clock rescan deadline catches changes below the diff threshold.
const FORCE_MS: u64 = 1200;
const SLOW_WARN_MS: u128 = 1500;

// Keep these locks short and never nest them.
pub(crate) struct Shared {
    scan_slot: Mutex<Option<(u64, Vec<u8>)>>,
    scan_ready: Condvar,
    // Recycle one buffer rather than allocate roughly 2 MiB per 1080p scan.
    scan_pool: Mutex<Option<Vec<u8>>>,
    pub(crate) timeline: Mutex<Timeline>,
    failed: AtomicBool,
    status: AtomicU8,
}

impl Shared {
    pub(crate) fn new() -> Self {
        let mut timeline = Timeline::new();
        timeline.start_verification();
        Shared {
            scan_slot: Mutex::new(None),
            scan_ready: Condvar::new(),
            scan_pool: Mutex::new(None),
            timeline: Mutex::new(timeline),
            failed: AtomicBool::new(false),
            status: AtomicU8::new(GuardianStatus::Starting as u8),
        }
    }

    pub(crate) fn publish_status(
        &self,
        app: &AppHandle,
        running: &Arc<AtomicBool>,
        status: GuardianStatus,
    ) {
        if self.status.load(Ordering::Relaxed) == status as u8 {
            return;
        }
        let state = app.state::<crate::AppState>();
        let mut engine = state.engine.lock().unwrap();
        // A worker can finish after Stop or after a replacement session starts.
        if !engine.live
            || !running.load(Ordering::Relaxed)
            || !Arc::ptr_eq(&engine.running, running)
        {
            return;
        }
        if let Some(snapshot) = engine.snapshot.as_mut() {
            // Serialize the cached value and IPC publication with the same engine lock.
            // A worker and compositor publishing opposite transitions must not reorder them.
            if self.status.swap(status as u8, Ordering::Relaxed) == status as u8 {
                return;
            }
            snapshot.guardian_status = Some(status);
            let _ = app.emit("engine://status", &*snapshot);
        }
    }

    pub(crate) fn coverage(&self, index: u64, max_gap: u64) -> (bool, GuardianStatus) {
        let mut timeline = self.timeline.lock().unwrap();
        let status = if self.failed.load(Ordering::Relaxed)
            || (timeline.has_verified() && timeline.unverified(index, max_gap))
        {
            GuardianStatus::Unavailable
        } else if !timeline.has_verified() {
            GuardianStatus::Starting
        } else {
            GuardianStatus::Ready
        };
        let censor = timeline.should_censor(index, max_gap);
        timeline.prune(index.saturating_sub(max_gap + 2));
        (censor, status)
    }

    fn mark_failed(&self) {
        self.timeline.lock().unwrap().record_unavailable();
        self.failed.store(true, Ordering::Relaxed);
    }

    pub(crate) fn offer_scan(&self, idx: u64, gray: &[u8]) {
        // Avoid copying while the worker is busy; recheck after copying before publishing.
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

pub(crate) fn spawn_ocr(
    app: AppHandle,
    running: Arc<AtomicBool>,
    shared: Arc<Shared>,
    watchlist: Vec<String>,
    w: usize,
    h: usize,
) {
    tauri::async_runtime::spawn(async move {
        let (worker_app, worker_running, worker_shared) =
            (app.clone(), running.clone(), shared.clone());
        let result = tauri::async_runtime::spawn_blocking(move || {
            let ocr = build_ocr(&worker_app);
            ocr_worker(
                worker_app,
                worker_running,
                worker_shared,
                watchlist,
                ocr,
                w,
                h,
            );
        })
        .await;
        if result.is_err() {
            shared.mark_failed();
            shared.publish_status(&app, &running, GuardianStatus::Unavailable);
            log::error!("guardian/OCR: worker unavailable; unverified images will remain covered");
        }
    });
}

// Average source cells without a full-frame copy or gaps that could miss thin text strokes.
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

// Only real OCR results may enter the timeline; marking skipped scans clean hides nearby detections.
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
    log::info!("guardian/OCR: {}", ocr.name());
    if ocr.read_text(&vec![16u8; w * h], w, h).is_err() {
        shared.mark_failed();
        shared.publish_status(&app, &running, GuardianStatus::Unavailable);
    }
    let watchlist = domain::prepare_watchlist(&watchlist);
    let mut last_small: Vec<u8> = vec![];
    let mut small: Vec<u8> = vec![];
    let mut had_secret = false;
    let mut last_ocr = Instant::now();
    let mut last_diag = Instant::now();
    let mut last_failure: Option<Instant> = None;
    while running.load(Ordering::Relaxed) {
        let iter = Instant::now();
        let job = shared.take_scan(&running);
        let Some((idx, gray)) = job else {
            continue;
        };
        // Failure retry is bounded even when every incoming frame changes.
        if last_failure.is_some_and(|at| at.elapsed() < Duration::from_millis(FORCE_MS)) {
            shared.recycle_scan(gray);
            std::thread::sleep(Duration::from_millis(THROTTLE_MS));
            continue;
        }
        diff_small_into(&gray, w, h, &mut small);
        let force = last_failure.is_some() || last_ocr.elapsed() >= Duration::from_millis(FORCE_MS);
        let changed = force || domain::frames_differ(&last_small, &small, DIFF_PIX, DIFF_FRAC);
        std::mem::swap(&mut last_small, &mut small);
        if !changed {
            shared.recycle_scan(gray);
            let spent = iter.elapsed();
            if spent < Duration::from_millis(THROTTLE_MS) {
                std::thread::sleep(Duration::from_millis(THROTTLE_MS) - spent);
            }
            continue;
        }
        let t = Instant::now();
        let text = match ocr.read_text(&gray, w, h) {
            Ok(text) => {
                last_failure = None;
                text
            }
            Err(error) => {
                if last_failure.is_none() {
                    log::warn!("guardian/OCR: recognition unavailable ({error:?})");
                }
                last_failure = Some(Instant::now());
                shared.mark_failed();
                shared.publish_status(&app, &running, GuardianStatus::Unavailable);
                shared.recycle_scan(gray);
                continue;
            }
        };
        let leaks = domain::find_prepared_watchlist(&text, &watchlist);
        let secret = !leaks.is_empty();
        last_ocr = Instant::now();
        if t.elapsed().as_millis() > SLOW_WARN_MS {
            log::warn!(
                "guardian/OCR: slow scan ({} ms); cover output may lag",
                t.elapsed().as_millis()
            );
        }
        // Recognized text may contain secrets or personal data; log counts only.
        if last_diag.elapsed() >= Duration::from_secs(4) {
            last_diag = Instant::now();
            log::debug!(
                "guardian/OCR diag: match={secret} chars={} matches={}",
                text.chars().count(),
                leaks.len()
            );
        }
        shared.timeline.lock().unwrap().record(idx, secret);
        shared.failed.store(false, Ordering::Relaxed);
        if secret && !had_secret {
            let state = app.state::<crate::AppState>();
            let engine = state.engine.lock().unwrap();
            if engine.live
                && running.load(Ordering::Relaxed)
                && Arc::ptr_eq(&engine.running, &running)
            {
                for l in &leaks {
                    let _ = app.emit("leak://alert", l.clone());
                }
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
    use super::{diff_small_into, Shared};
    use crate::guardian::GuardianStatus;
    use std::sync::atomic::Ordering;

    #[test]
    fn failed_scan_does_not_clear_a_positive_and_coverage_recovers_by_frame() {
        let shared = Shared::new();
        assert_eq!(shared.coverage(0, 90), (true, GuardianStatus::Starting));
        shared.timeline.lock().unwrap().record(10, true);
        shared.mark_failed();
        assert_eq!(shared.coverage(20, 90), (true, GuardianStatus::Unavailable));
        assert_eq!(
            shared.coverage(500, 90),
            (true, GuardianStatus::Unavailable)
        );
        // Successful empty OCR is a valid result, but only for the newly verified frame.
        shared.timeline.lock().unwrap().record(600, false);
        shared.failed.store(false, Ordering::Relaxed);
        assert_eq!(
            shared.coverage(599, 90),
            (true, GuardianStatus::Unavailable)
        );
        assert_eq!(shared.coverage(600, 90), (false, GuardianStatus::Ready));
        assert_eq!(
            shared.coverage(691, 90),
            (true, GuardianStatus::Unavailable)
        );
    }

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
