import type { AuthStatus } from "../lib/api/types";
import type { MessageKey } from "../lib/i18n";
import type { LoginState, OauthModes } from "../lib/store/types";

/** Platforms the app can sign in to; each one has an account provider. */
export type AccountPlatform = "twitch" | "youtube" | "kick";

/** Platforms the app reads chat from; Cinefy is a chat source, not a streaming destination. */
export type ChatPlatform = "twitch" | "youtube" | "kick" | "cinefy";

export interface ChatProviderSpec {
  id: ChatPlatform;
  name: string;
  /** Brand color for platforms without a destination preset. */
  color: string;
  /** SVG path for platforms without a destination preset, in a 24×24 box. */
  icon?: string;
  experimental?: boolean;
  /** Account whose login lets this source send and moderate. */
  account?: AccountPlatform;
  /** "session": over the source's own chat connection (Twitch IRC); "account": through the signed-in API. */
  send?: "session" | "account";
  /** The chat echoes the user's own messages back under their login. */
  echoesOwnMessages?: boolean;
  /** Timeouts and bans need the author's platform ID, which older feed modes may not carry. */
  bansNeedAuthorId?: boolean;
  /** Replies thread on the message's native ID; without that the platform mentions the author instead. */
  repliesNeedNativeId: boolean;
  copy: {
    channel: MessageKey;
    placeholder: MessageKey;
    hint: MessageKey;
    /** Why the connection dropped, when the platform has a known cause. */
    error?: MessageKey;
    /** What "waiting" means for this platform, when it differs from the default. */
    waiting?: MessageKey;
  };
  /** Idempotently normalizes a pasted handle, URL or ID; "" when nothing usable is left. */
  normalizeChannel(raw: string): string;
}

/** What an account reads from the shared auth status. */
export interface AccountStatus {
  login: LoginState;
  /** Whether signing in is possible now; absent when the UI knows it without the backend. */
  oauthReady?: boolean;
  /** Present for accounts that can also sign in through the user's own app. */
  modes?: OauthModes;
}

export interface AccountProviderSpec {
  id: AccountPlatform;
  name: string;
  /** OAuth scope needed before the stream key can be read through the login. */
  keyScope?: string;
  /** Scope behind timeouts and bans, when the platform asks for it separately. */
  banScope?: string;
  /** Why a timeout or ban needs that extra permission. */
  banScopeNotice?: MessageKey;
  /** Tooltip of the button that reads the stream key through the login; it may name the {login}. */
  fetchKeyTitle?: MessageKey;
  /** Extra scopes are requested only when a feature needs them. */
  scopesOnDemand?: boolean;
  /** What signing in from a destination does: read its stream key, or turn on the automatic broadcast. */
  connect: "fetch-key" | "auto-broadcast";
  /** Portuguese forms with the article: "com a Twitch", "da Twitch". */
  pt: { with: string; of: string };
  /** Reads this account's own fields; the Rust provider's `status` writes them. */
  readStatus(status: AuthStatus): AccountStatus;
}
