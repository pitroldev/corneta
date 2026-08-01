import { describe, expect, it } from "vitest";
import { pt } from "./pt";
import { en } from "./en";

// Guarda de contrato entre os dois dicionários.
//
// O TypeScript já obriga o `en` a ter as MESMAS CHAVES do `pt` (Dict vem de pt),
// mas ele não olha dentro do texto. O buraco `{assim}` é conteúdo, não tipo — e
// quando o pt escreve {tipo} e o inglês escreve {block} pra mesma frase, ninguém
// reclama: o app só mostra "{block}" cru na tela de quem trocou o idioma. Este
// teste é o que impede isso de nascer de novo.

const VAR_RE = /\{(\w+)\}/g;
const varsOf = (text: string) =>
  [...text.matchAll(VAR_RE)].map((m) => m[1]).sort();

// Os dicionários são `as const`: cada valor vira um literal próprio, e juntar as
// duas listas confunde o inferidor. Aqui só interessa "chave → texto".
const entries = (dict: object) => Object.entries(dict) as [string, string][];

describe("dicionários pt/en", () => {
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

  it("não deixam sintaxe ICU no texto — o interpolate só entende {buraco}", () => {
    const icu = [...entries(pt), ...entries(en)]
      .filter(([, text]) => /\{\s*\w+\s*,/.test(text))
      .map(([key]) => key);
    expect(icu).toEqual([]);
  });

  it("fecham todo `**negrito**` que abrem", () => {
    // Ímpar = alguém abriu e não fechou; a frase apareceria com asterisco na tela.
    const unbalanced = [...entries(pt), ...entries(en)]
      .filter(([, text]) => (text.match(/\*\*/g)?.length ?? 0) % 2 !== 0)
      .map(([key]) => key);
    expect(unbalanced).toEqual([]);
  });

  it("marcam o negrito nos dois idiomas ou em nenhum", () => {
    // Um lado com `**` e o outro sem quer dizer tradução feita sem olhar o
    // original — e a versão sem marca perde o destaque em silêncio.
    const halfMarked = Object.keys(pt).filter(
      (key) =>
        pt[key as keyof typeof pt].includes("**") !==
        en[key as keyof typeof en].includes("**"),
    );
    expect(halfMarked).toEqual([]);
  });

  it("não deixam frase vazia", () => {
    const empty = [...entries(pt), ...entries(en)]
      .filter(([, text]) => text.trim() === "")
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it("não deixam português no texto em inglês", () => {
    // Gêmeo do `toda_mensagem_foi_de_fato_traduzida` do Rust (i18n.rs).
    //
    // "Corneta" é o nome do produto e atravessa os dois idiomas. Fora ele, uma
    // frase em inglês não tem por que carregar acento nem os nomes de botão em
    // português: o app em inglês diz GO LIVE, BE RIGHT BACK e Table.
    //
    // TOPÔNIMO também atravessa: em inglês se escreve "São Paulo" com o til, e
    // tirá-lo pra passar num teste sobre TRADUÇÃO seria consertar a régua errada.
    const ACENTO = /[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/;
    const TERMOS = ["JÁ VOLTO", "BORA AO VIVO", "BORA", "Mesa"];
    const ATRAVESSAM = /Corneta|São Paulo/g;
    const leaked = entries(en)
      .filter(([, text]) => {
        const limpo = text.replace(ATRAVESSAM, "");
        return ACENTO.test(limpo) || TERMOS.some((x) => limpo.includes(x));
      })
      .map(([key]) => key);
    expect(leaked).toEqual([]);
  });
  // Vício 4.5 do docs/TOM-DE-VOZ.md: nome interno na cara do streamer.
  //
  // Palavra que só existe no nosso código ou no nosso design system, escrita
  // como se quem lê soubesse dela. É o vício que a regra do "substantivo
  // abstrato" NÃO pega — "a linha de latão" é concretíssima, só que num
  // vocabulário que o streamer não tem.
  //
  // Este teste existe porque a varredura manual achou cinco casos já no ar, e
  // três deles eram tradução regredindo pro nome do código ("slate") enquanto o
  // português dizia certo ("a tela JÁ VOLTO"). Doc não pega isso; teste pega.
  it("não deixam nome interno vazar pra copy", () => {
    const INTERNO =
      /\b(lat[ãa]o|breu|compositor|splicer|bomba|slate|ndjson|schemaVersion|halftone)\b/i;
    const vazou = [...entries(pt), ...entries(en)]
      .filter(([, text]) => INTERNO.test(text))
      .map(([key]) => key);
    expect(vazou).toEqual([]);
  });
});
