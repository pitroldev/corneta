import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConfirm } from "./useConfirm";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function confirmer(minDelayMs?: number) {
  const changes: boolean[] = [];
  const c = createConfirm(3000, (armed) => changes.push(armed), {
    minDelayMs,
  });
  return { c, changes };
}

describe("createConfirm", () => {
  it("arms on the first click, confirms on the second and expires after the timeout", () => {
    const { c, changes } = confirmer();
    expect(c.confirm()).toBe(false);
    expect(c.confirm()).toBe(true);
    expect(changes).toEqual([true, false]);
    expect(c.confirm()).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(changes).toEqual([true, false, true, false]);
    expect(c.confirm()).toBe(false);
  });

  it("does not let the timer of an earlier confirmation cut a new one short", () => {
    const { c } = confirmer();
    c.confirm();
    vi.advanceTimersByTime(800);
    expect(c.confirm()).toBe(true);
    vi.advanceTimersByTime(1200);
    expect(c.confirm()).toBe(false);
    // The first timer would have fired here, 3 s after the first arm.
    vi.advanceTimersByTime(1500);
    expect(c.confirm()).toBe(true);
  });

  it("ignores a second click that comes too fast", () => {
    const { c } = confirmer(400);
    expect(c.confirm()).toBe(false);
    vi.advanceTimersByTime(100);
    expect(c.confirm()).toBe(false);
    vi.advanceTimersByTime(300);
    expect(c.confirm()).toBe(true);
  });

  it("disarms immediately and cancels the pending timeout", () => {
    const { c, changes } = confirmer();
    c.confirm();
    c.disarm();
    c.disarm();
    expect(changes).toEqual([true, false]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
