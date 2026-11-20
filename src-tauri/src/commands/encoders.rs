use super::quiet_command;
use crate::http_client as ureq;
use crate::i18n::Msg;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EncoderInfo {
    pub kind: String,
    pub label: String,
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_sessions: Option<u32>,
}

// Automatic encoder priority: (kind, label, FFmpeg codec, typical session limit).
const HW_ENCODERS: [(&str, &str, &str, Option<u32>); 4] = [
    ("nvenc", "NVIDIA NVENC", "h264_nvenc", Some(8)),
    ("qsv", "Intel Quick Sync", "h264_qsv", None),
    ("amf", "AMD AMF", "h264_amf", None),
    (
        "videotoolbox",
        "Apple VideoToolbox",
        "h264_videotoolbox",
        None,
    ),
];

// Share concurrent probes from settings and stream startup.
static HW_PROBE: tokio::sync::OnceCell<[bool; 4]> = tokio::sync::OnceCell::const_new();
const ENCODER_CACHE_SCHEMA: u8 = 1;
const ENCODER_CACHE_TTL_SEC: u64 = 30 * 24 * 60 * 60;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncoderProbeCache {
    schema: u8,
    signature: String,
    saved_at: u64,
    available: [bool; 4],
}

fn epoch_sec() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn encoder_cache_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    Some(app.path().app_config_dir().ok()?.join("encoder-probe.json"))
}

fn cached_encoder_probe(app: &AppHandle, signature: &str) -> Option<[bool; 4]> {
    let path = encoder_cache_path(app)?;
    if std::fs::metadata(&path).ok()?.len() > 16 * 1024 {
        return None;
    }
    let cache: EncoderProbeCache = serde_json::from_slice(&std::fs::read(path).ok()?).ok()?;
    encoder_cache_is_valid(&cache, signature, epoch_sec()).then_some(cache.available)
}

fn encoder_cache_is_valid(cache: &EncoderProbeCache, signature: &str, now: u64) -> bool {
    cache.schema == ENCODER_CACHE_SCHEMA
        && cache.signature == signature
        && now.saturating_sub(cache.saved_at) <= ENCODER_CACHE_TTL_SEC
}

fn save_encoder_probe(app: &AppHandle, signature: String, available: [bool; 4]) {
    let Some(path) = encoder_cache_path(app) else {
        return;
    };
    let Some(dir) = path.parent() else { return };
    if std::fs::create_dir_all(dir).is_err() {
        return;
    }
    let cache = EncoderProbeCache {
        schema: ENCODER_CACHE_SCHEMA,
        signature,
        saved_at: epoch_sec(),
        available,
    };
    let Ok(bytes) = serde_json::to_vec(&cache) else {
        return;
    };
    let tmp = path.with_extension("json.tmp");
    if std::fs::write(&tmp, bytes).is_ok() {
        let _ = std::fs::remove_file(&path);
        if std::fs::rename(&tmp, &path).is_err() {
            let _ = std::fs::remove_file(tmp);
        }
    }
}

#[cfg(windows)]
fn gpu_driver_signature() -> String {
    // Hardware or driver changes invalidate the persisted probe result.
    let script = "Get-CimInstance Win32_VideoController | Sort-Object PNPDeviceID | ForEach-Object { '{0}:{1}:{2}' -f $_.PNPDeviceID,$_.DriverVersion,$_.VideoProcessor }";
    quiet_command("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned())
        .filter(|signature| !signature.is_empty())
        .unwrap_or_else(|| "gpu-desconhecida".into())
}

#[cfg(not(windows))]
fn gpu_driver_signature() -> String {
    // Include the OS version to invalidate VideoToolbox results after system updates.
    sysinfo::System::long_os_version().unwrap_or_else(|| "sistema-desconhecido".into())
}

async fn encoder_environment_signature(app: &AppHandle) -> String {
    let ffmpeg_version = async {
        match app.shell().sidecar("ffmpeg") {
            Ok(command) => command
                .args(["-version"])
                .output()
                .await
                .ok()
                .and_then(|output| {
                    String::from_utf8_lossy(&output.stdout)
                        .lines()
                        .next()
                        .map(str::to_owned)
                })
                .unwrap_or_else(|| "ffmpeg-unknown".into()),
            Err(_) => "ffmpeg-unavailable".into(),
        }
    };
    let (ffmpeg, gpu) = tokio::join!(
        ffmpeg_version,
        tauri::async_runtime::spawn_blocking(gpu_driver_signature)
    );
    let gpu = gpu.unwrap_or_else(|_| "gpu-desconhecida".into());
    format!(
        "{}|{}|{}|{}|{}",
        ENCODER_CACHE_SCHEMA,
        app.package_info().version,
        std::env::consts::OS,
        ffmpeg.trim(),
        gpu.trim()
    )
}

async fn probe_encoder(app: AppHandle, codec: &'static str) -> bool {
    let Ok(command) = app.shell().sidecar("ffmpeg") else {
        return false;
    };
    let result = command
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=1280x720:r=30",
            "-frames:v",
            "3",
            "-c:v",
            codec,
            "-f",
            "null",
            "-",
        ])
        .output()
        .await;
    matches!(result, Ok(ref output) if output.status.success())
}

