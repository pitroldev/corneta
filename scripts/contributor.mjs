import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const webRequire = createRequire(resolve(root, "web/package.json"));

// Allow only toolchain settings; inherited application credentials must not reach children.
const machineKeys = new Set([
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "WINDIR",
  "SYSTEMDRIVE",
  "COMSPEC",
  "TEMP",
  "TMP",
  "TMPDIR",
  "USERPROFILE",
  "HOME",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "PROGRAMW6432",
  "COMMONPROGRAMFILES",
  "COMMONPROGRAMFILES(X86)",
  "COMPUTERNAME",
  "USERNAME",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
  "OS",
  "LANG",
  "LC_ALL",
  "TERM",
  "COLORTERM",
  "CI",
  "NO_COLOR",
  "FORCE_COLOR",
  "CARGO_HOME",
  "RUSTUP_HOME",
  "RUSTUP_TOOLCHAIN",
  "RUSTC_WRAPPER",
  "SCCACHE_DIR",
  "SCCACHE_CACHE_SIZE",
  "SCCACHE_SERVER_PORT",
  "PNPM_HOME",
  "INCLUDE",
  "LIB",
  "LIBPATH",
  "VCTOOLSINSTALLDIR",
  "VCINSTALLDIR",
  "VSINSTALLDIR",
  "WINDOWSSDKDIR",
  "WINDOWSSDKVERSION",
  "UNIVERSALCRTSDKDIR",
  "UCRTVERSION",
  "EXTENSIONSDKDIR",
  "VSCMD_ARG_TGT_ARCH",
  "VSCMD_ARG_HOST_ARCH",
]);

export function contributorEnvironment(source, workspace = root) {
  if (
    source.VERCEL_ENV === "production" ||
    source.CORNETA_RELEASE_CHECK === "1"
  ) {
    throw new Error(
      "The contributor profile cannot replace an official deployment or release.",
    );
  }
  const env = Object.fromEntries(
    Object.entries(source).filter(([key]) =>
      machineKeys.has(key.toUpperCase()),
    ),
  );
  const pathKey =
    Object.keys(env).find((key) => key.toUpperCase() === "PATH") || "PATH";
  // Child pnpm/Tauri hooks must use the same pinned Node as this launcher.
  env[pathKey] =
    `${dirname(process.execPath)}${delimiter}${env[pathKey] || ""}`;
  return {
    ...env,
    CORNETA_CONTRIBUTOR: "1",
    VITE_CONTRIBUTOR: "1",
    TELEMETRY_DISABLED: "1",
    VITE_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_TELEMETRY_DISABLED: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    // Canonical metadata still uses the public origin; this profile cannot deploy.
    NEXT_PUBLIC_SITE_URL: "https://www.corneta.live",
    CARGO_TARGET_DIR: resolve(workspace, ".artifacts/contributor/target"),
  };
}

export function assertNoWebEnv(workspace = root) {
  // Next reloads dotenv automatically, so environment sanitization alone is insufficient.
  const files = [
    ".env",
    ".env.local",
    ".env.development",
    ".env.development.local",
    ".env.production",
    ".env.production.local",
    ".env.test",
    ".env.test.local",
  ];
  if (files.some((file) => existsSync(resolve(workspace, "web", file)))) {
    throw new Error(
      "The contributor profile requires web/ without real .env files. Use a clean clone/worktree; " +
        "no personal files will be moved or removed. .env.example is allowed.",
    );
  }
}

