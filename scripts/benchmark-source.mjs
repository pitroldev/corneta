import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { sourceFiles } from "./source-files.mjs";

export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

export function measuredSourcePath(path) {
  if (path.split("/").some((part) => part.startsWith(".env"))) return false;
  return (
    (/^src\//.test(path) && /\.(?:tsx?|m?js|css|json)$/.test(path)) ||
    /^scripts\/(?:benchmark-reports\.ts|benchmark-source\.mjs|source-files\.mjs)$/.test(
      path,
    ) ||
    /^(?:web\/)?(?:package\.json|tsconfig(?:\.[\w-]+)?\.json)$/.test(path) ||
    path === "pnpm-lock.yaml"
  );
}

export function sourceIdentity(root) {
  const files = sourceFiles(root).filter(
    (path) => measuredSourcePath(path) && existsSync(resolve(root, path)),
  );
  const manifest = files.map((path) => {
    const absolute = resolve(root, path);
    if (lstatSync(absolute).isSymbolicLink())
      throw new Error("Benchmark source cannot be a symlink.");
    return [
      path,
      sha256(readFileSync(absolute, "utf8").replace(/\r\n/g, "\n")),
    ];
  });
  if (!manifest.some(([path]) => path === "src/lib/report.ts"))
    throw new Error("Report benchmark source is missing.");
  const head = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  return {
    algorithm: "sha256-sorted-path-content-sha256-utf8-lf-v1",
    sourceTreeSha256: sha256(JSON.stringify(manifest)),
    fileCount: files.length,
    gitHead:
      head.status === 0 && /^[a-f0-9]{40,64}$/.test(head.stdout.trim())
        ? head.stdout.trim()
        : null,
    scope:
      "src text sources, benchmark and enumeration scripts, package manifests, TypeScript configs and pnpm lockfile; includes working-tree changes, excludes credentials and generated files",
  };
}
