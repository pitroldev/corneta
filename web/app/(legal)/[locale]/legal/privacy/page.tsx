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
  PrivacyBodyPt,
  privacyHeroPt,
  privacySectionsPt,
  privacyTldrPt,
} from "../_content/privacy.pt";
import {
  PrivacyBodyEn,
  privacyHeroEn,
  privacySectionsEn,
  privacyTldrEn,
} from "../_content/privacy.en";
import { isLocale, type Locale } from "@/lib/i18n";
import { LEGAL_ROUTES, legalHref } from "@/lib/legal";
import { jsonLdScript, legalJsonLd } from "@/lib/seo";

const PATH = LEGAL_ROUTES.privacy;

const META = {
  "pt-BR": {
    title: "Política de privacidade",
    description:
      "O que fica no seu computador, a telemetria opcional do aplicativo e as métricas cookieless do site, com opt-out e sem conta.",
    ogTitle: "Política de privacidade — Corneta",
    ogDescription:
      "O que a Corneta trata, o que fica só no seu computador e o que passa pelos nossos servidores.",
  },
  en: {
    title: "Privacy policy",
    description:
      "What stays on your computer, optional app telemetry, and cookieless website metrics with an opt-out and no account.",
    ogTitle: "Privacy policy — Corneta",
    ogDescription:
      "What Corneta processes, what stays on your computer only, and what passes through our servers.",
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
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical: legalHref(locale, "privacy"),
      languages: {
        "pt-BR": PATH,
        en: `/en${PATH}`,
        "x-default": PATH,
      },
    },
    openGraph: {
      title: meta.ogTitle,
      description: meta.ogDescription,
      url: legalHref(locale, "privacy"),
      locale: locale === "en" ? "en_US" : "pt_BR",
    },
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const pt = locale === "pt-BR";
  const hero = pt ? privacyHeroPt : privacyHeroEn;
  const tldr = pt ? privacyTldrPt : privacyTldrEn;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(legalJsonLd("privacy", locale)),
        }}
      />

      <LegalHero
        locale={locale}
        kicker={hero.kicker}
        title={hero.title}
        intro={hero.intro}
        version="2.0"
        path={PATH}
      />

      <LegalLayout>
        <LegalToc
          locale={locale}
          sections={pt ? privacySectionsPt : privacySectionsEn}
        />

        <LegalBody>
          <LegalBindingNotice locale={locale} path={PATH} />
          <LegalTldr locale={locale} points={tldr.points} note={tldr.note} />
          {pt ? <PrivacyBodyPt /> : <PrivacyBodyEn />}
          <LegalFoot locale={locale} other="terms" />
        </LegalBody>
      </LegalLayout>
    </>
  );
}
