import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast, useToasts } from "./toast";

const messages = () => useToasts.getState().toasts.map((item) => item.message);
const idOf = (message: string) =>
  useToasts.getState().toasts.find((item) => item.message === message)!.id;

describe("toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToasts.setState({ toasts: [] });
  });

  afterEach(() => vi.useRealTimers());

  it("keeps errors up longer than other toasts, and long errors longest", () => {
    const long = "x".repeat(61);
    toast.info("info");
    toast.error("short error");
    toast.error(long);
    vi.advanceTimersByTime(3400);
    expect(messages()).toEqual(["short error", long]);
    vi.advanceTimersByTime(6000 - 3400);
    expect(messages()).toEqual([long]);
    vi.advanceTimersByTime(10_000 - 6000);
    expect(messages()).toEqual([]);
  });

  it("holds a toast while paused and leaves time to reach its action after resuming", () => {
    const undo = vi.fn();
    toast.action("saved", "Undo", undo);
    expect(useToasts.getState().toasts[0].action?.label).toBe("Undo");
    vi.advanceTimersByTime(5900);
    useToasts.getState().pause(idOf("saved"));
    vi.advanceTimersByTime(60_000);
    expect(messages()).toEqual(["saved"]);
    useToasts.getState().resume(idOf("saved"));
    vi.advanceTimersByTime(1499);
    expect(messages()).toEqual(["saved"]);
    vi.advanceTimersByTime(1);
    expect(messages()).toEqual([]);
    expect(undo).not.toHaveBeenCalled();
  });

  it("dismisses at once and ignores unknown toasts", () => {
    toast.success("done");
    useToasts.getState().dismiss(idOf("done"));
    expect(messages()).toEqual([]);
    expect(() => {
      useToasts.getState().pause("missing");
      useToasts.getState().resume("missing");
      useToasts.getState().dismiss("missing");
    }).not.toThrow();
  });
});
