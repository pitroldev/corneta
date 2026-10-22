import type { PlatformPreset } from "../lib/types";

// Adding a destination is adding src/platforms/<id>/destination.json; build.rs assembles the same files for Rust.
// No type argument: Vitest only skips its module cache for a literal `import.meta.glob(`.
const files: Record<string, PlatformPreset> = import.meta.glob(
  "./*/destination.json",
  { eager: true, import: "default" },
);

/** Every destination, in picker order. */
export const DESTINATIONS: readonly PlatformPreset[] = Object.values(
  files,
).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
