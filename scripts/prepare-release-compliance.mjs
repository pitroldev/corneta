import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  createReadStream,
  createWriteStream,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { complianceErrors } from "./release-compliance.mjs";

const root = process.cwd();
const readJson = (path) =>
  JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
const notices = join(root, "src-tauri/binaries/third-party");
const manifest = readJson(join(root, "compliance/ffmpeg-sources.json"));
const sidecars = readJson(join(notices, "sidecars.json"));
const errors = complianceErrors(manifest, sidecars);
if (errors.length) {
  console.error(
    `Pacote de conformidade bloqueado:\n${errors.map((e) => `- ${e}`).join("\n")}`,
  );
  process.exit(1);
}
if (process.argv.includes("--check")) {
  console.log(
    "Manifesto de fontes aprovado e compatível com os sidecars. Downloads ainda precisam ser verificados.",
  );
  process.exit(0);
}

// Pin the actual shipped executables, not just the archive metadata.
for (const name of ["ffmpeg", "mediamtx"]) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(
    join(root, `src-tauri/binaries/${name}-x86_64-pc-windows-msvc.exe`),
  ))
    hash.update(chunk);
  if (hash.digest("hex") !== sidecars[name].binarySha256.toLowerCase())
    throw new Error(
      "Um sidecar mudou depois da verificação. Refaça fetch-binaries.",
    );
}
const bundle = join(root, "src-tauri/target/release/bundle");
mkdirSync(bundle, { recursive: true });
const stagingParent = join(root, ".artifacts");
mkdirSync(stagingParent, { recursive: true });
const staging = mkdtempSync(join(stagingParent, "compliance-"));
try {
  for (const file of readdirSync(notices, { withFileTypes: true }))
    if (file.isFile())
      copyFileSync(join(notices, file.name), join(staging, file.name));
  for (const file of [
    "LICENSE",
    "pnpm-lock.yaml",
    "src-tauri/Cargo.lock",
    "compliance/ffmpeg-sources.json",
  ])
    copyFileSync(join(root, file), join(staging, file.split("/").at(-1)));

  for (const source of manifest.sources) {
    const response = await fetch(source.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(180_000),
    });
    if (
      !response.ok ||
      !response.body ||
      new URL(response.url).protocol !== "https:"
    )
      throw new Error("Não foi possível baixar uma fonte aprovada.");
    let size = 0;
    const hash = createHash("sha256");
    const guard = new Transform({
      transform(chunk, _encoding, callback) {
        size += chunk.length;
        if (size > 1_073_741_824) {
          callback(new Error("Arquivo de fontes excede 1 GiB."));
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body),
      guard,
      createWriteStream(join(staging, source.file), { flags: "wx" }),
    );
    if (hash.digest("hex") !== source.sha256.toLowerCase())
      throw new Error(
        "SHA-256 das fontes diverge. Nenhum pacote será aprovado.",
      );
  }

  // Inventory contains only package identity/license, never machine paths or env.
  const metadata = JSON.parse(
    execFileSync("cargo", ["metadata", "--locked", "--format-version", "1"], {
      cwd: join(root, "src-tauri"),
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    }),
  );
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli || !existsSync(pnpmCli))
    throw new Error(
      "Execute via pnpm compliance:prepare para gerar o inventário JS.",
    );
  const jsMetadata = JSON.parse(
    execFileSync(
      process.execPath,
      [pnpmCli, "licenses", "list", "--prod", "--json"],
      { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    ),
  );
  const inventory = [];
  const licenseDir = join(staging, "dependency-licenses");
  mkdirSync(licenseDir);
  function addPackage(name, version, license, packageDir, licenseFile) {
    const index = inventory.length;
    inventory.push({ name, version, license: license ?? "REVIEW_REQUIRED" });
    const files = new Set(
      readdirSync(packageDir, { withFileTypes: true })
        .filter(
          (f) =>
            f.isFile() &&
            /^(?:licen[cs]e|copying|notice)(?:[._-]|$)/i.test(f.name),
        )
        .map((f) => f.name),
    );
    if (licenseFile) files.add(licenseFile);
    for (const file of files) {
      const path = resolve(packageDir, file);
      if (!path.startsWith(resolve(packageDir) + sep) || !existsSync(path))
        continue;
      const target = join(licenseDir, String(index));
      mkdirSync(target, { recursive: true });
      copyFileSync(path, join(target, file.replace(/[^A-Za-z0-9._-]/g, "_")));
    }
  }
  for (const pkg of metadata.packages)
    addPackage(
      pkg.name,
      pkg.version,
      pkg.license,
      dirname(pkg.manifest_path),
      pkg.license_file,
    );
  for (const packages of Object.values(jsMetadata))
    for (const pkg of packages)
      for (const [index, path] of pkg.paths.entries())
        addPackage(
          pkg.name,
          pkg.versions[index] ?? pkg.versions[0],
          pkg.license,
          path,
        );
  writeFileSync(
    join(staging, "dependency-inventory.json"),
    JSON.stringify(inventory, null, 2) + "\n",
  );
  const archive = join(bundle, "corneta-third-party.zip");
  execFileSync(
    "pwsh",
    [
      "-NoProfile",
      "-Command",
      "Compress-Archive -LiteralPath $env:CORNETA_COMPLIANCE_STAGE -DestinationPath $env:CORNETA_COMPLIANCE_ARCHIVE -Force",
    ],
    {
      env: {
        ...process.env,
        CORNETA_COMPLIANCE_STAGE: staging,
        CORNETA_COMPLIANCE_ARCHIVE: archive,
      },
      stdio: "inherit",
    },
  );
  console.log(
    "corneta-third-party.zip preparado: fontes verificadas, avisos e inventários. A aprovação de correspondência continua sendo humana.",
  );
} finally {
  if (
    dirname(resolve(staging)) !== resolve(stagingParent) ||
    !/^compliance-[A-Za-z0-9]+$/.test(basename(staging))
  )
    throw new Error("Limpeza de staging fora do escopo recusada.");
  rmSync(staging, { recursive: true, force: true });
}
