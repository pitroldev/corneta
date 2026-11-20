import { useState } from "react";
import { m } from "framer-motion";
import {
  BarChart3,
  Circle,
  Eye,
  Info,
  MapPin,
  MessageSquare,
  Pause,
  Play,
  Radio,
  Settings,
  Sliders,
  Tv2,
  Users,
} from "lucide-react";
import { api } from "../lib/api";
import { announceMark } from "../lib/markMoment";
import { toast } from "../lib/toast";
import { cn, errMsg, fmtUptime } from "../lib/utils";
import { useI18n, type MessageKey } from "../lib/i18n";
import { useStore } from "../lib/store";
import { useNow } from "../lib/useNow";
import { useReadiness } from "../lib/useReadiness";
import { audienceTooltip, audienceTotal, showAudience } from "../lib/audience";
import { MESA_ENABLED } from "../lib/flags";
import { Mascot } from "./decor";

export type Screen =
  | "platforms"
  | "encoding"
  | "golive"
  | "chat"
  | "mesa"
  | "reports"
  | "about"
  | "settings";

interface NavItem {
  id: Screen;
  labelKey: MessageKey;
  icon: typeof Radio;
  hintKey: MessageKey;
}

// Navigation IDs are stable internal routes; only translation keys are display copy.
const LIVE_NAV: NavItem[] = [
  {
    id: "golive",
    labelKey: "sidebar.nav.golive.label",
    icon: Radio,
    hintKey: "sidebar.nav.golive.hint",
  },
  {
    id: "chat",
    labelKey: "sidebar.nav.chat.label",
    icon: MessageSquare,
    hintKey: "sidebar.nav.chat.hint",
  },
  ...(MESA_ENABLED
    ? [
        {
          id: "mesa" as Screen,
          labelKey: "sidebar.nav.mesa.label" as MessageKey,
          icon: Users,
          hintKey: "sidebar.nav.mesa.hint" as MessageKey,
        },
      ]
    : []),
  {
    id: "reports",
    labelKey: "sidebar.nav.reports.label",
    icon: BarChart3,
    hintKey: "sidebar.nav.reports.hint",
  },
];

const PREPARE_NAV: NavItem[] = [
  {
    id: "platforms",
    labelKey: "sidebar.nav.platforms.label",
    icon: Tv2,
    hintKey: "sidebar.nav.platforms.hint",
  },
  {
    id: "encoding",
    labelKey: "sidebar.nav.encoding.label",
    icon: Sliders,
    hintKey: "sidebar.nav.encoding.hint",
  },
];

/** Visual order; App derives the Alt+N shortcuts from it. */
export const NAV_ORDER: Screen[] = [
  ...LIVE_NAV.map((item) => item.id),
  ...PREPARE_NAV.map((item) => item.id),
  "settings",
  "about",
];

const shortcutOf = (id: Screen) => `Alt+${NAV_ORDER.indexOf(id) + 1}`;

