import { afterHost, foldAscii } from "../channel";
import type { AuthStatus } from "../../lib/api/types";
import type { AccountProviderSpec, ChatProviderSpec } from "../types";

interface TwitchStatus {
  twitchLogin: string | null;
  /** Required scopes the current Twitch grant lacks; empty when logged out. */
  twitchMissingScopes: string[];
}

const TWITCH_SKIP = new Set(["popout", "moderator", "mod", "u", "embed"]);
const TWITCH_RESERVED = new Set([
  "videos",
  "video",
  "directory",
  "team",
  "collections",
  "clips",
  "clip",
  "settings",
  "prime",
  "turbo",
  "downloads",
  "store",
  "jobs",
  "p",
  "subscriptions",
  "following",
  "friends",
  "wallet",
  "drops",
  "bits",
  "search",
]);

function normTwitch(s: string): string {
  const low = s.toLowerCase();
  // Clip URLs do not identify the originating channel.
  if (low.includes("clips.twitch.tv")) return "";
  const chParam = s.match(/[?&]channel=([A-Za-z0-9_]+)/i);
  if (chParam) return chParam[1].toLowerCase();

  const path = afterHost(s, ["twitch.tv/"]).replace(/^[@#\s]+/, "");
  const segs = path.split(/[/?#]/).filter((x) => x.length > 0);
  let seg = segs[0] ?? "";
  if (TWITCH_SKIP.has(seg.toLowerCase()) && segs[1]) seg = segs[1];
  if (TWITCH_RESERVED.has(seg.toLowerCase())) return "";
  return foldAscii(seg)
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

export const twitchChat: ChatProviderSpec = {
  id: "twitch",
  name: "Twitch",
  color: "#9146FF",
  account: "twitch",
  send: "session",
  echoesOwnMessages: true,
  repliesNeedNativeId: true,
  copy: {
    channel: "chat.source.value.twitch",
    placeholder: "chat.source.placeholder.twitch",
    hint: "chat.source.hint.twitch",
  },
  normalizeChannel: normTwitch,
};

export const twitchAccount: AccountProviderSpec = {
  id: "twitch",
  name: "Twitch",
  keyScope: "channel:read:stream_key",
  fetchKeyTitle: "platforms.key.fetchTitle",
  connect: "fetch-key",
  pt: { with: "com a Twitch", of: "da Twitch" },
  readStatus(status) {
    const a = status as AuthStatus & TwitchStatus;
    return {
      login: a.twitchLogin
        ? {
            state: "connected",
            login: a.twitchLogin,
            missingScopes: a.twitchMissingScopes,
          }
        : { state: "out" },
    };
  },
};
