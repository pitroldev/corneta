import { describe, expect, it } from "vitest";
import {
  validateChangedInternalSources,
  validateEditorialRevision,
  type EditorialRevisionSnapshot,
} from "../lib/editorial/revision-policy";
import { normalizeEditorialRevisionSource } from "./editorial-revision-source";

function snapshot(source: string): EditorialRevisionSnapshot {
  return {
    relativePath: "pt-BR/help/quality/example.mdx",
    source,
    frontmatter: {
      updatedAt: "2026-08-01",
      reviewedAt: "2026-08-01",
      productVersion: "0.6.0",
      sources: [
        {
          kind: "internal",
          repoPath: "src/screens/Example.tsx",
          reviewedAt: "2026-08-01",
        },
      ],
    },
  };
}

async function compare(previous: string, current: string) {
  const normalized = await Promise.all([
    normalizeEditorialRevisionSource(snapshot(previous)),
    normalizeEditorialRevisionSource(snapshot(current)),
  ]);
  return validateEditorialRevision(...normalized);
}

describe("normalização restrita à formatação do MDX", () => {
  it("não exige data artificial por alinhamento de tabela e CRLF", async () => {
    const previous =
      "## Dados\r\n\r\n| Métrica | Valor |\r\n| --- | --- |\r\n| CPU | 10% |\r\n";
    const current =
      "## Dados\n\n| Métrica | Valor |\n| ------- | ----- |\n| CPU     | 10%   |\n";
    expect(await compare(previous, current)).toEqual([]);
  });

  it("normaliza a quebra de linhas de texto dentro de JSX", async () => {
    const previous =
      '<Callout label="Aviso">\n  Revise a transmissão com o mesmo cuidado antes de compartilhar qualquer arquivo com outras pessoas.\n</Callout>';
    const current =
      '<Callout label="Aviso">\n  Revise a transmissão com o mesmo cuidado antes de compartilhar qualquer\n  arquivo com outras pessoas.\n</Callout>';
    expect(await compare(previous, current)).toEqual([]);
  });

  it.each([
    ["texto", "Faça isto.", "Faça outra coisa."],
    [
      "valor de tabela",
      "| A | B |\n| --- | --- |\n| CPU | 10% |",
      "| A | B |\n| --- | --- |\n| CPU | 90% |",
    ],
    [
      "tag",
      '<Callout label="Aviso">Texto.</Callout>',
      '<Steps label="Aviso">Texto.</Steps>',
    ],
    [
      "propriedade",
      '<ContentImage baseName="first-image" />',
      '<ContentImage baseName="second-image" />',
    ],
    [
      "espaço literal",
      '<Callout label="dois  espaços">Texto.</Callout>',
      '<Callout label="dois espaços">Texto.</Callout>',
    ],
    [
      "código",
      '```js\nconst text = "dois  espaços";\n```',
      '```js\nconst text = "dois espaços";\n```',
    ],
  ])(
    "continua cobrando revisão substancial para %s",
    async (_, previous, current) => {
      expect(await compare(previous, current)).toEqual([
        expect.objectContaining({
          code: "substantive-change-without-updated-at",
        }),
      ]);
    },
  );

  it("não normaliza metadados nem enfraquece a revisão de fonte interna", async () => {
    const previous = snapshot("Texto.");
    const current = await normalizeEditorialRevisionSource(previous);
    expect(current.frontmatter).toBe(previous.frontmatter);
    expect(
      validateChangedInternalSources(
        previous,
        current,
        new Set(["src/screens/Example.tsx"]),
        "0.7.0",
      ).map((issue) => issue.code),
    ).toEqual([
      "changed-source-without-article-review",
      "changed-source-without-source-review",
      "reviewed-against-wrong-product-version",
    ]);
  });
});
