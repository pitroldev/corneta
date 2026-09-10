import { faqsFor, featuresFor, oneLinerFor, stepsFor } from "./content";
import { DEFAULT_LOCALE, localePath, translator, type Locale } from "./i18n";
import { LEGAL_CNPJ, LEGAL_CONTACT, LEGAL_OPERATOR, legalHref } from "./legal";
import { siteUrl } from "./site";
import { DOWNLOAD_PATH } from "./download";
import type {
  EditorialPerson,
  PublishedEditorialDocument,
} from "./editorial/types";

// Structured data must describe published content and available releases only.

const abs = (path: string) => new URL(path, siteUrl).toString();

const GITHUB = "https://github.com/pitroldev";

const organization = {
  "@type": "Organization",
  "@id": abs("/#empresa"),
  name: "Corneta",
  legalName: LEGAL_OPERATOR,
  taxID: LEGAL_CNPJ,
  url: siteUrl.toString(),
  email: LEGAL_CONTACT,
  sameAs: [GITHUB],
  logo: {
    "@type": "ImageObject",
    url: abs("/icon.svg"),
  },
};

const website = {
  "@type": "WebSite",
  "@id": abs("/#site"),
  url: siteUrl.toString(),
  name: "Corneta",
  inLanguage: ["pt-BR", "en"],
  publisher: { "@id": abs("/#empresa") },
};

// Translations share the application identity; only prose varies by locale.
function softwareApplication(locale: Locale) {
  const download = abs(DOWNLOAD_PATH);
  const t = translator(locale);
  return {
    "@type": "SoftwareApplication",
    "@id": abs("/#app"),
    name: "Corneta",
    alternateName: "Corneta multistream",
    applicationCategory: "MultimediaApplication",
    applicationSubCategory: t("seo.app.subcategory"),
    operatingSystem: "Windows 10, Windows 11",
    description: oneLinerFor(t),
    url: abs(localePath(locale)),
    image: abs("/opengraph-image"),
    screenshot: abs("/opengraph-image"),
    inLanguage: locale,
    isAccessibleForFree: true,
    license: "https://spdx.org/licenses/MIT.html",
    softwareRequirements: t("seo.app.requirements"),
    featureList: featuresFor(t),
    publisher: { "@id": abs("/#empresa") },
    author: { "@id": abs("/#empresa") },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "BRL",
      availability: "https://schema.org/InStock",
      url: download,
    },
    downloadUrl: download,
  };
}

const faqPageFor = (locale: Locale) => {
  const t = translator(locale);
  return {
    "@type": "FAQPage",
    // Each localized FAQ needs its own entity identity.
    "@id": abs(`${localePath(locale)}#faq`),
    inLanguage: locale,
    isPartOf: { "@id": abs("/#site") },
    mainEntity: faqsFor(t).map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
};

const howToFor = (locale: Locale) => {
  const t = translator(locale);
  const home = localePath(locale);
  return {
    "@type": "HowTo",
    "@id": abs(`${home}#como-funciona`),
    name: t("seo.howto.name"),
    description: t("seo.howto.description"),
    inLanguage: locale,
    totalTime: "PT10M",
    tool: [
      { "@type": "HowToTool", name: t("seo.howto.tool.software") },
      { "@type": "HowToTool", name: t("seo.howto.tool.pc") },
    ],
    step: stepsFor(t).map((step, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: step.title,
      text: step.text,
      url: abs(`${home}#como-funciona`),
    })),
  };
};

export function homeJsonLd(locale: Locale = DEFAULT_LOCALE) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organization,
      website,
      softwareApplication(locale),
      faqPageFor(locale),
      howToFor(locale),
    ],
  };
}

const LEGAL_NAME: Record<Locale, Record<"privacy" | "terms", string>> = {
  "pt-BR": { privacy: "Política de privacidade", terms: "Termos de uso" },
  en: { privacy: "Privacy policy", terms: "Terms of use" },
};

