import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "../../components/ui";
import { useI18n } from "../../lib/i18n";
import type { ProblemWindow, ReportAnalysis } from "../../lib/report";
import { cn } from "../../lib/utils";
import { EventRow, WindowCard } from "./ReportPrimitives";
import type { ReportTimelineModel } from "./useReportModels";

const PREVIEW_ROWS = 6;
const GROUP_PREVIEW_ROWS = 3;

const WINDOW_KIND_TONE: Record<ProblemWindow["causeKind"], string> = {
  render: "bg-info",
  encoding: "bg-warn",
  network: "bg-bad",
  platform: "bg-brass",
  signal: "bg-bad",
  unknown: "bg-ink-faint",
};

interface ProblemWindowGroup {
  id: string;
  causeKind: ProblemWindow["causeKind"];
  cause: string;
  advice: string;
  windows: ProblemWindow[];
  totalSec: number;
  signals: string[];
}

export function groupProblemWindows(
  windows: ProblemWindow[],
): ProblemWindowGroup[] {
  const groups = new Map<string, ProblemWindowGroup>();

  for (const window of windows) {
    // Plataformas diferentes podem pedir ações diferentes. O texto da causa e a
    // recomendação entram na chave para não fundir diagnósticos só porque ambos
    // pertencem à categoria ampla "platform".
    const id = [
      window.causeKind,
      window.targetName ?? "",
      window.cause,
      window.advice,
    ].join("\u0000");
    const group = groups.get(id);

    if (group) {
      group.windows.push(window);
      group.totalSec += window.durationSec;
      for (const signal of window.signals) {
        if (!group.signals.includes(signal)) group.signals.push(signal);
      }
      continue;
    }

    groups.set(id, {
      id,
      causeKind: window.causeKind,
      cause: window.cause,
      advice: window.advice,
      windows: [window],
      totalSec: window.durationSec,
      signals: [...window.signals],
    });
  }

  return [...groups.values()].sort(
    (a, b) =>
      b.totalSec - a.totalSec || a.windows[0].tStart - b.windows[0].tStart,
  );
}

export function ReportTechnicalEventsPanel({
  analysis,
  timeline,
  canSeek,
  startedAt,
  endedAt,
}: {
  analysis: ReportAnalysis;
  timeline: ReportTimelineModel;
  canSeek: boolean;
  startedAt: number;
  endedAt: number;
}) {
  const { t } = useI18n();
  const [showAllWindows, setShowAllWindows] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const windowGroups = useMemo(
    () => groupProblemWindows(analysis.windows),
    [analysis.windows],
  );
  const windows = showAllWindows
    ? analysis.windows
    : analysis.windows.slice(0, PREVIEW_ROWS);
  const events = showAllEvents
    ? analysis.events
    : analysis.events.slice(0, PREVIEW_ROWS);

  return (
    <div className="flex flex-col gap-5">
      {analysis.windows.length > 0 ? (
        <section aria-labelledby="report-incident-groups-heading">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 id="report-incident-groups-heading" className="text-base">
                {t("reports.technical.incidents.title")}
              </h3>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-muted">
                {t("reports.technical.incidents.desc")}
              </p>
            </div>
            <span className="text-xs tabular-nums text-ink-faint">
              {t("reports.technical.incidents.groups", {
                groups: windowGroups.length,
                count: analysis.windows.length,
              })}
            </span>
          </div>

          <div className="mt-3 divide-y divide-border-soft border-y border-border-soft">
            {windowGroups.map((group) => (
              <WindowGroupDisclosure
                key={group.id}
                group={group}
                startedAt={startedAt}
                endedAt={endedAt}
                timeline={timeline}
                canSeek={canSeek}
              />
            ))}
          </div>

          <div className="mt-3">
            <TechnicalDisclosure
              title={t("reports.technical.incidents.individual")}
              count={analysis.windows.length}
            >
              <div className="divide-y divide-border-soft px-4">
                {windows.map((window, index) => (
                  <WindowCard
                    key={`${window.tStart}-${index}`}
                    window={window}
                    time={timeline.relative(window.tStart)}
                    showCause
                    onSeek={
                      canSeek ? () => timeline.seekTo(window.tStart) : undefined
                    }
                  />
                ))}
              </div>
              {analysis.windows.length > PREVIEW_ROWS ? (
                <ShowAllButton
                  expanded={showAllWindows}
                  count={analysis.windows.length}
                  onClick={() => setShowAllWindows((value) => !value)}
                />
              ) : null}
            </TechnicalDisclosure>
          </div>
        </section>
      ) : null}

      {analysis.events.length > 0 ? (
        <TechnicalDisclosure
          title={t("reports.events.title")}
          count={analysis.events.length}
        >
          <div className="divide-y divide-border-soft px-4">
            {events.map((event, index) => (
              <EventRow
                key={`${event.t}-${index}`}
                event={event}
                time={timeline.relative(event.t)}
                onSeek={canSeek ? () => timeline.seekTo(event.t) : undefined}
              />
            ))}
          </div>
          {analysis.events.length > PREVIEW_ROWS ? (
            <ShowAllButton
              expanded={showAllEvents}
              count={analysis.events.length}
              onClick={() => setShowAllEvents((value) => !value)}
            />
          ) : null}
        </TechnicalDisclosure>
      ) : null}
    </div>
  );
}

