//! Batch and multi-segment MP4 clip export over recorded Corneta sessions.
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use crate::config::Reframe;
use crate::i18n::Msg;
use crate::recorder;
use crate::session;
use crate::AppState;

const MAX_STEM_LEN: usize = 64;
const MAX_BATCH_CLIPS: usize = 100;
const MAX_SLICES_PER_CLIP: usize = 24;
const MIN_FREE_FLOOR_BYTES: u64 = 256 * 1024 * 1024;
/// Rough 12 Mbps headroom estimate per second of exported clip when sizing disk checks.
const BYTES_PER_CLIP_SEC: u64 = 1_500_000;
const VERTICAL_W: u32 = 1080;
const VERTICAL_H: u32 = 1920;

static BATCH_RUNNING: AtomicBool = AtomicBool::new(false);
static BATCH_CANCEL: AtomicBool = AtomicBool::new(false);
static LAST_EXPORT_DIR: Mutex<Option<PathBuf>> = Mutex::new(None);

#[derive(Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClipSegmentSlice {
    pub path: String,
    pub start_ms: u64,
    pub end_ms: u64,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BatchClipSpec {
    pub slug: String,
    pub slices: Vec<ClipSegmentSlice>,
}

#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum ClipExportFormat {
    #[default]
    Copy,
    Vertical,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClipProgressEvent {
    pub done: usize,
    pub total: usize,
    pub current_name: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BatchClipResult {
    pub dir: String,
    pub saved: Vec<String>,
    pub cancelled: bool,
    pub failed: usize,
}

struct RunningGuard;

impl RunningGuard {
    fn acquire() -> Result<Self, String> {
        if BATCH_RUNNING
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err(Msg::ClipsAlreadyRunning.now());
        }
        BATCH_CANCEL.store(false, Ordering::SeqCst);
        Ok(Self)
    }
}

impl Drop for RunningGuard {
    fn drop(&mut self) {
        BATCH_RUNNING.store(false, Ordering::SeqCst);
    }
}

/// Removes temporary slice/concat directories on every exit path, including cancellation.
pub(crate) struct TempDirGuard {
    path: PathBuf,
}

impl TempDirGuard {
    pub(crate) fn new(parent: &Path, tag: &str) -> std::io::Result<Self> {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let path = parent.join(format!(
            ".corneta-clips-{tag}-{}-{stamp}",
            std::process::id()
        ));
        std::fs::create_dir_all(&path)?;
        Ok(Self { path })
    }

