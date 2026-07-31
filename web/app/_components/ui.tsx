import type { ReactNode } from "react";

// Primitivas compartilhadas da LP, em utilitário do Tailwind.
//
// Existem porque `.shell`, `.sticker`, `.download-button` e `.slab` eram usadas
// pela home E pela 404 E pelas páginas legais. Sem um componente no meio, migrar
// significaria repetir a mesma sopa de utilitários em cada lugar — que é a
// crítica justa que se faz ao Tailwind, e é evitável.
//
// Mesmo vocabulário do app: bloco sólido, canto seco, sombra dura sem blur.

/** Junta classes ignorando vazios. O site não tem clsx e não precisa. */
export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** Caixa central de toda seção — a largura de leitura da LP. */
export function Shell({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "header" | "footer" | "main";
}) {
  return (
    <Tag
      className={cn(
        "mx-auto w-[min(calc(100%-3rem),1220px)] max-[980px]:w-[min(calc(100%-2.5rem),780px)] max-[760px]:w-[min(calc(100%-2rem),560px)]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/**
 * Faixa de conteúdo. `tone` decide o fundo e a cor da tinta — papel claro com
 * meio-tom escuro, ou palco escuro com meio-tom de latão.
 *
 * O `tone` também vale pros filhos: substitui os seletores `.section-dark p`
 * que tingiam texto de longe.
 */
export function Section({
  children,
  tone = "dark",
  className,
  id,
}: {
  children: ReactNode;
  tone?: "paper" | "paper-raised" | "dark";
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "bg-[length:20px_20px] py-[clamp(78px,8vw,122px)]",
        tone === "dark"
          ? "bg-breu bg-[image:var(--halftone-dark)]"
          : cn(
              "text-ink bg-[image:var(--halftone-light)]",
              tone === "paper-raised" ? "bg-paper-raised" : "bg-paper",
            ),
        className,
      )}
    >
      {children}
    </section>
  );
}

/**
 * Título de seção.
 *
 * A largura NÃO é em `ch`: 42ch num container de fonte de corpo dá ~375px e
 * espremia o título de exibição numa tira. Por isso vai em pixel.
 *
 * `tight` desce um degrau na escala — usado onde o título divide a linha com
 * uma coluna de conteúdo e uma tira de 6 linhas ficaria feia.
 */
export function SectionHeading({
  kicker,
  title,
  children,
  tone = "dark",
  centered = false,
  tight = false,
  className,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  tone?: "paper" | "dark";
  centered?: boolean;
  tight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        centered ? "mx-auto max-w-[780px] text-center" : "max-w-[660px]",
        className,
      )}
    >
      {kicker && (
        <span
          className={cn(
            "mb-5 inline-flex items-center gap-2.5 text-[0.78rem] font-extrabold tracking-[0.1em] uppercase",
            "before:h-1 before:w-[26px] before:bg-brass before:content-['']",
            tone === "dark" ? "text-brass" : "text-tomate-ink",
          )}
        >
          {kicker}
        </span>
      )}
      <h2
        className={cn(
          "leading-[0.98] tracking-[-0.03em]",
          tight
            ? "text-[clamp(2.1rem,3.2vw,3.05rem)]"
            : "text-[clamp(2.35rem,4.2vw,3.9rem)] max-[760px]:text-[clamp(2.1rem,10.5vw,3rem)]",
        )}
      >
        {title}
      </h2>
      {children && (
        <div
          className={cn(
            "[&>p]:mt-[22px] [&>p]:max-w-[62ch] [&>p]:text-[1.05rem] [&>p]:leading-[1.68] [&>p]:font-medium",
            centered && "[&>p]:mx-auto",
            tone === "dark" ? "[&>p]:text-muted" : "[&>p]:text-ink-muted",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Grade de duas colunas — texto de um lado, demonstração do outro.
 *
 * Todas as seções da LP usam a mesma ideia com proporções diferentes, e todas
 * colapsam pra uma coluna no mesmo ponto. Concentrar aqui evita repetir o
 * breakpoint em sete lugares e esquecer um.
 */
export function TwoCol({
  children,
  cols,
  align = "center",
  className,
}: {
  children: ReactNode;
  cols: string;
  align?: "center" | "start" | "stretch";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid max-[980px]:grid-cols-1",
        align === "start"
          ? "items-start"
          : align === "stretch"
            ? "items-stretch"
            : "items-center",
        className,
      )}
      style={{ gridTemplateColumns: cols }}
    >
      {children}
    </div>
  );
}

/** Painel escuro que pousa sobre seção de PAPEL. A tinta clara é declarada
 *  aqui: sem ela o conteúdo herda a tinta escura da seção e some no fundo. */
export function DemoPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-lg bg-surface bg-[image:var(--halftone-dark)] bg-[length:18px_18px] p-5 text-cream shadow-pop-ink-lg",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Linha de benefício: cópia + demonstração. `brass` vira bloco de latão. */
export function BenefitRow({
  children,
  brass = false,
}: {
  children: ReactNode;
  brass?: boolean;
}) {
  return (
    <article
      className={cn(
        "grid items-center gap-[clamp(34px,5vw,74px)] [grid-template-columns:minmax(0,1fr)_minmax(330px,0.88fr)] max-[980px]:grid-cols-1",
        brass &&
          "rounded-xl bg-brass p-[clamp(30px,4vw,46px)] shadow-pop-ink-lg",
      )}
    >
      {children}
    </article>
  );
}

/** Nota de prova sob um bloco — filete no topo, ícone de latão, link sublinhado. */
export function Proof({ children }: { children: ReactNode }) {
  return (
    <p className="mt-6.5 flex items-start gap-[11px] border-t-2 border-border-dry pt-5.5 text-[0.88rem] leading-[1.55] font-[550] text-muted [&>svg]:mt-px [&>svg]:h-[19px] [&>svg]:w-[19px] [&>svg]:shrink-0 [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:text-brass [&>svg]:[stroke-linecap:round] [&>svg]:[stroke-linejoin:round] [&>svg]:[stroke-width:2.2] [&_a]:font-extrabold [&_a]:whitespace-nowrap [&_a]:text-brass [&_a]:underline [&_a]:decoration-2 [&_a]:underline-offset-[3px]">
      {children}
    </p>
  );
}

/** Número em destaque com filete de latão no topo. Também pousa em papel. */
export function StatPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-t-[3px] border-brass bg-surface-2 px-[18px] py-4 text-cream shadow-pop",
        "[&>span]:block [&>span]:text-[0.66rem] [&>span]:font-extrabold [&>span]:tracking-[0.1em] [&>span]:text-faint-raised [&>span]:uppercase",
        "[&>strong]:mt-1 [&>strong]:block [&>strong]:font-display [&>strong]:text-[1.6rem] [&>strong]:leading-[1.05] [&>strong]:font-extrabold [&>strong]:tabular-nums",
        "[&>small]:mt-[3px] [&>small]:block [&>small]:text-[0.76rem] [&>small]:font-semibold [&>small]:text-muted",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Bloco torto de latão com uma admissão honesta — o contraponto da seção. */
export function HonestNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex rotate-[-1.2deg] flex-col justify-center rounded-xl bg-brass p-[clamp(26px,3.5vw,42px)] text-brass-ink shadow-[8px_8px_0_0_var(--night)] max-[980px]:rotate-0 [&>span]:mb-3.5 [&>span]:inline-flex [&>span]:items-center [&>span]:gap-2 [&>span]:text-[0.72rem] [&>span]:font-extrabold [&>span]:tracking-[0.1em] [&>span]:uppercase [&>span>svg]:h-4 [&>span>svg]:w-4 [&>span>svg]:fill-current [&_h3]:text-[clamp(1.75rem,2.8vw,2.5rem)] [&_h3]:leading-none [&_p]:mt-[18px] [&_p]:leading-[1.62] [&_p]:font-[550]">
      {children}
    </div>
  );
}

/** Etiqueta torta de latão (ou tomate) — o selo de gibi da identidade. */
export function Sticker({
  children,
  tone = "brass",
  className,
}: {
  children: ReactNode;
  tone?: "brass" | "tomate";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-sm px-3 py-[7px]",
        "text-[0.72rem] font-extrabold tracking-[0.1em] text-brass-ink uppercase",
        "[&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:shrink-0",
        tone === "tomate"
          ? "rotate-[1.8deg] bg-tomate shadow-pop"
          : "rotate-[-2.2deg] bg-brass shadow-pop-brass",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Botão-âncora de download/ação. O `active` afunda a sombra: o gesto de apertar
 *  um adesivo, igual ao do app. */
export const downloadButton = cn(
  "inline-flex min-h-16 items-center justify-center gap-[13px] px-[26px]",
  "max-[420px]:min-h-[58px] max-[420px]:px-4 max-[420px]:text-base",
  "rounded-md bg-tomate text-brass-ink shadow-pop-cream",
  "font-display text-[1.14rem] leading-none font-extrabold",
  "transition-[background-color,transform,box-shadow] duration-90 ease-out",
  "hover:bg-tomate-strong active:translate-x-1 active:translate-y-1 active:shadow-none",
  "[&>svg]:h-[23px] [&>svg]:w-[23px] [&>svg]:shrink-0 [&>svg]:fill-current",
  "[&>svg:last-child]:fill-none [&>svg:last-child]:stroke-current [&>svg:last-child]:[stroke-width:2.4] [&>svg:last-child]:[stroke-linecap:round] [&>svg:last-child]:[stroke-linejoin:round]",
);

/** Palavra em laje de latão com sombra de tomate — o destaque dos títulos. */
export function Slab({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <em
      className={cn(
        "mt-[0.1em] mb-[0.16em] inline-block px-[0.2em] pt-[0.04em] pb-[0.1em]",
        "-rotate-[1.4deg] bg-brass text-[0.94em] whitespace-nowrap text-brass-ink not-italic max-[760px]:text-[0.82em]",
        "shadow-[7px_7px_0_0_var(--tomate)] max-[760px]:shadow-[5px_5px_0_0_var(--tomate)]",
        className,
      )}
    >
      {children}
    </em>
  );
}

/** Ondas decorativas do herói: sangram pra fora, atrás de tudo. */
export const heroWaves =
  "pointer-events-none absolute -top-[90px] -right-[150px] -z-10 w-[620px] text-brass opacity-20 max-[760px]:-top-10 max-[760px]:-right-60 max-[760px]:w-[480px]";

/** Pastilha de rótulo. `quiet` é a versão apagada, pra listas longas. */
export function Chip({
  children,
  tone = "brass",
  quiet = false,
  className,
}: {
  children: ReactNode;
  tone?: "brass" | "ok" | "warn";
  quiet?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-1",
        "text-[0.68rem] font-extrabold tracking-[0.04em] uppercase",
        "[&>svg]:h-[13px] [&>svg]:w-[13px]",
        quiet
          ? "bg-surface-3 text-muted"
          : tone === "ok"
            ? "bg-ok text-night"
            : tone === "warn"
              ? "bg-warn text-night"
              : "bg-brass text-brass-ink",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Estado de um destino: bolinha + palavra. A cor diz tudo. */
export function State({
  children,
  tone = "ok",
}: {
  children: ReactNode;
  tone?: "ok" | "warn" | "quiet";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[0.66rem] font-extrabold tracking-[0.04em] uppercase",
        "[&>i]:h-[7px] [&>i]:w-[7px] [&>i]:rounded-full [&>i]:bg-current",
        tone === "warn"
          ? "text-warn"
          : tone === "quiet"
            ? "text-faint-raised"
            : "text-ok",
      )}
    >
      {children}
    </span>
  );
}

/** Nota de rodapé dos painéis de demonstração, com o ícone alinhado ao topo. */
export function HubNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3.5 flex items-start gap-[9px] text-[0.8rem] leading-[1.5] font-[550] text-muted [&>svg]:mt-px [&>svg]:h-[17px] [&>svg]:w-[17px] [&>svg]:shrink-0 [&>svg]:fill-current [&>svg]:text-brass">
      {children}
    </p>
  );
}

/** Painel escuro elevado das demonstrações (chat, alertas, cena do OBS). */
export function Board({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("rounded-xl bg-panel p-[18px] shadow-pop-lg", className)}
    >
      {children}
    </div>
  );
}

/** Rótulo de canto dos painéis de demonstração ("exemplo", "estimativa do app"). */
export function DemoLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-[15px] flex items-center justify-between gap-2.5 text-[0.64rem] font-extrabold tracking-[0.12em] text-faint-raised uppercase">
      {children}
    </div>
  );
}

