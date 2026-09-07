import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { ApiError } from "./api-error";

type Environment = Readonly<Record<string, string | undefined>>;
type Entry = { count: number; resetAt: number };
const MAX_LOCAL_ENTRIES = 10_000;
const SWEEP_INTERVAL_MS = 1_000;

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
  now = () => performance.now(),
  maxEntries = MAX_LOCAL_ENTRIES,
}: {
  now?: () => number;
  maxEntries?: number;
} = {}) {
  if (
    !Number.isSafeInteger(maxEntries) ||
    maxEntries < 1 ||
    maxEntries > MAX_LOCAL_ENTRIES
  )
    throw unavailable();
  const entries = new Map<string, Entry>();
  // Instance-local keys cannot be correlated after restart or across instances.
  const secret = randomBytes(32);
  let nextSweep = 0;
  let lastTimestamp = 0;
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
      typeof key !== "string" ||
      key.length === 0 ||
      key.length > 256
    )
      throw unavailable();
    const timestamp = now();
    if (
      !Number.isFinite(timestamp) ||
      timestamp < lastTimestamp ||
      timestamp + windowMs > Number.MAX_SAFE_INTEGER
    )
      throw unavailable();
    lastTimestamp = timestamp;
    // Request-driven, at most 10,000 visits per second even when saturated.
    // Expired identities remain in idle memory until another eligible request.
    if (timestamp >= nextSweep) {
      for (const [entryKey, entry] of entries)
        if (entry.resetAt <= timestamp) entries.delete(entryKey);
      nextSweep = timestamp + SWEEP_INTERVAL_MS;
    }
    const digest = createHmac("sha256", secret).update(key).digest("hex");
    const current = entries.get(digest);
    // No await between lookup and mutation: concurrent requests share this
    // instance's counter, not a distributed or cross-process limit.
    if (current && current.resetAt > timestamp) {
      if (current.count >= limit) throw limited(current.resetAt - timestamp);
      current.count++;
      return;
    }
    // Never evict active limits to admit a new identity (that enables bypass).
    if (!current && entries.size >= maxEntries) throw unavailable();
    entries.set(digest, { count: 1, resetAt: timestamp + windowMs });
  };
}
