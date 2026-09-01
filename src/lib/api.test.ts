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

  it("rounds a fractional replay timestamp before sending it to Rust u64", async () => {
    const { api } = await import("./api");

    await api.addSessionMarker(
      "1786151052661",
      1786154640191.4705,
      "Momento marcado",
    );

    expect(invoke).toHaveBeenCalledWith("add_session_marker", {
      id: "1786151052661",
      t: 1786154640191,
      label: "Momento marcado",
    });
  });

  it("normalizes every integer argument used by replay commands", async () => {
    const { api } = await import("./api");

    await api.setSessionOffset("1786151052661", -1250.6);
    await api.exportClip("live.mp4", 500.4, 12_000.7);

    expect(invoke).toHaveBeenCalledWith("set_session_offset", {
      id: "1786151052661",
      ms: -1251,
    });
    expect(invoke).toHaveBeenCalledWith("export_clip", {
      path: "live.mp4",
      startMs: 500,
      endMs: 12_001,
    });
  });

  it("rejects invalid unsigned times before invoking the backend", async () => {
    const { api } = await import("./api");

    await expect(
      api.addSessionMarker("1786151052661", Number.NaN, "Inválido"),
    ).rejects.toThrow("t precisa ser um inteiro seguro não negativo");
    expect(invoke).not.toHaveBeenCalled();
  });
});
