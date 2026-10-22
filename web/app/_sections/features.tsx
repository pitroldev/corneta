import Image from "next/image";
import type { ReactNode } from "react";
import type { Locale, MessageKey, T } from "@/lib/i18n";
import {
  BoltIcon,
  ClapperIcon,
  CropIcon,
  GaugeIcon,
  KeyboardIcon,
  LayersIcon,
  PlayIcon,
  PopoutIcon,
  PowerIcon,
  SaveIcon,
  SheetIcon,
  ThemeIcon,
  TrayIcon,
} from "../_components/icons";
import { lpMedia } from "@/lib/lp-media";
import { cn, Section, SectionHeading, Shell } from "../_components/ui";

type Still = { src: string; width: number; height: number };

const CARD =
  "flex flex-col rounded-xl border-[3px] border-ink bg-paper-raised p-[clamp(20px,2.4vw,28px)] text-ink shadow-[7px_7px_0_0_var(--ink)] max-[760px]:shadow-[5px_5px_0_0_var(--ink)]";

function Shot({
  still,
  alt,
  sizes,
  className,
}: {
  still: Still;
  alt: string;
  sizes: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border-2 border-ink bg-night",
        className,
      )}
    >
      <Image
        src={still.src}
        width={still.width}
        height={still.height}
        alt={alt}
        sizes={sizes}
        className="h-auto w-full"
      />
    </div>
  );
}

function Card({
  title,
  children,
  still,
  alt,
  className,
}: {
  title: string;
  children: ReactNode;
  still: Still;
  alt: string;
  className?: string;
}) {
  return (
    <article className={cn(CARD, className)}>
      <h3 className="text-[clamp(1.35rem,2vw,1.7rem)] leading-[1.08]">
        {title}
      </h3>
      <div className="mt-2 mb-5 text-[0.98rem] leading-[1.55] font-medium text-ink-muted">
        {children}
      </div>
      <div className="mt-auto">
        <Shot still={still} alt={alt} sizes="(max-width: 980px) 92vw, 700px" />
      </div>
    </article>
  );
}

const EXPORTS = [
  ["feat.report.export.chapters", <PlayIcon key="c" />],
  ["feat.report.export.csv", <SheetIcon key="s" />],
  ["feat.report.export.edl", <ClapperIcon key="e" />],
] as const;

const MORE = [
  ["feat.more.quality", <GaugeIcon key="q" />],
  ["feat.more.vertical", <CropIcon key="v" />],
  ["page-data.tiny.youtube.title", <BoltIcon key="b" />],
  ["page-data.tiny.chatwindow.title", <PopoutIcon key="p" />],
  ["page-data.tiny.hotkey.title", <KeyboardIcon key="k" />],
  ["page-data.tiny.profiles.title", <LayersIcon key="l" />],
  ["page-data.tiny.tray.title", <TrayIcon key="t" />],
  ["page-data.tiny.startup.title", <PowerIcon key="w" />],
  ["page-data.tiny.theme.title", <ThemeIcon key="h" />],
  ["page-data.tiny.backup.title", <SaveIcon key="s" />],
] as const;

