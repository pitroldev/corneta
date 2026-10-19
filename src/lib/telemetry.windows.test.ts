import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TELEMETRY_NOTICE_VERSION,
  type TelemetryChoice,
  type TelemetryExceptionContext,
  type TelemetryStatus,
} from "./telemetry-schema";

const CHANGED_EVENT = "telemetry://changed";
const CHAT_RENDER_FAILURE: TelemetryExceptionContext = {
  handled: false,
  severity: "error",
  error_code: "chat_render_failed",
  stage: "chat_render",
  screen_id: "chat_popout",
};

const tauri = vi.hoisted(() => {
  type Handler = (event: {
    event: string;
    id: number;
    payload: unknown;
  }) => void;
  const installationId = "00000000-0000-4000-8000-000000000002";
  const copy = <V>(value: V): V => structuredClone(value);
  const handlers = new Map<string, Set<Handler>>();
  const state = {
    status: null as unknown as TelemetryStatus,
    failNextWrite: false,
  };
  const active = (choice: TelemetryChoice, crashReports: boolean) =>
    choice === "enabled" || (crashReports && choice === "unset");

  // Mirrors Telemetry::set_consent, including the in-memory revocation kept when the file write fails.
  function setConsent(input: {
    usage: TelemetryChoice;
    crashReports: TelemetryChoice;
    noticeVersion: string;
  }): TelemetryStatus {
    const previous = state.status;
    const usage = active(input.usage, false);
    const crashReports = active(input.crashReports, true);
    if (state.failNextWrite) {
      state.failNextWrite = false;
      state.status = {
        ...previous,
        usage: usage ? previous.usage : input.usage,
        crashReports: crashReports ? previous.crashReports : input.crashReports,
      };
      throw new Error("synthetic telemetry write failure");
    }
    state.status = {
      ...previous,
      ...input,
      installationId:
        usage || crashReports
          ? (previous.installationId ?? installationId)
          : previous.installationId,
      decidedAt: "2026-10-18T12:00:00.000Z",
    };
    return copy(state.status);
  }

  return {
    installationId,
    state,
    listenerCount: (event: string) => handlers.get(event)?.size ?? 0,
    reset() {
      handlers.clear();
      state.failNextWrite = false;
    },
    invoke: vi.fn(async (command: string, args?: Record<string, unknown>) => {
      if (command === "telemetry_status") return copy(state.status);
      if (command === "telemetry_set_consent")
        return setConsent(args?.input as Parameters<typeof setConsent>[0]);
      throw new Error(`unexpected command: ${command}`);
    }),
    listen: vi.fn(async (event: string, handler: Handler) => {
      const registered = handlers.get(event) ?? new Set<Handler>();
      handlers.set(event, registered);
      registered.add(handler);
      return () => {
        registered.delete(handler);
      };
    }),
    // Tauri routes a webview emit through the core, which delivers it to every webview.
    emit: vi.fn(async (event: string, payload?: unknown) => {
      for (const handler of [...(handlers.get(event) ?? [])])
        queueMicrotask(() => handler({ event, id: 0, payload }));
    }),
  };
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: tauri.listen,
  emit: tauri.emit,
}));

type TelemetryModule = typeof import("./telemetry");

const INSTALLATION_ID = tauri.installationId;

function status(
  usage: TelemetryChoice,
  crashReports: TelemetryChoice,
): TelemetryStatus {
  return {
    schemaVersion: 1,
    noticeVersion: TELEMETRY_NOTICE_VERSION,
    usage,
    crashReports,
    installationId:
      usage === "enabled" || crashReports !== "disabled"
        ? INSTALLATION_ID
        : null,
    decidedAt: "2026-08-01T12:00:00.000Z",
  };
}

function sdkHarness() {
  const captures: string[] = [];
  const exceptions: Error[] = [];
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
    capture: vi.fn((event: string) => {
      captures.push(event);
    }),
    captureException: vi.fn((error: Error) => {
      exceptions.push(error);
    }),
    opt_out_capturing: vi.fn(),
    reset: vi.fn(),
    closeTelemetryTransport: vi.fn(),
  };
  return {
    instance,
    captures,
    exceptions,
    loader: vi.fn(async () => instance),
  };
}

const windows: TelemetryModule[] = [];

