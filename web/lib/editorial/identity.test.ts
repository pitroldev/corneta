import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { auditEditorialContent } from "./audit";
import {
  editorialFrontmatterSchema,
  editorialPeopleRegistrySchema,
} from "./schema";

const draft = {
  contentId: "guide_identity_fixture",
  locale: "pt-BR",
  collection: "guides",
  kind: "guide",
  category: "multistream",
  slug: "obs-multistream",
  status: "draft",
};

const published = {
  ...draft,
  status: "published",
  title: "Synthetic editorial identity fixture",
  description:
    "Synthetic description for editorial attribution contract tests.",
  summary: "Synthetic content used to test registered editorial attribution.",
  intent: "informational",
  author: "Fixture Author",
  reviewedBy: "Fixture Reviewer",
  publishedAt: "2026-09-07",
  updatedAt: "2026-09-07",
  reviewedAt: "2026-09-07",
  productVersion: "0.7.0",
  testedWith: [
    { name: "Corneta", version: "0.7.0", environment: "Synthetic fixture" },
  ],
  reviewIntervalDays: 90,
  experimental: false,
  primaryQuery: "synthetic attribution fixture",
  related: [],
  sources: [
    {
      title: "Synthetic source",
      kind: "official",
      url: "https://example.com/source",
      reviewedAt: "2026-09-07",
    },
  ],
  images: [],
};

const author = {
  name: "Fixture Author",
  role: "Author",
  type: "person",
  url: "https://example.com/author",
};
const reviewer = {
  ...author,
  name: "Fixture Reviewer",
  role: "Reviewer",
  url: "https://example.com/reviewer",
};

describe("editorial attribution", () => {
  it("accepts an unassigned draft but requires both identities to publish", () => {
    expect(editorialFrontmatterSchema.safeParse(draft).success).toBe(true);
    expect(editorialFrontmatterSchema.safeParse(published).success).toBe(true);
    for (const field of ["author", "reviewedBy"]) {
      const result = editorialFrontmatterSchema.safeParse({
        ...published,
        [field]: undefined,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((issue) => issue.path.join(".") === field),
        ).toBe(true);
      }
    }
  });

  it.each([
    "TODO",
    "TBD",
    "CHANGE_ME",
    "Seu nome",
    "Nome do revisor",
    "Your name",
    "Reviewer name",
    "<author>",
  ])(
    "rejects placeholder %s in frontmatter and the people registry",
    (name) => {
      for (const field of ["author", "reviewedBy"]) {
        expect(
          editorialFrontmatterSchema.safeParse({ ...published, [field]: name })
            .success,
        ).toBe(false);
      }
      expect(
        editorialPeopleRegistrySchema.safeParse({
          version: 1,
          people: [{ ...author, name }],
        }).success,
      ).toBe(false);
    },
  );

  it("audits published attribution against a registered person with a profile", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "corneta-editorial-identity-"),
    );
    const contentRoot = path.join(root, "content");
    const publicRoot = path.join(root, "public");
    const article = path.join(
      contentRoot,
      "pt-BR/guides/multistream/obs-multistream.mdx",
    );
    try {
      await mkdir(path.dirname(article), { recursive: true });
      await mkdir(path.join(contentRoot, "assets"), { recursive: true });
      await mkdir(publicRoot, { recursive: true });
      await writeFile(
        path.join(contentRoot, "assets/manifest.json"),
        JSON.stringify({ version: 1, assets: [] }),
      );
      await writeFile(
        article,
        matter.stringify(
          "## Synthetic fixture\n\nThis is not a published article.",
          published,
        ),
      );
      for (const [person, expectedCode] of [
        [reviewer, undefined],
        [{ ...reviewer, name: "Someone Else" }, "unregistered-person"],
        [{ ...reviewer, type: "organization" }, "invalid-published-person"],
        [{ ...reviewer, url: undefined }, "invalid-published-person"],
      ] as const) {
        await writeFile(
          path.join(contentRoot, "people.json"),
          JSON.stringify({ version: 1, people: [author, person] }),
        );
        const result = await auditEditorialContent({ contentRoot, publicRoot });
        const codes = result.issues.map((issue) => issue.code);
        expect(codes).not.toContain("invalid-frontmatter");
        if (expectedCode) expect(codes).toContain(expectedCode);
        else expect(result.issues).toEqual([]);
      }
      await writeFile(article, matter.stringify("## Unassigned draft", draft));
      const result = await auditEditorialContent({ contentRoot, publicRoot });
      expect(result.issues).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
