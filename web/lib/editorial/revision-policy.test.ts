import { describe, expect, it } from "vitest";
import {
  hasSubstantiveEditorialChange,
  sameEditorialImages,
  validateChangedInternalSources,
  validateEditorialRevision,
  type EditorialRevisionSnapshot,
} from "./revision-policy";

function snapshot(
  overrides: Partial<EditorialRevisionSnapshot["frontmatter"]> = {},
): EditorialRevisionSnapshot {
  return {
    relativePath: "pt-BR/help/quality/example.mdx",
    source: "## Passo\n\nFaça isto.",
    frontmatter: {
      contentId: "help_example",
      title: "Exemplo de manutenção",
      updatedAt: "2026-01-01",
      reviewedAt: "2026-01-01",
      productVersion: "0.6.0",
      sources: [
        {
          title: "Tela interna",
          kind: "internal",
          repoPath: "src/screens/Example.tsx",
          reviewedAt: "2026-01-01",
        },
      ],
      ...overrides,
    },
  };
}

describe("editorial revision policy", () => {
  it("requires updatedAt when the body changes", () => {
    const previous = snapshot();
    const current = snapshot();
    current.source = "## Passo\n\nFaça isto de outro jeito.";

    expect(hasSubstantiveEditorialChange(previous, current)).toBe(true);
    expect(validateEditorialRevision(previous, current)).toEqual([
      expect.objectContaining({
        code: "substantive-change-without-updated-at",
      }),
    ]);
  });

  it("rejects artificial freshness and accepts review-only updates", () => {
    const previous = snapshot();
    const artificial = snapshot({
      updatedAt: "2026-02-01",
      reviewedAt: "2026-02-01",
    });
    const reviewOnly = snapshot({ reviewedAt: "2026-02-01" });
    reviewOnly.frontmatter.sources = [
      {
        ...reviewOnly.frontmatter.sources?.[0],
        reviewedAt: "2026-02-01",
      },
    ];

    expect(validateEditorialRevision(previous, artificial)).toEqual([
      expect.objectContaining({ code: "artificial-freshness-date" }),
    ]);
    expect(validateEditorialRevision(previous, reviewOnly)).toEqual([]);
  });

  it("pairs an article with its translation without a new updatedAt", () => {
    const previous = snapshot();
    const paired = snapshot({ translationKey: "example" });

    expect(hasSubstantiveEditorialChange(previous, paired)).toBe(false);
    expect(validateEditorialRevision(previous, paired)).toEqual([]);
  });

  it("ignores serialized YAML key order", () => {
    const previous = snapshot();
    const current = snapshot();
    previous.frontmatter = {
      sources: previous.frontmatter.sources,
      reviewedAt: previous.frontmatter.reviewedAt,
      updatedAt: previous.frontmatter.updatedAt,
      title: previous.frontmatter.title,
      contentId: previous.frontmatter.contentId,
      productVersion: previous.frontmatter.productVersion,
    };

    expect(hasSubstantiveEditorialChange(previous, current)).toBe(false);
  });

  it("requires a review when an internal source changes", () => {
    const previous = snapshot();
    const current = snapshot();
    const changed = new Set(["src/screens/Example.tsx"]);

    expect(
      validateChangedInternalSources(previous, current, changed, "0.7.0").map(
        (issue) => issue.code,
      ),
    ).toEqual([
      "changed-source-without-article-review",
      "changed-source-without-source-review",
      "reviewed-against-wrong-product-version",
    ]);
  });

  it("lets a second revision on the same day advance with a time", () => {
    const previous = snapshot({
      updatedAt: "2026-10-18",
      reviewedAt: "2026-10-18",
    });
    previous.frontmatter.sources = [
      { ...previous.frontmatter.sources?.[0], reviewedAt: "2026-10-18" },
    ];
    const current = snapshot({
      updatedAt: "2026-10-18T21:30",
      reviewedAt: "2026-10-18T21:30",
    });
    current.frontmatter.sources = [
      { ...current.frontmatter.sources?.[0], reviewedAt: "2026-10-18T21:30" },
    ];
    current.source = "## Passo\n\nFaça isto de outro jeito.";

    expect(validateEditorialRevision(previous, current)).toEqual([]);
    expect(
      validateChangedInternalSources(
        previous,
        current,
        new Set(["src/screens/Example.tsx"]),
      ),
    ).toEqual([]);

    const later = snapshot({
      updatedAt: "2026-10-18T22:05",
      reviewedAt: "2026-10-18T22:05",
    });
    later.source = "## Passo\n\nFaça isto de um terceiro jeito.";
    expect(validateEditorialRevision(current, later)).toEqual([]);
    expect(validateEditorialRevision(later, current)).toEqual([
      expect.objectContaining({
        code: "substantive-change-without-updated-at",
      }),
      expect.objectContaining({ code: "review-date-regression" }),
    ]);
  });

  it("compares images by their resolved content, not by YAML key order", () => {
    const image = {
      baseName: "status-connected",
      alt: "Estado conectado.",
      src: "/images/editorial/tests/status-connected.webp",
      capturedAt: "2026-08-01",
    };
    const previous = snapshot({ images: [image] });
    const reordered = snapshot({
      images: [
        {
          capturedAt: image.capturedAt,
          src: image.src,
          alt: image.alt,
          baseName: image.baseName,
        },
      ],
    });
    const recaptured = snapshot({
      images: [{ ...image, capturedAt: "2026-10-18" }],
    });

    expect(
      sameEditorialImages(previous.frontmatter, reordered.frontmatter),
    ).toBe(true);
    expect(
      sameEditorialImages(previous.frontmatter, recaptured.frontmatter),
    ).toBe(false);
  });

  it("accepts technical review against a new version without requiring updatedAt", () => {
    const previous = snapshot();
    const current = snapshot({
      reviewedAt: "2026-02-01",
      productVersion: "0.7.0",
      sources: [
        {
          title: "Tela interna",
          kind: "internal",
          repoPath: "src/screens/Example.tsx",
          reviewedAt: "2026-02-01",
        },
      ],
    });

    expect(
      validateChangedInternalSources(
        previous,
        current,
        new Set(["src/screens/Example.tsx"]),
        "0.7.0",
      ),
    ).toEqual([]);
    expect(validateEditorialRevision(previous, current)).toEqual([]);
  });
});