export function legalJsonLd(kind: "privacy" | "terms", locale: Locale) {
  const isPrivacy = kind === "privacy";
  // Localized legal pages need distinct entity identities.
  const path = legalHref(locale, isPrivacy ? "privacy" : "terms");
  const name = LEGAL_NAME[locale][kind];
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": abs(`${path}#pagina`),
        url: abs(path),
        name: `${name} — Corneta`,
        inLanguage: locale,
        isPartOf: { "@id": abs("/#site") },
        publisher: { "@id": abs("/#empresa") },
        about: { "@id": abs("/#app") },
      },
      {
        "@type": "BreadcrumbList",
        "@id": abs(`${path}#trilha`),
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Corneta",
            item: abs(locale === "en" ? "/en" : "/"),
          },
          { "@type": "ListItem", position: 2, name },
        ],
      },
    ],
  };
}

type EditorialBreadcrumb = {
  name: string;
  path: string;
};

function breadcrumbList(path: string, items: readonly EditorialBreadcrumb[]) {
  return {
    "@type": "BreadcrumbList",
    "@id": abs(`${path}#trilha`),
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: abs(item.path),
    })),
  };
}

// Include published articles only.
export function editorialCollectionJsonLd({
  locale,
  path,
  name,
  description,
  breadcrumbs,
  documents,
}: {
  locale: Locale;
  path: string;
  name: string;
  description: string;
  breadcrumbs: readonly EditorialBreadcrumb[];
  documents: readonly PublishedEditorialDocument[];
}) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organization,
      website,
      {
        "@type": "CollectionPage",
        "@id": abs(`${path}#pagina`),
        url: abs(path),
        name,
        description,
        inLanguage: locale,
        isPartOf: { "@id": abs("/#site") },
        publisher: { "@id": abs("/#empresa") },
        mainEntity: {
          "@type": "ItemList",
          itemListElement: documents.map((document, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: document.frontmatter.title,
            url: abs(document.href),
          })),
        },
      },
      breadcrumbList(path, breadcrumbs),
    ],
  };
}

// Provenance comes from validated frontmatter, not arbitrary document text.
export function editorialArticleJsonLd({
  document,
  breadcrumbs,
  categoryName,
  author,
  reviewer,
}: {
  document: PublishedEditorialDocument;
  breadcrumbs: readonly EditorialBreadcrumb[];
  categoryName: string;
  author: EditorialPerson;
  reviewer: EditorialPerson;
}) {
  const { frontmatter, href } = document;
  const externalCitations = frontmatter.sources.flatMap((source) =>
    source.url ? [source.url] : [],
  );

  return {
    "@context": "https://schema.org",
    "@graph": [
      organization,
      website,
      {
        "@type": frontmatter.kind === "comparison" ? "Article" : "TechArticle",
        "@id": abs(`${href}#artigo`),
        url: abs(href),
        mainEntityOfPage: { "@id": abs(`${href}#pagina`) },
        headline: frontmatter.title,
        description: frontmatter.description,
        articleSection: categoryName,
        inLanguage: frontmatter.locale,
        datePublished: frontmatter.publishedAt,
        dateModified: frontmatter.updatedAt,
        author: {
          "@type": author.type === "person" ? "Person" : "Organization",
          name: author.name,
          ...(author.url ? { url: author.url } : {}),
        },
        publisher: { "@id": abs("/#empresa") },
        isAccessibleForFree: true,
        ...(externalCitations.length > 0
          ? { citation: externalCitations }
          : {}),
      },
      {
        "@type": "WebPage",
        "@id": abs(`${href}#pagina`),
        url: abs(href),
        name: frontmatter.title,
        inLanguage: frontmatter.locale,
        isPartOf: { "@id": abs("/#site") },
        breadcrumb: { "@id": abs(`${href}#trilha`) },
        reviewedBy: {
          "@type": reviewer.type === "person" ? "Person" : "Organization",
          name: reviewer.name,
          ...(reviewer.url ? { url: reviewer.url } : {}),
        },
      },
      breadcrumbList(href, breadcrumbs),
    ],
  };
}

// Escape '<' so serialized data cannot close the script element.
export function jsonLdScript(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
