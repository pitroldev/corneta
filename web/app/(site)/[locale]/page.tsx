import { notFound } from "next/navigation";
import { homeJsonLd, jsonLdScript } from "@/lib/seo";
import { isLocale, translator, type T, type MessageKey } from "@/lib/i18n";
import { Hero, SiteHeader, SkipLink } from "@/app/_sections/hero";
import { How } from "@/app/_sections/how";
import { Features } from "@/app/_sections/features";
import { Local, Platforms } from "@/app/_sections/steps";
import { Faq, FinalCta, SiteFooter } from "@/app/_sections/closing";

const DEST_IDS = [
  "twitch",
  "youtube",
  "kick",
  "facebook",
  "custom",
  "tiktok",
  "instagram",
  "x",
] as const;

const destinationsFor = (t: T) =>
  DEST_IDS.map((id) => ({
    id,
    name: t(`page-data.destinations.${id}.name` as MessageKey),
  }));

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = translator(locale);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(homeJsonLd(locale)) }}
      />

      <SkipLink t={t} />
      <SiteHeader t={t} locale={locale} />

      <main id="conteudo" tabIndex={-1}>
        <Hero t={t} locale={locale} />
        <How t={t} locale={locale} />
        <Features t={t} locale={locale} />
        <Platforms t={t} destinations={destinationsFor(t)} />
        <Local t={t} locale={locale} />
        <Faq t={t} locale={locale} />
        <FinalCta t={t} locale={locale} />
      </main>

      <SiteFooter t={t} locale={locale} />
    </>
  );
}
