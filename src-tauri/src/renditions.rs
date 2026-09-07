//! One local encoder per identical effective configuration, independent network
//! egresses. ABR can leave/rejoin the baseline rendition without affecting peers.
use crate::{config::AppConfig, engine, AppState};
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc,
};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::{process::CommandEvent, ShellExt};

const PROGRESS_TIMEOUT: Duration = Duration::from_secs(8);
const HEALTHY_RUN: Duration = Duration::from_secs(30);

/// Logs arriving is not proof of progress: a stuck encoder can keep printing
/// the same frame count. Only strictly advancing, finite counters renew its lease.
struct ProgressWatchdog {
    frames: f64,
    last_advance: Instant,
    healthy_since: Option<Instant>,
}

impl ProgressWatchdog {
    fn new(now: Instant) -> Self {
        Self {
            frames: 0.0,
            last_advance: now,
            healthy_since: None,
        }
    }

    fn observe(&mut self, line: &str, now: Instant) -> bool {
        let Some(frames) = crate::engine_policy::parse_kv(line, "frame=") else {
            return false;
        };
        if !frames.is_finite() || frames <= self.frames {
            return false;
        }
        if self.timed_out(now) {
            self.healthy_since = None;
        }
        self.healthy_since.get_or_insert(now);
        self.frames = frames;
        self.last_advance = now;
        true
    }

    fn timed_out(&self, now: Instant) -> bool {
        now.saturating_duration_since(self.last_advance) >= PROGRESS_TIMEOUT
    }

    fn healthy_run(&self) -> bool {
        self.healthy_since
            .is_some_and(|since| self.last_advance.saturating_duration_since(since) >= HEALTHY_RUN)
    }
}

fn record_failure(failures: &mut u8, progress: &ProgressWatchdog) -> bool {
    // Process uptime includes time spent hung. Reset retries only after actual
    // sustained progress, so repeated hangs still reach independent conversion.
    if progress.healthy_run() {
        *failures = 0;
    }
    *failures = failures.saturating_add(1);
    *failures >= 3
}

pub(crate) struct Plan {
    pub targets: Vec<String>,
    pub url: String,
    args: Vec<String>,
}

pub(crate) fn plan(config: &AppConfig, source: &str, codec: Option<&str>) -> Vec<Plan> {
    let mut groups: HashMap<Vec<String>, Vec<String>> = HashMap::new();
    let mut encoding_config = config.clone();
    encoding_config.mode = "per-platform".into();
    for target in config.targets.iter().filter(|target| {
        target.enabled && engine::effective_action(&config.mode, target) == "transcode"
    }) {
        let mut local = target.clone();
        local.encoding.preset = Some(engine::effective_preset(target));
        local.platform_id = "rendition".into();
        local.ingest_url = "rtmp://127.0.0.1/placeholder".into();
        let mut args =
            engine::ffmpeg_args_for_target(&encoding_config, &local, "", None, source, codec);
        args.pop(); // Destination URL is transport, not an encoding parameter.
        groups.entry(args).or_default().push(target.id.clone());
    }
    let mut groups: Vec<_> = groups
        .into_iter()
        .filter(|(_, targets)| targets.len() > 1)
        .collect();
    groups.sort_by(|left, right| left.1[0].cmp(&right.1[0]));
    groups
        .into_iter()
        .enumerate()
        .map(|(index, (mut args, targets))| {
            let url = format!("{}_rendition_{index}", engine::program_url(config));
            args.push(url.clone());
            Plan { targets, url, args }
        })
        .collect()
}

#[derive(Clone)]
pub(crate) struct Rendition {
    pub url: String,
    pub ready: Arc<AtomicBool>,
    pub failed: Arc<AtomicBool>,
    demand: Arc<AtomicUsize>,
}

