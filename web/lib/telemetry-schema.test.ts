import { describe, expect, it } from "vitest";
import {
  durationBucket,
  normalizeErrorType,
  normalizePostHogHost,
  redactedException,
  redactPostHogMessage,
  redactTelemetryText,
  redactTelemetryValue,
  sanitizeTelemetryProperties,
  siteRoute,
} from "./telemetry-schema";

describe("telemetry redaction", () => {
  it("remove credenciais, PII, paths e parâmetros de URL", () => {
    const fixture = [
      "Authorization: Bearer abc.def_123",
      "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature",
      "client_secret=super-secret",
      "access_token: token-value",
      "petro@example.com",
      "C:\\Users\\petro\\AppData\\secret.txt:42:3",
      "/home/petro/.config/corneta/token.txt:7",
      "/var/task/.next/server/app/api/route.js:20:4",
      "/app/.next/server/chunks/runtime.js:30:5",
      "/workspace/corneta/web/server.ts:40:6",
      "https://user:pass@example.com/callback?code=secret#fragment",
      "https://api.example.com/custom/customer/123?token=secret",
    ].join("\n");

    const result = redactTelemetryText(fixture);

    expect(result).not.toContain("abc.def_123");
    expect(result).not.toContain("eyJhbGci");
    expect(result).not.toContain("super-secret");
    expect(result).not.toContain("token-value");
    expect(result).not.toContain("petro@example.com");
    expect(result).not.toContain("\\Users\\petro");
    expect(result).not.toContain("/home/petro");
    expect(result).not.toContain("/var/task");
    expect(result).not.toContain("/app/.next");
    expect(result).not.toContain("/workspace/corneta");
    expect(result).not.toContain("user:pass");
    expect(result).not.toContain("?code=");
    expect(result).not.toContain("#fragment");
    expect(result).toContain("https://example.com/<redacted>");
    expect(result).toContain("https://api.example.com/<redacted>");
    expect(result).not.toContain("/custom/customer/123");
  });

  it("redige recursivamente sem alterar o fixture", () => {
    const fixture = {
      safe: "ok",
      nested: {
        token: "must-not-leak",
        details: ["Bearer hidden", { email: "name@example.com" }],
      },
    };
    const before = JSON.stringify(fixture);

    const result = redactTelemetryValue(fixture);

    expect(JSON.stringify(fixture)).toBe(before);
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
    expect(JSON.stringify(result)).not.toContain("hidden");
    expect(JSON.stringify(result)).not.toContain("name@example.com");
  });

  it("redige credenciais serializadas como JSON, inclusive tokens curtos", () => {
    const raw =
      '{"access_token":"hunter2","Authorization":"Bearer short-token","client_secret":"tiny"}';
    const safe = redactTelemetryText(raw);

    expect(safe).not.toContain("hunter2");
    expect(safe).not.toContain("short-token");
    expect(safe).not.toContain("tiny");
    expect(safe).toContain("<redacted>");
  });
});

