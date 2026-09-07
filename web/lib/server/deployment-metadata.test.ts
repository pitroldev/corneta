import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readTelemetryDeploymentMetadata } from "./deployment-metadata";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const TOKEN = "phc_public-project-token";

describe("telemetry deployment metadata", () => {
  it("exposes only public configuration and fingerprints for both surfaces", () => {
    const metadata = readTelemetryDeploymentMetadata({
      NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: TOKEN,
      NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com/",
      NEXT_PUBLIC_BUILD_SHA: SHA.toUpperCase(),
      NEXT_PUBLIC_TELEMETRY_DISABLED: "0",
      POSTHOG_PROJECT_TOKEN: TOKEN,
      POSTHOG_HOST: "https://us.i.posthog.com",
      BUILD_SHA: SHA,
      TELEMETRY_DISABLED: "0",
      SECRET_THAT_MUST_NOT_LEAK: "hunter2",
    });
    const digest = createHash("sha256").update(TOKEN).digest("hex");

    expect(metadata).toEqual({
      schemaVersion: 1,
      site: {
        disabled: false,
        buildSha: SHA,
        posthogHost: "https://us.i.posthog.com",
        projectTokenSha256: digest,
      },
      setupApi: {
        disabled: false,
        buildSha: SHA,
        posthogHost: "https://us.i.posthog.com",
        projectTokenSha256: digest,
      },
    });
    expect(JSON.stringify(metadata)).not.toContain(TOKEN);
    expect(JSON.stringify(metadata)).not.toContain("hunter2");
  });

  it("reflects kill switches and fails closed for invalid tokens or SHAs", () => {
    expect(
      readTelemetryDeploymentMetadata({
        NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "phx_personal-key",
        NEXT_PUBLIC_POSTHOG_HOST: "http://localhost:8000",
        NEXT_PUBLIC_BUILD_SHA: "short",
        NEXT_PUBLIC_TELEMETRY_DISABLED: "1",
        VERCEL_GIT_COMMIT_SHA: SHA,
        TELEMETRY_DISABLED: "1",
      }),
    ).toEqual({
      schemaVersion: 1,
      site: {
        disabled: true,
        buildSha: null,
        posthogHost: null,
        projectTokenSha256: null,
      },
      setupApi: {
        disabled: true,
        buildSha: SHA,
        posthogHost: null,
        projectTokenSha256: null,
      },
    });
  });
});
