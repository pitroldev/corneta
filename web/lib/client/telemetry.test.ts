import { describe, expect, it, vi } from "vitest";
import {
  SITE_TELEMETRY_CHANGE_EVENT,
  SITE_TELEMETRY_PREFERENCE_KEY,
  createBrowserTelemetry,
  editorialContentIdFromDocument,
  subscribeToSiteTelemetryPreference,
} from "./telemetry";

function fakeStorage(initial?: Record<string, string>) {
  const values = new Map(Object.entries(initial ?? {}));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

function fakeSdk() {
  return {
    init: vi.fn(),
    capture: vi.fn(),
    captureException: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    reset: vi.fn(),
  };
}

const UUID = "318f95fc-6f70-4cf5-a625-e250e43b1234";

describe("editorial content id", () => {
  it("accepts only the opaque metadata identifier", () => {
    const root = (content: string) =>
      ({
        querySelector: () => ({ content }),
      }) as unknown as Pick<Document, "querySelector">;

    expect(editorialContentIdFromDocument(root("guide_upload_speed"))).toBe(
      "guide_upload_speed",
    );
    expect(
      editorialContentIdFromDocument(root("/guides/quality?email=a@b.com")),
    ).toBeUndefined();
  });
});

describe("browser telemetry facade", () => {
  it.each(
    (["unset", "enabled", "disabled"] as const).flatMap((preference) =>
      (
        [
          "configured",
          "missing-token",
          "missing-host",
          "kill-switch",
          "browser-opt-out",
        ] as const
      ).map((configuration) => ({ preference, configuration })),
    ),
  )(
    "honours the site matrix: $preference / $configuration",
    async ({ preference, configuration }) => {
      const sdk = fakeSdk();
      const loadSdk = vi.fn(async () => sdk);
      const storage = fakeStorage(
        preference === "unset"
          ? {}
          : { [SITE_TELEMETRY_PREFERENCE_KEY]: preference },
      );
      const telemetry = createBrowserTelemetry({
        token: configuration === "missing-token" ? undefined : "phc_project123",
        host:
          configuration === "missing-host"
            ? undefined
            : "https://us.i.posthog.com",
        disabled: configuration === "kill-switch",
        doNotTrack: () => configuration === "browser-opt-out",
        loadSdk,
        storage: () => storage,
      });
      await telemetry.capturePageView("/");
      const active =
        preference !== "disabled" && configuration === "configured";
      expect(loadSdk).toHaveBeenCalledTimes(active ? 1 : 0);
      expect(sdk.capture).toHaveBeenCalledTimes(active ? 1 : 0);
    },
  );

  it("does not load the SDK without configuration or after opt-out", async () => {
    const sdk = fakeSdk();
    const loadSdk = vi.fn(async () => sdk);
    const missing = createBrowserTelemetry({ loadSdk });
    await missing.capturePageView("/");
    expect(loadSdk).not.toHaveBeenCalled();

    const optedOut = createBrowserTelemetry({
      token: "phc_project123",
      host: "https://us.i.posthog.com",
      loadSdk,
      storage: () => fakeStorage({ "corneta:site-telemetry:v1": "disabled" }),
    });
    await optedOut.capturePageView("/");
    expect(loadSdk).not.toHaveBeenCalled();

    const unavailableStorage = createBrowserTelemetry({
      token: "phc_project123",
      host: "https://us.i.posthog.com",
      loadSdk,
    });
    await unavailableStorage.capturePageView("/");
    expect(loadSdk).not.toHaveBeenCalled();

    const hostWithPath = createBrowserTelemetry({
      token: "phc_project123",
      host: "https://us.i.posthog.com/project/unsafe",
      loadSdk,
      storage: () => fakeStorage(),
    });
    await hostWithPath.capturePageView("/");
    expect(loadSdk).not.toHaveBeenCalled();
  });

  it("initializes in manual cookieless mode without content capture", async () => {
    const sdk = fakeSdk();
    const telemetry = createBrowserTelemetry({
      token: "phc_project123",
      host: "https://us.i.posthog.com",
      environment: "test",
      loadSdk: async () => sdk,
      storage: () => fakeStorage(),
      doNotTrack: () => false,
      randomUuid: () => UUID,
    });

    await telemetry.initialize();
    const config = sdk.init.mock.calls[0]?.[1];
    expect(config).toMatchObject({
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_exceptions: false,
      capture_performance: false,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      disable_scroll_properties: true,
      disableDeviceModel: true,
      disable_session_recording: true,
      disable_surveys: true,
      disable_product_tours: true,
      disable_external_dependency_loading: true,
      save_campaign_params: false,
      save_referrer: false,
      request_batching: false,
      advanced_disable_flags: true,
      advanced_disable_feature_flags: true,
      advanced_disable_feature_flags_on_first_load: true,
      cookieless_mode: "always",
      disable_persistence: true,
      mask_all_text: true,
      mask_all_element_attributes: true,
    });
  });

  it("captures only the route, locale, and enumerated CTA", async () => {
    const sdk = fakeSdk();
    const telemetry = createBrowserTelemetry({
      token: "phc_project123",
      host: "https://us.i.posthog.com",
      environment: "test",
      loadSdk: async () => sdk,
      storage: () => fakeStorage(),
      randomUuid: () => UUID,
    });

    await telemetry.capturePageView("/en?email=person@example.com#hero");
    await telemetry.captureCta(
      "hero_download",
      "/en?token=must-not-leak#download",
    );

    expect(sdk.capture).toHaveBeenNthCalledWith(
      1,
      "site_page_viewed",
      expect.objectContaining({ route_id: "home", locale: "en" }),
    );
    expect(sdk.capture).toHaveBeenNthCalledWith(
      2,
      "site_cta_clicked",
      expect.objectContaining({
        route_id: "home",
        locale: "en",
        cta_id: "hero_download",
      }),
      { transport: "sendBeacon", send_instantly: true },
    );
    expect(JSON.stringify(sdk.capture.mock.calls)).not.toContain("person@");
    expect(JSON.stringify(sdk.capture.mock.calls)).not.toContain(
      "must-not-leak",
    );
  });

  it("captures validated content_id and deduplicates articles without sending URLs", async () => {
    const sdk = fakeSdk();
    const telemetry = createBrowserTelemetry({
      token: "phc_project123",
      host: "https://us.i.posthog.com",
      environment: "test",
      loadSdk: async () => sdk,
      storage: () => fakeStorage(),
    });

    await telemetry.capturePageView(
      "/guides/multistream/obs-multistream?private=query#title",
      "guide_multistream_obs",
    );
    await telemetry.capturePageView(
      "/guides/multistream/obs-multistream?another=secret",
      "guide_multistream_obs",
    );
    await telemetry.capturePageView(
      "/guides/multistream/twitch-youtube-simultaneously",
      "guide_multistream_twitch_youtube",
    );
    await telemetry.capturePageView(
      "/guides/multistream/leak",
      "guide_multistream/leak?token=secret",
    );
    await telemetry.captureCta(
      "content_related",
      "/guides/multistream/obs-multistream?token=must-not-leak",
      "guide_multistream_obs",
    );

    expect(sdk.capture).toHaveBeenCalledTimes(3);
    expect(sdk.capture).toHaveBeenNthCalledWith(
      1,
      "site_page_viewed",
      expect.objectContaining({
        route_id: "guide_article",
        locale: "pt-BR",
        content_id: "guide_multistream_obs",
      }),
    );
    expect(sdk.capture).toHaveBeenNthCalledWith(
      2,
      "site_page_viewed",
      expect.objectContaining({
        route_id: "guide_article",
        content_id: "guide_multistream_twitch_youtube",
      }),
    );
    expect(sdk.capture).toHaveBeenNthCalledWith(
      3,
      "site_cta_clicked",
      expect.objectContaining({
        route_id: "guide_article",
        cta_id: "content_related",
        content_id: "guide_multistream_obs",
      }),
      { transport: "sendBeacon", send_instantly: true },
    );
    const serialized = JSON.stringify(sdk.capture.mock.calls);
    expect(serialized).not.toContain("private=query");
    expect(serialized).not.toContain("another=secret");
    expect(serialized).not.toContain("must-not-leak");
    expect(serialized).not.toContain("guide_multistream/leak");
  });

  it("redacts exceptions and stops capture immediately on opt-out", async () => {
    const sdk = fakeSdk();
    const storage = fakeStorage();
    const telemetry = createBrowserTelemetry({
      token: "phc_project123",
      host: "https://us.i.posthog.com",
      environment: "test",
      loadSdk: async () => sdk,
      storage: () => storage,
      randomUuid: () => UUID,
    });
    const error = new Error("Bearer secret-token for person@example.com");
    error.name = "CanalSentinela19";
    error.stack = `CanalSentinela19: secret\n    at run (C:\\Users\\petro\\app.ts:10:2)`;

    await telemetry.captureException(error, "/", false);
    const capturedError = sdk.captureException.mock.calls[0]?.[0] as Error;
    expect(capturedError.name).toBe("UnknownError");
    expect(capturedError.message).toBe("Unexpected browser error");
    expect(capturedError.stack).not.toContain("CanalSentinela19");
    expect(capturedError.stack).not.toContain("secret-token");
    expect(capturedError.stack).not.toContain("\\Users\\petro");
    expect(sdk.captureException.mock.calls[0]?.[1]).not.toHaveProperty(
      "$exception_fingerprint",
    );
    expect(sdk.captureException.mock.calls[0]?.[1]).toMatchObject({
      error_type: "UnknownError",
    });

    await telemetry.setEnabled(false);
    await telemetry.captureCta("hero_download", "/");
    expect(sdk.opt_out_capturing).toHaveBeenCalledOnce();
    expect(sdk.reset).toHaveBeenCalledWith(true);
    expect(sdk.capture).not.toHaveBeenCalled();
  });

  it("retries loading after a transient failure", async () => {
    const sdk = fakeSdk();
    const loadSdk = vi
      .fn<() => Promise<ReturnType<typeof fakeSdk>>>()
      .mockRejectedValueOnce(new Error("chunk offline"))
      .mockResolvedValueOnce(sdk);
    const telemetry = createBrowserTelemetry({
      token: "phc_project123",
      host: "https://us.i.posthog.com",
      loadSdk,
      storage: () => fakeStorage(),
    });

    await expect(telemetry.initialize()).resolves.toBeUndefined();
    await expect(telemetry.initialize()).resolves.toBe(sdk);
    expect(loadSdk).toHaveBeenCalledTimes(2);
    expect(sdk.init).toHaveBeenCalledOnce();
  });

  it("allows reactivation after opt-out during download without racing to capture", async () => {
    const sdk = fakeSdk();
    const storage = fakeStorage();
    let resolveSdk!: (value: ReturnType<typeof fakeSdk>) => void;
    const firstLoad = new Promise<ReturnType<typeof fakeSdk>>((resolve) => {
      resolveSdk = resolve;
    });
    const loadSdk = vi
      .fn<() => Promise<ReturnType<typeof fakeSdk>>>()
      .mockReturnValueOnce(firstLoad)
      .mockResolvedValueOnce(sdk);
    const telemetry = createBrowserTelemetry({
      token: "phc_project123",
      host: "https://us.i.posthog.com",
      loadSdk,
      storage: () => storage,
    });

    const capture = telemetry.capturePageView("/");
    await telemetry.setEnabled(false);
    resolveSdk(sdk);
    await capture;
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.capture).not.toHaveBeenCalled();

    await telemetry.setEnabled(true);
    expect(loadSdk).toHaveBeenCalledTimes(2);
    expect(sdk.init).toHaveBeenCalledOnce();
    expect(sdk.capture).not.toHaveBeenCalled();
  });

  it("notifies local and cross-tab changes only for the preference", () => {
    const originalWindow = globalThis.window;
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    const onStoreChange = vi.fn();
    const unsubscribe = subscribeToSiteTelemetryPreference(onStoreChange);

    target.dispatchEvent(new Event(SITE_TELEMETRY_CHANGE_EVENT));
    const unrelated = new Event("storage");
    Object.defineProperty(unrelated, "key", { value: "unrelated" });
    target.dispatchEvent(unrelated);
    const preference = new Event("storage");
    Object.defineProperty(preference, "key", {
      value: SITE_TELEMETRY_PREFERENCE_KEY,
    });
    target.dispatchEvent(preference);
    const cleared = new Event("storage");
    Object.defineProperty(cleared, "key", { value: null });
    target.dispatchEvent(cleared);

    expect(onStoreChange).toHaveBeenCalledTimes(3);
    unsubscribe();
    target.dispatchEvent(new Event(SITE_TELEMETRY_CHANGE_EVENT));
    expect(onStoreChange).toHaveBeenCalledTimes(3);
    vi.stubGlobal("window", originalWindow);
  });
});
