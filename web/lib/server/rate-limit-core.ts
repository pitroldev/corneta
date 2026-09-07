import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { ApiError } from "./api-error";
import { readBoundedText } from "./bounded-body";

type Environment = Readonly<Record<string, string | undefined>>;
type Entry = { count: number; resetAt: number };
const MAX_LOCAL_ENTRIES = 10_000;

// Atomic across instances. Denied requests neither extend the window nor grow
// the counter without bounds. TTL is assigned in the same operation as count.
export const RATE_LIMIT_SCRIPT = `
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then
  redis.call('SET', KEYS[1], '1', 'PX', ARGV[2])
  return {1, tonumber(ARGV[2])}
end
if count >= tonumber(ARGV[1]) then return {0, ttl} end
redis.call('INCR', KEYS[1])
return {1, ttl}
`;

function unavailable() {
  return new ApiError(
    503,
    "RATE_LIMIT_UNAVAILABLE",
    "O login está temporariamente indisponível. Tente novamente.",
    true,
    5,
  );
}

function limited(ttlMs: number) {
  return new ApiError(
    429,
    "RATE_LIMITED",
    "Muitas tentativas. Aguarde um pouco e tente novamente.",
    true,
    Math.max(1, Math.ceil(ttlMs / 1_000)),
  );
}

export function rateLimitConfiguration(env: Environment) {
  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  const salt = env.OAUTH_RATE_LIMIT_SALT?.trim();
  if (!url || !token || !salt || salt.length < 32) return null;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== "/"
    )
      return null;
    return { url: parsed.origin, token, salt };
  } catch {
    return null;
  }
}

export function clientAddress(
  request: Request,
  env: Environment = process.env,
) {
  // Vercel overwrites this header at its edge. A self-hosted reverse proxy must
  // explicitly opt in AND overwrite the selected header, never append to it.
  const header =
    env.VERCEL === "1"
      ? "x-vercel-forwarded-for"
      : env.OAUTH_TRUSTED_IP_HEADER?.trim().toLowerCase();
  if (!header || !/^[a-z0-9-]+$/.test(header)) return "unknown";
  const raw = request.headers.get(header)?.trim();
  if (!raw || raw.length > 64 || raw.includes("%") || !isIP(raw))
    return "unknown";
  if (isIP(raw) === 4) return raw;
  const canonical = new URL(`http://[${raw}]`).hostname.slice(1, -1);
  const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(canonical);
  if (mapped) {
    const high = parseInt(mapped[1], 16);
    const low = parseInt(mapped[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  // Group IPv6 by /64 to avoid bypassing by rotating host addresses.
  const [left, right = ""] = canonical.split("::");
  const prefix = left ? left.split(":") : [];
  const suffix = right ? right.split(":") : [];
  const groups = canonical.includes("::")
    ? [
        ...prefix,
        ...Array(8 - prefix.length - suffix.length).fill("0"),
        ...suffix,
      ]
    : prefix;
  return `${groups.slice(0, 4).join(":")}::/64`;
}

export function createRateLimiter({
  env = process.env,
  fetcher = fetch,
  now = Date.now,
  maxEntries = MAX_LOCAL_ENTRIES,
}: {
  env?: Environment;
  fetcher?: typeof fetch;
  now?: () => number;
  maxEntries?: number;
} = {}) {
  const entries = new Map<string, Entry>();
  const config = rateLimitConfiguration(env);
  const hasRemoteConfig = Boolean(
    env.UPSTASH_REDIS_REST_URL ||
    env.UPSTASH_REDIS_REST_TOKEN ||
    env.OAUTH_RATE_LIMIT_SALT,
  );
  let nextSweep = 0;
  return async (
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<void> => {
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      !Number.isSafeInteger(windowMs) ||
      windowMs < 1 ||
      key.length > 256
    )
      throw unavailable();
    if (config) {
      try {
        const digest = createHmac("sha256", config.salt)
          .update(key)
          .digest("hex");
        const namespace =
          env.VERCEL_ENV === "preview"
            ? "preview"
            : env.NODE_ENV === "production"
              ? "production"
              : "development";
        const response = await fetcher(config.url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([
            "EVAL",
            RATE_LIMIT_SCRIPT,
            "1",
            `corneta:oauth:v1:${namespace}:${digest}`,
            String(limit),
            String(windowMs),
          ]),
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(2_000),
        });
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          throw unavailable();
        }
        const payload: unknown = JSON.parse(
          await readBoundedText(response.body, 1_024, 2_000),
        );
        if (!payload || typeof payload !== "object" || !("result" in payload))
          throw unavailable();
        const result = payload.result;
        if (
          !Array.isArray(result) ||
          result.length !== 2 ||
          (result[0] !== 0 && result[0] !== 1) ||
          !Number.isSafeInteger(result[1]) ||
          result[1] < 0 ||
          result[1] > windowMs
        )
          throw unavailable();
        if (result[0] === 0) throw limited(result[1]);
        return;
      } catch (error) {
        if (error instanceof ApiError && error.status === 429) throw error;
        throw unavailable();
      }
    }
    // No fallback in production: an outage must not remove protection.
    if (env.NODE_ENV === "production" || hasRemoteConfig) throw unavailable();
    const timestamp = now();
    if (timestamp >= nextSweep) {
      for (const [entryKey, entry] of entries)
        if (entry.resetAt <= timestamp) entries.delete(entryKey);
      nextSweep = timestamp + 1_000;
    }
    const current = entries.get(key);
    if (current && current.resetAt > timestamp) {
      if (current.count >= limit) throw limited(current.resetAt - timestamp);
      current.count++;
      return;
    }
    // Never evict active limits to admit a new identity (that enables bypass).
    if (!current && entries.size >= maxEntries) throw unavailable();
    entries.set(key, { count: 1, resetAt: timestamp + windowMs });
  };
}
