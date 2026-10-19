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
  setOauthConfig: vi.fn(),
  authStatus: vi.fn(),
  kickLoginStart: vi.fn(),
  kickFetchStreamKey: vi.fn(),
  subscribeAuthFlow: vi.fn(),
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

  it("asks Kick for the ban and stream key scopes only on demand", async () => {
    const status = (kickCanBan: boolean, kickCanReadKey = kickCanBan) => ({
      twitchLogin: null,
      twitchMissingScopes: [],
      youtube: false,
      youtubeConfigured: false,
      youtubeOfficialReady: false,
      youtubeOwnCreds: false,
      youtubeUsingOwnCreds: false,
      kick: true,
      kickConfigured: true,
      kickOfficialReady: true,
      kickOwnCreds: false,
      kickUsingOwnCreds: false,
      kickCanBan,
      kickCanReadKey,
      brokerError: null,
    });
    mocks.authStatus.mockResolvedValue(status(false));
    await useStore.getState().setupOauth();
    expect(useStore.getState().chatLogin.kick).toEqual({
      state: "connected",
      missingScopes: ["moderation:ban", "streamkey:read"],
    });
    mocks.authStatus.mockResolvedValue(status(true, false));
    await useStore.getState().setupOauth();
    expect(useStore.getState().chatLogin.kick.missingScopes).toEqual([
      "streamkey:read",
    ]);
    mocks.authStatus.mockResolvedValue(status(true));
    await useStore.getState().setupOauth();
    expect(useStore.getState().chatLogin.kick.missingScopes).toEqual([]);

    await useStore.getState().kickLogin();
    expect(mocks.kickLoginStart).toHaveBeenLastCalledWith({
      moderation: false,
      streamKey: false,
    });
    await useStore.getState().kickLogin({ moderation: true });
    expect(mocks.kickLoginStart).toHaveBeenLastCalledWith({
      moderation: true,
      streamKey: false,
    });
    await useStore.getState().kickLogin({ streamKey: true });
    expect(mocks.kickLoginStart).toHaveBeenLastCalledWith({
      moderation: false,
      streamKey: true,
    });

    // A login event does not carry scopes, so every window reloads them.
    let emit: (
      who: string,
      event: { state: string; login?: string },
    ) => void = () => undefined;
    mocks.subscribeAuthFlow.mockImplementation((callback) => {
      emit = callback;
      return () => undefined;
    });
    mocks.authStatus.mockResolvedValue(status(false));
    useStore.getState().bindAuthFlow(((key: string) => key) as never);
    emit("kick", { state: "connected", login: "ana" });
    await vi.waitFor(() =>
      expect(useStore.getState().chatLogin.kick.missingScopes).toEqual([
        "moderation:ban",
        "streamkey:read",
      ]),
    );
  });

  it("fills the Kick server only for a destination without one", async () => {
    const config = defaultConfig();
    const empty = {
      ...config.targets[0],
      id: "kick-1",
      platformId: "kick" as const,
      ingestUrl: "",
      hasKey: false,
    };
    const custom = {
      ...empty,
      id: "kick-2",
      ingestUrl: "rtmps://custom.example/app",
    };
    config.targets = [empty, custom];
    useStore.setState({ config });
    mocks.saveConfig.mockImplementation(async (saved: AppConfig) => saved);
    mocks.kickFetchStreamKey.mockResolvedValue({
      login: "ana",
      url: "rtmps://account.example/app",
    });
    expect(await useStore.getState().fetchKickKey("kick-1")).toBe("ana");
    expect(await useStore.getState().fetchKickKey("kick-2")).toBe("ana");
    expect(
      useStore
        .getState()
        .config!.targets.map((target) => [target.ingestUrl, target.hasKey]),
    ).toEqual([
      ["rtmps://account.example/app", true],
      ["rtmps://custom.example/app", true],
    ]);
  });
});