describe("telemetry catalog", () => {
  it("rejeita evento, surface e propriedade fora do catálogo", () => {
    expect(sanitizeTelemetryProperties("invented", {})).toBeNull();
    expect(
      sanitizeTelemetryProperties("site_page_viewed", {
        surface: "desktop_ui",
        route_id: "home",
        locale: "pt-BR",
      }),
    ).toBeNull();
    expect(
      sanitizeTelemetryProperties("site_page_viewed", {
        surface: "marketing_site",
        route_id: "home",
        locale: "pt-BR",
        free_text: "should not exist",
      }),
    ).toBeNull();
  });

  it("mantém só campos de transporte validados para a ingestão", () => {
    const safe = redactPostHogMessage({
      event: "site_page_viewed",
      properties: {
        surface: "marketing_site",
        route_id: "home",
        locale: "pt-BR",
        token: "phc_12345678",
        distinct_id: "$posthog_cookieless",
        $cookieless_mode: true,
        $process_person_profile: false,
        $geoip_disable: true,
        $current_url: "https://corneta.live/?secret=yes",
      },
    });

    expect(safe?.properties).toMatchObject({
      token: "phc_12345678",
      distinct_id: "$posthog_cookieless",
      $cookieless_mode: true,
      $process_person_profile: false,
      $geoip_disable: true,
    });
    expect(safe?.properties).not.toHaveProperty("$current_url");

    const invalid = redactPostHogMessage({
      event: "site_page_viewed",
      properties: {
        surface: "marketing_site",
        route_id: "home",
        locale: "pt-BR",
        token: "personal-api-key",
        distinct_id: "stable-browser-identifier",
      },
    });
    expect(invalid?.properties).not.toHaveProperty("token");
    expect(invalid?.properties).not.toHaveProperty("distinct_id");

    expect(
      redactPostHogMessage({
        event: "api_request_completed",
        distinctId: "untrusted-free-text",
        properties: {
          surface: "setup_api",
          request_id: "318f95fc-6f70-4cf5-a625-e250e43b1234",
          route_id: "health",
          provider: "none",
          status_class: "5xx",
          duration_bucket: "lt_100ms",
          retryable: true,
          error_code: "INTERNAL_ERROR",
        },
      }),
    ).toBeNull();
  });

  it("reconstrói um envelope mínimo e remove campos top-level livres", () => {
    const timestamp = new Date("2026-08-01T12:00:00.000Z");
    const safe = redactPostHogMessage({
      event: "site_page_viewed",
      uuid: "318f95fc-6f70-4cf5-a625-e250e43b1234",
      timestamp,
      arbitrary: "must-not-leak",
      $set: { email: "person@example.com" },
      properties: {
        surface: "marketing_site",
        route_id: "home",
        locale: "pt-BR",
      },
    });

    expect(safe).toEqual({
      event: "site_page_viewed",
      uuid: "318f95fc-6f70-4cf5-a625-e250e43b1234",
      timestamp,
      properties: expect.objectContaining({
        surface: "marketing_site",
        route_id: "home",
      }),
    });
    expect(JSON.stringify(safe)).not.toContain("must-not-leak");
    expect(JSON.stringify(safe)).not.toContain("person@example.com");
  });

  it("mantém apenas frames seguros de exceção", () => {
    const message = redactPostHogMessage({
      event: "$exception",
      properties: {
        surface: "setup_api",
        error_id: "318f95fc-6f70-4cf5-a625-e250e43b1234",
        route_id: "kick_exchange",
        error_code: "INTERNAL_ERROR",
        $exception_list: [
          {
            type: "CanalSentinela19",
            value: "live privada da Maria",
            stacktrace: {
              frames: [
                {
                  filename:
                    "https://www.corneta.live/_next/app.js?token=secret#x",
                  function: "submit",
                  lineno: 42,
                  colno: 3,
                  vars: { client_secret: "must-not-leak" },
                },
              ],
            },
          },
        ],
      },
    });
    const serialized = JSON.stringify(message);

    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("CanalSentinela19");
    expect(serialized).not.toContain("live privada da Maria");
    expect(serialized).not.toContain("must-not-leak");
    expect(serialized).not.toContain("?token=");
    expect(serialized).not.toContain("#x");
    expect(serialized).not.toContain("vars");
    expect(serialized).toContain("/_next/app.js");
    expect(message?.properties.$exception_list).toEqual([
      expect.objectContaining({
        type: "UnknownError",
        value: "Unexpected error",
      }),
    ]);
  });
});

describe("telemetry normalization", () => {
  it("mantém nomes de exceção em uma dimensão técnica fechada", () => {
    expect(normalizeErrorType("TypeError")).toBe("TypeError");
    expect(normalizeErrorType("AbortError")).toBe("AbortError");

    for (const unsafeName of [
      "CanalSentinela19",
      "live-da-maria",
      "maria@example.com",
      "Bearer secret-token",
      "TypeError ",
      "",
      null,
    ]) {
      expect(normalizeErrorType(unsafeName)).toBe("UnknownError");
    }

    const original = new Error("live privada da Maria para maria@example.com");
    original.name = "CanalSentinela19";
    original.stack =
      "CanalSentinela19: live privada da Maria\n" +
      "    at submit (https://corneta.live/en?account=maria#private:10:2)";
    const safe = redactedException(original, "Unexpected browser error");
    const serialized = JSON.stringify({
      name: safe.name,
      message: safe.message,
      stack: safe.stack,
    });

    expect(safe.name).toBe("UnknownError");
    expect(serialized).not.toContain("CanalSentinela19");
    expect(serialized).not.toContain("live privada da Maria");
    expect(serialized).not.toContain("maria@example.com");
    expect(serialized).not.toContain("account=maria");
  });

  it("aceita somente uma origem PostHog HTTPS pura", () => {
    expect(normalizePostHogHost("https://us.i.posthog.com/")).toBe(
      "https://us.i.posthog.com",
    );
    expect(
      normalizePostHogHost("https://us.i.posthog.com/project/path"),
    ).toBeUndefined();
    expect(
      normalizePostHogHost("https://user:pass@us.i.posthog.com"),
    ).toBeUndefined();
    expect(normalizePostHogHost("http://us.i.posthog.com")).toBeUndefined();
  });

  it("converte URL em rota/idioma sem query nem hash", () => {
    expect(siteRoute("https://corneta.live/?utm_source=private#hero")).toEqual({
      routeId: "home",
      locale: "pt-BR",
    });
    expect(siteRoute("/en/legal/privacy?email=a@b.com#cookies")).toEqual({
      routeId: "privacy",
      locale: "en",
    });
  });

  it("usa buckets determinísticos", () => {
    expect(
      [99, 100, 499, 500, 1_999, 2_000, 9_999, 10_000].map(durationBucket),
    ).toEqual([
      "lt_100ms",
      "100_499ms",
      "100_499ms",
      "500_1999ms",
      "500_1999ms",
      "2_9s",
      "2_9s",
      "gte_10s",
    ]);
  });
});
