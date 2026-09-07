// Acceptance belongs to the installation, never exportable AppConfig; imported settings must not accept terms for another user.
// This local record controls repeat notices, not proof of identity or server-side acceptance.

export const LEGAL_SITE = "https://www.corneta.live";

const LEGAL_PATHS = {
  terms: "/legal/terms-of-use",
  privacy: "/legal/privacy",
} as const;

export function legalUrl(
  locale: string,
  doc: keyof typeof LEGAL_PATHS,
): string {
  const prefix = locale === "en" ? "/en" : "";
  return `${LEGAL_SITE}${prefix}${LEGAL_PATHS[doc]}`;
}

/** Increment only for material changes requiring renewed acceptance, independently of editorial review dates. */
export const LEGAL_ACCEPT_VERSION = "2026-08-01";

const KEY = "corneta.legal.accepted";

export interface LegalAcceptance {
  version: string;
  at: string;
}

export function readAcceptance(): LegalAcceptance | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as LegalAcceptance).version === "string" &&
      typeof (parsed as LegalAcceptance).at === "string"
    ) {
      return parsed as LegalAcceptance;
    }
  } catch {
    // Treat unavailable storage or malformed JSON as not accepted.
  }
  return null;
}

export function acceptedCurrent(): boolean {
  return readAcceptance()?.version === LEGAL_ACCEPT_VERSION;
}

/** Preserve the original acceptance timestamp when the tour is reopened. */
export function recordAcceptance(): void {
  if (acceptedCurrent()) return;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: LEGAL_ACCEPT_VERSION,
        at: new Date().toISOString(),
      } satisfies LegalAcceptance),
    );
  } catch {
    // Unavailable storage may repeat the notice but must not block app entry.
  }
}
