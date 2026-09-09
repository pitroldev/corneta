import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { resolve } from "node:path";
import { sourceFiles } from "./source-files.mjs";

export const telemetryScenarios = ["normal", "burst", "offline", "delayed-sdk"];

export function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

export function assertBenchmarkCheckout(root) {
  for (const folder of [root, resolve(root, "web")]) {
    if (realpathSync(folder) !== resolve(folder))
      throw new Error("Benchmark checkout must not use filesystem links.");
    if (
      readdirSync(folder).some(
        (name) => name.startsWith(".env") && name !== ".env.example",
      )
    )
      throw new Error(
        "Run the telemetry benchmark in a disposable checkout without real dotenv files.",
      );
  }
}

export function telemetrySourceIdentity(root) {
  if (
    realpathSync(root) !== resolve(root) ||
    realpathSync(resolve(root, "src/lib/telemetry.ts")) !==
      resolve(root, "src/lib/telemetry.ts")
  )
    throw new Error("Benchmark source must not use filesystem links.");
  const paths = sourceFiles(root)
    .filter((file) =>
      /^(?:src\/lib\/telemetry[^/]*\.tsx?|scripts\/benchmark-telemetry[^/]*\.(?:mjs|ts|html)|scripts\/(?:contributor|source-files)\.mjs|package\.json|pnpm-lock\.yaml)$/.test(
        file,
      ),
    )
    .filter((file) => existsSync(resolve(root, file)))
    .sort();
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const files = paths.map((file) => {
    const absolute = resolve(root, file);
    if (!lstatSync(absolute).isFile() || realpathSync(absolute) !== absolute)
      throw new Error(
        "Benchmark source must be a regular file, not a filesystem link.",
      );
    return [file, hash(readFileSync(absolute, "utf8").replace(/\r\n/g, "\n"))];
  });
  return { sourceTreeSha256: hash(JSON.stringify(files)), files };
}

export function assertTelemetrySample(sample, enabled) {
  if (
    ![
      sample.peak.queued,
      sample.peak.pending,
      sample.peak.recentEvents,
      sample.peak.recentErrors,
      sample.peak.sdkRetryQueue,
      sample.final.queued,
      sample.final.pending,
      sample.final.dropped,
      sample.final.recentEvents,
      sample.final.recentErrors,
      sample.queueLimit,
      sample.sdkLoads,
      sample.sdkCaptures,
      sample.sdkRetryQueueFinal,
      sample.collectorRequests,
      sample.blockedExternalRequests,
    ].every((value) => Number.isSafeInteger(value) && value >= 0) ||
    sample.queueLimit === 0
  )
    throw new Error("Benchmark counters are missing or invalid.");
  if (
    sample.queueLimit !== 64 ||
    sample.peak.queued > sample.queueLimit ||
    sample.peak.pending > 1
  )
    throw new Error("Telemetry facade exceeded its bounded work contract.");
  if (sample.final.queued !== 0 || sample.final.pending !== 0)
    throw new Error("Telemetry facade did not finish its pending work.");
  if (
    !enabled &&
    (sample.sdkLoads !== 0 ||
      sample.sdkCaptures !== 0 ||
      sample.collectorRequests !== 0)
  )
    throw new Error("Disabled telemetry loaded the SDK or sent a request.");
  if (
    enabled &&
    (sample.sdkLoads !== 1 ||
      sample.sdkCaptures === 0 ||
      sample.collectorRequests === 0)
  )
    throw new Error("Enabled telemetry did not exercise the real SDK.");
  if (sample.peak.sdkRetryQueue !== 0 || sample.sdkRetryQueueFinal !== 0)
    throw new Error(
      "Telemetry retained SDK retries despite single-attempt delivery.",
    );
  if (sample.blockedExternalRequests !== 0)
    throw new Error(
      "The benchmark attempted a non-loopback request; it was blocked.",
    );
}
