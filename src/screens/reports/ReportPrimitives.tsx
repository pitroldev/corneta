import { useState, type ComponentType } from "react";
import {
  Copy,
  Gift,
  Heart,
  Medal,
  MessageSquare,
  Play,
  Rocket,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  Users,
  Gem,
  type LucideProps,
} from "lucide-react";
import { Card, Button, PlatformGlyph } from "../../components/ui";
import { useI18n, useT } from "../../lib/i18n";
import {
  audienceStartedAt,
  audienceStatusText,
  embeddedAudienceText,
} from "../../lib/audience";
import type {
  ChannelBreakdown,
  ChannelStats,
  Highlight,
  ProblemWindow,
  ReportEvent,
} from "../../lib/report";
import { toast } from "../../lib/toast";
import { cn } from "../../lib/utils";

type Icon = ComponentType<LucideProps>;

export function StorySectionHeading({
  id,
  icon: IconComponent,
  title,
  description,
}: {
  id: string;
  icon: Icon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md bg-brass text-brass-ink pop-sm">
        <IconComponent className="size-4" strokeWidth={2.5} aria-hidden />
      </span>
      <div>
        <h2 id={id} className="text-2xl sm:text-3xl">
          {title}
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
          {description}
        </p>
      </div>
    </div>
  );
}

export type SplitMode = "total" | "channel";

export function SplitToggle({
  value,
  onChange,
}: {
  value: SplitMode;
  onChange: (value: SplitMode) => void;
}) {
  const t = useT();
  return (
    <div className="ml-auto flex shrink-0 items-center gap-0.5 rounded-md bg-surface-2 p-0.5 normal-case">
      {(["total", "channel"] as const).map((mode) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          aria-pressed={value === mode}
          className={cn(
            "rounded px-2 py-1 text-[11px] font-bold transition-colors",
            value === mode
              ? "bg-brass text-brass-ink"
              : "text-ink-faint hover:text-ink",
          )}
        >
          {t(
            mode === "channel"
              ? "reports.split.byChannel"
              : "reports.split.total",
          )}
        </button>
      ))}
    </div>
  );
}

export function ChannelBreakdownCard({
  breakdown,
  colors,
}: {
  breakdown: ChannelBreakdown;
  colors: Record<string, string>;
}) {
  const t = useT();
  return (
    <Card className="mb-0">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
        <Users className="size-4" /> {t("reports.channels.title")}
      </h3>
      <div className="flex flex-col gap-2">
        {breakdown.channels.map((channel) => (
          <ChannelRow
            key={channel.key}
            channel={channel}
            color={colors[channel.key]}
          />
        ))}
      </div>
      {breakdown.followersNet ? (
        <p className="mt-2 text-[11px] text-ink-faint">
          {t("reports.channels.followersNote")}
        </p>
      ) : null}
      {!breakdown.hasChatByChannel ? (
        <p className="mt-2 text-[11px] text-ink-faint">
          {t("reports.channels.oldChatNote")}
        </p>
      ) : null}
      {breakdown.unattributedAlerts > 0 ? (
        <p className="mt-2 text-[11px] text-ink-faint">
          {t("reports.channels.unattributed", {
            n: breakdown.unattributedAlerts,
          })}
        </p>
      ) : null}
    </Card>
  );
}

