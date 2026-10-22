import { describe, expect, it, vi } from "vitest";
import {
  connectAction,
  finishConnect,
  loginOutcome,
  missingKeyScope,
  startLogin,
  type ConnectDeps,
} from "./connectAccount";

function deps(patch: Partial<ConnectDeps> = {}): ConnectDeps {
  return {
    youtubeAutoLive: false,
    setSettings: vi.fn(),
    fetchStreamKey: vi.fn(async (platform) =>
      platform === "twitch" ? "lu_gamer" : "",
    ),
    ...patch,
  };
}

describe("connectAction", () => {
  it("opens the browser when there is no usable login", () => {
    expect(connectAction("twitch", null)).toBe("login");
    expect(connectAction("twitch", { state: "out" })).toBe("login");
    expect(connectAction("kick", { state: "error", message: "x" })).toBe(
      "login",
    );
  });

  it("finishes right away with a connected login", () => {
    expect(connectAction("twitch", { state: "connected", login: "lu" })).toBe(
      "finish",
    );
    expect(connectAction("youtube", { state: "connected" })).toBe("finish");
  });

  it("signs in again when the login predates the stream key scope", () => {
    const twitch = {
      state: "connected",
      missingScopes: ["channel:read:stream_key"],
    };
    const kick = { state: "connected", missingScopes: ["streamkey:read"] };
    expect(missingKeyScope("twitch", twitch)).toBe(true);
    expect(connectAction("twitch", twitch)).toBe("login");
    expect(connectAction("kick", kick)).toBe("login");
  });

  it("ignores scopes unrelated to the stream key", () => {
    const kick = { state: "connected", missingScopes: ["moderation:ban"] };
    expect(missingKeyScope("kick", kick)).toBe(false);
    expect(connectAction("kick", kick)).toBe("finish");
  });
});

describe("loginOutcome", () => {
  it.each([
    ["connected", "finish"],
    ["error", "cancel"],
    ["out", "cancel"],
    ["code", "wait"],
    [undefined, "wait"],
  ] as const)("%s → %s", (state, outcome) => {
    expect(loginOutcome(state)).toBe(outcome);
  });
});

describe("finishConnect", () => {
  it("reads the Twitch key through the login and reports the account", async () => {
    const d = deps();
    await expect(finishConnect("twitch", "tgt_1", d)).resolves.toEqual({
      kind: "key",
      login: "lu_gamer",
    });
    expect(d.fetchStreamKey).toHaveBeenCalledWith("twitch", "tgt_1");
    expect(d.fetchStreamKey).toHaveBeenCalledTimes(1);
  });

  it("reads the Kick key, which may come without an account name", async () => {
    const d = deps();
    await expect(finishConnect("kick", "tgt_2", d)).resolves.toEqual({
      kind: "key",
      login: "",
    });
    expect(d.fetchStreamKey).toHaveBeenCalledWith("kick", "tgt_2");
  });

  it("turns on automatic YouTube instead of fetching a key", async () => {
    const d = deps();
    await expect(finishConnect("youtube", "tgt_3", d)).resolves.toEqual({
      kind: "autoBroadcast",
    });
    expect(d.setSettings).toHaveBeenCalledWith({ youtubeAutoLive: true });
    expect(d.fetchStreamKey).not.toHaveBeenCalled();
  });

  it("leaves settings alone when automatic YouTube is already on", async () => {
    const d = deps({ youtubeAutoLive: true });
    await finishConnect("youtube", "tgt_3", d);
    expect(d.setSettings).not.toHaveBeenCalled();
  });

  it("passes a failed key fetch to the caller", async () => {
    const d = deps({
      fetchStreamKey: vi.fn(async () => {
        throw new Error("denied");
      }),
    });
    await expect(finishConnect("twitch", "tgt_1", d)).rejects.toThrow("denied");
  });
});

describe("startLogin", () => {
  it("asks Kick for the stream key scope and uses each platform's login", async () => {
    const d = { accountLogin: vi.fn(async () => {}) };
    await startLogin("kick", d);
    await startLogin("twitch", d);
    await startLogin("youtube", d);
    expect(d.accountLogin).toHaveBeenNthCalledWith(1, "kick", {
      streamKey: true,
    });
    expect(d.accountLogin).toHaveBeenNthCalledWith(2, "twitch", undefined);
    expect(d.accountLogin).toHaveBeenNthCalledWith(3, "youtube", undefined);
  });
});
