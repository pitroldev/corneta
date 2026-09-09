use crate::config::AppConfig;
use crate::AppState;
use chrono::{SecondsFormat, Utc};
use posthog_rs::{
    CaptureExceptionOptions, Client, ClientOptionsBuilder, ErrorTrackingOptionsBuilder, Event,
    PostHogError,
};
use regex::{Captures, Regex};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet, VecDeque};
use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex, MutexGuard, OnceLock};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

pub const TELEMETRY_SCHEMA_VERSION: u32 = 1;
// Keep synchronized with the frontend TELEMETRY_NOTICE_VERSION.
pub const NOTICE_VERSION: &str = "2026-09-09";
const TELEMETRY_FILE: &str = "telemetry.json";
const EXIT_MARKER_FILE: &str = "telemetry-exit.json";
const MAX_TELEMETRY_FILE_BYTES: u64 = 64 * 1024;
const MAX_EVENT_BYTES: usize = 32 * 1024;
const MAX_VALUE_DEPTH: usize = 5;
const MAX_OBJECT_ITEMS: usize = 40;
const MAX_ARRAY_ITEMS: usize = 24;
const MAX_STRING_CHARS: usize = 1_024;
const MAX_EXCEPTION_STRING_CHARS: usize = 4_096;
const RING_CAPACITY: usize = 100;
const TARGET_RATE_LIMIT: Duration = Duration::from_millis(750);
const ERROR_DEDUPE_WINDOW: Duration = Duration::from_secs(30);
const POSTHOG_SHUTDOWN_TIMEOUT_MS: u64 = 300;
const INTERNAL_PURPOSE_PROPERTY: &str = "_corneta_purpose";
const INTERNAL_EPOCH_PROPERTY: &str = "_corneta_consent_epoch";

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Consent {
    #[default]
    Unset,
    Disabled,
    Enabled,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryStatus {
    pub schema_version: u32,
    pub notice_version: String,
    #[serde(default)]
    pub usage: Consent,
    #[serde(default)]
    pub crash_reports: Consent,
    #[serde(default)]
    pub installation_id: Option<String>,
    #[serde(default)]
    pub decided_at: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct TelemetryCorrelation {
    pub(crate) installation_id: String,
    pub(crate) purposes: &'static str,
}

impl Default for TelemetryStatus {
    fn default() -> Self {
        Self {
            schema_version: TELEMETRY_SCHEMA_VERSION,
            notice_version: NOTICE_VERSION.to_string(),
            usage: Consent::Unset,
            crash_reports: Consent::Unset,
            installation_id: None,
            decided_at: None,
        }
    }
}

impl TelemetryStatus {
    // Corrupt existing preferences must fail closed, not inherit new-install defaults.
    fn opposed() -> Self {
        Self {
            usage: Consent::Disabled,
            crash_reports: Consent::Disabled,
            ..Self::default()
        }
    }

    fn normalize(mut self) -> Self {
        // Unknown schemas/notices must not be reinterpreted as permission to collect.
        if self.schema_version != TELEMETRY_SCHEMA_VERSION
            || !valid_notice_version(&self.notice_version)
        {
            return Self::opposed();
        }
        self.installation_id = self
            .installation_id
            .filter(|value| Uuid::parse_str(value).is_ok());
        // Clear identity when no purpose remains active.
        if effective_gates(&self) == (false, false) {
            self.installation_id = None;
        }
        self
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TelemetryConsentInput {
    pub usage: Consent,
    pub crash_reports: Consent,
    pub notice_version: String,
}

// Usage requires opt-in; crash reports retain their independent opt-out default.
fn effective_gates(status: &TelemetryStatus) -> (bool, bool) {
    (
        status.usage == Consent::Enabled,
        status.crash_reports != Consent::Disabled,
    )
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Purpose {
    Usage,
    CrashReports,
    StartupMinimal,
}

impl Purpose {
    fn marker(self) -> &'static str {
        match self {
            Self::Usage => "usage",
            Self::CrashReports => "crashReports",
            Self::StartupMinimal => "startupMinimal",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        match value {
            "usage" => Some(Self::Usage),
            "crashReports" => Some(Self::CrashReports),
            "startupMinimal" => Some(Self::StartupMinimal),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticEvent {
    pub timestamp: String,
    pub code: String,
    pub stage: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub operation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
}

#[derive(Debug)]
pub struct AppError {
    pub code: String,
    pub stage: String,
    pub retryable: bool,
    /// Local-only detail: exclude from Display/source and the SDK because it may contain secrets.
    pub source: Option<String>,
}

impl AppError {
    pub fn new(code: &str, stage: &str, retryable: bool, source: Option<String>) -> Self {
        Self {
            code: normalize_error_code(code).to_string(),
            stage: normalize_stage(stage).to_string(),
            retryable,
            source,
        }
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{} at {}", self.code, self.stage)
    }
}

// Explicit panic frames prevent the hook location from merging distinct crashes; send basenames only.
fn top_app_frame_from(frame: Option<&str>, caller: &std::panic::Location<'_>) -> String {
    if let Some(frame) = frame.map(str::trim).filter(|value| !value.is_empty()) {
        return frame.to_string();
    }
    let file = Path::new(caller.file())
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("native");
    format!("{file}:{}", caller.line())
}

impl std::error::Error for AppError {}

#[derive(Default)]
struct TargetCaptureState {
    last: HashMap<String, (String, Instant)>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct ConsentEpoch {
    generation: u64,
    installation_id: Option<String>,
}

impl Default for ConsentEpoch {
    fn default() -> Self {
        Self {
            // Zero is reserved for legacy events without an epoch.
            generation: 1,
            installation_id: None,
        }
    }
}

#[derive(Clone, Debug)]
struct CaptureIdentity {
    generation: u64,
    installation_id: String,
}

fn stable_correlation_snapshot(
    gates_before: (bool, bool),
    epoch_before: &ConsentEpoch,
    status_installation_id: Option<&str>,
    gates_after: (bool, bool),
    epoch_after: &ConsentEpoch,
) -> Option<TelemetryCorrelation> {
    if gates_before != gates_after
        || epoch_before != epoch_after
        || epoch_before.generation == 0
        || epoch_before.installation_id.as_deref() != status_installation_id
    {
        return None;
    }
    let purposes = match gates_before {
        (true, true) => "usage,crash_reports",
        (true, false) => "usage",
        (false, true) => "crash_reports",
        (false, false) => return None,
    };
    let installation_id = status_installation_id
        .filter(|value| Uuid::parse_str(value).is_ok())?
        .to_string();
    Some(TelemetryCorrelation {
        installation_id,
        purposes,
    })
}

pub struct TelemetryRuntime {
    status: Mutex<TelemetryStatus>,
    path: Mutex<Option<PathBuf>>,
    client: Mutex<Option<Arc<Client>>>,
    usage_enabled: Arc<AtomicBool>,
    crash_enabled: Arc<AtomicBool>,
    consent_epoch: Arc<Mutex<ConsentEpoch>>,
    build_disabled: bool,
    ring: Mutex<VecDeque<DiagnosticEvent>>,
    target_state: Mutex<TargetCaptureState>,
    recent_errors: Mutex<HashMap<String, (Instant, String)>>,
    clean_exit_recorded: AtomicBool,
    client_shutdown: AtomicBool,
    pending_live_exit: AtomicBool,
    booted_at: Instant,
}

impl Default for TelemetryRuntime {
    fn default() -> Self {
        Self {
            status: Mutex::new(TelemetryStatus::default()),
            path: Mutex::new(None),
            client: Mutex::new(None),
            usage_enabled: Arc::new(AtomicBool::new(false)),
            crash_enabled: Arc::new(AtomicBool::new(false)),
            consent_epoch: Arc::new(Mutex::new(ConsentEpoch::default())),
            build_disabled: telemetry_build_disabled(),
            ring: Mutex::new(VecDeque::with_capacity(RING_CAPACITY)),
            target_state: Mutex::new(TargetCaptureState::default()),
            recent_errors: Mutex::new(HashMap::new()),
            clean_exit_recorded: AtomicBool::new(false),
            client_shutdown: AtomicBool::new(false),
            pending_live_exit: AtomicBool::new(false),
            booted_at: Instant::now(),
        }
    }
}

impl TelemetryRuntime {
    pub fn initialize(&self, app: &AppHandle) {
        let config_dir = match app.path().app_config_dir() {
            Ok(path) => path,
            Err(error) => {
                log::warn!("telemetry: configuration directory unavailable: {error}");
                return;
            }
        };
        if let Err(error) = std::fs::create_dir_all(&config_dir) {
            log::warn!("telemetry: could not create directory: {error}");
            return;
        }
        let path = config_dir.join(TELEMETRY_FILE);
        let mut status = load_status_file(&path);
        let (usage_enabled, crash_enabled) = effective_gates(&status);
        // Crash reports may need an identity before the first settings interaction.
        if (usage_enabled || crash_enabled) && status.installation_id.is_none() {
            status.installation_id = Some(new_id());
            if let Err(error) = save_status_file(&path, &status) {
                // An unpersisted ID would count the next boot as another installation.
                log::warn!("telemetry: could not persist installation ID: {error}");
            }
        }
        self.usage_enabled.store(usage_enabled, Ordering::Release);
        self.crash_enabled.store(crash_enabled, Ordering::Release);
        self.sync_epoch_installation_id(status.installation_id.clone());
        *lock(&self.status) = status;
        *lock(&self.path) = Some(path);

        if self.build_disabled {
            log::debug!("telemetry: disabled by TELEMETRY_DISABLED");
            return;
        }
        let Some(token) = posthog_token() else {
            log::debug!("telemetry: missing POSTHOG_DESKTOP_TOKEN; client is a no-op");
            return;
        };
        let Some(host) = posthog_host() else {
            log::warn!("telemetry: invalid POSTHOG_HOST; client is a no-op");
            return;
        };

        let usage_gate = self.usage_enabled.clone();
        let crash_gate = self.crash_enabled.clone();
        let consent_epoch = self.consent_epoch.clone();
        let error_tracking = match ErrorTrackingOptionsBuilder::default()
            .capture_stacktrace(true)
            .capture_panics(false)
            .in_app_include_paths(vec!["corneta".to_string(), "corneta_lib".to_string()])
            .build()
        {
            Ok(options) => options,
            Err(error) => {
                log::warn!("telemetry: invalid Error Tracking options: {error}");
                return;
            }
        };
        let options = match ClientOptionsBuilder::default()
            .api_key(token)
            .host(host)
            .request_timeout_seconds(1)
            .disable_geoip(true)
            .is_server(false)
            .flush_at(20)
            .flush_interval_ms(5_000)
            .max_queue_size(256)
            // A retry could reuse a serialized batch after revocation; allow only one capture attempt.
            .max_capture_attempts(1u32)
            .shutdown_timeout_ms(POSTHOG_SHUTDOWN_TIMEOUT_MS)
            .error_tracking(error_tracking)
            .before_send(move |event| {
                final_before_send(event, &usage_gate, &crash_gate, &consent_epoch)
            })
            .on_error(|error: &PostHogError<'_>| {
                // SDK errors may retain response bodies and connection strings; log only the category.
                log::debug!(
                    "telemetry: terminal PostHog failure ({})",
                    posthog_error_category(error)
                );
            })
            .build()
        {
            Ok(options) => options,
            Err(error) => {
                log::warn!("telemetry: invalid configuration; client is a no-op: {error}");
                return;
            }
        };
        *lock(&self.client) = Some(Arc::new(posthog_rs::client(options)));
    }

    pub fn status(&self) -> TelemetryStatus {
        lock(&self.status).clone()
    }

    fn sync_epoch_installation_id(&self, installation_id: Option<String>) {
        lock(self.consent_epoch.as_ref()).installation_id = installation_id;
    }

    fn advance_consent_epoch(&self, installation_id: Option<String>) {
        let mut epoch = lock(self.consent_epoch.as_ref());
        epoch.generation = epoch.generation.checked_add(1).unwrap_or(1);
        epoch.installation_id = installation_id;
    }

    /// Correlate only Corneta service calls; reject torn snapshots of identity and active purposes.
    pub(crate) fn correlation(&self) -> Option<TelemetryCorrelation> {
        if self.build_disabled || self.client_shutdown.load(Ordering::Acquire) {
            return None;
        }
        for _ in 0..2 {
            let gates_before = (
                self.usage_enabled.load(Ordering::Acquire),
                self.crash_enabled.load(Ordering::Acquire),
            );
            if gates_before == (false, false) {
                return None;
            }
            // Release epoch before locking status to preserve set_consent's status -> epoch lock order.
            let epoch_before = lock(self.consent_epoch.as_ref()).clone();
            let installation_id = lock(&self.status).installation_id.clone();
            let gates_after = (
                self.usage_enabled.load(Ordering::Acquire),
                self.crash_enabled.load(Ordering::Acquire),
            );
            // Read epoch last: its generation detects ABA changes even if gates return to the same values.
            let epoch_after = lock(self.consent_epoch.as_ref()).clone();
            if let Some(correlation) = stable_correlation_snapshot(
                gates_before,
                &epoch_before,
                installation_id.as_deref(),
                gates_after,
                &epoch_after,
            ) {
                return Some(correlation);
            }
        }
        None
    }

    pub fn set_consent(
        &self,
        usage: Consent,
        crash_reports: Consent,
        notice_version: String,
    ) -> Result<TelemetryStatus, String> {
        if notice_version != NOTICE_VERSION {
            return Err("noticeVersion does not match the current privacy notice".into());
        }
        let mut status = lock(&self.status);
        let previous = status.clone();
        let previous_gates = effective_gates(&previous);
        let mut next = previous.clone();
        next.usage = usage;
        next.crash_reports = crash_reports;
        next.notice_version = notice_version;
        next.decided_at = Some(now_iso());
        let (next_usage, next_crash) = effective_gates(&next);
        if (next_usage || next_crash) && next.installation_id.is_none() {
            next.installation_id = Some(new_id());
        }

        // Revoke before I/O and invalidate queued epochs; open new gates only after persistence.
        if !next_usage {
            self.usage_enabled.store(false, Ordering::Release);
        }
        if !next_crash {
            self.crash_enabled.store(false, Ordering::Release);
        }
        if previous_gates != (next_usage, next_crash)
            || previous.installation_id != next.installation_id
        {
            self.advance_consent_epoch(next.installation_id.clone());
        } else {
            self.sync_epoch_installation_id(next.installation_id.clone());
        }
        let persist_result = lock(&self.path)
            .clone()
            .ok_or_else(|| "telemetry is not initialized".to_string())
            .and_then(|path| save_status_file(&path, &next));
        if let Err(error) = persist_result {
            // Disk failure must preserve revocation in memory and reject unpersisted opt-ins.
            let mut fail_closed = previous;
            if !next_usage {
                fail_closed.usage = next.usage;
            }
            if !next_crash {
                fail_closed.crash_reports = next.crash_reports;
            }
            if !next_usage || !next_crash {
                fail_closed.decided_at = next.decided_at;
            }
            self.sync_epoch_installation_id(fail_closed.installation_id.clone());
            *status = fail_closed;
            return Err(error);
        }
        self.sync_epoch_installation_id(next.installation_id.clone());
        *status = next.clone();
        self.usage_enabled.store(next_usage, Ordering::Release);
        self.crash_enabled.store(next_crash, Ordering::Release);
        Ok(next)
    }

    pub fn regenerate_id(&self) -> Result<TelemetryStatus, String> {
        let mut status = lock(&self.status);
        if effective_gates(&status) != (false, false) {
            return Err("disable usage data and crash reports before regenerating the ID".into());
        }
        let mut next = status.clone();
        // A later opt-in must not relink data covered by the deletion request.
        next.installation_id = None;
        next.decided_at = Some(now_iso());
        let path = lock(&self.path)
            .clone()
            .ok_or_else(|| "telemetry is not initialized".to_string())?;
        save_status_file(&path, &next)?;
        self.advance_consent_epoch(next.installation_id.clone());
        *status = next.clone();
        Ok(next)
    }

    fn client(&self) -> Option<Arc<Client>> {
        if self.build_disabled || self.client_shutdown.load(Ordering::Acquire) {
            None
        } else {
            lock(&self.client).clone()
        }
    }

    fn capture_identity_for(&self, purpose: Purpose) -> Option<CaptureIdentity> {
        if !self.should_send(purpose) {
            return None;
        }
        let epoch = lock(self.consent_epoch.as_ref()).clone();
        // Recheck revocation after the snapshot; before_send rejects any subsequent epoch change.
        if !self.should_send(purpose) {
            return None;
        }
        let installation_id = epoch
            .installation_id
            .filter(|value| Uuid::parse_str(value).is_ok())?;
        Some(CaptureIdentity {
            generation: epoch.generation,
            installation_id,
        })
    }

    fn should_send(&self, purpose: Purpose) -> bool {
        if self.build_disabled || self.client_shutdown.load(Ordering::Acquire) {
            return false;
        }
        match purpose {
            Purpose::Usage => self.usage_enabled.load(Ordering::Acquire),
            Purpose::CrashReports => self.crash_enabled.load(Ordering::Acquire),
            Purpose::StartupMinimal => {
                self.usage_enabled.load(Ordering::Acquire)
                    || self.crash_enabled.load(Ordering::Acquire)
            }
        }
    }

    pub fn capture(
        &self,
        event_name: &str,
        properties: Map<String, Value>,
    ) -> Result<bool, String> {
        let purpose = event_purpose(event_name)
            .ok_or_else(|| format!("unknown telemetry event: {event_name}"))?;
        self.capture_for(event_name, purpose, properties)
    }

    fn capture_for(
        &self,
        event_name: &str,
        purpose: Purpose,
        mut properties: Map<String, Value>,
    ) -> Result<bool, String> {
        validate_input_properties(event_name, &properties)?;
        self.record_from_event(event_name, &properties);
        let Some(identity) = self.capture_identity_for(purpose) else {
            return Ok(false);
        };
        let Some(client) = self.client() else {
            return Ok(false);
        };
        if purpose == Purpose::StartupMinimal {
            add_minimal_context(&mut properties);
        } else {
            add_context(&mut properties);
        }
        properties.insert(
            INTERNAL_PURPOSE_PROPERTY.into(),
            Value::String(purpose.marker().into()),
        );
        properties.insert(
            INTERNAL_EPOCH_PROPERTY.into(),
            Value::Number(identity.generation.into()),
        );
        let mut event = Event::new(event_name.to_string(), identity.installation_id);
        for (key, value) in properties {
            event
                .insert_prop(key, value)
                .map_err(|error| error.to_string())?;
        }
        client.capture(event);
        Ok(true)
    }

    #[track_caller]
    pub fn capture_error(
        &self,
        error: AppError,
        operation_id: Option<&str>,
        handled: bool,
        severity: &str,
    ) -> String {
        self.capture_error_at(error, operation_id, handled, severity, None)
    }

    #[track_caller]
    pub fn capture_error_at(
        &self,
        error: AppError,
        operation_id: Option<&str>,
        handled: bool,
        severity: &str,
        frame: Option<&str>,
    ) -> String {
        let operation_id = valid_id(operation_id);
        let dedupe_key = format!(
            "{}:{}:{}",
            operation_id.as_deref().unwrap_or("none"),
            error.stage,
            error.code
        );
        let (error_id, duplicate) = self.error_id_for_capture(&dedupe_key);
        self.record_diagnostic(
            &error.code,
            &error.stage,
            operation_id.as_deref(),
            Some(&error_id),
            None,
        );
        if duplicate {
            return error_id;
        }
        let Some(identity) = self.capture_identity_for(Purpose::CrashReports) else {
            return error_id;
        };
        let Some(client) = self.client() else {
            return error_id;
        };
        let top_app_frame = top_app_frame_from(frame, std::panic::Location::caller());
        let fingerprint = format!("desktop_native:{}:{top_app_frame}", error.code);
        let mut options = CaptureExceptionOptions::new()
            .distinct_id(identity.installation_id)
            .fingerprint(fingerprint)
            .level(normalize_severity(severity));
        for (key, value) in [
            ("error_id", Value::String(error_id.clone())),
            ("error_code", Value::String(error.code.clone())),
            ("stage", Value::String(error.stage.clone())),
            ("retryable", Value::Bool(error.retryable)),
            ("handled", Value::Bool(handled)),
            (
                "severity",
                Value::String(normalize_severity(severity).to_string()),
            ),
            ("top_app_frame", Value::String(top_app_frame)),
            (
                INTERNAL_PURPOSE_PROPERTY,
                Value::String(Purpose::CrashReports.marker().into()),
            ),
            (
                INTERNAL_EPOCH_PROPERTY,
                Value::Number(identity.generation.into()),
            ),
        ] {
            match options.property(key, value) {
                Ok(next) => options = next,
                Err(_) => {
                    log::debug!("telemetry: exception property rejected by the SDK");
                    return error_id;
                }
            }
        }
        if let Some(operation_id) = operation_id {
            options = match options.property("operation_id", operation_id) {
                Ok(next) => next,
                Err(_) => {
                    log::debug!("telemetry: operation_id rejected by the SDK");
                    return error_id;
                }
            };
        }
        for (key, value) in context_properties() {
            options = match options.property(key, value) {
                Ok(next) => next,
                Err(_) => {
                    log::debug!("telemetry: exception context rejected by the SDK");
                    return error_id;
                }
            };
        }
        if client.capture_exception_with(&error, options).is_err() {
            log::debug!("telemetry: exception not queued by the SDK");
        }
        error_id
    }

    fn error_id_for_capture(&self, key: &str) -> (String, bool) {
        let now = Instant::now();
        let mut recent = lock(&self.recent_errors);
        recent.retain(|_, (at, _)| now.duration_since(*at) <= ERROR_DEDUPE_WINDOW);
        if let Some((at, error_id)) = recent.get(key) {
            if now.duration_since(*at) <= ERROR_DEDUPE_WINDOW {
                return (error_id.clone(), true);
            }
        }
        let error_id = new_id();
        recent.insert(key.to_string(), (now, error_id.clone()));
        (error_id, false)
    }

    pub fn capture_target_transition(
        &self,
        operation_id: Option<&str>,
        platform: &str,
        from: &str,
        to: &str,
        error_code: Option<&str>,
    ) {
        let Some(to) = normalize_target_state(to) else {
            return;
        };
        if !matches!(
            to,
            "live" | "reconnecting" | "signal-lost" | "auth-error" | "error" | "stopped"
        ) {
            return;
        }
        let Some(platform) = normalize_platform(platform) else {
            return;
        };
        let Some(from) = normalize_target_state(from) else {
            return;
        };
        let operation_id = valid_id(operation_id);
        let key = format!("{}:{platform}", operation_id.as_deref().unwrap_or("none"));
        let now = Instant::now();
        {
            let mut state = lock(&self.target_state);
            if let Some((previous, captured_at)) = state.last.get(&key) {
                if previous == to
                    || (now.duration_since(*captured_at) < TARGET_RATE_LIMIT
                        && !matches!(to, "signal-lost" | "auth-error" | "error"))
                {
                    return;
                }
            }
            state.last.insert(key, (to.to_string(), now));
        }
        let mut props = Map::new();
        if let Some(operation_id) = operation_id {
            props.insert("operation_id".into(), Value::String(operation_id));
        }
        props.insert("platform".into(), Value::String(platform.into()));
        props.insert("from".into(), Value::String(from.into()));
        props.insert("to".into(), Value::String(to.into()));
        props.insert(
            "error_code".into(),
            Value::String(
                error_code
                    .map(normalize_error_code)
                    .unwrap_or("none")
                    .into(),
            ),
        );
        let _ = self.capture_for("target_state_changed", Purpose::Usage, props);
    }

    pub fn record_diagnostic(
        &self,
        code: &str,
        stage: &str,
        operation_id: Option<&str>,
        error_id: Option<&str>,
        request_id: Option<&str>,
    ) {
        let event = DiagnosticEvent {
            timestamp: now_iso(),
            code: normalize_error_code(code).to_string(),
            stage: normalize_stage(stage).to_string(),
            operation_id: valid_id(operation_id),
            error_id: valid_id(error_id),
            request_id: valid_id(request_id),
        };
        let mut ring = lock(&self.ring);
        if ring.len() == RING_CAPACITY {
            ring.pop_front();
        }
        ring.push_back(event);
    }

    fn record_from_event(&self, event_name: &str, properties: &Map<String, Value>) {
        let stage = properties
            .get("stage")
            .and_then(Value::as_str)
            .unwrap_or_else(|| event_stage(event_name));
        let code = properties
            .get("error_code")
            .and_then(Value::as_str)
            .unwrap_or(event_name);
        self.record_diagnostic(
            code,
            stage,
            properties.get("operation_id").and_then(Value::as_str),
            properties.get("error_id").and_then(Value::as_str),
            properties.get("request_id").and_then(Value::as_str),
        );
    }

    pub fn diagnostic_events(&self) -> Vec<DiagnosticEvent> {
        lock(&self.ring).iter().cloned().collect()
    }

    pub fn capture_app_started(&self, previous_exit: &str, startup: Duration) {
        let mut props = Map::new();
        props.insert(
            "previous_exit".into(),
            Value::String(
                match previous_exit {
                    "clean" | "unclean" | "unknown" => previous_exit,
                    _ => "unknown",
                }
                .into(),
            ),
        );
        if self.usage_enabled.load(Ordering::Acquire) {
            props.insert(
                "startup_duration_bucket".into(),
                Value::String(duration_bucket(startup).into()),
            );
            let _ = self.capture_for("app_started", Purpose::Usage, props);
        } else {
            // Crash-only startup must not inherit usage dimensions or duration.
            let _ = self.capture_for("app_started", Purpose::StartupMinimal, props);
        }
    }

    pub fn note_exit_live(&self, live_was_active: bool) {
        if live_was_active {
            self.pending_live_exit.store(true, Ordering::Release);
        }
    }

    pub fn record_clean_exit(&self, app: &AppHandle, live_was_active: bool) {
        if self.clean_exit_recorded.swap(true, Ordering::AcqRel) {
            return;
        }
        let live_was_active = live_was_active || self.pending_live_exit.load(Ordering::Acquire);
        let mut props = Map::new();
        props.insert(
            "uptime_bucket".into(),
            Value::String(duration_bucket(self.booted_at.elapsed()).into()),
        );
        props.insert("live_was_active".into(), Value::Bool(live_was_active));
        let _ = self.capture_for("app_closed", Purpose::Usage, props);
        mark_exit(app, "clean");
    }

    fn flush_after_panic_bounded(&self) {
        let Some(client) = self.client() else {
            return;
        };
        let (done_tx, done_rx) = mpsc::sync_channel(1);
        let worker = thread::Builder::new()
            .name("corneta-telemetry-panic-flush".into())
            .spawn(move || {
                client.flush();
                let _ = done_tx.try_send(());
            });
        if let Ok(worker) = worker {
            // Flush has no timeout and may wait on a panic-held lock; bound the hook's wait on another thread.
            let _ = done_rx.recv_timeout(Duration::from_millis(POSTHOG_SHUTDOWN_TIMEOUT_MS));
            drop(worker);
        }
    }

    pub fn shutdown(&self) {
        if self.client_shutdown.swap(true, Ordering::AcqRel) {
            return;
        }
        if let Some(client) = lock(&self.client).clone() {
            // Queue drain is bounded separately from the one-second timeout of an in-flight request.
            client.shutdown();
        }
    }
}

fn posthog_token() -> Option<String> {
    let raw = option_env!("POSTHOG_DESKTOP_TOKEN")
        .map(str::to_string)
        .or_else(|| std::env::var("POSTHOG_DESKTOP_TOKEN").ok())?;
    let token = raw.trim();
    if !valid_posthog_token(token) {
        None
    } else {
        Some(token.to_string())
    }
}

fn valid_posthog_token(token: &str) -> bool {
    static PROJECT_TOKEN: OnceLock<Regex> = OnceLock::new();
    token.len() <= 256
        && PROJECT_TOKEN
            .get_or_init(|| Regex::new(r"^phc_[A-Za-z0-9_-]{8,}$").expect("valid static regex"))
            .is_match(token)
}

fn posthog_host() -> Option<String> {
    let raw = option_env!("POSTHOG_HOST")
        .map(str::to_string)
        .or_else(|| std::env::var("POSTHOG_HOST").ok())?;
    let host = raw.trim().trim_end_matches('/');
    if valid_posthog_host(host, cfg!(debug_assertions)) {
        Some(host.to_string())
    } else {
        None
    }
}

fn valid_posthog_host(host: &str, allow_local: bool) -> bool {
    static HTTPS_ORIGIN: OnceLock<Regex> = OnceLock::new();
    static LOCAL_ORIGIN: OnceLock<Regex> = OnceLock::new();
    let secure = HTTPS_ORIGIN
        .get_or_init(|| {
            Regex::new(
                r"^https://(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*(?::([0-9]{1,5}))?$",
            )
            .expect("valid static regex")
        })
        .captures(host)
        .is_some_and(|captures| valid_optional_port(captures.get(1).map(|item| item.as_str())));
    let local = allow_local
        && LOCAL_ORIGIN
            .get_or_init(|| {
                Regex::new(r"^http://(?:127\.0\.0\.1|localhost)(?::([0-9]{1,5}))?$")
                    .expect("valid static regex")
            })
            .captures(host)
            .is_some_and(|captures| valid_optional_port(captures.get(1).map(|item| item.as_str())));
    host.len() <= 256 && (secure || local)
}

fn valid_optional_port(port: Option<&str>) -> bool {
    match port {
        None => true,
        Some(value) => value.parse::<u16>().is_ok_and(|port| port != 0),
    }
}

fn telemetry_build_disabled() -> bool {
    option_env!("TELEMETRY_DISABLED")
        .map(truthy)
        .unwrap_or(false)
        || std::env::var("TELEMETRY_DISABLED")
            .ok()
            .is_some_and(|value| truthy(&value))
}

fn truthy(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes" | "on"
    )
}

fn new_id() -> String {
    // Use OS randomness, never hostname or hardware identifiers.
    Uuid::new_v4().to_string()
}

pub fn normalize_or_new_id(candidate: Option<String>) -> String {
    candidate
        .filter(|value| Uuid::parse_str(value).is_ok())
        .unwrap_or_else(new_id)
}

fn valid_id(value: Option<&str>) -> Option<String> {
    value
        .filter(|candidate| Uuid::parse_str(candidate).is_ok())
        .map(str::to_string)
}

fn valid_notice_version(value: &str) -> bool {
    static NOTICE: OnceLock<Regex> = OnceLock::new();
    NOTICE
        .get_or_init(|| Regex::new(r"^\d{4}-\d{2}-\d{2}$").expect("valid static regex"))
        .is_match(value)
}

fn load_status_file(path: &Path) -> TelemetryStatus {
    let Ok(metadata) = std::fs::metadata(path) else {
        return TelemetryStatus::default();
    };
    if metadata.len() > MAX_TELEMETRY_FILE_BYTES {
        log::warn!("telemetry: telemetry.json exceeds 64 KiB; disabling collection");
        preserve_corrupt(path);
        return TelemetryStatus::opposed();
    }
    match std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<TelemetryStatus>(&raw).ok())
    {
        Some(status) => status.normalize(),
        None => {
            log::warn!("telemetry: invalid telemetry.json; preserving a copy");
            preserve_corrupt(path);
            TelemetryStatus::opposed()
        }
    }
}

fn preserve_corrupt(path: &Path) {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let _ = std::fs::rename(path, path.with_extension(format!("corrupt-{stamp}.json")));
}

fn save_status_file(path: &Path, status: &TelemetryStatus) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(status).map_err(|error| error.to_string())?;
    {
        use std::io::Write;
        let mut file = std::fs::File::create(&tmp).map_err(|error| error.to_string())?;
        file.write_all(&bytes).map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
    }
    atomic_replace(&tmp, path)
}

#[cfg(windows)]
fn atomic_replace(replacement: &Path, destination: &Path) -> Result<(), String> {
    if !destination.exists() {
        return std::fs::rename(replacement, destination).map_err(|error| error.to_string());
    }
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{ReplaceFileW, REPLACEFILE_WRITE_THROUGH};

    let destination_wide: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let replacement_wide: Vec<u16> = replacement
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        ReplaceFileW(
            PCWSTR(destination_wide.as_ptr()),
            PCWSTR(replacement_wide.as_ptr()),
            PCWSTR::null(),
            REPLACEFILE_WRITE_THROUGH,
            None,
            None,
        )
        .map_err(|error| error.to_string())
    }
}

#[cfg(not(windows))]
fn atomic_replace(replacement: &Path, destination: &Path) -> Result<(), String> {
    std::fs::rename(replacement, destination).map_err(|error| error.to_string())
}

fn context_properties() -> Map<String, Value> {
    let mut properties = Map::new();
    add_context(&mut properties);
    properties
}

fn add_minimal_context(properties: &mut Map<String, Value>) {
    properties.insert(
        "telemetry_schema_version".into(),
        Value::Number(TELEMETRY_SCHEMA_VERSION.into()),
    );
    properties.insert("surface".into(), Value::String("desktop_native".into()));
    properties.insert(
        "environment".into(),
        Value::String(
            option_env!("CORNETA_ENVIRONMENT")
                .filter(|value| matches!(*value, "production" | "staging" | "development"))
                .unwrap_or(if cfg!(debug_assertions) {
                    "development"
                } else {
                    "production"
                })
                .into(),
        ),
    );
    properties.insert(
        "app_version".into(),
        Value::String(env!("CARGO_PKG_VERSION").into()),
    );
    properties.insert(
        "build_sha".into(),
        Value::String(option_env!("CORNETA_BUILD_SHA").unwrap_or("dev").into()),
    );
}

fn add_context(properties: &mut Map<String, Value>) {
    add_minimal_context(properties);
    properties.insert(
        "os_family".into(),
        Value::String(std::env::consts::OS.into()),
    );
    properties.insert("arch".into(), Value::String(std::env::consts::ARCH.into()));
}

fn final_before_send(
    mut event: Event,
    usage_gate: &AtomicBool,
    crash_gate: &AtomicBool,
    consent_epoch: &Mutex<ConsentEpoch>,
) -> Option<Event> {
    let purpose = event
        .remove_prop(INTERNAL_PURPOSE_PROPERTY)
        .and_then(|value| value.as_str().and_then(Purpose::parse));
    let captured_generation = event
        .remove_prop(INTERNAL_EPOCH_PROPERTY)
        .and_then(|value| value.as_u64());
    let allowed = match purpose {
        Some(Purpose::Usage) => usage_gate.load(Ordering::Acquire),
        Some(Purpose::CrashReports) => crash_gate.load(Ordering::Acquire),
        Some(Purpose::StartupMinimal) => {
            usage_gate.load(Ordering::Acquire) || crash_gate.load(Ordering::Acquire)
        }
        None => false,
    };
    if !allowed || event_purpose(event.event_name()).is_none() {
        return None;
    }
    let current_epoch = lock(consent_epoch);
    if captured_generation != Some(current_epoch.generation)
        || current_epoch.installation_id.as_deref() != Some(event.distinct_id())
    {
        return None;
    }
    drop(current_epoch);
    // Strip SDK OS-version defaults; the catalog permits only our os_family dimension.
    for sdk_default in [
        "$os",
        "$os_version",
        "$lib_version__major",
        "$lib_version__minor",
        "$lib_version__patch",
    ] {
        event.remove_prop(sdk_default);
    }
    let keys: Vec<String> = event.properties().keys().cloned().collect();
    for key in keys {
        if !property_allowed(event.event_name(), &key) {
            return None;
        }
        let value = event.remove_prop(&key)?;
        if key == "$debug_images" {
            // Allow only the symbolication envelope; omit local paths and future SDK fields.
            if let Some(safe) = sanitize_debug_images(value) {
                if event.insert_prop(key, safe).is_err() {
                    return None;
                }
            }
            continue;
        }
        let max_chars = if key == "$exception_list" {
            MAX_EXCEPTION_STRING_CHARS
        } else {
            MAX_STRING_CHARS
        };
        let safe = if key == "$exception_list" {
            sanitize_value_with_max_depth(value, 0, max_chars, 8)
        } else {
            sanitize_value(value, 0, max_chars)
        };
        if event.insert_prop(key, safe).is_err() {
            return None;
        }
    }
    // Force person profiles off even if SDK defaults or callers enable them; retain event correlation.
    event.insert_prop("$process_person_profile", false).ok()?;
    if serde_json::to_vec(&event).ok()?.len() > MAX_EVENT_BYTES {
        return None;
    }
    Some(event)
}

fn posthog_error_category(error: &PostHogError<'_>) -> &'static str {
    match error {
        PostHogError::Capture(_) => "capture",
        PostHogError::FeatureFlags(_) => "feature_flags",
        PostHogError::LocalEvaluation(_) => "local_evaluation",
        _ => "unknown",
    }
}

fn event_purpose(event: &str) -> Option<Purpose> {
    match event {
        "$exception" => Some(Purpose::CrashReports),
        "app_started"
        | "app_closed"
        | "screen_viewed"
        | "onboarding_started"
        | "onboarding_step_completed"
        | "onboarding_completed"
        | "obs_check_completed"
        | "live_start_requested"
        | "live_start_completed"
        | "live_start_failed"
        | "target_state_changed"
        | "live_ended"
        | "diagnostics_exported"
        | "update_completed" => Some(Purpose::Usage),
        _ => None,
    }
}

fn common_property(key: &str) -> bool {
    matches!(
        key,
        "telemetry_schema_version"
            | "surface"
            | "environment"
            | "app_version"
            | "build_sha"
            | "locale"
            | "os_family"
            | "arch"
            | "gpu_vendor"
            | "encoder_kind"
            | "$geoip_disable"
            | "$is_server"
            | "$lib"
            | "$lib_version"
            | "$process_person_profile"
    )
}

fn property_allowed(event: &str, key: &str) -> bool {
    if common_property(key) {
        return true;
    }
    match event {
        "$exception" => matches!(
            key,
            "$exception_list"
                | "$debug_images"
                | "$exception_fingerprint"
                | "$exception_level"
                | "$exception_panic_file"
                | "$exception_panic_line"
                | "$exception_panic_column"
                | "error_id"
                | "operation_id"
                | "request_id"
                | "error_code"
                | "stage"
                | "retryable"
                | "handled"
                | "severity"
                | "top_app_frame"
        ),
        "app_started" => matches!(key, "previous_exit" | "startup_duration_bucket"),
        "app_closed" => matches!(key, "uptime_bucket" | "live_was_active"),
        "screen_viewed" => key == "screen_id",
        "onboarding_started" => key == "entry_point",
        "onboarding_step_completed" => key == "step_id",
        "onboarding_completed" => key == "duration_bucket",
        "obs_check_completed" => {
            matches!(
                key,
                "outcome" | "error_code" | "resolution_bucket" | "fps_bucket"
            )
        }
        "live_start_requested" => matches!(
            key,
            "operation_id"
                | "mode"
                | "target_count"
                | "platforms"
                | "brb_enabled"
                | "guardian_enabled"
                | "record_video_enabled"
        ),
        "live_start_completed" => {
            matches!(key, "operation_id" | "duration_bucket" | "encoder_kind")
        }
        "live_start_failed" => matches!(
            key,
            "operation_id" | "stage" | "error_code" | "cancelled" | "retryable"
        ),
        "target_state_changed" => matches!(
            key,
            "operation_id" | "platform" | "from" | "to" | "error_code"
        ),
        "live_ended" => matches!(
            key,
            "operation_id" | "reason" | "duration_bucket" | "reconnect_count_bucket"
        ),
        "diagnostics_exported" => key == "outcome",
        "update_completed" => {
            matches!(
                key,
                "from_version" | "to_version" | "outcome" | "error_code"
            )
        }
        _ => false,
    }
}

fn validate_input_properties(event: &str, properties: &Map<String, Value>) -> Result<(), String> {
    for (key, value) in properties {
        if !property_allowed(event, key) || key.starts_with('$') || key.starts_with('_') {
            return Err(format!("unknown telemetry property: {key}"));
        }
        validate_property_value(event, key, value)?;
    }
    Ok(())
}

fn validate_property_value(event: &str, key: &str, value: &Value) -> Result<(), String> {
    let valid = match key {
        "operation_id" | "error_id" | "request_id" => value
            .as_str()
            .is_some_and(|item| Uuid::parse_str(item).is_ok()),
        "platform" => value.as_str().and_then(normalize_platform).is_some(),
        "platforms" => value.as_array().is_some_and(|items| {
            items.len() <= 10
                && items
                    .iter()
                    .all(|item| item.as_str().and_then(normalize_platform).is_some())
        }),
        "mode" => value
            .as_str()
            .is_some_and(|item| matches!(item, "hybrid" | "passthrough" | "per-platform")),
        "stage" => value
            .as_str()
            .is_some_and(|item| normalize_stage(item) == item),
        "error_code" => value
            .as_str()
            .is_some_and(|item| normalize_error_code(item) == item),
        "from" | "to" => value.as_str().and_then(normalize_target_state).is_some(),
        "outcome" => value.as_str().is_some_and(|item| match event {
            "obs_check_completed" => {
                matches!(item, "ok" | "not_reachable" | "wrong_destination" | "error")
            }
            "diagnostics_exported" => matches!(item, "saved" | "cancelled" | "failed"),
            "update_completed" => matches!(item, "installed" | "failed"),
            _ => matches!(item, "success" | "failed" | "cancelled" | "partial"),
        }),
        "reason" => value.as_str().is_some_and(|item| {
            matches!(
                item,
                "user" | "cancelled" | "engine_error" | "engine_stopped" | "app_exit"
            )
        }),
        "severity" => value
            .as_str()
            .is_some_and(|item| normalize_severity(item) == item),
        "previous_exit" => value
            .as_str()
            .is_some_and(|item| matches!(item, "clean" | "unclean" | "unknown")),
        key if key.ends_with("_bucket") => value.as_str().is_some_and(valid_bucket),
        "target_count" => value.as_u64().is_some_and(|count| count <= 32),
        "retryable"
        | "handled"
        | "cancelled"
        | "live_was_active"
        | "brb_enabled"
        | "guardian_enabled"
        | "record_video_enabled" => value.is_boolean(),
        // Identifiers must not become free-text, URL, or path dimensions.
        "screen_id" | "step_id" | "entry_point" | "encoder_kind" => value
            .as_str()
            .is_some_and(|item| valid_enum_token(item, 48)),
        "from_version" | "to_version" => value
            .as_str()
            .is_some_and(|item| valid_enum_token(item, 64)),
        _ => true,
    };
    if valid {
        Ok(())
    } else {
        Err(format!("invalid value for {key}"))
    }
}

fn valid_enum_token(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value.len() <= max
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
}

fn valid_bucket(value: &str) -> bool {
    matches!(
        value,
        "lt_1s"
            | "1_3s"
            | "3_10s"
            | "10_30s"
            | "30_60s"
            | "1_5m"
            | "5_30m"
            | "30_120m"
            | "gte_120m"
            | "0"
            | "1"
            | "2_3"
            | "4_10"
            | "gte_11"
            | "sd"
            | "hd"
            | "full_hd"
            | "quad_hd"
            | "uhd_or_more"
            | "lte_24"
            | "25_30"
            | "31_50"
            | "51_60"
            | "gt_60"
            | "unknown"
    )
}

fn normalize_platform(value: &str) -> Option<&'static str> {
    match value {
        "twitch" => Some("twitch"),
        "youtube" => Some("youtube"),
        "facebook" => Some("facebook"),
        "kick" => Some("kick"),
        "tiktok" => Some("tiktok"),
        "x" => Some("x"),
        "instagram" => Some("instagram"),
        "custom" => Some("custom"),
        _ => None,
    }
}

fn normalize_target_state(value: &str) -> Option<&'static str> {
    match value {
        "idle" => Some("idle"),
        "connecting" => Some("connecting"),
        "live" => Some("live"),
        "reconnecting" => Some("reconnecting"),
        "paused" => Some("paused"),
        "waiting" => Some("waiting"),
        "signal-lost" => Some("signal-lost"),
        "auth-error" => Some("auth-error"),
        "error" => Some("error"),
        "brb" => Some("brb"),
        "censor" => Some("censor"),
        "stopped" => Some("stopped"),
        _ => None,
    }
}

fn normalize_stage(value: &str) -> &'static str {
    match value {
        "config" => "config",
        "obs" => "obs",
        "mediamtx" => "mediamtx",
        "compositor" => "compositor",
        "encoder" => "encoder",
        "network" => "network",
        "target" => "target",
        "recording" => "recording",
        "oauth" => "oauth",
        "shutdown" => "shutdown",
        "native" => "native",
        "frontend" => "frontend",
        "update" => "update",
        "diagnostics" => "diagnostics",
        _ => "native",
    }
}

fn normalize_error_code(value: &str) -> &str {
    match value {
        // A closed catalog prevents provider messages and names from becoming dimensions.
        "unknown_error"
        | "none"
        | "native_panic"
        | "start_cancelled"
        | "engine_start_failed"
        | "engine_error"
        | "ffmpeg_spawn_failed"
        | "ingest_port_in_use"
        | "mediamtx_config_path_failed"
        | "mediamtx_config_write_failed"
        | "mediamtx_sidecar_missing"
        | "mediamtx_spawn_failed"
        | "mediamtx_died"
        | "obs_start_failed"
        | "obs_stop_failed"
        | "obs_stream_task_failed"
        | "obs_check_task_failed"
        | "compositor_ffmpeg_missing"
        | "compositor_encoder_died"
        | "compositor_setup_failed"
        | "recording_disk_low"
        | "recording_ffmpeg_spawn_failed"
        | "recording_gave_up"
        | "vault_key_vanished"
        | "splicer_task_failed"
        | "splicer_setup_fallback"
        | "youtube_auto_provision_failed"
        | "oauth_broker_failed"
        | "oauth_refresh_failed"
        | "setup_bootstrap_failed"
        | "diagnostics_write_failed"
        | "target_auth_error"
        | "signal_lost"
        // Local diagnostics use event names when no error_code is present.
        | "app_started"
        | "app_closed"
        | "screen_viewed"
        | "onboarding_started"
        | "onboarding_step_completed"
        | "onboarding_completed"
        | "obs_check_completed"
        | "live_start_requested"
        | "live_start_completed"
        | "live_start_failed"
        | "target_state_changed"
        | "live_ended"
        | "diagnostics_exported"
        | "update_completed" => value,
        _ => "unknown_error",
    }
}

fn normalize_severity(value: &str) -> &'static str {
    match value {
        "debug" => "debug",
        "info" => "info",
        "warning" => "warning",
        "fatal" => "fatal",
        _ => "error",
    }
}

fn event_stage(event: &str) -> &'static str {
    match event {
        "obs_check_completed" => "obs",
        "live_start_requested" | "live_start_completed" | "live_start_failed" | "live_ended" => {
            "native"
        }
        "target_state_changed" => "target",
        "diagnostics_exported" => "diagnostics",
        "update_completed" => "update",
        _ => "frontend",
    }
}

