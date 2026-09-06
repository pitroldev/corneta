import { describe, expect, it } from "vitest";
import { createEditorialManifest, readEditorialManifest } from "./manifest";
import { parseEditorialSource } from "./parse";

describe("editorial build manifest", () => {
  it("excludes drafts from the public artifact", () => {
    const draft = parseEditorialSource(
      `---
contentId: guide_test_article
locale: pt-BR
collection: guides
kind: guide
category: multistream
slug: obs-multistream
status: draft
---
## Draft title
Never publish this body.`,
      "pt-BR/guides/multistream/obs-multistream.mdx",
    );
    const manifest = createEditorialManifest([draft]);
    expect(manifest.documents).toEqual([]);
    expect(readEditorialManifest(JSON.stringify(manifest))).toEqual([]);
    expect(JSON.stringify(manifest)).not.toContain("Never publish");
  });

  it("rejects outdated, corrupted and structurally incomplete artifacts", () => {
    const manifest = createEditorialManifest([]);
    expect(() =>
      readEditorialManifest(JSON.stringify({ ...manifest, version: 0 })),
    ).toThrow("version");
    expect(() =>
      readEditorialManifest(
        JSON.stringify({ ...manifest, sha256: "tampered" }),
      ),
    ).toThrow("digest");
    expect(() => readEditorialManifest("{}")).toThrow();
  });
});
