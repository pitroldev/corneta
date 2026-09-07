import { Fragment, type ReactNode } from "react";
import { legalUrl } from "../lib/legal";
import { useI18n } from "../lib/i18n";
import { cn, openExternal } from "../lib/utils";

/** Open current legal documents in the browser instead of embedding a stale copy. */
export function LegalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => void openExternal(href)}
      className="font-semibold text-ink underline decoration-brass decoration-2 underline-offset-2 transition-colors hover:text-brass"
    >
      {children}
    </button>
  );
}

/** Keep the acceptance notice visible on every onboarding step and dismissal path. */
export function LegalAcceptNote({ className }: { className?: string }) {
  const { t, locale } = useI18n();
  // Translate the complete sentence before inserting links so word order remains locale-specific.
  const parts = t("components.legal.accept").split(/(\{terms\}|\{privacy\})/);
  return (
    <p
      className={cn(
        "text-center text-[11px] leading-relaxed text-ink-faint",
        className,
      )}
    >
      {parts.map((part, i) =>
        part === "{terms}" ? (
          <LegalLink key={i} href={legalUrl(locale, "terms")}>
            {t("components.legal.link.terms")}
          </LegalLink>
        ) : part === "{privacy}" ? (
          <LegalLink key={i} href={legalUrl(locale, "privacy")}>
            {t("components.legal.link.privacy")}
          </LegalLink>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </p>
  );
}
