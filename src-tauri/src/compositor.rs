//! A continuously paced program encoder keeps destination connections alive while OBS reconnects.
//! Each emitted frame consumes matching PCM; delayed video and audio drain together.
//! Use binary process pipes rather than the line-oriented Tauri shell; audio enters over loopback TCP.

use std::collections::VecDeque;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, SyncSender, TryRecvError, TrySendError};
use std::sync::Arc;
use std::time::{Duration, Instant};

use bytes::Bytes;
use tauri::{AppHandle, Emitter, Manager};

use crate::engine::{self, ProgramSpec};
use crate::guardian;
use crate::queue_probe::{QueueProbe, Timed};
use crate::telemetry::AppError;
use crate::AppState;

#[derive(Debug, PartialEq, Eq)]
enum FrameMode {
    ManualPause,
    CoveredImage,
    Live,
}

fn frame_mode(forced: bool, censor: bool) -> FrameMode {
    if forced {
        FrameMode::ManualPause
    } else if censor {
        FrameMode::CoveredImage
    } else {
        FrameMode::Live
    }
}

fn emit_censor(app: &AppHandle, running: &Arc<AtomicBool>, censor: bool) {
    let state = app.state::<AppState>();
    let engine = state.engine.lock().unwrap();
    if Arc::ptr_eq(&engine.running, running)
        && (!censor || (engine.live && running.load(Ordering::Relaxed)))
    {
        let _ = app.emit("leak://censor", censor);
    }
}

fn capture_compositor_error(app: &AppHandle, code: &str, retryable: bool) {
    let state = app.state::<AppState>();
    let operation_id = state.engine.lock().unwrap().operation_id.clone();
    state.telemetry.capture_error(
        AppError::new(code, "compositor", retryable, None),
        operation_id.as_deref(),
        true,
        "error",
    );
}

/// Briefly freeze the last frame to bridge small input stalls before showing the slate.
const HOLD_MS: u64 = 500;
/// Drain already buffered content when new input stops.
const DRAIN_MS: u64 = 250;
const RESPAWN_MS: u64 = 1500;

pub enum Slate {
    /// A pre-rasterized yuv420p frame.
    Still(Vec<u8>),
    Video {
        path: String,
        has_audio: bool,
    },
}

pub struct CompositorOpts {
    pub spec: ProgramSpec,
    /// Zero disables delay; Guardian uses GUARD_DELAY_SEC.
    pub delay_sec: u32,
    pub hw_codec: Option<String>,
    /// An empty watchlist disables OCR and privacy coverage.
    pub watchlist: Vec<String>,
    pub slate: Slate,
    /// Manual pause replaces program audio as well as video, preventing microphone exposure.
    pub force_slate: Arc<AtomicBool>,
}

enum GenExit {
    Stop,
    EncoderDied,
    SetupFailed,
}

/// Tauri places externalBin beside the executable without its target-triple suffix.
fn ffmpeg_path() -> Option<std::path::PathBuf> {
    let dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    let name = if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };
    let p = dir.join(name);
    p.exists().then_some(p)
}

