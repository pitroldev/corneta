//! Opt-in alerts for an OBS picture that stays fully black or frozen mid-live, such as a failed
//! capture, an empty scene or a game capture stuck after Alt+Tab.
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
/// Thumbnail luma drift that re-encoding an unchanged picture can produce between keyframes.
const STILL_DELTA: u8 = 3;
/// A webcam moving in a corner of a stuck game changes more than this share of the thumbnail.
const MOVING_SHARE: f64 = 0.005;
/// Longer than the black alert: holding scenes and menus sit still on purpose for a while.
const FROZEN_AFTER: Duration = Duration::from_secs(20);

pub fn probe_args(ingest_url: &str) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-threads".into(),
        "1".into(),
        "-skip_frame".into(),
        "nokey".into(),
    ];
    if ingest_url.starts_with("rtmp://") || ingest_url.starts_with("rtmps://") {
        args.extend(["-rtmp_enhanced_codecs", "hvc1,av01"].map(String::from));
    }
    args.extend([
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
    ]);
    args
}

pub fn is_black(luma: &[u8]) -> bool {
    let dark = luma.iter().filter(|&&y| y <= DARK_LUMA).count();
    !luma.is_empty() && dark as f64 >= luma.len() as f64 * BLACK_SHARE
}

/// Consecutive keyframes with almost no thumbnail change; the first keyframe has nothing to compare.
pub fn is_still(prev: &[u8], curr: &[u8]) -> bool {
    if curr.is_empty() || prev.len() != curr.len() {
        return false;
    }
    let moving = prev
        .iter()
        .zip(curr)
        .filter(|(a, b)| a.abs_diff(**b) > STILL_DELTA)
        .count();
    moving as f64 <= curr.len() as f64 * MOVING_SHARE
}

/// Turns per-sample verdicts into alert transitions; one bad sample never raises it.
pub struct Watch {
    after: Duration,
    since: Option<Instant>,
    alerted: bool,
}

impl Watch {
    pub const fn new(after: Duration) -> Self {
        Self {
            after,
            since: None,
            alerted: false,
        }
    }

    /// Some(true) raises the alert and Some(false) clears it.
    pub fn observe(&mut self, bad: bool, now: Instant) -> Option<bool> {
        if !bad {
            return self.clear();
        }
        let since = *self.since.get_or_insert(now);
        if !self.alerted && now.duration_since(since) >= self.after {
            self.alerted = true;
            return Some(true);
        }
        None
    }

