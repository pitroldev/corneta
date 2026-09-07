import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const generated = new Set([
  "node_modules",
  ".git",
  ".artifacts",
  ".claude",
  ".impeccable",
  "dist",
  "dist-ssr",
  "target",
  "gen",
  "binaries",
  ".generated",
  "out",
]);

export function sourceFiles(root) {
  const top = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: root,
    encoding: "utf8",
  });
  const git =
    top.status === 0 && resolve(top.stdout.trim()) === resolve(root)
      ? spawnSync(
          "git",
          ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
          { cwd: root, encoding: "utf8" },
        )
      : { status: 1 };
  if (git.status === 0)
    return [...new Set(git.stdout.split("\0").filter(Boolean))].sort();
  // An exported source archive/snapshot need not contain .git. Never descend into
  // generated trees or symlinks when validating such a contributor checkout.
  const files = [];
  function visit(relative = "") {
    for (const item of readdirSync(join(root, relative), {
      withFileTypes: true,
    })) {
      if (
        item.isSymbolicLink() ||
        generated.has(item.name) ||
        item.name.startsWith(".next") ||
        (item.name.startsWith(".env") && item.name !== ".env.example")
      )
        continue;
      const path = relative ? `${relative}/${item.name}` : item.name;
      if (item.isDirectory()) visit(path);
      else if (item.isFile()) files.push(path);
    }
  }
  visit();
  return files.sort();
}
