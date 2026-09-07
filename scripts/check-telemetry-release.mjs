import { createHash } from "node:crypto";

const EXPECTED_NOTICE_VERSION = "2026-08-02";
const EXPECTED_HOST = "https://us.i.posthog.com";
const EXPECTED_METADATA_URL = "https://www.corneta.live/api/v1/health";
const PROJECT_TOKEN_RE = /^phc_[A-Za-z0-9_-]{8,}$/;
const BUILD_SHA_RE = /^[a-f0-9]{40}$/i;

const alwaysRequired = [
  "VITE_BUILD_SHA",
  "CORNETA_BUILD_SHA",
  "NEXT_PUBLIC_BUILD_SHA",
  "BUILD_SHA",
  "VITE_TELEMETRY_DISABLED",
  "TELEMETRY_DISABLED",
  "TELEMETRY_POLICY_PUBLISHED_VERSION",
  "TELEMETRY_DEPLOYMENT_METADATA_URL",
];
const enabledRequired = [
  "VITE_POSTHOG_TOKEN",
  "VITE_POSTHOG_HOST",
  "POSTHOG_DESKTOP_TOKEN",
  "POSTHOG_HOST",
  "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "POSTHOG_PROJECT_TOKEN",
];

const missingAlways = alwaysRequired.filter(
  (name) => !process.env[name]?.trim(),
);
if (missingAlways.length) {
  console.error(
    `Release blocked: missing telemetry configuration (${missingAlways.join(", ")}).`,
  );
  process.exit(1);
}

const failures = [];
const webviewDisabled = process.env.VITE_TELEMETRY_DISABLED === "1";
const nativeDisabled = process.env.TELEMETRY_DISABLED === "1";
for (const name of ["VITE_TELEMETRY_DISABLED", "TELEMETRY_DISABLED"]) {
  if (!/^[01]$/.test(process.env[name])) {
    failures.push(`${name} must be exactly 0 or 1`);
  }
}
if (webviewDisabled !== nativeDisabled) {
  failures.push(
    "VITE_TELEMETRY_DISABLED and TELEMETRY_DISABLED kill switches must change together",
  );
}
const telemetryDisabled = webviewDisabled && nativeDisabled;

const buildShaNames = [
  "VITE_BUILD_SHA",
  "CORNETA_BUILD_SHA",
  "NEXT_PUBLIC_BUILD_SHA",
  "BUILD_SHA",
];
for (const name of buildShaNames) {
  if (!BUILD_SHA_RE.test(process.env[name])) {
    failures.push(`${name} must contain the full commit SHA`);
  }
}
const buildShas = buildShaNames.map((name) => process.env[name].toLowerCase());
if (new Set(buildShas).size !== 1) {
  failures.push(
    "desktop, website, and Setup API must use the same release SHA",
  );
}
const expectedBuildSha = buildShas[0];

let expectedProjectTokenSha256 = null;
if (!telemetryDisabled) {
  const missingEnabled = enabledRequired.filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missingEnabled.length) {
    failures.push(
      `active telemetry requires public configuration (${missingEnabled.join(", ")})`,
    );
  } else {
    const projectTokenNames = [
      "VITE_POSTHOG_TOKEN",
      "POSTHOG_DESKTOP_TOKEN",
      "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
      "POSTHOG_PROJECT_TOKEN",
    ];
    const projectTokens = projectTokenNames.map((name) => process.env[name]);
    for (const [index, token] of projectTokens.entries()) {
      if (!PROJECT_TOKEN_RE.test(token)) {
        failures.push(
          `${projectTokenNames[index]} must be a public phc_ project token (never a Personal API Key)`,
        );
      }
    }
    if (new Set(projectTokens).size !== 1) {
      failures.push(
        "desktop, website, and Setup API must use the same production project token",
      );
    }
    if (PROJECT_TOKEN_RE.test(projectTokens[0])) {
      expectedProjectTokenSha256 = createHash("sha256")
        .update(projectTokens[0], "utf8")
        .digest("hex");
    }

    for (const name of [
      "VITE_POSTHOG_HOST",
      "POSTHOG_HOST",
      "NEXT_PUBLIC_POSTHOG_HOST",
    ]) {
      const host = process.env[name].replace(/\/+$/, "");
      if (host !== EXPECTED_HOST) {
        failures.push(`${name} must be ${EXPECTED_HOST} (approved US region)`);
      }
    }
  }
}

if (
  process.env.TELEMETRY_POLICY_PUBLISHED_VERSION !== EXPECTED_NOTICE_VERSION
) {
  failures.push(
    `the published policy must declare notice ${EXPECTED_NOTICE_VERSION}`,
  );
}

const metadataUrl = process.env.TELEMETRY_DEPLOYMENT_METADATA_URL;
if (metadataUrl !== EXPECTED_METADATA_URL) {
  failures.push(
    `TELEMETRY_DEPLOYMENT_METADATA_URL must be ${EXPECTED_METADATA_URL}`,
  );
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateSurface(label, surface, expectedHost) {
  if (!isObject(surface)) {
    failures.push(`production deployment did not report metadata for ${label}`);
    return;
  }
  if (surface.disabled !== telemetryDisabled) {
    failures.push(
      `deployed kill switch in ${label} differs from the release (${String(surface.disabled)})`,
    );
  }
  if (surface.buildSha !== expectedBuildSha) {
    failures.push(`deployed ${label} does not match the release SHA`);
  }
  if (!telemetryDisabled) {
    if (surface.posthogHost !== expectedHost) {
      failures.push(`deployed ${label} uses a different PostHog host`);
    }
    if (surface.projectTokenSha256 !== expectedProjectTokenSha256) {
      failures.push(`deployed ${label} uses a different project token`);
    }
  }
}

async function verifyProductionDeployment() {
  if (metadataUrl !== EXPECTED_METADATA_URL) return;
  try {
    const response = await fetch(metadataUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      failures.push(
        `production deployment metadata returned HTTP ${response.status}`,
      );
      return;
    }
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > 32_768) {
      failures.push("production deployment metadata exceeds 32 KiB");
      return;
    }
    const body = JSON.parse(raw);
    const metadata = isObject(body) ? body.telemetryDeployment : undefined;
    if (!isObject(metadata) || metadata.schemaVersion !== 1) {
      failures.push(
        "production deployment does not expose telemetry metadata v1",
      );
      return;
    }
    validateSurface(
      "site",
      metadata.site,
      process.env.NEXT_PUBLIC_POSTHOG_HOST?.replace(/\/+$/, ""),
    );
    validateSurface(
      "Setup API",
      metadata.setupApi,
      process.env.POSTHOG_HOST?.replace(/\/+$/, ""),
    );
  } catch {
    failures.push("could not validate production deployment metadata");
  }
}

await verifyProductionDeployment();

if (failures.length) {
  console.error(`Release blocked:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(
  telemetryDisabled
    ? `Gate passed: desktop/site/API telemetry disabled, policy ${EXPECTED_NOTICE_VERSION}, and deployment on the same SHA.`
    : `Gate passed: desktop/site/API active in the US region, policy ${EXPECTED_NOTICE_VERSION}, token and SHA verified against the live deployment.`,
);
