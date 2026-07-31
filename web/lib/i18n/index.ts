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
