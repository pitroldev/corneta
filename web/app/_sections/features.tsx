import Image from "next/image";
import type { ReactNode } from "react";
import type { Locale, MessageKey, T } from "@/lib/i18n";
import {
  BellIcon,
  BoltIcon,
  ChatIcon,
  ClapperIcon,
  CropIcon,
  GaugeIcon,
  KeyboardIcon,
  LayersIcon,
  PauseIcon,
  PinIcon,
  PlayIcon,
  PopoutIcon,
  PowerIcon,
  SaveIcon,
  SequenceIcon,
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

// A phone screen in a thick ink bezel, so the capture reads as a device rather than a crop.
function Phone({
  still,
  alt,
  className,
}: {
  still: Still;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border-[5px] border-ink bg-night shadow-[7px_7px_0_0_var(--ink)] max-[760px]:border-4 max-[760px]:shadow-[5px_5px_0_0_var(--ink)]",
        className,
      )}
    >
      <Image
        src={still.src}
        width={still.width}
        height={still.height}
        alt={alt}
        sizes="(max-width: 760px) 44vw, 280px"
        className="h-auto w-full"
      />
    </div>
  );
}

const DECK = [
  ["feat.deck.does.mark", <PinIcon key="m" />],
  ["feat.deck.does.brb", <PauseIcon key="b" />],
  ["feat.deck.does.scene", <ClapperIcon key="s" />],
  ["feat.deck.does.alerts", <BellIcon key="a" />],
  ["feat.deck.does.chat", <ChatIcon key="c" />],
  ["feat.deck.does.combos", <SequenceIcon key="k" />],
] as const;

const CHIP =
  "inline-flex items-center gap-1.5 rounded-md border-2 border-ink bg-paper px-2.5 py-1 text-[0.86rem] font-bold [&>svg]:size-4 [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:[stroke-width:2.2]";

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
            <p className="mt-2 mb-5 text-[0.98rem] leading-[1.55] font-medium text-ink-muted">
              {t("feat.protection.text")}
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
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] items-center gap-x-[clamp(28px,4.4vw,64px)] gap-y-8 max-[860px]:grid-cols-1">
              <div>
                <h3 className="text-[clamp(1.6rem,2.6vw,2.3rem)] leading-[1.04]">
                  {t("feat.deck.title")}
                </h3>
                <p className="mt-3 max-w-[48ch] text-[1.02rem] leading-[1.55] font-medium text-ink-muted">
                  {t("feat.deck.text")}
                </p>
                <p className="mt-6 text-[0.72rem] font-extrabold tracking-[0.1em] text-ink-faint uppercase">
                  {t("feat.deck.does.label")}
                </p>
                <ul className="mt-2 flex flex-wrap gap-2" role="list">
                  {DECK.map(([key, icon]) => (
                    <li key={key} className={CHIP}>
                      {icon}
                      {t(key)}
                    </li>
                  ))}
                </ul>
                <p className="mt-6 max-w-[54ch] text-[0.86rem] leading-[1.5] font-medium text-ink-muted">
                  {t("feat.deck.cost")}
                </p>
              </div>
              {/* The chat phone leans on the keys phone, like the report's highlights sheet on its chart. */}
              <div className="flex items-start justify-center px-[3%] pb-2 max-[860px]:px-0">
                <Phone
                  className="w-[48%] max-w-[280px]"
                  still={media.features.deckKeys}
                  alt={t("feat.deck.keys.alt")}
                />
                <Phone
                  className="relative mt-[16%] -ml-[3%] w-[48%] max-w-[280px]"
                  still={media.features.deckChat}
                  alt={t("feat.deck.chat.alt")}
                />
              </div>
            </div>
          </article>

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
                    <li key={key} className={CHIP}>
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
