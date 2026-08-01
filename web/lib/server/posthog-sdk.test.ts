import { PostHog } from "posthog-node";
import { describe, expect, it, vi } from "vitest";
import {
  redactPostHogMessage,
  telemetryBaseProperties,
} from "../telemetry-schema";

const REQUEST_ID = "318f95fc-6f70-4cf5-a625-e250e43b1234";
const ERROR_ID = "0ed0e00e-acb7-4a10-8909-d791e52c945d";

describe("PostHog Node exception contract", () => {
  it("mantém $exception_list compatível depois da redação final", async () => {
    const observed: Array<Record<string, unknown> | null> = [];
    const fetch = vi.fn(async () => ({
      status: 200,
      text: async () => "ok",
      json: async () => ({}),
    }));
    const client = new PostHog("phc_project123", {
      host: "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
      fetch,
      enableExceptionAutocapture: false,
      enableLocalEvaluation: false,
      before_send: (event) => {
        const safe = redactPostHogMessage(event);
        observed.push(safe as Record<string, unknown> | null);
        return safe;
      },
    });
    const error = new Error(
      "access_token=must-not-leak for person@example.com",
    );
    error.stack =
      "Error: access_token=must-not-leak\n    at exchange (C:\\Users\\petro\\oauth.ts:8:2)";

    try {
      await client.captureExceptionImmediate(error, REQUEST_ID, {
        ...telemetryBaseProperties("setup_api", "test"),
        error_id: ERROR_ID,
        request_id: REQUEST_ID,
        route_id: "kick_exchange",
        provider: "kick",
        error_code: "INTERNAL_ERROR",
        handled: true,
        severity: "error",
        error_type: "Error",
        $exception_handled: true,
      });
    } finally {
      await client.shutdown();
    }

    expect(fetch).toHaveBeenCalled();
    expect(observed).toHaveLength(1);
    const captured = observed[0];
    const properties = captured?.properties as
      Record<string, unknown> | undefined;
    expect(captured).toMatchObject({
      event: "$exception",
      distinctId: REQUEST_ID,
    });
    expect(properties?.$exception_list).toEqual(expect.any(Array));
    expect((properties?.$exception_list as unknown[]).length).toBeGreaterThan(
      0,
    );
    expect(properties).not.toHaveProperty("$exception_fingerprint");
    expect(JSON.stringify(captured)).not.toContain("must-not-leak");
    expect(JSON.stringify(captured)).not.toContain("person@example.com");
    expect(JSON.stringify(captured)).not.toContain("\\Users\\petro");
  });
});
