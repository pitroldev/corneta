import type { Locale } from "./locale";

export interface Fmt {
  date: (ms: number) => string;
  time: (ms: number) => string;
  num: (v: number) => string;
  dec: (v: number, digits?: number) => string;
  bitrate: (kbps: number) => string;
  dur: (seconds: number) => string;
  compare: (a: string, b: string) => number;
}

/** Use locale-independent ISO dates in filenames for stable sorting. */
export function fileStamp(ms: number): string {
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function makeFmt(locale: Locale): Fmt {
  const collator = new Intl.Collator(locale);
  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
  const timeFmt = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    // Use a 24-hour clock to keep report time columns aligned.
    hour12: false,
  });

  const dec = (v: number, digits = 1) =>
    v.toLocaleString(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  return {
    date: (ms) => dateFmt.format(ms),
    time: (ms) => timeFmt.format(ms),
    num: (v) => v.toLocaleString(locale),
    dec,
    bitrate: (kbps) =>
      kbps >= 1000 ? `${dec(kbps / 1000)} Mbps` : `${Math.round(kbps)} kbps`,
    dur: (seconds) => {
      const total = Math.round(seconds / 60);
      const h = Math.floor(total / 60);
      const m = total % 60;
      // Portuguese omits the minute suffix after hours; English includes it.
      const mm = String(m).padStart(2, "0");
      if (locale === "en") return h > 0 ? `${h}h${mm}m` : `${m}m`;
      return h > 0 ? `${h}h${mm}` : `${m}min`;
    },
    compare: (a, b) => collator.compare(a, b),
  };
}
