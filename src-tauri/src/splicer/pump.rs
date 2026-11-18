use std::collections::VecDeque;
use std::io::BufReader;
use std::path::Path;
use std::process::{Child, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, TryRecvError};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};

use super::avc::{parse_asc, parse_avcc, prefix_param_sets, seqhdr_video, tag_is_idr, Asc, AvcC};
use super::flv::{
    read_cts, read_flv_header, read_tag, tag_is_audio_seqhdr, tag_is_video_seqhdr, write_ops,
    write_preamble, write_tag, FlvTag, WriteOp,
};
use super::slate::{
    base_cmd, build_silence, build_slate_media, ffmpeg_path, kill, map_profile, SlateMediaSpec,
    SLATE_FPS, SLATE_VIDEO_MAX_SEC,
};
use crate::compositor::{CompositorOpts, Slate};
use crate::engine;
use crate::engine_policy::RestartBudget;
use crate::telemetry::AppError;
use crate::AppState;

/// Publisher restarts back off up to this wait and never give up while the live runs.
const PUBLISHER_MAX_WAIT_MS: u64 = 4_000;
const PUBLISHER_QUIET_MS: u64 = 60_000;
/// Balance transient-stall tolerance against visible freezes before switching to the slate.
const HOLD_MS: u64 = 600;
const RESPAWN_MS: u64 = 1500;
const SETUP_DEADLINE_MS: u64 = 8_000;
/// Bound catch-up bursts after a delayed pump iteration.
const SLATE_CATCHUP_CAP: u32 = 3;

fn capture_splicer_error(app: &AppHandle, code: &str) {
    let state = app.state::<AppState>();
    let operation_id = state.engine.lock().unwrap().operation_id.clone();
    state.telemetry.capture_error(
        AppError::new(code, "compositor", true, None),
        operation_id.as_deref(),
        true,
        "warning",
    );
}

fn spawn_input(ffmpeg: &Path, ingest: &str) -> std::io::Result<Child> {
    base_cmd(ffmpeg)
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-fflags",
            "+genpts",
            "-i",
            ingest,
            "-c",
            "copy",
            "-f",
            "flv",
            "pipe:1",
        ])
        .stdout(Stdio::piped())
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .inspect(crate::job::adopt)
}

fn spawn_output(ffmpeg: &Path, program_url: &str) -> std::io::Result<Child> {
    base_cmd(ffmpeg)
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "flv",
            "-i",
            "pipe:0",
            "-c",
            "copy",
            "-f",
            "flv",
            program_url,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .inspect(crate::job::adopt)
}

fn spawn_reader(
    child: &mut Child,
    gen: u64,
) -> (Receiver<(u64, FlvTag)>, std::thread::JoinHandle<()>) {
    let stdout = child
        .stdout
        .take()
        .expect("input ffmpeg has no stdout pipe");
    let (tx, rx) = std::sync::mpsc::sync_channel::<(u64, FlvTag)>(256);
    let handle = std::thread::spawn(move || {
        let mut r = BufReader::with_capacity(1 << 16, stdout);
        if read_flv_header(&mut r).is_err() {
            return;
        }
        loop {
            match read_tag(&mut r) {
                Ok(Some(tag)) => {
                    if tx.send((gen, tag)).is_err() {
                        return;
                    }
                }
                Ok(None) | Err(_) => return,
            }
        }
    });
    (rx, handle)
}

