import { m } from "framer-motion";
import {
  BarChart3,
  Eye,
  Info,
  MessageSquare,
  Radio,
  Settings,
  Sliders,
  Tv2,
  Users,
} from "lucide-react";
import { cn, fmtUptime } from "../lib/utils";
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
  const { t } = useI18n();
  const unseenReport = useStore((s) => s.unseenReport);
  const pending = useReadiness().pending.length;

  const item = (it: NavItem) => {
    const active = screen === it.id;
    const Icon = it.icon;
    const badge =
      it.id === "reports" && unseenReport && !active ? (
        <span className="ml-auto -rotate-3 rounded-sm bg-tomato px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
          {t("sidebar.new")}
        </span>
      ) : it.id === "platforms" && pending > 0 ? (
        <span
          className={cn(
            "ml-auto size-2.5 shrink-0 rounded-full",
            active ? "bg-brass-ink" : "bg-warn",
          )}
          title={t("sidebar.pending.title")}
        >
          <span className="sr-only">{t("sidebar.pending.title")}</span>
        </span>
      ) : null;
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
      <div className="mb-5 flex items-center gap-3 px-1 pt-1">
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

      <nav className="mt-5 flex flex-col gap-1" aria-label={t("sidebar.aria")}>
        <GroupLabel>{t("sidebar.group.live")}</GroupLabel>
        {LIVE_NAV.map(item)}
        <GroupLabel className="mt-4">{t("sidebar.group.prepare")}</GroupLabel>
        {PREPARE_NAV.map(item)}
      </nav>

      <div className="mt-auto flex flex-col gap-1 pt-4">
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
  const { t, fmt } = useI18n();
  const state = useStore((s) => s.snapshot.state);
  const ingestLive = useStore((s) => s.snapshot.ingestLive ?? false);
  const startedAt = useStore((s) => s.snapshot.startedAt);
  const viewers = useStore((s) => s.viewers);
  const live = state === "live";
  const now = useNow(live);
  const audience = live && showAudience(viewers);

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
        live && "-rotate-1 pop",
      )}
    >
      <span className="flex w-full items-center gap-2">
        <span
          className={cn(
            "size-2.5 shrink-0 rounded-full",
            state === "live"
              ? "live-dot bg-white"
              : state === "starting"
                ? "animate-pulse bg-brass"
                : state === "error"
                  ? "bg-bad"
                  : "bg-ink-faint",
          )}
        />
        <span className="min-w-0 flex-1 truncate font-display text-sm font-extrabold uppercase tracking-wide">
          {label}
        </span>
        {live && startedAt && (
          <span className="font-display text-sm font-extrabold tabular-nums">
            {fmtUptime((now - startedAt) / 1000)}
          </span>
        )}
      </span>
      {audience && (
        <span
          className="flex items-center gap-1.5 text-xs font-semibold text-white/85"
          title={audienceTooltip(viewers.items, { t, fmt })}
        >
          <Eye className="size-3.5" />
          <span className="font-display font-extrabold text-white">
            {audienceTotal(viewers, fmt)}
          </span>
          {t("sidebar.viewers")}
        </span>
      )}
    </m.button>
  );
}
