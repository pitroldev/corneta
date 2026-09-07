import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "../../components/ui";
import { useI18n } from "../../lib/i18n";
import type { ProblemWindow, ReportAnalysis } from "../../lib/report";
import { cn } from "../../lib/utils";
import { EventRow, WindowCard } from "./ReportPrimitives";
import type { ReportTimelineModel } from "./useReportModels";

const PREVIEW_ROWS = 6;
const PAGE_ROWS = 48;
const GROUP_PREVIEW_ROWS = 3;
const MAX_GROUP_SIGNALS = 6;

const CONFIDENCE_KEY = {
  high: "reports.technical.incidents.confidence.high",
  medium: "reports.technical.incidents.confidence.medium",
  low: "reports.technical.incidents.confidence.low",
} as const;

const WINDOW_KIND_TONE: Record<ProblemWindow["causeKind"], string> = {
  app: "bg-warn",
  render: "bg-info",
  encoding: "bg-warn",
  local: "bg-info",
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
  confirm: string;
  confidence: ProblemWindow["confidence"];
  windows: ProblemWindow[];
  totalSec: number;
  signals: string[];
  affected: string[];
  totalTargets: number;
  contributingApp?: string;
}

export function groupProblemWindows(
  windows: ProblemWindow[],
): ProblemWindowGroup[] {
  const groups = new Map<string, ProblemWindowGroup>();
  const confidenceRank: Record<ProblemWindow["confidence"], number> = {
    low: 0,
    medium: 1,
    high: 2,
  };

  for (const window of windows) {
    // Include cause and recommendation in the key so distinct platform diagnoses do not merge.
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
        if (
          group.signals.length < MAX_GROUP_SIGNALS &&
          !group.signals.includes(signal)
        )
          group.signals.push(signal);
      }
      if (confidenceRank[window.confidence] > confidenceRank[group.confidence])
        group.confidence = window.confidence;
      for (const name of window.affected)
        if (!group.affected.includes(name)) group.affected.push(name);
      continue;
    }

    groups.set(id, {
      id,
      causeKind: window.causeKind,
      cause: window.cause,
      advice: window.advice,
      confidence: window.confidence,
      windows: [window],
      totalSec: window.durationSec,
      signals: window.signals.slice(0, MAX_GROUP_SIGNALS),
      confirm: window.confirm,
      affected: [...window.affected],
      totalTargets: window.totalTargets,
      contributingApp: window.contributingApp,
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
  const [windowPage, setWindowPage] = useState(0);
  const [eventPage, setEventPage] = useState(0);
  const windowGroups = useMemo(
    () => groupProblemWindows(analysis.windows),
    [analysis.windows],
  );
  const windows = showAllWindows
    ? analysis.windows.slice(
        windowPage * PAGE_ROWS,
        (windowPage + 1) * PAGE_ROWS,
      )
    : analysis.windows.slice(0, PREVIEW_ROWS);
  const events = showAllEvents
    ? analysis.events.slice(eventPage * PAGE_ROWS, (eventPage + 1) * PAGE_ROWS)
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
                  page={windowPage}
                  onPage={setWindowPage}
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
              page={eventPage}
              onPage={setEventPage}
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
  const [open, setOpen] = useState(false);
  const longest = useMemo(
    () =>
      open
        ? [...group.windows]
            .sort((a, b) => b.durationSec - a.durationSec)
            .slice(0, GROUP_PREVIEW_ROWS)
        : [],
    [open, group.windows],
  );
  const visibleSignals = group.signals.slice(0, 3);
  const hiddenSignalCount = group.signals.length - visibleSignals.length;
  // Local causes affect the shared video before fan-out; network causes affect only identified destinations.
  const pcSide = !["network", "platform", "unknown"].includes(group.causeKind);
  const targetsLabel =
    group.affected.length === 0
      ? pcSide
        ? t("reports.technical.incidents.impact.allTargets")
        : null
      : group.affected.length >= group.totalTargets
        ? t("reports.technical.incidents.impact.allTargets")
        : group.affected.join(", ");
  const impactLine = [
    group.totalSec < 60
      ? `${Math.round(group.totalSec)}s`
      : fmt.dur(group.totalSec),
    targetsLabel,
    t("reports.technical.incidents.impact.from", {
      time: timeline.relative(group.windows[0].tStart),
    }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <details
      className="group/incident"
      onToggle={(event) => {
        if (event.target === event.currentTarget)
          setOpen(event.currentTarget.open);
      }}
    >
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
        <span
          className={cn(
            "size-2.5 shrink-0 rounded-full",
            WINDOW_KIND_TONE[group.causeKind],
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1 py-0.5">
          <span className="block text-sm font-bold leading-snug">
            {group.cause}
          </span>
          <span className="mt-1 block text-xs tabular-nums text-ink-muted">
            {t(CONFIDENCE_KEY[group.confidence])}
            {" · "}
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

      {open ? (
        <div className="pb-5 pl-5 sm:pl-6">
          <div className="max-w-4xl border-l-2 border-border-soft pl-4">
            <p className="text-sm text-ink">
              <span className="mr-2 text-xs font-bold uppercase tracking-wide text-ink-faint">
                {t("reports.technical.incidents.impact")}
              </span>
              <span className="tabular-nums">{impactLine}</span>
            </p>

            <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-8">
              {visibleSignals.length > 0 ? (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-ink-faint">
                    {t("reports.technical.incidents.why")}
                  </h4>
                  <ol className="mt-2 space-y-0">
                    {visibleSignals.map((signal, index) => (
                      <li
                        key={signal}
                        className="relative flex gap-3 pb-3 [&:not(:last-child)]:after:absolute [&:not(:last-child)]:after:left-[9px] [&:not(:last-child)]:after:top-5 [&:not(:last-child)]:after:h-[calc(100%-0.75rem)] [&:not(:last-child)]:after:w-0.5 [&:not(:last-child)]:after:bg-border-soft"
                      >
                        <span
                          className={cn(
                            "z-10 mt-px grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-extrabold tabular-nums",
                            index === 0
                              ? cn(
                                  WINDOW_KIND_TONE[group.causeKind],
                                  "text-night",
                                )
                              : "bg-surface-3 text-ink-muted",
                          )}
                          aria-hidden
                        >
                          {index + 1}
                        </span>
                        <span className="min-w-0 break-words text-sm leading-snug text-ink">
                          <Highlight
                            text={signal}
                            term={
                              index === 0 ? group.contributingApp : undefined
                            }
                          />
                        </span>
                      </li>
                    ))}
                  </ol>
                  {hiddenSignalCount > 0 ? (
                    <p className="pl-8 text-xs text-ink-faint">
                      {t("reports.technical.incidents.signalsMore", {
                        count: hiddenSignalCount,
                      })}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-ink-faint">
                    {t("reports.technical.incidents.next")}
                  </h4>
                  <p className="mt-1 text-sm leading-relaxed text-ink">
                    {group.advice}
                  </p>
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-ink-faint">
                    {t("reports.technical.incidents.confirm")}
                  </h4>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                    {group.confirm}
                  </p>
                </div>
              </div>
            </div>
          </div>

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
      ) : null}
    </details>
  );
}

function Highlight({ text, term }: { text: string; term?: string }) {
  if (!term) return <>{text}</>;
  const at = text.indexOf(term);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <strong className="font-bold">{term}</strong>
      {text.slice(at + term.length)}
    </>
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
  const [open, setOpen] = useState(false);
  return (
    <details
      className="group/disclosure overflow-hidden rounded-md bg-surface-2"
      onToggle={(event) => {
        if (event.target === event.currentTarget)
          setOpen(event.currentTarget.open);
      }}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 text-sm font-bold [&::-webkit-details-marker]:hidden">
        <span className="flex-1">{title}</span>
        <span className="tabular-nums text-ink-faint">{count}</span>
        <ChevronDown
          className="size-4 text-ink-faint transition-transform group-open/disclosure:rotate-180"
          aria-hidden
        />
      </summary>
      {open ? (
        <div className="border-t border-border-soft">{children}</div>
      ) : null}
    </details>
  );
}

function ShowAllButton({
  expanded,
  count,
  onClick,
  page,
  onPage,
}: {
  expanded: boolean;
  count: number;
  onClick: () => void;
  page: number;
  onPage: (page: number) => void;
}) {
  const { t } = useI18n();
  const pages = Math.ceil(count / PAGE_ROWS);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-soft px-3 py-2">
      <Button variant="ghost" size="sm" onClick={onClick}>
        {expanded
          ? t("reports.technical.showLess")
          : t("reports.technical.showAll", { count })}
      </Button>
      {expanded && pages > 1 ? (
        <nav
          className="flex items-center gap-2"
          aria-label={t("reports.technical.pagination")}
        >
          <Button
            variant="ghost"
            size="sm"
            disabled={page === 0}
            onClick={() => onPage(page - 1)}
          >
            {t("reports.technical.pagePrevious")}
          </Button>
          <span
            className="text-xs tabular-nums text-ink-muted"
            aria-live="polite"
          >
            {t("reports.technical.pageCount", { page: page + 1, pages })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= pages - 1}
            onClick={() => onPage(page + 1)}
          >
            {t("reports.technical.pageNext")}
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
