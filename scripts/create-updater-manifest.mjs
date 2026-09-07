import {
  appendFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";

const fail = (message) => {
  console.error(`latest.json não gerado: ${message}`);
  process.exit(1);
};

const root = process.cwd();
const tauriConfigPath = join(root, "src-tauri", "tauri.conf.json");
const packagePath = join(root, "package.json");
const nsisDir = join(root, "src-tauri", "target", "release", "bundle", "nsis");
const manifestPath = join(
  root,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "latest.json",
);

if (!existsSync(tauriConfigPath) || !existsSync(packagePath)) {
  fail("execute o script na raiz do repositório.");
}

const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const version = String(tauriConfig.version ?? "").trim();
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  fail("`version` do Tauri não é um SemVer válido.");
}
if (packageJson.version !== version) {
  fail(
    `versões divergentes: tauri.conf.json=${version}, package.json=${packageJson.version ?? "ausente"}.`,
  );
}

const tag = String(
  process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME ?? "",
).trim();
const expectedTag = `v${version}`;
if (tag !== expectedTag) {
  fail(`a tag deve ser exatamente ${expectedTag}; recebido ${tag || "vazio"}.`);
}

const repository = String(process.env.GITHUB_REPOSITORY ?? "").trim();
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
  fail("GITHUB_REPOSITORY deve estar no formato owner/repo.");
}

if (!existsSync(nsisDir)) {
  fail(`diretório NSIS ausente: ${nsisDir}.`);
}
const installers = readdirSync(nsisDir, { withFileTypes: true })
  .filter(
    (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".exe"),
  )
  .map((entry) => resolve(nsisDir, entry.name));
if (installers.length !== 1) {
  fail(
    `esperado exatamente um instalador NSIS; encontrados ${installers.length}.`,
  );
}

const installerPath = installers[0];
const signaturePath = `${installerPath}.sig`;
if (!existsSync(signaturePath)) {
  fail(`assinatura do updater ausente para ${basename(installerPath)}.`);
}
const signature = readFileSync(signaturePath, "utf8").trim();
if (!signature || signature.length > 16 * 1024 || signature.includes("\0")) {
  fail("arquivo .sig vazio ou inválido.");
}

const verification = spawnSync(
  "cargo",
  [
    "run",
    "--locked",
    "--release",
    "--example",
    "verify-updater",
    "--",
    installerPath,
    signaturePath,
    tauriConfigPath,
  ],
  {
    cwd: join(root, "src-tauri"),
    stdio: "inherit",
    shell: false,
  },
);
if (verification.error || verification.status !== 0)
  fail(
    "a assinatura não corresponde ao instalador e à chave pública do aplicativo.",
  );

const [owner, repo] = repository.split("/");
const assetUrl = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(basename(installerPath))}`;
const manifest = {
  version,
  notes:
    "Baixe a atualização da Corneta. Consulte as notas completas no release do GitHub.",
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url: assetUrl,
    },
  },
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

// Exact bytes delivered to users; a checksum is not a substitute for a signature.
const checksumsPath = join(
  root,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "SHA256SUMS.txt",
);
const checksums = [];
const compliancePath = join(
  root,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "corneta-third-party.zip",
);
if (!existsSync(compliancePath))
  fail("pacote de conformidade ausente; execute pnpm compliance:prepare.");
for (const file of [
  installerPath,
  signaturePath,
  manifestPath,
  compliancePath,
]) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  checksums.push(`${hash.digest("hex")}  ${basename(file)}`);
}
writeFileSync(checksumsPath, checksums.join("\n") + "\n", "utf8");

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    [
      `installer_path=${installerPath}`,
      `signature_path=${signaturePath}`,
      `manifest_path=${manifestPath}`,
      `checksums_path=${checksumsPath}`,
      `compliance_path=${compliancePath}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

console.log(
  `latest.json criado para ${tag} / windows-x86_64 usando ${basename(installerPath)}.`,
);
