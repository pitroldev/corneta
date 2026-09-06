import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

const root = fileURLToPath(new URL("../", import.meta.url));
const steps = [
  {
    name: "typecheck",
    command: process.execPath,
    args: [resolve(root, "node_modules/typescript/bin/tsc"), "--noEmit"],
    cwd: root,
  },
  {
    name: "vite",
    command: process.execPath,
    args: [resolve(root, "node_modules/vite/bin/vite.js"), "build"],
    cwd: root,
  },
];
if (process.argv.includes("--rust"))
  steps.push({
    name: "cargo-check",
    command: "cargo",
    args: ["check", "--lib"],
    cwd: resolve(root, "src-tauri"),
  });
const results = [];
for (const step of steps) {
  const started = performance.now();
  const result = spawnSync(step.command, step.args, {
    cwd: step.cwd,
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      TELEMETRY_DISABLED: "1",
      VITE_TELEMETRY_DISABLED: "1",
    },
  });
  results.push({
    step: step.name,
    elapsedMs: Math.round(performance.now() - started),
    status: result.status,
  });
  if (result.error || result.status !== 0) {
    process.exitCode = 1;
    break;
  }
}
console.log(
  JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      cache: "existing (run again for warm comparison)",
      results,
    },
    null,
    2,
  ),
);