// A listed codec may lack usable hardware; validate it with an actual encode.
async fn probe_hw_encoders(app: &AppHandle) -> [bool; 4] {
    let app = app.clone();
    *HW_PROBE
        .get_or_init(|| async move {
            let signature = encoder_environment_signature(&app).await;
            let app_for_cache = app.clone();
            let signature_for_cache = signature.clone();
            if let Ok(Some(cached)) = tauri::async_runtime::spawn_blocking(move || {
                cached_encoder_probe(&app_for_cache, &signature_for_cache)
            })
            .await
            {
                log::info!("hardware encoders: valid persisted cache");
                return cached;
            }

            let (nvenc, qsv, amf, videotoolbox) = tokio::join!(
                probe_encoder(app.clone(), HW_ENCODERS[0].2),
                probe_encoder(app.clone(), HW_ENCODERS[1].2),
                probe_encoder(app.clone(), HW_ENCODERS[2].2),
                probe_encoder(app.clone(), HW_ENCODERS[3].2),
            );
            let available = [nvenc, qsv, amf, videotoolbox];
            log::info!(
                "verified hardware encoders: {}",
                HW_ENCODERS
                    .iter()
                    .zip(available)
                    .filter(|(_, works)| *works)
                    .map(|((kind, ..), _)| *kind)
                    .collect::<Vec<_>>()
                    .join(", ")
            );
            let app_for_cache = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                save_encoder_probe(&app_for_cache, signature, available)
            })
            .await
            .ok();
            available
        })
        .await
}

pub(crate) async fn detect_hw_encoder(app: &AppHandle) -> Option<String> {
    let ok = probe_hw_encoders(app).await;
    HW_ENCODERS
        .iter()
        .zip(ok)
        .find(|(_, works)| *works)
        .map(|((_, _, codec, _), _)| (*codec).to_string())
}

#[tauri::command]
pub async fn detect_encoders(app: AppHandle) -> Vec<EncoderInfo> {
    let ok = probe_hw_encoders(&app).await;
    let mut out: Vec<EncoderInfo> = HW_ENCODERS
        .iter()
        .zip(ok)
        .map(|((kind, label, _, max_sessions), available)| EncoderInfo {
            kind: (*kind).into(),
            label: (*label).into(),
            available,
            max_sessions: *max_sessions,
        })
        .collect();
    out.push(EncoderInfo {
        kind: "software".into(),
        label: "Software (x264)".into(),
        available: true,
        max_sessions: Some(1),
    });
    out
}

struct UploadBody {
    deadline: std::time::Instant,
    sent: std::sync::Arc<std::sync::atomic::AtomicU64>,
}

impl std::io::Read for UploadBody {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if std::time::Instant::now() >= self.deadline {
            return Ok(0);
        }
        buf.fill(0);
        self.sent
            .fetch_add(buf.len() as u64, std::sync::atomic::Ordering::Relaxed);
        Ok(buf.len())
    }
}

#[tauri::command]
pub async fn test_upload() -> Result<f64, String> {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    tauri::async_runtime::spawn_blocking(|| {
        // Exclude TCP slow-start from the measured interval.
        const CONNS: usize = 6;
        let warmup = Duration::from_millis(1200);
        let measure = Duration::from_secs(3);

        let sent = Arc::new(AtomicU64::new(0));
        let deadline = Instant::now() + warmup + measure + Duration::from_millis(500);

        let handles: Vec<_> = (0..CONNS)
            .map(|_| {
                let sent = sent.clone();
                std::thread::spawn(move || {
                    while Instant::now() < deadline {
                        let agent = ureq::AgentBuilder::new()
                            .timeout_write(Duration::from_secs(20))
                            .timeout_read(Duration::from_secs(20))
                            .build();
                        let body = UploadBody {
                            deadline,
                            sent: sent.clone(),
                        };
                        let _ = agent.post("https://speed.cloudflare.com/__up").send(body);
                    }
                })
            })
            .collect();

        std::thread::sleep(warmup);
        let c0 = sent.load(Ordering::Relaxed);
        let t0 = Instant::now();
        std::thread::sleep(measure);
        let c1 = sent.load(Ordering::Relaxed);
        let secs = t0.elapsed().as_secs_f64();

        for h in handles {
            let _ = h.join();
        }

        let bytes = c1.saturating_sub(c0);
        if bytes == 0 || secs <= 0.0 {
            return Err(Msg::UploadMeasureFailed.now());
        }
        let mbps = (bytes as f64 * 8.0) / secs / 1_000_000.0;
        Ok((mbps * 10.0).round() / 10.0)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

#[cfg(test)]
mod encoder_cache_tests {
    use super::{
        encoder_cache_is_valid, EncoderProbeCache, ENCODER_CACHE_SCHEMA, ENCODER_CACHE_TTL_SEC,
    };

    fn cache(saved_at: u64) -> EncoderProbeCache {
        EncoderProbeCache {
            schema: ENCODER_CACHE_SCHEMA,
            signature: "app|ffmpeg|gpu|driver".into(),
            saved_at,
            available: [true, false, false, false],
        }
    }

    #[test]
    fn encoder_cache_requires_matching_environment() {
        let cache = cache(100);
        assert!(encoder_cache_is_valid(&cache, "app|ffmpeg|gpu|driver", 101));
        assert!(!encoder_cache_is_valid(&cache, "new-driver", 101));
    }

    #[test]
    fn encoder_cache_expires() {
        let cache = cache(100);
        assert!(!encoder_cache_is_valid(
            &cache,
            "app|ffmpeg|gpu|driver",
            101 + ENCODER_CACHE_TTL_SEC,
        ));
    }
}
