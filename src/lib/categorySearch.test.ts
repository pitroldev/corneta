import { describe, expect, it } from "vitest";
import { moveHighlight, shouldSearchCategory } from "./categorySearch";

describe("category autocomplete", () => {
  it("searches from two characters on, like the native command", () => {
    expect(shouldSearchCategory("v")).toBe(false);
    expect(shouldSearchCategory("  v ")).toBe(false);
    expect(shouldSearchCategory("va")).toBe(true);
  });

  it("moves the highlight with the arrows and wraps at both ends", () => {
    expect(moveHighlight(-1, 3, "ArrowDown")).toBe(0);
    expect(moveHighlight(2, 3, "ArrowDown")).toBe(0);
    expect(moveHighlight(-1, 3, "ArrowUp")).toBe(2);
    expect(moveHighlight(0, 3, "ArrowUp")).toBe(2);
    expect(moveHighlight(1, 3, "ArrowUp")).toBe(0);
    expect(moveHighlight(1, 3, "Enter")).toBeNull();
    expect(moveHighlight(0, 0, "ArrowDown")).toBeNull();
  });
});
