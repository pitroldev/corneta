import { describe, expect, it } from "vitest";
import {
  buildEditorialMetadata,
  completeLanguageAlternates,
} from "./_metadata";

describe("editorial metadata boundary", () => {
  it("mantém canonical próprio e aplica noindex em hub vazio", () => {
    const metadata = buildEditorialMetadata({
      locale: "pt-BR",
      canonical: "/help",
      title: "Central de ajuda",
      description: "Respostas verificadas para diagnosticar a Corneta.",
      indexable: false,
    });

    expect(metadata).toMatchObject({
      metadataBase: expect.any(URL),
      alternates: { canonical: "/help", languages: {} },
      robots: {
        index: false,
        follow: true,
        googleBot: { index: false, follow: true },
      },
      openGraph: { url: "/help", type: "website" },
    });
  });

  it("não emite hreflang com tradução parcial", () => {
    expect(
      completeLanguageAlternates("/guides/quality", {
        "pt-BR": "/guides/quality",
      }),
    ).toEqual({ canonical: "/guides/quality", languages: {} });
  });

  it("emite par completo e usa o hero factual no OG do artigo", () => {
    const metadata = buildEditorialMetadata({
      locale: "en",
      canonical: "/en/guides/quality/choose-bitrate",
      title: "How to choose bitrate",
      description:
        "A tested workflow for choosing a stable streaming bitrate in Corneta.",
      indexable: true,
      alternates: {
        "pt-BR": "/guides/quality/choose-bitrate",
        en: "/en/guides/quality/choose-bitrate",
      },
      image: {
        src: "/images/editorial/guides/choose-bitrate.webp",
        width: 1600,
        height: 900,
        alt: "Corneta quality controls showing the bitrate field",
      },
      article: {
        publishedTime: "2026-08-01",
        modifiedTime: "2026-08-01",
        author: "Corneta",
        contentId: "guide_choose_bitrate_en",
      },
    });

    expect(metadata).toMatchObject({
      alternates: {
        canonical: "/en/guides/quality/choose-bitrate",
        languages: {
          "pt-BR": "/guides/quality/choose-bitrate",
          en: "/en/guides/quality/choose-bitrate",
          "x-default": "/guides/quality/choose-bitrate",
        },
      },
      robots: { index: true },
      other: { "corneta:content-id": "guide_choose_bitrate_en" },
      openGraph: {
        type: "article",
        url: "/en/guides/quality/choose-bitrate",
        images: [
          {
            url: "/images/editorial/guides/choose-bitrate.webp",
            width: 1600,
            height: 900,
            alt: "Corneta quality controls showing the bitrate field",
          },
        ],
      },
    });
  });
});
