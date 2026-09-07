import { describe, expect, it } from "vitest";
import {
  measuredSourcePath,
  sha256,
  sourceIdentity,
} from "./benchmark-source.mjs";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("benchmark source provenance", () => {
  it("includes measured code and dependencies but excludes evidence and credentials", () => {
    for (const path of [
      "src/lib/report.ts",
      "src/lib/i18n/pt.ts",
      "scripts/benchmark-reports.ts",
      "scripts/benchmark-source.mjs",
      "pnpm-lock.yaml",
      "web/package.json",
    ])
      expect(measuredSourcePath(path)).toBe(true);
    for (const path of [
      ".env",
      "src/.env/private.json",
      "compliance/performance-baseline.json",
      ".artifacts/report.json",
      "web/.next/cache.json",
    ])
      expect(measuredSourcePath(path)).toBe(false);
  });

  it("identifies current contents in source exports, tolerates CRLF and detects code changes", () => {
    const root = mkdtempSync(join(tmpdir(), "corneta-benchmark-source-"));
    try {
      mkdirSync(join(root, "src/lib"), { recursive: true });
      const report = join(root, "src/lib/report.ts");
      writeFileSync(report, "export const answer = 1;\r\n");
      const before = sourceIdentity(root);
      expect(before.gitHead).toBeNull();
      expect(before.fileCount).toBe(1);
      writeFileSync(report, "export const answer = 1;\n");
      expect(sourceIdentity(root).sourceTreeSha256).toBe(
        before.sourceTreeSha256,
      );
      writeFileSync(report, "export const answer = 2;\n");
      expect(sourceIdentity(root).sourceTreeSha256).not.toBe(
        before.sourceTreeSha256,
      );
      expect(sha256("fixture")).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
