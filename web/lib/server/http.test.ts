import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("./posthog", () => ({ reportApiFailure: vi.fn() }));

import { ApiError, errorResponse, providerForm, readJson } from "./http";
import { createApiTelemetryContext } from "./telemetry-reporter";

afterEach(() => vi.unstubAllGlobals());
const request = (body: string) =>
  new Request("https://corneta.test", { method: "POST", body });

describe("OAuth HTTP boundary", () => {
  it.each(["null", "[]", "true", '"token"', "{"])(
    "rejects non-object JSON as 400: %s",
    async (body) => {
      await expect(readJson(request(body))).rejects.toMatchObject({
        status: 400,
        code: "INVALID_JSON",
      });
    },
  );
  it("limits undeclared request bodies while accepting valid JSON", async () => {
    await expect(readJson(request('{"code":"test"}'))).resolves.toEqual({
      code: "test",
    });
    await expect(readJson(request("x".repeat(20)), 10)).rejects.toMatchObject({
      status: 413,
    });
  });
  it("returns Retry-After and no-store headers without leaking internal data", async () => {
    const context = createApiTelemetryContext(
      request("{}"),
      "kick_exchange",
      "kick",
    );
    const response = errorResponse(
      new ApiError(429, "RATE_LIMITED", "Tente novamente.", true, 25),
      context,
    );
    expect(response.headers.get("retry-after")).toBe("25");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-request-id")).toBe(context.requestId);
    expect(await response.json()).toMatchObject({
      error: { code: "RATE_LIMITED", retryable: true },
    });
  });
  it.each([null, [], "unexpected", { large: "x".repeat(33_000) }])(
    "rejects malformed or oversized provider replies",
    async (body) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json(body)),
      );
      await expect(
        providerForm("https://id.kick.com/oauth/token", {}),
      ).rejects.toMatchObject({
        status: 502,
        code: "INVALID_PROVIDER_RESPONSE",
      });
    },
  );
  it("sanitizes a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("secret-provider-body");
      }),
    );
    await expect(
      providerForm("https://id.kick.com/oauth/token", {}),
    ).rejects.toMatchObject({ status: 503, code: "PROVIDER_UNAVAILABLE" });
  });
});