export function Sidebar({
  screen,
  onNavigate,
  onPreload,
}: {
  screen: Screen;
  onNavigate: (s: Screen) => void;
  onPreload?: (s: Screen) => void;
}) {
  const { t, tp } = useI18n();
  const unseenReport = useStore((s) => s.unseenReport);
  const pending = useReadiness().pending.length;

  const item = (it: NavItem) => {
    const active = screen === it.id;
    const Icon = it.icon;
    const badge =
      it.id === "reports" && unseenReport && !active ? (
        <span className="ml-auto -rotate-3 rounded-sm bg-tomato px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-night">
          {t("sidebar.new")}
        </span>
      ) : it.id === "platforms" && pending > 0 ? (
        <span
          className={cn(
            "ml-auto shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide tabular-nums",
            active ? "bg-brass-ink/15 text-brass-ink" : "bg-warn/20 text-warn",
          )}
          title={t("sidebar.pending.title")}
        >
          {tp("sidebar.pending.count", pending)}
        </span>
      ) : (
        <span
          aria-hidden
          className={cn(
            "ml-auto hidden shrink-0 font-mono text-[10px] font-bold group-hover:inline group-focus-visible:inline",
            active ? "text-brass-ink/75" : "text-ink-faint",
          )}
        >
          {shortcutOf(it.id)}
        </span>
      );
    return (
      <button
        key={it.id}
        onClick={() => onNavigate(it.id)}
        onPointerEnter={() => onPreload?.(it.id)}
        onFocus={() => onPreload?.(it.id)}
        aria-current={active ? "page" : undefined}
        data-on-brass={active ? "" : undefined}
        title={shortcutOf(it.id)}
        className={cn(
          "group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-left transition",
          active
            ? "bg-brass text-brass-ink pop-brass"
            : "text-ink-muted hover:bg-surface-2 hover:text-ink",
        )}
      >
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-sm transition-colors",
            active
              ? "bg-brass-ink/15"
              : "bg-surface-2 group-hover:bg-surface-3",
          )}
        >
          <Icon className="size-4" strokeWidth={2.4} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="font-display text-base font-bold leading-tight">
            {t(it.labelKey)}
          </span>
          <span
            className={cn(
              "truncate text-xs font-medium",
              active ? "text-brass-ink/75" : "text-ink-faint",
            )}
          >
            {t(it.hintKey)}
          </span>
        </span>
        {badge}
      </button>
    );
  };

  const footer = (id: "settings" | "about", Icon: typeof Info) => (
    <button
      onClick={() => onNavigate(id)}
      onPointerEnter={() => onPreload?.(id)}
      onFocus={() => onPreload?.(id)}
      aria-current={screen === id ? "page" : undefined}
      title={shortcutOf(id)}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-semibold transition-colors",
        screen === id
          ? "bg-surface-2 text-ink"
          : "text-ink-faint hover:bg-surface-2 hover:text-ink-muted",
      )}
    >
      <Icon className="size-4" strokeWidth={2.3} />
      {t(id === "settings" ? "sidebar.settings" : "sidebar.about")}
      {id === "about" && (
        <span className="ml-auto text-[11px] font-bold text-brass">
          pitrol.dev
        </span>
      )}
    </button>
  );

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border-soft bg-panel p-4">
      <div className="mb-5 flex items-center gap-3 px-1 pt-1 [@media(max-height:680px)]:mb-3">
        <div className="brand-tile grid size-11 place-items-center rounded-lg bg-brass text-brass-ink">
          <Mascot className="size-6" />
        </div>
        <div>
          <div className="font-display text-2xl font-extrabold leading-none">
            Corneta
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
            multi-stream
          </div>
        </div>
      </div>

      <LiveStatus onOpen={() => onNavigate("golive")} />

      <nav
        className="mt-5 flex flex-col gap-1 [@media(max-height:680px)]:mt-3"
        aria-label={t("sidebar.aria")}
      >
        <GroupLabel>{t("sidebar.group.live")}</GroupLabel>
        {LIVE_NAV.map(item)}
        <GroupLabel className="mt-4 [@media(max-height:680px)]:mt-2">
          {t("sidebar.group.prepare")}
        </GroupLabel>
        {PREPARE_NAV.map(item)}
      </nav>

      {/* At the 600 px minimum height the footer only fits with the tighter spacing above. */}
      <div className="mt-auto flex flex-col gap-1 pt-4 [@media(max-height:680px)]:pt-1">
        {footer("settings", Settings)}
        {footer("about", Info)}
      </div>
    </aside>
  );
}

