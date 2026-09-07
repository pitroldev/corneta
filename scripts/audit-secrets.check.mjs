// Explicit Node test entry point; .check.mjs keeps this network/integration
// suite out of Vitest's fast offline unit-test discovery.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  prepareScanner,
  safeSnapshotPath,
  sanitizeFinding,
  scan,
} from "./audit-secrets.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("snapshot paths cannot escape the publication directory", () => {
  const base = join(tmpdir(), "corneta-scan-paths");
  for (const path of [
    "",
    "..",
    "../secret",
    ".git/config",
    resolve(base, "elsewhere"),
  ]) {
    assert.throws(() => safeSnapshotPath(path, base), /Unsafe snapshot path/);
  }
  assert.equal(
    safeSnapshotPath("src/example.ts", base),
    join(base, "src/example.ts"),
  );
});

test("audit summaries never carry secret, match, author, or email fields", () => {
  assert.deepEqual(
    sanitizeFinding({
      RuleID: "sample",
      File: "fixture.ts",
      StartLine: 12,
      Commit: "abc",
      Fingerprint: "abc:fixture.ts:sample:12",
      Secret: "must not escape",
      Match: "must not escape",
      Author: "private",
      Email: "private",
    }),
    {
      rule: "sample",
      path: "fixture.ts",
      line: 12,
      commit: "abc",
      fingerprint: "abc:fixture.ts:sample:12",
    },
  );
});

test("reviewed fixture exceptions remain exact; new values and paths fail", async () => {
  const cache = join(root, ".artifacts", "secret-audit");
  mkdirSync(cache, { recursive: true });
  const scanner = await prepareScanner(cache);
  const fixtureRoot = mkdtempSync(join(tmpdir(), "corneta-secret-fixtures-"));
  const config = join(root, ".gitleaks.toml");
  const records = [
    [
      "src/lib/telemetry-schema.test.ts",
      [
        "eyJhbGciOiJIUzI1NiJ9",
        "eyJzdWIiOiIxMjM0NTY3ODkwIn0",
        "signature123456",
      ].join("."),
    ],
    [
      "web/lib/telemetry-schema.test.ts",
      'token: "' + ["phc", "12345678"].join("_") + '"',
    ],
    [
      "src-tauri/src/telemetry.rs",
      "access_token=" +
        ["eyJhbGciOiJIUzI1NiJ9", "abcdefghijk", "abcdefghijklmnop"].join("."),
    ],
  ];
  const write = (file, content) => {
    const path = safeSnapshotPath(file, fixtureRoot);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  };
  const runScan = (name) =>
    scan(
      scanner,
      "dir",
      fixtureRoot,
      join(cache, `${name}.redacted.json`),
      config,
    );
  for (const [file, content] of records) write(file, content);
  assert.deepEqual(runScan("test-allowed"), []);
  for (const [file, content] of records) write(`unexpected/${file}`, content);
  assert.equal(runScan("test-wrong-path").length, 3);
  write(records[0][0], records[0][1].replace("123456", "654321"));
  write(records[1][0], records[1][1].replace("12345678", "87654321"));
  write(
    records[2][0],
    records[2][1].replace("abcdefghijklmnop", "ponmlkjihgfedcba"),
  );
  assert.equal(runScan("test-new-values").length, 6);
});
