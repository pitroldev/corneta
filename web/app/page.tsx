import { homeJsonLd, jsonLdScript } from "@/lib/seo";
import {
  BoltIcon,
  KeyboardIcon,
  LayersIcon,
  PopoutIcon,
  PowerIcon,
  SaveIcon,
  ThemeIcon,
  TrayIcon,
} from "./_components/icons";
import { Hero, MechanismStrip, SiteHeader, SkipLink } from "./_sections/hero";
import { Benefits } from "./_sections/benefits";
import { Journey, Quality } from "./_sections/quality";
import { ChatSection, Protection } from "./_sections/protection";
import { Local, Platforms, Steps } from "./_sections/steps";
import {
  Faq,
  FinalCta,
  SiteFooter,
  Ticker,
  TinyThings,
} from "./_sections/closing";

// A home só orquestra: cada seção mora em _sections/ e traz o próprio markup.
// Os dados que atravessam mais de uma seção ficam aqui.

// Placeholder: substitua pela URL real do instalador ou da release.
const downloadUrl = process.env.NEXT_PUBLIC_PRIMARY_CTA_URL ?? "#baixar";

const destinations = [
  { id: "twitch", name: "Twitch", note: "A live de sempre" },
  { id: "youtube", name: "YouTube", note: "Aguenta qualidade alta numa boa" },
  { id: "kick", name: "Kick", note: "No estilo da Twitch" },
  { id: "facebook", name: "Facebook", note: "Live pra página ou perfil" },
  {
    id: "custom",
    name: "RTMP personalizado",
    note: "Qualquer servidor RTMP ou RTMPS",
  },
  {
    id: "tiktok",
    name: "TikTok",
    note: "Vídeo em pé — precisa de conta liberada",
  },
  {
    id: "instagram",
    name: "Instagram",
    note: "Vídeo em pé — sem entrada oficial, pode falhar",
  },
  { id: "x", name: "X (Twitter)", note: "A chave sai do Media Studio" },
] as const;

const tinyThings = [
  {
    icon: <KeyboardIcon />,
    title: "Atalho global",
    text: "Começa e corta a live sem sair do jogo — a tecla vale com a Corneta em segundo plano.",
  },
  {
    icon: <BoltIcon />,
    title: "YouTube automático",
    text: "Com a conta conectada, a Corneta cria a transmissão e injeta a chave no BORA. Sem abrir o Studio.",
  },
  {
    icon: <PopoutIcon />,
    title: "Janelinha do chat",
    text: "Chat, alertas ou os dois numa janela que fica por cima de tudo, do tamanho que você quiser.",
  },
  {
    icon: <LayersIcon />,
    title: "Perfis salvos",
    text: "Conjuntos de plataformas e qualidade prontos: a live de sempre, a com convidado, a de teste.",
  },
  {
    icon: <TrayIcon />,
    title: "Vive na bandeja",
    text: "Fechar a janela esconde a Corneta perto do relógio — a transmissão continua de pé.",
  },
  {
    icon: <PowerIcon />,
    title: "Abre com o Windows",
    text: "Já sobe junto com o PC, pronta pra live, se você quiser.",
  },
  {
    icon: <ThemeIcon />,
    title: "Tema claro e escuro",
    text: "O mesmo pôster no breu ou no papel — e a troca acontece com um sopro de corneta.",
  },
  {
    icon: <SaveIcon />,
    title: "Backup dos ajustes",
    text: "Exporta sua configuração num arquivo. As chaves ficam no cofre e não vão junto.",
  },
];

export default function Home() {
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
        dangerouslySetInnerHTML={{ __html: jsonLdScript(homeJsonLd()) }}
      />

      <SkipLink />
      <SiteHeader />

      <main id="conteudo">
        <Hero />
        <MechanismStrip />

        <Benefits />

        <Quality />
        <Journey />

        <ChatSection />
        <Protection />

        <Steps />
        <Local />
        <Platforms destinations={destinations} />
        <TinyThings items={tinyThings} />
        <Faq downloadUrl={downloadUrl} />
        <Ticker />
        <FinalCta />
      </main>

      <SiteFooter downloadUrl={downloadUrl} />
    </>
  );
}
