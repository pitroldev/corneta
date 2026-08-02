import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { auditEditorialContent } from "./audit";
import {
  embeddedRasterMetadata,
  imageFormatMatchesExtension,
  inspectPublicEditorialSvg,
} from "./asset-safety";

sharp.cache(false);

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) =>
        rm(root, { recursive: true, maxRetries: 5, retryDelay: 50 }),
      ),
  );
});

async function auditSingleAsset(options: {
  baseName: string;
  originalExtension: "png" | "svg";
  original: Buffer | string;
  derivativeExtension: "avif" | "svg" | "webp";
  derivative: Buffer | string;
  width?: number;
  height?: number;
}) {
  const root = await mkdtemp(path.join(tmpdir(), "corneta-assets-"));
  temporaryRoots.push(root);
  const contentRoot = path.join(root, "content");
  const publicRoot = path.join(root, "public");
  const originalPath = `assets/originals/tests/${options.baseName}.${options.originalExtension}`;
  const src = `/images/editorial/tests/${options.baseName}.${options.derivativeExtension}`;
  const absoluteOriginal = path.join(contentRoot, originalPath);
  const absoluteDerivative = path.join(publicRoot, src.slice(1));

  await mkdir(path.dirname(absoluteOriginal), { recursive: true });
  await mkdir(path.dirname(absoluteDerivative), { recursive: true });
  await writeFile(absoluteOriginal, options.original);
  await writeFile(absoluteDerivative, options.derivative);
  const derivativeBytes = (await stat(absoluteDerivative)).size;

  await writeFile(
    path.join(contentRoot, "people.json"),
    JSON.stringify({
      version: 1,
      people: [
        {
          name: "Fixture Author",
          role: "Test",
          type: "person",
          url: "https://example.com/fixture-author",
        },
      ],
    }),
  );
  await writeFile(
    path.join(contentRoot, "assets", "manifest.json"),
    JSON.stringify({
      version: 1,
      assets: [
        {
          baseName: options.baseName,
          originalPath,
          derivatives: [
            {
              src,
              width: options.width ?? 4,
              height: options.height ?? 4,
              bytes: derivativeBytes,
            },
          ],
          kind: "diagram",
          source: "original",
          rights: "owned",
          language: "none",
        },
      ],
    }),
  );

  return auditEditorialContent({ contentRoot, publicRoot });
}

