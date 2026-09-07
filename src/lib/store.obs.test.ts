import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConfig } from "./factory";
import type { AppConfig } from "./types";
import type { useStore as Store } from "./store";

const api = vi.hoisted(() => ({
  saveConfig: vi.fn(),
  obsCheck: vi.fn(),
  obsAutoconfigure: vi.fn(),
  subscribeConfigChanged: vi.fn(),
}));
vi.mock("./api", () => ({ api, IS_TAURI: true, START_CANCELLED: "cancelled" }));
vi.mock("./telemetry", () => ({ addStep: vi.fn(), capture: vi.fn() }));

describe("store OBS persistence barrier", () => {
  let store: typeof Store;
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();
    ({ useStore: store } = await import("./store"));
    store.setState({ config: defaultConfig(), loaded: true });
    api.obsCheck.mockResolvedValue({
      reachable: true,
      pointingAtCorneta: true,
      width: 1920,
      height: 1080,
      fps: 60,
    });
    api.obsAutoconfigure.mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(["checkObs", "configureObs"] as const)(
    "%s waits for password edits queued during an earlier save",
    async (action) => {
      const finish: (() => void)[] = [];
      let persistedPassword = "";
      api.saveConfig.mockImplementation(
        (config: AppConfig) =>
          new Promise((resolve) => {
            finish.push(() => {
              persistedPassword = config.settings.obsPassword;
              resolve(config);
            });
          }),
      );
      store.getState().setSettings({ obsPassword: "synthetic-first" });
      const request = store.getState()[action]();
      await vi.waitFor(() => expect(finish).toHaveLength(1));
      store.getState().setSettings({ obsPassword: "synthetic-latest" });
      finish[0]();
      await vi.waitFor(() => expect(finish).toHaveLength(2));
      expect(api.obsCheck).not.toHaveBeenCalled();
      expect(api.obsAutoconfigure).not.toHaveBeenCalled();
      finish[1]();
      await request;
      expect(persistedPassword).toBe("synthetic-latest");
      expect(
        action === "checkObs" ? api.obsCheck : api.obsAutoconfigure,
      ).toHaveBeenCalledOnce();
    },
  );

  it("blocks explicit OBS actions after a failed save, keeps background polls handled, and recovers after saving", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    api.saveConfig.mockRejectedValueOnce(new Error("synthetic disk failure"));
    store.getState().setSettings({ obsPassword: "synthetic-new" });
    await expect(store.getState().checkObs(true)).rejects.toThrow(
      "corneta:obs-config-save-failed",
    );
    await expect(store.getState().configureObs()).rejects.toThrow(
      "corneta:obs-config-save-failed",
    );
    await expect(store.getState().runObsCheck()).resolves.toBeUndefined();
    expect(api.obsCheck).not.toHaveBeenCalled();
    expect(api.obsAutoconfigure).not.toHaveBeenCalled();
    expect(store.getState().obs).not.toBe("loading");
    api.saveConfig.mockImplementation(async (config: AppConfig) => config);
    store.getState().setSettings({ obsPassword: "synthetic-retry" });
    await expect(store.getState().checkObs(true)).resolves.toMatchObject({
      reachable: true,
    });
    expect(api.obsCheck).toHaveBeenCalledOnce();
  });

  it("accepts a confirmed config from another window after a failed local save", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let receive!: (config: AppConfig) => void;
    api.subscribeConfigChanged.mockImplementation((callback) => {
      receive = callback;
      return () => {};
    });
    store.getState().bindConfigSync();
    api.saveConfig.mockRejectedValueOnce(new Error("synthetic disk failure"));
    store.getState().setSettings({ obsPassword: "synthetic-unsaved" });
    await expect(store.getState().checkObs()).rejects.toThrow(
      "corneta:obs-config-save-failed",
    );
    receive({ ...defaultConfig(), revision: 42 });
    await expect(store.getState().checkObs()).resolves.toMatchObject({
      reachable: true,
    });
    expect(api.obsCheck).toHaveBeenCalledOnce();
  });
});
