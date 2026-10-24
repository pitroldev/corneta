import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Satori reads WOFF but not WOFF2. The Latin subsets cover Portuguese accents and typographic punctuation.
const FONT_FILES = [
  {
    name: "Baloo 2",
    weight: 800,
    path: "@fontsource/baloo-2/files/baloo-2-latin-800-normal.woff",
  },
  {
    name: "Inter",
    weight: 700,
    path: "@fontsource/inter/files/inter-latin-700-normal.woff",
  },
] as const;

export const DISPLAY_FONT = "Baloo 2";
export const LABEL_FONT = "Inter";

export function cardFonts() {
  return Promise.all(
    FONT_FILES.map(async ({ name, weight, path }) => ({
      name,
      weight,
      style: "normal" as const,
      data: await readFile(join(process.cwd(), "node_modules", path)),
    })),
  );
}
