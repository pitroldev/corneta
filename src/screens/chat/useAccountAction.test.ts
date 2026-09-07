import { describe, expect, it, vi } from "vitest";
import { performAccountAction } from "./useAccountAction";

describe("account action confirmation", () => {
  it("does not clear fields or announce success before the operation resolves", async () => {
    let confirm!: () => void;
    const pending = new Promise<void>((resolve) => {
      confirm = resolve;
    });
    const completed = vi.fn();
    const failed = vi.fn();
    const result = performAccountAction(() => pending, completed, failed);
    expect(completed).not.toHaveBeenCalled();
    confirm();
    await result;
    expect(completed).toHaveBeenCalledOnce();
    expect(failed).not.toHaveBeenCalled();
  });

  it.each(["save", "logout"])(
    "keeps user input/state after %s rejects and handles the error once",
    async () => {
      const error = new Error("vault unavailable");
      const completed = vi.fn();
      const failed = vi.fn();
      await expect(
        performAccountAction(() => Promise.reject(error), completed, failed),
      ).resolves.toBeUndefined();
      expect(completed).not.toHaveBeenCalled();
      expect(failed).toHaveBeenCalledExactlyOnceWith(error);
    },
  );
});
