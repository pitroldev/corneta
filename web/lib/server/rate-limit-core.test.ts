import { afterEach, describe, expect, it, vi } from "vitest";
import { clientAddress, createRateLimiter } from "./rate-limit-core";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const unavailable = {
  status: 503,
  code: "RATE_LIMIT_UNAVAILABLE",
  retryable: true,
  retryAfterSeconds: 5,
};

function burst(
  limiter: ReturnType<typeof createRateLimiter>,
  key: string,
  limit: number,
  count: number,
) {
  return Promise.allSettled(
    Array.from({ length: count }, () => limiter(key, limit, 60_000)),
  );
}

describe("OAuth rate limiting", () => {
  it("bounds local memory without discarding active limits and recovers after expiry", async () => {
    let now = 0;
    const limit = createRateLimiter({ now: () => now, maxEntries: 2 });
    await limit("a", 1, 1_000);
    await limit("b", 1, 1_000);
    await expect(limit("c", 1, 1_000)).rejects.toMatchObject(unavailable);
    await expect(limit("a", 1, 1_000)).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 1,
    });
    now = 1_000;
    await expect(limit("c", 1, 1_000)).resolves.toBeUndefined();
    await expect(limit("a", 1, 1_000)).resolves.toBeUndefined();
  });

  it.each(["production", "development"])(
    "limits %s requests without infrastructure configuration or network I/O",
    async (environment) => {
      vi.stubEnv("NODE_ENV", environment);
      const fetcher = vi.fn(() => {
        throw new Error("Network access must not be used");
      });
      vi.stubGlobal("fetch", fetcher);
      const limit = createRateLimiter();
      await expect(limit("a", 1, 60_000)).resolves.toBeUndefined();
      await expect(limit("a", 1, 60_000)).rejects.toMatchObject({
        status: 429,
        code: "RATE_LIMITED",
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["kick:exchange:203.0.113.8", 20],
    ["kick:refresh:203.0.113.8", 60],
  ])("enforces %s's %i-request limit under concurrency", async (key, limit) => {
    const results = await burst(
      createRateLimiter({ now: () => 0 }),
      key,
      limit,
      limit * 2,
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(limit);
    const denied = results.filter((r) => r.status === "rejected");
    expect(denied).toHaveLength(limit);
    for (const result of denied)
      expect(result.reason).toMatchObject({
        status: 429,
        code: "RATE_LIMITED",
        retryable: true,
        retryAfterSeconds: 60,
      });
  });

  it("keeps exchange and refresh budgets independent for the same address", async () => {
    const limit = createRateLimiter({ now: () => 0 });
    await burst(limit, "kick:exchange:203.0.113.8", 20, 20);
    await expect(
      limit("kick:exchange:203.0.113.8", 20, 60_000),
    ).rejects.toMatchObject({ status: 429 });
    const refresh = await burst(limit, "kick:refresh:203.0.113.8", 60, 60);
    expect(refresh.every((r) => r.status === "fulfilled")).toBe(true);
  });

  it("does not claim a global quota across independent instances", async () => {
    const a = createRateLimiter({ now: () => 0 });
    const b = createRateLimiter({ now: () => 0 });
    const [first, second] = await Promise.all([
      burst(a, "same-client", 20, 40),
      burst(b, "same-client", 20, 40),
    ]);
    for (const result of [first, second])
      expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(20);
  });

  it("stores only instance-specific digests, not address-bearing keys", async () => {
    const a = createRateLimiter({ now: () => 0 });
    const b = createRateLimiter({ now: () => 0 });
    const storage = vi.spyOn(Map.prototype, "set");
    const first = a("kick:exchange:203.0.113.8", 20, 60_000);
    const second = b("kick:exchange:203.0.113.8", 20, 60_000);
    const written = storage.mock.calls.filter(
      ([, value]) =>
        value &&
        typeof value === "object" &&
        "count" in value &&
        "resetAt" in value,
    );
    storage.mockRestore();
    await Promise.all([first, second]);
    expect(written).toHaveLength(2);
    expect(written.map(([key]) => key)).toEqual([
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.stringMatching(/^[a-f0-9]{64}$/),
    ]);
    expect(written[0][0]).not.toBe(written[1][0]);
    expect(JSON.stringify(written)).not.toContain("203.0.113.8");
  });

  it("does not extend fixed windows on accepted or denied requests", async () => {
    let now = 100;
    const limit = createRateLimiter({ now: () => now });
    await limit("a", 2, 2_000);
    now = 1_000;
    await limit("a", 2, 2_000);
    now = 1_100;
    await expect(limit("a", 2, 2_000)).rejects.toMatchObject({
      retryAfterSeconds: 1,
    });
    now = 2_099.5;
    await expect(limit("a", 2, 2_000)).rejects.toMatchObject({
      retryAfterSeconds: 1,
    });
    now = 2_100;
    await expect(limit("a", 2, 2_000)).resolves.toBeUndefined();
  });

  it("rounds Retry-After up instead of allowing an early retry", async () => {
    let now = 0;
    const limit = createRateLimiter({ now: () => now });
    await limit("a", 1, 1_001);
    await expect(limit("a", 1, 1_001)).rejects.toMatchObject({
      retryAfterSeconds: 2,
    });
    now = 1;
    await expect(limit("a", 1, 1_001)).rejects.toMatchObject({
      retryAfterSeconds: 1,
    });
  });

  it("reuses an expired identity without waiting for another sweep", async () => {
    let now = 0;
    const limit = createRateLimiter({ now: () => now, maxEntries: 1 });
    await limit("a", 1, 50);
    now = 50;
    await expect(limit("a", 1, 50)).resolves.toBeUndefined();
  });

  it("bounds saturated cleanup work and frees expired capacity at the next sweep", async () => {
    let now = 0;
    const limit = createRateLimiter({ now: () => now, maxEntries: 1 });
    await limit("a", 1, 50);
    now = 50;
    await expect(limit("b", 1, 50)).rejects.toMatchObject(unavailable);
    now = 999;
    await expect(limit("b", 1, 50)).rejects.toMatchObject(unavailable);
    now = 1_000;
    await expect(limit("b", 1, 50)).resolves.toBeUndefined();
  });

  it("reclaims expired identities on the next request after idle time", async () => {
    let now = 0;
    const limit = createRateLimiter({ now: () => now, maxEntries: 2 });
    await limit("a", 1, 60_000);
    await limit("b", 1, 60_000);
    now = 3_600_000;
    await expect(limit("c", 1, 60_000)).resolves.toBeUndefined();
    await expect(limit("d", 1, 60_000)).resolves.toBeUndefined();
    await expect(limit("e", 1, 60_000)).rejects.toMatchObject(unavailable);
  });

  it("caps the default table at 10,000 identities without evicting active limits", async () => {
    const limit = createRateLimiter({ now: () => 0 });
    for (let index = 0; index < 10_000; index++)
      await limit(`client-${index}`, 1, 60_000);
    await expect(limit("another-client", 1, 60_000)).rejects.toMatchObject(
      unavailable,
    );
    await expect(limit("client-0", 1, 60_000)).rejects.toMatchObject({
      status: 429,
    });
  });

  it("uses monotonic time instead of wall-clock changes", async () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(100);
    const wallClock = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const limit = createRateLimiter();
    await limit("a", 1, 1_000);
    wallClock.mockReturnValue(1_000_000_000);
    clock.mockReturnValue(101);
    await expect(limit("a", 1, 1_000)).rejects.toMatchObject({ status: 429 });
    clock.mockReturnValue(1_100);
    await expect(limit("a", 1, 1_000)).resolves.toBeUndefined();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 10_001])(
    "rejects invalid table capacity %s",
    (maxEntries) => expect(() => createRateLimiter({ maxEntries })).toThrow(),
  );

  it.each([
    ["", 1, 1_000],
    ["a".repeat(257), 1, 1_000],
    [null, 1, 1_000],
    ["a", 0, 1_000],
    ["a", -1, 1_000],
    ["a", 1.5, 1_000],
    ["a", Number.MAX_SAFE_INTEGER + 1, 1_000],
    ["a", 1, 0],
    ["a", 1, -1],
    ["a", 1, 1.5],
    ["a", 1, Number.POSITIVE_INFINITY],
  ])("rejects invalid budget inputs (%s, %s, %s)", async (key, max, window) => {
    const limit = createRateLimiter({ now: () => 0, maxEntries: 1 });
    await expect(limit(key as string, max, window)).rejects.toMatchObject(
      unavailable,
    );
    await expect(limit("valid", 1, 1_000)).resolves.toBeUndefined();
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER])(
    "rejects unsafe clock values %s without consuming capacity",
    async (time) => {
      let now = time;
      const limit = createRateLimiter({ now: () => now, maxEntries: 1 });
      await expect(limit("a", 1, 1_000)).rejects.toMatchObject(unavailable);
      now = 0;
      await expect(limit("b", 1, 1_000)).resolves.toBeUndefined();
    },
  );

  it("rejects a regressing injected clock without resetting a counter", async () => {
    let now = 100;
    const limit = createRateLimiter({ now: () => now });
    await limit("a", 1, 1_000);
    now = 99;
    await expect(limit("a", 1, 1_000)).rejects.toMatchObject(unavailable);
    now = 100;
    await expect(limit("a", 1, 1_000)).rejects.toMatchObject({ status: 429 });
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

  it("does not let forged headers create separate fallback quotas", async () => {
    const limit = createRateLimiter({ now: () => 0 });
    const first = clientAddress(request({ "x-forwarded-for": "203.0.113.1" }), {
      VERCEL: "1",
    });
    const second = clientAddress(request({ "x-real-ip": "203.0.113.2" }), {
      VERCEL: "1",
    });
    expect(first).toBe("unknown");
    expect(second).toBe(first);
    await limit(`kick:exchange:${first}`, 1, 60_000);
    await expect(
      limit(`kick:exchange:${second}`, 1, 60_000),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("shares the rate limit for hosts in one IPv6 subnet", async () => {
    const limit = createRateLimiter({ now: () => 0 });
    const address = (ip: string) =>
      clientAddress(request({ "x-real-ip": ip }), {
        OAUTH_TRUSTED_IP_HEADER: "x-real-ip",
      });
    await limit(`kick:exchange:${address("2001:db8::1")}`, 1, 60_000);
    await expect(
      limit(`kick:exchange:${address("2001:db8::ffff")}`, 1, 60_000),
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      limit(`kick:exchange:${address("2001:db8:0:1::1")}`, 1, 60_000),
    ).resolves.toBeUndefined();
  });
});
