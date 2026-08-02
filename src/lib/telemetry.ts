import { useSyncExternalStore } from "react";
import type { PostHogConfig } from "posthog-js/dist/module.no-external";
import {
  EMPTY_TELEMETRY_STATUS,
  REMOTE_DESKTOP_ERROR_MESSAGE,
  TELEMETRY_NOTICE_VERSION,
  TELEMETRY_SCHEMA_VERSION,
  createTelemetryId,
  isTelemetryErrorCode,
  isTelemetryStage,
  isUuid,
  needsTelemetryDecision,
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
}

type SdkLoader = () => Promise<PostHogSdk>;

interface RuntimeConfig {
  token: string;
  host: string;
  buildSha: string;
  disabled: boolean;
  environment: TelemetryContext["environment"];
}

export type BufferedOnboardingTelemetryEvent =
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
const MAX_BUFFERED_ONBOARDING_EVENTS = 16;
const POSTHOG_CONSENT_PREFIX = "__ph_opt_in_out_";

const bootAt = Date.now();
const listeners = new Set<() => void>();
const pending = new Set<Promise<void>>();
const seenErrors = new WeakMap<object, string>();
const recentErrors = new Map<string, { id: string; at: number }>();
const recentEvents = new Map<string, number>();
const bufferedOnboardingEvents: BufferedOnboardingTelemetryEvent[] = [];

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
  return (
    !config.disabled &&
    /^phc_[A-Za-z0-9_-]{8,}$/.test(config.token) &&
    safePostHogHost(config.host) !== null &&
    /^[0-9a-f]{0,40}$/i.test(config.buildSha)
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

// Os portões não olham a versão do aviso, e isso é deliberado: com legítimo
// interesse, texto novo é INFORMAÇÃO e não pedido de permissão. Quem gate é a
// oposição (`disabled`), que atravessa qualquer versão. Ver
// `telemetryPurposeActive` e docs/LGPD-LEGITIMO-INTERESSE-TELEMETRIA.md.
function canCaptureUsage(): boolean {
  return (
    telemetryPurposeActive(snapshot.status.usage) &&
    isUuid(snapshot.status.installationId) &&
    snapshot.configured
  );
}

function canCaptureCrashes(): boolean {
  return (
    telemetryPurposeActive(snapshot.status.crashReports) &&
    isUuid(snapshot.status.installationId) &&
    snapshot.configured
  );
}

function anyEnabledChoice(status = snapshot.status): boolean {
  return (
    telemetryPurposeActive(status.usage) ||
    telemetryPurposeActive(status.crashReports)
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

function safeBufferedOnboardingEvent(
  input: BufferedOnboardingTelemetryEvent,
): BufferedOnboardingTelemetryEvent | null {
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

function replayBufferedOnboarding(): void {
  const events = bufferedOnboardingEvents.splice(
    0,
    bufferedOnboardingEvents.length,
  );
  for (const item of events) {
    if (item.event === "onboarding_started")
      capture(item.event, item.properties);
    else if (item.event === "onboarding_step_completed")
      capture(item.event, item.properties);
    else capture(item.event, item.properties);
  }
}

function resolveBufferedOnboarding(status: TelemetryStatus): void {
  if (telemetryPurposeActive(status.usage)) replayBufferedOnboarding();
  else discardBufferedOnboardingTelemetry();
}

async function defaultSdkLoader(): Promise<PostHogSdk> {
  const module = await import("posthog-js/dist/module.no-external");
  return module.default as unknown as PostHogSdk;
}

function beforeSend(
  value: unknown,
  epoch: number,
  installationId: string,
): PostHogLikeEvent | null {
  // O gate fica preso à identidade desta instalação do SDK. Assim, mesmo se
  // uma instância antiga conservar callbacks e o consentimento voltar ao
  // estado anterior (ABA), ela não consegue enviar depois da revogação.
  if (sdkEpoch !== epoch || snapshot.status.installationId !== installationId)
    return null;
  return sanitizePostHogEvent(
    value as PostHogLikeEvent | null,
    telemetryContext(),
    canCaptureUsage(),
    canCaptureCrashes(),
  );
}

/** `telemetry.json` é a única autoridade de consentimento persistente. */
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
    // WebViews com storage indisponível continuam protegidas pelo gate/epoch.
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
    // Cookies podem estar bloqueados; não há o que persistir nesse caso.
  }
}

function clearSdkConsent(current: PostHogSdk | null): void {
  try {
    current?.clear_opt_in_out_capturing?.();
  } catch {
    // A limpeza explícita abaixo cobre versões/mocks sem a API.
  }
  clearPostHogConsentStorage();
}

/**
 * Invalida também loaders em voo. O epoch impede que uma resolução antiga
 * reinstale o SDK; limpar a referência permite que o consentimento restante
 * abra uma instância nova sem esperar a Promise obsoleta.
 */
function retireSdk(current: PostHogSdk | null): void {
  try {
    current?.opt_out_capturing?.();
  } catch {
    // Revogação local não pode falhar por causa do SDK.
  }
  try {
    current?.reset?.(true);
  } catch {
    // A referência já não será reutilizada.
  }
  clearSdkConsent(current);
}

function invalidateSdk(): void {
  sdkEpoch += 1;
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
    !snapshot.status.installationId
  )
    return null;

  if (sdk) {
    if (sdkInstallationId !== snapshot.status.installationId) {
      // Uma instância nova recebe o ID via bootstrap anônimo. Reusar `identify`
      // transformaria o UUID em perfil identificado e conservaria um device_id
      // auxiliar que a pessoa não consegue consultar/excluir.
      invalidateSdk();
    } else {
      clearSdkConsent(sdk);
      return sdk;
    }
  }
  if (sdkPromise) return sdkPromise;

  const installationId = snapshot.status.installationId;
  const epoch = sdkEpoch;
  const loading = sdkLoader()
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
            // Um callback loaded atrasado não pode reabilitar a instância
            // revogada. Se o mock reutilizou o mesmo objeto como instância
            // atual, apenas ignora o callback antigo para não resetar a nova.
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
    .catch(() => null);
  sdkPromise = loading;
  void loading.finally(() => {
    // Uma Promise de epoch antigo não pode apagar a referência da nova.
    if (sdkPromise === loading) sdkPromise = null;
  });
  return loading;
}

function schedule(task: () => Promise<void>): void {
  const promise = task()
    .catch(() => {
      // Telemetria nunca disputa a UX nem o pipeline de mídia.
    })
    .finally(() => pending.delete(promise));
  pending.add(promise);
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
      if (anyCurrentConsent()) schedule(async () => void (await ensureSdk()));
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

  const previous = snapshot.status;
  // Oposição é sair de ATIVA (que inclui `unset`) pra `disabled` — com opt-out,
  // comparar contra "enabled" deixaria de invalidar o SDK de quem nunca tinha
  // mexido nos interruptores e acabou de desligar.
  const revoked =
    (telemetryPurposeActive(previous.usage) && input.usage === "disabled") ||
    (telemetryPurposeActive(previous.crashReports) &&
      input.crashReports === "disabled");
  if (revoked) invalidateSdk();
  const refusingBoth =
    input.usage === "disabled" && input.crashReports === "disabled";
  const optimistic: TelemetryStatus = {
    ...previous,
    noticeVersion:
      previous.noticeVersion === TELEMETRY_NOTICE_VERSION || refusingBoth
        ? TELEMETRY_NOTICE_VERSION
        : previous.noticeVersion,
    // Desabilitar fecha o gate no clique; habilitar só abre depois que o
    // backend persistir com sucesso a decisão da versão atual do aviso.
    usage: input.usage === "disabled" ? "disabled" : previous.usage,
    crashReports:
      input.crashReports === "disabled" ? "disabled" : previous.crashReports,
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
    resolveBufferedOnboarding(status);
    if (anyCurrentConsent(status)) {
      schedule(async () => void (await ensureSdk()));
    } else {
      invalidateSdk();
    }
    return status;
  } catch (error) {
    updateSnapshot({ status: previous, saving: false });
    if (anyCurrentConsent(previous))
      schedule(async () => void (await ensureSdk()));
    throw error;
  }
}

export async function regenerateTelemetryId(): Promise<TelemetryStatus> {
  if (!backend || !snapshot.available)
    throw new Error("telemetry_backend_unavailable");
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
  const safe = sanitizeTelemetryProperties(
    event,
    properties as Record<string, unknown>,
    telemetryContext(),
  );
  if (!safe) return;

  // React StrictMode executa alguns efeitos duas vezes em desenvolvimento.
  const signature = eventSignature(
    event,
    properties as Record<string, unknown>,
  );
  const now = Date.now();
  if (now - (recentEvents.get(signature) ?? 0) < 750) return;
  recentEvents.set(signature, now);
  if (recentEvents.size > 100) {
    for (const [key, at] of recentEvents) {
      if (now - at > 30_000) recentEvents.delete(key);
    }
  }

  const epoch = sdkEpoch;
  schedule(async () => {
    const client = await ensureSdk();
    if (!client || sdkEpoch !== epoch || sdk !== client || !canCaptureUsage())
      return;
    client.capture(event, safe);
  });
}

/**
 * Única exceção ao no-op pré-consentimento: guarda somente o funil fechado do
 * onboarding em memória. Nada é persistido, o SDK não é carregado e o replay
 * só ocorre depois de um opt-in de uso da versão atual do aviso.
 */
export function captureOnboarding(
  input: BufferedOnboardingTelemetryEvent,
): void {
  const safe = safeBufferedOnboardingEvent(input);
  if (!safe) return;
  if (canCaptureUsage()) {
    if (safe.event === "onboarding_started")
      capture(safe.event, safe.properties);
    else if (safe.event === "onboarding_step_completed")
      capture(safe.event, safe.properties);
    else capture(safe.event, safe.properties);
    return;
  }
  if (
    !snapshot.ready ||
    !snapshot.available ||
    !needsTelemetryDecision(snapshot.status) ||
    bufferedOnboardingEvents.length >= MAX_BUFFERED_ONBOARDING_EVENTS
  )
    return;
  const signature = JSON.stringify(safe);
  if (
    bufferedOnboardingEvents.some((item) => JSON.stringify(item) === signature)
  )
    return;
  bufferedOnboardingEvents.push(safe);
}

export function discardBufferedOnboardingTelemetry(): void {
  bufferedOnboardingEvents.splice(0, bufferedOnboardingEvents.length);
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

  // O ID é diagnóstico local e continua disponível para copiar no boundary.
  // Sem consentimento não sanitizamos para o SDK, não o carregamos e não enviamos.
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
  schedule(async () => {
    const client = await ensureSdk();
    if (!client || sdkEpoch !== epoch || sdk !== client || !canCaptureCrashes())
      return;
    client.captureException(redactedError, safe);
  });
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
  schedule(async () => {
    const client = await ensureSdk();
    if (!client || sdkEpoch !== epoch || sdk !== client || !canCaptureCrashes())
      return;
    client.addExceptionStep?.(name, safe);
  });
}

export function installGlobalErrorHandlers(): void {
  if (globalHandlersInstalled || typeof window === "undefined") return;
  globalHandlersInstalled = true;
  window.addEventListener("error", (event) => {
    captureException(event.error ?? new Error(event.message), {
      handled: false,
      severity: "fatal",
      error_code: "unhandled_error",
      stage: "window_error",
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    captureException(event.reason, {
      handled: false,
      severity: "fatal",
      error_code: "unhandled_rejection",
      stage: "promise_rejection",
    });
  });
}

export async function flushTelemetry(timeoutMs = 300): Promise<void> {
  const work = Promise.allSettled([...pending]).then(async () => {
    await sdk?.flush?.();
  });
  await Promise.race([
    work,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export function telemetryBootDuration(): number {
  return Date.now() - bootAt;
}

/** Injeção isolada para testes; não é chamada pelo aplicativo. */
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
  discardBufferedOnboardingTelemetry();
  pending.clear();
}
