import { createHash } from "node:crypto";
import { normalizePostHogHost } from "../telemetry-schema";

const PROJECT_TOKEN_RE = /^phc_[A-Za-z0-9_-]{8,}$/;
const BUILD_SHA_RE = /^[a-f0-9]{40}$/i;

type SurfaceMetadata = {
  disabled: boolean;
  buildSha: string | null;
  posthogHost: string | null;
  projectTokenSha256: string | null;
};

export type TelemetryDeploymentMetadata = {
  schemaVersion: 1;
  site: SurfaceMetadata;
  setupApi: SurfaceMetadata;
};

function first(...values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function buildSha(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && BUILD_SHA_RE.test(trimmed) ? trimmed.toLowerCase() : null;
}

function tokenDigest(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || !PROJECT_TOKEN_RE.test(trimmed)) return null;
  return createHash("sha256").update(trimmed, "utf8").digest("hex");
}

export function readTelemetryDeploymentMetadata(
  env: Readonly<Record<string, string | undefined>> = process.env,
): TelemetryDeploymentMetadata {
  const publicToken = first(env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN);
  const serverToken = first(env.POSTHOG_PROJECT_TOKEN, publicToken);

  return {
    schemaVersion: 1,
    site: {
      disabled: env.NEXT_PUBLIC_TELEMETRY_DISABLED === "1",
      buildSha: buildSha(env.NEXT_PUBLIC_BUILD_SHA),
      posthogHost: normalizePostHogHost(env.NEXT_PUBLIC_POSTHOG_HOST) ?? null,
      projectTokenSha256: tokenDigest(publicToken),
    },
    setupApi: {
      disabled: env.TELEMETRY_DISABLED === "1",
      buildSha: buildSha(first(env.BUILD_SHA, env.VERCEL_GIT_COMMIT_SHA)),
      posthogHost:
        normalizePostHogHost(
          first(env.POSTHOG_HOST, env.NEXT_PUBLIC_POSTHOG_HOST),
        ) ?? null,
      projectTokenSha256: tokenDigest(serverToken),
    },
  };
}
