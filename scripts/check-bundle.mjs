import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { entryFiles } from "./entry-budget.mjs";
import { detectedSecretNames, dotenvSecretValues } from "./bundle-secrets.mjs";

const root = process.cwd();
const dist = join(root, "dist");
const assets = join(dist, "assets");
const limit = 110 * 1024;
const requestedRoots = process.argv.slice(2);
const artifactMode = requestedRoots.length > 0;
const resolvedRoots = (artifactMode ? requestedRoots : [dist]).map((path) =>
  resolve(root, path),
);

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const missingRoots = resolvedRoots.filter((path) => !existsSync(path));
if (missingRoots.length) {
  fail(
    `Artefatos esperados não encontrados:\n${missingRoots
      .map((path) => relative(root, path))
      .join("\n")}`,
  );
}
if (!resolvedRoots.length) {
  fail("Nada para verificar: faça o build antes de rodar este gate.");
}

// 1) Budget de tamanho dos chunks do frontend.
const oversized = [];
if (existsSync(assets)) {
  for (const name of readdirSync(assets).filter((file) =>
    file.endsWith(".js"),
  )) {
    const bytes = gzipSync(readFileSync(join(assets, name))).byteLength;
    if (bytes > limit) {
      oversized.push(`${name}: ${(bytes / 1024).toFixed(1)} KiB gzip`);
    }
  }
}
if (oversized.length) {
  fail(`Chunks acima do budget de 110 KiB gzip:\n${oversized.join("\n")}`);
}

// A page split into many individually-small chunks can still have a heavy boot.
// Gate the union of its static graph in addition to the existing per-chunk gate.
const manifestFile = join(dist, ".vite", "manifest.json");
if (!existsSync(manifestFile))
  fail("Manifest ausente: refaça o build antes de verificar as entradas.");
const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
for (const [entry, chunk] of Object.entries(manifest)) {
  if (!chunk.isEntry) continue;
  let javascript = 0;
  let css = 0;
  let other = 0;
  for (const file of entryFiles(manifest, entry)) {
    const path = resolve(dist, file);
    if (!path.startsWith(resolve(dist) + sep))
      fail("Caminho inválido no manifest.");
    const contents = readFileSync(path);
    if (file.endsWith(".js")) javascript += gzipSync(contents).byteLength;
    else if (file.endsWith(".css")) css += gzipSync(contents).byteLength;
    else other += contents.byteLength;
  }
  console.log(
    `Entrada ${entry}: JS ${(javascript / 1024).toFixed(1)} KiB gzip; CSS ${(css / 1024).toFixed(1)} KiB gzip; assets ${(other / 1024).toFixed(1)} KiB`,
  );
  if (javascript > 250 * 1024 || css > 55 * 1024 || other > 256 * 1024)
    fail(`Entrada ${entry} excede o orçamento agregado.`);
}

// 2) Monte a lista de arquivos sem manter todos os binários grandes em memória.
const files = [];
const walk = (path) => {
  if (statSync(path).isFile()) {
    files.push(path);
    return;
  }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) walk(child);
    else files.push(child);
  }
};
for (const path of resolvedRoots) walk(path);

// Em modo artefato, falhe fechado sem 7-Zip e escaneie também a árvore que ele consegue
// extrair do NSIS. Isso cobre o conteúdo instalável; não afirma interpretar formatos opacos
// aninhados que o próprio 7-Zip não consiga abrir.
let extractedRoot;
const cleanupExtractedRoot = () => {
  if (!extractedRoot) return;
  const safeParent = resolve(tmpdir());
  const candidate = resolve(extractedRoot);
  if (
    dirname(candidate) === safeParent &&
    basename(candidate).startsWith("corneta-nsis-")
  ) {
    rmSync(candidate, { recursive: true, force: true });
  }
};
process.once("exit", cleanupExtractedRoot);

if (artifactMode) {
  const installers = files.filter((path) => {
    const normalized = path.replaceAll("\\", "/").toLowerCase();
    return normalized.includes("/bundle/nsis/") && normalized.endsWith(".exe");
  });
  if (installers.length !== 1) {
    fail(
      `Esperado exatamente um instalador em bundle/nsis; encontrados ${installers.length}. Limpe artefatos antigos e refaça o build.`,
    );
  }
  const installer = installers[0];
  if (!existsSync(`${installer}.sig`)) {
    fail(`Assinatura do updater ausente para ${relative(root, installer)}.`);
  }

  const listResult = spawnSync("7z", ["l", "-slt", installer], {
    stdio: "ignore",
    windowsHide: true,
  });
  if (listResult.error?.code === "ENOENT") {
    fail(
      "7-Zip (comando `7z`) é obrigatório no gate de artefatos; scan fechado porque não foi encontrado.",
    );
  }
  if (listResult.error || listResult.status !== 0) {
    fail(
      `7-Zip não conseguiu listar o NSIS ${relative(root, installer)}; artefato bloqueado.`,
    );
  }

  extractedRoot = mkdtempSync(join(tmpdir(), "corneta-nsis-"));
  const extractResult = spawnSync(
    "7z",
    ["x", "-y", `-o${extractedRoot}`, installer],
    { stdio: "ignore", windowsHide: true },
  );
  if (extractResult.error || extractResult.status !== 0) {
    fail(
      `7-Zip não conseguiu extrair o NSIS ${relative(root, installer)}; artefato bloqueado.`,
    );
  }
  if (!readdirSync(extractedRoot).length) {
    fail("7-Zip não retornou conteúdo extraível do NSIS; artefato bloqueado.");
  }
  walk(extractedRoot);
}

