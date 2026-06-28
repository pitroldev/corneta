import { memo, useMemo } from "react";
import { cn } from "../lib/utils";
import { PlatformGlyph } from "./ui";
import type { Alert, AlertKind, PlatformId } from "../lib/types";

// Origem agregadora (não é plataforma de chat) → mostra o nome no lugar do glifo.
const ORIGIN: Record<string, string> = {
  streamlabs: "Streamlabs",
  streamelements: "StreamElements",
};

const KIND_META: Record<AlertKind, { emoji: string; verb: string; accent: string }> = {
  follow: { emoji: "💜", verb: "seguiu", accent: "info" },
  sub: { emoji: "⭐", verb: "se inscreveu", accent: "brass" },
  resub: { emoji: "🔁", verb: "renovou a inscrição", accent: "brass" },
  subgift: { emoji: "🎁", verb: "presenteou", accent: "tomate" },
  bits: { emoji: "💎", verb: "mandou bits", accent: "brass" },
  tip: { emoji: "💰", verb: "doou", accent: "ok" },
  raid: { emoji: "🚀", verb: "trouxe um raid", accent: "info" },
  member: { emoji: "🏅", verb: "virou membro", accent: "ok" },
  superchat: { emoji: "💬", verb: "mandou um Super Chat", accent: "brass" },
};

const ACCENT: Record<string, { bar: string }> = {
  brass: { bar: "border-brass" },
  tomate: { bar: "border-tomate" },
  info: { bar: "border-info" },
  ok: { bar: "border-ok" },
};

/** Detalhe (valor/quantidade) por tipo de alerta. */
function detail(a: Alert): string {
  const months = (n: number) => `${n} ${n === 1 ? "mês" : "meses"}`;
  switch (a.kind) {
    case "bits":
      return a.amount ? `${a.amount} bits` : "";
    case "resub":
      return [a.amount ? months(a.amount) : "", a.tier].filter(Boolean).join(" · ");
    case "sub":
      return a.tier ?? "";
    case "subgift":
      return a.amount && a.amount > 1 ? `${a.amount} subs` : "1 sub";
    case "raid":
      return a.amount ? `${a.amount} viewers` : "";
    case "member":
      return [a.tier, a.amount && a.amount > 1 ? months(a.amount) : ""].filter(Boolean).join(" · ");
    case "superchat":
    case "tip":
      return a.amount ? `${a.currency ? a.currency + " " : ""}${a.amount}` : "";
    default:
      return "";
  }
}

const AlertRow = memo(function AlertRow({ a }: { a: Alert }) {
  const meta = KIND_META[a.kind];
  const accent = ACCENT[meta.accent] ?? ACCENT.brass;
  const d = detail(a);
  return (
    <div className={cn("flex items-start gap-2 rounded-sm border-l-4 bg-surface-2 px-2.5 py-2", accent.bar)}>
      <span className="text-lg leading-none">{meta.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {ORIGIN[a.platform] ? (
            <span className="shrink-0 rounded-sm bg-surface-3 px-1 text-[9px] font-bold uppercase tracking-wide text-ink-faint">
              {ORIGIN[a.platform]}
            </span>
          ) : (
            <PlatformGlyph id={a.platform as PlatformId} size={13} />
          )}
          <span className="truncate text-sm font-bold">{a.user}</span>
        </div>
        <div className="text-xs text-ink-muted">
          {meta.verb}
          {d && <span className="font-bold text-ink"> · {d}</span>}
        </div>
        {a.message && (
          <div className="mt-0.5 truncate text-xs italic text-ink-faint" title={a.message}>
            “{a.message}”
          </div>
        )}
      </div>
    </div>
  );
});

/** Feed dos alertas (mais novo no topo). */
export function AlertsFeed({ alerts, className }: { alerts: Alert[]; className?: string }) {
  const list = useMemo(() => [...alerts].reverse(), [alerts]);
  return (
    <div className={cn("overflow-y-auto [scrollbar-gutter:stable]", className)}>
      {list.length === 0 ? (
        <div className="grid h-full place-items-center p-5 text-center text-sm text-ink-faint">
          <div>
            <div className="mb-1 text-2xl">🔔</div>
            Inscrições, gifts, bits, raids e super chats de todas as plataformas aparecem aqui.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 p-2">
          {list.map((a) => (
            <AlertRow key={a.id} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}
