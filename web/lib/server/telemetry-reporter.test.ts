import { describe, expect, it, vi } from "vitest";
import {
  createApiTelemetryContext,
  createTelemetryReporter,
  type TelemetrySink,
} from "./telemetry-reporter";

const REQUEST_ID = "318f95fc-6f70-4cf5-a625-e250e43b1234";
const TELEMETRY_ID = "699e8cf1-f765-44b1-89f8-e94b2ea9221c";
const OPERATION_ID = "0ed0e00e-acb7-4a10-8909-d791e52c945d";

function sink(): TelemetrySink {
  return {
    capture: vi.fn(async () => undefined),
    captureException: vi.fn(async () => undefined),
  };
}

describe("API telemetry context", () => {
  it("accepts valid UUIDs only and falls back to ephemeral identity", () => {
    const correlated = createApiTelemetryContext(
      {
        headers: new Headers({
          "X-Corneta-Telemetry-Id": TELEMETRY_ID,
          "X-Corneta-Telemetry-Purposes": "usage,crash_reports",
          "X-Corneta-Operation-Id": OPERATION_ID,
        }),
      },
      "kick_exchange",
      "kick",
      { now: () => 100, randomUuid: () => REQUEST_ID },
    );
    expect(correlated).toMatchObject({
      requestId: REQUEST_ID,
      operationId: OPERATION_ID,
      crashOperationId: OPERATION_ID,
      distinctId: TELEMETRY_ID,
      crashDistinctId: TELEMETRY_ID,
      startedAt: 100,
    });

    const ephemeral = createApiTelemetryContext(
      {
        headers: new Headers({
          "X-Corneta-Telemetry-Id": "not-a-uuid",
          "X-Corneta-Operation-Id": "Bearer secret",
        }),
      },
      "health",
      "none",
      { randomUuid: () => REQUEST_ID },
    );
    expect(ephemeral.operationId).toBeUndefined();
    expect(ephemeral.distinctId).toBe(`request:${REQUEST_ID}`);
    expect(ephemeral.crashDistinctId).toBe(`request:${REQUEST_ID}`);
  });

  it("separates identity by purpose and fails closed without a valid header", () => {
    const usageOnly = createApiTelemetryContext(
      {
        headers: new Headers({
          "X-Corneta-Telemetry-Id": TELEMETRY_ID,
          "X-Corneta-Telemetry-Purposes": "usage",
          "X-Corneta-Operation-Id": OPERATION_ID,
        }),
      },
      "health",
      "none",
      { randomUuid: () => REQUEST_ID },
    );
    expect(usageOnly.distinctId).toBe(TELEMETRY_ID);
    expect(usageOnly.crashDistinctId).toBe(`request:${REQUEST_ID}`);
    expect(usageOnly.operationId).toBe(OPERATION_ID);
    expect(usageOnly.crashOperationId).toBeUndefined();

    const crashesOnly = createApiTelemetryContext(
      {
        headers: new Headers({
          "X-Corneta-Telemetry-Id": TELEMETRY_ID,
          "X-Corneta-Telemetry-Purposes": "crash_reports",
          "X-Corneta-Operation-Id": OPERATION_ID,
        }),
      },
      "health",
      "none",
      { randomUuid: () => REQUEST_ID },
    );
    expect(crashesOnly.distinctId).toBe(`request:${REQUEST_ID}`);
    expect(crashesOnly.crashDistinctId).toBe(TELEMETRY_ID);
    expect(crashesOnly.operationId).toBeUndefined();
    expect(crashesOnly.crashOperationId).toBe(OPERATION_ID);

    const unknownPurpose = createApiTelemetryContext(
      {
        headers: new Headers({
          "X-Corneta-Telemetry-Id": TELEMETRY_ID,
          "X-Corneta-Telemetry-Purposes": "usage,anything_else",
          "X-Corneta-Operation-Id": OPERATION_ID,
        }),
      },
      "health",
      "none",
      { randomUuid: () => REQUEST_ID },
    );
    expect(unknownPurpose.distinctId).toBe(`request:${REQUEST_ID}`);
    expect(unknownPurpose.crashDistinctId).toBe(`request:${REQUEST_ID}`);
    expect(unknownPurpose.operationId).toBeUndefined();
    expect(unknownPurpose.crashOperationId).toBeUndefined();
  });
});