/** Lista com visto verde. `row` espalha na horizontal (usado no bloco "local"). */
export function Checklist({
  children,
  row = false,
  className,
}: {
  children: ReactNode;
  row?: boolean;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "mt-[18px] flex list-none p-0",
        row
          ? "flex-row flex-wrap gap-x-5 gap-y-2.5 max-[760px]:flex-col"
          : "flex-col gap-2",
        "[&>li]:flex [&>li]:items-center [&>li]:gap-[9px] [&>li]:text-[0.84rem] [&>li]:font-[650]",
        "[&_svg]:h-[17px] [&_svg]:w-[17px] [&_svg]:shrink-0 [&_svg]:stroke-ok [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round] [&_svg]:[stroke-width:3]",
        className,
      )}
    >
      {children}
    </ul>
  );
}

/** Etiqueta pequena de estado numa linha de destino. */
export function Tag({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: "copy" | "warn";
}) {
  return (
    <span
      className={cn(
        "rounded-sm px-2 py-1 text-[0.6rem] font-extrabold tracking-[0.06em] whitespace-nowrap uppercase",
        tone === "copy"
          ? "bg-surface-3 text-muted"
          : tone === "warn"
            ? "bg-warn text-night"
            : "bg-brass text-brass-ink",
      )}
    >
      {children}
    </span>
  );
}

