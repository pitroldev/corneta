import { defaultConfig } from "../factory";
import type { I18n, MessageKey } from "../i18n";
import { PLATFORMS } from "../platforms";
import {
  EMPTY_TELEMETRY_STATUS,
  TELEMETRY_NOTICE_VERSION,
  createTelemetryId,
  normalizeTelemetryStatus,
  type TelemetryStatus,
} from "../telemetry-schema";
import type {
  Alert,
  AppConfig,
  ChatBadge,
  ChatDelete,
  ChatFragment,
  ChatMessage,
  ChatStatus,
  EngineSnapshot,
  SessionMeta,
  TargetStatus,
  Viewers,
} from "../types";
import { CornetaApi } from "./types";

export function mockApi(): CornetaApi {
  const CONFIG_KEY = "corneta.config";
  const VAULT_KEY = "corneta.vault";
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

  const loadTelemetry = (): TelemetryStatus => {
    try {
      return normalizeTelemetryStatus(
        JSON.parse(localStorage.getItem(TELEMETRY_KEY) || "null"),
      );
    } catch {
      return EMPTY_TELEMETRY_STATUS;
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
    const vbase = plats.map((p) => (p.platformId === "youtube" ? 70 : 280));
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
      if (k % 15 === 0) {
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
    lines.push(JSON.stringify({ kind: "end", endedAt: startedAt + n * step }));
    return lines.join("\n");
  };

  const seedSessions = (t: I18n["t"]) => {
    const m = loadSessions();
    if (Object.keys(m).length > 0) return;
    const tw = { id: "t1", name: "Twitch", platformId: "twitch" };
    const yt = { id: "y1", name: "YouTube", platformId: "youtube" };
    const a = Date.now() - 26 * 3600 * 1000;
    const b = Date.now() - 3 * 3600 * 1000;
    m[String(a)] = genSession(a, 35, [tw, yt], t);
    m[String(b)] = genSession(b, 48, [tw, yt], t, {
      dropAtMin: 23,
      dropIdx: 0,
      highCpu: true,
      busyApp: "Cyberpunk 2077",
    });
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

  const chatMsgListeners = new Set<(m: ChatMessage) => void>();
  const chatStatusListeners = new Set<(s: ChatStatus) => void>();
  const chatDeleteListeners = new Set<(d: ChatDelete) => void>();
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

  return {
    async getConfig() {
      return loadConfig();
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
      pausedTargets.clear();
      const targets: Record<string, TargetStatus> = {};
      for (const t of cfg.targets.filter((x) => x.enabled)) {
        const target =
          t.encoding.preset?.videoBitrateKbps ??
          PLATFORMS[t.platformId].recommended.videoBitrateKbps;
        targets[t.id] = {
          targetId: t.id,
          name: t.name,
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
      return null;
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
    async setSessionOffset() {},
    async deleteSessionRecordings() {},
    async openRecordingFolder() {},
    async addSessionMarker() {},
    async exportClip() {
      return null;
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
        chatMsgListeners.forEach((l) =>
          l({
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
          }),
        );
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
    async chatSend(text) {
      // Keep the self-echo label aligned with the moderation guard in ChatScreen.
      chatMsgListeners.forEach((l) =>
        l({
          id: `me-${Date.now()}`,
          platform: "twitch",
          source: "você",
          author: "você",
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
      return {
        twitchLogin: null,
        youtube: false,
        youtubeConfigured: false,
        youtubeOfficialReady: false,
        youtubeOwnCreds: false,
        youtubeUsingOwnCreds: false,
        kick: false,
        kickConfigured: false,
        kickOfficialReady: false,
        kickOwnCreds: false,
        kickUsingOwnCreds: false,
        brokerError: null,
      };
    },
    async twitchLoginStart() {},
    async twitchLogout() {},
    async youtubeLoginStart() {},
    async youtubeLogout() {},
    async youtubeBroadcastRecoveryStatus() {
      return "none";
    },
    async youtubeRetryBroadcastCleanup() {},
    async youtubeAcknowledgeUnknownBroadcast() {},
    async kickLoginStart() {},
    async kickLogout() {},
    async setStreamInfo() {
      return {};
    },
    async setYoutubeOauth() {},
    async clearYoutubeOauth() {},
    async youtubeUseOfficial() {},
    async youtubeUseOwnCreds() {},
    async setKickOauth() {},
    async clearKickOauth() {},
    async kickUseOfficial() {},
    async kickUseOwnCreds() {},
    async chatModerate() {},
    subscribeAuthFlow() {
      return () => {};
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
        input.usage === "enabled" || input.crashReports === "enabled";
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
      if (previous.usage === "enabled" || previous.crashReports === "enabled")
        throw new Error("telemetry_disable_before_regenerate");
      return saveTelemetry({
        ...previous,
        installationId: null,
        decidedAt: new Date().toISOString(),
      });
    },
    async registerShortcut() {},
    subscribeRecorder() {
      return () => {};
    },
    subscribeShortcut() {
      return () => {};
    },
    async obsCheck() {
      return {
        reachable: true,
        pointingAtCorneta: true,
        width: 1920,
        height: 1080,
        fps: 60,
      };
    },
    async obsAutoconfigure() {},
    async markMoment() {},
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
    subscribeGuardian() {
      return () => {};
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
