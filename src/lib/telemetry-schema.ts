/**
 * Contrato de telemetria do desktop.
 *
 * Este arquivo e o equivalente Rust devem evoluir juntos. O frontend nunca
 * envia objetos livres: cada evento passa por esta allowlist antes de chegar
 * ao SDK e novamente no `before_send`.
 */

export const TELEMETRY_SCHEMA_VERSION = 1;
// Gêmeo do `NOTICE_VERSION` em src-tauri/src/telemetry.rs — os dois sobem juntos.
export const TELEMETRY_NOTICE_VERSION = "2026-08-02";

export type TelemetryChoice = "unset" | "enabled" | "disabled";

export interface TelemetryStatus {
  schemaVersion: number;
  noticeVersion: string;
  usage: TelemetryChoice;
  crashReports: TelemetryChoice;
  installationId: string | null;
  decidedAt: string | null;
}

export const EMPTY_TELEMETRY_STATUS: TelemetryStatus = {
  schemaVersion: TELEMETRY_SCHEMA_VERSION,
  noticeVersion: TELEMETRY_NOTICE_VERSION,
  usage: "unset",
  crashReports: "unset",
  installationId: null,
  decidedAt: null,
};

const TELEMETRY_CHOICES = new Set<TelemetryChoice>([
  "unset",
  "enabled",
  "disabled",
]);

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

/** Dados inválidos vindos do backend não liberam coleta por acidente. */
export function normalizeTelemetryStatus(value: unknown): TelemetryStatus {
  if (!value || typeof value !== "object") return EMPTY_TELEMETRY_STATUS;
  const raw = value as Partial<TelemetryStatus>;
  if (raw.schemaVersion !== TELEMETRY_SCHEMA_VERSION) {
    return {
      ...EMPTY_TELEMETRY_STATUS,
      // Um formato desconhecido nunca reaproveita uma decisão antiga. Manter a
      // versão do aviso vazia também obriga a UI a apresentar o aviso atual.
      noticeVersion: "",
    };
  }
  const usage = TELEMETRY_CHOICES.has(raw.usage as TelemetryChoice)
    ? (raw.usage as TelemetryChoice)
    : "unset";
  const crashReports = TELEMETRY_CHOICES.has(
    raw.crashReports as TelemetryChoice,
  )
    ? (raw.crashReports as TelemetryChoice)
    : "unset";

  return {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    noticeVersion:
      typeof raw.noticeVersion === "string"
        ? raw.noticeVersion.slice(0, 32)
        : "",
    usage,
    crashReports,
    installationId: isUuid(raw.installationId) ? raw.installationId : null,
    decidedAt:
      typeof raw.decidedAt === "string" && raw.decidedAt.length <= 40
        ? raw.decidedAt
        : null,
  };
}

/** A finalidade está valendo?
 *
 *  `unset` conta como ATIVA. A base legal das duas é o legítimo interesse (LGPD
 *  art. 7º, IX), não o consentimento: o tratamento começa informado e para quando
 *  a pessoa se opõe. `disabled` é a oposição registrada (art. 18, §2) e vence
 *  sempre — inclusive quando o texto do aviso muda de versão, porque reapresentar
 *  o aviso não pode religar quem já disse não.
 *
 *  Gêmeo do `Consent::active` em `src-tauri/src/telemetry.rs`.
 *  Ver `docs/LGPD-LEGITIMO-INTERESSE-TELEMETRIA.md`. */
export const telemetryPurposeActive = (choice: TelemetryChoice): boolean =>
  choice !== "disabled";

/** Mostrar o aviso? Diferente de "pode enviar": o aviso reaparece quando o texto
 *  muda de versão, mas o envio segue pela oposição, não pela versão. */
export function needsTelemetryDecision(status: TelemetryStatus): boolean {
  return (
    status.noticeVersion !== TELEMETRY_NOTICE_VERSION ||
    status.usage === "unset" ||
    status.crashReports === "unset"
  );
}

/** Estado dos interruptores quando o aviso abre — espelha o que JÁ está valendo,
 *  senão a tela mostraria desligado enquanto o app envia. */
export function telemetryConsentDraft(status: TelemetryStatus): {
  usage: boolean;
  crashReports: boolean;
} {
  return {
    usage: telemetryPurposeActive(status.usage),
    crashReports: telemetryPurposeActive(status.crashReports),
  };
}

export type DurationBucket =
  | "lt_1s"
  | "1_3s"
  | "3_10s"
  | "10_30s"
  | "30_60s"
  | "1_5m"
  | "5_30m"
  | "30_120m"
  | "gte_120m";

