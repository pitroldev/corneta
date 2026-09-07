import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  resolveLocale,
  type LanguageSetting,
  type Locale,
  type Vars,
} from "./locale";
import { makeFmt, type Fmt } from "./format";
import type { Dict, MessageKey } from "./pt";
import { buildI18n } from "./core";

export * from "./locale";
export { makeFmt, fileStamp, type Fmt } from "./format";
export { bold, rich, strong } from "./rich";
export type { Dict, MessageKey };

/** Load only the active dictionary to keep translations out of the initial bundle. */
const LOADERS: Record<Locale, () => Promise<Dict>> = {
  "pt-BR": () => import("./pt").then((m) => m.pt),
  en: () => import("./en").then((m) => m.en),
};

export interface I18n {
  locale: Locale;
  t: (key: MessageKey, vars?: Vars) => string;
  /** Select one/other and interpolate count. */
  tp: (key: string, count: number, vars?: Vars) => string;
  fmt: Fmt;
}

/** Leave missing keys visible; the provider withholds children until their dictionary loads. */
const LOADING: I18n = {
  locale: DEFAULT_LOCALE,
  t: (key) => key,
  tp: (key) => key,
  fmt: makeFmt(DEFAULT_LOCALE),
};

const Ctx = createContext<I18n>(LOADING);

export function I18nProvider({
  language,
  children,
}: {
  language: LanguageSetting | undefined;
  children: ReactNode;
}) {
  const locale = useMemo(() => resolveLocale(language), [language]);
  const [dict, setDict] = useState<{ locale: Locale; dict: Dict } | null>(null);

  useEffect(() => {
    let alive = true;
    void LOADERS[locale]().then((d) => {
      if (alive) setDict({ locale, dict: d });
    });
    return () => {
      alive = false;
    };
  }, [locale]);

  const value = useMemo(
    () => (dict ? buildI18n(dict.locale, dict.dict) : LOADING),
    [dict],
  );

  // Do not render raw keys while the requested dictionary loads.
  if (!dict || dict.locale !== locale) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = (): I18n => useContext(Ctx);

export const useT = (): I18n["t"] => useContext(Ctx).t;
