import { useSyncExternalStore } from "react";
import type { PostHogConfig } from "posthog-js/dist/module.no-external";
import { createTelemetryTransport } from "./telemetry-transport";
import {
  EMPTY_TELEMETRY_STATUS,
  REMOTE_DESKTOP_ERROR_MESSAGE,
  TELEMETRY_NOTICE_VERSION,
  TELEMETRY_SCHEMA_VERSION,
  createTelemetryId,
  isTelemetryErrorCode,
  isTelemetryStage,
  isUuid,
  telemetryPurposeActive,
  normalizeTelemetryExceptionName,
  normalizeTelemetryStatus,
  sanitizeExceptionProperties,
  sanitizePostHogEvent,
  sanitizeTelemetryExceptionStack,
  sanitizeTelemetryProperties,
  type PostHogLikeEvent,
  type ScreenId,
  type TelemetryChoice,
  type TelemetryContext,
  type TelemetryEventMap,
  type TelemetryEventName,
  type TelemetryErrorCode,
  type TelemetryExceptionContext,
  type TelemetryStage,
  type TelemetryStatus,
} from "./telemetry-schema";

export type { TelemetryChoice, TelemetryStatus } from "./telemetry-schema";

export const TELEMETRY_DECISION_READY_EVENT =
  "corneta:telemetry-decision-ready";

export interface TelemetryBackend {
  telemetryStatus(): Promise<TelemetryStatus>;
  telemetrySetConsent(input: {
    usage: TelemetryChoice;
    crashReports: TelemetryChoice;
    noticeVersion: string;
  }): Promise<TelemetryStatus>;
  telemetryRegenerateId(): Promise<TelemetryStatus>;
}

interface TelemetrySnapshot {
  status: TelemetryStatus;
  ready: boolean;
  available: boolean;
  configured: boolean;
  saving: boolean;
}

interface PostHogSdk {
  init(
    token: string,
    options: Partial<PostHogConfig>,
    name?: string,
  ): PostHogSdk;
  capture(event: string, properties?: Record<string, unknown>): unknown;
  captureException(error: Error, properties?: Record<string, unknown>): unknown;
  addExceptionStep?: (
    name: string,
    properties?: Record<string, unknown>,
  ) => void;
  opt_in_capturing?: (options?: { captureEventName?: false }) => void;
  opt_out_capturing?: () => void;
  clear_opt_in_out_capturing?: () => void;
  reset?: (resetDeviceId?: boolean) => void;
  flush?: () => Promise<void> | void;
  closeTelemetryTransport?: () => void;
}

type SdkLoader = () => Promise<Pick<PostHogSdk, "init">>;

interface RuntimeConfig {
  token: string;
  host: string;
  buildSha: string;
  disabled: boolean;
  environment: TelemetryContext["environment"];
}

export type OnboardingTelemetryEvent =
  | {
      event: "onboarding_started";
      properties: TelemetryEventMap["onboarding_started"];
    }
  | {
      event: "onboarding_step_completed";
      properties: TelemetryEventMap["onboarding_step_completed"];
    }
  | {
      event: "onboarding_completed";
      properties: TelemetryEventMap["onboarding_completed"];
    };

const ONBOARDING_ENTRY_POINTS = new Set(["first_run", "replay"]);
const ONBOARDING_STEP_IDS = new Set([
  "welcome",
  "platforms",
  "obs",
  "golive",
  "chat_reports",
]);
const DURATION_BUCKETS = new Set([
  "lt_1s",
  "1_3s",
  "3_10s",
  "10_30s",
  "30_60s",
  "1_5m",
  "5_30m",
  "30_120m",
  "gte_120m",
]);
const POSTHOG_CONSENT_PREFIX = "__ph_opt_in_out_";
export const TELEMETRY_MAX_QUEUED_EVENTS = 64;
const USAGE_QUEUE_LIMIT = 48;
const DELIVERY_BATCH_SIZE = 4;
const RECENT_EVENT_LIMIT = 128;
const RECENT_ERROR_LIMIT = 64;