    pub(crate) fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempDirGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

enum RunError {
    Cancelled,
    Failed(String),
}

pub fn cancel_batch() {
    BATCH_CANCEL.store(true, Ordering::SeqCst);
}

pub fn last_export_dir() -> Option<PathBuf> {
    LAST_EXPORT_DIR.lock().unwrap().clone()
}

fn is_windows_reserved(stem: &str) -> bool {
    matches!(
        stem.to_ascii_lowercase().as_str(),
        "con"
            | "prn"
            | "aux"
            | "nul"
            | "com1"
            | "com2"
            | "com3"
            | "com4"
            | "com5"
            | "com6"
            | "com7"
            | "com8"
            | "com9"
            | "lpt1"
            | "lpt2"
            | "lpt3"
            | "lpt4"
            | "lpt5"
            | "lpt6"
            | "lpt7"
            | "lpt8"
            | "lpt9"
    )
}

/// Strip reserved characters, control codes and Windows device names; bound to 64 chars.
pub(crate) fn sanitize_filename_stem(raw: &str) -> String {
    let mut cleaned = String::with_capacity(raw.len().min(MAX_STEM_LEN));
    let mut prev_dash = true;
    for ch in raw.chars() {
        let invalid =
            ch.is_control() || matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*');
        if invalid || ch.is_whitespace() {
            if !prev_dash {
                cleaned.push('-');
                prev_dash = true;
            }
            continue;
        }
        if ch == '-' {
            if !prev_dash {
                cleaned.push('-');
                prev_dash = true;
            }
            continue;
        }
        cleaned.push(ch);
        prev_dash = false;
    }
    let trimmed = cleaned.trim_matches(['-', '.', ' ']);
    let mut bounded: String = trimmed.chars().take(MAX_STEM_LEN).collect();
    while bounded.ends_with(['-', '.', ' ']) {
        bounded.pop();
    }
    if bounded.is_empty() {
        return "clip".into();
    }
    if is_windows_reserved(&bounded) {
        let mut safe = format!("{bounded}-clip");
        safe.truncate(MAX_STEM_LEN);
        return safe;
    }
    bounded
}

/// Never overwrite an existing clip in the destination folder; add `-2`, `-3`, ... on collision.
pub(crate) fn resolve_unique_mp4_path(dir: &Path, raw_stem: &str) -> PathBuf {
    let stem = sanitize_filename_stem(raw_stem);
    let direct = dir.join(format!("{stem}.mp4"));
    if !direct.exists() {
        return direct;
    }
    for n in 2..=9_999u32 {
        let suffix = format!("-{n}");
        let max_base = MAX_STEM_LEN.saturating_sub(suffix.len());
        let base: String = stem.chars().take(max_base).collect();
        let candidate = dir.join(format!("{base}{suffix}.mp4"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(format!("{stem}-{}.mp4", std::process::id()))
}

/// Restrict clip reads to recorded Corneta MP4 files; prevents arbitrary file reads via IPC.
pub(crate) fn validate_slice(slice: &ClipSegmentSlice) -> Result<PathBuf, String> {
    if slice.end_ms <= slice.start_ms {
        return Err(Msg::SessionNotFound.now());
    }
    let src = PathBuf::from(&slice.path);
    let named = src
        .file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| session::parse_video_name(n).is_some());
    if !named || !src.is_file() {
        return Err(Msg::SessionNotFound.now());
    }
    // Reject symlinks so a crafted link with a session-like name cannot read outside recordings.
    let meta = std::fs::symlink_metadata(&src).map_err(|_| Msg::SessionNotFound.now())?;
    if meta.file_type().is_symlink() {
        return Err(Msg::SessionNotFound.now());
    }
    Ok(src)
}

pub(crate) fn escape_concat_path(path: &Path) -> String {
    let normalized = path.to_string_lossy().replace('\\', "/");
    normalized.replace('\'', "'\\''")
}

fn format_secs(ms: u64) -> String {
    format!("{:.3}", ms as f64 / 1000.0)
}

pub(crate) fn single_copy_args(slice: &ClipSegmentSlice, dest: &Path) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-ss".into(),
        format_secs(slice.start_ms),
        "-to".into(),
        format_secs(slice.end_ms),
        "-i".into(),
        slice.path.clone(),
        "-c".into(),
        "copy".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-y".into(),
        dest.to_string_lossy().to_string(),
    ]
}

pub(crate) fn concat_copy_args(list_file: &Path, dest: &Path) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-f".into(),
        "concat".into(),
        "-safe".into(),
        "0".into(),
        "-i".into(),
        list_file.to_string_lossy().to_string(),
        "-c".into(),
        "copy".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-y".into(),
        dest.to_string_lossy().to_string(),
    ]
}

fn push_video_encode_args(args: &mut Vec<String>, codec: &str) {
    args.extend(["-c:v".into(), codec.into()]);
    if codec == "libx264" {
        args.extend([
            "-preset".into(),
            "veryfast".into(),
            "-crf".into(),
            "20".into(),
        ]);
    } else {
        args.extend([
            "-b:v".into(),
            "8000k".into(),
            "-maxrate".into(),
            "10000k".into(),
            "-bufsize".into(),
            "16000k".into(),
        ]);
    }
    args.extend(["-pix_fmt".into(), "yuv420p".into()]);
}

