import { format } from "prettier";
import type { EditorialRevisionSnapshot } from "../lib/editorial/revision-policy";

/** Compare MDX after formatting both revisions with the lockfile's Prettier.
 * Let its parsers handle JSX/code; never strip literal whitespace with a regex. */
export async function normalizeEditorialRevisionSource(
  snapshot: EditorialRevisionSnapshot,
): Promise<EditorialRevisionSnapshot> {
  return {
    ...snapshot,
    source: await format(snapshot.source, {
      parser: "mdx",
      printWidth: 80,
      proseWrap: "preserve",
      endOfLine: "lf",
      embeddedLanguageFormatting: "auto",
    }),
  };
}