pub fn duration_bucket(duration: Duration) -> &'static str {
    match duration.as_secs() {
        0 => "lt_1s",
        1..=2 => "1_3s",
        3..=9 => "3_10s",
        10..=29 => "10_30s",
        30..=59 => "30_60s",
        60..=299 => "1_5m",
        300..=1_799 => "5_30m",
        1_800..=7_199 => "30_120m",
        _ => "gte_120m",
    }
}

pub fn reconnect_bucket(count: u32) -> &'static str {
    match count {
        0 => "0",
        1 => "1",
        2..=3 => "2_3",
        4..=10 => "4_10",
        _ => "gte_11",
    }
}

fn sanitize_debug_images(value: Value) -> Option<Value> {
    let Value::Array(images) = value else {
        return None;
    };
    let mut safe_images = Vec::new();
    for image in images.into_iter().take(MAX_ARRAY_ITEMS) {
        let Value::Object(image) = image else {
            continue;
        };
        let image_type = image
            .get("type")
            .and_then(Value::as_str)
            .filter(|value| matches!(*value, "pe" | "elf" | "macho"))?;
        let debug_id = image
            .get("debug_id")
            .and_then(Value::as_str)
            .filter(|value| valid_hex_identifier(value, 80))?;
        let image_addr = image
            .get("image_addr")
            .and_then(Value::as_str)
            .filter(|value| valid_hex_address(value))?;
        let arch = image
            .get("arch")
            .and_then(Value::as_str)
            .filter(|value| valid_arch(value))?;

        let mut safe = Map::new();
        safe.insert("type".into(), Value::String(image_type.into()));
        safe.insert("debug_id".into(), Value::String(debug_id.into()));
        safe.insert("image_addr".into(), Value::String(image_addr.into()));
        safe.insert("arch".into(), Value::String(arch.into()));
        if let Some(code_id) = image
            .get("code_id")
            .and_then(Value::as_str)
            .filter(|value| valid_hex_identifier(value, 128))
        {
            safe.insert("code_id".into(), Value::String(code_id.into()));
        }
        if let Some(image_size) = image.get("image_size").and_then(Value::as_u64) {
            safe.insert("image_size".into(), Value::Number(image_size.into()));
        }
        if let Some(image_vmaddr) = image
            .get("image_vmaddr")
            .and_then(Value::as_str)
            .filter(|value| valid_hex_address(value))
        {
            safe.insert("image_vmaddr".into(), Value::String(image_vmaddr.into()));
        }
        // debug_id is sufficient for symbol matching; code_file would disclose local paths.
        safe_images.push(Value::Object(safe));
    }
    (!safe_images.is_empty()).then_some(Value::Array(safe_images))
}

