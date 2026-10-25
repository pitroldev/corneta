import { describe, expect, it } from "vitest";
import { keyView, platformPaused } from "./keys";
import {
  DEFAULT_LAYOUT,
  MAX_KEYS,
  DEFAULT_PREFS,
  comboId,
  newComboId,
  stepReady,
  alertWanted,
  loadPrefs,
  sanitizePrefs,
  savePrefs,
  appendChat,
  catalog,
  clearCredentials,
  effectiveLayout,
  forgetToken,
  guessDeviceName,
  hms,
  liveElapsed,
  loadCredentials,
  marksText,
  matchesDelete,
  mentions,
  pendingToken,
  rememberToken,
  saveCredentials,
  swap,
  targetTone,
  tokenFromHash,
  viewport,
  type DeckChat,
  type DeckState,
  type DeckTarget,
} from "./model";

function target(platform: string, state = "live", id = platform): DeckTarget {
  return {
    id,
    platform,
    name: "",
    state,
    bitrateKbps: 6000,
    fps: 60,
    dropped: 0,
  };
}

function deckState(over: Partial<DeckState> = {}): DeckState {
  return {
    lang: "pt-BR",
    pc: "PC",
    now: 0,
    live: {
      state: "live",
      startedAt: 0,
      forcedBrb: false,
      brbArmed: true,
      blackScreen: false,
      signalLost: false,
      ingestLive: true,
    },
    targets: [target("twitch"), target("youtube")],
    viewers: { total: 10, items: [] },
    machine: {},
    obs: {
      connected: true,
      scenes: ["Jogo"],
      scene: "Jogo",
      mic: { name: "Mic", muted: false },
    },
    ready: { platforms: 2, total: 2 },
    protections: {
      brb: true,
      autoBitrate: true,
      blackScreen: false,
    },
    title: "",
    layout: [],
    combos: [],
    chatPlatforms: ["twitch"],
    handles: [],
    session: { startedAt: 0, endedAt: null, marks: [], peak: 0 },
    ...over,
  };
}

const t = (key: string, vars?: Record<string, unknown>) =>
  vars ? `${key} ${JSON.stringify(vars)}` : key;

describe("deck layout", () => {
  it("falls back to the built-in keys", () => {
    expect(effectiveLayout(deckState())).toEqual([...DEFAULT_LAYOUT]);
  });

  it("drops keys for platforms that left the stream and caps the count", () => {
    const state = deckState({
      layout: [
        "pause:kick",
        "pause:twitch",
        "mark",
        "nope",
        ...DEFAULT_LAYOUT,
        "break",
        "bye",
      ],
    });
    const layout = effectiveLayout(state);
    expect(layout[0]).toBe("pause:twitch");
    expect(layout).not.toContain("pause:kick");
    expect(layout).not.toContain("nope");
    expect(layout).toHaveLength(MAX_KEYS);
  });

  it("offers a pause key for each platform in the stream, once", () => {
    const state = deckState({
      targets: [target("youtube", "live", "a"), target("youtube", "live", "b")],
    });
    const pauses = catalog(state).filter((item) =>
      item.id.startsWith("pause:"),
    );
    expect(pauses.map((item) => item.id)).toEqual(["pause:youtube"]);
  });

  it("swaps two positions without touching the original", () => {
    const list = ["a", "b", "c"];
    expect(swap(list, 0, 2)).toEqual(["c", "b", "a"]);
    expect(list).toEqual(["a", "b", "c"]);
  });
});

describe("deck keys", () => {
  it("flags a muted mic and explains why OBS keys are off", () => {
    const muted = keyView("mic", {
      state: deckState({
        obs: {
          connected: true,
          scenes: [],
          scene: null,
          mic: { name: "Mic", muted: true },
        },
      }),
      t,
    });
    expect(muted.tone).toBe("alarm");
    expect(muted.pressed).toBe(true);
    const offline = keyView("scene", {
      state: deckState({
        obs: { connected: false, scenes: [], scene: null, mic: null },
      }),
      t,
    });
    expect(offline.blocked).toBe("deck.key.obsOff");
  });

  it("shows the last marker with its time", () => {
    const state = deckState({
      session: {
        startedAt: 0,
        endedAt: null,
        marks: [{ at: 4_271_000, label: "Fail" }],
        peak: 0,
      },
    });
    expect(keyView("mark", { state, t }).sub).toContain('"at":"01:11:11"');
  });

  it("treats a platform as paused only when all its channels are", () => {
    const state = deckState({
      targets: [
        target("youtube", "paused", "a"),
        target("youtube", "live", "b"),
      ],
    });
    expect(platformPaused(state, "youtube")).toBe(false);
    expect(keyView("pause:youtube", { state, t }).label).toContain(
      "deck.key.pause",
    );
    const both = deckState({
      targets: [
        target("youtube", "paused", "a"),
        target("youtube", "paused", "b"),
      ],
    });
    expect(keyView("pause:youtube", { state: both, t }).label).toContain(
      "deck.key.resume",
    );
    expect(keyView("pause:kick", { state: both, t }).blocked).toBeTruthy();
  });

  it("asks to hold before ending the stream", () => {
    expect(keyView("stop", { state: deckState(), t }).hold).toBe(1500);
  });
});

