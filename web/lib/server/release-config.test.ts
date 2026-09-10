import { describe, expect, it } from "vitest";
import { releaseConfigErrors, resolveBuildSha } from "./release-config";

const sha = "0123456789abcdef0123456789abcdef01234567";
const valid = {
  TWITCH_CLIENT_ID: "test",
  GOOGLE_CLIENT_ID: "test",
  KICK_CLIENT_ID: "test",
  KICK_CLIENT_SECRET: "never-print-this-secret",
  NEXT_PUBLIC_SITE_URL: "https://www.corneta.live",
  VERCEL: "1",
  KICK_REDIRECT_URIS: "http://localhost:7395/callback",
  NEXT_PUBLIC_BUILD_SHA: sha,
  BUILD_SHA: sha,
  TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_TELEMETRY_DISABLED: "1",
};

describe("release configuration", () => {
  it("accepts explicit disabled telemetry without inventing credentials", () =>
    expect(releaseConfigErrors(valid)).toEqual([]));
  it("does not require external rate-limit storage in production", () => {
    expect(
      releaseConfigErrors({
        ...valid,
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      }),
    ).toEqual([]);
  });
  it("accepts configured production telemetry without external rate-limit storage", () => {
    expect(
      releaseConfigErrors({
        ...valid,
        TELEMETRY_DISABLED: "0",
        NEXT_PUBLIC_TELEMETRY_DISABLED: "0",
        NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc_test_public_project_token",
        POSTHOG_PROJECT_TOKEN: "phc_test_public_project_token",
        NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
        POSTHOG_HOST: "https://us.i.posthog.com",
        NEXT_PUBLIC_DEPLOYMENT_ENV: "production",
        POSTHOG_ENVIRONMENT: "production",
      }),
    ).toEqual([]);
  });
  it("still requires a trusted proxy header for self-hosted production", () => {
    const selfHosted = { ...valid, VERCEL: undefined };
    expect(releaseConfigErrors(selfHosted)).toEqual([
      "OAUTH_TRUSTED_IP_HEADER: configure a header overwritten by the trusted proxy",
    ]);
    expect(
      releaseConfigErrors({
        ...selfHosted,
        OAUTH_TRUSTED_IP_HEADER: "x-real-ip",
      }),
    ).toEqual([]);
  });
  it("reports missing settings without exposing values", () => {
    const errors = releaseConfigErrors({
      KICK_CLIENT_SECRET: valid.KICK_CLIENT_SECRET,
    });
    expect(errors.length).toBeGreaterThan(5);
    expect(errors.join()).not.toContain(valid.KICK_CLIENT_SECRET);
  });
  it("does not require a configurable installer URL", () => {
    expect(releaseConfigErrors(valid)).toEqual([]);
  });
  it.each([
    "",
    "#download",
    "https://example.com/Corneta.exe",
    "https://github.com/pitroldev/corneta/releases",
    "https://secret@downloads.test/Corneta.exe",
    "https://github.com/pitroldev/corneta/releases/latest/download/Corneta-Setup.exe",
  ])("ignores a stale download environment value: %s", (url) => {
    expect(
      releaseConfigErrors({ ...valid, NEXT_PUBLIC_PRIMARY_CTA_URL: url }),
    ).toEqual([]);
  });
  it("rejects active but unconfigured telemetry", () => {
    expect(
      releaseConfigErrors({
        ...valid,
        TELEMETRY_DISABLED: "0",
        NEXT_PUBLIC_TELEMETRY_DISABLED: "0",
      }),
    ).toContain(
      "Telemetry: site and API require the same valid public phc_ project token",
    );
  });
  it("uses the Git SHA when public build identity is omitted", () =>
    expect(resolveBuildSha({}, () => sha)).toBe(sha));
  it("allows builds outside Git, but release validation rejects missing identity", () => {
    expect(
      resolveBuildSha({}, () => {
        throw new Error();
      }),
    ).toBe("");
    expect(
      releaseConfigErrors({
        ...valid,
        NEXT_PUBLIC_BUILD_SHA: "",
        BUILD_SHA: "",
      }).some((e) => e.includes("BUILD_SHA")),
    ).toBe(true);
  });
  it("rejects divergent SHA inputs instead of hiding the divergence", () => {
    expect(() =>
      resolveBuildSha({
        BUILD_SHA: sha,
        NEXT_PUBLIC_BUILD_SHA: "f".repeat(40),
      }),
    ).toThrow("same full commit");
  });
});
