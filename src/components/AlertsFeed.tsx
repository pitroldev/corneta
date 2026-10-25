import { memo, useMemo } from "react";
import { cn } from "../lib/utils";
import { useI18n } from "../lib/i18n";
import { ALERT_KIND_META, alertDetail } from "../lib/alertText";
import { PlatformGlyph } from "./ui";
import { ChatFragments } from "./ChatFragments";
import type { Alert, PlatformId } from "../lib/types";

const ORIGIN: Record<string, string> = {
  streamlabs: "Streamlabs",
  streamelements: "StreamElements",
};

const ACCENT: Record<string, { bar: string }> = {
  brass: { bar: "border-brass" },
  tomato: { bar: "border-tomato" },
  info: { bar: "border-info" },
  ok: { bar: "border-ok" },
};

const AlertRow = memo(function AlertRow({
  a,
  fontSize,
}: {
  a: Alert;
  fontSize: number;
}) {
  const { t, tp } = useI18n();
  const meta = ALERT_KIND_META[a.kind];
  const accent = ACCENT[meta.accent] ?? ACCENT.brass;
  const d = alertDetail(a, { t, tp });
  return (
    <div
      style={{ fontSize }}
      className={cn(
        "flex items-start gap-2 rounded-sm border-l-4 bg-surface-2 px-2.5 py-2",
        accent.bar,
      )}
    >
      <span className="leading-none" style={{ fontSize: "1.25em" }} aria-hidden>
        {meta.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {ORIGIN[a.platform] ? (
            <span className="shrink-0 rounded-sm bg-surface-3 px-1 text-[0.62em] font-bold uppercase tracking-wide text-ink-faint">
              {ORIGIN[a.platform]}
            </span>
          ) : (
            <PlatformGlyph id={a.platform as PlatformId} size={13} />
          )}
          <span className="truncate font-bold leading-tight">{a.user}</span>
        </div>
        <div className="text-ink-muted" style={{ fontSize: "0.85em" }}>
          {t(meta.verbKey)}
          {d && <span className="font-bold text-ink"> · {d}</span>}
          {/* Rewards, gifts, charities and upgrades name what was given. */}
          {a.title && a.kind !== "superchat" && (
            <span className="text-ink"> · {a.title}</span>
          )}
          {a.title && a.kind === "superchat" && a.image && (
            <span className="text-ink"> · {a.title}</span>
          )}
        </div>
        {a.image && (
          <img
            src={a.image}
            alt={a.title ?? ""}
            title={a.title}
            loading="lazy"
            className="mt-1 max-h-20 w-auto rounded-md"
          />
        )}
        {(a.fragments?.length || a.message) && (
          <div
            className="mt-0.5 truncate italic text-ink-faint"
            style={{ fontSize: "0.85em" }}
            title={a.message}
          >
            “
            {a.fragments?.length ? (
              <ChatFragments fragments={a.fragments} />
            ) : (
              a.message
            )}
            ”
          </div>
        )}
      </div>
    </div>
  );
});

export function AlertsFeed({
  alerts,
  className,
  fontSize = 14,
}: {
  alerts: Alert[];
  className?: string;
  /** Base row font size in pixels. */
  fontSize?: number;
}) {
  const { t } = useI18n();
  const list = useMemo(() => [...alerts].reverse(), [alerts]);
  return (
    <div
      role="log"
      aria-live="polite"
      aria-label={t("chat.alerts.button")}
      className={cn("overflow-y-auto [scrollbar-gutter:stable]", className)}
    >
      {list.length === 0 ? (
        <div className="grid h-full place-items-center p-5 text-center text-sm text-ink-faint">
          <div>
            <div className="mb-1 text-2xl" aria-hidden>
              🔔
            </div>
            {t("chat.alerts.empty")}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 p-2">
          {list.map((a) => (
            <AlertRow key={a.id} a={a} fontSize={fontSize} />
          ))}
        </div>
      )}
    </div>
  );
}
