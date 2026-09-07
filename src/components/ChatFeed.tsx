import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, Ban, Clock, MessageSquare, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";
import type { ChatMessage } from "../lib/types";
import { useT } from "../lib/i18n";
import { PlatformGlyph } from "./ui";
import { pruneChatMeasurements } from "../lib/chatMeasurements";

export interface ChatView {
  emotes: boolean;
  badges: boolean;
  platform: boolean;
  source: boolean;
  timestamps: boolean;
  /** Feed font size in pixels. */
  fontSize: number;
}

/** Estimated row height before measurement, in pixels. */
const ROW_ESTIMATE = 28;

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

export function ChatFeed({
  messages,
  view,
  connected,
  allFilteredOut,
  className,
  emptyTitle,
  emptyBody,
  "aria-label": ariaLabel,
  onFontSize,
  modLevel,
  onModerate,
  disconnectedHint,
  emptyAction,
}: {
  messages: ChatMessage[];
  view: ChatView;
  connected: boolean;
  /** Messages exist, but the active filter hides them all. */
  allFilteredOut?: boolean;
  className?: string;
  emptyTitle?: string;
  emptyBody?: string;
  "aria-label"?: string;
  disconnectedHint?: string;
  emptyAction?: ReactNode;
  /** Ctrl+wheel adjusts font size within 8–44 px. */
  onFontSize?: (next: number) => void;
  modLevel?: (m: ChatMessage) => "full" | "delete" | "none";
  onModerate?: (m: ChatMessage, action: string) => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [paused, setPaused] = useState(false);
  const onFontSizeRef = useRef(onFontSize);
  const modLevelRef = useRef(modLevel);
  const onModerateRef = useRef(onModerate);
  onFontSizeRef.current = onFontSize;
  modLevelRef.current = modLevel;
  onModerateRef.current = onModerate;
  // Stable indirections preserve memoized rows without capturing stale callbacks.
  const stableModLevel = useRef(
    (m: ChatMessage) => modLevelRef.current?.(m) ?? "none",
  ).current;
  const stableModerate = useRef((m: ChatMessage, action: string) =>
    onModerateRef.current?.(m, action),
  ).current;
  const fontResizeEnabled = onFontSize !== undefined;

  const virt = useVirtualizer({
    count: messages.length,
    getScrollElement: () => ref.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 12,
    getItemKey: (i) => messages[i].id,
  });
  const totalSize = virt.getTotalSize();

  useLayoutEffect(() => {
    if (stick.current && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [totalSize]);

  // Translated virtual rows bypass native scroll anchoring; compensate for evicted rows before paint.
  const prevMsgs = useRef<ChatMessage[]>(messages);
  useLayoutEffect(() => {
    const prev = prevMsgs.current;
    prevMsgs.current = messages;
    const el = ref.current;
    if (stick.current || !el || prev === messages) return;
    const firstId = messages[0]?.id;
    if (!firstId || prev.length === 0 || prev[0].id === firstId) return;
    // Only prefix eviction preserves the anchor; a replaced list has no shared position.
    const cut = prev.findIndex((m) => m.id === firstId);
    if (cut <= 0) return;
    // Measured heights remain available for evicted row IDs until pruning.
    const sizes = virt.itemSizeCache;
    let removed = 0;
    let unknown = 0;
    for (let i = 0; i < cut; i++) {
      const h = sizes.get(prev[i].id);
      if (h !== undefined) removed += h;
      else unknown++;
    }
    if (unknown > 0) {
      // Approximate unmeasured rows using the mean known height.
      let sum = 0;
      for (const h of sizes.values()) sum += h;
      removed += unknown * (sizes.size > 0 ? sum / sizes.size : ROW_ESTIMATE);
    }
    el.scrollTop = Math.max(0, el.scrollTop - removed);
  }, [messages, virt]);

  // Must follow anchor compensation, which still needs the evicted rows.
  useLayoutEffect(() => {
    pruneChatMeasurements(virt.itemSizeCache, messages);
  }, [messages, virt]);

  // A non-passive listener is required to cancel browser zoom.
  useEffect(() => {
    const el = ref.current;
    if (!el || !fontResizeEnabled) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const next = Math.min(
        44,
        Math.max(8, view.fontSize + (e.deltaY < 0 ? 1 : -1)),
      );
      if (next !== view.fontSize) onFontSizeRef.current?.(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fontResizeEnabled, view.fontSize]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    stick.current = atBottom;
    setPaused(!atBottom);
  };

  const jumpToBottom = () => {
    stick.current = true;
    setPaused(false);
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  };

  return (
    <div className={cn("relative min-h-0", className)}>
      <div
        ref={ref}
        role="feed"
        aria-label={ariaLabel}
        onScroll={onScroll}
        style={{ fontSize: view.fontSize }}
        className="h-full overflow-y-auto py-2 [scrollbar-gutter:stable]"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <ChatFunnel />
            <div className="font-display text-lg font-bold">
              {emptyTitle ??
                (allFilteredOut
                  ? t("chat.feed.empty.filtered.title")
                  : connected
                    ? t("chat.feed.empty.waiting.title")
                    : t("chat.feed.empty.disconnected.title"))}
            </div>
            <div className="max-w-sm text-sm text-ink-muted">
              {emptyBody ??
                (allFilteredOut
                  ? t("chat.feed.empty.filtered.body")
                  : connected
                    ? t("chat.feed.empty.waiting.body")
                    : (disconnectedHint ??
                      t("chat.feed.empty.disconnected.body")))}
            </div>
            {!connected && !allFilteredOut && emptyAction}
          </div>
        ) : (
          <div
            style={{
              height: virt.getTotalSize(),
              position: "relative",
              width: "100%",
            }}
          >
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
                <MsgRow
                  m={messages[vi.index]}
                  view={view}
                  modLevel={stableModLevel}
                  onModerate={stableModerate}
                />
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
          <ArrowDown className="size-3.5" strokeWidth={2.6} />
          {t("chat.feed.follow")}
        </button>
      )}
    </div>
  );
}

interface MsgRowProps {
  m: ChatMessage;
  view: ChatView;
  modLevel?: (m: ChatMessage) => "full" | "delete" | "none";
  onModerate?: (m: ChatMessage, action: string) => void;
}

const MsgRow = memo(function MsgRow({
  m,
  view,
  modLevel,
  onModerate,
}: MsgRowProps) {
  const t = useT();
  if (m.deleted) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-1 leading-snug">
        <span className="shrink-0 rounded-sm bg-bad/15 px-1 text-[9px] font-extrabold uppercase leading-4 text-bad">
          {t("chat.feed.deleted.stamp")}
        </span>
        <span
          className="font-bold line-through opacity-60"
          style={m.color ? { color: m.color } : undefined}
        >
          {m.author}
        </span>
        <span className="text-ink-faint line-through opacity-60">
          {t("chat.feed.deleted.body")}
        </span>
      </div>
    );
  }
  return (
    <div className="group relative flex flex-wrap items-start gap-1.5 px-3 py-1 pr-16 leading-snug hover:bg-surface-2">
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
      <ModButtons m={m} modLevel={modLevel} onModerate={onModerate} />
    </div>
  );
}, areRowPropsEqual);

