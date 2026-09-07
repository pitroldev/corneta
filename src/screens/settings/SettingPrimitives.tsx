import { type ReactNode } from "react";
import { Badge } from "../../components/ui";
import { useT } from "../../lib/i18n";
import { cn } from "../../lib/utils";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
      {label}
      {children}
    </label>
  );
}

export function SubSettings({ children }: { children: ReactNode }) {
  return (
    <div className="-mt-1 mb-3 ml-1 rounded-md border-l-2 border-brass/30 bg-surface-2/40 px-3">
      {children}
    </div>
  );
}

export function SecurityFeature({
  preview,
  on,
  title,
  desc,
  badge,
  children,
}: {
  preview: ReactNode;
  on: boolean;
  title: string;
  desc: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-4 py-4">
      <div
        className={cn(
          "relative aspect-video w-32 shrink-0 overflow-hidden rounded-md transition",
          on
            ? "pop-brass ring-2 ring-brass"
            : "opacity-60 grayscale ring-1 ring-border",
        )}
      >
        {preview}
        {!on && (
          <div className="absolute inset-0 grid place-items-center bg-night/45">
            <span className="rounded-sm bg-surface-3/90 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-ink-faint">
              {t("settings.safety.state.off")}
            </span>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 font-display font-bold">
          {title}
          {badge}
          {on && (
            <Badge tone="brass" className="text-[10px]">
              {t("settings.safety.state.armed")}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 text-sm text-ink-muted">{desc}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingRow({
  title,
  desc,
  badge,
  children,
}: {
  title: string;
  desc?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div>
        <div className="flex items-center gap-2 font-display font-bold">
          {title}
          {badge}
        </div>
        {desc && (
          <div className="mt-0.5 max-w-xl text-sm text-ink-muted">{desc}</div>
        )}
      </div>
      {children}
    </div>
  );
}

export function RecordGroup({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-xs font-extrabold tracking-wide text-ink-faint uppercase [&>svg]:text-brass">
      {icon}
      {children}
    </div>
  );
}
