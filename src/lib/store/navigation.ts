import type { SliceContext, State } from "./types";

export function createNavigationSlice({
  set,
}: SliceContext): Pick<
  State,
  | "unseenReport"
  | "markReportSeen"
  | "tourNonce"
  | "replayTour"
  | "setupOpen"
  | "setSetupOpen"
  | "settingsTab"
  | "setSettingsTab"
  | "navRequest"
  | "requestNavigate"
  | "chatConfigRequest"
  | "requestChatConfig"
> {
  return {
    unseenReport: false,
    markReportSeen() {
      set({ unseenReport: false });
      try {
        localStorage.setItem("corneta.lastSeenReportAt", String(Date.now()));
      } catch {
        /* Unavailable storage may repeat the unread badge but must not block navigation. */
      }
    },
    tourNonce: 0,
    replayTour() {
      set((s) => ({ tourNonce: s.tourNonce + 1 }));
    },
    setupOpen: false,
    setSetupOpen(open) {
      set({ setupOpen: open });
    },
    settingsTab: null,
    setSettingsTab(v) {
      set({ settingsTab: v });
    },
    navRequest: null,
    requestNavigate(screen) {
      set({ navRequest: screen });
    },
    chatConfigRequest: null,
    requestChatConfig(tab) {
      set({ chatConfigRequest: tab });
    },
  };
}
