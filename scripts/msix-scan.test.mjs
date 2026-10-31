import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
const scanner = resolve(import.meta.dirname, "check-bundle.mjs");
const workspaces = [];
afterEach(() => {
  for (const path of workspaces.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "corneta-msix-scan-"));
  workspaces.push(root);
  mkdirSync(join(root, "dist/.vite"), { recursive: true });
  mkdirSync(join(root, "layout"));
  writeFileSync(join(root, "dist/.vite/manifest.json"), "{}");
  for (const name of [
    "AppxManifest.xml",
    "corneta.exe",
    "ffmpeg.exe",
    "mediamtx.exe",
  ])
    writeFileSync(join(root, "layout", name), "synthetic package scan fixture");
  return root;
}
function scan(root, ...args) {
  return spawnSync(process.execPath, [scanner, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}
it("scans MSIX payloads without relaxing the NSIS signature gate", () => {
  const root = fixture();
  expect(scan(root, "--msix-layout", "layout").status).toBe(0);
  const nsis = scan(root, "layout");
  expect(nsis.status).not.toBe(0);
  expect(nsis.stderr).toContain("Expected exactly one installer");
});
it("rejects secrets and source maps in the MSIX payload", () => {
  const root = fixture();
  writeFileSync(
    join(root, "layout/corneta.exe"),
    "GOCSPX-synthetic-secret-fixture",
  );
  const secret = scan(root, "--msix-layout", "layout");
  expect(secret.status).not.toBe(0);
  expect(secret.stderr).toContain("Secret detected");
  expect(secret.stderr).not.toContain("synthetic-secret-fixture");
  writeFileSync(join(root, "layout/corneta.exe"), "synthetic executable");
  writeFileSync(join(root, "layout/app.js.map"), "{}");
  expect(scan(root, "--msix-layout", "layout").stderr).toContain(
    "Source maps must not",
  );
});
it("rejects incomplete layouts", () => {
  const root = fixture();
  rmSync(join(root, "layout/AppxManifest.xml"));
  expect(scan(root, "--msix-layout", "layout").stderr).toContain(
    "MSIX layout is missing AppxManifest.xml",
  );
});
