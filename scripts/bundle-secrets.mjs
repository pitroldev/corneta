import { environmentCandidates } from "./environment-contract.mjs";

const publicName =
  /_CLIENT_ID$|_REDIRECT_URIS?$|^(VITE_(POSTHOG_TOKEN|POSTHOG_HOST|BUILD_SHA|SETUP_API_URL|TELEMETRY_DISABLED)|NEXT_PUBLIC_(POSTHOG_PROJECT_TOKEN|POSTHOG_HOST|BUILD_SHA|TELEMETRY_DISABLED|DEPLOYMENT_ENV|SITE_URL)|POSTHOG_(DESKTOP_TOKEN|PROJECT_TOKEN|HOST|PROJECT_ID|ENVIRONMENT)|CORNETA_BUILD_SHA|BUILD_SHA|TELEMETRY_DISABLED|TELEMETRY_POLICY_PUBLISHED_VERSION)$/;

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

const pemPrefix = Buffer.from("-----BEGIN ");
const pemHeader = /^-----BEGIN ((?:[A-Z0-9]+ ){0,5}PRIVATE KEY)-----/;
const maximumPemBodyBytes = 64 * 1024;

export function containsPemPrivateKey(bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const start = bytes.indexOf(pemPrefix, offset);
    if (start < 0) return false;
    offset = start + pemPrefix.length;
    const header = bytes
      .toString("latin1", start, Math.min(start + 160, bytes.length))
      .match(pemHeader);
    if (!header) continue;

    const bodyStart = start + header[0].length;
    // Crypto libraries embed NUL-terminated parser markers without any key material.
    if (bytes[bodyStart] === 0) continue;
    const candidate = bytes.subarray(
      bodyStart,
      Math.min(bodyStart + maximumPemBodyBytes, bytes.length),
    );
    const terminator = candidate.indexOf(0);
    const body = candidate
      .subarray(0, terminator < 0 ? candidate.length : terminator)
      .toString("latin1")
      .replace(/\\r\\n|\\n|\\r/g, "\n");
    let payloadLength = 0;
    for (const rawLine of body.split(/\r\n?|\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (
        payloadLength === 0 &&
        /^(?:Proc-Type|DEK-Info):[\x20-\x7e]+$/i.test(line)
      )
        continue;
      const payload = line.match(/^[A-Za-z0-9+/]+={0,2}/)?.[0];
      if (!payload) break;
      payloadLength += payload.replace(/=/g, "").length;
      // A truncated key can still disclose secrets; neither a footer nor valid DER is required.
      if (payloadLength >= 32) return true;
      if (payload.length !== line.length) break;
    }
  }
  return false;
}
