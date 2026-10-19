import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConfig } from "./factory";
import type { useStore as Store } from "./store";
import type { T } from "./store/types";
import type { AppConfig } from "./types";

interface AuthEvent {
  state: string;
  userCode: string;
  verifyUri: string;
  verifyUriComplete?: string;
  login: string;
}

const native = vi.hoisted(() => {
  // IPC payloads are JSON, so every webview receives its own copy.
  const copy = <V>(value: V): V => structuredClone(value);
  const configListeners = new Set<(config: AppConfig) => void>();
  const authListeners = new Set<(who: string, event: AuthEvent) => void>();
  const heldSaves: { config: AppConfig; run: () => void }[] = [];
  const deferredBroadcasts: { revision: number; deliver: () => void }[] = [];
  const state = {
    disk: {} as AppConfig,
    holdSaves: false,
    deferBroadcasts: false,
  };

  function broadcast(config: AppConfig) {
    for (const listener of [...configListeners]) {
      const deliver = () => listener(copy(config));
      if (state.deferBroadcasts)
        deferredBroadcasts.push({ revision: config.revision, deliver });
      else queueMicrotask(deliver);
    }
  }

  // Mirrors commands::save_config: stale revisions are rejected; accepted saves reach every webview.
  function executeSave(config: AppConfig): AppConfig {
    if (config.revision < state.disk.revision)
      throw new Error("synthetic stale config revision");
    state.disk = { ...copy(config), revision: state.disk.revision + 1 };
    broadcast(state.disk);
    return copy(state.disk);
  }

  const api = {
    getConfig: vi.fn(async () => copy(state.disk)),
    saveConfig: vi.fn(
      (config: AppConfig) =>
        new Promise<AppConfig>((resolve, reject) => {
          const sent = copy(config);
          const run = () => {
            try {
              resolve(executeSave(sent));
            } catch (error) {
              reject(error);
            }
          };
          if (state.holdSaves) heldSaves.push({ config: sent, run });
          else run();
        }),
    ),
    subscribeConfigChanged: vi.fn((listener: (config: AppConfig) => void) => {
      configListeners.add(listener);
      return () => {
        configListeners.delete(listener);
      };
    }),
    chatRunning: vi.fn(async () => false),
    listSessions: vi.fn(async () => []),
    chatStart: vi.fn(async () => undefined),
    twitchLoginStart: vi.fn(async () => undefined),
    kickLoginStart: vi.fn(async () => undefined),
    subscribeAuthFlow: vi.fn(
      (listener: (who: string, event: AuthEvent) => void) => {
        authListeners.add(listener);
        return () => {
          authListeners.delete(listener);
        };
      },
    ),
  };

  return {
    api,
    state,
    heldSaves,
    deferredBroadcasts,
    configListeners,
    authListeners,
    openExternal: vi.fn(async (_url: string) => undefined),
    writeText: vi.fn(async (_text: string) => undefined),
    releaseSave(match: (config: AppConfig) => boolean) {
      const index = heldSaves.findIndex((save) => match(save.config));
      if (index < 0) throw new Error("no held save matches");
      heldSaves.splice(index, 1)[0].run();
    },
    deliverBroadcasts(revision: number) {
      for (const item of deferredBroadcasts.filter(
        (broadcast) => broadcast.revision === revision,
      )) {
        deferredBroadcasts.splice(deferredBroadcasts.indexOf(item), 1);
        item.deliver();
      }
    },
    emitAuth(who: string, event: AuthEvent) {
      for (const listener of [...authListeners]) listener(who, copy(event));
    },
  };
});

vi.mock("./api", () => ({
  api: native.api,
  IS_TAURI: true,
  START_CANCELLED: "corneta:start-cancelled",
}));
vi.mock("./telemetry", () => ({ addStep: vi.fn(), capture: vi.fn() }));
vi.mock("./utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./utils")>()),
  openExternal: native.openExternal,
}));

const t = ((key: string) => key) as T;

/** Each webview runs its own store module against the same native backend. */
async function openWindow(): Promise<typeof Store> {
  vi.resetModules();
  const { useStore } = await import("./store");
  await useStore.getState().load(t);
  useStore.getState().bindConfigSync();
  return useStore;
}

