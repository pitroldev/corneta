import Link from "next/link";
import { FAQS } from "@/lib/content";
import { LEGAL_CNPJ, LEGAL_OPERATOR, LEGAL_ROUTES } from "@/lib/legal";
import { BrandMark } from "../_components/brand-mark";
import { Mascot, SoundWaves } from "../_components/decor";
import { ArrowIcon, WindowsIcon } from "../_components/icons";
import {
  cn,
  downloadButton,
  Section,
  SectionHeading,
  Shell,
  TwoCol,
} from "../_components/ui";
import { DownloadButton } from "./hero";

// Fecho da página: miudezas, dúvidas, ticker, chamada final e rodapé.

const TINY =
  "flex items-start gap-[13px] bg-breu px-5 py-4.5 " +
  "[&>i>svg]:h-[21px] [&>i>svg]:w-[21px] [&>i>svg]:fill-none [&>i>svg]:stroke-current [&>i>svg]:[stroke-linecap:round] [&>i>svg]:[stroke-linejoin:round] [&>i>svg]:[stroke-width:2.2] " +
  "[&_strong]:block [&_strong]:font-display [&_strong]:text-base [&_strong]:leading-[1.15] [&_strong]:font-bold " +
  "[&_p]:mt-[3px] [&_p]:text-[0.8rem] [&_p]:leading-[1.45] [&_p]:font-medium [&_p]:text-muted";

