import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { editorialFrontmatterSchema } from "../lib/editorial/schema";

const contentRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../content",
);

function example(file: string): Record<string, unknown> {
  const source = readFileSync(path.join(contentRoot, file), "utf8");
  const yaml = source.match(/```yaml\r?\n([\s\S]*?)\r?\n```/)?.[1];
  expect(yaml).toBeDefined();
  return matter(yaml!.startsWith("---") ? yaml! : `---\n${yaml}\n---`).data;
}

describe("documented frontmatter contract", () => {
  it("requires real attribution before publishing the unassigned README draft", () => {
    const draft = example("README.md");
    expect(editorialFrontmatterSchema.safeParse(draft).success).toBe(true);
    expect(draft.author).toBeUndefined();
    expect(draft.reviewedBy).toBeUndefined();
    expect(
      editorialFrontmatterSchema.safeParse({
        ...draft,
        status: "published",
        publishedAt: draft.updatedAt,
      }).success,
    ).toBe(false);
    const published = {
      ...draft,
      status: "published",
      publishedAt: draft.updatedAt,
      author: "Fixture Author",
      reviewedBy: "Fixture Reviewer",
    };
    expect(editorialFrontmatterSchema.safeParse(published).success).toBe(true);
    const missingReview = { ...published, reviewedAt: undefined };
    const result = editorialFrontmatterSchema.safeParse(missingReview);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) => issue.path.join(".") === "reviewedAt",
        ),
      ).toBe(true);
    }
  });

  it.each(["guide.md", "help.md", "troubleshooting.md"])(
    "keeps review metadata in the %s starting template",
    (file) => {
      const draft = example(`templates/${file}`);
      expect(editorialFrontmatterSchema.safeParse(draft).success).toBe(true);
      expect(draft.reviewedAt).toBeDefined();
      expect(draft.author).toBeUndefined();
      expect(draft.reviewedBy).toBeUndefined();
      if (file === "troubleshooting.md") {
        expect(draft.kind).toBe("troubleshooting");
        expect(draft.category).toBe("troubleshooting");
      }
      // Synthetic metadata validates the example without claiming an actual review.
      expect(
        editorialFrontmatterSchema.safeParse({
          ...draft,
          status: "published",
          publishedAt: draft.updatedAt,
          author: "Fixture Author",
          reviewedBy: "Fixture Reviewer",
          testedWith: [
            {
              name: "Corneta",
              version: "0.6.0",
              environment: "Synthetic fixture",
            },
          ],
          sources: [
            {
              title: "Synthetic internal source",
              kind: "internal",
              repoPath: "web/PRODUCT.md",
              reviewedAt: draft.reviewedAt,
            },
          ],
        }).success,
      ).toBe(true);
    },
  );
});
