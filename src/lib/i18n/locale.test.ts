import { describe, it, expect, vi, afterEach } from "vitest";
import {
  detectSystemLocale,
  resolveLocale,
  interpolate,
  pluralSuffix,
} from "./locale";

describe("detectSystemLocale", () => {
  it("matches the base language rather than the complete tag", () => {
    expect(detectSystemLocale(["pt-PT"])).toBe("pt-BR");
    expect(detectSystemLocale(["en-GB", "en"])).toBe("en");
  });

  it("respects system preference order", () => {
    expect(detectSystemLocale(["es-AR", "en-US", "pt-BR"])).toBe("en");
  });

  it("falls back for unsupported languages", () => {
    expect(detectSystemLocale(["ja", "ko"])).toBe("pt-BR");
    expect(detectSystemLocale([])).toBe("pt-BR");
  });
});

/** Stub navigator.languages: undefined activates the default parameter and would otherwise depend on the test machine. */
describe("detectSystemLocale without arguments", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses a supported system language", () => {
    vi.stubGlobal("navigator", { languages: ["en-US", "en"] });
    expect(detectSystemLocale()).toBe("en");
  });

  it("falls back for an unsupported system language", () => {
    vi.stubGlobal("navigator", { languages: ["ja-JP", "ko"] });
    expect(detectSystemLocale()).toBe("pt-BR");
  });

  it("falls back without navigator", () => {
    vi.stubGlobal("navigator", undefined);
    expect(detectSystemLocale()).toBe("pt-BR");
  });
});

describe("resolveLocale", () => {
  it("explicit choices override the system", () => {
    expect(resolveLocale("en", "pt-BR")).toBe("en");
    expect(resolveLocale("pt-BR", "en")).toBe("pt-BR");
  });

  it("auto follows the system", () => {
    expect(resolveLocale("auto", "en")).toBe("en");
    expect(resolveLocale("auto", "pt-BR")).toBe("pt-BR");
  });

  it("missing or invalid config falls back to the system", () => {
    expect(resolveLocale(undefined, "en")).toBe("en");
    expect(resolveLocale("klingon" as never, "en")).toBe("en");
  });
});

describe("interpolate", () => {
  it("replaces placeholders with values", () => {
    expect(interpolate("{n} plataformas", { n: 3 })).toBe("3 plataformas");
    expect(interpolate("{a} e {b}", { a: "Twitch", b: "Kick" })).toBe(
      "Twitch e Kick",
    );
  });

  it("keeps unresolved placeholders visible", () => {
    expect(interpolate("{n} trechos", {})).toBe("{n} trechos");
    expect(interpolate("{n} trechos")).toBe("{n} trechos");
  });

  it("does not change text without placeholders", () => {
    expect(interpolate("uso de {cpu}% e { espaço }", { cpu: 90 })).toBe(
      "uso de 90% e { espaço }",
    );
  });

  it("supports repeated placeholders", () => {
    expect(interpolate("{p} caiu, {p} voltou", { p: "Kick" })).toBe(
      "Kick caiu, Kick voltou",
    );
  });
});

describe("pluralSuffix", () => {
  it("uses singular only for one and plural for zero in both locales", () => {
    expect(pluralSuffix(1)).toBe("one");
    expect(pluralSuffix(-1)).toBe("one");
    expect(pluralSuffix(0)).toBe("other");
    expect(pluralSuffix(2)).toBe("other");
  });
});