const listeners = new Set<() => void>();
const queued: Array<(client: PostHogSdk) => void> = [];
const seenErrors = new WeakMap<object, string>();
const recentErrors = new Map<string, { id: string; at: number }>();
const recentEvents = new Map<string, number>();
let delivery: { epoch: number; promise: Promise<void> } | null = null;
let cancelScheduledDelivery: (() => void) | null = null;
let dropped = 0;
let sdkRetryAt = 0;

let backend: TelemetryBackend | null = null;
let initialization: Promise<void> | null = null;
let sdk: PostHogSdk | null = null;
let sdkPromise: Promise<PostHogSdk | null> | null = null;
let sdkInstallationId: string | null = null;
let sdkEpoch = 0;
let sdkInstanceSequence = 0;
let globalHandlersInstalled = false;
let locale: TelemetryContext["locale"] = detectLocale();
let runtimeConfig = readRuntimeConfig();
let sdkLoader: SdkLoader = defaultSdkLoader;
let snapshot: TelemetrySnapshot = {
  status: EMPTY_TELEMETRY_STATUS,
  ready: false,
  available: false,
  configured: isRuntimeConfigured(runtimeConfig),
  saving: false,
};

function detectLocale(): TelemetryContext["locale"] {
  if (typeof navigator === "undefined") return "pt-BR";
  return navigator.language.toLowerCase().startsWith("en") ? "en" : "pt-BR";
}

function environment(mode: string): TelemetryContext["environment"] {
  if (mode === "production") return "production";
  if (mode === "staging") return "staging";
  return "development";
}

function readRuntimeConfig(): RuntimeConfig {
  return {
    token: import.meta.env.VITE_POSTHOG_TOKEN?.trim() ?? "",
    host: import.meta.env.VITE_POSTHOG_HOST?.trim() ?? "",
    buildSha: (import.meta.env.VITE_BUILD_SHA?.trim() ?? "").slice(0, 40),
    disabled: import.meta.env.VITE_TELEMETRY_DISABLED === "1",
    environment: environment(import.meta.env.MODE),
  };
}

function safePostHogHost(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isRuntimeConfigured(config: RuntimeConfig): boolean {
  const buildShaIsValid =
    config.environment === "production"
      ? /^[0-9a-f]{40}$/i.test(config.buildSha)
      : /^[0-9a-f]{0,40}$/i.test(config.buildSha);
  return (
    !config.disabled &&
    /^phc_[A-Za-z0-9_-]{8,}$/.test(config.token) &&
    safePostHogHost(config.host) !== null &&
    buildShaIsValid
  );
}

function detectOsFamily(): TelemetryContext["os_family"] {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("windows")) return "windows";
  if (ua.includes("mac os") || ua.includes("macintosh")) return "macos";
  if (ua.includes("linux")) return "linux";
  return "other";
}

function telemetryContext(): TelemetryContext {
  return {
    telemetry_schema_version: TELEMETRY_SCHEMA_VERSION,
    surface: "desktop_ui",
    environment: runtimeConfig.environment,
    app_version: __APP_VERSION__,
    build_sha: runtimeConfig.buildSha,
    locale,
    os_family: detectOsFamily(),
  };
}

function emit(): void {
  for (const listener of listeners) listener();
}

function updateSnapshot(next: Partial<TelemetrySnapshot>): void {
  snapshot = { ...snapshot, ...next };
  emit();
}

export function getTelemetrySnapshot(): TelemetrySnapshot {
  return snapshot;
}

export function subscribeTelemetry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTelemetry(): TelemetrySnapshot {
  return useSyncExternalStore(
    subscribeTelemetry,
    getTelemetrySnapshot,
    getTelemetrySnapshot,
  );
}

// Notice updates do not override opposition; see telemetryPurposeActive.
function canCaptureUsage(): boolean {
  return (
    telemetryPurposeActive(snapshot.status.usage, "usage") &&
    isUuid(snapshot.status.installationId) &&
    snapshot.configured
  );
}

function canCaptureCrashes(): boolean {
  return (
    telemetryPurposeActive(snapshot.status.crashReports, "crashReports") &&
    isUuid(snapshot.status.installationId) &&
    snapshot.configured
  );
}

