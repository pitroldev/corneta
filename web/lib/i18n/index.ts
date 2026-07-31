// ============================================================
// Ponto de entrada da tradução: pega o dicionário do idioma e devolve o `t`.
// ============================================================
import type { Locale } from "./locale";
import { pt, type Dict, type MessageKey } from "./pt";
import { en } from "./en";

export * from "./locale";
export type { Dict, MessageKey };

const DICTS: Record<Locale, Dict> = { "pt-BR": pt, en };

/** Função de tradução de um idioma. É o que as seções recebem por prop. */
export type T = (key: MessageKey) => string;

export function getDict(locale: Locale): Dict {
  return DICTS[locale] ?? pt;
}

/** `t` do idioma pedido.
 *
 *  Sem fallback silencioso pro português: o TypeScript já garante que o inglês
 *  tem todas as chaves, e cair no pt-BR escondido faria uma frase em português
 *  aparecer no meio da página inglesa sem ninguém ficar sabendo. */
export function translator(locale: Locale): T {
  const dict = getDict(locale);
  return (key) => dict[key];
}

/**
 * Preenche os buracos `{assim}` de uma frase já traduzida.
 *
 *  NÃO é ICU e não quer ser: a LP tem meia dúzia de frases com variável, e o
 *  `dict.test.ts` já garante que os dois idiomas usam os MESMOS buracos. Um
 *  formatador de verdade aqui seria peso sem freguês.
 *
 *  Buraco sem valor fica como está, visível — some é pior, porque a frase sai
 *  gramaticalmente inteira e factualmente errada.
 */
export function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? vars[name] : whole,
  );
}

/**
 * Separador de milhar do idioma.
 *
 *  NÃO é chave de dicionário: o valor do português é um ESPAÇO, e o
 *  `dict.test.ts` reprova — com razão — frase que fica vazia depois do `trim()`.
 *  Isto aqui é regra de formatação, não frase.
 */
export function thousandsSep(locale: Locale): string {
  return locale === "en" ? "," : " ";
}

/**
 * Agrupa o milhar no estilo que a LP já usa à mão ("1 284", "3 412").
 *
 *  Não é `Intl.NumberFormat`: em pt-BR ele devolveria "1.284", e aí o número que
 *  se MOVE nos painéis divergiria do número escrito ao lado, na mesma tela.
 */
export function group(n: number, sep: string): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}