pub(crate) fn vertical_clip_args(
    slices: &[ClipSegmentSlice],
    reframe: Option<&Reframe>,
    codec: &str,
    with_audio: bool,
    dest: &Path,
) -> Vec<String> {
    let vf = crate::engine::reframe_filter(reframe, VERTICAL_W, VERTICAL_H);
    let mut args: Vec<String> = vec!["-hide_banner".into(), "-loglevel".into(), "error".into()];
    for slice in slices {
        args.extend([
            "-ss".into(),
            format_secs(slice.start_ms),
            "-to".into(),
            format_secs(slice.end_ms),
            "-i".into(),
            slice.path.clone(),
        ]);
    }
    if slices.len() == 1 {
        args.extend(["-map".into(), "0:v:0".into()]);
        if with_audio {
            args.extend(["-map".into(), "0:a:0?".into()]);
        }
        args.extend(["-vf".into(), vf]);
    } else {
        let mut concat_in = String::new();
        for i in 0..slices.len() {
            if with_audio {
                concat_in.push_str(&format!("[{i}:v][{i}:a]"));
            } else {
                concat_in.push_str(&format!("[{i}:v]"));
            }
        }
        let graph = if with_audio {
            format!(
                "{concat_in}concat=n={}:v=1:a=1[cv][ca];[cv]{vf}[v]",
                slices.len()
            )
        } else {
            format!(
                "{concat_in}concat=n={}:v=1:a=0[cv];[cv]{vf}[v]",
                slices.len()
            )
        };
        args.extend(["-filter_complex".into(), graph, "-map".into(), "[v]".into()]);
        if with_audio {
            args.extend(["-map".into(), "[ca]".into()]);
        }
    }
    push_video_encode_args(&mut args, codec);
    if with_audio {
        args.extend([
            "-c:a".into(),
            "aac".into(),
            "-ar".into(),
            "48000".into(),
            "-ac".into(),
            "2".into(),
            "-b:a".into(),
            "160k".into(),
        ]);
    }
    args.extend([
        "-movflags".into(),
        "+faststart".into(),
        "-y".into(),
        dest.to_string_lossy().to_string(),
    ]);
    args
}

pub(crate) fn concat_reencode_args(
    slices: &[ClipSegmentSlice],
    codec: &str,
    with_audio: bool,
    dest: &Path,
) -> Vec<String> {
    let mut args: Vec<String> = vec!["-hide_banner".into(), "-loglevel".into(), "error".into()];
    for slice in slices {
        args.extend([
            "-ss".into(),
            format_secs(slice.start_ms),
            "-to".into(),
            format_secs(slice.end_ms),
            "-i".into(),
            slice.path.clone(),
        ]);
    }
    let mut concat_in = String::new();
    for i in 0..slices.len() {
        if with_audio {
            concat_in.push_str(&format!("[{i}:v][{i}:a]"));
        } else {
            concat_in.push_str(&format!("[{i}:v]"));
        }
    }
    let graph = if with_audio {
        format!("{concat_in}concat=n={}:v=1:a=1[v][a]", slices.len())
    } else {
        format!("{concat_in}concat=n={}:v=1:a=0[v]", slices.len())
    };
    args.extend(["-filter_complex".into(), graph, "-map".into(), "[v]".into()]);
    if with_audio {
        args.extend(["-map".into(), "[a]".into()]);
    }
    push_video_encode_args(&mut args, codec);
    if with_audio {
        args.extend([
            "-c:a".into(),
            "aac".into(),
            "-ar".into(),
            "48000".into(),
            "-ac".into(),
            "2".into(),
            "-b:a".into(),
            "160k".into(),
        ]);
    }
    args.extend([
        "-movflags".into(),
        "+faststart".into(),
        "-y".into(),
        dest.to_string_lossy().to_string(),
    ]);
    args
}

fn required_disk_bytes(clips: &[BatchClipSpec]) -> u64 {
    let total_ms: u64 = clips
        .iter()
        .flat_map(|c| c.slices.iter())
        .map(|s| s.end_ms.saturating_sub(s.start_ms))
        .sum();
    let est = (total_ms / 1000).saturating_mul(BYTES_PER_CLIP_SEC);
    MIN_FREE_FLOOR_BYTES.saturating_add(est)
}

