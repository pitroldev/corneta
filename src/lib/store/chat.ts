import { api } from "../api";
import { applyChatBatch, type ChatEvent } from "../chatBatch";
import type { SliceContext, State } from "./types";
const CHAT_CAP = 400;
const ALERT_CAP = 100;
export function createChatSlice({
  set,
  get,
  persist,
  flushSave,
}: SliceContext): Pick<
  State,
  | "chatMessages"
  | "chatConnected"
  | "chatStatuses"
  | "alertStatuses"
  | "chatAuth"
  | "bindChat"
  | "bindChatRunning"
  | "connectChat"
  | "disconnectChat"
  | "bindAlertStatus"
  | "setAlertToken"
  | "clearAlertToken"
  | "bindChatAuth"
  | "sendChat"
  | "setChatSendToken"
  | "clearChatSendToken"
  | "moderate"
  | "clearChat"
  | "alerts"
  | "bindAlerts"
  | "clearAlerts"
  | "viewers"
  | "bindViewers"
  | "leaks"
  | "censored"
  | "bindGuardian"
> {
  let discardPendingChat = () => {};
  return {
    chatMessages: [],
    chatConnected: false,
    chatStatuses: {},
    alertStatuses: {},
    chatAuth: {},
    bindChat() {
      let queue: ChatEvent[] = [];
      let timer: ReturnType<typeof setTimeout> | undefined;
      const discard = () => {
        if (timer) clearTimeout(timer);
        timer = undefined;
        queue = [];
      };
      discardPendingChat = discard;
      const flush = () => {
        if (timer) clearTimeout(timer);
        timer = undefined;
        const events = queue;
        queue = [];
        if (events.length)
          set((state) => {
            const chatMessages = applyChatBatch(
              state.chatMessages,
              events,
              CHAT_CAP,
            );
            return chatMessages === state.chatMessages
              ? state
              : { chatMessages };
          });
      };
      const enqueue = (event: ChatEvent) => {
        queue.push(event);
        if (queue.length >= 128) flush();
        else if (!timer)
          timer = setTimeout(
            flush,
            typeof document !== "undefined" && document.hidden ? 100 : 16,
          );
      };
      const unsubscribe = api.subscribeChat(
        (message) => enqueue({ kind: "message", message }),
        (status) => {
          flush();
          set((state) => ({
            chatStatuses: {
              ...state.chatStatuses,
              [status.source || status.platform]: {
                platform: status.platform,
                status: status.status,
              },
            },
          }));
        },
        (deletion) => enqueue({ kind: "delete", deletion }),
      );
      return () => {
        unsubscribe();
        flush();
        if (discardPendingChat === discard) discardPendingChat = () => {};
      };
    },
    bindChatRunning() {
      // "Conectado" é estado global do backend: start/stop de qualquer janela reflete na outra
      // (sem isto, desconectar pelo popout deixava a principal presa em "conectado", e o popout
      // nascia mostrando "Conectar" com o chat já no ar). Não mexe nas mensagens.
      return api.subscribeChatRunning((running) =>
        set({ chatConnected: running }),
      );
    },
    async connectChat(t) {
      // NÃO zera chatMessages: reconectar (ex.: pra ressuscitar uma fonte que caiu)
      // não pode apagar o histórico das outras. Limpar é só no botão "Limpar" (clearChat).
      set({ chatStatuses: {}, alertStatuses: {}, chatAuth: {} });
      await api.chatStart(t);
      await api.alertsStart();
      set({ chatConnected: true });
    },
    async disconnectChat() {
      await api.chatStop();
      await api.alertsStop();
      set({
        chatConnected: false,
        chatStatuses: {},
        alertStatuses: {},
        chatAuth: {},
      });
    },
    bindAlertStatus() {
      return api.subscribeAlertStatus((st) =>
        set((s) => ({
          alertStatuses: {
            ...s.alertStatuses,
            [st.source]: { status: st.status },
          },
        })),
      );
    },
    async setAlertToken(id, token) {
      await flushSave();
      await api.setKey(`alert_${id}`, token);
      const config = get().config;
      if (!config) return;
      persist({
        ...config,
        settings: {
          ...config.settings,
          alertSources: (config.settings.alertSources ?? []).map((a) =>
            a.id === id ? { ...a, hasToken: true } : a,
          ),
        },
      });
    },
    async clearAlertToken(id) {
      await flushSave();
      await api.clearKey(`alert_${id}`);
      const config = get().config;
      if (!config) return;
      persist({
        ...config,
        settings: {
          ...config.settings,
          alertSources: (config.settings.alertSources ?? []).map((a) =>
            a.id === id ? { ...a, hasToken: false } : a,
          ),
        },
      });
    },
    bindChatAuth() {
      return api.subscribeChatAuth((a) =>
        set((s) => ({
          chatAuth: { ...s.chatAuth, [a.source]: { login: a.login, ok: a.ok } },
        })),
      );
    },
    async sendChat(text, sources) {
      await api.chatSend(text, sources);
    },
    async setChatSendToken(id, token) {
      await flushSave();
      await api.setKey(`chat_send_${id}`, token);
      const config = get().config;
      if (!config) return;
      persist({
        ...config,
        settings: {
          ...config.settings,
          chatSources: (config.settings.chatSources ?? []).map((c) =>
            c.id === id ? { ...c, hasSendToken: true } : c,
          ),
        },
      });
    },
    async clearChatSendToken(id) {
      await flushSave();
      await api.clearKey(`chat_send_${id}`);
      const config = get().config;
      if (!config) return;
      persist({
        ...config,
        settings: {
          ...config.settings,
          chatSources: (config.settings.chatSources ?? []).map((c) =>
            c.id === id ? { ...c, hasSendToken: false } : c,
          ),
        },
      });
    },
    async moderate(sourceId, action, opts) {
      await api.chatModerate(sourceId, action, opts);
    },
    clearChat() {
      discardPendingChat();
      set({ chatMessages: [] });
    },
    alerts: [],
    bindAlerts() {
      return api.subscribeAlerts((a) =>
        set((s) => {
          if (s.alerts.length < ALERT_CAP) {
            return { alerts: [...s.alerts, a] };
          }
          const next = s.alerts.slice(-(ALERT_CAP - 1));
          next.push(a);
          return { alerts: next };
        }),
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
        (on) => set({ censored: on }),
      );
    },
  };
}
