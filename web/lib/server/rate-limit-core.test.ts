import { describe, expect, it, vi } from "vitest";
import {
  clientAddress,
  createRateLimiter,
  RATE_LIMIT_SCRIPT,
  rateLimitConfiguration,
} from "./rate-limit-core";

const remoteEnv = {
  NODE_ENV: "production",
  UPSTASH_REDIS_REST_URL: "https://redis.example.test",
  UPSTASH_REDIS_REST_TOKEN: "test-only-token",
  OAUTH_RATE_LIMIT_SALT: "test-only-salt-that-has-at-least-32-characters",
};

describe("OAuth rate limiting", () => {
  it("bounds local memory without discarding active limits and recovers after expiry", async () => {
    let now = 0;
    const limit = createRateLimiter({ env: {}, now: () => now, maxEntries: 2 });
    await limit("a", 1, 1_000);
    await limit("b", 1, 1_000);
    await expect(limit("c", 1, 1_000)).rejects.toMatchObject({ status: 503 });
    await expect(limit("a", 1, 1_000)).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 1,
    });
    now = 1_000;
    await expect(limit("c", 1, 1_000)).resolves.toBeUndefined();
    await expect(limit("a", 1, 1_000)).resolves.toBeUndefined();
  });

  it("fails closed in production or with partially configured remote storage", async () => {
    for (const env of [
      { NODE_ENV: "production" },
      { UPSTASH_REDIS_REST_URL: remoteEnv.UPSTASH_REDIS_REST_URL },
    ]) {
      await expect(
        createRateLimiter({ env })("a", 20, 60_000),
      ).rejects.toMatchObject({ status: 503, code: "RATE_LIMIT_UNAVAILABLE" });
    }
  });

  it.each([
    "http://redis.test",
    "https://secret@redis.test",
    "https://redis.test/path",
    "https://redis.test/?token=secret",
  ])("rejects unsafe REST configuration: %s", (url) => {
    expect(
      rateLimitConfiguration({ ...remoteEnv, UPSTASH_REDIS_REST_URL: url }),
    ).toBeNull();
  });

  it("shares a counter across two independent instances without sending IPs or OAuth tokens", async () => {
    const counts = new Map<string, number>();
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const [command, script, keys, key, max, window] = JSON.parse(
        String(init?.body),
      ) as string[];
      expect([command, script, keys]).toEqual(["EVAL", RATE_LIMIT_SCRIPT, "1"]);
      expect(init?.redirect).toBe("error");
      expect(key).toMatch(/^corneta:oauth:v1:production:[a-f0-9]{64}$/);
      const count = counts.get(key) ?? 0;
      const allowed = count < Number(max);
      if (allowed) counts.set(key, count + 1);
      return Response.json({ result: [allowed ? 1 : 0, Number(window)] });
    });
    const a = createRateLimiter({ env: remoteEnv, fetcher });
    const b = createRateLimiter({ env: remoteEnv, fetcher });
    const results = await Promise.allSettled(
      Array.from({ length: 40 }, (_, i) =>
        (i % 2 ? a : b)("kick:exchange:203.0.113.8", 20, 60_000),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(20);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(20);
    expect(counts.size).toBe(1);
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain("203.0.113.8");
  });

  it.each([
    null,
    { error: "secret upstream error" },
    { result: [1, -1] },
    { result: [2, 60_000] },
    { result: [1, 60_001] },
  ])(
    "rejects invalid Redis replies without exposing the reply",
    async (reply) => {
      const limiter = createRateLimiter({
        env: remoteEnv,
        fetcher: async () => Response.json(reply),
      });
      await expect(limiter("a", 1, 60_000)).rejects.toMatchObject({
        status: 503,
        retryAfterSeconds: 5,
      });
    },
  );

  it("fails closed when storage is unavailable (no local fallback)", async () => {
    const limiter = createRateLimiter({
      env: remoteEnv,
      fetcher: async () => {
        throw new Error("private endpoint");
      },
    });
    await expect(limiter("a", 1, 60_000)).rejects.toMatchObject({
      status: 503,
    });
    await expect(limiter("a", 1, 60_000)).rejects.not.toThrow(
      "private endpoint",
    );
  });
});

describe("trusted client identity", () => {
  const request = (headers: Record<string, string>) =>
    new Request("https://corneta.test", { headers });
  it("does not trust arbitrary forwarding headers by default", () => {
    expect(
      clientAddress(
        request({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "5.6.7.8" }),
        {},
      ),
    ).toBe("unknown");
  });
  it("uses only the trusted edge header on Vercel", () => {
    expect(
      clientAddress(
        request({
          "x-real-ip": "1.2.3.4",
          "x-vercel-forwarded-for": "203.0.113.8",
        }),
        { VERCEL: "1" },
      ),
    ).toBe("203.0.113.8");
  });
  it("rejects ambiguous chains", () => {
    expect(
      clientAddress(request({ "x-real-ip": "1.2.3.4, 5.6.7.8" }), {
        OAUTH_TRUSTED_IP_HEADER: "x-real-ip",
      }),
    ).toBe("unknown");
  });
  it("canonicalizes IPv6 and mapped IPv4", () => {
    const address = (ip: string) =>
      clientAddress(request({ "x-real-ip": ip }), {
        OAUTH_TRUSTED_IP_HEADER: "x-real-ip",
      });
    expect(address("2001:db8::1")).toBe(
      address("2001:0db8:0000:0000:ffff:1:2:3"),
    );
    expect(address("::ffff:192.0.2.128")).toBe(address("192.0.2.128"));
    expect(address("::1")).toBe("0:0:0:0::/64");
    expect(address("fe80::1%eth0")).toBe("unknown");
  });
});