describe("deck chat", () => {
  const msg = (over: Partial<DeckChat> = {}): DeckChat => ({
    id: "1",
    platform: "twitch",
    source: "s",
    author: "Ana",
    authorId: "42",
    nativeId: "n1",
    text: "oi",
    ts: 0,
    ...over,
  });

  it("removes the same lines the overlay removes", () => {
    expect(
      matchesDelete(msg(), {
        platform: "twitch",
        scope: "message",
        nativeId: "n1",
      }),
    ).toBe(true);
    expect(
      matchesDelete(msg(), {
        platform: "kick",
        scope: "message",
        nativeId: "n1",
      }),
    ).toBe(false);
    expect(
      matchesDelete(msg(), {
        platform: "twitch",
        scope: "user",
        source: "s",
        authorId: "42",
      }),
    ).toBe(true);
    expect(
      matchesDelete(msg(), {
        platform: "twitch",
        scope: "user",
        source: "s",
        author: "Bia",
      }),
    ).toBe(false);
    expect(
      matchesDelete(msg(), { platform: "twitch", scope: "all", source: "s" }),
    ).toBe(true);
  });

  it("keeps the newest lines without repeats", () => {
    let list: DeckChat[] = [];
    for (let i = 0; i < 5; i++)
      list = appendChat(list, msg({ id: String(i) }), 3);
    list = appendChat(list, msg({ id: "4" }), 3);
    expect(list.map((m) => m.id)).toEqual(["2", "3", "4"]);
  });

  it("spots @mentions of the streamer's names only", () => {
    expect(mentions("@Petro_Live responde aí", ["petro_live"])).toBe(true);
    expect(mentions("salve @petro_live!", ["petro_live"])).toBe(true);
    expect(mentions("@petro_live2 oi", ["petro_live"])).toBe(false);
    expect(mentions("petro_live sem arroba", ["petro_live"])).toBe(false);
    expect(mentions("@x @petro", ["petro"])).toBe(true);
  });

  it("banners the alert groups this phone asked for, never follows", () => {
    const all = DEFAULT_PREFS.notify;
    const alert = (kind: string) => ({ kind, platform: "twitch", user: "a" });
    expect(alertWanted(alert("follow"), all)).toBe(false);
    expect(alertWanted(alert("subgift"), all)).toBe(true);
    expect(alertWanted(alert("raid"), all)).toBe(true);
    expect(alertWanted(alert("bits"), all)).toBe(true);
    const quiet = { ...all, subs: false, raids: false };
    expect(alertWanted(alert("subgift"), quiet)).toBe(false);
    expect(alertWanted(alert("raid"), quiet)).toBe(false);
    expect(alertWanted(alert("superchat"), quiet)).toBe(true);
    expect(alertWanted(alert("something-new"), all)).toBe(false);
  });
});

describe("deck pairing", () => {
  it("reads the token only from a well-formed hash", () => {
    expect(tokenFromHash("#t=abcdefghijklmnopqrstuvwxyz012345")).toBe(
      "abcdefghijklmnopqrstuvwxyz012345",
    );
    expect(tokenFromHash("#t=short")).toBeNull();
    expect(tokenFromHash("#t=abcdefghijklmnopqrstu<script>")).toBeNull();
    expect(tokenFromHash("")).toBeNull();
  });

  it("keeps a scanned token for the tab until it is used", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    expect(pendingToken(storage)).toBeNull();
    rememberToken(storage, "abcdefghijklmnopqrstuvwxyz012345");
    expect(pendingToken(storage)).toBe("abcdefghijklmnopqrstuvwxyz012345");
    forgetToken(storage);
    expect(pendingToken(storage)).toBeNull();
    store.set("corneta.deck.pairToken", "bad token");
    expect(pendingToken(storage)).toBeNull();
  });

  it("names the phone from its browser", () => {
    expect(
      guessDeviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"),
    ).toBe("iPhone");
    expect(
      guessDeviceName(
        "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A) Chrome",
      ),
    ).toBe("SM-S918B");
    expect(guessDeviceName("Mozilla/5.0 (Linux; Android 10; K) Chrome")).toBe(
      "Android",
    );
    expect(guessDeviceName("Mozilla/5.0 (Windows NT 10.0)")).toBe("");
  });

  it("keeps credentials and survives broken storage", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    saveCredentials(storage, { device: "d1", secret: "s1" });
    expect(loadCredentials(storage)).toEqual({ device: "d1", secret: "s1" });
    clearCredentials(storage);
    expect(loadCredentials(storage)).toBeNull();
    store.set("corneta.deck.device", "{not json");
    expect(loadCredentials(storage)).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadCredentials(broken)).toBeNull();
    expect(() =>
      saveCredentials(broken, { device: "d", secret: "s" }),
    ).not.toThrow();
  });
});