    pub fn clear(&mut self) -> Option<bool> {
        self.since = None;
        std::mem::take(&mut self.alerted).then_some(false)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PictureAlert {
    Black,
    Frozen,
}

/// The picture alerts the streamer turned on.
#[derive(Clone, Copy, Debug, Default)]
pub struct Alerts {
    pub black: bool,
    pub frozen: bool,
}

impl Alerts {
    pub const fn any(self) -> bool {
        self.black || self.frozen
    }
}

/// Both picture alerts over the same keyframes.
pub struct PictureWatch {
    alerts: Alerts,
    black: Watch,
    frozen: Watch,
    prev: Option<Vec<u8>>,
}

impl PictureWatch {
    pub fn new(alerts: Alerts) -> Self {
        Self {
            alerts,
            black: Watch::new(ALERT_AFTER),
            frozen: Watch::new(FROZEN_AFTER),
            prev: None,
        }
    }

    /// `paused` covers a slate on air: viewers then see it instead of the OBS picture.
    pub fn observe(
        &mut self,
        luma: Vec<u8>,
        paused: bool,
        now: Instant,
    ) -> Vec<(PictureAlert, bool)> {
        let dark = is_black(&luma);
        let still = self
            .prev
            .as_deref()
            .is_some_and(|prev| is_still(prev, &luma));
        self.prev = Some(luma);
        let mut changes = Vec::new();
        if self.alerts.black {
            if let Some(on) = self.black.observe(dark && !paused, now) {
                changes.push((PictureAlert::Black, on));
            }
        }
        if self.alerts.frozen {
            // A black screen is also still; with its own alert on, it raises only that one.
            let frozen = still && !paused && !(self.alerts.black && dark);
            if let Some(on) = self.frozen.observe(frozen, now) {
                changes.push((PictureAlert::Frozen, on));
            }
        }
        changes
    }

    /// Keyframes from before a gap must not make the next one look still.
    pub fn forget_last_keyframe(&mut self) {
        self.prev = None;
    }

    pub fn clear(&mut self) -> Vec<(PictureAlert, bool)> {
        self.prev = None;
        [
            (PictureAlert::Black, self.black.clear()),
            (PictureAlert::Frozen, self.frozen.clear()),
        ]
        .into_iter()
        .filter_map(|(alert, change)| change.map(|on| (alert, on)))
        .collect()
    }
}

pub fn run(
    ffmpeg: &Path,
    running: Arc<AtomicBool>,
    has_signal: Arc<AtomicBool>,
    ingest_url: String,
    alerts: Alerts,
    paused: impl Fn() -> bool,
    mut on_change: impl FnMut(PictureAlert, bool),
) {
    let args = probe_args(&ingest_url);
    let mut watch = PictureWatch::new(alerts);
    let mut emit = |changes: Vec<(PictureAlert, bool)>| {
        for (alert, on) in changes {
            on_change(alert, on);
        }
    };
    while running.load(Ordering::Relaxed) {
        if !has_signal.load(Ordering::Relaxed) {
            // A lost signal has its own alert.
            emit(watch.clear());
            std::thread::sleep(Duration::from_millis(500));
            continue;
        }
        let (mut child, frames) = match spawn_chunks(ffmpeg, &args, FRAME_BYTES, LUMA_BYTES) {
            Ok(probe) => probe,
            Err(e) => {
                log::warn!("picture watch: probe could not start: {e}");
                return;
            }
        };
        while running.load(Ordering::Relaxed) && has_signal.load(Ordering::Relaxed) {
            match frames.recv_timeout(Duration::from_millis(500)) {
                Ok(luma) => emit(watch.observe(luma, paused(), Instant::now())),
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
        let _ = child.kill();
        let _ = child.wait();
        watch.forget_last_keyframe();
        // A probe that keeps exiting must not respawn in a tight loop.
        std::thread::sleep(Duration::from_secs(2));
    }
    emit(watch.clear());
}

/// Read fixed-size chunks from a probe's stdout, keeping the first `keep` bytes of each.
pub(crate) fn spawn_chunks(
    ffmpeg: &Path,
    args: &[String],
    chunk: usize,
    keep: usize,
) -> std::io::Result<(Child, Receiver<Vec<u8>>)> {
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
        let mut buf = vec![0u8; chunk];
        let keep = keep.min(chunk);
        while out.read_exact(&mut buf).is_ok() {
            if tx.send(buf[..keep].to_vec()).is_err() {
                return;
            }
        }
    });
    Ok((child, rx))
}

#[cfg(test)]
pub(crate) mod tests {
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
        let mut watch = Watch::new(ALERT_AFTER);
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
        let mut watch = Watch::new(ALERT_AFTER);
        watch.observe(true, start);
        assert_eq!(watch.clear(), None);
        watch.observe(true, start);
        watch.observe(true, start + ALERT_AFTER);
        assert_eq!(watch.clear(), Some(false));
    }

    /// A busy scene: every pixel differs from its neighbour and shifts with `t`.
    fn scene(t: u8) -> Vec<u8> {
        (0..LUMA_BYTES)
            .map(|i| 60 + ((i as u8).wrapping_mul(7).wrapping_add(t.wrapping_mul(13))) % 120)
            .collect()
    }

    #[test]
    fn a_still_picture_ignores_reencoding_noise_but_not_a_moving_webcam_corner() {
        let base = scene(0);
        let noisy: Vec<u8> = base
            .iter()
            .enumerate()
            .map(|(i, &y)| if i % 2 == 0 { y + 2 } else { y - 2 })
            .collect();
        assert!(is_still(&base, &noisy), "±2 luma is re-encoding noise");
        let mut webcam = base.clone();
        for y in webcam.iter_mut().take(LUMA_BYTES * 5 / 100) {
            *y = y.wrapping_add(40);
        }
        assert!(
            !is_still(&base, &webcam),
            "5% of the picture moving is a live scene"
        );
        assert!(!is_still(&base, &scene(1)));
        assert!(!is_still(&[], &[]));
        assert!(!is_still(&base, &base[..10]));
    }

    #[test]
    fn a_frozen_picture_raises_its_alert_after_twenty_seconds_and_motion_clears_it() {
        let start = Instant::now();
        let at = |s: u64| start + Duration::from_secs(s);
        let mut watch = PictureWatch::new(Alerts {
            black: true,
            frozen: true,
        });
        assert!(watch.observe(scene(0), false, at(0)).is_empty());
        for s in (2..20).step_by(2) {
            assert!(watch.observe(scene(0), false, at(s)).is_empty(), "{s}s");
        }
        assert_eq!(
            watch.observe(scene(0), false, at(22)),
            [(PictureAlert::Frozen, true)]
        );
        assert_eq!(
            watch.observe(scene(1), false, at(24)),
            [(PictureAlert::Frozen, false)]
        );
    }

    #[test]
    fn a_black_screen_raises_only_the_black_alert_unless_that_one_is_off() {
        let start = Instant::now();
        let at = |s: u64| start + Duration::from_secs(s);
        let black = || vec![16u8; LUMA_BYTES];
        let mut both = PictureWatch::new(Alerts {
            black: true,
            frozen: true,
        });
        let mut raised = Vec::new();
        for s in (0..=30).step_by(2) {
            raised.extend(both.observe(black(), false, at(s)));
        }
        assert_eq!(raised, [(PictureAlert::Black, true)]);

        let mut frozen_only = PictureWatch::new(Alerts {
            black: false,
            frozen: true,
        });
        let mut raised = Vec::new();
        for s in (0..=30).step_by(2) {
            raised.extend(frozen_only.observe(black(), false, at(s)));
        }
        assert_eq!(raised, [(PictureAlert::Frozen, true)]);
    }

    #[test]
    fn the_slate_on_air_and_a_lost_keyframe_history_hold_the_frozen_alert_back() {
        let start = Instant::now();
        let at = |s: u64| start + Duration::from_secs(s);
        let mut watch = PictureWatch::new(Alerts {
            black: false,
            frozen: true,
        });
        for s in (0..=40).step_by(2) {
            assert!(watch.observe(scene(0), true, at(s)).is_empty(), "paused");
        }
        assert!(watch.observe(scene(0), false, at(42)).is_empty());
        watch.forget_last_keyframe();
        assert!(
            watch.observe(scene(0), false, at(64)).is_empty(),
            "the first keyframe after a gap has nothing to compare"
        );
        assert!(watch.observe(scene(0), false, at(66)).is_empty());
        assert_eq!(
            watch.observe(scene(0), false, at(86)),
            [(PictureAlert::Frozen, true)]
        );
        assert_eq!(watch.clear(), [(PictureAlert::Frozen, false)]);
        assert!(watch.clear().is_empty());
    }

    /// FFmpeg serves a feed in real time to its first reader, standing in for OBS and MediaMTX.
    pub(crate) fn serve_feed(feed: &Path) -> (String, Child) {
        let port = std::net::TcpListener::bind("127.0.0.1:0")
            .and_then(|listener| listener.local_addr())
            .unwrap()
            .port();
        let url = format!("rtmp://127.0.0.1:{port}/live/obs");
        let server = Command::new("ffmpeg")
            .args(["-hide_banner", "-loglevel", "error", "-re", "-i"])
            .arg(feed)
            .args(["-c", "copy", "-f", "flv", "-listen", "1", &url])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        std::thread::sleep(Duration::from_millis(800));
        (url, server)
    }

    fn picture_changes_from(
        name: &str,
        feed_args: &[&str],
        alerts: Alerts,
    ) -> Vec<(PictureAlert, bool)> {
        use std::sync::Mutex;
        let dir = std::env::temp_dir().join(format!("corneta-picture-watch-{name}"));
        std::fs::create_dir_all(&dir).unwrap();
        let feed = dir.join("feed.flv");
        let made = Command::new("ffmpeg")
            .args(["-y", "-hide_banner", "-loglevel", "error"])
            .args(feed_args)
            .args(["-c:v", "libx264", "-preset", "veryfast", "-g", "30"])
            .args(["-pix_fmt", "yuv420p", "-f", "flv"])
            .arg(&feed)
            .status();
        assert!(
            made.is_ok_and(|status| status.success()),
            "generate the feed (is ffmpeg on PATH?)"
        );
        let (url, mut server) = serve_feed(&feed);
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
                    alerts,
                    || false,
                    move |alert, on| changes.lock().unwrap().push((alert, on)),
                )
            })
        };
        let deadline = Instant::now() + Duration::from_secs(60);
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
        seen
    }

    #[test]
    #[ignore = "requires verified ffmpeg on PATH in a disposable contributor checkout"]
    fn a_black_rtmp_feed_raises_the_alert_and_the_picture_clears_it() {
        // The black stretch outlasts the probe's start-up plus the alert delay.
        let seen = picture_changes_from(
            "black",
            &[
                "-f",
                "lavfi",
                "-i",
                "color=black:s=640x360:r=30:d=18",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=s=640x360:r=30:d=4",
                "-filter_complex",
                "[0][1]concat=n=2:v=1[v]",
                "-map",
                "[v]",
            ],
            Alerts {
                black: true,
                frozen: true,
            },
        );
        assert_eq!(
            seen,
            [(PictureAlert::Black, true), (PictureAlert::Black, false)]
        );
    }

    #[test]
    #[ignore = "requires verified ffmpeg on PATH in a disposable contributor checkout"]
    fn a_frozen_rtmp_feed_raises_the_alert_and_motion_clears_it() {
        // Moving, then the last frame held for 26 s, then moving again.
        let seen = picture_changes_from(
            "frozen",
            &[
                "-f",
                "lavfi",
                "-i",
                "testsrc2=s=640x360:r=30:d=4",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=s=640x360:r=30:d=4",
                "-filter_complex",
                "[0]tpad=stop_mode=clone:stop_duration=26[held];[held][1]concat=n=2:v=1[v]",
                "-map",
                "[v]",
            ],
            Alerts {
                black: true,
                frozen: true,
            },
        );
        assert_eq!(
            seen,
            [(PictureAlert::Frozen, true), (PictureAlert::Frozen, false)]
        );
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
