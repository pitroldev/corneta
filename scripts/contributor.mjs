// Explicit, credential-free contributor commands. Official build/release commands
// deliberately do not use this profile, and their production gates stay intact.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const webRequire = createRequire(resolve(root, "web/package.json"));

// Keep only machine/toolchain settings. No inherited OAuth, signing, analytics,
// npm lifecycle hooks, NODE_OPTIONS or arbitrary application environment values.
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
      "O perfil contributor não pode substituir um deploy/release oficial.",
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
    // This public URL validates canonical metadata; it is not a credential or
    // permission to deploy. Keep site.ts's official production checks unchanged.
    NEXT_PUBLIC_SITE_URL: "https://www.corneta.live",
    CARGO_TARGET_DIR: resolve(workspace, ".artifacts/contributor/target"),
  };
}

export function assertNoWebEnv(workspace = root) {
  // Next has automatic dotenv loading and hot reload. Do not rely on its private
  // flags, edit people's dotenv files or copy their secrets into child processes.
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
      "O perfil contributor exige web/ sem arquivos .env reais. Use um clone/worktree limpo; " +
        "nenhum arquivo pessoal será movido ou removido. A .env.example é permitida.",
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
        { tool: "eslint", args: ["src", "--max-warnings=0"] },
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
        "Uso: pnpm contrib:{demo|web|check|web:check|app:dev|app:build}",
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
  if (tool === "bundle-check") return resolve(root, "scripts/check-bundle.mjs");
  const [pkg, entry] = bins[tool] || [];
  if (!pkg) throw new Error("Ferramenta contributor desconhecida.");
  const resolver = cwd === "web" ? webRequire : require;
  return resolve(dirname(resolver.resolve(`${pkg}/package.json`)), entry);
}

async function main() {
  const [task, ...extra] = process.argv.slice(2);
  if (extra.length)
    throw new Error(
      "O perfil contributor não aceita overrides de comandos ou configuração.",
    );
  const plan = contributorPlan(task);
  const env = contributorEnvironment(process.env);
  if (["web", "web:check", "check"].includes(task)) assertNoWebEnv();
  if (task.startsWith("app:")) {
    if (process.platform !== "win32")
      throw new Error("O desktop contributor é suportado no Windows x64.");
    console.log(
      "Corneta Contributor: perfil/cofre separados, sem updater, telemetria ou instalador.\n" +
        "Feche a Corneta real antes de testar: OBS, portas e atalhos ainda são recursos compartilhados.\n" +
        "O comando não inicia uma live nem instala o aplicativo automaticamente.",
    );
  }
  for (const { tool, args, cwd } of plan) {
    // A global Windows pnpm.cmd can hardcode a different Node beside the shim.
    // Run every CLI entry through this exact Node; never nest a shell pnpm chain.
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
