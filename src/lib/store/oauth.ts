import { api } from "../api";
import { OAUTH } from "../oauth";
import { openExternal } from "../utils";
import type { LoginState, OauthModes, SliceContext, State } from "./types";
const NO_OAUTH_MODES: OauthModes = {
  officialReady: false,
  ownCreds: false,
  usingOwnCreds: false,
};
export function createOauthSlice({
  set,
  get,
}: SliceContext): Pick<
  State,
  | "chatLogin"
  | "youtubeOauthReady"
  | "kickOauthReady"
  | "youtubeOauthModes"
  | "kickOauthModes"
  | "oauthBrokerError"
  | "setupOauth"
  | "setYoutubeOauth"
  | "clearYoutubeOauth"
  | "youtubeUseOfficial"
  | "youtubeUseOwnCreds"
  | "setKickOauth"
  | "clearKickOauth"
  | "kickUseOfficial"
  | "kickUseOwnCreds"
  | "bindAuthFlow"
  | "twitchLogin"
  | "twitchLogout"
  | "youtubeLogin"
  | "youtubeLogout"
  | "kickLogin"
  | "kickLogout"
> {
  return {
    chatLogin: {
      twitch: { state: "out" },
      youtube: { state: "out" },
      kick: { state: "out" },
    },
    youtubeOauthReady: false,
    kickOauthReady: false,
    youtubeOauthModes: NO_OAUTH_MODES,
    kickOauthModes: NO_OAUTH_MODES,
    oauthBrokerError: null,
    async setupOauth() {
      await api.setOauthConfig({
        twitchClientId: OAUTH.twitchClientId,
        googleClientId: OAUTH.googleClientId,
        kickClientId: OAUTH.kickClientId,
        setupApiUrl: OAUTH.setupApiUrl,
      });
      try {
        const a = await api.authStatus();
        set({
          chatLogin: {
            twitch: a.twitchLogin
              ? { state: "connected", login: a.twitchLogin }
              : { state: "out" },
            youtube: a.youtube ? { state: "connected" } : { state: "out" },
            kick: a.kick ? { state: "connected" } : { state: "out" },
          },
          youtubeOauthReady: a.youtubeConfigured,
          kickOauthReady: a.kickConfigured,
          youtubeOauthModes: {
            officialReady: a.youtubeOfficialReady,
            ownCreds: a.youtubeOwnCreds,
            usingOwnCreds: a.youtubeUsingOwnCreds,
          },
          kickOauthModes: {
            officialReady: a.kickOfficialReady,
            ownCreds: a.kickOwnCreds,
            usingOwnCreds: a.kickUsingOwnCreds,
          },
          oauthBrokerError: a.brokerError,
        });
      } catch {
        /* Keep login unavailable if session status cannot be read. */
      }
    },
    async setYoutubeOauth(clientId, clientSecret) {
      await api.setYoutubeOauth(clientId, clientSecret);
      set((s) => ({
        youtubeOauthReady: true,
        chatLogin: { ...s.chatLogin, youtube: { state: "out" } },
      }));
      await get().setupOauth();
    },
    // Delete credentials only on explicit forgetting; mode switches retain them.
    async clearYoutubeOauth() {
      await api.clearYoutubeOauth();
      await get().setupOauth();
    },
    async youtubeUseOfficial() {
      await api.youtubeUseOfficial();
      await get().setupOauth();
    },
    async youtubeUseOwnCreds() {
      await api.youtubeUseOwnCreds();
      await get().setupOauth();
    },
    async setKickOauth(clientId, clientSecret) {
      await api.setKickOauth(clientId, clientSecret);
      set((s) => ({
        kickOauthReady: true,
        chatLogin: { ...s.chatLogin, kick: { state: "out" } },
      }));
      await get().setupOauth();
    },
    async clearKickOauth() {
      await api.clearKickOauth();
      await get().setupOauth();
    },
    async kickUseOfficial() {
      await api.kickUseOfficial();
      await get().setupOauth();
    },
    async kickUseOwnCreds() {
      await api.kickUseOwnCreds();
      await get().setupOauth();
    },
    bindAuthFlow(t) {
      return api.subscribeAuthFlow((who, a) => {
        set((s) => {
          const k = who as "twitch" | "youtube" | "kick";
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
        if (a.state === "code") {
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
        }
        // Reconnect active Twitch chat after login so IRC authenticates, preserving history.
        if (
          who === "twitch" &&
          a.state === "connected" &&
          get().chatConnected
        ) {
          void api.chatStart(t);
        }
      });
    },
    async twitchLogin() {
      set((s) => ({
        chatLogin: { ...s.chatLogin, twitch: { state: "code" } },
      }));
      await api.twitchLoginStart();
    },
    async twitchLogout() {
      await api.twitchLogout();
      set((s) => ({ chatLogin: { ...s.chatLogin, twitch: { state: "out" } } }));
    },
    async youtubeLogin() {
      set((s) => ({
        chatLogin: { ...s.chatLogin, youtube: { state: "code" } },
      }));
      await api.youtubeLoginStart();
    },
    async youtubeLogout() {
      await api.youtubeLogout();
      set((s) => ({
        chatLogin: { ...s.chatLogin, youtube: { state: "out" } },
      }));
    },
    async kickLogin() {
      set((s) => ({ chatLogin: { ...s.chatLogin, kick: { state: "code" } } }));
      await api.kickLoginStart();
    },
    async kickLogout() {
      await api.kickLogout();
      set((s) => ({ chatLogin: { ...s.chatLogin, kick: { state: "out" } } }));
    },
  };
}
