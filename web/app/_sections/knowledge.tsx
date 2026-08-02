import Link from "next/link";
import { localePath, type Locale, type T } from "@/lib/i18n";
import { ArrowIcon } from "../_components/icons";
import { cn, Section, SectionHeading, Shell } from "../_components/ui";

const CARD =
  "group relative isolate flex min-h-[250px] flex-col justify-between overflow-hidden rounded-lg border-[3px] border-ink p-[clamp(24px,3vw,36px)] text-ink shadow-[7px_7px_0_0_var(--ink)] outline-offset-4 transition-transform duration-180 hover:-translate-y-1 focus-visible:outline-[4px] focus-visible:outline-tomate";

export function KnowledgeEntryPoints({ t, locale }: { t: T; locale: Locale }) {
  const entries = [
    {
      href: localePath(locale, "/guides"),
      cta: "home_guides" as const,
      number: "01",
      eyebrow: t("knowledge.guides.eyebrow"),
      title: t("knowledge.guides.title"),
      description: t("knowledge.guides.description"),
      action: t("knowledge.guides.action"),
      className: "bg-tomate",
    },
    {
      href: localePath(locale, "/help"),
      cta: "home_help" as const,
      number: "02",
      eyebrow: t("knowledge.help.eyebrow"),
      title: t("knowledge.help.title"),
      description: t("knowledge.help.description"),
      action: t("knowledge.help.action"),
      className: "bg-brass",
    },
  ];

  return (
    <Section tone="paper-raised">
      <Shell>
        <SectionHeading
          tone="paper"
          kicker={t("knowledge.kicker")}
          title={t("knowledge.title")}
        >
          <p>{t("knowledge.description")}</p>
        </SectionHeading>

        <div className="mt-[clamp(38px,5vw,64px)] grid grid-cols-2 gap-[clamp(22px,3vw,38px)] max-[760px]:grid-cols-1">
          {entries.map((entry) => (
            <Link
              key={entry.href}
              href={entry.href}
              data-telemetry-cta={entry.cta}
              className={cn(CARD, entry.className)}
            >
              <span
                aria-hidden="true"
                className="absolute -top-7 -right-2 -z-10 font-display text-[9rem] leading-none font-black text-ink/10 transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105"
              >
                {entry.number}
              </span>

              <span className="font-display text-[0.76rem] font-black tracking-[0.12em] uppercase">
                {entry.eyebrow}
              </span>

              <div className="mt-12">
                <h3 className="max-w-[15ch] text-[clamp(1.8rem,3vw,2.7rem)] leading-[0.98] tracking-[-0.025em]">
                  {entry.title}
                </h3>
                <p className="mt-4 max-w-[52ch] leading-[1.6] font-semibold text-ink-muted">
                  {entry.description}
                </p>
                <span className="mt-7 inline-flex min-h-11 items-center gap-2 font-display text-[0.94rem] font-black [&>svg]:size-5 [&>svg]:transition-transform group-hover:[&>svg]:translate-x-1">
                  {entry.action} <ArrowIcon />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </Shell>
    </Section>
  );
}
