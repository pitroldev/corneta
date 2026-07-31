import Link from "next/link";
import { BrandMark } from "../../_components/brand-mark";
import { Mascot } from "../../_components/decor";
import { ArrowIcon, CheckIcon, InfoIcon } from "../../_components/icons";
import { Shell } from "../../_components/ui";
import {
  LEGAL_CNPJ,
  LEGAL_CONTACT,
  LEGAL_OPERATOR,
  LEGAL_ROUTES,
  LEGAL_UPDATED_ISO,
  LEGAL_UPDATED_LABEL,
} from "@/lib/legal";

/** Valor que o dono do site precisa preencher antes de publicar. */
export function Todo({ children }: { children: string }) {
  return (
    <span
      className="rounded-sm bg-tomate-ink px-1.5 py-px text-[0.82em] font-extrabold tracking-[0.02em] whitespace-nowrap text-white"
      data-placeholder-legal="replace-me"
    >
      [definir: {children}]
    </span>
  );
}

/** E-mail de contato ou a pendência visível, quando ainda não há um. */
export function Contact() {
  if (!LEGAL_CONTACT) return <Todo>e-mail de contato</Todo>;
  return <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>;
}

export function LegalHeader() {
  return (
    <header className="border-b-2 border-paper-line bg-panel text-cream">
      <Shell className="flex min-h-17 items-center justify-between gap-7">
        <Link className="shrink-0" href="/" aria-label="Corneta — início">
          <BrandMark />
        </Link>
        <nav
          className="ml-auto flex items-center gap-6.5 text-[0.88rem] font-[650] text-muted [&_a:hover]:text-cream"
          aria-label="Documentos"
        >
          <Link href={LEGAL_ROUTES.privacy}>Privacidade</Link>
          <Link href={LEGAL_ROUTES.terms}>Termos de uso</Link>
        </nav>
      </Shell>
    </header>
  );
}

export function LegalHero({
  kicker,
  title,
  intro,
  version,
}: {
  kicker: string;
  title: string;
  intro: string;
  version: string;
}) {
  return (
    <Shell className="pt-[clamp(46px,5vw,74px)] pb-[clamp(30px,3.5vw,44px)]">
      <span className="mb-5 inline-flex items-center gap-2.5 text-[0.78rem] font-extrabold tracking-[0.1em] text-tomate-ink uppercase before:h-1 before:w-[26px] before:bg-brass before:content-['']">
        {kicker}
      </span>
      <h1 className="max-w-[22ch] text-[clamp(2.4rem,5vw,3.6rem)] leading-[0.98] tracking-[-0.03em]">
        {title}
      </h1>
      <p className="mt-5 max-w-[62ch] text-[1.05rem] leading-[1.68] font-medium text-ink-muted">
        {intro}
      </p>
      <div className="mt-6 flex flex-wrap gap-x-2.5 gap-y-2 [&>span]:inline-flex [&>span]:items-center [&>span]:gap-[7px] [&>span]:rounded-sm [&>span]:bg-paper-sunk [&>span]:px-2.5 [&>span]:py-1.5 [&>span]:text-[0.74rem] [&>span]:font-bold [&>span]:text-ink">
        <span>
          Última atualização:{" "}
          <time dateTime={LEGAL_UPDATED_ISO}>{LEGAL_UPDATED_LABEL}</time>
        </span>
        <span>Versão {version}</span>
        <span>Português do Brasil</span>
      </div>
    </Shell>
  );
}

export function LegalTldr({
  points,
  note,
}: {
  points: string[];
  note: string;
}) {
  return (
    <div className="rounded-xl bg-brass p-[clamp(22px,2.6vw,32px)] text-brass-ink shadow-pop-ink-lg">
      <span className="mb-3.5 inline-flex items-center gap-2 text-[0.72rem] font-extrabold tracking-[0.1em] uppercase [&>svg]:h-4 [&>svg]:w-4 [&>svg]:fill-current">
        <Mascot /> Em uma corneta
      </span>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0 [&>li]:flex [&>li]:items-start [&>li]:gap-2.5 [&>li]:text-[0.95rem] [&>li]:leading-[1.5] [&>li]:font-[550] [&_svg]:mt-[3px] [&_svg]:h-[17px] [&_svg]:w-[17px] [&_svg]:shrink-0 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round] [&_svg]:[stroke-width:3]">
        {points.map((point) => (
          <li key={point}>
            <CheckIcon />
            {point}
          </li>
        ))}
      </ul>
      <small className="mt-4 block text-[0.76rem] font-bold opacity-85">
        {note}
      </small>
    </div>
  );
}

