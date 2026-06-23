import { create } from "zustand";
import type {
  AppConfig,
  AppSettings,
  EncoderInfo,
  EncodingMode,
  EngineSnapshot,
  IngestConfig,
  PlatformId,
  Target,
} from "./types";
import { api } from "./api";
import { makeTarget } from "./factory";

interface State {
  loaded: boolean;
  config: AppConfig | null;
  snapshot: EngineSnapshot;
  encoders: EncoderInfo[];
  uploadMbps: number | null;

  load: () => Promise<void>;
  bindEngine: () => () => void;

  addTarget: (platformId: PlatformId) => void;
  updateTarget: (id: string, patch: Partial<Target>) => void;
  removeTarget: (id: string) => void;
  toggleTarget: (id: string) => void;

  setMode: (mode: EncodingMode) => void;
  setIngest: (patch: Partial<IngestConfig>) => void;
  setSettings: (patch: Partial<AppSettings>) => void;

  setKey: (id: string, key: string) => Promise<void>;
  clearKey: (id: string) => Promise<void>;

  refreshEncoders: () => Promise<void>;
  runUploadTest: () => Promise<void>;

  start: () => Promise<void>;
  stop: () => Promise<void>;
}

const EMPTY_SNAPSHOT: EngineSnapshot = { state: "stopped", startedAt: null, targets: {} };

export const useStore = create<State>((set, get) => {
  // Persiste a config atual no backend (cofre/arquivo).
  const persist = (config: AppConfig) => {
    set({ config });
    void api.saveConfig(config);
  };

  return {
    loaded: false,
    config: null,
    snapshot: EMPTY_SNAPSHOT,
    encoders: [],
    uploadMbps: null,

    async load() {
      const [config, encoders] = await Promise.all([
        api.getConfig(),
        api.detectEncoders(),
      ]);
      set({ config, encoders, loaded: true });
    },

    bindEngine() {
      return api.subscribe((snapshot) => set({ snapshot }));
    },

    addTarget(platformId) {
      const config = get().config;
      if (!config) return;
      persist({ ...config, targets: [...config.targets, makeTarget(platformId)] });
    },

    updateTarget(id, patch) {
      const config = get().config;
      if (!config) return;
      persist({
        ...config,
        targets: config.targets.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      });
    },

    removeTarget(id) {
      const config = get().config;
      if (!config) return;
      void api.clearKey(id);
      persist({ ...config, targets: config.targets.filter((t) => t.id !== id) });
    },

    toggleTarget(id) {
      const config = get().config;
      if (!config) return;
      persist({
        ...config,
        targets: config.targets.map((t) =>
          t.id === id ? { ...t, enabled: !t.enabled } : t
        ),
      });
    },

    setMode(mode) {
      const config = get().config;
      if (!config) return;
      persist({ ...config, mode });
    },

    setIngest(patch) {
      const config = get().config;
      if (!config) return;
      persist({ ...config, ingest: { ...config.ingest, ...patch } });
    },

    setSettings(patch) {
      const config = get().config;
      if (!config) return;
      persist({ ...config, settings: { ...config.settings, ...patch } });
      // Efeito colateral: ligar/desligar o autostart no nível do SO.
      if (patch.autostart !== undefined) void api.setAutostart(patch.autostart);
    },

    async setKey(id, key) {
      await api.setKey(id, key);
      get().updateTarget(id, { hasKey: true });
    },

    async clearKey(id) {
      await api.clearKey(id);
      get().updateTarget(id, { hasKey: false });
    },

    async refreshEncoders() {
      set({ encoders: await api.detectEncoders() });
    },

    async runUploadTest() {
      try {
        set({ uploadMbps: await api.testUpload() });
      } catch {
        // Backend ainda sem teste de upload (§4.2) — mantém o valor atual.
      }
    },

    async start() {
      await api.start();
    },

    async stop() {
      await api.stop();
    },
  };
});
