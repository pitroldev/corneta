import { useEffect, useMemo, type ComponentProps, type ReactNode } from "react";
import { MonitorPlay, X } from "lucide-react";
import { AlertsFeed } from "../../components/AlertsFeed";
import { ChatFeed } from "../../components/ChatFeed";
import { useT } from "../../lib/i18n";
import { useStore } from "../../lib/store";
import { toast } from "../../lib/toast";
import type { ChatMessage, ChatPlatform } from "../../lib/types";
import { cn, errMsg } from "../../lib/utils";
import { PinnedAndPolls } from "./ChatSide";

// These wrappers own the high-frequency subscriptions, so a chat batch or an alert re-renders the
// feed instead of the whole chat screen or popout window.

export function LiveChatFeed({
  platformFilter,
  className,
  ...props
}: Omit<
  ComponentProps<typeof ChatFeed>,
  "messages" | "allFilteredOut" | "highlightedId" | "onHighlight"
> & {
  /** Platforms to show; `null` shows everything and keeps the store's array identity. */
  platformFilter: Record<ChatPlatform, boolean> | null;
}) {
  const t = useT();
  const messages = useStore((s) => s.chatMessages);
  const highlighted = useStore((s) => s.highlightedMessage);
  const highlightMessage = useStore((s) => s.highlightMessage);
  const clearHighlight = useStore((s) => s.clearHighlight);

  useEffect(() => {
    if (!highlighted) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.closest('[role="dialog"]'))
      ) {
        return;
      }
      void clearHighlight().catch((err) => toast.error(errMsg(err)));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [highlighted, clearHighlight]);

  const onHighlight = (message: ChatMessage) => {
    void highlightMessage(message).catch((err) => toast.error(errMsg(err)));
  };

  const shown = useMemo(
    () =>
      platformFilter
        ? messages.filter((m) => platformFilter[m.platform])
        : messages,
    [messages, platformFilter],
  );
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {highlighted && (
        <div
          role="status"
          className="flex shrink-0 items-center gap-2 border-b-2 border-brass/50 bg-brass/15 px-3 py-1.5 text-xs"
        >
          <MonitorPlay className="size-3.5 shrink-0 text-brass" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-ink">
            <strong className="font-bold">
              {t("chat.highlight.bar.label", { author: highlighted.author })}
            </strong>{" "}
            <span className="text-ink-muted">{highlighted.text}</span>
          </span>
          <button
            type="button"
            onClick={() =>
              void clearHighlight().catch((err) => toast.error(errMsg(err)))
            }
            className="inline-flex shrink-0 items-center gap-1 rounded bg-surface px-2 py-0.5 text-[11px] font-bold text-ink ring-1 ring-border transition-colors hover:bg-surface-2"
          >
            <X className="size-3" aria-hidden />
            {t("chat.highlight.bar.clear")}
          </button>
        </div>
      )}
      <PinnedAndPolls
        platformFilter={platformFilter}
        images={props.view.emotes}
      />
      <ChatFeed
        {...props}
        className="min-h-0 flex-1"
        messages={shown}
        allFilteredOut={messages.length > 0 && shown.length === 0}
        highlightedId={highlighted?.id ?? null}
        onHighlight={onHighlight}
      />
    </div>
  );
}

export function LiveAlertsFeed(
  props: Omit<ComponentProps<typeof AlertsFeed>, "alerts">,
) {
  const alerts = useStore((s) => s.alerts);
  return <AlertsFeed {...props} alerts={alerts} />;
}

export function AlertCountLabel({
  children,
}: {
  children: (count: number) => ReactNode;
}) {
  const count = useStore((s) => s.alertsReceived);
  return <>{children(count)}</>;
}
