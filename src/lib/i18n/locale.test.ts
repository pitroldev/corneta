import { describe, it, expect } from "vitest";
import {
  detectSystemLocale,
  resolveLocale,
  interpolate,
  pluralSuffix,
} from "./locale";

describe("detectSystemLocale", () => {
  it("casa pelo idioma base, não pela tag inteira", () => {
    // Português de Portugal lê a versão brasileira melhor que a inglesa.
    expect(detectSystemLocale(["pt-PT"])).toBe("pt-BR");
    expect(detectSystemLocale(["en-GB", "en"])).toBe("en");
  });

  it("respeita a ordem de preferência do sistema", () => {
    expect(detectSystemLocale(["es-AR", "en-US", "pt-BR"])).toBe("en");
  });

  it("idioma que não temos cai no padrão", () => {
    expect(detectSystemLocale(["ja", "ko"])).toBe("pt-BR");
    expect(detectSystemLocale([])).toBe("pt-BR");
    expect(detectSystemLocale(undefined)).toBe("pt-BR");
  });
});

describe("resolveLocale", () => {
  it("escolha explícita ganha do sistema", () => {
    expect(resolveLocale("en", "pt-BR")).toBe("en");
    expect(resolveLocale("pt-BR", "en")).toBe("pt-BR");
  });

  it("'auto' segue o sistema", () => {
    expect(resolveLocale("auto", "en")).toBe("en");
    expect(resolveLocale("auto", "pt-BR")).toBe("pt-BR");
  });

  it("config ausente ou lixo cai no sistema", () => {
    expect(resolveLocale(undefined, "en")).toBe("en");
    expect(resolveLocale("klingon" as never, "en")).toBe("en");
  });
});

describe("interpolate", () => {
  it("troca o buraco pelo valor", () => {
    expect(interpolate("{n} plataformas", { n: 3 })).toBe("3 plataformas");
    expect(interpolate("{a} e {b}", { a: "Twitch", b: "Kick" })).toBe(
      "Twitch e Kick",
    );
  });

  it("buraco sem valor fica VISÍVEL em vez de sumir", () => {
    // Frase que perde o número em silêncio parece certa e está errada.
    expect(interpolate("{n} trechos", {})).toBe("{n} trechos");
    expect(interpolate("{n} trechos")).toBe("{n} trechos");
  });

  it("não mexe em chave que não é buraco", () => {
    expect(interpolate("uso de {cpu}% e { espaço }", { cpu: 90 })).toBe(
      "uso de 90% e { espaço }",
    );
  });

  it("aceita o mesmo buraco duas vezes", () => {
    expect(interpolate("{p} caiu, {p} voltou", { p: "Kick" })).toBe(
      "Kick caiu, Kick voltou",
    );
  });
});

describe("pluralSuffix", () => {
  it("só 1 é singular — zero é plural nos dois idiomas", () => {
    expect(pluralSuffix(1)).toBe("one");
    expect(pluralSuffix(-1)).toBe("one");
    expect(pluralSuffix(0)).toBe("other");
    expect(pluralSuffix(2)).toBe("other");
  });
});
