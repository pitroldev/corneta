export const TELEMETRY_SCHEMA_VERSION = 1;

export const SITE_ROUTE_IDS = [
  "home",
  "privacy",
  "terms_of_use",
  "help_index",
  "help_category",
  "help_article",
  "guides_index",
  "guides_category",
  "guide_article",
  "search",
  "changelog",
  "not_found",
  "other",
] as const;
export type SiteRouteId = (typeof SITE_ROUTE_IDS)[number];

export const SITE_CTA_IDS = [
  "header_download",
  "hero_download",
  "faq_download",
  "final_download",
  "footer_download",
  "content_download",
  "content_related",
  "content_open_help",
  "content_open_guide",
  "home_guides",
  "home_help",
  "nav_guides",
  "nav_help",
  "footer_guides",
  "footer_help",
] as const;
export type SiteCtaId = (typeof SITE_CTA_IDS)[number];

export const API_ROUTE_IDS = [
  "bootstrap",
  "health",
  "kick_exchange",
  "kick_refresh",
  "site_render",
  "unknown",
] as const;
export type ApiRouteId = (typeof API_ROUTE_IDS)[number];

export const TELEMETRY_PROVIDERS = ["none", "kick"] as const;
export type TelemetryProvider = (typeof TELEMETRY_PROVIDERS)[number];

