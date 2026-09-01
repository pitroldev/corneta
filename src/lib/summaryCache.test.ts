import { describe, it, expect, beforeEach } from "vitest";
import {
  getCachedSummary,
  setCachedSummary,
  dropCachedSummary,
} from "./summaryCache";
import type { SessionSummary } from "./types";

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
      JSON.stringify({ s1: fake }),
    );
    expect(getCachedSummary("s1")).toBeNull();
  });
});
