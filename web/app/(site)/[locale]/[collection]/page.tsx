import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  EditorialBreadcrumbs,
  EditorialCategorySection,
  EditorialChrome,
  EditorialCollectionHero,
  EditorialTopicDirectory,
  EditorialTopicLink,
} from "@/app/_components/editorial";
import { listPublishedEditorial } from "@/lib/editorial/server";
import type { EditorialAlternates } from "@/lib/editorial/types";
import { editorialCollectionHref } from "@/lib/editorial/urls";
import {
  editorialCategoryCopy,
  editorialCopy,
  editorialCount,
} from "@/lib/editorial-copy";
import { isLocale, localePath } from "@/lib/i18n";
import { editorialCollectionJsonLd, jsonLdScript } from "@/lib/seo";
import {
  buildEditorialMetadata,
  categoriesForCollection,
  categoryHref,
  EditorialDocumentCards,
  editorialChromeLinks,
  isEditorialCollection,
  otherLocale,
} from "./_shared";

type CollectionPageParams = Promise<{
  locale: string;
  collection: string;
}>;

function resolveParams(locale: string, collection: string) {
  if (!isLocale(locale) || !isEditorialCollection(collection)) notFound();
  return { locale, collection };
}

export async function generateMetadata({
  params,
}: {
  params: CollectionPageParams;
}): Promise<Metadata> {
  const raw = await params;
  const { locale, collection } = resolveParams(raw.locale, raw.collection);
  const alternateLocale = otherLocale(locale);
  const [documents, alternateDocuments] = await Promise.all([
    listPublishedEditorial({ locale, collection }),
    listPublishedEditorial({ locale: alternateLocale, collection }),
  ]);
  const copy = editorialCopy(locale);
  const collectionCopy = copy.collections[collection];
  const canonical = editorialCollectionHref(locale, collection);
  const hasCompletePair = documents.length > 0 && alternateDocuments.length > 0;
  const alternates: EditorialAlternates | undefined = hasCompletePair
    ? {
        [locale]: canonical,
        [alternateLocale]: editorialCollectionHref(alternateLocale, collection),
      }
    : undefined;

  return buildEditorialMetadata({
    locale,
    canonical,
    title: collectionCopy.label,
    description: collectionCopy.description,
    indexable: documents.length > 0,
    alternates,
  });
}

export default async function EditorialCollectionPage({
  params,
}: {
  params: CollectionPageParams;
}) {
  const raw = await params;
  const { locale, collection } = resolveParams(raw.locale, raw.collection);
  const copy = editorialCopy(locale);
  const collectionCopy = copy.collections[collection];
  const categories = categoriesForCollection(collection);
  const documents = await listPublishedEditorial({ locale, collection });
  const collectionPath = editorialCollectionHref(locale, collection);
  const languageHref = editorialCollectionHref(otherLocale(locale), collection);
  const breadcrumbData = [
    { name: "Corneta", path: localePath(locale) },
    { name: collectionCopy.label, path: collectionPath },
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
                path: collectionPath,
                name: collectionCopy.label,
                description: collectionCopy.description,
                breadcrumbs: breadcrumbData,
                documents,
              }),
            ),
          }}
        />
      ) : null}

      <EditorialCollectionHero
        label={collectionCopy.label}
        title={collectionCopy.title}
        description={collectionCopy.description}
        breadcrumbs={
          <EditorialBreadcrumbs
            label={copy.common.breadcrumbLabel}
            items={[
              { label: copy.chrome.home, href: localePath(locale) },
              { label: collectionCopy.label, current: true },
            ]}
          />
        }
      />

      <EditorialTopicDirectory
        title={copy.common.categoriesLabel}
        description={copy.common.categoriesDescription}
      >
        {categories.map((category, index) => {
          const categoryCopy = editorialCategoryCopy(locale, category);
          const count = documents.filter(
            (document) => document.frontmatter.category === category,
          ).length;
          return (
            <EditorialTopicLink
              key={category}
              href={categoryHref(locale, collection, category)}
              index={index + 1}
              title={categoryCopy.title}
              description={categoryCopy.description}
              countLabel={count > 0 ? editorialCount(locale, count) : undefined}
            />
          );
        })}
      </EditorialTopicDirectory>

      {documents.length > 0 ? (
        <EditorialCategorySection
          id="published-content"
          title={copy.common.latestTitle}
        >
          <EditorialDocumentCards documents={documents} locale={locale} />
        </EditorialCategorySection>
      ) : null}
    </EditorialChrome>
  );
}
