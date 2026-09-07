import { createHash } from "node:crypto";
import { readFileSync, readdirSync, lstatSync, realpathSync } from "node:fs";
import { resolve, relative, sep, isAbsolute } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const realRoot = realpathSync(root);
const expectedRoots = [
  "src-tauri/icons",
  "src-tauri/installer",
  "web/content/assets/originals",
  "web/public/images",
  "web/app/icon.svg",
];
const review = JSON.parse(
  readFileSync(resolve(root, "compliance/public-assets-review.json"), "utf8"),
) as {
  schemaVersion: number;
  reviewedAt: string;
  roots: string[];
  files: { file: string; sha256: string }[];
};
function assetPath(path: string): string {
  const absolute = resolve(root, path);
  const local = relative(root, absolute);
  if (
    !path ||
    isAbsolute(path) ||
    isAbsolute(local) ||
    local === ".." ||
    local.startsWith(`..${sep}`)
  )
    throw new Error("Asset outside project");
  if (lstatSync(absolute).isSymbolicLink())
    throw new Error("Public material cannot be a symlink/junction");
  const physical = relative(realRoot, realpathSync(absolute));
  if (
    isAbsolute(physical) ||
    physical === ".." ||
    physical.startsWith(`..${sep}`)
  )
    throw new Error("Asset resolves outside project");
  return absolute;
}

function assets(path: string): string[] {
  const absolute = assetPath(path);
  if (lstatSync(absolute).isDirectory())
    return readdirSync(absolute).flatMap((child) => assets(`${path}/${child}`));
  if (!lstatSync(absolute).isFile())
    throw new Error("Unsupported public material");
  // Review every file in these roots, regardless of extension; a new GIF, video,
  // font or nested metadata file must not bypass the inventory.
  return [path];
}

describe("public material review", () => {
  it("requires a deliberate privacy review for added or removed public assets", () => {
    expect(review.schemaVersion).toBe(1);
    expect(review.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(review.roots).toEqual(expectedRoots);
    expect(review.files.length).toBeGreaterThan(0);
    expect(new Set(review.files.map(({ file }) => file)).size).toBe(
      review.files.length,
    );
    expect(review.roots.flatMap(assets).sort()).toEqual(
      review.files.map(({ file }) => file).sort(),
    );
  });

  it.each(["", "../private.png", resolve(root, "../outside.png")])(
    "rejects unsafe inventory path %s before reading it",
    (path) => expect(() => assetPath(path)).toThrow("Asset outside project"),
  );

  it.each(review.files)(
    "keeps reviewed bytes for $file",
    ({ file, sha256 }) => {
      expect(sha256).toMatch(/^[a-f0-9]{64}$/);
      const bytes = readFileSync(assetPath(file));
      // Normalize only Git's CRLF/LF text conversion between Windows and Linux.
      // Raster and other binary contents are hashed without conversion.
      const content = /\.(svg|md)$/i.test(file)
        ? bytes.toString("utf8").replace(/\r\n/g, "\n")
        : bytes;
      const actual = createHash("sha256").update(content).digest("hex");
      expect(
        actual,
        "Review original and derivative before updating the inventory",
      ).toBe(sha256);
    },
  );
});
