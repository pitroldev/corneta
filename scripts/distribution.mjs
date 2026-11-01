import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = "pitroldev/corneta";
const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (path) =>
  JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export function compareVersions(left, right) {
  for (const value of [left, right])
    requireCondition(
      stable.test(value) &&
        value.split(".").every((part) => Number.isSafeInteger(Number(part))),
      "Expected a stable X.Y.Z version.",
    );
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index++)
    if (a[index] !== b[index]) return Math.sign(a[index] - b[index]);
  return 0;
}

export function releaseIdentity(release) {
  requireCondition(
    release.draft === false &&
      release.prerelease === false &&
      release.published_at &&
      Number.isSafeInteger(release.id),
    "Distribution requires a published stable release.",
  );
  requireCondition(
    typeof release.tag_name === "string" && release.tag_name.startsWith("v"),
    "Invalid release tag.",
  );
  const version = release.tag_name.slice(1);
  compareVersions(version, version);
  const installer = "Corneta_" + version + "_x64-setup.exe";
  const names = [
    installer,
    installer + ".sig",
    "latest.json",
    "SHA256SUMS.txt",
    "corneta-third-party.zip",
  ];
  const base =
    "https://github.com/" +
    repository +
    "/releases/download/" +
    release.tag_name +
    "/";
  const assets = names.map((name) => {
    const matches = release.assets.filter((asset) => asset.name === name);
    requireCondition(
      matches.length === 1,
      "Missing or duplicate release asset: " + name,
    );
    const asset = matches[0];
    requireCondition(
      asset.browser_download_url === base + name &&
        asset.state === "uploaded" &&
        Number.isSafeInteger(asset.size) &&
        asset.size > 0 &&
        asset.size < 512 * 1024 * 1024 &&
        /^sha256:[a-f0-9]{64}$/.test(asset.digest),
      "Invalid release asset: " + name,
    );
    return { name, size: asset.size, digest: asset.digest };
  });
  return {
    id: release.id,
    tag: release.tag_name,
    version,
    installer,
    url: base + installer,
    assets,
  };
}

export function validateDownloads(release, directory) {
  const hashes = new Map();
  for (const asset of release.assets) {
    const bytes = readFileSync(join(directory, asset.name));
    const hash = sha256(bytes);
    requireCondition(
      bytes.length === asset.size && "sha256:" + hash === asset.digest,
      "Downloaded bytes differ from the release: " + asset.name,
    );
    hashes.set(asset.name, hash);
  }
  const checksums = new Map();
  for (const line of readFileSync(join(directory, "SHA256SUMS.txt"), "utf8")
    .trim()
    .split(/\r?\n/)) {
    const match = /^([a-f0-9]{64}) {2}([A-Za-z0-9_.-]+)$/.exec(line);
    requireCondition(
      match && !checksums.has(match[2]),
      "Invalid or duplicate checksum entry.",
    );
    checksums.set(match[2], match[1]);
  }
  requireCondition(
    checksums.size === 4,
    "Expected exactly four checksummed release files.",
  );
  for (const [name, hash] of hashes)
    if (name !== "SHA256SUMS.txt")
      requireCondition(
        checksums.get(name) === hash,
        "Release checksum mismatch: " + name,
      );
  const manifest = readJson(join(directory, "latest.json"));
  const platform = manifest.platforms?.["windows-x86_64"];
  const signature = readFileSync(
    join(directory, release.installer + ".sig"),
    "utf8",
  ).trim();
  requireCondition(
    manifest.version === release.version &&
      platform?.url === release.url &&
      signature.length > 0 &&
      signature.length < 16384 &&
      platform.signature === signature,
    "Updater metadata does not match the release.",
  );
  return hashes.get(release.installer);
}

export function updateScoop(manifest, release) {
  const order = compareVersions(release.version, manifest.version);
  requireCondition(order >= 0, "Refusing to downgrade the Scoop package.");
  const current = manifest.architecture?.["64bit"];
  requireCondition(
    current && typeof current.url === "string",
    "Unexpected Scoop manifest layout.",
  );
  if (order === 0) {
    requireCondition(
      current.hash === release.sha256 &&
        current.url === release.url + "#/dl.7z",
      "Existing Scoop version has different bytes.",
    );
    return false;
  }
  manifest.version = release.version;
  current.url = release.url + "#/dl.7z";
  current.hash = release.sha256;
  return true;
}

function replaceExactlyOnce(text, pattern, replacement) {
  requireCondition(
    [...text.matchAll(new RegExp(pattern.source, "g"))].length === 1,
    "Unexpected Chocolatey package template.",
  );
  return text.replace(pattern, replacement);
}