fn spawn_ff(
    ffmpeg: &std::path::Path,
    args: &[String],
    pipe_out: bool,
    tag: Option<&'static str>,
) -> std::io::Result<Child> {
    let mut cmd = Command::new(ffmpeg);
    cmd.args(args);
    if pipe_out {
        cmd.stdout(Stdio::piped()).stdin(Stdio::null());
    } else {
        cmd.stdin(Stdio::piped()).stdout(Stdio::null());
    }
    if tag.is_some() {
        cmd.stderr(Stdio::piped());
    } else {
        cmd.stderr(Stdio::null());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = cmd.spawn()?;
    if let (Some(tag), Some(err)) = (tag, child.stderr.take()) {
        std::thread::spawn(move || {
            use std::io::BufRead;
            for line in std::io::BufReader::new(err).lines().map_while(Result::ok) {
                let t = line.trim();
                if !t.is_empty() {
                    log::warn!("compositor/{tag}: {t}");
                }
            }
        });
    }
    Ok(child)
}

fn kill(child: &mut Child) {
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

struct FrameSource {
    rx: Receiver<Timed<Bytes>>,
    child: Child,
}

struct ByteSource {
    rx: Receiver<Timed<Vec<u8>>>,
    child: Child,
}

fn spawn_frame_source(
    ffmpeg: &std::path::Path,
    args: &[String],
    fsize: usize,
    tag: Option<&'static str>,
) -> std::io::Result<FrameSource> {
    let mut child = spawn_ff(ffmpeg, args, true, tag)?;
    let mut out = std::io::BufReader::with_capacity(fsize * 2, child.stdout.take().unwrap());
    let (tx, rx) = std::sync::mpsc::sync_channel(4);
    let probe = QueueProbe::new("decoder/video");
    let pool = crate::frame_pool::FramePool::new(fsize, 8);
    std::thread::spawn(move || loop {
        let mut frame = pool.take();
        if out.read_exact(frame.as_mut_slice()).is_err() {
            return;
        }
        if tx.send(probe.track(frame.freeze())).is_err() {
            return;
        }
    });
    Ok(FrameSource { rx, child })
}

fn spawn_byte_source(ffmpeg: &std::path::Path, args: &[String]) -> std::io::Result<ByteSource> {
    let mut child = spawn_ff(ffmpeg, args, true, None)?;
    let mut out = child.stdout.take().unwrap();
    let (tx, rx) = std::sync::mpsc::sync_channel(64);
    let probe = QueueProbe::new("decoder/audio");
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match out.read(&mut buf) {
                Ok(0) | Err(_) => return,
                Ok(n) => {
                    if tx.send(probe.track(buf[..n].to_vec())).is_err() {
                        return;
                    }
                }
            }
        }
    });
    Ok(ByteSource { rx, child })
}

fn drain_frames(src: &mut Option<FrameSource>, mut on_frame: impl FnMut(Bytes)) -> (usize, bool) {
    let Some(s) = src.as_mut() else {
        return (0, false);
    };
    let mut got = 0usize;
    let mut dead = false;
    loop {
        match s.rx.try_recv() {
            Ok(f) => {
                got += 1;
                on_frame(f.into_inner());
            }
            Err(TryRecvError::Empty) => break,
            Err(TryRecvError::Disconnected) => {
                dead = true;
                break;
            }
        }
    }
    if dead {
        if let Some(mut s) = src.take() {
            kill(&mut s.child);
        }
    }
    (got, dead)
}

fn drain_audio(src: &mut Option<ByteSource>, fifo: &mut VecDeque<u8>, cap: usize) -> bool {
    let Some(s) = src.as_mut() else {
        return false;
    };
    let mut dead = false;
    loop {
        match s.rx.try_recv() {
            Ok(chunk) => fifo.extend(chunk.into_inner()),
            Err(TryRecvError::Empty) => break,
            Err(TryRecvError::Disconnected) => {
                dead = true;
                break;
            }
        }
    }
    let excess = fifo.len().saturating_sub(cap);
    if excess > 0 {
        fifo.drain(..excess);
    }
    if dead {
        if let Some(mut s) = src.take() {
            kill(&mut s.child);
        }
    }
    dead
}

fn take_audio(fifo: &mut VecDeque<u8>, n: usize) -> Vec<u8> {
    let mut out = vec![0; n];
    let avail = fifo.len().min(n);
    if avail > 0 {
        let (front, back) = fifo.as_slices();
        let front_len = front.len().min(avail);
        out[..front_len].copy_from_slice(&front[..front_len]);
        let back_len = avail - front_len;
        if back_len > 0 {
            out[front_len..avail].copy_from_slice(&back[..back_len]);
        }
        fifo.drain(..avail);
    }
    out
}

/// Restore audio bytes == buffered frames * bytes_per_frame after either decoder respawns.
fn repair_pairing(afifo: &mut VecDeque<u8>, want: usize) {
    if afifo.len() > want {
        afifo.truncate(want);
    } else {
        afifo.resize(want, 0);
    }
}

/// Limited-range YUV black: Y=16, U=V=128.
fn black_frame(spec: &ProgramSpec) -> Vec<u8> {
    let ysize = (spec.w as usize) * (spec.h as usize);
    let mut f = vec![128u8; spec.frame_size()];
    for p in f.iter_mut().take(ysize) {
        *p = 16;
    }
    f
}

/// Convert a slate once to BT.601 limited-range yuv420p.
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

