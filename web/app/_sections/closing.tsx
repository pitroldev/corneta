import { localePath, type Locale, type T } from "@/lib/i18n";
import Image from "next/image";
import Link from "next/link";
import { faqsFor } from "@/lib/content";
import { DOWNLOAD_PATH } from "@/lib/download";
import { LEGAL_CNPJ, LEGAL_OPERATOR, legalHref } from "@/lib/legal";
import { BrandMark } from "../_components/brand-mark";
import { Mascot, SoundWaves } from "../_components/decor";
import { ArrowIcon, PlayIcon, WindowsIcon } from "../_components/icons";
import { lpMedia } from "@/lib/lp-media";
import {
  cn,
  downloadButton,
  Section,
  SectionHeading,
  Shell,
  TwoCol,
} from "../_components/ui";
import { DownloadButton } from "./hero";

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
  "[&_summary>span]:flex-1 [&_summary>span]:pl-10 [&_summary>span]:-indent-10 [&_summary:hover>span]:text-tomato-ink " +
  "[&_summary_b]:inline-block [&_summary_b]:w-10 [&_summary_b]:indent-0 [&_summary_b]:font-sans [&_summary_b]:text-[0.78rem] [&_summary_b]:font-bold [&_summary_b]:text-ink-faint [&_summary_b]:tabular-nums " +
  "[&_details>p]:mt-[-2px] [&_details>p]:mb-6 [&_details>p]:ml-10 [&_details>p]:max-w-[62ch] [&_details>p]:pr-11 max-[760px]:[&_details>p]:ml-0 max-[760px]:[&_details>p]:pr-0 [&_details>p]:leading-[1.68] [&_details>p]:font-medium [&_details>p]:text-ink-muted";

const MORE_LINK =
  "group flex min-h-14 items-center justify-between gap-3 rounded-lg border-2 border-ink bg-paper px-4 py-3 font-display text-[1.05rem] font-extrabold text-ink shadow-[4px_4px_0_0_var(--ink)] transition-transform duration-150 hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-tomato [&>svg]:size-5 [&>svg]:transition-transform group-hover:[&>svg]:translate-x-1";

