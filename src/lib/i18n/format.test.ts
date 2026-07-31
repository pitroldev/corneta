import { describe, it, expect } from "vitest";
import { makeFmt, fileStamp } from "./format";

const pt = makeFmt("pt-BR");
const en = makeFmt("en");
// 30/07/2026 às 20:15 no fuso local.
const T = new Date(2026, 6, 30, 20, 15).getTime();

describe("data e hora", () => {
  it("o americano lê mês primeiro", () => {
    expect(pt.date(T)).toBe("30/07/26");
    expect(en.date(T)).toBe("07/30/26");
  });

  it("hora fica em 24h nos dois — o alinhamento tabular do relatório depende disso", () => {
    expect(pt.time(T)).toBe("20:15");
    expect(en.time(T)).toBe("20:15");
  });
});

describe("número", () => {
  it("separador de milhar segue o idioma", () => {
    expect(pt.num(10868)).toBe("10.868");
    expect(en.num(10868)).toBe("10,868");
  });

  it("decimal segue o idioma", () => {
    expect(pt.dec(6.05)).toBe("6,1");
    expect(en.dec(6.05)).toBe("6.1");
    expect(pt.dec(9, 2)).toBe("9,00");
  });
});

describe("duração", () => {
  it("preserva o formato que o português já usava", () => {
    expect(pt.dur(3600 + 30 * 60)).toBe("1h30");
    expect(pt.dur(45 * 60)).toBe("45min");
  });

  it("o inglês leva a unidade nos dois casos", () => {
    expect(en.dur(3600 + 30 * 60)).toBe("1h30m");
    expect(en.dur(45 * 60)).toBe("45m");
  });
});

describe("ordenação", () => {
  it("acento entra no lugar certo em português", () => {
    const nomes = ["Zé", "Ana", "Ácaro"];
    expect([...nomes].sort(pt.compare)).toEqual(["Ácaro", "Ana", "Zé"]);
  });
});

describe("fileStamp", () => {
  it("NÃO segue o idioma: nome de arquivo é ISO pra ordenar sozinho", () => {
    expect(fileStamp(T)).toBe("2026-07-30");
  });
});
