//! Sparse process sampling and persistent GPU counters keep reporting overhead bounded.

use std::collections::HashMap;

use serde::Serialize;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};

const NORMAL_PROCESS_EVERY_TICKS: u64 = 3;
const PRESSURE_THRESHOLD: f64 = 75.0;
const PRESSURE_DETAIL_TICKS: u8 = 15;
const MAX_RECORDED_APPS: usize = 3;
const MIN_RELEVANT_PRESSURE: f64 = 4.0;
const MIN_RELEVANT_MEMORY_MB: f64 = 512.0;

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ResourceAppSample {
    /// Session-stable normalized identifier, never a file path.
    pub app_ref: String,
    pub name: String,
    /// Percentage of the whole machine, not per-core utilization.
    pub cpu: f64,
    pub memory_mb: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_3d: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_encode: Option<f64>,
}

pub struct ResourceUsage {
    pub cpu: f64,
    pub gpu: Option<f64>,
    pub memory_pct: Option<f64>,
    /// Empty between detailed samples to limit journal overhead.
    pub apps: Vec<ResourceAppSample>,
}

pub struct ResourceSampler {
    system: System,
    logical_cpus: f64,
    tick: u64,
    pressure_ticks_left: u8,
    was_under_pressure: bool,
    last_recorded_apps: Vec<ResourceAppSample>,
    #[cfg(windows)]
    gpu: Option<WindowsGpuSampler>,
}

impl ResourceSampler {
    pub fn new() -> Self {
        let mut system = System::new();
        system.refresh_cpu_usage();
        system.refresh_memory();
        system.refresh_processes_specifics(ProcessesToUpdate::All, true, process_refresh_kind());

        Self {
            system,
            logical_cpus: std::thread::available_parallelism()
                .map(|n| n.get() as f64)
                .unwrap_or(1.0),
            tick: 0,
            pressure_ticks_left: 0,
            was_under_pressure: false,
            last_recorded_apps: Vec::new(),
            #[cfg(windows)]
            gpu: WindowsGpuSampler::new(),
        }
    }

