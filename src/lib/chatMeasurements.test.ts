import { describe, expect, it } from "vitest";
import { Virtualizer } from "@tanstack/react-virtual";
import { pruneChatMeasurements } from "./chatMeasurements";

describe("bounded chat measurements", () => {
  it("keeps 100,000 rotating measured IDs bounded, including empty/replaced feeds", () => {
    const cache = new Map<string | number | bigint, number>();
    for (let start = 0; start < 100_000; start += 400) {
      const messages = Array.from({ length: 400 }, (_, i) => ({
        id: String(start + i),
      }));
      for (const { id } of messages) cache.set(id, 29);
      pruneChatMeasurements(cache, messages);
      expect(cache.size).toBe(400);
    }
    pruneChatMeasurements(cache, []);
    expect(cache.size).toBe(0);
  });

  it("preserves current geometry in the installed virtualizer after rotation", () => {
    const base = {
      count: 400,
      getScrollElement: () => null,
      estimateSize: () => 28,
      scrollToFn: () => {},
      observeElementRect: () => undefined,
      observeElementOffset: () => undefined,
    };
    const virtualizer = new Virtualizer({
      ...base,
      getItemKey: (i) => String(i),
    });
    for (let start = 0; start < 1000; start++) {
      const messages = Array.from({ length: 400 }, (_, i) => ({
        id: String(start + i),
      }));
      virtualizer.setOptions({ ...base, getItemKey: (i) => messages[i].id });
      virtualizer.getTotalSize();
      virtualizer.resizeItem(399, 29);
      const before = virtualizer.getTotalSize();
      pruneChatMeasurements(virtualizer.itemSizeCache, messages);
      expect(virtualizer.getTotalSize()).toBe(before);
      expect(virtualizer.itemSizeCache.size).toBeLessThanOrEqual(400);
    }
  });
});