export function contributorPlan(task) {
  const frontendBuild = [
    { tool: "tsc", args: ["--noEmit"] },
    { tool: "vite", args: ["build"] },
    { tool: "bundle-check", args: [] },
  ];
  const webCheck = [
    {
      tool: "tsx",
      args: ["scripts/check-editorial-content.ts", "--manifest"],
      cwd: "web",
    },
    { tool: "eslint", args: ["."], cwd: "web" },
    { tool: "tsc", args: ["--noEmit"], cwd: "web" },
    { tool: "next", args: ["build"], cwd: "web" },
  ];
  switch (task) {
    case "demo":
      return [{ tool: "vite", args: ["--host", "127.0.0.1"] }];
    case "web":
      return [
        {
          tool: "next",
          args: ["dev", "--port", "7390", "--hostname", "127.0.0.1"],
          cwd: "web",
        },
      ];
    case "check":
      return [
        { tool: "format-check", args: [] },
        { tool: "doc-links", args: [] },
        { tool: "scripts-syntax", args: [] },
        {
          tool: "eslint",
          args: [
            "src",
            "scripts",
            "*.config.js",
            "*.config.ts",
            "--max-warnings=0",
          ],
        },
        { tool: "vitest", args: ["run"] },
        ...frontendBuild,
        ...webCheck,
      ];
    case "web:check":
      return webCheck;
    case "frontend:build":
      // Internal Tauri hook: no shell-based pnpm chain or personal dotenv loader.
      return frontendBuild;
    case "app:dev":
      return [
        {
          tool: "tauri",
          args: ["dev", "--config", "src-tauri/tauri.contributor.conf.json"],
        },
      ];
    case "app:build":
      return [
        {
          tool: "tauri",
          args: [
            "build",
            "--no-bundle",
            "--config",
            "src-tauri/tauri.contributor.conf.json",
          ],
        },
      ];
    default:
      throw new Error(
        "Usage: pnpm contrib:{demo|web|check|web:check|app:dev|app:build}",
      );
  }
}

export function contributorToolScript(tool, cwd) {
  const bins = {
    vite: ["vite", "bin/vite.js"],
    tauri: ["@tauri-apps/cli", "tauri.js"],
    eslint: ["eslint", "bin/eslint.js"],
    tsc: ["typescript", "bin/tsc"],
    vitest: ["vitest", "vitest.mjs"],
    next: ["next", "dist/bin/next"],
    tsx: ["tsx", "dist/cli.mjs"],
  };
  const localScripts = {
    "bundle-check": "check-bundle.mjs",
    "format-check": "check-format.mjs",
    "doc-links": "check-doc-links.mjs",
    "scripts-syntax": "check-scripts.mjs",
  };
  if (localScripts[tool]) return resolve(root, "scripts", localScripts[tool]);
  const [pkg, entry] = bins[tool] || [];
  if (!pkg) throw new Error("Unknown contributor tool.");
  const resolver = cwd === "web" ? webRequire : require;
  return resolve(dirname(resolver.resolve(`${pkg}/package.json`)), entry);
}

async function main() {
  const [task, ...extra] = process.argv.slice(2);
  if (extra.length)
    throw new Error(
      "The contributor profile does not accept command or configuration overrides.",
    );
  const plan = contributorPlan(task);
  const env = contributorEnvironment(process.env);
  if (["web", "web:check", "check"].includes(task)) assertNoWebEnv();
  if (task.startsWith("app:")) {
    if (process.platform !== "win32")
      throw new Error("The contributor desktop is supported on Windows x64.");
    console.log(
      "Corneta Contributor: isolated profile/vault, without updater, telemetry, or installer.\n" +
        "Close the production Corneta app before testing: OBS, ports, and shortcuts are still shared resources.\n" +
        "This command does not start a stream or install the app automatically.",
    );
  }
  for (const { tool, args, cwd } of plan) {
    // Windows pnpm.cmd may hardcode another Node; use this runtime for every CLI.
    const script = contributorToolScript(tool, cwd);
    console.log(`contributor: ${cwd || "app"} / ${tool}`);
    const status = await new Promise((complete, reject) => {
      const child = spawn(process.execPath, [script, ...args], {
        cwd: cwd === "web" ? resolve(root, "web") : root,
        env,
        stdio: "inherit",
        shell: false,
      });
      child.once("error", reject);
      child.once("exit", (code) => complete(code ?? 1));
    });
    if (status !== 0) {
      process.exitCode = status;
      return;
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
