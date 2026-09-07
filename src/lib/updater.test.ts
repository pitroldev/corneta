import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import type { UpdateInfo } from "./updater";

type StatusListener = (event: { payload: boolean }) => void;
type ProgressChannel = { onmessage: (event: DownloadEvent) => void };
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  check: vi.fn(),
  addStep: vi.fn(),
  capture: vi.fn(),
  channels: [] as ProgressChannel[],
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  Channel: class {
    onmessage: ProgressChannel["onmessage"] = () => {};
    constructor() {
      mocks.channels.push(this);
    }
  },
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("./telemetry", () => ({
  addStep: mocks.addStep,
  capture: mocks.capture,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const info: UpdateInfo = {
  version: "0.8.0",
  notes: "Synthetic update",
  handle: { rid: 42 } as Update,
};
let updater: typeof import("./updater");

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.channels.length = 0;
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  vi.stubEnv("VITE_CONTRIBUTOR", "0");
  updater = await import("./updater");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("native updater request lifecycle", () => {
  it("deduplicates installation immediately and uses only the guarded native command", async () => {
    const request = deferred<void>();
    mocks.invoke.mockReturnValue(request.promise);
    const first = updater.installUpdate(info);
    const second = updater.installUpdate({ ...info, version: "0.9.0" });
    expect(second).toBe(first);
    expect(updater.updateBusy(updater.useUpdate.getState())).toBe(true);
    await vi.dynamicImportSettled();
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("install_update", {
      rid: 42,
      onEvent: mocks.channels[0],
    });
    expect(mocks.channels).toHaveLength(1);
    expect(mocks.addStep).toHaveBeenCalledTimes(1);
    request.resolve();
    await first;
    expect(updater.useUpdate.getState().installing).toBe(false);
    expect(mocks.capture).toHaveBeenCalledExactlyOnceWith(
      "update_completed",
      expect.objectContaining({ outcome: "installed", to_version: "0.8.0" }),
    );
  });

  it("accumulates and caps download progress before switching to installer phase", async () => {
    const request = deferred<void>();
    mocks.invoke.mockReturnValue(request.promise);
    const pending = updater.installUpdate(info);
    await vi.dynamicImportSettled();
    const channel = mocks.channels[0];
    channel.onmessage({ event: "Started", data: { contentLength: 100 } });
    expect(updater.useUpdate.getState().progress).toBe(0);
    channel.onmessage({ event: "Progress", data: { chunkLength: 30 } });
    channel.onmessage({ event: "Progress", data: { chunkLength: 20 } });
    expect(updater.useUpdate.getState().progress).toBe(0.5);
    channel.onmessage({ event: "Progress", data: { chunkLength: 100 } });
    expect(updater.useUpdate.getState().progress).toBe(1);
    expect(updater.useUpdate.getState().phase).toBe("downloading");
    channel.onmessage({ event: "Finished" });
    expect(updater.useUpdate.getState()).toMatchObject({
      phase: "installing",
      progress: 1,
      installing: true,
    });
    request.resolve();
    await pending;
    expect(updater.useUpdate.getState().progress).toBeNull();
  });

  it.each([undefined, 0])(
    "keeps progress indeterminate without a positive content length (%s)",
    async (contentLength) => {
      const request = deferred<void>();
      mocks.invoke.mockReturnValue(request.promise);
      const pending = updater.installUpdate(info);
      await vi.dynamicImportSettled();
      mocks.channels[0].onmessage({
        event: "Started",
        data: { contentLength },
      });
      mocks.channels[0].onmessage({
        event: "Progress",
        data: { chunkLength: 100 },
      });
      expect(updater.useUpdate.getState().progress).toBeNull();
      request.resolve();
      await pending;
    },
  );

  it("releases a failed request, allows retry and ignores progress from the old channel", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    mocks.invoke
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const pending = updater.installUpdate(info);
    const failed = expect(pending).rejects.toThrow("synthetic failure");
    await vi.dynamicImportSettled();
    const staleChannel = mocks.channels[0];
    first.reject(new Error("synthetic failure"));
    await failed;
    expect(updater.useUpdate.getState()).toMatchObject({
      installing: false,
      progress: null,
    });
    staleChannel.onmessage({ event: "Finished" });
    expect(updater.useUpdate.getState().phase).toBe("downloading");
    const retry = updater.installUpdate(info);
    expect(retry).not.toBe(pending);
    await vi.dynamicImportSettled();
    mocks.channels[1].onmessage({
      event: "Started",
      data: { contentLength: 100 },
    });
    mocks.channels[1].onmessage({
      event: "Progress",
      data: { chunkLength: 25 },
    });
    staleChannel.onmessage({ event: "Progress", data: { chunkLength: 400 } });
    staleChannel.onmessage({ event: "Finished" });
    expect(updater.useUpdate.getState()).toMatchObject({
      phase: "downloading",
      progress: 0.25,
      installing: true,
    });
    second.resolve();
    await retry;
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.capture.mock.calls.map(([, props]) => props.outcome)).toEqual([
      "failed",
      "installed",
    ]);
  });

  it("does not clear an independent native lease when a duplicate request rejects after reload", async () => {
    updater.useUpdate.setState({ nativeInstalling: true });
    mocks.invoke.mockRejectedValue(
      new Error("another native request owns the lease"),
    );
    await expect(updater.installUpdate(info)).rejects.toThrow("native request");
    expect(updater.useUpdate.getState()).toMatchObject({
      installing: false,
      nativeInstalling: true,
    });
    expect(updater.updateBusy(updater.useUpdate.getState())).toBe(true);
    updater.useUpdate.setState({ nativeInstalling: false });
    expect(updater.updateBusy(updater.useUpdate.getState())).toBe(false);
  });

  it("does not clear the local request when a native release event arrives before invoke settles", async () => {
    const request = deferred<void>();
    mocks.invoke.mockReturnValue(request.promise);
    const pending = updater.installUpdate(info);
    updater.useUpdate.setState({ nativeInstalling: false });
    expect(updater.updateBusy(updater.useUpdate.getState())).toBe(true);
    request.resolve();
    await pending;
    expect(updater.updateBusy(updater.useUpdate.getState())).toBe(false);
  });
});

describe("native status subscriptions", () => {
  it("restores the native lease after reload, including when no update info exists", async () => {
    const stop = vi.fn();
    mocks.listen.mockResolvedValue(stop);
    mocks.invoke.mockResolvedValue(true);
    const cleanup = updater.subscribeUpdateStatus();
    await vi.dynamicImportSettled();
    expect(mocks.listen).toHaveBeenCalledWith(
      "updater://installing",
      expect.any(Function),
    );
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("update_installing");
    expect(updater.useUpdate.getState()).toMatchObject({
      info: null,
      nativeInstalling: true,
      installing: false,
      progress: null,
    });
    expect(updater.updateBusy(updater.useUpdate.getState())).toBe(true);
    cleanup();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("does not let an old query overwrite a more recent event", async () => {
    const query = deferred<boolean>();
    const stop = vi.fn();
    mocks.listen.mockResolvedValue(stop);
    mocks.invoke.mockReturnValue(query.promise);
    const cleanup = updater.subscribeUpdateStatus();
    await vi.dynamicImportSettled();
    const listener = mocks.listen.mock.calls[0][1] as StatusListener;
    listener({ payload: true });
    query.resolve(false);
    await vi.dynamicImportSettled();
    expect(updater.useUpdate.getState().nativeInstalling).toBe(true);
    listener({ payload: false });
    expect(updater.updateBusy(updater.useUpdate.getState())).toBe(false);
    cleanup();
  });

  it("does not register a listener if cleanup wins the import race", async () => {
    const cleanup = updater.subscribeUpdateStatus();
    cleanup();
    await vi.dynamicImportSettled();
    expect(mocks.listen).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("closes a listener whose registration finishes after cleanup", async () => {
    const registration = deferred<() => void>();
    const stop = vi.fn();
    mocks.listen.mockReturnValue(registration.promise);
    const cleanup = updater.subscribeUpdateStatus();
    await vi.dynamicImportSettled();
    expect(mocks.listen).toHaveBeenCalledTimes(1);
    cleanup();
    registration.resolve(stop);
    await vi.dynamicImportSettled();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("ignores both pending status and queued events after cleanup", async () => {
    const query = deferred<boolean>();
    const stop = vi.fn();
    mocks.listen.mockResolvedValue(stop);
    mocks.invoke.mockReturnValue(query.promise);
    const cleanup = updater.subscribeUpdateStatus();
    await vi.dynamicImportSettled();
    cleanup();
    (mocks.listen.mock.calls[0][1] as StatusListener)({ payload: true });
    query.resolve(true);
    await vi.dynamicImportSettled();
    expect(updater.useUpdate.getState().nativeInstalling).toBe(false);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("keeps the listener usable when the initial query fails", async () => {
    const stop = vi.fn();
    mocks.listen.mockResolvedValue(stop);
    mocks.invoke.mockRejectedValue(new Error("temporary query failure"));
    const cleanup = updater.subscribeUpdateStatus();
    await vi.dynamicImportSettled();
    (mocks.listen.mock.calls[0][1] as StatusListener)({ payload: true });
    expect(updater.useUpdate.getState().nativeInstalling).toBe(true);
    cleanup();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

describe("checks and boot cancellation", () => {
  it("does not contact native code in a contributor build or browser demo", async () => {
    vi.stubEnv("VITE_CONTRIBUTOR", "1");
    expect(await updater.checkForUpdate()).toBeNull();
    updater.subscribeUpdateStatus()();
    updater.scheduleBootCheck(vi.fn())();
    await vi.dynamicImportSettled();
    expect(mocks.check).not.toHaveBeenCalled();
    expect(mocks.listen).not.toHaveBeenCalled();
    vi.stubEnv("VITE_CONTRIBUTOR", "0");
    vi.stubGlobal("window", {});
    expect(await updater.checkForUpdate()).toBeNull();
    updater.subscribeUpdateStatus()();
    await vi.dynamicImportSettled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("keeps failed checks non-throwing and normalizes missing release notes", async () => {
    mocks.check.mockRejectedValueOnce(new Error("offline"));
    expect(await updater.checkForUpdate()).toBeNull();
    const handle = { rid: 42, version: "0.8.0" };
    mocks.check.mockResolvedValueOnce(handle);
    expect(await updater.checkForUpdate()).toEqual({
      version: "0.8.0",
      notes: "",
      handle,
    });
  });

  it("cancels a queued boot check before any request", async () => {
    vi.useFakeTimers();
    const found = vi.fn();
    const cleanup = updater.scheduleBootCheck(found);
    cleanup();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(mocks.check).not.toHaveBeenCalled();
    expect(found).not.toHaveBeenCalled();
  });

  it("does not publish a boot result after cleanup while the request was pending", async () => {
    vi.useFakeTimers();
    const result = deferred<Update>();
    const found = vi.fn();
    mocks.check.mockReturnValue(result.promise);
    const cleanup = updater.scheduleBootCheck(found);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(mocks.check).toHaveBeenCalledTimes(1);
    cleanup();
    result.resolve(info.handle);
    await vi.advanceTimersByTimeAsync(0);
    expect(found).not.toHaveBeenCalled();
  });
});
