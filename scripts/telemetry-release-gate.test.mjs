import { createHash } from "node:crypto";
import { ReadableStream } from "node:stream/web";
import { describe, expect, it, vi } from "vitest";
import {
  checkTelemetryRelease,
  deploymentErrors,
  releaseTelemetryConfig,
} from "./telemetry-release-gate.mjs";

const noticeVersion = "2026-09-09";
const token = "phc_synthetic_release_test";
const host = "https://us.i.posthog.com";
const sha = "a".repeat(40);
const env = {
  VITE_BUILD_SHA: sha,
  CORNETA_BUILD_SHA: sha,
  NEXT_PUBLIC_BUILD_SHA: sha,
  BUILD_SHA: sha,
  VITE_TELEMETRY_DISABLED: "0",
  TELEMETRY_DISABLED: "0",
  TELEMETRY_POLICY_PUBLISHED_VERSION: noticeVersion,
  TELEMETRY_DEPLOYMENT_METADATA_URL: "https://www.corneta.live/api/v1/health",
  VITE_POSTHOG_TOKEN: token,
  POSTHOG_DESKTOP_TOKEN: token,
  NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: token,
  POSTHOG_PROJECT_TOKEN: token,
  VITE_POSTHOG_HOST: host,
  POSTHOG_HOST: host,
  NEXT_PUBLIC_POSTHOG_HOST: host,
};
const surface = {
  disabled: false,
  buildSha: sha,
  posthogHost: host,
  projectTokenSha256: createHash("sha256").update(token).digest("hex"),
};
const metadata = (changes = {}) => ({
  telemetryDeployment: {
    schemaVersion: 1,
    site: { ...surface, ...changes },
    setupApi: { ...surface, ...changes },
  },
});

