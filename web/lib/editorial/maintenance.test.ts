import { describe, expect, it } from "vitest";
import {
  buildEditorialReviewQueue,
  renderEditorialReviewMarkdown,
} from "./maintenance";
import type { EditorialDocument } from "./types";

function document(
  contentId: string,
  reviewedAt: string,
  reviewIntervalDays: number,
): EditorialDocument {
  return {
    relativePath: `pt-BR/guides/quality/${contentId}.mdx`,
    href: `/guides/quality/${contentId}`,
    source: "## Conteúdo",
    toc: [],
    readingTime: { words: 1, minutes: 1, label: "1 min" },
    frontmatter: {
      contentId: `guide_${contentId.replaceAll("-", "_")}`,
      title: `Guia ${contentId}`,
      description: "Descrição suficientemente longa para o contrato editorial.",
      summary: "Resposta direta suficientemente longa para o contrato.",
      locale: "pt-BR",
      collection: "guides",
      kind: "guide",
      category: "quality",
      slug: contentId,
      status: "published",
      publishedAt: "2026-01-01",
      updatedAt: "2026-01-01",
      reviewedAt,
      intent: "informational",
      author: "Petro Cardoso",
      reviewedBy: "Petro Cardoso",
      productVersion: "0.6.0",
      testedWith: [{ name: "Corneta", version: "0.6.0" }],
      reviewIntervalDays,
      experimental: false,
      primaryQuery: "consulta de teste",
      related: [],
      sources: [
        {
          title: "Fonte oficial de teste",
          kind: "official",
          url: "https://example.com/source",
          reviewedAt,
        },
      ],
      images: [],
    },
  };
}

describe("editorial maintenance", () => {
  it("separates overdue, due-soon, and current articles by review date", () => {
    const queue = buildEditorialReviewQueue(
      [
        document("overdue", "2026-01-01", 30),
        document("due-soon", "2026-02-01", 60),
        document("current", "2026-03-01", 180),
      ],
      { asOf: "2026-03-15", warningDays: 28 },
    );

    expect(queue).toMatchObject({
      overdueCount: 1,
      dueSoonCount: 1,
      currentCount: 1,
      substantialActivityCount: 0,
    });
    expect(queue.items.map((item) => item.status)).toEqual([
      "overdue",
      "due-soon",
      "current",
    ]);
  });

  it("does not use updatedAt to imply a review", () => {
    const item = document("review-date", "2026-01-01", 90);
    item.frontmatter.updatedAt = "2026-03-01";

    const queue = buildEditorialReviewQueue([item], {
      asOf: "2026-04-02",
      warningDays: 0,
    });

    expect(queue.items[0]).toMatchObject({
      reviewedAt: "2026-01-01",
      dueAt: "2026-04-01",
      status: "overdue",
    });
  });

  it("measures substantive change cadence separately", () => {
    const item = document("recent-change", "2026-03-01", 90);
    item.frontmatter.updatedAt = "2026-03-01";

    const queue = buildEditorialReviewQueue([item], {
      asOf: "2026-03-15",
    });

    expect(queue.substantialActivityCount).toBe(1);
    expect(queue.activityWindowDays).toBe(28);
  });

  it("renders a GitHub-compatible summary", () => {
    const markdown = renderEditorialReviewMarkdown(
      buildEditorialReviewQueue([document("rules", "2026-01-01", 60)], {
        asOf: "2026-03-15",
      }),
    );

    expect(markdown).toContain("# Editorial maintenance");
    expect(markdown).toContain("Overdue");
    expect(markdown).toContain("target: 2");
    expect(markdown).toContain("/guides/quality/rules");
  });
});