const onde = (path) => {
  if (extractedRoot && path.startsWith(extractedRoot)) {
    return `NSIS extraído/${relative(extractedRoot, path).replaceAll("\\", "/")}`;
  }
  return relative(root, path).replaceAll("\\", "/");
};

const sourceMaps = files
  .filter((path) => /\.map(?:\.|$)/i.test(path))
  .map(onde);
if (sourceMaps.length) {
  fail(
    `Source maps não podem entrar no bundle/artefato:\n${sourceMaps.join("\n")}`,
  );
}

// 3) Detect known dotenv values and fixed secret markers. Report names only.
const envValues = [];
const envPaths = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
]
  .map((name) => join(root, name))
  .filter(existsSync);
for (const envPath of envPaths) {
  envValues.push(...dotenvSecretValues(readFileSync(envPath, "utf8")));
}

// Quando o gate for executado manualmente com secrets no ambiente, compare-os sem imprimi-los.
for (const name of [
  "POSTHOG_API_KEY",
  "POSTHOG_CLI_API_KEY",
  "POSTHOG_PERSONAL_API_KEY",
  "POSTHOG_DELETION_TOKEN",
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
]) {
  const value = process.env[name];
  if (value && value.length >= 8) {
    envValues.push({ name, bytes: Buffer.from(value) });
  }
}

const fixedSecretMarkers = [
  [Buffer.from("GOCSPX-"), "Client Secret do Google (GOCSPX-…)"],
  [
    Buffer.from("untrusted comment: minisign secret key"),
    "chave privada minisign",
  ],
  [
    Buffer.from("untrusted comment: minisign encrypted secret key"),
    "chave privada minisign criptografada",
  ],
  [
    Buffer.from("dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHNlY3JldCBrZXk"),
    "chave privada minisign em base64",
  ],
  [
    Buffer.from(
      "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5",
    ),
    "chave privada minisign criptografada em base64",
  ],
];

const posthogPersonalPrefix = Buffer.from("phx_");
const isPosthogKeyByte = (byte) =>
  (byte >= 48 && byte <= 57) ||
  (byte >= 65 && byte <= 90) ||
  (byte >= 97 && byte <= 122) ||
  byte === 45 ||
  byte === 95;
const containsPosthogPersonalApiKey = (bytes) => {
  let offset = 0;
  while (offset < bytes.length) {
    const prefixAt = bytes.indexOf(posthogPersonalPrefix, offset);
    if (prefixAt < 0) return false;
    let suffixLength = 0;
    for (
      let index = prefixAt + posthogPersonalPrefix.length;
      index < bytes.length && isPosthogKeyByte(bytes[index]);
      index += 1
    ) {
      suffixLength += 1;
      if (suffixLength >= 20) return true;
    }
    offset = prefixAt + posthogPersonalPrefix.length;
  }
  return false;
};

const leaks = [];
for (const path of files) {
  const bytes = readFileSync(path);
  for (const name of detectedSecretNames(bytes, envValues))
    leaks.push(`${name} em ${onde(path)}`);
  for (const [marker, label] of fixedSecretMarkers) {
    if (bytes.includes(marker)) leaks.push(`${label} em ${onde(path)}`);
  }
  if (containsPosthogPersonalApiKey(bytes)) {
    leaks.push(`Personal API Key do PostHog (phx_…) em ${onde(path)}`);
  }
  if (
    bytes.includes(Buffer.from("-----BEGIN ")) &&
    bytes.includes(Buffer.from("PRIVATE KEY-----"))
  ) {
    leaks.push(`chave privada PEM em ${onde(path)}`);
  }
}

if (leaks.length) {
  fail(
    `Segredo no bundle — isso vai pra máquina do usuário:\n${[
      ...new Set(leaks),
    ].join("\n")}`,
  );
}

console.log(
  artifactMode
    ? "Artefatos e conteúdo extraível do NSIS: nenhum source map/segredo detectado pelas verificações; chunks JS dentro do budget de 110 KiB gzip."
    : "Bundle: nenhum source map/segredo detectado pelas verificações; chunks JS dentro do budget de 110 KiB gzip.",
);
