import type { Locale, T } from "@/lib/i18n";
import Image from "next/image";
import Link from "next/link";
import { legalHref } from "@/lib/legal";
import { Mascot, PlatformGlyph } from "../_components/decor";
import { CheckIcon, InfoIcon, LockIcon } from "../_components/icons";
import { lpMedia } from "@/lib/lp-media";
import { cn, Section, SectionHeading, Shell, TwoCol } from "../_components/ui";

const LINK =
  "font-[750] text-tomato-ink underline decoration-2 underline-offset-[3px] transition-colors hover:text-ink";

export function Local({ t, locale }: { t: T; locale: Locale }) {
  const { honest } = lpMedia(locale);
  return (
    <Section id="seu-pc" tone="paper">
      <Shell>
        <TwoCol
          cols="minmax(0,1.25fr) minmax(280px,0.75fr)"
          className="items-end gap-[clamp(28px,5vw,64px)]"
        >
          <SectionHeading
            tone="paper"
            kicker={t("steps.local.kicker")}
            title={t("steps.local.title")}
          >
            <p>{t("steps.local.body")}</p>
          </SectionHeading>
          <ul
            className="flex flex-col gap-2.5 [&>li]:flex [&>li]:min-h-12 [&>li]:items-center [&>li]:gap-3 [&>li]:rounded-lg [&>li]:border-2 [&>li]:border-ink [&>li]:bg-paper-raised [&>li]:px-4 [&>li]:py-2.5 [&>li]:font-display [&>li]:text-[1.02rem] [&>li]:font-extrabold [&>li]:shadow-[4px_4px_0_0_var(--ink)] [&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:fill-none [&_svg]:stroke-ok-ink [&_svg]:[stroke-width:3]"
            role="list"
          >
            <li>
              <CheckIcon /> {t("steps.local.check.free")}
            </li>
            <li>
              <CheckIcon /> {t("steps.local.check.keys")}
            </li>
            <li>
              <CheckIcon /> {t("steps.local.check.license")}
              <a
                className={cn(LINK, "ml-auto font-sans text-[0.86rem]")}
                href="https://github.com/pitroldev/corneta"
                rel="noreferrer noopener"
                target="_blank"
              >
                {t("steps.local.proof.link")}
              </a>
            </li>
          </ul>
        </TwoCol>

        <div className="mt-[clamp(40px,5vw,64px)] grid grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] items-center gap-[clamp(24px,3.4vw,48px)] rounded-xl bg-brass p-[clamp(22px,3.2vw,44px)] text-brass-ink shadow-[8px_8px_0_0_var(--night)] max-[980px]:grid-cols-1 max-[760px]:shadow-[5px_5px_0_0_var(--night)]">
          <div>
            <span className="inline-flex items-center gap-2 text-[0.72rem] font-extrabold tracking-[0.1em] uppercase [&>svg]:size-4 [&>svg]:fill-current">
              <Mascot /> {t("steps.local.honest.label")}
            </span>
            <h3 className="mt-3 text-[clamp(1.75rem,2.8vw,2.5rem)] leading-none">
              {t("steps.local.honest.title")}
            </h3>
            <p className="mt-4 leading-[1.6] font-[550]">
              {t("steps.local.honest.body")}
            </p>
          </div>
          <div className="overflow-hidden rounded-lg border-2 border-ink bg-night shadow-[6px_6px_0_0_var(--night)] max-[560px]:hidden">
            <Image
              src={honest.wide.src}
              width={honest.wide.width}
              height={honest.wide.height}
              alt={t("steps.local.honest.alt")}
              sizes="(max-width: 980px) 92vw, 720px"
              className="h-auto w-full"
            />
          </div>
          <div className="mx-auto hidden w-full max-w-[300px] overflow-hidden rounded-lg border-2 border-ink bg-night shadow-[5px_5px_0_0_var(--night)] max-[560px]:block">
            <Image
              src={honest.narrow.src}
              width={honest.narrow.width}
              height={honest.narrow.height}
              alt={t("steps.local.honest.alt")}
              sizes="300px"
              className="h-auto w-full"
            />
          </div>
        </div>

        <p className="mt-[clamp(28px,3.4vw,40px)] flex max-w-[80ch] items-start gap-3 text-[0.88rem] leading-[1.6] font-medium text-ink-muted [&>svg]:mt-0.5 [&>svg]:size-[18px] [&>svg]:shrink-0 [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:text-tomato-ink [&>svg]:[stroke-width:2.2]">
          <LockIcon />
          <span>
            {t("steps.accounts.lede")}{" "}
            <Link className={LINK} href={legalHref(locale, "privacy")}>
              {t("steps.accounts.privacy.link")}
            </Link>
            .
          </span>
        </p>
      </Shell>
    </Section>
  );
}

const EXPERIMENTAL = new Set(["tiktok", "instagram", "x"]);

export function Platforms({
  t,
  destinations,
}: {
  t: T;
  destinations: readonly { id: string; name: string }[];
}) {
  return (
    <Section id="plataformas">
      <Shell>
        <TwoCol
          cols="minmax(0,0.8fr) minmax(0,1.2fr)"
          className="gap-[clamp(36px,5vw,72px)]"
        >
          <SectionHeading
            tight
            kicker={t("steps.platforms.kicker")}
            title={t("steps.platforms.title")}
          >
            <p>{t("steps.platforms.lede")}</p>
          </SectionHeading>
          <div>
            <ul
              className="grid grid-cols-4 gap-2.5 max-[560px]:grid-cols-2"
              role="list"
            >
              {destinations.map((destination) => (
                <li
                  key={destination.id}
                  className="relative flex flex-col items-center gap-2.5 rounded-lg border border-border-dry bg-surface px-2 pt-5 pb-4 text-center [&_.glyph]:h-11 [&_.glyph]:w-11"
                >
                  <PlatformGlyph id={destination.id as never} />
                  <strong className="font-display text-[0.98rem] leading-[1.1] font-bold text-cream">
                    {destination.name}
                  </strong>
                  {EXPERIMENTAL.has(destination.id) && (
                    <span className="absolute -top-2 right-1.5 rotate-2 rounded-sm bg-tomato px-1.5 py-0.5 text-[0.6rem] font-extrabold tracking-[0.08em] text-brass-ink uppercase">
                      {t("steps.platforms.tag.experimental")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-5 flex items-start gap-2.5 text-[0.86rem] leading-[1.55] font-medium text-muted [&_strong]:font-bold [&_strong]:text-cream [&>svg]:mt-0.5 [&>svg]:size-[18px] [&>svg]:shrink-0 [&>svg]:fill-none [&>svg]:stroke-brass [&>svg]:[stroke-width:2.2]">
              <InfoIcon />
              <span>
                <strong>{t("steps.platforms.note.experimental.strong")}</strong>{" "}
                {t("steps.platforms.note.validation")}
              </span>
            </p>
          </div>
        </TwoCol>
      </Shell>
    </Section>
  );
}
