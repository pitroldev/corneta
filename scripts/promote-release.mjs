import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  createReadStream,
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { RELEASE_NOTICE_VERSION } from "./release-readiness.mjs";
import { readDeploymentErrors } from "./telemetry-release-gate.mjs";

const SHA = /^[a-f0-9]{40}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MAX_PAGES = 20;
const MAX_JSON_BYTES = 2 * 1024 * 1024;

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function versionParts(version) {
  requireCondition(
    typeof version === "string" && VERSION.test(version),
    "Expected a stable X.Y.Z release version.",
  );
  const parts = version.split(".").map(Number);
  requireCondition(
    parts.every(Number.isSafeInteger),
    "Release version exceeds the safe integer limit.",
  );
  return parts;
}

function compareVersion(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index]) return Math.sign(a[index] - b[index]);
  }
  return 0;
}

function safeFile(root, path, maxBytes) {
  requireCondition(
    typeof path === "string" && path.length > 0,
    "A required release file path is missing.",
  );
  const file = resolve(root, path);
  const inside = relative(root, file);
  requireCondition(
    inside &&
      !isAbsolute(inside) &&
      inside !== ".." &&
      !inside.startsWith(`..${sep}`),
    "Release files must stay inside the checkout.",
  );
  for (let at = file; at !== dirname(at); at = dirname(at)) {
    requireCondition(
      !lstatSync(at).isSymbolicLink(),
      "Release files must not traverse links.",
    );
  }
  const stat = lstatSync(file);
  requireCondition(
    stat.isFile() && stat.size > 0 && stat.size <= maxBytes,
    "Release file is empty, oversized, or not regular.",
  );
  return { file, bytes: stat.size, mtime: stat.mtimeMs, ctime: stat.ctimeMs };
}

function readText(root, path, limit) {
  return readFileSync(safeFile(root, path, limit).file, "utf8");
}

function readJson(root, path) {
  try {
    return JSON.parse(readText(root, path, 64 * 1024));
  } catch {
    throw new Error(
      "Release configuration or manifest is unreadable or invalid.",
    );
  }
}

async function artifact(root, path, limit) {
  const before = safeFile(root, path, limit);
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(before.file)) hash.update(bytes);
  const after = safeFile(root, path, limit);
  requireCondition(
    before.bytes === after.bytes &&
      before.mtime === after.mtime &&
      before.ctime === after.ctime,
    "A release artifact changed while it was being verified.",
  );
  return {
    path: before.file,
    name: basename(before.file),
    size: before.bytes,
    digest: `sha256:${hash.digest("hex")}`,
  };
}

export function githubTransport({
  cwd,
  env = process.env,
  run = spawnSync,
} = {}) {
  return async ({ method, path, body }) => {
    requireCondition(
      (method === "GET" || method === "PATCH") &&
        /^repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\//.test(path),
      "Invalid release API request.",
    );
    const args = [
      "api",
      "--hostname",
      "github.com",
      "--method",
      method,
      "-H",
      "Accept: application/vnd.github+json",
      "-H",
      "X-GitHub-Api-Version: 2026-03-10",
      path,
    ];
    if (body !== undefined) args.push("--input", "-");
    const result = run("gh", args, {
      cwd,
      env: { ...env, GH_PROMPT_DISABLED: "1" },
      shell: false,
      windowsHide: true,
      encoding: "utf8",
      input: body === undefined ? undefined : JSON.stringify(body),
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 15_000,
      maxBuffer: MAX_JSON_BYTES,
    });
    requireCondition(
      !result.error && result.status === 0,
      "GitHub release request failed; inspect the release before retrying.",
    );
    try {
      return JSON.parse(result.stdout);
    } catch {
      throw new Error("GitHub returned an invalid release response.");
    }
  };
}

function localGit(root, args) {
  const env = { ...process.env };
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_COMMON_DIR",
  ])
    delete env[key];
  const result = spawnSync("git", args, {
    cwd: root,
    env,
    shell: false,
    windowsHide: true,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
    maxBuffer: 4096,
  });
  requireCondition(
    !result.error && result.status === 0,
    "Could not verify the local release identity.",
  );
  return result.stdout.trim();
}

