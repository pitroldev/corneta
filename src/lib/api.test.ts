import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TELEMETRY_NOTICE_VERSION,
  telemetryConsentDraft,
} from "./telemetry-schema";

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn(async () => ({
    schemaVersion: 1,
    // vi.hoisted runs before imports, so this backend fixture must use a literal.
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

    await api.exportClipSlices([
      { path: "1786151052661.mp4", startMs: 1000.4, endMs: 2500.6 },
      { path: "1786151052661.p2.mp4", startMs: 0, endMs: 4000.2 },
    ]);
    await api.exportClipsBatch(
      "C:/Clips",
      [
        {
          slug: "01-00h01m00s-clutch",
          slices: [
            { path: "1786151052661.mp4", startMs: 500.2, endMs: 1500.8 },
          ],
        },
      ],
      "vertical",
      { x: 0.5, y: 0.5, zoom: 1, layout: "split", splitRatio: 0.35 },
    );
    await api.cancelClipsBatch();
    await api.openClipsExportFolder();

    expect(invoke).toHaveBeenCalledWith("export_clip_slices", {
      slices: [
        { path: "1786151052661.mp4", startMs: 1000, endMs: 2501 },
        { path: "1786151052661.p2.mp4", startMs: 0, endMs: 4000 },
      ],
    });
    expect(invoke).toHaveBeenCalledWith("export_clips_batch", {
      dir: "C:/Clips",
      clips: [
        {
          slug: "01-00h01m00s-clutch",
          slices: [{ path: "1786151052661.mp4", startMs: 500, endMs: 1501 }],
        },
      ],
      format: "vertical",
      reframe: { x: 0.5, y: 0.5, zoom: 1, layout: "split", splitRatio: 0.35 },
    });
    expect(invoke).toHaveBeenCalledWith("cancel_clips_batch");
    expect(invoke).toHaveBeenCalledWith("open_clips_export_folder");
  });

  it("passes chat replies and the Kick opt-in scopes as named arguments", async () => {
    const { api } = await import("./api");
    await api.chatSend("valeu", ["source-1"], {
      nativeId: "message-1",
      author: "ana",
    });
    await api.chatSend("oi");
    await api.accountLoginStart("kick");
    await api.accountLoginStart("kick", { moderation: true });
    await api.accountLoginStart("kick", { streamKey: true });
    await api.fetchStreamKey("kick", "target-1");
    expect(invoke).toHaveBeenCalledWith("chat_send", {
      text: "valeu",
      sources: ["source-1"],
      reply: { nativeId: "message-1", author: "ana" },
    });
    expect(invoke).toHaveBeenCalledWith("chat_send", {
      text: "oi",
      sources: null,
      reply: null,
    });
    expect(invoke).toHaveBeenCalledWith("account_login_start", {
      platform: "kick",
      moderation: null,
      streamKey: null,
    });
    expect(invoke).toHaveBeenCalledWith("account_login_start", {
      platform: "kick",
      moderation: true,
      streamKey: null,
    });
    expect(invoke).toHaveBeenCalledWith("account_login_start", {
      platform: "kick",
      moderation: null,
      streamKey: true,
    });
    expect(invoke).toHaveBeenCalledWith("account_fetch_stream_key", {
      platform: "kick",
      targetId: "target-1",
    });
  });

  it("uses native bounded playback capabilities instead of constructing asset URLs", async () => {
    const { api } = await import("./api");
    await api.recordVideoUrl("recording.mp4");
    await api.releaseRecordVideo("local-playback-capability");
    await api.recordVideoStats("local-playback-capability");
    expect(invoke).toHaveBeenCalledWith("record_video_url", {
      path: "recording.mp4",
    });
    expect(invoke).toHaveBeenCalledWith("release_record_video", {
      url: "local-playback-capability",
    });
    expect(invoke).toHaveBeenCalledWith("record_video_stats", {
      url: "local-playback-capability",
    });
    expect(invoke).not.toHaveBeenCalledWith(
      "record_allow_file",
      expect.anything(),
    );
  });

  it("scopes replay inspection and explicit preparation to the report and file", async () => {
    const { api } = await import("./api");
    await api.recordingReplayStatus("123", "recording.mp4");
    await api.prepareRecordingReplay("123", "recording.mp4");
    expect(invoke).toHaveBeenCalledWith("recording_replay_status", {
      id: "123",
      path: "recording.mp4",
    });
    expect(invoke).toHaveBeenCalledWith("prepare_recording_replay", {
      id: "123",
      path: "recording.mp4",
    });
  });

  it("rejects invalid unsigned times before invoking the backend", async () => {
    const { api } = await import("./api");

    await expect(
      api.addSessionMarker("1786151052661", Number.NaN, "Inválido"),
    ).rejects.toThrow("t must be a safe non-negative integer");
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("demo telemetry preferences", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("matches fresh desktop purpose defaults without treating absence as corruption", async () => {
    const { mockApi } = await import("./api/demo");
    expect(telemetryConsentDraft(await mockApi().telemetryStatus())).toEqual({
      usage: false,
      crashReports: true,
    });
  });

  it.each(["null", "{invalid"])(
    "keeps malformed stored preferences inactive: %s",
    async (stored) => {
      const { mockApi } = await import("./api/demo");
      localStorage.setItem("corneta.telemetry.v1", stored);
      expect(telemetryConsentDraft(await mockApi().telemetryStatus())).toEqual({
        usage: false,
        crashReports: false,
      });
    },
  );

  it("does not allocate an identity or block rotation for unset usage alone", async () => {
    const { mockApi } = await import("./api/demo");
    const demo = mockApi();
    const saved = await demo.telemetrySetConsent({
      usage: "unset",
      crashReports: "disabled",
      noticeVersion: TELEMETRY_NOTICE_VERSION,
    });
    expect(saved.installationId).toBeNull();
    await expect(demo.telemetryRegenerateId()).resolves.toMatchObject({
      installationId: null,
    });
  });
});
