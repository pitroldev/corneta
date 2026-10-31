import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  contributorEnvironment,
  contributorToolScript,
  contributorPlan,
} from "./contributor.mjs";
import { complianceErrors } from "./release-compliance.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const storeIdentity = {
  name: "pitroldev.Corneta",
  publisher: "CN=CA9298D5-25D1-490F-8BFE-5807D0ACE4EC",
  publisherDisplayName: "pitroldev",
};
const readJson = (path) =>
  JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
const sha256 = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

export function msixVersion(version) {
  if (
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) ||
    version.split(".").some((part) => Number(part) > 65535)
  )
    throw new Error(
      "MSIX requires three numeric version components between 0 and 65535; Store reserves the fourth component.",
    );
  return `${version}.0`;
}

export function storeEnvironment(source, workspace = root) {
  const env = contributorEnvironment(source, workspace);
  delete env.CORNETA_CONTRIBUTOR;
  delete env.VITE_CONTRIBUTOR;
  return {
    ...env,
    CORNETA_STORE: "1",
    VITE_STORE: "1",
    VITE_SETUP_API_URL: "https://www.corneta.live",
    CARGO_TARGET_DIR: resolve(workspace, ".artifacts/store/target"),
    RUSTFLAGS: "-C target-feature=+crt-static",
    VSLANG: "1033",
  };
}

export function storeManifest(version) {
  return `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
 xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
 xmlns:desktop="http://schemas.microsoft.com/appx/manifest/desktop/windows10"
 xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
 xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
 IgnorableNamespaces="uap desktop uap10 rescap">
  <Identity Name="${storeIdentity.name}" Publisher="${storeIdentity.publisher}" Version="${msixVersion(version)}" ProcessorArchitecture="x64" />
  <Properties><DisplayName>Corneta</DisplayName><PublisherDisplayName>${storeIdentity.publisherDisplayName}</PublisherDisplayName><Logo>Assets\\Logo50.png</Logo><Description>Stream to multiple platforms from your desktop.</Description></Properties>
  <Resources><Resource Language="pt-BR"/><Resource Language="en-US"/></Resources>
  <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0"/></Dependencies>
  <Applications><Application Id="Corneta" Executable="corneta.exe" EntryPoint="Windows.FullTrustApplication">
    <uap:VisualElements DisplayName="Corneta" Description="Stream to multiple platforms from your desktop." BackgroundColor="transparent" Square150x150Logo="Assets\\Logo150.png" Square44x44Logo="Assets\\Logo44.png"/>
    <Extensions><desktop:Extension Category="windows.startupTask" Executable="corneta.exe" EntryPoint="Windows.FullTrustApplication" uap10:Parameters="--autostart"><desktop:StartupTask TaskId="CornetaStartup" Enabled="false" DisplayName="Corneta"/></desktop:Extension></Extensions>
  </Application></Applications>
  <Capabilities><Capability Name="internetClient"/><rescap:Capability Name="runFullTrust"/><DeviceCapability Name="microphone"/><DeviceCapability Name="webcam"/></Capabilities>
</Package>
`;
}

