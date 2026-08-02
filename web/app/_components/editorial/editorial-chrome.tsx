import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/app/_components/brand-mark";
import { SiteFooter } from "@/app/_sections/closing";
import { localePath, translator, type Locale } from "@/lib/i18n";
import type { SiteCtaId } from "@/lib/telemetry-schema";

export interface EditorialChromeLink {
  href: string;
  label: string;
  /** Texto mais descritivo quando o rótulo visual não basta para a marca. */
  ariaLabel?: string;
  hrefLang?: string;
  ctaId?: SiteCtaId;
}

export interface EditorialChromeLinks {
  home: EditorialChromeLink;
  help: EditorialChromeLink;
  guides: EditorialChromeLink;
  search: EditorialChromeLink;
  /** Link já resolvido para a versão equivalente no outro idioma. */
  language?: EditorialChromeLink;
}

export interface EditorialHeaderProps {
  locale: Locale;
  links: EditorialChromeLinks;
  current?: "home" | "help" | "guides" | "search";
  navLabel: string;
}

/**
 * Cabeçalho editorial sem estado no cliente. Os três destinos permanecem
 * visíveis em telas estreitas e com zoom alto; não há menu escondido por JS.
 */
export function EditorialHeader({
  locale,
  links,
  current,
  navLabel,
}: EditorialHeaderProps) {
  const navigation = [
    ["home", links.home],
    ["help", links.help],
    ["guides", links.guides],
    ["search", links.search],
  ] as const;

  return (
    <header className="editorial-header" data-locale={locale}>
      <div className="editorial-header__inner">
        <Link
          className="editorial-header__brand"
          href={links.home.href}
          aria-label={links.home.ariaLabel ?? links.home.label}
        >
          <BrandMark tag={false} />
        </Link>

        <nav className="editorial-header__nav" aria-label={navLabel}>
          <ul>
            {navigation.map(([key, item]) => (
              <li key={key}>
                <Link
                  href={item.href}
                  aria-current={current === key ? "page" : undefined}
                  hrefLang={item.hrefLang}
                  data-telemetry-cta={item.ctaId}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {links.language ? (
          <Link
            className="editorial-header__language"
            href={links.language.href}
            hrefLang={links.language.hrefLang}
            aria-label={links.language.ariaLabel}
            data-telemetry-cta={links.language.ctaId}
          >
            {links.language.label}
          </Link>
        ) : null}
      </div>
    </header>
  );
}

export interface EditorialChromeProps extends EditorialHeaderProps {
  children: ReactNode;
  skipLabel: string;
  footer?: ReactNode;
  mainId?: string;
}

/** Casca compartilhada pelos hubs e artigos. Continua sendo Server Component. */
export function EditorialChrome({
  children,
  footer,
  skipLabel,
  mainId = "editorial-main",
  ...header
}: EditorialChromeProps) {
  const resolvedFooter = footer ?? (
    <SiteFooter
      t={translator(header.locale)}
      locale={header.locale}
      downloadUrl={
        process.env.NEXT_PUBLIC_PRIMARY_CTA_URL ??
        localePath(header.locale, "/#download")
      }
    />
  );

  return (
    <div className="editorial-chrome" data-locale={header.locale}>
      <a className="editorial-skip-link" href={`#${mainId}`}>
        {skipLabel}
      </a>
      <EditorialHeader {...header} />
      <main id={mainId} className="editorial-main" tabIndex={-1}>
        {children}
      </main>
      {resolvedFooter}
    </div>
  );
}
