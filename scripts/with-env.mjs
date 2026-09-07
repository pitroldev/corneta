// Trusted maintainer commands only. The root .env is passed to the CHILD process,
// including signing credentials; this launcher is not a sandbox or a bundling
// allowlist. Use contrib:* for credential-free development. See CONFIGURACAO.md.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnvironment } from "./environment-contract.mjs";

const require = createRequire(import.meta.url);
const rootEnv = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");

export function mergeEnvironment(
  source,
  inherited,
  platform = process.platform,
) {
  const env = { ...inherited };
  const normalize = (key) => (platform === "win32" ? key.toUpperCase() : key);
  const existing = new Set(Object.keys(inherited).map(normalize));
  let loaded = 0;
  // Native Node dotenv semantics: quoted multiline values, comments, export,
  // empty strings and no shell/$VARIABLE interpolation. A present but EMPTY
  // inherited value still wins (notably TAURI_SIGNING_PRIVATE_KEY_PASSWORD).
  for (const [key, value] of Object.entries(parseEnvironment(source))) {
    if (existing.has(normalize(key))) continue;
    Object.defineProperty(env, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    existing.add(normalize(key));
    loaded++;
  }
  return { env, loaded };
}

export function loadEnvironmentFile(
  path,
  inherited,
  { read = readFileSync, platform = process.platform } = {},
) {
  let source;
  try {
    source = read(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { env: { ...inherited }, loaded: 0, missing: true };
    }
    // Permission/I/O failures must not look like no .env. Do not echo paths,
    // file contents or low-level error messages: they can contain credentials.
    throw new Error(
      "with-env: não foi possível ler o arquivo de configuração.",
    );
  }
  try {
    return { ...mergeEnvironment(source, inherited, platform), missing: false };
  } catch {
    throw new Error("with-env: não foi possível interpretar a configuração.");
  }
}

export function commandInvocation(
  command,
  args,
  {
    platform = process.platform,
    node = process.execPath,
    resolveTauri = () => require.resolve("@tauri-apps/cli/tauri.js"),
  } = {},
) {
  if (
    !command ||
    command.includes("\0") ||
    args.some((arg) => arg.includes("\0"))
  ) {
    throw new Error("with-env: comando ou argumentos inválidos.");
  }
  // A pnpm Windows shim is a .cmd, which Node cannot execute without cmd.exe.
  // Resolve our CLI to JS instead: same pinned Node and literal arguments.
  if (
    command === "tauri" ||
    (platform === "win32" && command === "tauri.cmd")
  ) {
    let script;
    try {
      script = resolveTauri();
    } catch {
      throw new Error("with-env: CLI Tauri ausente; execute pnpm install.");
    }
    return { command: node, args: [script, ...args], usesRust: true };
  }
  if (platform === "win32" && /\.(?:cmd|bat)$/i.test(command)) {
    throw new Error(
      "with-env: scripts .cmd/.bat não são suportados; use um executável ou node com o arquivo JS.",
    );
  }
  return {
    command,
    args: [...args],
    usesRust: /(?:^|[\\/])cargo(?:\.exe)?$/i.test(command),
  };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    console.error(
      "uso: node scripts/with-env.mjs <executável|tauri> [args...]",
    );
    process.exitCode = 2;
    return;
  }
  const invocation = commandInvocation(command, args);
  const { env, loaded, missing } = loadEnvironmentFile(rootEnv, process.env);
  console.log(
    missing
      ? "with-env: sem .env; usando o ambiente do processo"
      : `with-env: ${loaded} variável(is) do .env carregada(s)`,
  );
  const wrapperConfigured = Object.keys(env).some((key) =>
    process.platform === "win32"
      ? key.toUpperCase() === "RUSTC_WRAPPER"
      : key === "RUSTC_WRAPPER",
  );
  if (invocation.usesRust && !wrapperConfigured) {
    const probe = spawnSync("sccache", ["--version"], {
      env,
      stdio: "ignore",
      shell: false,
      timeout: 3000,
    });
    if (!probe.error && probe.status === 0) {
      env.RUSTC_WRAPPER = "sccache";
      console.log("with-env: sccache ativado para esta compilação Rust");
    }
  }
  process.exitCode = await new Promise((complete, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      env,
      stdio: "inherit",
      shell: false,
    });
    child.once("exit", (code) => complete(code ?? 1));
    child.once("error", () =>
      reject(
        new Error("with-env: não foi possível iniciar o comando solicitado."),
      ),
    );
  });
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
