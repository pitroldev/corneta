import type { Locale } from "./locale";
import { pt, type Dict, type MessageKey } from "./pt";
import { en } from "./en";

export * from "./locale";
export type { Dict, MessageKey };

const DICTS: Record<Locale, Dict> = { "pt-BR": pt, en };

export type T = (key: MessageKey) => string;

export function getDict(locale: Locale): Dict {
  return DICTS[locale] ?? pt;
}

// Do not silently fall back to Portuguese; dictionary parity is checked at compile time.
export function translator(locale: Locale): T {
  const dict = getDict(locale);
  return (key) => dict[key];
}

// Leave missing placeholders visible instead of silently producing incomplete facts.
export function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? vars[name] : whole,
  );
}

export function thousandsSep(locale: Locale): string {
  return locale === "en" ? "," : " ";
}

// Match the grouping used in static examples, including the Portuguese space separator.
export function group(n: number, sep: string): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}
