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
