import { describe, expect, it, vi } from "vitest";
import {
  createObsCoordinator,
  ObsConfigChangedError,
  ObsConfigSaveError,
} from "./obsCoordinator";
import type { ObsCheck } from "./types";

const result: ObsCheck = {
  reachable: true,
  pointingAtCorneta: true,
  width: 1920,
  height: 1080,
  fps: 60,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup() {
  let key = "settings-1";
  let now = 10_000;
  const deps = {
    flushSave: vi.fn(async () => {}),
    configKey: () => key,
    now: () => now,
    check: vi.fn(async (): Promise<ObsCheck> => result),
    configure: vi.fn(async () => {}),
  };
  return {
    deps,
    obs: createObsCoordinator(deps),
    setKey: (next: string) => {
      key = next;
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("OBS requests use persisted settings", () => {
  it.each(["check", "configure"] as const)(
    "waits for save before %s",
    async (action) => {
      const { deps, obs } = setup();
      const save = deferred<void>();
      deps.flushSave.mockReturnValue(save.promise);
      const request = obs[action]();
      await Promise.resolve();
      expect(deps[action]).not.toHaveBeenCalled();
      save.resolve();
      await request;
      expect(deps[action]).toHaveBeenCalledOnce();
    },
  );

  it.each(["check", "configure"] as const)(
    "does not call %s when settings cannot be saved",
    async (action) => {
      const { deps, obs } = setup();
      deps.flushSave.mockRejectedValue(new ObsConfigSaveError());
      await expect(obs[action]()).rejects.toBeInstanceOf(ObsConfigSaveError);
      expect(deps[action]).not.toHaveBeenCalled();
    },
  );

  it("deduplicates concurrent background and explicit checks", async () => {
    const { deps, obs } = setup();
    const pending = deferred<ObsCheck>();
    deps.check.mockReturnValue(pending.promise);
    const first = obs.check();
    const second = obs.check(true);
    expect(first).toBe(second);
    await Promise.resolve();
    expect(deps.check).toHaveBeenCalledOnce();
    pending.resolve(result);
    await expect(second).resolves.toEqual(result);
  });

  it("reuses a short cache only for the same configuration; force and expiration bypass it", async () => {
    const { deps, obs, setKey, advance } = setup();
    await obs.check();
    await obs.check();
    expect(deps.check).toHaveBeenCalledTimes(1);
    setKey("settings-2");
    await obs.check();
    await obs.check(true);
    advance(5000);
    await obs.check();
    expect(deps.check).toHaveBeenCalledTimes(4);
    expect(deps.flushSave).toHaveBeenCalledTimes(5);
  });

  it.each([false, true])(
    "discards stale %s results and waits for current settings before retrying",
    async (fail) => {
      const { deps, obs, setKey } = setup();
      const old = deferred<ObsCheck>();
      const latestSave = deferred<void>();
      deps.check.mockReturnValueOnce(old.promise);
      const request = obs.check();
      await Promise.resolve();
      setKey("settings-2");
      deps.flushSave.mockReturnValueOnce(latestSave.promise);
      if (fail) old.reject(new Error("old query failed"));
      else old.resolve({ ...result, reachable: false });
      await Promise.resolve();
      await Promise.resolve();
      expect(deps.check).toHaveBeenCalledTimes(1);
      latestSave.resolve();
      await expect(request).resolves.toEqual(result);
      expect(deps.check).toHaveBeenCalledTimes(2);
    },
  );

  it("serializes configuring with checks, deduplicates clicks, and invalidates the cache", async () => {
    const { deps, obs } = setup();
    await obs.check();
    const setupRequest = deferred<void>();
    deps.configure.mockReturnValue(setupRequest.promise);
    const configuring = obs.configure();
    expect(obs.configure()).toBe(configuring);
    const checking = obs.check();
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.configure).toHaveBeenCalledOnce();
    expect(deps.check).toHaveBeenCalledTimes(1);
    setupRequest.resolve();
    await configuring;
    await checking;
    expect(deps.check).toHaveBeenCalledTimes(2);
  });

  it("does not report successful configuration after the settings changed mid-request", async () => {
    const { deps, obs, setKey } = setup();
    const setupRequest = deferred<void>();
    deps.configure.mockReturnValue(setupRequest.promise);
    const request = obs.configure();
    await Promise.resolve();
    await Promise.resolve();
    setKey("settings-2");
    setupRequest.resolve();
    await expect(request).rejects.toBeInstanceOf(ObsConfigChangedError);
  });

  it("releases failed in-flight work so a retry can run", async () => {
    const { deps, obs } = setup();
    deps.check.mockRejectedValueOnce(new Error("disconnected"));
    await expect(obs.check()).rejects.toThrow("disconnected");
    await expect(obs.check()).resolves.toEqual(result);
    deps.configure.mockRejectedValueOnce(new Error("unavailable"));
    await expect(obs.configure()).rejects.toThrow("unavailable");
    await expect(obs.configure()).resolves.toBeUndefined();
  });
});
