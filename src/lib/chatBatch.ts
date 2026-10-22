import type { ChatDelete, ChatMessage } from "./types";

export type ChatEvent =
  | { kind: "message"; message: ChatMessage }
  | { kind: "delete"; deletion: ChatDelete };
// Length prefixes keep the key unambiguous without serializing every kept message per batch.
const keyOf = ({ platform, source, nativeId }: ChatMessage) =>
  nativeId
    ? `${platform.length}:${platform}${source.length}:${source}${nativeId}`
    : null;

// Duplicate keys of each array this module returned, handed to the next batch instead of rebuilt.
const keysByBatch = new WeakMap<readonly ChatMessage[], Set<string>>();

function deletedBy(message: ChatMessage, deletion: ChatDelete): boolean {
  if (message.platform !== deletion.platform) return false;
  if (deletion.source != null && message.source !== deletion.source)
    return false;
  if (deletion.scope === "message")
    return message.nativeId != null && message.nativeId === deletion.nativeId;
  if (deletion.scope === "user") {
    if (message.source !== deletion.source) return false;
    // Display names may differ from the login the platform reports, so IDs win when known.
    if (deletion.authorId && message.authorId)
      return message.authorId === deletion.authorId;
    return (
      !!deletion.author &&
      message.author.toLowerCase() === deletion.author.toLowerCase()
    );
  }
  return deletion.scope === "all" && message.source === deletion.source;
}

export function applyChatBatch(
  current: ChatMessage[],
  events: readonly ChatEvent[],
  cap: number,
): ChatMessage[] {
  if (!events.length) return current;
  const next = current.slice(-cap);
  let ids = next.length === current.length ? keysByBatch.get(current) : null;
  // The set is updated in place, so it stops describing `current` once it is reused.
  if (ids) keysByBatch.delete(current);
  else
    ids = new Set(next.map(keyOf).filter((key): key is string => key !== null));
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
  const result = changed ? next.slice(head) : current;
  keysByBatch.set(result, ids);
  return result;
}
