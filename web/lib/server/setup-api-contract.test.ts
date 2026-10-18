import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("./posthog", () => ({ reportApiFailure: vi.fn() }));

import { GET as bootstrap } from "../../app/api/v1/bootstrap/route";
import { GET as health } from "../../app/api/v1/health/route";

const REQUEST_ID = "5b0f6d3e-8c4a-4f1e-9a2b-7c6d5e4f3a21";
const RELEASE_SHA = "0123456789abcdef0123456789abcdef01234567";
const PROJECT_TOKEN = "phc_synthetic_setup_api_token";
const KICK_CLIENT_ID = "synthetic-kick-client-id";
const KICK_SECRET = "synthetic-kick-client-secret";

function stubEnv(values: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}

function stubOAuthEnv(values: Record<string, string | undefined>) {
  stubEnv({
    TWITCH_CLIENT_ID: undefined,
    VITE_TWITCH_CLIENT_ID: undefined,
    GOOGLE_CLIENT_ID: undefined,
    YOUTUBE_CLIENT_ID: undefined,
    VITE_GOOGLE_CLIENT_ID: undefined,
    KICK_CLIENT_ID: undefined,
    VITE_KICK_CLIENT_ID: undefined,
    KICK_CLIENT_SECRET: undefined,
    ...values,
  });
}

function get(path: string) {
  return new Request(`https://www.corneta.live/api/v1/${path}`);
}

async function contract(response: Response) {
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: await response.json(),
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: Date.UTC(2026, 9, 18, 12), toFake: ["Date"] });
  vi.spyOn(crypto, "randomUUID").mockReturnValue(REQUEST_ID);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/v1/bootstrap", () => {
  it("publishes each provider's public client ID and login flow", async () => {
    stubOAuthEnv({
      TWITCH_CLIENT_ID: "synthetic-twitch-client-id",
      GOOGLE_CLIENT_ID: "synthetic-google-client-id",
      KICK_CLIENT_ID,
      KICK_CLIENT_SECRET: KICK_SECRET,
    });
    const response = await contract(bootstrap(get("bootstrap")));
    expect(JSON.stringify(response)).not.toContain(KICK_SECRET);
    expect(response).toMatchInlineSnapshot(`
      {
        "body": {
          "providers": {
            "kick": {
              "clientId": "synthetic-kick-client-id",
              "enabled": true,
              "flow": "brokered-pkce",
            },
            "twitch": {
              "clientId": "synthetic-twitch-client-id",
              "enabled": true,
              "flow": "direct-device",
            },
            "youtube": {
              "clientId": "synthetic-google-client-id",
              "enabled": true,
              "flow": "direct-pkce",
            },
          },
          "schemaVersion": 1,
        },
        "headers": {
          "cache-control": "no-store, max-age=0",
          "content-type": "application/json",
          "pragma": "no-cache",
          "x-content-type-options": "nosniff",
          "x-request-id": "5b0f6d3e-8c4a-4f1e-9a2b-7c6d5e4f3a21",
        },
        "status": 200,
      }
    `);
  });

  it.each([
    { configured: "no OAuth credentials", env: {}, clientId: null },
    {
      configured: "the Kick client ID only",
      env: { KICK_CLIENT_ID },
      clientId: KICK_CLIENT_ID,
    },
    {
      configured: "the Kick client secret only",
      env: { KICK_CLIENT_SECRET: KICK_SECRET },
      clientId: null,
    },
  ])(
    "keeps the Kick broker disabled when the server has $configured",
    async ({ env, clientId }) => {
      stubOAuthEnv(env);
      const body = await bootstrap(get("bootstrap")).json();
      expect(body.providers.kick).toEqual({
        enabled: false,
        clientId,
        flow: "brokered-pkce",
      });
      expect(JSON.stringify(body)).not.toContain(KICK_SECRET);
    },
  );
});

// scripts/telemetry-release-gate.mjs compares telemetryDeployment with every release.
describe("GET /api/v1/health", () => {
  it("reports the deployed telemetry metadata without raw tokens", async () => {
    stubEnv({
      NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: PROJECT_TOKEN,
      NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
      NEXT_PUBLIC_BUILD_SHA: RELEASE_SHA,
      NEXT_PUBLIC_TELEMETRY_DISABLED: "0",
      POSTHOG_PROJECT_TOKEN: PROJECT_TOKEN,
      POSTHOG_HOST: "https://us.i.posthog.com",
      BUILD_SHA: RELEASE_SHA,
      VERCEL_GIT_COMMIT_SHA: undefined,
      TELEMETRY_DISABLED: "0",
    });
    const response = await contract(health(get("health")));
    expect(JSON.stringify(response)).not.toContain(PROJECT_TOKEN);
    // A literal hash would read as a credential to the secret scanner, so compare it computed.
    const tokenHash = createHash("sha256").update(PROJECT_TOKEN).digest("hex");
    const deployment = response.body.telemetryDeployment;
    expect(deployment.site.projectTokenSha256).toBe(tokenHash);
    expect(deployment.setupApi.projectTokenSha256).toBe(tokenHash);
    expect(response).toMatchInlineSnapshot(
      {
        body: {
          telemetryDeployment: {
            setupApi: { projectTokenSha256: expect.any(String) },
            site: { projectTokenSha256: expect.any(String) },
          },
        },
      },
      `
      {
        "body": {
          "status": "ok",
          "telemetryDeployment": {
            "schemaVersion": 1,
            "setupApi": {
              "buildSha": "0123456789abcdef0123456789abcdef01234567",
              "disabled": false,
              "posthogHost": "https://us.i.posthog.com",
              "projectTokenSha256": Any<String>,
            },
            "site": {
              "buildSha": "0123456789abcdef0123456789abcdef01234567",
              "disabled": false,
              "posthogHost": "https://us.i.posthog.com",
              "projectTokenSha256": Any<String>,
            },
          },
        },
        "headers": {
          "cache-control": "no-store, max-age=0",
          "content-type": "application/json",
          "pragma": "no-cache",
          "x-content-type-options": "nosniff",
          "x-request-id": "5b0f6d3e-8c4a-4f1e-9a2b-7c6d5e4f3a21",
        },
        "status": 200,
      }
    `,
    );
  });
});
