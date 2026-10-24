//! Opt-in alert for an OBS picture that stays fully black mid-live, such as a failed capture or an empty scene.
//! Only keyframes are decoded, at thumbnail size, so the watch costs a few milliseconds every couple of seconds.

use std::io::Read;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::Arc;
use std::time::{Duration, Instant};

const PROBE_W: usize = 64;
const PROBE_H: usize = 36;
const LUMA_BYTES: usize = PROBE_W * PROBE_H;
const FRAME_BYTES: usize = LUMA_BYTES * 3 / 2;
// FFmpeg's blackdetect defaults: within 10% of the limited range above black, over 98% of the picture.
const DARK_LUMA: u8 = 16 + 22;
const BLACK_SHARE: f64 = 0.98;
/// Long enough to ride out fades and loading screens.
const ALERT_AFTER: Duration = Duration::from_secs(10);

pub fn probe_args(ingest_url: &str) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-threads".into(),
        "1".into(),
        "-skip_frame".into(),
        "nokey".into(),
        "-i".into(),
        ingest_url.into(),
        "-map".into(),
        "0:v:0".into(),
        "-an".into(),
        "-sn".into(),
        "-vf".into(),
        // Area averaging keeps small bright overlays visible; full-range input is mapped to limited.
        format!("scale={PROBE_W}:{PROBE_H}:flags=area:out_range=limited"),
        "-fps_mode".into(),
        "passthrough".into(),
        "-f".into(),
        "rawvideo".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-".into(),
    ]
}

pub fn is_black(luma: &[u8]) -> bool {
    let dark = luma.iter().filter(|&&y| y <= DARK_LUMA).count();
    !luma.is_empty() && dark as f64 >= luma.len() as f64 * BLACK_SHARE
}

/// Turns per-keyframe verdicts into alert transitions; one dark keyframe never raises it.
#[derive(Default)]
pub struct Watch {
    black_since: Option<Instant>,
    alerted: bool,
}

impl Watch {
    /// Some(true) raises the alert and Some(false) clears it.
    pub fn observe(&mut self, black: bool, now: Instant) -> Option<bool> {
        if !black {
            return self.clear();
        }
        let since = *self.black_since.get_or_insert(now);
        if !self.alerted && now.duration_since(since) >= ALERT_AFTER {
            self.alerted = true;
            return Some(true);
        }
        None
    }

    pub fn clear(&mut self) -> Option<bool> {
        self.black_since = None;
        std::mem::take(&mut self.alerted).then_some(false)
    }
}

