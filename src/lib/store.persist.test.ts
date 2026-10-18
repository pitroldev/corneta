import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConfig } from "./factory";
import type { AppConfig } from "./types";
import type { useStore as Store } from "./store";

const api = vi.hoisted(() => ({
  saveConfig: vi.fn(),
  subscribeConfigChanged: vi.fn(),
}));
vi.mock("./api", () => ({ api, IS_TAURI: true, START_CANCELLED: "cancelled" }));
vi.mock("./telemetry", () => ({ addStep: vi.fn(), capture: vi.fn() }));

describe("store config persistence queue", () => {
  let store: typeof Store;
  let finish: ((revision: number) => void)[];
  let saved: AppConfig[];

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();
    ({ useStore: store } = await import("./store"));
    store.setState({ config: defaultConfig(), loaded: true });
    finish = [];
    saved = [];
    api.saveConfig.mockImplementation(
      (config: AppConfig) =>
        new Promise((resolve) => {
          finish.push((revision) => {
            saved.push(config);
            resolve({ ...config, revision });
          });
        }),
    );
  });

  it("collapses edits made during an in-flight save into one save of the latest config", async () => {
    store.getState().setSettings({ obsPassword: "synthetic-a" });
    await vi.waitFor(() => expect(finish).toHaveLength(1));
    store.getState().setSettings({ obsPassword: "synthetic-b" });
    store.getState().setSettings({ obsPassword: "synthetic-c" });
    store.getState().setSettings({ obsPassword: "synthetic-d" });
    finish[0](1);
    await vi.waitFor(() => expect(finish).toHaveLength(2));
    finish[1](2);
    await vi.waitFor(() => expect(saved).toHaveLength(2));
    expect(api.saveConfig).toHaveBeenCalledTimes(2);
    expect(saved.map((config) => config.settings.obsPassword)).toEqual([
      "synthetic-a",
      "synthetic-d",
    ]);
    expect(api.saveConfig.mock.calls[1][0].revision).toBe(1);
  });

  it("keeps the newest local edit while an older save completes", async () => {
    store.getState().setSettings({ obsPassword: "synthetic-old" });
    await vi.waitFor(() => expect(finish).toHaveLength(1));
    store.getState().setSettings({ obsPassword: "synthetic-new" });
    finish[0](1);
    await vi.waitFor(() => expect(finish).toHaveLength(2));
    expect(store.getState().config?.settings.obsPassword).toBe("synthetic-new");
    finish[1](2);
    await vi.waitFor(() => expect(store.getState().config?.revision).toBe(2));
    expect(store.getState().config?.settings.obsPassword).toBe("synthetic-new");
  });

  it("ignores another window's config until local edits are saved", async () => {
    let receive!: (config: AppConfig) => void;
    api.subscribeConfigChanged.mockImplementation((callback) => {
      receive = callback;
      return () => {};
    });
    store.getState().bindConfigSync();
    store.getState().setSettings({ obsPassword: "synthetic-local" });
    await vi.waitFor(() => expect(finish).toHaveLength(1));
    receive({
      ...defaultConfig(),
      revision: 7,
      settings: {
        ...defaultConfig().settings,
        obsPassword: "synthetic-remote",
      },
    });
    expect(store.getState().config?.settings.obsPassword).toBe(
      "synthetic-local",
    );
    finish[0](8);
    await vi.waitFor(() => expect(store.getState().config?.revision).toBe(8));
    receive({
      ...defaultConfig(),
      revision: 9,
      settings: {
        ...defaultConfig().settings,
        obsPassword: "synthetic-remote",
      },
    });
    expect(store.getState().config?.settings.obsPassword).toBe(
      "synthetic-remote",
    );
  });
});