export function durationBucket(milliseconds: number): DurationBucket {
  const seconds =
    Math.max(0, Number.isFinite(milliseconds) ? milliseconds : 0) / 1000;
  if (seconds < 1) return "lt_1s";
  if (seconds < 3) return "1_3s";
  if (seconds < 10) return "3_10s";
  if (seconds < 30) return "10_30s";
  if (seconds < 60) return "30_60s";
  if (seconds < 300) return "1_5m";
  if (seconds < 1800) return "5_30m";
  if (seconds < 7200) return "30_120m";
  return "gte_120m";
}

export type CountBucket = "0" | "1" | "2_3" | "4_10" | "gte_11";

export function countBucket(value: number): CountBucket {
  const count = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  if (count === 0) return "0";
  if (count === 1) return "1";
  if (count <= 3) return "2_3";
  if (count <= 10) return "4_10";
  return "gte_11";
}

export type ResolutionBucket =
  "unknown" | "sd" | "hd" | "full_hd" | "quad_hd" | "uhd_or_more";

export function resolutionBucket(
  width: number,
  height: number,
): ResolutionBucket {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    return "unknown";
  const longSide = Math.max(width, height);
  if (longSide < 1280) return "sd";
  if (longSide < 1920) return "hd";
  if (longSide < 2560) return "full_hd";
  if (longSide < 3840) return "quad_hd";
  return "uhd_or_more";
}

export type FpsBucket =
  "unknown" | "lte_24" | "25_30" | "31_50" | "51_60" | "gt_60";

export function fpsBucket(value: number): FpsBucket {
  if (!Number.isFinite(value) || value <= 0) return "unknown";
  if (value <= 24) return "lte_24";
  if (value <= 30) return "25_30";
  if (value <= 50) return "31_50";
  if (value <= 60) return "51_60";
  return "gt_60";
}

export type ScreenId =
  | "platforms"
  | "encoding"
  | "golive"
  | "chat"
  | "mesa"
  | "reports"
  | "settings"
  | "about"
  | "chat_popout";

export type SafePlatform =
  | "twitch"
  | "youtube"
  | "facebook"
  | "kick"
  | "tiktok"
  | "x"
  | "instagram"
  | "custom";

export type SafeTargetState =
  | "idle"
  | "connecting"
  | "live"
  | "reconnecting"
  | "error"
  | "paused"
  | "waiting"
  | "signal-lost"
  | "auth-error"
  | "brb"
  | "censor"
  | "stopped";

export const TELEMETRY_STAGES = [
  "config",
  "obs",
  "mediamtx",
  "compositor",
  "encoder",
  "network",
  "target",
  "recording",
  "oauth",
  "shutdown",
  "native",
  "frontend",
  "update",
  "diagnostics",
  "app_render",
  "screen_render",
  "chat_render",
  "window_error",
  "promise_rejection",
  "obs_check",
  "ui_pre_command",
  "engine_start",
  "engine_stop",
  "update_install",
] as const;
export type TelemetryStage = (typeof TELEMETRY_STAGES)[number];
const TELEMETRY_STAGE_SET: ReadonlySet<string> = new Set(TELEMETRY_STAGES);

export function isTelemetryStage(value: unknown): value is TelemetryStage {
  return typeof value === "string" && TELEMETRY_STAGE_SET.has(value);
}

export const TELEMETRY_ERROR_CODES = [
  "none",
  "unknown_error",
  "native_panic",
  "start_cancelled",
  "engine_error",
  "timeout",
  "auth_failed",
  "network_unavailable",
  "obs_unavailable",
  "wrong_destination",
  "obs_check_failed",
  "target_error",
  "engine_start_failed",
  "ffmpeg_spawn_failed",
  "ingest_port_in_use",
  "mediamtx_config_path_failed",
  "mediamtx_config_write_failed",
  "mediamtx_sidecar_missing",
  "mediamtx_spawn_failed",
  "mediamtx_died",
  "obs_start_failed",
  "obs_stop_failed",
  "obs_stream_task_failed",
  "obs_check_task_failed",
  "compositor_ffmpeg_missing",
  "compositor_encoder_died",
  "compositor_setup_failed",
  "recording_disk_low",
  "recording_ffmpeg_spawn_failed",
  "recording_gave_up",
  "splicer_task_failed",
  "splicer_setup_fallback",
  "youtube_auto_provision_failed",
  "oauth_broker_failed",
  "oauth_refresh_failed",
  "setup_bootstrap_failed",
  "diagnostics_write_failed",
  "target_auth_error",
  "signal_lost",
  "update_install_failed",
  "app_render_failed",
  "screen_render_failed",
  "chat_render_failed",
  "unhandled_error",
  "unhandled_rejection",
  "app_started",
  "app_closed",
  "screen_viewed",
  "onboarding_started",
  "onboarding_step_completed",
  "onboarding_completed",
  "obs_check_completed",
  "live_start_requested",
  "live_start_completed",
  "live_start_failed",
  "target_state_changed",
  "live_ended",
  "diagnostics_exported",
  "update_completed",
] as const;
export type TelemetryErrorCode = (typeof TELEMETRY_ERROR_CODES)[number];
const TELEMETRY_ERROR_CODE_SET: ReadonlySet<string> = new Set(
  TELEMETRY_ERROR_CODES,
);

