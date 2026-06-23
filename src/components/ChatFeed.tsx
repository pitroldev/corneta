import { useEffect, useRef } from "react";
import { MessageSquare } from "lucide-react";
import { cn } from "../lib/utils";
import type { ChatMessage } from "../lib/types";
import { PlatformGlyph } from "./ui";

export interface ChatView {
  emotes: boolean;
  badges: boolean;
  platform: boolean;
  source: boolean;
  timestamps: boolean;
  fontSize: "sm" | "md" | "lg";
}

const FONT_CLASS = { sm: "text-xs", md: "text-sm", lg: "text-base" } as const;

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Feed rolável com auto-scroll (pausa ao rolar pra cima). Compartilhado pela
 *  tela de Chat e pela janela flutuante. */
export function ChatFeed({
  messages,
  view,
  connected,
  className,
}: {
  messages: ChatMessage[];
  view: ChatView;
  connected: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className={cn(
        "overflow-y-auto py-2 [scrollbar-gutter:stable]",
        FONT_CLASS[view.fontSize],
        className
      )}
    >
      {messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
          <MessageSquare className="size-8 text-ink-faint" />
          <div className="font-display text-lg font-bold">
            {connected ? "Esperando mensagens…" : "Chat desconectado"}
          </div>
          <div className="max-w-sm text-sm text-ink-muted">
            {connected
              ? "Assim que a galera mandar mensagem, aparece aqui."
              : "Configure ao menos uma fonte e clique em Conectar."}
          </div>
        </div>
      ) : (
        messages.map((m) => <MsgRow key={m.id} m={m} view={view} />)
      )}
    </div>
  );
}

function MsgRow({ m, view }: { m: ChatMessage; view: ChatView }) {
  return (
    <div className="flex flex-wrap items-start gap-1.5 px-3 py-1 leading-snug hover:bg-surface-2">
      {view.timestamps && (
        <span className="mt-0.5 shrink-0 text-[10px] tabular-nums text-ink-faint">{fmtTime(m.ts)}</span>
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
              badgeColor(b.kind)
            )}
          >
            {b.label}
          </span>
        ))}
      <span className="shrink-0 font-bold" style={m.color ? { color: m.color } : undefined}>
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
          )
        )}
      </span>
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
