import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConfig } from "./factory";
import type { AppConfig } from "./types";

const mocks = vi.hoisted(() => ({
  saveConfig: vi.fn(),
  setKey: vi.fn(),
}));

vi.mock("./api", () => ({
  api: mocks,
  IS_TAURI: true,
  START_CANCELLED: "START_CANCELLED",
}));
vi.mock("./telemetry", () => ({
  addStep: vi.fn(),
  capture: vi.fn(),
}));

import { useStore } from "./store";

describe("ordenação entre configuração e cofre", () => {
  beforeEach(() => {
    mocks.saveConfig.mockReset();
    mocks.setKey.mockReset();
    useStore.setState({ config: defaultConfig(), loaded: true });
  });

  it("persiste um destino novo antes de gravar sua chave", async () => {
    let releaseFirstSave!: () => void;
    let first = true;
    mocks.saveConfig.mockImplementation(async (config) => {
      if (first) {
        first = false;
        await new Promise<void>((resolve) => {
          releaseFirstSave = resolve;
        });
      }
      return { ...config, revision: config.revision + 1 };
    });
    mocks.setKey.mockResolvedValue(undefined);

    const id = useStore.getState().addTarget("custom");
    expect(id).toBeTruthy();
    const savingKey = useStore.getState().setKey(id!, "stream-secret");

    await vi.waitFor(() => expect(mocks.saveConfig).toHaveBeenCalledTimes(1));
    expect(mocks.setKey).not.toHaveBeenCalled();

    releaseFirstSave();
    await savingKey;
    await vi.waitFor(() => expect(mocks.saveConfig).toHaveBeenCalledTimes(2));

    expect(mocks.setKey).toHaveBeenCalledWith(id, "stream-secret");
    const firstSavedConfig = mocks.saveConfig.mock.calls[0][0] as AppConfig;
    expect(firstSavedConfig.targets.some((target) => target.id === id)).toBe(
      true,
    );
  });
});
