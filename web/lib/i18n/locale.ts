export const LOCALES = ["pt-BR", "en"] as const;
export type Locale = (typeof LOCALES)[number];

// Portuguese uses the established unprefixed canonical URL.
export const DEFAULT_LOCALE: Locale = "pt-BR";
/** Visitors whose languages are all outside the catalog get English; no preference keeps the default. */
export const FALLBACK_LOCALE: Locale = "en";

// An explicit cookie preference must override automatic language negotiation.
export const LOCALE_COOKIE = "corneta.locale";

export const isLocale = (v: string): v is Locale =>
  (LOCALES as readonly string[]).includes(v);

export function localePath(locale: Locale, path = "/"): string {
  const clean = path === "/" ? "" : path.replace(/\/+$/, "");
  return locale === DEFAULT_LOCALE ? clean || "/" : `/${locale}${clean}`;
}

export const LOCALE_LABEL: Record<Locale, string> = {
  "pt-BR": "Português",
  en: "English",
};

export const OG_LOCALE: Record<Locale, string> = {
  "pt-BR": "pt_BR",
  en: "en_US",
};

interface Preference {
  tag: string;
  q: number;
}

// RFC 9110 defaults q to 1; q=0 excludes a language rather than lowering its priority.
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

function matchLocale(tag: string): Locale | null {
  const base = tag.split("-")[0];
  if (base === "pt") return "pt-BR";
  if (base === "en") return "en";
  return null;
}

export function negotiateLocale(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const tags = parseAcceptLanguage(header);
  for (const { tag } of tags) {
    if (tag === "*") return DEFAULT_LOCALE;
    const hit = matchLocale(tag);
    if (hit) return hit;
  }
  return tags.length ? FALLBACK_LOCALE : DEFAULT_LOCALE;
}
