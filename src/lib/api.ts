// ============================================================
// Camada de acesso ao backend.
// - Dentro do Tauri: chama os commands em Rust e ouve eventos.
// - No navegador (pnpm dev): usa um simulador local (mock) para que a UI
//   seja totalmente navegável e demonstrável sem o backend.
// ============================================================
import type {
  Alert,
  AppConfig,
  ChatBadge,
  ChatDelete,
  ChatFragment,
  ChatMessage,
  ChatStatus,
  EncoderInfo,
  EngineSnapshot,
  Leak,
  ObsCheck,
  SessionMeta,
  TargetStatus,
  Viewers,
} from "./types";
import { defaultConfig } from "./factory";
import { PLATFORMS } from "./platforms";

export const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface CornetaApi {
  getConfig(): Promise<AppConfig>;
  saveConfig(config: AppConfig): Promise<void>;
  setKey(targetId: string, key: string): Promise<void>;
  clearKey(targetId: string): Promise<void>;
  detectEncoders(): Promise<EncoderInfo[]>;
  testUpload(): Promise<number>; // Mbps
  setAutostart(enabled: boolean): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  setTargetPaused(targetId: string, paused: boolean): Promise<void>;
  subscribe(cb: (s: EngineSnapshot) => void): () => void;
  // Relatórios pós-live
  listSessions(): Promise<SessionMeta[]>;
  readSession(id: string): Promise<string>;
  deleteSession(id: string): Promise<void>;
  openSessionsDir(): Promise<void>;
  // Chat unificado
  chatStart(): Promise<void>;
  chatStop(): Promise<void>;
  openChatWindow(): Promise<void>;
  subscribeChat(
    onMsg: (m: ChatMessage) => void,
    onStatus: (s: ChatStatus) => void,
    onDelete: (d: ChatDelete) => void
  ): () => void;
  subscribeAlerts(onAlert: (a: Alert) => void): () => void;
  subscribeViewers(onViewers: (v: Viewers) => void): () => void;
  // UX
  obsSetStream(start: boolean): Promise<void>;
  testTarget(targetId: string): Promise<string>;
  openLogsDir(): Promise<void>;
  registerShortcut(shortcut: string): Promise<void>;
  subscribeShortcut(cb: () => void): () => void;
  obsCheck(): Promise<ObsCheck>;
  markMoment(label?: string): Promise<void>;
  exportConfig(): Promise<boolean>;
  importConfig(): Promise<boolean>;
  saveBrbSlate(b64: string): Promise<void>;
  captureFrame(): Promise<string>;
  // Guardião anti-vazamento
  setCensor(on: boolean): Promise<void>;
  subscribeGuardian(onLeak: (l: Leak) => void, onCensor: (on: boolean) => void): () => void;
}

