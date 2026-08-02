import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { editorialImageMatchesManifest } from "./asset-provenance";
import { auditEditorialContent } from "./audit";
import { extractEditorialBodyLinks, validateEditorialCatalog } from "./catalog";
import { EDITORIAL_ENGLISH_PATH_APPROVALS } from "./constants";
import { buildTableOfContents, calculateReadingTime } from "./headings";
import { isApprovedEnglishEditorialAssetPath } from "./language-approvals";
import { EditorialValidationError, parseEditorialSource } from "./parse";
import {
  editorialAssetManifestEntrySchema,
  editorialAssetManifestSchema,
  editorialImageSchema,
  editorialPeopleRegistrySchema,
  editorialSourceSchema,
} from "./schema";
import { buildEditorialHref, editorialSearchHref } from "./urls";

function draftSource(
  overrides = "",
  body = "## Start\n\nUseful content.",
): string {
  return `---
contentId: guide_test_article
locale: pt-BR
collection: guides
kind: guide
category: multistream
slug: test-article
status: draft
${overrides}---

${body}`;
}

describe("editorial frontmatter", () => {
  it("normaliza um draft e deriva URL, TOC e tempo de leitura", () => {
    const document = parseEditorialSource(
      draftSource("title: Um guia editorial de teste\n"),
      "pt-BR/guides/multistream/test-article.mdx",
    );

    expect(document.href).toBe("/guides/multistream/test-article");
    expect(document.frontmatter.status).toBe("draft");
    expect(document.frontmatter.images).toEqual([]);
    expect(document.toc[0]).toMatchObject({ id: "start", level: 2 });
    expect(document.readingTime.minutes).toBe(1);
  });

  it("rejeita contentId fora do contrato fechado de telemetria", () => {
    expect(() =>
      parseEditorialSource(
        draftSource().replace("guide_test_article", "artigo-em-portugues"),
        "pt-BR/guides/multistream/test-article.mdx",
      ),
    ).toThrow(EditorialValidationError);
  });

  it("não permite publicar com os campos completos ausentes", () => {
    expect(() =>
      parseEditorialSource(
        draftSource().replace("status: draft", "status: published"),
        "pt-BR/guides/multistream/test-article.mdx",
      ),
    ).toThrow(/title|description/);
  });
});

describe("editorial navigation metadata", () => {
  it("mantém URL em inglês e prefixa somente o locale en", () => {
    expect(
      buildEditorialHref({
        locale: "pt-BR",
        collection: "help",
        category: "getting-started",
        slug: "first-stream",
      }),
    ).toBe("/help/getting-started/first-stream");
    expect(
      buildEditorialHref({
        locale: "en",
        collection: "help",
        category: "getting-started",
        slug: "first-stream",
      }),
    ).toBe("/en/help/getting-started/first-stream");
    expect(editorialSearchHref("pt-BR")).toBe("/search");
    expect(editorialSearchHref("en")).toBe("/en/search");
  });

  it("gera TOC hierárquico e ignora headings dentro de code fences", () => {
    const toc = buildTableOfContents(`
## Setup
### Windows
\`\`\`md
## Not a heading
\`\`\`
## Setup
`);

    expect(toc).toEqual([
      {
        id: "setup",
        title: "Setup",
        level: 2,
        children: [{ id: "windows", title: "Windows", level: 3, children: [] }],
      },
      { id: "setup-1", title: "Setup", level: 2, children: [] },
    ]);
  });

  it("localiza o label de leitura sem expor o corpo", () => {
    expect(calculateReadingTime("texto curto", "pt-BR").label).toBe(
      "1 min de leitura",
    );
    expect(calculateReadingTime("short copy", "en").label).toBe("1 min read");
  });
});