fn valid_hex_identifier(value: &str, max_len: usize) -> bool {
    !value.is_empty()
        && value.len() <= max_len
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() || byte == b'-')
}

fn valid_hex_address(value: &str) -> bool {
    value.strip_prefix("0x").is_some_and(|hex| {
        !hex.is_empty() && hex.len() <= 32 && hex.bytes().all(|b| b.is_ascii_hexdigit())
    })
}

fn valid_arch(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 24
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

fn secret_json_key(key: &str) -> bool {
    let normalized: String = key
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect();
    matches!(
        normalized.as_str(),
        "authorization"
            | "accesstoken"
            | "refreshtoken"
            | "clientsecret"
            | "password"
            | "passwd"
            | "streamkey"
            | "apikey"
            | "privatekey"
            | "token"
            | "secret"
            | "senha"
            | "cookie"
    )
}

fn sanitize_value(value: Value, depth: usize, max_chars: usize) -> Value {
    sanitize_value_with_max_depth(value, depth, max_chars, MAX_VALUE_DEPTH)
}

fn sanitize_value_with_max_depth(
    value: Value,
    depth: usize,
    max_chars: usize,
    max_depth: usize,
) -> Value {
    if depth >= max_depth {
        return Value::String("<truncated>".into());
    }
    match value {
        Value::String(text) => Value::String(redact_text_with_limit(&text, max_chars)),
        Value::Array(items) => Value::Array(
            items
                .into_iter()
                .take(MAX_ARRAY_ITEMS)
                .map(|item| sanitize_value_with_max_depth(item, depth + 1, max_chars, max_depth))
                .collect(),
        ),
        Value::Object(object) => {
            let mut safe = Map::new();
            for (key, value) in object.into_iter().take(MAX_OBJECT_ITEMS) {
                let key = redact_text_with_limit(&key, 80);
                let value = if secret_json_key(&key) {
                    Value::String("<redacted>".into())
                } else {
                    sanitize_value_with_max_depth(value, depth + 1, max_chars, max_depth)
                };
                safe.insert(key, value);
            }
            Value::Object(safe)
        }
        primitive => primitive,
    }
}

struct Redactors {
    json_string_secret: Regex,
    json_scalar_secret: Regex,
    authorization: Regex,
    labeled_secret: Regex,
    jwt: Regex,
    long_token: Regex,
    email: Regex,
    url: Regex,
    windows_user: Regex,
    unix_home: Regex,
    windows_path: Regex,
}

fn redactors() -> &'static Redactors {
    static REDACTORS: OnceLock<Redactors> = OnceLock::new();
    REDACTORS.get_or_init(|| Redactors {
        json_string_secret: Regex::new(
            r#"(?i)("(?:authorization|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|password|passwd|senha|stream[_ -]?key|api[_ -]?key|private[_ -]?key|token|secret|cookie)"\s*:\s*)"(?:\\.|[^"\\])*""#,
        )
        .expect("valid static regex"),
        json_scalar_secret: Regex::new(
            r#"(?i)("(?:authorization|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|password|passwd|senha|stream[_ -]?key|api[_ -]?key|private[_ -]?key|token|secret|cookie)"\s*:\s*)(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)"#,
        )
        .expect("valid static regex"),
        authorization: Regex::new(r"(?i)(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+")
            .expect("valid static regex"),
        labeled_secret: Regex::new(
            r"(?i)(access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|password|passwd|senha|stream[_ -]?key|api[_ -]?key|private[_ -]?key|token|secret|cookie)(\s*[:=]\s*)[^\s,;]+",
        )
        .expect("valid static regex"),
        jwt: Regex::new(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b")
            .expect("valid static regex"),
        long_token: Regex::new(r"\b[A-Za-z0-9_+/=-]{40,}\b").expect("valid static regex"),
        email: Regex::new(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
            .expect("valid static regex"),
        url: Regex::new(r#"(?i)\b(?:https?|rtmps?|wss?)://[^\s<>"']+"#)
            .expect("valid static regex"),
        windows_user: Regex::new(r"(?i)[A-Z]:\\Users\\[^\\/:\r\n]+")
            .expect("valid static regex"),
        unix_home: Regex::new(r"/(?:home|Users)/[^/\s:\r\n]+")
            .expect("valid static regex"),
        windows_path: Regex::new(r#"(?i)\b[A-Z]:\\[^\s"']+"#)
            .expect("valid static regex"),
    })
}

#[cfg(test)]
fn redact_text(text: &str) -> String {
    redact_text_with_limit(text, MAX_EXCEPTION_STRING_CHARS)
}

fn redact_text_with_limit(text: &str, max_chars: usize) -> String {
    let rules = redactors();
    let mut safe = rules
        .json_string_secret
        .replace_all(text, "$1\"<redacted>\"")
        .into_owned();
    safe = rules
        .json_scalar_secret
        .replace_all(&safe, "$1\"<redacted>\"")
        .into_owned();
    safe = rules
        .authorization
        .replace_all(&safe, "$1<redacted>")
        .into_owned();
    safe = rules
        .labeled_secret
        .replace_all(&safe, "$1$2<redacted>")
        .into_owned();
    safe = rules.jwt.replace_all(&safe, "<redacted-jwt>").into_owned();
    safe = rules
        .long_token
        .replace_all(&safe, "<redacted-token>")
        .into_owned();
    // Remove whole URLs to cover credentials in userinfo, stream paths, and OAuth query/fragment values.
    safe = rules
        .url
        .replace_all(&safe, |caps: &Captures<'_>| {
            let url = caps.get(0).map(|item| item.as_str()).unwrap_or_default();
            let scheme = url.split(':').next().unwrap_or("url");
            format!("<{scheme}-url>")
        })
        .into_owned();
    safe = rules
        .email
        .replace_all(&safe, "<redacted-email>")
        .into_owned();
    safe = rules
        .windows_user
        .replace_all(&safe, "<local-path>")
        .into_owned();
    safe = rules
        .unix_home
        .replace_all(&safe, "<local-path>")
        .into_owned();
    safe = rules
        .windows_path
        .replace_all(&safe, "<local-path>")
        .into_owned();
    truncate_chars(&safe, max_chars)
}

fn truncate_chars(value: &str, max: usize) -> String {
    if value.chars().count() <= max {
        return value.to_string();
    }
    let mut out: String = value.chars().take(max).collect();
    out.push_str("…<truncated>");
    out
}

/// Allowlisted diagnostic summary: never serialize names, IDs, URLs, paths, keys, or user content.
pub fn diagnostic_config_summary(config: &AppConfig) -> Value {
    let mut platform_counts: HashMap<&'static str, u64> = HashMap::new();
    let mut encoder_kinds = HashSet::new();
    for target in config.targets.iter().filter(|target| target.enabled) {
        let platform = normalize_platform(&target.platform_id).unwrap_or("custom");
        *platform_counts.entry(platform).or_default() += 1;
        let encoder = match target.encoding.encoder.as_str() {
            "auto" => "auto",
            "nvenc" => "nvenc",
            "qsv" => "qsv",
            "amf" => "amf",
            "videotoolbox" => "videotoolbox",
            "software" => "software",
            _ => "unknown",
        };
        encoder_kinds.insert(encoder.to_string());
    }
    serde_json::json!({
        "schemaVersion": config.schema_version,
        "revision": config.revision,
        "mode": match config.mode.as_str() {
            "hybrid" | "passthrough" | "per-platform" => config.mode.as_str(),
            _ => "unknown",
        },
        "enabledTargetCount": config.targets.iter().filter(|target| target.enabled).count(),
        "platformCounts": platform_counts,
        "encoderKinds": encoder_kinds,
        "profileCount": config.profiles.len(),
        "features": {
            "autoStartObs": config.settings.auto_start_obs,
            "autoBitrate": config.settings.auto_bitrate,
            "brb": config.settings.brb_enabled,
            "guardian": config.settings.guardian_enabled,
            "loudnessNormalize": config.settings.loudness_normalize,
            "youtubeAutoLive": config.settings.youtube_auto_live,
            "chatAutoConnect": config.settings.chat_auto_connect,
            "overlay": config.settings.overlay_enabled,
            "recordVideo": config.settings.record_video,
            "recordChat": config.settings.record_chat,
        },
        "sourceCounts": {
            "chat": config.settings.chat_sources.len(),
            "alerts": config.settings.alert_sources.len(),
        },
    })
}

#[derive(Deserialize, Serialize)]
struct ExitMarker {
    state: String,
}

pub fn mark_boot_started(app: &AppHandle) -> String {
    let Ok(dir) = app.path().app_config_dir() else {
        return "unknown".into();
    };
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join(EXIT_MARKER_FILE);
    let previous = std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<ExitMarker>(&raw).ok())
        .map(|marker| match marker.state.as_str() {
            "running" => "unclean",
            "clean" => "clean",
            _ => "unknown",
        })
        .unwrap_or("unknown")
        .to_string();
    write_exit_marker(&path, "running");
    previous
}

fn mark_exit(app: &AppHandle, state: &str) {
    if let Ok(dir) = app.path().app_config_dir() {
        write_exit_marker(&dir.join(EXIT_MARKER_FILE), state);
    }
}

fn write_exit_marker(path: &Path, state: &str) {
    let marker = ExitMarker {
        state: state.into(),
    };
    if let Ok(raw) = serde_json::to_vec(&marker) {
        let tmp = path.with_extension("json.tmp");
        if std::fs::write(&tmp, raw).is_ok() {
            let _ = atomic_replace(&tmp, path);
        }
    }
}

thread_local! {
    // Hooks run before unwind and cannot know whether a caller will catch this panic.
    static PANIC_CONTAINED: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

fn panic_is_contained() -> bool {
    PANIC_CONTAINED.with(|flag| flag.get())
}

/// Clear during unwind so reused worker threads do not misclassify later fatal panics.
pub struct ContainedPanicScope;

impl ContainedPanicScope {
    pub fn enter() -> Self {
        PANIC_CONTAINED.with(|flag| flag.set(true));
        ContainedPanicScope
    }
}

impl Drop for ContainedPanicScope {
    fn drop(&mut self) {
        PANIC_CONTAINED.with(|flag| flag.set(false));
    }
}

pub fn install_panic_hook(app: AppHandle) {
    static INSTALLED: AtomicBool = AtomicBool::new(false);
    if INSTALLED.swap(true, Ordering::AcqRel) {
        return;
    }
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info| {
        let severity = if panic_is_contained() {
            "warning"
        } else {
            "fatal"
        };
        // Check the gate before capture; never read a panic message that may contain user data.
        let telemetry = &app.state::<AppState>().telemetry;
        if telemetry.crash_enabled.load(Ordering::Acquire) {
            let location = panic_info.location();
            let safe_frame = location.map(|location| {
                let file = Path::new(location.file())
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("native");
                format!("{file}:{}", location.line())
            });
            let error = AppError::new("native_panic", "native", false, None);

            let error_id =
                telemetry.capture_error_at(error, None, false, severity, safe_frame.as_deref());
            if let Some(frame) = &safe_frame {
                log::error!("native panic ({severity}) at {frame}; error_id={error_id}");
            }
            telemetry.flush_after_panic_bounded();
        }
        previous(panic_info);
    }));
}

#[tauri::command]
pub fn telemetry_status(app: AppHandle) -> TelemetryStatus {
    app.state::<AppState>().telemetry.status()
}

#[tauri::command]
pub fn telemetry_set_consent(
    app: AppHandle,
    input: TelemetryConsentInput,
) -> Result<TelemetryStatus, String> {
    app.state::<AppState>().telemetry.set_consent(
        input.usage,
        input.crash_reports,
        input.notice_version,
    )
}

#[tauri::command]
pub fn telemetry_regenerate_id(app: AppHandle) -> Result<TelemetryStatus, String> {
    app.state::<AppState>().telemetry.regenerate_id()
}

#[tauri::command]
pub fn telemetry_capture(
    app: AppHandle,
    event: String,
    properties: Option<Map<String, Value>>,
) -> Result<bool, String> {
    app.state::<AppState>()
        .telemetry
        .capture(&event, properties.unwrap_or_default())
}

#[tauri::command]
pub fn telemetry_capture_exception(
    app: AppHandle,
    error_code: String,
    stage: String,
    retryable: bool,
    operation_id: Option<String>,
    handled: Option<bool>,
    severity: Option<String>,
) -> Result<String, String> {
    if normalize_error_code(&error_code) != error_code || normalize_stage(&stage) != stage {
        return Err("error code or stage is not in the catalog".into());
    }
    if operation_id
        .as_deref()
        .is_some_and(|value| Uuid::parse_str(value).is_err())
    {
        return Err("invalid operationId".into());
    }
    Ok(app.state::<AppState>().telemetry.capture_error(
        AppError::new(&error_code, &stage, retryable, None),
        operation_id.as_deref(),
        handled.unwrap_or(true),
        severity.as_deref().unwrap_or("error"),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("corneta-{name}-{}.json", new_id()))
    }

    fn consent_cases() -> [(Consent, Consent, (bool, bool)); 9] {
        use Consent::{Disabled, Enabled, Unset};
        [
            (Unset, Unset, (false, true)),
            (Unset, Disabled, (false, false)),
            (Unset, Enabled, (false, true)),
            (Disabled, Unset, (false, true)),
            (Disabled, Disabled, (false, false)),
            (Disabled, Enabled, (false, true)),
            (Enabled, Unset, (true, true)),
            (Enabled, Disabled, (true, false)),
            (Enabled, Enabled, (true, true)),
        ]
    }

    fn stamped_event(
        event_name: &str,
        installation_id: &str,
        purpose: Purpose,
        generation: u64,
    ) -> Event {
        let mut event = Event::new(event_name, installation_id);
        event
            .insert_prop(INTERNAL_PURPOSE_PROPERTY, purpose.marker())
            .unwrap();
        event
            .insert_prop(INTERNAL_EPOCH_PROPERTY, generation)
            .unwrap();
        event
    }

    #[test]
    fn final_hook_disables_person_profiles_for_each_purpose_and_preserves_identity() {
        let installation_id = new_id();
        let epoch = Mutex::new(ConsentEpoch {
            generation: 7,
            installation_id: Some(installation_id.clone()),
        });
        for (event_name, purpose, usage, crash) in [
            ("app_closed", Purpose::Usage, true, false),
            ("app_started", Purpose::StartupMinimal, false, true),
            ("$exception", Purpose::CrashReports, false, true),
        ] {
            for incoming_profile_flag in [None, Some(false), Some(true)] {
                let mut event = stamped_event(event_name, &installation_id, purpose, 7);
                if let Some(flag) = incoming_profile_flag {
                    event.insert_prop("$process_person_profile", flag).unwrap();
                }
                let safe = final_before_send(
                    event,
                    &AtomicBool::new(usage),
                    &AtomicBool::new(crash),
                    &epoch,
                )
                .expect("an active purpose must preserve the event");
                let payload = serde_json::to_value(safe).unwrap();
                assert_eq!(payload["properties"]["$process_person_profile"], false);
                assert_eq!(payload["distinct_id"], installation_id);
                assert!(payload["properties"]
                    .get(INTERNAL_PURPOSE_PROPERTY)
                    .is_none());
                assert!(payload["properties"].get(INTERNAL_EPOCH_PROPERTY).is_none());
            }
        }
    }

    #[test]
    fn real_posthog_usage_and_startup_envelopes_disable_person_profiles() {
        let installation_id = new_id();
        let hook_installation_id = installation_id.clone();
        let seen = Arc::new(Mutex::new(Vec::<Value>::new()));
        let hook_seen = seen.clone();
        let client = posthog_rs::client(
            ClientOptionsBuilder::default()
                .api_key("phc_abcdefgh".to_string())
                .host("http://127.0.0.1:1".to_string())
                .disable_geoip(true)
                .is_server(false)
                .flush_at(1)
                .max_capture_attempts(1u32)
                .before_send(move |event| {
                    let safe = final_before_send(
                        event,
                        &AtomicBool::new(true),
                        &AtomicBool::new(true),
                        &Mutex::new(ConsentEpoch {
                            generation: 7,
                            installation_id: Some(hook_installation_id.clone()),
                        }),
                    )
                    .expect("the real SDK envelope must pass the hook");
                    lock(&hook_seen).push(serde_json::to_value(safe).unwrap());
                    // Inspect the serializable envelope, then discard it before transport.
                    None
                })
                .build()
                .unwrap(),
        );
        for (event_name, purpose) in [
            ("app_closed", Purpose::Usage),
            ("app_started", Purpose::StartupMinimal),
        ] {
            let mut event = stamped_event(event_name, &installation_id, purpose, 7);
            event.insert_prop("$process_person_profile", true).unwrap();
            client.capture(event);
        }
        client.flush();
        client.shutdown();
        let payloads = lock(&seen);
        assert_eq!(payloads.len(), 2);
        for payload in payloads.iter() {
            assert_eq!(payload["properties"]["$process_person_profile"], false);
            assert_eq!(payload["distinct_id"], installation_id);
        }
    }

    #[test]
    fn uninitialized_runtime_does_not_send() {
        let runtime = TelemetryRuntime::default();
        assert!(!runtime.should_send(Purpose::Usage));
        assert!(!runtime.should_send(Purpose::CrashReports));
        assert!(runtime.status().installation_id.is_none());
    }

    #[test]
    fn enabling_a_purpose_creates_and_persists_a_valid_v4_uuid() {
        let path = temp_file("telemetry-consent");
        // Exercise preference persistence without initializing an SDK client or using build credentials.
        let runtime = TelemetryRuntime {
            build_disabled: false,
            ..TelemetryRuntime::default()
        };
        *lock(&runtime.path) = Some(path.clone());
        let status = runtime
            .set_consent(Consent::Enabled, Consent::Disabled, NOTICE_VERSION.into())
            .unwrap();
        let id = Uuid::parse_str(status.installation_id.as_deref().unwrap()).unwrap();
        assert_eq!(id.get_version_num(), 4);
        assert!(runtime.should_send(Purpose::Usage));
        assert!(!runtime.should_send(Purpose::CrashReports));
        let loaded = load_status_file(&path);
        assert_eq!(loaded.installation_id, status.installation_id);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn correlation_reports_only_the_current_independent_purposes() {
        let path = temp_file("telemetry-correlation-purposes");
        let runtime = TelemetryRuntime {
            build_disabled: false,
            ..TelemetryRuntime::default()
        };
        *lock(&runtime.path) = Some(path.clone());
        assert!(runtime.correlation().is_none());

        runtime
            .set_consent(Consent::Enabled, Consent::Disabled, NOTICE_VERSION.into())
            .unwrap();
        let usage = runtime.correlation().unwrap();
        assert_eq!(usage.purposes, "usage");
        assert!(Uuid::parse_str(&usage.installation_id).is_ok());

        runtime
            .set_consent(Consent::Disabled, Consent::Enabled, NOTICE_VERSION.into())
            .unwrap();
        let crash = runtime.correlation().unwrap();
        assert_eq!(crash.purposes, "crash_reports");
        assert_eq!(crash.installation_id, usage.installation_id);

        runtime
            .set_consent(Consent::Enabled, Consent::Enabled, NOTICE_VERSION.into())
            .unwrap();
        let both = runtime.correlation().unwrap();
        assert_eq!(both.purposes, "usage,crash_reports");
        assert_eq!(both.installation_id, usage.installation_id);

        runtime
            .set_consent(Consent::Disabled, Consent::Disabled, NOTICE_VERSION.into())
            .unwrap();
        assert!(runtime.correlation().is_none());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn correlation_snapshot_rejects_aba_even_when_gates_return_to_same_values() {
        let old_id = new_id();
        let before = ConsentEpoch {
            generation: 4,
            installation_id: Some(old_id.clone()),
        };
        let after_same_id = ConsentEpoch {
            generation: 6,
            installation_id: Some(old_id.clone()),
        };
        assert!(stable_correlation_snapshot(
            (true, false),
            &before,
            Some(&old_id),
            (true, false),
            &after_same_id,
        )
        .is_none());

        let new_id = new_id();
        let after_regenerate = ConsentEpoch {
            generation: 6,
            installation_id: Some(new_id),
        };
        assert!(stable_correlation_snapshot(
            (true, false),
            &before,
            Some(&old_id),
            (true, false),
            &after_regenerate,
        )
        .is_none());

        let stable = stable_correlation_snapshot(
            (true, false),
            &before,
            Some(&old_id),
            (true, false),
            &before,
        )
        .unwrap();
        assert_eq!(stable.installation_id, old_id);
        assert_eq!(stable.purposes, "usage");
    }

    #[test]
    fn revocation_changes_gate_before_persisted_queue_can_send() {
        let runtime = TelemetryRuntime::default();
        let path = temp_file("telemetry-revoke");
        *lock(&runtime.path) = Some(path.clone());
        runtime
            .set_consent(Consent::Enabled, Consent::Enabled, NOTICE_VERSION.into())
            .unwrap();
        runtime
            .set_consent(Consent::Disabled, Consent::Disabled, NOTICE_VERSION.into())
            .unwrap();
        assert!(!runtime.should_send(Purpose::Usage));
        assert!(!runtime.should_send(Purpose::CrashReports));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn consent_epoch_drops_old_queue_after_revoke_and_reopt_in() {
        let old_id = new_id();
        let new_id = new_id();
        let usage_gate = AtomicBool::new(true);
        let crash_gate = AtomicBool::new(false);
        let epoch = Mutex::new(ConsentEpoch {
            generation: 7,
            installation_id: Some(old_id.clone()),
        });

        let accepted = final_before_send(
            stamped_event("app_started", &old_id, Purpose::Usage, 7),
            &usage_gate,
            &crash_gate,
            &epoch,
        )
        .expect("current epoch must pass");
        assert!(!accepted
            .properties()
            .contains_key(INTERNAL_PURPOSE_PROPERTY));
        assert!(!accepted.properties().contains_key(INTERNAL_EPOCH_PROPERTY));

        // Revoke -> regenerate -> opt-in completes before the worker examines the queue.
        *lock(&epoch) = ConsentEpoch {
            generation: 9,
            installation_id: Some(new_id),
        };
        assert!(final_before_send(
            stamped_event("app_started", &old_id, Purpose::Usage, 7),
            &usage_gate,
            &crash_gate,
            &epoch,
        )
        .is_none());
    }

    #[test]
    fn sdk_exception_envelope_and_debug_images_survive_strict_filtering() {
        let installation_id = new_id();
        let usage_gate = AtomicBool::new(false);
        let crash_gate = AtomicBool::new(true);
        let epoch = Mutex::new(ConsentEpoch {
            generation: 3,
            installation_id: Some(installation_id.clone()),
        });
        let mut event = stamped_event("$exception", &installation_id, Purpose::CrashReports, 3);
        event
            .insert_prop(
                "$exception_list",
                serde_json::json!([{
                    "type": "AppError",
                    "value": "unknown_error at native",
                    "mechanism": {"type": "generic", "handled": true, "synthetic": false},
                    "stacktrace": {"type": "raw", "frames": [{
                        "function": "corneta_lib::run",
                        "filename": r"C:\Users\Pessoa\corneta\src\lib.rs",
                        "lineno": 10,
                        "client_resolved": true,
                        "inline": false
                    }]}
                }]),
            )
            .unwrap();
        event
            .insert_prop(
                "$debug_images",
                serde_json::json!([{
                    "type": "pe",
                    "debug_id": "01234567-89ab-cdef-0123-456789abcdef-1",
                    "code_id": "ABCDEF0123456789",
                    "image_addr": "0x7ff600000000",
                    "image_size": 4096,
                    "image_vmaddr": "0x0",
                    "code_file": r"C:\Users\Pessoa\corneta.exe",
                    "arch": "x86_64",
                    "future_untrusted_field": "password=segredo"
                }]),
            )
            .unwrap();

        let safe = final_before_send(event, &usage_gate, &crash_gate, &epoch)
            .expect("a valid SDK envelope must not be discarded");
        let images = safe.properties()["$debug_images"].as_array().unwrap();
        assert_eq!(images.len(), 1);
        assert!(images[0].get("code_file").is_none());
        assert!(images[0].get("future_untrusted_field").is_none());
        let exception = &safe.properties()["$exception_list"];
        assert!(exception[0]["stacktrace"]["frames"][0].is_object());
        let serialized = serde_json::to_string(safe.properties()).unwrap();
        assert!(!serialized.contains("Pessoa"));
        assert!(!serialized.contains("segredo"));
    }

    #[test]
    fn real_posthog_exception_envelope_passes_the_production_hook() {
        let installation_id = new_id();
        let usage_gate = Arc::new(AtomicBool::new(false));
        let crash_gate = Arc::new(AtomicBool::new(true));
        let epoch = Arc::new(Mutex::new(ConsentEpoch {
            generation: 11,
            installation_id: Some(installation_id.clone()),
        }));
        let raw_seen: Arc<Mutex<Option<HashMap<String, Value>>>> = Arc::new(Mutex::new(None));
        let seen: Arc<Mutex<Option<HashMap<String, Value>>>> = Arc::new(Mutex::new(None));
        let hook_usage = usage_gate.clone();
        let hook_crash = crash_gate.clone();
        let hook_epoch = epoch.clone();
        let hook_seen = seen.clone();
        let hook_raw_seen = raw_seen.clone();
        let error_tracking = ErrorTrackingOptionsBuilder::default()
            .capture_stacktrace(true)
            .capture_panics(false)
            .build()
            .unwrap();
        let options = ClientOptionsBuilder::default()
            .api_key("phc_abcdefgh".to_string())
            .host("http://127.0.0.1:1".to_string())
            .disable_geoip(true)
            .is_server(false)
            .flush_at(1)
            .max_capture_attempts(1u32)
            .error_tracking(error_tracking)
            .before_send(move |event| {
                *lock(&hook_raw_seen) = Some(event.properties().clone());
                Some(event)
            })
            .before_send(move |event| {
                let safe = final_before_send(event, &hook_usage, &hook_crash, &hook_epoch);
                *lock(&hook_seen) = safe.as_ref().map(|event| event.properties().clone());
                // Observe the final envelope without sending network traffic.
                None
            })
            .build()
            .unwrap();
        let client = posthog_rs::client(options);
        let capture_options = CaptureExceptionOptions::new()
            .distinct_id(installation_id)
            .fingerprint("desktop_native:unknown_error:test")
            .property("$process_person_profile", true)
            .unwrap()
            .property(INTERNAL_PURPOSE_PROPERTY, Purpose::CrashReports.marker())
            .unwrap()
            .property(INTERNAL_EPOCH_PROPERTY, 11u64)
            .unwrap()
            .property("error_code", "unknown_error")
            .unwrap()
            .property("stage", "native")
            .unwrap()
            .property("handled", true)
            .unwrap();
        client
            .capture_exception_with(
                &AppError::new("unknown_error", "native", false, None),
                capture_options,
            )
            .unwrap();
        client.flush();
        client.shutdown();

        let raw_properties = lock(&raw_seen).clone().unwrap_or_default();
        let properties = lock(&seen).clone().unwrap_or_else(|| {
            panic!(
                "before_send must accept the real SDK envelope; received keys: {:?}",
                raw_properties.keys().collect::<Vec<_>>()
            )
        });
        assert!(properties.contains_key("$exception_list"));
        assert_eq!(raw_properties["$process_person_profile"], true);
        assert_eq!(properties["$process_person_profile"], false);
        assert!(!properties.contains_key(INTERNAL_PURPOSE_PROPERTY));
        assert!(!properties.contains_key(INTERNAL_EPOCH_PROPERTY));
        if let Some(images) = properties.get("$debug_images") {
            assert!(images.as_array().is_some_and(|images| !images.is_empty()));
            assert!(images
                .as_array()
                .unwrap()
                .iter()
                .all(|image| image.get("code_file").is_none()));
        }
    }

    #[test]
    fn notice_updates_preserve_choices_and_existing_active_identity() {
        for (usage, crash_reports, gates) in consent_cases() {
            let path = temp_file("telemetry-old-notice");
            let id = new_id();
            let old_status = TelemetryStatus {
                notice_version: "2026-08-02".into(),
                usage,
                crash_reports,
                installation_id: Some(id.clone()),
                decided_at: Some("2026-08-03T12:00:00.000Z".into()),
                ..TelemetryStatus::default()
            };
            save_status_file(&path, &old_status).unwrap();
            let loaded = load_status_file(&path);
            assert_eq!(loaded.usage, usage);
            assert_eq!(loaded.crash_reports, crash_reports);
            assert_eq!(loaded.notice_version, old_status.notice_version);
            assert_eq!(loaded.decided_at, old_status.decided_at);
            assert_eq!(effective_gates(&loaded), gates);
            let expected_id = (gates.0 || gates.1).then_some(id);
            assert_eq!(loaded.installation_id, expected_id);

            let runtime = TelemetryRuntime::default();
            *lock(&runtime.path) = Some(path.clone());
            *lock(&runtime.status) = loaded;
            let updated = runtime
                .set_consent(usage, crash_reports, NOTICE_VERSION.into())
                .unwrap();
            assert_eq!(updated.usage, usage);
            assert_eq!(updated.crash_reports, crash_reports);
            assert_eq!(updated.notice_version, NOTICE_VERSION);
            assert_eq!(updated.installation_id, expected_id);
            assert_eq!(effective_gates(&updated), gates);
            let _ = std::fs::remove_file(path);
        }
    }

    #[test]
    fn new_installation_is_crash_only_but_unreadable_preferences_are_not() {
        assert_eq!(effective_gates(&TelemetryStatus::default()), (false, true));
        assert_eq!(effective_gates(&TelemetryStatus::opposed()), (false, false));
    }

    #[test]
    fn preference_matrix_preserves_purpose_defaults_identity_and_kill_switch() {
        for (usage, crash_reports, gates) in consent_cases() {
            for build_disabled in [false, true] {
                let path = temp_file("telemetry-preference-matrix");
                let runtime = TelemetryRuntime {
                    build_disabled,
                    ..TelemetryRuntime::default()
                };
                *lock(&runtime.path) = Some(path.clone());
                let status = runtime
                    .set_consent(usage, crash_reports, NOTICE_VERSION.into())
                    .unwrap();
                assert_eq!(effective_gates(&status), gates);
                assert_eq!(status.installation_id.is_some(), gates.0 || gates.1);
                let loaded = load_status_file(&path);
                assert_eq!(loaded.usage, usage);
                assert_eq!(loaded.crash_reports, crash_reports);
                assert_eq!(loaded.installation_id, status.installation_id);
                for (purpose, enabled) in [
                    (Purpose::Usage, gates.0),
                    (Purpose::CrashReports, gates.1),
                    (Purpose::StartupMinimal, gates.0 || gates.1),
                ] {
                    assert_eq!(runtime.should_send(purpose), enabled && !build_disabled);
                    assert_eq!(
                        runtime.capture_identity_for(purpose).is_some(),
                        enabled && !build_disabled
                    );
                }

                let expected_purposes = match (gates, build_disabled) {
                    ((true, true), false) => Some("usage,crash_reports"),
                    ((true, false), false) => Some("usage"),
                    ((false, true), false) => Some("crash_reports"),
                    _ => None,
                };
                assert_eq!(
                    runtime
                        .correlation()
                        .map(|correlation| correlation.purposes),
                    expected_purposes
                );
                assert!(runtime.client().is_none());
                assert!(!runtime.capture("app_started", Map::new()).unwrap());
                if gates.0 || gates.1 {
                    assert!(runtime.regenerate_id().is_err());
                } else {
                    assert!(runtime.regenerate_id().unwrap().installation_id.is_none());
                }
                let _ = std::fs::remove_file(path);
            }
        }
        assert!(!valid_posthog_token(""));
    }

    #[test]
    fn unset_usage_does_not_create_identity_or_block_regeneration() {
        let path = temp_file("telemetry-unset-id");
        let runtime = TelemetryRuntime::default();
        *lock(&runtime.path) = Some(path.clone());
        let status = runtime
            .set_consent(Consent::Unset, Consent::Disabled, NOTICE_VERSION.into())
            .unwrap();
        assert!(status.installation_id.is_none());
        assert!(runtime.regenerate_id().unwrap().installation_id.is_none());
        let crash_only = runtime
            .set_consent(Consent::Disabled, Consent::Unset, NOTICE_VERSION.into())
            .unwrap();
        assert!(Uuid::parse_str(crash_only.installation_id.as_deref().unwrap()).is_ok());
        assert!(runtime.regenerate_id().is_err());
        runtime
            .set_consent(Consent::Unset, Consent::Disabled, NOTICE_VERSION.into())
            .unwrap();
        assert!(runtime.regenerate_id().unwrap().installation_id.is_none());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn unset_usage_revokes_queued_events_even_when_persistence_fails() {
        for persist_fails in [false, true] {
            let path = temp_file("telemetry-unset-revoke");
            let runtime = TelemetryRuntime {
                build_disabled: false,
                ..TelemetryRuntime::default()
            };
            *lock(&runtime.path) = Some(path.clone());
            let active = runtime
                .set_consent(Consent::Enabled, Consent::Unset, NOTICE_VERSION.into())
                .unwrap();
            let queued_identity = runtime.capture_identity_for(Purpose::Usage).unwrap();
            if persist_fails {
                *lock(&runtime.path) = None;
            }
            let result = runtime.set_consent(Consent::Unset, Consent::Unset, NOTICE_VERSION.into());
            assert_eq!(result.is_err(), persist_fails);
            assert_eq!(runtime.status().usage, Consent::Unset);
            assert_eq!(runtime.status().installation_id, active.installation_id);
            assert!(!runtime.should_send(Purpose::Usage));
            assert!(runtime.should_send(Purpose::CrashReports));
            assert_eq!(runtime.correlation().unwrap().purposes, "crash_reports");
            assert!(final_before_send(
                stamped_event(
                    "app_started",
                    &queued_identity.installation_id,
                    Purpose::Usage,
                    queued_identity.generation,
                ),
                &runtime.usage_enabled,
                &runtime.crash_enabled,
                &runtime.consent_epoch,
            )
            .is_none());

            *lock(&runtime.path) = Some(path.clone());
            runtime
                .set_consent(Consent::Enabled, Consent::Unset, NOTICE_VERSION.into())
                .unwrap();
            assert!(runtime.should_send(Purpose::Usage));
            assert!(final_before_send(
                stamped_event(
                    "app_started",
                    &queued_identity.installation_id,
                    Purpose::Usage,
                    queued_identity.generation,
                ),
                &runtime.usage_enabled,
                &runtime.crash_enabled,
                &runtime.consent_epoch,
            )
            .is_none());
            let _ = std::fs::remove_file(path);
        }
    }

    #[test]
    fn startup_envelope_respects_usage_opt_in_and_crash_only_defaults() {
        for (usage, crash_reports) in [
            (Consent::Unset, Consent::Unset),
            (Consent::Disabled, Consent::Unset),
            (Consent::Enabled, Consent::Unset),
            (Consent::Unset, Consent::Disabled),
        ] {
            let path = temp_file("telemetry-startup-purposes");
            let runtime = TelemetryRuntime {
                build_disabled: false,
                ..TelemetryRuntime::default()
            };
            *lock(&runtime.path) = Some(path.clone());
            let status = runtime
                .set_consent(usage, crash_reports, NOTICE_VERSION.into())
                .unwrap();
            let seen = Arc::new(Mutex::new(Vec::<Value>::new()));
            let hook_seen = seen.clone();
            let usage_gate = runtime.usage_enabled.clone();
            let crash_gate = runtime.crash_enabled.clone();
            let consent_epoch = runtime.consent_epoch.clone();
            let client = Arc::new(posthog_rs::client(
                ClientOptionsBuilder::default()
                    .api_key("phc_abcdefgh".to_string())
                    .host("http://127.0.0.1:1".to_string())
                    .disable_geoip(true)
                    .is_server(false)
                    .flush_at(1)
                    .max_capture_attempts(1u32)
                    .before_send(move |event| {
                        if let Some(safe) =
                            final_before_send(event, &usage_gate, &crash_gate, &consent_epoch)
                        {
                            lock(&hook_seen).push(serde_json::to_value(safe).unwrap());
                        }
                        // Inspect the SDK envelope without sending network traffic.
                        None
                    })
                    .build()
                    .unwrap(),
            ));
            *lock(&runtime.client) = Some(client.clone());
            runtime.capture_app_started("unclean", Duration::from_millis(1_500));
            client.flush();
            runtime.shutdown();
            let payloads = lock(&seen);
            let gates = effective_gates(&status);
            assert_eq!(payloads.len(), usize::from(gates.0 || gates.1));
            if let Some(payload) = payloads.first() {
                assert_eq!(payload["event"], "app_started");
                assert_eq!(payload["distinct_id"], status.installation_id.unwrap());
                let props = &payload["properties"];
                assert_eq!(props["previous_exit"], "unclean");
                assert_eq!(props["$process_person_profile"], false);
                for usage_dimension in ["startup_duration_bucket", "os_family", "arch"] {
                    assert_eq!(props.get(usage_dimension).is_some(), gates.0);
                }
                assert!(props.get("app_version").is_some());
            }
            let _ = std::fs::remove_file(path);
        }
    }

    #[test]
    fn kill_switch_also_blocks_installation_correlation_with_setup_api() {
        for build_disabled in [false, true] {
            let runtime = TelemetryRuntime {
                build_disabled,
                ..TelemetryRuntime::default()
            };
            let id = new_id();
            lock(&runtime.status).installation_id = Some(id.clone());
            runtime.sync_epoch_installation_id(Some(id));
            runtime.usage_enabled.store(true, Ordering::Release);
            runtime.crash_enabled.store(true, Ordering::Release);
            assert_eq!(runtime.correlation().is_some(), !build_disabled);
            runtime.client_shutdown.store(true, Ordering::Release);
            assert!(runtime.correlation().is_none());
        }
    }

    #[test]
    fn unknown_schema_and_malformed_notice_fail_closed() {
        for status in [
            TelemetryStatus {
                schema_version: TELEMETRY_SCHEMA_VERSION + 1,
                usage: Consent::Enabled,
                crash_reports: Consent::Enabled,
                installation_id: Some(new_id()),
                ..TelemetryStatus::default()
            },
            TelemetryStatus {
                notice_version: "current".into(),
                usage: Consent::Enabled,
                crash_reports: Consent::Enabled,
                installation_id: Some(new_id()),
                ..TelemetryStatus::default()
            },
        ] {
            let normalized = status.normalize();
            assert_eq!(normalized.usage, Consent::Disabled);
            assert_eq!(normalized.crash_reports, Consent::Disabled);
            assert!(normalized.installation_id.is_none());
            assert_eq!(effective_gates(&normalized), (false, false));
        }

        let missing_schema = serde_json::json!({
            "noticeVersion": NOTICE_VERSION,
            "usage": "enabled",
            "crashReports": "enabled"
        });
        assert!(serde_json::from_value::<TelemetryStatus>(missing_schema).is_err());
    }

    #[test]
    fn ipc_cannot_enable_with_an_arbitrary_notice_version() {
        let path = temp_file("telemetry-notice");
        let runtime = TelemetryRuntime::default();
        *lock(&runtime.path) = Some(path.clone());
        assert!(runtime
            .set_consent(Consent::Enabled, Consent::Enabled, "2025-01-01".into())
            .is_err());
        assert!(!runtime.should_send(Purpose::Usage));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn active_id_cannot_be_regenerated() {
        let path = temp_file("telemetry-active-id");
        let runtime = TelemetryRuntime::default();
        *lock(&runtime.path) = Some(path.clone());
        runtime
            .set_consent(Consent::Enabled, Consent::Disabled, NOTICE_VERSION.into())
            .unwrap();
        assert!(runtime.regenerate_id().is_err());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn persistence_failure_never_opens_a_gate_and_revocation_stays_closed() {
        let valid_path = temp_file("telemetry-persist-valid");
        let runtime = TelemetryRuntime {
            build_disabled: false,
            ..TelemetryRuntime::default()
        };
        *lock(&runtime.path) = Some(valid_path.clone());
        runtime
            .set_consent(Consent::Enabled, Consent::Enabled, NOTICE_VERSION.into())
            .unwrap();
        assert!(runtime.should_send(Purpose::Usage));
        assert!(runtime.should_send(Purpose::CrashReports));

        let root = std::env::temp_dir().join(format!("corneta-blocked-{}", new_id()));
        std::fs::create_dir_all(&root).unwrap();
        let blocker = root.join("not-a-directory");
        std::fs::write(&blocker, b"block").unwrap();
        *lock(&runtime.path) = Some(blocker.join("telemetry.json"));
        assert!(runtime
            .set_consent(Consent::Disabled, Consent::Disabled, NOTICE_VERSION.into())
            .is_err());
        assert!(!runtime.should_send(Purpose::Usage));
        assert!(!runtime.should_send(Purpose::CrashReports));
        assert_eq!(runtime.status().usage, Consent::Disabled);
        assert_eq!(runtime.status().crash_reports, Consent::Disabled);

        let never_enabled = TelemetryRuntime::default();
        *lock(&never_enabled.path) = Some(blocker.join("other.json"));
        assert!(never_enabled
            .set_consent(Consent::Enabled, Consent::Enabled, NOTICE_VERSION.into())
            .is_err());
        assert!(!never_enabled.should_send(Purpose::Usage));
        assert!(!never_enabled.should_send(Purpose::CrashReports));
        assert_eq!(never_enabled.status().usage, Consent::Unset);
        assert!(never_enabled.status().installation_id.is_none());

        let _ = std::fs::remove_file(valid_path);
        let _ = std::fs::remove_file(blocker);
        let _ = std::fs::remove_dir(root);
    }

    #[test]
    fn status_file_can_be_atomically_replaced_after_first_decision() {
        let path = temp_file("telemetry-replace");
        let first = TelemetryStatus::default();
        save_status_file(&path, &first).unwrap();
        let second = TelemetryStatus {
            usage: Consent::Disabled,
            crash_reports: Consent::Disabled,
            decided_at: Some(now_iso()),
            ..TelemetryStatus::default()
        };
        save_status_file(&path, &second).unwrap();
        let loaded = load_status_file(&path);
        assert_eq!(loaded.usage, Consent::Disabled);
        assert_eq!(loaded.crash_reports, Consent::Disabled);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn redactor_removes_secret_classes_and_pii() {
        let raw = concat!(
            "Authorization: Bearer abc.def; password=hunter2 ",
            "access_token=eyJhbGciOiJIUzI1NiJ9.abcdefghijk.abcdefghijklmnop ",
            r#"json {"Authorization":"Bearer json-auth","access_token":"json-access","refreshToken":"json-refresh","client_secret":"json-client","password":"json-password","streamKey":"json-stream","private_key":"json-private","token":"json-token","secret":"json-secret","senha":"json-senha"} "#,
            "mail pessoa@example.com url https://user:pass@example.com/live/key?q=token#x ",
            "win C:\\Users\\Petro\\secret.txt unix /home/petro/.config/key"
        );
        let safe = redact_text(raw);
        for forbidden in [
            "hunter2",
            "eyJhbGci",
            "pessoa@example.com",
            "Petro",
            "/home/petro",
            "user:pass",
            "q=token",
            "json-auth",
            "json-access",
            "json-refresh",
            "json-client",
            "json-password",
            "json-stream",
            "json-private",
            "json-token",
            "json-secret",
            "json-senha",
        ] {
            assert!(!safe.contains(forbidden), "leaked {forbidden}: {safe}");
        }
        assert!(safe.contains("<redacted>"));
        assert!(safe.contains("<local-path>"));
    }

    #[test]
    fn structured_json_secret_values_are_replaced_regardless_of_type() {
        let safe = sanitize_value(
            serde_json::json!({
                "Authorization": "Bearer secret",
                "accessToken": "access",
                "refresh_token": "refresh",
                "clientSecret": {"nested": "must-not-survive"},
                "password": 1234,
                "stream-key": ["stream-secret"],
                "private_key": "private-secret",
                "token": "generic-token",
                "secret": "generic-secret",
                "senha": "senha-secret",
                "safe": "kept"
            }),
            0,
            256,
        );
        for key in [
            "Authorization",
            "accessToken",
            "refresh_token",
            "clientSecret",
            "password",
            "stream-key",
            "private_key",
            "token",
            "secret",
            "senha",
        ] {
            assert_eq!(safe[key], Value::String("<redacted>".into()));
        }
        assert_eq!(safe["safe"], "kept");
        let serialized = serde_json::to_string(&safe).unwrap();
        assert!(!serialized.contains("must-not-survive"));
        assert!(!serialized.contains("stream-secret"));
    }

    #[test]
    fn error_code_catalog_rejects_arbitrary_tokens() {
        assert_eq!(
            normalize_error_code("ffmpeg_spawn_failed"),
            "ffmpeg_spawn_failed"
        );
        assert_eq!(
            normalize_error_code("valid_but_not_catalogued"),
            "unknown_error"
        );
        assert_eq!(
            normalize_error_code("mensagem com segredo"),
            "unknown_error"
        );
    }

    #[test]
    fn embedded_build_configuration_is_consistent() {
        let token = option_env!("POSTHOG_DESKTOP_TOKEN").map(str::trim);
        let host = option_env!("POSTHOG_HOST").map(str::trim);
        if let Some(token) = token.filter(|t| !t.is_empty()) {
            assert!(
                valid_posthog_token(token),
                "embedded POSTHOG_DESKTOP_TOKEN is not a public phc_ project token"
            );
        }
        if let Some(host) = host.filter(|h| !h.is_empty()) {
            assert!(
                valid_posthog_host(host.trim_end_matches('/'), cfg!(debug_assertions)),
                "embedded POSTHOG_HOST is not an accepted origin"
            );
        }
        let has_token = posthog_token().is_some();
        let has_host = posthog_host().is_some();
        assert_eq!(
            has_token, has_host,
            "token and host must both be present or both absent; \
             a partial configuration silently leaves the client in no-op mode"
        );
    }

    #[test]
    fn explicit_frame_overrides_track_caller() {
        let caller = std::panic::Location::caller();
        assert_eq!(
            top_app_frame_from(Some("chat.rs:1234"), caller),
            "chat.rs:1234"
        );
        for empty in [Some(""), Some("   "), None] {
            let resolved = top_app_frame_from(empty, caller);
            assert!(
                resolved.starts_with("telemetry.rs:"),
                "expected the caller's file, received {resolved}"
            );
        }
        assert!(!top_app_frame_from(None, caller).contains(['/', '\\']));
    }

    #[test]
    fn sdk_configuration_rejects_personal_keys_and_non_origin_hosts() {
        assert!(valid_posthog_token("phc_abcdefgh"));
        assert!(!valid_posthog_token("phx_abcdefgh"));
        assert!(!valid_posthog_token("anything"));
        assert!(valid_posthog_host("https://us.i.posthog.com", false));
        assert!(!valid_posthog_host("https://evil.example/path", false));
        assert!(!valid_posthog_host("https://user@evil.example", false));
        assert!(!valid_posthog_host("http://evil.example", true));
        assert!(valid_posthog_host("http://127.0.0.1:8080", true));
        assert!(!valid_posthog_host("https://example.com:0", false));
        assert!(!valid_posthog_host("https://example.com:65536", false));
        assert!(!valid_posthog_host("https://-invalid.example", false));
    }

    #[test]
    fn minimal_startup_context_excludes_system_dimensions() {
        let mut properties = Map::new();
        add_minimal_context(&mut properties);
        for required in [
            "telemetry_schema_version",
            "surface",
            "environment",
            "app_version",
            "build_sha",
        ] {
            assert!(properties.contains_key(required));
        }
        assert!(!properties.contains_key("locale"));
        assert!(!properties.contains_key("os_family"));
        assert!(!properties.contains_key("arch"));
    }

    #[test]
    fn repeated_error_reuses_searchable_error_id() {
        let runtime = TelemetryRuntime::default();
        let first = runtime.capture_error(
            AppError::new("ffmpeg_spawn_failed", "encoder", true, None),
            None,
            true,
            "error",
        );
        let second = runtime.capture_error(
            AppError::new("ffmpeg_spawn_failed", "encoder", true, None),
            None,
            true,
            "error",
        );
        assert_eq!(first, second);
    }

    #[test]
    fn unknown_event_and_property_are_rejected() {
        let runtime = TelemetryRuntime::default();
        assert!(runtime.capture("made_up", Map::new()).is_err());
        let mut props = Map::new();
        props.insert("stream_title".into(), Value::String("segredo".into()));
        assert!(runtime.capture("live_start_requested", props).is_err());
    }

    #[test]
    fn recursive_sanitizer_limits_depth_and_array_size() {
        let deep = serde_json::json!({
            "a": {"b": {"c": {"d": {"e": {"secret": "password=abc"}}}}},
            "items": (0..100).collect::<Vec<_>>()
        });
        let safe = sanitize_value(deep, 0, 64);
        assert!(serde_json::to_string(&safe)
            .unwrap()
            .contains("<truncated>"));
        assert_eq!(safe["items"].as_array().unwrap().len(), MAX_ARRAY_ITEMS);
    }

    #[test]
    fn ring_buffer_is_bounded_and_contains_only_structured_ids() {
        let runtime = TelemetryRuntime::default();
        for index in 0..150 {
            runtime.record_diagnostic(
                if index % 2 == 0 {
                    "diagnostics_write_failed"
                } else {
                    "unknown_error"
                },
                "native",
                Some("not-an-id"),
                None,
                None,
            );
        }
        let events = runtime.diagnostic_events();
        assert_eq!(events.len(), RING_CAPACITY);
        assert_eq!(events.first().unwrap().code, "diagnostics_write_failed");
        assert!(events.iter().all(|event| event.operation_id.is_none()));
    }

    #[test]
    fn target_transitions_are_relevant_deduplicated_and_structured() {
        let runtime = TelemetryRuntime::default();
        let operation_id = new_id();
        runtime.capture_target_transition(
            Some(&operation_id),
            "youtube",
            "connecting",
            "live",
            None,
        );
        runtime.capture_target_transition(Some(&operation_id), "youtube", "live", "live", None);
        runtime.capture_target_transition(Some(&operation_id), "youtube", "live", "waiting", None);
        runtime.capture_target_transition(
            Some(&operation_id),
            "youtube",
            "live",
            "signal-lost",
            Some("signal_lost"),
        );
        let events = runtime.diagnostic_events();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].code, "none");
        assert_eq!(events[1].code, "signal_lost");
        assert!(events
            .iter()
            .all(|event| event.operation_id.as_deref() == Some(operation_id.as_str())));
    }

    #[test]
    fn diagnostic_summary_omits_names_urls_titles_and_paths() {
        let mut config = AppConfig::default();
        config.settings.stream_title = "Meu nome real".into();
        config.settings.record_video_dir = r"C:\Users\Pessoa\Videos".into();
        config.settings.guardian_watchlist = vec!["segredo".into()];
        let text = serde_json::to_string(&diagnostic_config_summary(&config)).unwrap();
        assert!(!text.contains("Meu nome real"));
        assert!(!text.contains("Pessoa"));
        assert!(!text.contains("segredo"));
        assert!(!text.contains("record_video_dir"));
    }

    #[test]
    fn duration_and_reconnect_buckets_are_deterministic() {
        assert_eq!(duration_bucket(Duration::from_millis(999)), "lt_1s");
        assert_eq!(duration_bucket(Duration::from_secs(10)), "10_30s");
        assert_eq!(duration_bucket(Duration::from_secs(7_200)), "gte_120m");
        assert_eq!(reconnect_bucket(0), "0");
        assert_eq!(reconnect_bucket(4), "4_10");
        assert_eq!(reconnect_bucket(11), "gte_11");
    }

    #[test]
    fn contained_panic_scope_clears_during_unwind() {
        let previous = std::panic::take_hook();
        std::panic::set_hook(Box::new(|_| {}));

        assert!(!panic_is_contained());
        let result = std::panic::catch_unwind(|| {
            let _contained = ContainedPanicScope::enter();
            assert!(panic_is_contained(), "panic is contained inside the scope");
            panic!("synthetic panic");
        });

        std::panic::set_hook(previous);
        assert!(result.is_err(), "catch_unwind contained the panic");
        assert!(!panic_is_contained(), "the flag must not survive unwind");
    }
}