export function TinyThings({
  items,
}: {
  items: { icon: React.ReactNode; title: string; text: string }[];
}) {
  return (
    <Section>
      <Shell>
        <SectionHeading
          kicker="As miudezas"
          title="O resto do cuidado, que só aparece quando você usa."
        />

        {/* A grade tem 1px de vão sobre o breu: os cartões encostam e a linha
            fina entre eles é o próprio fundo aparecendo. */}
        <div className="mt-[clamp(38px,4vw,56px)] grid grid-cols-3 gap-px bg-border-soft max-[980px]:grid-cols-1">
          {items.map((item) => (
            <div className={TINY} key={item.title}>
              <i>{item.icon}</i>
              <div>
                <strong>{item.title}</strong>
                <p>{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </Shell>
    </Section>
  );
}

// O "+" do acordeão são duas barras cruzadas; ao abrir, a vertical gira pra
// horizontal e vira "−". Sem ícone, sem JS.
const FAQ_LIST =
  "border-t-[3px] border-ink max-[980px]:max-w-[720px] " +
  "[&>details]:border-b-[3px] [&>details]:border-ink " +
  "[&_summary]:flex [&_summary]:min-h-[74px] [&_summary]:cursor-pointer [&_summary]:list-none [&_summary]:items-center [&_summary]:justify-between [&_summary]:gap-5 [&_summary]:py-3.5 [&_summary]:font-display [&_summary]:text-[clamp(1.12rem,1.8vw,1.4rem)] [&_summary]:leading-[1.25] [&_summary]:font-extrabold " +
  "[&_summary::-webkit-details-marker]:hidden " +
  "[&_summary>i]:relative [&_summary>i]:size-6.5 [&_summary>i]:shrink-0 [&_summary>i]:rounded-sm [&_summary>i]:bg-brass [&_summary>i]:shadow-[3px_3px_0_0_var(--ink)] [&_summary>i]:transition-transform " +
  "[&_summary:hover>i]:rotate-[-6deg] " +
  "[&_summary>i]:before:absolute [&_summary>i]:before:top-[11.5px] [&_summary>i]:before:left-1.5 [&_summary>i]:before:h-[3px] [&_summary>i]:before:w-3.5 [&_summary>i]:before:bg-brass-ink [&_summary>i]:before:content-['']" +
  " [&_summary>i]:after:absolute [&_summary>i]:after:top-[11.5px] [&_summary>i]:after:left-1.5 [&_summary>i]:after:h-[3px] [&_summary>i]:after:w-3.5 [&_summary>i]:after:rotate-90 [&_summary>i]:after:bg-brass-ink [&_summary>i]:after:transition-transform [&_summary>i]:after:content-[''] " +
  "[&_details[open]_summary>i]:after:rotate-0 " +
  "[&_details>p]:mt-[-2px] [&_details>p]:mb-6 [&_details>p]:max-w-[68ch] [&_details>p]:pr-11 max-[760px]:[&_details>p]:pr-0 [&_details>p]:leading-[1.68] [&_details>p]:font-medium [&_details>p]:text-ink-muted";

export function Faq({ downloadUrl }: { downloadUrl: string }) {
  return (
    <Section id="duvidas" tone="paper-raised">
      <Shell>
        <TwoCol
          align="start"
          cols="minmax(0,0.78fr) minmax(440px,1.22fr)"
          className="gap-[clamp(44px,7vw,100px)]"
        >
          <SectionHeading
            tight
            tone="paper"
            kicker="Antes de baixar"
            title="Dúvidas que vale resolver agora."
          >
            <p>Sem letrinha miúda aparecendo depois que você instalou.</p>
            <a
              className={cn(
                downloadButton,
                "mt-7 min-h-11 gap-[9px] rounded-sm px-[15px] text-[0.92rem] shadow-[4px_4px_0_0_var(--ink)] [&>svg]:h-[18px] [&>svg]:w-[18px]",
              )}
              href={downloadUrl}
              data-placeholder-link="replace-me"
            >
              <WindowsIcon />
              <span>Baixar grátis para Windows</span>
            </a>
          </SectionHeading>

          <div className={FAQ_LIST}>
            {FAQS.map((faq, index) => (
              <details key={faq.question} open={index === 0}>
                <summary>
                  <span>{faq.question}</span>
                  <i aria-hidden="true" />
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </TwoCol>
      </Shell>
    </Section>
  );
}

const TICKER_ROW =
  "inline-flex items-center gap-5.5 pr-5.5 whitespace-nowrap [&_svg]:h-[17px] [&_svg]:w-[17px] [&_svg]:fill-current";

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
        <span className={TICKER_ROW} key={item}>
          <Mascot />
          {item}
        </span>
      ))}
    </span>
  );
}

/** Duas cópias da faixa: a animação desliza uma largura inteira e a segunda
 *  entra sem emenda. */
export function Ticker() {
  return (
    <div
      className="overflow-hidden border-y-[3px] border-night bg-tomate text-brass-ink select-none"
      aria-hidden="true"
    >
      <div className="flex w-max animate-[marquee_34s_linear_infinite] items-center py-[11px] font-display text-[0.95rem] font-extrabold tracking-[0.06em] uppercase">
        <TickerRow />
        <TickerRow />
      </div>
    </div>
  );
}

export function FinalCta() {
  return (
    <section className="relative isolate overflow-hidden py-[clamp(70px,8vw,110px)]">
      <SoundWaves className="pointer-events-none absolute -right-[190px] -bottom-[220px] -z-10 w-[640px] text-brass opacity-14" />
      <Shell>
        <TwoCol
          cols="minmax(0,1.12fr) minmax(320px,0.88fr)"
          className="gap-[clamp(38px,5vw,66px)]"
        >
          <div>
            <span
              className="mb-5.5 grid size-[62px] animate-[shout_2.4s_ease-in-out_infinite] -rotate-3 place-items-center rounded-lg bg-brass text-brass-ink shadow-pop [&>svg]:h-9 [&>svg]:w-9"
              aria-hidden="true"
            >
              <Mascot />
            </span>
            <h2 className="max-w-[24ch] text-[clamp(2.35rem,4.2vw,3.9rem)] leading-[0.98] tracking-[-0.03em] max-md:text-[clamp(2.1rem,10.5vw,3rem)]">
              Baixe, ligue no seu programa de live e chegue mais longe.
            </h2>
          </div>
          <div className="flex flex-col items-start gap-4 [&>a]:w-[min(400px,100%)] [&>p]:text-[0.78rem] [&>p]:font-[650] [&>p]:text-faint">
            <DownloadButton />
            <p>Windows 10/11 · sem cadastro · sem assinatura</p>
          </div>
        </TwoCol>
      </Shell>
    </section>
  );
}

const FOOTER_LINK =
  "inline-flex min-h-[30px] items-center rounded-sm bg-surface-2 px-[11px] py-1.5 text-[0.78rem] font-bold text-muted transition-colors duration-120 hover:bg-brass hover:text-brass-ink";

export function SiteFooter({ downloadUrl }: { downloadUrl: string }) {
  return (
    <footer className="border-t-2 border-border-soft bg-panel">
      <Shell className="flex min-h-26 items-center justify-between gap-7 py-5.5 max-[760px]:flex-col max-[760px]:items-start">
        <div className="flex flex-col gap-3 [&_p]:max-w-[40ch] [&_p]:text-[0.82rem] [&_p]:font-[550] [&_p]:text-faint">
          <BrandMark />
          <p>Multistream local para quem quer criar, não manter servidor.</p>
          <p>
            {LEGAL_OPERATOR} · CNPJ {LEGAL_CNPJ}
          </p>
        </div>

        {/* Rótulo por extenso de propósito: a verificação do Google procura um
            link de "política de privacidade" na home, e "Privacidade" sozinho é
            ambíguo pra quem revisa sem ler português. */}
        <nav
          className="flex flex-wrap gap-x-2.5 gap-y-2"
          aria-label="Links do rodapé"
        >
          <Link className={FOOTER_LINK} href={LEGAL_ROUTES.privacy}>
            Política de privacidade
          </Link>
          <Link className={FOOTER_LINK} href={LEGAL_ROUTES.terms}>
            Termos de uso
          </Link>
          <a
            className={FOOTER_LINK}
            href="https://github.com/pitroldev"
            rel="noreferrer noopener"
            target="_blank"
          >
            Código-fonte
          </a>
        </nav>

        <a
          className="inline-flex min-h-[30px] items-center gap-2 font-display text-[0.92rem] font-extrabold text-brass [&>svg]:h-[19px] [&>svg]:w-[19px] [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:transition-transform [&>svg]:[stroke-linecap:round] [&>svg]:[stroke-linejoin:round] [&>svg]:[stroke-width:2.4] hover:[&>svg]:translate-x-1"
          href={downloadUrl}
          data-placeholder-link="replace-me"
        >
          Baixar para Windows <ArrowIcon />
        </a>
      </Shell>
    </footer>
  );
}
