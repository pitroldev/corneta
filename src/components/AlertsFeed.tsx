import { memo, useMemo } from "react";
import { cn } from "../lib/utils";
import { useI18n, type I18n, type MessageKey } from "../lib/i18n";
import { PlatformGlyph } from "./ui";
import type { Alert, AlertKind, PlatformId } from "../lib/types";

// Origem agregadora (não é plataforma de chat) → mostra o nome no lugar do glifo.
const ORIGIN: Record<string, string> = {
  streamlabs: "Streamlabs",
  streamelements: "StreamElements",
};

// A CHAVE é o enum do alerta (vem do backend) — só o verbo é texto de tela.
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
    accent: "tomate",
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
};

const ACCENT: Record<string, { bar: string }> = {
  brass: { bar: "border-brass" },
  tomate: { bar: "border-tomate" },
  info: { bar: "border-info" },
  ok: { bar: "border-ok" },
};

/** Detalhe (valor/quantidade) por tipo de alerta. `a.tier` vem da plataforma
 *  ("Tier 1", "Prime") — é rótulo dela, não copy nossa, e passa cru. */
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
      return a.amount ? `${a.currency ? a.currency + " " : ""}${a.amount}` : "";
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
        </div>
        {(a.fragments?.length || a.message) && (
          <div
            className="mt-0.5 truncate italic text-ink-faint"
            style={{ fontSize: "0.85em" }}
            title={a.message}
          >
            “
            {a.fragments?.length
              ? a.fragments.map((f, i) =>
                  f.kind === "emote" && f.url ? (
                    <img
                      key={i}
                      src={f.url}
                      alt={f.text}
                      title={f.text}
                      className="mx-0.5 inline-block h-[1.4em] w-auto not-italic align-middle"
                      loading="lazy"
                    />
                  ) : (
                    <span key={i}>{f.text}</span>
                  ),
                )
              : a.message}
            ”
          </div>
        )}
      </div>
    </div>
  );
});

/** Feed dos alertas (mais novo no topo). */
export function AlertsFeed({
  alerts,
  className,
  fontSize = 14,
}: {
  alerts: Alert[];
  className?: string;
  /** Tamanho base da fonte das linhas, em pixels (proporções escalam a partir daqui). */
  fontSize?: number;
}) {
  const { t } = useI18n();
  const list = useMemo(() => [...alerts].reverse(), [alerts]);
  // role="log" + aria-live: doação, raid e sub são anunciados quando chegam.
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
