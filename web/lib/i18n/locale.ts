// ============================================================
// Idiomas da LP: catálogo, rotas e negociação de `Accept-Language`.
//
// Núcleo puro de propósito — `negotiateLocale` é o que o middleware usa pra
// decidir se manda alguém pro inglês, e errar essa decisão é mandar o público
// brasileiro pra página errada. Tem teste.
// ============================================================

export const LOCALES = ["pt-BR", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** O português é o padrão porque é o público do produto — e porque `/` já está
 *  indexado em pt-BR. Trocar isso significaria mudar a URL canônica do site. */
export const DEFAULT_LOCALE: Locale = "pt-BR";

/** Cookie que guarda a escolha explícita. Enquanto ele existir, o middleware não
 *  opina: quem trocou de idioma na mão não quer ser redirecionado de novo. */
export const LOCALE_COOKIE = "corneta.locale";

export const isLocale = (v: string): v is Locale =>
  (LOCALES as readonly string[]).includes(v);

/** Caminho público de um idioma. O padrão NÃO leva prefixo: `/` continua sendo a
 *  home em português, e só o inglês ganha `/en`. */
export function localePath(locale: Locale, path = "/"): string {
  const clean = path === "/" ? "" : path.replace(/\/+$/, "");
  return locale === DEFAULT_LOCALE ? clean || "/" : `/${locale}${clean}`;
}

/** Rótulo do idioma escrito NO próprio idioma — quem procura "English" não lê
 *  "Inglês", e quem procura "Português" não lê "Portuguese". */
export const LOCALE_LABEL: Record<Locale, string> = {
  "pt-BR": "Português",
  en: "English",
};

/** Código para `<html lang>` e Open Graph (`og:locale` usa underscore). */
export const OG_LOCALE: Record<Locale, string> = {
  "pt-BR": "pt_BR",
  en: "en_US",
};

interface Preference {
  tag: string;
  q: number;
}

/** Quebra o cabeçalho em pares tag/qualidade, do mais desejado pro menos.
 *
 *  `q` ausente vale 1 (é o default do RFC 9110). `q=0` significa "NÃO me mande
 *  isto" — some da lista em vez de virar a última opção. */
function parseAcceptLanguage(header: string): Preference[] {
  return header
    .split(",")
    .map((part): Preference | null => {
      const [tag, ...params] = part.trim().split(";");
      if (!tag) return null;
      const qParam = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="));
      const q = qParam ? Number(qParam.slice(2)) : 1;
      if (!Number.isFinite(q) || q <= 0) return null;
      return { tag: tag.trim().toLowerCase(), q };
    })
    .filter((p): p is Preference => p !== null)
    .sort((a, b) => b.q - a.q);
}

/** Idioma suportado que casa com uma tag pedida.
 *
 *  Casa pelo idioma base, não pela tag inteira: `pt-PT` e `pt` caem no pt-BR, e
 *  `en-GB` cai no inglês. Um português de Portugal lê a página brasileira muito
 *  melhor do que leria a inglesa. */
function matchLocale(tag: string): Locale | null {
  const base = tag.split("-")[0];
  if (base === "pt") return "pt-BR";
  if (base === "en") return "en";
  return null;
}

/** Melhor idioma pra um `Accept-Language`, ou o padrão quando nada casa.
 *
 *  Sem cabeçalho, cabeçalho vazio ou só `*`: padrão. Falante de espanhol também
 *  cai no padrão — nenhum dos dois idiomas é o dele, e o português é o que o
 *  site declara como `x-default`. */
export function negotiateLocale(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  for (const { tag } of parseAcceptLanguage(header)) {
    if (tag === "*") return DEFAULT_LOCALE;
    const hit = matchLocale(tag);
    if (hit) return hit;
  }
  return DEFAULT_LOCALE;
}
