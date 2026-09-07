import type { PostHogConfig } from "posthog-js/dist/module.no-external";

import {
  SITE_CTA_IDS,
  normalizeContentId,
  normalizePostHogHost,
  redactPostHogMessage,
  redactedException,
  sanitizeTelemetryProperties,
  siteRoute,
  telemetryBaseProperties,
  type SiteCtaId,
} from "../telemetry-schema";

export const SITE_TELEMETRY_PREFERENCE_KEY = "corneta:site-telemetry:v1";
export const SITE_TELEMETRY_CHANGE_EVENT = "corneta:site-telemetry-change";

type BrowserPostHog = {
  init: (token: string, config: Partial<PostHogConfig>) => unknown;
  capture: (
    event: string,
    properties?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => unknown;
  captureException: (
    error: unknown,
    properties?: Record<string, unknown>,
  ) => unknown;
  opt_in_capturing: () => void;
  opt_out_capturing: () => void;
  reset?: (resetDeviceId?: boolean) => void;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type BrowserTelemetryOptions = {
  token?: string;
  host?: string;
  disabled?: boolean;
  environment?: string;
  buildSha?: string;
  loadSdk: () => Promise<BrowserPostHog>;
  storage?: () => StorageLike | undefined;
  doNotTrack?: () => boolean;
  randomUuid?: () => string;
};

export type SiteTelemetry = ReturnType<typeof createBrowserTelemetry>;

const CTA_IDS = new Set<string>(SITE_CTA_IDS);

function validProjectToken(token: string | undefined) {
  return Boolean(token && /^phc_[A-Za-z0-9_-]{8,}$/.test(token));
}

function safely<T>(run: () => T, fallback: T): T {
  try {
    return run();
  } catch {
    return fallback;
  }
}

export function createBrowserTelemetry(options: BrowserTelemetryOptions) {
  const host = normalizePostHogHost(options.host);
  const configured =
    !options.disabled && validProjectToken(options.token) && Boolean(host);
  const capturedErrors = new WeakSet<object>();
  const capturedPrimitiveErrors = new Map<string, number>();
  let sdk: BrowserPostHog | undefined;
  let sdkPromise: Promise<BrowserPostHog | undefined> | undefined;
  let lastPage: string | undefined;

  const storage = () => safely(() => options.storage?.(), undefined);
  const hasLocalOptOut = () => {
    const store = storage();
    if (!store) return true;
    return safely(
      () => store.getItem(SITE_TELEMETRY_PREFERENCE_KEY) === "disabled",
      true,
    );
  };
  const respectsBrowserOptOut = () =>
    safely(() => options.doNotTrack?.() === true, false);
  const isOptedOut = () => hasLocalOptOut() || respectsBrowserOptOut();

  const ensureSdk = async () => {
    if (!configured || isOptedOut()) return undefined;
    if (sdk) return sdk;
    if (sdkPromise) return sdkPromise;

    const pending = options
      .loadSdk()
      .then((loaded) => {
        // Recheck opt-out after the asynchronous SDK download.
        if (isOptedOut()) return undefined;
        loaded.init(options.token!, {
          api_host: host,
          defaults: "2026-05-30",
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          capture_exceptions: false,
          capture_performance: false,
          capture_dead_clicks: false,
          capture_heatmaps: false,
          rageclick: false,
          disable_scroll_properties: true,
          disableDeviceModel: true,
          disable_session_recording: true,
          enable_recording_console_log: false,
          disable_surveys: true,
          disable_surveys_automatic_display: true,
          disable_conversations: true,
          disable_product_tours: true,
          disable_web_experiments: true,
          disable_external_dependency_loading: true,
          save_campaign_params: false,
          save_referrer: false,
          request_batching: false,
          // Disable remote configuration as well as flag requests.
          advanced_disable_flags: true,
          advanced_disable_feature_flags: true,
          advanced_disable_feature_flags_on_first_load: true,
          advanced_disable_toolbar_metrics: true,
          remote_config_refresh_interval_ms: 0,
          cookieless_mode: "always",
          disable_persistence: true,
          persistence: "memory",
          person_profiles: "identified_only",
          respect_dnt: true,
          mask_all_text: true,
          mask_all_element_attributes: true,
          disable_capture_url_hashes: true,
          before_send: redactPostHogMessage,
          on_request_error: () => undefined,
        });
        sdk = loaded;
        return loaded;
      })
      .catch(() => undefined)
      .finally(() => {
        // Clear only this attempt so failure or opt-out does not block later initialization.
        if (sdkPromise === pending) sdkPromise = undefined;
      });
    sdkPromise = pending;
    return pending;
  };

  const capture = async (
    event: "site_page_viewed" | "site_cta_clicked",
    properties: Record<string, unknown>,
    immediate = false,
  ) => {
    if (isOptedOut()) return;
    const safe = sanitizeTelemetryProperties(event, properties);
    if (!safe) return;
    const client = await ensureSdk();
    if (!client || isOptedOut()) return;
    try {
      client.capture(
        event,
        safe,
        immediate
          ? { transport: "sendBeacon", send_instantly: true }
          : undefined,
      );
    } catch {
      // Telemetry must not affect navigation.
    }
  };

  const capturePageView = async (pathOrUrl: string, contentId?: string) => {
    const route = siteRoute(pathOrUrl);
    const safeContentId = normalizeContentId(contentId);
    if (contentId !== undefined && !safeContentId) return;
    const pageKey = `${route.routeId}:${route.locale}:${safeContentId ?? ""}`;
    if (lastPage === pageKey || isOptedOut()) return;
    const safe = sanitizeTelemetryProperties("site_page_viewed", {
      ...telemetryBaseProperties(
        "marketing_site",
        options.environment,
        options.buildSha,
      ),
      route_id: route.routeId,
      locale: route.locale,
      ...(safeContentId ? { content_id: safeContentId } : {}),
    });
    if (!safe) return;
    const client = await ensureSdk();
    if (!client || isOptedOut() || lastPage === pageKey) return;
    lastPage = pageKey;
    try {
      client.capture("site_page_viewed", safe);
    } catch {
      lastPage = undefined;
    }
  };

  const captureCta = (
    ctaId: SiteCtaId,
    pathOrUrl: string,
    contentId?: string,
  ) => {
    const route = siteRoute(pathOrUrl);
    const safeContentId = normalizeContentId(contentId);
    if (contentId !== undefined && !safeContentId) return Promise.resolve();
    return capture(
      "site_cta_clicked",
      {
        ...telemetryBaseProperties(
          "marketing_site",
          options.environment,
          options.buildSha,
        ),
        route_id: route.routeId,
        locale: route.locale,
        cta_id: ctaId,
        ...(safeContentId ? { content_id: safeContentId } : {}),
      },
      true,
    );
  };

  const captureException = async (
    error: unknown,
    pathOrUrl: string,
    handled = false,
  ) => {
    if (isOptedOut()) return;
    if (error && typeof error === "object") {
      if (capturedErrors.has(error)) return;
      capturedErrors.add(error);
    } else {
      const key = String(error).slice(0, 128);
      const now = Date.now();
      const previous = capturedPrimitiveErrors.get(key) ?? 0;
      if (now - previous < 2_000) return;
      capturedPrimitiveErrors.set(key, now);
    }

    const route = siteRoute(pathOrUrl);
    const errorId = options.randomUuid?.() ?? crypto.randomUUID();
    const type =
      error instanceof Error && error.name ? error.name : "UnknownError";
    const safeProperties = sanitizeTelemetryProperties("$exception", {
      ...telemetryBaseProperties(
        "marketing_site",
        options.environment,
        options.buildSha,
      ),
      error_id: errorId,
      route_id: route.routeId,
      error_code: "UNEXPECTED_ERROR",
      handled,
      severity: "error",
      error_type: type,
      $exception_handled: handled,
    });
    if (!safeProperties) return;
    const client = await ensureSdk();
    if (!client || isOptedOut()) return;
    try {
      client.captureException(
        redactedException(error, "Unexpected browser error"),
        safeProperties,
      );
    } catch {
      // Error reporting must not mask the original failure.
    }
  };

  const setEnabled = async (enabled: boolean) => {
    const store = storage();
    if (enabled) {
      safely(() => store?.removeItem(SITE_TELEMETRY_PREFERENCE_KEY), undefined);
      if (respectsBrowserOptOut()) return false;
      const client = await ensureSdk();
      try {
        client?.opt_in_capturing();
      } catch {
        // The local preference remains effective if the SDK fails.
      }
      return Boolean(client);
    }

    safely(
      () => store?.setItem(SITE_TELEMETRY_PREFERENCE_KEY, "disabled"),
      undefined,
    );
    lastPage = undefined;
    try {
      sdk?.opt_out_capturing();
      sdk?.reset?.(true);
    } catch {
      // The local gate already blocks new captures if SDK reset fails.
    }
    return false;
  };

  return {
    initialize: ensureSdk,
    capturePageView,
    captureCta,
    captureException,
    isOptedOut,
    setEnabled,
  };
}

const browserTelemetry = createBrowserTelemetry({
  token: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  disabled: process.env.NEXT_PUBLIC_TELEMETRY_DISABLED === "1",
  environment:
    process.env.NEXT_PUBLIC_DEPLOYMENT_ENV ?? process.env.NODE_ENV ?? "unknown",
  buildSha: process.env.NEXT_PUBLIC_BUILD_SHA,
  loadSdk: async () => {
    // Keep extensions bundled; remote configuration must not inject browser code.
    const posthogModule = await import("posthog-js/dist/module.no-external");
    return posthogModule.default as unknown as BrowserPostHog;
  },
  storage: () => window.localStorage,
  doNotTrack: () => {
    const privacyNavigator = navigator as Navigator & {
      globalPrivacyControl?: boolean;
    };
    return (
      privacyNavigator.globalPrivacyControl === true ||
      navigator.doNotTrack === "1"
    );
  },
  randomUuid: () => crypto.randomUUID(),
});

export function initializeSiteTelemetry() {
  return browserTelemetry.initialize();
}

export function captureSitePageView(pathOrUrl: string, contentId?: string) {
  return browserTelemetry.capturePageView(pathOrUrl, contentId);
}

/** Read only the allowlisted opaque article identifier. */
export function editorialContentIdFromDocument(
  root: Pick<Document, "querySelector"> = document,
) {
  const value = root
    .querySelector<HTMLMetaElement>('meta[name="corneta:content-id"]')
    ?.content.trim();
  return normalizeContentId(value);
}

export function captureSiteException(
  error: unknown,
  pathOrUrl: string,
  handled = false,
) {
  return browserTelemetry.captureException(error, pathOrUrl, handled);
}

export function isSiteTelemetryOptedOut() {
  return browserTelemetry.isOptedOut();
}

export function subscribeToSiteTelemetryPreference(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === SITE_TELEMETRY_PREFERENCE_KEY) {
      onStoreChange();
    }
  };

  window.addEventListener(SITE_TELEMETRY_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SITE_TELEMETRY_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

export async function setSiteTelemetryEnabled(enabled: boolean) {
  const active = await browserTelemetry.setEnabled(enabled);
  window.dispatchEvent(
    new CustomEvent(SITE_TELEMETRY_CHANGE_EVENT, {
      detail: { enabled: active },
    }),
  );
  if (active) {
    const contentId = editorialContentIdFromDocument();
    void browserTelemetry.capturePageView(window.location.pathname, contentId);
  }
  return active;
}

export function installSiteTelemetryListeners() {
  const onError = (event: ErrorEvent) => {
    void browserTelemetry.captureException(
      event.error ?? new Error("Window error"),
      window.location.pathname,
      false,
    );
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    void browserTelemetry.captureException(
      event.reason,
      window.location.pathname,
      false,
    );
  };
  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const cta = target.closest<HTMLElement>("[data-telemetry-cta]");
    const ctaId = cta?.dataset.telemetryCta;
    if (!cta || !ctaId || !CTA_IDS.has(ctaId)) return;
    const contentId =
      cta.dataset.telemetryContentId ??
      cta.closest<HTMLElement>("[data-telemetry-content-id]")?.dataset
        .telemetryContentId;
    void browserTelemetry.captureCta(
      ctaId as SiteCtaId,
      window.location.pathname,
      contentId,
    );
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  document.addEventListener("click", onClick, { capture: true });

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    document.removeEventListener("click", onClick, { capture: true });
  };
}
