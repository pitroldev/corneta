import { describe, it, expect } from "vitest";
import { negotiateLocale, localePath, DEFAULT_LOCALE } from "./locale";

describe("negotiateLocale", () => {
  it("sem cabeçalho, cai no padrão", () => {
    expect(negotiateLocale(null)).toBe("pt-BR");
    expect(negotiateLocale(undefined)).toBe("pt-BR");
    expect(negotiateLocale("")).toBe("pt-BR");
  });

  it("casa pelo idioma base, não pela tag inteira", () => {
    // Um português de Portugal lê a página brasileira muito melhor que a inglesa.
    expect(negotiateLocale("pt-PT")).toBe("pt-BR");
    expect(negotiateLocale("pt")).toBe("pt-BR");
    expect(negotiateLocale("en-GB")).toBe("en");
    expect(negotiateLocale("en-US,en;q=0.9")).toBe("en");
  });

  it("respeita a ordem de qualidade, não a ordem do texto", () => {
    expect(negotiateLocale("en;q=0.4,pt-BR;q=0.9")).toBe("pt-BR");
    expect(negotiateLocale("pt;q=0.2,en;q=0.8")).toBe("en");
  });

  it("q=0 é recusa explícita — não vira última opção", () => {
    // "não me mande português" com inglês disponível tem que dar inglês.
    expect(negotiateLocale("pt-BR;q=0,en;q=0.5")).toBe("en");
  });

  it("idioma que não temos cai no padrão", () => {
    expect(negotiateLocale("es-AR,es;q=0.9")).toBe("pt-BR");
    expect(negotiateLocale("ja")).toBe("pt-BR");
    expect(negotiateLocale("*")).toBe("pt-BR");
  });

  it("ignora idioma desconhecido e continua procurando", () => {
    expect(negotiateLocale("de-DE,fr;q=0.8,en;q=0.3")).toBe("en");
  });

  it("não quebra com cabeçalho malformado", () => {
    expect(negotiateLocale(",,;q=,")).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale("en;q=abc")).toBe(DEFAULT_LOCALE);
  });
});

describe("localePath", () => {
  it("o padrão não leva prefixo — `/` continua sendo a home", () => {
    expect(localePath("pt-BR")).toBe("/");
    expect(localePath("pt-BR", "/legal/privacy")).toBe("/legal/privacy");
  });

  it("o inglês leva prefixo", () => {
    expect(localePath("en")).toBe("/en");
    expect(localePath("en", "/legal/privacy")).toBe("/en/legal/privacy");
  });

  it("não deixa barra sobrando no fim", () => {
    expect(localePath("en", "/")).toBe("/en");
    expect(localePath("en", "/algo/")).toBe("/en/algo");
  });
});
