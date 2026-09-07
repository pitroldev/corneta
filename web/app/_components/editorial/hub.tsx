import Link from "next/link";
import type { ElementType, ReactNode } from "react";
import { Mascot, SoundWaves } from "@/app/_components/decor";
import { cn } from "@/app/_components/ui";
import type { SiteCtaId } from "@/lib/telemetry-schema";

export interface EditorialHubLink {
  href: string;
  label: string;
  current?: boolean;
  ctaId?: SiteCtaId;
}

export function EditorialCollectionHero({
  label,
  title,
  description,
  breadcrumbs,
  headingId = "editorial-collection-title",
}: {
  label: string;
  title: string;
  description: string;
  breadcrumbs: ReactNode;
  headingId?: string;
}) {
  return (
    <section className="editorial-collection-hero" aria-labelledby={headingId}>
      <div className="editorial-collection-hero__inner">
        <div className="editorial-collection-hero__breadcrumbs">
          {breadcrumbs}
        </div>
        <div className="editorial-collection-hero__heading">
          <h1 id={headingId}>{title}</h1>
          <div className="editorial-collection-hero__summary">
            <p className="editorial-collection-hero__label">{label}</p>
            <p className="editorial-collection-hero__description">
              {description}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function EditorialTopicDirectory({
  id = "categories",
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const headingId = `${id}-title`;

  return (
    <section
      id={id}
      className="editorial-topic-directory"
      aria-labelledby={headingId}
    >
      <div className="editorial-topic-directory__inner">
        <header className="editorial-topic-directory__header">
          <p className="editorial-topic-directory__eyebrow">{title}</p>
          <h2 id={headingId}>{description}</h2>
        </header>
        <ol className="editorial-topic-directory__list">{children}</ol>
      </div>
    </section>
  );
}

export function EditorialTopicLink({
  href,
  index,
  title,
  description,
  countLabel,
}: {
  href: string;
  index: number;
  title: string;
  description: string;
  countLabel?: string;
}) {
  return (
    <li className="editorial-topic-directory__item">
      <Link href={href} className="editorial-topic-directory__link">
        <span className="editorial-topic-directory__number" aria-hidden="true">
          {String(index).padStart(2, "0")}
        </span>
        <span className="editorial-topic-directory__copy">
          <span className="editorial-topic-directory__title">{title}</span>
          <span className="editorial-topic-directory__description">
            {description}
          </span>
        </span>
        {countLabel ? (
          <span className="editorial-topic-directory__count">{countLabel}</span>
        ) : null}
        <span className="editorial-topic-directory__arrow" aria-hidden="true">
          →
        </span>
      </Link>
    </li>
  );
}

export function EditorialHubHero({
  label,
  title,
  description,
  breadcrumbs,
  navigationLabel,
  links = [],
  children,
  headingId = "editorial-hub-title",
}: {
  label: string;
  title: string;
  description: string;
  breadcrumbs?: ReactNode;
  navigationLabel?: string;
  links?: readonly EditorialHubLink[];
  children?: ReactNode;
  headingId?: string;
}) {
  return (
    <section className="editorial-hub-hero" aria-labelledby={headingId}>
      <div className="editorial-hub-hero__inner">
        <div className="editorial-hub-hero__copy">
          {breadcrumbs ? (
            <div className="editorial-hub-hero__breadcrumbs">{breadcrumbs}</div>
          ) : null}
          <p className="editorial-hub-hero__label">{label}</p>
          <h1 id={headingId}>{title}</h1>
          <p className="editorial-hub-hero__description">{description}</p>

          {links.length > 0 && navigationLabel ? (
            <nav
              className="editorial-hub-hero__nav"
              aria-label={navigationLabel}
            >
              <ul>
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={link.current ? "page" : undefined}
                      data-telemetry-cta={link.ctaId}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>

        {children ? (
          <aside className="editorial-hub-hero__aside">{children}</aside>
        ) : (
          <div className="editorial-hub-hero__signal" aria-hidden="true">
            <SoundWaves className="editorial-hub-hero__waves" count={4} />
            <span className="editorial-hub-hero__mark">
              <Mascot />
            </span>
            <span className="editorial-hub-hero__sheet">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

export function EditorialCategorySection({
  id,
  title,
  description,
  action,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      className="editorial-category-section"
      aria-labelledby={headingId}
    >
      <header className="editorial-category-section__header">
        <div>
          <h2 id={headingId}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? (
          <div className="editorial-category-section__action">{action}</div>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export function EditorialCardGrid({ children }: { children: ReactNode }) {
  return <div className="editorial-card-grid">{children}</div>;
}

export interface EditorialCardProps {
  href: string;
  title: string;
  summary: string;
  label?: string;
  meta?: ReactNode;
  ctaLabel: string;
  featured?: boolean;
  headingAs?: "h2" | "h3";
  ctaId?: SiteCtaId;
}

export function EditorialCard({
  href,
  title,
  summary,
  label,
  meta,
  ctaLabel,
  featured = false,
  headingAs = "h3",
  ctaId,
}: EditorialCardProps) {
  const Heading = headingAs as ElementType;
  return (
    <article
      className={cn("editorial-card", featured && "editorial-card--featured")}
    >
      <div className="editorial-card__copy">
        {label ? <p className="editorial-card__label">{label}</p> : null}
        <Heading className="editorial-card__title">
          <Link href={href} data-telemetry-cta={ctaId}>
            {title}
          </Link>
        </Heading>
        <p className="editorial-card__summary">{summary}</p>
        <div className="editorial-card__foot">
          {meta ? <div className="editorial-card__meta">{meta}</div> : <span />}
          <Link
            className="editorial-card__cta"
            href={href}
            data-telemetry-cta={ctaId}
          >
            {ctaLabel} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
