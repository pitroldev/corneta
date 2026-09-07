import { describe, it, expect } from "vitest";
import { negotiateLocale, localePath, DEFAULT_LOCALE } from "./locale";

describe("negotiateLocale", () => {
  it("falls back to the default when the header is absent", () => {
    expect(negotiateLocale(null)).toBe("pt-BR");
    expect(negotiateLocale(undefined)).toBe("pt-BR");
    expect(negotiateLocale("")).toBe("pt-BR");
  });

  it("matches the base language rather than the complete tag", () => {
    expect(negotiateLocale("pt-PT")).toBe("pt-BR");
    expect(negotiateLocale("pt")).toBe("pt-BR");
    expect(negotiateLocale("en-GB")).toBe("en");
    expect(negotiateLocale("en-US,en;q=0.9")).toBe("en");
  });

  it("respects quality order rather than textual order", () => {
    expect(negotiateLocale("en;q=0.4,pt-BR;q=0.9")).toBe("pt-BR");
    expect(negotiateLocale("pt;q=0.2,en;q=0.8")).toBe("en");
  });

  it("treats q=0 as exclusion rather than lowest priority", () => {
    expect(negotiateLocale("pt-BR;q=0,en;q=0.5")).toBe("en");
  });

  it("falls back to the default for unsupported languages", () => {
    expect(negotiateLocale("es-AR,es;q=0.9")).toBe("pt-BR");
    expect(negotiateLocale("ja")).toBe("pt-BR");
    expect(negotiateLocale("*")).toBe("pt-BR");
  });

  it("skips unknown languages and keeps looking", () => {
    expect(negotiateLocale("de-DE,fr;q=0.8,en;q=0.3")).toBe("en");
  });

  it("handles malformed headers", () => {
    expect(negotiateLocale(",,;q=,")).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale("en;q=abc")).toBe(DEFAULT_LOCALE);
  });
});

describe("localePath", () => {
  it("keeps the default locale unprefixed and home at /", () => {
    expect(localePath("pt-BR")).toBe("/");
    expect(localePath("pt-BR", "/legal/privacy")).toBe("/legal/privacy");
  });

  it("prefixes English routes", () => {
    expect(localePath("en")).toBe("/en");
    expect(localePath("en", "/legal/privacy")).toBe("/en/legal/privacy");
  });

  it("removes trailing slashes", () => {
    expect(localePath("en", "/")).toBe("/en");
    expect(localePath("en", "/algo/")).toBe("/en/algo");
  });
});
