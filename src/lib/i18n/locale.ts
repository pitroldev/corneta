export const LOCALES = ["pt-BR", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export type LanguageSetting = "auto" | Locale;

export const DEFAULT_LOCALE: Locale = "pt-BR";

export const isLocale = (v: string): v is Locale =>
  (LOCALES as readonly string[]).includes(v);

/** Display each language name in that language. */
export const LOCALE_LABEL: Record<Locale, string> = {
  "pt-BR": "Português",
  en: "English",
};

/** Match base BCP-47 language tags, including regional variants. */
function matchLocale(tag: string): Locale | null {
  const base = tag.toLowerCase().split("-")[0];
  if (base === "pt") return "pt-BR";
  if (base === "en") return "en";
  return null;
}

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

export function resolveLocale(
  setting: LanguageSetting | undefined,
  system: Locale = detectSystemLocale(),
): Locale {
  if (setting && setting !== "auto" && isLocale(setting)) return setting;
  return system;
}

export type Vars = Record<string, string | number>;

/** Keep missing placeholders visible instead of silently dropping their values. */
export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (all, name: string) =>
    name in vars ? String(vars[name]) : all,
  );
}

/** Supported locales use one/other; zero selects other. */
export const pluralSuffix = (count: number): "one" | "other" =>
  Math.abs(count) === 1 ? "one" : "other";
