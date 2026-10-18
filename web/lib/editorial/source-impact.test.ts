import { describe, expect, it } from "vitest";
import {
  invalidSourceImpactDeclarations,
  sourceImpactSchema,
  sourcesWithoutImpact,
  type SourceImpactDeclaration,
} from "./source-impact";

const blob = (digit: string) => digit.repeat(40);
const declaration = (
  overrides: Partial<SourceImpactDeclaration> = {},
): SourceImpactDeclaration => ({
  article: "pt-BR/help/quality/quality-modes.mdx",
  source: "src/screens/EncodingScreen.tsx",
  sourceBlob: blob("a"),
  reason:
    "Memoização das estimativas; nenhum rótulo, limite ou fluxo citado mudou.",
  ...overrides,
});

describe("source impact declarations", () => {
  it("requires a bound blob and a real reason", () => {
    expect(
      sourceImpactSchema.safeParse({
        version: 1,
        declarations: [declaration()],
      }).success,
    ).toBe(true);
    for (const invalid of [
      declaration({ sourceBlob: "abc" }),
      declaration({ reason: "sem impacto" }),
      declaration({ article: "help/quality/quality-modes.mdx" }),
      { ...declaration(), reviewedBy: "Someone" },
    ]) {
      expect(
        sourceImpactSchema.safeParse({ version: 1, declarations: [invalid] })
          .success,
      ).toBe(false);
    }
  });

  it("covers a source only while its current blob is the declared one", () => {
    const declarations = [
      declaration(),
      declaration({ source: "src/lib/store.ts", sourceBlob: blob("b") }),
      declaration({ article: "pt-BR/help/other.mdx" }),
    ];
    const current = new Map([
      ["src/screens/EncodingScreen.tsx", blob("a")],
      ["src/lib/store.ts", blob("c")],
    ]);
    expect([
      ...sourcesWithoutImpact(
        declarations,
        "pt-BR/help/quality/quality-modes.mdx",
        current,
      ),
    ]).toEqual(["src/screens/EncodingScreen.tsx"]);
  });

  it("rejects declarations for unknown articles or sources the article does not cite", () => {
    const sources = new Map([
      [
        "pt-BR/help/quality/quality-modes.mdx",
        new Set(["src/screens/EncodingScreen.tsx"]),
      ],
    ]);
    expect(
      invalidSourceImpactDeclarations(
        [
          declaration(),
          declaration({ source: "src/lib/store.ts" }),
          declaration({ article: "pt-BR/help/missing.mdx" }),
        ],
        sources,
      ),
    ).toEqual([
      "pt-BR/help/quality/quality-modes.mdx: src/lib/store.ts is not one of its internal sources",
      "pt-BR/help/missing.mdx: article not found",
    ]);
  });
});
