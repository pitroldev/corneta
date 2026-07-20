import { BrandMark } from "./_components/brand-mark";
import { ProductPreview } from "./_components/product-preview";

const primaryCtaUrl = process.env.NEXT_PUBLIC_PRIMARY_CTA_URL;
const primaryCta = primaryCtaUrl
  ? { href: primaryCtaUrl, label: "Baixar a Corneta" }
  : { href: "#como-funciona", label: "Conhecer a Corneta" };

const platforms = [
  "TWITCH",
  "YOUTUBE",
  "KICK",
  "TIKTOK",
  "FACEBOOK",
  "INSTAGRAM",
];

const features = [
  {
    number: "01",
    title: "Uma live. Vários destinos.",
    body: "O OBS envia uma vez para a Corneta. Você escolhe onde quer aparecer e acompanha cada plataforma separadamente.",
    accent: "brass",
    size: "wide",
  },
  {
    number: "02",
    title: "Chat sem malabarismo.",
    body: "Twitch, YouTube e Kick reunidos numa conversa só — com alertas e público somado.",
    accent: "tomato",
    size: "normal",
  },
  {
    number: "03",
    title: "Seu sinal tem um guardião.",
    body: "Tela preta, queda, segredo exposto: a Corneta pode agir antes do problema chegar ao público.",
    accent: "cream",
    size: "normal",
  },
  {
    number: "04",
    title: "Cada plataforma no seu formato.",
    body: "Horizontal, vertical, bitrate e resolução por destino. A aceleração disponível na sua GPU entra primeiro.",
    accent: "tomato",
    size: "normal",
  },
  {
    number: "05",
    title: "A live termina. A leitura começa.",
    body: "Retenção, picos, raids, alertas e momentos importantes viram um relatório local para a próxima transmissão ser melhor.",
    accent: "brass",
    size: "wide",
  },
];

