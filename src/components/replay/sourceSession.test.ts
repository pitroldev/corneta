import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createReplaySourceSession,
  type ReplaySourceState,
} from "./sourceSession";
import type { RecordingReplayStatus } from "../../lib/api/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture(status: RecordingReplayStatus = { state: "ready" }) {
  const api = {
    recordVideoUrl: vi.fn(async () => "http://127.0.0.1:9000/capability"),
    releaseRecordVideo: vi.fn(async (_url: string) => {}),
    recordingReplayStatus: vi.fn(async () => status),
    prepareRecordingReplay: vi.fn(async (): Promise<RecordingReplayStatus> => ({
      state: "preparing",
    })),
  };
  const publish = vi.fn<(state: ReplaySourceState) => void>();
  const detach = vi.fn();
  const start = () =>
    createReplaySourceSession(api, "123", "recording.mp4", publish, detach);
  return { api, publish, detach, start };
}

const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

afterEach(() => vi.useRealTimers());

describe("replay source capabilities", () => {
  it("opens video without waiting for preparation inspection", async () => {
    const f = fixture();
    const status = deferred<RecordingReplayStatus>();
    f.api.recordingReplayStatus.mockReturnValue(status.promise);
    const session = f.start();
    await settle();
    expect(f.api.recordingReplayStatus).toHaveBeenCalledOnce();
    expect(f.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: expect.any(String) }),
    );
    session.dispose();
    status.resolve({ state: "ready" });
    await settle();
    expect(f.api.releaseRecordVideo).toHaveBeenCalledOnce();
  });

  it("releases a late URL after disposal without publishing it", async () => {
    const f = fixture();
    const url = deferred<string>();
    f.api.recordVideoUrl.mockReturnValue(url.promise);
    const session = f.start();
    session.dispose();
    f.publish.mockClear();
    url.resolve("late-capability");
    await settle();
    expect(f.api.releaseRecordVideo).toHaveBeenCalledExactlyOnceWith(
      "late-capability",
    );
    expect(f.publish).not.toHaveBeenCalled();
  });

  it("does not automatically prepare or poll unprepared recordings", async () => {
    vi.useFakeTimers();
    const f = fixture({ state: "unprepared", reason: "fragmented" });
    const session = f.start();
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.api.prepareRecordingReplay).not.toHaveBeenCalled();
    expect(f.api.recordingReplayStatus).toHaveBeenCalledOnce();
    session.dispose();
  });

  it("detaches and releases video before explicit preparation, then renews its URL", async () => {
    vi.useFakeTimers();
    const f = fixture({ state: "unprepared" });
    const session = f.start();
    await settle();
    const released = deferred<void>();
    f.api.releaseRecordVideo.mockReturnValueOnce(released.promise);
    const prepare = session.prepare();
    expect(f.detach).toHaveBeenCalledOnce();
    expect(f.api.prepareRecordingReplay).not.toHaveBeenCalled();
    released.resolve();
    await prepare;
    expect(f.api.prepareRecordingReplay).toHaveBeenCalledExactlyOnceWith(
      "123",
      "recording.mp4",
    );
    f.api.recordingReplayStatus.mockResolvedValue({ state: "ready" });
    f.api.recordVideoUrl.mockResolvedValue("renewed-capability");
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: "renewed-capability",
        status: { state: "ready" },
      }),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.api.recordingReplayStatus).toHaveBeenCalledTimes(2);
    session.dispose();
  });

  it("waits for a pending capability to be revoked before preparation starts", async () => {
    const f = fixture();
    const url = deferred<string>();
    f.api.recordVideoUrl.mockReturnValueOnce(url.promise);
    const session = f.start();
    const prepare = session.prepare();
    await settle();
    expect(f.api.prepareRecordingReplay).not.toHaveBeenCalled();
    url.resolve("pending-capability");
    await prepare;
    expect(f.api.releaseRecordVideo).toHaveBeenCalledWith("pending-capability");
    expect(f.api.prepareRecordingReplay).toHaveBeenCalledOnce();
    session.dispose();
  });

  it("stops polling after three failures and keeps the original playable", async () => {
    vi.useFakeTimers();
    const f = fixture({ state: "preparing" });
    const session = f.start();
    await settle();
    f.api.recordingReplayStatus.mockRejectedValue(new Error("Unavailable"));
    await vi.advanceTimersByTimeAsync(8000);
    expect(f.api.recordingReplayStatus).toHaveBeenCalledTimes(4);
    expect(f.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: { state: "failed", reason: "status_unavailable" },
        url: expect.any(String),
      }),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.api.recordingReplayStatus).toHaveBeenCalledTimes(4);
    session.dispose();
  });

  it("retains missing and media-access errors as different states", async () => {
    const f = fixture({ state: "ready" });
    f.api.recordVideoUrl.mockRejectedValue(new Error("Access denied"));
    const session = f.start();
    await settle();
    expect(f.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sourceError: true,
        status: { state: "ready" },
      }),
    );
    session.dispose();
  });

  it("does not publish a preparation result after navigating away", async () => {
    const f = fixture();
    const prepared = deferred<RecordingReplayStatus>();
    f.api.prepareRecordingReplay.mockReturnValue(prepared.promise);
    const session = f.start();
    await settle();
    const prepare = session.prepare();
    await settle();
    session.dispose();
    f.publish.mockClear();
    prepared.resolve({ state: "ready" });
    await prepare;
    expect(f.publish).not.toHaveBeenCalled();
  });

  it("refreshes capabilities after an event even when a fast preparation was never observed", async () => {
    const f = fixture();
    const session = f.start();
    await settle();
    f.api.recordVideoUrl.mockResolvedValue("new-file-capability");
    session.refreshStatus(true);
    await settle();
    expect(f.api.releaseRecordVideo).toHaveBeenCalledOnce();
    expect(f.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: "new-file-capability" }),
    );
    session.dispose();
    expect(f.detach).toHaveBeenLastCalledWith(false);
  });

  it("does not let a native event interrupt an in-flight explicit preparation request", async () => {
    const f = fixture({ state: "unprepared" });
    const preparing = deferred<RecordingReplayStatus>();
    f.api.prepareRecordingReplay.mockReturnValue(preparing.promise);
    const session = f.start();
    await settle();
    const prepare = session.prepare();
    await settle();
    session.refreshStatus(true);
    await settle();
    expect(f.api.recordVideoUrl).toHaveBeenCalledOnce();
    expect(f.api.recordingReplayStatus).toHaveBeenCalledOnce();
    preparing.resolve({ state: "ready" });
    await prepare;
    await settle();
    expect(f.api.recordVideoUrl).toHaveBeenCalledTimes(2);
    session.dispose();
  });

  it("keeps a pending URL renewal alive across a harmless status recheck", async () => {
    const f = fixture();
    const session = f.start();
    await settle();
    const released = deferred<void>();
    f.api.releaseRecordVideo.mockReturnValueOnce(released.promise);
    session.refreshStatus(true);
    await settle();
    session.refreshStatus();
    await settle();
    released.resolve();
    await settle();
    expect(f.api.recordVideoUrl).toHaveBeenCalledTimes(2);
    session.dispose();
  });

  it("warns about slow URL acquisition and retries without waiting for the stale IPC result", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const f = fixture();
    const first = deferred<string>();
    f.api.recordVideoUrl.mockReturnValueOnce(first.promise);
    const session = f.start();
    await settle();
    expect(f.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({ openingStartedAt: 0, openingSlow: false }),
    );
    await vi.advanceTimersByTimeAsync(11_999);
    expect(f.publish).not.toHaveBeenCalledWith(
      expect.objectContaining({ openingSlow: true }),
    );
    await vi.advanceTimersByTimeAsync(1);
    expect(f.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({ openingStartedAt: 0, openingSlow: true }),
    );
    f.api.recordVideoUrl.mockResolvedValue("fresh-capability");
    await session.retry();
    await settle();
    expect(f.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({
        openingStartedAt: 12_000,
        openingSlow: false,
        url: "fresh-capability",
      }),
    );
    first.resolve("stale-capability");
    await settle();
    expect(f.api.releaseRecordVideo).toHaveBeenCalledWith("stale-capability");
    expect(f.publish).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: "stale-capability" }),
    );
    session.dispose();
  });

  it("cancels the URL-acquisition timeout on disposal and revokes late results", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const pending = deferred<string>();
    f.api.recordVideoUrl.mockReturnValue(pending.promise);
    const session = f.start();
    await settle();
    session.dispose();
    f.publish.mockClear();
    await vi.advanceTimersByTimeAsync(20_000);
    pending.resolve("late-capability");
    await settle();
    expect(f.publish).not.toHaveBeenCalled();
    expect(f.api.releaseRecordVideo).toHaveBeenCalledWith("late-capability");
  });

  it("does not mislabel recording preparation as slow URL acquisition", async () => {
    vi.useFakeTimers();
    const f = fixture({ state: "preparing" });
    const pending = deferred<string>();
    f.api.recordVideoUrl.mockReturnValue(pending.promise);
    const session = f.start();
    await settle();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(f.publish).not.toHaveBeenCalledWith(
      expect.objectContaining({ openingSlow: true }),
    );
    session.dispose();
    pending.resolve("stale-capability");
    await settle();
  });
});
