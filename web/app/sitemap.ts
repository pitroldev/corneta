import type { MetadataRoute } from "next";
import { CONTENT_UPDATED_ISO } from "../lib/content";
import { LEGAL_UPDATED_ISO, legalHref } from "../lib/legal";
import { LOCALES, localePath } from "../lib/i18n";
import { siteUrl } from "../lib/site";
import {
  getPublishedEditorialAlternates,
  listPublishedEditorial,
} from "../lib/editorial/server";
import {
  editorialCategoryHref,
  editorialCollectionHref,
} from "../lib/editorial/urls";
import type {
  EditorialCollection,
  EditorialLocale,
  PublishedEditorialDocument,
} from "../lib/editorial/types";

// Include indexable HTML pages only, using content revision dates.

const at = (iso: string) => new Date(`${iso}T00:00:00Z`);
const abs = (path: string) => new URL(path, siteUrl).toString();

function editorialLanguages(paths: Partial<Record<EditorialLocale, string>>) {
  if (!paths["pt-BR"] || !paths.en) return undefined;
  return {
    languages: {
      "pt-BR": abs(paths["pt-BR"]),
      en: abs(paths.en),
      "x-default": abs(paths["pt-BR"]),
    },
  };
}

function latestUpdate(documents: readonly PublishedEditorialDocument[]) {
  return new Date(
    `${documents.reduce(
      (latest, document) =>
        document.frontmatter.updatedAt > latest
          ? document.frontmatter.updatedAt
          : latest,
      documents[0].frontmatter.updatedAt,
    )}T00:00:00Z`,
  );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const legal = at(LEGAL_UPDATED_ISO);
  const editorial = await listPublishedEditorial();

  // Emit reciprocal alternates only for complete published translation pairs.
  const home = at(CONTENT_UPDATED_ISO);
  const languages = {
    "pt-BR": abs(localePath("pt-BR")),
    en: abs(localePath("en")),
    "x-default": abs(localePath("pt-BR")),
  };

  const groupedCollections = new Map<
    EditorialCollection,
    Map<EditorialLocale, PublishedEditorialDocument[]>
  >();
  const groupedCategories = new Map<
    string,
    Map<EditorialLocale, PublishedEditorialDocument[]>
  >();

  for (const document of editorial) {
    const { locale, collection, category } = document.frontmatter;
    const perLocale = groupedCollections.get(collection) ?? new Map();
    perLocale.set(locale, [...(perLocale.get(locale) ?? []), document]);
    groupedCollections.set(collection, perLocale);

    const categoryKey = `${collection}/${category}`;
    const categoryLocales = groupedCategories.get(categoryKey) ?? new Map();
    categoryLocales.set(locale, [
      ...(categoryLocales.get(locale) ?? []),
      document,
    ]);
    groupedCategories.set(categoryKey, categoryLocales);
  }

  const editorialHubs: MetadataRoute.Sitemap = [];
  for (const [collection, perLocale] of groupedCollections) {
    const paths: Partial<Record<EditorialLocale, string>> = {};
    for (const locale of perLocale.keys()) {
      paths[locale] = editorialCollectionHref(locale, collection);
    }
    const alternates = editorialLanguages(paths);
    for (const [locale, documents] of perLocale) {
      editorialHubs.push({
        url: abs(editorialCollectionHref(locale, collection)),
        lastModified: latestUpdate(documents),
        changeFrequency: "weekly",
        priority: 0.8,
        ...(alternates ? { alternates } : {}),
      });
    }
  }

  const editorialCategories: MetadataRoute.Sitemap = [];
  for (const [key, perLocale] of groupedCategories) {
    const [collection, category] = key.split("/") as [
      EditorialCollection,
      PublishedEditorialDocument["frontmatter"]["category"],
    ];
    const paths: Partial<Record<EditorialLocale, string>> = {};
    for (const locale of perLocale.keys()) {
      paths[locale] = editorialCategoryHref({
        locale,
        collection,
        category,
      });
    }
    const alternates = editorialLanguages(paths);
    for (const [locale, documents] of perLocale) {
      editorialCategories.push({
        url: abs(editorialCategoryHref({ locale, collection, category })),
        lastModified: latestUpdate(documents),
        changeFrequency: "weekly",
        priority: 0.7,
        ...(alternates ? { alternates } : {}),
      });
    }
  }

  const editorialArticles: MetadataRoute.Sitemap = await Promise.all(
    editorial.map(async (document) => {
      const paths = await getPublishedEditorialAlternates(document);
      const alternates = editorialLanguages(paths);
      return {
        url: abs(document.href),
        lastModified: at(document.frontmatter.updatedAt),
        changeFrequency: "monthly" as const,
        priority: 0.65,
        ...(alternates ? { alternates } : {}),
      };
    }),
  );

  return [
    {
      url: abs(localePath("pt-BR")),
      lastModified: home,
      changeFrequency: "weekly",
      priority: 1,
      alternates: { languages },
    },
    {
      url: abs(localePath("en")),
      lastModified: home,
      changeFrequency: "weekly",
      priority: 0.9,
      alternates: { languages },
    },
    ...(["privacy", "terms"] as const).flatMap((doc) => {
      const alternates = {
        languages: {
          "pt-BR": abs(legalHref("pt-BR", doc)),
          en: abs(legalHref("en", doc)),
          "x-default": abs(legalHref("pt-BR", doc)),
        },
      };
      return LOCALES.map((locale) => ({
        url: abs(legalHref(locale, doc)),
        lastModified: legal,
        changeFrequency: "yearly" as const,
        priority: 0.3,
        alternates,
      }));
    }),
    ...editorialHubs,
    ...editorialCategories,
    ...editorialArticles,
  ];
}
