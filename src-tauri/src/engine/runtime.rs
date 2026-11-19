use super::hybrid::effective_action;
use crate::config::AppConfig;
use crate::platforms::provider::{PlatformHealth, PlatformIssue};
use serde::Serialize;
use std::collections::HashMap;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TargetStatus {
    pub target_id: String,
    pub name: String,
    /// Kept with the status so the live panel lists what is streaming even after config edits.
    pub platform_id: String,
    /// copy | transcode, as this live sends it; a re-encode requested mid-live switches it.
    pub action: String,
    /// The user asked mid-live to re-encode what OBS sent, so platform warnings may lag behind.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub reencoded: bool,
    pub state: String, // idle | connecting | live | reconnecting | error | paused | waiting | signal-lost | brb
    pub bitrate_kbps: u32,
    pub fps: u32,
    pub dropped_frames: u32,
    pub uptime_sec: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// What the platform itself reports about this destination's live, when it can be asked.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform: Option<PlatformCheck>,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PlatformCheckState {
    Confirmed,
    NotLive,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCheck {
    pub state: PlatformCheckState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub health: Option<PlatformHealth>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub issues: Vec<PlatformIssue>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EngineSnapshot {
    pub state: String, // stopped | starting | live | error
    pub started_at: Option<u128>,
    /// OBS input can be live even when no destination accepts output.
    pub ingest_live: bool,
    /// Opaque attempt ID, safe to include in copied diagnostics.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub operation_id: Option<String>,
    /// Set only for a native failure already recorded and redacted.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_id: Option<String>,
    /// Stable code of that failure, so the UI can offer the fix that fits the cause.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    pub targets: HashMap<String, TargetStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// CPU and GPU usage are percentages.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memory_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub obs: Option<ObsStats>,
    /// Manual slate activation, independent of input loss.
    pub forced_brb: bool,
    /// The OBS picture has stayed fully black long enough to warn; set only with the opt-in watch.
    pub black_screen: bool,
    /// The OBS picture has not moved long enough to warn; set only with the opt-in watch.
    pub frozen_screen: bool,
    /// OBS has sent no audible sound long enough to warn; set only with the opt-in watch.
    pub silent_audio: bool,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ObsStats {
    pub active_fps: f64,
    pub avg_render_ms: f64,
    pub render_skipped: u32,
    pub output_skipped: u32,
    /// Output congestion as a ratio in 0..1.
    pub congestion: f64,
}

impl EngineSnapshot {
    pub fn stopped() -> Self {
        EngineSnapshot {
            state: "stopped".into(),
            started_at: None,
            ingest_live: false,
            operation_id: None,
            error_id: None,
            error_code: None,
            targets: HashMap::new(),
            message: None,
            cpu: None,
            gpu: None,
            memory_pct: None,
            obs: None,
            forced_brb: false,
            black_screen: false,
            frozen_screen: false,
            silent_audio: false,
        }
    }

    pub fn starting(config: &AppConfig, started_at: u128) -> Self {
        let mut s = Self::live(config, started_at);
        s.state = "starting".into();
        s
    }

    pub fn live(config: &AppConfig, started_at: u128) -> Self {
        let mut targets = HashMap::new();
        // Same filter as the start: a destination without a URL never connects.
        for t in config
            .targets
            .iter()
            .filter(|t| t.enabled && !t.ingest_url.is_empty())
        {
            targets.insert(
                t.id.clone(),
                TargetStatus {
                    target_id: t.id.clone(),
                    name: t.name.clone(),
                    platform_id: t.platform_id.clone(),
                    action: effective_action(&config.mode, t).to_string(),
                    reencoded: false,
                    state: "connecting".into(),
                    // Do not seed metrics from presets: only measured output may appear healthy.
                    bitrate_kbps: 0,
                    fps: 0,
                    dropped_frames: 0,
                    uptime_sec: 0.0,
                    message: None,
                    platform: None,
                },
            );
        }
        EngineSnapshot {
            state: "live".into(),
            started_at: Some(started_at),
            ingest_live: false,
            operation_id: None,
            error_id: None,
            error_code: None,
            targets,
            message: None,
            cpu: None,
            gpu: None,
            memory_pct: None,
            obs: None,
            forced_brb: false,
            black_screen: false,
            frozen_screen: false,
            silent_audio: false,
        }
    }
}

#[derive(Clone)]
pub struct RecorderLaunch {
    /// Must match the source read by destinations, whether live or composited.
    pub source: String,
    pub dir: std::path::PathBuf,
    pub session_path: std::path::PathBuf,
    pub id: String,
}

#[derive(Default)]
pub struct EngineRuntime {
    pub ffmpegs: HashMap<String, tauri_plugin_shell::process::CommandChild>,
    pub mediamtx: Option<tauri_plugin_shell::process::CommandChild>,
    /// Claim under the engine mutex before startup work; release on stop/fatal error to prevent double starts.
    pub live: bool,
    /// Set while a rehearsal holds the `live` claim, so a refused start can say why.
    pub rehearsing: bool,
    /// Hold from updater download through restart; startup checks the same engine mutex.
    pub update_in_progress: bool,
    /// Background work can outlive `live`; reserve under the mutex before exposing stopped state.
    pub pending_activity: std::sync::Arc<std::sync::atomic::AtomicUsize>,
    pub running: std::sync::Arc<std::sync::atomic::AtomicBool>,
    pub snapshot: Option<EngineSnapshot>,
    pub started_ms: u128,
    /// Cached to avoid redrawing an unchanged tray icon.
    pub tray_quality: String,
    /// Cached to avoid a window-title update on every metric emission.
    pub win_title: String,
    pub session_path: Option<std::path::PathBuf>,
    /// Retry must reuse the original source, not recompute a possibly changed compositor decision.
    pub recorder_launch: Option<RecorderLaunch>,
    /// A true flag prevents the target supervisor from respawning FFmpeg.
    pub paused: HashMap<String, std::sync::Arc<std::sync::atomic::AtomicBool>>,
    /// Terminal failures park the supervisor until retry_target clears the flag.
    pub auth_error: HashMap<String, std::sync::Arc<std::sync::atomic::AtomicBool>>,
    /// Set by reencode_target: the destination stops copying OBS's signal until the live ends.
    pub reencode: HashMap<String, std::sync::Arc<std::sync::atomic::AtomicBool>>,
    /// Available only while the compositor is running.
    pub force_brb: Option<std::sync::Arc<std::sync::atomic::AtomicBool>>,
    /// Revalidate `live` and this generation after awaits so stopped/superseded setup cannot install children.
    pub start_gen: u64,
    /// Throttle metrics in milliseconds without suppressing state transitions.
    pub last_emit_ms: u128,
    /// Random operation ID; never derive it from target names or IDs.
    pub operation_id: Option<String>,
    /// Map target IDs to safe platform enums; target IDs must not enter telemetry.
    pub target_platforms: HashMap<String, String>,
    pub telemetry_encoder_kind: String,
    /// Aggregate off the hot path and emit only at session end.
    pub telemetry_reconnect_count: u32,
    /// Request time in Unix ms; unlike started_ms, it is not reset when output first goes live.
    pub telemetry_start_requested_ms: u128,
    /// Reference the existing setup error without capturing the exception twice.
    pub telemetry_last_error_id: Option<String>,
    /// What the error snapshot tells the UI; narrower than the telemetry code for a taken port.
    pub last_error_code: Option<String>,
    /// Bind the last error to its operation so stale diagnostics cannot attach to a new start.
    pub telemetry_last_error_operation_id: Option<String>,
}

/// Keep updates excluded until background work ends; cancellation releases without locking the engine.
#[must_use = "Keep the activity guard alive until all reserved work finishes"]
pub struct EngineActivityGuard {
    pending: std::sync::Arc<std::sync::atomic::AtomicUsize>,
}

impl EngineRuntime {
    /// Call only while holding the engine mutex, before releasing/spawning the work.
    pub fn begin_pending_activity(&self) -> EngineActivityGuard {
        self.pending_activity
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        EngineActivityGuard {
            pending: self.pending_activity.clone(),
        }
    }
}

impl Drop for EngineActivityGuard {
    fn drop(&mut self) {
        self.pending
            .fetch_sub(1, std::sync::atomic::Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pending_activity_outlives_stopped_state_until_every_owner_finishes() {
        use std::sync::atomic::Ordering;
        use std::sync::Mutex;

        let engine = Mutex::new(EngineRuntime::default());
        let (cleanup, recording, pending) = {
            let mut runtime = engine.lock().unwrap();
            runtime.live = true;
            let cleanup = runtime.begin_pending_activity();
            let recording = runtime.begin_pending_activity();
            runtime.live = false;
            runtime.snapshot = Some(EngineSnapshot::stopped());
            (cleanup, recording, runtime.pending_activity.clone())
        };
        assert_eq!(pending.load(Ordering::Acquire), 2);
        drop(cleanup);
        assert_eq!(pending.load(Ordering::Acquire), 1);
        drop(recording);
        assert_eq!(pending.load(Ordering::Acquire), 0);
    }

    #[test]
    fn unpolled_activity_is_reserved_and_released_when_cancelled() {
        use std::sync::atomic::Ordering;
        use std::sync::Mutex;

        let engine = Mutex::new(EngineRuntime::default());
        let (activity, pending) = {
            let runtime = engine.lock().unwrap();
            (
                runtime.begin_pending_activity(),
                runtime.pending_activity.clone(),
            )
        };
        let task = async move {
            let _activity = activity;
            std::future::pending::<()>().await;
        };
        assert_eq!(pending.load(Ordering::Acquire), 1);
        drop(task);
        assert_eq!(pending.load(Ordering::Acquire), 0);
    }

    #[tokio::test]
    async fn aborting_pending_activity_releases_its_reservation() {
        use std::sync::atomic::Ordering;
        use std::sync::Mutex;

        let engine = Mutex::new(EngineRuntime::default());
        let (activity, pending) = {
            let runtime = engine.lock().unwrap();
            (
                runtime.begin_pending_activity(),
                runtime.pending_activity.clone(),
            )
        };
        let (ready, waiting) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(async move {
            let _activity = activity;
            ready.send(()).unwrap();
            std::future::pending::<()>().await;
        });
        waiting.await.unwrap();
        assert_eq!(pending.load(Ordering::Acquire), 1);
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        assert_eq!(pending.load(Ordering::Acquire), 0);
    }
}
