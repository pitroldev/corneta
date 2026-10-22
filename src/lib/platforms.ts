import { DESTINATIONS } from "../platforms/destinations";
import type { I18n, MessageKey } from "./i18n";
import type { PlatformId, PlatformPreset } from "./types";

/** Every destination, in picker order; the Rust engine reads the same catalog. */
export const PLATFORM_LIST: readonly PlatformPreset[] = DESTINATIONS;

export const PLATFORMS: Readonly<Record<PlatformId, PlatformPreset>> =
  Object.fromEntries(PLATFORM_LIST.map((p) => [p.id, p]));

/** What first-run setup offers, in its own order. */
export const SETUP_PLATFORMS: readonly PlatformId[] = PLATFORM_LIST.filter(
  (p) => p.setupRank !== undefined,
)
  .sort((a, b) => (a.setupRank ?? 0) - (b.setupRank ?? 0))
  .map((p) => p.id);

/** Destinations a brand-new configuration starts with. */
export const STARTER_PLATFORMS: readonly PlatformId[] = PLATFORM_LIST.filter(
  (p) => p.starter,
).map((p) => p.id);

export const isVertical = (id: PlatformId): boolean => {
  const r = PLATFORMS[id].recommended;
  return r.height > r.width;
};

// Catalog ids map to dictionary keys by name; platforms.test.ts checks each one exists.
export const platformNote = (id: PlatformId, t: I18n["t"]): string =>
  t(`core.platform.${id}.note` as MessageKey);

export const platformTagline = (id: PlatformId, t: I18n["t"]): string =>
  t(`core.platform.tagline.${id}` as MessageKey);

/** What unknown destination ids are read as. */
export const FALLBACK_PLATFORM: PlatformId =
  PLATFORM_LIST.find((p) => p.fallback)?.id ?? PLATFORM_LIST[0].id;

/** The preset for an id, or the fallback destination's for ids the catalog does not know. */
export const presetOf = (id: PlatformId): PlatformPreset =>
  PLATFORMS[id] ?? PLATFORMS[FALLBACK_PLATFORM];

export const platformName = (id: PlatformId, t: I18n["t"]): string =>
  PLATFORMS[id]?.localizedName
    ? t(`core.platform.${id}.name` as MessageKey)
    : (PLATFORMS[id]?.name ?? id);
