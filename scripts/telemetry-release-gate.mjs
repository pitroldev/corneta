import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

const HOST = "https://us.i.posthog.com";
const METADATA_URL = "https://www.corneta.live/api/v1/health";
const TOKEN = /^phc_[A-Za-z0-9_-]{8,}$/;
const SHA = /^[a-f0-9]{40}$/i;
const MAX_METADATA_BYTES = 32_768;
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function releaseTelemetryConfig(env, noticeVersion) {
  const errors = [];
  const required = [
    "VITE_BUILD_SHA",
    "CORNETA_BUILD_SHA",
    "NEXT_PUBLIC_BUILD_SHA",
    "BUILD_SHA",
    "VITE_TELEMETRY_DISABLED",
    "TELEMETRY_DISABLED",
    "TELEMETRY_POLICY_PUBLISHED_VERSION",
    "TELEMETRY_DEPLOYMENT_METADATA_URL",
  ];
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length)
    errors.push(`missing telemetry configuration (${missing.join(", ")})`);
  for (const name of ["VITE_TELEMETRY_DISABLED", "TELEMETRY_DISABLED"])
    if (!/^[01]$/.test(env[name] ?? ""))
      errors.push(`${name} must be exactly 0 or 1`);
  const disabled =
    env.VITE_TELEMETRY_DISABLED === "1" && env.TELEMETRY_DISABLED === "1";
  if (env.VITE_TELEMETRY_DISABLED !== env.TELEMETRY_DISABLED)
    errors.push(
      "VITE_TELEMETRY_DISABLED and TELEMETRY_DISABLED must change together",
    );
  const shaNames = [
    "VITE_BUILD_SHA",
    "CORNETA_BUILD_SHA",
    "NEXT_PUBLIC_BUILD_SHA",
    "BUILD_SHA",
  ];
  for (const name of shaNames)
    if (!SHA.test(env[name] ?? ""))
      errors.push(`${name} must contain the full commit SHA`);
  const shas = shaNames.map((name) => env[name]?.toLowerCase());
  if (new Set(shas).size !== 1)
    errors.push(
      "desktop, website, and Setup API must use the same release SHA",
    );
  let tokenDigest = null;
  if (!disabled) {
    const tokenNames = [
      "VITE_POSTHOG_TOKEN",
      "POSTHOG_DESKTOP_TOKEN",
      "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
      "POSTHOG_PROJECT_TOKEN",
    ];
    const tokens = tokenNames.map((name) => env[name]);
    for (const [index, token] of tokens.entries())
      if (!TOKEN.test(token ?? ""))
        errors.push(`${tokenNames[index]} must be a public phc_ project token`);
    if (new Set(tokens).size !== 1)
      errors.push(
        "desktop, website, and Setup API must use the same production project token",
      );
    if (TOKEN.test(tokens[0] ?? ""))
      tokenDigest = createHash("sha256")
        .update(tokens[0], "utf8")
        .digest("hex");
    for (const name of [
      "VITE_POSTHOG_HOST",
      "POSTHOG_HOST",
      "NEXT_PUBLIC_POSTHOG_HOST",
    ])
      if (env[name]?.replace(/\/+$/, "") !== HOST)
        errors.push(`${name} must use the approved US PostHog host`);
  }
  if (env.TELEMETRY_POLICY_PUBLISHED_VERSION !== noticeVersion)
    errors.push(`the published policy must declare notice ${noticeVersion}`);
  if (env.TELEMETRY_DEPLOYMENT_METADATA_URL !== METADATA_URL)
    errors.push(
      "TELEMETRY_DEPLOYMENT_METADATA_URL must be the official production health endpoint",
    );
  return { errors, disabled, buildSha: shas[0], tokenDigest };
}

export function deploymentErrors(body, config) {
  const metadata = object(body) ? body.telemetryDeployment : undefined;
  if (!object(metadata) || metadata.schemaVersion !== 1)
    return ["production deployment does not expose telemetry metadata v1"];
  const errors = [];
  for (const [key, label] of [
    ["site", "site"],
    ["setupApi", "Setup API"],
  ]) {
    const surface = metadata[key];
    if (!object(surface)) {
      errors.push(`production deployment did not report metadata for ${label}`);
      continue;
    }
    if (surface.disabled !== config.disabled)
      errors.push(`deployed kill switch in ${label} differs from the release`);
    if (surface.buildSha !== config.buildSha)
      errors.push(`deployed ${label} does not match the release SHA`);
    if (!config.disabled) {
      if (surface.posthogHost !== HOST)
        errors.push(`deployed ${label} uses a different PostHog host`);
      if (surface.projectTokenSha256 !== config.tokenDigest)
        errors.push(`deployed ${label} uses a different project token`);
    }
  }
  return errors;
}

async function readMetadata(response) {
  if (!response.body) throw new Error("Missing metadata body");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_METADATA_BYTES)
        throw new Error("Metadata exceeds the response limit");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function readDeploymentErrors(
  config,
  { fetch: request = globalThis.fetch, timeoutMs = 8_000 } = {},
) {
  try {
    const response = await request(METADATA_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return [
        `production deployment metadata returned HTTP ${response.status}`,
      ];
    }
    return deploymentErrors(await readMetadata(response), config);
  } catch {
    return ["could not validate bounded production deployment metadata"];
  }
}

export async function checkTelemetryRelease(
  env,
  {
    noticeVersion,
    waitMs = 0,
    fetch: request = globalThis.fetch,
    sleep: delay = sleep,
    now = () => performance.now(),
    onRetry = () => {},
  } = {},
) {
  if (!Number.isSafeInteger(waitMs) || waitMs < 0 || waitMs > 600_000)
    throw new Error("Deployment wait must be between zero and ten minutes");
  const config = releaseTelemetryConfig(env, noticeVersion);
  if (config.errors.length) return config;
  const deadline = now() + waitMs;
  let errors;
  do {
    errors = await readDeploymentErrors(config, {
      fetch: request,
      timeoutMs: waitMs
        ? Math.max(1, Math.min(8_000, Math.ceil(deadline - now())))
        : 8_000,
    });
    if (!errors.length) return { ...config, errors };
    const remaining = deadline - now();
    if (remaining <= 0 || waitMs === 0) break;
    onRetry();
    await delay(Math.min(15_000, remaining));
  } while (now() < deadline);
  return {
    ...config,
    errors: [
      ...errors,
      ...(waitMs
        ? [
            "deployment wait expired; deploy the tagged commit to production and rerun the release",
          ]
        : []),
    ],
  };
}
