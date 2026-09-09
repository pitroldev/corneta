import { describe, expect, it } from "vitest";
import {
  TELEMETRY_GUARD_VALUE,
  TELEMETRY_NOTICE_VERSION,
  TELEMETRY_SCHEMA_VERSION,
  countBucket,
  durationBucket,
  fpsBucket,
  needsTelemetryDecision,
  telemetryPurposeActive,
  normalizeTelemetryExceptionName,
  normalizeTelemetryStatus,
  redactTelemetryText,
  resolutionBucket,
  sanitizePostHogEvent,
  sanitizeExceptionProperties,
  sanitizeTelemetryProperties,
  telemetryConsentDraft,
  telemetryConsentChange,
  type TelemetryContext,
} from "./telemetry-schema";

const context: TelemetryContext = {
  telemetry_schema_version: TELEMETRY_SCHEMA_VERSION,
  surface: "desktop_ui",
  environment: "development",
  app_version: "0.6.0",
  build_sha: "abc123",
  locale: "pt-BR",
  os_family: "windows",
};

describe("telemetry schema", () => {
  it("shows the notice with the effective preference state", () => {
    const base: Parameters<typeof telemetryConsentDraft>[0] = {
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      noticeVersion: TELEMETRY_NOTICE_VERSION,
      usage: "unset",
      crashReports: "unset",
      installationId: "00000000-0000-4000-8000-000000000001",
      decidedAt: null,
    };
    expect(needsTelemetryDecision(base)).toBe(true);
    expect(telemetryConsentDraft(base)).toEqual({
      usage: false,
      crashReports: true,
    });
  });

  it("shows the notice on a fresh installation to disclose separate defaults", () => {
    expect(
      needsTelemetryDecision({
        schemaVersion: TELEMETRY_SCHEMA_VERSION,
        noticeVersion: TELEMETRY_NOTICE_VERSION,
        usage: "unset",
        crashReports: "unset",
        installationId: "00000000-0000-4000-8000-000000000001",
        decidedAt: null,
      }),
    ).toBe(true);
  });

  it("stops showing the notice after a decision", () => {
    expect(
      needsTelemetryDecision({
        schemaVersion: TELEMETRY_SCHEMA_VERSION,
        noticeVersion: TELEMETRY_NOTICE_VERSION,
        usage: "enabled",
        crashReports: "disabled",
        installationId: "00000000-0000-4000-8000-000000000001",
        decidedAt: "2026-08-02T12:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("preserves opposition across notice versions", () => {
    const opposed: Parameters<typeof telemetryConsentDraft>[0] = {
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      noticeVersion: "2026-07-01",
      usage: "disabled",
      crashReports: "disabled",
      installationId: null,
      decidedAt: "2026-07-01T12:00:00.000Z",
    };
    expect(needsTelemetryDecision(opposed)).toBe(true);
    expect(telemetryConsentDraft(opposed)).toEqual({
      usage: false,
      crashReports: false,
    });
    expect(telemetryPurposeActive(opposed.usage, "usage")).toBe(false);
    expect(telemetryPurposeActive(opposed.crashReports, "crashReports")).toBe(
      false,
    );
  });

  it.each(["2026-08-02", TELEMETRY_NOTICE_VERSION])(
    "keeps purpose-specific choices across notice %s",
    (noticeVersion) => {
      for (const usage of ["unset", "enabled", "disabled"] as const) {
        for (const crashReports of ["unset", "enabled", "disabled"] as const) {
          const status = normalizeTelemetryStatus({
            schemaVersion: 1,
            noticeVersion,
            usage,
            crashReports,
            installationId: "00000000-0000-4000-8000-000000000001",
            decidedAt: null,
          });
          expect(telemetryConsentDraft(status)).toEqual({
            usage: usage === "enabled",
            crashReports: crashReports !== "disabled",
          });
          expect(telemetryConsentChange(status, "crashReports", false)).toEqual(
            {
              usage: usage === "enabled" ? "enabled" : "disabled",
              crashReports: "disabled",
            },
          );
          expect(telemetryConsentChange(status, "usage", true)).toEqual({
            usage: "enabled",
            crashReports: crashReports === "disabled" ? "disabled" : "enabled",
          });
        }
      }
    },
  );

  it("fails closed for malformed consent", () => {
    expect(
      normalizeTelemetryStatus({
        schemaVersion: 1,
        usage: "yes",
        crashReports: "enabled",
        installationId: "machine-name",
      }),
    ).toMatchObject({
      usage: "disabled",
      crashReports: "disabled",
      installationId: null,
    });
  });

  it("keeps exception names as a closed technical dimension", () => {
    expect(normalizeTelemetryExceptionName("TypeError")).toBe("TypeError");
    expect(normalizeTelemetryExceptionName("AbortError")).toBe("AbortError");
    for (const unsafeName of [
      "CanalSentinela19",
      "live-da-maria",
      "maria@example.com",
      "Bearer secret-token",
      "TypeError ",
      "",
      null,
    ]) {
      expect(normalizeTelemetryExceptionName(unsafeName)).toBe("Error");
    }
  });

  it("fails closed for an unknown persisted schema", () => {
    expect(
      normalizeTelemetryStatus({
        schemaVersion: 2,
        noticeVersion: TELEMETRY_NOTICE_VERSION,
        usage: "enabled",
        crashReports: "enabled",
        installationId: "00000000-0000-4000-8000-000000000001",
      }),
    ).toEqual({
      schemaVersion: 1,
      noticeVersion: "",
      usage: "disabled",
      crashReports: "disabled",
      installationId: null,
      decidedAt: null,
    });
  });

  it("never turns malformed preferences into active unset while preserving an ID", () => {
    const normalized = normalizeTelemetryStatus({
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      noticeVersion: TELEMETRY_NOTICE_VERSION,
      usage: "unexpected",
      crashReports: null,
      installationId: "00000000-0000-4000-8000-000000000001",
    });
    expect(telemetryConsentDraft(normalized)).toEqual({
      usage: false,
      crashReports: false,
    });
    expect(telemetryConsentDraft(normalizeTelemetryStatus(null))).toEqual({
      usage: false,
      crashReports: false,
    });
  });

  it.each([undefined, null, "current", "", "2026-08-02-extra"])(
    "rejects malformed notice %s without reviving telemetry",
    (noticeVersion) => {
      expect(
        normalizeTelemetryStatus({
          schemaVersion: TELEMETRY_SCHEMA_VERSION,
          noticeVersion,
          usage: "enabled",
          crashReports: "enabled",
          installationId: "00000000-0000-4000-8000-000000000001",
        }),
      ).toMatchObject({
        usage: "disabled",
        crashReports: "disabled",
        installationId: null,
      });
    },
  );

  it("accepts only catalogued event properties", () => {
    expect(
      sanitizeTelemetryProperties(
        "screen_viewed",
        { screen_id: "settings" },
        context,
      ),
    ).toMatchObject({
      screen_id: "settings",
      telemetry_schema_version: 1,
      corneta_schema_guard: TELEMETRY_GUARD_VALUE,
    });
    expect(
      sanitizeTelemetryProperties(
        "screen_viewed",
        { screen_id: "settings", title: "secret title" },
        context,
      ),
    ).toBeNull();
    expect(
      sanitizeTelemetryProperties(
        "screen_viewed",
        { screen_id: "arbitrary-route" },
        context,
      ),
    ).toBeNull();
    expect(
      sanitizeTelemetryProperties(
        "diagnostics_exported",
        { outcome: "installed" },
        context,
      ),
    ).toBeNull();
    expect(
      sanitizeTelemetryProperties(
        "live_start_completed",
        {
          operation_id: "00000000-0000-4000-8000-000000000004",
          duration_bucket: "1_3s",
          encoder_kind: "copy",
        },
        context,
      ),
    ).toMatchObject({ encoder_kind: "copy" });
  });

  it("uses the same 32-target ceiling as AppConfig", () => {
    const base = {
      operation_id: "00000000-0000-4000-8000-000000000001",
      mode: "per-platform" as const,
      platforms: ["custom" as const],
      brb_enabled: false,
      guardian_enabled: false,
      record_video_enabled: false,
    };
    expect(
      sanitizeTelemetryProperties(
        "live_start_requested",
        { ...base, target_count: 32 },
        context,
      ),
    ).not.toBeNull();
    expect(
      sanitizeTelemetryProperties(
        "live_start_requested",
        { ...base, target_count: 33 },
        context,
      ),
    ).toBeNull();
  });

  it("rejects arbitrary safe-looking stage and error code tokens", () => {
    const base = {
      operation_id: "00000000-0000-4000-8000-000000000001",
      stage: "engine_start",
      error_code: "engine_start_failed",
      cancelled: false,
    };
    expect(
      sanitizeTelemetryProperties(
        "live_start_failed",
        { ...base, stage: "arbitrary_stage" },
        context,
      ),
    ).toBeNull();
    expect(
      sanitizeTelemetryProperties(
        "live_start_failed",
        { ...base, error_code: "arbitrary_error" },
        context,
      ),
    ).toBeNull();
  });

  it("redacts offensive fixtures without mutating the input", () => {
    const original = [
      "Authorization: Bearer very.secret.token",
      "client_secret=my-super-secret",
      '{"api_key":"json-secret-value"}',
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123456",
      "C:\\Users\\maria\\AppData\\Local\\Corneta\\config.json",
      "/home/maria/.config/corneta/token",
      "maria@example.com",
      "https://user:pass@example.com/oauth/callback?code=secret#fragment",
    ].join("\n");
    const redacted = redactTelemetryText(original, 4_000);
    expect(original).toContain("maria@example.com");
    expect(redacted).not.toContain("my-super-secret");
    expect(redacted).not.toContain("json-secret-value");
    expect(redacted).not.toContain("maria@example.com");
    expect(redacted).not.toContain("Users\\maria");
    expect(redacted).not.toContain("code=secret");
    expect(redacted).toContain("<redacted>");
    expect(redacted).toContain("<local-path>");
  });

  it("keeps only local bundle URLs usable by source maps", () => {
    const stack = [
      "at render (http://tauri.localhost/assets/index-Ab12.js:10:20)",
      "at oauth (https://accounts.example.com/private/callback?code=secret)",
    ].join("\n");
    const redacted = redactTelemetryText(stack, 2_000);
    expect(redacted).toContain(
      "http://tauri.localhost/assets/index-Ab12.js:10:20",
    );
    expect(redacted).not.toContain("private/callback");
    expect(redacted).not.toContain("code=secret");
  });

  it("rebuilds PostHog events and strips automatic browser properties", () => {
    const result = sanitizePostHogEvent(
      {
        event: "screen_viewed",
        timestamp: "2026-08-01T12:00:00.000Z",
        arbitrary_top_level: "private value",
        properties: {
          ...context,
          screen_id: "settings",
          corneta_schema_guard: TELEMETRY_GUARD_VALUE,
          distinct_id: "00000000-0000-4000-8000-000000000001",
          $device_id: "00000000-0000-4000-8000-000000000009",
          $session_id: "00000000-0000-4000-8000-000000000010",
          $current_url: "https://example.com/private?token=secret",
          $browser: "Edge",
        },
      },
      context,
      true,
      false,
    );
    expect(result?.properties).toMatchObject({
      screen_id: "settings",
      distinct_id: "00000000-0000-4000-8000-000000000001",
    });
    expect(result?.properties).not.toHaveProperty("$current_url");
    expect(result?.properties).not.toHaveProperty("$browser");
    expect(result?.properties).not.toHaveProperty("$device_id");
    expect(result?.properties).not.toHaveProperty("$session_id");
    expect(result?.properties).not.toHaveProperty("corneta_schema_guard");
    expect(result).not.toHaveProperty("timestamp");
    expect(result).not.toHaveProperty("arbitrary_top_level");
  });

  it("redacts structured exceptions in the final barrier", () => {
    const result = sanitizePostHogEvent(
      {
        event: "$exception",
        properties: {
          ...context,
          corneta_schema_guard: TELEMETRY_GUARD_VALUE,
          error_id: "00000000-0000-4000-8000-000000000002",
          handled: false,
          severity: "error",
          error_code: "screen_render_failed",
          stage: "screen_render",
          $exception_fingerprint: "ui_deadbeef",
          $release_id: "release_12345678",
          $exception_steps: [
            {
              $message: "screen_opened",
              $timestamp: "2026-08-01T12:00:00.000Z",
              screen_id: "settings",
              secret: "must-not-survive",
            },
            {
              $message: "free form content",
              $timestamp: "2026-08-01T12:00:01.000Z",
            },
          ],
          $exception_list: [
            {
              $exception_type: "CanalSentinela19",
              $exception_message: "token=secret-value at maria@example.com",
              stacktrace: {
                frames: [
                  {
                    filename: "C:\\Users\\maria\\src\\App.tsx",
                    function: "render",
                    lineno: 42,
                    colno: 5,
                  },
                ],
              },
            },
          ],
        },
      },
      context,
      false,
      true,
    );
    const json = JSON.stringify(result);
    expect(json).not.toContain("secret-value");
    expect(json).not.toContain("maria@example.com");
    expect(json).not.toContain("Users\\\\maria");
    expect(json).not.toContain("must-not-survive");
    expect(json).not.toContain("free form content");
    expect(json).not.toContain("CanalSentinela19");
    expect(result?.properties?.$exception_list).toEqual([
      expect.objectContaining({
        $exception_type: "Error",
        stacktrace: expect.objectContaining({ type: "raw" }),
      }),
    ]);
    expect(result?.properties?.$release_id).toBe("release_12345678");
    expect(result?.properties?.$exception_steps).toEqual([
      {
        $message: "screen_opened",
        $timestamp: "2026-08-01T12:00:00.000Z",
        screen_id: "settings",
      },
    ]);
    expect(result?.event).toBe("$exception");
  });

  it("accepts omitted optional exception context", () => {
    expect(
      sanitizeExceptionProperties(
        {
          handled: false,
          severity: "fatal",
          error_code: "app_render_failed",
          stage: "app_render",
          operation_id: undefined,
          screen_id: undefined,
          component_stack: undefined,
          error_id: "00000000-0000-4000-8000-000000000003",
          $exception_fingerprint: "ui_deadbeef",
        },
        context,
      ),
    ).not.toBeNull();
  });

  it("uses deterministic bounded buckets", () => {
    expect(durationBucket(999)).toBe("lt_1s");
    expect(durationBucket(60_000)).toBe("1_5m");
    expect(countBucket(4)).toBe("4_10");
    expect(resolutionBucket(1920, 1080)).toBe("full_hd");
    expect(fpsBucket(59.94)).toBe("51_60");
  });
});