export function isTelemetryErrorCode(
  value: unknown,
): value is TelemetryErrorCode {
  return typeof value === "string" && TELEMETRY_ERROR_CODE_SET.has(value);
}

export type TelemetryEventMap = {
  app_started: {
    previous_exit: "clean" | "unclean" | "unknown";
    startup_duration_bucket: DurationBucket;
  };
  app_closed: {
    uptime_bucket: DurationBucket;
    live_was_active: boolean;
  };
  screen_viewed: { screen_id: ScreenId };
  onboarding_started: { entry_point: "first_run" | "replay" };
  onboarding_step_completed: {
    step_id: "welcome" | "platforms" | "obs" | "golive" | "chat_reports";
  };
  onboarding_completed: { duration_bucket: DurationBucket };
  obs_check_completed: {
    outcome: "ok" | "not_reachable" | "wrong_destination" | "error";
    error_code: TelemetryErrorCode;
    resolution_bucket: ResolutionBucket;
    fps_bucket: FpsBucket;
  };
  live_start_requested: {
    operation_id: string;
    mode: "per-platform" | "passthrough" | "hybrid";
    target_count: number;
    platforms: SafePlatform[];
    brb_enabled: boolean;
    guardian_enabled: boolean;
    record_video_enabled: boolean;
  };
  live_start_completed: {
    operation_id: string;
    duration_bucket: DurationBucket;
    encoder_kind:
      | "auto"
      | "nvenc"
      | "qsv"
      | "amf"
      | "videotoolbox"
      | "software"
      | "copy"
      | "mixed"
      | "unknown";
  };
  live_start_failed: {
    operation_id: string;
    stage: TelemetryStage;
    error_code: TelemetryErrorCode;
    cancelled: boolean;
  };
  target_state_changed: {
    operation_id: string;
    platform: SafePlatform;
    from: SafeTargetState;
    to: SafeTargetState;
    error_code: TelemetryErrorCode;
  };
  live_ended: {
    operation_id: string;
    reason:
      "user" | "cancelled" | "engine_error" | "engine_stopped" | "app_exit";
    duration_bucket: DurationBucket;
    reconnect_count_bucket: CountBucket;
  };
  diagnostics_exported: { outcome: "saved" | "cancelled" | "failed" };
  update_completed: {
    from_version: string;
    to_version: string;
    outcome: "installed" | "failed";
    error_code: TelemetryErrorCode;
  };
};

export type TelemetryEventName = keyof TelemetryEventMap;
export type TelemetryProperties = Record<
  string,
  string | number | boolean | string[]
>;

export interface TelemetryContext {
  telemetry_schema_version: number;
  surface: "desktop_ui";
  environment: "development" | "staging" | "production";
  app_version: string;
  build_sha: string;
  locale: "pt-BR" | "en";
  os_family: "windows" | "macos" | "linux" | "other";
}

export interface TelemetryExceptionContext {
  handled: boolean;
  severity: "error" | "fatal";
  error_code: TelemetryErrorCode;
  stage: TelemetryStage;
  operation_id?: string;
  screen_id?: ScreenId;
  component_stack?: string;
}

const EVENT_KEYS: Record<TelemetryEventName, readonly string[]> = {
  app_started: ["previous_exit", "startup_duration_bucket"],
  app_closed: ["uptime_bucket", "live_was_active"],
  screen_viewed: ["screen_id"],
  onboarding_started: ["entry_point"],
  onboarding_step_completed: ["step_id"],
  onboarding_completed: ["duration_bucket"],
  obs_check_completed: [
    "outcome",
    "error_code",
    "resolution_bucket",
    "fps_bucket",
  ],
  live_start_requested: [
    "operation_id",
    "mode",
    "target_count",
    "platforms",
    "brb_enabled",
    "guardian_enabled",
    "record_video_enabled",
  ],
  live_start_completed: ["operation_id", "duration_bucket", "encoder_kind"],
  live_start_failed: ["operation_id", "stage", "error_code", "cancelled"],
  target_state_changed: [
    "operation_id",
    "platform",
    "from",
    "to",
    "error_code",
  ],
  live_ended: [
    "operation_id",
    "reason",
    "duration_bucket",
    "reconnect_count_bucket",
  ],
  diagnostics_exported: ["outcome"],
  update_completed: ["from_version", "to_version", "outcome", "error_code"],
};