describe("release telemetry deployment gate", () => {
  it("accepts exactly matching deployment metadata without exposing tokens", async () => {
    const request = vi.fn(async () => Response.json(metadata()));
    const result = await checkTelemetryRelease(env, {
      noticeVersion,
      fetch: request,
    });
    expect(result.errors).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(token);
    expect(request.mock.calls[0][0]).toBe(
      env.TELEMETRY_DEPLOYMENT_METADATA_URL,
    );
    expect(request.mock.calls[0][1]).toMatchObject({
      cache: "no-store",
      redirect: "error",
    });
  });

  it.each([
    ["VITE_TELEMETRY_DISABLED", "1"],
    ["TELEMETRY_DISABLED", "false"],
    ["CORNETA_BUILD_SHA", "b".repeat(40)],
    ["BUILD_SHA", "short"],
    ["POSTHOG_PROJECT_TOKEN", "phc_other_synthetic_project"],
    ["VITE_POSTHOG_TOKEN", "phx_synthetic_private_key"],
    ["POSTHOG_HOST", "https://eu.i.posthog.com"],
    ["TELEMETRY_POLICY_PUBLISHED_VERSION", "2026-01-01"],
    ["TELEMETRY_DEPLOYMENT_METADATA_URL", "https://example.invalid/health"],
    ["NEXT_PUBLIC_BUILD_SHA", undefined],
  ])(
    "rejects invalid %s before any network request or waiting",
    async (name, value) => {
      const request = vi.fn();
      const delay = vi.fn();
      const result = await checkTelemetryRelease(
        { ...env, [name]: value },
        {
          noticeVersion,
          waitMs: 600_000,
          fetch: request,
          sleep: delay,
        },
      );
      expect(result.errors.length).toBeGreaterThan(0);
      expect(request).not.toHaveBeenCalled();
      expect(delay).not.toHaveBeenCalled();
      expect(result.errors.join(" ")).not.toContain(token);
    },
  );

  it.each([
    { disabled: true },
    { buildSha: "b".repeat(40) },
    { posthogHost: "https://eu.i.posthog.com" },
    { projectTokenSha256: "b".repeat(64) },
  ])("rejects a mismatched deployed surface %j", async (changes) => {
    const result = await checkTelemetryRelease(env, {
      noticeVersion,
      fetch: async () => Response.json(metadata(changes)),
    });
    expect(result.errors).toHaveLength(2);
  });

  it("requires both surfaces and a recognized schema", () => {
    const config = releaseTelemetryConfig(env, noticeVersion);
    for (const body of [
      null,
      {},
      { telemetryDeployment: { schemaVersion: 2 } },
      { telemetryDeployment: { schemaVersion: 1 } },
    ])
      expect(deploymentErrors(body, config).length).toBeGreaterThan(0);
  });

  it("waits for deployment convergence without relaxing SHA or privacy requirements", async () => {
    let now = 0;
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(metadata({ buildSha: "b".repeat(40) })),
      )
      .mockResolvedValueOnce(new Response("Retry", { status: 503 }))
      .mockResolvedValueOnce(Response.json(metadata()));
    const onRetry = vi.fn();
    const result = await checkTelemetryRelease(env, {
      noticeVersion,
      waitMs: 60_000,
      fetch: request,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
      onRetry,
    });
    expect(result.errors).toEqual([]);
    expect(request).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(now).toBe(30_000);
  });

  it("expires the bounded wait and keeps the release blocked", async () => {
    let now = 0;
    const request = vi.fn(async () =>
      Response.json(metadata({ buildSha: "b".repeat(40) })),
    );
    const result = await checkTelemetryRelease(env, {
      noticeVersion,
      waitMs: 20_000,
      fetch: request,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
    });
    expect(result.errors.join(" ")).toContain("wait expired");
    expect(result.errors.join(" ")).toContain("release SHA");
    expect(now).toBe(20_000);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not retry in the default one-shot mode", async () => {
    const request = vi.fn(async () => {
      throw new Error("Synthetic transport failure");
    });
    const delay = vi.fn();
    const result = await checkTelemetryRelease(env, {
      noticeVersion,
      fetch: request,
      sleep: delay,
    });
    expect(result.errors).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
  });

  it("cancels oversized bodies before retaining an unbounded response", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(16_384));
      },
      cancel,
    });
    const result = await checkTelemetryRelease(env, {
      noticeVersion,
      fetch: async () => new Response(body),
    });
    expect(result.errors.join(" ")).toContain("bounded");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed JSON and empty bodies without disclosing response contents", async () => {
    for (const response of [
      new Response("synthetic-sensitive-body"),
      new Response(null),
    ]) {
      const result = await checkTelemetryRelease(env, {
        noticeVersion,
        fetch: async () => response,
      });
      expect(result.errors.join(" ")).toContain("bounded");
      expect(result.errors.join(" ")).not.toContain("synthetic-sensitive-body");
    }
  });

  it("keeps SHA and published-policy gates when telemetry is disabled", async () => {
    const disabled = {
      ...env,
      VITE_TELEMETRY_DISABLED: "1",
      TELEMETRY_DISABLED: "1",
    };
    for (const name of [
      "VITE_POSTHOG_TOKEN",
      "POSTHOG_DESKTOP_TOKEN",
      "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
      "POSTHOG_PROJECT_TOKEN",
      "VITE_POSTHOG_HOST",
      "POSTHOG_HOST",
      "NEXT_PUBLIC_POSTHOG_HOST",
    ])
      delete disabled[name];
    const result = await checkTelemetryRelease(disabled, {
      noticeVersion,
      fetch: async () =>
        Response.json(
          metadata({
            disabled: true,
            projectTokenSha256: null,
            posthogHost: null,
          }),
        ),
    });
    expect(result.errors).toEqual([]);
    expect(
      releaseTelemetryConfig({ ...disabled, BUILD_SHA: "wrong" }, noticeVersion)
        .errors.length,
    ).toBeGreaterThan(0);
  });

  it.each([-1, 600_001, Number.NaN, 0.5])(
    "rejects an unsafe wait budget %s",
    async (waitMs) => {
      await expect(
        checkTelemetryRelease(env, { noticeVersion, waitMs }),
      ).rejects.toThrow("Deployment wait");
    },
  );
});
