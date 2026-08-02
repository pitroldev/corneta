export const EDITORIAL_LOCALES = ["pt-BR", "en"] as const;
export const EDITORIAL_COLLECTIONS = ["help", "guides"] as const;
export const EDITORIAL_KINDS = [
  "guide",
  "help",
  "comparison",
  "troubleshooting",
] as const;
export const EDITORIAL_STATUSES = ["draft", "published"] as const;
export const EDITORIAL_INTENTS = [
  "informational",
  "support",
  "commercial",
  "navigational",
] as const;

export const HELP_CATEGORIES = [
  "getting-started",
  "streaming-software",
  "platforms",
  "quality",
  "chat-and-alerts",
  "reports-and-data",
  "troubleshooting",
] as const;

export const GUIDE_CATEGORIES = [
  "multistream",
  "quality",
  "operations",
  "security",
  "comparisons",
] as const;

export const EDITORIAL_CATEGORIES = [
  ...HELP_CATEGORIES,
  ...GUIDE_CATEGORIES,
] as const;

export const EDITORIAL_IMAGE_KINDS = [
  "screenshot",
  "diagram",
  "generated",
] as const;

export const EDITORIAL_IMAGE_SOURCES = [
  "corneta",
  "obs",
  "twitch",
  "youtube",
  "kick",
  "original",
  "generated",
] as const;

export const EDITORIAL_IMAGE_RIGHTS = ["owned", "permitted"] as const;
export const EDITORIAL_IMAGE_LANGUAGES = ["pt-BR", "en", "none"] as const;

export const EDITORIAL_SOURCE_KINDS = [
  "official",
  "primary",
  "internal",
  "reference",
] as const;

export const DEFAULT_READING_WORDS_PER_MINUTE = 220;

export const EDITORIAL_CONTENT_ID_PATTERN =
  /^(?:help|guide)_[a-z0-9]+(?:_[a-z0-9]+)*$/;
export const LOWERCASE_ASCII_KEBAB_CASE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const TRANSLATION_KEY_PATTERN = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;

/**
 * Human-reviewed semantic paths. A regex can enforce ASCII/kebab syntax, but
 * cannot prove that words are English. Additions require editorial review and
 * a version bump; the same approval covers the optional public `/en` prefix.
 */
export const EDITORIAL_ENGLISH_PATH_APPROVALS = {
  version: 4,
  paths: [
    "/guides/multistream/obs-multistream",
    "/guides/multistream/twitch-youtube-simultaneously",
    "/guides/multistream/local-vs-cloud",
    "/guides/multistream/twitch-youtube-kick",
    "/guides/quality/multistream-upload-speed",
    "/guides/quality/twitch-youtube-kick-bitrate",
    "/guides/quality/live-stream-encoders",
    "/guides/quality/copy-vs-transcode",
    "/guides/quality/why-stream-lags",
    "/guides/quality/dropped-frames",
    "/guides/multistream/one-platform-disconnected",
    "/guides/multistream/simulcasting-rules",
    "/guides/operations/unified-chat-rules",
    "/guides/operations/obs-closed-during-stream",
    "/guides/operations/analyze-stream-drop",
    "/guides/security/protect-stream-key",
    "/guides/comparisons/restream-alternative",
    "/guides/multistream/horizontal-and-vertical-live",
    "/guides/operations/chat-alerts-obs",
    "/guides/quality/multistream-low-end-pc",
    "/guides/quality/resolution-and-fps",
    "/guides/quality/streaming-glossary",
    "/guides/comparisons/multistream-tools",
    "/help/getting-started/first-stream",
    "/help/streaming-software/automatic-obs-setup",
    "/help/platforms/manage-platform",
    "/help/platforms/streaming-keys-and-urls",
    "/help/quality/quality-modes",
    "/help/quality/test-upload",
    "/help/quality/stream-metrics",
    "/help/quality/auto-bitrate",
    "/help/streaming-software/brb-screen",
    "/help/chat-and-alerts/unified-chat-setup",
    "/help/chat-and-alerts/obs-browser-source-overlay",
    "/help/reports-and-data/export-safe-diagnostic",
    "/help/reports-and-data/post-live-report",
    "/help/troubleshooting/stream-statuses",
    "/help/troubleshooting/obs-not-found",
    "/help/troubleshooting/platform-reconnecting",
  ],
} as const;

export interface EditorialEnglishAssetPathApproval {
  readonly baseName: string;
  readonly src: string;
  readonly originalPath: string;
}

/** Human-reviewed complete paths used by editorial assets and their masters. */
export const EDITORIAL_ENGLISH_ASSET_PATH_APPROVALS: {
  readonly version: number;
  readonly paths: readonly EditorialEnglishAssetPathApproval[];
} = {
  version: 10,
  paths: [
    {
      baseName: "corneta-obs-connection-details",
      src: "/images/editorial/getting-started/corneta-obs-connection-details.webp",
      originalPath:
        "assets/originals/getting-started/corneta-obs-connection-details.png",
    },
    {
      baseName: "corneta-platform-key-setup",
      src: "/images/editorial/getting-started/corneta-platform-key-setup.webp",
      originalPath:
        "assets/originals/getting-started/corneta-platform-key-setup.png",
    },
    {
      baseName: "corneta-quality-modes",
      src: "/images/editorial/quality/corneta-quality-modes.webp",
      originalPath: "assets/originals/quality/corneta-quality-modes.png",
    },
    {
      baseName: "corneta-first-live-checklist",
      src: "/images/editorial/getting-started/corneta-first-live-checklist.webp",
      originalPath:
        "assets/originals/getting-started/corneta-first-live-checklist.png",
    },
    {
      baseName: "corneta-platform-destinations",
      src: "/images/editorial/multistream/corneta-platform-destinations.webp",
      originalPath:
        "assets/originals/multistream/corneta-platform-destinations.png",
    },
    {
      baseName: "corneta-live-safety-settings",
      src: "/images/editorial/operations/corneta-live-safety-settings.webp",
      originalPath:
        "assets/originals/operations/corneta-live-safety-settings.png",
    },
    {
      baseName: "corneta-upload-test-result",
      src: "/images/editorial/quality/corneta-upload-test-result.webp",
      originalPath: "assets/originals/quality/corneta-upload-test-result.png",
    },
    {
      baseName: "corneta-unified-chat",
      src: "/images/editorial/chat-and-alerts/corneta-unified-chat.webp",
      originalPath: "assets/originals/chat-and-alerts/corneta-unified-chat.png",
    },
    {
      baseName: "corneta-post-live-report",
      src: "/images/editorial/reports-and-data/corneta-post-live-report.webp",
      originalPath:
        "assets/originals/reports-and-data/corneta-post-live-report.png",
    },
    {
      baseName: "corneta-vertical-target-settings",
      src: "/images/editorial/multistream/corneta-vertical-target-settings.webp",
      originalPath:
        "assets/originals/multistream/corneta-vertical-target-settings.png",
    },
    {
      baseName: "corneta-vertical-reframe-editor",
      src: "/images/editorial/multistream/corneta-vertical-reframe-editor.webp",
      originalPath:
        "assets/originals/multistream/corneta-vertical-reframe-editor.png",
    },
  ],
};

export const EDITORIAL_PUBLIC_ASSET_PATTERN =
  /^\/images\/editorial(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)+\.(?:avif|webp|svg)$/;
export const EDITORIAL_ORIGINAL_ASSET_PATTERN =
  /^assets\/originals(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)+\.(?:png|jpe?g|svg|webp|avif)$/;

export const EDITORIAL_ASSET_MAX_BYTES = 512 * 1024;
