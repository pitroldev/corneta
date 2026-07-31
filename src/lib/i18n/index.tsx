// ============================================================
// Distribuição da tradução no app.
//
// Aqui é contexto do React, não prop — ao contrário da LP, que é server
// component e precisa passar `t` na mão. O app é SPA de cliente: o idioma sai
// da config, muda em tempo real quando a pessoa troca nas Configurações, e
// qualquer componente pega com `useT()`.
// ============================================================
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
  interpolate,
  pluralSuffix,
  resolveLocale,
  type LanguageSetting,
  type Locale,
  type Vars,
} from "./locale";
import { makeFmt, type Fmt } from "./format";
import type { Dict, MessageKey } from "./pt";

export * from "./locale";
export { makeFmt, fileStamp, type Fmt } from "./format";
export { bold, rich, strong } from "./rich";
export type { Dict, MessageKey };

/** Os dicionários entram por import DINÂMICO, e é decisão de peso, não de gosto.
 *
 *  Somados eles pesam ~40 KiB gzip. Estáticos, iam parar no chunk principal e o
 *  `bundle:check` reprovou o build em 139 KiB contra um teto de 110. Dinâmicos,
 *  cada idioma vira seu próprio arquivo — carrega só o que está em uso, e o
 *  chunk principal volta ao tamanho de antes.
 *
 *  O custo é um quadro em branco no primeiro render. Num app de desktop o
 *  arquivo vem do disco local, então são milissegundos. */
const LOADERS: Record<Locale, () => Promise<Dict>> = {
  "pt-BR": () => import("./pt").then((m) => m.pt),
  en: () => import("./en").then((m) => m.en),
};

export interface I18n {
  locale: Locale;
  /** Texto do idioma ativo, com `{buraco}` preenchido. */
  t: (key: MessageKey, vars?: Vars) => string;
  /** Texto que muda com a contagem. Procura `chave.one` / `chave.other` e já
   *  passa `count` como buraco — é o que evita "1 platforms". */
  tp: (key: string, count: number, vars?: Vars) => string;
  fmt: Fmt;
}

function build(locale: Locale, dict: Dict): I18n {
  const t = (key: MessageKey, vars?: Vars) => interpolate(dict[key], vars);
  return {
    locale,
    t,
    tp: (key, count, vars) => {
      const chosen = `${key}.${pluralSuffix(count)}` as MessageKey;
      // Sem a variante, cai na chave crua: melhor a frase no singular do que
      // `undefined` na tela.
      const template = dict[chosen] ?? dict[key as MessageKey];
      return interpolate(template, { count, ...vars });
    },
    fmt: makeFmt(locale),
  };
}

/** Sem dicionário carregado, `t` devolve a própria chave.
 *
 *  Chave crua na tela é feia, mas é HONESTA: quem vê "chat.header.title" sabe na
 *  hora que faltou tradução. Devolver vazio esconderia o problema. Na prática o
 *  provider nem renderiza os filhos nesse estado. */
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
  // `resolveLocale` lê o idioma do sistema só quando `language` é "auto".
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
    () => (dict ? build(dict.locale, dict.dict) : LOADING),
    [dict],
  );

  // Enquanto o idioma pedido não chegou, não renderiza: mostrar a interface
  // inteira com chave crua e trocar 20ms depois pisca mais do que a espera.
  if (!dict || dict.locale !== locale) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** O gancho que todo componente usa. */
export const useI18n = (): I18n => useContext(Ctx);

/** Atalho pro caso comum (só texto). */
export const useT = (): I18n["t"] => useContext(Ctx).t;
