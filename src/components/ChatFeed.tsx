import { memo, useEffect, useRef, useState } from "react";
import { ArrowDown, MessageSquare } from "lucide-react";
import { cn } from "../lib/utils";
import type { ChatMessage } from "../lib/types";
import { PlatformGlyph } from "./ui";

export interface ChatView {
  emotes: boolean;
  badges: boolean;
  platform: boolean;
  source: boolean;
  timestamps: boolean;
  /** Tamanho da fonte do feed, em pixels. */
  fontSize: number;
}

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

/** Feed rolável com auto-scroll (pausa ao rolar pra cima). Compartilhado pela
 *  tela de Chat e pela janela flutuante. */
export function ChatFeed({
  messages,
  view,
  connected,
  allFilteredOut,
  className,
}: {
  messages: ChatMessage[];
  view: ChatView;
  connected: boolean;
  /** Há mensagens, mas o filtro escondeu todas (vazio diferente de "sem chat"). */
  allFilteredOut?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [paused, setPaused] = useState(false);
  const [missed, setMissed] = useState(0);
  const prevLen = useRef(messages.length);

  // Depende de `messages` (não de .length): quando o feed bate o teto e uma msg
  // antiga sai, o tamanho não muda mas a referência sim — senão o follow trava.
  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) {
      el.scrollTop = el.scrollHeight;
    } else {
      const delta = messages.length - prevLen.current;
      if (delta > 0) setMissed((n) => n + delta);
    }
    prevLen.current = messages.length;
  }, [messages]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    stick.current = atBottom;
    setPaused(!atBottom);
  };

  const jumpToBottom = () => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stick.current = true;
    setPaused(false);
    setMissed(0);
  };

  return (
    <div className={cn("relative min-h-0", className)}>
      <div
        ref={ref}
        onScroll={onScroll}
        style={{ fontSize: view.fontSize }}
        className="h-full overflow-y-auto py-2 [scrollbar-gutter:stable]"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <MessageSquare className="size-8 text-ink-faint" />
            <div className="font-display text-lg font-bold">
              {allFilteredOut
                ? "Filtro escondeu tudo"
                : connected
                  ? "Esperando mensagens…"
                  : "Chat desconectado"}
            </div>
            <div className="max-w-sm text-sm text-ink-muted">
              {allFilteredOut
                ? "Você desligou todas as plataformas. Religa um chip ali em cima pra ver o chat de novo."
                : connected
                  ? "Assim que a galera mandar mensagem, aparece aqui."
                  : "Escolha ao menos uma plataforma e clique em Conectar pra puxar o chat."}
            </div>
          </div>
        ) : (
          messages.map((m) => <MsgRow key={m.id} m={m} view={view} />)
        )}
      </div>

      {/* Aparece ao rolar pra cima — volta a acompanhar o chat (útil em chat rápido). */}
      {paused && messages.length > 0 && (
        <button
          onClick={jumpToBottom}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border-2 border-brass-ink bg-brass px-3 py-1 text-xs font-extrabold text-brass-ink shadow-[2px_2px_0_0_rgba(0,0,0,0.35)] transition-transform hover:scale-105"
        >
          <ArrowDown className="size-3.5" strokeWidth={2.6} /> Acompanhar chat
          {missed > 0 ? ` · +${missed}` : ""}
        </button>
      )}
    </div>
  );
}

const MsgRow = memo(function MsgRow({
  m,
  view,
}: {
  m: ChatMessage;
  view: ChatView;
}) {
  if (m.deleted) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-1 leading-snug">
        <span className="shrink-0 rounded-sm bg-bad/15 px-1 text-[9px] font-extrabold uppercase leading-4 text-bad">
          removida
        </span>
        <span className="font-bold line-through opacity-60" style={m.color ? { color: m.color } : undefined}>
          {m.author}
        </span>
        <span className="text-ink-faint line-through opacity-60">um moderador apagou esta mensagem</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-start gap-1.5 px-3 py-1 leading-snug hover:bg-surface-2">
      {view.timestamps && (
        <span className="mt-0.5 shrink-0 text-[10px] tabular-nums text-ink-faint">
          {fmtTime(m.ts)}
        </span>
      )}
      {view.platform && (
        <span className="mt-0.5 shrink-0">
          <PlatformGlyph id={m.platform} size={15} />
        </span>
      )}
      {view.source && m.source && (
        <span className="mt-0.5 shrink-0 rounded bg-surface-3 px-1 text-[9px] font-bold uppercase leading-4 text-ink-faint">
          {m.source}
        </span>
      )}
      {view.badges &&
        m.badges.map((b, i) => (
          <span
            key={i}
            className={cn(
              "mt-0.5 shrink-0 rounded px-1 text-[9px] font-extrabold uppercase leading-4",
              badgeColor(b.kind),
            )}
          >
            {b.label}
          </span>
        ))}
      <span
        className="shrink-0 font-bold"
        style={m.color ? { color: m.color } : undefined}
      >
        {m.author}
      </span>
      <span className="min-w-0 break-words text-ink-muted">
        {m.fragments.map((f, i) =>
          f.kind === "emote" && view.emotes && f.url ? (
            <img
              key={i}
              src={f.url}
              alt={f.text}
              title={f.text}
              className="mx-0.5 inline-block h-5 w-auto align-middle"
              loading="lazy"
            />
          ) : (
            <span key={i}>{f.text}</span>
          ),
        )}
      </span>
    </div>
  );
});

function badgeColor(kind: string): string {
  switch (kind) {
    case "broadcaster":
      return "bg-tomate text-white";
    case "moderator":
      return "bg-[#22c55e] text-white";
    case "vip":
      return "bg-[#e879f9] text-white";
    case "subscriber":
      return "bg-brass text-brass-ink";
    case "staff":
    case "partner":
      return "bg-[#7c9cff] text-white";
    default:
      return "bg-surface-3 text-ink-muted";
  }
}
