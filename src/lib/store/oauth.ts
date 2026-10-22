import { api } from "../api";
import {
  ACCOUNT_PROVIDERS,
  CHAT_PROVIDERS,
  type AccountPlatform,
} from "../../platforms";
import { OAUTH } from "../oauth";
import { openExternal } from "../utils";
import type { LoginState, OauthModes, SliceContext, State } from "./types";

const perAccount = <V>(value: (platform: AccountPlatform) => V) =>
  Object.fromEntries(
    ACCOUNT_PROVIDERS.map((p) => [p.id, value(p.id)]),
  ) as Record<AccountPlatform, V>;
export function createOauthSlice({
  set,
  get,
}: SliceContext): Pick<
  State,
  | "chatLogin"
  | "oauthReady"
  | "oauthModes"
  | "oauthBrokerError"
  | "setupOauth"
  | "saveOwnOauth"
  | "clearOwnOauth"
  | "switchToOfficialOauth"
  | "switchToOwnOauth"
  | "bindAuthFlow"
  | "accountLogin"
  | "accountLogout"
> {
  // Auth events reach every window; only the one that started a login opens the page, copies the
  // code and restarts chat, once per attempt.
  const pendingLogins = new Map<string, "started" | "opened">();
  const loadAuthStatus = async () => {
    try {
      const a = await api.authStatus();
      const read = ACCOUNT_PROVIDERS.map(
        (p) => [p.id, p.readStatus(a)] as const,
      );
      const oauthReady: Partial<Record<AccountPlatform, boolean>> = {};
      const oauthModes: Partial<Record<AccountPlatform, OauthModes>> = {};
      for (const [id, status] of read) {
        if (status.oauthReady !== undefined) oauthReady[id] = status.oauthReady;
        if (status.modes) oauthModes[id] = status.modes;
      }
      set({
        chatLogin: Object.fromEntries(
          read.map(([id, status]) => [id, status.login]),
        ) as Record<AccountPlatform, LoginState>,
        oauthReady,
        oauthModes,
        oauthBrokerError: a.brokerError,
      });
    } catch {
      /* Keep login unavailable if session status cannot be read. */
    }
  };
  return {
    chatLogin: perAccount((): LoginState => ({ state: "out" })),
    oauthReady: {},
    oauthModes: {},
    oauthBrokerError: null,
    async setupOauth() {
      await api.setOauthConfig(OAUTH);
      await loadAuthStatus();
    },
    async saveOwnOauth(platform, clientId, clientSecret) {
      await api.accountSaveOwnCredentials(platform, clientId, clientSecret);
      set((s) => ({
        oauthReady: { ...s.oauthReady, [platform]: true },
        chatLogin: { ...s.chatLogin, [platform]: { state: "out" } },
      }));
      await get().setupOauth();
    },
    async clearOwnOauth(platform) {
      await api.accountClearOwnCredentials(platform);
      await get().setupOauth();
    },
    async switchToOfficialOauth(platform) {
      await api.accountUseOfficial(platform);
      await get().setupOauth();
    },
    async switchToOwnOauth(platform) {
      await api.accountUseOwnCredentials(platform);
      await get().setupOauth();
    },
    bindAuthFlow(t) {
      return api.subscribeAuthFlow((who, a) => {
        set((s) => {
          const k = who as AccountPlatform;
          let next: LoginState = s.chatLogin[k];
          if (a.state === "code")
            next = {
              state: "code",
              userCode: a.userCode,
              verifyUri: a.verifyUri,
              verifyUriComplete: a.verifyUriComplete,
            };
          else if (a.state === "connected")
            next = { state: "connected", login: a.login || undefined };
          else if (a.state === "error")
            next = {
              state: "error",
              message: a.login || t("core.auth.login.error.fallback"),
            };
          else if (a.state === "loggedout") next = { state: "out" };
          return { chatLogin: { ...s.chatLogin, [k]: next } };
        });
        const login = pendingLogins.get(who);
        if (a.state === "code") {
          if (login !== "started") return;
          pendingLogins.set(who, "opened");
          // Copy device-flow codes before opening authorization; URL-prefilled flows do not need this.
          if (a.userCode) {
            try {
              void navigator.clipboard.writeText(a.userCode);
            } catch {
              /* Clipboard may be unavailable; the code remains visible for manual copying. */
            }
          }
          const url = a.verifyUriComplete || a.verifyUri;
          if (url) void openExternal(url);
          return;
        }
        // The event does not carry the granted scopes; every window reloads them for the features that ask.
        if (a.state === "connected") void loadAuthStatus();
        if (!login || (a.state !== "connected" && a.state !== "error")) return;
        pendingLogins.delete(who);
        // Chat that writes over its own session (Twitch IRC) must reconnect to authenticate; history stays.
        if (
          CHAT_PROVIDERS.some(
            (p) => p.account === who && p.send === "session",
          ) &&
          a.state === "connected" &&
          get().chatConnected
        ) {
          void api.chatStart(t);
        }
      });
    },
    async accountLogin(platform, options) {
      pendingLogins.set(platform, "started");
      set((s) => ({
        chatLogin: { ...s.chatLogin, [platform]: { state: "code" } },
      }));
      await api.accountLoginStart(platform, {
        moderation: options?.moderation === true,
        streamKey: options?.streamKey === true,
      });
    },
    async accountLogout(platform) {
      await api.accountLogout(platform);
      set((s) => ({
        chatLogin: { ...s.chatLogin, [platform]: { state: "out" } },
      }));
    },
  };
}
