// ============================================================
// Camada de acesso ao backend.
// - Dentro do Tauri: chama os commands em Rust e ouve eventos.
// - No navegador (pnpm dev): usa um simulador local (mock) para que a UI
//   seja totalmente navegável e demonstrável sem o backend.
// ============================================================
import type {
  AppConfig,
  EncoderInfo,
  EngineSnapshot,
  SessionMeta,
  TargetStatus,
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
  subscribe(cb: (s: EngineSnapshot) => void): () => void;
  // Relatórios pós-live
  listSessions(): Promise<SessionMeta[]>;
  readSession(id: string): Promise<string>;
  deleteSession(id: string): Promise<void>;
  openSessionsDir(): Promise<void>;
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
    subscribe(cb) {
      let unlisten: (() => void) | null = null;
      event().then(({ listen }) =>
        listen<EngineSnapshot>("engine://status", (e) => cb(e.payload)).then(
          (u) => (unlisten = u)
        )
      );
      return () => unlisten?.();
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
      lines.push(
        JSON.stringify({ kind: "sample", t, cpu: Math.round(cpu * 10) / 10, gpu: Math.round(gpu * 10) / 10, targets })
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

  const emit = () => listeners.forEach((l) => l(structuredClone(snapshot)));

  const tick = () => {
    const now = Date.now();
    // Demo: depois de "ouvir" um instante, o "OBS conecta" e entra no ar.
    if (snapshot.state === "starting") snapshot.state = "live";
    for (const st of Object.values(snapshot.targets)) {
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
    if (rec) {
      rec.lines.push(
        JSON.stringify({
          kind: "sample",
          t: now,
          cpu: snapshot.cpu,
          gpu: snapshot.gpu,
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
      snapshot = { state: "stopped", startedAt: null, targets: {} };
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
  };
}

export const api: CornetaApi = IS_TAURI ? tauriApi() : mockApi();