function ChannelRow({
  channel,
  color,
}: {
  channel: ChannelStats;
  color: string;
}) {
  const { t, fmt } = useI18n();
  const audience = channel.audience;
  const startedAt = audienceStartedAt(audience?.startedAt, { t, fmt });
  const chips: { Icon: Icon; value: string }[] = [];
  if (channel.followers.hasData && channel.followers.gained !== 0)
    chips.push({
      Icon: Heart,
      value: `${channel.followers.gained > 0 ? "+" : ""}${fmt.num(channel.followers.gained)}`,
    });
  if (channel.alerts.subs > 0)
    chips.push({ Icon: Star, value: String(channel.alerts.subs) });
  if (channel.alerts.bits > 0)
    chips.push({
      Icon: Gem,
      value: fmt.num(Math.round(channel.alerts.bits)),
    });
  if (channel.alerts.raids > 0)
    chips.push({ Icon: Rocket, value: String(channel.alerts.raids) });

  return (
    <div className="rounded-md bg-surface-2 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <PlatformGlyph id={channel.platform} size={22} />
        <span className="min-w-24 flex-1 truncate font-display font-bold">
          {channel.source}
        </span>
        {channel.viewers.hasData ? (
          <>
            <span className="text-xs text-ink-muted">
              {t("reports.channel.peak")}{" "}
              <strong className="tabular-nums text-ink">
                {fmt.num(channel.viewers.peak)}
              </strong>
            </span>
            <span className="text-xs text-ink-muted">
              {t("reports.channel.avg")}{" "}
              <strong className="tabular-nums text-ink">
                {fmt.num(channel.viewers.avg)}
              </strong>
            </span>
          </>
        ) : null}
        {channel.chat.hasData && channel.chat.total > 0 ? (
          <span className="text-xs text-ink-muted">
            💬{" "}
            <strong className="tabular-nums text-ink">
              {fmt.num(channel.chat.total)}
            </strong>
          </span>
        ) : null}
        {chips.length > 0 ? (
          <span className="flex flex-wrap items-center gap-2 text-xs tabular-nums text-ink-muted">
            {chips.map(({ Icon: ChipIcon, value }, index) => (
              <span key={index} className="inline-flex items-center gap-1">
                <ChipIcon className="size-3 text-brass" aria-hidden />
                {value}
              </span>
            ))}
          </span>
        ) : null}
      </div>
      {audience ? (
        <div className="mt-1 space-y-0.5 text-xs leading-relaxed text-ink-muted">
          {audience.title ? (
            <p className="truncate" title={audience.title}>
              {audience.title}
            </p>
          ) : null}
          {audience.status ? (
            <p>
              {t("reports.channel.audienceLatest", {
                status:
                  audience.status === "unavailable"
                    ? t("reports.channel.audienceUnavailable")
                    : (embeddedAudienceText(
                        {
                          audienceStatus: audience.status,
                          audienceOrigin: audience.origin,
                          embeddedViewers: audience.embeddedViewers,
                        },
                        { t, fmt },
                      ) ??
                      audienceStatusText(
                        {
                          audienceStatus: audience.status,
                          audienceOrigin: audience.origin,
                        },
                        t,
                      )),
              })}
            </p>
          ) : null}
          {startedAt ? <p>{startedAt}</p> : null}
        </div>
      ) : null}
      {channel.sharePct != null ? (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(channel.sharePct, 1.5)}%`,
                background: color,
              }}
            />
          </div>
          <span className="w-24 shrink-0 text-right text-[11px] font-semibold tabular-nums text-ink-faint">
            {t("reports.channel.share", {
              pct: channel.sharePct.toFixed(0),
            })}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  return (
    <Button
      variant={confirm ? "danger" : "ghost"}
      size="sm"
      onClick={() => {
        if (!confirm) {
          setConfirm(true);
          setTimeout(() => setConfirm(false), 3000);
          return;
        }
        onDelete();
      }}
    >
      <Trash2 className="size-4" />
      {t(confirm ? "reports.detail.delete.confirm" : "reports.detail.delete")}
    </Button>
  );
}

export function WindowCard({
  window,
  time,
  showCause = false,
  onSeek,
}: {
  window: ProblemWindow;
  time: string;
  showCause?: boolean;
  onSeek?: () => void;
}) {
  const { fmt } = useI18n();
  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center gap-x-2 text-sm">
        <span className="font-display font-bold tabular-nums text-warn">
          {time}
        </span>
        <span className="text-xs text-ink-faint">
          ({fmt.time(window.tStart)} · {window.durationSec}s)
        </span>
        {showCause ? (
          <span className="font-semibold">{window.cause}</span>
        ) : null}
        {onSeek ? <SeekButton onSeek={onSeek} /> : null}
        <CopyTimeButton time={time} className="ml-auto" />
      </div>
      {window.signals.length > 0 ? (
        <div className="mt-0.5 text-xs text-ink-muted">{window.signals[0]}</div>
      ) : null}
    </div>
  );
}

const EVENT_DOT: Record<ReportEvent["kind"], string> = {
  start: "bg-ok",
  end: "bg-ink-faint",
  reconnect: "bg-warn",
  error: "bg-bad",
  recover: "bg-ok",
  cpu: "bg-warn",
  marker: "bg-brass",
  signal: "bg-bad",
};

export function EventRow({
  event,
  time,
  onSeek,
}: {
  event: ReportEvent;
  time: string;
  onSeek?: () => void;
}) {
  const { fmt } = useI18n();
  return (
    <div className="flex min-h-10 items-center gap-2 py-1 text-sm">
      <span className="w-16 shrink-0 text-xs font-semibold tabular-nums text-ink">
        {time}
      </span>
      <span
        className={cn("size-2 shrink-0 rounded-full", EVENT_DOT[event.kind])}
      />
      <span className="flex-1 text-ink-muted">{event.label}</span>
      {onSeek ? <SeekButton onSeek={onSeek} /> : null}
      <span className="text-[11px] tabular-nums text-ink-faint">
        {fmt.time(event.t)}
      </span>
    </div>
  );
}

const HIGHLIGHT_ICON: Record<Highlight["kind"], Icon> = {
  chat: MessageSquare,
  raid: Rocket,
  viewers: TrendingUp,
  alert: Sparkles,
};

export function HighlightRow({
  highlight,
  time,
  onSeek,
}: {
  highlight: Highlight;
  time: string;
  onSeek?: () => void;
}) {
  const IconComponent = HIGHLIGHT_ICON[highlight.kind];
  return (
    <div className="flex min-h-16 items-center gap-3 border-b border-border-soft px-2 py-2.5 transition-colors hover:bg-surface-2/70">
      <IconComponent className="size-4 shrink-0 text-brass" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-display text-sm font-extrabold tabular-nums text-brass">
          {time}
        </span>
        <span className="mt-0.5 block text-sm text-ink-muted">
          {highlight.reason}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {onSeek ? <SeekButton onSeek={onSeek} /> : null}
        <CopyTimeButton time={time} />
      </span>
    </div>
  );
}

function SeekButton({ onSeek }: { onSeek: () => void }) {
  const t = useT();
  return (
    <button
      onClick={onSeek}
      className="grid size-10 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-3 hover:text-brass"
      title={t("replay.seek.cta")}
      aria-label={t("replay.seek.cta")}
    >
      <Play className="size-3.5" />
    </button>
  );
}

function CopyTimeButton({
  time,
  className,
}: {
  time: string;
  className?: string;
}) {
  const t = useT();
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(time);
        toast.success(t("reports.copyTime.done"));
      }}
      className={cn(
        "grid size-10 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink",
        className,
      )}
      title={t("reports.copyTime")}
      aria-label={t("reports.copyTime")}
    >
      <Copy className="size-3.5" />
    </button>
  );
}

export const ALERT_LABELS: [string, string, Icon][] = [
  ["sub", "reports.alerts.kind.sub", Star],
  ["resub", "reports.alerts.kind.resub", Sparkles],
  ["subgift", "reports.alerts.kind.subgift", Gift],
  ["member", "reports.alerts.kind.member", Medal],
  ["superchat", "reports.alerts.kind.superchat", MessageSquare],
  ["raid", "reports.alerts.kind.raid", Rocket],
  ["follow", "reports.alerts.kind.follow", Heart],
];
