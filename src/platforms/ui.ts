import { useStore } from "../lib/store";
import { ACCOUNT_PLATFORMS } from ".";
import { kickUi } from "./kick/ui";
import { twitchUi } from "./twitch/ui";
import type { AccountPlatform, ChatPlatform } from "./types";
import type { AccountUi, ChatUi } from "./uiTypes";
import { youtubeChatUi, youtubeUi } from "./youtube/ui";

/** UI each platform contributes; kept apart from the data registry so the store can import that one. */
export const ACCOUNT_UI: Record<AccountPlatform, AccountUi> = {
  twitch: twitchUi,
  youtube: youtubeUi,
  kick: kickUi,
};

export const CHAT_UI: Partial<Record<ChatPlatform, ChatUi>> = {
  youtube: youtubeChatUi,
};

/** Whether each account can sign in right now, through the official client or the user's own app. */
export function useLoginReady(): Record<AccountPlatform, boolean> {
  const ready = useStore((s) => s.oauthReady);
  return Object.fromEntries(
    ACCOUNT_PLATFORMS.map((p) => [
      p,
      ACCOUNT_UI[p].loginReady ?? ready[p] ?? false,
    ]),
  ) as Record<AccountPlatform, boolean>;
}
