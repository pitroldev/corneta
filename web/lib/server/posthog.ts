import "server-only";

import { PostHog } from "posthog-node";
import {
  normalizePostHogHost,
  redactPostHogMessage,
} from "../telemetry-schema";
import {
  createTelemetryReporter,
  type ApiFailure,
  type TelemetrySink,
} from "./telemetry-reporter";

type ServerTelemetryConfig = {
  token: string;
  host: string;
  environment: string;
  buildSha?: string;
};

declare global {
  var cornetaPostHogClient: PostHog | undefined;
  var cornetaTelemetryReporter:
    ReturnType<typeof createTelemetryReporter> | undefined;
}

function first(...values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

export function readPostHogServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerTelemetryConfig | null {
  if (env.TELEMETRY_DISABLED === "1") return null;
  const token = first(
    env.POSTHOG_PROJECT_TOKEN,
    env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
  );
  const host = normalizePostHogHost(
    first(env.POSTHOG_HOST, env.NEXT_PUBLIC_POSTHOG_HOST),
  );
  if (!token || !/^phc_[A-Za-z0-9_-]{8,}$/.test(token) || !host) return null;

  return {
    token,
    host,
    environment: first(
      env.POSTHOG_ENVIRONMENT,
      env.VERCEL_ENV,
      env.NODE_ENV,
      "unknown",
    )!,
    buildSha: first(env.BUILD_SHA, env.VERCEL_GIT_COMMIT_SHA),
  };
}

function getPostHogClient(config: ServerTelemetryConfig) {
  if (globalThis.cornetaPostHogClient) return globalThis.cornetaPostHogClient;
  globalThis.cornetaPostHogClient = new PostHog(config.token, {
    host: config.host,
    flushAt: 1,
    flushInterval: 0,
    requestTimeout: 3_000,
    fetchRetryCount: 1,
    fetchRetryDelay: 250,
    enableExceptionAutocapture: false,
    enableLocalEvaluation: false,
    before_send: redactPostHogMessage,
  });
  return globalThis.cornetaPostHogClient;
}

function getReporter() {
  if (globalThis.cornetaTelemetryReporter) {
    return globalThis.cornetaTelemetryReporter;
  }
  const config = readPostHogServerConfig();
  if (!config) {
    globalThis.cornetaTelemetryReporter = createTelemetryReporter({});
    return globalThis.cornetaTelemetryReporter;
  }

  const client = getPostHogClient(config);
  const sink: TelemetrySink = {
    capture: (message) =>
      client.captureImmediate({ ...message, disableGeoip: true }),
    captureException: (error, distinctId, properties) =>
      client.captureExceptionImmediate(error, distinctId, {
        ...properties,
        $geoip_disable: true,
      }),
  };
  globalThis.cornetaTelemetryReporter = createTelemetryReporter({
    sink,
    environment: config.environment,
    buildSha: config.buildSha,
  });
  return globalThis.cornetaTelemetryReporter;
}

export function reportApiFailure(failure: ApiFailure) {
  return getReporter().reportApiFailure(failure);
}