// A numeração do sumário é `counter`, não índice do array: assim ela acompanha
// a ordem visual mesmo se a lista mudar, e sai com zero à esquerda.
const TOC_LIST =
  "m-0 list-none border-t-2 border-paper-line p-0 [counter-reset:toc] " +
  "[&>li]:border-b-2 [&>li]:border-paper-line [&>li]:[counter-increment:toc] " +
  "[&_a]:flex [&_a]:gap-[9px] [&_a]:px-0.5 [&_a]:py-[9px] [&_a]:text-[0.82rem] [&_a]:leading-[1.35] [&_a]:font-[650] [&_a]:text-ink-muted [&_a]:transition-colors " +
  "[&_a]:before:font-display [&_a]:before:text-[0.76rem] [&_a]:before:font-extrabold [&_a]:before:text-brass-ink [&_a]:before:opacity-55 [&_a]:before:[content:counter(toc,decimal-leading-zero)] " +
  "[&_a:hover]:text-tomate-ink";

export function LegalToc({
  sections,
}: {
  sections: { id: string; title: string }[];
}) {
  return (
    <nav className="sticky top-23" aria-label="Sumário do documento">
      <strong className="mb-3.5 block text-[0.72rem] font-extrabold tracking-[0.1em] text-tomate-ink uppercase">
        Neste documento
      </strong>
      <ol className={TOC_LIST}>
        {sections.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`}>{section.title}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Grade do documento: sumário grudento à esquerda, texto à direita.
 *
 * `minmax(0,1fr)` na coluna do texto, não `1fr`: com a tabela larga dentro, o
 * min-content do item estourava a coluna e a página ganhava rolagem horizontal.
 */
export function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell className="grid items-start gap-[clamp(34px,5vw,72px)] pb-[clamp(70px,8vw,110px)] [grid-template-columns:minmax(210px,0.32fr)_minmax(0,1fr)] max-[980px]:[grid-template-columns:minmax(0,1fr)]">
      {children}
    </Shell>
  );
}

// Tipografia de texto corrido. É o único lugar da LP onde faz sentido concentrar
// dezenas de variantes descendentes num componente: o conteúdo é prosa jurídica
// escrita em JSX solto, e anotar classe em cada <p> de 600 linhas seria pior.
//
// Dois detalhes que já causaram bug e estão preservados:
//  • o marcador da lista é `::before` absoluto, não `flex` — como item de flex,
//    um <strong> no começo da linha virava coluna de duas palavras;
//  • `overflow-wrap: anywhere` no <code> — sem isso um host longo esticava a
//    página inteira e criava rolagem horizontal no celular.
const BODY =
  "max-w-[72ch] max-[760px]:max-w-none " +
  "[&_section]:pt-[clamp(30px,3.5vw,46px)] " +
  "[&_section+section]:mt-[clamp(26px,3vw,38px)] [&_section+section]:border-t-2 [&_section+section]:border-paper-line " +
  "[&_h2]:flex [&_h2]:items-baseline [&_h2]:gap-3 [&_h2]:scroll-mt-24 [&_h2]:text-[clamp(1.5rem,2.4vw,2rem)] [&_h2]:leading-[1.1] " +
  "[&_h2>b]:font-display [&_h2>b]:text-[0.78em] [&_h2>b]:font-extrabold [&_h2>b]:text-brass-ink [&_h2>b]:opacity-50 " +
  "[&_h3]:mt-6.5 [&_h3]:text-[1.12rem] [&_h3]:leading-[1.25] " +
  "[&_p]:mt-3.5 [&_p]:text-base [&_p]:leading-[1.72] [&_p]:font-medium [&_p]:text-ink-muted " +
  "[&_strong]:font-[750] [&_strong]:text-ink " +
  "[&_ul]:m-0 [&_ul]:mt-4 [&_ul]:flex [&_ul]:list-none [&_ul]:flex-col [&_ul]:gap-2.5 [&_ul]:p-0 " +
  "[&_ul_li]:relative [&_ul_li]:pl-[21px] [&_ul_li]:text-[0.98rem] [&_ul_li]:leading-[1.6] [&_ul_li]:font-medium [&_ul_li]:text-ink-muted " +
  "[&_ul_li]:before:absolute [&_ul_li]:before:top-[9px] [&_ul_li]:before:left-0 [&_ul_li]:before:h-[9px] [&_ul_li]:before:w-[9px] [&_ul_li]:before:bg-brass [&_ul_li]:before:content-[''] " +
  "[&_code]:font-mono [&_code]:text-[0.9em] [&_code]:[overflow-wrap:anywhere] " +
  "[&_a:not(.pair)]:font-bold [&_a:not(.pair)]:text-tomate-ink [&_a:not(.pair)]:underline [&_a:not(.pair)]:decoration-2 [&_a:not(.pair)]:underline-offset-[3px]";

export function LegalBody({ children }: { children: React.ReactNode }) {
  return <div className={BODY}>{children}</div>;
}

// A tabela rola sozinha em vez de esticar a página; o `code` dentro dela NÃO
// quebra no meio da palavra (ao contrário do resto do corpo), porque ali são
// nomes de host que só fazem sentido inteiros.
export function LegalTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 overflow-x-auto [&_code]:font-mono [&_code]:text-[0.82rem] [&_code]:whitespace-nowrap [&_code]:[overflow-wrap:normal] [&_table]:w-full [&_table]:border-collapse [&_table]:text-[0.9rem] [&_td]:border-b-2 [&_td]:border-paper-line [&_td]:px-[13px] [&_td]:py-[11px] [&_td]:text-left [&_td]:align-top [&_td]:leading-[1.55] [&_td]:font-medium [&_td]:text-ink-muted [&_th]:border-b-[3px] [&_th]:border-paper-line [&_th]:px-[13px] [&_th]:py-[11px] [&_th]:text-left [&_th]:align-top [&_th]:text-[0.72rem] [&_th]:font-extrabold [&_th]:tracking-[0.08em] [&_th]:whitespace-nowrap [&_th]:text-ink [&_th]:uppercase [&_td:first-child]:min-w-[21ch] [&_th:first-child]:min-w-[21ch]">
      {children}
    </div>
  );
}

export function LegalSection({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>
        <b>{String(n).padStart(2, "0")}</b>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 flex items-start gap-3 border-l-4 border-brass bg-paper-sunk px-[18px] py-4 text-[0.94rem] leading-[1.6] font-[550] text-ink [&>svg]:mt-0.5 [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:shrink-0 [&>svg]:fill-current [&>svg]:text-tomate-ink">
      <InfoIcon />
      <span>{children}</span>
    </p>
  );
}

const PAIR_LINK =
  "inline-flex min-h-[30px] items-center rounded-sm bg-paper-sunk px-3 py-1.5 text-[0.8rem] font-bold text-ink hover:bg-brass";

export function LegalFoot({ other }: { other: "privacy" | "terms" }) {
  return (
    <>
      <div className="mt-[clamp(34px,4vw,52px)] flex flex-wrap items-center justify-between gap-[18px] border-t-[3px] border-ink pt-[clamp(24px,3vw,34px)]">
        {/* A seta da LP aponta pra frente; aqui ela volta, então é espelhada. */}
        <Link
          className="inline-flex min-h-[30px] items-center gap-[9px] font-display text-[0.95rem] font-extrabold text-ink [&>svg]:h-[19px] [&>svg]:w-[19px] [&>svg]:-scale-x-100 [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:transition-transform [&>svg]:[stroke-linecap:round] [&>svg]:[stroke-linejoin:round] [&>svg]:[stroke-width:2.4] hover:[&>svg]:-translate-x-1"
          href="/"
        >
          <ArrowIcon /> Voltar para a Corneta
        </Link>
        <div className="flex flex-wrap gap-2.5">
          {other === "terms" ? (
            <Link className={PAIR_LINK} href={LEGAL_ROUTES.terms}>
              Termos de uso
            </Link>
          ) : (
            <Link className={PAIR_LINK} href={LEGAL_ROUTES.privacy}>
              Política de privacidade
            </Link>
          )}
          <a
            className={PAIR_LINK}
            href="https://github.com/pitroldev"
            rel="noreferrer noopener"
            target="_blank"
          >
            Código-fonte
          </a>
        </div>
      </div>
      <p className="mt-4 text-[0.78rem] font-semibold text-ink-faint">
        {LEGAL_OPERATOR} · CNPJ {LEGAL_CNPJ} · {LEGAL_CONTACT}
      </p>
    </>
  );
}