/// Drain queued tags before joining: killing the child cannot wake a reader blocked in send.
fn drain_and_join(rx: &Receiver<(u64, FlvTag)>, reader: Option<std::thread::JoinHandle<()>>) {
    let Some(r) = reader else { return };
    let mut spins = 0u32;
    loop {
        match rx.try_recv() {
            Ok(_) => {}
            Err(TryRecvError::Disconnected) => break,
            Err(TryRecvError::Empty) => {
                spins += 1;
                if spins > 2000 {
                    break;
                }
                std::thread::sleep(Duration::from_millis(1));
            }
        }
    }
    let _ = r.join();
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum State {
    Copy,
    Slate,
    HoldIncompat,
}

pub(super) struct Clock {
    pub out_dts: u32,     // Last emitted video DTS.
    pub out_pts_hwm: u32, // Video PTS high-water mark, including OBS B-frame offsets.
    pub a_idx: u64,       // Total emitted audio frames, including silence.
    pub sr: u32,
    pub frame_dt: u32, // Typical video DTS interval in milliseconds, used to bridge segments.
    pub started: bool,
}

impl Clock {
    pub(super) fn new(sr: u32, fps: u32) -> Self {
        Clock {
            out_dts: 0,
            out_pts_hwm: 0,
            a_idx: 0,
            sr: sr.max(8000),
            frame_dt: (1000 / fps.clamp(1, 240)).max(1),
            started: false,
        }
    }

    /// Derive audio timestamps from frame count to avoid accumulated rounding drift.
    pub(super) fn audio_ts(&self) -> u32 {
        ((self.a_idx.wrapping_mul(1024).wrapping_mul(1000)) / self.sr as u64) as u32
    }
}

enum SetupOutcome {
    Fallback(Box<CompositorOpts>),
    Done,
}

pub async fn run(
    app: AppHandle,
    running: Arc<AtomicBool>,
    has_signal: Arc<AtomicBool>,
    slate_on: Arc<AtomicBool>,
    opts: CompositorOpts,
) {
    let (app_c, run_c, sig_c, slate_c) = (
        app.clone(),
        running.clone(),
        has_signal.clone(),
        slate_on.clone(),
    );
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        setup_and_pump(&app_c, &run_c, &sig_c, &slate_c, opts)
    })
    .await;
    let outcome = match outcome {
        Ok(outcome) => outcome,
        Err(_) => {
            capture_splicer_error(&app, "splicer_task_failed");
            SetupOutcome::Done
        }
    };
    // Fallback is safe only before the first program publish.
    if let SetupOutcome::Fallback(opts) = outcome {
        log::warn!("splicer: setup incomplete; falling back to the compositor");
        capture_splicer_error(&app, "splicer_setup_fallback");
        crate::compositor::run(app, running, has_signal, slate_on, *opts).await;
    }
}