const COMMON_KEYS = new Set<keyof TelemetryContext>([
  "telemetry_schema_version",
  "surface",
  "environment",
  "app_version",
  "build_sha",
  "locale",
  "os_family",
]);

const ERROR_KEYS = new Set([
  "error_id",
  "handled",
  "severity",
  "error_code",
  "stage",
  "operation_id",
  "screen_id",
  "component_stack",
  "$exception_fingerprint",
  "$release_id",
]);

const EXCEPTION_STEP_NAMES = new Set([
  "app_ready",
  "screen_opened",
  "onboarding_advanced",
  "obs_check_started",
  "live_start_requested",
  "live_became_active",
  "live_stop_requested",
  "diagnostics_export_requested",
  "update_install_requested",
]);

const INTERNAL_GUARD = "corneta_schema_guard";
export const TELEMETRY_GUARD_VALUE = "corneta-v1";

const ENUMS: Record<string, ReadonlySet<string>> = {
  previous_exit: new Set(["clean", "unclean", "unknown"]),
  startup_duration_bucket: new Set([
    "lt_1s",
    "1_3s",
    "3_10s",
    "10_30s",
    "30_60s",
    "1_5m",
    "5_30m",
    "30_120m",
    "gte_120m",
  ]),
  uptime_bucket: new Set([
    "lt_1s",
    "1_3s",
    "3_10s",
    "10_30s",
    "30_60s",
    "1_5m",
    "5_30m",
    "30_120m",
    "gte_120m",
  ]),
  duration_bucket: new Set([
    "lt_1s",
    "1_3s",
    "3_10s",
    "10_30s",
    "30_60s",
    "1_5m",
    "5_30m",
    "30_120m",
    "gte_120m",
  ]),
  reconnect_count_bucket: new Set(["0", "1", "2_3", "4_10", "gte_11"]),
  screen_id: new Set([
    "platforms",
    "encoding",
    "golive",
    "chat",
    "mesa",
    "reports",
    "settings",
    "about",
    "chat_popout",
  ]),
  entry_point: new Set(["first_run", "replay"]),
  step_id: new Set(["welcome", "platforms", "obs", "golive", "chat_reports"]),
  outcome: new Set([
    "ok",
    "not_reachable",
    "wrong_destination",
    "error",
    "saved",
    "cancelled",
    "failed",
    "installed",
  ]),
  resolution_bucket: new Set([
    "unknown",
    "sd",
    "hd",
    "full_hd",
    "quad_hd",
    "uhd_or_more",
  ]),
  fps_bucket: new Set([
    "unknown",
    "lte_24",
    "25_30",
    "31_50",
    "51_60",
    "gt_60",
  ]),
  mode: new Set(["per-platform", "passthrough", "hybrid"]),
  encoder_kind: new Set([
    "auto",
    "nvenc",
    "qsv",
    "amf",
    "videotoolbox",
    "software",
    "copy",
    "mixed",
    "unknown",
  ]),
  platform: new Set([
    "twitch",
    "youtube",
    "facebook",
    "kick",
    "tiktok",
    "x",
    "instagram",
    "custom",
  ]),
  from: new Set([
    "idle",
    "connecting",
    "live",
    "reconnecting",
    "error",
    "paused",
    "waiting",
    "signal-lost",
    "auth-error",
    "brb",
    "censor",
    "stopped",
  ]),
  to: new Set([
    "idle",
    "connecting",
    "live",
    "reconnecting",
    "error",
    "paused",
    "waiting",
    "signal-lost",
    "auth-error",
    "brb",
    "censor",
    "stopped",
  ]),
  reason: new Set([
    "user",
    "cancelled",
    "engine_error",
    "engine_stopped",
    "app_exit",
  ]),
  severity: new Set(["error", "fatal"]),
  surface: new Set(["desktop_ui"]),
  environment: new Set(["development", "staging", "production"]),
  locale: new Set(["pt-BR", "en"]),
  os_family: new Set(["windows", "macos", "linux", "other"]),
  stage: TELEMETRY_STAGE_SET,
  error_code: TELEMETRY_ERROR_CODE_SET,
};