export function Faq({ t, locale }: { t: T; locale: Locale }) {
  return (
    <Section
      id="duvidas"
      tone="paper-raised"
      className="border-t-[3px] border-ink"
    >
      <Shell>
        <TwoCol
          align="start"
          cols="minmax(0,0.78fr) minmax(440px,1.22fr)"
          className="gap-[clamp(44px,7vw,100px)]"
        >
          {/* Below 980px the wrapper dissolves so the help links can follow the questions. */}
          <div className="sticky top-28 max-[980px]:contents">
            <SectionHeading
              tight
              tone="paper"
              kicker={t("closing.faq.kicker")}
              title={t("closing.faq.title")}
              className="max-[980px]:order-1"
            >
              <p>{t("closing.faq.subtitle")}</p>
              <a
                className={cn(
                  downloadButton,
                  "mt-7 min-h-11 gap-[9px] rounded-sm px-[15px] text-[0.92rem] shadow-[4px_4px_0_0_var(--ink)] [&>svg]:h-[18px] [&>svg]:w-[18px]",
                )}
                href={DOWNLOAD_PATH}
                data-telemetry-cta="faq_download"
              >
                <WindowsIcon />
                <span>{t("closing.faq.cta")}</span>
              </a>
            </SectionHeading>
            <nav
              aria-label={t("closing.faq.more")}
              className="mt-10 border-t-2 border-paper-line pt-6 max-[980px]:order-3 max-[980px]:mt-0"
            >
              <p className="text-[0.9rem] font-bold text-ink">
                {t("closing.faq.more")}
              </p>
              <ul
                className="mt-3 flex max-w-[360px] flex-col gap-3"
                role="list"
              >
                <li>
                  <Link
                    className={MORE_LINK}
                    href={localePath(locale, "/guides")}
                    data-telemetry-cta="home_guides"
                  >
                    {t("knowledge.guides.action")} <ArrowIcon />
                  </Link>
                </li>
                <li>
                  <Link
                    className={MORE_LINK}
                    href={localePath(locale, "/help")}
                    data-telemetry-cta="home_help"
                  >
                    {t("knowledge.help.action")} <ArrowIcon />
                  </Link>
                </li>
              </ul>
            </nav>
          </div>

          <div className={cn(FAQ_LIST, "max-[980px]:order-2")}>
            {faqsFor(t).map((faq, i) => (
              <details key={faq.question}>
                <summary>
                  <span>
                    <b aria-hidden="true">{String(i + 1).padStart(2, "0")}</b>
                    {faq.question}
                  </span>
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

export function FinalCta({ t, locale }: { t: T; locale: Locale }) {
  const poster = lpMedia(locale).poster;
  return (
    <section
      id="download"
      className="relative isolate overflow-hidden bg-charcoal bg-[image:var(--halftone-dark)] bg-[length:20px_20px] py-[clamp(70px,8vw,110px)]"
    >
      <SoundWaves className="pointer-events-none absolute -right-[190px] -bottom-[220px] -z-10 w-[640px] text-brass opacity-14" />
      <Shell>
        <TwoCol
          cols="minmax(0,1.05fr) minmax(320px,0.95fr)"
          className="gap-[clamp(38px,5vw,66px)]"
        >
          <div className="flex flex-col items-start">
            <span
              className="mb-5.5 grid size-[62px] animate-[shout_2.4s_ease-in-out_infinite] -rotate-3 place-items-center rounded-lg bg-brass text-brass-ink shadow-pop [&>svg]:h-9 [&>svg]:w-9"
              aria-hidden="true"
            >
              <Mascot />
            </span>
            <h2 className="max-w-[18ch] text-[clamp(2.6rem,5vw,4.4rem)] leading-[0.95] tracking-[-0.03em] max-md:text-[clamp(2.3rem,11vw,3.2rem)]">
              {t("closing.cta.title")}
            </h2>
            <div className="mt-8 flex w-[min(420px,100%)] flex-col gap-3.5 [&>a]:w-full [&>p]:text-[0.8rem] [&>p]:font-[650] [&>p]:text-faint">
              <DownloadButton t={t} ctaId="final_download" />
              <p>{t("closing.cta.note")}</p>
            </div>
          </div>
          <a
            href="#video"
            data-video-seek="0"
            className="group relative block overflow-hidden rounded-xl border-[3px] border-cream shadow-[8px_8px_0_0_var(--brass)] focus-visible:outline-[4px] focus-visible:outline-offset-4 focus-visible:outline-brass"
          >
            <Image
              src={poster.src}
              width={poster.width}
              height={poster.height}
              alt=""
              sizes="(max-width: 980px) 92vw, 520px"
              className="h-auto w-full transition-transform duration-500 group-hover:scale-[1.02] motion-reduce:transition-none"
            />
            <span className="absolute inset-x-0 bottom-0 flex items-center gap-2.5 bg-night/85 px-4 py-3 font-display text-[1rem] font-extrabold text-cream [&>svg]:size-5 [&>svg]:fill-brass [&>svg]:stroke-brass">
              <PlayIcon />
              {t("closing.cta.replay")}
            </span>
          </a>
        </TwoCol>
      </Shell>
    </section>
  );
}

const FOOTER_LINK =
  "inline-flex min-h-9 items-center rounded-sm text-[0.84rem] font-[650] text-muted underline-offset-4 transition-colors duration-120 " +
  "hover:text-brass hover:underline focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-brass [@media(pointer:coarse)]:min-h-11";

const FOOTER_GROUP_TITLE =
  "mb-3 font-display text-[0.92rem] font-extrabold text-cream";

export function SiteFooter({ t, locale }: { t: T; locale: Locale }) {
  return (
    <footer className="border-t-2 border-border-soft bg-panel">
      <Shell>
        <div className="grid grid-cols-[minmax(240px,0.9fr)_minmax(420px,1.1fr)] gap-x-[clamp(48px,8vw,112px)] gap-y-10 py-10 max-[760px]:grid-cols-1 max-[560px]:py-8">
          <div className="flex flex-col items-start gap-4">
            <BrandMark />
            <p className="max-w-[36ch] text-[0.84rem] leading-[1.6] font-[550] text-faint-raised">
              {t("closing.footer.tagline")}
            </p>
          </div>

          <nav
            className="grid grid-cols-3 gap-x-8 gap-y-8 max-[560px]:grid-cols-2"
            aria-label={t("closing.footer.nav.ariaLabel")}
          >
            <div>
              <h2 className={FOOTER_GROUP_TITLE}>
                {t("closing.footer.group.product")}
              </h2>
              <ul className="flex flex-col items-start gap-1" role="list">
                <li>
                  <a
                    className={FOOTER_LINK}
                    href={DOWNLOAD_PATH}
                    data-telemetry-cta="footer_download"
                  >
                    {t("closing.footer.download")}
                  </a>
                </li>
                <li>
                  <a
                    className={FOOTER_LINK}
                    href="https://github.com/pitroldev/corneta"
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {t("closing.footer.link.source")}
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h2 className={FOOTER_GROUP_TITLE}>
                {t("closing.footer.group.content")}
              </h2>
              <ul className="flex flex-col items-start gap-1" role="list">
                <li>
                  <Link
                    className={FOOTER_LINK}
                    href={localePath(locale, "/guides")}
                    data-telemetry-cta="footer_guides"
                  >
                    {t("closing.footer.link.guides")}
                  </Link>
                </li>
                <li>
                  <Link
                    className={FOOTER_LINK}
                    href={localePath(locale, "/help")}
                    data-telemetry-cta="footer_help"
                  >
                    {t("closing.footer.link.help")}
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h2 className={FOOTER_GROUP_TITLE}>
                {t("closing.footer.group.legal")}
              </h2>
              <ul className="flex flex-col items-start gap-1" role="list">
                <li>
                  <Link
                    className={FOOTER_LINK}
                    href={legalHref(locale, "privacy")}
                  >
                    {t("closing.footer.link.privacy")}
                  </Link>
                </li>
                <li>
                  <Link
                    className={FOOTER_LINK}
                    href={legalHref(locale, "terms")}
                  >
                    {t("closing.footer.link.terms")}
                  </Link>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="border-t border-border-soft py-4 text-[0.75rem] leading-relaxed font-[550] text-faint-raised">
          {LEGAL_OPERATOR} · CNPJ {LEGAL_CNPJ}
        </div>
      </Shell>
    </footer>
  );
}