pub fn load_slate_still(
    app: &AppHandle,
    spec: &ProgramSpec,
    path: Option<&std::path::Path>,
) -> Vec<u8> {
    let candidate = path.map(|p| p.to_path_buf()).or_else(|| {
        app.path()
            .app_config_dir()
            .ok()
            .map(|d| d.join("brb-slate.png"))
    });
    if let Some(p) = candidate {
        if let Ok(img) = image::open(&p) {
            let rgb = img
                .resize_to_fill(spec.w, spec.h, image::imageops::FilterType::Triangle)
                .to_rgb8();
            return rgb_to_yuv420(&rgb);
        }
    }
    log::warn!("compositor: missing or invalid slate; using a solid color");
    let solid = image::RgbImage::from_pixel(spec.w, spec.h, image::Rgb([20, 16, 10]));
    rgb_to_yuv420(&solid)
}

/// Wait for real OBS content before first publishing; keep output continuous afterward.
pub async fn run(
    app: AppHandle,
    running: Arc<AtomicBool>,
    has_signal: Arc<AtomicBool>,
    slate_on: Arc<AtomicBool>,
    opts: CompositorOpts,
) {
    let _ = tauri::async_runtime::spawn_blocking(move || {
        let Some(ffmpeg) = ffmpeg_path() else {
            log::error!("compositor: ffmpeg sidecar not found");
            capture_compositor_error(&app, "compositor_ffmpeg_missing", false);
            return;
        };
        let cfg = crate::config::load(&app);
        let spec = opts.spec;
        let delay_frames = (opts.delay_sec as usize) * (spec.fps as usize);
        // Coverage spans nearly the full delay buffer; keep this aligned with Guardian sampling.
        let max_gap = (delay_frames as u64).saturating_sub(spec.fps as u64);
        log::info!(
            "compositor: {}x{}@{} {}kbps delay={}s hw={:?} terms={} slate={}",
            spec.w,
            spec.h,
            spec.fps,
            spec.video_kbps,
            opts.delay_sec,
            opts.hw_codec,
            opts.watchlist.len(),
            match &opts.slate {
                Slate::Still(_) => "image",
                Slate::Video { .. } => "video",
            },
        );

        let shared = if opts.watchlist.is_empty() {
            None
        } else {
            let sh = Arc::new(guardian::Shared::new());
            guardian::spawn_ocr(
                app.clone(),
                running.clone(),
                sh.clone(),
                opts.watchlist.clone(),
                spec.w as usize,
                spec.h as usize,
            );
            Some(sh)
        };

        let still = match &opts.slate {
            Slate::Still(f) => f.clone(),
            Slate::Video { .. } => {
                let solid = image::RgbImage::from_pixel(spec.w, spec.h, image::Rgb([20, 16, 10]));
                rgb_to_yuv420(&solid)
            }
        };

        let mut head: u64 = 0; // Keep frame indices monotonic across encoder generations for the privacy timeline.
        let mut censoring = false;
        while running.load(Ordering::Relaxed) {
            let exit = generation(
                &app,
                &ffmpeg,
                &cfg,
                &spec,
                delay_frames,
                max_gap,
                &opts,
                &still,
                shared.as_deref(),
                &running,
                &has_signal,
                &slate_on,
                &mut head,
                &mut censoring,
            );
            match exit {
                GenExit::Stop => break,
                GenExit::EncoderDied => {
                    log::warn!("compositor: program encoder exited; restarting");
                    capture_compositor_error(&app, "compositor_encoder_died", true);
                    std::thread::sleep(Duration::from_millis(500));
                }
                GenExit::SetupFailed => {
                    capture_compositor_error(&app, "compositor_setup_failed", true);
                    std::thread::sleep(Duration::from_secs(2));
                }
            }
        }
        if censoring {
            emit_censor(&app, &running, false);
        }
        slate_on.store(false, Ordering::Relaxed);
        log::info!("compositor: stopped");
    })
    .await;
}

