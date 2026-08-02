import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import {
  EditorialArticleHeader,
  EditorialArticleShell,
  EditorialBody,
  EditorialBreadcrumbs,
  EditorialCallout,
  EditorialChrome,
  EditorialMeta,
  EditorialRelated,
  EditorialTelemetry,
  EditorialToc,
  createEditorialMdxComponents,
} from "@/app/_components/editorial";
import {
  getPublishedEditorial,
  getPublishedEditorialAlternates,
  getPublishedRelated,
  getEditorialPerson,
  listPublishedEditorial,
} from "@/lib/editorial/server";
import type {
  EditorialAlternates,
  EditorialImage as EditorialImageData,
  EditorialPerson,
  PublishedEditorialDocument,
} from "@/lib/editorial/types";
import {
  editorialCategoryHref,
  editorialCollectionHref,
} from "@/lib/editorial/urls";
import {
  editorialCategoryCopy,
  editorialCopy,
  formatEditorialDate,
} from "@/lib/editorial-copy";
import { isLocale, localePath } from "@/lib/i18n";
import { editorialArticleJsonLd, jsonLdScript } from "@/lib/seo";
import {
  buildEditorialMetadata,
  editorialChromeLinks,
  isCategoryForCollection,
  isEditorialCollection,
  otherLocale,
} from "../../_shared";

type ArticlePageParams = Promise<{
  locale: string;
  collection: string;
  category: string;
  slug: string;
}>;

export const dynamicParams = false;

export async function generateStaticParams({
  params,
}: {
  params: { locale: string; collection: string; category: string };
}) {
  const { locale, collection, category } = params;
  if (
    !isLocale(locale) ||
    !isEditorialCollection(collection) ||
    !isCategoryForCollection(collection, category)
  ) {
    return [];
  }
  const documents = await listPublishedEditorial({
    locale,
    collection,
    category,
  });
  return documents.map((document) => ({ slug: document.frontmatter.slug }));
}

function resolveRoute({
  locale,
  collection,
  category,
  slug,
}: Awaited<ArticlePageParams>) {
  if (
    !isLocale(locale) ||
    !isEditorialCollection(collection) ||
    !isCategoryForCollection(collection, category) ||
    !slug
  ) {
    notFound();
  }
  return { locale, collection, category, slug };
}

function completeReciprocalAlternates(
  document: PublishedEditorialDocument,
  alternates: EditorialAlternates,
): EditorialAlternates | undefined {
  return alternates[document.frontmatter.locale] === document.href &&
    Boolean(alternates["pt-BR"] && alternates.en)
    ? alternates
    : undefined;
}

async function registeredPeople(document: PublishedEditorialDocument): Promise<{
  author: EditorialPerson;
  reviewer: EditorialPerson;
}> {
  const [author, reviewer] = await Promise.all([
    getEditorialPerson(document.frontmatter.author),
    getEditorialPerson(document.frontmatter.reviewedBy),
  ]);
  if (!author || !reviewer) {
    throw new Error(
      `Registro editorial inconsistente para ${document.frontmatter.contentId}`,
    );
  }
  return { author, reviewer };
}

export async function generateMetadata({
  params,
}: {
  params: ArticlePageParams;
}): Promise<Metadata> {
  const route = resolveRoute(await params);
  const document = await getPublishedEditorial(route);
  if (!document) notFound();

  const [rawAlternates, { author }] = await Promise.all([
    getPublishedEditorialAlternates(document),
    registeredPeople(document),
  ]);
  const alternates = completeReciprocalAlternates(document, rawAlternates);
  const { frontmatter } = document;

  return buildEditorialMetadata({
    locale: frontmatter.locale,
    canonical: document.href,
    title: frontmatter.title,
    description: frontmatter.description,
    indexable: true,
    alternates,
    article: {
      publishedTime: frontmatter.publishedAt,
      modifiedTime: frontmatter.updatedAt,
      author: author.name,
      authorUrl: author.url,
      contentId: frontmatter.contentId,
    },
  });
}

function testedWithLabel(document: PublishedEditorialDocument) {
  return document.frontmatter.testedWith
    .map((item) =>
      [item.name, item.version, item.environment ? `(${item.environment})` : ""]
        .filter(Boolean)
        .join(" "),
    )
    .join(", ");
}

function imageSourceLabel(
  locale: "pt-BR" | "en",
  source: EditorialImageData["source"],
) {
  const labels = {
    corneta: "Corneta",
    obs: "OBS Studio",
    twitch: "Twitch",
    youtube: "YouTube",
    kick: "Kick",
    original: locale === "en" ? "Corneta editorial" : "Editorial Corneta",
    generated:
      locale === "en"
        ? "AI-generated illustration"
        : "Ilustração gerada por IA",
  } as const;
  return labels[source];
}