/**
 * Bloco "ícone + título + texto" que abre cada benefício.
 *
 * O `tone` substitui os seletores de contexto que existiam (`.section-dark
 * .benefit-copy p`, `.benefit-row-brass .benefit-icon`): a aparência passa a ser
 * dita por quem usa, em vez de depender de qual ancestral envolve o bloco — que
 * era frágil e invisível na hora de ler o componente.
 */
export function BenefitCopy({
  icon,
  title,
  children,
  tone = "paper",
  className,
}: {
  icon: ReactNode;
  title: ReactNode;
  children: ReactNode;
  tone?: "paper" | "dark" | "brass";
  className?: string;
}) {
  const chip =
    tone === "brass"
      ? "bg-brass-ink text-brass"
      : tone === "dark"
        ? "bg-brass text-brass-ink shadow-pop-ink"
        : "bg-ink text-cream shadow-pop-ink";
  const body =
    tone === "brass"
      ? "[&_p]:text-brass-ink [&_p]:font-[550]"
      : tone === "dark"
        ? "[&_p]:text-muted"
        : "[&_p]:text-ink-muted";
  const note =
    tone === "brass"
      ? "[&_.note]:text-brass-ink"
      : tone === "dark"
        ? "[&_.note]:text-muted"
        : "[&_.note]:text-ink-faint";

  return (
    <div
      className={cn(
        "flex items-start gap-5 max-[760px]:flex-col max-[760px]:gap-4",
        "[&_p]:mt-4 [&_p]:max-w-[56ch] [&_p]:text-base [&_p]:leading-[1.68] [&_p]:font-medium",
        body,
        note,
        className,
      )}
    >
      <span
        className={cn(
          "grid size-[54px] shrink-0 -rotate-3 place-items-center rounded-lg",
          "[&>svg]:h-7 [&>svg]:w-7 [&>svg]:stroke-current [&>svg]:[stroke-linecap:round] [&>svg]:[stroke-linejoin:round] [&>svg]:[stroke-width:2.2]",
          chip,
        )}
      >
        {icon}
      </span>
      <div>
        <h3 className="max-w-[22ch] text-[clamp(1.7rem,2.7vw,2.5rem)] tracking-[-0.025em]">
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}

/** Observação de rodapé de um benefício. A classe `note` é o gancho que o
 *  `BenefitCopy` usa pra tingir conforme o tom da seção. */
export function BenefitNote({ children }: { children: ReactNode }) {
  return (
    <span className="note mt-4 flex items-start gap-2 text-[0.78rem] leading-[1.45] font-bold [&>svg]:mt-px [&>svg]:h-[17px] [&>svg]:w-[17px] [&>svg]:shrink-0">
      {children}
    </span>
  );
}