const SAFE_CODE = /^[a-z][a-z0-9_-]{0,63}$/;
const SAFE_VERSION = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/;

function validProperty(key: string, value: unknown): boolean {
  if (ENUMS[key]) return typeof value === "string" && ENUMS[key].has(value);
  if (
    key === "operation_id" ||
    key === "error_id" ||
    key === "distinct_id" ||
    key === "$device_id" ||
    key === "$session_id"
  )
    return isUuid(value);
  if (key === "target_count")
    return (
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= 32
    );
  if (
    key === "live_was_active" ||
    key === "cancelled" ||
    key === "handled" ||
    key === "brb_enabled" ||
    key === "guardian_enabled" ||
    key === "record_video_enabled"
  )
    return typeof value === "boolean";
  if (key === "telemetry_schema_version")
    return value === TELEMETRY_SCHEMA_VERSION;
  if (key === "platforms")
    return (
      Array.isArray(value) &&
      value.length <= 8 &&
      value.every((item) => ENUMS.platform.has(String(item)))
    );
  if (key === "app_version" || key === "from_version" || key === "to_version")
    return typeof value === "string" && SAFE_VERSION.test(value);
  if (key === "build_sha")
    return typeof value === "string" && /^[0-9a-f]{0,40}$/i.test(value);
  if (key === "component_stack")
    return typeof value === "string" && value.length <= 4_000;
  if (key === "$exception_fingerprint")
    return (
      (typeof value === "string" && SAFE_CODE.test(value)) ||
      (Array.isArray(value) &&
        value.length <= 4 &&
        value.every((item) => typeof item === "string" && SAFE_CODE.test(item)))
    );
  if (key === "$release_id")
    return typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value);
  return false;
}

function validEventProperty(
  event: TelemetryEventName,
  key: string,
  value: unknown,
): boolean {
  if (key === "outcome") {
    if (typeof value !== "string") return false;
    if (event === "obs_check_completed")
      return ["ok", "not_reachable", "wrong_destination", "error"].includes(
        value,
      );
    if (event === "diagnostics_exported")
      return ["saved", "cancelled", "failed"].includes(value);
    if (event === "update_completed")
      return ["installed", "failed"].includes(value);
    return false;
  }
  return validProperty(key, value);
}

