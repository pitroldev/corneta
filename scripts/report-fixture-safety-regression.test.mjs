import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  copyFileSync,
  existsSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  assertNoFixtureLinks,
  copyFixtureExclusive,
  fixtureHash,
  preflightFixtureOutputs,
  validateFixtureManifest,
} from "./report-fixture-safety.mjs";

const temporaryRoots = [];
function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), "corneta-fixture-regression-"));
  temporaryRoots.push(root);
  return root;
}
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    // Exact roots returned by mkdtemp; never an application profile/workspace.
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = temporaryRoot();
  const sessionsDir = join(root, "sessions");
  mkdirSync(sessionsDir);
  const file = join(sessionsDir, "1000.ndjson");
  writeFileSync(file, '{"kind":"meta"}\n');
  return {
    root,
    file,
    manifest: {
      schemaVersion: 2,
      sessionsDir,
      backupDir: join(
        root,
        "sessions-backup-before-fixtures-2026-09-06T00-00-00-000Z",
      ),
      generatedFiles: [file],
      generatedHashes: { "1000.ndjson": fixtureHash(file) },
    },
  };
}

describe("fixture path and copy regression guards", () => {
  it("rejects dangling links and missing children under dangling junctions", () => {
    const root = temporaryRoot();
    const link = join(root, "dangling");
    symlinkSync(
      join(root, "absent-target"),
      link,
      process.platform === "win32" ? "junction" : "dir",
    );
    expect(existsSync(link)).toBe(false);
    expect(() => assertNoFixtureLinks(link)).toThrow(/symlinks/);
    expect(() => assertNoFixtureLinks(join(link, "1000.ndjson"))).toThrow(
      /symlinks/,
    );
  });

  it("copies only to absent non-linked destinations and never replaces an existing file", () => {
    const { root, file } = fixture();
    const destination = join(root, "copy.ndjson");
    copyFixtureExclusive(file, destination);
    expect(readFileSync(destination, "utf8")).toBe(readFileSync(file, "utf8"));
    writeFileSync(destination, "user-owned");
    expect(() => copyFixtureExclusive(file, destination)).toThrow();
    expect(readFileSync(destination, "utf8")).toBe("user-owned");
    const link = join(root, "dangling");
    symlinkSync(
      join(root, "absent-target"),
      link,
      process.platform === "win32" ? "junction" : "dir",
    );
    expect(() => copyFixtureExclusive(file, join(link, "copy.ndjson"))).toThrow(
      /symlinks/,
    );
    expect(existsSync(join(root, "absent-target"))).toBe(false);
  });

  it("preflights chat/video collisions and permits only a validated prior generation", () => {
    const { root, file, manifest } = fixture();
    expect(
      preflightFixtureOutputs(manifest, root, ["1000.ndjson", "2000.mp4"]),
    ).toEqual([file, join(root, "sessions", "2000.mp4")]);
    for (const name of ["2000.chat.ndjson", "2000.mp4"]) {
      const existing = join(root, "sessions", name);
      writeFileSync(existing, "user-owned");
      expect(() =>
        preflightFixtureOutputs(manifest, root, ["1000.ndjson", name]),
      ).toThrow(/colidiu/);
      expect(readFileSync(existing, "utf8")).toBe("user-owned");
      expect(readFileSync(file, "utf8")).toContain("meta");
    }
    expect(() =>
      preflightFixtureOutputs(null, root, ["../1000.ndjson"]),
    ).toThrow(/inválido/);
  });

  it("accepts an interrupted publication with registered but still missing files", () => {
    const { root, file, manifest } = fixture();
    const pending = join(root, "sessions", "2000.ndjson");
    expect(
      validateFixtureManifest(
        {
          ...manifest,
          generatedFiles: [file, pending],
          generatedHashes: {
            ...manifest.generatedHashes,
            "2000.ndjson": "planned-hash",
          },
        },
        root,
      ),
    ).toEqual([file, pending]);
    writeFileSync(pending, "unexpected user file");
    expect(() =>
      validateFixtureManifest(
        { ...manifest, generatedFiles: [file, pending] },
        root,
      ),
    ).toThrow(/modificado/);
  });
});