pub(crate) struct Lease(Arc<AtomicUsize>);
impl Drop for Lease {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::Relaxed);
    }
}
impl Rendition {
    pub fn acquire(&self) -> Lease {
        self.demand.fetch_add(1, Ordering::Relaxed);
        Lease(self.demand.clone())
    }
}

pub(crate) fn start(
    app: &AppHandle,
    plans: Vec<Plan>,
    running: &Arc<AtomicBool>,
    signal: &Arc<AtomicBool>,
) -> HashMap<String, Rendition> {
    let mut targets = HashMap::new();
    let generation = app.state::<AppState>().engine.lock().unwrap().start_gen;
    for (index, mut plan) in plans.into_iter().enumerate() {
        plan.url = format!("{}_{generation}", plan.url);
        if let Some(output) = plan.args.last_mut() {
            *output = plan.url.clone();
        }
        let rendition = Rendition {
            url: plan.url,
            ready: Arc::new(AtomicBool::new(false)),
            failed: Arc::new(AtomicBool::new(false)),
            demand: Arc::new(AtomicUsize::new(0)),
        };
        for target in plan.targets {
            targets.insert(target, rendition.clone());
        }
        let app = app.clone();
        let running = running.clone();
        let signal = signal.clone();
        tauri::async_runtime::spawn(async move {
            let id = format!("__rendition_{generation}_{index}");
            let mut failures = 0;
            let mut gpu_pipeline = crate::gpu_pipeline::enabled();
            while running.load(Ordering::Relaxed) && !rendition.failed.load(Ordering::Relaxed) {
                if !signal.load(Ordering::Relaxed) || rendition.demand.load(Ordering::Relaxed) == 0
                {
                    tokio::time::sleep(Duration::from_millis(100)).await;
                    continue;
                }
                let accelerated = if gpu_pipeline {
                    crate::gpu_pipeline::candidate(&plan.args)
                } else {
                    None
                };
                let used_gpu_pipeline = accelerated.is_some();
                let args = accelerated.unwrap_or_else(|| plan.args.clone());
                let spawned = app
                    .shell()
                    .sidecar("ffmpeg")
                    .and_then(|command| command.args(args).spawn());
                let Ok((mut events, child)) = spawned else {
                    rendition.failed.store(true, Ordering::Relaxed);
                    break;
                };
                app.state::<AppState>()
                    .engine
                    .lock()
                    .unwrap()
                    .ffmpegs
                    .insert(id.clone(), child);
                let mut progress = ProgressWatchdog::new(Instant::now());
                let mut idle_since = None;
                let mut expected_stop = false;
                let mut watchdog = tokio::time::interval(Duration::from_millis(100));
                loop {
                    tokio::select! {
                        event = events.recv() => match event {
                            Some(CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes)) => {
                                if progress.observe(&String::from_utf8_lossy(&bytes), Instant::now()) {
                                    rendition.ready.store(true, Ordering::Relaxed);
                                }
                            }
                            Some(CommandEvent::Terminated(_)) | None => break,
                            _ => {}
                        },
                        _ = watchdog.tick() => {
                            if !running.load(Ordering::Relaxed) || !signal.load(Ordering::Relaxed) { expected_stop = true; break; }
                            if rendition.demand.load(Ordering::Relaxed) == 0 {
                                if idle_since.get_or_insert_with(Instant::now).elapsed() >= Duration::from_secs(2) { expected_stop = true; break; }
                            } else { idle_since = None; }
                            if progress.timed_out(Instant::now()) {
                                log::warn!("shared encoder made no progress for 8s; restarting conversion");
                                break;
                            }
                        }
                    }
                }
                rendition.ready.store(false, Ordering::Relaxed);
                let child = app
                    .state::<AppState>()
                    .engine
                    .lock()
                    .unwrap()
                    .ffmpegs
                    .remove(&id);
                if let Some(child) = child {
                    let _ = tauri::async_runtime::spawn_blocking(move || {
                        crate::commands::kill_child_tree(child)
                    })
                    .await;
                }
                if !expected_stop {
                    if used_gpu_pipeline {
                        gpu_pipeline = false;
                    }
                    if record_failure(&mut failures, &progress) {
                        rendition.failed.store(true, Ordering::Relaxed);
                        log::warn!("shared encoder unavailable; destinations reverting to independent conversion");
                    }
                    tokio::time::sleep(Duration::from_secs(1)).await;
                }
            }
        });
    }
    targets
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn watchdog_bounds_both_startup_and_a_stall_after_readiness() {
        let start = Instant::now();
        let mut progress = ProgressWatchdog::new(start);
        assert!(!progress.timed_out(start + PROGRESS_TIMEOUT - Duration::from_millis(1)));
        assert!(progress.timed_out(start + PROGRESS_TIMEOUT));
        assert!(progress.observe("frame=   1 fps=0.0", start + Duration::from_secs(1)));
        assert!(!progress.timed_out(start + PROGRESS_TIMEOUT));
        assert!(progress.timed_out(start + PROGRESS_TIMEOUT + Duration::from_secs(1)));
    }

    #[test]
    fn repeated_invalid_and_regressing_counters_do_not_mask_a_hang() {
        let start = Instant::now();
        let mut progress = ProgressWatchdog::new(start);
        assert!(progress.observe("frame=30 fps=30.0", start));
        for line in [
            "frame=30 fps=30.0",
            "frame=29 fps=30.0",
            "frame=0",
            "frame=-1",
            "frame=NaN",
            "frame=inf",
            "frame=N/A",
            "warning: still running",
        ] {
            assert!(
                !progress.observe(line, start + Duration::from_secs(7)),
                "{line}"
            );
        }
        assert!(progress.timed_out(start + PROGRESS_TIMEOUT));
    }

    #[test]
    fn advancing_video_renews_the_deadline_and_a_restart_resets_it() {
        let start = Instant::now();
        let mut progress = ProgressWatchdog::new(start);
        for second in 1..=60 {
            let now = start + Duration::from_secs(second);
            assert!(progress.observe(&format!("frame={}", second * 30), now));
            assert!(!progress.timed_out(now));
        }
        assert!(progress.healthy_run());
        let restart = start + Duration::from_secs(70);
        let mut progress = ProgressWatchdog::new(restart);
        assert!(!progress.healthy_run());
        assert!(progress.observe("frame=1", restart));
        assert!(progress.timed_out(restart + PROGRESS_TIMEOUT));
    }

    #[test]
    fn repeated_hangs_reach_fallback_even_if_the_process_lived_for_minutes() {
        let start = Instant::now();
        let mut failures = 0;
        for attempt in 1..=3 {
            let mut progress = ProgressWatchdog::new(start);
            progress.observe("frame=1", start + Duration::from_secs(1));
            assert!(progress.timed_out(start + Duration::from_secs(120)));
            assert_eq!(record_failure(&mut failures, &progress), attempt == 3);
        }
    }

    #[test]
    fn only_sustained_progress_resets_the_failure_budget() {
        let start = Instant::now();
        let mut progress = ProgressWatchdog::new(start);
        let mut failures = 2;
        for second in 0..=30 {
            progress.observe(
                &format!("frame={}", second + 1),
                start + Duration::from_secs(second),
            );
        }
        assert!(!record_failure(&mut failures, &progress));
        assert_eq!(failures, 1);
        progress.observe("frame=100", start + Duration::from_secs(60));
        assert!(
            !progress.healthy_run(),
            "a long gap must break the healthy streak"
        );
    }

    #[test]
    fn demand_leases_are_independent_and_release_on_every_exit() {
        let rendition = Rendition {
            url: "local".into(),
            ready: Arc::new(AtomicBool::new(true)),
            failed: Arc::new(AtomicBool::new(false)),
            demand: Arc::new(AtomicUsize::new(0)),
        };
        let a = rendition.acquire();
        let b = rendition.acquire();
        drop(a);
        assert_eq!(rendition.demand.load(Ordering::Relaxed), 1);
        assert!(rendition.ready.load(Ordering::Relaxed));
        drop(b);
        assert_eq!(rendition.demand.load(Ordering::Relaxed), 0);
    }

    #[test]
    #[cfg(windows)]
    fn bundled_ffmpeg_encodes_once_and_egresses_preserve_audio_and_video() {
        use crate::config::{Target, TargetEncoding, VideoPreset};
        use std::os::windows::process::CommandExt;
        use std::path::Path;
        use std::process::Command;
        let ffmpeg = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries/ffmpeg-x86_64-pc-windows-msvc.exe");
        let dir = std::env::temp_dir().join(format!(
            "corneta-rendition-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&dir).unwrap();
        let run = |args: &[String]| {
            let result = Command::new(&ffmpeg)
                .args(args)
                .creation_flags(0x0800_0000)
                .output()
                .unwrap();
            assert!(
                result.status.success(),
                "FFmpeg integration failed: {}",
                String::from_utf8_lossy(&result.stderr)
            );
            result
        };
        let source = dir.join("source.flv").to_string_lossy().into_owned();
        let encoded = dir.join("encoded.flv").to_string_lossy().into_owned();
        let mut generate: Vec<String> = [
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=320x180:rate=30",
            "-f",
            "lavfi",
            "-i",
            "sine=sample_rate=32000",
            "-t",
            "1",
            "-c:v",
            "libx264",
            "-threads",
            "2",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-f",
            "flv",
        ]
        .map(String::from)
        .to_vec();
        generate.push(source.clone());
        run(&generate);
        let first = Target {
            id: "a".into(),
            platform_id: "twitch".into(),
            name: "A".into(),
            enabled: true,
            protocol: "rtmp".into(),
            ingest_url: "rtmp://127.0.0.1/unused".into(),
            has_key: true,
            encoding: TargetEncoding {
                action: "transcode".into(),
                encoder: "software".into(),
                preset: Some(VideoPreset {
                    width: 320,
                    height: 180,
                    fps: 30,
                    video_bitrate_kbps: 800,
                    audio_bitrate_kbps: 160,
                    keyframe_sec: 2,
                }),
                hybrid_override: None,
                reframe: None,
            },
        };
        let second = Target {
            id: "b".into(),
            ..first.clone()
        };
        let mut config = AppConfig {
            mode: "per-platform".into(),
            targets: vec![first.clone(), second],
            ..AppConfig::default()
        };
        config.settings.loudness_normalize = true;
        let mut plans = plan(&config, &source, None);
        assert_eq!(plans.len(), 1);
        *plans[0].args.last_mut().unwrap() = encoded.clone();
        run(&plans[0].args);
        let decoded_hashes = |input: &str, track: &str| {
            run(&[
                "-v", "error", "-i", input, "-map", track, "-f", "framemd5", "-",
            ]
            .map(String::from))
            .stdout
        };
        let video = decoded_hashes(&encoded, "0:v");
        let audio = decoded_hashes(&encoded, "0:a");
        for name in ["first", "reconnected"] {
            let output = dir
                .join(format!("{name}.flv"))
                .to_string_lossy()
                .into_owned();
            let mut args = engine::ffmpeg_args_for_rendition_egress(&config, &first, "", &encoded);
            *args.last_mut().unwrap() = output.clone();
            run(&args);
            assert_eq!(decoded_hashes(&output, "0:v"), video);
            assert_eq!(decoded_hashes(&output, "0:a"), audio);
        }
        // Only files generated in this unique test directory are removed.
        for name in ["source.flv", "encoded.flv", "first.flv", "reconnected.flv"] {
            std::fs::remove_file(dir.join(name)).unwrap();
        }
        std::fs::remove_dir(dir).unwrap();
    }
}
