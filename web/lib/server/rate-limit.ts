import "server-only";

import { createRateLimiter } from "./rate-limit-core";

declare global {
  var cornetaOAuthRateLimiter: ReturnType<typeof createRateLimiter> | undefined;
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  const limiter = (globalThis.cornetaOAuthRateLimiter ??= createRateLimiter());
  return limiter(key, limit, windowMs);
}