export function updateChocolatey(nuspec, installer, release) {
  const current = /<version>([^<]+)<\/version>/.exec(nuspec)?.[1];
  const order = compareVersions(release.version, current);
  requireCondition(order >= 0, "Refusing to downgrade the Chocolatey package.");
  if (order === 0) {
    requireCondition(
      installer.includes("url64bit = '" + release.url + "'") &&
        installer.includes("checksum64 = '" + release.sha256 + "'"),
      "Existing Chocolatey version has different bytes.",
    );
    return { changed: false, nuspec, installer };
  }
  nuspec = replaceExactlyOnce(
    nuspec,
    /<version>[^<]+<\/version>/,
    "<version>" + release.version + "</version>",
  );
  nuspec = nuspec.replaceAll("/v" + current + "/", "/" + release.tag + "/");
  nuspec = replaceExactlyOnce(
    nuspec,
    /<releaseNotes>[^<]+<\/releaseNotes>/,
    "<releaseNotes>https://github.com/pitroldev/corneta/releases/tag/" +
      release.tag +
      "</releaseNotes>",
  );
  installer = replaceExactlyOnce(
    installer,
    /url64bit = '[^']*'/,
    "url64bit = '" + release.url + "'",
  );
  installer = replaceExactlyOnce(
    installer,
    /checksum64 = '[^']*'/,
    "checksum64 = '" + release.sha256 + "'",
  );
  return { changed: true, nuspec, installer };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 300000,
    maxBuffer: 4 * 1024 * 1024,
    shell: false,
    ...options,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      command +
        " failed: " +
        (result.stderr || result.error?.message || result.status),
    );
  return result.stdout.trim();
}

const api = (path) =>
  JSON.parse(run("gh", ["api", "repos/" + repository + "/" + path]));
const latest = () => releaseIdentity(api("releases/latest"));

function output(values) {
  if (process.env.GITHUB_OUTPUT)
    for (const [name, value] of Object.entries(values))
      appendFileSync(process.env.GITHUB_OUTPUT, name + "=" + value + "\n");
  console.log(JSON.stringify(values));
}

function prepare(directory) {
  requireCondition(
    !existsSync(directory),
    "Use a fresh distribution output directory.",
  );
  const release = latest();
  const commit = api("commits/" + release.tag).sha;
  requireCondition(/^[a-f0-9]{40}$/.test(commit), "Invalid release commit.");
  const comparison = api("compare/" + commit + "...main");
  requireCondition(
    ["ahead", "identical"].includes(comparison.status),
    "Release commit must belong to main.",
  );
  mkdirSync(directory, { recursive: true });
  run("gh", [
    "release",
    "download",
    release.tag,
    "--repo",
    repository,
    "--dir",
    directory,
    ...release.assets.flatMap((asset) => ["--pattern", asset.name]),
  ]);
  const hash = validateDownloads(release, directory);
  run("cargo", [
    "run",
    "--locked",
    "--release",
    "--manifest-path",
    join(root, "scripts/distribution-verify/Cargo.toml"),
    "--target-dir",
    join(directory, "verifier-target"),
    "--",
    join(directory, release.installer),
    join(directory, release.installer + ".sig"),
    join(root, "src-tauri/tauri.conf.json"),
  ]);
  const identity = { ...release, commit, sha256: hash };
  writeFileSync(
    join(directory, "release.json"),
    JSON.stringify(identity, null, 2) + "\n",
  );
  assertCurrent(directory);
  output({
    tag: release.tag,
    version: release.version,
    commit,
    installer: release.installer,
    sha256: hash,
  });
}

function assertCurrent(directory) {
  const saved = readJson(join(directory, "release.json"));
  const current = latest();
  requireCondition(
    saved.id === current.id &&
      saved.tag === current.tag &&
      JSON.stringify(saved.assets) === JSON.stringify(current.assets),
    "The latest release changed; rerun distribution.",
  );
  requireCondition(
    saved.commit === api("commits/" + current.tag).sha,
    "The release tag changed; distribution blocked.",
  );
  requireCondition(
    saved.sha256 === validateDownloads(current, directory),
    "The verified installer changed.",
  );
  return saved;
}

function main() {
  const [task, directoryArg, checkoutArg, ...extra] = process.argv.slice(2);
  requireCondition(
    directoryArg &&
      !extra.length &&
      ["prepare", "assert-current", "scoop", "chocolatey"].includes(task),
    "Usage: node scripts/distribution.mjs prepare|assert-current|scoop|chocolatey OUTPUT [PACKAGE_CHECKOUT]",
  );
  const directory = resolve(directoryArg);
  if (task === "prepare") return prepare(directory);
  const release = assertCurrent(directory);
  if (task === "assert-current") return;
  requireCondition(checkoutArg, "Package checkout is required.");
  const checkout = resolve(checkoutArg);
  let changed;
  if (task === "scoop") {
    const path = join(checkout, "bucket/corneta.json");
    const manifest = readJson(path);
    changed = updateScoop(manifest, release);
    if (changed) writeFileSync(path, JSON.stringify(manifest, null, 4) + "\n");
  } else {
    const specPath = join(checkout, "corneta.nuspec");
    const installPath = join(checkout, "tools/chocolateyInstall.ps1");
    const result = updateChocolatey(
      readFileSync(specPath, "utf8"),
      readFileSync(installPath, "utf8"),
      release,
    );
    changed = result.changed;
    if (changed) {
      writeFileSync(specPath, result.nuspec);
      writeFileSync(installPath, result.installer);
    }
  }
  output({ changed, version: release.version });
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
