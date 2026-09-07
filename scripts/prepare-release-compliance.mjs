import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  createReadStream,
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
import { downloadReleaseSources } from "./release-source-download.mjs";
import {
  complianceErrors,
  compliancePackageFiles,
} from "./release-compliance.mjs";

const root = process.cwd();
const readJson = (path) =>
  JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
const notices = join(root, "src-tauri/binaries/third-party");
const manifest = readJson(join(root, "compliance/ffmpeg-sources.json"));
const sidecars = readJson(join(notices, "sidecars.json"));
const errors = complianceErrors(manifest, sidecars);
if (errors.length) {
  console.error(
    `Compliance package blocked:\n${errors.map((e) => `- ${e}`).join("\n")}`,
  );
  process.exit(1);
}
if (process.argv.includes("--check")) {
  console.log(
    "Source manifest approved and compatible with the sidecars. Downloads still require verification.",
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
      "A sidecar changed after verification. Run fetch-binaries again.",
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
  for (const file of compliancePackageFiles) {
    // Keep repository paths so source-manifest/provenance links remain usable.
    const target = join(staging, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(root, file), target);
  }
  writeFileSync(
    join(staging, "README-THIRD-PARTY.txt"),
    [
      "Corneta third-party materials",
      "",
      "Source archives are at this directory's root; their identities are in compliance/ffmpeg-sources.json.",
      "Binary identities and build configuration are in sidecars.json and FFmpeg-buildconf.txt.",
      "See LICENSE, THIRD_PARTY_NOTICES.md, compliance/ffmpeg-provenance.json and docs/CONFORMIDADE-FFMPEG.md.",
      "Some documentation links refer to the full source repository: https://github.com/pitroldev/corneta",
      "A package generator is not legal certification or evidence of a completed source correspondence review.",
      "",
    ].join("\n"),
  );

  await downloadReleaseSources(manifest.sources, staging);

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
      "Run pnpm compliance:prepare to generate the JS inventory.",
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
    "corneta-third-party.zip prepared: verified sources, notices, and inventories. Corresponding-source approval still requires human review.",
  );
} finally {
  if (
    dirname(resolve(staging)) !== resolve(stagingParent) ||
    !/^compliance-[A-Za-z0-9]+$/.test(basename(staging))
  ) {
    console.error("Out-of-scope staging cleanup refused; directory preserved.");
    process.exitCode = 1;
  } else {
    // Cleanup must not hide the original preparation error.
    try {
      rmSync(staging, { recursive: true, force: true });
    } catch {
      console.error("Could not clean up the compliance staging directory.");
      process.exitCode = 1;
    }
  }
}
