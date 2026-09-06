import type { I18n } from "./index";
import { makeFmt } from "./format";
import { interpolate, pluralSuffix, type Locale } from "./locale";
import type { Dict, MessageKey } from "./pt";

export function buildI18n(locale: Locale, dict: Dict): I18n {
  const t: I18n["t"] = (key, vars) => interpolate(dict[key], vars);
  return {
    locale,
    t,
    tp: (key, count, vars) =>
      interpolate(
        dict[`${key}.${pluralSuffix(count)}` as MessageKey] ??
          dict[key as MessageKey],
        { count, ...vars },
      ),
    fmt: makeFmt(locale),
  };
}

export async function loadI18n(locale: Locale): Promise<I18n> {
  const dict =
    locale === "en" ? (await import("./en")).en : (await import("./pt")).pt;
  return buildI18n(locale, dict);
}