function GroupLabel({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "px-2.5 pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The live state stays at the top of the menu so it is visible from every screen. */
function LiveStatus({ onOpen }: { onOpen: () => void }) {
  const { t, fmt, locale } = useI18n();
  const state = useStore((s) => s.snapshot.state);
  const ingestLive = useStore((s) => s.snapshot.ingestLive ?? false);
  const startedAt = useStore((s) => s.snapshot.startedAt);
  const forcedBrb = useStore((s) => s.snapshot.forcedBrb ?? false);
  const targets = useStore((s) => s.snapshot.targets);
  const brbEnabled = useStore((s) => s.config?.settings.brbEnabled ?? false);
  const recordVideo = useStore((s) => s.config?.settings.recordVideo ?? false);
  const viewers = useStore((s) => s.viewers);
  const [brbBusy, setBrbBusy] = useState(false);
  const [markBusy, setMarkBusy] = useState(false);

  const live = state === "live";
  const now = useNow(live);
  const audience = live && showAudience(viewers);
  const activeTargets = live ? Object.values(targets).slice(0, 4) : [];

  const tone =
    state === "live"
      ? "bg-live text-white"
      : state === "starting"
        ? "bg-brass/15 text-brass"
        : state === "error"
          ? "bg-bad/15 text-bad"
          : "bg-surface-2 text-ink-muted hover:text-ink";
  const label =
    state === "live"
      ? t("sidebar.state.live")
      : state === "starting"
        ? t(
            ingestLive
              ? "sidebar.state.connectingTargets"
              : "sidebar.state.starting",
          )
        : state === "error"
          ? t("sidebar.state.error")
          : t("sidebar.state.stopped");

  const toggleBrb = async () => {
    if (brbBusy || (!brbEnabled && !forcedBrb)) return;
    setBrbBusy(true);
    try {
      await api.setForceBrb(!forcedBrb);
      toast.success(
        forcedBrb ? t("golive.brb.toast.back") : t("golive.brb.toast.on"),
      );
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setBrbBusy(false);
    }
  };

  const doMark = async () => {
    if (markBusy) return;
    setMarkBusy(true);
    try {
      const marks = await api.markMoment();
      announceMark(marks, { t, locale });
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setMarkBusy(false);
    }
  };

  if (!live) {
    return (
      <m.button
        layout
        onClick={onOpen}
        title={t(
          state === "stopped" ? "sidebar.start.title" : "sidebar.live.title",
        )}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        className={cn(
          "flex w-full flex-col gap-1 rounded-md px-3 py-2.5 text-left transition-colors",
          tone,
        )}
      >
        <span className="flex w-full items-center gap-2">
          <span
            className={cn(
              "size-2.5 shrink-0 rounded-full",
              state === "starting"
                ? "animate-pulse bg-brass"
                : state === "error"
                  ? "bg-bad"
                  : "bg-ink-faint",
            )}
          />
          <span className="min-w-0 flex-1 truncate font-display text-sm font-extrabold uppercase tracking-wide">
            {label}
          </span>
        </span>
      </m.button>
    );
  }

  return (
    <m.div
      layout
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      className="overflow-hidden rounded-lg border-2 border-live bg-surface pop"
    >
      <button
        type="button"
        onClick={onOpen}
        title={t("sidebar.live.title")}
        className="flex w-full flex-col gap-1 bg-live px-3 py-2 text-left text-white transition-opacity hover:opacity-95"
      >
        <span className="flex w-full items-center gap-2">
          <span className="live-dot size-2.5 shrink-0 rounded-full bg-white" />
          <span className="min-w-0 flex-1 truncate font-display text-sm font-extrabold uppercase tracking-wide">
            {forcedBrb ? t("sidebar.quick.brb") : label}
          </span>
          {startedAt && (
            <span className="font-display text-sm font-extrabold tabular-nums">
              {fmtUptime((now - startedAt) / 1000)}
            </span>
          )}
        </span>
        {(audience || recordVideo) && (
          <span className="flex w-full items-center justify-between gap-2 text-xs font-semibold text-white/90">
            {audience ? (
              <span
                className="flex items-center gap-1.5"
                title={audienceTooltip(viewers.items, { t, fmt })}
              >
                <Eye className="size-3.5" />
                <span className="font-display font-extrabold text-white">
                  {audienceTotal(viewers, fmt)}
                </span>
                {t("sidebar.viewers")}
              </span>
            ) : (
              <span />
            )}
            {recordVideo && (
              <span className="inline-flex items-center gap-1 rounded bg-black/35 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                <Circle className="size-2 fill-current" aria-hidden />
                {t("sidebar.quick.rec")}
              </span>
            )}
          </span>
        )}
      </button>

      {activeTargets.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-border-soft px-2.5 py-1.5 text-[11px] font-bold [@media(max-height:660px)]:hidden">
          {activeTargets.map((tg) => {
            const dotCls =
              tg.state === "error" || tg.state === "signal-lost"
                ? "text-bad"
                : tg.state === "reconnecting" || tg.state === "connecting"
                  ? "text-warn"
                  : tg.state === "live" || tg.state === "brb"
                    ? "text-ok"
                    : "text-ink-faint";
            return (
              <span
                key={tg.targetId}
                className={cn(
                  "inline-flex items-center gap-1 truncate",
                  dotCls,
                )}
                title={`${tg.name}: ${tg.state}`}
              >
                <span aria-hidden>●</span>
                <span className="max-w-16 truncate">{tg.name}</span>
              </span>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5 bg-surface-2 p-1.5 [@media(max-height:640px)]:hidden">
        <button
          type="button"
          disabled={brbBusy || (!brbEnabled && !forcedBrb)}
          onClick={() => void toggleBrb()}
          title={
            !brbEnabled && !forcedBrb
              ? t("golive.brb.armHint.title")
              : forcedBrb
                ? t("golive.brb.title.back")
                : t("golive.brb.title.on")
          }
          className={cn(
            "inline-flex h-7 items-center justify-center gap-1 rounded px-1.5 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
            forcedBrb
              ? "bg-tomato text-night"
              : "bg-surface text-ink hover:bg-surface-3",
          )}
        >
          {forcedBrb ? (
            <Play className="size-3 shrink-0" />
          ) : (
            <Pause className="size-3 shrink-0" />
          )}
          <span className="truncate">
            {forcedBrb ? t("sidebar.quick.back") : t("sidebar.quick.brb")}
          </span>
        </button>
        <button
          type="button"
          disabled={markBusy}
          onClick={() => void doMark()}
          title={t("chat.markMoment.title")}
          className="inline-flex h-7 items-center justify-center gap-1 rounded bg-brass px-1.5 text-[11px] font-extrabold text-brass-ink transition-colors hover:bg-brass-strong disabled:opacity-50"
        >
          <MapPin className="size-3 shrink-0" />
          <span className="truncate">{t("sidebar.quick.mark")}</span>
        </button>
      </div>
    </m.div>
  );
}
