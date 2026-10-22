import type { AuthStatus } from "../../lib/api/types";
import { firstSeg } from "../channel";
import type { AccountProviderSpec, ChatProviderSpec } from "../types";

interface YoutubeStatus {
  youtube: boolean;
  /** At least one official or user-supplied login path exists. */
  youtubeConfigured: boolean;
  /** The official path is ready, so switching modes will not strand login. */
  youtubeOfficialReady: boolean;
  /** User-supplied credentials remain available in the vault. */
  youtubeOwnCreds: boolean;
  youtubeUsingOwnCreds: boolean;
}

function youtubeVideoId(s: string): string | null {
  const byV = s.match(/[?&]v=([0-9A-Za-z_-]{11})/);
  if (byV) return byV[1];
  const byPath = s.match(
    /(?:youtu\.be\/|\/shorts\/|\/embed\/|\/live\/|\/video\/)([0-9A-Za-z_-]{11})(?![0-9A-Za-z_-])/,
  );
  if (byPath) {
    // embed/live_stream is eleven characters but is not a video ID.
    if (byPath[1].toLowerCase() === "live_stream") return null;
    return byPath[1];
  }
  return null;
}

/** Video IDs stay video IDs; channel handles and IDs keep the form the backend resolves. */
function normYouTube(s: string): string {
  const vid = youtubeVideoId(s);
  if (vid) return vid;

  if (/[?&]list=/i.test(s) || /\/playlist\b/i.test(s)) return "";

  const chParam = s.match(/[?&]channel=(UC[0-9A-Za-z_-]{22})/i);
  if (chParam) return chParam[1];

  const chan = s.match(/\/channel\/(UC[0-9A-Za-z_-]{22})/);
  if (chan) return chan[1];
  const at = s.match(/\/@([^/?#\s]+)/);
  if (at) return "@" + at[1];
  const cUser = s.match(/\/(c|user)\/([^/?#\s]+)/i);
  if (cUser) return `youtube.com/${cUser[1].toLowerCase()}/${cUser[2]}`;

  const stripped = s
    .replace(/^https?:\/\//i, "")
    .replace(/^[^/]*\.youtube\.com\//i, "")
    .replace(/^youtube\.com\//i, "")
    .replace(/^youtu\.be\//i, "")
    .trim();
  const hadAt = stripped.startsWith("@");
  const t = firstSeg(stripped);
  if (!t) return "";
  if (/^UC[0-9A-Za-z_-]{22}$/.test(t)) return t;
  if (hadAt) return "@" + t;
  // Preserve ambiguous eleven-character tokens as video IDs for idempotence; an explicit @ selects a channel.
  if (/^[0-9A-Za-z_-]{11}$/.test(t)) return t;
  return "@" + t;
}

export const youtubeChat: ChatProviderSpec = {
  id: "youtube",
  name: "YouTube",
  color: "#FF0000",
  account: "youtube",
  send: "account",
  bansNeedAuthorId: true,
  repliesNeedNativeId: false,
  copy: {
    channel: "chat.source.value.youtube",
    placeholder: "chat.source.placeholder.youtube",
    hint: "chat.source.hint.youtube",
    error: "chat.status.explain.error.youtube",
    waiting: "chat.status.explain.waiting.youtube",
  },
  normalizeChannel: normYouTube,
};

export const youtubeAccount: AccountProviderSpec = {
  id: "youtube",
  name: "YouTube",
  connect: "auto-broadcast",
  pt: { with: "com o YouTube", of: "do YouTube" },
  readStatus(status) {
    const a = status as AuthStatus & YoutubeStatus;
    return {
      login: a.youtube ? { state: "connected" } : { state: "out" },
      oauthReady: a.youtubeConfigured,
      modes: {
        officialReady: a.youtubeOfficialReady,
        ownCreds: a.youtubeOwnCreds,
        usingOwnCreds: a.youtubeUsingOwnCreds,
      },
    };
  },
};
