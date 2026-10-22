import { describe, expect, it } from "vitest";
import {
  resolveSendTargets,
  sendMaxLength,
  sendStatusLine,
  srcLabel,
  type SendReady,
  type Translate,
} from "./chatSend";
import type { ChatPlatform, ChatSource } from "./types";

const source = (
  id: string,
  platform: ChatPlatform,
  extra: Partial<ChatSource> = {},
): ChatSource => ({
  id,
  platform,
  value: `channel-${id}`,
  name: "",
  enabled: true,
  ...extra,
});
const none: SendReady = { twitch: false, youtube: false, kick: false };
const all: SendReady = { twitch: true, youtube: true, kick: true };

describe("resolveSendTargets", () => {
  it("lets Twitch address a source by token or login, but sends only after IRC authenticates", () => {
    const byToken = source("t", "twitch", { hasSendToken: true });
    const pending = resolveSendTargets([byToken], "all", none, {});
    expect(pending.sendable).toEqual([byToken]);
    expect(pending.canSend).toBe(false);
    expect(
      resolveSendTargets([byToken], "all", none, {
        t: { login: "me", ok: false },
      }).canSend,
    ).toBe(false);
    expect(
      resolveSendTargets([byToken], "all", none, {
        t: { login: "me", ok: true },
      }).canSend,
    ).toBe(true);
    expect(
      resolveSendTargets(
        [source("t", "twitch")],
        "all",
        { ...none, twitch: true },
        {},
      ).sendable,
    ).toHaveLength(1);
  });

  it("follows the login for YouTube and Kick and never sends to Cinefy", () => {
    const sources = [
      source("y", "youtube"),
      source("k", "kick"),
      source("c", "cinefy"),
    ];
    expect(resolveSendTargets(sources, "all", none, {}).sendable).toEqual([]);
    const ready = resolveSendTargets(sources, "all", all, {});
    expect(ready.sendable.map((x) => x.id)).toEqual(["y", "k"]);
    expect(ready.canSend).toBe(true);
  });

  it("never addresses disabled sources or sources without a channel", () => {
    const sources = [
      source("on", "youtube"),
      source("off", "youtube", { enabled: false }),
      source("blank", "kick", { value: "  " }),
    ];
    const result = resolveSendTargets(sources, "all", all, {});
    expect(result.targets.map((x) => x.id)).toEqual(["on"]);
    expect(resolveSendTargets(sources, "off", all, {}).effectiveSendTo).toBe(
      "all",
    );
  });

  it("sends to one chosen source or to every sendable source in order", () => {
    const sources = [source("a", "youtube"), source("b", "kick")];
    expect(resolveSendTargets(sources, "b", all, {}).targets).toEqual([
      sources[1],
    ]);
    expect(resolveSendTargets(sources, "all", all, {}).targets).toEqual(
      sources,
    );
  });

  it("widens an unknown or unready choice to all and keeps mixed readiness sendable", () => {
    const sources = [source("y", "youtube"), source("k", "kick")];
    const ready = { ...none, youtube: true };
    const result = resolveSendTargets(sources, "k", ready, {});
    expect(result.effectiveSendTo).toBe("all");
    expect(result.targets.map((x) => x.id)).toEqual(["y"]);
    expect(result.canSend).toBe(true);
    const mixed = resolveSendTargets(
      [source("t", "twitch", { hasSendToken: true }), source("y", "youtube")],
      "all",
      ready,
      {},
    );
    expect(mixed.targets.map((x) => x.id)).toEqual(["t", "y"]);
    expect(mixed.canSend).toBe(true);
  });

  it("handles no sources without mutating its input", () => {
    const sources = Object.freeze([source("y", "youtube")]);
    expect(resolveSendTargets([], "all", all, {})).toEqual({
      sendable: [],
      effectiveSendTo: "all",
      targets: [],
      canSend: false,
    });
    expect(() => resolveSendTargets(sources, "y", all, {})).not.toThrow();
  });
});

const echo = ((key: string, vars?: Record<string, string | number>) =>
  vars
    ? `${key}(${Object.entries(vars)
        .map(([name, value]) => `${name}=${value}`)
        .join(",")})`
    : key) as Translate;

describe("srcLabel", () => {
  it("prefers the source name and falls back to the channel when it is blank", () => {
    expect(srcLabel(source("a", "twitch", { name: "Main" }))).toBe("Main");
    expect(srcLabel(source("a", "twitch", { name: "  " }))).toBe("channel-a");
  });
});

describe("sendStatusLine", () => {
  it("asks YouTube and Kick sources to sign in until their login is ready", () => {
    const sources = [
      source("y", "youtube", { name: "Main YT" }),
      source("k", "kick"),
    ];
    expect(sendStatusLine(sources, {}, none, echo)).toBe(
      "chat.send.status.signIn(label=Main YT,platform=YouTube) · " +
        "chat.send.status.signIn(label=channel-k,platform=Kick)",
    );
    expect(sendStatusLine(sources, {}, all, echo)).toBe(
      "chat.send.status.signedIn(platform=YouTube) · " +
        "chat.send.status.signedIn(platform=Kick)",
    );
  });

  it("walks a Twitch source from connecting to signed in", () => {
    const twitch = [source("t", "twitch")];
    const ircReady = { ...none, twitch: true };
    expect(sendStatusLine(twitch, {}, none, echo)).toBe(
      "chat.send.status.connect(label=channel-t)",
    );
    expect(
      sendStatusLine(twitch, { t: { login: "me", ok: false } }, none, echo),
    ).toBe("chat.send.status.invalidToken(label=channel-t)");
    expect(
      sendStatusLine(twitch, { t: { login: "me", ok: false } }, ircReady, echo),
    ).toBe("chat.send.status.reconnect(label=channel-t)");
    expect(
      sendStatusLine(twitch, { t: { login: "me", ok: true } }, none, echo),
    ).toBe("chat.loginrow.signedInAs(login=me)");
  });

  it("reports each target in order and nothing when there are none", () => {
    const sources = [source("k", "kick"), source("t", "twitch")];
    expect(sendStatusLine(sources, {}, all, echo).split(" · ")).toEqual([
      "chat.send.status.signedIn(platform=Kick)",
      "chat.send.status.reconnect(label=channel-t)",
    ]);
    expect(sendStatusLine([], {}, all, echo)).toBe("");
  });
});

describe("sendMaxLength", () => {
  it("uses the shortest limit among the targets", () => {
    expect(sendMaxLength([source("t", "twitch")])).toBe(480);
    expect(sendMaxLength([source("t", "twitch"), source("y", "youtube")])).toBe(
      200,
    );
    expect(sendMaxLength([])).toBeUndefined();
  });
});