/// `paused` covers a slate on air: viewers then see it instead of the OBS picture.
pub fn run(
    ffmpeg: &Path,
    running: Arc<AtomicBool>,
    has_signal: Arc<AtomicBool>,
    ingest_url: String,
    paused: impl Fn() -> bool,
    mut on_change: impl FnMut(bool),
) {
    let args = probe_args(&ingest_url);
    let mut watch = Watch::default();
    while running.load(Ordering::Relaxed) {
        if !has_signal.load(Ordering::Relaxed) {
            // A lost signal has its own alert.
            if let Some(on) = watch.clear() {
                on_change(on);
            }
            std::thread::sleep(Duration::from_millis(500));
            continue;
        }
        let (mut child, frames) = match spawn_probe(ffmpeg, &args) {
            Ok(probe) => probe,
            Err(e) => {
                log::warn!("black screen: probe could not start: {e}");
                return;
            }
        };
        while running.load(Ordering::Relaxed) && has_signal.load(Ordering::Relaxed) {
            match frames.recv_timeout(Duration::from_millis(500)) {
                Ok(luma) => {
                    let black = is_black(&luma) && !paused();
                    if let Some(on) = watch.observe(black, Instant::now()) {
                        on_change(on);
                    }
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
        let _ = child.kill();
        let _ = child.wait();
        // A probe that keeps exiting must not respawn in a tight loop.
        std::thread::sleep(Duration::from_secs(2));
    }
    if let Some(on) = watch.clear() {
        on_change(on);
    }
}

fn spawn_probe(ffmpeg: &Path, args: &[String]) -> std::io::Result<(Child, Receiver<Vec<u8>>)> {
    let mut cmd = Command::new(ffmpeg);
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = cmd.spawn()?;
    crate::job::adopt(&child);
    let Some(mut out) = child.stdout.take() else {
        let _ = child.kill();
        return Err(std::io::Error::other("probe stdout unavailable"));
    };
    let (tx, rx) = mpsc::sync_channel(2);
    std::thread::spawn(move || {
        let mut frame = vec![0u8; FRAME_BYTES];
        while out.read_exact(&mut frame).is_ok() {
            if tx.send(frame[..LUMA_BYTES].to_vec()).is_err() {
                return;
            }
        }
    });
    Ok((child, rx))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn picture(dark: usize, bright: u8) -> Vec<u8> {
        let mut luma = vec![16u8; LUMA_BYTES];
        for y in luma.iter_mut().skip(dark) {
            *y = bright;
        }
        luma
    }

    #[test]
    fn a_black_picture_tolerates_noise_but_not_an_overlay() {
        assert!(is_black(&picture(LUMA_BYTES, 0)));
        assert!(is_black(&vec![DARK_LUMA; LUMA_BYTES]));
        // About 2% of the picture lit, like a small logo, still reads as black.
        assert!(is_black(&picture(LUMA_BYTES - 46, 200)));
        // A webcam corner on a failed capture is a picture, not a black screen.
        assert!(!is_black(&picture(LUMA_BYTES * 85 / 100, 120)));
        assert!(!is_black(&vec![DARK_LUMA + 1; LUMA_BYTES]));
        assert!(!is_black(&[]));
    }

    #[test]
    fn the_alert_waits_out_short_dark_stretches_and_clears_on_the_first_picture() {
        let start = Instant::now();
        let at = |s: u64| start + Duration::from_secs(s);
        let mut watch = Watch::default();
        assert_eq!(watch.observe(true, at(0)), None);
        assert_eq!(watch.observe(true, at(8)), None);
        assert_eq!(watch.observe(false, at(9)), None);
        assert_eq!(watch.observe(true, at(10)), None);
        assert_eq!(watch.observe(true, at(20)), Some(true));
        assert_eq!(watch.observe(true, at(30)), None);
        assert_eq!(watch.observe(false, at(31)), Some(false));
        assert_eq!(watch.clear(), None);
    }

    #[test]
    fn clearing_reports_only_a_raised_alert() {
        let start = Instant::now();
        let mut watch = Watch::default();
        watch.observe(true, start);
        assert_eq!(watch.clear(), None);
        watch.observe(true, start);
        watch.observe(true, start + ALERT_AFTER);
        assert_eq!(watch.clear(), Some(false));
    }

    #[test]
    #[ignore = "requires verified ffmpeg on PATH in a disposable contributor checkout"]
    fn a_black_rtmp_feed_raises_the_alert_and_the_picture_clears_it() {
        use std::sync::Mutex;
        let dir = std::env::temp_dir().join("corneta-black-screen-e2e");
        std::fs::create_dir_all(&dir).unwrap();
        let feed = dir.join("feed.flv");
        // The black stretch outlasts the probe's start-up plus the alert delay.
        let made = Command::new("ffmpeg")
            .args(["-y", "-hide_banner", "-loglevel", "error"])
            .args(["-f", "lavfi", "-i", "color=black:s=640x360:r=30:d=18"])
            .args(["-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=4"])
            .args(["-filter_complex", "[0][1]concat=n=2:v=1[v]", "-map", "[v]"])
            .args(["-c:v", "libx264", "-preset", "veryfast", "-g", "30"])
            .args(["-pix_fmt", "yuv420p", "-f", "flv"])
            .arg(&feed)
            .status();
        assert!(
            made.is_ok_and(|status| status.success()),
            "generate the feed (is ffmpeg on PATH?)"
        );
        let port = std::net::TcpListener::bind("127.0.0.1:0")
            .and_then(|listener| listener.local_addr())
            .unwrap()
            .port();
        let url = format!("rtmp://127.0.0.1:{port}/live/obs");
        // FFmpeg serves the feed in real time to the first reader, standing in for OBS and MediaMTX.
        let mut server = Command::new("ffmpeg")
            .args(["-hide_banner", "-loglevel", "error", "-re", "-i"])
            .arg(&feed)
            .args(["-c", "copy", "-f", "flv", "-listen", "1", &url])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        std::thread::sleep(Duration::from_millis(800));

        let running = Arc::new(AtomicBool::new(true));
        let changes = Arc::new(Mutex::new(Vec::new()));
        let watcher = {
            let (running, changes) = (running.clone(), changes.clone());
            std::thread::spawn(move || {
                run(
                    Path::new("ffmpeg"),
                    running,
                    Arc::new(AtomicBool::new(true)),
                    url,
                    || false,
                    move |on| changes.lock().unwrap().push(on),
                )
            })
        };
        let deadline = Instant::now() + Duration::from_secs(45);
        while changes.lock().unwrap().len() < 2 && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(200));
        }
        // Read before stopping: stopping clears a raised alert by itself.
        let seen = changes.lock().unwrap().clone();
        running.store(false, Ordering::Relaxed);
        let _ = server.kill();
        let _ = server.wait();
        watcher.join().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(seen, [true, false]);
    }

    #[test]
    fn the_probe_decodes_only_keyframes_into_a_limited_range_thumbnail() {
        let args = probe_args("rtmp://127.0.0.1:1935/live/obs");
        let input = args.iter().position(|a| a == "-i").unwrap();
        let skip = args.iter().position(|a| a == "-skip_frame").unwrap();
        assert!(skip < input, "decoder options must precede the input");
        assert_eq!(args[skip + 1], "nokey");
        assert_eq!(args[input + 1], "rtmp://127.0.0.1:1935/live/obs");
        assert!(args.contains(&"scale=64:36:flags=area:out_range=limited".to_string()));
        assert_eq!(args.last().map(String::as_str), Some("-"));
    }
}