/** Each webview loads its own telemetry module and talks to the shared native backend. */
async function openWindow() {
  vi.resetModules();
  const telemetry = await import("./telemetry");
  const { tauriApi } = await import("./api/native");
  const sdk = sdkHarness();
  telemetry.__configureTelemetryForTests({
    config: {
      token: "phc_public_test_token",
      host: "https://us.i.posthog.com",
      buildSha: "abc123",
      disabled: false,
      environment: "development",
    },
    loader: sdk.loader,
  });
  windows.push(telemetry);
  await telemetry.initializeTelemetry(tauriApi());
  return { telemetry, sdk };
}

async function openMainAndChat() {
  const main = await openWindow();
  const chat = await openWindow();
  await vi.waitFor(() => expect(tauri.listenerCount(CHANGED_EVENT)).toBe(2));
  return { main, chat };
}

beforeEach(() => {
  tauri.reset();
  vi.clearAllMocks();
});

afterEach(() => {
  for (const telemetry of windows.splice(0))
    telemetry.__configureTelemetryForTests({ config: { disabled: true } });
});

describe("telemetry consent across the main and chat windows", () => {
  it("stops capture in both windows when the main window revokes consent", async () => {
    tauri.state.status = status("enabled", "enabled");
    const { main, chat } = await openMainAndChat();
    chat.telemetry.capture("screen_viewed", { screen_id: "settings" });
    chat.telemetry.captureException(
      new Error("synthetic chat failure before revocation"),
      CHAT_RENDER_FAILURE,
    );
    await chat.telemetry.flushTelemetry();
    expect(chat.sdk.captures).toEqual(["screen_viewed"]);
    expect(chat.sdk.exceptions).toHaveLength(1);

    await main.telemetry.setTelemetryConsent({
      usage: "disabled",
      crashReports: "disabled",
    });
    await vi.waitFor(() =>
      expect(chat.telemetry.getTelemetrySnapshot().status).toMatchObject({
        usage: "disabled",
        crashReports: "disabled",
      }),
    );
    expect(chat.sdk.instance.opt_out_capturing).toHaveBeenCalled();

    for (const { telemetry } of [main, chat]) {
      telemetry.capture("screen_viewed", { screen_id: "about" });
      telemetry.captureException(
        new Error("synthetic failure after revocation"),
        CHAT_RENDER_FAILURE,
      );
      await telemetry.flushTelemetry();
    }
    expect(chat.sdk.captures).toEqual(["screen_viewed"]);
    expect(chat.sdk.exceptions).toHaveLength(1);
    expect(main.sdk.captures).toEqual([]);
    expect(main.sdk.exceptions).toEqual([]);
  });

  it("lets the chat window send usage once the main window grants it", async () => {
    tauri.state.status = { ...status("unset", "unset"), installationId: null };
    const { main, chat } = await openMainAndChat();
    chat.telemetry.capture("screen_viewed", { screen_id: "settings" });
    await chat.telemetry.flushTelemetry();
    expect(chat.sdk.captures).toEqual([]);

    await main.telemetry.setTelemetryConsent({
      usage: "enabled",
      crashReports: "enabled",
    });
    await vi.waitFor(() =>
      expect(chat.telemetry.getTelemetrySnapshot().status).toMatchObject({
        usage: "enabled",
        installationId: INSTALLATION_ID,
      }),
    );
    chat.telemetry.capture("screen_viewed", { screen_id: "about" });
    await chat.telemetry.flushTelemetry();
    expect(chat.sdk.captures).toEqual(["screen_viewed"]);
  });

  it("propagates a revocation that the backend kept in memory after a failed write", async () => {
    tauri.state.status = status("enabled", "enabled");
    const { main, chat } = await openMainAndChat();
    tauri.state.failNextWrite = true;
    await expect(
      main.telemetry.setTelemetryConsent({
        usage: "disabled",
        crashReports: "enabled",
      }),
    ).rejects.toThrow("synthetic telemetry write failure");

    await vi.waitFor(() =>
      expect(chat.telemetry.getTelemetrySnapshot().status.usage).toBe(
        "disabled",
      ),
    );
    chat.telemetry.capture("screen_viewed", { screen_id: "about" });
    await chat.telemetry.flushTelemetry();
    expect(chat.sdk.captures).toEqual([]);
  });
});
