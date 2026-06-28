import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
  const lastId = useRef<string | undefined>(messages[messages.length - 1]?.id);

  const virt = useVirtualizer({
    count: messages.length,
    getScrollElement: () => ref.current,
    estimateSize: () => 28,
    overscan: 12,
    getItemKey: (i) => messages[i].id,
  });
  const totalSize = virt.getTotalSize();

  useLayoutEffect(() => {
    if (stick.current && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [totalSize]);

  useEffect(() => {
    const newLast = messages[messages.length - 1];
    if (stick.current) {
      lastId.current = newLast?.id;
      return;
    }
    if (newLast && newLast.id !== lastId.current) {
      const idx = messages.findIndex((m) => m.id === lastId.current);
      if (idx >= 0) {
        const added = messages.length - 1 - idx;
        if (added > 0) setMissed((n) => n + added);
      }
      lastId.current = newLast.id;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    stick.current = atBottom;
    setPaused(!atBottom);
    if (atBottom) {
      setMissed(0);
      lastId.current = messages[messages.length - 1]?.id;
    }
  };

  const jumpToBottom = () => {
    stick.current = true;
    setPaused(false);
    setMissed(0);
    lastId.current = messages[messages.length - 1]?.id;
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
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
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <ChatFunnel />
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
          <div style={{ height: virt.getTotalSize(), position: "relative", width: "100%" }}>
            {virt.getVirtualItems().map((vi) => (
              <div
                key={vi.key}
                data-index={vi.index}
                ref={virt.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                <MsgRow m={messages[vi.index]} view={view} />
              </div>
            ))}
          </div>
        )}
      </div>

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
        <span
          className="font-bold line-through opacity-60"
          style={m.color ? { color: m.color } : undefined}
        >
          {m.author}
        </span>
        <span className="text-ink-faint line-through opacity-60">
          um moderador apagou esta mensagem
        </span>
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

// Estado vazio: os 3 chats (Twitch/Kick/YouTube) afunilam num feed só — a cara da tela.
function ChatFunnel() {
  return (
    <div className="flex items-center gap-1" aria-hidden>
      <div className="flex flex-col gap-1.5">
        <PlatformGlyph id="twitch" size={20} />
        <PlatformGlyph id="kick" size={20} />
        <PlatformGlyph id="youtube" size={20} />
      </div>
      <svg viewBox="0 0 44 72" className="h-[4.5rem] w-11 text-brass" fill="none" aria-hidden>
        <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12 C26 12 20 36 36 36" />
          <path d="M4 36 H36" />
          <path d="M4 60 C26 60 20 36 36 36" />
          <path d="M29 30 L37 36 L29 42" />
        </g>
      </svg>
      <div className="grid size-11 place-items-center rounded-md bg-brass-ink text-brass pop">
        <MessageSquare className="size-5" />
      </div>
    </div>
  );
}

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