fn setup_and_pump(
    app: &AppHandle,
    running: &Arc<AtomicBool>,
    has_signal: &Arc<AtomicBool>,
    slate_on: &Arc<AtomicBool>,
    opts: CompositorOpts,
) -> SetupOutcome {
    let Some(ffmpeg) = ffmpeg_path() else {
        log::error!("splicer: ffmpeg sidecar not found");
        return SetupOutcome::Fallback(Box::new(opts));
    };
    let cfg = opts.config.clone();
    let ingest = engine::ingest_url(&cfg);
    let program = engine::program_url(&cfg);

    // Start the setup deadline only after OBS begins publishing.
    while !has_signal.load(Ordering::Relaxed) {
        if !running.load(Ordering::Relaxed) {
            return SetupOutcome::Done;
        }
        std::thread::sleep(Duration::from_millis(300));
    }

    let mut gen: u64 = 0;
    let mut in_child = match spawn_input(&ffmpeg, &ingest) {
        Ok(c) => c,
        Err(e) => {
            log::error!("splicer: input ffmpeg could not start: {e}");
            return SetupOutcome::Fallback(Box::new(opts));
        }
    };
    let (mut rx, reader) = spawn_reader(&mut in_child, gen);

    let mut avcc: Option<AvcC> = None;
    let mut asc: Option<Asc> = None;
    let mut pending: VecDeque<FlvTag> = VecDeque::new();
    let deadline = Instant::now() + Duration::from_millis(SETUP_DEADLINE_MS);
    while avcc.is_none() || asc.is_none() {
        if !running.load(Ordering::Relaxed) {
            kill(&mut in_child);
            drain_and_join(&rx, Some(reader));
            return SetupOutcome::Done;
        }
        if Instant::now() > deadline {
            // Synthesize a 48 kHz stereo ASC when the destination still needs an audio track.
            if avcc.is_some() && asc.is_none() {
                asc = Some(Asc {
                    bytes: vec![0xAF, 0x00, 0x11, 0x90, 0x56, 0xE5, 0x00],
                    sample_rate: 48000,
                    channels: 2,
                    object_type: 2,
                });
                break;
            }
            log::warn!(
                "splicer: no OBS sequence header within {SETUP_DEADLINE_MS}ms; falling back"
            );
            kill(&mut in_child);
            drain_and_join(&rx, Some(reader));
            return SetupOutcome::Fallback(Box::new(opts));
        }
        match rx.try_recv() {
            Ok((_, tag)) => {
                if tag.tag_type == 9 && tag_is_video_seqhdr(&tag.data) {
                    avcc = parse_avcc(&tag.data[5..]);
                    if avcc.is_none() {
                        return fail_setup(&mut in_child, &rx, reader, opts, "unreadable avcC");
                    }
                } else if tag.tag_type == 8 && tag_is_audio_seqhdr(&tag.data) {
                    asc = parse_asc(&tag.data);
                    if asc.is_none() {
                        return fail_setup(&mut in_child, &rx, reader, opts, "unreadable ASC");
                    }
                } else if (tag.tag_type == 9 || tag.tag_type == 8) && pending.len() < 512 {
                    pending.push_back(tag);
                }
            }
            Err(TryRecvError::Empty) => std::thread::sleep(Duration::from_millis(20)),
            Err(TryRecvError::Disconnected) => {
                return fail_setup(
                    &mut in_child,
                    &rx,
                    reader,
                    opts,
                    "OBS disconnected before its sequence header",
                );
            }
        }
    }
    let avcc = avcc.unwrap();
    let asc = asc.unwrap();

    // Stream-copy splicing supports progressive 8-bit H.264 4:2:0 baseline/main/high.
    let i = &avcc.info;
    let gate_ok = i.chroma_format_idc == 1
        && i.frame_mbs_only == 1
        && avcc.length_size == 4
        && i.bit_depth_luma_minus8 == 0
        && i.bit_depth_chroma_minus8 == 0
        && map_profile(i.profile_idc).is_some()
        && i.width > 0
        && i.height > 0
        && asc.object_type == 2; // Generated silence is AAC-LC; delegate HE/SBR during setup.
    if !gate_ok {
        return fail_setup(
            &mut in_child,
            &rx,
            reader,
            opts,
            "unsupported OBS splicer configuration (profile/bit depth/chroma)",
        );
    }

    let (slate, slate_audio) = match build_slate_media(
        app,
        &ffmpeg,
        &opts.slate,
        &avcc.info,
        &SlateMediaSpec {
            width: opts.spec.w,
            height: opts.spec.h,
            sample_rate: asc.sample_rate,
            channels: asc.channels,
        },
    ) {
        Some(m) => m,
        None => return fail_setup(&mut in_child, &rx, reader, opts, "slate preparation failed"),
    };
    let silence = build_silence(app, &ffmpeg, asc.sample_rate, asc.channels);
    if matches!(opts.slate, Slate::Video { .. }) {
        log::info!(
            "splicer: video slate ready; {} video frames, {} audio frames (loop cap {}s)",
            slate.len(),
            slate_audio.len(),
            SLATE_VIDEO_MAX_SEC
        );
    }

    let mut out_child = match spawn_output(&ffmpeg, &program) {
        Ok(c) => c,
        Err(e) => {
            log::error!("splicer: output ffmpeg could not start: {e}");
            return fail_setup(
                &mut in_child,
                &rx,
                reader,
                opts,
                "output ffmpeg could not start",
            );
        }
    };
    let mut out_stdin = out_child
        .stdin
        .take()
        .expect("output ffmpeg has no stdin pipe");
    // A blocked stdin write cannot observe cancellation; the watchdog kills the publisher.
    let mut gen_done = Arc::new(AtomicBool::new(false));
    spawn_output_watchdog(
        running.clone(),
        gen_done.clone(),
        crate::job::Killer::new(&out_child),
    );

    if write_preamble(&mut out_stdin).is_err()
        || write_tag(&mut out_stdin, 9, 0, &seqhdr_video(&avcc)).is_err()
        || write_tag(&mut out_stdin, 8, 0, &asc.bytes).is_err()
    {
        gen_done.store(true, Ordering::Relaxed);
        kill(&mut out_child);
        return fail_setup(
            &mut in_child,
            &rx,
            reader,
            opts,
            "could not publish _program",
        );
    }

    log::info!(
        "splicer: ready; {}x{} profile={} {}Hz/{}ch; copying OBS to _program without re-encoding",
        avcc.info.width,
        avcc.info.height,
        avcc.info.profile_idc,
        asc.sample_rate,
        asc.channels
    );

    // No fallback after publication: incompatible input must remain on the slate.
    let mut reader = Some(reader);
    let mut clock = Clock::new(asc.sample_rate, opts.spec.fps.max(SLATE_FPS));
    let mut state = State::Slate;
    let mut slate_i = 0usize;
    let mut slate_a_i = 0usize;
    let mut slate_epoch: Option<Instant> = None;
    let mut slate_base_dts: u32 = 0;
    let mut slate_n: u32 = 0;
    let mut last_video_at = Instant::now();
    let mut input_alive = true;
    let mut last_respawn = Instant::now();
    let mut need_copy_epoch = true;
    let mut v_epoch: i64 = 0;
    let mut primed = false;
    let mut video_ok = true;
    let mut audio_ok = true;
    let pump_started = Instant::now();
    let mut publisher_budget = RestartBudget::new(u32::MAX, PUBLISHER_QUIET_MS);
    let mut publisher_down_since: Option<Instant> = None;
    let mut publisher_wait_ms = 0u64;

    // Discard pre-IDR tags; copying may begin only at a real IDR.
    pending.clear();

    loop {
        if !running.load(Ordering::Relaxed) {
            break;
        }
        let forced = opts.force_slate.load(Ordering::Relaxed);
        let mut ops: Vec<WriteOp> = Vec::new();

        let mut got_disconnect = false;
        loop {
            match rx.try_recv() {
                Ok((g, tag)) => {
                    if g != gen {
                        continue;
                    }
                    handle_input_tag(
                        tag,
                        forced,
                        &avcc,
                        &asc,
                        &mut video_ok,
                        &mut audio_ok,
                        &mut state,
                        &mut clock,
                        &mut need_copy_epoch,
                        &mut v_epoch,
                        &mut last_video_at,
                        &mut ops,
                    );
                }
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => {
                    got_disconnect = true;
                    break;
                }
            }
        }

        // Start slate output after the first copied frame or an explicit manual pause.
        if state == State::Copy || forced {
            primed = true;
        }

        let gap = got_disconnect
            || (state == State::Copy && last_video_at.elapsed() > Duration::from_millis(HOLD_MS));
        if state == State::Copy && (gap || forced) {
            state = State::Slate;
        }
        if got_disconnect {
            input_alive = false;
        }

        let showing_slate = matches!(state, State::Slate | State::HoldIncompat) && primed;
        if showing_slate {
            if slate_epoch.is_none() {
                slate_epoch = Some(Instant::now());
                slate_base_dts = clock.out_dts;
                slate_n = 0;
                slate_i = 0; // Restart at the slate IDR, never a P-frame with missing references.
                slate_a_i = 0;
            }
            let elapsed = slate_epoch.unwrap().elapsed().as_millis() as u32;
            let target = slate_base_dts.wrapping_add(elapsed);
            let mut emitted = 0u32;
            while clock.out_dts < target && emitted < SLATE_CATCHUP_CAP && !slate.is_empty() {
                // Restart audio at video loop boundaries to prevent drift between slightly different loop periods.
                if slate_i != 0 && slate_i.is_multiple_of(slate.len()) {
                    slate_a_i = 0;
                }
                let frame = &slate[slate_i % slate.len()];
                slate_i += 1;
                slate_n += 1;
                // Use fractional frame spacing; truncating every frame to 33 ms accumulates drift.
                let dts = slate_base_dts
                    .wrapping_add(((slate_n as f64) * 1000.0 / SLATE_FPS as f64).round() as u32);
                clock.out_dts = dts;
                clock.out_pts_hwm = clock.out_pts_hwm.max(dts);
                clock.started = true;
                ops.push(WriteOp {
                    tag_type: 9,
                    ts: dts,
                    data: frame.data.clone(),
                });
                while clock.audio_ts() < dts {
                    let audio = if slate_audio.is_empty() {
                        silence.clone()
                    } else {
                        let a = slate_audio[slate_a_i % slate_audio.len()].clone();
                        slate_a_i += 1;
                        a
                    };
                    ops.push(WriteOp {
                        tag_type: 8,
                        ts: clock.audio_ts(),
                        data: audio,
                    });
                    clock.a_idx += 1;
                }
                emitted += 1;
                let _ = frame.keyframe;
            }
        } else {
            slate_epoch = None;
        }
        slate_on.store(showing_slate, Ordering::Relaxed);

        // Destinations wait on `_program`, so a dead publisher must come back for the live to.
        if publisher_down_since.is_none() && !write_ops(&mut out_stdin, &ops) {
            log::warn!("splicer: output ffmpeg exited (broken pipe); restarting the publisher");
            gen_done.store(true, Ordering::Relaxed);
            kill(&mut out_child);
            publisher_wait_ms = publisher_budget
                .next_delay(pump_started.elapsed().as_millis() as u64)
                .unwrap_or(PUBLISHER_MAX_WAIT_MS);
            if publisher_budget.episode_started() {
                capture_splicer_error(app, "splicer_output_died");
            }
            publisher_down_since = Some(Instant::now());
        }
        if publisher_down_since
            .is_some_and(|since| since.elapsed() >= Duration::from_millis(publisher_wait_ms))
        {
            match restart_publisher(&ffmpeg, &program, &avcc, &asc, clock.out_dts, running) {
                Some((child, stdin, done)) => {
                    out_child = child;
                    out_stdin = stdin;
                    gen_done = done;
                    publisher_down_since = None;
                    // A new publish must open on a keyframe: run the slate from its IDR until OBS sends one.
                    if state == State::Copy {
                        state = State::Slate;
                    }
                    slate_epoch = None;
                    log::info!("splicer: publisher restarted");
                }
                None => {
                    publisher_wait_ms = publisher_budget
                        .next_delay(pump_started.elapsed().as_millis() as u64)
                        .unwrap_or(PUBLISHER_MAX_WAIT_MS);
                    publisher_down_since = Some(Instant::now());
                }
            }
        }

        if !input_alive
            && has_signal.load(Ordering::Relaxed)
            && last_respawn.elapsed() >= Duration::from_millis(RESPAWN_MS)
        {
            last_respawn = Instant::now();
            kill(&mut in_child);
            drain_and_join(&rx, reader.take());
            match spawn_input(&ffmpeg, &ingest) {
                Ok(mut c) => {
                    gen += 1;
                    let (nrx, nreader) = spawn_reader(&mut c, gen);
                    in_child = c;
                    rx = nrx;
                    reader = Some(nreader);
                    input_alive = true;
                    need_copy_epoch = true;
                }
                Err(e) => log::warn!("splicer: input restart failed: {e}"),
            }
        }

        std::thread::sleep(Duration::from_millis(4));
    }

    // Reap the publisher before joining readers, and drain channels to release blocked sends.
    gen_done.store(true, Ordering::Relaxed);
    kill(&mut in_child);
    kill(&mut out_child);
    drain_and_join(&rx, reader.take());
    slate_on.store(false, Ordering::Relaxed);
    log::info!("splicer: stopped");
    SetupOutcome::Done
}

