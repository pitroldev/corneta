import { foldAscii } from "../channel";
import type { ChatProviderSpec } from "../types";

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

/** Read-only: chat and audience from cinefy.gg rooms, with no login and no sending. */
export const cinefyChat: ChatProviderSpec = {
  id: "cinefy",
  name: "Cinefy",
  color: "#FFD200",
  icon: "M8 5.14v13.72L19 12 8 5.14z",
  experimental: true,
  repliesNeedNativeId: true,
  maxLength: 480,
  copy: {
    channel: "chat.source.value.cinefy",
    placeholder: "chat.source.placeholder.cinefy",
    hint: "chat.source.hint.cinefy",
    error: "chat.status.explain.error.cinefy",
  },
  normalizeChannel: normCinefy,
};
