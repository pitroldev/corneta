import { describe, expect, it, vi } from "vitest";
import { createPlaybackClock } from "./playbackClock";

describe("playback clock", () => {
  it("notifies only subscribed consumers, skips repeated values and releases listeners", () => {
    const clock = createPlaybackClock();
    const listener = vi.fn();
    const unsubscribe = clock.subscribe(listener);
    clock.set(1);
    clock.set(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(clock.getSnapshot()).toBe(1);
    unsubscribe();
    clock.set(Number.NaN);
    expect(clock.getSnapshot()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
