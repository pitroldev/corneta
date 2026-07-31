import { describe, expect, it } from "vitest";
import { pt } from "./pt";
import { en } from "./en";

// Guarda de contrato entre os dois dicionários da LP.
//
// Gêmeo do `src/lib/i18n/dict.test.ts` do app. O TypeScript já obriga o `en` a
// ter as MESMAS CHAVES do `pt` (Dict vem de pt), mas não olha dentro do texto —
// e é lá que mora o estrago: um `{buraco}` com nome diferente de um lado, ou
// português esquecido no slot do inglês.

const VAR_RE = /\{(\w+)\}/g;
const varsOf = (text: string) =>
  [...text.matchAll(VAR_RE)].map((m) => m[1]).sort();

const entries = (dict: object) => Object.entries(dict) as [string, string][];

describe("dicionários pt/en da LP", () => {
  it("têm exatamente as mesmas chaves", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
  });

  it("usam os mesmos buracos em cada frase", () => {
    const mismatched = Object.keys(pt)
      .map((key) => ({
        key,
        pt: varsOf(pt[key as keyof typeof pt]),
        en: varsOf(en[key as keyof typeof en]),
      }))
      .filter((row) => row.pt.join(",") !== row.en.join(","));
    expect(mismatched).toEqual([]);
  });

  it("não deixam frase vazia", () => {
    const empty = [...entries(pt), ...entries(en)]
      .filter(([, text]) => text.trim() === "")
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it("não deixam português no texto em inglês", () => {
    // "Corneta" é o nome do produto e atravessa os dois idiomas. Fora ele, uma
    // frase em inglês não tem por que carregar acento nem os nomes de botão em
    // português — que agora se chamam GO LIVE, BE RIGHT BACK e Table.
    const ACENTO = /[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/;
    const TERMOS = ["JÁ VOLTO", "BORA AO VIVO", "BORA", "Mesa"];
    const leaked = entries(en)
      .filter(([, text]) => {
        const limpo = text.replace(/Corneta/g, "");
        return ACENTO.test(limpo) || TERMOS.some((x) => limpo.includes(x));
      })
      .map(([key]) => key);
    expect(leaked).toEqual([]);
  });
});
