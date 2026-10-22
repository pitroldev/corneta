import { memo, useMemo } from "react";
import { cn } from "../lib/utils";
import { useI18n, type I18n, type MessageKey } from "../lib/i18n";
import { PlatformGlyph } from "./ui";
import { ChatFragments } from "./ChatFragments";
import type { Alert, AlertKind, PlatformId } from "../lib/types";

const ORIGIN: Record<string, string> = {
  streamlabs: "Streamlabs",
  streamelements: "StreamElements",
};

// Alert kinds are backend enum values, not display copy.
const KIND_META: Record<
  AlertKind,
  { emoji: string; verbKey: MessageKey; accent: string }
> = {
  follow: { emoji: "💜", verbKey: "chat.alerts.verb.follow", accent: "info" },
  sub: { emoji: "⭐", verbKey: "chat.alerts.verb.sub", accent: "brass" },
  resub: { emoji: "🔁", verbKey: "chat.alerts.verb.resub", accent: "brass" },
  subgift: {
    emoji: "🎁",
    verbKey: "chat.alerts.verb.subgift",
    accent: "tomato",
  },
  bits: { emoji: "💎", verbKey: "chat.alerts.verb.bits", accent: "brass" },
  tip: { emoji: "💰", verbKey: "chat.alerts.verb.tip", accent: "ok" },
  raid: { emoji: "🚀", verbKey: "chat.alerts.verb.raid", accent: "info" },
  member: { emoji: "🏅", verbKey: "chat.alerts.verb.member", accent: "ok" },
  superchat: {
    emoji: "💬",
    verbKey: "chat.alerts.verb.superchat",
    accent: "brass",
  },
  upgrade: {
    emoji: "⏫",
    verbKey: "chat.alerts.verb.upgrade",
    accent: "brass",
  },
  payforward: {
    emoji: "🤝",
    verbKey: "chat.alerts.verb.payforward",
    accent: "tomato",
  },
  streak: { emoji: "🔥", verbKey: "chat.alerts.verb.streak", accent: "info" },
  charity: { emoji: "💚", verbKey: "chat.alerts.verb.charity", accent: "ok" },
  gift: { emoji: "🎀", verbKey: "chat.alerts.verb.gift", accent: "tomato" },
  kicks: { emoji: "🟩", verbKey: "chat.alerts.verb.kicks", accent: "ok" },
  reward: { emoji: "🎟️", verbKey: "chat.alerts.verb.reward", accent: "info" },
  milestone: {
    emoji: "🏆",
    verbKey: "chat.alerts.verb.milestone",
    accent: "brass",
  },
};

const money = (a: Alert) =>
  a.amount ? `${a.currency ? a.currency + " " : ""}${a.amount}` : "";

const ACCENT: Record<string, { bar: string }> = {
  brass: { bar: "border-brass" },
  tomato: { bar: "border-tomato" },
  info: { bar: "border-info" },
  ok: { bar: "border-ok" },
};

/** Platform-provided tier labels are displayed verbatim. */
function detail(a: Alert, i18n: Pick<I18n, "t" | "tp">): string {
  const months = (n: number) => i18n.tp("chat.alerts.detail.months", n);
  switch (a.kind) {
    case "bits":
      return a.amount ? i18n.t("chat.alerts.detail.bits", { n: a.amount }) : "";
    case "resub":
      return [a.amount ? months(a.amount) : "", a.tier]
        .filter(Boolean)
        .join(" · ");
    case "sub":
      return a.tier ?? "";
    case "subgift":
      return i18n.tp("chat.alerts.detail.subs", a.amount ?? 1);
    case "raid":
      return a.amount
        ? i18n.t("chat.alerts.detail.raidViewers", { n: a.amount })
        : "";
    case "member":
      return [a.tier, a.amount && a.amount > 1 ? months(a.amount) : ""]
        .filter(Boolean)
        .join(" · ");
    case "superchat":
    case "tip":
    case "charity":
      // The platform's own amount text (localized) when it has one.
      return a.title && a.kind === "superchat" && !a.image ? a.title : money(a);
    case "gift":
      return a.currency === "JEWELS" && a.amount
        ? i18n.t("chat.alerts.detail.jewels", { n: a.amount })
        : "";
    case "kicks":
      return a.amount
        ? i18n.t("chat.alerts.detail.kicks", { n: a.amount })
        : "";
    case "streak":
      return a.amount ? i18n.tp("chat.alerts.detail.streak", a.amount) : "";
    case "milestone":
      return a.amount ? String(a.amount) : "";
    default:
      return "";
  }
}

const AlertRow = memo(function AlertRow({
  a,
  fontSize,
}: {
  a: Alert;
  fontSize: number;
}) {
  const { t, tp } = useI18n();
  const meta = KIND_META[a.kind];
  const accent = ACCENT[meta.accent] ?? ACCENT.brass;
  const d = detail(a, { t, tp });
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
