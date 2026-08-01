import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __configureTelemetryForTests,
  capture,
  captureException,
  captureOnboarding,
  discardBufferedOnboardingTelemetry,
  flushTelemetry,
  initializeTelemetry,
  regenerateTelemetryId,
  setTelemetryConsent,
  type TelemetryBackend,
} from "./telemetry";
import {
  REMOTE_DESKTOP_ERROR_MESSAGE,
  type TelemetryStatus,
} from "./telemetry-schema";

const INSTALLATION_ID = "00000000-0000-4000-8000-000000000001";
const POSTHOG_CONSENT_KEY = "__ph_opt_in_out_phc_public_test_token";

afterEach(() => vi.unstubAllGlobals());

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

function status(
  usage: TelemetryStatus["usage"],
  crashReports: TelemetryStatus["crashReports"],
  noticeVersion = "2026-08-01",
): TelemetryStatus {
  return {
    schemaVersion: 1,
    noticeVersion,
    usage,
    crashReports,
    installationId:
      usage === "enabled" || crashReports === "enabled"
        ? INSTALLATION_ID
        : null,
    decidedAt: "2026-08-01T12:00:00.000Z",
  };
}

function backend(initial: TelemetryStatus): TelemetryBackend {
  let current = initial;
  return {
    async telemetryStatus() {
      return current;
    },
    async telemetrySetConsent(input) {
      current = {
        ...current,
        ...input,
        installationId:
          input.usage === "enabled" || input.crashReports === "enabled"
            ? (current.installationId ?? INSTALLATION_ID)
            : current.installationId,
      };
      return current;
    },
    async telemetryRegenerateId() {
      current = { ...current, installationId: null };
      return current;
    },
  };
}

function sdkHarness() {
  const captures: Array<{
    event: string;
    properties?: Record<string, unknown>;
  }> = [];
  const exceptions: Array<{
    error: Error;
    properties?: Record<string, unknown>;
  }> = [];
  const instance = {
    init: vi.fn(function init(
      _token: string,
      options: Record<string, unknown>,
    ) {
      const loaded = options.loaded as
        ((sdk: typeof instance) => void) | undefined;
      loaded?.(instance);
      return instance;
    }),
    capture: vi.fn((event: string, properties?: Record<string, unknown>) => {
      captures.push({ event, properties });
    }),
    captureException: vi.fn(
      (error: Error, properties?: Record<string, unknown>) => {
        exceptions.push({ error, properties });
      },
    ),
    addExceptionStep: vi.fn(),
    opt_in_capturing: vi.fn(() => {
      if (typeof localStorage !== "undefined")
        localStorage.setItem(POSTHOG_CONSENT_KEY, "1");
    }),
    opt_out_capturing: vi.fn(() => {
      if (typeof localStorage !== "undefined")
        localStorage.setItem(POSTHOG_CONSENT_KEY, "0");
    }),
    clear_opt_in_out_capturing: vi.fn(() => {
      if (typeof localStorage !== "undefined")
        localStorage.removeItem(POSTHOG_CONSENT_KEY);
    }),
    reset: vi.fn(),
    flush: vi.fn(),
  };
  const loader = vi.fn(async () => instance);
  return { instance, loader, captures, exceptions };
}

function configure(loader: ReturnType<typeof sdkHarness>["loader"]) {
  __configureTelemetryForTests({
    config: {
      token: "phc_public_test_token",
      host: "https://us.i.posthog.com",
      buildSha: "abc123",
      disabled: false,
      environment: "development",
    },
    loader,
  });
}

