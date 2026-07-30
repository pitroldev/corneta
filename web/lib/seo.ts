import { FAQS, FEATURES, ONE_LINER, STEPS } from "./content";
import { LEGAL_CNPJ, LEGAL_CONTACT, LEGAL_OPERATOR, LEGAL_ROUTES } from "./legal";
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
  inLanguage: "pt-BR",
  publisher: { "@id": abs("/#empresa") },
};

function softwareApplication() {
  const download = realDownloadUrl();
  return {
    "@type": "SoftwareApplication",
    "@id": abs("/#app"),
    name: "Corneta",
    alternateName: "Corneta multistream",
    applicationCategory: "MultimediaApplication",
    applicationSubCategory: "Software de transmissão ao vivo (multistream)",
    operatingSystem: "Windows 10, Windows 11",
    description: ONE_LINER,
    url: siteUrl.toString(),
    image: abs("/opengraph-image"),
    screenshot: abs("/opengraph-image"),
    inLanguage: "pt-BR",
    isAccessibleForFree: true,
    license: "https://spdx.org/licenses/MIT.html",
    softwareRequirements:
      "OBS Studio ou qualquer programa de transmissão compatível com RTMP",
    featureList: FEATURES,
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

const faqPage = {
  "@type": "FAQPage",
  "@id": abs("/#faq"),
  inLanguage: "pt-BR",
  isPartOf: { "@id": abs("/#site") },
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
};

const howTo = {
  "@type": "HowTo",
  "@id": abs("/#como-funciona"),
  name: "Como transmitir para várias plataformas ao mesmo tempo com a Corneta",
  description:
    "Três passos para levar uma única live do seu programa de transmissão para Twitch, YouTube, Kick e outros destinos ao mesmo tempo.",
  inLanguage: "pt-BR",
  totalTime: "PT10M",
  tool: [
    { "@type": "HowToTool", name: "OBS Studio, Streamlabs, XSplit ou outro programa RTMP" },
    { "@type": "HowToTool", name: "PC com Windows 10 ou 11" },
  ],
  step: STEPS.map((step, i) => ({
    "@type": "HowToStep",
    position: i + 1,
    name: step.title,
    text: step.text,
    url: abs(`/#como-funciona`),
  })),
};

/** Grafo único da home: uma tag `<script>` só, tudo referenciado por @id. */
export function homeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organization,
      website,
      softwareApplication(),
      faqPage,
      howTo,
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
