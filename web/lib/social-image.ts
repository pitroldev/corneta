import type { Locale } from "./i18n";
import { siteUrl } from "./site";

export const SOCIAL_IMAGE_SIZE = { width: 1200, height: 630 } as const;

const SOCIAL_IMAGE: Record<Locale, { path: string; alt: string }> = {
  "pt-BR": {
    path: "/opengraph-image",
    alt: "Corneta — uma live, várias comunidades, tudo no seu controle",
  },
  en: {
    path: "/opengraph-image/en",
    alt: "Corneta — one stream, many communities, you stay in control",
  },
};

/** The share card in the page's language, ready for Open Graph and X. */
export function socialImage(locale: Locale) {
  const { path, alt } = SOCIAL_IMAGE[locale];
  return {
    url: new URL(path, siteUrl).toString(),
    alt,
    ...SOCIAL_IMAGE_SIZE,
  };
}