function anyEnabledChoice(status = snapshot.status): boolean {
  return (
    telemetryPurposeActive(status.usage, "usage") ||
    telemetryPurposeActive(status.crashReports, "crashReports")
  );
}

function anyCurrentConsent(status = snapshot.status): boolean {
  return anyEnabledChoice(status);
}

function onlyProperty(
  properties: Record<string, unknown>,
  key: string,
): boolean {
  return Object.keys(properties).length === 1 && key in properties;
}

function safeOnboardingEvent(
  input: OnboardingTelemetryEvent,
): OnboardingTelemetryEvent | null {
  const properties = input.properties as Record<string, unknown>;
  if (input.event === "onboarding_started") {
    return onlyProperty(properties, "entry_point") &&
      ONBOARDING_ENTRY_POINTS.has(String(properties.entry_point))
      ? {
          event: input.event,
          properties: {
            entry_point: properties.entry_point as "first_run" | "replay",
          },
        }
      : null;
  }
  if (input.event === "onboarding_step_completed") {
    return onlyProperty(properties, "step_id") &&
      ONBOARDING_STEP_IDS.has(String(properties.step_id))
      ? {
          event: input.event,
          properties: {
            step_id: properties.step_id as
              "welcome" | "platforms" | "obs" | "golive" | "chat_reports",
          },
        }
      : null;
  }
  if (input.event === "onboarding_completed") {
    return onlyProperty(properties, "duration_bucket") &&
      DURATION_BUCKETS.has(String(properties.duration_bucket))
      ? {
          event: input.event,
          properties: {
            duration_bucket:
              properties.duration_bucket as TelemetryEventMap["onboarding_completed"]["duration_bucket"],
          },
        }
      : null;
  }
  return null;
}

async function defaultSdkLoader(): ReturnType<SdkLoader> {
  const module = await import("posthog-js/dist/module.no-external");
  return {
    init(token, options) {
      // Named singleton instances are retained globally after revocation.
      const instance = new module.PostHog().init(token, options);
      const transport = createTelemetryTransport(instance);
      const current = instance as unknown as PostHogSdk;
      current.closeTelemetryTransport = transport.close;
      return current;
    },
  };
}

function beforeSend(
  value: unknown,
  epoch: number,
  installationId: string,
): PostHogLikeEvent | null {
  // Bind the gate to this SDK instance so stale callbacks cannot resume sending after an ABA state change.
  if (sdkEpoch !== epoch || snapshot.status.installationId !== installationId)
    return null;
  return sanitizePostHogEvent(
    value as PostHogLikeEvent | null,
    telemetryContext(),
    canCaptureUsage(),
    canCaptureCrashes(),
  );
}

/** telemetry.json is the sole persistent authority for telemetry preferences. */
function clearPostHogConsentStorage(): void {
  try {
    if (typeof localStorage !== "undefined") {
      const keys: string[] = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(POSTHOG_CONSENT_PREFIX)) keys.push(key);
      }
      for (const key of keys) localStorage.removeItem(key);
    }
  } catch {
    // The gate and epoch still protect webviews without storage.
  }
  try {
    if (typeof document !== "undefined") {
      for (const part of document.cookie.split(";")) {
        const name = part.trim().split("=", 1)[0];
        if (name?.startsWith(POSTHOG_CONSENT_PREFIX))
          document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
      }
    }
  } catch {
    // Cookies may be blocked; there is nothing to clear in that case.
  }
}

function clearSdkConsent(current: PostHogSdk | null): void {
  try {
    current?.clear_opt_in_out_capturing?.();
  } catch {
    // Explicit cleanup below covers SDK versions or mocks without this API.
  }
  clearPostHogConsentStorage();
}

function retireSdk(current: PostHogSdk | null): void {
  current?.closeTelemetryTransport?.();
  try {
    current?.opt_out_capturing?.();
  } catch {
    // SDK errors must not prevent local revocation.
  }
  try {
    current?.reset?.(true);
  } catch {
    // This instance reference will not be reused.
  }
  clearSdkConsent(current);
}

function invalidateSdk(): void {
  sdkEpoch += 1;
  cancelScheduledDelivery?.();
  cancelScheduledDelivery = null;
  dropped += queued.length;
  queued.length = 0;
  delivery = null;
  sdkRetryAt = 0;
  recentEvents.clear();
  const current = sdk;
  sdk = null;
  sdkPromise = null;
  sdkInstallationId = null;
  retireSdk(current);
}

