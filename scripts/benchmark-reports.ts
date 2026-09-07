import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, release, totalmem } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { analyze, parseSession } from "../src/lib/report";
import { interpolate, type Vars } from "../src/lib/i18n/locale";
import { pt, type MessageKey } from "../src/lib/i18n/pt";

const t = (key: MessageKey, vars?: Vars) => interpolate(pt[key], vars);
const sampleCount = 14_400;
const platforms = ["twitch", "youtube", "kick", "custom"].map((id) => ({
  id,
  name: id,
  platformId: id,
}));
const lines: object[] = [
  {
    kind: "meta",
    schemaVersion: 4,
    id: "1768478400000",
    startedAt: 0,
    mode: "per-platform",
    platforms,
  },
];
for (let index = 0; index < sampleCount; index++) {
  const incident = index % 1800 >= 900 && index % 1800 < 918;
  lines.push({
    kind: "sample",
    t: index * 2000,
    cpu: incident ? 91 : 48,
    gpu: incident ? 97 : 62,
    memoryPct: 55,
    targets: platforms.map(({ id, name }) => ({
      id,
      name,
      state: "live",
      bitrate: incident ? 4200 : 6000,
      fps: 60,
      dropped: 0,
    })),
  });
}
lines.push({ kind: "end", endedAt: sampleCount * 2000 });
const input = lines.map((line) => JSON.stringify(line)).join("\n");
const warmup = 5;
const iterations = 25;
const samples: number[] = [];
for (let run = 0; run < warmup + iterations; run++) {
  const start = performance.now();
  const data = parseSession(input, t);
  if (!data || data.samples.length !== sampleCount)
    throw new Error("Fixture de benchmark inválida.");
  analyze(data, t);
  const elapsed = performance.now() - start;
  if (run >= warmup) samples.push(elapsed);
}
samples.sort((a, b) => a - b);
const percentile = (p: number) =>
  Number(samples[Math.ceil(p * samples.length) - 1].toFixed(2));
const result = {
  schemaVersion: 1,
  scenario: "report-8h-4-targets-v1",
  measuredAt: new Date().toISOString(),
  runtime: {
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    osRelease: release(),
    cpuModel: cpus()[0]?.model,
    logicalCpus: cpus().length,
    memoryGiB: Math.round(totalmem() / 2 ** 30),
  },
  sampleCount,
  inputBytes: Buffer.byteLength(input),
  warmup,
  iterations,
  milliseconds: {
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: samples.at(-1),
  },
  scope:
    "JSON parse, normalização e análise no Node; exclui serialização da fixture, disco, React, GPU e IPC. Não mede startup, RSS da live ou vazamento de memória.",
};
const destination = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../.artifacts/performance",
);
mkdirSync(destination, { recursive: true });
writeFileSync(
  resolve(destination, "report.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(JSON.stringify(result, null, 2));
if (result.milliseconds.p95 > 750)
  throw new Error(
    "Regressão: análise p95 excede 750 ms neste cenário sintético.",
  );