async fn run_ffmpeg_cancelable(
    app: &AppHandle,
    args: Vec<String>,
    allow_cancel: bool,
) -> Result<(), RunError> {
    if allow_cancel && BATCH_CANCEL.load(Ordering::Relaxed) {
        return Err(RunError::Cancelled);
    }
    let (mut rx, child) = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| RunError::Failed(e.to_string()))?
        .args(args)
        .spawn()
        .map_err(|e| RunError::Failed(e.to_string()))?;
    crate::job::adopt_pid(child.pid());

    let mut stderr = String::new();
    let mut tick = tokio::time::interval(Duration::from_millis(120));
    tick.tick().await;
    loop {
        tokio::select! {
            ev = rx.recv() => match ev {
                Some(CommandEvent::Stderr(bytes)) => {
                    if stderr.len() < 8 * 1024 {
                        stderr.push_str(&String::from_utf8_lossy(&bytes));
                    }
                }
                Some(CommandEvent::Terminated(payload)) => {
                    if allow_cancel && BATCH_CANCEL.load(Ordering::Relaxed) {
                        return Err(RunError::Cancelled);
                    }
                    if payload.code == Some(0) {
                        return Ok(());
                    }
                    let msg = stderr.trim().to_string();
                    return Err(RunError::Failed(if msg.is_empty() {
                        format!("ffmpeg exited with {:?}", payload.code)
                    } else {
                        msg
                    }));
                }
                None => return Err(RunError::Failed("ffmpeg exited unexpectedly".into())),
                _ => {}
            },
            _ = tick.tick(), if allow_cancel => {
                if BATCH_CANCEL.load(Ordering::Relaxed) {
                    let _ = child.kill();
                    return Err(RunError::Cancelled);
                }
            }
        }
    }
}

async fn run_vertical_with_fallback(
    app: &AppHandle,
    slices: &[ClipSegmentSlice],
    reframe: Option<&Reframe>,
    hw_codec: Option<&str>,
    dest: &Path,
    allow_cancel: bool,
) -> Result<(), RunError> {
    let mut codecs: Vec<&str> = Vec::new();
    if let Some(hw) = hw_codec {
        codecs.push(hw);
    }
    if !codecs.contains(&"libx264") {
        codecs.push("libx264");
    }
    let mut last_err = RunError::Failed("vertical clip encode failed".into());
    for codec in codecs {
        for with_audio in [true, false] {
            let args = vertical_clip_args(slices, reframe, codec, with_audio, dest);
            match run_ffmpeg_cancelable(app, args, allow_cancel).await {
                Ok(()) => return Ok(()),
                Err(RunError::Cancelled) => return Err(RunError::Cancelled),
                Err(RunError::Failed(msg)) => {
                    last_err = RunError::Failed(msg);
                    // Only retry audio-less when multi-segment concat had no audio stream.
                    if slices.len() == 1 {
                        break;
                    }
                }
            }
        }
    }
    Err(last_err)
}

struct ClipRunContext<'a> {
    format: ClipExportFormat,
    reframe: Option<&'a Reframe>,
    hw_codec: Option<&'a str>,
    allow_reencode_fallback: bool,
    temp_root: &'a Path,
    allow_cancel: bool,
}

