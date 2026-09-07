import { execFileSync } from "node:child_process";
import { readTelemetryDeploymentMetadata } from "./deployment-metadata";
import { rateLimitConfiguration } from "./rate-limit-core";
import { downloadMetadata } from "../download";

type Environment = Readonly<Record<string, string | undefined>>;
const SHA_RE = /^[a-f0-9]{40}$/i;

export function resolveBuildSha(
  env: Environment,
  gitSha: () => string = () =>
    execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2_000,
    }).trim(),
) {
  const values = [
    env.NEXT_PUBLIC_BUILD_SHA,
    env.BUILD_SHA,
    env.VERCEL_GIT_COMMIT_SHA,
  ]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
  if (
    values.some((s) => !SHA_RE.test(s)) ||
    new Set(values.map((s) => s.toLowerCase())).size > 1
  )
    throw new Error(
      "Os SHAs do site e da API devem identificar o mesmo commit completo.",
    );
  if (values.length) return values[0].toLowerCase();
  try {
    const sha = gitSha();
    return SHA_RE.test(sha) ? sha.toLowerCase() : "";
  } catch {
    return "";
  }
}

export function releaseConfigErrors(env: Environment): string[] {
  const errors: string[] = [];
  const required = [
    "TWITCH_CLIENT_ID",
    "GOOGLE_CLIENT_ID",
    "KICK_CLIENT_ID",
    "KICK_CLIENT_SECRET",
  ];
  for (const name of required)
    if (!env[name]?.trim()) errors.push(`${name}: ausente`);
  if (
    env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") !== "https://www.corneta.live"
  )
    errors.push("NEXT_PUBLIC_SITE_URL: use o domínio canônico HTTPS");
  if (!downloadMetadata(env.NEXT_PUBLIC_PRIMARY_CTA_URL)) {
    errors.push(
      "NEXT_PUBLIC_PRIMARY_CTA_URL: configure a URL HTTPS do instalador .exe em github.com/pitroldev/corneta/releases",
    );
  }
  if (!rateLimitConfiguration(env))
    errors.push(
      "OAuth: configure UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN e OAUTH_RATE_LIMIT_SALT (segredo aleatório de pelo menos 32 caracteres)",
    );
  if (
    env.VERCEL !== "1" &&
    !/^[a-z0-9-]+$/i.test(env.OAUTH_TRUSTED_IP_HEADER ?? "")
  )
    errors.push(
      "OAUTH_TRUSTED_IP_HEADER: configure um header sobrescrito pelo proxy confiável",
    );
  const redirects =
    env.KICK_REDIRECT_URIS?.split(",").map((s) => s.trim()) ?? [];
  if (
    !redirects.includes("http://localhost:7395/callback") ||
    redirects.some(
      (s) =>
        s !== "http://localhost:7395/callback" &&
        s !== "http://127.0.0.1:7395/callback",
    )
  )
    errors.push(
      "KICK_REDIRECT_URIS: use somente os callbacks loopback do desktop cadastrados na Kick",
    );
  if (
    !SHA_RE.test(env.NEXT_PUBLIC_BUILD_SHA ?? "") ||
    env.NEXT_PUBLIC_BUILD_SHA?.toLowerCase() !== env.BUILD_SHA?.toLowerCase()
  )
    errors.push("BUILD_SHA/NEXT_PUBLIC_BUILD_SHA: faltando ou divergentes");
  for (const name of ["TELEMETRY_DISABLED", "NEXT_PUBLIC_TELEMETRY_DISABLED"])
    if (!/^[01]$/.test(env[name] ?? ""))
      errors.push(`${name}: escolha explicitamente 0 ou 1`);
  if (env.TELEMETRY_DISABLED !== env.NEXT_PUBLIC_TELEMETRY_DISABLED)
    errors.push("Os switches de telemetria do site e API devem coincidir");
  if (
    env.TELEMETRY_DISABLED !== "1" ||
    env.NEXT_PUBLIC_TELEMETRY_DISABLED !== "1"
  ) {
    const metadata = readTelemetryDeploymentMetadata(env);
    if (
      !metadata.site.projectTokenSha256 ||
      metadata.site.projectTokenSha256 !== metadata.setupApi.projectTokenSha256
    )
      errors.push(
        "Telemetria: site e API precisam do mesmo project token público phc_ válido",
      );
    if (
      metadata.site.posthogHost !== "https://us.i.posthog.com" ||
      metadata.setupApi.posthogHost !== "https://us.i.posthog.com"
    )
      errors.push("Telemetria: host US obrigatório no site e na API");
    if (
      env.NEXT_PUBLIC_DEPLOYMENT_ENV !== "production" ||
      env.POSTHOG_ENVIRONMENT !== "production"
    )
      errors.push("Telemetria: declare production nas duas superfícies");
  }
  return errors;
}
