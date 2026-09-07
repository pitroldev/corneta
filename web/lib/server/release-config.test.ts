import { describe, expect, it } from "vitest";
import { releaseConfigErrors, resolveBuildSha } from "./release-config";

const sha = "0123456789abcdef0123456789abcdef01234567";
const valid = {
  TWITCH_CLIENT_ID: "test",
  GOOGLE_CLIENT_ID: "test",
  KICK_CLIENT_ID: "test",
  KICK_CLIENT_SECRET: "never-print-this-secret",
  NEXT_PUBLIC_SITE_URL: "https://www.corneta.live",
  NEXT_PUBLIC_PRIMARY_CTA_URL:
    "https://github.com/pitroldev/corneta/releases/download/v0.7.0/Corneta.exe",
  UPSTASH_REDIS_REST_URL: "https://redis.example.test",
  UPSTASH_REDIS_REST_TOKEN: "test",
  OAUTH_RATE_LIMIT_SALT: "a".repeat(32),
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
  it("reports missing settings without exposing values", () => {
    const errors = releaseConfigErrors({
      KICK_CLIENT_SECRET: valid.KICK_CLIENT_SECRET,
    });
    expect(errors.length).toBeGreaterThan(5);
    expect(errors.join()).not.toContain(valid.KICK_CLIENT_SECRET);
  });
  it.each([
    "#download",
    "https://example.com/Corneta.exe",
    "https://github.com/pitroldev/corneta/releases",
    "https://secret@downloads.test/Corneta.exe",
  ])("rejects a provisional download: %s", (url) => {
    expect(
      releaseConfigErrors({ ...valid, NEXT_PUBLIC_PRIMARY_CTA_URL: url }).some(
        (e) => e.includes("PRIMARY_CTA"),
      ),
    ).toBe(true);
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
