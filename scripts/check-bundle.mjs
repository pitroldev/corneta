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
    `Expected artifacts were not found:\n${missingRoots
      .map((path) => relative(root, path))
      .join("\n")}`,
  );
}
if (!resolvedRoots.length) {
  fail("Nothing to check: build the project before running this gate.");
}

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
  fail(`Chunks exceed the 110 KiB gzip budget:\n${oversized.join("\n")}`);
}

// Small chunks can still make a heavy boot; also cap their static dependency graph.
const manifestFile = join(dist, ".vite", "manifest.json");
if (!existsSync(manifestFile))
  fail("Manifest missing: rebuild before checking entries.");
const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
for (const [entry, chunk] of Object.entries(manifest)) {
  if (!chunk.isEntry) continue;
  let javascript = 0;
  let css = 0;
  let other = 0;
  for (const file of entryFiles(manifest, entry)) {
    const path = resolve(dist, file);
    if (!path.startsWith(resolve(dist) + sep))
      fail("Invalid path in the manifest.");
    const contents = readFileSync(path);
    if (file.endsWith(".js")) javascript += gzipSync(contents).byteLength;
    else if (file.endsWith(".css")) css += gzipSync(contents).byteLength;
    else other += contents.byteLength;
  }
  console.log(
    `Entry ${entry}: JS ${(javascript / 1024).toFixed(1)} KiB gzip; CSS ${(css / 1024).toFixed(1)} KiB gzip; assets ${(other / 1024).toFixed(1)} KiB`,
  );
  if (javascript > 250 * 1024 || css > 55 * 1024 || other > 256 * 1024)
    fail(`Entry ${entry} exceeds the aggregate budget.`);
}

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

// Scan extractable NSIS contents, not just the container; fail closed without 7-Zip.
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
      `Expected exactly one installer in bundle/nsis; found ${installers.length}. Remove stale artifacts and rebuild.`,
    );
  }
  const installer = installers[0];
  if (!existsSync(`${installer}.sig`)) {
    fail(`Updater signature missing for ${relative(root, installer)}.`);
  }

  const listResult = spawnSync("7z", ["l", "-slt", installer], {
    stdio: "ignore",
    windowsHide: true,
  });
  if (listResult.error?.code === "ENOENT") {
    fail(
      "The artifact gate requires 7-Zip (`7z`); scanning was blocked because it was not found.",
    );
  }
  if (listResult.error || listResult.status !== 0) {
    fail(
      `7-Zip could not list NSIS ${relative(root, installer)}; artifact blocked.`,
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
      `7-Zip could not extract NSIS ${relative(root, installer)}; artifact blocked.`,
    );
  }
  if (!readdirSync(extractedRoot).length) {
    fail("7-Zip returned no extractable NSIS contents; artifact blocked.");
  }
  walk(extractedRoot);
}

const artifactLocation = (path) => {
  if (extractedRoot && path.startsWith(extractedRoot)) {
    return `Extracted NSIS/${relative(extractedRoot, path).replaceAll("\\", "/")}`;
  }
  return relative(root, path).replaceAll("\\", "/");
};

const sourceMaps = files
  .filter((path) => /\.map(?:\.|$)/i.test(path))
  .map(artifactLocation);
if (sourceMaps.length) {
  fail(
    `Source maps must not be included in bundles or artifacts:\n${sourceMaps.join("\n")}`,
  );
}

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

// Include inherited secrets in matching without printing their values.
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
  [Buffer.from("GOCSPX-"), "Google Client Secret (GOCSPX-…)"],
  [
    Buffer.from("untrusted comment: minisign secret key"),
    "minisign private key",
  ],
  [
    Buffer.from("untrusted comment: minisign encrypted secret key"),
    "encrypted minisign private key",
  ],
  [
    Buffer.from("dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHNlY3JldCBrZXk"),
    "base64-encoded minisign private key",
  ],
  [
    Buffer.from(
      "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5",
    ),
    "base64-encoded encrypted minisign private key",
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
    leaks.push(`${name} in ${artifactLocation(path)}`);
  for (const [marker, label] of fixedSecretMarkers) {
    if (bytes.includes(marker))
      leaks.push(`${label} in ${artifactLocation(path)}`);
  }
  if (containsPosthogPersonalApiKey(bytes)) {
    leaks.push(`PostHog Personal API Key (phx_…) in ${artifactLocation(path)}`);
  }
  if (
    bytes.includes(Buffer.from("-----BEGIN ")) &&
    bytes.includes(Buffer.from("PRIVATE KEY-----"))
  ) {
    leaks.push(`PEM private key in ${artifactLocation(path)}`);
  }
}

if (leaks.length) {
  fail(
    `Secret detected in the bundle that would be shipped to users:\n${[
      ...new Set(leaks),
    ].join("\n")}`,
  );
}

console.log(
  artifactMode
    ? "Artifacts and extractable NSIS contents: no source maps or secrets detected; JS chunks are within the 110 KiB gzip budget."
    : "Bundle: no source maps or secrets detected; JS chunks are within the 110 KiB gzip budget.",
);
