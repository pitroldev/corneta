import {
  EditorialCard,
  EditorialCardGrid,
  type EditorialChromeLinks,
} from "@/app/_components/editorial";
import { GUIDE_CATEGORIES, HELP_CATEGORIES } from "@/lib/editorial/constants";
import type {
  EditorialCategory,
  EditorialCollection,
  PublishedEditorialDocument,
} from "@/lib/editorial/types";
import {
  editorialCategoryHref,
  editorialCollectionHref,
  editorialSearchHref,
} from "@/lib/editorial/urls";
import { editorialCopy, formatEditorialDate } from "@/lib/editorial-copy";
import { localePath, type Locale } from "@/lib/i18n";

export {
  buildEditorialMetadata,
  completeLanguageAlternates,
  metadataRobots,
} from "./_metadata";

export function isEditorialCollection(
  value: string,
): value is EditorialCollection {
  return value === "help" || value === "guides";
}

export function categoriesForCollection(
  collection: EditorialCollection,
): readonly EditorialCategory[] {
  return (
    collection === "help" ? HELP_CATEGORIES : GUIDE_CATEGORIES
  ) as readonly EditorialCategory[];
}

export function isCategoryForCollection(
  collection: EditorialCollection,
  value: string,
): value is EditorialCategory {
  return categoriesForCollection(collection).some(
    (category) => category === value,
  );
}

export function otherLocale(locale: Locale): Locale {
  return locale === "pt-BR" ? "en" : "pt-BR";
}

export function editorialChromeLinks(
  locale: Locale,
  languageHref?: string,
): EditorialChromeLinks {
  const copy = editorialCopy(locale);
  const targetLocale = otherLocale(locale);

  return {
    home: {
      href: localePath(locale),
      label: copy.chrome.home,
      ariaLabel: "Corneta",
    },
    help: {
      href: editorialCollectionHref(locale, "help"),
      label: copy.chrome.help,
      ctaId: "content_open_help",
    },
    guides: {
      href: editorialCollectionHref(locale, "guides"),
      label: copy.chrome.guides,
      ctaId: "content_open_guide",
    },
    search: {
      href: editorialSearchHref(locale),
      label: copy.chrome.search,
    },
    ...(languageHref
      ? {
          language: {
            href: languageHref,
            label: copy.chrome.languageLabel,
            ariaLabel:
              locale === "en"
                ? "Open this page in Portuguese"
                : "Abrir esta página em inglês",
            hrefLang: targetLocale,
          },
        }
      : {}),
  };
}

export function EditorialDocumentCards({
  documents,
  locale,
}: {
  documents: readonly PublishedEditorialDocument[];
  locale: Locale;
}) {
  const copy = editorialCopy(locale);

  return (
    <EditorialCardGrid>
      {documents.map((document, index) => {
        const { frontmatter, href, readingTime } = document;
        return (
          <EditorialCard
            key={frontmatter.contentId}
            href={href}
            title={frontmatter.title}
            summary={frontmatter.summary}
            label={copy.common.articleKinds[frontmatter.kind]}
            ctaLabel={copy.common.readArticle}
            ctaId={
              frontmatter.collection === "help"
                ? "content_open_help"
                : "content_open_guide"
            }
            featured={index === 0}
            headingAs="h3"
            meta={
              <>
                <time dateTime={frontmatter.updatedAt}>
                  {formatEditorialDate(locale, frontmatter.updatedAt)}
                </time>
                {" · "}
                <span>{readingTime.label}</span>
              </>
            }
          />
        );
      })}
    </EditorialCardGrid>
  );
}

export function categoryHref(
  locale: Locale,
  collection: EditorialCollection,
  category: EditorialCategory,
) {
  return editorialCategoryHref({ locale, collection, category });
}
