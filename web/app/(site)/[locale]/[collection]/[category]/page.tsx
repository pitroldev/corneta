import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  EditorialBreadcrumbs,
  EditorialCategorySection,
  EditorialChrome,
  EditorialEmptyState,
  EditorialHubHero,
} from "@/app/_components/editorial";
import { listPublishedEditorial } from "@/lib/editorial/server";
import type { EditorialAlternates } from "@/lib/editorial/types";
import {
  editorialCategoryHref,
  editorialCollectionHref,
} from "@/lib/editorial/urls";
import { editorialCategoryCopy, editorialCopy } from "@/lib/editorial-copy";
import { isLocale, localePath } from "@/lib/i18n";
import { editorialCollectionJsonLd, jsonLdScript } from "@/lib/seo";
import {
  buildEditorialMetadata,
  categoriesForCollection,
  categoryHref,
  EditorialDocumentCards,
  editorialChromeLinks,
  isCategoryForCollection,
  isEditorialCollection,
  otherLocale,
} from "../_shared";

type CategoryPageParams = Promise<{
  locale: string;
  collection: string;
  category: string;
}>;

function resolveParams(locale: string, collection: string, category: string) {
  if (
    !isLocale(locale) ||
    !isEditorialCollection(collection) ||
    !isCategoryForCollection(collection, category)
  ) {
    notFound();
  }
  return { locale, collection, category };
}

export async function generateMetadata({
  params,
}: {
  params: CategoryPageParams;
}): Promise<Metadata> {
  const raw = await params;
  const { locale, collection, category } = resolveParams(
    raw.locale,
    raw.collection,
    raw.category,
  );
  const alternateLocale = otherLocale(locale);
  const [documents, alternateDocuments] = await Promise.all([
    listPublishedEditorial({ locale, collection, category }),
    listPublishedEditorial({
      locale: alternateLocale,
      collection,
      category,
    }),
  ]);
  const copy = editorialCopy(locale);
  const collectionCopy = copy.collections[collection];
  const categoryCopy = editorialCategoryCopy(locale, category);
  const canonical = editorialCategoryHref({ locale, collection, category });
  const hasCompletePair = documents.length > 0 && alternateDocuments.length > 0;
  const alternates: EditorialAlternates | undefined = hasCompletePair
    ? {
        [locale]: canonical,
        [alternateLocale]: editorialCategoryHref({
          locale: alternateLocale,
          collection,
          category,
        }),
      }
    : undefined;
  const title = `${categoryCopy.title} — ${collectionCopy.label}`;

  return buildEditorialMetadata({
    locale,
    canonical,
    title,
    description: categoryCopy.description,
    indexable: documents.length > 0,
    alternates,
  });
}

export default async function EditorialCategoryPage({
  params,
}: {
  params: CategoryPageParams;
}) {
  const raw = await params;
  const { locale, collection, category } = resolveParams(
    raw.locale,
    raw.collection,
    raw.category,
  );
  const copy = editorialCopy(locale);
  const collectionCopy = copy.collections[collection];
  const categoryCopy = editorialCategoryCopy(locale, category);
  const categories = categoriesForCollection(collection);
  const documents = await listPublishedEditorial({
    locale,
    collection,
    category,
  });
  const collectionPath = editorialCollectionHref(locale, collection);
  const categoryPath = editorialCategoryHref({
    locale,
    collection,
    category,
  });
  const languageHref = editorialCategoryHref({
    locale: otherLocale(locale),
    collection,
    category,
  });
  const breadcrumbData = [
    { name: "Corneta", path: localePath(locale) },
    { name: collectionCopy.label, path: collectionPath },
    { name: categoryCopy.title, path: categoryPath },
  ];

  return (
    <EditorialChrome
      locale={locale}
      current={collection}
      links={editorialChromeLinks(locale, languageHref)}
      navLabel={copy.chrome.navLabel}
      skipLabel={copy.chrome.skipLabel}
    >
      {documents.length > 0 ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(
              editorialCollectionJsonLd({
                locale,
                path: categoryPath,
                name: categoryCopy.title,
                description: categoryCopy.description,
                breadcrumbs: breadcrumbData,
                documents,
              }),
            ),
          }}
        />
      ) : null}

      <EditorialHubHero
        label={collectionCopy.label}
        title={categoryCopy.title}
        description={categoryCopy.description}
        breadcrumbs={
          <EditorialBreadcrumbs
            label={copy.common.breadcrumbLabel}
            items={[
              { label: copy.chrome.home, href: localePath(locale) },
              { label: collectionCopy.label, href: collectionPath },
              { label: categoryCopy.title, current: true },
            ]}
          />
        }
        navigationLabel={copy.common.categoriesLabel}
        links={categories.map((item) => ({
          href: categoryHref(locale, collection, item),
          label: editorialCategoryCopy(locale, item).title,
          current: item === category,
        }))}
      />

      <EditorialCategorySection
        id="published-content"
        title={copy.common.latestTitle}
        action={
          <Link href={collectionPath}>
            {copy.common.backToCollection} <span aria-hidden="true">→</span>
          </Link>
        }
      >
        {documents.length > 0 ? (
          <EditorialDocumentCards documents={documents} locale={locale} />
        ) : (
          <EditorialEmptyState
            title={collectionCopy.emptyTitle}
            description={collectionCopy.emptyDescription}
            action={
              <Link href={collectionPath}>{copy.common.backToCollection}</Link>
            }
          />
        )}
      </EditorialCategorySection>
    </EditorialChrome>
  );
}