async fn export_one_clip(
    app: &AppHandle,
    slices: &[ClipSegmentSlice],
    ctx: &ClipRunContext<'_>,
    dest: &Path,
) -> Result<(), RunError> {
    match ctx.format {
        ClipExportFormat::Vertical => {
            run_vertical_with_fallback(
                app,
                slices,
                ctx.reframe,
                ctx.hw_codec,
                dest,
                ctx.allow_cancel,
            )
            .await
        }
        ClipExportFormat::Copy => {
            if slices.len() == 1 {
                let args = single_copy_args(&slices[0], dest);
                return run_ffmpeg_cancelable(app, args, ctx.allow_cancel).await;
            }
            let tmp = TempDirGuard::new(ctx.temp_root, "seg")
                .map_err(|e| RunError::Failed(e.to_string()))?;
            let mut list_body = String::new();
            for (idx, slice) in slices.iter().enumerate() {
                let part = tmp.path().join(format!("part-{idx:02}.mp4"));
                let args = single_copy_args(slice, &part);
                run_ffmpeg_cancelable(app, args, ctx.allow_cancel).await?;
                list_body.push_str(&format!("file '{}'\n", escape_concat_path(&part)));
            }
            let list_file = tmp.path().join("concat.txt");
            std::fs::write(&list_file, list_body).map_err(|e| RunError::Failed(e.to_string()))?;
            let copy_res =
                run_ffmpeg_cancelable(app, concat_copy_args(&list_file, dest), ctx.allow_cancel)
                    .await;
            match copy_res {
                Ok(()) => Ok(()),
                Err(RunError::Cancelled) => Err(RunError::Cancelled),
                Err(err) => {
                    if !ctx.allow_reencode_fallback {
                        return Err(err);
                    }
                    // Incompatible segments across a reconnection fall back to filter concat.
                    let codec = ctx.hw_codec.unwrap_or("libx264");
                    let mut last_err = err;
                    for c in if codec == "libx264" {
                        vec!["libx264"]
                    } else {
                        vec![codec, "libx264"]
                    } {
                        for with_audio in [true, false] {
                            let args = concat_reencode_args(slices, c, with_audio, dest);
                            match run_ffmpeg_cancelable(app, args, ctx.allow_cancel).await {
                                Ok(()) => return Ok(()),
                                Err(RunError::Cancelled) => return Err(RunError::Cancelled),
                                Err(e) => last_err = e,
                            }
                        }
                    }
                    Err(last_err)
                }
            }
        }
    }
}

/// Export a single clip that may span multiple recording segments (used by ReplayPlayer).
pub async fn export_single_slices(
    app: AppHandle,
    slices: Vec<ClipSegmentSlice>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    if slices.is_empty() || slices.len() > MAX_SLICES_PER_CLIP {
        return Err(Msg::SessionNotFound.now());
    }
    for slice in &slices {
        validate_slice(slice)?;
    }
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("MP4", &["mp4"])
        .set_file_name("corneta-clipe.mp4")
        .save_file(move |p| {
            let _ = tx.send(p);
        });
    let Some(dest) = rx.await.ok().flatten().and_then(|p| p.into_path().ok()) else {
        return Ok(None);
    };
    let (live_or_rehearsing, _activity) = {
        let state = app.state::<AppState>();
        let eng = state.engine.lock().unwrap();
        (eng.live || eng.rehearsing, eng.begin_pending_activity())
    };
    let hw_codec = if !live_or_rehearsing && slices.len() > 1 {
        crate::commands::detect_hw_encoder(&app).await
    } else {
        None
    };
    let temp_root = dest
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(std::env::temp_dir);
    let ctx = ClipRunContext {
        format: ClipExportFormat::Copy,
        reframe: None,
        hw_codec: hw_codec.as_deref(),
        allow_reencode_fallback: !live_or_rehearsing,
        temp_root: &temp_root,
        allow_cancel: false,
    };
    match export_one_clip(&app, &slices, &ctx, &dest).await {
        Ok(()) => Ok(Some(dest.to_string_lossy().to_string())),
        Err(RunError::Cancelled) => {
            let _ = std::fs::remove_file(&dest);
            Ok(None)
        }
        Err(RunError::Failed(msg)) => {
            let _ = std::fs::remove_file(&dest);
            Err(msg)
        }
    }
}

