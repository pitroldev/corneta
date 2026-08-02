import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import {
  EditorialBreadcrumbs,
  EditorialChrome,
} from "@/app/_components/editorial";
import { listPublishedEditorial } from "@/lib/editorial/server";
import {
  sanitizeEditorialSearchQuery,
  searchPublishedEditorial,
} from "@/lib/editorial/search";
import { editorialSearchHref } from "@/lib/editorial/urls";
import { editorialCopy } from "@/lib/editorial-copy";
import { isLocale, localePath } from "@/lib/i18n";
import {
  buildEditorialMetadata,
  EditorialDocumentCards,
  editorialChromeLinks,
  otherLocale,
} from "../[collection]/_shared";

type SearchPageParams = Promise<{ locale: string }>;
type SearchPageSearchParams = Promise<{
  q?: string | string[];
}>;

function resolveLocale(value: string) {
  if (!isLocale(value)) notFound();
  return value;
}

export async function generateMetadata({
  params,
}: {
  params: SearchPageParams;
}): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const copy = editorialCopy(locale);
  const canonical = editorialSearchHref(locale);

  return buildEditorialMetadata({
    locale,
    canonical,
    title: copy.search.label,
    description: copy.search.description,
    indexable: false,
    alternates: {
      "pt-BR": editorialSearchHref("pt-BR"),
      en: editorialSearchHref("en"),
    },
  });
}

export default async function EditorialSearchPage({
  params,
  searchParams,
}: {
  params: SearchPageParams;
  searchParams: SearchPageSearchParams;
}) {
  const locale = resolveLocale((await params).locale);
  const query = sanitizeEditorialSearchQuery((await searchParams).q);
  const copy = editorialCopy(locale);
  const searchPath = editorialSearchHref(locale);
  const otherSearchPath = editorialSearchHref(otherLocale(locale));
  const documents = await listPublishedEditorial({ locale });
  const results = query ? searchPublishedEditorial(documents, query) : [];
  const resultNoun =
    results.length === 1
      ? copy.search.resultSingular
      : copy.search.resultPlural;
  const languageHref = query
    ? `${otherSearchPath}?q=${encodeURIComponent(query)}`
    : otherSearchPath;

  return (
    <EditorialChrome
      locale={locale}
      current="search"
      links={editorialChromeLinks(locale, languageHref)}
      navLabel={copy.chrome.navLabel}
      skipLabel={copy.chrome.skipLabel}
    >
      <section className="editorial-search-hero">
        <div className="editorial-search-hero__inner">
          <EditorialBreadcrumbs
            label={copy.common.breadcrumbLabel}
            items={[
              { label: copy.chrome.home, href: localePath(locale) },
              { label: copy.search.label, current: true },
            ]}
          />

          <div className="editorial-search-hero__copy">
            <p>{copy.search.label}</p>
            <h1>{copy.search.title}</h1>
            <span>{copy.search.description}</span>
          </div>

          <form
            className="editorial-search-form"
            action={searchPath}
            method="get"
            role="search"
          >
            <label htmlFor="editorial-search-query">
              {copy.search.inputLabel}
            </label>
            <div className="editorial-search-form__control">
              <Search aria-hidden="true" />
              <input
                id="editorial-search-query"
                type="search"
                name="q"
                defaultValue={query}
                placeholder={copy.search.placeholder}
                maxLength={120}
                enterKeyHint="search"
              />
              <button type="submit">{copy.search.submit}</button>
            </div>
          </form>
        </div>
      </section>

      <section
        className="editorial-search-results"
        aria-labelledby="editorial-search-results-title"
      >
        {query ? (
          <header className="editorial-search-results__header">
            <p>{copy.search.label}</p>
            <h2 id="editorial-search-results-title">
              {results.length} {resultNoun} {locale === "en" ? "for" : "para"}{" "}
              <span>“{query}”</span>
            </h2>
          </header>
        ) : null}

        {results.length > 0 ? (
          <EditorialDocumentCards documents={results} locale={locale} />
        ) : (
          <div className="editorial-search-results__empty">
            <h2 id={query ? undefined : "editorial-search-results-title"}>
              {query ? copy.search.noResultsTitle : copy.search.emptyTitle}
            </h2>
            <p>
              {query
                ? copy.search.noResultsDescription
                : copy.search.emptyDescription}
            </p>
          </div>
        )}
      </section>
    </EditorialChrome>
  );
}
