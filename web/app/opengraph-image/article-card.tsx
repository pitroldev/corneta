import { ImageResponse } from "next/og";
import { listPublishedEditorial } from "@/lib/editorial/server";
import type { PublishedEditorialDocument } from "@/lib/editorial/types";
import { editorialCategoryCopy, editorialCopy } from "@/lib/editorial-copy";
import type { Locale } from "@/lib/i18n";
import { SOCIAL_IMAGE_SIZE } from "@/lib/social-image";
import { cardFonts, DISPLAY_FONT, LABEL_FONT } from "./fonts";
import { Badge, BrandMark, CARD_COLORS, DESTINATIONS } from "./parts";

const TAGLINE: Record<Locale, string> = {
  "pt-BR": "Multistream local e gratuito para Windows",
  en: "Free local multistream for Windows",
};

export type ArticleCardParams = Promise<{
  collection: string;
  category: string;
  slug: string;
}>;

// Longer titles step down so up to ~80 characters still fit in three lines.
function titleSize(title: string) {
  if (title.length <= 36) return 84;
  if (title.length <= 56) return 72;
  if (title.length <= 76) return 62;
  return 56;
}

export async function articleCardParams(locale: Locale) {
  const documents = await listPublishedEditorial({ locale });
  return documents.map(({ frontmatter: { collection, category, slug } }) => ({
    collection,
    category,
    slug,
  }));
}

export async function articleCardResponse(
  locale: Locale,
  params: ArticleCardParams,
) {
  const { collection, category, slug } = await params;
  const document = (await listPublishedEditorial({ locale })).find(
    ({ frontmatter }) =>
      frontmatter.collection === collection &&
      frontmatter.category === category &&
      frontmatter.slug === slug,
  );
  if (!document) return new Response(null, { status: 404 });
  return articleCard(document);
}

async function articleCard({ frontmatter }: PublishedEditorialDocument) {
  const locale = frontmatter.locale;
  const section = [
    editorialCopy(locale).chrome[frontmatter.collection],
    editorialCategoryCopy(locale, frontmatter.category).title,
  ]
    .join(" · ")
    .toLocaleUpperCase(locale);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "48px 60px 44px",
        color: CARD_COLORS.cream,
        background: CARD_COLORS.night,
        fontFamily: LABEL_FONT,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <BrandMark />
        <Badge>{section}</Badge>
      </div>

      <div
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: titleSize(frontmatter.title),
            lineHeight: 1.08,
            letterSpacing: -1,
          }}
        >
          {frontmatter.title}
        </span>
        <div
          style={{
            width: 160,
            height: 12,
            marginTop: 26,
            display: "flex",
            background: CARD_COLORS.brass,
            boxShadow: `6px 6px 0 0 ${CARD_COLORS.coral}`,
            transform: "rotate(-1.4deg)",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: CARD_COLORS.muted,
          fontSize: 22,
        }}
      >
        <span>{TAGLINE[locale]}</span>
        <div style={{ display: "flex", gap: 10 }}>
          {DESTINATIONS.map((destination) => (
            <span
              key={destination.name}
              style={{
                width: 26,
                height: 26,
                display: "flex",
                borderRadius: 5,
                background: destination.color,
              }}
            />
          ))}
        </div>
      </div>
    </div>,
    { ...SOCIAL_IMAGE_SIZE, fonts: await cardFonts() },
  );
}
