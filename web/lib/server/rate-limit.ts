import "server-only";

import { ApiError } from "./http";

type Entry = { count: number; resetAt: number };

declare global {
  var cornetaOAuthRateLimits: Map<string, Entry> | undefined;
}

const entries =
  globalThis.cornetaOAuthRateLimits ??
  (globalThis.cornetaOAuthRateLimits = new Map<string, Entry>());

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = entries.get(key);
  if (!current || current.resetAt <= now) {
    entries.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (current.count >= limit) {
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Muitas tentativas. Aguarde um pouco e tente novamente.",
      true,
    );
  }
  current.count += 1;

  if (entries.size > 10_000) {
    for (const [entryKey, entry] of entries) {
      if (entry.resetAt <= now) entries.delete(entryKey);
    }
  }
}
