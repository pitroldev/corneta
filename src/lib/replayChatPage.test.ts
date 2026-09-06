import { describe, expect, it } from "vitest";
import { chatPageContains, replayChatPage } from "./replayChatPage";
import type { ReplayChatMessage } from "./types";

const messages = Array.from(
  { length: 10000 },
  (_, t) => ({ t }) as ReplayChatMessage,
);
describe("replay chat page reuse", () => {
  it("reuses one page across ticks and messages, refilling before its tail runs out", () => {
    const page = replayChatPage({ messages, gaps: [] }, 5100);
    expect(page.messages.length).toBeLessThanOrEqual(700);
    for (let t = 5100; t < 5199; t += 0.25)
      expect(chatPageContains(page, t)).toBe(true);
    expect(chatPageContains(page, 5199)).toBe(false);
    expect(chatPageContains(page, 4000)).toBe(false);
  });

  it("handles empty journals, repeated timestamps and gap boundaries without a request loop", () => {
    const empty = replayChatPage({ messages: [], gaps: [] }, 0);
    expect(chatPageContains(empty, 1000)).toBe(true);
    const sameTime = replayChatPage(
      { messages: messages.map((message) => ({ ...message, t: 1 })), gaps: [] },
      1,
    );
    expect(chatPageContains(sameTime, 1)).toBe(true);
    const withGap = replayChatPage(
      { messages, gaps: [{ t: 5150, from: 5140 }] },
      5100,
    );
    expect(chatPageContains(withGap, 5149)).toBe(true);
    expect(chatPageContains(withGap, 5150)).toBe(false);
    expect(
      chatPageContains(
        replayChatPage({ messages, gaps: [{ t: 5150, from: 5140 }] }, 5150),
        5150,
      ),
    ).toBe(true);
  });
});
