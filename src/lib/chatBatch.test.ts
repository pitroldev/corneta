import { describe, expect, it } from "vitest";
import { applyChatBatch, type ChatEvent } from "./chatBatch";
import type { ChatMessage } from "./types";

const message = (id: string, source = "channel") =>
  ({
    id,
    nativeId: id,
    source,
    platform: "twitch",
    author: "Alice",
  }) as ChatMessage;
const received = (id: string, source?: string): ChatEvent => ({
  kind: "message",
  message: message(id, source),
});

describe("chat batches", () => {
  it("preserves order, caps the buffer and deduplicates only retained IDs in the same source", () => {
    const events: ChatEvent[] = [
      received("1"),
      received("1"),
      received("1", "other"),
      received("2"),
      received("3"),
    ];
    const result = applyChatBatch([], events, 3);
    expect(result.map((m) => [m.source, m.id])).toEqual([
      ["other", "1"],
      ["channel", "2"],
      ["channel", "3"],
    ]);
    expect(applyChatBatch(result, [received("1")], 3).map((m) => m.id)).toEqual(
      ["2", "3", "1"],
    );
  });
  it("applies moderation after earlier messages in the same batch without touching other sources", () => {
    const result = applyChatBatch(
      [],
      [
        received("1"),
        received("1", "other"),
        {
          kind: "delete",
          deletion: {
            platform: "twitch",
            source: "channel",
            scope: "message",
            nativeId: "1",
          },
        },
      ],
      400,
    );
    expect(result[0].deleted).toBe(true);
    expect(result[1].deleted).toBeUndefined();
  });
  it("does not mutate the old snapshot and keeps its identity for duplicate-only batches", () => {
    const current = [message("1")];
    expect(applyChatBatch(current, [received("1")], 400)).toBe(current);
    applyChatBatch(
      current,
      [
        {
          kind: "delete",
          deletion: { platform: "twitch", source: "channel", scope: "all" },
        },
      ],
      400,
    );
    expect(current[0].deleted).toBeUndefined();
  });
});
