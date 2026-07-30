import Link from "next/link";
import { LEGAL_CNPJ, LEGAL_OPERATOR, LEGAL_ROUTES } from "@/lib/legal";
import { BrandMark } from "./_components/brand-mark";
import { ChatHub } from "./_components/chat-hub";
import { Mascot, ObsMark, PlatformGlyph, SoundWaves } from "./_components/decor";
import {
  ArrowIcon,
  BoltIcon,
  ChatIcon,
  CheckIcon,
  DownloadIcon,
  GaugeIcon,
  InfoIcon,
  KeyboardIcon,
  LayersIcon,
  LockIcon,
  PopoutIcon,
  PowerIcon,
  RadioIcon,
  SaveIcon,
  ShieldIcon,
  ThemeIcon,
  TrayIcon,
  VolumeIcon,
  WindowsIcon,
} from "./_components/icons";
import { LiveRoom, ReportChart } from "./_components/live-room";
import { ProductPreview } from "./_components/product-preview";
import { QualityDesk, VerticalCopy, VerticalCrop } from "./_components/quality-desk";

// Placeholder: substitua pela URL real do instalador ou da release.
const downloadUrl =
  process.env.NEXT_PUBLIC_PRIMARY_CTA_URL ||
  "https://example.com/corneta-download";

const faqs = [
  {
    question: "A Corneta substitui o OBS?",
    answer:
      "Não. Você continua montando cenas, câmera e áudio no OBS. A Corneta entra depois: recebe esse sinal e cuida dos destinos, do acompanhamento e das proteções da transmissão.",
  },
  {
    question: "Dá para usar de graça?",
    answer:
      "Sim. O núcleo local da Corneta é grátis e open source: multistream, chat, alertas, relatórios e proteções que rodam no seu PC não exigem assinatura.",
  },
  {
    question: "Preciso de uma placa de vídeo boa?",
    answer:
      "Depende do modo. Quando a Corneta só copia o sinal do OBS, o custo é quase zero. Quando recodifica, ela usa a placa (NVENC, QSV ou AMF) se existir, cai pra CPU se não existir, e mostra a estimativa de carga e quantas recodificações sua placa aguenta antes de você entrar ao vivo.",
  },
  {
    question: "Dá para mandar vídeo em pé pro TikTok?",
    answer:
      "A Corneta recorta um 9:16 do seu sinal deitado e você escolhe o enquadramento, com prévia do resultado. TikTok e Instagram seguem experimentais porque a entrada depende de liberação da própria plataforma; o mesmo recorte serve para qualquer destino RTMP vertical.",
  },
  {
    question: "Tem overlay pra usar no OBS?",
    answer:
      "Sim. Um servidor local na sua máquina serve os alertas e o chat (com emotes) numa URL que você adiciona no OBS como Browser Source — uma vez só. Posição, tamanho, duração, som e limite de mensagens são ajustáveis, e existe um botão de alerta de teste.",
  },
  {
    question: "Quais plataformas aparecem no app?",
    answer:
      "A Corneta traz Twitch, YouTube, Kick, Facebook e destinos RTMP personalizados. TikTok, Instagram e X ainda aparecem como experimentais porque dependem de fluxos e liberações das próprias plataformas.",
  },
  {
    question: "Vou precisar de muita internet?",
    answer:
      "Cada destino usa uma parte do seu upload. Antes da live, a Corneta mede sua conexão, soma os bitrates e ajuda você a escolher uma configuração segura.",
  },
  {
    question: "Funciona em macOS ou Linux?",
    answer:
      "Hoje, o download é para Windows. A arquitetura já considera outros sistemas, mas ainda não existe uma data pública para esses builds.",
  },
];

