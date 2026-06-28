import { create } from "zustand";
import type {
  Alert,
  AppConfig,
  AppSettings,
  ChatDelete,
  ChatMessage,
  EncoderInfo,
  EncodingMode,
  EngineSnapshot,
  IngestConfig,
  Leak,
  PlatformId,
  Target,
  Viewers,
} from "./types";
import { api } from "./api";
import { makeTarget } from "./factory";
import { uid } from "./utils";

// Última remoção de destino (para o "desfazer").
let pendingRemoval: { target: Target; index: number } | null = null;

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
  reorderTargets: (ordered: Target[]) => void;
  duplicateTarget: (id: string) => void;
  moveTarget: (id: string, dir: -1 | 1) => void;
  undoRemoveTarget: () => void;

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

  // Chat unificado
  chatMessages: ChatMessage[];
  chatConnected: boolean;
  chatStatuses: Record<string, { platform: string; status: string }>;
  bindChat: () => () => void;
  connectChat: () => Promise<void>;
  disconnectChat: () => Promise<void>;
  clearChat: () => void;

  // Alertas centralizados
  alerts: Alert[];
  bindAlerts: () => () => void;
  clearAlerts: () => void;

  // Viewers unificados (todas as plataformas)
  viewers: Viewers;
  bindViewers: () => () => void;

  // Guardião anti-vazamento
  leaks: Leak[];
  censored: boolean;
  bindGuardian: () => () => void;

  // UI: pedido de foco no botão de ir ao vivo (vindo da sidebar)
  goLiveFocus: boolean;
  setGoLiveFocus: (v: boolean) => void;

  // UI: relatório novo (não visto) — selo "NOVO" na sidebar após encerrar uma live.
  unseenReport: boolean;
  markReportSeen: () => void;

  // UI: rever o tour (onboarding) sob demanda (a partir de Sobre).
  tourNonce: number;
  replayTour: () => void;

  // UI: aba pedida ao abrir Configurações (deep-link do "Ajustar").
  settingsTab: string | null;
  setSettingsTab: (v: string | null) => void;

  // UI: destino pedido ao abrir Qualidade (deep-link do chip de qualidade em Plataformas).
  encodingFocus: string | null;
  setEncodingFocus: (v: string | null) => void;
}

const EMPTY_SNAPSHOT: EngineSnapshot = { state: "stopped", startedAt: null, targets: {} };
const CHAT_CAP = 400;
const ALERT_CAP = 100;

// Decide se uma mensagem sobrevive a um evento de deleção.
function keepMessage(m: ChatMessage, d: ChatDelete): boolean {
  if (m.platform !== d.platform) return true;
  if (d.scope === "message") return m.nativeId !== d.nativeId;
  if (d.scope === "user")
    return !(m.source === d.source && m.author.toLowerCase() === (d.author ?? "").toLowerCase());
  if (d.scope === "all") return m.source !== d.source;
  return true;
}