async function releaseList(api, base) {
  const releases = [];
  const seen = new Set();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const entries = await api({
      method: "GET",
      path: `${base}/releases?per_page=100&page=${page}`,
    });
    requireCondition(
      Array.isArray(entries) && entries.length <= 100,
      "GitHub returned an invalid release listing.",
    );
    for (const entry of entries) {
      requireCondition(
        entry &&
          Number.isSafeInteger(entry.id) &&
          entry.id > 0 &&
          !seen.has(entry.id) &&
          typeof entry.tag_name === "string" &&
          typeof entry.draft === "boolean" &&
          typeof entry.prerelease === "boolean",
        "Release listing contains an invalid or repeated identity.",
      );
      seen.add(entry.id);
      releases.push(entry);
    }
    if (entries.length < 100) return releases;
  }
  throw new Error("Release listing exceeds the verification limit.");
}

async function verifyPublicationEnvironment(api, base) {
  const environment = await api({
    method: "GET",
    path: `${base}/environments/production-release`,
  });
  requireCondition(
    environment?.name === "production-release" &&
      environment.can_admins_bypass === false &&
      Array.isArray(environment.protection_rules) &&
      environment.protection_rules.some(
        (rule) =>
          rule?.type === "required_reviewers" &&
          Array.isArray(rule.reviewers) &&
          rule.reviewers.some(
            (entry) =>
              (entry?.type === "User" || entry?.type === "Team") &&
              Number.isSafeInteger(entry.reviewer?.id) &&
              entry.reviewer.id > 0,
          ),
      ),
    "The production-release environment must require reviewers and disallow administrator bypass.",
  );
}

async function verifyRemoteTag(api, base, tag, sha) {
  const reference = await api({
    method: "GET",
    path: `${base}/git/ref/tags/${tag}`,
  });
  requireCondition(
    reference?.ref === `refs/tags/${tag}`,
    "The remote release tag identity changed.",
  );
  let object = reference.object;
  const seen = new Set();
  for (let depth = 0; depth < 5; depth++) {
    requireCondition(
      object && SHA.test(object.sha) && !seen.has(object.sha),
      "The remote tag object is invalid.",
    );
    seen.add(object.sha);
    if (object.type === "commit") {
      requireCondition(
        object.sha === sha,
        "The remote tag does not match the approved release SHA.",
      );
      return;
    }
    requireCondition(
      object.type === "tag",
      "The remote tag does not reference a commit.",
    );
    const annotated = await api({
      method: "GET",
      path: `${base}/git/tags/${object.sha}`,
    });
    requireCondition(
      annotated?.sha === object.sha,
      "The annotated tag identity changed.",
    );
    object = annotated.object;
  }
  throw new Error("The remote tag nesting exceeds the verification limit.");
}

function validateRelease(release, id, tag, artifacts, repository) {
  requireCondition(
    release &&
      release.id === id &&
      release.tag_name === tag &&
      typeof release.draft === "boolean" &&
      release.prerelease === false,
    "The release identity or publication state changed.",
  );
  requireCondition(
    Array.isArray(release.assets) && release.assets.length === 5,
    "The release must contain exactly the five approved assets.",
  );
  const expected = new Map(artifacts.map((item) => [item.name, item]));
  const seenIds = new Set();
  for (const asset of release.assets) {
    const local = expected.get(asset?.name);
    requireCondition(
      local &&
        Number.isSafeInteger(asset.id) &&
        asset.id > 0 &&
        !seenIds.has(asset.id) &&
        asset.state === "uploaded" &&
        asset.size === local.size &&
        asset.digest === local.digest &&
        asset.browser_download_url === assetUrl(repository, tag, local.name),
      "A remote release asset is missing, incomplete, or different from the verified local file.",
    );
    seenIds.add(asset.id);
    expected.delete(asset.name);
  }
  requireCondition(
    expected.size === 0,
    "The release asset inventory is incomplete.",
  );
}

