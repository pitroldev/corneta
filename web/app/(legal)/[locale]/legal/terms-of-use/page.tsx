import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  LegalBindingNotice,
  LegalFoot,
  LegalHero,
  LegalBody,
  LegalLayout,
  LegalTldr,
  LegalToc,
} from "../_components/legal-chrome";
import {
  TermsBodyPt,
  termsHeroPt,
  termsSectionsPt,
  termsTldrPt,
} from "../_content/terms.pt";
import {
  TermsBodyEn,
  termsHeroEn,
  termsSectionsEn,
  termsTldrEn,
} from "../_content/terms.en";
import { isLocale, type Locale } from "@/lib/i18n";
import { LEGAL_ROUTES, legalHref } from "@/lib/legal";
import { jsonLdScript, legalJsonLd } from "@/lib/seo";
import { siteUrl } from "@/lib/site";
import {
  SOCIAL_IMAGE_ALT,
  SOCIAL_IMAGE_PATH,
  SOCIAL_IMAGE_SIZE,
} from "@/lib/social-image";

const PATH = LEGAL_ROUTES.terms;
const socialImageUrl = new URL(SOCIAL_IMAGE_PATH, siteUrl).toString();

const META = {
  "pt-BR": {
    title: "Termos de uso",
    description:
      "As regras de uso da Corneta: licença MIT, componentes de terceiros, responsabilidades de quem transmite, recursos experimentais e limites de garantia.",
    ogTitle: "Termos de uso — Corneta",
    ogDescription:
      "Licença, responsabilidades de quem transmite, recursos experimentais e limites de garantia.",
  },
  en: {
    title: "Terms of use",
    description:
      "Corneta's rules of use: MIT licence, third-party components, what's on you when you stream, experimental features and warranty limits.",
    ogTitle: "Terms of use — Corneta",
    ogDescription:
      "Licence, what's on you when you stream, experimental features and warranty limits.",
  },
} satisfies Record<Locale, Record<string, string>>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const meta = META[locale];
  return {
    metadataBase: siteUrl,
    title: meta.title,
    description: meta.description,
    // Par recíproco completo: cada idioma aponta pro outro E pra si mesmo, que é
    // o que o Google exige pra aceitar o hreflang. O x-default é o português —
    // é a versão que vincula e a URL já indexada.
    alternates: {
      canonical: legalHref(locale, "terms"),
      languages: {
        "pt-BR": PATH,
        en: `/en${PATH}`,
        "x-default": PATH,
      },
    },
    openGraph: {
      title: meta.ogTitle,
      description: meta.ogDescription,
      url: legalHref(locale, "terms"),
      locale: locale === "en" ? "en_US" : "pt_BR",
      images: [
        {
          url: socialImageUrl,
          ...SOCIAL_IMAGE_SIZE,
          alt: SOCIAL_IMAGE_ALT,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.ogTitle,
      description: meta.ogDescription,
      images: [socialImageUrl],
    },
  };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const pt = locale === "pt-BR";
  const hero = pt ? termsHeroPt : termsHeroEn;
  const tldr = pt ? termsTldrPt : termsTldrEn;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(legalJsonLd("terms", locale)),
        }}
      />

      <LegalHero
        locale={locale}
        kicker={hero.kicker}
        title={hero.title}
        intro={hero.intro}
        version="1.0"
        path={PATH}
      />

      <LegalLayout>
        <LegalToc
          locale={locale}
          sections={pt ? termsSectionsPt : termsSectionsEn}
        />

        <LegalBody>
          <LegalBindingNotice locale={locale} path={PATH} />
          <LegalTldr locale={locale} points={tldr.points} note={tldr.note} />
          {pt ? <TermsBodyPt /> : <TermsBodyEn />}
          <LegalFoot locale={locale} other="privacy" />
        </LegalBody>
      </LegalLayout>
    </>
  );
}
