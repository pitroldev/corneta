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

describe("chat batch duplicate index", () => {
  it("keeps deduplicating against messages kept by earlier batches", () => {
    const first = applyChatBatch([], [received("1"), received("2")], 3);
    const second = applyChatBatch(first, [received("3"), received("1")], 3);
    expect(second.map((m) => m.id)).toEqual(["1", "2", "3"]);
    const third = applyChatBatch(second, [received("4"), received("1")], 3);
    // "1" was evicted by "4", so a later copy of it is new again.
    expect(third.map((m) => m.id)).toEqual(["3", "4", "1"]);
  });

  it("rebuilds the index for arrays it did not produce", () => {
    const external = [message("1"), message("2")];
    expect(applyChatBatch(external, [received("2")], 400)).toBe(external);
    expect(
      applyChatBatch([...external], [received("3")], 400).map((m) => m.id),
    ).toEqual(["1", "2", "3"]);
  });

  it("does not confuse keys whose parts contain the separator", () => {
    const tricky = (source: string, nativeId: string) =>
      ({
        ...message(nativeId, source),
        id: `${source}/${nativeId}`,
      }) as ChatMessage;
    const result = applyChatBatch(
      [],
      [
        { kind: "message", message: tricky("a:1", "b") },
        { kind: "message", message: tricky("a", ":1b") },
      ],
      400,
    );
    expect(result).toHaveLength(2);
  });
});

describe("chat batch moderation by author", () => {
  it("matches a ban by author ID even when the display name differs from the login", () => {
    const shown = {
      ...message("1"),
      author: "Ástrid",
      authorId: "42",
    } as ChatMessage;
    const other = {
      ...message("2"),
      author: "Bia",
      authorId: "7",
    } as ChatMessage;
    const result = applyChatBatch(
      [shown, other],
      [
        {
          kind: "delete",
          deletion: {
            platform: "twitch",
            source: "channel",
            scope: "user",
            author: "astrid",
            authorId: "42",
            seconds: 600,
          },
        },
      ],
      400,
    );
    expect(result.map((m) => m.deleted)).toEqual([true, undefined]);
  });

  it("falls back to the name when the platform sends no ID", () => {
    const result = applyChatBatch(
      [message("1")],
      [
        {
          kind: "delete",
          deletion: {
            platform: "twitch",
            source: "channel",
            scope: "user",
            author: "alice",
          },
        },
      ],
      400,
    );
    expect(result[0].deleted).toBe(true);
  });
});