export const useStore = create<State>((set, get) => {
  // Persiste a config + mantém o perfil ativo em sincronia com o working set.
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSave: AppConfig | null = null;
  const flushSave = async () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (pendingSave) {
      const c = pendingSave;
      pendingSave = null;
      await api.saveConfig(c);
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => void flushSave());
  }
  const persist = (config: AppConfig) => {
    const profiles = config.profiles.map((p) =>
      p.id === config.activeProfileId
        ? { ...p, mode: config.mode, targets: config.targets }
        : p
    );
    const next = { ...config, profiles };
    set({ config: next });
    pendingSave = next;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void flushSave(), 400);
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
        const p = config.profiles[0];
        config = {
          ...config,
          activeProfileId: p.id,
          mode: p.mode,
          targets: p.targets.map((t) => ({ ...t })),
        };
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
      const index = config.targets.findIndex((t) => t.id === id);
      const target = config.targets[index];
      if (target) pendingRemoval = { target, index };
      // Não apaga a chave do cofre — assim o "desfazer" restaura tudo, chave inclusa.
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

    reorderTargets(ordered) {
      const config = get().config;
      if (!config) return;
      persist({ ...config, targets: ordered });
    },

    duplicateTarget(id) {
      const config = get().config;
      if (!config) return;
      const index = config.targets.findIndex((t) => t.id === id);
      const t = config.targets[index];
      if (!t) return;
      // Mesma convenção do "Adicionar": sufixo numérico (Twitch → Twitch 2…).
      const names = new Set(config.targets.map((x) => x.name));
      let n = 2;
      let copyName = `${t.name} ${n}`;
      while (names.has(copyName)) {
        n++;
        copyName = `${t.name} ${n}`;
      }
      const copy: Target = {
        ...t,
        id: uid("tgt"),
        name: copyName,
        hasKey: false,
        encoding: {
          ...t.encoding,
          preset: t.encoding.preset ? { ...t.encoding.preset } : undefined,
        },
      };
      const targets = [...config.targets];
      targets.splice(index + 1, 0, copy);
      persist({ ...config, targets });
    },

    moveTarget(id, dir) {
      const config = get().config;
      if (!config) return;
      const i = config.targets.findIndex((t) => t.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= config.targets.length) return;
      const targets = [...config.targets];
      [targets[i], targets[j]] = [targets[j], targets[i]];
      persist({ ...config, targets });
    },

    undoRemoveTarget() {
      const config = get().config;
      if (!config || !pendingRemoval) return;
      const { target, index } = pendingRemoval;
      pendingRemoval = null;
      const targets = [...config.targets];
      targets.splice(Math.min(index, targets.length), 0, target);
      persist({ ...config, targets });
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
      pendingRemoval = null;
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
      pendingRemoval = null;
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
      pendingRemoval = null;
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
      // Propaga o erro pra a tela mostrar um toast (ex.: sem internet).
      set({ uploadMbps: await api.testUpload() });
    },

    async start() {
      await flushSave();
      set({ leaks: [], censored: false, viewers: { total: 0, anyLive: false, items: [] } });
      await api.start();
      // A1: liga o OBS junto (melhor-esforço — pode não estar acessível).
      if (get().config?.settings.autoStartObs) {
        try {
          await api.obsSetStream(true);
        } catch {
          /* OBS sem obs-websocket → o usuário dá play manualmente */
        }
      }
    },

    async stop() {
      await flushSave();
      // Só marca relatório novo se chegou a ficar AO VIVO (cancelar no "starting" não gera live).
      const wasLive = get().snapshot.state === "live";
      if (get().config?.settings.autoStartObs) {
        try {
          await api.obsSetStream(false);
        } catch {
          /* ignore */
        }
      }
      await api.stop();
      if (wasLive) set({ unseenReport: true });
    },

    chatMessages: [],
    chatConnected: false,
    chatStatuses: {},

    bindChat() {
      return api.subscribeChat(
        (m) =>
          set((s) => {
            const next = [...s.chatMessages, m];
            return {
              chatMessages: next.length > CHAT_CAP ? next.slice(next.length - CHAT_CAP) : next,
            };
          }),
        (st) =>
          set((s) => ({
            chatStatuses: {
              ...s.chatStatuses,
              [st.source || st.platform]: { platform: st.platform, status: st.status },
            },
          })),
        // Moderação: em vez de sumir, marca como removida (vira lápide no feed).
        (d) =>
          set((s) => ({
            chatMessages: s.chatMessages.map((m) => (keepMessage(m, d) ? m : { ...m, deleted: true })),
          }))
      );
    },

    async connectChat() {
      set({ chatMessages: [], chatStatuses: {} });
      await api.chatStart();
      set({ chatConnected: true });
    },

    async disconnectChat() {
      await api.chatStop();
      set({ chatConnected: false, chatStatuses: {} });
    },

    clearChat() {
      set({ chatMessages: [] });
    },

    alerts: [],
    bindAlerts() {
      return api.subscribeAlerts((a) =>
        set((s) => {
          const next = [...s.alerts, a];
          return { alerts: next.length > ALERT_CAP ? next.slice(next.length - ALERT_CAP) : next };
        })
      );
    },
    clearAlerts() {
      set({ alerts: [] });
    },

    viewers: { total: 0, anyLive: false, items: [] },
    bindViewers() {
      return api.subscribeViewers((v) => set({ viewers: v }));
    },

    leaks: [],
    censored: false,
    bindGuardian() {
      return api.subscribeGuardian(
        (l) => set((s) => ({ leaks: [...s.leaks, l].slice(-20) })),
        (on) => set({ censored: on })
      );
    },

    goLiveFocus: false,
    setGoLiveFocus(v) {
      set({ goLiveFocus: v });
    },

    unseenReport: false,
    markReportSeen() {
      set({ unseenReport: false });
    },

    tourNonce: 0,
    replayTour() {
      set((s) => ({ tourNonce: s.tourNonce + 1 }));
    },

    settingsTab: null,
    setSettingsTab(v) {
      set({ settingsTab: v });
    },

    encodingFocus: null,
    setEncodingFocus(v) {
      set({ encodingFocus: v });
    },
  };
});