#[allow(clippy::too_many_arguments)]
fn handle_input_tag(
    tag: FlvTag,
    forced: bool,
    avcc: &AvcC,
    asc: &Asc,
    video_ok: &mut bool,
    audio_ok: &mut bool,
    state: &mut State,
    clock: &mut Clock,
    need_copy_epoch: &mut bool,
    v_epoch: &mut i64,
    last_video_at: &mut Instant,
    ops: &mut Vec<WriteOp>,
) {
    // Output extradata is fixed: incompatible reconnects must hold the slate, not replace the publisher.
    if tag.tag_type == 9 && tag_is_video_seqhdr(&tag.data) {
        if let Some(new) = parse_avcc(&tag.data[5..]) {
            *video_ok = new.info.semantically_eq(&avcc.info);
            if !*video_ok {
                if *state != State::HoldIncompat {
                    log::warn!(
                        "splicer: OBS video changed ({}x{} to {}x{}); holding BRB",
                        avcc.info.width,
                        avcc.info.height,
                        new.info.width,
                        new.info.height
                    );
                }
                *state = State::HoldIncompat;
            } else if *state == State::HoldIncompat && *audio_ok {
                log::info!(
                    "splicer: compatible OBS configuration restored; resuming at the next IDR"
                );
                *state = State::Slate;
            }
        }
        return;
    }
    if tag.tag_type == 8 && tag_is_audio_seqhdr(&tag.data) {
        // Both audio and video must match before leaving HoldIncompat, regardless of header arrival order.
        if let Some(new) = parse_asc(&tag.data) {
            *audio_ok = new.semantically_eq(asc);
            if !*audio_ok {
                if *state != State::HoldIncompat {
                    log::warn!(
                        "splicer: OBS audio changed ({}Hz/{}ch to {}Hz/{}ch); holding BRB",
                        asc.sample_rate,
                        asc.channels,
                        new.sample_rate,
                        new.channels
                    );
                }
                *state = State::HoldIncompat;
            } else if *state == State::HoldIncompat && *video_ok {
                log::info!(
                    "splicer: compatible OBS configuration restored; resuming at the next IDR"
                );
                *state = State::Slate;
            }
        }
        return;
    }

    match *state {
        State::HoldIncompat => {}
        State::Slate => {
            if tag.tag_type == 9 && !forced && tag_is_idr(&tag.data, avcc.length_size) {
                // Reassert OBS SPS/PPS before the return IDR.
                emit_resume_idr(&tag, avcc, clock, need_copy_epoch, v_epoch, ops);
                *state = State::Copy;
                *last_video_at = Instant::now();
            }
        }
        State::Copy => {
            if forced {
                *state = State::Slate;
                return;
            }
            match tag.tag_type {
                9 => {
                    emit_copy_video(&tag, avcc, clock, need_copy_epoch, v_epoch, ops);
                    *last_video_at = Instant::now();
                }
                8 => {
                    let ts = clock.audio_ts();
                    ops.push(WriteOp {
                        tag_type: 8,
                        ts,
                        data: tag.data,
                    });
                    clock.a_idx += 1;
                }
                _ => {}
            }
        }
    }
}