function WindowGroupDisclosure({
  group,
  startedAt,
  endedAt,
  timeline,
  canSeek,
}: {
  group: ProblemWindowGroup;
  startedAt: number;
  endedAt: number;
  timeline: ReportTimelineModel;
  canSeek: boolean;
}) {
  const { t, tp, fmt } = useI18n();
  const longest = [...group.windows]
    .sort((a, b) => b.durationSec - a.durationSec)
    .slice(0, GROUP_PREVIEW_ROWS);
  const visibleSignals = group.signals.slice(0, 3);
  const hiddenSignalCount = group.signals.length - visibleSignals.length;

  return (
    <details className="group/incident">
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
        <span
          className={cn(
            "size-2.5 shrink-0 rounded-full",
            WINDOW_KIND_TONE[group.causeKind],
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">
            {group.cause}
          </span>
          <span className="mt-0.5 block text-xs tabular-nums text-ink-muted">
            {tp(
              "reports.technical.incidents.occurrences",
              group.windows.length,
            )}
            {" · "}
            {t("reports.technical.incidents.total", {
              duration:
                group.totalSec < 60
                  ? `${Math.round(group.totalSec)}s`
                  : fmt.dur(group.totalSec),
            })}
          </span>
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-ink-faint transition-transform group-open/incident:rotate-180"
          aria-hidden
        />
      </summary>

      <div className="pb-5 pl-5 sm:pl-6">
        <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">
          {group.advice}
        </p>

        {visibleSignals.length > 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-ink-faint">
            {visibleSignals.join(" · ")}
            {hiddenSignalCount > 0
              ? ` · ${t("reports.technical.incidents.signalsMore", {
                  count: hiddenSignalCount,
                })}`
              : null}
          </p>
        ) : null}

        <WindowDistribution
          group={group}
          startedAt={startedAt}
          endedAt={endedAt}
        />

        <h4 className="mt-4 text-xs font-bold uppercase tracking-wide text-ink-faint">
          {t("reports.technical.incidents.longest")}
        </h4>
        <div className="mt-1 divide-y divide-border-soft">
          {longest.map((window, index) => (
            <WindowCard
              key={`${window.tStart}-${index}`}
              window={window}
              time={timeline.relative(window.tStart)}
              onSeek={
                canSeek ? () => timeline.seekTo(window.tStart) : undefined
              }
            />
          ))}
        </div>
      </div>
    </details>
  );
}

function WindowDistribution({
  group,
  startedAt,
  endedAt,
}: {
  group: ProblemWindowGroup;
  startedAt: number;
  endedAt: number;
}) {
  const { t, fmt } = useI18n();
  const duration = Math.max(1, endedAt - startedAt);

  return (
    <div className="mt-4">
      <div
        className="relative h-2 overflow-hidden rounded-full bg-surface-3"
        role="img"
        aria-label={t("reports.technical.incidents.distribution", {
          count: group.windows.length,
        })}
      >
        {group.windows.map((window, index) => {
          const left = Math.max(
            0,
            Math.min(100, ((window.tStart - startedAt) / duration) * 100),
          );
          const rawWidth = ((window.tEnd - window.tStart) / duration) * 100;
          const width = Math.max(
            0,
            Math.min(100 - left, Math.max(0.4, rawWidth)),
          );

          return (
            <span
              key={`${window.tStart}-${index}`}
              className={cn(
                "absolute inset-y-0",
                WINDOW_KIND_TONE[group.causeKind],
              )}
              style={{ left: `${left}%`, width: `${width}%` }}
              aria-hidden
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-ink-faint">
        <span>{fmt.dur(0)}</span>
        <span>{fmt.dur(Math.max(0, Math.round(duration / 1000)))}</span>
      </div>
    </div>
  );
}

function TechnicalDisclosure({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <details className="group/disclosure overflow-hidden rounded-md bg-surface-2">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 text-sm font-bold [&::-webkit-details-marker]:hidden">
        <span className="flex-1">{title}</span>
        <span className="tabular-nums text-ink-faint">{count}</span>
        <ChevronDown
          className="size-4 text-ink-faint transition-transform group-open/disclosure:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="border-t border-border-soft">{children}</div>
    </details>
  );
}

function ShowAllButton({
  expanded,
  count,
  onClick,
}: {
  expanded: boolean;
  count: number;
  onClick: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="border-t border-border-soft px-3 py-2">
      <Button variant="ghost" size="sm" onClick={onClick}>
        {expanded
          ? t("reports.technical.showLess")
          : t("reports.technical.showAll", { count })}
      </Button>
    </div>
  );
}
