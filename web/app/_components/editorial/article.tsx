import Link from "next/link";
import type { ReactNode } from "react";
import { Mascot, SoundWaves } from "@/app/_components/decor";
import { InfoIcon } from "@/app/_components/icons";
import { cn } from "@/app/_components/ui";
import type { TocItem } from "@/lib/editorial/types";

export interface EditorialMetaItem {
  label: string;
  value: ReactNode;
  dateTime?: string;
}

export function EditorialMeta({
  items,
  label,
}: {
  items: readonly EditorialMetaItem[];
  label?: string;
}) {
  return (
    <dl className="editorial-meta" aria-label={label}>
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`}>
          <dt>{item.label}</dt>
          <dd>
            {item.dateTime && typeof item.value === "string" ? (
              <time dateTime={item.dateTime}>{item.value}</time>
            ) : (
              item.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function EditorialArticleHeader({
  label,
  title,
  summary,
  breadcrumbs,
  meta,
  notice,
  headingId = "editorial-article-title",
}: {
  label: string;
  title: string;
  summary: string;
  breadcrumbs?: ReactNode;
  meta?: ReactNode;
  notice?: ReactNode;
  headingId?: string;
}) {
  return (
    <header className="editorial-article-header">
      <div className="editorial-article-header__stage">
        <div className="editorial-article-header__copy">
          {breadcrumbs}
          <p className="editorial-article-header__label">{label}</p>
          <h1 id={headingId}>{title}</h1>
          <p className="editorial-article-header__summary">{summary}</p>
          {notice ? (
            <div className="editorial-article-header__notice">{notice}</div>
          ) : null}
        </div>
        {meta ? (
          <div className="editorial-article-header__meta">{meta}</div>
        ) : null}
      </div>
    </header>
  );
}

export function EditorialArticleShell({
  sidebar,
  children,
  after,
  labelledBy = "editorial-article-title",
}: {
  sidebar?: ReactNode;
  children: ReactNode;
  after?: ReactNode;
  labelledBy?: string;
}) {
  return (
    <div
      className={cn("editorial-article-shell", !sidebar && "is-single-column")}
    >
      {sidebar ? (
        <aside className="editorial-article-shell__sidebar">{sidebar}</aside>
      ) : null}
      <article
        className="editorial-article-shell__article"
        aria-labelledby={labelledBy}
      >
        {children}
        {after ? (
          <footer className="editorial-article-after">{after}</footer>
        ) : null}
      </article>
    </div>
  );
}

export function EditorialBody({ children }: { children: ReactNode }) {
  return <div className="editorial-prose">{children}</div>;
}

export type EditorialTocItem = TocItem;

function TocItems({ items }: { items: readonly EditorialTocItem[] }) {
  return (
    <ol>
      {items.map((item) => (
        <li key={item.id} data-level={item.level ?? 2}>
          <a href={`#${item.id}`}>{item.title}</a>
          {item.children?.length ? <TocItems items={item.children} /> : null}
        </li>
      ))}
    </ol>
  );
}

export function EditorialToc({
  label,
  title,
  items,
}: {
  label: string;
  title: string;
  items: readonly EditorialTocItem[];
}) {
  if (items.length === 0) return null;
  return (
    <nav className="editorial-toc" aria-label={label}>
      <details open>
        <summary>{title}</summary>
        <TocItems items={items} />
      </details>
    </nav>
  );
}

export interface EditorialRelatedItem {
  href: string;
  title: string;
  summary?: string;
  label?: string;
}

export function EditorialRelated({
  title,
  items,
  headingId = "editorial-related-title",
}: {
  title: string;
  items: readonly EditorialRelatedItem[];
  headingId?: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="editorial-related" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      <ul>
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} data-telemetry-cta="content_related">
              {item.label ? <span>{item.label}</span> : null}
              <strong>{item.title}</strong>
              {item.summary ? <small>{item.summary}</small> : null}
              <b aria-hidden="true">→</b>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EditorialCallout({
  label,
  tone = "note",
  children,
}: {
  label: string;
  tone?: "note" | "warning" | "important" | "limit";
  children: ReactNode;
}) {
  return (
    <aside className="editorial-callout" data-tone={tone}>
      <InfoIcon />
      <div>
        <strong>{label}</strong>
        <div>{children}</div>
      </div>
    </aside>
  );
}

export function EditorialEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="editorial-empty-state">
      <div className="editorial-empty-state__signal" aria-hidden="true">
        <SoundWaves count={3} />
        <span>
          <Mascot />
        </span>
      </div>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
        {action ? (
          <div className="editorial-empty-state__action">{action}</div>
        ) : null}
      </div>
    </section>
  );
}