// As frases são as mesmas que o app mostra no seletor de plataformas
// (PLATFORM_TAGLINES em ../src/lib/platforms.ts) — quem já viu o app reconhece,
// e a ressalva de cada destino vem na linguagem dele, não num selo de status.
const destinations = [
  { id: "twitch", name: "Twitch", note: "A live de sempre" },
  { id: "youtube", name: "YouTube", note: "Aguenta qualidade alta numa boa" },
  { id: "kick", name: "Kick", note: "No estilo da Twitch" },
  { id: "facebook", name: "Facebook", note: "Live pra página ou perfil" },
  { id: "custom", name: "RTMP personalizado", note: "Qualquer servidor RTMP ou RTMPS" },
  { id: "tiktok", name: "TikTok", note: "Vídeo em pé — precisa de conta liberada" },
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
    title: "Perfis de destino",
    text: "Conjuntos salvos de plataformas e qualidade: a live de sempre, a com convidado, a de teste.",
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

function DownloadButton({
  compact = false,
  label,
}: {
  compact?: boolean;
  label?: string;
}) {
  return (
    <a
      className={`download-button${compact ? " download-button-compact" : ""}`}
      href={downloadUrl}
      data-placeholder-link="replace-me"
      aria-label="Baixar a Corneta grátis para Windows"
    >
      <WindowsIcon />
      <span>{label ?? (compact ? "Baixar" : "Baixar grátis para Windows")}</span>
      {!compact && <DownloadIcon />}
    </a>
  );
}

const tickerItems = [
  "Bora cornetar",
  "Uma live · várias comunidades",
  "Multistream que roda no seu PC",
  "Grátis e open source",
];

function TickerRow() {
  return (
    <span>
      {tickerItems.map((item) => (
        <span key={item}>
          <Mascot />
          {item}
        </span>
      ))}
    </span>
  );
}

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

      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>

      <header className="site-header">
        <div className="shell header-inner">
          <a className="brand-link" href="#topo" aria-label="Corneta — início">
            <BrandMark />
          </a>

          <nav className="main-nav" aria-label="Navegação principal">
            <a href="#por-que">Por que</a>
            <a href="#qualidade">Qualidade</a>
            <a href="#chat">Chat e alertas</a>
            <a href="#protecao">Proteção</a>
            <a href="#plataformas">Plataformas</a>
            <a href="#duvidas">Dúvidas</a>
          </nav>

          <DownloadButton compact label="Baixar no Windows" />
        </div>
      </header>

      <main id="conteudo">
        <section id="topo" className="hero">
          <SoundWaves className="hero-waves" />

          <div className="shell">
            <div className="hero-intro">
              <div>
                <span className="sticker hero-kicker">
                  <Mascot />
                  Multistream local · Windows
                </span>
                <h1>
                  <span>Uma live.</span>
                  <span>
                    <em className="slab">Várias comunidades.</em>
                  </span>
                  <span>Tudo no seu controle.</span>
                </h1>
              </div>

              <div className="hero-pitch">
                <p>
                  A Corneta recebe um sinal do OBS e leva sua live para vários
                  destinos — cada saída independente, tudo num app só, rodando na
                  máquina que já está transmitindo.
                </p>
                <div className="hero-trust" aria-label="Informações principais">
                  <span>
                    <CheckIcon /> Grátis
                  </span>
                  <span>
                    <CheckIcon /> Sem marca-d&apos;água
                  </span>
                  <span>
                    <CheckIcon /> Open source (MIT)
                  </span>
                </div>
              </div>
            </div>

            <div className="hero-stage">
              <ProductPreview />
            </div>

            <div className="download-dock">
              <DownloadButton />
              <p>Windows 10/11 · sem cadastro · núcleo local sem assinatura</p>
            </div>
          </div>
        </section>

        <section className="mechanism-strip" aria-label="Como a Corneta funciona">
          <div className="shell mechanism-grid">
            <div>
              <strong>1 sinal</strong>
              <span>saindo do OBS</span>
            </div>
            <i aria-hidden="true" />
            <div>
              <strong>Saídas independentes</strong>
              <span>uma queda não precisa levar as outras</span>
            </div>
            <i aria-hidden="true" />
            <div>
              <strong>Tudo no seu PC</strong>
              <span>chaves, configurações e relatórios</span>
            </div>
          </div>
        </section>

        <section id="por-que" className="section section-paper">
          <div className="shell">
            <div className="section-heading section-heading-centered">
              <span className="kicker">Feita para a rotina de quem faz live</span>
              <h2>Você cuida do conteúdo. A Corneta cuida do caminho.</h2>
              <p>
                Menos janela para vigiar, menos susto no meio da transmissão e
                mais tempo para falar com quem está assistindo.
              </p>
            </div>

            <div className="benefit-flow">
              <article className="benefit-row">
                <div className="benefit-copy">
                  <span className="benefit-icon">
                    <RadioIcon />
                  </span>
                  <div>
                    <h3>Chegue em mais lugares sem perder o controle</h3>
                    <p>
                      Escolha os destinos e acompanhe cada um separadamente. Se
                      uma plataforma precisar reconectar, as outras continuam no
                      ar — e você vê isso acontecendo, sem adivinhar.
                    </p>
                    <span className="benefit-note">
                      <Mascot /> Cada saída tem seu próprio interruptor
                    </span>
                  </div>
                </div>

                <div className="demo-panel">
                  <div className="demo-label">
                    <span>destinos</span>
                    <span>prévia ilustrativa</span>
                  </div>
                  <div className="route">
                    <span className="route-source">
                      <ObsMark />
                      OBS
                    </span>
                    {/* Em porcentagem da altura: com 3 linhas de 42px e 8px de
                        respiro, os centros caem em 14,79% / 50% / 85,21% —
                        assim o leque encosta no meio de cada destino em
                        qualquer altura de linha. */}
                    <span className="route-fan" aria-hidden="true">
                      <svg viewBox="0 0 34 100" preserveAspectRatio="none">
                        <path d="M0 50H12V14.79H34" />
                        <path d="M0 50H34" />
                        <path d="M0 50H12V85.21H34" />
                      </svg>
                    </span>
                    <div className="route-list">
                      <div className="route-row">
                        <PlatformGlyph id="twitch" />
                        Twitch
                        <span className="state">
                          <i /> no ar
                        </span>
                      </div>
                      <div className="route-row">
                        <PlatformGlyph id="youtube" />
                        YouTube
                        <span className="state">
                          <i /> no ar
                        </span>
                      </div>
                      <div className="route-row route-row-down">
                        <PlatformGlyph id="kick" />
                        Kick
                        <span className="state state-warn">
                          <i /> reconectando
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              <article className="benefit-row benefit-row-brass">
                <div className="benefit-copy">
                  <span className="benefit-icon">
                    <ChatIcon />
                  </span>
                  <div>
                    <h3>Converse com todo mundo sem malabarismo</h3>
                    <p>
                      Chat, alertas e público aparecem juntos. Você acompanha a
                      comunidade sem pular entre várias janelas — e responde de
                      um lugar só.
                    </p>
                    <span className="benefit-note">
                      <Mascot /> Twitch, YouTube e Kick na mesma coluna
                    </span>
                  </div>
                </div>

                <div className="demo-panel">
                  <div className="demo-label">
                    <span>chat reunido</span>
                    <span>prévia ilustrativa</span>
                  </div>
                  <div className="chat-demo">
                    <div className="chat-line">
                      <PlatformGlyph id="twitch" />
                      <div>
                        <strong>gabizera · Twitch</strong>
                        <p>salve salve, chegando!</p>
                      </div>
                    </div>
                    <div className="chat-line">
                      <PlatformGlyph id="youtube" />
                      <div>
                        <strong>Marcos L. · YouTube</strong>
                        <p>áudio tá limpo hoje 👏</p>
                      </div>
                    </div>
                    <div className="chat-line">
                      <PlatformGlyph id="kick" />
                      <div>
                        <strong>duduxx · Kick</strong>
                        <p>bora cornetar!!</p>
                      </div>
                    </div>
                    <div className="chat-compose">
                      Responde de uma vez…
                      <b>enviar</b>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="qualidade" className="section section-dark">
          <div className="shell">
            <div className="mode-layout">
              <div className="section-heading">
                <span className="kicker kicker-light">Quanto capricho na imagem</span>
                <h2>Uma imagem pra todas ou uma pra cada. Sem adivinhar o preço.</h2>
                <p>
                  Copiar o sinal do OBS é leve; recodificar dá a melhor imagem em
                  cada plataforma e pesa mais. A Corneta faz essa conta na sua
                  frente — upload somado, recodificações e carga estimada — antes
                  de você entrar ao vivo. Veja o que cada modo do app faz com os
                  seus destinos:
                </p>
              </div>

              <QualityDesk />
            </div>

            <div className="vertical-layout">
              <VerticalCopy />
              <VerticalCrop />
            </div>
          </div>
        </section>

        <section className="section section-paper section-paper-raised">
          <div className="shell">
            <div className="section-heading">
              <span className="kicker">Um app para a live inteira</span>
              <h2>Antes, durante e depois. Sem trocar de bancada.</h2>
            </div>

            <div className="journey journey-ink">
              <article className="journey-row">
                <div className="journey-label">
                  <span className="sticker">Antes da live</span>
                  <h3>Prepare sem medo de esquecer alguma coisa.</h3>
                </div>
                <div className="journey-copy">
                  <p>
                    Conecte as plataformas, meça seu upload e deixe o OBS pronto
                    com poucos cliques — a Corneta consegue configurar o OBS
                    sozinha e até dar play nele quando você aperta o BORA.
                  </p>
                  <ul className="checklist checklist-ink">
                    <li>
                      <CheckIcon /> Teste de upload de verdade
                    </li>
                    <li>
                      <CheckIcon /> Configuração guiada do OBS
                    </li>
                    <li>
                      <CheckIcon /> Checklist da primeira live
                    </li>
                  </ul>
                </div>
                <div className="stat-panel">
                  <span>seu upload · prévia</span>
                  <div className="bars" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <strong>25 Mb/s</strong>
                  <small>dá pros quatro destinos com folga</small>
                </div>
              </article>

              <article className="journey-row journey-row-wide">
                <div className="journey-label">
                  <span className="sticker sticker-tomate">Durante a live</span>
                  <h3>Veja o que importa sem sair do seu conteúdo.</h3>
                  <p>
                    Bitrate, fps, quadros perdidos e tempo no ar de cada destino,
                    mais CPU e placa reais. Pause um destino sem encerrar os
                    outros; quem cair volta sozinho.
                  </p>
                </div>
                <LiveRoom />
              </article>

              <article className="journey-row journey-row-wide">
                <div className="journey-label">
                  <span className="sticker">Depois da live</span>
                  <h3>Entenda o que aconteceu e melhore a próxima.</h3>
                  <p>
                    O relatório fica no seu PC e junta audiência, taxa de chat,
                    alertas, momentos marcados e os trechos em que o sinal
                    sofreu — com um veredito honesto no fim.
                  </p>
                </div>
                <ReportChart />
              </article>
            </div>
          </div>
        </section>

        <section id="chat" className="section section-dark">
          <div className="shell">
            <div className="hub-layout">
              <div className="section-heading">
                <span className="kicker kicker-light">A galera junta</span>
                <h2>O chat de todas, os alertas de todas — e um overlay pronto.</h2>
                <p>
                  Ler, responder e moderar sem trocar de janela; os alertas das
                  plataformas e dos agregadores no mesmo painel; e um overlay
                  local que você cola no OBS uma vez e esquece.
                </p>
              </div>

              <ChatHub />
            </div>
          </div>
        </section>

        <section id="protecao" className="section section-paper">
          <div className="shell">
            <div className="section-heading">
              <span className="kicker">Rede de proteção</span>
              <h2>Quando algo dá errado, a live não precisa morrer.</h2>
              <p>
                Quatro redes que você liga (ou não) nas Configurações. Cada uma
                tem um custo — e a Corneta conta ele antes, não no meio da live.
              </p>
            </div>

            <div className="benefit-flow">
              <article className="benefit-row">
                <div className="benefit-copy">
                  <span className="benefit-icon">
                    <ShieldIcon />
                  </span>
                  <div>
                    <h3>“JÁ VOLTO”: o sinal cai, a live continua</h3>
                    <p>
                      Se o OBS cair no meio da transmissão, esta tela entra no ar
                      sem derrubar as plataformas — pro espectador a live nem
                      pisca, e volta sozinha quando o sinal retorna. Também serve
                      pra pausa manual: um clique e você sai da cadeira com o
                      microfone mudo.
                    </p>
                    <span className="benefit-note">
                      <InfoIcon /> Use o slate da Corneta ou a sua imagem ou vídeo
                    </span>
                  </div>
                </div>

                <div
                  className="brb-slate"
                  aria-label="Tela JÁ VOLTO que a Corneta coloca no ar"
                >
                  <small>CORNETA · MULTI-STREAM</small>
                  <strong>JÁ VOLTO</strong>
                  <p>já já tô de volta — segura a corneta 📣</p>
                </div>
              </article>
            </div>

            <div className="guard-grid guard-grid-3">
              <div className="guard">
                <div className="guard-head">
                  <i>
                    <GaugeIcon />
                  </i>
                  <h3>Auto-bitrate</h3>
                </div>
                <p>
                  Se a sua internet engasgar, a Corneta baixa a qualidade do vídeo
                  por um tempo em vez de deixar a live travar ou cair — e volta ao
                  normal sozinha.
                </p>
                <span className="guard-cost">
                  <InfoIcon /> Age nos destinos que estão recodificando; quem vai
                  na cópia sai do jeito que o OBS mandou.
                </span>
                <span className="guard-switch">
                  <span className="app-toggle" aria-hidden="true">
                    <i />
                  </span>
                  ligado por padrão
                </span>
              </div>

              <div className="guard">
                <div className="guard-head">
                  <i>
                    <LockIcon />
                  </i>
                  <h3>Guardião de privacidade</h3>
                </div>
                <p>
                  Você lista os termos que não podem vazar — e-mail, nome real,
                  endereço. Se um deles aparece na tela, a Corneta corta pro “JÁ
                  VOLTO” antes de ir ao ar.
                </p>
                <span className="guard-cost">
                  <InfoIcon /> Custa 12s de atraso na live inteira (o chat
                  também). Rede de segurança, não garantia.
                </span>
                <span className="guard-switch">
                  <span className="sticker sticker-tomate guard-sticker">
                    experimental
                  </span>
                </span>
              </div>

              <div className="guard">
                <div className="guard-head">
                  <i>
                    <VolumeIcon />
                  </i>
                  <h3>Normalizador de áudio</h3>
                </div>
                <p>
                  A Corneta acerta o volume do seu som antes de enviar — sem “tá
                  baixo” do chat nem estouro na troca de cena, no mesmo encode que
                  já estava rodando.
                </p>
                <span className="guard-cost">
                  <InfoIcon /> Se você já normaliza no OBS, deixe desligado pra
                  não brigar com ele.
                </span>
                <span className="guard-switch">
                  <span className="app-toggle app-toggle-off" aria-hidden="true">
                    <i />
                  </span>
                  opcional
                </span>
              </div>
            </div>
          </div>
        </section>

        <section id="como-funciona" className="section section-paper section-paper-raised">
          <div className="shell how-layout">
            <div className="section-heading">
              <span className="kicker">Do OBS para o público</span>
              <h2>Você entra ao vivo em três passos.</h2>
              <p>Sem terminal, sem Docker, sem endereço de servidor para decorar.</p>
            </div>

            <ol className="steps">
              <li>
                <b>1</b>
                <div>
                  <h3>Escolha onde quer aparecer</h3>
                  <p>
                    A Corneta abre a página certa de cada plataforma pra você
                    copiar a chave, e guarda ela no cofre do Windows — nunca no
                    arquivo de configuração.
                  </p>
                </div>
              </li>
              <li>
                <b>2</b>
                <div>
                  <h3>Conecte o OBS</h3>
                  <p>
                    Deixe a Corneta configurar pra você pelo obs-websocket ou siga
                    o passo a passo com os valores prontos pra colar.
                  </p>
                </div>
              </li>
              <li>
                <b>3</b>
                <div>
                  <h3>Aperte o botão</h3>
                  <p>
                    Acompanhe cada destino e continue cuidando do conteúdo. Se
                    quiser, a Corneta manda o OBS começar a transmitir junto.
                  </p>
                  <em>
                    <RadioIcon /> BORA AO VIVO
                  </em>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <section className="section section-dark">
          <div className="shell local-layout">
            <div className="local-main">
              <span className="kicker kicker-light">Local de verdade</span>
              <h2>
                Sem mensalidade de restream. Sem mandar suas chaves para a nossa
                nuvem.
              </h2>
              <p>
                O trabalho pesado acontece na máquina que já está transmitindo.
                Configurações, chaves e relatórios continuam com você — e o
                overlay do OBS é um servidor que só responde no seu computador.
              </p>
              <ul className="checklist">
                <li>
                  <CheckIcon /> Núcleo local grátis
                </li>
                <li>
                  <CheckIcon /> Código aberto com licença MIT
                </li>
                <li>
                  <CheckIcon /> Chaves no cofre do sistema
                </li>
                <li>
                  <CheckIcon /> Sem marca-d&apos;água
                </li>
              </ul>
            </div>

            <aside className="honest-note">
              <span>
                <Mascot /> A conta honesta
              </span>
              <h3>Cada destino usa upload.</h3>
              <p>
                E recodificar pode usar GPU ou CPU. A Corneta mede sua conexão,
                soma os bitrates e mostra essa conta antes da live — não no meio
                dela.
              </p>
            </aside>
          </div>
        </section>

        <section id="plataformas" className="section section-paper">
          <div className="shell platforms-layout">
            <div className="section-heading">
              <span className="kicker">Do seu canal para todo lugar</span>
              <h2>Leve sua live para as plataformas que fazem sentido para você.</h2>
              <p>
                Os quatro grandes já vêm prontos, com o endereço de cada um
                preenchido. Some quantos quiser — inclusive qualquer servidor
                RTMP que não esteja nesta lista.
              </p>
            </div>

            <div className="dest-board">
              <div className="dest-grid">
                {destinations.map((destination) => (
                  <article className="dest" key={destination.name}>
                    <PlatformGlyph id={destination.id} />
                    <div>
                      <strong>{destination.name}</strong>
                      <p>{destination.note}</p>
                    </div>
                  </article>
                ))}
              </div>

              <p className="dest-note">
                <strong>TikTok, Instagram e X são experimentais.</strong> A
                entrada depende de liberação e de fluxos das próprias
                plataformas, então podem simplesmente não funcionar para a sua
                conta.
              </p>
              <p className="dest-note">
                Até aqui, a Twitch é a plataforma com transmissão real
                documentada de ponta a ponta. As outras estão implementadas no
                app e seguem em validação pública.
              </p>
            </div>
          </div>
        </section>

        <section className="section section-dark">
          <div className="shell">
            <div className="section-heading">
              <span className="kicker kicker-light">Miudezas que salvam a live</span>
              <h2>O resto do cuidado, que só aparece quando você usa.</h2>
            </div>

            <div className="tiny-grid">
              {tinyThings.map((item) => (
                <div className="tiny" key={item.title}>
                  <i>{item.icon}</i>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="duvidas" className="section section-paper section-paper-raised">
          <div className="shell faq-layout">
            <div className="section-heading">
              <span className="kicker">Antes de baixar</span>
              <h2>Dúvidas que vale resolver agora.</h2>
              <p>Sem letrinha miúda aparecendo depois que você instalou.</p>
            </div>

            <div className="faq-list">
              {faqs.map((faq, index) => (
                <details key={faq.question} open={index === 0}>
                  <summary>
                    <span>{faq.question}</span>
                    <i aria-hidden="true" />
                  </summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <div className="ticker" aria-hidden="true">
          <div className="ticker-track">
            <TickerRow />
            <TickerRow />
          </div>
        </div>

        <section className="final-cta">
          <SoundWaves className="final-waves" />
          <div className="shell final-cta-inner">
            <div>
              <span className="final-mascot" aria-hidden="true">
                <Mascot />
              </span>
              <h2>Baixe, conecte o OBS e faça sua live chegar mais longe.</h2>
            </div>
            <div className="final-cta-actions">
              <DownloadButton />
              <p>Windows 10/11 · sem cadastro · núcleo local sem assinatura</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="shell footer-inner">
          <div className="footer-brand">
            <BrandMark />
            <p>Multistream local para quem quer criar, não manter servidor.</p>
            <p className="footer-id">
              {LEGAL_OPERATOR} · CNPJ {LEGAL_CNPJ}
            </p>
          </div>

          <nav className="footer-links" aria-label="Links do rodapé">
            <Link href={LEGAL_ROUTES.privacy}>Privacidade</Link>
            <Link href={LEGAL_ROUTES.terms}>Termos de uso</Link>
            <a
              href="https://github.com/pitroldev"
              rel="noreferrer noopener"
              target="_blank"
            >
              Código-fonte
            </a>
          </nav>

          <a
            className="footer-link"
            href={downloadUrl}
            data-placeholder-link="replace-me"
          >
            Baixar para Windows <ArrowIcon />
          </a>
        </div>
      </footer>
    </>
  );
}