async function ensureSdk(): Promise<PostHogSdk | null> {
  if (
    !snapshot.configured ||
    !anyCurrentConsent() ||
    !snapshot.status.installationId ||
    !isOnline() ||
    Date.now() < sdkRetryAt
  )
    return null;

  if (sdk) {
    if (sdkInstallationId !== snapshot.status.installationId) {
      // Bootstrap an anonymous installation ID; identify would create an identified profile and an auxiliary device ID.
      invalidateSdk();
    } else {
      return sdk;
    }
  }
  if (sdkPromise) return sdkPromise;

  const installationId = snapshot.status.installationId;
  const epoch = sdkEpoch;
  const loading = Promise.resolve()
    .then(sdkLoader)
    .then((root) => {
      if (
        sdkEpoch !== epoch ||
        !snapshot.configured ||
        !anyCurrentConsent() ||
        !installationId ||
        snapshot.status.installationId !== installationId
      )
        return null;
      const host = safePostHogHost(runtimeConfig.host);
      if (!host) return null;
      sdkInstanceSequence += 1;
      const options: Partial<PostHogConfig> = {
        api_host: host,
        autocapture: false,
        request_batching: false,
        opt_out_capturing_by_default: false,
        opt_out_capturing_persistence_type: "localStorage",
        capture_pageview: false,
        capture_pageleave: false,
        capture_exceptions: false,
        capture_performance: false,
        capture_dead_clicks: false,
        capture_heatmaps: false,
        disable_session_recording: true,
        disable_surveys: true,
        rageclick: false,
        enable_recording_console_log: false,
        logs: { captureConsoleLogs: false },
        advanced_disable_flags: true,
        persistence: "memory",
        person_profiles: "identified_only",
        mask_all_text: true,
        mask_all_element_attributes: true,
        respect_dnt: true,
        bootstrap: {
          distinctID: installationId,
          isIdentifiedID: false,
        },
        error_tracking: {
          exception_steps: { enabled: true, max_bytes: 8_192 },
        },
        before_send: ((value: unknown) =>
          beforeSend(
            value,
            epoch,
            installationId,
          )) as PostHogConfig["before_send"],
        loaded: (loaded) => {
          const loadedSdk = loaded as unknown as PostHogSdk;
          if (
            sdkEpoch !== epoch ||
            !anyCurrentConsent() ||
            snapshot.status.installationId !== installationId
          ) {
            // Ignore stale loaded callbacks; do not reset a current instance reused by a mock.
            if (sdk !== loadedSdk) retireSdk(loadedSdk);
            return;
          }
          clearSdkConsent(loadedSdk);
        },
      };
      const instance = root.init(
        runtimeConfig.token,
        options,
        `corneta_${sdkInstanceSequence}`,
      );
      sdk = instance;
      sdkInstallationId = installationId;
      return instance;
    })
    .catch(() => {
      if (sdkEpoch === epoch) sdkRetryAt = Date.now() + 30_000;
      return null;
    });
  sdkPromise = loading;
  void loading.finally(() => {
    // An old loader must not clear the current promise.
    if (sdkPromise === loading) sdkPromise = null;
  });
  return loading;
}

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function requestDelivery(): void {
  if (cancelScheduledDelivery || delivery?.epoch === sdkEpoch) return;
  const run = () => {
    cancelScheduledDelivery = null;
    void deliverBatch();
  };
  if (
    typeof window !== "undefined" &&
    typeof window.requestIdleCallback === "function" &&
    typeof window.cancelIdleCallback === "function"
  ) {
    const browser = window;
    const id = browser.requestIdleCallback(run, { timeout: 250 });
    cancelScheduledDelivery = () => browser.cancelIdleCallback(id);
  } else {
    const id = setTimeout(run, 16);
    cancelScheduledDelivery = () => clearTimeout(id);
  }
}

