import { environmentCandidates } from "./environment-contract.mjs";

const publicName =
  /_CLIENT_ID$|_REDIRECT_URIS?$|^(VITE_(POSTHOG_TOKEN|POSTHOG_HOST|BUILD_SHA|SETUP_API_URL|TELEMETRY_DISABLED)|NEXT_PUBLIC_(POSTHOG_PROJECT_TOKEN|POSTHOG_HOST|BUILD_SHA|TELEMETRY_DISABLED|DEPLOYMENT_ENV|SITE_URL|PRIMARY_CTA_URL)|POSTHOG_(DESKTOP_TOKEN|PROJECT_TOKEN|HOST|PROJECT_ID|ENVIRONMENT)|CORNETA_BUILD_SHA|BUILD_SHA|TELEMETRY_DISABLED|TELEMETRY_POLICY_PUBLISHED_VERSION)$/;

export function dotenvSecretValues(source) {
  return environmentCandidates(source)
    .filter(([name, value]) => !publicName.test(name) && value.length >= 12)
    .map(([name, value]) => ({ name, bytes: Buffer.from(value) }));
}

// Return identities only, never the values found in the artifact.
export function detectedSecretNames(bytes, secrets) {
  return [
    ...new Set(
      secrets
        .filter((secret) => bytes.includes(secret.bytes))
        .map((secret) => secret.name),
    ),
  ];
}
