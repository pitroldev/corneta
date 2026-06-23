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
import { uid } from "./utils";

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

  loadProfile: (id: string) => void;
  addProfile: () => void;
  removeProfile: (id: string) => void;
  renameProfile: (id: string, name: string) => void;

  setKey: (id: string, key: string) => Promise<void>;
  clearKey: (id: string) => Promise<void>;

  refreshEncoders: () => Promise<void>;
  runUploadTest: () => Promise<void>;

  start: () => Promise<void>;
  stop: () => Promise<void>;
}

const EMPTY_SNAPSHOT: EngineSnapshot = { state: "stopped", startedAt: null, targets: {} };

export const useStore = create<State>((set, get) => {
  // Persiste a config + mantém o perfil ativo em sincronia com o working set.
  const persist = (config: AppConfig) => {
    const profiles = config.profiles.map((p) =>
      p.id === config.activeProfileId
        ? { ...p, mode: config.mode, targets: config.targets }
        : p
    );
    const next = { ...config, profiles };
    set({ config: next });
    void api.saveConfig(next);
  };

  return {
    loaded: false,
    config: null,
    snapshot: EMPTY_SNAPSHOT,
    encoders: [],
    uploadMbps: null,

    async load() {
      const [loaded, encoders] = await Promise.all([
        api.getConfig(),
        api.detectEncoders(),
      ]);
      let config = loaded;
      // Migração: configs antigas sem perfis ganham um "Padrão" com o estado atual.
      if (!config.profiles || config.profiles.length === 0) {
        const id = uid("prof");
        config = {
          ...config,
          profiles: [{ id, name: "Padrão", mode: config.mode, targets: config.targets }],
          activeProfileId: id,
        };
        void api.saveConfig(config);
      } else if (!config.profiles.some((p) => p.id === config.activeProfileId)) {
        config = { ...config, activeProfileId: config.profiles[0].id };
      }
      set({ config, encoders, loaded: true });
    },

    bindEngine() {
      return api.subscribe((snapshot) => set({ snapshot }));
    },

    addTarget(platformId) {
      const config = get().config;
      if (!config) return;
      const t = makeTarget(platformId);
      // Nome único: se já existe "Twitch", o próximo vira "Twitch 2", etc.
      const names = new Set(config.targets.map((x) => x.name));
      if (names.has(t.name)) {
        let n = 2;
        while (names.has(`${t.name} ${n}`)) n++;
        t.name = `${t.name} ${n}`;
      }
      persist({ ...config, targets: [...config.targets, t] });
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
      // Só apaga a chave do cofre se esse destino não estiver em outro perfil.
      const usedElsewhere = config.profiles.some(
        (p) => p.id !== config.activeProfileId && p.targets.some((t) => t.id === id)
      );
      if (!usedElsewhere) void api.clearKey(id);
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

    loadProfile(id) {
      const config = get().config;
      if (!config) return;
      const prof = config.profiles.find((p) => p.id === id);
      if (!prof) return;
      persist({
        ...config,
        activeProfileId: id,
        mode: prof.mode,
        targets: prof.targets.map((t) => ({ ...t })),
      });
    },

    addProfile() {
      const config = get().config;
      if (!config) return;
      // Novo perfil = cópia do atual (compartilha as chaves por id), com nome único.
      const names = new Set(config.profiles.map((p) => p.name));
      let n = config.profiles.length + 1;
      while (names.has(`Perfil ${n}`)) n++;
      const id = uid("prof");
      const prof = {
        id,
        name: `Perfil ${n}`,
        mode: config.mode,
        targets: config.targets.map((t) => ({ ...t })),
      };
      persist({ ...config, profiles: [...config.profiles, prof], activeProfileId: id });
    },

    removeProfile(id) {
      const config = get().config;
      if (!config || config.profiles.length <= 1) return;
      const profiles = config.profiles.filter((p) => p.id !== id);
      if (config.activeProfileId === id) {
        const first = profiles[0];
        persist({
          ...config,
          profiles,
          activeProfileId: first.id,
          mode: first.mode,
          targets: first.targets.map((t) => ({ ...t })),
        });
      } else {
        persist({ ...config, profiles });
      }
    },

    renameProfile(id, name) {
      const config = get().config;
      if (!config) return;
      persist({
        ...config,
        profiles: config.profiles.map((p) => (p.id === id ? { ...p, name } : p)),
      });
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
