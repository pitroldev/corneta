import { afterEach, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  readdirSync,
  renameSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { bumpOptions, bumpVersion } from "./bump.mjs";

const directories = [];
afterEach(() => {
  for (const root of directories.splice(0)) {
    if (dirname(root) !== tmpdir()) throw new Error("Invalid test cleanup");
    rmSync(root, { recursive: true, force: true });
  }
});
function repository() {
  const root = mkdtempSync(join(tmpdir(), "corneta-bump-test-"));
  directories.push(root);
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(root, "no-global-config"),
  };
  for (const key of Object.keys(env))
    if (
      /^GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)|AUTHOR_|COMMITTER_)/.test(
        key,
      )
    )
      delete env[key];
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      env,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("init", "--quiet");
  git("config", "user.name", "Synthetic Maintainer");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
  git("config", "core.autocrlf", "false");
  mkdirSync(join(root, "src-tauri"));
  const contents = {
    "package.json": '{"name":"corneta","version":"0.7.0"}\n',
    "src-tauri/tauri.conf.json": '{"version":"0.7.0"}\n',
    "src-tauri/Cargo.toml": '[package]\nname = "corneta"\nversion = "0.7.0"\n',
    "src-tauri/Cargo.lock":
      '[[package]]\nname = "corneta"\nversion = "0.7.0"\n\n[[package]]\nname = "other"\nversion = "1.2.3"\n',
    "unrelated.txt": "before\n",
  };
  for (const [file, value] of Object.entries(contents))
    writeFileSync(join(root, file), value);
  git("add", ".");
  git("commit", "--quiet", "-m", "fixture");
  const initial = git("rev-parse", "HEAD");
  return {
    root,
    git,
    initial,
    env,
    contents,
    run: (...args) => bumpVersion(root, args, { gitEnv: env }),
  };
}
it("rejects unrelated staged work before any version write or commit", () => {
  const repo = repository();
  writeFileSync(join(repo.root, "unrelated.txt"), "user staged work\n");
  repo.git("add", "unrelated.txt");
  const before = repo.git("diff", "--cached");
  expect(() => repo.run("patch", "--commit")).toThrow("staged");
  expect(repo.git("diff", "--cached")).toBe(before);
  expect(repo.git("rev-parse", "HEAD")).toBe(repo.initial);
  expect(readFileSync(join(repo.root, "package.json"), "utf8")).toBe(
    repo.contents["package.json"],
  );
});
it("rejects an existing target tag without writes", () => {
  const repo = repository();
  repo.git("tag", "v0.7.1");
  expect(() => repo.run("patch", "--commit")).toThrow("já existe");
  expect(repo.git("status", "--porcelain")).toBe("");
  expect(repo.git("rev-parse", "HEAD")).toBe(repo.initial);
});
it("rejects target edits and mismatched committed versions before writing", () => {
  const repo = repository();
  writeFileSync(
    join(repo.root, "package.json"),
    repo.contents["package.json"] + " ",
  );
  expect(() => repo.run("patch")).toThrow("alterações locais");
  writeFileSync(join(repo.root, "package.json"), repo.contents["package.json"]);
  writeFileSync(
    join(repo.root, "src-tauri/tauri.conf.json"),
    '{"version":"0.6.0"}',
  );
  repo.git("add", ".");
  repo.git("commit", "--quiet", "-m", "inconsistent fixture");
  expect(() => repo.run("patch")).toThrow("divergente");
  expect(repo.git("status", "--porcelain")).toBe("");
});
it("commits only synchronized targets, leaves unrelated unstaged work and creates the exact tag", () => {
  const repo = repository();
  writeFileSync(join(repo.root, "unrelated.txt"), "user local work\n");
  expect(repo.run("minor", "--commit").version).toBe("0.8.0");
  expect(
    repo.git("show", "--format=", "--name-only", "HEAD").split("\n").sort(),
  ).toEqual(
    Object.keys(repo.contents)
      .filter((name) => name !== "unrelated.txt")
      .sort(),
  );
  expect(repo.git("rev-parse", "v0.8.0")).toBe(repo.git("rev-parse", "HEAD"));
  expect(repo.git("status", "--porcelain")).toContain("unrelated.txt");
  expect(
    readFileSync(join(repo.root, "src-tauri/Cargo.lock"), "utf8"),
  ).toContain('name = "other"\nversion = "1.2.3"');
});
it("updates without committing and leaves no staging files", () => {
  const repo = repository();
  expect(repo.run("patch").version).toBe("0.7.1");
  expect(repo.git("rev-parse", "HEAD")).toBe(repo.initial);
  expect(repo.git("diff", "--cached")).toBe("");
  expect(
    [
      ...readdirSync(repo.root),
      ...readdirSync(join(repo.root, "src-tauri")),
    ].some((file) => file.includes(".bump-")),
  ).toBe(false);
});
it("restores owned replacements after an injected filesystem failure", () => {
  const repo = repository();
  let count = 0;
  expect(() =>
    bumpVersion(repo.root, ["patch"], {
      gitEnv: repo.env,
      replaceFile: (source, destination) => {
        if (++count === 2) throw new Error("Synthetic write failure");
        renameSync(source, destination);
      },
    }),
  ).toThrow("Escritas próprias revertidas");
  expect(repo.git("status", "--porcelain")).toBe("");
});
it("preserves changes with recovery instructions when a commit hook fails", () => {
  const repo = repository();
  const hooks = join(repo.root, "fixture-hooks");
  mkdirSync(hooks);
  writeFileSync(join(hooks, "pre-commit"), "#!/bin/sh\nexit 1\n", {
    mode: 0o755,
  });
  repo.git("config", "core.hooksPath", hooks);
  expect(() => repo.run("patch", "--commit")).toThrow("Nada foi resetado");
  expect(repo.git("rev-parse", "HEAD")).toBe(repo.initial);
  expect(
    JSON.parse(readFileSync(join(repo.root, "package.json"), "utf8")).version,
  ).toBe("0.7.1");
  expect(repo.git("tag", "--list")).toBe("");
});
it.each([
  ["patch", "0.7.0"],
  ["patch", "0.6.9"],
  ["patch", "01.0.0"],
  ["patch", "1.2.3;whoami"],
  ["patch", "--unknown"],
  ["anything", "1.0.0"],
  ["patch", "--commit", "--commit"],
])("rejects unsafe/ambiguous arguments: %s", (...args) => {
  expect(() => bumpOptions(args, "0.7.0")).toThrow();
});
