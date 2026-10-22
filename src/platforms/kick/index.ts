import type { AuthStatus } from "../../lib/api/types";
import { firstSeg, foldAscii } from "../channel";
import type { AccountProviderSpec, ChatProviderSpec } from "../types";

const KICK_KEY_SCOPE = "streamkey:read";
const KICK_BAN_SCOPE = "moderation:ban";

interface KickStatus {
  kick: boolean;
  kickConfigured: boolean;
  kickOfficialReady: boolean;
  kickOwnCreds: boolean;
  kickUsingOwnCreds: boolean;
  /** The grant includes the ban scope, which is requested only on demand. */
  kickCanBan: boolean;
  /** The grant includes reading the stream key, also requested only on demand. */
  kickCanReadKey: boolean;
}

function normKick(s: string): string {
  let t = s.replace(/^https?:\/\//i, "");
  if (/^(www\.|m\.)?kick\.com(\/|$)/i.test(t)) {
    t = t.replace(/^(www\.|m\.)?kick\.com\/?/i, "");
  }
  t = t.replace(/^@+/, "");
  const seg = firstSeg(t);
  return foldAscii(seg)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

export const kickChat: ChatProviderSpec = {
  id: "kick",
  name: "Kick",
  color: "#53FC18",
  account: "kick",
  send: "account",
  bansNeedAuthorId: true,
  repliesNeedNativeId: true,
  copy: {
    channel: "chat.source.value.kick",
    placeholder: "chat.source.placeholder.kick",
    hint: "chat.source.hint.kick",
    error: "chat.status.explain.error.kick",
  },
  normalizeChannel: normKick,
};

export const kickAccount: AccountProviderSpec = {
  id: "kick",
  name: "Kick",
  keyScope: KICK_KEY_SCOPE,
  fetchKeyTitle: "platforms.key.fetchTitleKick",
  banScope: KICK_BAN_SCOPE,
  banScopeNotice: "chat.mod.kickReconnect",
  scopesOnDemand: true,
  connect: "fetch-key",
  pt: { with: "com a Kick", of: "da Kick" },
  readStatus(status) {
    const a = status as AuthStatus & KickStatus;
    return {
      login: a.kick
        ? {
            state: "connected",
            missingScopes: [
              ...(a.kickCanBan ? [] : [KICK_BAN_SCOPE]),
              ...(a.kickCanReadKey ? [] : [KICK_KEY_SCOPE]),
            ],
          }
        : { state: "out" },
      oauthReady: a.kickConfigured,
      modes: {
        officialReady: a.kickOfficialReady,
        ownCreds: a.kickOwnCreds,
        usingOwnCreds: a.kickUsingOwnCreds,
      },
    };
  },
};
