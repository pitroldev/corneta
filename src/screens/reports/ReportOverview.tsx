import { memo } from "react";
import { ArrowLeft, Download, Gauge, Radio, Share2 } from "lucide-react";
import { Button, PlatformGlyph } from "../../components/ui";
import { useI18n } from "../../lib/i18n";
import type { ReportAnalysis } from "../../lib/report";
import type { SessionData } from "../../lib/types";
import { cn } from "../../lib/utils";
import { DeleteButton } from "./ReportPrimitives";
import { buildLivePortrait, MODE_KEY, type HeroStat } from "./reportUtils";

export const ReportOverview = memo(function ReportOverview({
  data,
  analysis,
  stats,
  onBack,
  onOpenRecap,
  onOpenDownload,
  onDelete,
}: {
  data: SessionData;
  analysis: ReportAnalysis;
  stats: HeroStat[];
  onBack: () => void;
  onOpenRecap: () => void;
  onOpenDownload: () => void;
  onDelete: () => void;
}) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const modeKey = MODE_KEY[data.meta.mode];
  const portrait = buildLivePortrait(data, analysis, i18n);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" /> {t("reports.detail.back")}
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="subtle" size="sm" onClick={onOpenRecap}>
            <Share2 className="size-4" /> {t("reports.detail.recap")}
          </Button>
          <Button variant="subtle" size="sm" onClick={onOpenDownload}>
            <Download className="size-4" /> {t("reports.detail.download")}
          </Button>
          <DeleteButton onDelete={onDelete} />
        </div>
      </div>

      <header className="mb-7">
        <h1 className="max-w-3xl text-4xl leading-none sm:text-5xl">
          {t("reports.detail.heading", { date: fmt.date(data.meta.startedAt) })}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-muted">
          <span className="font-semibold text-ink">
            {fmt.dur(data.meta.durationSec)}
          </span>
          <span>
            {fmt.time(data.meta.startedAt)}
            {data.meta.endedAt ? `–${fmt.time(data.meta.endedAt)}` : ""}
          </span>
          <span>
            {t("reports.detail.mode", {
              mode: modeKey ? t(modeKey) : data.meta.mode,
            })}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {data.meta.platforms.map((platform) => (
            <span
              key={platform.id}
              className="inline-flex items-center gap-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-xs font-bold"
            >
              <PlatformGlyph id={platform.platformId} size={20} />
              {platform.name}
            </span>
          ))}
        </div>
      </header>

      <section
        aria-labelledby="report-live-portrait-heading"
        className="grid overflow-hidden rounded-xl bg-surface pop xl:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)]"
      >
        <div className="relative overflow-hidden bg-brass p-6 text-brass-ink sm:p-8">
          <Radio
            className="pointer-events-none absolute -right-8 -bottom-10 size-52 -rotate-12 opacity-10"
            strokeWidth={1.2}
            aria-hidden
          />
          <div className="relative flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brass-ink text-brass">
              <Radio className="size-5" aria-hidden />
            </span>
            <div>
              <h2
                id="report-live-portrait-heading"
                className="max-w-2xl text-3xl sm:text-4xl"
              >
                {portrait.title}
              </h2>
              <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-brass-ink/75">
                {portrait.detail}
              </p>
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-2 divide-x divide-y divide-border-soft">
          {stats.slice(0, 4).map((stat) => (
            <div key={stat.label} className="min-w-0 p-4 sm:p-5">
              <dt className="truncate text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                {stat.label}
              </dt>
              <dd
                className={cn(
                  "mt-1 font-display text-2xl font-extrabold tabular-nums sm:text-3xl",
                  stat.accent && "text-brass",
                )}
              >
                {stat.value}
              </dd>
              {stat.sub ? (
                <p
                  className={cn(
                    "mt-1 text-[11px] font-semibold",
                    stat.sub.tone === "up" ? "text-ok" : "text-ink-faint",
                  )}
                >
                  {stat.sub.text}
                </p>
              ) : null}
            </div>
          ))}
          {stats.length === 0 ? (
            <div className="col-span-2 flex items-center gap-3 p-6 text-sm text-ink-muted">
              <Gauge className="size-5 text-brass" aria-hidden />
              {t("reports.story.noEngagement")}
            </div>
          ) : null}
        </dl>
      </section>
    </>
  );
});
