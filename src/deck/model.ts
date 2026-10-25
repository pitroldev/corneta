import { DESTINATIONS } from "../platforms/destinations";
import type { DeckCombo, DeckComboStep, PlatformPreset } from "../lib/types";

export type EngineState = "stopped" | "starting" | "live" | "error";

export interface DeckTarget {
  id: string;
  platform: string;
  name: string;
  /** Engine target state: live, connecting, reconnecting, paused, signal-lost, brb, error, off… */
  state: string;
  bitrateKbps: number;
  fps: number;
  dropped: number;
}

export interface DeckMark {
  /** Milliseconds since the live started. */
  at: number;
  label: string;
}

export interface DeckState {
  lang: "auto" | "pt-BR" | "en";
  pc: string;
  /** The PC clock when the state was built. */
  now: number;
  device?: { id: string; name: string };
  live: {
    state: EngineState;
    startedAt: number | null;
    forcedBrb: boolean;
    brbArmed: boolean;
    blackScreen: boolean;
    signalLost: boolean;
    ingestLive: boolean;
    message?: string | null;
  };
  targets: DeckTarget[];
  viewers: {
    total: number | null;
    items: { platform: string; viewers: number }[];
  };
  machine: { cpu?: number | null; gpu?: number | null };
  obs: {
    connected: boolean;
    scenes: string[];
    scene: string | null;
    mic: { name: string; muted: boolean } | null;
  };
  ready: { platforms: number; total: number };
  protections: {
    brb: boolean;
    autoBitrate: boolean;
    blackScreen: boolean;
    guardian: boolean;
  };
  title: string;
  layout: string[];
  combos: DeckCombo[];
  chatPlatforms: string[];
  /** The streamer's chat names, lowercase, for spotting @mentions. */
  handles: string[];
  session: {
    startedAt: number | null;
    endedAt: number | null;
    marks: DeckMark[];
    peak: number;
  };
}

export interface DeckChat {
  id: string;
  platform: string;
  source: string;
  author: string;
  authorId?: string | null;
  nativeId?: string | null;
  color?: string | null;
  text: string;
  ts: number;
  highlight?: string | null;
  system?: boolean;
}

export interface DeckAlert {
  kind: string;
  platform: string;
  user: string;
  amount?: number | null;
  currency?: string | null;
  tier?: string | null;
}

export type ServerMessage =
  | ({ type: "state" } & DeckState)
  | { type: "pairing"; code: string; pc: string }
  | { type: "paired"; device: string; secret: string; name: string }
  | {
      type:
        | "refused"
        | "pair-invalid"
        | "pair-expired"
        | "revoked"
        | "unknown-device";
    }
  | { type: "pair-full"; message: string }
  | { type: "chat"; message: DeckChat }
  | { type: "chat-history"; messages: DeckChat[] }
  | { type: "chat-delete"; event: Record<string, unknown> }
  | { type: "alert"; alert: DeckAlert }
  | {
      type: "result";
      id: string;
      ok: boolean;
      data?: unknown;
      message?: string;
    };

export const DEFAULT_LAYOUT = [
  "mark",
  "brb",
  "mic",
  "scene",
  "title",
  "say",
  "stop",
] as const;
export const MAX_KEYS = 10;
export const MAX_COMBOS = 8;
export const MAX_COMBO_STEPS = 8;
const BASE_ACTIONS = new Set([
  "mark",
  "brb",
  "mic",
  "scene",
  "title",
  "say",
  "stop",
  "break",
  "bye",
]);

export function preset(platform: string): PlatformPreset | undefined {
  return DESTINATIONS.find((d) => d.id === platform);
}

/** Platforms in the stream, in catalog order, without repeats. */
export function livePlatforms(state: DeckState): string[] {
  const seen = new Set(state.targets.map((t) => t.platform));
  return DESTINATIONS.map((d) => d.id).filter((id) => seen.has(id));
}

export function comboId(id: string): string | null {
  return id.startsWith("combo:") ? id.slice(6) : null;
}

