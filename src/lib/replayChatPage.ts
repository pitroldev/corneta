import type { ReplayChatGap, ReplayChatMessage } from "./types";

export interface ChatPage {
  messages: ReplayChatMessage[];
  gaps: ReplayChatGap[];
  start: number;
  end: number;
  total: number;
  /** Half-open time interval that can reuse this page without another IPC. */
  validFrom: number | null;
  validUntil: number | null;
}

export function chatPageContains(page: ChatPage, timestamp: number): boolean {
  return (
    (page.validFrom == null || timestamp >= page.validFrom) &&
    (page.validUntil == null || timestamp < page.validUntil)
  );
}

export function upperBoundChat(
  messages: readonly { t: number }[],
  timestamp: number,
): number {
  let low = 0;
  let high = messages.length;
  while (low < high) {
    const middle = low + ((high - low) >> 1);
    if (messages[middle].t <= timestamp) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Keep the full journal in the worker and return a bounded page; apply all deletions before indexing. */
export function replayChatPage(
  chat: { messages: ReplayChatMessage[]; gaps: ReplayChatGap[] },
  timestamp: number,
): ChatPage {
  const cursor = upperBoundChat(chat.messages, timestamp);
  const bucket = Math.floor(cursor / 200) * 200;
  const start = Math.max(0, bucket - 300);
  const end = Math.min(chat.messages.length, bucket + 400);
  const gapIndex = upperBoundChat(chat.gaps, timestamp);
  const from = [
    bucket > 0 ? chat.messages[bucket - 1]?.t : undefined,
    chat.gaps[gapIndex - 1]?.t,
  ].filter((time): time is number => time != null);
  const until = [chat.messages[bucket + 199]?.t, chat.gaps[gapIndex]?.t].filter(
    (time): time is number => time != null,
  );
  return {
    messages: chat.messages.slice(start, end),
    gaps: chat.gaps.slice(Math.max(0, gapIndex - 1), gapIndex + 1),
    start,
    end,
    total: chat.messages.length,
    validFrom: from.length ? Math.max(...from) : null,
    validUntil: until.length ? Math.min(...until) : null,
  };
}