const faqs = [
  {
    question: "A Corneta substitui o OBS?",
    answer:
      "Não. O OBS continua cuidando das cenas, câmera e áudio. A Corneta entra depois dele para distribuir, proteger e acompanhar a transmissão.",
  },
  {
    question: "É grátis mesmo?",
    answer:
      "O que roda localmente é grátis para sempre: multistream, chat, alertas, relatórios e proteções. Se houver serviços de nuvem no futuro, eles serão opcionais e cobrados apenas quando gerarem custo de servidor.",
  },
  {
    question: "Preciso de uma internet muito forte?",
    answer:
      "No modo local, cada destino usa uma fatia do seu upload. A Corneta calcula essa necessidade antes da live e ajuda a escolher um bitrate seguro — sem esconder a conta.",
  },
  {
    question: "Minhas chaves de transmissão ficam seguras?",
    answer:
      "As chaves ficam no cofre nativo do sistema operacional. Elas não são gravadas em texto puro no arquivo de configuração.",
  },
  {
    question: "Quais sistemas são suportados?",
    answer:
      "O desenvolvimento atual é Windows-first. A arquitetura foi preparada para macOS e Linux, mas ainda não há uma data pública para essas versões.",
  },
];

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d={diagonal ? "M5 15 15 5m-8 0h8v8" : "M3 10h14m-5-5 5 5-5 5"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="m3 9 4 4 8-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="square"
      />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="overflow-hidden">
      <header className="site-header">
        <div className="shell flex h-20 items-center justify-between gap-6">
          <a href="#topo" aria-label="Corneta — voltar ao início">
            <BrandMark />
          </a>

          <nav
            className="hidden items-center gap-7 text-sm font-bold lg:flex"
            aria-label="Principal"
          >
            <a className="nav-link" href="#recursos">
              Recursos
            </a>
            <a className="nav-link" href="#como-funciona">
              Como funciona
            </a>
            <a className="nav-link" href="#manifesto">
              Nosso combinado
            </a>
            <a className="nav-link" href="#duvidas">
              Dúvidas
            </a>
          </nav>

          <a className="button button-small" href={primaryCta.href}>
            {primaryCta.label}
            <Arrow diagonal={Boolean(primaryCtaUrl)} />
          </a>
        </div>
      </header>

      <section id="topo" className="hero-section">
        <div className="hero-noise" aria-hidden="true" />
        <div className="shell relative z-10 grid min-h-[calc(100svh-5rem)] items-center gap-12 py-16 lg:grid-cols-[.9fr_1.1fr] lg:py-20">
          <div className="hero-copy">
            <div className="eyebrow reveal reveal-1">
              <span className="live-dot" />
              MULTISTREAM LOCAL · GRÁTIS · OPEN SOURCE
            </div>

            <h1 className="hero-title reveal reveal-2">
              UMA LIVE.
              <span>TODO MUNDO</span>
              OUVINDO.
            </h1>

            <p className="hero-subtitle reveal reveal-3">
              A Corneta leva seu OBS para Twitch, YouTube, Kick e outras
              plataformas ao mesmo tempo — com chat, alertas e proteção rodando
              na sua máquina.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row reveal reveal-4">
              <a className="button" href={primaryCta.href}>
                {primaryCta.label}
                <Arrow diagonal={Boolean(primaryCtaUrl)} />
              </a>
              <a className="button button-ghost" href="#recursos">
                Ver o que ela faz
                <Arrow />
              </a>
            </div>

            <ul
              className="trust-list reveal reveal-5"
              aria-label="Compromissos da Corneta"
            >
              <li>
                <Check /> Sem marca-d&apos;água
              </li>
              <li>
                <Check /> Sem limite artificial
              </li>
              <li>
                <Check /> Seus dados ficam seus
              </li>
            </ul>
          </div>

          <div className="relative reveal reveal-3 lg:pl-5">
            <div className="burst-label" aria-hidden="true">
              <span>FEITO</span>
              <span>NO BRASIL</span>
            </div>
            <div className="preview-tilt">
              <ProductPreview />
            </div>
            <div className="signal-lines" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          </div>
        </div>
      </section>

      <div
        className="platform-ticker"
        aria-label={`Plataformas: ${platforms.join(", ")}`}
      >
        <div className="ticker-track" aria-hidden="true">
          {[...platforms, ...platforms].map((platform, index) => (
            <span key={`${platform}-${index}`}>
              {platform}
              <b>●</b>
            </span>
          ))}
        </div>
      </div>

      <section className="section bg-paper text-ink">
        <div className="shell">
          <div className="section-kicker">O PROBLEMA</div>
          <div className="grid gap-10 lg:grid-cols-[.9fr_1.1fr] lg:gap-24">
            <h2 className="section-title max-w-[12ch]">
              SUA LIVE NÃO PRECISA VIRAR UMA{" "}
              <span className="marker">OPERAÇÃO DE GUERRA.</span>
            </h2>
            <div className="self-end">
              <p className="lede">
                Uma janela para cada chat. Uma regra de vídeo para cada
                plataforma. Chaves espalhadas. E aquela dúvida:{" "}
                <em>“está no ar mesmo?”</em>
              </p>
              <p className="mt-6 max-w-2xl text-base leading-relaxed text-ink/65 md:text-lg">
                A Corneta organiza o caminho entre o OBS e o público. Você
                continua criando; ela cuida da distribuição, do sinal e dos
                sinais de problema.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="recursos" className="section bg-ink text-cream">
        <div className="shell">
          <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <div className="section-kicker section-kicker-dark">
                O QUE ENTRA NA BANCADA
              </div>
              <h2 className="section-title max-w-[13ch]">
                MENOS PAINÉIS. MAIS CONTROLE.
              </h2>
            </div>
            <p className="max-w-sm text-base leading-relaxed text-cream/60">
              Tudo conversa no mesmo app e cada parte continua independente: uma
              plataforma cair não precisa levar as outras junto.
            </p>
          </div>

          <div className="feature-grid">
            {features.map((feature) => (
              <article
                key={feature.number}
                className={`feature-card feature-${feature.accent} ${feature.size === "wide" ? "feature-wide" : ""}`}
              >
                <span className="feature-number">{feature.number}</span>
                <div>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="manifesto" className="manifesto-section">
        <div className="manifesto-rays" aria-hidden="true" />
        <div className="shell relative z-10 grid gap-10 lg:grid-cols-[.7fr_1.3fr] lg:items-center">
          <div className="manifesto-stamp">
            <BrandMark showName={false} />
            <span>COMBINADO</span>
          </div>
          <div>
            <div className="section-kicker">SEM LETRINHA MIÚDA</div>
            <h2 className="manifesto-title">
              O QUE RODA NA SUA MÁQUINA É <span>GRÁTIS.</span> PRA SEMPRE.
            </h2>
            <p>
              Multistream, chat, alertas, relatórios e proteção local não viram
              assinatura depois. Se um dia existir recurso pago, será porque
              existe servidor nosso trabalhando por você — e ele será opcional.
            </p>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="section bg-paper text-ink">
        <div className="shell">
          <div className="section-kicker">DO OBS AO PÚBLICO</div>
          <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:gap-20">
            <div>
              <h2 className="section-title max-w-[10ch]">
                TRÊS PASSOS. ZERO TERMINAL.
              </h2>
              <p className="mt-6 max-w-sm text-base leading-relaxed text-ink/60">
                Nada de Docker, arquivo de configuração ou URL RTMP decorada. A
                complexidade continua existindo — só não cai no seu colo.
              </p>
            </div>

            <ol className="steps">
              <li>
                <span>1</span>
                <div>
                  <h3>Escolha onde quer aparecer.</h3>
                  <p>
                    Adicione as plataformas e guarde cada chave no cofre do
                    sistema.
                  </p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <h3>Conecte o OBS.</h3>
                  <p>
                    A Corneta configura automaticamente ou mostra o caminho,
                    passo a passo.
                  </p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <h3>Aperte BORA AO VIVO.</h3>
                  <p>
                    Veja sinal, bitrate, público, alertas e reconexões numa
                    central só.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </section>

      <section className="section border-y-4 border-ink bg-cream text-ink">
        <div className="shell grid gap-8 lg:grid-cols-2 lg:gap-0">
          <div className="honesty-panel lg:pr-16">
            <span className="honesty-label">POR QUE LOCAL?</span>
            <h2>Mais privacidade. Menos dependência.</h2>
            <p>
              Seu vídeo e suas chaves não precisam passear por um servidor de
              terceiros. A Corneta usa a máquina que já está transmitindo e
              mantém o núcleo útil mesmo sem uma assinatura.
            </p>
          </div>
          <div className="honesty-panel honesty-caveat lg:border-l-4 lg:border-ink lg:pl-16">
            <span className="honesty-label">A CONTA HONESTA</span>
            <h2>Cada destino usa upload.</h2>
            <p>
              Multistream local economiza mensalidade, não banda. Antes de
              entrar no ar, a Corneta soma os bitrates e avisa se a sua conexão
              aguenta — para a surpresa não chegar no meio da live.
            </p>
          </div>
        </div>
      </section>

      <section id="duvidas" className="section bg-paper text-ink">
        <div className="shell grid gap-12 lg:grid-cols-[.72fr_1.28fr] lg:gap-20">
          <div>
            <div className="section-kicker">SEM ENROLAÇÃO</div>
            <h2 className="section-title max-w-[9ch]">
              PERGUNTAS QUE IMPORTAM.
            </h2>
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

      <section className="final-cta">
        <div className="final-cta-word" aria-hidden="true">
          CORNETA
        </div>
        <div className="shell relative z-10 text-center">
          <BrandMark className="justify-center" />
          <h2>UMA LIVE BOA MERECE CHEGAR LONGE.</h2>
          <p>
            A Corneta ainda está afinando o instalador. Enquanto isso, conheça o
            projeto e acompanhe a evolução sem promessa vazia.
          </p>
          <a className="button button-light" href={primaryCta.href}>
            {primaryCta.label}
            <Arrow diagonal={Boolean(primaryCtaUrl)} />
          </a>
        </div>
      </section>

      <footer className="site-footer">
        <div className="shell flex flex-col gap-6 py-9 md:flex-row md:items-center md:justify-between">
          <BrandMark />
          <p>
            Multistream local para quem quer criar, não configurar servidor.
          </p>
          <span>EM DESENVOLVIMENTO · WINDOWS-FIRST</span>
        </div>
      </footer>
    </main>
  );
}