describe("server telemetry facade", () => {
  it("sends expected errors as aggregate operational events", async () => {
    const target = sink();
    const reporter = createTelemetryReporter({
      sink: target,
      environment: "test",
      now: () => 650,
    });
    await reporter.reportApiFailure({
      context: {
        requestId: REQUEST_ID,
        operationId: OPERATION_ID,
        distinctId: TELEMETRY_ID,
        crashDistinctId: `request:${REQUEST_ID}`,
        routeId: "kick_refresh",
        provider: "kick",
        startedAt: 100,
      },
      status: 429,
      retryable: true,
      errorCode: "RATE_LIMITED",
    });

    expect(target.capture).toHaveBeenCalledWith({
      distinctId: TELEMETRY_ID,
      event: "api_request_completed",
      properties: expect.objectContaining({
        request_id: REQUEST_ID,
        operation_id: OPERATION_ID,
        route_id: "kick_refresh",
        provider: "kick",
        status_class: "4xx",
        duration_bucket: "500_1999ms",
        retryable: true,
        error_code: "RATE_LIMITED",
      }),
    });
    expect(target.captureException).not.toHaveBeenCalled();
  });

  it("sends redacted exceptions without bodies, tokens, or free-text messages", async () => {
    const target = sink();
    const reporter = createTelemetryReporter({
      sink: target,
      environment: "test",
      now: () => 200,
      randomUuid: () => OPERATION_ID,
    });
    const error = new Error(
      "access_token=secret-value in body for person@example.com",
    );
    error.name = "CanalSentinela19";
    error.stack =
      "CanalSentinela19: secret-value\n    at exchange (C:\\Users\\petro\\oauth.ts:8:2)";

    await reporter.reportApiFailure({
      context: {
        requestId: REQUEST_ID,
        distinctId: `request:${REQUEST_ID}`,
        crashDistinctId: `request:${REQUEST_ID}`,
        crashOperationId: OPERATION_ID,
        routeId: "kick_exchange",
        provider: "kick",
        startedAt: 100,
      },
      status: 500,
      retryable: true,
      errorCode: "INTERNAL_ERROR",
      unexpectedError: error,
    });

    const captured = vi.mocked(target.captureException).mock.calls[0];
    expect(captured?.[0].name).toBe("UnknownError");
    expect(captured?.[0].message).toBe("Unexpected server error");
    expect(captured?.[0].stack).not.toContain("secret-value");
    expect(captured?.[0].stack).not.toContain("\\Users\\petro");
    expect(captured?.[0].stack).not.toContain("CanalSentinela19");
    expect(captured?.[1]).toBe(`request:${REQUEST_ID}`);
    expect(JSON.stringify(captured?.[2])).not.toContain("body");
    expect(JSON.stringify(captured?.[2])).not.toContain("person@example.com");
    expect(captured?.[2]).not.toHaveProperty("$exception_fingerprint");
    expect(captured?.[2]).toMatchObject({ error_type: "UnknownError" });
  });

  it("becomes a no-op when unconfigured and contains provider failures", async () => {
    await expect(
      createTelemetryReporter({}).reportApiFailure({
        context: {
          requestId: REQUEST_ID,
          distinctId: `request:${REQUEST_ID}`,
          crashDistinctId: `request:${REQUEST_ID}`,
          routeId: "health",
          provider: "none",
          startedAt: 0,
        },
        status: 500,
        retryable: true,
        errorCode: "INTERNAL_ERROR",
      }),
    ).resolves.toBeUndefined();

    const failing: TelemetrySink = {
      capture: vi.fn(async () => {
        throw new Error("offline");
      }),
      captureException: vi.fn(async () => {
        throw new Error("offline");
      }),
    };
    await expect(
      createTelemetryReporter({ sink: failing }).reportApiFailure({
        context: {
          requestId: REQUEST_ID,
          distinctId: `request:${REQUEST_ID}`,
          crashDistinctId: `request:${REQUEST_ID}`,
          routeId: "health",
          provider: "none",
          startedAt: 0,
        },
        status: 429,
        retryable: true,
        errorCode: "RATE_LIMITED",
      }),
    ).resolves.toBeUndefined();
  });
});