function deliverBatch(): Promise<void> {
  if (delivery?.epoch === sdkEpoch) return delivery.promise;
  const epoch = sdkEpoch;
  const promise = (async () => {
    const client = await ensureSdk();
    if (sdkEpoch !== epoch) return;
    if (!client || sdk !== client) {
      dropped += queued.length;
      queued.length = 0;
      return;
    }
    for (
      let count = 0;
      count < DELIVERY_BATCH_SIZE && sdkEpoch === epoch && sdk === client;
      count++
    ) {
      const task = queued.shift();
      if (!task) break;
      try {
        task(client);
      } catch {
        // SDK failures must not interrupt the UI or retry a potentially accepted event.
        dropped++;
      }
    }
  })()
    .catch(() => {
      if (sdkEpoch === epoch) {
        dropped += queued.length;
        queued.length = 0;
      }
    })
    .finally(() => {
      if (delivery?.promise !== promise) return;
      delivery = null;
      if (queued.length) requestDelivery();
    });
  delivery = { epoch, promise };
  return promise;
}

function schedule(
  task: (client: PostHogSdk) => void,
  crashReport = false,
): void {
  // Reserve capacity for crash reports while a slow SDK load holds usage events.
  if (
    !isOnline() ||
    queued.length >=
      (crashReport ? TELEMETRY_MAX_QUEUED_EVENTS : USAGE_QUEUE_LIMIT)
  ) {
    dropped++;
    return;
  }
  queued.push(task);
  requestDelivery();
}

function trimOldest<T>(cache: Map<string, T>, limit: number): void {
  while (cache.size > limit) {
    const key = cache.keys().next().value;
    if (key === undefined) break;
    cache.delete(key);
  }
}

export async function initializeTelemetry(
  telemetryBackend: TelemetryBackend,
): Promise<void> {
  backend = telemetryBackend;
  if (initialization) return initialization;
  initialization = telemetryBackend
    .telemetryStatus()
    .then((status) => {
      updateSnapshot({
        status: normalizeTelemetryStatus(status),
        ready: true,
        available: true,
      });
      clearPostHogConsentStorage();
      installGlobalErrorHandlers();
      if (anyCurrentConsent() && snapshot.configured) requestDelivery();
    })
    .catch(() => {
      updateSnapshot({
        status: EMPTY_TELEMETRY_STATUS,
        ready: true,
        available: false,
      });
    });
  return initialization;
}

export function setTelemetryLocale(value: string): void {
  locale = value === "en" ? "en" : "pt-BR";
}

export async function setTelemetryConsent(input: {
  usage: TelemetryChoice;
  crashReports: TelemetryChoice;
}): Promise<TelemetryStatus> {
  if (!backend || !snapshot.available)
    throw new Error("telemetry_backend_unavailable");
  if (snapshot.saving) throw new Error("telemetry_change_in_progress");

  const previous = snapshot.status;
  const usageActive = telemetryPurposeActive(input.usage, "usage");
  const crashesActive = telemetryPurposeActive(
    input.crashReports,
    "crashReports",
  );
  const revoked =
    (telemetryPurposeActive(previous.usage, "usage") && !usageActive) ||
    (telemetryPurposeActive(previous.crashReports, "crashReports") &&
      !crashesActive);
  if (revoked) invalidateSdk();
  const refusingBoth = !usageActive && !crashesActive;
  const optimistic: TelemetryStatus = {
    ...previous,
    noticeVersion:
      previous.noticeVersion === TELEMETRY_NOTICE_VERSION || refusingBoth
        ? TELEMETRY_NOTICE_VERSION
        : previous.noticeVersion,
    // Disable immediately; enable only after the backend persists the decision.
    usage: !usageActive ? input.usage : previous.usage,
    crashReports: !crashesActive ? input.crashReports : previous.crashReports,
    decidedAt: new Date().toISOString(),
  };
  updateSnapshot({ status: optimistic, saving: true });
  try {
    const status = normalizeTelemetryStatus(
      await backend.telemetrySetConsent({
        ...input,
        noticeVersion: TELEMETRY_NOTICE_VERSION,
      }),
    );
    updateSnapshot({ status, saving: false });
    if (anyCurrentConsent(status)) {
      requestDelivery();
    } else {
      invalidateSdk();
    }
    return status;
  } catch (error) {
    // A failed write must not resume a purpose the user just revoked.
    const status = {
      ...previous,
      usage: usageActive ? previous.usage : input.usage,
      crashReports: crashesActive ? previous.crashReports : input.crashReports,
    };
    updateSnapshot({ status, saving: false });
    if (anyCurrentConsent(status)) requestDelivery();
    throw error;
  }
}