/// Export a batch of planned moment clips into a chosen directory with progress and cancellation.
pub async fn export_batch(
    app: AppHandle,
    dir: String,
    clips: Vec<BatchClipSpec>,
    format: ClipExportFormat,
    reframe: Option<Reframe>,
) -> Result<BatchClipResult, String> {
    if clips.is_empty() || clips.len() > MAX_BATCH_CLIPS {
        return Err(Msg::ClipsEmpty.now());
    }
    let _running = RunningGuard::acquire()?;

    let dest_dir = PathBuf::from(dir.trim());
    if !recorder::check_dir(&dest_dir).ok {
        return Err(Msg::ClipsInvalidDir.now());
    }
    let needed = required_disk_bytes(&clips);
    if let Some(free) = recorder::free_bytes(&dest_dir) {
        if free < needed {
            return Err(Msg::ClipsDiskLow.now());
        }
    }

    for clip in &clips {
        if clip.slices.is_empty() || clip.slices.len() > MAX_SLICES_PER_CLIP {
            return Err(Msg::SessionNotFound.now());
        }
        for slice in &clip.slices {
            validate_slice(slice)?;
        }
    }

    // Streaming comes before auxiliary tasks: block re-encoding batches during live or rehearsal.
    let (live_or_rehearsing, _activity) = {
        let state = app.state::<AppState>();
        let eng = state.engine.lock().unwrap();
        let busy = eng.live || eng.rehearsing;
        if busy && format == ClipExportFormat::Vertical {
            return Err(Msg::ClipsLiveBusy.now());
        }
        (busy, eng.begin_pending_activity())
    };

    let needs_hw = format == ClipExportFormat::Vertical
        || (!live_or_rehearsing && clips.iter().any(|c| c.slices.len() > 1));
    let hw_codec = if needs_hw {
        crate::commands::detect_hw_encoder(&app).await
    } else {
        None
    };

    let total = clips.len();
    let mut saved: Vec<String> = Vec::with_capacity(total);
    let mut failed = 0usize;
    let mut cancelled = false;

    for (index, clip) in clips.iter().enumerate() {
        if BATCH_CANCEL.load(Ordering::Relaxed) {
            cancelled = true;
            break;
        }
        let dest = resolve_unique_mp4_path(&dest_dir, &clip.slug);
        let file_name = dest
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("clip.mp4")
            .to_string();
        let _ = app.emit(
            "clips://progress",
            ClipProgressEvent {
                done: index,
                total,
                current_name: file_name.clone(),
            },
        );

        let ctx = ClipRunContext {
            format,
            reframe: reframe.as_ref(),
            hw_codec: hw_codec.as_deref(),
            allow_reencode_fallback: !live_or_rehearsing,
            temp_root: &dest_dir,
            allow_cancel: true,
        };
        match export_one_clip(&app, &clip.slices, &ctx, &dest).await {
            Ok(()) => saved.push(dest.to_string_lossy().to_string()),
            Err(RunError::Cancelled) => {
                let _ = std::fs::remove_file(&dest);
                cancelled = true;
                break;
            }
            Err(RunError::Failed(msg)) => {
                let _ = std::fs::remove_file(&dest);
                log::warn!("clips: failed to export {file_name}: {msg}");
                failed += 1;
            }
        }
    }

    let _ = app.emit(
        "clips://progress",
        ClipProgressEvent {
            done: if cancelled { saved.len() } else { total },
            total,
            current_name: String::new(),
        },
    );

    if !saved.is_empty() {
        *LAST_EXPORT_DIR.lock().unwrap() = Some(dest_dir.clone());
    }

    Ok(BatchClipResult {
        dir: dest_dir.to_string_lossy().to_string(),
        saved,
        cancelled,
        failed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::CropBox;

    #[test]
    fn sanitizes_windows_filenames_and_reserved_device_names() {
        assert_eq!(
            sanitize_filename_stem("01-00h18m42s-clutch: <1v4>?*"),
            "01-00h18m42s-clutch-1v4"
        );
        assert_eq!(sanitize_filename_stem("CON"), "CON-clip");
        assert_eq!(sanitize_filename_stem("nul"), "nul-clip");
        assert_eq!(sanitize_filename_stem("AUX"), "AUX-clip");
        assert_eq!(sanitize_filename_stem("   ...   "), "clip");
        assert!(sanitize_filename_stem(&"x".repeat(120)).len() <= MAX_STEM_LEN);
    }

    #[test]
    fn resolves_filename_collisions_without_overwriting() {
        let root =
            std::env::temp_dir().join(format!("corneta-clips-collision-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let first = resolve_unique_mp4_path(&root, "01-clutch");
        assert_eq!(first.file_name().unwrap(), "01-clutch.mp4");
        std::fs::write(&first, b"a").unwrap();

        let second = resolve_unique_mp4_path(&root, "01-clutch");
        assert_eq!(second.file_name().unwrap(), "01-clutch-2.mp4");
        std::fs::write(&second, b"b").unwrap();

        let third = resolve_unique_mp4_path(&root, "01-clutch");
        assert_eq!(third.file_name().unwrap(), "01-clutch-3.mp4");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn rejects_paths_outside_corneta_recording_pattern_and_invalid_ranges() {
        let root =
            std::env::temp_dir().join(format!("corneta-clips-validate-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();

        let foreign = root.join("secret.mp4");
        std::fs::write(&foreign, b"nope").unwrap();
        assert!(validate_slice(&ClipSegmentSlice {
            path: foreign.to_string_lossy().into(),
            start_ms: 0,
            end_ms: 1000,
        })
        .is_err());

        let valid_rec = root.join("1721400000000.mp4");
        std::fs::write(&valid_rec, b"ok").unwrap();
        assert!(validate_slice(&ClipSegmentSlice {
            path: valid_rec.to_string_lossy().into(),
            start_ms: 1000,
            end_ms: 1000,
        })
        .is_err());
        assert!(validate_slice(&ClipSegmentSlice {
            path: valid_rec.to_string_lossy().into(),
            start_ms: 0,
            end_ms: 1500,
        })
        .is_ok());

        let seg2 = root.join("1721400000000.p2.mp4");
        std::fs::write(&seg2, b"ok").unwrap();
        assert!(validate_slice(&ClipSegmentSlice {
            path: seg2.to_string_lossy().into(),
            start_ms: 500,
            end_ms: 2500,
        })
        .is_ok());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn temp_dir_guard_removes_intermediate_files_on_drop() {
        let parent =
            std::env::temp_dir().join(format!("corneta-clips-guard-{}", std::process::id()));
        std::fs::create_dir_all(&parent).unwrap();
        let created;
        {
            let guard = TempDirGuard::new(&parent, "cancel").unwrap();
            created = guard.path().to_path_buf();
            std::fs::write(created.join("part-00.mp4"), b"partial").unwrap();
            assert!(created.exists());
        }
        assert!(!created.exists());
        let _ = std::fs::remove_dir_all(&parent);
    }

    #[test]
    fn builds_vertical_single_and_split_filter_graphs_across_multiple_slices() {
        let slices = vec![
            ClipSegmentSlice {
                path: "1721400000000.mp4".into(),
                start_ms: 10_000,
                end_ms: 15_000,
            },
            ClipSegmentSlice {
                path: "1721400000000.p2.mp4".into(),
                start_ms: 0,
                end_ms: 8_000,
            },
        ];
        let split_reframe = Reframe {
            x: 0.5,
            y: 0.5,
            zoom: 0.9,
            layout: Some("split".into()),
            top: Some(CropBox {
                x: 0.1,
                y: 0.1,
                zoom: 0.35,
            }),
            split_ratio: Some(0.35),
        };
        let args = vertical_clip_args(
            &slices,
            Some(&split_reframe),
            "libx264",
            true,
            Path::new("out.mp4"),
        );
        let joined = args.join(" ");
        assert!(joined.contains("-filter_complex"));
        assert!(joined.contains("concat=n=2:v=1:a=1[cv][ca];[cv]split=2[cam][main]"));
        assert!(joined.contains("vstack=inputs=2[v]"));
        assert!(joined.contains("-map [v] -map [ca]"));
        assert!(joined.contains("-preset veryfast"));
    }

    #[test]
    #[ignore = "requires verified ffmpeg and ffprobe on PATH in a disposable contributor checkout"]
    fn e2e_concatenates_two_mp4_segments_in_copy_and_vertical_split_modes() {
        use std::process::Command;

        let dir = std::env::temp_dir().join(format!("corneta-clips-e2e-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let seg1 = dir.join("1721400000000.mp4");
        let seg2 = dir.join("1721400000000.p2.mp4");
        for (target, freq) in [(&seg1, "440"), (&seg2, "660")] {
            let ok = Command::new("ffmpeg")
                .args(["-y", "-hide_banner", "-loglevel", "error"])
                .args(["-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:d=3"])
                .args([
                    "-f",
                    "lavfi",
                    "-i",
                    &format!("sine=frequency={freq}:sample_rate=48000:duration=3"),
                ])
                .args([
                    "-c:v",
                    "libx264",
                    "-preset",
                    "ultrafast",
                    "-g",
                    "30",
                    "-pix_fmt",
                    "yuv420p",
                    "-c:a",
                    "aac",
                    "-ar",
                    "48000",
                    "-ac",
                    "2",
                    "-b:a",
                    "128k",
                ])
                .arg(target)
                .status()
                .is_ok_and(|s| s.success());
            assert!(ok, "generate fixture {}", target.display());
        }

        let slices = vec![
            ClipSegmentSlice {
                path: seg1.to_string_lossy().into(),
                start_ms: 1000,
                end_ms: 3000,
            },
            ClipSegmentSlice {
                path: seg2.to_string_lossy().into(),
                start_ms: 0,
                end_ms: 2000,
            },
        ];

        // 1. Copy concat across two segments using TempDirGuard.
        let copy_out = dir.join("concat-copy.mp4");
        {
            let tmp = TempDirGuard::new(&dir, "e2e").unwrap();
            let mut list = String::new();
            for (i, s) in slices.iter().enumerate() {
                let part = tmp.path().join(format!("p{i}.mp4"));
                let ok = Command::new("ffmpeg")
                    .args(single_copy_args(s, &part))
                    .status()
                    .is_ok_and(|st| st.success());
                assert!(ok, "slice copy {i}");
                list.push_str(&format!("file '{}'\n", escape_concat_path(&part)));
            }
            let list_file = tmp.path().join("list.txt");
            std::fs::write(&list_file, list).unwrap();
            let ok = Command::new("ffmpeg")
                .args(concat_copy_args(&list_file, &copy_out))
                .status()
                .is_ok_and(|st| st.success());
            assert!(ok, "concat copy");
        }
        assert!(copy_out.is_file() && std::fs::metadata(&copy_out).unwrap().len() > 10_000);

        // 2. Vertical 9:16 split (camera over gameplay) concat across two segments.
        let split_out = dir.join("concat-split.mp4");
        let split_reframe = Reframe {
            x: 0.5,
            y: 0.5,
            zoom: 0.9,
            layout: Some("split".into()),
            top: Some(CropBox {
                x: 0.15,
                y: 0.15,
                zoom: 0.35,
            }),
            split_ratio: Some(0.35),
        };
        let ok = Command::new("ffmpeg")
            .args(vertical_clip_args(
                &slices,
                Some(&split_reframe),
                "libx264",
                true,
                &split_out,
            ))
            .status()
            .is_ok_and(|st| st.success());
        assert!(ok, "vertical split concat");

        let probe = Command::new("ffprobe")
            .args([
                "-hide_banner",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height",
                "-of",
                "compact",
            ])
            .arg(&split_out)
            .output()
            .expect("probe split output");
        let meta = String::from_utf8_lossy(&probe.stdout);
        assert!(meta.contains("width=1080"), "expected 1080 width: {meta}");
        assert!(meta.contains("height=1920"), "expected 1920 height: {meta}");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
