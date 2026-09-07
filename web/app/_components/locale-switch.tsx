"use client";

import {
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_LABEL,
  localePath,
  type Locale,
} from "@/lib/i18n";
import { GlobeIcon } from "./icons";
import { cn } from "./ui";

// Save the preference before navigation so the proxy cannot redirect it back.

const ONE_YEAR = 60 * 60 * 24 * 365;

function remember(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

export function LocaleSwitch({
  current,
  label,
  full = false,
}: {
  current: Locale;
  label: string;
  full?: boolean;
}) {
  const other = LOCALES.find((l) => l !== current) ?? current;

  return (
    <a
      href={localePath(other)}
      hrefLang={other}
      lang={other}
      onClick={() => remember(other)}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-md font-[650] whitespace-nowrap text-muted",
        "outline-offset-2 transition-colors duration-150 hover:bg-surface-2 hover:text-cream focus-visible:outline-[3px] focus-visible:outline-brass",
        "[&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:shrink-0 [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:[stroke-linecap:round] [&>svg]:[stroke-linejoin:round] [&>svg]:[stroke-width:1.9]",
        full ? "min-h-11 px-3 text-[0.95rem]" : "min-h-9 px-2 text-[0.84rem]",
        "[@media(pointer:coarse)]:min-h-11",
      )}
    >
      <GlobeIcon />
      {LOCALE_LABEL[other]}
    </a>
  );
}