#[allow(clippy::too_many_arguments)]
fn generation(
    app: &AppHandle,
    ffmpeg: &std::path::Path,
    cfg: &crate::config::AppConfig,
    spec: &ProgramSpec,
    delay_frames: usize,
    max_gap: u64,
    opts: &CompositorOpts,
    still: &[u8],
    shared: Option<&guardian::Shared>,
    running: &Arc<AtomicBool>,
    has_signal: &AtomicBool,
    slate_on: &AtomicBool,
    head: &mut u64,
    censoring: &mut bool,
) -> GenExit {
    let fsize = spec.frame_size();
    let abpf = spec.audio_bytes_per_frame();
    let ysize = (spec.w as usize) * (spec.h as usize);
    // Reserve delayed audio plus three seconds of decoder jitter.
    let audio_cap = (opts.delay_sec as usize + 3) * (abpf * spec.fps as usize);

    while !has_signal.load(Ordering::Relaxed) {
        if !running.load(Ordering::Relaxed) {
            return GenExit::Stop;
        }
        std::thread::sleep(Duration::from_millis(300));
    }

    // Do not publish before receiving the first real frame.
    let mut vsrc = match spawn_frame_source(
        ffmpeg,
        &engine::ffmpeg_args_for_decoder(cfg, spec),
        fsize,
        Some("decoder"),
    ) {
        Ok(s) => Some(s),
        Err(e) => {
            log::warn!("compositor: video decoder could not start: {e}");
            return GenExit::SetupFailed;
        }
    };
    let mut asrc = spawn_byte_source(ffmpeg, &engine::ffmpeg_args_for_audio_decoder(cfg)).ok();
    let mut a_spawned_at = Instant::now();
    let mut a_fast_deaths = 0u32;

    let first = {
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            if !running.load(Ordering::Relaxed) {
                if let Some(mut s) = vsrc.take() {
                    kill(&mut s.child);
                }
                if let Some(mut s) = asrc.take() {
                    kill(&mut s.child);
                }
                return GenExit::Stop;
            }
            match vsrc
                .as_ref()
                .map(|s| s.rx.recv_timeout(Duration::from_millis(150)))
            {
                Some(Ok(f)) => break f,
                Some(Err(std::sync::mpsc::RecvTimeoutError::Timeout)) => {
                    if Instant::now() > deadline {
                        log::warn!("compositor: decoder produced no frame within 10s; retrying");
                        if let Some(mut s) = vsrc.take() {
                            kill(&mut s.child);
                        }
                        if let Some(mut s) = asrc.take() {
                            kill(&mut s.child);
                        }
                        return GenExit::SetupFailed;
                    }
                }
                _ => {
                    log::warn!("compositor: decoder exited before the first frame; retrying");
                    if let Some(mut s) = vsrc.take() {
                        kill(&mut s.child);
                    }
                    if let Some(mut s) = asrc.take() {
                        kill(&mut s.child);
                    }
                    return GenExit::SetupFailed;
                }
            }
        }
    };
    log::info!("compositor: first OBS frame received; starting program encoder");

    let listener = match TcpListener::bind(("127.0.0.1", 0)) {
        Ok(l) => l,
        Err(e) => {
            log::error!("compositor: audio listener failed: {e}");
            if let Some(mut s) = vsrc.take() {
                kill(&mut s.child);
            }
            if let Some(mut s) = asrc.take() {
                kill(&mut s.child);
            }
            return GenExit::SetupFailed;
        }
    };
    let port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
    let enc_args = engine::ffmpeg_args_for_encoder(cfg, spec, opts.hw_codec.as_deref(), port);
    let mut enc = match spawn_ff(ffmpeg, &enc_args, false, Some("encoder")) {
        Ok(c) => c,
        Err(e) => {
            log::error!("compositor: encoder could not start: {e}");
            if let Some(mut s) = vsrc.take() {
                kill(&mut s.child);
            }
            if let Some(mut s) = asrc.take() {
                kill(&mut s.child);
            }
            return GenExit::SetupFailed;
        }
    };
    // Separate audio/video writers avoid deadlock while FFmpeg probes inputs sequentially.
    let mut ein = enc.stdin.take().unwrap();
    let (vtx, vrx): (SyncSender<Bytes>, Receiver<Bytes>) = std::sync::mpsc::sync_channel(8);
    std::thread::spawn(move || {
        for f in vrx {
            if ein.write_all(&f).is_err() {
                return;
            }
        }
    });
    // A blocked pipe write cannot observe cancellation; the watchdog kills a stalled encoder.
    // Disarm after teardown so a recycled PID is not targeted.
    let gen_done = Arc::new(AtomicBool::new(false));
    {
        let (run_w, done_w, enc_pid) = (running.clone(), gen_done.clone(), enc.id());
        std::thread::spawn(move || {
            while run_w.load(Ordering::Relaxed) && !done_w.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(200));
            }
            std::thread::sleep(Duration::from_millis(1200)); // Allow normal teardown to finish first.
            if !done_w.load(Ordering::Relaxed) {
                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    let _ = Command::new("taskkill")
                        .args(["/PID", &enc_pid.to_string(), "/T", "/F"])
                        .creation_flags(0x0800_0000)
                        .output();
                }
                #[cfg(not(windows))]
                {
                    let _ = enc_pid;
                }
            }
        });
    }
    // FFmpeg opens video before audio; accept must stay nonblocking until video starts flowing.
    // Catch-up silence aligns audio PTS zero with frames emitted before the connection.
    let _ = listener.set_nonblocking(true);
    let mut audio_tx: Option<SyncSender<Vec<u8>>> = None;
    let mut audio_backlog_frames: u64 = 0; // Frames emitted before audio connected.
    let accept_deadline = Instant::now() + Duration::from_secs(15);

    let tick_ns: u64 = 1_000_000_000 / (spec.fps as u64);
    let mut delay_buf: VecDeque<(u64, Bytes)> = VecDeque::with_capacity(delay_frames + 8);
    let mut afifo: VecDeque<u8> = VecDeque::new();
    let mut slate_afifo: VecDeque<u8> = VecDeque::new();
    let mut slate_vsrc: Option<FrameSource> = None;
    let mut slate_asrc: Option<ByteSource> = None;
    let mut slate_frame = Bytes::copy_from_slice(still);
    let mut last_out = Bytes::from(black_frame(spec));
    let mut last_arrival = Instant::now();
    let mut last_respawn = Instant::now();
    let mut last_slate_spawn: Option<Instant> = None;
    let mut brb_active = false;
    let mut drift_logged = false;

    *head += 1;
    let first = first.into_inner();
    offer_scan(shared, *head, &first, ysize);
    delay_buf.push_back((*head, first));
    afifo.resize(delay_buf.len() * abpf, 0);

    let clock = Instant::now();
    let mut emitted: u64 = 0;

    let exit = loop {
        if !running.load(Ordering::Relaxed) {
            break GenExit::Stop;
        }

        if audio_tx.is_none() {
            match listener.accept() {
                Ok((s, _)) => {
                    // Windows accepts inherit nonblocking mode; reset it before write_all under load.
                    let _ = s.set_nonblocking(false);
                    let _ = s.set_nodelay(true);
                    let mut sock = s;
                    // Ten seconds absorb encoder stalls; overflowing this queue restarts the generation.
                    let (tx, rx): (SyncSender<Vec<u8>>, Receiver<Vec<u8>>) =
                        std::sync::mpsc::sync_channel(10 * spec.fps as usize);
                    std::thread::spawn(move || {
                        for chunk in rx {
                            if sock.write_all(&chunk).is_err() {
                                return;
                            }
                        }
                    });
                    let silence = vec![0u8; (audio_backlog_frames as usize) * abpf];
                    if !silence.is_empty() {
                        let _ = tx.send(silence);
                    }
                    audio_tx = Some(tx);
                    log::info!("compositor: encoder connected; program is live");
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    if Instant::now() > accept_deadline {
                        log::error!("compositor: encoder did not connect to audio within 15s");
                        break GenExit::EncoderDied;
                    }
                }
                Err(e) => {
                    log::error!("compositor: audio accept failed: {e}");
                    break GenExit::EncoderDied;
                }
            }
        }

        let (got, v_dead) = drain_frames(&mut vsrc, |f| {
            *head += 1;
            offer_scan(shared, *head, &f, ysize);
            delay_buf.push_back((*head, f));
        });
        if got > 0 {
            last_arrival = Instant::now();
        }
        let a_dead = drain_audio(&mut asrc, &mut afifo, audio_cap);
        // Trim the oldest video/audio pair together when clock drift exceeds buffer headroom.
        while delay_buf.len() > delay_frames + spec.fps as usize {
            delay_buf.pop_front();
            let audio_to_drop = abpf.min(afifo.len());
            if audio_to_drop > 0 {
                afifo.drain(..audio_to_drop);
            }
            if !drift_logged {
                drift_logged = true;
                log::info!("compositor: trimming buffered clock drift");
            }
        }

        // Back off repeated immediate audio exits, which may indicate input without an audio track.
        if a_dead {
            if a_spawned_at.elapsed() < Duration::from_secs(2) {
                a_fast_deaths = a_fast_deaths.saturating_add(1);
            } else {
                a_fast_deaths = 0;
            }
        }
        let sig_now = has_signal.load(Ordering::Relaxed);
        if vsrc.is_none() && sig_now && last_respawn.elapsed() >= Duration::from_millis(RESPAWN_MS)
        {
            last_respawn = Instant::now();
            vsrc = spawn_frame_source(
                ffmpeg,
                &engine::ffmpeg_args_for_decoder(cfg, spec),
                fsize,
                Some("decoder"),
            )
            .ok();
            repair_pairing(&mut afifo, delay_buf.len() * abpf);
        }
        let a_wait = if a_fast_deaths >= 2 {
            Duration::from_secs(30)
        } else {
            Duration::from_millis(RESPAWN_MS)
        };
        if asrc.is_none() && sig_now && a_spawned_at.elapsed() >= a_wait {
            a_spawned_at = Instant::now();
            asrc = spawn_byte_source(ffmpeg, &engine::ffmpeg_args_for_audio_decoder(cfg)).ok();
            repair_pairing(&mut afifo, delay_buf.len() * abpf);
        }
        let _ = v_dead;

        let forced = opts.force_slate.load(Ordering::Relaxed);
        let want_slate_media = brb_active || *censoring || forced;
        if let Slate::Video { path, has_audio } = &opts.slate {
            if want_slate_media
                && slate_vsrc.is_none()
                && last_slate_spawn.is_none_or(|t| t.elapsed() >= Duration::from_secs(2))
            {
                last_slate_spawn = Some(Instant::now());
                slate_vsrc = spawn_frame_source(
                    ffmpeg,
                    &engine::ffmpeg_args_for_slate_video(path, spec),
                    fsize,
                    Some("slate"),
                )
                .ok();
                if *has_audio {
                    slate_asrc =
                        spawn_byte_source(ffmpeg, &engine::ffmpeg_args_for_slate_audio(path)).ok();
                }
                slate_afifo.clear();
            }
            if !want_slate_media && slate_vsrc.is_some() {
                if let Some(mut s) = slate_vsrc.take() {
                    kill(&mut s.child);
                }
                if let Some(mut s) = slate_asrc.take() {
                    kill(&mut s.child);
                }
                slate_afifo.clear();
            }
            let _ = drain_frames(&mut slate_vsrc, |f| slate_frame = f);
            let _ = drain_audio(&mut slate_asrc, &mut slate_afifo, abpf * spec.fps as usize);
        }

        let due = (clock.elapsed().as_nanos() as u64) / tick_ns;
        if due.saturating_sub(emitted) > spec.fps as u64 {
            // Skip a long scheduling gap instead of issuing an unbounded catch-up burst.
            log::warn!("compositor: output scheduling delayed; skipping ahead");
            emitted = due;
        }
        let mut io_err = false;
        while emitted < due {
            emitted += 1;
            let gap = last_arrival.elapsed();
            // Emit delayed frames normally, or drain retained content after the input stalls.
            let popped = if !delay_buf.is_empty()
                && (delay_buf.len() > delay_frames || gap.as_millis() as u64 > DRAIN_MS)
            {
                delay_buf.pop_front()
            } else {
                None
            };

            let (frame_out, audio_out, brb_now): (Bytes, Vec<u8>, bool) = match &popped {
                Some((idx, f)) => {
                    // Guardian covers the image only; manual pause separately replaces program audio.
                    let censor_now = shared
                        .map(|sh| {
                            let (s, status) = sh.coverage(*idx, max_gap);
                            sh.publish_status(app, running, status);
                            s
                        })
                        .unwrap_or(false);
                    if censor_now != *censoring {
                        *censoring = censor_now;
                        emit_censor(app, running, censor_now);
                    }
                    let audio = take_audio(&mut afifo, abpf);
                    match frame_mode(forced, censor_now) {
                        FrameMode::ManualPause => {
                            // Keep consuming paired program audio during pause so resuming does not replay private content.
                            let slate_audio = if matches!(
                                &opts.slate,
                                Slate::Video {
                                    has_audio: true,
                                    ..
                                }
                            ) {
                                take_audio(&mut slate_afifo, abpf)
                            } else {
                                vec![0u8; abpf]
                            };
                            (slate_frame.clone(), slate_audio, true)
                        }
                        FrameMode::CoveredImage => (slate_frame.clone(), audio, false),
                        FrameMode::Live => (f.clone(), audio, false),
                    }
                }
                // Keep the slate until real frames resume; refilling the delay must not reveal a stale image.
                None if forced
                    || brb_active
                    || (delay_buf.is_empty() && gap.as_millis() as u64 >= HOLD_MS) =>
                {
                    let audio = if matches!(
                        &opts.slate,
                        Slate::Video {
                            has_audio: true,
                            ..
                        }
                    ) {
                        take_audio(&mut slate_afifo, abpf)
                    } else {
                        vec![0u8; abpf]
                    };
                    (slate_frame.clone(), audio, true)
                }
                None => (last_out.clone(), vec![0u8; abpf], false),
            };

            if brb_now != brb_active {
                brb_active = brb_now;
                slate_on.store(brb_active || *censoring, Ordering::Relaxed);
                let _ = app.emit("brb://active", brb_active);
                log::info!(
                    "compositor: BRB {}",
                    if brb_active {
                        "ON AIR (destination connections preserved)"
                    } else {
                        "off; input signal restored"
                    }
                );
            } else {
                slate_on.store(brb_active || *censoring, Ordering::Relaxed);
            }

            // A full video queue skips the whole A/V pair; a full audio queue means the encoder stalled.
            match vtx.try_send(frame_out) {
                Ok(()) => {
                    let aud_ok = match audio_tx.as_ref() {
                        Some(tx) => tx.try_send(audio_out).is_ok(),
                        None => {
                            audio_backlog_frames += 1;
                            true
                        }
                    };
                    if !aud_ok {
                        log::error!("compositor: audio queue overflowed (encoder stalled)");
                        io_err = true;
                        break;
                    }
                }
                Err(TrySendError::Full(_)) => {}
                Err(TrySendError::Disconnected(_)) => {
                    io_err = true;
                    break;
                }
            }
            if let Some((_, f)) = popped {
                last_out = f;
            }
        }
        if io_err {
            break GenExit::EncoderDied;
        }

        std::thread::sleep(Duration::from_millis(3));
    };

    gen_done.store(true, Ordering::Relaxed); // Disarm the watchdog before this PID can be recycled.
    kill(&mut enc);
    if let Some(mut s) = vsrc.take() {
        kill(&mut s.child);
    }
    if let Some(mut s) = asrc.take() {
        kill(&mut s.child);
    }
    if let Some(mut s) = slate_vsrc.take() {
        kill(&mut s.child);
    }
    if let Some(mut s) = slate_asrc.take() {
        kill(&mut s.child);
    }
    slate_on.store(false, Ordering::Relaxed);
    exit
}

