import { defaultConfig } from "../factory";
import { resolveLocale } from "../i18n/locale";
import type { I18n, MessageKey } from "../i18n";
import { PLATFORMS } from "../platforms";
import { effectiveAction } from "../estimates";
import { youtubeAutoTargetId } from "../readiness";
import {
  EMPTY_TELEMETRY_STATUS,
  TELEMETRY_NOTICE_VERSION,
  createTelemetryId,
  normalizeTelemetryStatus,
  telemetryPurposeActive,
  type TelemetryStatus,
} from "../telemetry-schema";
import type {
  Alert,
  AppConfig,
  ChatBadge,
  ChatDelete,
  ChatFragment,
  ChatMessage,
  ChatSideEvent,
  ChatStatus,
  DeckStatus,
  EngineSnapshot,
  SessionMeta,
  TargetStatus,
  Viewers,
  RehearsalReport,
} from "../types";
import { CornetaApi } from "./types";

/** Real Twitch and Kick category names, so the demo autocomplete looks like the live one. */
const DEMO_CATEGORIES = [
  { name: "Just Chatting", platforms: ["twitch", "kick"] },
  { name: "VALORANT", platforms: ["twitch", "kick"] },
  { name: "Counter-Strike", platforms: ["twitch", "kick"] },
  { name: "League of Legends", platforms: ["twitch", "kick"] },
  { name: "Minecraft", platforms: ["twitch", "kick"] },
  { name: "Grand Theft Auto V", platforms: ["twitch", "kick"] },
  { name: "Fortnite", platforms: ["twitch", "kick"] },
  { name: "EA Sports FC 26", platforms: ["twitch"] },
  { name: "Free Fire", platforms: ["twitch", "kick"] },
  { name: "Slots & Casino", platforms: ["kick"] },
  { name: "Talk Shows & Podcasts", platforms: ["twitch"] },
  { name: "Music", platforms: ["twitch", "kick"] },
] as const;