export function findCombo(id: string, state: DeckState): DeckCombo | undefined {
  const wanted = comboId(id);
  return wanted === null
    ? undefined
    : state.combos.find((c) => c.id === wanted);
}

export function isAction(id: string, state: DeckState): boolean {
  if (BASE_ACTIONS.has(id)) return true;
  if (comboId(id) !== null) return findCombo(id, state) !== undefined;
  const platform = id.startsWith("pause:") ? id.slice(6) : null;
  return platform !== null && livePlatforms(state).includes(platform);
}

/** The saved layout, or the built-in one; buttons for platforms no longer in the stream drop out. */
export function effectiveLayout(state: DeckState): string[] {
  const source = state.layout.length ? state.layout : [...DEFAULT_LAYOUT];
  return source.filter((id) => isAction(id, state)).slice(0, MAX_KEYS);
}

export type CatalogGroup = "live" | "obs" | "chat" | "combos";

export function catalog(
  state: DeckState,
): { group: CatalogGroup; id: string }[] {
  return [
    { group: "live" as const, id: "mark" },
    { group: "live" as const, id: "brb" },
    { group: "live" as const, id: "stop" },
    { group: "live" as const, id: "title" },
    ...livePlatforms(state).map((p) => ({
      group: "live" as const,
      id: `pause:${p}`,
    })),
    { group: "obs" as const, id: "mic" },
    { group: "obs" as const, id: "scene" },
    { group: "chat" as const, id: "say" },
    { group: "combos" as const, id: "break" },
    { group: "combos" as const, id: "bye" },
    ...state.combos.map((c) => ({
      group: "combos" as const,
      id: `combo:${c.id}`,
    })),
  ];
}

