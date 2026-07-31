import { faqsFor, featuresFor, oneLinerFor, stepsFor } from "./content";
import { DEFAULT_LOCALE, localePath, translator, type Locale } from "./i18n";
import {
  LEGAL_CNPJ,
  LEGAL_CONTACT,
  LEGAL_OPERATOR,
  LEGAL_ROUTES,
} from "./legal";
import { siteUrl } from "./site";

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
export function legalJsonLd(kind: "privacy" | "terms") {
  const isPrivacy = kind === "privacy";
  const path = isPrivacy ? LEGAL_ROUTES.privacy : LEGAL_ROUTES.terms;
  const name = isPrivacy ? "Política de privacidade" : "Termos de uso";
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": abs(`${path}#pagina`),
        url: abs(path),
        name: `${name} — Corneta`,
        inLanguage: "pt-BR",
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
            item: siteUrl.toString(),
          },
          { "@type": "ListItem", position: 2, name },
        ],
      },
    ],
  };
}

/** `<` escapado para o JSON não conseguir fechar a tag `<script>`. */
export function jsonLdScript(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