describe("telemetry facade", () => {
  it("does not load the SDK or issue work without consent", async () => {
    const harness = sdkHarness();
    configure(harness.loader);
    await initializeTelemetry(backend(status("disabled", "disabled")));
    capture("screen_viewed", { screen_id: "settings" });
    const errorId = captureException(new Error("boom"), {
      handled: false,
      severity: "error",
      error_code: "screen_render_failed",
      stage: "screen_render",
    });
    await flushTelemetry();
    expect(harness.loader).not.toHaveBeenCalled();
    expect(harness.captures).toHaveLength(0);
    expect(harness.exceptions).toHaveLength(0);
    expect(errorId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("does not honor enabled consent from an older notice", async () => {
    const harness = sdkHarness();
    configure(harness.loader);
    await initializeTelemetry(
      backend(status("enabled", "enabled", "2026-07-01")),
    );
    capture("screen_viewed", { screen_id: "settings" });
    captureException(new Error("boom"), {
      handled: false,
      severity: "error",
      error_code: "screen_render_failed",
      stage: "screen_render",
    });
    await flushTelemetry();
    expect(harness.loader).not.toHaveBeenCalled();
    expect(harness.captures).toHaveLength(0);
    expect(harness.exceptions).toHaveLength(0);
  });

  it("loads conditionally and captures only catalogued properties", async () => {
    const harness = sdkHarness();
    configure(harness.loader);
    await initializeTelemetry(backend(status("enabled", "disabled")));
    capture("screen_viewed", { screen_id: "settings" });
    await flushTelemetry();
    expect(harness.loader).toHaveBeenCalledTimes(1);
    expect(harness.captures).toHaveLength(1);
    expect(harness.captures[0]).toMatchObject({
      event: "screen_viewed",
      properties: { screen_id: "settings", surface: "desktop_ui" },
    });
  });

  it("keeps first-run onboarding local and replays it only after usage opt-in", async () => {
    const harness = sdkHarness();
    configure(harness.loader);
    const native = backend(status("unset", "unset"));
    await initializeTelemetry(native);

    captureOnboarding({
      event: "onboarding_started",
      properties: { entry_point: "first_run" },
    });
    captureOnboarding({
      event: "onboarding_step_completed",
      properties: { step_id: "welcome" },
    });
    captureOnboarding({
      event: "onboarding_completed",
      properties: { duration_bucket: "10_30s" },
    });
    await flushTelemetry();
    expect(harness.loader).not.toHaveBeenCalled();
    expect(harness.captures).toHaveLength(0);

    await setTelemetryConsent({ usage: "enabled", crashReports: "disabled" });
    await flushTelemetry();
    expect(harness.captures.map(({ event }) => event)).toEqual([
      "onboarding_started",
      "onboarding_step_completed",
      "onboarding_completed",
    ]);
  });

  it("discards deferred onboarding instead of replaying it later", async () => {
    const harness = sdkHarness();
    configure(harness.loader);
    await initializeTelemetry(backend(status("unset", "unset")));
    captureOnboarding({
      event: "onboarding_started",
      properties: { entry_point: "first_run" },
    });
    discardBufferedOnboardingTelemetry();
    await setTelemetryConsent({ usage: "enabled", crashReports: "disabled" });
    await flushTelemetry();
    expect(harness.captures).toHaveLength(0);
  });

  it("discards refused onboarding before a later opt-in", async () => {
    const harness = sdkHarness();
    configure(harness.loader);
    await initializeTelemetry(backend(status("unset", "unset")));
    captureOnboarding({
      event: "onboarding_started",
      properties: { entry_point: "first_run" },
    });
    await setTelemetryConsent({ usage: "disabled", crashReports: "disabled" });
    await setTelemetryConsent({ usage: "enabled", crashReports: "disabled" });
    await flushTelemetry();
    expect(harness.captures).toHaveLength(0);
  });

  it("revokes at runtime before another event can be queued", async () => {
    const harness = sdkHarness();
    configure(harness.loader);
    const native = backend(status("enabled", "disabled"));
    await initializeTelemetry(native);
    capture("screen_viewed", { screen_id: "settings" });
    await flushTelemetry();
    await setTelemetryConsent({ usage: "disabled", crashReports: "disabled" });
    capture("screen_viewed", { screen_id: "about" });
    await flushTelemetry();
    expect(harness.captures.map((item) => item.properties?.screen_id)).toEqual([
      "settings",
    ]);
    expect(harness.instance.opt_out_capturing).toHaveBeenCalled();
  });

  it("replaces the SDK immediately when crash consent is revoked but usage remains", async () => {
    const first = sdkHarness();
    const second = sdkHarness();
    const clients = [first, second];
    let loadIndex = 0;
    const loader = vi.fn(async () => {
      const next = clients[loadIndex++];
      if (!next) throw new Error("unexpected_sdk_load");
      return next.instance;
    });
    configure(loader);

    let current = status("enabled", "enabled");
    let persistConsent: (() => void) | undefined;
    const native: TelemetryBackend = {
      async telemetryStatus() {
        return current;
      },
      telemetrySetConsent(input) {
        return new Promise<TelemetryStatus>((resolve) => {
          persistConsent = () => {
            current = { ...current, ...input };
            resolve(current);
          };
        });
      },
      async telemetryRegenerateId() {
        current = { ...current, installationId: null };
        return current;
      },
    };

    await initializeTelemetry(native);
    await flushTelemetry();
    capture("screen_viewed", { screen_id: "golive" });
    await flushTelemetry();
    const preRevokePayload = first.captures[0];
    const staleBeforeSend = first.instance.init.mock.calls[0]?.[1]
      .before_send as ((value: unknown) => unknown) | undefined;
    expect(preRevokePayload).toBeDefined();
    expect(staleBeforeSend?.(preRevokePayload)).not.toBeNull();
    first.captures.splice(0);

    // Fica aguardando a continuação do await de ensureSdk no mesmo tick.
    capture("screen_viewed", { screen_id: "about" });
    const saving = setTelemetryConsent({
      usage: "enabled",
      crashReports: "disabled",
    });

    // Não espera a persistência: revogar limpa batches e exception_steps já.
    expect(first.instance.opt_out_capturing).toHaveBeenCalledOnce();
    expect(first.instance.reset).toHaveBeenCalledWith(true);
    persistConsent?.();
    await saving;
    await flushTelemetry();

    const staleLoaded = first.instance.init.mock.calls[0]?.[1].loaded as
      ((client: typeof first.instance) => void) | undefined;
    const oldOptInCalls = first.instance.opt_in_capturing.mock.calls.length;
    staleLoaded?.(first.instance);
    expect(first.instance.opt_in_capturing).toHaveBeenCalledTimes(
      oldOptInCalls,
    );
    expect(staleBeforeSend?.(preRevokePayload)).toBeNull();

    capture("screen_viewed", { screen_id: "settings" });
    captureException(new Error("must stay local"), {
      handled: true,
      severity: "error",
      error_code: "screen_render_failed",
      stage: "screen_render",
    });
    await flushTelemetry();

    expect(loader).toHaveBeenCalledTimes(2);
    expect(first.captures).toHaveLength(0);
    expect(first.exceptions).toHaveLength(0);
    expect(second.captures.map(({ event }) => event)).toEqual([
      "screen_viewed",
    ]);
    expect(second.captures[0]?.properties?.screen_id).toBe("settings");
    expect(second.exceptions).toHaveLength(0);
    expect(first.instance.opt_in_capturing).not.toHaveBeenCalled();
    expect(second.instance.opt_in_capturing).not.toHaveBeenCalled();
    expect(second.instance.init.mock.calls[0]?.[1]).toMatchObject({
      opt_out_capturing_by_default: false,
      opt_out_capturing_persistence_type: "localStorage",
      request_batching: false,
    });
  });

  it("starts from a clean SDK when a revocation fails and consent is restored", async () => {
    const first = sdkHarness();
    const second = sdkHarness();
    const clients = [first, second];
    let loadIndex = 0;
    const loader = vi.fn(async () => {
      const next = clients[loadIndex++];
      if (!next) throw new Error("unexpected_sdk_load");
      return next.instance;
    });
    configure(loader);
    const initial = status("enabled", "enabled");
    const native: TelemetryBackend = {
      async telemetryStatus() {
        return initial;
      },
      async telemetrySetConsent() {
        throw new Error("disk_write_failed");
      },
      async telemetryRegenerateId() {
        return initial;
      },
    };

    await initializeTelemetry(native);
    await flushTelemetry();
    await expect(
      setTelemetryConsent({ usage: "enabled", crashReports: "disabled" }),
    ).rejects.toThrow("disk_write_failed");
    await flushTelemetry();

    expect(first.instance.opt_out_capturing).toHaveBeenCalledOnce();
    expect(first.instance.reset).toHaveBeenCalledWith(true);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(second.instance.init).toHaveBeenCalledOnce();
    captureException(new Error("restored crash consent"), {
      handled: true,
      severity: "error",
      error_code: "screen_render_failed",
      stage: "screen_render",
    });
    await flushTelemetry();
    expect(first.exceptions).toHaveLength(0);
    expect(second.exceptions).toHaveLength(1);
  });

  it("reinitializes anonymously after opt-out instead of identifying a hidden device", async () => {
    const harness = sdkHarness();
    configure(harness.loader);
    const native = backend(status("enabled", "disabled"));
    await initializeTelemetry(native);
    await flushTelemetry();
    await setTelemetryConsent({ usage: "disabled", crashReports: "disabled" });
    await setTelemetryConsent({ usage: "enabled", crashReports: "disabled" });
    await flushTelemetry();
    expect(harness.loader).toHaveBeenCalledTimes(2);
    expect(harness.instance.init).toHaveBeenCalledTimes(2);
  });

  it("keeps telemetry.json as the only persisted consent authority", async () => {
    const first = sdkHarness();
    const second = sdkHarness();
    const clients = [first, second];
    let loadIndex = 0;
    const loader = vi.fn(async () => {
      const next = clients[loadIndex++];
      if (!next) throw new Error("unexpected_sdk_load");
      return next.instance;
    });
    configure(loader);
    const storage = memoryStorage({
      [POSTHOG_CONSENT_KEY]: "0",
      "corneta.keep": "untouched",
    });
    vi.stubGlobal("localStorage", storage);
    const native = backend(status("enabled", "enabled"));

    await initializeTelemetry(native);
    await flushTelemetry();
    capture("screen_viewed", { screen_id: "settings" });
    await flushTelemetry();
    expect(first.captures).toHaveLength(1);
    expect(storage.getItem(POSTHOG_CONSENT_KEY)).toBeNull();

    await setTelemetryConsent({ usage: "disabled", crashReports: "disabled" });
    expect(storage.getItem(POSTHOG_CONSENT_KEY)).toBeNull();
    expect(first.instance.clear_opt_in_out_capturing).toHaveBeenCalled();

    await setTelemetryConsent({ usage: "enabled", crashReports: "disabled" });
    await flushTelemetry();
    capture("screen_viewed", { screen_id: "about" });
    await flushTelemetry();

    expect(
      second.captures.map(({ properties }) => properties?.screen_id),
    ).toEqual(["about"]);
    expect(
      Array.from({ length: storage.length }, (_, index) =>
        storage.key(index),
      ).filter((key) => key?.startsWith("__ph_")),
    ).toHaveLength(0);
    expect(storage.getItem("corneta.keep")).toBe("untouched");
  });

  it("cannot let a stale loader replace or clear the post-revocation SDK", async () => {
    const secondId = "00000000-0000-4000-8000-000000000002";
    const stale = sdkHarness();
    const currentSdk = sdkHarness();
    let releaseStale: (() => void) | undefined;
    let releaseCurrent: (() => void) | undefined;
    let loadIndex = 0;
    const delayedLoader = vi.fn(() => {
      const index = loadIndex++;
      return new Promise<typeof stale.instance>((resolve) => {
        if (index === 0) releaseStale = () => resolve(stale.instance);
        else if (index === 1)
          releaseCurrent = () => resolve(currentSdk.instance);
        else throw new Error("unexpected_sdk_load");
      });
    });
    configure(delayedLoader);

    let current = status("enabled", "disabled");
    const native: TelemetryBackend = {
      async telemetryStatus() {
        return current;
      },
      async telemetrySetConsent(input) {
        current = {
          ...current,
          ...input,
          installationId:
            input.usage === "enabled" || input.crashReports === "enabled"
              ? (current.installationId ?? secondId)
              : current.installationId,
        };
        return current;
      },
      async telemetryRegenerateId() {
        current = { ...current, installationId: null };
        return current;
      },
    };

    await initializeTelemetry(native);
    await vi.waitFor(() => expect(delayedLoader).toHaveBeenCalledOnce());
    await setTelemetryConsent({ usage: "disabled", crashReports: "disabled" });
    await regenerateTelemetryId();
    await setTelemetryConsent({ usage: "enabled", crashReports: "disabled" });
    await vi.waitFor(() => expect(delayedLoader).toHaveBeenCalledTimes(2));

    releaseStale?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(stale.instance.init).not.toHaveBeenCalled();

    // O finally do loader obsoleto não pode apagar a Promise atual e abrir um
    // terceiro loader quando chega um evento.
    capture("screen_viewed", { screen_id: "settings" });
    expect(delayedLoader).toHaveBeenCalledTimes(2);
    releaseCurrent?.();
    await flushTelemetry();

    expect(delayedLoader).toHaveBeenCalledTimes(2);
    expect(stale.captures).toHaveLength(0);
    expect(currentSdk.instance.init).toHaveBeenCalledOnce();
    expect(currentSdk.captures.map(({ event }) => event)).toEqual([
      "screen_viewed",
    ]);
    expect(currentSdk.instance.init.mock.calls[0]?.[1]).toMatchObject({
      bootstrap: { distinctID: secondId, isIdentifiedID: false },
      request_batching: false,
    });
  });

  it("redacts and deduplicates the same exception object", async () => {
    const harness = sdkHarness();
    configure(harness.loader);
    await initializeTelemetry(backend(status("disabled", "enabled")));
    const error = new Error(
      "Authorization: Bearer secret.token.value for maria@example.com",
    );
    const first = captureException(error, {
      handled: false,
      severity: "error",
      error_code: "screen_render_failed",
      stage: "screen_render",
    });
    const second = captureException(error, {
      handled: false,
      severity: "error",
      error_code: "screen_render_failed",
      stage: "screen_render",
    });
    await flushTelemetry();
    expect(second).toBe(first);
    expect(harness.exceptions).toHaveLength(1);
    expect(harness.exceptions[0].error.message).not.toContain("secret.token");
    expect(harness.exceptions[0].error.message).not.toContain(
      "maria@example.com",
    );
  });

  it("normalizes arbitrary UI messages in capture and before_send", async () => {
    const harness = sdkHarness();
    configure(harness.loader);
    await initializeTelemetry(backend(status("disabled", "enabled")));
    const originalMessage = "falhou no canal MinhaLive / mensagem olá mundo";
    const error = new TypeError(originalMessage);
    error.name = "CanalSentinela19";
    error.stack = [
      `TypeError: ${originalMessage}`,
      "    at startLive (http://tauri.localhost/assets/index-Ab12.js:10:20)",
    ].join("\n");

    captureException(error, {
      handled: true,
      severity: "error",
      error_code: "screen_render_failed",
      stage: "screen_render",
    });
    await flushTelemetry();

    const captured = harness.exceptions[0];
    expect(captured).toBeDefined();
    expect(error.message).toBe(originalMessage);
    expect(captured?.error.name).toBe("Error");
    expect(captured?.error.message).toBe(REMOTE_DESKTOP_ERROR_MESSAGE);
    expect(captured?.error.stack).toContain(
      "http://tauri.localhost/assets/index-Ab12.js:10:20",
    );
    const capturedJson = JSON.stringify({
      message: captured?.error.message,
      stack: captured?.error.stack,
      properties: captured?.properties,
    });
    expect(capturedJson).not.toContain("MinhaLive");
    expect(capturedJson).not.toContain("olá mundo");
    expect(capturedJson).not.toContain("CanalSentinela19");

    const beforeSend = harness.instance.init.mock.calls[0]?.[1].before_send as
      ((value: unknown) => unknown) | undefined;
    const result = beforeSend?.({
      event: "$exception",
      properties: {
        ...captured?.properties,
        $exception_list: [
          {
            $exception_type: error.name,
            $exception_message: originalMessage,
            $exception_value: originalMessage,
            $exception_stack_trace_raw: error.stack,
            type: error.name,
            value: originalMessage,
          },
        ],
      },
    });
    expect(result).not.toBeNull();
    const resultJson = JSON.stringify(result);
    expect(resultJson).not.toContain("MinhaLive");
    expect(resultJson).not.toContain("olá mundo");
    expect(resultJson).not.toContain("CanalSentinela19");
    expect(resultJson).toContain(REMOTE_DESKTOP_ERROR_MESSAGE);
    expect(resultJson).toContain(
      "http://tauri.localhost/assets/index-Ab12.js:10:20",
    );
  });
});
