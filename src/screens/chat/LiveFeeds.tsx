import { useMemo, type ComponentProps, type ReactNode } from "react";
import { AlertsFeed } from "../../components/AlertsFeed";
import { ChatFeed } from "../../components/ChatFeed";
import { useStore } from "../../lib/store";
import type { ChatPlatform } from "../../lib/types";

// These wrappers own the high-frequency subscriptions, so a chat batch or an alert re-renders the
// feed instead of the whole chat screen or popout window.

export function LiveChatFeed({
  platformFilter,
  ...props
}: Omit<ComponentProps<typeof ChatFeed>, "messages" | "allFilteredOut"> & {
  /** Platforms to show; `null` shows everything and keeps the store's array identity. */
  platformFilter: Record<ChatPlatform, boolean> | null;
}) {
  const messages = useStore((s) => s.chatMessages);
  const shown = useMemo(
    () =>
      platformFilter
        ? messages.filter((m) => platformFilter[m.platform])
        : messages,
    [messages, platformFilter],
  );
  return (
    <ChatFeed
      {...props}
      messages={shown}
      allFilteredOut={messages.length > 0 && shown.length === 0}
    />
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
  const count = useStore((s) => s.alerts.length);
  return <>{children(count)}</>;
}
