import { faqsFor, featuresFor, oneLinerFor, stepsFor } from "./content";
import { DEFAULT_LOCALE, localePath, translator, type Locale } from "./i18n";
import { LEGAL_CNPJ, LEGAL_CONTACT, LEGAL_OPERATOR, legalHref } from "./legal";
import { siteUrl } from "./site";
import type {
  EditorialPerson,
  PublishedEditorialDocument,
} from "./editorial/types";

// Dados estruturados (schema.org / JSON-LD).
//
// Regra que vale mais que qualquer ganho de ranking: **nada aqui pode ser
// invenção**. Sem `aggregateRating` (não existe avaliação), sem `downloadUrl`
// enquanto o instalador for placeholder, sem versão anunciada para um binário
// que ninguém consegue baixar. Marcação falsa é penalidade, não otimização.

const abs = (path: string) => new URL(path, siteUrl).toString();

/** URL real do instalador, ou null enquanto for o placeholder. */
function realDownloadUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_PRIMARY_CTA_URL?.trim();
  if (!url || url.includes("example.com")) return null;
  return url;
}

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
  // O site é bilíngue: declarar só português mentiria sobre a versão inglesa.
  // Quem é por-idioma são os nós de FAQ/HowTo/app, não a entidade "site".
  inLanguage: ["pt-BR", "en"],
  publisher: { "@id": abs("/#empresa") },
};

/** O app é UM só, então o `@id` não muda por idioma — o que muda é a prosa que
 *  o buscador cita (descrição, lista de recursos, requisitos). */
function softwareApplication(locale: Locale) {
  const download = realDownloadUrl();
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
      ...(download ? { url: download } : {}),
    },
    // Só anuncia download quando existir instalador público de verdade.
    ...(download ? { downloadUrl: download, softwareVersion: "0.5.2" } : {}),
  };
}

const faqPageFor = (locale: Locale) => {
  const t = translator(locale);
  return {
    "@type": "FAQPage",
    // O @id inclui o idioma: dois FAQs diferentes no mesmo @id seria o mesmo nó
    // declarado duas vezes com conteúdo distinto.
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

/** Grafo único da home: uma tag `<script>` só, tudo referenciado por @id.
 *
 *  O que muda por idioma: FAQ, HowTo e a descrição do app — o texto que o
 *  buscador cita. O que NÃO muda: `organization` e os `@id` de empresa/site.
 *  A empresa é uma só; declarar duas quebraria a identidade da entidade. */
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

/** Trilha das páginas legais + identificação da página. */
const LEGAL_NAME: Record<Locale, Record<"privacy" | "terms", string>> = {
  "pt-BR": { privacy: "Política de privacidade", terms: "Termos de uso" },
  en: { privacy: "Privacy policy", terms: "Terms of use" },
};

export function legalJsonLd(kind: "privacy" | "terms", locale: Locale) {
  const isPrivacy = kind === "privacy";
  // O `@id` e a URL carregam o idioma: dois documentos, duas páginas — declarar
  // o mesmo `@id` pros dois faria o buscador tratar a tradução como duplicata.
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

/** Hub ou categoria editorial. Só deve ser emitido em páginas com itens
 * publicados; páginas vazias usam noindex e não precisam fingir uma coleção. */
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

/** Marcação factual do conteúdo: datas e autoria vêm exclusivamente do
 * frontmatter validado, e a imagem é o asset editorial realmente publicado. */
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

/** `<` escapado para o JSON não conseguir fechar a tag `<script>`. */
export function jsonLdScript(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
