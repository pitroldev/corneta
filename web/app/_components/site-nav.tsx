import Link from "next/link";
import type { ReactNode } from "react";
import type { SiteCtaId } from "@/lib/telemetry-schema";

export interface NavItem {
  href: string;
  ctaId?: SiteCtaId;
  label: string;
}

export interface SiteNavCopy {
  aria: string;
  items: NavItem[];
}

const LINK =
  "relative py-2 text-[0.88rem] font-[650] whitespace-nowrap text-muted transition-colors duration-150 " +
  "after:absolute after:inset-x-0 after:bottom-0.5 after:h-[3px] after:origin-right after:scale-x-0 after:bg-brass after:transition-transform after:duration-140 after:content-[''] " +
  "hover:text-cream hover:after:origin-left hover:after:scale-x-100 focus-visible:rounded-sm focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-brass";

export function SiteNav({
  copy,
  locale,
}: {
  copy: SiteNavCopy;
  locale: ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center gap-5 max-[980px]:gap-3 max-[760px]:hidden">
      <nav
        className="flex items-center gap-6 max-[980px]:gap-4"
        aria-label={copy.aria}
      >
        {copy.items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={LINK}
            data-telemetry-cta={item.ctaId}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border-soft" />
      {locale}
    </div>
  );
}
