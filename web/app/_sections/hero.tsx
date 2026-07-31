import type { T, Locale } from "@/lib/i18n";
import { LocaleSwitch } from "../_components/locale-switch";
import { CheckIcon, DownloadIcon, WindowsIcon } from "../_components/icons";
import { Mascot, SoundWaves } from "../_components/decor";
import { BrandMark } from "../_components/brand-mark";
import { ProductPreview } from "../_components/product-preview";
import {
  cn,
  downloadButton,
  heroWaves,
  Shell,
  Slab,
  Sticker,
} from "../_components/ui";

// Topo da LP: pular-pro-conteúdo, cabeçalho fixo, herói e a faixa do mecanismo.
// Separado do page.tsx porque ele passava de 900 linhas — cada seção agora é um
// arquivo que cabe na cabeça.

// Placeholder: substitua pela URL real do instalador ou da release.
const downloadUrl = process.env.NEXT_PUBLIC_PRIMARY_CTA_URL ?? "#baixar";

export function DownloadButton({
  t,
  compact = false,
  label,
}: {
  t: T;
  compact?: boolean;
  label?: string;
}) {
  return (
    <a
      className={cn(
        downloadButton,
        compact &&
          "min-h-11 gap-[9px] rounded-sm px-[15px] text-[0.92rem] shadow-pop-brass active:shadow-none max-[420px]:min-h-[42px] max-[420px]:px-[11px] max-[420px]:text-[0.82rem] [&>svg]:h-[18px] [&>svg]:w-[18px]",
      )}
      href={downloadUrl}
      data-placeholder-link="replace-me"
      aria-label={t("hero.download.aria")}
    >
      <WindowsIcon />
      <span>
        {label ??
          (compact ? t("hero.download.compact") : t("hero.download.full"))}
      </span>
      {!compact && <DownloadIcon />}
    </a>
  );
}

/** Só aparece no foco do teclado — o primeiro tab da página. */
export function SkipLink({ t }: { t: T }) {
  return (
    <a
      className="fixed top-3 left-3 z-100 -translate-y-[180%] rounded-md bg-brass px-[18px] py-[13px] font-display text-[0.88rem] font-extrabold text-brass-ink shadow-pop-brass transition-transform duration-140 focus:translate-y-0"
      href="#conteudo"
    >
      {t("hero.skiplink.label")}
    </a>
  );
}

// O sublinhado cresce da esquerda no hover e recolhe pela direita ao sair — o
// `transform-origin` inverte entre os dois estados, que é o truque que faz o
// traço parecer "voltar" em vez de piscar.
const NAV_LINK =
  "relative py-2 hover:text-cream " +
  "after:absolute after:inset-x-0 after:bottom-0.5 after:h-[3px] after:origin-right after:scale-x-0 after:bg-brass after:transition-transform after:duration-140 after:content-[''] " +
  "hover:after:origin-left hover:after:scale-x-100";

export function SiteHeader({ t, locale }: { t: T; locale: Locale }) {
  return (
    <header className="sticky top-0 z-60 border-b border-border-soft bg-night/95 backdrop-blur-[8px]">
      <Shell className="flex min-h-17 items-center justify-between gap-7">
        <a
          className="shrink-0"
          href="#topo"
          aria-label={t("hero.header.brand.aria")}
        >
          <BrandMark />
        </a>

        <nav
          className="ml-auto flex items-center gap-6.5 text-[0.88rem] font-[650] text-muted max-[980px]:hidden"
          aria-label={t("hero.nav.aria")}
        >
          <a className={NAV_LINK} href="#por-que">
            {t("hero.nav.why")}
          </a>
          <a className={NAV_LINK} href="#qualidade">
            {t("hero.nav.quality")}
          </a>
          <a className={NAV_LINK} href="#chat">
            {t("hero.nav.chat")}
          </a>
          <a className={NAV_LINK} href="#protecao">
            {t("hero.nav.protection")}
          </a>
          <a className={NAV_LINK} href="#plataformas">
            {t("hero.nav.platforms")}
          </a>
          <a className={NAV_LINK} href="#duvidas">
            {t("hero.nav.faq")}
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <LocaleSwitch current={locale} />
          <DownloadButton t={t} compact label={t("hero.header.download")} />
        </div>
      </Shell>
    </header>
  );
}

const TRUST =
  "inline-flex items-center gap-[7px] rounded-sm bg-surface-2 px-[11px] py-[7px] text-[0.78rem] font-bold shadow-pop-sm " +
  "max-[760px]:text-[0.74rem] [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:stroke-ok [&>svg]:[stroke-linecap:round] [&>svg]:[stroke-linejoin:round] [&>svg]:[stroke-width:3]";