pub(super) fn emit_copy_video(
    tag: &FlvTag,
    _avcc: &AvcC,
    clock: &mut Clock,
    need_epoch: &mut bool,
    v_epoch: &mut i64,
    ops: &mut Vec<WriteOp>,
) {
    if *need_epoch {
        // A new input process restarts OBS timestamps near zero; bridge onto the existing output clock.
        *v_epoch = if clock.started {
            (clock.out_dts as i64 + clock.frame_dt as i64) - tag.ts as i64
        } else {
            -(tag.ts as i64)
        };
        *need_epoch = false;
    }
    let mut dts = (tag.ts as i64).wrapping_add(*v_epoch).max(0) as u32;
    if clock.started && dts <= clock.out_dts {
        dts = clock.out_dts.wrapping_add(1);
    }
    let cts = read_cts(&tag.data);
    clock.out_dts = dts;
    clock.out_pts_hwm = clock.out_pts_hwm.max(dts.wrapping_add(cts as u32));
    clock.started = true;
    ops.push(WriteOp {
        tag_type: 9,
        ts: dts,
        data: tag.data.clone(),
    });
}

pub(super) fn emit_resume_idr(
    tag: &FlvTag,
    avcc: &AvcC,
    clock: &mut Clock,
    need_epoch: &mut bool,
    v_epoch: &mut i64,
    ops: &mut Vec<WriteOp>,
) {
    *need_epoch = false;
    *v_epoch = if clock.started {
        (clock.out_dts as i64 + clock.frame_dt as i64) - tag.ts as i64
    } else {
        -(tag.ts as i64)
    };
    let mut dts = (tag.ts as i64).wrapping_add(*v_epoch).max(0) as u32;
    if clock.started && dts <= clock.out_dts {
        dts = clock.out_dts.wrapping_add(1);
    }
    let cts = read_cts(&tag.data);
    let mut data = tag.data[..5].to_vec();
    data.extend_from_slice(&prefix_param_sets(&avcc.sps, &avcc.pps, avcc.length_size));
    data.extend_from_slice(&tag.data[5..]);
    clock.out_dts = dts;
    clock.out_pts_hwm = clock.out_pts_hwm.max(dts.wrapping_add(cts as u32));
    clock.started = true;
    ops.push(WriteOp {
        tag_type: 9,
        ts: dts,
        data,
    });
}

