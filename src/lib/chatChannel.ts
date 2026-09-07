import type { ChatPlatform } from "./types";

/** Idempotently normalize pasted channel identifiers for each backend. Reject inputs with no recoverable channel. Preserve YouTube video IDs separately from channel handles and IDs. */
export function normalizeChatChannel(
  platform: ChatPlatform,
  raw: string,
): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  switch (platform) {
    case "twitch":
      return normTwitch(s);
    case "kick":
      return normKick(s);
    case "youtube":
      return normYouTube(s);
    case "cinefy":
      return normCinefy(s);
    default:
      return s;
  }
}

function afterHost(s: string, needles: string[]): string {
  const low = s.toLowerCase();
  for (const n of needles) {
    const i = low.indexOf(n);
    if (i >= 0) return s.slice(i + n.length);
  }
  return s;
}

function firstSeg(path: string): string {
  return (path.split(/[/?#]/).find((x) => x.length > 0) ?? "").replace(
    /^@+/,
    "",
  );
}

/** Fold accented characters before stripping non-ASCII characters. */
function foldAscii(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
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

const CINEFY_RESERVED = new Set([
  "creators",
  "login",
  "media",
  "search",
  "shorts",
  "watch",
]);

function normCinefy(s: string): string {
  let t = s.replace(/^https?:\/\//i, "");
  if (/^www\.cinefy\.gg(\/|$)/i.test(t))
    t = t.replace(/^www\.cinefy\.gg\/?/i, "");
  else if (/^cinefy\.gg(\/|$)/i.test(t)) t = t.replace(/^cinefy\.gg\/?/i, "");

  const parts = t.split(/[/?#]/).filter(Boolean);
  let slug = parts[0] ?? "";
  if (slug.toLowerCase() === "popout") slug = parts[1] ?? "";
  if (CINEFY_RESERVED.has(slug.toLowerCase())) return "";
  const clean = foldAscii(slug.replace(/^@+/, ""))
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "");
  return clean.length <= 64 ? clean : "";
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
