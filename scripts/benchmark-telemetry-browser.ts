import type { PostHogConfig } from "posthog-js/dist/module.no-external";
import type {
  TelemetryEventMap,
  TelemetryStatus,
} from "../src/lib/telemetry-schema";

type Facade = typeof import("../src/lib/telemetry");
type Sdk = (typeof import("posthog-js/dist/module.no-external"))["default"];
type InjectedSdk = Awaited<
  ReturnType<
    NonNullable<Parameters<Facade["__configureTelemetryForTests"]>[0]["loader"]>
  >
>;
type Scenario = "normal" | "burst" | "offline" | "delayed-sdk";
const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
let facade: Facade;
let sdk: Sdk | undefined;
let sdkLoads = 0;
let sdkCaptures = 0;
let sdkLoadMs: number | null = null;
let sdkInitMs: number | null = null;
let facadeImportMs = 0;
let initializeMs = 0;

async function prepare(enabled: boolean, scenario: Scenario) {
  const started = performance.now();
  facade = await import("../src/lib/telemetry");
  facadeImportMs = performance.now() - started;
  facade.__configureTelemetryForTests({
    config: {
      token: "phc_synthetic_benchmark_only",
      host: "https://telemetry.invalid",
      buildSha: "0".repeat(40),
      disabled: false,
      environment: "development",
    },
    loader: async () => {
      sdkLoads++;
      if (scenario === "delayed-sdk") await pause(400);
      const loadStarted = performance.now();
      const module = await import("posthog-js/dist/module.no-external");
      sdkLoadMs = performance.now() - loadStarted;
      const { createTelemetryTransport } =
        await import("../src/lib/telemetry-transport");
      return {
        init(token: string, options: Partial<PostHogConfig>) {
          const initStarted = performance.now();
          // The facade receives fictitious configuration; the real SDK can only use this loopback sink.
          const instance = new module.PostHog().init(token, {
            ...options,
            api_host: globalThis.location.origin,
          })!;
          const transport = createTelemetryTransport(instance);
          sdk = instance;
          sdkInitMs = performance.now() - initStarted;
          const capture = instance.capture.bind(instance);
          instance.capture = (...args) => {
            sdkCaptures++;
            return capture(...args);
          };
          return Object.assign(instance, {
            closeTelemetryTransport: transport.close,
          });
        },
      } as unknown as InjectedSdk;
    },
  });
  const status: TelemetryStatus = {
    schemaVersion: 1,
    noticeVersion: (await import("../src/lib/telemetry-schema"))
      .TELEMETRY_NOTICE_VERSION,
    usage: enabled ? "enabled" : "disabled",
    crashReports: enabled ? "enabled" : "disabled",
    installationId: enabled ? "00000000-0000-4000-8000-000000000001" : null,
    decidedAt: "2026-01-01T00:00:00.000Z",
  };
  const initializeStarted = performance.now();
  await facade.initializeTelemetry({
    telemetryStatus: async () => status,
    telemetrySetConsent: async (input) => Object.assign(status, input),
    telemetryRegenerateId: async () => status,
  });
  initializeMs = performance.now() - initializeStarted;
  if (scenario !== "delayed-sdk") await facade.flushTelemetry(2000);
}

async function run(scenario: Scenario) {
  const peak = {
    queued: 0,
    pending: 0,
    recentEvents: 0,
    recentErrors: 0,
    sdkRetryQueue: 0,
  };
  const sample = () => {
    const current = facade.__getTelemetryDiagnosticsForTests();
    for (const key of [
      "queued",
      "pending",
      "recentEvents",
      "recentErrors",
    ] as const)
      peak[key] = Math.max(peak[key], current[key]);
    peak.sdkRetryQueue = Math.max(
      peak.sdkRetryQueue,
      sdk?._retryQueue?.length ?? 0,
    );
  };
  const timerDelays: number[] = [];
  const frameIntervals: number[] = [];
  const longTasks: number[] = [];
  let previousTimer = performance.now();
  let previousFrame: number | undefined;
  let frameHandle = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    timerDelays.push(Math.max(0, now - previousTimer - 16));
    previousTimer = now;
    globalThis.document.getElementById("heartbeat")!.textContent = String(
      timerDelays.length,
    );
    sample();
  }, 16);
  const frame = (now: number) => {
    if (previousFrame !== undefined) frameIntervals.push(now - previousFrame);
    previousFrame = now;
    frameHandle = globalThis.requestAnimationFrame(frame);
  };
  frameHandle = globalThis.requestAnimationFrame(frame);
  const observer = new globalThis.PerformanceObserver((list) => {
    for (const entry of list.getEntries()) longTasks.push(entry.duration);
  });
  observer.observe({ entryTypes: ["longtask"] });
  const attempts = scenario === "normal" ? 24 : 5000;
  const started = performance.now();
  let captureLoopMs = 0;
  try {
    for (let index = 0; index < attempts; index++) {
      const properties: TelemetryEventMap["live_start_requested"] = {
        operation_id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
        mode: "passthrough",
        target_count: 1,
        platforms: ["twitch"],
        brb_enabled: false,
        guardian_enabled: false,
        record_video_enabled: false,
      };
      let error: Error | undefined;
      if (index % 10 === 0) {
        error = new Error("Synthetic benchmark error");
        error.stack = `Error: Synthetic benchmark error\n    at benchmark (http://localhost/src/benchmark.tsx:${index + 1}:1)`;
      }
      const before = performance.now();
      facade.capture("live_start_requested", properties);
      if (error) {
        facade.captureException(error, {
          handled: true,
          severity: "error",
          error_code: "unknown_error",
          stage: "window_error",
        });
      }
      captureLoopMs += performance.now() - before;
      sample();
      if (scenario === "normal") await pause(30);
    }
    await pause(
      scenario === "offline" ? 3500 : scenario === "delayed-sdk" ? 800 : 600,
    );
    await facade.flushTelemetry(2000);
    sample();
    return {
      attempts,
      exceptionAttempts: Math.ceil(attempts / 10),
      facadeImportMs,
      initializeMs,
      sdkLoads,
      sdkCaptures,
      sdkLoadMs,
      sdkInitMs,
      captureLoopMs,
      elapsedMs: performance.now() - started,
      timerDelays,
      frameIntervals,
      longTasks,
      peak,
      final: facade.__getTelemetryDiagnosticsForTests(),
      sdkRetryQueueFinal: sdk?._retryQueue?.length ?? 0,
      queueLimit: facade.TELEMETRY_MAX_QUEUED_EVENTS,
    };
  } finally {
    clearInterval(timer);
    globalThis.cancelAnimationFrame(frameHandle);
    observer.disconnect();
  }
}

Object.assign(globalThis, { telemetryBenchmark: { prepare, run } });
