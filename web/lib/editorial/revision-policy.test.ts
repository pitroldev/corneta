import { describe, expect, it } from "vitest";
import {
  hasSubstantiveEditorialChange,
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
