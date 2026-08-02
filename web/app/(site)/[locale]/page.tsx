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

// A home só orquestra: cada seção mora em _sections/ e traz o próprio markup.
// Os dados que atravessam mais de uma seção ficam aqui.

// Placeholder: substitua pela URL real do instalador ou da release.
const downloadUrl = process.env.NEXT_PUBLIC_PRIMARY_CTA_URL ?? "#download";

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

/** Os destinos são dados, mas o rótulo e a nota são copy — então a lista se
 *  monta com o `t` do idioma em vez de viver congelada em português. */
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
      <span
        hidden
        aria-hidden="true"
        dangerouslySetInnerHTML={{
          __html:
            "<!-- THESIS: um sinal do OBS berrado pra várias comunidades, contado com o MESMO material do app desktop e provado recurso por recurso; recusa o palco azul 'creator live room' e a grade de cards SaaS. OWN-WORLD: pôster/gibi impresso — breu #100b07 com meio-tom, blocos sólidos de latão #ffb323 e tomate #ff5a36, sombras DURAS 4px 4px 0 sem blur, cantos secos 4–14px, adesivos tortos, Baloo 2 + Inter; faixas de papel #f3ead7 (tema claro do app) para leitura longa. STORY: reconhece a tela do app, vê cada recurso funcionando (modos de qualidade, vertical 9:16, chat/alertas/overlay, painel ao vivo, relatório, proteções) e baixa pro Windows. FIRST VIEWPORT: adesivo de latão, título de 3 linhas com 'Várias comunidades' numa laje de latão desalinhada em tomate, pitch curto à direita, réplica da tela Ao vivo em largura total e o botão tomate abaixo dela. FORM: mundo herdado do app (pinado pelo brief) — palco escuro + faixas de papel, réplica fiel da tela Ao vivo, demonstrações interativas em CSS puro. -->",
        }}
      />

      {/* Dados estruturados: Organization, WebSite, SoftwareApplication,
          FAQPage e HowTo num grafo só. A FAQ aqui é a mesma constante que a
          lista visível renderiza, então não tem como divergir. */}
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
        <Faq t={t} downloadUrl={downloadUrl} />
        <Ticker t={t} />
        <FinalCta t={t} />
      </main>

      <SiteFooter t={t} locale={locale} downloadUrl={downloadUrl} />
    </>
  );
}
