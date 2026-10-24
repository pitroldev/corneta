import type { Metadata } from "next";
import { pageTitle } from "../../../../lib/page-title";
import { siteUrl } from "../../../../lib/site";
import { socialImage } from "../../../../lib/social-image";

type MetadataLocale = "pt-BR" | "en";
type MetadataAlternates = Partial<Record<MetadataLocale, string>>;

const OPEN_GRAPH_LOCALE: Record<MetadataLocale, string> = {
  "pt-BR": "pt_BR",
  en: "en_US",
};

function otherLocale(locale: MetadataLocale): MetadataLocale {
  return locale === "pt-BR" ? "en" : "pt-BR";
}

export function metadataRobots(index: boolean): Metadata["robots"] {
  return {
    index,
    follow: true,
    googleBot: {
      index,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  };
}

export function completeLanguageAlternates(
  canonical: string,
  alternates?: MetadataAlternates,
): Metadata["alternates"] {
  const portuguese = alternates?.["pt-BR"];
  const english = alternates?.en;

  return {
    canonical,
    // Empty alternates clear inherited home links when no published translation pair exists.
    languages:
      portuguese && english
        ? { "pt-BR": portuguese, en: english, "x-default": portuguese }
        : {},
  };
}

function openGraphLocales(locale: MetadataLocale, hasCompletePair: boolean) {
  return {
    locale: OPEN_GRAPH_LOCALE[locale],
    ...(hasCompletePair
      ? { alternateLocale: [OPEN_GRAPH_LOCALE[otherLocale(locale)]] }
      : {}),
  };
}

interface EditorialMetadataOptions {
  locale: MetadataLocale;
  canonical: string;
  title: string;
  description: string;
  indexable: boolean;
  alternates?: MetadataAlternates;
  image?: {
    url: string;
    width: number;
    height: number;
    alt: string;
  };
  article?: {
    publishedTime: string;
    modifiedTime: string;
    author: string;
    authorUrl?: string;
    contentId: string;
  };
}

export function buildEditorialMetadata({
  locale,
  canonical,
  title,
  description,
  indexable,
  alternates,
  image = socialImage(locale),
  article,
}: EditorialMetadataOptions): Metadata {
  const hasCompletePair = Boolean(alternates?.["pt-BR"] && alternates.en);
  const socialTitle = `${title} — Corneta`;
  const commonOpenGraph = {
    url: canonical,
    siteName: "Corneta",
    title: socialTitle,
    description,
    ...openGraphLocales(locale, hasCompletePair),
    images: [image],
  };

  return {
    metadataBase: siteUrl,
    title: pageTitle(title),
    description,
    alternates: completeLanguageAlternates(canonical, alternates),
    robots: metadataRobots(indexable),
    ...(article
      ? {
          authors: [
            {
              name: article.author,
              ...(article.authorUrl ? { url: article.authorUrl } : {}),
            },
          ],
          other: { "corneta:content-id": article.contentId },
        }
      : {}),
    openGraph: article
      ? {
          ...commonOpenGraph,
          type: "article",
          publishedTime: article.publishedTime,
          modifiedTime: article.modifiedTime,
          authors: [article.author],
        }
      : { ...commonOpenGraph, type: "website" },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [image],
    },
  };
}
