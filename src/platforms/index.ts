import { cinefyChat } from "./cinefy";
import { kickAccount, kickChat } from "./kick";
import { twitchAccount, twitchChat } from "./twitch";
import type {
  AccountPlatform,
  AccountProviderSpec,
  ChatPlatform,
  ChatProviderSpec,
} from "./types";
import { youtubeAccount, youtubeChat } from "./youtube";
import type { OauthModes } from "../lib/store/types";

export type {
  AccountPlatform,
  AccountProviderSpec,
  ChatPlatform,
  ChatProviderSpec,
} from "./types";

/** Chat providers in the order the app offers them. */
export const CHAT_PROVIDERS: readonly ChatProviderSpec[] = [
  twitchChat,
  kickChat,
  youtubeChat,
  cinefyChat,
];

export const ACCOUNT_PROVIDERS: readonly AccountProviderSpec[] = [
  twitchAccount,
  youtubeAccount,
  kickAccount,
];

/** Mode switches for accounts that have not reported any. */
export const NO_OAUTH_MODES: OauthModes = {
  officialReady: false,
  ownCreds: false,
  usingOwnCreds: false,
};

export const ACCOUNT_PLATFORMS: readonly AccountPlatform[] =
  ACCOUNT_PROVIDERS.map((p) => p.id);

export const CHAT_PLATFORMS: readonly ChatPlatform[] = CHAT_PROVIDERS.map(
  (p) => p.id,
);

export function chatProvider(id: string): ChatProviderSpec | undefined {
  return CHAT_PROVIDERS.find((p) => p.id === id);
}

export function accountProvider(id: string): AccountProviderSpec | undefined {
  return ACCOUNT_PROVIDERS.find((p) => p.id === id);
}

export function isAccountPlatform(id: string): id is AccountPlatform {
  return ACCOUNT_PROVIDERS.some((p) => p.id === id);
}