export const API_ERROR_CODES = [
  "BODY_TOO_LARGE",
  "INTERNAL_ERROR",
  "INVALID_JSON",
  "INVALID_PKCE",
  "INVALID_PROVIDER_RESPONSE",
  "INVALID_REDIRECT_URI",
  "INVALID_REQUEST",
  "OAUTH_NOT_CONFIGURED",
  "OAUTH_SESSION_EXPIRED",
  "PROVIDER_REJECTED_REQUEST",
  "PROVIDER_UNAVAILABLE",
  "RATE_LIMITED",
  "RATE_LIMIT_UNAVAILABLE",
  "UNEXPECTED_ERROR",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const TELEMETRY_EVENT_NAMES = [
  "site_page_viewed",
  "site_cta_clicked",
  "api_request_completed",
  "$exception",
] as const;
export type TelemetryEventName = (typeof TELEMETRY_EVENT_NAMES)[number];

export type TelemetryProperties = Record<string, unknown>;

type TelemetryMessage = {
  event?: unknown;
  properties?: unknown;
  distinctId?: unknown;
  disableGeoip?: unknown;
  timestamp?: unknown;
  uuid?: unknown;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUILD_SHA_RE = /^[0-9a-f]{7,64}$/i;
const CONTENT_ID_RE = /^(?:help|guide)_[a-z0-9]+(?:_[a-z0-9]+)*$/;
const SAFE_TOKEN_RE = /^[a-zA-Z0-9._:@/-]{1,128}$/;
const POSTHOG_PROJECT_TOKEN_RE = /^phc_[A-Za-z0-9_-]{8,}$/;
const REQUEST_DISTINCT_ID_RE =
  /^request:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SDK_TRANSPORT_PROPERTIES = new Set([
  "token",
  "distinct_id",
  "$cookieless_mode",
  "$process_person_profile",
  "$geoip_disable",
]);
const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const WINDOWS_PATH_RE =
  /(?:[A-Za-z]:\\|\\\\)[^\r\n\t<>|"']{2,}?(?=(?:\:\d+){0,2}(?:[\s),;\]]|$))/g;
const UNIX_PATH_RE =
  /\/(?:Users|home|root|tmp|private|app|workspace|var\/(?:folders|task))\/[^\r\n\t<>|"']+?(?=(?:\:\d+){0,2}(?:[\s),;\]]|$))/g;
const SECRET_ASSIGNMENT_RE =
  /["']?\b(authorization|client[_-]?secret|access[_-]?token|refresh[_-]?token|stream[_-]?key|api[_-]?key|private[_-]?key|password|passwd|senha|cookie|token|secret)\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi;
const SENSITIVE_KEY_RE =
  /(authorization|cookie|secret|password|passwd|token|stream.?key|request.?body|response.?body|chat|ocr|clipboard)/i;

const MAX_TEXT_LENGTH = 2_048;
const MAX_EVENT_BYTES = 16_384;
export const MAX_CONTENT_ID_LENGTH = 64;
const MAX_DEPTH = 6;
const MAX_OBJECT_KEYS = 32;
const MAX_ARRAY_ITEMS = 30;

const EVENT_PROPERTY_ALLOWLIST: Record<
  TelemetryEventName,
  ReadonlySet<string>
> = {
  site_page_viewed: new Set([
    "telemetry_schema_version",
    "surface",
    "environment",
    "build_sha",
    "route_id",
    "locale",
    "content_id",
  ]),
  site_cta_clicked: new Set([
    "telemetry_schema_version",
    "surface",
    "environment",
    "build_sha",
    "route_id",
    "locale",
    "cta_id",
    "content_id",
  ]),
  api_request_completed: new Set([
    "telemetry_schema_version",
    "surface",
    "environment",
    "build_sha",
    "request_id",
    "operation_id",
    "route_id",
    "provider",
    "status_class",
    "duration_bucket",
    "retryable",
    "error_code",
  ]),
  $exception: new Set([
    "telemetry_schema_version",
    "surface",
    "environment",
    "build_sha",
    "error_id",
    "request_id",
    "operation_id",
    "route_id",
    "provider",
    "error_code",
    "handled",
    "severity",
    "error_type",
    "$exception_list",
    "$exception_level",
    "$exception_fingerprint",
    "$exception_handled",
    "$exception_message",
    "$exception_type",
    // Metadados estritamente técnicos adicionados pelos SDKs.
    "token",
    "distinct_id",
    "$lib",
    "$lib_version",
    "$cookieless_mode",
    "$process_person_profile",
    "$geoip_disable",
  ]),
};

const REQUIRED_PROPERTIES: Record<TelemetryEventName, readonly string[]> = {
  site_page_viewed: ["surface", "route_id", "locale"],
  site_cta_clicked: ["surface", "route_id", "locale", "cta_id"],
  api_request_completed: [
    "surface",
    "request_id",
    "route_id",
    "provider",
    "status_class",
    "duration_bucket",
    "retryable",
    "error_code",
  ],
  $exception: ["surface", "error_id", "route_id", "error_code"],
};

const EVENT_NAMES = new Set<string>(TELEMETRY_EVENT_NAMES);
const SITE_ROUTES = new Set<string>(SITE_ROUTE_IDS);
const SITE_CTAS = new Set<string>(SITE_CTA_IDS);
const API_ROUTES = new Set<string>(API_ROUTE_IDS);
const PROVIDERS = new Set<string>(TELEMETRY_PROVIDERS);
const ERROR_CODES = new Set<string>(API_ERROR_CODES);
const LOCALES = new Set(["pt-BR", "en", "unknown"]);
const ENVIRONMENTS = new Set([
  "production",
  "preview",
  "staging",
  "development",
  "test",
  "unknown",
]);
const SURFACES = new Set(["marketing_site", "setup_api"]);
const STATUS_CLASSES = new Set(["4xx", "5xx"]);
const DURATION_BUCKETS = new Set([
  "lt_100ms",
  "100_499ms",
  "500_1999ms",
  "2_9s",
  "gte_10s",
]);
const SEVERITIES = new Set(["error", "fatal"]);
/**
 * Dimensão fechada: `Error.name` pode ser sobrescrito pela aplicação e não
 * deve virar um canal para nomes de lives, contas ou outros identificadores.
 */
const SAFE_EXCEPTION_NAMES: ReadonlySet<string> = new Set([
  "AbortError",
  "Error",
  "AggregateError",
  "DataCloneError",
  "EncodingError",
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
  "UnknownError",
]);

const REDACTED_EXCEPTION_VALUE = "Unexpected error";

function sanitizeUrl(raw: string) {
  const trailing = raw.match(/[),.;\]]+$/)?.[0] ?? "";
  const candidate = trailing ? raw.slice(0, -trailing.length) : raw;
  try {
    const url = new URL(candidate);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    const isCornetaBundle =
      (url.hostname === "corneta.live" ||
        url.hostname === "www.corneta.live" ||
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1") &&
      url.pathname.startsWith("/_next/");
    const path = isCornetaBundle ? url.pathname : "/<redacted>";
    return `${url.origin}${path}${trailing}`;
  } catch {
    return `<url>${trailing}`;
  }
}

/** Redige uma cópia textual; nunca altera a exceção ou o objeto original. */
export function redactTelemetryText(
  value: string,
  maxLength = MAX_TEXT_LENGTH,
) {
  const redacted = value
    .replace(BEARER_RE, "Bearer <redacted>")
    .replace(JWT_RE, "<redacted-jwt>")
    .replace(SECRET_ASSIGNMENT_RE, "$1=<redacted>")
    .replace(URL_RE, sanitizeUrl)
    .replace(WINDOWS_PATH_RE, "<local-path>")
    .replace(UNIX_PATH_RE, "<local-path>")
    .replace(EMAIL_RE, "<redacted-email>");

  return redacted.length <= maxLength
    ? redacted
    : `${redacted.slice(0, Math.max(0, maxLength - 11))}<truncated>`;
}

function redactValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return redactTelemetryText(value);
  if (typeof value !== "object") return undefined;
  if (depth >= MAX_DEPTH) return "<max-depth>";
  if (seen.has(value)) return "<circular>";
  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => redactValue(item, depth + 1, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      output[key] = "<redacted>";
      continue;
    }
    const safe = redactValue(item, depth + 1, seen);
    if (safe !== undefined) output[key] = safe;
  }
  return output;
}

export function redactTelemetryValue(value: unknown) {
  return redactValue(value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function normalizePostHogHost(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

export function durationBucket(durationMs: number) {
  if (durationMs < 100) return "lt_100ms" as const;
  if (durationMs < 500) return "100_499ms" as const;
  if (durationMs < 2_000) return "500_1999ms" as const;
  if (durationMs < 10_000) return "2_9s" as const;
  return "gte_10s" as const;
}

export function statusClass(status: number) {
  return status >= 500 ? ("5xx" as const) : ("4xx" as const);
}

export function normalizeEnvironment(value: unknown) {
  return typeof value === "string" && ENVIRONMENTS.has(value)
    ? value
    : "unknown";
}

export function normalizeErrorType(value: unknown) {
  return typeof value === "string" && SAFE_EXCEPTION_NAMES.has(value)
    ? value
    : "UnknownError";
}

/**
 * Identificador editorial estável, opaco e deliberadamente incapaz de carregar
 * URL, query, título ou texto livre. O prefixo separa as duas coleções sem
 * depender do caminho publicado.
 */
export function normalizeContentId(value: unknown) {
  return typeof value === "string" &&
    value.length <= MAX_CONTENT_ID_LENGTH &&
    CONTENT_ID_RE.test(value)
    ? value
    : undefined;
}

export function siteRoute(pathOrUrl: string): {
  routeId: SiteRouteId;
  locale: "pt-BR" | "en" | "unknown";
} {
  let pathname = pathOrUrl;
  try {
    pathname = new URL(pathOrUrl, "https://www.corneta.live").pathname;
  } catch {
    pathname = pathOrUrl.split(/[?#]/, 1)[0] ?? "/";
  }
  pathname = `/${pathname}`.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  const isEnglish = pathname === "/en" || pathname.startsWith("/en/");
  const isInternalPortuguese =
    pathname === "/pt-BR" || pathname.startsWith("/pt-BR/");
  const locale = isEnglish ? "en" : "pt-BR";
  const withoutLocale = isEnglish
    ? pathname.slice(3) || "/"
    : isInternalPortuguese
      ? pathname.slice(6) || "/"
      : pathname;

  if (withoutLocale === "/") return { routeId: "home", locale };
  if (withoutLocale === "/legal/privacy") {
    return { routeId: "privacy", locale };
  }
  if (withoutLocale === "/legal/terms-of-use") {
    return { routeId: "terms_of_use", locale };
  }
  if (withoutLocale === "/changelog") {
    return { routeId: "changelog", locale };
  }
  if (withoutLocale === "/search") {
    return { routeId: "search", locale };
  }

  const segments = withoutLocale.split("/").filter(Boolean);
  if (segments[0] === "help") {
    const routeId =
      segments.length === 1
        ? "help_index"
        : segments.length === 2
          ? "help_category"
          : "help_article";
    return { routeId, locale };
  }
  if (segments[0] === "guides") {
    const routeId =
      segments.length === 1
        ? "guides_index"
        : segments.length === 2
          ? "guides_category"
          : "guide_article";
    return { routeId, locale };
  }
  return { routeId: "other", locale };
}

function sanitizeExceptionList(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 4).map((item) => {
    if (!item || typeof item !== "object") return {};
    const source = item as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    if (typeof source.type === "string") {
      output.type = normalizeErrorType(source.type);
    }
    if (typeof source.value === "string") {
      output.value = REDACTED_EXCEPTION_VALUE;
    }
    if (source.mechanism && typeof source.mechanism === "object") {
      const mechanism = source.mechanism as Record<string, unknown>;
      output.mechanism = {
        ...(typeof mechanism.handled === "boolean"
          ? { handled: mechanism.handled }
          : {}),
        ...(typeof mechanism.type === "string" &&
        SAFE_TOKEN_RE.test(mechanism.type)
          ? { type: mechanism.type }
          : {}),
      };
    }
    if (source.stacktrace && typeof source.stacktrace === "object") {
      const stacktrace = source.stacktrace as Record<string, unknown>;
      if (Array.isArray(stacktrace.frames)) {
        output.stacktrace = {
          frames: stacktrace.frames.slice(-MAX_ARRAY_ITEMS).map((frame) => {
            if (!frame || typeof frame !== "object") return {};
            const sourceFrame = frame as Record<string, unknown>;
            const safeFrame: Record<string, unknown> = {};
            for (const key of ["filename", "abs_path", "function", "module"]) {
              const frameValue = sourceFrame[key];
              if (typeof frameValue === "string") {
                safeFrame[key] = redactTelemetryText(frameValue, 512);
              }
            }
            for (const key of ["lineno", "colno"]) {
              const frameValue = sourceFrame[key];
              if (
                typeof frameValue === "number" &&
                Number.isFinite(frameValue)
              ) {
                safeFrame[key] = frameValue;
              }
            }
            if (typeof sourceFrame.in_app === "boolean") {
              safeFrame.in_app = sourceFrame.in_app;
            }
            return safeFrame;
          }),
        };
      }
    }
    return output;
  });
}

function sanitizeProperty(key: string, value: unknown): unknown {
  if (key === "telemetry_schema_version") return TELEMETRY_SCHEMA_VERSION;
  if (key === "surface") {
    return typeof value === "string" && SURFACES.has(value) ? value : undefined;
  }
  if (key === "environment") return normalizeEnvironment(value);
  if (key === "build_sha") {
    return typeof value === "string" && BUILD_SHA_RE.test(value)
      ? value.toLowerCase()
      : undefined;
  }
  if (key === "content_id") return normalizeContentId(value);
  if (key === "route_id") {
    return typeof value === "string" &&
      (SITE_ROUTES.has(value) || API_ROUTES.has(value))
      ? value
      : undefined;
  }
  if (key === "locale") {
    return typeof value === "string" && LOCALES.has(value) ? value : undefined;
  }
  if (key === "cta_id") {
    return typeof value === "string" && SITE_CTAS.has(value)
      ? value
      : undefined;
  }
  if (key === "provider") {
    return typeof value === "string" && PROVIDERS.has(value)
      ? value
      : undefined;
  }
  if (key === "status_class") {
    return typeof value === "string" && STATUS_CLASSES.has(value)
      ? value
      : undefined;
  }
  if (key === "duration_bucket") {
    return typeof value === "string" && DURATION_BUCKETS.has(value)
      ? value
      : undefined;
  }
  if (key === "error_code") {
    return typeof value === "string" && ERROR_CODES.has(value)
      ? value
      : undefined;
  }
  if (["request_id", "operation_id", "error_id"].includes(key)) {
    return isUuid(value) ? value.toLowerCase() : undefined;
  }
  if (["retryable", "handled", "$exception_handled"].includes(key)) {
    return typeof value === "boolean" ? value : undefined;
  }
  if (key === "severity" || key === "$exception_level") {
    return typeof value === "string" && SEVERITIES.has(value)
      ? value
      : undefined;
  }
  if (key === "error_type" || key === "$exception_type") {
    return normalizeErrorType(value);
  }
  if (key === "$exception_list") return sanitizeExceptionList(value);
  if (key === "$exception_message") {
    return typeof value === "string" ? REDACTED_EXCEPTION_VALUE : undefined;
  }
  if (key === "$exception_fingerprint") {
    return typeof value === "string" && SAFE_TOKEN_RE.test(value)
      ? value
      : undefined;
  }
  if (key === "$cookieless_mode") {
    return value === true ? true : undefined;
  }
  if (key === "$process_person_profile") {
    return value === false ? false : undefined;
  }
  if (key === "$geoip_disable") {
    return value === true ? true : undefined;
  }
  if (key === "token") {
    return typeof value === "string" && POSTHOG_PROJECT_TOKEN_RE.test(value)
      ? value
      : undefined;
  }
  if (key === "distinct_id") {
    return sanitizeDistinctId(value);
  }
  if (["$lib", "$lib_version"].includes(key)) {
    return typeof value === "string" && value.length <= 256
      ? redactTelemetryText(value, 256)
      : undefined;
  }
  return redactValue(value);
}

function sanitizeDistinctId(value: unknown) {
  return typeof value === "string" &&
    (value === "$posthog_cookieless" ||
      isUuid(value) ||
      REQUEST_DISTINCT_ID_RE.test(value))
    ? value.toLowerCase()
    : undefined;
}

export function sanitizeTelemetryProperties(
  event: unknown,
  properties: unknown,
): TelemetryProperties | null {
  if (
    typeof event !== "string" ||
    !EVENT_NAMES.has(event) ||
    !properties ||
    typeof properties !== "object" ||
    Array.isArray(properties)
  ) {
    return null;
  }

  const eventName = event as TelemetryEventName;
  const allowlist = EVENT_PROPERTY_ALLOWLIST[eventName];
  const output: TelemetryProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!allowlist.has(key) && !SDK_TRANSPORT_PROPERTIES.has(key)) {
      // O SDK acrescenta propriedades reservadas automaticamente. Elas podem
      // ser descartadas; as cinco chaves de transporte acima são a exceção
      // mínima para ingestão cookieless, sem perfil e sem GeoIP. Uma
      // propriedade livre do call site reprova o evento inteiro.
      if (key.startsWith("$")) {
        continue;
      }
      return null;
    }
    const safe = sanitizeProperty(key, value);
    // Um ID editorial presente mas inválido indica contrato quebrado. Não
    // rebaixamos silenciosamente o evento para uma page view/CTA genérica.
    if (key === "content_id" && safe === undefined) return null;
    if (safe !== undefined) output[key] = safe;
  }
  output.telemetry_schema_version = TELEMETRY_SCHEMA_VERSION;

  if (REQUIRED_PROPERTIES[eventName].some((key) => !(key in output))) {
    return null;
  }
  try {
    return JSON.stringify(output).length <= MAX_EVENT_BYTES ? output : null;
  } catch {
    return null;
  }
}

/** Última barreira usada no `before_send` dos dois SDKs. */
export function redactPostHogMessage<T extends TelemetryMessage>(
  message: T | null,
): T | null {
  if (!message) return null;
  const distinctId = sanitizeDistinctId(message.distinctId);
  if (message.distinctId !== undefined && !distinctId) return null;
  if (message.disableGeoip !== undefined && message.disableGeoip !== true) {
    return null;
  }
  const uuid = isUuid(message.uuid) ? message.uuid.toLowerCase() : undefined;
  if (message.uuid !== undefined && !uuid) return null;
  const timestamp =
    message.timestamp instanceof Date &&
    Number.isFinite(message.timestamp.getTime())
      ? message.timestamp
      : undefined;
  if (message.timestamp !== undefined && !timestamp) return null;
  const properties = sanitizeTelemetryProperties(
    message.event,
    message.properties,
  );
  if (!properties) return null;
  return {
    event: message.event,
    properties,
    ...(distinctId ? { distinctId } : {}),
    ...(message.disableGeoip === true ? { disableGeoip: true } : {}),
    ...(timestamp ? { timestamp } : {}),
    ...(uuid ? { uuid } : {}),
  } as T;
}

export function redactedException(
  error: unknown,
  fallbackMessage: "Unexpected browser error" | "Unexpected server error",
) {
  const source = error instanceof Error ? error : undefined;
  const type = normalizeErrorType(source?.name);
  const safe = new Error(fallbackMessage);
  safe.name = type;
  const frames = source?.stack?.split("\n").slice(1).join("\n");
  safe.stack = frames
    ? `${type}: ${fallbackMessage}\n${redactTelemetryText(frames, 8_192)}`
    : `${type}: ${fallbackMessage}`;
  return safe;
}

export function telemetryBaseProperties(
  surface: "marketing_site" | "setup_api",
  environment: unknown,
  buildSha?: unknown,
) {
  return {
    telemetry_schema_version: TELEMETRY_SCHEMA_VERSION,
    surface,
    environment: normalizeEnvironment(environment),
    $process_person_profile: false,
    $geoip_disable: true,
    ...(typeof buildSha === "string" && BUILD_SHA_RE.test(buildSha)
      ? { build_sha: buildSha.toLowerCase() }
      : {}),
  };
}
