import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

export function editorialBuildChecks(env) {
  const checks = [["scripts/check-editorial-content.ts", "--manifest"]];
  if (env.VERCEL_ENV === "production" || env.CORNETA_RELEASE_CHECK === "1") {
    checks.push([
      "scripts/check-editorial-maintenance.ts",
      "--fail-on-overdue",
    ]);
  }
  return checks;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const tsx = resolve(
    dirname(require.resolve("tsx/package.json")),
    "dist/cli.mjs",
  );
  for (const args of editorialBuildChecks(process.env)) {
    const result = spawnSync(process.execPath, [tsx, ...args], {
      cwd: webRoot,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      break;
    }
  }
}