export async function regenerateTelemetryId(): Promise<TelemetryStatus> {
  if (!backend || !snapshot.available)
    throw new Error("telemetry_backend_unavailable");
  if (snapshot.saving) throw new Error("telemetry_change_in_progress");
  if (anyEnabledChoice())
    throw new Error("telemetry_disable_before_regenerate");
  invalidateSdk();
  updateSnapshot({ saving: true });
  try {
    const status = normalizeTelemetryStatus(
      await backend.telemetryRegenerateId(),
    );
    updateSnapshot({ status, saving: false });
    return status;
  } catch (error) {
    updateSnapshot({ saving: false });
    throw error;
  }
}

function eventSignature(
  event: TelemetryEventName,
  properties: Record<string, unknown>,
): string {
  return `${event}:${JSON.stringify(properties)}`;
}

export function capture<Name extends TelemetryEventName>(
  event: Name,
  properties: TelemetryEventMap[Name],
): void {
  if (!canCaptureUsage()) return;
  if (!isOnline() || queued.length >= USAGE_QUEUE_LIMIT) {
    dropped++;
    return;
  }
  const safe = sanitizeTelemetryProperties(
    event,
    properties as Record<string, unknown>,
    telemetryContext(),
  );
  if (!safe) return;

  const signature = eventSignature(
    event,
    properties as Record<string, unknown>,
  );
  const now = Date.now();
  const previous = recentEvents.get(signature);
  if (previous !== undefined && now - previous < 750) return;
  recentEvents.set(signature, now);
  trimOldest(recentEvents, RECENT_EVENT_LIMIT);

  const epoch = sdkEpoch;
  schedule((client) => {
    if (!client || sdkEpoch !== epoch || sdk !== client || !canCaptureUsage())
      return;
    client.capture(event, safe);
  });
}

export function captureOnboarding(input: OnboardingTelemetryEvent): void {
  if (!canCaptureUsage()) return;
  const safe = safeOnboardingEvent(input);
  if (!safe) return;
  if (safe.event === "onboarding_started") capture(safe.event, safe.properties);
  else if (safe.event === "onboarding_step_completed")
    capture(safe.event, safe.properties);
  else capture(safe.event, safe.properties);
}

function hash(value: string): string {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(36);
}

function safeError(error: unknown): Error {
  const source =
    error instanceof Error
      ? error
      : new Error(typeof error === "string" ? error : "Unknown UI error");
  const copy = new Error(REMOTE_DESKTOP_ERROR_MESSAGE);
  copy.name = normalizeTelemetryExceptionName(source.name);
  copy.stack = sanitizeTelemetryExceptionStack(source.stack, copy.name);
  return copy;
}

function exceptionSignature(error: Error, stage: string): string {
  const firstAppFrame = (error.stack ?? "")
    .split("\n")
    .find((line) => /(?:\/src\/|\/assets\/|\.tsx?:|\.jsx?:)/.test(line));
  return `${error.name}:${stage}:${firstAppFrame ?? "no_app_frame"}`;
}

export function captureException(
  error: unknown,
  properties: TelemetryExceptionContext,
): string {
  if (error && (typeof error === "object" || typeof error === "function")) {
    const seen = seenErrors.get(error as object);
    if (seen) return seen;
  }

  const redactedError = safeError(error);
  const signature = exceptionSignature(redactedError, properties.stage);
  const now = Date.now();
  const recent = recentErrors.get(signature);
  if (recent && now - recent.at < 2_000) return recent.id;

  const errorId = createTelemetryId();
  if (error && (typeof error === "object" || typeof error === "function"))
    seenErrors.set(error as object, errorId);
  recentErrors.set(signature, { id: errorId, at: now });
  trimOldest(recentErrors, RECENT_ERROR_LIMIT);

  // Keep the error ID locally available even when SDK reporting is disabled.
  if (!canCaptureCrashes()) return errorId;

  const safe = sanitizeExceptionProperties(
    {
      ...properties,
      error_id: errorId,
      $exception_fingerprint: `ui_${hash(signature)}`,
    },
    telemetryContext(),
  );
  if (!safe) return errorId;

  const epoch = sdkEpoch;
  schedule((client) => {
    if (!client || sdkEpoch !== epoch || sdk !== client || !canCaptureCrashes())
      return;
    client.captureException(redactedError, safe);
  }, true);
  return errorId;
}

