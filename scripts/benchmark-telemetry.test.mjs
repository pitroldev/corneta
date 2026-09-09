import { afterEach, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
  assertBenchmarkCheckout,
  assertTelemetrySample,
  percentile,
  telemetrySourceIdentity,
} from "./benchmark-telemetry-core.mjs";

const directories = [];
const temporaryParent = realpathSync(tmpdir());
afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (
      dirname(directory) !== temporaryParent ||
      !basename(directory).startsWith("corneta-telemetry-test-")
    )
      throw new Error("Invalid benchmark test cleanup.");
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture(sources = true) {
  const root = mkdtempSync(join(temporaryParent, "corneta-telemetry-test-"));
  directories.push(root);
  for (const folder of sources ? ["src/lib", "scripts", "web"] : ["web"])
    mkdirSync(join(root, folder), { recursive: true });
  if (sources)
    writeFileSync(
      join(root, "src/lib/telemetry.ts"),
      "export const fixture = 1;\n",
    );
  return root;
}

it("rejects any real dotenv filename without reading its contents", () => {
  const root = fixture();
  writeFileSync(join(root, ".env.example"), "");
  expect(() => assertBenchmarkCheckout(root)).not.toThrow();
  mkdirSync(join(root, "web/.env.production.local"));
  expect(() => assertBenchmarkCheckout(root)).toThrow(/disposable checkout/);
});

it("rejects linked roots and source parent directories before fingerprinting", () => {
  const root = fixture(false);
  const target = fixture();
  const type = process.platform === "win32" ? "junction" : "dir";
  symlinkSync(join(target, "src"), join(root, "src"), type);
  expect(() => telemetrySourceIdentity(root)).toThrow(/filesystem links/);
  const alias = join(root, "alias");
  symlinkSync(target, alias, type);
  expect(() => assertBenchmarkCheckout(alias)).toThrow(/filesystem links/);
  expect(() => telemetrySourceIdentity(alias)).toThrow(/filesystem links/);
});

it("fingerprints facade and benchmark changes, excluding credentials and output", () => {
  const root = fixture();
  const before = telemetrySourceIdentity(root).sourceTreeSha256;
  writeFileSync(join(root, ".env"), "SYNTHETIC=not-read");
  expect(telemetrySourceIdentity(root).sourceTreeSha256).toBe(before);
  writeFileSync(
    join(root, "scripts/benchmark-telemetry-browser.ts"),
    "export const marker = 1;",
  );
  expect(telemetrySourceIdentity(root).sourceTreeSha256).not.toBe(before);
});

it("reports descriptive percentiles without imposing a machine-dependent timing gate", () => {
  expect(percentile([], 0.95)).toBeNull();
  expect(percentile([40, 1, 3, 2], 0.5)).toBe(2);
  expect(percentile([40, 1, 3, 2], 0.95)).toBe(40);
});

it("checks bounded work, opt-out, single-attempt delivery and network invariants", () => {
  const sample = {
    peak: {
      queued: 64,
      pending: 1,
      recentEvents: 64,
      recentErrors: 10,
      sdkRetryQueue: 0,
    },
    final: {
      queued: 0,
      pending: 0,
      dropped: 0,
      recentEvents: 64,
      recentErrors: 10,
    },
    queueLimit: 64,
    sdkLoads: 1,
    sdkCaptures: 10,
    collectorRequests: 10,
    blockedExternalRequests: 0,
    sdkRetryQueueFinal: 0,
  };
  expect(() => assertTelemetrySample(sample, true)).not.toThrow();
  expect(() =>
    assertTelemetrySample({ ...sample, queueLimit: 128 }, true),
  ).toThrow(/bounded/);
  expect(() =>
    assertTelemetrySample(
      { ...sample, peak: { ...sample.peak, queued: 65 } },
      true,
    ),
  ).toThrow(/bounded/);
  expect(() =>
    assertTelemetrySample(
      { ...sample, peak: { ...sample.peak, pending: 2 } },
      true,
    ),
  ).toThrow(/bounded/);
  expect(() =>
    assertTelemetrySample(
      { ...sample, final: { ...sample.final, queued: 1 } },
      true,
    ),
  ).toThrow(/finish/);
  expect(() => assertTelemetrySample(sample, false)).toThrow(/Disabled/);
  expect(() =>
    assertTelemetrySample({ ...sample, sdkCaptures: 0 }, true),
  ).toThrow(/real SDK/);
  expect(() =>
    assertTelemetrySample({ ...sample, collectorRequests: 0 }, true),
  ).toThrow(/real SDK/);
  expect(() =>
    assertTelemetrySample(
      { ...sample, scenario: "offline", sdkRetryQueueFinal: 1 },
      true,
    ),
  ).toThrow(/retries/);
  expect(() =>
    assertTelemetrySample({ ...sample, blockedExternalRequests: 1 }, true),
  ).toThrow(/blocked/);
  expect(() =>
    assertTelemetrySample(
      { ...sample, peak: { ...sample.peak, queued: NaN } },
      true,
    ),
  ).toThrow(/invalid/);
  expect(() =>
    assertTelemetrySample(
      { ...sample, final: { ...sample.final, dropped: undefined } },
      true,
    ),
  ).toThrow(/invalid/);
  expect(() =>
    assertTelemetrySample({ ...sample, sdkRetryQueueFinal: NaN }, true),
  ).toThrow(/invalid/);
  expect(() =>
    assertTelemetrySample(
      { ...sample, peak: { ...sample.peak, sdkRetryQueue: 1 } },
      true,
    ),
  ).toThrow(/retries/);
});