describe("editorial catalog", () => {
  it("rejeita H1 Markdown e HTML/JSX, mas ignora exemplos em código", () => {
    const liveHtml = parseEditorialSource(
      draftSource("", "<h1>Duplicate title</h1>\n\n## Start"),
      "pt-BR/guides/multistream/test-article.mdx",
    );
    const examplesOnly = parseEditorialSource(
      draftSource(
        "",
        `## Start

Use \`<h1>Example only</h1>\` in this example.

\`\`\`mdx
# Markdown example
<h1>JSX example</h1>
[Example](/route-that-does-not-exist)

Setext example
===============
\`\`\``,
      ),
      "pt-BR/guides/multistream/test-article.mdx",
    );

    expect(
      validateEditorialCatalog([liveHtml]).map((item) => item.code),
    ).toContain("body-h1");
    const liveSetext = parseEditorialSource(
      draftSource("", "Duplicate title\n===============\n\n## Start"),
      "pt-BR/guides/multistream/test-article.mdx",
    );
    expect(
      validateEditorialCatalog([liveSetext]).map((item) => item.code),
    ).toContain("body-h1");
    expect(
      validateEditorialCatalog([examplesOnly])
        .map((item) => item.code)
        .filter(
          (code) => code === "body-h1" || code === "broken-internal-link",
        ),
    ).toEqual([]);
  });

  it("exige aprovação humana versionada para cada path editorial em inglês", () => {
    const approved = parseEditorialSource(
      draftSource("").replace("test-article", "obs-multistream"),
      "pt-BR/guides/multistream/obs-multistream.mdx",
    );
    const unapproved = parseEditorialSource(
      draftSource("").replace("test-article", "como-fazer-live"),
      "pt-BR/guides/multistream/como-fazer-live.mdx",
    );

    expect(EDITORIAL_ENGLISH_PATH_APPROVALS.version).toBeGreaterThan(0);
    expect(
      validateEditorialCatalog([approved]).map((item) => item.code),
    ).not.toContain("unapproved-editorial-path");
    expect(
      validateEditorialCatalog([unapproved]).map((item) => item.code),
    ).toContain("unapproved-editorial-path");
  });

  it("detecta links absolutos internos inexistentes fora do editorial", () => {
    const document = parseEditorialSource(
      draftSource("", "## Start\n\n[Missing route](/account/settings)"),
      "pt-BR/guides/multistream/test-article.mdx",
    );

    expect(
      validateEditorialCatalog([document]).map((item) => item.code),
    ).toContain("broken-internal-link");
  });

  it("não trata assets, endpoints especiais ou links externos seguros como artigos", () => {
    const document = parseEditorialSource(
      draftSource(
        "",
        `## Start

[External](https://example.com/docs?page=2)
[Email](mailto:support@example.com)
[Phone](tel:+5511999999999)`,
      ),
      "pt-BR/guides/multistream/test-article.mdx",
    );
    const linkIssues = validateEditorialCatalog([document]).filter((item) =>
      item.code.includes("link"),
    );

    expect(linkIssues).toEqual([]);
  });

  it("recusa namespaces internos de API/framework em links editoriais", () => {
    const document = parseEditorialSource(
      draftSource(
        "",
        "## Start\n\n[API](/api/v1/health)\n[Next](/_next/image?width=1200)",
      ),
      "pt-BR/guides/multistream/test-article.mdx",
    );

    expect(
      validateEditorialCatalog([document])
        .map((item) => item.code)
        .filter((code) => code === "disallowed-internal-endpoint"),
    ).toHaveLength(2);
  });

  it("valida query sensível também em links internos", () => {
    const document = parseEditorialSource(
      draftSource(
        "",
        "## Start\n\n[Unsafe](/help?api_key=secret)\n[Safe](/help?page=2)",
      ),
      "pt-BR/guides/multistream/test-article.mdx",
    );

    expect(
      validateEditorialCatalog([document])
        .map((item) => item.code)
        .filter((code) => code === "sensitive-link-query"),
    ).toHaveLength(1);
  });

  it("valida links relativos, referências GFM e âncoras H2–H6", () => {
    const source = parseEditorialSource(
      draftSource(
        "",
        `## Start

[Sibling](obs-multistream)
[Deep heading](obs-multistream.mdx#advanced-details)
[Reference route][missing]
[Collapsed route][]
[Shortcut route]

[missing]: /account/missing
[Collapsed route]: /account/missing
[Shortcut route]: /account/missing`,
      ),
      "pt-BR/guides/multistream/test-article.mdx",
    );
    const target = parseEditorialSource(
      draftSource("", "## Setup\n\n#### Advanced details").replace(
        "test-article",
        "obs-multistream",
      ),
      "pt-BR/guides/multistream/obs-multistream.mdx",
    );
    const codes = validateEditorialCatalog([source, target]).map(
      (item) => item.code,
    );

    expect(codes).not.toContain("broken-relative-link");
    expect(codes).not.toContain("broken-anchor");
    expect(codes).toContain("broken-internal-link");
    expect(
      extractEditorialBodyLinks(source.source).filter(
        (href) => href === "/account/missing",
      ),
    ).toHaveLength(1);
  });

  it("audita links HTML sem depender de caixa e recusa href dinâmico", () => {
    const document = parseEditorialSource(
      draftSource(
        "",
        '## Start\n\n<A HREF="/account/missing">Missing</A>\n<Link href="/another/missing">Missing too</Link>\n<Link href={runtimePath}>Dynamic</Link>',
      ),
      "pt-BR/guides/multistream/test-article.mdx",
    );
    const codes = validateEditorialCatalog([document]).map((item) => item.code);

    expect(codes).toContain("broken-internal-link");
    expect(codes).toContain("dynamic-link-href");
  });

  it("rejeita esquemas inseguros, credenciais e query sensível em links do corpo", () => {
    const document = parseEditorialSource(
      draftSource(
        "",
        `## Start

[HTTP](http://example.com)
[Script](javascript:alert(1))
[Data](data:text/plain,hello)
[File](file:///tmp/secret)
[Protocol relative](//example.com/docs)
[Credentials](https://user:password@example.com/docs)
[Secret query](https://example.com/docs?access_token=secret)`,
      ),
      "pt-BR/guides/multistream/test-article.mdx",
    );
    const codes = validateEditorialCatalog([document]).map((item) => item.code);

    expect(codes.filter((code) => code === "unsafe-link-scheme")).toHaveLength(
      5,
    );
    expect(codes).toContain("unsafe-link-credentials");
    expect(codes).toContain("sensitive-link-query");
  });

  it("exige que imagens inline passem por ContentImage e pelo frontmatter", () => {
    const document = parseEditorialSource(
      draftSource("", "## Visual\n\n![bypass](/image.png)"),
      "pt-BR/guides/multistream/test-article.mdx",
    );
    const codes = validateEditorialCatalog([document]).map(
      (issue) => issue.code,
    );

    expect(codes).toContain("raw-markdown-image");
  });

  it("rejeita imagem Markdown por referência GFM", () => {
    const document = parseEditorialSource(
      draftSource(
        "",
        "## Visual\n\n![OBS settings][shot]\n![Collapsed][]\n![Shortcut]\n\n[shot]: /images/obs-settings.png\n[Collapsed]: /images/collapsed.png\n[Shortcut]: /images/shortcut.png",
      ),
      "pt-BR/guides/multistream/test-article.mdx",
    );

    expect(
      validateEditorialCatalog([document]).map((item) => item.code),
    ).toContain("raw-markdown-image");
  });

  it("aceita ContentImage literal declarado exatamente uma vez", () => {
    const document = parseEditorialSource(
      draftSource(
        `images:
  - src: /images/editorial/tests/status-connected.webp
    originalPath: assets/originals/tests/status-connected.png
    baseName: status-connected
    alt: Estado conectado usado somente no teste editorial.
    width: 1200
    height: 675
    kind: diagram
    source: original
    rights: owned
    language: none
`,
        '## Visual\n\n<ContentImage baseName="status-connected" />',
      ),
      "pt-BR/guides/multistream/test-article.mdx",
    );
    const imageIssues = validateEditorialCatalog([document]).filter((issue) =>
      issue.code.includes("image"),
    );

    expect(imageIssues).toEqual([]);
  });

  it("exige aprovação humana do path completo usado pelo asset", () => {
    const document = parseEditorialSource(
      draftSource(
        `images:
  - src: /images/editorial/tests/configuracao-transmissao.webp
    originalPath: assets/originals/tests/configuracao-transmissao.png
    baseName: configuracao-transmissao
    alt: Configuração usada somente no teste editorial.
    width: 1200
    height: 675
    kind: diagram
    source: original
    rights: owned
    language: none
`,
        '## Visual\n\n<ContentImage baseName="configuracao-transmissao" />',
      ),
      "pt-BR/guides/multistream/test-article.mdx",
    );

    expect(
      validateEditorialCatalog([document]).map((item) => item.code),
    ).toContain("unapproved-asset-path");
  });

  it("não deixa um baseName inglês aprovar diretórios públicos/originais em português", () => {
    const approvals = [
      {
        baseName: "status-connected",
        src: "/images/editorial/status/status-connected.webp",
        originalPath: "assets/originals/status/status-connected.png",
      },
    ];

    expect(
      isApprovedEnglishEditorialAssetPath(
        {
          baseName: "status-connected",
          src: "/images/editorial/status/status-connected.webp",
          originalPath: "assets/originals/status/status-connected.png",
        },
        approvals,
      ),
    ).toBe(true);
    expect(
      isApprovedEnglishEditorialAssetPath(
        {
          baseName: "status-connected",
          src: "/images/editorial/configuracao/status-connected.webp",
          originalPath: "assets/originals/configuracao/status-connected.png",
        },
        approvals,
      ),
    ).toBe(false);
  });

  it("exige proveniência completa também no manifesto", () => {
    const parsed = editorialAssetManifestSchema.safeParse({
      version: 1,
      assets: [
        {
          baseName: "generated-cover",
          originalPath: "assets/originals/tests/generated-cover.png",
          derivatives: [
            {
              src: "/images/editorial/tests/generated-cover.webp",
              width: 1200,
              height: 675,
              bytes: 1_024,
            },
          ],
          kind: "generated",
          source: "generated",
          rights: "owned",
          language: "none",
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("exige versão do OBS e igualdade entre frontmatter e manifesto", () => {
    const imageInput = {
      src: "/images/editorial/tests/obs-settings.webp",
      originalPath: "assets/originals/tests/obs-settings.png",
      baseName: "obs-settings",
      alt: "Configuração do OBS usada no teste editorial.",
      width: 1200,
      height: 675,
      kind: "screenshot",
      source: "obs",
      rights: "permitted",
      language: "pt-BR",
      capturedAt: "2026-08-01",
      externalUiReviewedAt: "2026-08-01",
    } as const;
    const manifestInput = {
      baseName: imageInput.baseName,
      originalPath: imageInput.originalPath,
      derivatives: [
        {
          src: imageInput.src,
          width: imageInput.width,
          height: imageInput.height,
          bytes: 1_024,
        },
      ],
      kind: imageInput.kind,
      source: imageInput.source,
      rights: imageInput.rights,
      language: imageInput.language,
      capturedAt: imageInput.capturedAt,
      externalUiReviewedAt: imageInput.externalUiReviewedAt,
    } as const;

    expect(editorialImageSchema.safeParse(imageInput).success).toBe(false);
    expect(
      editorialAssetManifestEntrySchema.safeParse(manifestInput).success,
    ).toBe(false);

    const image = editorialImageSchema.parse({
      ...imageInput,
      sourceVersion: "30.2.3",
    });
    const manifestEntry = editorialAssetManifestEntrySchema.parse({
      ...manifestInput,
      sourceVersion: "30.2.3",
    });

    expect(editorialImageMatchesManifest(image, manifestEntry)).toBe(true);
    expect(
      editorialImageMatchesManifest(image, {
        ...manifestEntry,
        sourceVersion: "31.0.0",
      }),
    ).toBe(false);
  });

  it("rejeita credenciais e parâmetros sensíveis em URLs de fonte e autoria", () => {
    const source = (url: string) => ({
      title: "Official documentation",
      kind: "official" as const,
      url,
    });
    const people = (url: string) => ({
      version: 1 as const,
      people: [
        {
          name: "Editorial Reviewer",
          role: "Reviewer",
          type: "person" as const,
          url,
        },
      ],
    });

    expect(
      editorialSourceSchema.safeParse(
        source("https://user:password@example.com/docs"),
      ).success,
    ).toBe(false);
    expect(
      editorialSourceSchema.safeParse(
        source("https://example.com/docs?api_key=secret"),
      ).success,
    ).toBe(false);
    expect(
      editorialSourceSchema.safeParse(
        source("https://example.com/docs?streamKey=secret"),
      ).success,
    ).toBe(false);
    expect(
      editorialPeopleRegistrySchema.safeParse(
        people("https://example.com/profile?password=secret"),
      ).success,
    ).toBe(false);
    expect(
      editorialSourceSchema.safeParse(source("https://example.com/docs?page=2"))
        .success,
    ).toBe(true);
  });

  it("audita query sensível em autolinks e URLs bare do GFM", () => {
    const document = parseEditorialSource(
      draftSource(
        "",
        "## Start\n\n<https://example.com/docs?stream_key=secret>\n\nhttps://example.com/docs?privateKey=secret",
      ),
      "pt-BR/guides/multistream/test-article.mdx",
    );

    expect(
      validateEditorialCatalog([document])
        .map((item) => item.code)
        .filter((code) => code === "sensitive-link-query"),
    ).toHaveLength(2);
  });

  it("exige que recursos públicos linkados existam sob publicRoot", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "corneta-editorial-"));
    const contentRoot = path.join(root, "content");
    const publicRoot = path.join(root, "public");
    const articleDirectory = path.join(
      contentRoot,
      "pt-BR",
      "guides",
      "multistream",
    );

    try {
      await mkdir(path.join(contentRoot, "assets"), { recursive: true });
      await mkdir(articleDirectory, { recursive: true });
      await mkdir(publicRoot, { recursive: true });
      await writeFile(
        path.join(contentRoot, "assets", "manifest.json"),
        '{"version":1,"assets":[]}',
      );
      await writeFile(
        path.join(contentRoot, "people.json"),
        '{"version":1,"people":[{"name":"Reviewer","role":"Reviewer","type":"person","url":"https://example.com/reviewer"}]}',
      );
      await writeFile(
        path.join(articleDirectory, "obs-multistream.mdx"),
        draftSource("", "## Start\n\n[Manual](/manual.pdf)").replace(
          "test-article",
          "obs-multistream",
        ),
      );

      const missing = await auditEditorialContent({ contentRoot, publicRoot });
      expect(missing.issues.map((item) => item.code)).toContain(
        "missing-linked-public-resource",
      );

      await writeFile(path.join(publicRoot, "manual.pdf"), "test fixture");
      const present = await auditEditorialContent({ contentRoot, publicRoot });
      expect(present.issues.map((item) => item.code)).not.toContain(
        "missing-linked-public-resource",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("detecta arquivo em caminho diferente do frontmatter", () => {
    const document = parseEditorialSource(
      draftSource(),
      "pt-BR/guides/quality/wrong-file.mdx",
    );
    const codes = validateEditorialCatalog([document]).map(
      (issue) => issue.code,
    );

    expect(codes).toContain("frontmatter-path-mismatch");
  });
});
