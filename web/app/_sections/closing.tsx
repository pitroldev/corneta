import { localePath, type Locale, type T } from "@/lib/i18n";
import Link from "next/link";
import { faqsFor } from "@/lib/content";
import { LEGAL_CNPJ, LEGAL_OPERATOR, legalHref } from "@/lib/legal";
import { BrandMark } from "../_components/brand-mark";
import { Mascot, SoundWaves } from "../_components/decor";
import { WindowsIcon } from "../_components/icons";
import {
  cn,
  downloadButton,
  Section,
  SectionHeading,
  Shell,
  TwoCol,
} from "../_components/ui";
import { DownloadButton } from "./hero";

const TINY =
  "flex items-start gap-[13px] bg-charcoal px-5 py-4.5 " +
  "[&>i>svg]:h-[21px] [&>i>svg]:w-[21px] [&>i>svg]:fill-none [&>i>svg]:stroke-current [&>i>svg]:[stroke-linecap:round] [&>i>svg]:[stroke-linejoin:round] [&>i>svg]:[stroke-width:2.2] " +
  "[&_strong]:block [&_strong]:font-display [&_strong]:text-base [&_strong]:leading-[1.15] [&_strong]:font-bold " +
  "[&_p]:mt-[3px] [&_p]:text-[0.8rem] [&_p]:leading-[1.45] [&_p]:font-medium [&_p]:text-muted";

export function TinyThings({
  t,
  items,
}: {
  t: T;
  items: { icon: React.ReactNode; title: string; text: string }[];
}) {
  return (
    <Section>
      <Shell>
        <SectionHeading
          kicker={t("closing.tiny.kicker")}
          title={t("closing.tiny.title")}
        />

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

export function Faq({ t, downloadUrl }: { t: T; downloadUrl: string }) {
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
            kicker={t("closing.faq.kicker")}
            title={t("closing.faq.title")}
          >
            <p>{t("closing.faq.subtitle")}</p>
            <a
              className={cn(
                downloadButton,
                "mt-7 min-h-11 gap-[9px] rounded-sm px-[15px] text-[0.92rem] shadow-[4px_4px_0_0_var(--ink)] [&>svg]:h-[18px] [&>svg]:w-[18px]",
              )}
              href={downloadUrl}
              data-placeholder-link="replace-me"
              data-telemetry-cta="faq_download"
            >
              <WindowsIcon />
              <span>{t("closing.faq.cta")}</span>
            </a>
          </SectionHeading>

          <div className={FAQ_LIST}>
            {faqsFor(t).map((faq, index) => (
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

const TICKER_KEYS = [
  "closing.ticker.item1",
  "closing.ticker.item2",
  "closing.ticker.item3",
  "closing.ticker.item4",
] as const;

const TICKER_PASSES = 4;

// Each ticker copy must cover the viewport throughout the -50% translation cycle.
function TickerRow({ t }: { t: T }) {
  return (
    <span className="flex min-w-[100vw] justify-around">
      {Array.from({ length: TICKER_PASSES }, (_, pass) =>
        TICKER_KEYS.map((key) => (
          <span className={TICKER_ROW} key={`${pass}-${key}`}>
            <Mascot />
            {t(key)}
          </span>
        )),
      )}
    </span>
  );
}

export function Ticker({ t }: { t: T }) {
  return (
    <div
      className="overflow-hidden border-y-[3px] border-night bg-tomato text-brass-ink select-none"
      aria-hidden="true"
    >
      <div className="flex w-max animate-[marquee_52s_linear_infinite] items-center py-[11px] font-display text-[0.95rem] font-extrabold tracking-[0.06em] uppercase">
        <TickerRow t={t} />
        <TickerRow t={t} />
      </div>
    </div>
  );
}

export function FinalCta({ t }: { t: T }) {
  return (
    <section
      id="download"
      className="relative isolate overflow-hidden py-[clamp(70px,8vw,110px)]"
    >
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
              {t("closing.cta.title")}
            </h2>
          </div>
          <div className="flex flex-col items-start gap-4 [&>a]:w-[min(400px,100%)] [&>p]:text-[0.78rem] [&>p]:font-[650] [&>p]:text-faint">
            <DownloadButton t={t} ctaId="final_download" />
            <p>{t("closing.cta.note")}</p>
          </div>
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

export function SiteFooter({
  t,
  locale,
  downloadUrl,
}: {
  t: T;
  locale: Locale;
  downloadUrl: string;
}) {
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
                    href={downloadUrl}
                    data-placeholder-link="replace-me"
                    data-telemetry-cta="footer_download"
                  >
                    {t("closing.footer.download")}
                  </a>
                </li>
                <li>
                  <a
                    className={FOOTER_LINK}
                    href="https://github.com/pitroldev"
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
