import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConfig } from "./factory";
import type { AppConfig, ChatMessage } from "./types";

const mocks = vi.hoisted(() => ({
  saveConfig: vi.fn(),
  clearKey: vi.fn(),
  twitchLogout: vi.fn(),
  youtubeLogout: vi.fn(),
  kickLogout: vi.fn(),
  subscribeChat: vi.fn(),
  subscribeConfigChanged: vi.fn(),
}));
vi.mock("./api", () => ({
  api: mocks,
  IS_TAURI: true,
  START_CANCELLED: "corneta:start-cancelled",
}));
vi.mock("./telemetry", () => ({ addStep: vi.fn(), capture: vi.fn() }));
import { useStore } from "./store";

describe("store slices preserve shared contracts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useStore.setState(
      { ...useStore.getInitialState(), config: defaultConfig(), loaded: true },
      true,
    );
  });
  afterEach(() => vi.useRealTimers());

  it.each(["twitch", "youtube", "kick"] as const)(
    "keeps %s connected when local credential deletion fails",
    async (platform) => {
      const action = `${platform}Logout` as const;
      mocks[action].mockRejectedValue(new Error("vault unavailable"));
      useStore.setState({
        chatLogin: {
          ...useStore.getState().chatLogin,
          [platform]: { state: "connected" },
        },
      });
      await expect(useStore.getState()[action]()).rejects.toThrow(
        "vault unavailable",
      );
      expect(useStore.getState().chatLogin[platform].state).toBe("connected");
      mocks[action].mockResolvedValue(undefined);
      await useStore.getState()[action]();
      expect(useStore.getState().chatLogin[platform].state).toBe("out");
    },
  );

  it("does not claim a destination key was cleared after an IPC failure", async () => {
    const config = defaultConfig();
    config.targets[0].hasKey = true;
    useStore.setState({ config });
    mocks.clearKey.mockRejectedValue(new Error("vault unavailable"));
    await expect(
      useStore.getState().clearKey(config.targets[0].id),
    ).rejects.toThrow();
    expect(useStore.getState().config?.targets[0].hasKey).toBe(true);
    expect(mocks.saveConfig).not.toHaveBeenCalled();
  });

  it.each(["clearAlertToken", "clearChatSendToken"] as const)(
    "%s preserves the configured source and token flag when the vault rejects deletion",
    async (action) => {
      const config = defaultConfig();
      config.settings.alertSources = [
        {
          id: "alert",
          kind: "streamlabs",
          name: "alerts",
          enabled: true,
          hasToken: true,
        },
      ];
      config.settings.chatSources = [
        {
          id: "chat",
          platform: "twitch",
          name: "chat",
          value: "channel",
          enabled: true,
          hasSendToken: true,
        },
      ];
      useStore.setState({ config });
      mocks.clearKey.mockRejectedValue(new Error("vault unavailable"));
      const state = useStore.getState();
      await expect(
        state[action](action === "clearAlertToken" ? "alert" : "chat"),
      ).rejects.toThrow();
      expect(useStore.getState().config).toBe(config);
      expect(mocks.saveConfig).not.toHaveBeenCalled();
    },
  );

  it("applies another window's config without saving it back", () => {
    let receive!: (config: AppConfig) => void;
    const unsubscribe = vi.fn();
    mocks.subscribeConfigChanged.mockImplementation((callback) => {
      receive = callback;
      return unsubscribe;
    });
    const stop = useStore.getState().bindConfigSync();
    const next = { ...defaultConfig(), revision: 40 };
    receive(next);
    expect(useStore.getState().config).toBe(next);
    expect(mocks.saveConfig).not.toHaveBeenCalled();
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("clearing chat cancels pending batches in the extracted slice", () => {
    vi.useFakeTimers();
    let receive!: (message: ChatMessage) => void;
    const unsubscribe = vi.fn();
    mocks.subscribeChat.mockImplementation((callback) => {
      receive = callback;
      return unsubscribe;
    });
    const stop = useStore.getState().bindChat();
    receive({
      id: "1",
      nativeId: "1",
      source: "channel",
      platform: "twitch",
      author: "demo",
    } as ChatMessage);
    useStore.getState().clearChat();
    vi.runAllTimers();
    expect(useStore.getState().chatMessages).toEqual([]);
    receive({
      id: "2",
      nativeId: "2",
      source: "channel",
      platform: "twitch",
      author: "demo",
    } as ChatMessage);
    vi.runAllTimers();
    expect(
      useStore.getState().chatMessages.map((message) => message.id),
    ).toEqual(["2"]);
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