export function mockApi(): CornetaApi {
  const CONFIG_KEY = "corneta.config";
  const VAULT_KEY = "corneta.vault";
  const DEMO_OBS_KEY = "corneta.demo.obs";
  const DEMO_START_KEY = "corneta.demo.start";
  const rehearsalListeners = new Set<(report: RehearsalReport) => void>();
  let rehearsalCancelled = false;
  // Colour bars stand in for the frame a real rehearsal grabs from OBS.
  const DEMO_FRAME =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 4" preserveAspectRatio="none">' +
        ["c9c9c9", "c9c91a", "1ac9c9", "1ac91a", "c91ac9", "c91a1a", "1a1ac9"]
          .map(
            (fill, x) =>
              `<rect x="${x}" width="1" height="4" fill="#${fill}"/>`,
          )
          .join("") +
        "</svg>",
    );
  type DemoObsScenario =
    | "ready"
    | "notPointed"
    | "remoteOff"
    | "closed"
    | "notInstalled"
    | "streamlabs";
  /** Lets screenshots and tests show the OBS states the always-connected fake hides. */
  const demoObsScenario = (): DemoObsScenario => {
    const stored = localStorage.getItem(DEMO_OBS_KEY);
    return stored === "notPointed" ||
      stored === "remoteOff" ||
      stored === "closed" ||
      stored === "notInstalled" ||
      stored === "streamlabs"
      ? stored
      : "ready";
  };
  const TELEMETRY_KEY = "corneta.telemetry.v1";

  const loadVault = (): Record<string, string> => {
    try {
      return JSON.parse(localStorage.getItem(VAULT_KEY) || "{}");
    } catch {
      return {};
    }
  };
  const saveVault = (v: Record<string, string>) =>
    localStorage.setItem(VAULT_KEY, JSON.stringify(v));

  // Sign-in is simulated for YouTube and Kick (Twitch needs a build-time client ID) so the connect
  // flow can be exercised without accounts: a pending "code" state, then "connected".
  const ACCOUNTS_KEY = "corneta.demo.accounts";
  type DemoAccount = "youtube" | "kick";
  const loadAccounts = (): Partial<Record<DemoAccount, boolean>> => {
    try {
      return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "{}");
    } catch {
      return {};
    }
  };
  const setAccount = (who: DemoAccount, on: boolean) =>
    localStorage.setItem(
      ACCOUNTS_KEY,
      JSON.stringify({ ...loadAccounts(), [who]: on }),
    );
  type AuthListener = Parameters<CornetaApi["subscribeAuthFlow"]>[0];
  const authListeners = new Set<AuthListener>();
  const emitAuth = (who: DemoAccount, state: string, login = "") =>
    authListeners.forEach((listener) =>
      listener(who, { state, userCode: "", verifyUri: "", login }),
    );
  const demoLogin = (who: DemoAccount) => {
    setTimeout(() => emitAuth(who, "code"), 50);
    setTimeout(() => {
      setAccount(who, true);
      emitAuth(who, "connected", who === "kick" ? "demo" : "");
    }, 1800);
  };

  const loadTelemetry = (): TelemetryStatus => {
    try {
      const stored = localStorage.getItem(TELEMETRY_KEY);
      if (stored === null) return EMPTY_TELEMETRY_STATUS;
      return normalizeTelemetryStatus(JSON.parse(stored));
    } catch {
      return normalizeTelemetryStatus(null);
    }
  };
  const saveTelemetry = (value: TelemetryStatus): TelemetryStatus => {
    localStorage.setItem(TELEMETRY_KEY, JSON.stringify(value));
    return value;
  };

  const loadConfig = (): AppConfig => {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppConfig>;
        return {
          ...defaultConfig(),
          ...parsed,
          schemaVersion: 1,
          revision: Number.isSafeInteger(parsed.revision)
            ? Number(parsed.revision)
            : 0,
        };
      }
    } catch {
      /* Storage may be unavailable in browser previews. */
    }
    const cfg = defaultConfig();
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    return cfg;
  };

  const SESSIONS_KEY = "corneta.sessions";
  const loadSessions = (): Record<string, string> => {
    try {
      return JSON.parse(localStorage.getItem(SESSIONS_KEY) || "{}");
    } catch {
      return {};
    }
  };
  const saveSessions = (m: Record<string, string>) =>
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(m));

  const genSession = (
    startedAt: number,
    mins: number,
    plats: { id: string; name: string; platformId: string }[],
    t: I18n["t"],
    opts?: {
      dropAtMin?: number;
      dropIdx?: number;
      highCpu?: boolean;
      busyApp?: string;
      viewerScale?: number;
      omitViewers?: boolean;
      withRecording?: boolean;
      extraMarkers?: { min: number; label: string }[];
    },
  ): string => {
    const meta = {
      kind: "meta",
      schemaVersion: 4,
      id: String(startedAt),
      startedAt,
      mode: "per-platform",
      platforms: plats,
    };
    const lines = [JSON.stringify(meta)];
    const step = 2000;
    const n = Math.round((mins * 60 * 1000) / step);
    const base = [6000, 9000, 6000, 4500];
    const drops = plats.map(() => 0);
    let renderSkipped = 0;
    let outputSkipped = 0;
    const raidAtMin = Math.min(mins * 0.35, 11);
    const raidViewers = 90 + Math.floor(Math.random() * 110);
    const viewerScale = opts?.viewerScale ?? 1;
    const vbase = plats.map((p) =>
      Math.round((p.platformId === "youtube" ? 70 : 280) * viewerScale),
    );
    for (let k = 0; k < n; k++) {
      const t = startedAt + k * step;
      const minNow = (k * step) / 60000;
      let cpu = 46 + Math.sin(k / 9) * 7 + Math.random() * 5;
      let gpu = 32 + Math.sin(k / 7) * 6 + Math.random() * 4;
      let memoryPct = 52 + Math.sin(k / 13) * 5 + Math.random() * 3;
      const targets = plats.map((p, i) => {
        let bitrate = Math.round(
          base[i % base.length] * (0.96 + Math.random() * 0.07),
        );
        let state = "live";
        const isDrop =
          opts?.dropAtMin != null &&
          Math.abs(minNow - opts.dropAtMin) < 0.18 &&
          i === (opts.dropIdx ?? 0);
        if (isDrop) {
          bitrate = Math.round(base[i % base.length] * 0.3);
          state = "reconnecting";
          drops[i] += 25;
          if (opts?.highCpu) {
            cpu = 97;
            gpu = 98;
            memoryPct = 78;
          }
        }
        return {
          id: p.id,
          name: p.name,
          state,
          bitrate,
          fps: 60,
          dropped: drops[i],
        };
      });
      const incident =
        opts?.dropAtMin != null && Math.abs(minNow - opts.dropAtMin) < 0.18;
      if (incident) {
        renderSkipped += 12;
        outputSkipped += 7;
      }
      const obs = {
        activeFps: 60,
        avgRenderMs: incident ? 28 + Math.random() * 5 : 7 + Math.random() * 3,
        renderSkipped,
        outputSkipped,
        congestion: incident ? 0.6 + Math.random() * 0.2 : Math.random() * 0.06,
      };
      const nearRaid = Math.abs(minNow - raidAtMin) < 0.5;
      let chat = Math.round(5 + Math.sin(k / 11) * 2 + Math.random() * 4);
      if (nearRaid) chat += 18;
      if (Math.random() < 0.015) chat += 14;
      // Use unequal channel activity to exercise per-channel report shares.
      const chatBy: Record<string, number> = {};
      let left = chat;
      plats.forEach((p, i) => {
        const share =
          i === plats.length - 1
            ? left
            : Math.round(chat * (i === 0 ? 0.62 : 0.38 / (plats.length - 1)));
        left -= share;
        if (share > 0) chatBy[`${p.platformId}:${p.name}`] = share;
      });
      lines.push(
        JSON.stringify({
          kind: "sample",
          t,
          cpu: Math.round(cpu * 10) / 10,
          gpu: Math.round(gpu * 10) / 10,
          memoryPct: Math.round(memoryPct * 10) / 10,
          ...(opts?.busyApp && k % 3 === 0
            ? {
                apps: [
                  {
                    appRef: opts.busyApp.toLowerCase().replace(/\s+/g, "-"),
                    name: opts.busyApp,
                    cpu: incident ? 43 : 26,
                    memoryMb: incident ? 3900 : 3400,
                    gpu3d: incident ? 96 : 55,
                  },
                ],
              }
            : {}),
          obs,
          chat,
          ...(Object.keys(chatBy).length ? { chatBy } : {}),
          targets,
        }),
      );
      if (k % 15 === 0 && !opts?.omitViewers) {
        const ramp = Math.min(1, minNow / 5);
        const items = plats.map((p, i) => {
          let v = Math.round(vbase[i] * ramp * (0.9 + Math.random() * 0.15));
          if (minNow >= raidAtMin) v += Math.round(raidViewers / plats.length);
          return { platform: p.platformId, source: p.name, viewers: v };
        });
        const total = items.reduce((acc, x) => acc + (x.viewers ?? 0), 0);
        lines.push(JSON.stringify({ kind: "viewers", t, total, items }));
        const seg = plats
          .filter((p) => p.platformId === "twitch" || p.platformId === "kick")
          .map((p) => ({
            platform: p.platformId,
            source: p.name,
            total: 12480 + Math.round(minNow * 1.7),
          }));
        if (seg.length)
          lines.push(JSON.stringify({ kind: "followers", t, items: seg }));
      }
    }
    const at = (mm: number) => startedAt + mm * 60000;
    lines.push(
      JSON.stringify({
        kind: "alert",
        t: at(raidAtMin),
        platform: plats[0].platformId,
        source: plats[0].name,
        alertKind: "raid",
        user: "raid_demo",
        amount: raidViewers,
      }),
    );
    ["sub", "resub", "sub", "member", "resub"].forEach((kd, idx) => {
      const mm = 3 + idx * 6;
      if (mm < mins)
        lines.push(
          JSON.stringify({
            kind: "alert",
            t: at(mm),
            platform: plats[idx % plats.length].platformId,
            source: plats[idx % plats.length].name,
            alertKind: kd,
            user: [
              "viewer_demo_01",
              "viewer_demo_02",
              "viewer_demo_03",
              "viewer_demo_04",
              "viewer_demo_05",
            ][idx],
            amount: kd === "resub" ? 2 + idx : 1,
          }),
        );
    });
    lines.push(
      JSON.stringify({
        kind: "alert",
        t: at(Math.min(mins * 0.55, 16)),
        platform: plats[0].platformId,
        source: plats[0].name,
        alertKind: "subgift",
        user: "Patrocinador",
        amount: 10,
      }),
    );
    lines.push(
      JSON.stringify({
        kind: "alert",
        t: at(Math.min(mins * 0.28, 8)),
        platform: plats[0].platformId,
        source: plats[0].name,
        alertKind: "bits",
        user: "fa_numero_1",
        amount: 1000,
      }),
    );
    if (opts?.dropAtMin != null) {
      lines.push(
        JSON.stringify({
          kind: "marker",
          t: startedAt + opts.dropAtMin * 60000,
          label: t("core.mock.marker.twitchDropped"),
        }),
      );
    }
    for (const extra of opts?.extraMarkers ?? []) {
      lines.push(
        JSON.stringify({
          kind: "marker",
          t: startedAt + extra.min * 60000,
          label: extra.label,
        }),
      );
    }
    if (opts?.withRecording) {
      const midMs = Math.round((mins * 60000) / 2);
      const totalMs = n * step;
      const seg1Path = `${startedAt}.mp4`;
      const seg2Path = `${startedAt}.p2.mp4`;
      lines.push(
        JSON.stringify({
          kind: "recording",
          seg: 1,
          t: startedAt,
          path: seg1Path,
          codec: "h264",
          estimated: false,
        }),
        JSON.stringify({
          kind: "recSync",
          seg: 1,
          t: startedAt + midMs,
          out: midMs,
        }),
        JSON.stringify({
          kind: "recEnd",
          seg: 1,
          t: startedAt + midMs,
          reason: "reconnect",
        }),
        JSON.stringify({
          kind: "recFinalized",
          seg: 1,
        }),
        JSON.stringify({
          kind: "recording",
          seg: 2,
          t: startedAt + midMs + 5000,
          path: seg2Path,
          codec: "h264",
          estimated: false,
        }),
        JSON.stringify({
          kind: "recSync",
          seg: 2,
          t: startedAt + totalMs,
          out: Math.max(1000, totalMs - midMs - 5000),
        }),
        JSON.stringify({
          kind: "recEnd",
          seg: 2,
          t: startedAt + totalMs,
          reason: "stopped",
        }),
        JSON.stringify({
          kind: "recFinalized",
          seg: 2,
        }),
      );
    }
    lines.push(JSON.stringify({ kind: "end", endedAt: startedAt + n * step }));
    return lines.join("\n");
  };

  const seedSessions = (t: I18n["t"]) => {
    const m = loadSessions();
    if (Object.keys(m).length > 0) return;
    const tw = { id: "t1", name: "Twitch", platformId: "twitch" };
    const yt = { id: "y1", name: "YouTube", platformId: "youtube" };
    const day = 24 * 3600 * 1000;
    const now = Date.now();
    const specs: [number, number, Parameters<typeof genSession>[4]][] = [
      [now - 14 * day, 42, { viewerScale: 0.72 }],
      [now - 11 * day, 55, { omitViewers: true }],
      [now - 8 * day, 38, { viewerScale: 0.88 }],
      [now - 5 * day, 64, { viewerScale: 0.96 }],
      [
        now - 26 * 3600 * 1000,
        35,
        {
          viewerScale: 1.05,
          withRecording: true,
          extraMarkers: [
            { min: 7, label: "Clutch 1v4" },
            { min: 16, label: "Raid hype" },
            { min: 28, label: "Match point" },
          ],
        },
      ],
      [
        now - 3 * 3600 * 1000,
        48,
        {
          dropAtMin: 23,
          dropIdx: 0,
          highCpu: true,
          busyApp: "Cyberpunk 2077",
          viewerScale: 1.18,
        },
      ],
    ];
    for (const [startedAt, mins, opts] of specs) {
      m[String(startedAt)] = genSession(startedAt, mins, [tw, yt], t, opts);
    }
    saveSessions(m);
  };

  let snapshot: EngineSnapshot = {
    state: "stopped",
    startedAt: null,
    targets: {},
  };
  const listeners = new Set<(s: EngineSnapshot) => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let rec: { id: string; lines: string[] } | null = null;
  const pausedTargets = new Set<string>();
  const reencodedAt = new Map<string, number>();
  const targetPlatforms = new Map<string, string>();

  const chatMsgListeners = new Set<(m: ChatMessage) => void>();
  const clipsProgressListeners = new Set<
    (p: { done: number; total: number; currentName: string }) => void
  >();
  let demoClipsCancelled = false;
  const chatStatusListeners = new Set<(s: ChatStatus) => void>();
  const chatDeleteListeners = new Set<(d: ChatDelete) => void>();
  const chatSideListeners = new Set<(e: ChatSideEvent) => void>();
  const alertListeners = new Set<(a: Alert) => void>();
  let alertSeq = 0;
  const viewerListeners = new Set<(v: Viewers) => void>();
  let viewerTimer: ReturnType<typeof setInterval> | null = null;
  let chatTimer: ReturnType<typeof setInterval> | null = null;
  let chatSeq = 0;
  const recentIds: { nativeId: string; platform: string }[] = [];
  const ALERT_SOURCES = [
    { platform: "twitch" as const, source: "Twitch Demo" },
    { platform: "kick" as const, source: "Kick Demo" },
    { platform: "youtube" as const, source: "YouTube Demo" },
  ];
  const ALERT_USERS = [
    "viewer_demo_01",
    "viewer_demo_02",
    "viewer_demo_03",
    "viewer_demo_04",
    "viewer_demo_05",
    "viewer_demo_06",
  ];
  const randomAlert = (seq: number, t: I18n["t"]): Alert => {
    const src = ALERT_SOURCES[Math.floor(Math.random() * ALERT_SOURCES.length)];
    const user = ALERT_USERS[Math.floor(Math.random() * ALERT_USERS.length)];
    const kinds: Alert["kind"][] = [
      "sub",
      "resub",
      "subgift",
      "bits",
      "raid",
      "member",
      "superchat",
      "streak",
      "reward",
      "kicks",
      "upgrade",
    ];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const base: Alert = {
      id: `a${seq}-${Date.now()}`,
      platform: src.platform,
      source: src.source,
      kind,
      user,
      ts: Date.now(),
    };
    switch (kind) {
      case "bits":
        return { ...base, amount: pick([100, 500, 1000]) };
      case "resub":
        return {
          ...base,
          amount: 1 + Math.floor(Math.random() * 24),
          tier: "T1",
          message: t("core.mock.alert.resub.message"),
        };
      case "sub":
        return { ...base, tier: "T1" };
      case "subgift":
        return { ...base, amount: pick([1, 5, 10]) };
      case "raid":
        return { ...base, amount: 10 + Math.floor(Math.random() * 200) };
      case "member":
        return {
          ...base,
          tier: t("core.mock.alert.tier.member"),
          amount: 1 + Math.floor(Math.random() * 12),
        };
      case "superchat":
        return {
          ...base,
          amount: pick([5, 10, 50]),
          currency: "BRL",
          message: t("core.mock.alert.superchat.message"),
        };
      case "streak":
        return {
          ...base,
          platform: "twitch",
          source: "Twitch Demo",
          amount: 7,
        };
      case "reward":
        return {
          ...base,
          title: t("core.mock.alert.reward.title"),
          message: t("core.mock.alert.reward.message"),
        };
      case "kicks":
        return {
          ...base,
          platform: "kick",
          source: "Kick Demo",
          amount: pick([10, 100, 500]),
          title: "Full Send",
        };
      case "upgrade":
        return {
          ...base,
          platform: "twitch",
          source: "Twitch Demo",
          tier: "T1",
        };
      default:
        return base;
    }
  };
  const CHAT_MSG_KEYS: MessageKey[] = [
    "core.mock.chat.msg.1",
    "core.mock.chat.msg.2",
    "core.mock.chat.msg.3",
    "core.mock.chat.msg.4",
    "core.mock.chat.msg.5",
    "core.mock.chat.msg.6",
    "core.mock.chat.msg.7",
    "core.mock.chat.msg.8",
    "core.mock.chat.msg.9",
    "core.mock.chat.msg.10",
    "core.mock.chat.msg.11",
    "core.mock.chat.msg.12",
    "core.mock.chat.msg.13",
    "core.mock.chat.msg.14",
  ];

  const emit = () => listeners.forEach((l) => l(structuredClone(snapshot)));

  const tick = () => {
    const now = Date.now();
    if (snapshot.state === "starting") {
      snapshot.ingestLive = true;
      snapshot.state = "live";
    }
    for (const st of Object.values(snapshot.targets)) {
      if (pausedTargets.has(st.targetId)) continue;
      if (st.state === "connecting") {
        st.state = "live";
      } else if (st.state === "live") {
        const jitter = (Math.random() - 0.5) * 0.06;
        st.bitrateKbps = Math.max(0, Math.round(st.bitrateKbps * (1 + jitter)));
        st.fps = 30 + Math.round(Math.random() * 30);
        if (Math.random() < 0.04)
          st.droppedFrames += Math.round(Math.random() * 3);
      }
      st.uptimeSec = snapshot.startedAt ? (now - snapshot.startedAt) / 1000 : 0;
      // Like the native checks, platforms answer once the live has run for a while.
      const askedFrom =
        reencodedAt.get(st.targetId) ?? snapshot.startedAt ?? now;
      if (st.state === "live" && now - askedFrom >= 20_000 && !st.platform) {
        st.platform =
          targetPlatforms.get(st.targetId) === "youtube" && !st.reencoded
            ? {
                state: "confirmed",
                health: "ok",
                issues: [{ kind: "gopSizeLong", severity: "warning" }],
              }
            : { state: "confirmed", health: "good" };
      }
    }
    snapshot.cpu = Math.round((30 + Math.random() * 40) * 10) / 10;
    snapshot.gpu = Math.round((20 + Math.random() * 30) * 10) / 10;
    snapshot.obs = {
      activeFps: 60,
      avgRenderMs: Math.round((7 + Math.random() * 4) * 10) / 10,
      renderSkipped: 0,
      outputSkipped: 0,
      congestion: Math.round(Math.random() * 8) / 100,
    };
    if (rec) {
      rec.lines.push(
        JSON.stringify({
          kind: "sample",
          t: now,
          cpu: snapshot.cpu,
          gpu: snapshot.gpu,
          obs: snapshot.obs,
          targets: Object.values(snapshot.targets).map((s) => ({
            id: s.targetId,
            name: s.name,
            state: s.state,
            bitrate: s.bitrateKbps,
            fps: s.fps,
            dropped: s.droppedFrames,
          })),
        }),
      );
    }
    emit();
  };

  const deckStatusNow = (): DeckStatus => {
    const settings = loadConfig().settings;
    return {
      running: settings.deckEnabled,
      port: settings.deckPort,
      address: settings.deckEnabled
        ? `192.168.0.12:${settings.deckPort}`
        : null,
      error: null,
      devices: settings.deckDevices.map((device) => ({
        ...device,
        connected: false,
      })),
    };
  };

  return {
    async getConfig() {
      return loadConfig();
    },
    async takeConfigNotice() {
      return null;
    },
    async saveConfig(config) {
      const saved = { ...config, revision: config.revision + 1 };
      localStorage.setItem(CONFIG_KEY, JSON.stringify(saved));
      return saved;
    },
    subscribeConfigChanged() {
      return () => {};
    },
    async setKey(targetId, key) {
      const v = loadVault();
      v[targetId] = key;
      saveVault(v);
    },
    async clearKey(targetId) {
      const v = loadVault();
      delete v[targetId];
      saveVault(v);
    },
    async detectEncoders() {
      return [
        {
          kind: "nvenc",
          label: "NVIDIA NVENC",
          available: true,
          maxSessions: 8,
        },
        { kind: "qsv", label: "Intel Quick Sync", available: false },
        { kind: "amf", label: "AMD AMF", available: false },
        {
          kind: "software",
          label: "Software (x264)",
          available: true,
          maxSessions: 1,
        },
      ];
    },
    async testUpload() {
      return Math.round(25 + Math.random() * 35);
    },
    async setAutostart() {},
    async start(_operationId) {
      const cfg = loadConfig();
      // Contributor scenario: the first start fails the way a taken ingest port does.
      if (localStorage.getItem(DEMO_START_KEY) === "portInUse") {
        const message =
          resolveLocale(cfg.settings.language) === "pt-BR"
            ? `O servidor de ingestão caiu: a porta ${cfg.ingest.port} está ocupada por outro programa ou reservada pelo Windows. Feche o que estiver usando essa porta e tenta de novo.`
            : `The ingest server crashed: port ${cfg.ingest.port} is taken by another program or reserved by Windows. Close whatever's using it and try again.`;
        snapshot = {
          state: "error",
          startedAt: null,
          targets: {},
          message,
          errorCode: "ingest_port_in_use",
        };
        emit();
        throw new Error(message);
      }
      pausedTargets.clear();
      reencodedAt.clear();
      targetPlatforms.clear();
      const targets: Record<string, TargetStatus> = {};
      for (const t of cfg.targets.filter((x) => x.enabled)) {
        targetPlatforms.set(t.id, t.platformId);
        const target =
          t.encoding.preset?.videoBitrateKbps ??
          PLATFORMS[t.platformId].recommended.videoBitrateKbps;
        targets[t.id] = {
          targetId: t.id,
          name: t.name,
          platformId: t.platformId,
          action: effectiveAction(cfg.mode, t),
          state: "connecting",
          bitrateKbps: target,
          fps: 60,
          droppedFrames: 0,
          uptimeSec: 0,
        };
      }
      snapshot = {
        state: "starting",
        startedAt: Date.now(),
        ingestLive: false,
        targets,
      };
      const sid = String(snapshot.startedAt);
      const plats = cfg.targets
        .filter((x) => x.enabled)
        .map((t) => ({ id: t.id, name: t.name, platformId: t.platformId }));
      rec = {
        id: sid,
        lines: [
          JSON.stringify({
            kind: "meta",
            id: sid,
            startedAt: snapshot.startedAt,
            mode: cfg.mode,
            platforms: plats,
          }),
        ],
      };
      emit();
      if (timer) clearInterval(timer);
      timer = setInterval(tick, 1000);
    },
    async stop(_operationId) {
      if (timer) clearInterval(timer);
      timer = null;
      if (rec) {
        rec.lines.push(JSON.stringify({ kind: "end", endedAt: Date.now() }));
        const m = loadSessions();
        m[rec.id] = rec.lines.join("\n");
        saveSessions(m);
        rec = null;
      }
      pausedTargets.clear();
      snapshot = {
        state: "stopped",
        startedAt: null,
        ingestLive: false,
        targets: {},
      };
      emit();
    },
    async setTargetPaused(targetId, paused) {
      if (paused) pausedTargets.add(targetId);
      else pausedTargets.delete(targetId);
      const st = snapshot.targets[targetId];
      if (st) st.state = paused ? "paused" : "connecting";
      emit();
    },
    async retryTarget(targetId) {
      const st = snapshot.targets[targetId];
      if (st) {
        st.state = "connecting";
        st.message = undefined;
      }
      emit();
    },
    async reencodeTarget(targetId) {
      const st = snapshot.targets[targetId];
      if (st && st.action === "copy") {
        st.action = "transcode";
        st.reencoded = true;
        st.platform = undefined;
        st.state = "connecting";
        reencodedAt.set(targetId, Date.now());
      }
      emit();
    },
    async setForceBrb(on) {
      snapshot.forcedBrb = on;
      for (const st of Object.values(snapshot.targets)) {
        if (st.state === "live" || st.state === "brb")
          st.state = on ? "brb" : "live";
      }
      emit();
    },
    subscribe(cb) {
      listeners.add(cb);
      cb(structuredClone(snapshot));
      return () => listeners.delete(cb);
    },
    async listSessions(t) {
      seedSessions(t);
      const m = loadSessions();
      const out: SessionMeta[] = [];
      for (const [id, ndjson] of Object.entries(m)) {
        const lines = ndjson.trim().split("\n");
        let meta: {
          kind?: string;
          startedAt?: number;
          mode?: string;
          platforms?: unknown;
        };
        try {
          meta = JSON.parse(lines[0]);
        } catch {
          continue;
        }
        if (meta?.kind !== "meta") continue;
        const startedAt = meta.startedAt ?? 0;
        let endedAt = startedAt;
        try {
          const last = JSON.parse(lines[lines.length - 1]);
          endedAt = last.kind === "end" ? last.endedAt : (last.t ?? startedAt);
        } catch {
          /* Ignore a malformed trailing record and retain the estimated end time. */
        }
        out.push({
          id,
          startedAt,
          endedAt,
          durationSec: Math.max(0, Math.round((endedAt - startedAt) / 1000)),
          mode: (meta.mode ?? "per-platform") as SessionMeta["mode"],
          platforms: (meta.platforms ?? []) as SessionMeta["platforms"],
          hasVideo: ndjson.includes('"kind":"recording"'),
        });
      }
      out.sort((a, b) => b.startedAt - a.startedAt);
      return out;
    },
    async readSession(id) {
      return loadSessions()[id] ?? "";
    },
    async readSessionBytes(id, chat = false) {
      return new TextEncoder().encode(chat ? "" : (loadSessions()[id] ?? ""))
        .buffer;
    },
    // Browser downloads have no native cancellation result.
    async saveTextFile({ name, content }) {
      const url = URL.createObjectURL(
        new Blob([content], { type: "text/plain;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return true;
    },
    async deleteSession(id) {
      const m = loadSessions();
      delete m[id];
      saveSessions(m);
    },
    async openSessionsDir() {},
    // Browser previews have no native recorder or recording files; return empty recording results.
    async readSessionChat() {
      return "";
    },
    async recordCheckDir() {
      return {
        ok: true,
        freeBytes: 231 * 1024 ** 3,
        lowSpace: false,
        removableOrNetwork: false,
        longPath: false,
      };
    },
    async recordPickDir() {
      return "C:\\Videos\\Corneta Clips";
    },
    async recordTest() {
      throw new Error("Recording is unavailable in browser previews");
    },
    async recordRetry() {
      throw new Error("Recording is unavailable in browser previews");
    },
    async recordVideoUrl() {
      throw new Error("Recording is unavailable in browser previews");
    },
    async releaseRecordVideo() {},
    async recordVideoStats() {
      throw new Error("Recording is unavailable in browser previews");
    },
    async recordingReplayStatus() {
      return { state: "missing" };
    },
    async prepareRecordingReplay() {
      return { state: "missing" };
    },
    subscribeRecordingReplay(_cb, onReady) {
      onReady?.();
      return () => {};
    },
    async setSessionOffset() {},
    async deleteSessionRecordings() {},
    async openRecordingFolder() {},
    async addSessionMarker() {},
    async exportClip() {
      return null;
    },
    async exportClipSlices() {
      return null;
    },
    async exportClipsBatch(dir, clips) {
      demoClipsCancelled = false;
      const saved: string[] = [];
      for (let i = 0; i < clips.length; i++) {
        if (demoClipsCancelled) {
          return { dir, saved, cancelled: true, failed: 0 };
        }
        const name = `${clips[i].slug}.mp4`;
        clipsProgressListeners.forEach((cb) =>
          cb({ done: i, total: clips.length, currentName: name }),
        );
        await new Promise((resolve) => setTimeout(resolve, 260));
        if (demoClipsCancelled) {
          return { dir, saved, cancelled: true, failed: 0 };
        }
        saved.push(`${dir}\\${name}`);
      }
      clipsProgressListeners.forEach((cb) =>
        cb({ done: clips.length, total: clips.length, currentName: "" }),
      );
      return { dir, saved, cancelled: false, failed: 0 };
    },
    async cancelClipsBatch() {
      demoClipsCancelled = true;
    },
    async openClipsExportFolder() {},
    subscribeClipsProgress(cb) {
      clipsProgressListeners.add(cb);
      return () => {
        clipsProgressListeners.delete(cb);
      };
    },
    async chatStart(t) {
      // Resolve demo copy once per connection, not on each timer tick.
      const chatMsgs = CHAT_MSG_KEYS.map((k) => t(k));
      const SOURCES = [
        { platform: "twitch", name: "Twitch Demo A" },
        { platform: "twitch", name: "Twitch Demo B" },
        { platform: "kick", name: "Kick Demo" },
        { platform: "youtube", name: "YouTube Demo" },
      ] as const;
      SOURCES.forEach((src) =>
        chatStatusListeners.forEach((l) =>
          l({ platform: src.platform, source: src.name, status: "connected" }),
        ),
      );
      const side = (e: ChatSideEvent) => chatSideListeners.forEach((l) => l(e));
      side({
        kind: "modes",
        platform: "twitch",
        source: "Twitch Demo A",
        modes: { slow: 10, followersOnly: 10 },
      });
      side({
        kind: "pin",
        platform: "kick",
        source: "Kick Demo",
        message: {
          id: "demo-pin",
          platform: "kick",
          source: "Kick Demo",
          author: "viewer_kick_01",
          text: t("core.mock.chat.pinned"),
          fragments: [{ kind: "text", text: t("core.mock.chat.pinned") }],
          badges: [{ label: "MOD", kind: "moderator" }],
          ts: Date.now(),
          highlight: "pinned",
        },
      });
      side({
        kind: "poll",
        platform: "youtube",
        source: "YouTube Demo",
        poll: {
          id: "demo-poll",
          kind: "poll",
          question: t("core.mock.chat.poll.question"),
          options: [
            { label: t("core.mock.chat.poll.a"), percent: 58 },
            { label: t("core.mock.chat.poll.b"), percent: 30 },
            { label: t("core.mock.chat.poll.c"), percent: 12 },
          ],
          ended: false,
        },
      });
      const VBASE: Record<string, number> = {
        "Twitch Demo A": 820,
        "Twitch Demo B": 4200,
        "Kick Demo": 1500,
        "YouTube Demo": 300,
      };
      const emitViewers = () => {
        const items = SOURCES.map((s) => {
          const base = VBASE[s.name] ?? 100;
          const viewers = Math.max(
            0,
            Math.round(base * (0.9 + Math.random() * 0.2)),
          );
          return { platform: s.platform, source: s.name, viewers, live: true };
        });
        const total = items.reduce((a, b) => a + (b.viewers ?? 0), 0);
        viewerListeners.forEach((l) => l({ total, anyLive: true, items }));
      };
      emitViewers();
      if (viewerTimer) clearInterval(viewerTimer);
      viewerTimer = setInterval(emitViewers, 4000);
      if (chatTimer) clearInterval(chatTimer);
      const AUTHORS = {
        twitch: [
          "viewer_twitch_01",
          "viewer_twitch_02",
          "viewer_twitch_03",
          "viewer_twitch_04",
        ],
        kick: [
          "viewer_kick_01",
          "viewer_kick_02",
          "viewer_kick_03",
          "viewer_kick_04",
        ],
        youtube: [
          "viewer_youtube_01",
          "viewer_youtube_02",
          "viewer_youtube_03",
          "viewer_youtube_04",
        ],
      };
      const COLORS = ["#ff5a36", "#7c9cff", "#34d399", "#f5a524", "#e879f9"];
      chatTimer = setInterval(() => {
        if (recentIds.length > 8 && Math.random() < 0.08) {
          const r = recentIds[Math.floor(Math.random() * recentIds.length)];
          chatDeleteListeners.forEach((l) =>
            l({ scope: "message", platform: r.platform, nativeId: r.nativeId }),
          );
        }
        if (Math.random() < 0.12) {
          const a = randomAlert(++alertSeq, t);
          alertListeners.forEach((l) => l(a));
        }
        const src = SOURCES[Math.floor(Math.random() * SOURCES.length)];
        const platform = src.platform;
        const text = chatMsgs[Math.floor(Math.random() * chatMsgs.length)];
        const fragments: ChatFragment[] = [{ kind: "text", text: `${text} ` }];
        if (Math.random() < 0.4) {
          if (platform === "twitch")
            fragments.push({
              kind: "emote",
              text: "Kappa",
              url: "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0",
            });
          else if (platform === "kick")
            fragments.push({
              kind: "emote",
              text: "emote",
              url: "https://files.kick.com/emotes/37236/fullsize",
            });
          else fragments[0] = { kind: "text", text: `${text} 🎉🔥` };
        }
        const badges: ChatBadge[] = [];
        const br = Math.random();
        if (br < 0.15) badges.push({ label: "MOD", kind: "moderator" });
        else if (br < 0.4) badges.push({ label: "SUB", kind: "subscriber" });
        const nativeId = `n${++chatSeq}`;
        recentIds.push({ nativeId, platform });
        if (recentIds.length > 40) recentIds.shift();
        const pool = AUTHORS[platform];
        const base: ChatMessage = {
          id: `${chatSeq}-${Date.now()}`,
          platform,
          source: src.name,
          author: pool[Math.floor(Math.random() * pool.length)],
          nativeId,
          color:
            platform === "youtube"
              ? undefined
              : COLORS[Math.floor(Math.random() * COLORS.length)],
          text,
          fragments,
          badges,
          ts: Date.now(),
        };
        // Now and then, one of the richer message kinds the platforms send.
        const roll = Math.random();
        const message: ChatMessage =
          roll < 0.04 && platform === "twitch"
            ? {
                ...base,
                text: "[Y A Y Yes GIF by Djemilah Birnie]",
                fragments: [
                  {
                    kind: "gif",
                    text: "[Y A Y Yes GIF by Djemilah Birnie]",
                    url: "https://media4.giphy.com/media/joSNxeswxuc74Juo8X/giphy.gif",
                  },
                ],
                badges: [{ label: "SUB", kind: "subscriber", title: "T2" }],
              }
            : roll < 0.08
              ? {
                  ...base,
                  text: t("core.mock.chat.reply"),
                  fragments: [
                    { kind: "text", text: t("core.mock.chat.reply") },
                  ],
                  reply: { author: pool[0], text },
                }
              : roll < 0.11
                ? {
                    ...base,
                    text: t("core.mock.chat.first"),
                    fragments: [
                      { kind: "text", text: t("core.mock.chat.first") },
                    ],
                    highlight: "first",
                  }
                : roll < 0.13 && platform === "twitch"
                  ? {
                      ...base,
                      text: t("core.mock.chat.announcement"),
                      fragments: [
                        {
                          kind: "text",
                          text: t("core.mock.chat.announcement"),
                        },
                      ],
                      highlight: "announcement",
                      accent: "#9146ff",
                    }
                  : roll < 0.15
                    ? {
                        ...base,
                        text: t("core.mock.chat.streak", { user: base.author }),
                        fragments: [
                          {
                            kind: "text",
                            text: t("core.mock.chat.streak", {
                              user: base.author,
                            }),
                          },
                        ],
                        system: true,
                      }
                    : base;
        chatMsgListeners.forEach((l) => l(message));
      }, 1100);
    },
    async chatStop() {
      if (chatTimer) clearInterval(chatTimer);
      chatTimer = null;
      if (viewerTimer) clearInterval(viewerTimer);
      viewerTimer = null;
      viewerListeners.forEach((l) =>
        l({ total: 0, anyLive: false, items: [] }),
      );
    },
    async chatRunning() {
      return chatTimer != null;
    },
    subscribeChatRunning() {
      return () => {};
    },
    async openChatWindow() {},
    async accountChatChannels() {
      const accounts = loadAccounts();
      return (Object.keys(accounts) as DemoAccount[])
        .filter((who) => accounts[who])
        .map((who) => ({
          platform: who,
          value: "seucanal",
          name: "Seu Canal",
          aliases: [],
        }));
    },
    async chatSend(text) {
      // The native app localizes its own author name and marks the message as its own.
      const you =
        resolveLocale(loadConfig().settings.language) === "pt-BR"
          ? "você"
          : "you";
      chatMsgListeners.forEach((l) =>
        l({
          id: `me-${Date.now()}`,
          platform: "twitch",
          source: you,
          author: you,
          own: true,
          color: "#ffb323",
          text,
          fragments: [{ kind: "text", text }],
          badges: [],
          ts: Date.now(),
        }),
      );
    },
    subscribeChatAuth() {
      return () => {};
    },
    async setOauthConfig() {},
    async authStatus() {
      const accounts = loadAccounts();
      return {
        twitchLogin: null,
        twitchMissingScopes: [],
        youtube: !!accounts.youtube,
        youtubeConfigured: true,
        youtubeOfficialReady: true,
        youtubeOwnCreds: false,
        youtubeUsingOwnCreds: false,
        kick: !!accounts.kick,
        kickConfigured: true,
        kickOfficialReady: true,
        kickOwnCreds: false,
        kickUsingOwnCreds: false,
        kickCanBan: false,
        kickCanReadKey: !!accounts.kick,
        brokerError: null,
      };
    },
    // The demo signs in to the accounts with a login flow; Twitch only exists through the built-in client.
    async accountLoginStart(platform) {
      if (platform !== "twitch") demoLogin(platform);
    },
    async accountLogout(platform) {
      if (platform !== "twitch") setAccount(platform, false);
    },
    async fetchStreamKey(platform, targetId) {
      if (platform !== "twitch")
        saveVault({ ...loadVault(), [targetId]: "demo-account-key" });
      return { login: "demo", url: null };
    },
    async youtubeBroadcastRecoveryStatus() {
      return "none";
    },
    async youtubeRetryBroadcastCleanup() {},
    async youtubeAcknowledgeUnknownBroadcast() {},
    async setStreamInfo() {
      return {};
    },
    async searchStreamCategories(query) {
      const q = query.trim().toLowerCase();
      if (q.length < 2) return [];
      return DEMO_CATEGORIES.filter((c) => c.name.toLowerCase().includes(q))
        .slice(0, 8)
        .map((c) => ({ ...c, platforms: [...c.platforms] }));
    },
    async accountSaveOwnCredentials() {},
    async accountClearOwnCredentials() {},
    async accountUseOfficial() {},
    async accountUseOwnCredentials() {},
    async chatModerate() {},
    subscribeAuthFlow(onAuth) {
      authListeners.add(onAuth);
      return () => {
        authListeners.delete(onAuth);
      };
    },
    subscribeChat(onMsg, onStatus, onDelete) {
      chatMsgListeners.add(onMsg);
      chatStatusListeners.add(onStatus);
      chatDeleteListeners.add(onDelete);
      return () => {
        chatMsgListeners.delete(onMsg);
        chatStatusListeners.delete(onStatus);
        chatDeleteListeners.delete(onDelete);
      };
    },
    subscribeChatSide(onEvent) {
      chatSideListeners.add(onEvent);
      return () => {
        chatSideListeners.delete(onEvent);
      };
    },
    subscribeAlerts(onAlert) {
      alertListeners.add(onAlert);
      return () => alertListeners.delete(onAlert);
    },
    async alertsStart() {},
    async alertsStop() {},
    subscribeAlertStatus() {
      return () => {};
    },
    subscribeViewers(onViewers) {
      viewerListeners.add(onViewers);
      return () => viewerListeners.delete(onViewers);
    },
    async obsSetStream() {},
    async testTarget(_targetId, t) {
      return t("core.mock.target.test.ok");
    },
    async youtubeKeyCheck(_key, t) {
      return t("core.mock.youtubeKey.ok");
    },
    async alertTest(_sourceId, t) {
      return t("core.mock.alertToken.ok");
    },
    async openLogsDir() {},
    async exportDiagnostics() {
      return true;
    },
    async telemetryStatus() {
      return loadTelemetry();
    },
    async telemetrySetConsent(input) {
      const previous = loadTelemetry();
      const needsId =
        telemetryPurposeActive(input.usage, "usage") ||
        telemetryPurposeActive(input.crashReports, "crashReports");
      return saveTelemetry({
        schemaVersion: 1,
        noticeVersion: TELEMETRY_NOTICE_VERSION,
        usage: input.usage,
        crashReports: input.crashReports,
        installationId:
          previous.installationId ?? (needsId ? createTelemetryId() : null),
        decidedAt: new Date().toISOString(),
      });
    },
    async telemetryRegenerateId() {
      const previous = loadTelemetry();
      if (
        telemetryPurposeActive(previous.usage, "usage") ||
        telemetryPurposeActive(previous.crashReports, "crashReports")
      )
        throw new Error("telemetry_disable_before_regenerate");
      return saveTelemetry({
        ...previous,
        installationId: null,
        decidedAt: new Date().toISOString(),
      });
    },
    subscribeTelemetryChanged() {
      return () => {};
    },
    async notifyTelemetryChanged() {},
    async registerShortcut() {},
    subscribeRecorder() {
      return () => {};
    },
    subscribeShortcut() {
      return () => {};
    },
    async obsCheck() {
      const scenario = demoObsScenario();
      if (scenario !== "ready" && scenario !== "notPointed")
        return {
          reachable: false,
          pointingAtCorneta: false,
          width: 0,
          height: 0,
          fps: 0,
          errorCode: "connectionFailed" as const,
        };
      return {
        reachable: true,
        pointingAtCorneta: scenario === "ready",
        width: 1920,
        height: 1080,
        fps: 60,
      };
    },
    async obsEnvironment() {
      const scenario = demoObsScenario();
      return {
        installed: scenario !== "notInstalled" && scenario !== "streamlabs",
        running:
          scenario !== "closed" &&
          scenario !== "notInstalled" &&
          scenario !== "streamlabs",
        streamlabs: scenario === "streamlabs",
        websocketEnabled: scenario !== "remoteOff",
        websocketPort: 4455,
        authRequired: true,
      };
    },
    async openObs() {
      if (demoObsScenario() === "closed")
        localStorage.setItem(DEMO_OBS_KEY, "remoteOff");
    },
    async pickIngestPort() {
      localStorage.removeItem(DEMO_START_KEY);
      const cfg = loadConfig();
      cfg.ingest.port = 1936;
      localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
      return cfg;
    },
    async runRehearsal() {
      const config = loadConfig();
      const scenario = demoObsScenario();
      const signal = scenario === "ready" || scenario === "notPointed";
      const privateTargetId = youtubeAutoTargetId(config.targets, {
        youtubeAuto: config.settings.youtubeAutoLive,
      });
      rehearsalCancelled = false;
      const vault = loadVault();
      const base = (): RehearsalReport => ({
        phase: "starting",
        obsStarted: signal,
        signalArrived: false,
        hasAudio: false,
        secondsLeft: 8,
        targets: config.targets
          .filter((target) => target.enabled && target.ingestUrl)
          .map((target) => {
            const preset = PLATFORMS[target.platformId];
            // Same rule as the engine: a test mode needs the target's key.
            const route =
              target.id === privateTargetId
                ? ("privateBroadcast" as const)
                : preset?.rehearsal && vault[target.id]
                  ? ("bandwidthTest" as const)
                  : null;
            return {
              targetId: target.id,
              platformId: target.platformId,
              name: target.name || preset?.name || target.platformId,
              route,
              outcome: route ? ("pending" as const) : ("skipped" as const),
              ...(route
                ? {}
                : {
                    skip: preset?.rehearsal
                      ? ("noKey" as const)
                      : ("noTestMode" as const),
                  }),
            };
          }),
        cancelled: false,
      });
      let report = base();
      const step = async (ms: number, patch: Partial<RehearsalReport>) => {
        await new Promise((resolve) => setTimeout(resolve, ms));
        report = { ...report, ...patch };
        for (const cb of rehearsalListeners) cb(report);
      };
      await step(300, { phase: "waitingObs" });
      if (!signal || rehearsalCancelled) {
        await step(signal ? 100 : 2500, {
          phase: "done",
          secondsLeft: 0,
          cancelled: rehearsalCancelled,
          targets: report.targets.map((target) =>
            target.route ? { ...target, outcome: "failed" as const } : target,
          ),
        });
        return report;
      }
      await step(1200, {
        phase: "sending",
        signalArrived: true,
        hasAudio: true,
        secondsLeft: 6,
      });
      await step(2000, {
        secondsLeft: 4,
        targets: report.targets.map((target) =>
          target.route === "bandwidthTest"
            ? { ...target, outcome: "received" as const }
            : target,
        ),
      });
      await step(2500, {
        phase: "done",
        secondsLeft: 0,
        signalKbps: 6000,
        cancelled: rehearsalCancelled,
        thumbnail: DEMO_FRAME,
        targets: report.targets.map((target) =>
          target.route === "privateBroadcast"
            ? {
                ...target,
                outcome: "warned" as const,
                issues: [{ kind: "gopSizeLong", severity: "warning" as const }],
              }
            : target,
        ),
      });
      return report;
    },
    async cancelRehearsal() {
      rehearsalCancelled = true;
    },
    subscribeRehearsal(cb) {
      rehearsalListeners.add(cb);
      return () => rehearsalListeners.delete(cb);
    },
    async obsAutoconfigure() {
      if (demoObsScenario() === "notPointed")
        localStorage.removeItem(DEMO_OBS_KEY);
    },
    async obsVideoCheck() {
      return {
        current: {
          outputWidth: 1920,
          outputHeight: 1080,
          fpsNumerator: 60,
          fpsDenominator: 1,
          simpleKbps: 6000,
        },
        proposal: null,
        limitKbps: 6000,
        canUndo: false,
      };
    },
    async obsVideoApply() {
      return {
        outputWidth: 1920,
        outputHeight: 1080,
        fpsNumerator: 60,
        fpsDenominator: 1,
        simpleKbps: 6000,
      };
    },
    async obsVideoUndo() {},
    async markMoment() {
      return [];
    },
    async deckStatus() {
      return deckStatusNow();
    },
    async deckPairStart() {
      return {
        url: `http://192.168.0.12:${loadConfig().settings.deckPort}/deck#t=demo`,
        expiresInMs: 120_000,
      };
    },
    async deckPairAnswer() {},
    async deckDeviceRemove() {},
    async deckRequestDone() {},
    subscribeDeck({ status }) {
      if (!status) return () => {};
      // No server events here; follow the saved switch so settings and setup react to it.
      let last = JSON.stringify(deckStatusNow());
      const timer = setInterval(() => {
        const next = deckStatusNow();
        const key = JSON.stringify(next);
        if (key === last) return;
        last = key;
        status(next);
      }, 400);
      return () => clearInterval(timer);
    },
    async exportConfig() {
      return false;
    },
    async importConfig() {
      return false;
    },
    async saveBrbSlate() {},
    async brbSlateNeedsRefresh() {
      return false;
    },
    async setBrbSlate() {
      console.log(
        "[mock] setBrbSlate: no native file picker in browser previews",
      );
      return null;
    },
    async clearBrbSlate() {},
    async getBrbSlatePreview() {
      return "";
    },
    async captureFrame(t) {
      throw new Error(t("core.mock.captureFrame.unavailable"));
    },
    async mesaStartServer() {
      return { port: 0, lanIp: "127.0.0.1" };
    },
    async mesaStopServer() {
      /* No native Mesa server in browser previews. */
    },
    async mesaObsAddSource() {
      /* No OBS connection in browser previews. */
    },
    async mesaObsRemoveSource() {
      /* No OBS connection in browser previews. */
    },
    async overlayStart() {
      return {
        port: 7393,
        url: "http://127.0.0.1:7393/overlay",
        chatUrl: "http://127.0.0.1:7393/chat",
      };
    },
    async overlayStop() {
      /* No native overlay server in browser previews. */
    },
    async overlayStatus() {
      return null;
    },
    async overlayTest() {
      /* No native overlay server in browser previews. */
    },
    async overlayChatTest() {
      /* No native overlay server in browser previews. */
    },
    async overlayObsAddSource() {
      /* No OBS connection in browser previews. */
    },
    async openPrivacySettings() {
      /* No native privacy settings in browser previews. */
    },
  };
}