fn fail_setup(
    in_child: &mut Child,
    rx: &Receiver<(u64, FlvTag)>,
    reader: std::thread::JoinHandle<()>,
    opts: CompositorOpts,
    why: &str,
) -> SetupOutcome {
    log::warn!("splicer: setup failed ({why}); falling back to compositor");
    kill(in_child);
    drain_and_join(rx, Some(reader));
    SetupOutcome::Fallback(Box::new(opts))
}

/// A replacement `_program` publisher primed with the stream headers, or None when it cannot start.
fn restart_publisher(
    ffmpeg: &Path,
    program: &str,
    avcc: &AvcC,
    asc: &Asc,
    headers_ts: u32,
    running: &Arc<AtomicBool>,
) -> Option<(Child, std::process::ChildStdin, Arc<AtomicBool>)> {
    let mut child = match spawn_output(ffmpeg, program) {
        Ok(child) => child,
        Err(e) => {
            log::warn!("splicer: publisher restart failed: {e}");
            return None;
        }
    };
    let Some(mut stdin) = child.stdin.take() else {
        kill(&mut child);
        return None;
    };
    let done = Arc::new(AtomicBool::new(false));
    spawn_output_watchdog(
        running.clone(),
        done.clone(),
        crate::job::Killer::new(&child),
    );
    if write_preamble(&mut stdin).is_err()
        || write_tag(&mut stdin, 9, headers_ts, &seqhdr_video(avcc)).is_err()
        || write_tag(&mut stdin, 8, headers_ts, &asc.bytes).is_err()
    {
        done.store(true, Ordering::Relaxed);
        kill(&mut child);
        return None;
    }
    Some((child, stdin, done))
}

fn spawn_output_watchdog(
    running: Arc<AtomicBool>,
    gen_done: Arc<AtomicBool>,
    killer: Option<crate::job::Killer>,
) {
    std::thread::spawn(move || {
        while running.load(Ordering::Relaxed) && !gen_done.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(200));
        }
        std::thread::sleep(Duration::from_millis(1200)); // Allow normal teardown to finish first.
        if !gen_done.load(Ordering::Relaxed) {
            if let Some(killer) = &killer {
                killer.kill();
            }
        }
    });
}
