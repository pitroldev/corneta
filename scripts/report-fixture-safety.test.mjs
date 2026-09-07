import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  assertNoFixtureLinks,
  fixtureHash,
  validateFixtureManifest,
} from "./report-fixture-safety.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "corneta-fixture-safety-"));
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

describe("fixture data ownership", () => {
  it("only accepts registered, unmodified files under sessions", () => {
    const { root, file, manifest } = fixture();
    expect(validateFixtureManifest(manifest, root)).toEqual([file]);
    writeFileSync(file, "user edited this report");
    expect(() => validateFixtureManifest(manifest, root)).toThrow(/modificado/);
  });
  it("refuses old, duplicate and escaping manifests before any removal", () => {
    const { root, file, manifest } = fixture();
    expect(() =>
      validateFixtureManifest({ ...manifest, schemaVersion: 1 }, root),
    ).toThrow();
    expect(() =>
      validateFixtureManifest(
        { ...manifest, generatedFiles: [file, file] },
        root,
      ),
    ).toThrow();
    for (const bad of [
      join(root, "1000.ndjson"),
      "../1000.ndjson",
      join(root, "sessions", "personal.mp4"),
    ]) {
      expect(() =>
        validateFixtureManifest({ ...manifest, generatedFiles: [bad] }, root),
      ).toThrow();
    }
    expect(() =>
      validateFixtureManifest({ ...manifest, backupDir: tmpdir() }, root),
    ).toThrow();
  });
  it("rejects directory junctions before following a fixture path", () => {
    const { root } = fixture();
    const destination = mkdtempSync(
      join(tmpdir(), "corneta-fixture-external-"),
    );
    const link = join(root, "redirect");
    symlinkSync(
      destination,
      link,
      process.platform === "win32" ? "junction" : "dir",
    );
    expect(() => assertNoFixtureLinks(join(link, "1000.ndjson"))).toThrow(
      /symlinks/,
    );
  });
});