describe("deck time and layout helpers", () => {
  it("counts live time by the PC clock", () => {
    // The phone clock runs 5 minutes behind the PC; the PC says 90 s have passed.
    const pcNow = 1_000_000 + 90_000;
    const received = pcNow - 300_000;
    expect(liveElapsed(1_000_000, pcNow, received, received + 10_000)).toBe(
      100_000,
    );
    expect(liveElapsed(null, pcNow, received, received)).toBe(0);
    expect(hms(100_000)).toBe("00:01:40");
  });

  it("lists moments one per line", () => {
    expect(
      marksText(
        [
          { at: 61_000, label: "Fail" },
          { at: 3_600_000, label: " " },
        ],
        "Momento",
      ),
    ).toBe("00:01:01 Fail\n01:00:00 Momento");
  });

  it("picks phone or tablet by the short side", () => {
    expect(viewport(390, 844)).toEqual({ form: "phone", orient: "portrait" });
    expect(viewport(844, 390)).toEqual({ form: "phone", orient: "landscape" });
    expect(viewport(1060, 744)).toEqual({
      form: "tablet",
      orient: "landscape",
    });
  });

  it("colors target states", () => {
    expect(targetTone("live")).toBe("ok");
    expect(targetTone("reconnecting")).toBe("warn");
    expect(targetTone("error")).toBe("bad");
    expect(targetTone("idle")).toBe("faint");
  });
});

describe("deck preferences", () => {
  it("fall back to the defaults for anything unknown or broken", () => {
    expect(sanitizePrefs(null)).toEqual(DEFAULT_PREFS);
    const mixed = sanitizePrefs({
      notify: { marks: false, mentions: "yes" },
      vibrate: 0,
      ui: "xl",
      chat: "huge",
      keys: "large",
      columns: 4,
      alerts: "compact",
    });
    expect(mixed.notify.marks).toBe(false);
    expect(mixed.notify.mentions).toBe(true);
    expect(mixed.vibrate).toBe(true);
    expect(mixed.ui).toBe("xl");
    expect(mixed.chat).toBe("m");
    expect(mixed.keys).toBe("large");
    expect(mixed.columns).toBe(2);
    expect(mixed.alerts).toBe("compact");
  });

  it("survive a round trip and broken storage", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const prefs = { ...DEFAULT_PREFS, ui: "l" as const, columns: 3 as const };
    savePrefs(storage, prefs);
    expect(loadPrefs(storage)).toEqual(prefs);
    store.set("corneta.deck.prefs", "{oops");
    expect(loadPrefs(storage)).toEqual(DEFAULT_PREFS);
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadPrefs(broken)).toEqual(DEFAULT_PREFS);
    expect(() => savePrefs(broken, prefs)).not.toThrow();
  });
});

describe("deck combos", () => {
  const sponsor = {
    id: "c_sponsor",
    name: "Patrocínio",
    steps: [
      { action: "scene" as const, scene: "Conversa" },
      { action: "mark" as const, label: "Patrocínio" },
    ],
  };

  it("are keys only while the PC still has them", () => {
    const state = deckState({
      combos: [sponsor],
      layout: ["combo:c_sponsor", "combo:c_gone", "mark"],
    });
    expect(effectiveLayout(state)).toEqual(["combo:c_sponsor", "mark"]);
    expect(
      catalog(state).some(
        (item) => item.id === "combo:c_sponsor" && item.group === "combos",
      ),
    ).toBe(true);
    expect(comboId("combo:c_sponsor")).toBe("c_sponsor");
    expect(comboId("mark")).toBeNull();
  });

  it("show their steps in a few words on the key", () => {
    const state = deckState({ combos: [sponsor] });
    const view = keyView("combo:c_sponsor", { state, t });
    expect(view.label).toBe("Patrocínio");
    expect(view.sub).toContain("Conversa");
    expect(view.sub).toContain("deck.combo.short.mark");
  });

  it("need what each step uses before it can be added", () => {
    expect(stepReady({ action: "mark" })).toBe(true);
    expect(stepReady({ action: "scene", scene: "  " })).toBe(false);
    expect(stepReady({ action: "say", text: "Link na bio" })).toBe(true);
    expect(stepReady({ action: "say", text: "" })).toBe(false);
    expect(stepReady({ action: "pause" })).toBe(false);
  });

  it("get ids the PC accepts", () => {
    const id = newComboId(() => 0.5);
    expect(id).toMatch(/^c_[a-z0-9]{3,30}$/);
  });
});

describe("deck look and feel", () => {
  it("keep theme, hand and alert time within the known choices", () => {
    const prefs = sanitizePrefs({
      theme: "contrast",
      hand: "left",
      alertTime: "sticky",
    });
    expect([prefs.theme, prefs.hand, prefs.alertTime]).toEqual([
      "contrast",
      "left",
      "sticky",
    ]);
    const odd = sanitizePrefs({ theme: "neon", hand: "both", alertTime: 99 });
    expect([odd.theme, odd.hand, odd.alertTime]).toEqual([
      "dark",
      "right",
      "normal",
    ]);
  });
});
