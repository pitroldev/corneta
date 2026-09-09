import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkFormatting,
  grandfathered,
  normalizedHash,
} from "./check-format.mjs";
import { sourceFiles } from "./source-files.mjs";

const workspaces = [];
afterEach(() => {
  for (const path of workspaces.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function workspace() {
  const root = mkdtempSync(join(tmpdir(), "corneta-format-"));
  workspaces.push(root);
  writeFileSync(
    join(root, ".format-baseline.json"),
    JSON.stringify(
      { schemaVersion: 1, prettierVersion: "3.9.6", files: {} },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(join(root, ".prettierignore"), "node_modules/\n");
  return root;
}

describe("formatting coverage and exact legacy baseline", () => {
  it.each([
    "src/a.ts",
    "web/a.tsx",
    "scripts/a.mjs",
    "docs/a.md",
    "config.json",
    ".github/workflows/a.yml",
    "src-tauri/tauri.conf.json",
  ])("detects a new formatting regression in %s", async (file) => {
    const root = workspace();
    const source = file.endsWith(".md")
      ? "#    Title\n"
      : file.endsWith(".yml")
        ? "a:    b\n"
        : file.endsWith(".json")
          ? '{"a":1}'
          : "const a={b:1};\n";
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), source);
    expect((await checkFormatting(root)).failures).toContain(file);
    await checkFormatting(root, { write: true });
    expect((await checkFormatting(root)).failures).toEqual([]);
  });
  it("accepts only the exact old content, tolerates Git EOL conversion and can enforce all debt", () => {
    expect(normalizedHash("#  old\n")).toMatch(/^sha256:[a-f\d]{64}$/);
    const baseline = { files: { "docs/old.md": normalizedHash("#  old\n") } };
    expect(grandfathered("docs/old.md", "#  old\r\n", baseline)).toBe(true);
    expect(grandfathered("docs/old.md", "#  changed\n", baseline)).toBe(false);
    expect(grandfathered("docs/new.md", "#  old\n", baseline)).toBe(false);
    expect(grandfathered("docs/old.md", "#  old\n", baseline, true)).toBe(
      false,
    );
  });
  it("rejects ambiguous untyped hashes instead of treating them as accepted debt", async () => {
    const root = workspace();
    const path = join(root, ".format-baseline.json");
    const baseline = JSON.parse(readFileSync(path, "utf8"));
    baseline.files["old.md"] = normalizedHash("#  old\n").slice(
      "sha256:".length,
    );
    writeFileSync(path, JSON.stringify(baseline));
    await expect(checkFormatting(root)).rejects.toThrow(
      "Invalid formatting baseline",
    );
  });
  it("formats changed files without rewriting untouched historical prose", async () => {
    const root = workspace();
    writeFileSync(join(root, "old.md"), "#   old\n");
    const path = join(root, ".format-baseline.json");
    const baseline = JSON.parse(readFileSync(path, "utf8"));
    baseline.files["old.md"] = normalizedHash("#   old\n");
    writeFileSync(path, JSON.stringify(baseline, null, 2) + "\n");
    await checkFormatting(root, { write: true });
    expect(readFileSync(join(root, "old.md"), "utf8")).toBe("#   old\n");
  });
  it("ignores generated trees and dotenv in source archives without .git", () => {
    const root = workspace();
    for (const dir of [
      "node_modules",
      ".next",
      ".artifacts",
      "src-tauri/target",
    ]) {
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, "private.md"), "not source");
    }
    writeFileSync(join(root, ".env"), "DONT_READ=sentinel\n");
    expect(sourceFiles(root).some((file) => /private|\.env/.test(file))).toBe(
      false,
    );
  });
  it("keeps only the shared design snapshot in both Git and exported sources", () => {
    const root = workspace();
    writeFileSync(
      join(root, ".gitignore"),
      "/.impeccable/\n/web/.impeccable/*\n!/web/.impeccable/design.json\n",
    );
    for (const dir of [
      ".impeccable",
      "web/.impeccable",
      "web/.impeccable/cache",
    ]) {
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, "private.json"), "{}");
    }
    const snapshot = "web/.impeccable/design.json";
    writeFileSync(join(root, snapshot), '{"schemaVersion":2}\n');
    const exported = sourceFiles(root);
    expect(exported).toContain(snapshot);
    expect(exported.filter((file) => file.includes(".impeccable"))).toEqual([
      snapshot,
    ]);
    expect(spawnSync("git", ["init", "--quiet"], { cwd: root }).status).toBe(0);
    expect(
      spawnSync("git", ["add", "--", snapshot], { cwd: root }).status,
    ).toBe(0);
    expect(sourceFiles(root)).toEqual(exported);
  });
  it("does not follow a junction replacing the shared design directory", () => {
    const root = workspace();
    const external = workspace();
    mkdirSync(join(root, "web"));
    writeFileSync(join(external, "design.json"), "{}");
    symlinkSync(external, join(root, "web/.impeccable"), "junction");
    expect(sourceFiles(root).some((file) => file.includes(".impeccable"))).toBe(
      false,
    );
  });
  it("rejects a directory posing as the shared design file", () => {
    const root = workspace();
    mkdirSync(join(root, "web/.impeccable/design.json"), { recursive: true });
    writeFileSync(join(root, "web/.impeccable/design.json/private.json"), "{}");
    expect(sourceFiles(root).some((file) => file.includes(".impeccable"))).toBe(
      false,
    );
  });
  it.each([false, true])(
    "refuses a tracked file redirected outside by its parent directory (write=%s)",
    async (write) => {
      const root = workspace();
      const external = workspace();
      const source = "const a={b:1};\n";
      mkdirSync(join(root, "src"));
      writeFileSync(join(root, "src/a.ts"), source);
      expect(spawnSync("git", ["init", "--quiet"], { cwd: root }).status).toBe(
        0,
      );
      expect(
        spawnSync("git", ["add", "--", "src/a.ts"], { cwd: root }).status,
      ).toBe(0);
      // Ignore the replacement link, not the indexed child, to reach the realpath guard on every OS.
      writeFileSync(join(root, ".gitignore"), "/src\n");
      renameSync(join(root, "src"), join(external, "src"));
      symlinkSync(join(external, "src"), join(root, "src"), "junction");
      const files = sourceFiles(root);
      expect(files).toContain("src/a.ts");
      expect(files).not.toContain("src");
      await expect(checkFormatting(root, { write })).rejects.toThrow(
        "outside the workspace",
      );
      expect(readFileSync(join(external, "src/a.ts"), "utf8")).toBe(source);
    },
  );
  it.each([false, true])(
    "refuses a tracked source replaced by a directory symlink (write=%s)",
    async (write) => {
      const root = workspace();
      const external = workspace();
      const source = "const a={b:1};\n";
      writeFileSync(join(root, "linked.ts"), source);
      expect(spawnSync("git", ["init", "--quiet"], { cwd: root }).status).toBe(
        0,
      );
      expect(
        spawnSync("git", ["add", "--", "linked.ts"], { cwd: root }).status,
      ).toBe(0);
      renameSync(join(root, "linked.ts"), join(external, "a.ts"));
      symlinkSync(external, join(root, "linked.ts"), "junction");
      expect(sourceFiles(root)).toContain("linked.ts");
      await expect(checkFormatting(root, { write })).rejects.toThrow(
        "Cannot format a symlink source: linked.ts",
      );
      expect(readFileSync(join(external, "a.ts"), "utf8")).toBe(source);
    },
  );
});