const SECRET_ASSIGNMENT =
  /["']?\b(client[_-]?secret|access[_-]?token|refresh[_-]?token|stream[_-]?key|api[_-]?key|private[_-]?key|password|senha|cookie|token|secret)\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi;
const AUTHORIZATION = /\bAuthorization\b\s*[:=]\s*[^\r\n,;]+/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const FILE_URL = /file:\/{2,3}[^\s)\]}>,]+/gi;
const WINDOWS_PATH = /\b[A-Za-z]:\\(?:[^\s\\/:*?"<>|]+\\)*[^\s\\/:*?"<>|]*/g;
const UNIX_PATH =
  /(^|[\s("'])\/(?:Users|home|var|tmp|opt|mnt|run|private)\/[^\s)\]}>,"']+/g;
const URL_LIKE = /https?:\/\/[^\s)\]}>,"']+/gi;

function redactUrl(raw: string): string {
  // Preserva somente frames do bundle local, incluindo :linha:coluna. É o
  // mínimo necessário para casar o frame com o source map enviado no CI;
  // URLs externas/configuráveis continuam opacas.
  if (
    /^https?:\/\/(?:localhost|127\.0\.0\.1|tauri\.localhost)(?::\d+)?\/(?:assets|src)\/[A-Za-z0-9._/-]+(?::\d+){0,2}$/i.test(
      raw,
    )
  )
    return raw;
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    const localApp =
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      (/^\/assets\/[A-Za-z0-9._/-]+$/.test(url.pathname) ||
        /^\/src\/[A-Za-z0-9._/-]+$/.test(url.pathname));
    return localApp ? url.toString() : `${url.origin}/<redacted>`;
  } catch {
    return "<redacted-url>";
  }
}

/** Redige uma cópia; nunca altera a mensagem/erro original mostrado localmente. */
export function redactTelemetryText(value: string, maxLength = 1_000): string {
  const redacted = value
    .replace(AUTHORIZATION, "Authorization=<redacted>")
    .replace(BEARER, "Bearer <redacted>")
    .replace(SECRET_ASSIGNMENT, (_match, key: string) => `${key}=<redacted>`)
    .replace(JWT, "<redacted-jwt>")
    .replace(FILE_URL, "<local-path>")
    .replace(URL_LIKE, (url) => redactUrl(url))
    .replace(WINDOWS_PATH, "<local-path>")
    .replace(UNIX_PATH, "$1<local-path>")
    .replace(EMAIL, "<redacted-email>");
  return redacted.length <= maxLength
    ? redacted
    : `${redacted.slice(0, Math.max(0, maxLength - 12))}<truncated>`;
}

export const REMOTE_DESKTOP_ERROR_MESSAGE = "Unexpected desktop UI error";

const SAFE_EXCEPTION_NAMES: ReadonlySet<string> = new Set([
  "AbortError",
  "AggregateError",
  "DataCloneError",
  "EncodingError",
  "Error",
  "EvalError",
  "IndexSizeError",
  "InvalidAccessError",
  "InvalidCharacterError",
  "InvalidModificationError",
  "InvalidStateError",
  "NetworkError",
  "NotAllowedError",
  "NotFoundError",
  "NotReadableError",
  "NotSupportedError",
  "OperationError",
  "QuotaExceededError",
  "RangeError",
  "ReferenceError",
  "SecurityError",
  "SyntaxError",
  "TimeoutError",
  "TypeError",
  "URIError",
]);
const LOCAL_APP_STACK_LOCATION =
  /(?:https?|tauri):\/\/(?:localhost|127\.0\.0\.1|tauri\.localhost)(?::\d+)?\/(?:assets|src)\/[A-Za-z0-9._/-]+:\d+:\d+/gi;

/** Nomes de exceção são dimensão técnica; títulos/mensagens livres não entram. */
export function normalizeTelemetryExceptionName(value: unknown): string {
  return typeof value === "string" && SAFE_EXCEPTION_NAMES.has(value)
    ? value
    : "Error";
}

/**
 * Reconstrói o stack apenas com locais do bundle que podem casar com source
 * maps. A primeira linha original contém `Error.message` e nunca é copiada.
 */
export function sanitizeTelemetryExceptionStack(
  value: unknown,
  name: unknown,
): string {
  const safeName = normalizeTelemetryExceptionName(name);
  const locations =
    typeof value === "string"
      ? (value.slice(0, 16_384).match(LOCAL_APP_STACK_LOCATION) ?? [])
      : [];
  const frames = [...new Set(locations)].slice(0, 60);
  return [
    `${safeName}: ${REMOTE_DESKTOP_ERROR_MESSAGE}`,
    ...frames.map((location) => `    at ${redactTelemetryText(location, 500)}`),
  ].join("\n");
}

/** Normaliza frases variáveis em uma dimensão pequena e estável. */
export function normalizeErrorCode(
  error: unknown,
  fallback: TelemetryErrorCode = "unknown_error",
): TelemetryErrorCode {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const lower = message.toLowerCase();
  if (lower.includes("corneta:start-cancelled")) return "start_cancelled";
  if (lower.includes("timeout") || lower.includes("timed out"))
    return "timeout";
  if (
    lower.includes("auth") ||
    lower.includes("senha") ||
    lower.includes("401")
  )
    return "auth_failed";
  if (
    lower.includes("network") ||
    lower.includes("offline") ||
    lower.includes("internet")
  )
    return "network_unavailable";
  if (lower.includes("obs")) return "obs_unavailable";
  return isTelemetryErrorCode(fallback) ? fallback : "unknown_error";
}

export function createTelemetryId(): string {
  return crypto.randomUUID();
}

function eventName(value: string): value is TelemetryEventName {
  return Object.prototype.hasOwnProperty.call(EVENT_KEYS, value);
}

/** Valida propriedades fornecidas pelo app antes de chamar o SDK. */
export function sanitizeTelemetryProperties(
  event: TelemetryEventName,
  properties: Record<string, unknown>,
  context: TelemetryContext,
): TelemetryProperties | null {
  const allowed = new Set([...COMMON_KEYS, ...EVENT_KEYS[event]]);
  for (const key of Object.keys(properties)) {
    if (!allowed.has(key)) return null;
  }

  const merged: Record<string, unknown> = { ...context, ...properties };
  const safe: TelemetryProperties = {};
  for (const key of allowed) {
    if (
      !(key in merged) ||
      !(COMMON_KEYS.has(key as keyof TelemetryContext)
        ? validProperty(key, merged[key])
        : validEventProperty(event, key, merged[key]))
    )
      return null;
    const value = merged[key];
    safe[key] = Array.isArray(value)
      ? value.map(String)
      : (value as string | number | boolean);
  }
  safe[INTERNAL_GUARD] = TELEMETRY_GUARD_VALUE;
  return JSON.stringify(safe).length <= 16_384 ? safe : null;
}

export function sanitizeExceptionProperties(
  properties: TelemetryExceptionContext & {
    error_id: string;
    $exception_fingerprint: string;
  },
  context: TelemetryContext,
): TelemetryProperties | null {
  const safe: TelemetryProperties = {};
  for (const [key, value] of Object.entries({ ...context, ...properties })) {
    if (!COMMON_KEYS.has(key as keyof TelemetryContext) && !ERROR_KEYS.has(key))
      return null;
    if (
      value === undefined &&
      ["operation_id", "screen_id", "component_stack"].includes(key)
    )
      continue;
    const redacted =
      key === "component_stack" && typeof value === "string"
        ? redactTelemetryText(value, 4_000)
        : value;
    if (!validProperty(key, redacted)) return null;
    safe[key] = redacted as string | number | boolean | string[];
  }
  for (const key of [
    ...COMMON_KEYS,
    "handled",
    "severity",
    "error_code",
    "stage",
    "error_id",
    "$exception_fingerprint",
  ]) {
    if (!(key in safe)) return null;
  }
  safe[INTERNAL_GUARD] = TELEMETRY_GUARD_VALUE;
  return JSON.stringify(safe).length <= 12_288 ? safe : null;
}

type UnknownRecord = Record<string, unknown>;

function redactExceptionFrame(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as UnknownRecord;
  const safe: UnknownRecord = {};
  for (const key of [
    "filename",
    "abs_path",
    "function",
    "module",
    "platform",
    "context_line",
  ]) {
    if (typeof raw[key] === "string")
      safe[key] = redactTelemetryText(
        raw[key] as string,
        key === "context_line" ? 240 : 500,
      );
  }
  for (const key of ["lineno", "colno"]) {
    if (typeof raw[key] === "number" && Number.isFinite(raw[key]))
      safe[key] = raw[key];
  }
  if (typeof raw.in_app === "boolean") safe.in_app = raw.in_app;
  return safe;
}

function redactStacktrace(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as UnknownRecord;
  if (!Array.isArray(raw.frames)) return null;
  return {
    frames: raw.frames
      .slice(-60)
      .map(redactExceptionFrame)
      .filter((frame): frame is UnknownRecord => frame !== null),
  };
}

export function redactExceptionList(value: unknown): UnknownRecord[] | null {
  if (!Array.isArray(value)) return null;
  const safe: UnknownRecord[] = [];
  for (const item of value.slice(0, 5)) {
    if (!item || typeof item !== "object") continue;
    const raw = item as UnknownRecord;
    const exception: UnknownRecord = {};
    const exceptionName = normalizeTelemetryExceptionName(
      raw.$exception_type ?? raw.type,
    );
    for (const key of ["$exception_type", "type"])
      if (typeof raw[key] === "string") exception[key] = exceptionName;
    for (const key of ["$exception_message", "$exception_value", "value"])
      if (typeof raw[key] === "string")
        exception[key] = REMOTE_DESKTOP_ERROR_MESSAGE;
    if (typeof raw.$exception_stack_trace_raw === "string")
      exception.$exception_stack_trace_raw = sanitizeTelemetryExceptionStack(
        raw.$exception_stack_trace_raw,
        exceptionName,
      );
    const stacktrace = redactStacktrace(raw.stacktrace);
    if (stacktrace) exception.stacktrace = stacktrace;
    if (raw.mechanism && typeof raw.mechanism === "object") {
      const mechanism = raw.mechanism as UnknownRecord;
      exception.mechanism = {
        handled:
          typeof mechanism.handled === "boolean" ? mechanism.handled : false,
        synthetic:
          typeof mechanism.synthetic === "boolean"
            ? mechanism.synthetic
            : false,
        type:
          typeof mechanism.type === "string"
            ? redactTelemetryText(mechanism.type, 80)
            : "generic",
      };
    }
    if (Object.keys(exception).length > 0) safe.push(exception);
  }
  return safe.length > 0 ? safe : null;
}

/** Mantém breadcrumbs úteis no issue sem aceitar mensagens ou argumentos livres. */
export function redactExceptionSteps(value: unknown): UnknownRecord[] | null {
  if (!Array.isArray(value)) return null;
  const safe: UnknownRecord[] = [];
  for (const item of value.slice(-20)) {
    if (!item || typeof item !== "object") continue;
    const raw = item as UnknownRecord;
    if (
      typeof raw.$message !== "string" ||
      !EXCEPTION_STEP_NAMES.has(raw.$message)
    )
      continue;
    const timestamp = raw.$timestamp;
    const validTimestamp =
      (typeof timestamp === "number" &&
        Number.isFinite(timestamp) &&
        timestamp >= 0) ||
      (typeof timestamp === "string" &&
        timestamp.length <= 40 &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(timestamp));
    if (!validTimestamp) continue;

    const step: UnknownRecord = {
      $message: raw.$message,
      $timestamp: timestamp,
    };
    for (const key of ["screen_id", "operation_id", "stage", "error_code"]) {
      if (raw[key] !== undefined && validProperty(key, raw[key]))
        step[key] = raw[key];
    }
    if (raw.outcome === "ok" || raw.outcome === "error")
      step.outcome = raw.outcome;
    safe.push(step);
  }
  return safe.length > 0 ? safe : null;
}

const TRANSPORT_KEYS = new Set([
  "token",
  "distinct_id",
  "$insert_id",
  "$lib",
  "$lib_version",
  "$process_person_profile",
]);

function safeTransportProperty(key: string, value: unknown): unknown {
  // `distinct_id` é o UUID visível/regenerável da instalação. IDs auxiliares
  // gerados pelo SDK (`$device_id`/`$session_id`) não atravessam a allowlist,
  // evitando uma segunda identidade que o titular não conseguiria consultar.
  if (key === "distinct_id") return isUuid(value) ? value : undefined;
  if (key === "$process_person_profile")
    return value === false ? false : undefined;
  if (key === "token")
    return typeof value === "string" && /^phc_[A-Za-z0-9_-]{8,}$/.test(value)
      ? value
      : undefined;
  if (key === "$insert_id")
    return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value)
      ? value
      : undefined;
  if (key === "$lib")
    return value === "web" || value === "js" ? value : undefined;
  if (key === "$lib_version")
    return typeof value === "string" && /^[0-9.]{1,24}$/.test(value)
      ? value
      : undefined;
  return undefined;
}