    /// Wait at least MINIMUM_CPU_UPDATE_INTERVAL between samples for meaningful CPU deltas.
    pub fn sample(&mut self) -> ResourceUsage {
        self.system.refresh_cpu_usage();
        self.system.refresh_memory();

        let cpu = self.system.global_cpu_usage() as f64;
        let memory_pct = memory_pressure(&self.system);

        #[cfg(windows)]
        let gpu_sample = self.gpu.as_mut().and_then(WindowsGpuSampler::sample);
        #[cfg(not(windows))]
        let gpu_sample: Option<GpuSample> = None;

        let gpu = gpu_sample.as_ref().map(GpuSample::global);
        let under_pressure = cpu >= PRESSURE_THRESHOLD
            || gpu.is_some_and(|value| value >= PRESSURE_THRESHOLD)
            || memory_pct.is_some_and(|value| value >= PRESSURE_THRESHOLD);
        update_pressure_burst(
            &mut self.was_under_pressure,
            &mut self.pressure_ticks_left,
            under_pressure,
        );

        let refresh_processes =
            self.tick.is_multiple_of(NORMAL_PROCESS_EVERY_TICKS) || self.pressure_ticks_left > 0;
        let apps = if refresh_processes {
            self.system.refresh_processes_specifics(
                ProcessesToUpdate::All,
                true,
                process_refresh_kind(),
            );
            let fresh = collect_relevant_apps(
                &self.system,
                self.logical_cpus,
                memory_pct.unwrap_or_default(),
                gpu_sample.as_ref(),
            );
            // During pressure bursts, persist only material ranking changes or the normal interval.
            if self.tick.is_multiple_of(NORMAL_PROCESS_EVERY_TICKS)
                || materially_changed(&self.last_recorded_apps, &fresh)
            {
                self.last_recorded_apps.clone_from(&fresh);
                fresh
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        };

        self.tick = self.tick.wrapping_add(1);
        self.pressure_ticks_left = self.pressure_ticks_left.saturating_sub(1);

        ResourceUsage {
            cpu,
            gpu,
            memory_pct,
            apps,
        }
    }
}

/// Start one short burst on entering pressure; sustained GPU load must not trigger permanent fast scans.
fn update_pressure_burst(was_under_pressure: &mut bool, ticks_left: &mut u8, under_pressure: bool) {
    if under_pressure && !*was_under_pressure {
        *ticks_left = PRESSURE_DETAIL_TICKS;
    }
    *was_under_pressure = under_pressure;
}

fn materially_changed(before: &[ResourceAppSample], after: &[ResourceAppSample]) -> bool {
    if before.len() != after.len() {
        return true;
    }
    before.iter().zip(after).any(|(left, right)| {
        left.app_ref != right.app_ref
            || (left.cpu - right.cpu).abs() >= 10.0
            || (left.memory_mb - right.memory_mb).abs() >= 512.0
            || option_delta(left.gpu_3d, right.gpu_3d) >= 10.0
            || option_delta(left.gpu_encode, right.gpu_encode) >= 10.0
    })
}

fn option_delta(left: Option<f64>, right: Option<f64>) -> f64 {
    match (left, right) {
        (Some(left), Some(right)) => (left - right).abs(),
        (None, None) => 0.0,
        _ => f64::INFINITY,
    }
}

fn process_refresh_kind() -> ProcessRefreshKind {
    ProcessRefreshKind::nothing()
        .with_cpu()
        .with_memory()
        .without_tasks()
}

fn memory_pressure(system: &System) -> Option<f64> {
    let total = system.total_memory();
    if total == 0 {
        return None;
    }
    Some(
        ((total.saturating_sub(system.available_memory())) as f64 * 100.0 / total as f64)
            .clamp(0.0, 100.0),
    )
}

#[derive(Default)]
struct AppAggregate {
    name: String,
    cpu: f64,
    memory_mb: f64,
    gpu_3d: f64,
    gpu_encode: f64,
    has_gpu_3d: bool,
    has_gpu_encode: bool,
}

fn collect_relevant_apps(
    system: &System,
    logical_cpus: f64,
    memory_pct: f64,
    gpu: Option<&GpuSample>,
) -> Vec<ResourceAppSample> {
    let total_memory_mb = system.total_memory() as f64 / 1_048_576.0;
    let mut grouped: HashMap<String, AppAggregate> = HashMap::new();

    for (pid, process) in system.processes() {
        let Some((app_ref, name)) = normalized_app_name(&process.name().to_string_lossy()) else {
            continue;
        };
        let entry = grouped.entry(app_ref).or_default();
        if entry.name.is_empty() {
            entry.name = name;
        }
        entry.cpu += process.cpu_usage() as f64 / logical_cpus.max(1.0);
        entry.memory_mb += process.memory() as f64 / 1_048_576.0;

        if let Some(per_pid) = gpu.and_then(|sample| sample.by_pid.get(&pid.as_u32())) {
            entry.gpu_3d += per_pid.gpu_3d;
            entry.gpu_encode += per_pid.gpu_encode;
            entry.has_gpu_3d |= per_pid.has_gpu_3d;
            entry.has_gpu_encode |= per_pid.has_gpu_encode;
        }
    }

    let memory_is_tight = memory_pct >= PRESSURE_THRESHOLD;
    let mut apps: Vec<ResourceAppSample> = grouped
        .into_iter()
        .filter_map(|(app_ref, app)| {
            let cpu = app.cpu.clamp(0.0, 100.0);
            let gpu_3d = app.gpu_3d.clamp(0.0, 100.0);
            let gpu_encode = app.gpu_encode.clamp(0.0, 100.0);
            let relevant = cpu >= MIN_RELEVANT_PRESSURE
                || gpu_3d >= MIN_RELEVANT_PRESSURE
                || gpu_encode >= MIN_RELEVANT_PRESSURE
                || (memory_is_tight && app.memory_mb >= MIN_RELEVANT_MEMORY_MB);
            relevant.then_some(ResourceAppSample {
                app_ref,
                name: app.name,
                cpu: round_one(cpu),
                memory_mb: round_one(app.memory_mb.max(0.0)),
                gpu_3d: app.has_gpu_3d.then(|| round_one(gpu_3d)),
                gpu_encode: app.has_gpu_encode.then(|| round_one(gpu_encode)),
            })
        })
        .collect();

    apps.sort_by(|a, b| {
        app_pressure_score(b, memory_is_tight, total_memory_mb)
            .total_cmp(&app_pressure_score(a, memory_is_tight, total_memory_mb))
            .then_with(|| a.app_ref.cmp(&b.app_ref))
    });
    apps.truncate(MAX_RECORDED_APPS);
    apps
}

fn app_pressure_score(app: &ResourceAppSample, memory_is_tight: bool, total_memory_mb: f64) -> f64 {
    let memory_share = if memory_is_tight && total_memory_mb > 0.0 {
        app.memory_mb * 100.0 / total_memory_mb
    } else {
        0.0
    };
    app.cpu
        .max(app.gpu_3d.unwrap_or_default())
        .max(app.gpu_encode.unwrap_or_default())
        .max(memory_share)
}

fn normalized_app_name(raw: &str) -> Option<(String, String)> {
    // Keep only the basename even if a platform unexpectedly supplies a full path.
    let basename = raw.rsplit(['/', '\\']).next().unwrap_or(raw);
    let clean: String = basename
        .chars()
        .filter(|ch| !ch.is_control())
        .take(64)
        .collect();
    let mut display = clean.trim().to_string();
    if display.to_ascii_lowercase().ends_with(".exe") {
        display.truncate(display.len().saturating_sub(4));
    }
    if display.is_empty() {
        return None;
    }

    let lower = display.to_ascii_lowercase();
    if matches!(
        lower.as_str(),
        "system"
            | "system idle process"
            | "idle"
            | "registry"
            | "secure system"
            | "dwm"
            | "audiodg"
            | "csrss"
            | "svchost"
            | "explorer"
            | "searchhost"
    ) {
        return None;
    }
    if matches!(lower.as_str(), "corneta" | "ffmpeg" | "mediamtx") {
        return Some(("corneta".into(), "Corneta".into()));
    }
    if matches!(lower.as_str(), "obs" | "obs32" | "obs64" | "obs-studio") {
        return Some(("obs".into(), "OBS Studio".into()));
    }
    Some((lower, display))
}

fn round_one(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

#[derive(Default)]
struct PidGpuUsage {
    gpu_3d: f64,
    gpu_encode: f64,
    has_gpu_3d: bool,
    has_gpu_encode: bool,
}

#[derive(Default)]
struct GpuSample {
    by_pid: HashMap<u32, PidGpuUsage>,
}

impl GpuSample {
    fn global(&self) -> f64 {
        let (three_d, encode) = self.by_pid.values().fold((0.0, 0.0), |acc, value| {
            (acc.0 + value.gpu_3d, acc.1 + value.gpu_encode)
        });
        three_d.max(encode).clamp(0.0, 100.0)
    }
}

#[cfg(windows)]
struct WindowsGpuSampler {
    query: windows::Win32::System::Performance::PDH_HQUERY,
    counter: windows::Win32::System::Performance::PDH_HCOUNTER,
}

#[cfg(windows)]
impl WindowsGpuSampler {
    fn new() -> Option<Self> {
        use windows::core::w;
        use windows::Win32::System::Performance::{
            PdhAddEnglishCounterW, PdhCollectQueryData, PdhOpenQueryW, PDH_HCOUNTER, PDH_HQUERY,
        };

        let mut query = PDH_HQUERY::default();
        // SAFETY: Output handles are valid writable storage; w! produces a NUL-terminated string.
        if unsafe { PdhOpenQueryW(None, 0, &mut query) } != 0 {
            return None;
        }
        let mut counter = PDH_HCOUNTER::default();
        // English counter names are independent of the user's Windows language.
        let add_status = unsafe {
            PdhAddEnglishCounterW(
                query,
                w!(r"\GPU Engine(*)\Utilization Percentage"),
                0,
                &mut counter,
            )
        };
        if add_status != 0 {
            unsafe {
                windows::Win32::System::Performance::PdhCloseQuery(query);
            }
            return None;
        }
        // Prime counters before requesting their first delta.
        unsafe {
            PdhCollectQueryData(query);
        }
        Some(Self { query, counter })
    }

    fn sample(&mut self) -> Option<GpuSample> {
        use std::mem::{size_of, MaybeUninit};
        use windows::Win32::System::Performance::{
            PdhCollectQueryData, PdhGetFormattedCounterArrayW, PDH_CSTATUS_NEW_DATA,
            PDH_CSTATUS_VALID_DATA, PDH_FMT_COUNTERVALUE_ITEM_W, PDH_FMT_DOUBLE, PDH_MORE_DATA,
        };

        if unsafe { PdhCollectQueryData(self.query) } != 0 {
            return None;
        }
        let mut bytes = 0u32;
        let mut count = 0u32;
        let status = unsafe {
            PdhGetFormattedCounterArrayW(self.counter, PDH_FMT_DOUBLE, &mut bytes, &mut count, None)
        };
        if status != PDH_MORE_DATA || bytes == 0 || count == 0 {
            return None;
        }

        // Aligned storage includes the extra string bytes reported by PDH.
        let slots = (bytes as usize).div_ceil(size_of::<PDH_FMT_COUNTERVALUE_ITEM_W>());
        let mut buffer = vec![MaybeUninit::<PDH_FMT_COUNTERVALUE_ITEM_W>::uninit(); slots];
        let status = unsafe {
            PdhGetFormattedCounterArrayW(
                self.counter,
                PDH_FMT_DOUBLE,
                &mut bytes,
                &mut count,
                Some(buffer.as_mut_ptr().cast()),
            )
        };
        let allocated_bytes = slots.saturating_mul(size_of::<PDH_FMT_COUNTERVALUE_ITEM_W>());
        if status != 0 || count as usize > slots || bytes as usize > allocated_bytes {
            return None;
        }

        let items = unsafe {
            std::slice::from_raw_parts(
                buffer.as_ptr().cast::<PDH_FMT_COUNTERVALUE_ITEM_W>(),
                count as usize,
            )
        };
        let mut sample = GpuSample::default();
        let buffer_start = buffer.as_ptr() as usize;
        let buffer_end = buffer_start.saturating_add(allocated_bytes);
        for item in items {
            if !matches!(
                item.FmtValue.CStatus,
                PDH_CSTATUS_VALID_DATA | PDH_CSTATUS_NEW_DATA
            ) || item.szName.is_null()
            {
                continue;
            }
            let name_ptr = item.szName.0 as usize;
            if name_ptr < buffer_start
                || name_ptr >= buffer_end
                || !name_ptr.is_multiple_of(std::mem::align_of::<u16>())
            {
                continue;
            }
            let remaining_u16 = (buffer_end - name_ptr) / size_of::<u16>();
            let instance = unsafe { wide_ptr_to_string(item.szName.0, remaining_u16.min(1024)) };
            let Some((pid, engine)) = parse_gpu_instance(&instance) else {
                continue;
            };
            let value = unsafe { item.FmtValue.Anonymous.doubleValue };
            if !value.is_finite() || value <= 0.0 {
                continue;
            }
            let usage = sample.by_pid.entry(pid).or_default();
            match engine {
                GpuEngine::ThreeD => {
                    usage.gpu_3d += value;
                    usage.has_gpu_3d = true;
                }
                GpuEngine::Encode => {
                    usage.gpu_encode += value;
                    usage.has_gpu_encode = true;
                }
            }
        }
        Some(sample)
    }
}

#[cfg(windows)]
impl Drop for WindowsGpuSampler {
    fn drop(&mut self) {
        unsafe {
            windows::Win32::System::Performance::PdhCloseQuery(self.query);
        }
    }
}

#[cfg(windows)]
enum GpuEngine {
    ThreeD,
    Encode,
}

#[cfg(windows)]
fn parse_gpu_instance(instance: &str) -> Option<(u32, GpuEngine)> {
    let lower = instance.to_ascii_lowercase();
    let pid_start = lower.find("pid_")? + 4;
    let pid_end = lower[pid_start..]
        .find('_')
        .map(|offset| pid_start + offset)?;
    let pid = lower[pid_start..pid_end].parse().ok()?;
    let engine = if lower.contains("engtype_3d") {
        GpuEngine::ThreeD
    } else if lower.contains("engtype_videoencode") {
        GpuEngine::Encode
    } else {
        return None;
    };
    Some((pid, engine))
}

#[cfg(windows)]
unsafe fn wide_ptr_to_string(ptr: *const u16, max_len: usize) -> String {
    // max_len is bounded by our allocation, even if a counter name lacks a terminator.
    let mut len = 0usize;
    while len < max_len && unsafe { *ptr.add(len) } != 0 {
        len += 1;
    }
    String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(ptr, len) })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_names_hide_implementation_details_and_preserve_useful_labels() {
        assert_eq!(
            normalized_app_name("ffmpeg.exe"),
            Some(("corneta".into(), "Corneta".into()))
        );
        assert_eq!(
            normalized_app_name("obs64.exe"),
            Some(("obs".into(), "OBS Studio".into()))
        );
        assert_eq!(
            normalized_app_name("MeuJogo.exe"),
            Some(("meujogo".into(), "MeuJogo".into()))
        );
        assert_eq!(
            normalized_app_name(r"C:\Users\Streamer\MeuJogo.exe"),
            Some(("meujogo".into(), "MeuJogo".into()))
        );
        assert_eq!(normalized_app_name("System"), None);
    }

