import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConfig } from "./factory";
import type { AppConfig } from "./types";
import type { useStore as Store } from "./store";

const api = vi.hoisted(() => ({
  saveConfig: vi.fn(),
  getConfig: vi.fn(),
  start: vi.fn(),
  subscribeConfigChanged: vi.fn(),
}));
vi.mock("./api", () => ({ api, IS_TAURI: true, START_CANCELLED: "cancelled" }));
vi.mock("./telemetry", () => ({ addStep: vi.fn(), capture: vi.fn() }));

describe("going live after a failed settings save", () => {
  let store: typeof Store;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();
    ({ useStore: store } = await import("./store"));
    const config = defaultConfig();
    store.setState({ config, loaded: true });
    api.getConfig.mockResolvedValue(config);
    api.start.mockResolvedValue(undefined);
  });

  it("refuses to start while the edits are still unsaved, because the engine reads the file", async () => {
    api.saveConfig.mockRejectedValue(new Error("synthetic disk failure"));
    store.getState().setSettings({ brbEnabled: true });
    await vi.waitFor(() => expect(api.saveConfig).toHaveBeenCalledTimes(1));

    await expect(store.getState().start()).rejects.toThrow(
      "config_save_failed",
    );
    expect(api.saveConfig).toHaveBeenCalledTimes(2);
    expect(api.start).not.toHaveBeenCalled();
  });

  it("saves again before starting and goes live once the save works", async () => {
    api.saveConfig.mockRejectedValueOnce(new Error("synthetic disk failure"));
    store.getState().setSettings({ brbEnabled: true });
    await vi.waitFor(() => expect(api.saveConfig).toHaveBeenCalledTimes(1));
    api.saveConfig.mockImplementation(async (config: AppConfig) => ({
      ...config,
      revision: config.revision + 1,
    }));

    await store.getState().start();
    expect(api.saveConfig.mock.calls[1][0].settings.brbEnabled).toBe(true);
    expect(api.start).toHaveBeenCalledTimes(1);
  });
});
