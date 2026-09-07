import { useMemo } from "react";
import { MessageSquare } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { useStore } from "../lib/store";
import type {
  ChatMessage,
  ReplayChatGap,
  ReplayChatMessage,
} from "../lib/types";
import { ChatFeed, type ChatView } from "./ChatFeed";
import { Button } from "./ui";

const replayMessageCache = new WeakMap<ReplayChatMessage, ChatMessage>();
let replayMessageSequence = 0;

function asLiveChatMessage(message: ReplayChatMessage): ChatMessage {
  const cached = replayMessageCache.get(message);
  if (cached) return cached;

  const converted: ChatMessage = {
    id: message.i ?? `replay-${message.t}-${replayMessageSequence++}`,
    platform: message.p,
    source: message.s,
    author: message.a,
    color: message.c,
    text: message.m,
    fragments: [{ kind: "text", text: message.m }],
    badges: [],
    ts: message.t,
    deleted: message.deleted,
  };
  replayMessageCache.set(message, converted);
  return converted;
}

export function ReplayChatPanel({
  messages,
  gap,
  showDeleted,
  onToggleDeleted,
}: {
  messages: ReplayChatMessage[];
  gap: ReplayChatGap | null;
  showDeleted: boolean;
  onToggleDeleted: () => void;
}) {
  const { t } = useI18n();
  const settings = useStore((state) => state.config?.settings);
  const setSettings = useStore((state) => state.setSettings);
  const liveMessages = useMemo(
    () => messages.map(asLiveChatMessage),
    [messages],
  );
  const hasDuplicatePlatform = useMemo(() => {
    const firstSource = new Map<string, string>();
    for (const message of messages) {
      const previous = firstSource.get(message.p);
      if (previous !== undefined && previous !== message.s) return true;
      firstSource.set(message.p, message.s);
    }
    return false;
  }, [messages]);
  const view = useMemo<ChatView>(
    () => ({
      emotes: settings?.chatShowEmotes ?? true,
      badges: settings?.chatShowBadges ?? true,
      platform: settings?.chatShowPlatform ?? true,
      source: (settings?.chatShowSource ?? false) || hasDuplicatePlatform,
      timestamps: settings?.chatShowTimestamps ?? false,
      fontSize: settings?.chatFontSize ?? 14,
    }),
    [
      hasDuplicatePlatform,
      settings?.chatFontSize,
      settings?.chatShowBadges,
      settings?.chatShowEmotes,
      settings?.chatShowPlatform,
      settings?.chatShowSource,
      settings?.chatShowTimestamps,
    ],
  );

  return (
    <aside
      className="flex h-80 min-h-0 w-full flex-col overflow-hidden bg-surface xl:h-[clamp(32rem,64vh,44rem)] xl:w-80"
      aria-labelledby="replay-chat-heading"
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border-soft px-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-2 text-brass">
          <MessageSquare className="size-4" aria-hidden />
        </span>
        <h4 id="replay-chat-heading" className="min-w-0 flex-1 text-sm">
          {t("replay.chat.title")}
        </h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleDeleted}
          className="px-2 text-[11px] text-ink-faint"
        >
          {showDeleted
            ? t("replay.chat.hideDeleted")
            : t("replay.chat.showDeleted")}
        </Button>
      </header>

      {gap ? (
        <p className="shrink-0 bg-warn/15 px-3 py-2 text-[11px] font-semibold text-warn">
          {t("replay.chat.gap")}
        </p>
      ) : null}

      <ChatFeed
        messages={liveMessages}
        view={view}
        connected
        className="min-h-0 flex-1"
        emptyTitle={t("replay.chat.title")}
        emptyBody={t("replay.chat.empty")}
        aria-label={t("replay.chat.scrollAria")}
        onFontSize={
          settings
            ? (fontSize) => setSettings({ chatFontSize: fontSize })
            : undefined
        }
      />
    </aside>
  );
}
