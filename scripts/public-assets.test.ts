import { createHash } from "node:crypto";
import { readFileSync, readdirSync, lstatSync, realpathSync } from "node:fs";
import { resolve, relative, sep, isAbsolute } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const realRoot = realpathSync(root);
const expectedRoots = [
  "docs/images/readme",
  "src-tauri/icons",
  "src-tauri/installer",
  "web/content/assets/originals",
  "web/public/images",
  "web/app/icon.svg",
];
const readmeFiles = ["live", "chat", "report"].map(
  (name) => `docs/images/readme/${name}.webp`,
);

interface CaptureProvenance {
  kind: "screenshot";
  source: "corneta-contributor-demo";
  data: "synthetic";
  capturedAt: string;
  sourceCommit: string;
  productVersion: string;
  language: "pt-BR" | "en";
  width: number;
  height: number;
  scenario: string;
  captureMethod: string;
  rights: string;
}

interface PublicAssetReview {
  file: string;
  sha256: string;
  reviewedAt?: string;
  reviewScope?: string;
  provenance?: CaptureProvenance;
}

const review = JSON.parse(
  readFileSync(resolve(root, "compliance/public-assets-review.json"), "utf8"),
) as {
  schemaVersion: number;
  reviewedAt: string;
  roots: string[];
  files: PublicAssetReview[];
};

function expectCalendarDate(value: unknown): asserts value is string {
  expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(
    new Date(`${String(value)}T00:00:00Z`).toISOString().slice(0, 10),
  ).toBe(value);
}

function expectCaptureMetadata(asset: PublicAssetReview) {
  expectCalendarDate(asset.reviewedAt);
  expect(asset.reviewScope).toMatch(/visual/i);
  expect(asset.reviewScope).toMatch(/not.*legal/i);
  expect(asset.provenance).toBeDefined();
  const capture = asset.provenance!;
  expect(capture.kind).toBe("screenshot");
  expect(capture.source).toBe("corneta-contributor-demo");
  expect(capture.data).toBe("synthetic");
  expect(capture.capturedAt).toMatch(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  );
  expect(new Date(capture.capturedAt).toISOString()).toBe(capture.capturedAt);
  expect(asset.reviewedAt >= capture.capturedAt.slice(0, 10)).toBe(true);
  expect(capture.sourceCommit).toMatch(/^[a-f0-9]{40}$/);
  expect(capture.productVersion).toMatch(/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
  expect(["pt-BR", "en"]).toContain(capture.language);
  for (const size of [capture.width, capture.height]) {
    expect(Number.isInteger(size)).toBe(true);
    expect(size).toBeGreaterThan(0);
  }
  for (const description of [
    capture.scenario,
    capture.captureMethod,
    capture.rights,
  ]) {
    expect(typeof description).toBe("string");
    expect(description.trim().length).toBeGreaterThan(0);
  }
}

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

  it("records capture provenance and a separate visual review for each README screenshot", () => {
    const captures = review.files.filter(({ file }) =>
      file.startsWith("docs/images/readme/"),
    );
    expect(captures.map(({ file }) => file).sort()).toEqual(
      [...readmeFiles].sort(),
    );
    captures.forEach(expectCaptureMetadata);
  });

  it("does not accept the legacy inventory review instead of capture-specific evidence", () => {
    expect(() =>
      expectCaptureMetadata({ file: readmeFiles[0], sha256: "a".repeat(64) }),
    ).toThrow();
  });

  it.each([
    { data: "real-user" },
    { capturedAt: "2026-02-30T12:00:00.000Z" },
    { sourceCommit: "working-tree" },
    { productVersion: "current" },
    { width: 0 },
    { captureMethod: " " },
  ])("rejects invalid capture provenance %j", (override) => {
    const capture = review.files.find(({ file }) => file === readmeFiles[0]);
    expect(capture?.provenance).toBeDefined();
    const changed = {
      ...capture,
      provenance: { ...capture!.provenance, ...override },
    } as PublicAssetReview;
    expect(() => expectCaptureMetadata(changed)).toThrow();
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