export interface PostHogLikeEvent {
  event: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Última barreira chamada pelo `before_send` do SDK. */
export function sanitizePostHogEvent(
  input: PostHogLikeEvent | null,
  context: TelemetryContext,
  usageEnabled: boolean,
  crashesEnabled: boolean,
): PostHogLikeEvent | null {
  if (!input?.properties) return null;
  const isException = input.event === "$exception";
  const catalogEvent = eventName(input.event) ? input.event : null;
  if ((isException && !crashesEnabled) || (!isException && !usageEnabled))
    return null;
  if (!isException && !catalogEvent) return null;
  if (input.properties[INTERNAL_GUARD] !== TELEMETRY_GUARD_VALUE) return null;

  const safe: Record<string, unknown> = {};
  if (isException) {
    for (const key of COMMON_KEYS) {
      const value = input.properties[key];
      if (!validProperty(key, value)) return null;
      safe[key] = value;
    }
    for (const key of ERROR_KEYS) {
      const value = input.properties[key];
      if (value === undefined) continue;
      const redacted =
        key === "component_stack" && typeof value === "string"
          ? redactTelemetryText(value, 4_000)
          : value;
      if (!validProperty(key, redacted)) return null;
      safe[key] = redacted;
    }
    for (const key of [
      "error_id",
      "handled",
      "severity",
      "error_code",
      "stage",
      "$exception_fingerprint",
    ]) {
      if (!(key in safe)) return null;
    }
    const list = redactExceptionList(input.properties.$exception_list);
    if (!list) return null;
    safe.$exception_list = list;
    const steps = redactExceptionSteps(input.properties.$exception_steps);
    if (steps) safe.$exception_steps = steps;
  } else {
    const picked: Record<string, unknown> = {};
    // `catalogEvent` foi validado acima; o ramo de exceção já saiu no outro lado.
    if (!catalogEvent) return null;
    for (const key of EVENT_KEYS[catalogEvent]) {
      if (key in input.properties) picked[key] = input.properties[key];
    }
    const validated = sanitizeTelemetryProperties(
      catalogEvent,
      picked,
      context,
    );
    if (!validated) return null;
    Object.assign(safe, validated);
  }

  delete safe[INTERNAL_GUARD];
  for (const key of TRANSPORT_KEYS) {
    const value = safeTransportProperty(key, input.properties[key]);
    if (value !== undefined) safe[key] = value;
  }
  // Reconstrói também o envelope: campos top-level acrescentados pelo SDK
  // não fazem parte do contrato e não atravessam esta última barreira.
  return JSON.stringify(safe).length <= 24_576
    ? { event: input.event, properties: safe }
    : null;
}