export function Features({ t, locale }: { t: T; locale: Locale }) {
  const media = lpMedia(locale);
  return (
    <Section id="recursos" tone="paper">
      <Shell>
        <SectionHeading
          tone="paper"
          kicker={t("feat.kicker")}
          title={t("feat.title")}
        />

        <div className="mt-[clamp(36px,4.4vw,56px)] grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-[clamp(18px,2.2vw,28px)] max-[980px]:grid-cols-1">
          <Card
            title={t("feat.independent.title")}
            still={media.features.independent}
            alt={t("feat.independent.alt")}
          >
            <p>{t("feat.independent.text")}</p>
          </Card>

          <article className={cn(CARD, "row-span-2 max-[980px]:row-span-1")}>
            <h3 className="text-[clamp(1.35rem,2vw,1.7rem)] leading-[1.08]">
              {t("feat.protection.title")}
            </h3>
            <p className="mt-2 text-[0.98rem] leading-[1.55] font-medium text-ink-muted">
              {t("feat.protection.text")}
            </p>
            <p className="mt-3 mb-5 text-[0.86rem] leading-[1.5] font-medium text-ink-muted">
              <strong className="font-bold text-ink">
                {t("protection.guard.privacy.title")}
              </strong>{" "}
              <span className="mx-0.5 inline-block -rotate-2 rounded-sm bg-tomato px-1.5 py-0.5 text-[0.62rem] font-extrabold tracking-[0.08em] text-brass-ink uppercase">
                {t("protection.guard.privacy.switch")}
              </span>{" "}
              {t("protection.guard.privacy.body")}{" "}
              {t("protection.guard.privacy.cost")}
            </p>
            <div className="mt-auto">
              <Shot
                still={media.features.protection}
                alt={t("feat.protection.alt")}
                sizes="(max-width: 980px) 92vw, 460px"
              />
            </div>
          </article>

          <Card
            title={t("feat.chat.title")}
            still={media.features.chat}
            alt={t("feat.chat.alt")}
          >
            <p>{t("feat.chat.text")}</p>
          </Card>

          <article className={cn(CARD, "col-span-2 max-[980px]:col-span-1")}>
            <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-2">
              <h3 className="text-[clamp(1.6rem,2.6vw,2.3rem)] leading-[1.04]">
                {t("feat.report.title")}
              </h3>
              <p className="max-w-[52ch] text-[1.02rem] leading-[1.55] font-medium text-ink-muted">
                {t("feat.report.text")}
              </p>
            </div>
            {/* The highlights sheet sits on the chart's right edge, like a second page on the desk. */}
            <div className="mt-[clamp(22px,2.6vw,32px)] grid grid-cols-[minmax(0,62fr)_minmax(0,38fr)] max-[760px]:grid-cols-1">
              <Shot
                className="col-start-1 row-start-1 self-start"
                still={media.features.reportChart}
                alt={t("feat.report.alt")}
                sizes="(max-width: 980px) 92vw, 720px"
              />
              <Shot
                className="relative col-start-2 row-span-2 row-start-1 mt-[16%] -ml-[8%] shadow-[7px_7px_0_0_var(--ink)] max-[760px]:col-start-auto max-[760px]:row-span-1 max-[760px]:row-start-auto max-[760px]:-mt-[8%] max-[760px]:ml-[14%] max-[760px]:shadow-[5px_5px_0_0_var(--ink)]"
                still={media.features.reportMoments}
                alt={t("feat.report.moments.alt")}
                sizes="(max-width: 760px) 80vw, 480px"
              />
              <div className="col-start-1 row-start-2 mt-5 max-[760px]:col-start-auto max-[760px]:row-start-auto">
                <p className="text-[0.72rem] font-extrabold tracking-[0.1em] text-ink-faint uppercase">
                  {t("feat.report.export.label")}
                </p>
                <ul className="mt-2 flex flex-wrap gap-2" role="list">
                  {EXPORTS.map(([key, icon]) => (
                    <li
                      key={key}
                      className="inline-flex items-center gap-1.5 rounded-md border-2 border-ink bg-paper px-2.5 py-1 text-[0.86rem] font-bold [&>svg]:size-4 [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:[stroke-width:2.2]"
                    >
                      {icon}
                      {t(key)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </article>
        </div>

        <div className="mt-[clamp(28px,3.4vw,40px)] flex flex-wrap items-center gap-2.5 max-[560px]:gap-2">
          <h3 className="mr-2 text-[1.15rem]">{t("feat.tiny.title")}</h3>
          <ul className="contents" role="list">
            {MORE.map(([key, icon]) => (
              <li
                key={key}
                className="inline-flex items-center gap-2 rounded-md border-2 border-ink bg-paper-raised px-3 py-1.5 text-[0.88rem] font-bold max-[560px]:gap-1.5 max-[560px]:px-2 max-[560px]:py-1 max-[560px]:text-[0.78rem] [&>svg]:size-4 [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:[stroke-width:2.2]"
              >
                {icon}
                {t(key as MessageKey)}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-6 text-[0.82rem] font-semibold text-ink-faint">
          {t("feat.sample")}
        </p>
      </Shell>
    </Section>
  );
}
