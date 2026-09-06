import type { ChatDelete, ChatMessage } from "./types";

export type ChatEvent =
  | { kind: "message"; message: ChatMessage }
  | { kind: "delete"; deletion: ChatDelete };
const keyOf = (message: ChatMessage) =>
  message.nativeId
    ? JSON.stringify([message.platform, message.source, message.nativeId])
    : null;

function deletedBy(message: ChatMessage, deletion: ChatDelete): boolean {
  if (message.platform !== deletion.platform) return false;
  if (deletion.source != null && message.source !== deletion.source)
    return false;
  if (deletion.scope === "message")
    return message.nativeId != null && message.nativeId === deletion.nativeId;
  if (deletion.scope === "user")
    return (
      message.source === deletion.source &&
      message.author.toLowerCase() === (deletion.author ?? "").toLowerCase()
    );
  return deletion.scope === "all" && message.source === deletion.source;
}

export function applyChatBatch(
  current: ChatMessage[],
  events: readonly ChatEvent[],
  cap: number,
): ChatMessage[] {
  if (!events.length) return current;
  const next = current.slice(-cap);
  const ids = new Set(
    next.map(keyOf).filter((key): key is string => key !== null),
  );
  let head = 0;
  let changed = false;
  for (const event of events) {
    if (event.kind === "delete") {
      for (let i = head; i < next.length; i++) {
        if (!next[i].deleted && deletedBy(next[i], event.deletion)) {
          next[i] = { ...next[i], deleted: true };
          changed = true;
        }
      }
      continue;
    }
    const key = keyOf(event.message);
    if (key !== null && ids.has(key)) continue;
    if (next.length - head >= cap) {
      const evicted = keyOf(next[head++]);
      if (evicted !== null) ids.delete(evicted);
    }
    next.push(event.message);
    if (key !== null) ids.add(key);
    changed = true;
  }
  return changed ? next.slice(head) : current;
}
