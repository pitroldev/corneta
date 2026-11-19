//! Opt-in alert for a live with no sound at all, such as a headset muted on its cable or OBS
//! capturing the wrong input device.
//! A separate mono 8 kHz decode of the OBS audio keeps the watch to a few kilobytes per second.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::RecvTimeoutError;
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::black_screen::{spawn_chunks, Watch};

const RATE: usize = 8_000;
const SECOND_BYTES: usize = RATE * 2;
/// -60 dBFS: below any audible voice, game or music, above what AAC decodes from digital silence.
const SILENT_PEAK: u16 = 33;
/// A streamer reading chat in silence behind a noise gate goes quiet for a while on purpose.
const SILENT_AFTER: Duration = Duration::from_secs(30);
/// An ingest without an audio track ends the probe at once; retry slowly instead of every 2 s.
const NO_AUDIO_RETRY: Duration = Duration::from_secs(15);

pub fn probe_args(ingest_url: &str) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-threads".into(),
        "1".into(),
    ];
    if ingest_url.starts_with("rtmp://") || ingest_url.starts_with("rtmps://") {
        args.extend(["-rtmp_enhanced_codecs", "hvc1,av01"].map(String::from));
    }
    args.extend(
        [
            "-i",
            ingest_url,
            "-map",
            "0:a:0",
            "-vn",
            "-sn",
            "-dn",
            "-ac",
            "1",
            "-ar",
            &RATE.to_string(),
            "-f",
            "s16le",
            "-",
        ]
        .map(String::from),
    );
    args
}

/// One second of little-endian 16-bit mono samples with no audible peak.
pub fn is_silent(pcm: &[u8]) -> bool {
    pcm.len() >= 2
        && pcm
            .chunks_exact(2)
            .all(|s| i16::from_le_bytes([s[0], s[1]]).unsigned_abs() < SILENT_PEAK)
}

/// `paused` covers a slate on air: viewers then hear it instead of OBS.
pub fn run(
    ffmpeg: &Path,
    running: Arc<AtomicBool>,
    has_signal: Arc<AtomicBool>,
    ingest_url: String,
    paused: impl Fn() -> bool,
    mut on_change: impl FnMut(bool),
) {
    let args = probe_args(&ingest_url);
    let mut watch = Watch::new(SILENT_AFTER);
    let mut emit = |change: Option<bool>| {
        if let Some(on) = change {
            on_change(on);
        }
    };
    while running.load(Ordering::Relaxed) {
        if !has_signal.load(Ordering::Relaxed) {
            // A lost signal has its own alert.
            emit(watch.clear());
            std::thread::sleep(Duration::from_millis(500));
            continue;
        }
        let (mut child, seconds) = match spawn_chunks(ffmpeg, &args, SECOND_BYTES, SECOND_BYTES) {
            Ok(probe) => probe,
            Err(e) => {
                log::warn!("silence watch: probe could not start: {e}");
                return;
            }
        };
        let mut heard_any = false;
        while running.load(Ordering::Relaxed) && has_signal.load(Ordering::Relaxed) {
            match seconds.recv_timeout(Duration::from_millis(1500)) {
                Ok(pcm) => {
                    heard_any = true;
                    let silent = is_silent(&pcm) && !paused();
                    emit(watch.observe(silent, Instant::now()));
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
        let _ = child.kill();
        let _ = child.wait();
        std::thread::sleep(if heard_any {
            Duration::from_secs(2)
        } else {
            NO_AUDIO_RETRY
        });
    }
    emit(watch.clear());
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn second(amplitude: i16) -> Vec<u8> {
        (0..RATE)
            .flat_map(|i| {
                let sample = if i % 2 == 0 { amplitude } else { -amplitude };
                sample.to_le_bytes()
            })
            .collect()
    }

    #[test]
    fn decoded_silence_reads_as_silent_but_a_quiet_voice_does_not() {
        assert!(is_silent(&second(0)));
        assert!(is_silent(&second(SILENT_PEAK as i16 - 1)));
        // -50 dBFS, a mic far from the mouth, is still sound.
        assert!(!is_silent(&second(104)));
        let mut one_click = second(0);
        one_click[RATE..RATE + 2].copy_from_slice(&i16::MIN.to_le_bytes());
        assert!(!is_silent(&one_click), "i16::MIN must not overflow");
        assert!(!is_silent(&[]));
    }

    #[test]
    fn the_probe_decodes_only_the_first_audio_track_at_a_low_rate() {
        let args = probe_args("rtmp://127.0.0.1:1935/live/obs");
        let joined = args.join(" ");
        assert!(joined.contains("-i rtmp://127.0.0.1:1935/live/obs -map 0:a:0 -vn"));
        assert!(joined.contains("-ac 1 -ar 8000 -f s16le -"));
        assert!(args.contains(&"-rtmp_enhanced_codecs".to_string()));
        assert!(!probe_args("srt://127.0.0.1:8890").contains(&"-rtmp_enhanced_codecs".to_string()));
    }

    #[test]
    #[ignore = "requires verified ffmpeg on PATH in a disposable contributor checkout"]
    fn a_silent_rtmp_feed_raises_the_alert_and_sound_clears_it() {
        use std::sync::Mutex;
        let dir = std::env::temp_dir().join("corneta-silence-watch-e2e");
        std::fs::create_dir_all(&dir).unwrap();
        let feed = dir.join("feed.flv");
        // The silent stretch outlasts the probe's start-up plus the alert delay.
        let made = Command::new("ffmpeg")
            .args(["-y", "-hide_banner", "-loglevel", "error"])
            .args(["-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=42"])
            .args([
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:sample_rate=48000:d=3",
            ])
            .args(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=34"])
            .args([
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:sample_rate=48000:d=5",
            ])
            .args([
                "-filter_complex",
                "[1]aformat=channel_layouts=stereo[a1];[3]aformat=channel_layouts=stereo[a3];\
                 [a1][2][a3]concat=n=3:v=0:a=1[a]",
            ])
            .args(["-map", "0:v", "-map", "[a]"])
            .args(["-c:v", "libx264", "-preset", "veryfast", "-g", "30"])
            .args(["-pix_fmt", "yuv420p", "-c:a", "aac", "-f", "flv"])
            .arg(&feed)
            .status();
        assert!(
            made.is_ok_and(|status| status.success()),
            "generate the feed (is ffmpeg on PATH?)"
        );
        let (url, mut server) = crate::black_screen::tests::serve_feed(&feed);
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
        let deadline = Instant::now() + Duration::from_secs(60);
        while changes.lock().unwrap().len() < 2 && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(200));
        }
        let seen = changes.lock().unwrap().clone();
        running.store(false, Ordering::Relaxed);
        let _ = server.kill();
        let _ = server.wait();
        watcher.join().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(seen, [true, false]);
    }
}