// ---------------------------------------------------------------------------
// Implementação real (Tauri)
// ---------------------------------------------------------------------------
function tauriApi(): CornetaApi {
  // Imports dinâmicos: só carregam dentro do Tauri.
  const core = () => import("@tauri-apps/api/core");
  const event = () => import("@tauri-apps/api/event");

  return {
    async getConfig() {
      const { invoke } = await core();
      return invoke<AppConfig>("get_config");
    },
    async saveConfig(config) {
      const { invoke } = await core();
      await invoke("save_config", { config });
    },
    async setKey(targetId, key) {
      const { invoke } = await core();
      await invoke("set_key", { targetId, key });
    },
    async clearKey(targetId) {
      const { invoke } = await core();
      await invoke("clear_key", { targetId });
    },
    async detectEncoders() {
      const { invoke } = await core();
      return invoke<EncoderInfo[]>("detect_encoders");
    },
    async testUpload() {
      const { invoke } = await core();
      return invoke<number>("test_upload");
    },
    async setAutostart(enabled) {
      const { invoke } = await core();
      await invoke("set_autostart", { enabled });
    },
    async start() {
      const { invoke } = await core();
      await invoke("start_engine");
    },
    async stop() {
      const { invoke } = await core();
      await invoke("stop_engine");
    },
    async setTargetPaused(targetId, paused) {
      const { invoke } = await core();
      await invoke("set_target_paused", { targetId, paused });
    },
    subscribe(cb) {
      let cancelled = false;
      let unlisten: (() => void) | null = null;
      void event().then(({ listen }) =>
        listen<EngineSnapshot>("engine://status", (e) => cb(e.payload)).then((u) =>
          cancelled ? u() : (unlisten = u)
        )
      );
      return () => {
        cancelled = true;
        unlisten?.();
        unlisten = null;
      };
    },
    async listSessions() {
      const { invoke } = await core();
      return invoke<SessionMeta[]>("list_sessions");
    },
    async readSession(id) {
      const { invoke } = await core();
      return invoke<string>("read_session", { id });
    },
    async deleteSession(id) {
      const { invoke } = await core();
      await invoke("delete_session", { id });
    },
    async openSessionsDir() {
      const { invoke } = await core();
      await invoke("open_sessions_dir");
    },
    async chatStart() {
      const { invoke } = await core();
      await invoke("chat_start");
    },
    async chatStop() {
      const { invoke } = await core();
      await invoke("chat_stop");
    },
    async openChatWindow() {
      const { invoke } = await core();
      await invoke("open_chat_window");
    },
    subscribeChat(onMsg, onStatus, onDelete) {
      // StrictMode (dev) monta→desmonta→monta. Como `listen` é async, o cleanup pode
      // rodar antes de resolver; o flag `cancelled` garante que ele desregistre mesmo
      // assim (senão sobram 2 listeners → mensagens duplicadas).
      let cancelled = false;
      const uns: Array<() => void> = [];
      const add = (u: () => void) => (cancelled ? u() : uns.push(u));
      void event().then(({ listen }) => {
        void listen<ChatMessage>("chat://message", (e) => onMsg(e.payload)).then(add);
        void listen<ChatStatus>("chat://status", (e) => onStatus(e.payload)).then(add);
        void listen<ChatDelete>("chat://delete", (e) => onDelete(e.payload)).then(add);
      });
      return () => {
        cancelled = true;
        uns.forEach((u) => u());
        uns.length = 0;
      };
    },
    subscribeAlerts(onAlert) {
      let cancelled = false;
      let unlisten: (() => void) | null = null;
      void event().then(({ listen }) =>
        listen<Alert>("alert://event", (e) => onAlert(e.payload)).then((u) =>
          cancelled ? u() : (unlisten = u)
        )
      );
      return () => {
        cancelled = true;
        unlisten?.();
        unlisten = null;
      };
    },
    subscribeViewers(onViewers) {
      let cancelled = false;
      let unlisten: (() => void) | null = null;
      void event().then(({ listen }) =>
        listen<Viewers>("viewers://update", (e) => onViewers(e.payload)).then((u) =>
          cancelled ? u() : (unlisten = u)
        )
      );
      return () => {
        cancelled = true;
        unlisten?.();
        unlisten = null;
      };
    },
    async obsSetStream(start) {
      const { invoke } = await core();
      await invoke("obs_set_stream", { start });
    },
    async testTarget(targetId) {
      const { invoke } = await core();
      return invoke<string>("test_target", { targetId });
    },
    async openLogsDir() {
      const { invoke } = await core();
      await invoke("open_logs_dir");
    },
    async registerShortcut(shortcut) {
      const { invoke } = await core();
      await invoke("register_shortcut", { shortcut });
    },
    subscribeShortcut(cb) {
      let cancelled = false;
      let unlisten: (() => void) | null = null;
      void event().then(({ listen }) =>
        listen("shortcut://toggle-live", () => cb()).then((u) =>
          cancelled ? u() : (unlisten = u)
        )
      );
      return () => {
        cancelled = true;
        unlisten?.();
        unlisten = null;
      };
    },
    async obsCheck() {
      const { invoke } = await core();
      return invoke<ObsCheck>("obs_check");
    },
    async markMoment(label) {
      const { invoke } = await core();
      await invoke("mark_moment", { label: label ?? null });
    },
    async exportConfig() {
      const { invoke } = await core();
      return invoke<boolean>("export_config");
    },
    async importConfig() {
      const { invoke } = await core();
      return invoke<boolean>("import_config");
    },
    async saveBrbSlate(b64) {
      const { invoke } = await core();
      await invoke("save_brb_slate", { data: b64 });
    },
    async captureFrame() {
      const { invoke } = await core();
      return invoke<string>("capture_frame");
    },
    async setCensor(on) {
      const { invoke } = await core();
      await invoke("set_censor", { on });
    },
    subscribeGuardian(onLeak, onCensor) {
      let cancelled = false;
      const uns: Array<() => void> = [];
      const add = (u: () => void) => (cancelled ? u() : uns.push(u));
      void event().then(({ listen }) => {
        void listen<Leak>("leak://alert", (e) => onLeak(e.payload)).then(add);
        void listen<boolean>("leak://censor", (e) => onCensor(e.payload)).then(add);
      });
      return () => {
        cancelled = true;
        uns.forEach((u) => u());
        uns.length = 0;
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Implementação mock (navegador) — simula motor e cofre via localStorage
// ---------------------------------------------------------------------------
function mockApi(): CornetaApi {
  const CONFIG_KEY = "corneta.config";
  const VAULT_KEY = "corneta.vault";

  const loadVault = (): Record<string, string> => {
    try {
      return JSON.parse(localStorage.getItem(VAULT_KEY) || "{}");
    } catch {
      return {};
    }
  };
  const saveVault = (v: Record<string, string>) =>
    localStorage.setItem(VAULT_KEY, JSON.stringify(v));

  const loadConfig = (): AppConfig => {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    const cfg = defaultConfig();
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    return cfg;
  };

  // --- sessões (relatório pós-live) ---
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

  // Gera uma sessão sintética (demo), com opção de janela problemática.
  const genSession = (
    startedAt: number,
    mins: number,
    plats: { id: string; name: string; platformId: string }[],
    opts?: { dropAtMin?: number; dropIdx?: number; highCpu?: boolean }
  ): string => {
    const meta = { kind: "meta", id: String(startedAt), startedAt, mode: "per-platform", platforms: plats };
    const lines = [JSON.stringify(meta)];
    const step = 2000;
    const n = Math.round((mins * 60 * 1000) / step);
    const base = [6000, 9000, 6000, 4500];
    const drops = plats.map(() => 0);
    const raidAtMin = Math.min(mins * 0.35, 11);
    const raidViewers = 90 + Math.floor(Math.random() * 110);
    const vbase = plats.map((p) => (p.platformId === "youtube" ? 70 : 280));
    for (let k = 0; k < n; k++) {
      const t = startedAt + k * step;
      const minNow = (k * step) / 60000;
      let cpu = 46 + Math.sin(k / 9) * 7 + Math.random() * 5;
      const gpu = 32 + Math.sin(k / 7) * 6 + Math.random() * 4;
      const targets = plats.map((p, i) => {
        let bitrate = Math.round(base[i % base.length] * (0.96 + Math.random() * 0.07));
        let state = "live";
        const isDrop =
          opts?.dropAtMin != null && Math.abs(minNow - opts.dropAtMin) < 0.18 && i === (opts.dropIdx ?? 0);
        if (isDrop) {
          bitrate = Math.round(base[i % base.length] * 0.3);
          state = "reconnecting";
          drops[i] += 25;
          if (opts?.highCpu) cpu = 97;
        }
        return { id: p.id, name: p.name, state, bitrate, fps: 60, dropped: drops[i] };
      });
      const incident = opts?.dropAtMin != null && Math.abs(minNow - opts.dropAtMin) < 0.18;
      const obs = {
        activeFps: 60,
        avgRenderMs: incident ? 28 + Math.random() * 5 : 7 + Math.random() * 3,
        renderSkipped: incident ? 40 : 0,
        outputSkipped: incident ? 30 : 0,
        congestion: incident ? 0.6 + Math.random() * 0.2 : Math.random() * 0.06,
      };
      const nearRaid = Math.abs(minNow - raidAtMin) < 0.5;
      let chat = Math.round(5 + Math.sin(k / 11) * 2 + Math.random() * 4);
      if (nearRaid) chat += 18;
      if (Math.random() < 0.015) chat += 14;
      lines.push(
        JSON.stringify({
          kind: "sample",
          t,
          cpu: Math.round(cpu * 10) / 10,
          gpu: Math.round(gpu * 10) / 10,
          obs,
          chat,
          targets,
        })
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
      }
    }
    // Alertas de exemplo: raid (pico), subs/membros espalhados, gift bomb e bits.
    const at = (mm: number) => startedAt + mm * 60000;
    lines.push(
      JSON.stringify({ kind: "alert", t: at(raidAtMin), platform: plats[0].platformId, alertKind: "raid", user: "Gaules", amount: raidViewers })
    );
    ["sub", "resub", "sub", "member", "resub"].forEach((kd, idx) => {
      const mm = 3 + idx * 6;
      if (mm < mins)
        lines.push(
          JSON.stringify({
            kind: "alert",
            t: at(mm),
            platform: plats[idx % plats.length].platformId,
            alertKind: kd,
            user: ["ana_live", "brabo_do_rio", "zedapeça", "kraderson", "luluzinha"][idx],
            amount: kd === "resub" ? 2 + idx : 1,
          })
        );
    });
    lines.push(
      JSON.stringify({ kind: "alert", t: at(Math.min(mins * 0.55, 16)), platform: plats[0].platformId, alertKind: "subgift", user: "Patrocinador", amount: 10 })
    );
    lines.push(
      JSON.stringify({ kind: "alert", t: at(Math.min(mins * 0.28, 8)), platform: plats[0].platformId, alertKind: "bits", user: "fa_numero_1", amount: 1000 })
    );
    if (opts?.dropAtMin != null) {
      lines.push(
        JSON.stringify({ kind: "marker", t: startedAt + opts.dropAtMin * 60000, label: "Twitch caiu" })
      );
    }
    lines.push(JSON.stringify({ kind: "end", endedAt: startedAt + n * step }));
    return lines.join("\n");
  };

  const seedSessions = () => {
    const m = loadSessions();
    if (Object.keys(m).length > 0) return;
    const tw = { id: "t1", name: "Twitch", platformId: "twitch" };
    const yt = { id: "y1", name: "YouTube", platformId: "youtube" };
    const a = Date.now() - 26 * 3600 * 1000;
    const b = Date.now() - 3 * 3600 * 1000;
    m[String(a)] = genSession(a, 35, [tw, yt]); // sem incidentes
    m[String(b)] = genSession(b, 48, [tw, yt], { dropAtMin: 23, dropIdx: 0, highCpu: true }); // com incidente
    saveSessions(m);
  };

  // --- simulador do motor ---
  let snapshot: EngineSnapshot = { state: "stopped", startedAt: null, targets: {} };
  const listeners = new Set<(s: EngineSnapshot) => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  // Gravação da sessão demo em andamento.
  let rec: { id: string; lines: string[] } | null = null;
  // Destinos pausados (controle ao vivo).
  const pausedTargets = new Set<string>();

  // --- chat demo ---
  const chatMsgListeners = new Set<(m: ChatMessage) => void>();
  const chatStatusListeners = new Set<(s: ChatStatus) => void>();
  const chatDeleteListeners = new Set<(d: ChatDelete) => void>();
  const alertListeners = new Set<(a: Alert) => void>();
  let alertSeq = 0;
  const viewerListeners = new Set<(v: Viewers) => void>();
  let viewerTimer: ReturnType<typeof setInterval> | null = null;
  let chatTimer: ReturnType<typeof setInterval> | null = null;
  let chatSeq = 0;
  const recentIds: string[] = [];
  const ALERT_SOURCES = [
    { platform: "twitch" as const, source: "Pitrol" },
    { platform: "kick" as const, source: "XQC" },
    { platform: "youtube" as const, source: "Live" },
  ];
  const ALERT_USERS = ["brabo_do_rio", "ana_live", "kraderson", "Maria Silva", "zedapeça", "miron_tv"];
  const randomAlert = (seq: number): Alert => {
    const src = ALERT_SOURCES[Math.floor(Math.random() * ALERT_SOURCES.length)];
    const user = ALERT_USERS[Math.floor(Math.random() * ALERT_USERS.length)];
    const kinds: Alert["kind"][] = ["sub", "resub", "subgift", "bits", "raid", "member", "superchat"];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const base: Alert = { id: `a${seq}-${Date.now()}`, platform: src.platform, source: src.source, kind, user, ts: Date.now() };
    switch (kind) {
      case "bits": return { ...base, amount: pick([100, 500, 1000]) };
      case "resub": return { ...base, amount: 1 + Math.floor(Math.random() * 24), tier: "T1", message: "valeu demais!" };
      case "sub": return { ...base, tier: "T1" };
      case "subgift": return { ...base, amount: pick([1, 5, 10]) };
      case "raid": return { ...base, amount: 10 + Math.floor(Math.random() * 200) };
      case "member": return { ...base, tier: "Membro", amount: 1 + Math.floor(Math.random() * 12) };
      case "superchat": return { ...base, amount: pick([5, 10, 50]), currency: "BRL", message: "manda salve!" };
      default: return base;
    }
  };
  const CHAT_MSGS = [
    "salve salve!",
    "kkkkk",
    "qual a build?",
    "primeiro 🎉",
    "tá lagando aí?",
    "som tá baixo",
    "boa live!",
    "manda um salve pro RJ",
    "que jogo é esse?",
    "📣📣📣",
    "cornetou demais",
    "GG",
    "alguém mais travando?",
    "joga de novo!",
  ];

  const emit = () => listeners.forEach((l) => l(structuredClone(snapshot)));

  const tick = () => {
    const now = Date.now();
    // Demo: depois de "ouvir" um instante, o "OBS conecta" e entra no ar.
    if (snapshot.state === "starting") snapshot.state = "live";
    for (const st of Object.values(snapshot.targets)) {
      if (pausedTargets.has(st.targetId)) continue; // pausado: mantém o estado
      if (st.state === "connecting") {
        st.state = "live";
      } else if (st.state === "live") {
        // pequena flutuação ao redor do alvo
        const jitter = (Math.random() - 0.5) * 0.06;
        st.bitrateKbps = Math.max(0, Math.round(st.bitrateKbps * (1 + jitter)));
        st.fps = 30 + Math.round(Math.random() * 30);
        if (Math.random() < 0.04) st.droppedFrames += Math.round(Math.random() * 3);
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
        })
      );
    }
    emit();
  };

  return {
    async getConfig() {
      return loadConfig();
    },
    async saveConfig(config) {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
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
        { kind: "nvenc", label: "NVIDIA NVENC", available: true, maxSessions: 8 },
        { kind: "qsv", label: "Intel Quick Sync", available: false },
        { kind: "amf", label: "AMD AMF", available: false },
        { kind: "software", label: "Software (x264)", available: true, maxSessions: 1 },
      ];
    },
    async testUpload() {
      // simula um teste: ~25–60 Mbps
      return Math.round(25 + Math.random() * 35);
    },
    async setAutostart() {
      // no-op no navegador (sem SO pra registrar autostart)
    },
    async start() {
      const cfg = loadConfig();
      const targets: Record<string, TargetStatus> = {};
      for (const t of cfg.targets.filter((x) => x.enabled)) {
        const target = t.encoding.preset?.videoBitrateKbps ?? PLATFORMS[t.platformId].recommended.videoBitrateKbps;
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
      snapshot = { state: "starting", startedAt: Date.now(), targets };
      const sid = String(snapshot.startedAt);
      const plats = cfg.targets
        .filter((x) => x.enabled)
        .map((t) => ({ id: t.id, name: t.name, platformId: t.platformId }));
      rec = {
        id: sid,
        lines: [
          JSON.stringify({ kind: "meta", id: sid, startedAt: snapshot.startedAt, mode: cfg.mode, platforms: plats }),
        ],
      };
      emit();
      if (timer) clearInterval(timer);
      timer = setInterval(tick, 1000);
    },
    async stop() {
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
      snapshot = { state: "stopped", startedAt: null, targets: {} };
      emit();
    },
    async setTargetPaused(targetId, paused) {
      if (paused) pausedTargets.add(targetId);
      else pausedTargets.delete(targetId);
      const st = snapshot.targets[targetId];
      if (st) st.state = paused ? "paused" : "connecting";
      emit();
    },
    subscribe(cb) {
      listeners.add(cb);
      cb(structuredClone(snapshot));
      return () => listeners.delete(cb);
    },
    async listSessions() {
      seedSessions();
      const m = loadSessions();
      const out: SessionMeta[] = [];
      for (const [id, ndjson] of Object.entries(m)) {
        const lines = ndjson.trim().split("\n");
        let meta: { kind?: string; startedAt?: number; mode?: string; platforms?: unknown };
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
          endedAt = last.kind === "end" ? last.endedAt : last.t ?? startedAt;
        } catch {
          /* ignore */
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
    async deleteSession(id) {
      const m = loadSessions();
      delete m[id];
      saveSessions(m);
    },
    async openSessionsDir() {
      // No navegador não há pasta de sessões (no app, abre o explorador de arquivos).
    },
    async chatStart() {
      const SOURCES = [
        { platform: "twitch", name: "Pitrol" },
        { platform: "twitch", name: "Gaules" },
        { platform: "kick", name: "XQC" },
        { platform: "youtube", name: "Live" },
      ] as const;
      SOURCES.forEach((src) =>
        chatStatusListeners.forEach((l) =>
          l({ platform: src.platform, source: src.name, status: "connected" })
        )
      );
      // Viewers simulados (oscilam ao redor de uma base por canal).
      const VBASE: Record<string, number> = { Pitrol: 820, Gaules: 4200, XQC: 1500, Live: 300 };
      const emitViewers = () => {
        const items = SOURCES.map((s) => {
          const base = VBASE[s.name] ?? 100;
          const viewers = Math.max(0, Math.round(base * (0.9 + Math.random() * 0.2)));
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
        twitch: ["Pitrol", "brabo_do_rio", "ana_live", "zedapeça"],
        kick: ["kraderson", "miron_tv", "biel_kick", "luluzinha"],
        youtube: ["Maria Silva", "joao_yt", "gamer123", "fulano_de_tal"],
      };
      const COLORS = ["#ff5a36", "#7c9cff", "#34d399", "#f5a524", "#e879f9"];
      chatTimer = setInterval(() => {
        // Demonstra o fluxo de deleção de vez em quando.
        if (recentIds.length > 8 && Math.random() < 0.08) {
          const nativeId = recentIds[Math.floor(Math.random() * recentIds.length)];
          chatDeleteListeners.forEach((l) => l({ scope: "message", platform: "twitch", nativeId }));
        }
        // De vez em quando, dispara um alerta de exemplo.
        if (Math.random() < 0.12) {
          const a = randomAlert(++alertSeq);
          alertListeners.forEach((l) => l(a));
        }
        const src = SOURCES[Math.floor(Math.random() * SOURCES.length)];
        const platform = src.platform;
        const text = CHAT_MSGS[Math.floor(Math.random() * CHAT_MSGS.length)];
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
        recentIds.push(nativeId);
        if (recentIds.length > 40) recentIds.shift();
        const pool = AUTHORS[platform];
        chatMsgListeners.forEach((l) =>
          l({
            id: `${chatSeq}-${Date.now()}`,
            platform,
            source: src.name,
            author: pool[Math.floor(Math.random() * pool.length)],
            nativeId,
            color: platform === "youtube" ? undefined : COLORS[Math.floor(Math.random() * COLORS.length)],
            text,
            fragments,
            badges,
            ts: Date.now(),
          })
        );
      }, 1100);
    },
    async chatStop() {
      if (chatTimer) clearInterval(chatTimer);
      chatTimer = null;
      if (viewerTimer) clearInterval(viewerTimer);
      viewerTimer = null;
      viewerListeners.forEach((l) => l({ total: 0, anyLive: false, items: [] }));
    },
    async openChatWindow() {
      // No navegador não dá pra abrir janela nativa (no app instalado, abre a flutuante).
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
    subscribeViewers(onViewers) {
      viewerListeners.add(onViewers);
      return () => viewerListeners.delete(onViewers);
    },
    async obsSetStream() {
      // no-op no navegador (sem OBS).
    },
    async testTarget() {
      return "demo: alcançável";
    },
    async openLogsDir() {
      // no-op no navegador.
    },
    async registerShortcut() {
      // no-op no navegador (atalho global é do SO).
    },
    subscribeShortcut() {
      return () => {};
    },
    async obsCheck() {
      return { reachable: true, pointingAtCorneta: true, width: 1920, height: 1080, fps: 60 };
    },
    async markMoment() {
      // no-op no navegador (sem sessão real gravando)
    },
    async exportConfig() {
      return false;
    },
    async importConfig() {
      return false;
    },
    async saveBrbSlate() {
      // no-op no navegador (sem backend pra salvar o slate)
    },
    async captureFrame() {
      throw new Error("captura de frame só no app instalado (e ao vivo)");
    },
    async setCensor() {
      // no-op no navegador (sem motor real pra censurar)
    },
    subscribeGuardian() {
      return () => {};
    },
  };
}

export const api: CornetaApi = IS_TAURI ? tauriApi() : mockApi();
