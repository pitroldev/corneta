import Link from "next/link";

export interface EditorialBreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

export function EditorialBreadcrumbs({
  label,
  items,
}: {
  label: string;
  items: readonly EditorialBreadcrumbItem[];
}) {
  return (
    <nav className="editorial-breadcrumbs" aria-label={label}>
      <ol>
        {items.map((item, index) => {
          const current = item.current ?? index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`}>
              {item.href && !current ? (
                <Link href={item.href}>{item.label}</Link>
              ) : (
                <span aria-current={current ? "page" : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
