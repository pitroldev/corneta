import { notFound } from "next/navigation";
import { homeJsonLd, jsonLdScript } from "@/lib/seo";
import { isLocale, translator, type T, type MessageKey } from "@/lib/i18n";
import {
  BoltIcon,
  KeyboardIcon,
  LayersIcon,
  PopoutIcon,
  PowerIcon,
  SaveIcon,
  ThemeIcon,
  TrayIcon,
} from "@/app/_components/icons";
import {
  Hero,
  MechanismStrip,
  SiteHeader,
  SkipLink,
} from "@/app/_sections/hero";
import { AfterLive } from "@/app/_sections/afterlive";
import { Benefits } from "@/app/_sections/benefits";
import { Journey, Quality } from "@/app/_sections/quality";
import { ChatSection, Protection } from "@/app/_sections/protection";
import { Local, Platforms, Steps } from "@/app/_sections/steps";
import { KnowledgeEntryPoints } from "@/app/_sections/knowledge";
import {
  Faq,
  FinalCta,
  SiteFooter,
  Ticker,
  TinyThings,
} from "@/app/_sections/closing";

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
    note: t(`page-data.destinations.${id}.note` as MessageKey),
  }));

const TINY_IDS = [
  ["hotkey", <KeyboardIcon key="k" />],
  ["youtube", <BoltIcon key="b" />],
  ["chatwindow", <PopoutIcon key="p" />],
  ["profiles", <LayersIcon key="l" />],
  ["tray", <TrayIcon key="t" />],
  ["startup", <PowerIcon key="w" />],
  ["theme", <ThemeIcon key="h" />],
  ["backup", <SaveIcon key="s" />],
] as const;

const tinyThingsFor = (t: T) =>
  TINY_IDS.map(([id, icon]) => ({
    icon,
    title: t(`page-data.tiny.${id}.title` as MessageKey),
    text: t(`page-data.tiny.${id}.text` as MessageKey),
  }));

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = translator(locale);
  const destinations = destinationsFor(t);
  const tinyThings = tinyThingsFor(t);
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
        <MechanismStrip t={t} />

        <Benefits t={t} />

        <Quality t={t} />
        <Journey t={t} locale={locale} />

        <ChatSection t={t} />
        <Protection t={t} />
        <AfterLive t={t} />

        <Steps t={t} />
        <Local t={t} />
        <Platforms t={t} locale={locale} destinations={destinations} />
        <TinyThings t={t} items={tinyThings} />
        <KnowledgeEntryPoints t={t} locale={locale} />
        <Faq t={t} />
        <Ticker t={t} />
        <FinalCta t={t} />
      </main>

      <SiteFooter t={t} locale={locale} />
    </>
  );
}
