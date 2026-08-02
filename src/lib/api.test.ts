import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TELEMETRY_NOTICE_VERSION } from "./telemetry-schema";

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn(async () => ({
    schemaVersion: 1,
    // Literal de propósito: `vi.hoisted` roda ANTES dos imports do módulo, então
    // a constante ainda não existe aqui. É só o retorno falso do backend — o que
    // importa pro teste é o `noticeVersion` que o app ENVIA, logo abaixo.
    noticeVersion: "2026-08-02",
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
      noticeVersion: TELEMETRY_NOTICE_VERSION,
    };

    await api.telemetrySetConsent(input);

    expect(invoke).toHaveBeenCalledWith("telemetry_set_consent", { input });
  });
});
