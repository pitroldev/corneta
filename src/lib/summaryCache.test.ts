import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getCachedSummary,
  setCachedSummary,
  dropCachedSummary,
  reconcileSummaryCache,
  flushSummaryCache,
} from "./summaryCache";
import type { SessionMeta, SessionSummary } from "./types";

// Node não tem localStorage — mock em memória.
beforeEach(() => {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  } as Storage;
});

const fake = { id: "s1" } as unknown as SessionSummary;

describe("summaryCache", () => {
  it("reads storage once, batches writes and retains at most 50 summaries", () => {
    const reads = vi.spyOn(localStorage, "getItem");
    const writes = vi.spyOn(localStorage, "setItem");
    for (let i = 0; i < 1000; i++) {
      setCachedSummary(`s${i}`, fake);
      getCachedSummary(`s${i}`);
    }
    expect(reads).toHaveBeenCalledTimes(1);
    expect(writes).not.toHaveBeenCalled();
    flushSummaryCache();
    expect(writes).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(
      localStorage.getItem("corneta.session-summaries")!,
    );
    expect(Object.keys(stored.entries)).toHaveLength(50);
    expect(getCachedSummary("s0")).toBeNull();
    expect(getCachedSummary("s999")).toEqual(fake);
  });

  it("invalidates replaced files and removes orphaned entries", () => {
    const session = { id: "s1", sourceRevision: "1024:123" } as SessionMeta;
    reconcileSummaryCache([session]);
    setCachedSummary("s1", fake);
    setCachedSummary("orphan", fake);
    reconcileSummaryCache([session]);
    expect(getCachedSummary("s1")).toEqual(fake);
    expect(getCachedSummary("orphan")).toBeNull();
    reconcileSummaryCache([{ ...session, sourceRevision: "2048:124" }]);
    expect(getCachedSummary("s1")).toBeNull();
  });

  it("round-trip set → get; ausente → null", () => {
    expect(getCachedSummary("s1")).toBeNull();
    setCachedSummary("s1", fake);
    expect(getCachedSummary("s1")).toEqual(fake);
    expect(getCachedSummary("outro")).toBeNull();
  });

  it("drop remove; drop de ausente é no-op (não lança)", () => {
    setCachedSummary("s1", fake);
    dropCachedSummary("s1");
    expect(getCachedSummary("s1")).toBeNull();
    expect(() => dropCachedSummary("inexistente")).not.toThrow();
  });

  it("JSON corrompido no storage → get devolve null, sem lançar", () => {
    localStorage.setItem("corneta.session-summaries", "{lixo");
    expect(getCachedSummary("s1")).toBeNull();
  });

  it("descarta resumos produzidos por uma heurística antiga", () => {
    localStorage.setItem(
      "corneta.session-summaries",
      JSON.stringify({ version: 2, summaries: { s1: fake } }),
    );
    expect(getCachedSummary("s1")).toBeNull();
  });
});
