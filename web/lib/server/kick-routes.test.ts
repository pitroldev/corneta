import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("./posthog", () => ({ reportApiFailure: vi.fn() }));

import { after } from "next/server";
import { POST as exchange } from "../../app/api/v1/oauth/kick/exchange/route";
import { POST as refresh } from "../../app/api/v1/oauth/kick/refresh/route";
import { reportApiFailure } from "./posthog";
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

const PROVIDER_DETAIL = "provider-detail-sentinel";
const CREDENTIALS = [
  exchangeBody.code,
  exchangeBody.codeVerifier,
  refreshBody.refreshToken,
  "test-client-secret",
];
const send = {
  exchange: () => exchange(request("exchange", exchangeBody)),
  refresh: () => refresh(request("refresh", refreshBody)),
};
type ExpectedError = {
  status: number;
  code: string;
  message: string;
  retryable: boolean;
};

const loginRejected = (status: number): ExpectedError => ({
  status,
  code: "PROVIDER_REJECTED_REQUEST",
  message: "A Kick recusou a conclusão do login.",
  retryable: false,
});
const sessionExpired: ExpectedError = {
  status: 401,
  code: "OAUTH_SESSION_EXPIRED",
  message: "A sessão da Kick expirou. Entre novamente.",
  retryable: false,
};
const refreshRejected: ExpectedError = {
  status: 502,
  code: "PROVIDER_REJECTED_REQUEST",
  message: "A Kick recusou a renovação.",
  retryable: true,
};
const unreadableReply: ExpectedError = {
  status: 502,
  code: "INVALID_PROVIDER_RESPONSE",
  message: "O provedor retornou uma resposta inválida.",
  retryable: true,
};
const notConfigured: ExpectedError = {
  status: 503,
  code: "OAUTH_NOT_CONFIGURED",
  message: "Kick OAuth ainda não está configurado no servidor.",
  retryable: false,
};

// OAuth error descriptions can echo request data back to the caller.
function providerError(status: number, error: string) {
  return Response.json(
    { error, error_description: `${PROVIDER_DETAIL} ${CREDENTIALS.join(" ")}` },
    { status },
  );
}

const CONSOLE_METHODS = ["debug", "error", "info", "log", "warn"] as const;

function consoleCalls() {
  return CONSOLE_METHODS.flatMap(
    (method) => vi.mocked(console[method]).mock.calls,
  );
}

async function reportedFailures() {
  for (const [task] of vi.mocked(after).mock.calls)
    await (typeof task === "function" ? task() : task);
  return vi.mocked(reportApiFailure).mock.calls.map(([failure]) => failure);
}

async function expectSanitizedError(
  response: Response,
  route: keyof typeof send,
  expected: ExpectedError,
) {
  const text = await response.text();
  const requestId = response.headers.get("x-request-id");
  expect(response.status).toBe(expected.status);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(JSON.parse(text)).toEqual({
    error: {
      code: expected.code,
      message: expected.message,
      retryable: expected.retryable,
      requestId,
    },
  });
  for (const secret of [...CREDENTIALS, PROVIDER_DETAIL])
    expect(text).not.toContain(secret);
  expect(consoleCalls()).toEqual([]);
  expect(await reportedFailures()).toEqual([
    {
      context: expect.objectContaining({
        requestId,
        routeId: `kick_${route}`,
        provider: "kick",
      }),
      status: expected.status,
      retryable: expected.retryable,
      errorCode: expected.code,
    },
  ]);
}

describe("Kick OAuth provider failures", () => {
  beforeEach(() => {
    vi.mocked(after).mockClear();
    vi.mocked(reportApiFailure).mockClear();
    for (const method of CONSOLE_METHODS)
      vi.spyOn(console, method).mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    { status: 400, error: "invalid_grant" },
    { status: 401, error: "invalid_token" },
  ])(
    "maps refresh $error ($status) to the re-login response",
    async ({ status, error }) => {
      fetcher.mockResolvedValueOnce(providerError(status, error));
      await expectSanitizedError(
        await send.refresh(),
        "refresh",
        sessionExpired,
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  // The desktop deletes the stored session on any 400/401 from refresh, so these must stay 5xx.
  it.each([
    { status: 400, error: "invalid_request" },
    { status: 500, error: "server_error" },
    { status: 503, error: "temporarily_unavailable" },
  ])(
    "keeps the session retryable on refresh $error ($status)",
    async ({ status, error }) => {
      fetcher.mockResolvedValueOnce(providerError(status, error));
      await expectSanitizedError(
        await send.refresh(),
        "refresh",
        refreshRejected,
      );
    },
  );

  it.each([
    { status: 400, error: "invalid_grant", expected: loginRejected(400) },
    { status: 401, error: "invalid_client", expected: loginRejected(502) },
    { status: 500, error: "server_error", expected: loginRejected(502) },
    {
      status: 503,
      error: "temporarily_unavailable",
      expected: loginRejected(502),
    },
  ])(
    "rejects the login on exchange $error ($status) with HTTP $expected.status",
    async ({ status, error, expected }) => {
      fetcher.mockResolvedValueOnce(providerError(status, error));
      await expectSanitizedError(await send.exchange(), "exchange", expected);
    },
  );

  it.each(["exchange", "refresh"] as const)(
    "treats an unreadable provider error page on %s as an invalid reply",
    async (route) => {
      fetcher.mockResolvedValueOnce(
        new Response(`<h1>Bad gateway</h1><p>${PROVIDER_DETAIL}</p>`, {
          status: 502,
          headers: { "content-type": "text/html" },
        }),
      );
      await expectSanitizedError(await send[route](), route, unreadableReply);
    },
  );

  it.each([
    { route: "exchange", missing: "KICK_CLIENT_ID" },
    { route: "exchange", missing: "KICK_CLIENT_SECRET" },
    { route: "refresh", missing: "KICK_CLIENT_ID" },
    { route: "refresh", missing: "KICK_CLIENT_SECRET" },
  ] as const)(
    "answers $route with OAUTH_NOT_CONFIGURED when the server lacks $missing",
    async ({ route, missing }) => {
      vi.stubEnv("VITE_KICK_CLIENT_ID", undefined);
      vi.stubEnv(missing, undefined);
      await expectSanitizedError(await send[route](), route, notConfigured);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("answers an unexpected failure with a generic body and a redacted log", async () => {
    globalThis.cornetaOAuthRateLimiter = async () => {
      throw new Error(`limiter failed for ${CREDENTIALS.join(" ")}`);
    };
    const response = await send.refresh();
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Não foi possível concluir a operação.",
        retryable: true,
        requestId: response.headers.get("x-request-id"),
      },
    });
    expect(consoleCalls()).toHaveLength(1);
    const logged = inspect(consoleCalls(), { depth: null });
    for (const secret of CREDENTIALS) {
      expect(text).not.toContain(secret);
      expect(logged).not.toContain(secret);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});