    #[test]
    fn sampler_bounds_and_normalizes_output() {
        let mut sampler = ResourceSampler::new();
        std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
        let usage = sampler.sample();
        assert!((0.0..=100.0).contains(&usage.cpu));
        assert!(usage.gpu.is_none_or(|value| (0.0..=100.0).contains(&value)));
        assert!(usage
            .memory_pct
            .is_none_or(|value| (0.0..=100.0).contains(&value)));
        assert!(usage.apps.len() <= MAX_RECORDED_APPS);
        assert!(usage.apps.iter().all(|app| {
            !app.name.contains('/')
                && !app.name.contains('\\')
                && (0.0..=100.0).contains(&app.cpu)
                && app
                    .gpu_3d
                    .is_none_or(|value| (0.0..=100.0).contains(&value))
                && app
                    .gpu_encode
                    .is_none_or(|value| (0.0..=100.0).contains(&value))
        }));
    }

    #[test]
    fn rankings_are_persisted_only_after_material_changes() {
        let app = |cpu: f64, gpu: f64| ResourceAppSample {
            app_ref: "jogo".into(),
            name: "Jogo".into(),
            cpu,
            memory_mb: 2048.0,
            gpu_3d: Some(gpu),
            gpu_encode: None,
        };
        assert!(!materially_changed(&[app(30.0, 80.0)], &[app(34.0, 85.0)]));
        assert!(materially_changed(&[app(30.0, 80.0)], &[app(30.0, 94.0)]));
        assert!(materially_changed(&[app(30.0, 80.0)], &[]));
    }

    #[test]
    fn sustained_pressure_does_not_extend_the_sampling_burst() {
        let mut was_under_pressure = false;
        let mut ticks_left = 0;
        update_pressure_burst(&mut was_under_pressure, &mut ticks_left, true);
        assert_eq!(ticks_left, PRESSURE_DETAIL_TICKS);

        ticks_left = 3;
        update_pressure_burst(&mut was_under_pressure, &mut ticks_left, true);
        assert_eq!(ticks_left, 3);

        update_pressure_burst(&mut was_under_pressure, &mut ticks_left, false);
        update_pressure_burst(&mut was_under_pressure, &mut ticks_left, true);
        assert_eq!(ticks_left, PRESSURE_DETAIL_TICKS);
    }

    #[cfg(windows)]
    #[test]
    fn gpu_counter_instance_identifies_process_and_engine() {
        let parsed = parse_gpu_instance("pid_1788_luid_0x00000000_eng_0_engtype_3D");
        assert!(matches!(parsed, Some((1788, GpuEngine::ThreeD))));
        let parsed = parse_gpu_instance("pid_42_luid_0x0_eng_4_engtype_VideoEncode");
        assert!(matches!(parsed, Some((42, GpuEngine::Encode))));
    }
}