function assetUrl(repository, tag, name) {
  return `https://github.com/${repository.split("/").map(encodeURIComponent).join("/")}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;
}

function validateManifest(root, options, artifacts, version) {
  const [installer, signature, manifest, checksums, compliance] = artifacts;
  requireCondition(
    /^[A-Za-z0-9][A-Za-z0-9._ -]{0,175}\.exe$/.test(installer.name) &&
      signature.name === `${installer.name}.sig` &&
      manifest.name === "latest.json" &&
      checksums.name === "SHA256SUMS.txt" &&
      compliance.name === "corneta-third-party.zip" &&
      new Set(artifacts.map((item) => item.name)).size === 5,
    "Unexpected local release artifact names.",
  );
  const json = readJson(root, manifest.path);
  const signatureText = readText(root, signature.path, 16 * 1024).trim();
  const platform = json?.platforms?.["windows-x86_64"];
  requireCondition(
    json?.version === version &&
      json.platforms &&
      Object.keys(json.platforms).length === 1 &&
      platform &&
      signatureText.length > 0 &&
      !signatureText.includes("\0") &&
      platform.signature === signatureText &&
      platform.url ===
        assetUrl(options.repository, options.tag, installer.name),
    "The updater manifest does not match the verified version, platform, signature, or installer URL.",
  );
  const lines = readText(root, checksums.path, 16 * 1024)
    .trimEnd()
    .split(/\r?\n/);
  const expected = new Map(
    [installer, signature, manifest, compliance].map((item) => [
      item.name,
      item.digest.slice(7),
    ]),
  );
  requireCondition(
    lines.length === 4,
    "SHA256SUMS.txt must cover exactly the four other release artifacts.",
  );
  for (const line of lines) {
    const match = /^([a-f0-9]{64}) {2}(.+)$/.exec(line);
    requireCondition(
      match && expected.get(match[2]) === match[1],
      "SHA256SUMS.txt does not match the verified release artifacts.",
    );
    expected.delete(match[2]);
  }
  requireCondition(
    expected.size === 0,
    "SHA256SUMS.txt omits a release artifact.",
  );
}

function validateApprovedAssets(expectedAssets, artifacts) {
  requireCondition(
    Array.isArray(expectedAssets) && expectedAssets.length === 5,
    "The build must approve exactly five release assets.",
  );
  const expected = new Map();
  for (const item of expectedAssets) {
    requireCondition(
      item &&
        typeof item.name === "string" &&
        !expected.has(item.name) &&
        Number.isSafeInteger(item.size) &&
        item.size > 0 &&
        typeof item.sha256 === "string" &&
        /^[a-f0-9]{64}$/.test(item.sha256),
      "The approved release asset inventory is invalid.",
    );
    expected.set(item.name, item);
  }
  for (const item of artifacts) {
    const approved = expected.get(item.name);
    requireCondition(
      approved &&
        approved.size === item.size &&
        `sha256:${approved.sha256}` === item.digest,
      "A local release file differs from the asset approved by the build.",
    );
    expected.delete(item.name);
  }
  requireCondition(
    expected.size === 0,
    "The approved release asset inventory contains unexpected files.",
  );
}

function approvedTelemetry(telemetry, sha) {
  requireCondition(
    telemetry &&
      typeof telemetry.disabled === "boolean" &&
      telemetry.buildSha === sha &&
      telemetry.noticeVersion === RELEASE_NOTICE_VERSION &&
      (telemetry.disabled
        ? telemetry.tokenDigest === null
        : typeof telemetry.tokenDigest === "string" &&
          /^[a-f0-9]{64}$/.test(telemetry.tokenDigest)),
    "The build-approved telemetry configuration is missing or inconsistent.",
  );
  return {
    disabled: telemetry.disabled,
    buildSha: telemetry.buildSha,
    tokenDigest: telemetry.tokenDigest,
    noticeVersion: telemetry.noticeVersion,
  };
}

export async function promoteRelease(
  options,
  { api, git = localGit, checkDeployment = readDeploymentErrors } = {},
) {
  const root = realpathSync(resolve(options.root));
  requireCondition(
    typeof options.repository === "string" &&
      REPOSITORY.test(options.repository) &&
      !options.repository
        .split("/")
        .some((part) => part === "." || part === ".."),
    "Invalid GitHub repository identity.",
  );
  requireCondition(
    typeof options.sha === "string" &&
      SHA.test(options.sha) &&
      options.qualitySha === options.sha,
    "The release SHA must match the SHA approved by quality checks.",
  );
  const telemetry = approvedTelemetry(options.telemetry, options.sha);
  const verifyDeployment = async () => {
    const errors = await checkDeployment(telemetry);
    requireCondition(
      Array.isArray(errors) && errors.length === 0,
      "The deployed site and Setup API no longer match the approved release configuration.",
    );
  };
  const version = readJson(root, "src-tauri/tauri.conf.json").version;
  versionParts(version);
  requireCondition(
    options.tag === `v${version}` &&
      readJson(root, "package.json").version === version,
    "The release tag and package versions must match exactly.",
  );
  requireCondition(
    git(root, ["rev-parse", "--verify", "HEAD^{commit}"]) === options.sha &&
      git(root, [
        "rev-parse",
        "--verify",
        `refs/tags/${options.tag}^{commit}`,
      ]) === options.sha,
    "The local checkout and tag must match the approved SHA.",
  );
  const artifacts = await Promise.all([
    artifact(root, options.installerPath, 4 * 1024 ** 3),
    artifact(root, options.signaturePath, 16 * 1024),
    artifact(root, options.manifestPath, 64 * 1024),
    artifact(root, options.checksumsPath, 16 * 1024),
    artifact(root, options.compliancePath, 4 * 1024 ** 3),
  ]);
  validateApprovedAssets(options.expectedAssets, artifacts);
  validateManifest(root, options, artifacts, version);
  api ??= githubTransport({ cwd: root });
  const base = `repos/${options.repository}`;
  await verifyPublicationEnvironment(api, base);
  const releases = await releaseList(api, base);
  const matches = releases.filter(
    (release) => release.tag_name === options.tag,
  );
  requireCondition(
    matches.length === 1,
    "Expected one existing release for the approved tag.",
  );
  const id = matches[0].id;
  const readRelease = async () => {
    const release = await api({
      method: "GET",
      path: `${base}/releases/${id}`,
    });
    validateRelease(release, id, options.tag, artifacts, options.repository);
    return release;
  };
  await verifyRemoteTag(api, base, options.tag, options.sha);
  const release = await readRelease();
  if (!release.draft) {
    await verifyDeployment();
    return { status: "already-published", tag: options.tag };
  }
  const latestCandidates = releases.filter(
    (item) => !item.draft && !item.prerelease,
  );
  const makeLatest = latestCandidates.every((item) => {
    requireCondition(
      item.tag_name.startsWith("v"),
      "A published stable release has an unsupported version tag.",
    );
    return compareVersion(version, item.tag_name.slice(1)) > 0;
  });
  // Serialize promotions in the workflow; GitHub has no compare-and-swap for the Latest pointer.
  await verifyRemoteTag(api, base, options.tag, options.sha);
  const finalRelease = await readRelease();
  await verifyDeployment();
  if (!finalRelease.draft)
    return { status: "already-published", tag: options.tag };
  const published = await api({
    method: "PATCH",
    path: `${base}/releases/${id}`,
    body: { draft: false, make_latest: makeLatest ? "true" : "false" },
  });
  validateRelease(published, id, options.tag, artifacts, options.repository);
  requireCondition(
    published.draft === false,
    "GitHub did not confirm publication; inspect the release before retrying.",
  );
  return { status: "published", tag: options.tag, latest: makeLatest };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    requireCondition(
      process.argv.length === 2,
      "Usage: node scripts/promote-release.mjs (configured by release workflow environment).",
    );
    const env = process.env;
    const result = await promoteRelease({
      root: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
      repository: env.GITHUB_REPOSITORY,
      tag: env.RELEASE_TAG,
      sha: env.RELEASE_SHA,
      qualitySha: env.QUALITY_SHA,
      expectedAssets: JSON.parse(env.RELEASE_ASSETS_JSON ?? "null"),
      telemetry: JSON.parse(env.RELEASE_TELEMETRY_JSON ?? "null"),
      installerPath: env.INSTALLER_PATH,
      signaturePath: env.SIGNATURE_PATH,
      manifestPath: env.MANIFEST_PATH,
      checksumsPath: env.CHECKSUMS_PATH,
      compliancePath: env.COMPLIANCE_PATH,
    });
    console.log(`Release ${result.tag}: ${result.status}.`);
  } catch {
    console.error(
      "Release promotion failed. No assets were overwritten; inspect the release and workflow checks before retrying.",
    );
    process.exitCode = 1;
  }
}
