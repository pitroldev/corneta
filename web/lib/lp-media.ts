import type { Locale } from "./i18n";

// Each locale has its own cut of the video, so chapter times differ between them.

type ChapterId = "obs" | "platforms" | "golive" | "chat";

type Still = { src: string; width: number; height: number };

type LocaleMedia = {
  video: { webm: string; mp4: string; captions: string; seconds: number };
  poster: Still;
  chapters: Record<ChapterId, number>;
  features: Record<
    "independent" | "chat" | "protection" | "reportChart" | "reportMoments",
    Still
  >;
  // The quality screen wraps differently in each language, so these crops differ in height.
  honest: { wide: Still; narrow: Still };
};

const still = (
  locale: Locale,
  name: string,
  width: number,
  height: number,
) => ({
  src: `/images/lp/${locale}/${name}.webp`,
  width,
  height,
});

const shared = (locale: Locale) => ({
  poster: still(locale, "poster", 1920, 1080),
  features: {
    independent: still(locale, "feat-independent", 1496, 464),
    chat: still(locale, "feat-chat", 1496, 572),
    protection: still(locale, "feat-protection", 832, 994),
    reportChart: still(locale, "feat-report", 1496, 692),
    reportMoments: still(locale, "feat-report-moments", 800, 658),
  },
});

const MEDIA: Record<Locale, LocaleMedia> = {
  "pt-BR": {
    video: {
      webm: "/video/corneta-pt-BR.webm",
      mp4: "/video/corneta-pt-BR.mp4",
      captions: "/video/corneta-pt-BR.vtt",
      seconds: 94,
    },
    chapters: {
      obs: 28.5,
      platforms: 34.7,
      golive: 47.2,
      chat: 64.6,
    },
    honest: {
      wide: still("pt-BR", "honest-modes", 1528, 542),
      narrow: still("pt-BR", "honest-mode", 518, 486),
    },
    ...shared("pt-BR"),
  },
  en: {
    video: {
      webm: "/video/corneta-en.webm",
      mp4: "/video/corneta-en.mp4",
      captions: "/video/corneta-en.vtt",
      seconds: 92,
    },
    chapters: {
      obs: 28.4,
      platforms: 33.5,
      golive: 45.0,
      chat: 60.8,
    },
    honest: {
      wide: still("en", "honest-modes", 1528, 574),
      narrow: still("en", "honest-mode", 518, 518),
    },
    ...shared("en"),
  },
};

export const lpMedia = (locale: Locale) => MEDIA[locale];

export const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