export function Hero({ t }: { t: T }) {
  return (
    <section
      id="topo"
      className="relative isolate overflow-hidden pt-[clamp(46px,5.5vw,78px)] max-[760px]:pt-[34px]"
    >
      <SoundWaves className={heroWaves} />

      <Shell>
        <div className="mb-[clamp(38px,4vw,54px)] grid items-end gap-[clamp(28px,3.5vw,56px)] [grid-template-columns:minmax(0,1.26fr)_minmax(270px,0.74fr)] max-[980px]:grid-cols-1 [&>*]:min-w-0">
          <div>
            <Sticker className="animate-[copy-in_500ms_cubic-bezier(0.16,1,0.3,1)_both] mb-6.5">
              <Mascot />
              {t("hero.sticker")}
            </Sticker>
            <h1 className="animate-[copy-in_620ms_70ms_cubic-bezier(0.16,1,0.3,1)_both] text-[clamp(2.95rem,4.9vw,4.45rem)] leading-[0.95] tracking-[-0.035em] max-[760px]:text-[clamp(2.55rem,11.4vw,3.4rem)] max-[420px]:text-[clamp(2.35rem,11vw,3rem)] [&>span]:block">
              {/* As duas primeiras linhas ficam: são o que a pessoa procura e
                  o que ela reconhece. A terceira é a que muda o argumento —
                  mandar pra vários lugares tem plugin grátis dentro do OBS; o
                  que ninguém mais faz é cuidar da live inteira e te contar
                  depois o que aconteceu. "Tudo no seu controle" era promessa
                  que todo concorrente também faz. */}
              <span>{t("hero.title.line1")}</span>
              <span>
                <Slab>{t("hero.title.line2")}</Slab>
              </span>
              <span>{t("hero.title.line3")}</span>
            </h1>
          </div>

          <div className="animate-[copy-in_620ms_150ms_cubic-bezier(0.16,1,0.3,1)_both] pb-1.5">
            {/* Dois tempos de propósito: o primeiro explica o mecanismo (sem
                ele ninguém entende o produto), o segundo é o diferencial. O
                texto antigo parava no mecanismo — que é justamente a parte
                que a concorrência também entrega. */}
            {/* O `<strong>` no nome saiu: em inglês a frase quebra em outro
                ponto, e marcação no meio de texto traduzido é o que obriga a
                fatiar a frase em pedaços que não sobrevivem à tradução. */}
            <p className="max-w-[46ch] text-[clamp(1.04rem,1.5vw,1.2rem)] leading-[1.62] font-medium text-muted">
              {t("hero.pitch")}
            </p>
            <div
              className="mt-6.5 flex flex-wrap gap-2.5"
              aria-label={t("hero.trust.aria")}
            >
              <span className={TRUST}>
                <CheckIcon /> {t("hero.trust.free")}
              </span>
              <span className={TRUST}>
                <CheckIcon /> {t("hero.trust.watermark")}
              </span>
              <span className={TRUST}>
                <CheckIcon /> {t("hero.trust.opensource")}
              </span>
            </div>
          </div>
        </div>

        <div className="relative z-2 animate-[stage-in_720ms_210ms_cubic-bezier(0.16,1,0.3,1)_both]">
          <ProductPreview t={t} />
        </div>

        <div className="mt-[clamp(30px,3.5vw,44px)] flex flex-col items-center gap-3.5 pb-[clamp(46px,5vw,70px)] text-center max-[760px]:mt-[34px] [&_a]:min-h-[70px] [&_a]:w-[min(440px,100%)] [&_a]:text-[1.24rem] max-[760px]:[&_a]:min-h-[62px] max-[760px]:[&_a]:w-full max-[760px]:[&_a]:text-[1.06rem] [&>p]:text-[0.84rem] [&>p]:font-semibold [&>p]:text-faint">
          <DownloadButton t={t} />
          <p>{t("hero.cta.footnote")}</p>
        </div>
      </Shell>
    </section>
  );
}

// A seta entre as etapas é feita com borda girada: dois lados de um quadrado a
// 45° viram a ponta, sem imagem nem SVG.
const ARROW =
  "relative h-[3px] w-[30px] bg-brass-ink " +
  "after:absolute after:-top-1 after:right-0 after:h-[9px] after:w-[9px] after:rotate-45 after:border-t-[3px] after:border-r-[3px] after:border-brass-ink after:content-['']";

export function MechanismStrip({ t }: { t: T }) {
  return (
    <section
      className="border-y-[3px] border-brass-ink bg-brass text-brass-ink"
      aria-label={t("hero.mechanism.aria")}
    >
      <Shell className="grid min-h-28 items-center gap-5.5 [grid-template-columns:1fr_30px_1.5fr_30px_1.15fr] max-[980px]:grid-cols-1 max-[980px]:gap-0 max-[980px]:py-4 max-[980px]:[&>div]:py-[11px] [&>div]:flex [&>div]:flex-col [&>div]:gap-[3px] [&_strong]:font-display [&_strong]:text-[1.3rem] [&_strong]:leading-none [&_strong]:font-extrabold [&_span]:text-[0.83rem] [&_span]:font-semibold max-[980px]:[&>i]:hidden">
        <div>
          <strong>{t("hero.mechanism.step1.title")}</strong>
          <span>{t("hero.mechanism.step1.detail")}</span>
        </div>
        <i className={ARROW} aria-hidden="true" />
        <div>
          <strong>{t("hero.mechanism.step2.title")}</strong>
          <span>{t("hero.mechanism.step2.detail")}</span>
        </div>
        <i className={ARROW} aria-hidden="true" />
        <div>
          <strong>{t("hero.mechanism.step3.title")}</strong>
          <span>{t("hero.mechanism.step3.detail")}</span>
        </div>
      </Shell>
    </section>
  );
}
