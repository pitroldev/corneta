// Scan publishable files and all local refs without loading .env or uploading data.
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const scannerVersion = "8.30.1";
const archives = {
  "win32-x64": {
    name: "gitleaks_8.30.1_windows_x64.zip",
    sha256: "d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e",
  },
  "linux-x64": {
    name: "gitleaks_8.30.1_linux_x64.tar.gz",
    sha256: "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb",
  },
};
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
    ...options,
  });
  if (result.error || result.status !== 0) {
    // Never echo a child command, environment, or raw scanner output on failure.
    throw new Error(`Command failed (exit ${result.status ?? "unavailable"}).`);
  }
  return result.stdout;
}

export function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function safeSnapshotPath(file, targetRoot) {
  const target = resolve(targetRoot, file);
  const inside = relative(targetRoot, target);
  if (
    !file ||
    isAbsolute(file) ||
    !inside ||
    inside === ".." ||
    inside.startsWith(`..${sep}`) ||
    isAbsolute(inside) ||
    file.split(/[\\/]/).includes(".git")
  ) {
    throw new Error("Unsafe snapshot path.");
  }
  return target;
}

export function sanitizeFinding(finding) {
  // Deliberately exclude Secret, Match, line contents, authors and emails.
  return {
    rule: finding.RuleID,
    path: finding.File,
    line: finding.StartLine,
    commit: finding.Commit || undefined,
    fingerprint: finding.Fingerprint,
  };
}

export async function prepareScanner(auditDirectory) {
  const archive = archives[`${process.platform}-${process.arch}`];
  if (!archive) {
    throw new Error("Automatic scanner setup supports Windows/Linux x64 only.");
  }
  const archivePath = join(auditDirectory, archive.name);
  if (!existsSync(archivePath)) {
    const url = `https://github.com/gitleaks/gitleaks/releases/download/v${scannerVersion}/${archive.name}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error("Official Gitleaks download failed.");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== archive.sha256) {
      throw new Error("Gitleaks download checksum mismatch.");
    }
    writeFileSync(archivePath, bytes, { flag: "wx" });
  }
  if (hash(readFileSync(archivePath)) !== archive.sha256) {
    throw new Error("Cached Gitleaks archive checksum mismatch.");
  }
  // Extract the executable again from the verified archive; do not trust a
  // previously extracted executable left in the writable local cache.
  const binDirectory = mkdtempSync(join(auditDirectory, "bin-"));
  const executable = process.platform === "win32" ? "gitleaks.exe" : "gitleaks";
  run("tar", ["-xf", archivePath, "-C", binDirectory, executable]);
  const scanner = join(binDirectory, executable);
  if (run(scanner, ["version"]).trim() !== scannerVersion) {
    throw new Error("Unexpected Gitleaks version.");
  }
  return scanner;
}

export function scan(scanner, kind, target, reportPath, configPath) {
  const env = { ...process.env };
  // Explicit local config must not be overridden by a developer/CI environment.
  delete env.GITLEAKS_CONFIG;
  delete env.GITLEAKS_CONFIG_TOML;
  const result = spawnSync(
    scanner,
    [
      kind,
      ...(kind === "git" ? ["--log-opts=--all --full-history"] : []),
      "--config",
      configPath,
      "--ignore-gitleaks-allow",
      "--gitleaks-ignore-path",
      dirname(reportPath),
      "--redact=100",
      "--no-banner",
      "--log-level=error",
      "--report-format=json",
      "--report-path",
      reportPath,
      ".",
    ],
    { cwd: target, encoding: "utf8", env, windowsHide: true },
  );
  if (
    result.error ||
    ![0, 1].includes(result.status) ||
    !existsSync(reportPath)
  ) {
    throw new Error("Secret scanning failed; no clean result can be claimed.");
  }
  const findings = JSON.parse(readFileSync(reportPath, "utf8"));
  if (
    !Array.isArray(findings) ||
    (result.status === 1 && findings.length === 0)
  ) {
    throw new Error("Secret scanner result was inconsistent.");
  }
  return findings.map(sanitizeFinding);
}

export async function auditSecrets() {
  if (run("git", ["rev-parse", "--is-shallow-repository"]).trim() !== "false") {
    throw new Error("Full history is required: fetch with --unshallow first.");
  }
  const auditDirectory = join(root, ".artifacts", "secret-audit");
  mkdirSync(auditDirectory, { recursive: true });
  const scanner = await prepareScanner(auditDirectory);
  const runDirectory = mkdtempSync(join(auditDirectory, "run-"));
  const snapshot = join(runDirectory, "snapshot");
  mkdirSync(snapshot);
  const files = [
    ...new Set(
      run("git", [
        "ls-files",
        "-z",
        "--cached",
        "--others",
        "--exclude-standard",
      ])
        .split("\0")
        .filter(Boolean),
    ),
  ].sort();
  const inventory = [];
  for (const file of files) {
    const source = safeSnapshotPath(file, root);
    if (!existsSync(source)) continue; // A tracked deletion is absent from publication.
    const stat = lstatSync(source);
    const actualPath = realpathSync(source);
    const expectedPath = join(realpathSync(root), relative(root, source));
    const samePath =
      process.platform === "win32"
        ? actualPath.toLowerCase() === expectedPath.toLowerCase()
        : actualPath === expectedPath;
    if (!stat.isFile() || stat.isSymbolicLink() || !samePath) {
      throw new Error(
        "Snapshot contains a symlink/submodule; review it explicitly.",
      );
    }
    const destination = safeSnapshotPath(file, snapshot);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    inventory.push({ path: file, sha256: hash(readFileSync(destination)) });
  }
  const config = join(snapshot, ".gitleaks.toml");
  const summary = {
    version: 1,
    scannedAt: new Date().toISOString(),
    scannerVersion,
    head: run("git", ["rev-parse", "HEAD"]).trim(),
    refs: run("git", ["for-each-ref", "--format=%(refname) %(objectname)"])
      .trim()
      .split("\n"),
    reachableCommits: Number(
      run("git", ["rev-list", "--all", "--count"]).trim(),
    ),
    snapshotFiles: inventory.length,
    snapshotSha256: hash(JSON.stringify(inventory)),
    configurationSha256: hash(readFileSync(config)),
    historyFindings: scan(
      scanner,
      "git",
      root,
      join(runDirectory, "history.redacted.json"),
      config,
    ),
    snapshotFindings: scan(
      scanner,
      "dir",
      snapshot,
      join(runDirectory, "snapshot.redacted.json"),
      config,
    ),
    limitations:
      "Local refs and non-ignored publication snapshot only; no remote attachments, image OCR, or credential validity check. Re-run after the final edits/commit and fetching publication refs.",
  };
  writeFileSync(
    join(runDirectory, "inventory.json"),
    `${JSON.stringify(inventory, null, 2)}\n`,
  );
  writeFileSync(
    join(auditDirectory, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  console.log(JSON.stringify(summary, null, 2));
  return summary.historyFindings.length + summary.snapshotFindings.length === 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  auditSecrets()
    .then((clean) => {
      process.exitCode = clean ? 0 : 1;
    })
    .catch((error) => {
      console.error(`Secret audit failed: ${error.message}`);
      process.exitCode = 1;
    });
}