function areRowPropsEqual(prev: MsgRowProps, next: MsgRowProps) {
  return (
    prev.m === next.m &&
    prev.view.emotes === next.view.emotes &&
    prev.view.badges === next.view.badges &&
    prev.view.platform === next.view.platform &&
    prev.view.source === next.view.source &&
    prev.view.timestamps === next.view.timestamps &&
    prev.modLevel === next.modLevel &&
    prev.onModerate === next.onModerate
  );
}

/** Keep moderation controls mounted so keyboard users can reach them even before hover. */
function ModButtons({
  m,
  modLevel,
  onModerate,
}: {
  m: ChatMessage;
  modLevel?: (m: ChatMessage) => "full" | "delete" | "none";
  onModerate?: (m: ChatMessage, action: string) => void;
}) {
  const t = useT();
  if (!onModerate || !modLevel) return null;
  const lvl = modLevel(m);
  if (lvl === "none") return null;
  const btn =
    "grid size-6 place-items-center rounded text-ink-faint transition-colors";
  return (
    <div className="absolute right-1.5 top-0.5 flex items-center gap-0.5 rounded-md bg-surface opacity-0 ring-1 ring-border transition-opacity focus-within:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100">
      <button
        type="button"
        onClick={() => onModerate(m, "delete")}
        title={t("chat.mod.action.delete")}
        aria-label={t("chat.mod.action.delete")}
        className={cn(btn, "hover:text-bad")}
      >
        <Trash2 className="size-3.5" />
      </button>
      {lvl === "full" && (
        <>
          <button
            type="button"
            onClick={() => onModerate(m, "timeout")}
            title={t("chat.mod.action.timeout")}
            aria-label={t("chat.mod.action.timeout")}
            className={cn(btn, "hover:text-warn")}
          >
            <Clock className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onModerate(m, "ban")}
            title={t("chat.mod.action.ban")}
            aria-label={t("chat.mod.action.ban")}
            className={cn(btn, "hover:text-bad")}
          >
            <Ban className="size-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

function ChatFunnel() {
  return (
    <div className="flex items-center gap-1" aria-hidden>
      <div className="flex flex-col gap-1.5">
        <PlatformGlyph id="twitch" size={20} />
        <PlatformGlyph id="kick" size={20} />
        <PlatformGlyph id="youtube" size={20} />
        <PlatformGlyph id="cinefy" size={20} />
      </div>
      <svg
        viewBox="0 0 44 84"
        className="h-[5.25rem] w-11 text-brass"
        fill="none"
        aria-hidden
      >
        <g
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 9 C25 9 20 42 36 42" />
          <path d="M4 31 C23 31 22 42 36 42" />
          <path d="M4 53 C23 53 22 42 36 42" />
          <path d="M4 75 C25 75 20 42 36 42" />
          <path d="M29 36 L37 42 L29 48" />
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
      return "bg-tomato text-white";
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