export default async function EditorialArticlePage({
  params,
}: {
  params: ArticlePageParams;
}) {
  const route = resolveRoute(await params);
  const document = await getPublishedEditorial(route);
  if (!document) notFound();

  const [rawAlternates, relatedDocuments, { author, reviewer }] =
    await Promise.all([
      getPublishedEditorialAlternates(document),
      getPublishedRelated(document),
      registeredPeople(document),
    ]);
  const alternates = completeReciprocalAlternates(document, rawAlternates);
  const { frontmatter, readingTime, toc } = document;
  const { locale, collection, category } = frontmatter;
  const copy = editorialCopy(locale);
  const collectionCopy = copy.collections[collection];
  const categoryCopy = editorialCategoryCopy(locale, category);
  const collectionPath = editorialCollectionHref(locale, collection);
  const categoryPath = editorialCategoryHref({ locale, collection, category });
  const alternateHref = alternates?.[otherLocale(locale)];
  const related = relatedDocuments.filter(
    (candidate) => candidate.frontmatter.locale === locale,
  );
  const breadcrumbData = [
    { name: "Corneta", path: localePath(locale) },
    { name: collectionCopy.label, path: collectionPath },
    { name: categoryCopy.title, path: categoryPath },
    { name: frontmatter.title, path: document.href },
  ];
  const mdxComponents = createEditorialMdxComponents({
    images: frontmatter.images,
    imagePresentation: (contentImage) => ({
      source: `${copy.common.sourceLabel}: ${imageSourceLabel(locale, contentImage.source)}`,
      version: contentImage.productVersion
        ? `${copy.common.productVersion}: ${contentImage.productVersion}`
        : undefined,
      zoomLabel: copy.common.zoomLabel,
      zoomCloseLabel: copy.common.zoomCloseLabel,
      zoomInLabel: copy.common.zoomInLabel,
      zoomOutLabel: copy.common.zoomOutLabel,
      zoomFitLabel: copy.common.zoomFitLabel,
    }),
  });

  return (
    <EditorialChrome
      locale={locale}
      current={collection}
      links={editorialChromeLinks(locale, alternateHref)}
      navLabel={copy.chrome.navLabel}
      skipLabel={copy.chrome.skipLabel}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            editorialArticleJsonLd({
              document,
              breadcrumbs: breadcrumbData,
              categoryName: categoryCopy.title,
              author,
              reviewer,
            }),
          ),
        }}
      />
      <EditorialTelemetry contentId={frontmatter.contentId} />

      <div data-telemetry-content-id={frontmatter.contentId}>
        <EditorialArticleHeader
          label={`${collectionCopy.label} · ${copy.common.articleKinds[frontmatter.kind]}`}
          title={frontmatter.title}
          summary={frontmatter.summary}
          breadcrumbs={
            <EditorialBreadcrumbs
              label={copy.common.breadcrumbLabel}
              items={[
                { label: copy.chrome.home, href: localePath(locale) },
                { label: collectionCopy.label, href: collectionPath },
                { label: categoryCopy.title, href: categoryPath },
                { label: frontmatter.title, current: true },
              ]}
            />
          }
          notice={
            frontmatter.experimental ? (
              <EditorialCallout
                tone="warning"
                label={locale === "en" ? "Experimental" : "Experimental"}
              >
                <p>
                  {locale === "en"
                    ? "This workflow can change between product versions. Check the tested version below."
                    : "Este fluxo pode mudar entre versões do produto. Confira abaixo a versão testada."}
                </p>
              </EditorialCallout>
            ) : undefined
          }
          meta={
            <EditorialMeta
              label={locale === "en" ? "Article details" : "Dados do artigo"}
              items={[
                {
                  label: copy.common.published,
                  value: formatEditorialDate(locale, frontmatter.publishedAt),
                  dateTime: frontmatter.publishedAt,
                },
                {
                  label: copy.common.readingTime,
                  value: readingTime.label,
                },
                {
                  label: copy.common.productVersion,
                  value: frontmatter.productVersion,
                },
                {
                  label: copy.common.testedWith,
                  value: testedWithLabel(document),
                },
                {
                  label: locale === "en" ? "Author" : "Autoria",
                  value: author.url ? (
                    <a href={author.url}>{author.name}</a>
                  ) : (
                    author.name
                  ),
                },
              ]}
            />
          }
        />

        <EditorialArticleShell
          sidebar={
            toc.length > 0 ? (
              <EditorialToc
                label={copy.common.tableOfContentsLabel}
                title={copy.common.tableOfContents}
                items={toc}
              />
            ) : undefined
          }
          after={
            related.length > 0 ? (
              <EditorialRelated
                title={copy.common.relatedTitle}
                items={related.map((candidate) => ({
                  href: candidate.href,
                  label: copy.common.articleKinds[candidate.frontmatter.kind],
                  title: candidate.frontmatter.title,
                  summary: candidate.frontmatter.summary,
                }))}
              />
            ) : undefined
          }
        >
          <EditorialBody>
            <MDXRemote
              source={document.source}
              components={mdxComponents}
              options={{
                mdxOptions: {
                  remarkPlugins: [remarkGfm],
                  rehypePlugins: [rehypeSlug],
                },
              }}
            />
          </EditorialBody>
        </EditorialArticleShell>
      </div>
    </EditorialChrome>
  );
}
