export const LEGAL_OPERATOR = "PCL DE SOUZA TECNOLOGIA";
export const LEGAL_CNPJ = "44.638.580/0001-12";

/** Copyright ownership is distinct from the legal operator. */
export const LEGAL_AUTHOR = "Petro Cardoso";

export const LEGAL_CONTACT = "corneta@pitrol.dev";

export const LEGAL_VENUE = "Rio de Janeiro, RJ";

export const LEGAL_HOST = "Vercel Inc.";

// Informational revision date, not an acceptance reset. Keep labels static for SSR.
export const LEGAL_UPDATED_ISO = "2026-09-07";
export const LEGAL_UPDATED_LABEL_PT = "7 de setembro de 2026";
export const LEGAL_UPDATED_LABEL_EN = "September 7, 2026";

// Mirror src/lib/legal.ts; change only for material terms that require renewed acceptance.
export const LEGAL_ACCEPT_VERSION = "2026-08-01";

// Unprefixed Portuguese paths are public contracts used by the installed desktop app.
export const LEGAL_ROUTES = {
  privacy: "/legal/privacy",
  terms: "/legal/terms-of-use",
} as const;

export function legalHref(
  locale: string,
  doc: keyof typeof LEGAL_ROUTES,
): string {
  const path = LEGAL_ROUTES[doc];
  return locale === "en" ? `/en${path}` : path;
}
