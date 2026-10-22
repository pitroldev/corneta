import { chatProvider } from "../platforms";
import type { ChatPlatform } from "./types";

/** Whether two spellings (handle, URL, ID) name the same channel on a platform. */
export function sameChatChannel(
  platform: ChatPlatform,
  a: string,
  b: string,
): boolean {
  const left = normalizeChatChannel(platform, a).toLowerCase();
  return (
    left !== "" && left === normalizeChatChannel(platform, b).toLowerCase()
  );
}

/** Idempotently normalize a pasted channel identifier with its platform's rules; "" when none is recoverable. */
export function normalizeChatChannel(
  platform: ChatPlatform,
  raw: string,
): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const provider = chatProvider(platform);
  return provider ? provider.normalizeChannel(s) : s;
}
