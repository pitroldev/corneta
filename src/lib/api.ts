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

  // --- simulador do motor ---
  let snapshot: EngineSnapshot = { state: "stopped", startedAt: null, targets: {} };
  const listeners = new Set<(s: EngineSnapshot) => void>();
  let timer: ReturnType<typeof setInterval> | null = null;

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
      emit();
      if (timer) clearInterval(timer);
      timer = setInterval(tick, 1000);
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
      snapshot = { state: "stopped", startedAt: null, targets: {} };
      emit();
    },
    subscribe(cb) {
      listeners.add(cb);
      cb(structuredClone(snapshot));
      return () => listeners.delete(cb);
    },
  };
}

export const api: CornetaApi = IS_TAURI ? tauriApi() : mockApi();
