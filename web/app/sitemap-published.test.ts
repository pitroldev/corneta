import { describe, expect, it, vi } from "vitest";
import type { PublishedEditorialDocument } from "../lib/editorial/types";

const fixtures = vi.hoisted(() => [
  {
    href: "/guides/quality/choose-bitrate",
    frontmatter: {
      locale: "pt-BR",
      collection: "guides",
      category: "quality",
      title: "Como escolher bitrate",
      updatedAt: "2026-08-01",
    },
  },
  {
    href: "/en/guides/quality/choose-bitrate",
    frontmatter: {
      locale: "en",
      collection: "guides",
      category: "quality",
      title: "How to choose bitrate",
      updatedAt: "2026-08-01",
    },
  },
  {
    href: "/guides/security/protect-stream-key",
    frontmatter: {
      locale: "pt-BR",
      collection: "guides",
      category: "security",
      title: "Como proteger sua stream key",
      updatedAt: "2026-07-19",
    },
  },
]);

vi.mock("server-only", () => ({}));
vi.mock("../lib/editorial/server", () => ({
  listPublishedEditorial: async () =>
    fixtures as unknown as PublishedEditorialDocument[],
  getPublishedEditorialAlternates: async (
    document: PublishedEditorialDocument,
  ) =>
    document.href.includes("choose-bitrate")
      ? {
          "pt-BR": "/guides/quality/choose-bitrate",
          en: "/en/guides/quality/choose-bitrate",
        }
      : { "pt-BR": document.href },
}));

import sitemap from "./sitemap";

describe("published editorial sitemap", () => {
  it("includes hubs, categories, articles, and the hreflang pair", async () => {
    const entries = await sitemap();
    const byPath = new Map(
      entries.map((entry) => [new URL(entry.url).pathname, entry]),
    );

    for (const path of [
      "/guides",
      "/en/guides",
      "/guides/quality",
      "/en/guides/quality",
      "/guides/quality/choose-bitrate",
      "/en/guides/quality/choose-bitrate",
    ]) {
      expect(byPath.has(path), path).toBe(true);
    }

    expect(
      byPath.get("/guides/quality/choose-bitrate")?.alternates?.languages,
    ).toMatchObject({
      "pt-BR": expect.stringMatching(/\/guides\/quality\/choose-bitrate$/),
      en: expect.stringMatching(/\/en\/guides\/quality\/choose-bitrate$/),
      "x-default": expect.stringMatching(/\/guides\/quality\/choose-bitrate$/),
    });

    expect(byPath.get("/guides/quality/choose-bitrate")?.lastModified).toEqual(
      new Date("2026-08-01T00:00:00Z"),
    );
  });

  it("does not invent hreflang for single-locale articles or categories", async () => {
    const entries = await sitemap();
    const byPath = new Map(
      entries.map((entry) => [new URL(entry.url).pathname, entry]),
    );

    expect(byPath.get("/guides/security/protect-stream-key")).toMatchObject({
      lastModified: new Date("2026-07-19T00:00:00Z"),
    });
    expect(
      byPath.get("/guides/security/protect-stream-key")?.alternates,
    ).toBeUndefined();
    expect(byPath.get("/guides/security")?.alternates).toBeUndefined();
    expect(byPath.has("/en/guides/security")).toBe(false);
  });
});