export function swap<T>(list: readonly T[], a: number, b: number): T[] {
  const next = [...list];
  [next[a], next[b]] = [next[b]!, next[a]!];
  return next;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function hms(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

/** Same rule as the overlay and the desktop chat. */
export function matchesDelete(
  message: DeckChat,
  event: Record<string, unknown>,
): boolean {
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  if (message.platform !== str(event.platform)) return false;
  switch (event.scope) {
    case "message":
      return !!message.nativeId && message.nativeId === str(event.nativeId);
    case "user":
      if (message.source !== str(event.source)) return false;
      return str(event.authorId) !== undefined
        ? message.authorId === str(event.authorId)
        : message.author === str(event.author);
    case "all":
      return message.source === str(event.source);
    default:
      return false;
  }
}

export function appendChat(
  list: DeckChat[],
  message: DeckChat,
  limit = 80,
): DeckChat[] {
  const next = list.some((m) => m.id === message.id)
    ? list
    : [...list, message];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export type AlertGroup = "raids" | "subs" | "money";

/** Follows, streaks and rewards arrive too often to banner, so they have no group. */
const ALERT_GROUPS: Record<string, AlertGroup> = {
  raid: "raids",
  sub: "subs",
  resub: "subs",
  subgift: "subs",
  member: "subs",
  upgrade: "subs",
  payforward: "subs",
  milestone: "subs",
  tip: "money",
  bits: "money",
  superchat: "money",
  charity: "money",
  kicks: "money",
  gift: "money",
};

export function alertGroup(kind: string): AlertGroup | null {
  return ALERT_GROUPS[kind] ?? null;
}

/** Alerts worth interrupting the deck for, as this phone asked. */
export function alertWanted(
  alert: DeckAlert,
  notify: DeckPrefs["notify"],
): boolean {
  const group = alertGroup(alert.kind);
  return group !== null && notify[group];
}

export type Size = "s" | "m" | "l" | "xl";
export type Density = "compact" | "normal" | "large";
export type Theme = "dark" | "light" | "contrast";
export type Hand = "right" | "left";
/** How long community alerts and mentions stay up; problems stay while they last. */
export type AlertTime = "short" | "normal" | "sticky";

export const ALERT_TIME_MS: Record<AlertTime, number | null> = {
  short: 5_000,
  normal: 12_000,
  sticky: null,
};

/** How this phone shows the deck. Kept on the phone: a tablet and a phone can differ. */
export interface DeckPrefs {
  notify: {
    /** "Marked the moment" confirmations. */
    marks: boolean;
    /** Confirmations of the other actions: BE RIGHT BACK, mic, scene, chat. */
    actions: boolean;
    mentions: boolean;
    raids: boolean;
    subs: boolean;
    money: boolean;
    micMuted: boolean;
  };
  vibrate: boolean;
  alertTime: AlertTime;
  theme: Theme;
  hand: Hand;
  ui: Size;
  chat: Size;
  keys: Density;
  /** Keys per row on an upright phone. */
  columns: 2 | 3;
  alerts: Density;
}

export const DEFAULT_PREFS: DeckPrefs = {
  notify: {
    marks: true,
    actions: true,
    mentions: true,
    raids: true,
    subs: true,
    money: true,
    micMuted: true,
  },
  vibrate: true,
  alertTime: "normal",
  theme: "dark",
  hand: "right",
  ui: "m",
  chat: "m",
  keys: "normal",
  columns: 2,
  alerts: "normal",
};

/** Viewport scale for each interface size; the browser scales every layer the same way. */
export const UI_SCALE: Record<Size, number> = {
  s: 0.9,
  m: 1,
  l: 1.12,
  xl: 1.25,
};

const PREFS_KEY = "corneta.deck.prefs";
const SIZES: readonly Size[] = ["s", "m", "l", "xl"];
const DENSITIES: readonly Density[] = ["compact", "normal", "large"];

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Saved preferences, with anything unknown or broken falling back to the default. */
export function sanitizePrefs(raw: unknown): DeckPrefs {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const notify = (
    value.notify && typeof value.notify === "object" ? value.notify : {}
  ) as Record<string, unknown>;
  const flag = (v: unknown, fallback: boolean) =>
    typeof v === "boolean" ? v : fallback;
  const d = DEFAULT_PREFS;
  return {
    notify: {
      marks: flag(notify.marks, d.notify.marks),
      actions: flag(notify.actions, d.notify.actions),
      mentions: flag(notify.mentions, d.notify.mentions),
      raids: flag(notify.raids, d.notify.raids),
      subs: flag(notify.subs, d.notify.subs),
      money: flag(notify.money, d.notify.money),
      micMuted: flag(notify.micMuted, d.notify.micMuted),
    },
    vibrate: flag(value.vibrate, d.vibrate),
    alertTime: pick(
      value.alertTime,
      ["short", "normal", "sticky"] as const,
      d.alertTime,
    ),
    theme: pick(value.theme, ["dark", "light", "contrast"] as const, d.theme),
    hand: pick(value.hand, ["right", "left"] as const, d.hand),
    ui: pick(value.ui, SIZES, d.ui),
    chat: pick(value.chat, SIZES, d.chat),
    keys: pick(value.keys, DENSITIES, d.keys),
    columns: pick(value.columns, [2, 3] as const, d.columns),
    alerts: pick(value.alerts, DENSITIES, d.alerts),
  };
}

export function loadPrefs(storage: Pick<Storage, "getItem">): DeckPrefs {
  try {
    return sanitizePrefs(JSON.parse(storage.getItem(PREFS_KEY) ?? "null"));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(storage: Pick<Storage, "setItem">, prefs: DeckPrefs) {
  try {
    storage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Without storage the choices last until the page reloads.
  }
}

export function guessDeviceName(userAgent: string): string {
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  const model = /Android [\d.]+; ([^;)]+?)(?: Build|\))/i
    .exec(userAgent)?.[1]
    ?.trim();
  if (model && model.length <= 24 && !/^K$/i.test(model)) return model;
  return /Android/i.test(userAgent) ? "Android" : "";
}

export interface Credentials {
  device: string;
  secret: string;
}

const CREDENTIALS_KEY = "corneta.deck.device";

export function loadCredentials(
  storage: Pick<Storage, "getItem">,
): Credentials | null {
  try {
    const raw = storage.getItem(CREDENTIALS_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Credentials>;
    return typeof value.device === "string" && typeof value.secret === "string"
      ? { device: value.device, secret: value.secret }
      : null;
  } catch {
    return null;
  }
}

export function saveCredentials(
  storage: Pick<Storage, "setItem">,
  credentials: Credentials,
) {
  try {
    storage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
  } catch {
    // Without storage the phone pairs again next time.
  }
}

export function clearCredentials(storage: Pick<Storage, "removeItem">) {
  try {
    storage.removeItem(CREDENTIALS_KEY);
  } catch {
    // Nothing to forget.
  }
}

const PENDING_TOKEN = "corneta.deck.pairToken";

/** Keeps a scanned token for this tab until it is used, so a reload on the name step still pairs. */
export function rememberToken(
  storage: Pick<Storage, "setItem">,
  token: string,
) {
  try {
    storage.setItem(PENDING_TOKEN, token);
  } catch {
    // The token stays in memory for this page only.
  }
}

export function pendingToken(storage: Pick<Storage, "getItem">): string | null {
  try {
    return tokenFromHash(`#t=${storage.getItem(PENDING_TOKEN) ?? ""}`);
  } catch {
    return null;
  }
}

export function forgetToken(storage: Pick<Storage, "removeItem">) {
  try {
    storage.removeItem(PENDING_TOKEN);
  } catch {
    // Nothing to forget.
  }
}

/** The QR carries the token after "#t=", which the browser never sends to the server. */
export function tokenFromHash(hash: string): string | null {
  const token = /^#t=([A-Za-z0-9_-]{20,80})$/.exec(hash)?.[1];
  return token ?? null;
}

export type Form = "phone" | "tablet";
export type Orient = "portrait" | "landscape";

/** Tablets keep the deck and a side panel together; phones switch tabs. */
export function viewport(
  width: number,
  height: number,
): { form: Form; orient: Orient } {
  return {
    form: Math.min(width, height) >= 600 ? "tablet" : "phone",
    orient: width > height ? "landscape" : "portrait",
  };
}

/** One line per moment, ready to paste next to the VOD. */
export function marksText(
  marks: readonly DeckMark[],
  fallback: string,
): string {
  return marks
    .map((m) => `${hms(m.at)} ${m.label.trim() || fallback}`)
    .join("\n");
}

export type Tone = "ok" | "warn" | "bad" | "faint";

export function targetTone(state: string): Tone {
  switch (state) {
    case "live":
    case "brb":
      return "ok";
    case "connecting":
    case "reconnecting":
    case "waiting":
    case "signal-lost":
    case "censor":
      return "warn";
    case "error":
      return "bad";
    default:
      return "faint";
  }
}

/** Live time by the PC clock, so a phone with its clock off still counts right. */
export function liveElapsed(
  startedAt: number | null,
  pcNow: number,
  receivedAt: number,
  now: number,
): number {
  if (startedAt === null) return 0;
  return Math.max(0, pcNow + (now - receivedAt) - startedAt);
}

/** A chat line that @mentions the streamer by one of their names. */
export function mentions(text: string, handles: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return handles.some((handle) => {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(`@${handle}`, from);
      if (at < 0) return false;
      const after = lower[at + handle.length + 1];
      if (after === undefined || !/[\p{L}\p{N}_]/u.test(after)) return true;
      from = at + 1;
    }
  });
}

export function newComboId(random: () => number = Math.random): string {
  return `c_${Date.now().toString(36)}${Math.floor(random() * 36 ** 4).toString(36)}`;
}

/** Whether a step has what it needs to run; the PC drops the ones that do not. */
export function stepReady(step: DeckComboStep): boolean {
  switch (step.action) {
    case "scene":
      return !!step.scene?.trim();
    case "say":
      return !!step.text?.trim();
    case "pause":
      return !!step.platform;
    default:
      return true;
  }
}