export type ExceptionStepName =
  | "app_ready"
  | "screen_opened"
  | "onboarding_advanced"
  | "obs_check_started"
  | "live_start_requested"
  | "live_became_active"
  | "live_stop_requested"
  | "diagnostics_export_requested"
  | "update_install_requested";

export function addStep(
  name: ExceptionStepName,
  properties: {
    screen_id?: ScreenId;
    operation_id?: string;
    stage?: TelemetryStage;
    outcome?: "ok" | "error";
    error_code?: TelemetryErrorCode;
  } = {},
): void {
  if (!canCaptureCrashes()) return;
  const safe: Record<string, unknown> = {};
  if (properties.screen_id) safe.screen_id = properties.screen_id;
  if (properties.operation_id && isUuid(properties.operation_id))
    safe.operation_id = properties.operation_id;
  if (properties.stage && isTelemetryStage(properties.stage))
    safe.stage = properties.stage;
  if (properties.outcome) safe.outcome = properties.outcome;
  if (properties.error_code && isTelemetryErrorCode(properties.error_code))
    safe.error_code = properties.error_code;

  const epoch = sdkEpoch;
  schedule((client) => {
    if (!client || sdkEpoch !== epoch || sdk !== client || !canCaptureCrashes())
      return;
    client.addExceptionStep?.(name, safe);
  });
}

export function installGlobalErrorHandlers(): void {
  if (globalHandlersInstalled || typeof window === "undefined") return;
  globalHandlersInstalled = true;
  // Include screen_id to distinguish errors from the main and chat webviews.
  const screenId = window.location.pathname.endsWith("/chat.html")
    ? ("chat_popout" as const)
    : undefined;
  window.addEventListener("error", (event) => {
    captureException(event.error ?? new Error(event.message), {
      handled: false,
      severity: "fatal",
      error_code: "unhandled_error",
      stage: "window_error",
      screen_id: screenId,
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    captureException(event.reason, {
      handled: false,
      severity: "fatal",
      error_code: "unhandled_rejection",
      stage: "promise_rejection",
      screen_id: screenId,
    });
  });
}

export async function flushTelemetry(timeoutMs = 300): Promise<void> {
  const epoch = sdkEpoch;
  const deadline = Date.now() + timeoutMs;
  const work = (async () => {
    do {
      cancelScheduledDelivery?.();
      cancelScheduledDelivery = null;
      await deliverBatch();
    } while (queued.length && epoch === sdkEpoch && Date.now() < deadline);
    if (epoch === sdkEpoch) await sdk?.flush?.();
  })().catch(() => undefined);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      work,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

/** Numeric diagnostics for isolated tests and benchmarks; never sent as events. */
export function __getTelemetryDiagnosticsForTests() {
  return {
    queued: queued.length,
    pending: delivery ? 1 : 0,
    dropped,
    recentEvents: recentEvents.size,
    recentErrors: recentErrors.size,
  };
}

/** Isolated test injection; never called by the application. */
export function __configureTelemetryForTests(input: {
  config?: Partial<RuntimeConfig>;
  loader?: SdkLoader;
}): void {
  invalidateSdk();
  runtimeConfig = { ...runtimeConfig, ...input.config };
  sdkLoader = input.loader ?? defaultSdkLoader;
  snapshot = {
    status: EMPTY_TELEMETRY_STATUS,
    ready: false,
    available: false,
    configured: isRuntimeConfigured(runtimeConfig),
    saving: false,
  };
  backend = null;
  initialization = null;
  sdkInstanceSequence = 0;
  recentErrors.clear();
  recentEvents.clear();
  dropped = 0;
}
