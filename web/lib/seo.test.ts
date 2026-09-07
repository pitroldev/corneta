import { describe, expect, it } from "vitest";
import type { PublishedEditorialDocument } from "./editorial/types";
import { editorialArticleJsonLd } from "./seo";

describe("editorial structured data", () => {
  it("assigns factual review to WebPage according to the reviewedBy domain", () => {
    const document = {
      href: "/guides/quality/choose-bitrate",
      frontmatter: {
        kind: "guide",
        title: "Como escolher o bitrate",
        description: "Fluxo testado para escolher um bitrate estável.",
        locale: "pt-BR",
        publishedAt: "2026-08-01",
        updatedAt: "2026-08-01",
        sources: [],
      },
    } as unknown as PublishedEditorialDocument;

    const data = editorialArticleJsonLd({
      document,
      categoryName: "Qualidade",
      breadcrumbs: [
        { name: "Guias", path: "/guides" },
        { name: "Qualidade", path: "/guides/quality" },
      ],
      author: {
        type: "person",
        name: "Petro Cardoso",
        role: "Criador e mantenedor da Corneta",
        url: "https://github.com/pitroldev",
      },
      reviewer: {
        type: "person",
        name: "Petro Cardoso",
        role: "Criador e mantenedor da Corneta",
        url: "https://github.com/pitroldev",
      },
    });
    const graph = data["@graph"] as Array<Record<string, unknown>>;
    const article = graph.find((node) => node["@type"] === "TechArticle");
    const webPage = graph.find((node) => node["@type"] === "WebPage");
    const breadcrumbs = graph.find(
      (node) => node["@type"] === "BreadcrumbList",
    );

    expect(article).toMatchObject({
      "@type": "TechArticle",
      headline: "Como escolher o bitrate",
      datePublished: "2026-08-01",
      dateModified: "2026-08-01",
      author: {
        "@type": "Person",
        name: "Petro Cardoso",
        url: "https://github.com/pitroldev",
      },
    });
    expect(article).not.toHaveProperty("image");
    expect(article).not.toHaveProperty("reviewedBy");
    expect(webPage).toMatchObject({
      reviewedBy: {
        "@type": "Person",
        name: "Petro Cardoso",
        url: "https://github.com/pitroldev",
      },
    });
    expect(breadcrumbs).toMatchObject({
      itemListElement: [
        {
          position: 1,
          name: "Guias",
          item: expect.stringMatching(/\/guides$/),
        },
        {
          position: 2,
          name: "Qualidade",
          item: expect.stringMatching(/\/guides\/quality$/),
        },
      ],
    });

    const comparison = {
      ...document,
      frontmatter: { ...document.frontmatter, kind: "comparison" },
    } as PublishedEditorialDocument;
    const comparisonData = editorialArticleJsonLd({
      document: comparison,
      categoryName: "Comparações",
      breadcrumbs: [],
      author: {
        type: "person",
        name: "Petro Cardoso",
        role: "Criador e mantenedor da Corneta",
        url: "https://github.com/pitroldev",
      },
      reviewer: {
        type: "person",
        name: "Petro Cardoso",
        role: "Criador e mantenedor da Corneta",
        url: "https://github.com/pitroldev",
      },
    });
    expect(comparisonData["@graph"]).toEqual(
      expect.arrayContaining([expect.objectContaining({ "@type": "Article" })]),
    );
  });
});
