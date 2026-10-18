import { z } from "zod";

/**
 * Versioned statements that a change to one internal source does not alter what one article
 * says. Each statement is bound to the source's Git blob, so any later edit of that source
 * requires a review or a new statement.
 */
export const sourceImpactSchema = z
  .object({
    version: z.literal(1),
    declarations: z.array(
      z
        .object({
          article: z.string().regex(/^(?:pt-BR|en)\/[^\s]+\.mdx$/u),
          source: z.string().regex(/^[^\s\\]+$/u),
          sourceBlob: z.string().regex(/^[0-9a-f]{40}$/u),
          reason: z.string().trim().min(30),
        })
        .strict(),
    ),
  })
  .strict();

export type SourceImpact = z.infer<typeof sourceImpactSchema>;
export type SourceImpactDeclaration = SourceImpact["declarations"][number];

export const SOURCE_IMPACT_FILE = "web/content/source-impact.json";

/** Sources of `article` whose current blob is covered by a no-impact declaration. */
export function sourcesWithoutImpact(
  declarations: readonly SourceImpactDeclaration[],
  article: string,
  currentBlobs: ReadonlyMap<string, string>,
): Set<string> {
  return new Set(
    declarations
      .filter(
        (declaration) =>
          declaration.article === article &&
          currentBlobs.get(declaration.source) === declaration.sourceBlob,
      )
      .map((declaration) => declaration.source),
  );
}

/** Declarations must name a published article and one of its internal sources. */
export function invalidSourceImpactDeclarations(
  declarations: readonly SourceImpactDeclaration[],
  internalSourcesByArticle: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  return declarations.flatMap((declaration) => {
    const sources = internalSourcesByArticle.get(declaration.article);
    if (!sources) return [`${declaration.article}: article not found`];
    return sources.has(declaration.source)
      ? []
      : [
          `${declaration.article}: ${declaration.source} is not one of its internal sources`,
        ];
  });
}