fn offer_scan(shared: Option<&guardian::Shared>, idx: u64, frame: &[u8], ysize: usize) {
    if let Some(sh) = shared {
        sh.offer_scan(idx, &frame[..ysize]);
    }
}

#[cfg(test)]
mod tests {
    use super::{frame_mode, take_audio, FrameMode};
    use std::collections::VecDeque;

    #[test]
    fn manual_pause_always_selects_slate_audio_even_when_guardian_covers_video() {
        assert_eq!(frame_mode(true, true), FrameMode::ManualPause);
        assert_eq!(frame_mode(true, false), FrameMode::ManualPause);
        assert_eq!(frame_mode(false, true), FrameMode::CoveredImage);
        assert_eq!(frame_mode(false, false), FrameMode::Live);
    }

    #[test]
    fn take_audio_copies_wrapped_fifo_and_pads_silence() {
        let mut fifo = VecDeque::with_capacity(5);
        fifo.extend([1, 2, 3, 4, 5]);
        fifo.pop_front();
        fifo.pop_front();
        fifo.extend([6, 7]);

        assert_eq!(take_audio(&mut fifo, 7), vec![3, 4, 5, 6, 7, 0, 0]);
        assert!(fifo.is_empty());
    }

    #[test]
    fn take_audio_leaves_remaining_samples_in_order() {
        let mut fifo = VecDeque::from([10, 11, 12, 13]);
        assert_eq!(take_audio(&mut fifo, 2), vec![10, 11]);
        assert_eq!(fifo, VecDeque::from([12, 13]));
    }
}
