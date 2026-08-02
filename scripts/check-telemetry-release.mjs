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
    `Release bloqueada: configuração de telemetria ausente (${missingAlways.join(", ")}).`,
  );
  process.exit(1);
}

const failures = [];
const webviewDisabled = process.env.VITE_TELEMETRY_DISABLED === "1";
const nativeDisabled = process.env.TELEMETRY_DISABLED === "1";
for (const name of ["VITE_TELEMETRY_DISABLED", "TELEMETRY_DISABLED"]) {
  if (!/^[01]$/.test(process.env[name])) {
    failures.push(`${name} deve ser exatamente 0 ou 1`);
  }
}
if (webviewDisabled !== nativeDisabled) {
  failures.push(
    "os kill switches VITE_TELEMETRY_DISABLED e TELEMETRY_DISABLED devem mudar juntos",
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
    failures.push(`${name} deve conter o SHA completo do commit`);
  }
}
const buildShas = buildShaNames.map((name) => process.env[name].toLowerCase());
if (new Set(buildShas).size !== 1) {
  failures.push("desktop, site e Setup API devem usar o mesmo SHA de release");
}
const expectedBuildSha = buildShas[0];

let expectedProjectTokenSha256 = null;
if (!telemetryDisabled) {
  const missingEnabled = enabledRequired.filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missingEnabled.length) {
    failures.push(
      `telemetria ativa exige configuração pública (${missingEnabled.join(", ")})`,
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
          `${projectTokenNames[index]} deve ser um project token público phc_ (nunca Personal API Key)`,
        );
      }
    }
    if (new Set(projectTokens).size !== 1) {
      failures.push(
        "desktop, site e Setup API devem usar o mesmo project token de produção",
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
        failures.push(`${name} deve ser ${EXPECTED_HOST} (região US aprovada)`);
      }
    }
  }
}

if (
  process.env.TELEMETRY_POLICY_PUBLISHED_VERSION !== EXPECTED_NOTICE_VERSION
) {
  failures.push(
    `a política publicada deve declarar o aviso ${EXPECTED_NOTICE_VERSION}`,
  );
}

const metadataUrl = process.env.TELEMETRY_DEPLOYMENT_METADATA_URL;
if (metadataUrl !== EXPECTED_METADATA_URL) {
  failures.push(
    `TELEMETRY_DEPLOYMENT_METADATA_URL deve ser ${EXPECTED_METADATA_URL}`,
  );
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateSurface(label, surface, expectedHost) {
  if (!isObject(surface)) {
    failures.push(`deploy de produção não informou metadata de ${label}`);
    return;
  }
  if (surface.disabled !== telemetryDisabled) {
    failures.push(
      `kill switch implantado em ${label} diverge da release (${String(surface.disabled)})`,
    );
  }
  if (surface.buildSha !== expectedBuildSha) {
    failures.push(`${label} implantado não corresponde ao SHA da release`);
  }
  if (!telemetryDisabled) {
    if (surface.posthogHost !== expectedHost) {
      failures.push(`${label} implantado usa host PostHog diferente`);
    }
    if (surface.projectTokenSha256 !== expectedProjectTokenSha256) {
      failures.push(`${label} implantado usa project token diferente`);
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
        `metadata do deploy de produção respondeu HTTP ${response.status}`,
      );
      return;
    }
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > 32_768) {
      failures.push("metadata do deploy de produção excede 32 KiB");
      return;
    }
    const body = JSON.parse(raw);
    const metadata = isObject(body) ? body.telemetryDeployment : undefined;
    if (!isObject(metadata) || metadata.schemaVersion !== 1) {
      failures.push("deploy de produção não expõe metadata de telemetria v1");
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
    failures.push("não foi possível validar a metadata do deploy de produção");
  }
}

await verifyProductionDeployment();

if (failures.length) {
  console.error(`Release bloqueada:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(
  telemetryDisabled
    ? `Gate aprovado: telemetria desativada em desktop/site/API, política ${EXPECTED_NOTICE_VERSION} e deploy no mesmo SHA.`
    : `Gate aprovado: desktop/site/API ativos na região US, política ${EXPECTED_NOTICE_VERSION}, token e SHA conferidos contra o deploy real.`,
);
