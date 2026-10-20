import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, Pause, Play, Square } from "lucide-react";
import { api } from "../../lib/api";
import { useStore } from "../../lib/store";
import { toast } from "../../lib/toast";
import { cn, errMsg } from "../../lib/utils";
import { useT } from "../../lib/i18n";
import type { TargetState } from "../../lib/types";
import { Button } from "../../components/ui";

export function BrbNowButton({
  live,
  size = "sm",
}: {
  live: boolean;
  size?: "sm" | "md";
}) {
  const t = useT();
  const settings = useStore((s) => s.config!.settings);
  const forced = useStore((s) => s.snapshot.forcedBrb ?? false);
  const [busy, setBusy] = useState(false);
  const armed = settings.brbEnabled || settings.guardianEnabled;

  // Keep the resume action available even if BRB is disabled while a manual pause is active.
  if (!armed && !forced) {
    return live ? (
      <Button
        variant="subtle"
        size={size}
        disabled
        title={t("golive.brb.armHint.title")}
        aria-label={t("golive.brb.armHint.title")}
      >
        <Pause className="size-4" /> {t("golive.brb.now")}
      </Button>
    ) : null;
  }

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.setForceBrb(!forced);
      toast.success(
        forced ? t("golive.brb.toast.back") : t("golive.brb.toast.on"),
      );
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant={forced ? "primary" : "subtle"}
      size={size}
      onClick={toggle}
      disabled={!live || busy}
      title={
        live
          ? forced
            ? t("golive.brb.title.back")
            : t("golive.brb.title.on")
          : t("golive.onlyWhenLive")
      }
    >
      {forced ? <Play className="size-4" /> : <Pause className="size-4" />}
      {forced ? t("golive.brb.back") : t("golive.brb.now")}
    </Button>
  );
}

export function OptionCheck({
  checked,
  onToggle,
  title,
  desc,
  className,
}: {
  checked: boolean;
  onToggle: () => void;
  title: string;
  desc: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={cn(
        "mt-2.5 flex w-full items-center gap-2 rounded-md bg-surface-2 px-2.5 py-2 text-left",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded border-2 transition-colors",
          checked
            ? "border-brass bg-brass text-brass-ink"
            : "border-border text-transparent",
        )}
      >
        <Check className="size-3.5" strokeWidth={3} />
      </span>
      <span className="text-xs leading-snug">
        <strong className="text-ink">{title}</strong>
        <span className="text-ink-faint">{desc}</span>
      </span>
    </button>
  );
}

export function CheckRow({
  label,
  ok,
  warn,
  detail,
  action,
}: {
  label: string;
  ok?: boolean;
  warn?: boolean;
  detail?: string;
  action?: ReactNode;
}) {
  const t = useT();
  const Icon = ok ? Check : warn ? AlertTriangle : Square;
  const cls = ok ? "text-ok" : warn ? "text-warn" : "text-bad";
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
      <Icon className={cn("size-4 shrink-0", cls)} strokeWidth={2.4} />
      <span className="sr-only">
        {t(
          ok
            ? "golive.checkup.state.ok"
            : warn
              ? "golive.checkup.state.warn"
              : "golive.checkup.state.bad",
        )}
      </span>
      <span className="font-semibold">{label}</span>
      {detail && <span className="text-xs text-ink-faint">· {detail}</span>}
      {action}
    </div>
  );
}

export function StatePill({ state }: { state: TargetState }) {
  const t = useT();
  const map: Record<TargetState, { label: string; cls: string; dot: string }> =
    {
      idle: {
        label: t("golive.state.idle"),
        cls: "text-ink-faint",
        dot: "bg-ink-faint",
      },
      connecting: {
        label: t("golive.state.connecting"),
        cls: "text-warn",
        dot: "bg-warn animate-pulse",
      },
      live: {
        label: t("golive.state.live"),
        cls: "text-ok",
        dot: "bg-live",
      },
      reconnecting: {
        label: t("golive.state.reconnecting"),
        cls: "text-warn",
        dot: "bg-warn animate-pulse",
      },
      error: { label: t("golive.state.error"), cls: "text-bad", dot: "bg-bad" },
      paused: {
        label: t("golive.state.paused"),
        cls: "text-ink-muted",
        dot: "bg-ink-faint",
      },
      waiting: {
        label: t("golive.state.waiting"),
        cls: "text-info",
        dot: "bg-info animate-pulse",
      },
      "signal-lost": {
        label: t("golive.state.signalLost"),
        cls: "text-bad",
        dot: "bg-bad animate-pulse",
      },
      brb: {
        label: t("golive.state.brb"),
        cls: "text-brass",
        dot: "bg-brass animate-pulse",
      },
      censor: {
        label: t("golive.state.censor"),
        cls: "text-bad",
        dot: "bg-bad animate-pulse",
      },
    };
  const m = map[state] ?? map.idle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide",
        m.cls,
      )}
    >
      <span className={cn("size-2 rounded-full", m.dot)} /> {m.label}
    </span>
  );
}

export function MiniStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="text-right">
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
        {label}
      </div>
      <div
        className={cn(
          "font-display text-base font-extrabold tabular-nums",
          tone === "warn" ? "text-warn" : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function Usage({ label, value }: { label: string; value?: number }) {
  const pct = value ?? 0;
  const tone = pct > 85 ? "bg-bad" : pct > 60 ? "bg-warn" : "bg-ok";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      <div className="h-2 w-24 overflow-hidden rounded-sm bg-surface">
        <div
          className={cn(
            "h-full rounded-sm transition-[width] duration-500",
            tone,
          )}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className="w-12 font-display text-sm font-bold tabular-nums">
        {value == null ? "—" : `${value}%`}
      </span>
    </div>
  );
}
