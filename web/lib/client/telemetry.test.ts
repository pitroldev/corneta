import { describe, expect, it, vi } from "vitest";
import {
  SITE_TELEMETRY_CHANGE_EVENT,
  SITE_TELEMETRY_PREFERENCE_KEY,
  createBrowserTelemetry,
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

describe("browser telemetry facade", () => {
  it("não carrega o SDK sem configuração ou após opt-out", async () => {
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

  it("inicializa em modo cookieless, manual e sem captura de conteúdo", async () => {
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

  it("captura só rota, idioma e CTA enumerada", async () => {
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

  it("redige exceções e interrompe a captura imediatamente ao desativar", async () => {
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

  it("tenta carregar novamente depois de falha transitória", async () => {
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

  it("permite reativar depois de opt-out durante o download sem enviar na corrida", async () => {
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

  it("notifica mudanças locais e de outras abas apenas para a preferência", () => {
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
