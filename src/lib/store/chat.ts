import { api } from "../api";
import { applyChatBatch, type ChatEvent } from "../chatBatch";
import type { ChatSideEvent } from "../types";
import {
  chatSideKey,
  type ChatSide,
  type SliceContext,
  type State,
} from "./types";

function applySide(
  side: Record<string, ChatSide>,
  event: ChatSideEvent,
): Record<string, ChatSide> {
  const key = chatSideKey(event.platform, event.source);
  const current: ChatSide = side[key] ?? {
    platform: event.platform,
    source: event.source,
    modes: {},
    pin: null,
    poll: null,
  };
  const next: ChatSide =
    event.kind === "modes"
      ? { ...current, modes: { ...current.modes, ...event.modes } }
      : event.kind === "pin"
        ? { ...current, pin: event.message }
        : { ...current, poll: event.poll };
  return { ...side, [key]: next };
}
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
  | "chatSide"
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
    chatSide: {},
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
          set((state) => {
            // A dropped source no longer shows what it had pinned or running.
            const key = chatSideKey(status.platform, status.source);
            const side =
              status.status === "connected" || !state.chatSide[key]
                ? state.chatSide
                : {
                    ...state.chatSide,
                    [key]: { ...state.chatSide[key], pin: null, poll: null },
                  };
            return {
              chatStatuses: {
                ...state.chatStatuses,
                [status.source || status.platform]: {
                  platform: status.platform,
                  status: status.status,
                },
              },
              chatSide: side,
            };
          });
        },
        (deletion) => enqueue({ kind: "delete", deletion }),
      );
      const unsubscribeSide = api.subscribeChatSide((event) =>
        set((state) => ({ chatSide: applySide(state.chatSide, event) })),
      );
      return () => {
        unsubscribe();
        unsubscribeSide();
        flush();
        if (discardPendingChat === discard) discardPendingChat = () => {};
      };
    },
    bindChatRunning() {
      // Connection state is backend-global across webviews; updating it must not clear messages.
      return api.subscribeChatRunning((running) =>
        set({ chatConnected: running }),
      );
    },
    async connectChat(t) {
      // Reconnection preserves history; only explicit clearChat removes it.
      set({ chatStatuses: {}, chatSide: {}, alertStatuses: {}, chatAuth: {} });
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
        chatSide: {},
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
    async sendChat(text, sources, reply) {
      await api.chatSend(text, sources, reply);
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
