// ============================================================
// Idioma do app: catálogo, resolução do "automático" e interpolação.
//
// Núcleo puro e testado. A LP tem um módulo parecido em web/lib/i18n/locale.ts
// — são pacotes diferentes (React 18 aqui, 19 lá) e uma função de 30 linhas
// duplicada custa menos que um pacote compartilhado no meio do caminho.
// ============================================================

export const LOCALES = ["pt-BR", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** O que fica salvo na config. `auto` segue o idioma do Windows. */
export type LanguageSetting = "auto" | Locale;

export const DEFAULT_LOCALE: Locale = "pt-BR";

export const isLocale = (v: string): v is Locale =>
  (LOCALES as readonly string[]).includes(v);

/** Rótulo do idioma escrito NO próprio idioma — quem procura "English" não lê
 *  "Inglês". */
export const LOCALE_LABEL: Record<Locale, string> = {
  "pt-BR": "Português",
  en: "English",
};

/** Casa uma tag BCP-47 com um idioma que a gente tem.
 *
 *  Pelo idioma base, não pela tag inteira: `pt-PT` cai no pt-BR e `en-GB` no
 *  inglês. Português de Portugal lê a versão brasileira muito melhor que a
 *  inglesa. */
function matchLocale(tag: string): Locale | null {
  const base = tag.toLowerCase().split("-")[0];
  if (base === "pt") return "pt-BR";
  if (base === "en") return "en";
  return null;
}

/** Idioma do sistema, na ordem de preferência que o SO informou.
 *
 *  No WebView2 `navigator.languages` reflete o idioma de exibição do Windows.
 *  Nada casando (um sistema em espanhol, por exemplo) cai no padrão. */
export function detectSystemLocale(
  tags: readonly string[] | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator.languages,
): Locale {
  for (const tag of tags ?? []) {
    const hit = matchLocale(tag);
    if (hit) return hit;
  }
  return DEFAULT_LOCALE;
}

/** Config -> idioma efetivo. É o único lugar que sabe o que "auto" significa. */
export function resolveLocale(
  setting: LanguageSetting | undefined,
  system: Locale = detectSystemLocale(),
): Locale {
  if (setting && setting !== "auto" && isLocale(setting)) return setting;
  return system;
}

// ---------------------------------------------------------------------------
// Interpolação
// ---------------------------------------------------------------------------

export type Vars = Record<string, string | number>;

/** Troca `{nome}` pelos valores.
 *
 *  Buraco sem valor fica VISÍVEL (`{nome}` na tela) em vez de virar vazio: uma
 *  frase que perde silenciosamente o número parece certa e está errada, e ela
 *  passaria por qualquer revisão. */
export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (all, name: string) =>
    name in vars ? String(vars[name]) : all,
  );
}

/** Sufixo de plural pra uma contagem.
 *
 *  Duas formas só (`one`/`other`) porque é o que português e inglês precisam —
 *  e português trata zero como plural ("0 plataformas"), igual ao inglês. */
export const pluralSuffix = (count: number): "one" | "other" =>
  Math.abs(count) === 1 ? "one" : "other";