async function waitForConvergence(...webviews: (typeof Store)[]) {
  await vi.waitFor(() => {
    expect(native.heldSaves).toHaveLength(0);
    for (const webview of webviews)
      expect(webview.getState().config).toEqual(native.state.disk);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  native.configListeners.clear();
  native.authListeners.clear();
  native.heldSaves.length = 0;
  native.deferredBroadcasts.length = 0;
  Object.assign(native.state, {
    disk: { ...defaultConfig(), revision: 1 },
    holdSaves: false,
    deferBroadcasts: false,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("config sync between the main and chat windows", () => {
  it("keeps an in-flight edit when the other window saves first, then persists both edits", async () => {
    const failures = vi.spyOn(console, "error").mockImplementation(() => {});
    const main = await openWindow();
    const chat = await openWindow();
    native.state.holdSaves = true;
    main.getState().setSettings({ streamTitle: "Main window title" });
    chat.getState().setSettings({ chatPopoutTab: "chat" });
    await vi.waitFor(() => expect(native.heldSaves).toHaveLength(2));

    native.releaseSave((config) => config.settings.chatPopoutTab === "chat");
    await vi.waitFor(() => expect(chat.getState().config?.revision).toBe(2));
    expect(main.getState().config?.settings.streamTitle).toBe(
      "Main window title",
    );

    native.state.holdSaves = false;
    native.releaseSave(
      (config) => config.settings.streamTitle === "Main window title",
    );
    await waitForConvergence(main, chat);
    expect(native.state.disk.settings).toMatchObject({
      streamTitle: "Main window title",
      chatPopoutTab: "chat",
    });
    expect(failures).not.toHaveBeenCalled();
  });

  it("merges the other window's save into edits queued behind an in-flight save", async () => {
    const failures = vi.spyOn(console, "error").mockImplementation(() => {});
    const main = await openWindow();
    const chat = await openWindow();
    native.state.holdSaves = true;
    main.getState().setSettings({ streamTitle: "Draft title" });
    await vi.waitFor(() => expect(native.heldSaves).toHaveLength(1));
    main.getState().setSettings({ chatFontSize: 18 });
    chat.getState().setSettings({ chatPopoutTab: "alerts" });
    await vi.waitFor(() => expect(native.heldSaves).toHaveLength(2));

    native.releaseSave((config) => config.settings.chatPopoutTab === "alerts");
    await vi.waitFor(() => expect(chat.getState().config?.revision).toBe(2));
    expect(main.getState().config?.settings).toMatchObject({
      streamTitle: "Draft title",
      chatFontSize: 18,
    });

    native.state.holdSaves = false;
    native.releaseSave(
      (config) => config.settings.streamTitle === "Draft title",
    );
    await waitForConvergence(main, chat);
    expect(native.state.disk.settings).toMatchObject({
      streamTitle: "Draft title",
      chatFontSize: 18,
      chatPopoutTab: "alerts",
    });
    expect(failures).not.toHaveBeenCalled();
  });

  it("keeps the edit that reaches the backend last when both windows change the same field", async () => {
    const main = await openWindow();
    const chat = await openWindow();
    native.state.holdSaves = true;
    main.getState().setSettings({ chatFontSize: 16 });
    chat.getState().setSettings({ chatFontSize: 20 });
    await vi.waitFor(() => expect(native.heldSaves).toHaveLength(2));

    native.releaseSave((config) => config.settings.chatFontSize === 20);
    native.state.holdSaves = false;
    native.releaseSave((config) => config.settings.chatFontSize === 16);
    await waitForConvergence(main, chat);
    expect(native.state.disk.settings.chatFontSize).toBe(16);
  });

  it("ignores a late broadcast older than the config the window already saved", async () => {
    const main = await openWindow();
    const chat = await openWindow();
    native.state.deferBroadcasts = true;
    main.getState().setSettings({ streamTitle: "First title" });
    await vi.waitFor(() => expect(main.getState().config?.revision).toBe(2));
    main.getState().setSettings({ streamTitle: "Second title" });
    await vi.waitFor(() => expect(main.getState().config?.revision).toBe(3));

    native.deliverBroadcasts(2);
    expect(main.getState().config?.settings.streamTitle).toBe("Second title");
    expect(chat.getState().config?.settings.streamTitle).toBe("First title");

    native.deliverBroadcasts(3);
    await waitForConvergence(main, chat);
    expect(native.api.saveConfig).toHaveBeenCalledTimes(2);
  });
});

describe("auth flow shared by the main and chat windows", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { clipboard: { writeText: native.writeText } });
  });

  it("opens the login page, copies the code and restarts chat once although both windows listen", async () => {
    const main = await openWindow();
    const chat = await openWindow();
    for (const webview of [main, chat]) {
      webview.getState().bindAuthFlow(t);
      webview.setState({ chatConnected: true });
    }
    expect(native.authListeners.size).toBe(2);

    await main.getState().twitchLogin();
    native.emitAuth("twitch", {
      state: "code",
      userCode: "WDJB-MJHT",
      verifyUri: "https://www.twitch.tv/activate",
      login: "",
    });
    expect(native.writeText).toHaveBeenCalledOnce();
    expect(native.writeText).toHaveBeenCalledWith("WDJB-MJHT");
    expect(native.openExternal).toHaveBeenCalledOnce();
    expect(native.openExternal).toHaveBeenCalledWith(
      "https://www.twitch.tv/activate",
    );
    expect(chat.getState().chatLogin.twitch).toMatchObject({
      state: "code",
      userCode: "WDJB-MJHT",
    });

    native.emitAuth("twitch", {
      state: "connected",
      userCode: "",
      verifyUri: "",
      login: "streamer",
    });
    expect(native.api.chatStart).toHaveBeenCalledOnce();
    expect(native.api.twitchLoginStart).toHaveBeenCalledOnce();
    for (const webview of [main, chat])
      expect(webview.getState().chatLogin.twitch).toEqual({
        state: "connected",
        login: "streamer",
      });
  });

  it("keeps one listener after a rebind and opens the page once per login attempt", async () => {
    const main = await openWindow();
    const stopFirstBinding = main.getState().bindAuthFlow(t);
    stopFirstBinding();
    main.getState().bindAuthFlow(t);
    expect(native.authListeners.size).toBe(1);

    const url = "https://id.kick.com/oauth/authorize?state=synthetic";
    const code = {
      state: "code",
      userCode: "",
      verifyUri: url,
      verifyUriComplete: url,
      login: "",
    };
    await main.getState().kickLogin();
    native.emitAuth("kick", code);
    native.emitAuth("kick", {
      state: "error",
      userCode: "",
      verifyUri: "",
      login: "synthetic denial",
    });
    expect(main.getState().chatLogin.kick).toEqual({
      state: "error",
      message: "synthetic denial",
    });

    await main.getState().kickLogin();
    native.emitAuth("kick", code);
    expect(native.api.kickLoginStart).toHaveBeenCalledTimes(2);
    expect(native.openExternal).toHaveBeenCalledTimes(2);
    expect(native.writeText).not.toHaveBeenCalled();
    expect(native.api.chatStart).not.toHaveBeenCalled();
  });
});
