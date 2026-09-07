import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("./posthog", () => ({ reportApiFailure: vi.fn() }));

import { POST as exchange } from "../../app/api/v1/oauth/kick/exchange/route";
import { POST as refresh } from "../../app/api/v1/oauth/kick/refresh/route";
import { createRateLimiter } from "./rate-limit-core";

const exchangeBody = {
  code: "test-authorization-code",
  codeVerifier: "v".repeat(43),
  redirectUri: "http://localhost:7395/callback",
};
const refreshBody = { refreshToken: "test-refresh-token" };
const providerTokens = {
  access_token: "test-access-token",
  refresh_token: "test-new-refresh-token",
  expires_in: 3_600,
};
const routes = [
  {
    name: "exchange",
    handler: exchange,
    body: exchangeBody,
    grant: "authorization_code",
    limit: 20,
  },
  {
    name: "refresh",
    handler: refresh,
    body: refreshBody,
    grant: "refresh_token",
    limit: 60,
  },
];
const fetcher = vi.fn<typeof fetch>();
let previousLimiter: typeof globalThis.cornetaOAuthRateLimiter;

function request(name: string, body: unknown) {
  return new Request(`https://corneta.test/api/v1/oauth/kick/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vercel-forwarded-for": "203.0.113.8",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  previousLimiter = globalThis.cornetaOAuthRateLimiter;
  globalThis.cornetaOAuthRateLimiter = undefined;
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("KICK_CLIENT_ID", "test-client-id");
  vi.stubEnv("KICK_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("KICK_REDIRECT_URIS", exchangeBody.redirectUri);
  fetcher.mockReset();
  fetcher.mockImplementation(async () => Response.json(providerTokens));
  vi.stubGlobal("fetch", fetcher);
});

afterEach(() => {
  globalThis.cornetaOAuthRateLimiter = previousLimiter;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Kick OAuth routes with instance-local rate limits", () => {
  it.each(routes)(
    "$name works in production with only a provider request and no storage configuration",
    async ({ name, handler, body, grant }) => {
      const response = await handler(request(name, body));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        accessToken: providerTokens.access_token,
        refreshToken: providerTokens.refresh_token,
        expiresIn: providerTokens.expires_in,
      });
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("x-request-id")).toBeTruthy();
      expect(fetcher).toHaveBeenCalledTimes(1);
      const [url, init] = fetcher.mock.calls[0];
      expect(url).toBe("https://id.kick.com/oauth/token");
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("error");
      const form = new URLSearchParams(String(init?.body));
      expect(form.get("grant_type")).toBe(grant);
      expect(form.get("client_id")).toBe("test-client-id");
      expect(form.get("client_secret")).toBe("test-client-secret");
      if (name === "exchange") {
        expect(form.get("code_verifier")).toBe(exchangeBody.codeVerifier);
        expect(form.get("redirect_uri")).toBe(exchangeBody.redirectUri);
        expect(form.get("code")).toBe(exchangeBody.code);
      } else {
        expect(form.get("refresh_token")).toBe(refreshBody.refreshToken);
      }
    },
  );

  it("enforces independent exchange and refresh limits under concurrent requests", async () => {
    globalThis.cornetaOAuthRateLimiter = createRateLimiter({ now: () => 0 });
    const results = await Promise.all(
      routes.map(async ({ name, handler, body, limit }) => ({
        limit,
        responses: await Promise.all(
          Array.from({ length: limit + 1 }, () => handler(request(name, body))),
        ),
      })),
    );
    for (const { limit, responses } of results) {
      expect(
        responses.filter((response) => response.status === 200),
      ).toHaveLength(limit);
      const denied = responses.filter((response) => response.status === 429);
      expect(denied).toHaveLength(1);
      expect(denied[0].headers.get("retry-after")).toBe("60");
      expect(denied[0].headers.get("cache-control")).toContain("no-store");
      expect(denied[0].headers.get("x-request-id")).toBeTruthy();
      expect(await denied[0].json()).toMatchObject({
        error: { code: "RATE_LIMITED", retryable: true },
      });
    }
    expect(fetcher).toHaveBeenCalledTimes(80);
    expect(
      fetcher.mock.calls.every(
        ([url]) => url === "https://id.kick.com/oauth/token",
      ),
    ).toBe(true);
  });

  it.each([
    { body: { ...exchangeBody, codeVerifier: "short" }, code: "INVALID_PKCE" },
    {
      body: { ...exchangeBody, redirectUri: "https://untrusted.test/callback" },
      code: "INVALID_REDIRECT_URI",
    },
  ])(
    "preserves $code validation and counts rejected attempts",
    async ({ body, code }) => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const response = await exchange(request("exchange", body));
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: { code } });
      }
      const denied = await exchange(request("exchange", exchangeBody));
      expect(denied.status).toBe(429);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("rejects excess identities at capacity without dropping an existing counter", async () => {
    globalThis.cornetaOAuthRateLimiter = createRateLimiter({
      now: () => 0,
      maxEntries: 1,
    });
    expect((await exchange(request("exchange", exchangeBody))).status).toBe(
      200,
    );
    const unavailable = await refresh(request("refresh", refreshBody));
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("retry-after")).toBe("5");
    expect(await unavailable.json()).toMatchObject({
      error: { code: "RATE_LIMIT_UNAVAILABLE", retryable: true },
    });
    expect((await exchange(request("exchange", exchangeBody))).status).toBe(
      200,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
