import { describe, expect, it, vi } from "vitest";
import { createDraftBuffer } from "./useDraft";

function buffer(value: string, normalize?: (next: string) => string) {
  const commit = vi.fn();
  const stored = { value };
  const draft = createDraftBuffer(() => ({
    value: stored.value,
    commit,
    normalize,
  }));
  return { draft, commit, stored };
}

describe("draft buffer", () => {
  it("commits only the last edit, once, when the edit ends", () => {
    const { draft, commit } = buffer("rtmp://old");
    for (const next of ["r", "rt", "rtmp://new"]) draft.change(next);
    expect(commit).not.toHaveBeenCalled();
    expect(draft.flush()).toBe(true);
    expect(draft.flush()).toBe(false);
    expect(commit).toHaveBeenCalledExactlyOnceWith("rtmp://new");
  });

  it("does nothing when no edit is pending", () => {
    const { draft, commit } = buffer("value");
    expect(draft.flush()).toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });

  it("skips an edit that returns to the stored value", () => {
    const { draft, commit } = buffer("same");
    draft.change("sam");
    draft.change("same");
    expect(draft.flush()).toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });

  it("commits the normalized edit and skips one that normalizes to the stored value", () => {
    const trim = (next: string) => next.trim();
    const changed = buffer("host", trim);
    changed.draft.change("  other-host  ");
    changed.draft.flush();
    expect(changed.commit).toHaveBeenCalledExactlyOnceWith("other-host");

    const unchanged = buffer("host", trim);
    unchanged.draft.change(" host ");
    expect(unchanged.draft.flush()).toBe(false);
    expect(unchanged.commit).not.toHaveBeenCalled();
  });

  it("compares against the stored value at commit time", () => {
    const { draft, commit, stored } = buffer("a");
    draft.change("b");
    stored.value = "b";
    expect(draft.flush()).toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });
});
