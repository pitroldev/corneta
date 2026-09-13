import { afterEach, describe, expect, it, vi } from "vitest";
import {
  observeReplayStartup,
  recentReplayStartupDiagnostics,
  recordReplayStartupDiagnostic,
} from "./startupDiagnostics";
import type { RecordVideoStats } from "../../lib/api/types";

function videoFixture() {
  const listeners = new Map<string, () => void>();
  let frame: (() => void) | undefined;
  const video = {
    readyState: 0,
    addEventListener: (name: string, listener: () => void) =>
      listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
    requestVideoFrameCallback: vi.fn((callback: () => void) => {
      frame = callback;
      return 1;
    }),
    cancelVideoFrameCallback: vi.fn(),
  };
  return {
    video: video as unknown as HTMLVideoElement,
    dispatch: (name: string) => listeners.get(name)?.(),
    present: () => frame?.(),
  };
}

const stats: RecordVideoStats = {
  fileBytes: 12 * 1024 ** 3,
  bytesRead: 65536,
  peakBufferedBytes: 65536,
  requests: 2,
  rangeRequests: 2,
  activeRequests: 0,
};

afterEach(() => vi.useRealTimers());

describe("local replay startup measurements", () => {
  it("does not report metadata as the first presented frame", async () => {
    vi.useFakeTimers();
    const f = videoFixture();
    const readStats = vi.fn(async () => stats);
    const report = vi.fn();
    const stop = observeReplayStartup(f.video, readStats, vi.fn(), report);
    f.dispatch("loadedmetadata");
    expect(readStats).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
    f.present();
    await Promise.resolve();
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "first-frame",
        firstFrameMs: expect.any(Number),
        metadataMs: expect.any(Number),
        transport: stats,
      }),
    );
    expect(readStats).toHaveBeenCalledOnce();
    stop();
  });

  it("offers a bounded slow-loading fallback and samples native counters once", async () => {
    vi.useFakeTimers();
    const f = videoFixture();
    const readStats = vi.fn(async () => stats);
    const slow = vi.fn();
    const report = vi.fn();
    const stop = observeReplayStartup(f.video, readStats, slow, report);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(slow).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "timeout" }),
    );
    f.present();
    await Promise.resolve();
    expect(report).toHaveBeenLastCalledWith(
      expect.objectContaining({ firstFrameMs: expect.any(Number) }),
    );
    expect(readStats).toHaveBeenCalledOnce();
    stop();
  });

  it("cancels observation and does not retain URL, path, or report identifiers", async () => {
    vi.useFakeTimers();
    const f = videoFixture();
    const readStats = vi.fn(async () => stats);
    const report = vi.fn();
    const stop = observeReplayStartup(f.video, readStats, vi.fn(), report);
    stop();
    f.present();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(readStats).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
    expect(f.video.cancelVideoFrameCallback).toHaveBeenCalledWith(1);
    for (let i = 0; i < 25; i++)
      recordReplayStartupDiagnostic({ outcome: "timeout", elapsedMs: i });
    const recent = recentReplayStartupDiagnostics();
    expect(recent).toHaveLength(20);
    expect(recent[recent.length - 1]).toEqual({
      outcome: "timeout",
      elapsedMs: 24,
    });
  });

  it("does not warn about an intentional metadata-only preload while paused", async () => {
    vi.useFakeTimers();
    const f = videoFixture();
    Object.defineProperties(f.video, {
      readyState: { value: 1 },
      paused: { value: true },
    });
    const slow = vi.fn();
    const stop = observeReplayStartup(
      f.video,
      async () => stats,
      slow,
      vi.fn(),
    );
    await vi.advanceTimersByTimeAsync(12_000);
    expect(slow).not.toHaveBeenCalled();
    stop();
  });

  it("includes URL acquisition in metadata and first-frame timing", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const began = performance.now();
    await vi.advanceTimersByTimeAsync(8000);
    const f = videoFixture();
    const report = vi.fn();
    const stop = observeReplayStartup(
      f.video,
      async () => stats,
      vi.fn(),
      report,
      began,
    );
    await vi.advanceTimersByTimeAsync(500);
    f.dispatch("loadedmetadata");
    await vi.advanceTimersByTimeAsync(500);
    f.present();
    await Promise.resolve();
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        metadataMs: 8500,
        firstFrameMs: 9000,
        elapsedMs: 9000,
      }),
    );
    stop();
  });

  it("uses only the remaining slow-loading budget after URL acquisition", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const began = performance.now();
    await vi.advanceTimersByTimeAsync(9000);
    const f = videoFixture();
    const slow = vi.fn();
    const report = vi.fn();
    const stop = observeReplayStartup(
      f.video,
      async () => stats,
      slow,
      report,
      began,
    );
    await vi.advanceTimersByTimeAsync(2999);
    expect(slow).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(slow).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "timeout", elapsedMs: 12000 }),
    );
    stop();
  });
});
