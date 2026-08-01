import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn(async () => ({
    schemaVersion: 1,
    noticeVersion: "2026-08-01",
    usage: "enabled",
    crashReports: "disabled",
    installationId: "00000000-0000-4000-8000-000000000001",
    decidedAt: "2026-08-01T12:00:00.000Z",
  })),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

describe("Tauri telemetry IPC", () => {
  beforeEach(() => {
    vi.resetModules();
    invoke.mockClear();
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("wraps consent fields in the command's named input argument", async () => {
    const { api } = await import("./api");
    const input = {
      usage: "enabled" as const,
      crashReports: "disabled" as const,
      noticeVersion: "2026-08-01",
    };

    await api.telemetrySetConsent(input);

    expect(invoke).toHaveBeenCalledWith("telemetry_set_consent", { input });
  });
});