function assertCleanWorkspace() {
  for (const directory of [root, join(root, "web")])
    if (
      readdirSync(directory).some(
        (file) => /^\.env(?:\.|$)/.test(file) && file !== ".env.example",
      )
    )
      throw new Error(
        "Build MSIX in a disposable checkout without real .env files.",
      );
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status}).`);
}

function sdkTool() {
  const bin = join(
    process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)",
    "Windows Kits/10/bin",
  );
  const versions = readdirSync(bin)
    .filter((name) => /^10\.\d+\.\d+\.\d+$/.test(name))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const path = versions
    .map((version) => join(bin, version, "x64/makeappx.exe"))
    .find(existsSync);
  if (!path) throw new Error("Install the Windows SDK MSIX packaging tools.");
  return path;
}

function inventory(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((file) => {
    const path = join(directory, file.name);
    const name = prefix + file.name;
    if (file.isSymbolicLink())
      throw new Error("Package layout must not contain symbolic links.");
    return file.isDirectory()
      ? inventory(path, name + "/")
      : [{ path: name, sha256: sha256(path) }];
  });
}

function packageMsix(env) {
  const output = join(root, ".artifacts/store");
  const build = readJson(join(output, "build.json"));
  const version = readJson(join(root, "package.json")).version;
  const binary = join(env.CARGO_TARGET_DIR, "release/corneta.exe");
  if (
    build.version !== version ||
    build.sha256 !== sha256(binary) ||
    build.profile !== "store"
  )
    throw new Error(
      "The Store executable does not match the completed build record.",
    );
  const notices = join(root, "src-tauri/binaries/third-party");
  const sidecars = readJson(join(notices, "sidecars.json"));
  const errors = complianceErrors(
    readJson(join(root, "compliance/ffmpeg-sources.json")),
    sidecars,
  );
  if (errors.length) throw new Error(errors.join("\n"));
  const layout = mkdtempSync(join(output, "layout-"));
  copyFileSync(binary, join(layout, "corneta.exe"));
  for (const name of ["ffmpeg", "mediamtx"]) {
    const path = join(
      root,
      `src-tauri/binaries/${name}-x86_64-pc-windows-msvc.exe`,
    );
    if (sha256(path) !== sidecars[name].binarySha256.toLowerCase())
      throw new Error(`Unverified ${name} executable.`);
    copyFileSync(path, join(layout, `${name}.exe`));
  }
  cpSync(notices, join(layout, "third-party"), { recursive: true });
  const sources = join(
    root,
    "src-tauri/target/release/bundle/corneta-third-party.zip",
  );
  if (!existsSync(sources))
    throw new Error(
      "Run pnpm compliance:prepare before packaging; corresponding sources must ship inside the MSIX.",
    );
  copyFileSync(sources, join(layout, "third-party/corneta-third-party.zip"));
  for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
    copyFileSync(join(root, file), join(layout, file));
  cpSync(join(root, "compliance"), join(layout, "third-party/compliance"), {
    recursive: true,
  });
  run(
    "pwsh",
    [
      "-NoProfile",
      "-File",
      "scripts/make-store-icons.ps1",
      "-OutputDirectory",
      join(layout, "Assets"),
    ],
    env,
  );
  writeFileSync(join(layout, "AppxManifest.xml"), storeManifest(version));
  run(
    process.execPath,
    ["scripts/check-bundle.mjs", "--msix-layout", layout],
    env,
  );
  const files = inventory(layout);
  const artifact = join(output, `Corneta_${msixVersion(version)}_x64.msix`);
  const makeappx = sdkTool();
  run(makeappx, ["pack", "/d", layout, "/p", artifact, "/o"], env);
  const unpacked = mkdtempSync(join(output, "unpacked-"));
  run(makeappx, ["unpack", "/p", artifact, "/d", unpacked, "/o"], env);
  for (const file of files)
    if (sha256(join(unpacked, file.path)) !== file.sha256)
      throw new Error(`MSIX round-trip mismatch: ${file.path}`);
  const report = {
    ...build,
    identity: storeIdentity,
    msixVersion: msixVersion(version),
    artifact,
    sha256: sha256(artifact),
    signature: "unsigned-for-Microsoft-Store",
    semanticValidation: true,
    roundTripValidation: true,
    files,
    layout,
    unpacked,
    sdk: makeappx,
  };
  writeFileSync(
    join(output, "package-validation.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(`MSIX validated: ${artifact}\nSHA-256: ${report.sha256}`);
}

function main() {
  const [task, ...extra] = process.argv.slice(2);
  if (extra.length || !["build", "frontend", "package"].includes(task))
    throw new Error(
      "Usage: node scripts/store-msix.mjs build|frontend|package",
    );
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error("MSIX packaging requires Windows x64.");
  assertCleanWorkspace();
  const env = storeEnvironment(process.env);
  if (task === "frontend") {
    for (const { tool, args } of contributorPlan("frontend:build"))
      run(process.execPath, [contributorToolScript(tool), ...args], env);
    return;
  }
  if (task === "build") {
    run(
      process.execPath,
      [
        contributorToolScript("tauri"),
        "build",
        "--no-bundle",
        "--config",
        "src-tauri/tauri.store.conf.json",
        "--",
        "--locked",
      ],
      env,
    );
    const output = join(root, ".artifacts/store");
    mkdirSync(output, { recursive: true });
    writeFileSync(
      join(output, "build.json"),
      JSON.stringify(
        {
          profile: "store",
          version: readJson(join(root, "package.json")).version,
          sha256: sha256(join(env.CARGO_TARGET_DIR, "release/corneta.exe")),
          baseRevision: execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: root,
            encoding: "utf8",
          }).trim(),
          dirty:
            execFileSync("git", ["status", "--porcelain"], {
              cwd: root,
              encoding: "utf8",
            }).trim().length > 0,
          telemetry: "disabled",
          builtAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
  }
  packageMsix(env);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
