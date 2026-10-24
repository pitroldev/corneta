import { localePath, type T, type Locale } from "@/lib/i18n";
import { DOWNLOAD_PATH } from "@/lib/download";
import type { SiteCtaId } from "@/lib/telemetry-schema";
import { LocaleSwitch } from "../_components/locale-switch";
import { SiteNav } from "../_components/site-nav";
import { DownloadIcon, WindowsIcon } from "../_components/icons";
import { Mascot } from "../_components/decor";
import { BrandMark } from "../_components/brand-mark";
import { HeroVideo } from "../_components/hero-video";
import { clock, lpMedia } from "@/lib/lp-media";
import { cn, downloadButton, Shell, Sticker } from "../_components/ui";

export function DownloadButton({
  t,
  ctaId,
  compact = false,
  label,
}: {
  t: T;
  ctaId: SiteCtaId;
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
      href={DOWNLOAD_PATH}
      data-telemetry-cta={ctaId}
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

export function SiteHeader({ t, locale }: { t: T; locale: Locale }) {
  const langLabel = t("hero.nav.lang");

  return (
    <header className="sticky top-0 z-60 relative border-b border-border-soft bg-night/95 backdrop-blur-[8px]">
      <Shell className="flex min-h-17 items-center gap-7 max-[980px]:gap-4 max-[420px]:gap-2.5">
        <a
          className="shrink-0"
          href="#topo"
          aria-label={t("hero.header.brand.aria")}
        >
          <BrandMark tight />
        </a>

        <SiteNav
          copy={{
            aria: t("hero.nav.aria"),
            items: [
              { href: "#como-funciona", label: t("hero.nav.how") },
              { href: "#recursos", label: t("hero.nav.features") },
              { href: "#plataformas", label: t("hero.nav.platforms") },
              {
                href: localePath(locale, "/guides"),
                label: t("hero.nav.guides"),
                ctaId: "nav_guides",
              },
              {
                href: localePath(locale, "/help"),
                label: t("hero.nav.help"),
                ctaId: "nav_help",
              },
            ],
          }}
          locale={<LocaleSwitch current={locale} label={langLabel} />}
        />

        <div className="ml-auto shrink-0">
          <DownloadButton
            t={t}
            ctaId="header_download"
            compact
            label={t("hero.header.download")}
          />
        </div>
      </Shell>
    </header>
  );
}

function Tape({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute z-10 h-[30px] w-[118px] border border-paper-line/60 bg-paper-raised/80 max-[760px]:hidden",
        className,
      )}
    />
  );
}

export function Hero({ t, locale }: { t: T; locale: Locale }) {
  const media = lpMedia(locale);

  return (
    <section
      id="topo"
      className="relative isolate overflow-hidden bg-paper bg-[image:var(--halftone-light)] bg-[length:22px_22px] pt-[clamp(40px,5vw,72px)] pb-[clamp(56px,6vw,88px)] text-ink"
    >
      <Shell className="text-center">
        <Sticker className="animate-[copy-in_500ms_cubic-bezier(0.16,1,0.3,1)_both]">
          <Mascot />
          {t("hero.sticker")}
        </Sticker>

        <h1 className="mt-6 animate-[copy-in_620ms_70ms_cubic-bezier(0.16,1,0.3,1)_both] text-[clamp(3rem,6.4vw,5.7rem)] leading-[0.92] tracking-[-0.035em] max-[760px]:text-[clamp(2.6rem,12vw,3.6rem)]">
          <span className="block">{t("hero.title.line1")}</span>
          <span className="relative inline-block">
            {t("hero.title.line2")}
            <svg
              aria-hidden="true"
              viewBox="0 0 600 34"
              preserveAspectRatio="none"
              className="hero-marker absolute -bottom-[0.16em] left-[-2%] -z-10 h-[0.42em] w-[104%] text-brass"
            >
              <path
                d="M6 22C120 12 260 26 380 18S540 10 594 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="22"
                strokeLinecap="round"
                pathLength={1}
              />
            </svg>
          </span>
        </h1>

        <p className="mx-auto mt-7 max-w-[60ch] animate-[copy-in_620ms_150ms_cubic-bezier(0.16,1,0.3,1)_both] text-[clamp(1.05rem,1.5vw,1.24rem)] leading-[1.6] font-medium text-ink-muted">
          {t("hero.pitch")}
        </p>
      </Shell>

      <div className="relative mx-auto mt-[clamp(34px,4.4vw,58px)] w-[min(calc(100%-2rem),1140px)] animate-[copy-in_720ms_210ms_cubic-bezier(0.16,1,0.3,1)_both]">
        <Tape className="-top-3.5 left-[6%] -rotate-[5deg]" />
        <Tape className="-top-3.5 right-[24%] rotate-[4deg]" />
        <Sticker className="absolute -top-4 -right-3 z-10 max-[760px]:hidden">
          {t("hero.video.real")}
        </Sticker>
        <HeroVideo
          webm={media.video.webm}
          mp4={media.video.mp4}
          poster={media.poster}
          captions={{
            src: media.video.captions,
            lang: locale,
            label: t("hero.video.captions"),
          }}
          copy={{
            play: t("hero.video.play"),
            duration: clock(media.video.seconds),
            videoLabel: t("hero.video.label"),
          }}
        />
      </div>

      <Shell className="mt-[clamp(40px,4.4vw,60px)] flex flex-col items-center gap-3.5 text-center">
        <div className="w-[min(440px,100%)] [&>a]:min-h-[70px] [&>a]:w-full [&>a]:text-[1.24rem] max-[760px]:[&>a]:min-h-[62px] max-[760px]:[&>a]:text-[1.06rem]">
          <DownloadButton t={t} ctaId="hero_download" />
        </div>
        <p className="text-[0.84rem] font-semibold text-ink-faint">
          {t("hero.cta.footnote")} ·{" "}
          <a
            className="underline decoration-2 underline-offset-4 transition-colors hover:text-tomato-ink focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-tomato"
            href="https://github.com/pitroldev/corneta"
            target="_blank"
            rel="noreferrer noopener"
          >
            {t("hero.trust.opensource")}
          </a>
        </p>
      </Shell>
    </section>
  );
}