function isolatedSeeder() {
  const workspace = temporaryRoot();
  const scripts = join(workspace, "scripts");
  mkdirSync(scripts);
  const originals = dirname(fileURLToPath(import.meta.url));
  for (const name of [
    "seed-report-fixtures.mjs",
    "report-fixture-safety.mjs",
  ]) {
    copyFileSync(join(originals, name), join(scripts, name));
  }
  const appData = join(workspace, "test-appdata");
  const root = join(workspace, ".artifacts", "report-fixtures");
  return {
    workspace,
    scripts,
    root,
    appData,
    run: (...args) =>
      spawnSync(
        process.execPath,
        [join(scripts, "seed-report-fixtures.mjs"), ...args],
        {
          cwd: workspace,
          env: { ...process.env, APPDATA: appData },
          encoding: "utf8",
          timeout: 15_000,
          windowsHide: true,
        },
      ),
  };
}

describe("seeder integration in an isolated temporary workspace", () => {
  it("generates integer millisecond timestamps for all media-free scenarios without rounding metrics", () => {
    const { root, run } = isolatedSeeder();
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(root, ".report-fixtures.json"), "utf8"),
    );
    expect(manifest.scenarios.length).toBeGreaterThan(10);
    let fractionalMetric = false;
    for (const file of manifest.generatedFiles) {
      expect(file.endsWith(".ndjson")).toBe(true);
      for (const raw of readFileSync(file, "utf8").trim().split("\n")) {
        const row = JSON.parse(raw);
        for (const key of ["t", "startedAt", "endedAt", "gap", "out"]) {
          if (key in row) {
            expect(Number.isSafeInteger(row[key]), `${file}: ${key}`).toBe(
              true,
            );
            expect(row[key]).toBeGreaterThanOrEqual(0);
          }
        }
        fractionalMetric ||=
          typeof row.cpu === "number" && !Number.isInteger(row.cpu);
      }
    }
    expect(fractionalMetric).toBe(true);
  });

  it("generates deterministically, replaces registered files, and cleans only its own files", () => {
    const { root, run } = isolatedSeeder();
    const first = run("--scenario", "live-perfeita");
    expect(first.status, first.stderr).toBe(0);
    const manifestPath = join(root, ".report-fixtures.json");
    const before = JSON.parse(readFileSync(manifestPath, "utf8"));
    const second = run("--scenario", "live-perfeita");
    expect(second.status, second.stderr).toBe(0);
    const after = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(after.generatedHashes).toEqual(before.generatedHashes);
    const unrelated = join(root, "sessions", "9876543210.ndjson");
    writeFileSync(unrelated, "user-owned");
    const clean = run("--clean");
    expect(clean.status, clean.stderr).toBe(0);
    expect(after.generatedFiles.every((file) => !existsSync(file))).toBe(true);
    expect(readFileSync(unrelated, "utf8")).toBe("user-owned");
    expect(existsSync(after.backupDir)).toBe(true);
  });

  it("detects a chat collision before removing the prior generation or creating any report", () => {
    const { root, run } = isolatedSeeder();
    expect(run("--scenario", "live-perfeita").status).toBe(0);
    const manifestPath = join(root, ".report-fixtures.json");
    const before = readFileSync(manifestPath, "utf8");
    const id = String(
      Date.parse("2026-01-15T12:00:00.000Z") - 7 * 86_400_000 - 26 * 60_000,
    );
    const collision = join(root, "sessions", `${id}.chat.ndjson`);
    writeFileSync(collision, "user-owned chat");
    const result = run("--scenario", "viral-raid");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("colidiu");
    expect(readFileSync(manifestPath, "utf8")).toBe(before);
    expect(existsSync(join(root, "sessions", `${id}.ndjson`))).toBe(false);
    expect(readFileSync(collision, "utf8")).toBe("user-owned chat");
    expect(
      JSON.parse(before).generatedFiles.every((file) => existsSync(file)),
    ).toBe(true);
  });

  it("preserves installed reports when video generation fails in staging", () => {
    const { workspace, scripts, root, run } = isolatedSeeder();
    expect(run("--scenario", "live-perfeita").status).toBe(0);
    const manifestPath = join(root, ".report-fixtures.json");
    const before = readFileSync(manifestPath, "utf8");
    const binaries = join(workspace, "src-tauri", "binaries");
    mkdirSync(binaries, { recursive: true });
    // Presence sentinel only: the injected error runs before any spawnSync.
    writeFileSync(
      join(binaries, "ffmpeg-x86_64-pc-windows-msvc.exe"),
      "not executed",
    );
    const seeder = join(scripts, "seed-report-fixtures.mjs");
    writeFileSync(
      seeder,
      readFileSync(seeder, "utf8").replace(
        "function createVideo(file, seconds, frequency) {",
        'function createVideo(file, seconds, frequency) { throw new Error("SIMULATED_VIDEO_FAILURE");',
      ),
    );
    const result = run("--scenario", "gravacao-completa", "--video");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("SIMULATED_VIDEO_FAILURE");
    expect(readFileSync(manifestPath, "utf8")).toBe(before);
    expect(
      JSON.parse(before).generatedFiles.every((file) => existsSync(file)),
    ).toBe(true);
    const id = String(
      Date.parse("2026-01-15T12:00:00.000Z") - 2 * 3_600_000 - 30_000,
    );
    expect(existsSync(join(root, "sessions", `${id}.ndjson`))).toBe(false);
  });

  it("refuses a dangling restore destination before deleting registered reports", () => {
    const { root, run } = isolatedSeeder();
    expect(run("--scenario", "live-perfeita").status).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(root, ".report-fixtures.json"), "utf8"),
    );
    writeFileSync(
      join(manifest.backupDir, "9876543210.ndjson"),
      "backup-owned",
    );
    const link = join(root, "sessions", "9876543210.ndjson");
    symlinkSync(
      join(root, "absent-target"),
      link,
      process.platform === "win32" ? "junction" : "dir",
    );
    const result = run("--restore");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("symlinks");
    expect(manifest.generatedFiles.every((file) => existsSync(file))).toBe(
      true,
    );
    expect(existsSync(join(root, "absent-target"))).toBe(false);
  });

  it("uses only explicitly supplied temporary APPDATA for --contributor", () => {
    const { root, appData, run } = isolatedSeeder();
    const result = run("--contributor", "--scenario", "live-perfeita");
    expect(result.status, result.stderr).toBe(0);
    const contributor = join(appData, "br.com.pitroldev.corneta.contributor");
    expect(existsSync(join(contributor, ".report-fixtures.json"))).toBe(true);
    expect(existsSync(root)).toBe(false);
    expect(existsSync(join(appData, "br.com.pitroldev.corneta"))).toBe(false);
    expect(run("--contributor", "--clean").status).toBe(0);
  });

  it("restores missing backup files but preserves current unrelated files", () => {
    const { root, run } = isolatedSeeder();
    expect(run("--scenario", "live-perfeita").status).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(root, ".report-fixtures.json"), "utf8"),
    );
    writeFileSync(
      join(manifest.backupDir, "9876543210.ndjson"),
      "missing backup",
    );
    writeFileSync(join(manifest.backupDir, "9876543211.ndjson"), "old backup");
    writeFileSync(
      join(root, "sessions", "9876543211.ndjson"),
      "current user file",
    );
    const result = run("--restore");
    expect(result.status, result.stderr).toBe(0);
    expect(
      readFileSync(join(root, "sessions", "9876543210.ndjson"), "utf8"),
    ).toBe("missing backup");
    expect(
      readFileSync(join(root, "sessions", "9876543211.ndjson"), "utf8"),
    ).toBe("current user file");
    expect(existsSync(manifest.backupDir)).toBe(true);
  });
});