function accessibleSvg(
  body = '<rect width="100" height="100" fill="#123456"/>',
) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><title>Connection diagram</title><desc>Static diagram used by the editorial test.</desc>${body}</svg>`;
}

describe("public editorial SVG safety", () => {
  it("accepts a passive, accessible SVG", () => {
    expect(inspectPublicEditorialSvg(accessibleSvg())).toEqual([]);
  });

  it.each([
    ["script", "<script>alert(document.domain)</script>"],
    [
      "foreignObject",
      '<foreignObject><iframe src="https://attacker.example"/></foreignObject>',
    ],
    ["event handler", '<rect width="10" height="10" onload="alert(1)"/>'],
    ["external reference", '<use href="https://attacker.example/icon.svg#x"/>'],
    [
      "encoded CSS reference",
      '<rect fill="u&#x72;l(https://attacker.example/x)"/>',
    ],
  ])("rejects active content: %s", (_label, body) => {
    const codes = inspectPublicEditorialSvg(accessibleSvg(body)).map(
      (finding) => finding.code,
    );
    expect(codes).toContain("unsafe-svg-content");
  });

  it("requires non-empty direct title and description", () => {
    const findings = inspectPublicEditorialSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><title>\u200b</title><desc> </desc></svg>',
    );
    expect(findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "inaccessible-svg-title",
        "inaccessible-svg-description",
      ]),
    );
  });

  it("connects the SVG gate to the content audit", async () => {
    const svg = accessibleSvg(
      '<rect onload="alert(1)" width="10" height="10"/>',
    );
    const result = await auditSingleAsset({
      baseName: "malicious-diagram",
      originalExtension: "svg",
      original: accessibleSvg(),
      derivativeExtension: "svg",
      derivative: svg,
      width: 100,
      height: 100,
    });
    expect(result.issues.map((issue) => issue.code)).toContain(
      "unsafe-svg-content",
    );
  });

  it("also rejects active SVG masters kept in the repository", async () => {
    const result = await auditSingleAsset({
      baseName: "unsafe-master",
      originalExtension: "svg",
      original: accessibleSvg(
        '<script type="application/javascript">alert(1)</script>',
      ),
      derivativeExtension: "svg",
      derivative: accessibleSvg(),
      width: 100,
      height: 100,
    });
    expect(result.issues.map((issue) => issue.code)).toContain(
      "original-unsafe-svg-content",
    );
  });
});

describe("editorial raster privacy and formats", () => {
  it("rejects a manifest asset outside the versioned English allowlist", async () => {
    const original = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 3,
        background: "#123456",
      },
    })
      .png()
      .toBuffer();
    const derivative = await sharp(original).webp().toBuffer();
    const result = await auditSingleAsset({
      baseName: "not-human-approved",
      originalExtension: "png",
      original,
      derivativeExtension: "webp",
      derivative,
    });

    expect(result.issues.map((issue) => issue.code)).toContain(
      "unapproved-asset-path",
    );
  });

  it.each(["webp", "avif"] as const)(
    "rejects embedded EXIF in a public %s derivative",
    async (extension) => {
      const original = await sharp({
        create: {
          width: 4,
          height: 4,
          channels: 3,
          background: "#123456",
        },
      })
        .png()
        .toBuffer();
      const pipeline = sharp(original).withExif({
        IFD0: { Artist: "private-fixture" },
      });
      const derivative =
        extension === "webp"
          ? await pipeline.webp({ lossless: true }).toBuffer()
          : await pipeline.avif({ lossless: true }).toBuffer();
      const result = await auditSingleAsset({
        baseName: `private-${extension}`,
        originalExtension: "png",
        original,
        derivativeExtension: extension,
        derivative,
      });

      expect(result.issues.map((issue) => issue.code)).toContain(
        "embedded-raster-metadata",
      );
    },
  );

  it("detects all sensitive metadata families exposed by Sharp", () => {
    expect(
      embeddedRasterMetadata({
        format: "webp",
        hasProfile: true,
        exif: Buffer.from("exif"),
        iptc: Buffer.from("iptc"),
        xmp: Buffer.from("xmp"),
        tifftagPhotoshop: Buffer.from("photoshop"),
        comments: [{ keyword: "author", text: "private" }],
      }),
    ).toEqual(["EXIF", "ICC", "IPTC", "XMP", "TIFFTAG_PHOTOSHOP", "comments"]);
  });

  it("rejects embedded metadata in a versioned raster master", async () => {
    const original = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 3,
        background: "#123456",
      },
    })
      .withExif({ IFD0: { Artist: "private-master" } })
      .png()
      .toBuffer();
    const derivative = await sharp(original).webp().toBuffer();
    const result = await auditSingleAsset({
      baseName: "private-master",
      originalExtension: "png",
      original,
      derivativeExtension: "webp",
      derivative,
    });

    expect(result.issues.map((issue) => issue.code)).toContain(
      "embedded-original-raster-metadata",
    );
  });

  it("rejects a readable WebP renamed as an original PNG", async () => {
    const renamedOriginal = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 3,
        background: "#123456",
      },
    })
      .webp()
      .toBuffer();
    const derivative = await sharp(renamedOriginal).webp().toBuffer();
    const result = await auditSingleAsset({
      baseName: "renamed-original",
      originalExtension: "png",
      original: renamedOriginal,
      derivativeExtension: "webp",
      derivative,
    });

    expect(result.issues.map((issue) => issue.code)).toContain(
      "manifest-original-format-mismatch",
    );
  });

  it("rejects a PNG renamed as a public WebP derivative", async () => {
    const png = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 3,
        background: "#123456",
      },
    })
      .png()
      .toBuffer();
    const result = await auditSingleAsset({
      baseName: "renamed-derivative",
      originalExtension: "png",
      original: png,
      derivativeExtension: "webp",
      derivative: png,
    });

    expect(result.issues.map((issue) => issue.code)).toContain(
      "manifest-derivative-format-mismatch",
    );
  });

  it("maps AVIF to Sharp's HEIF/AV1 format identifier", () => {
    expect(
      imageFormatMatchesExtension("/asset.avif", {
        format: "heif",
        compression: "av1",
      }),
    ).toBe(true);
    expect(
      imageFormatMatchesExtension("/asset.avif", {
        format: "heif",
        compression: "hevc",
      }),
    ).toBe(false);
  });
});
