import matter from "gray-matter";
import { ZodError } from "zod";
import { buildTableOfContents, calculateReadingTime } from "./headings";
import { editorialFrontmatterSchema } from "./schema";
import type { EditorialDocument } from "./types";
import { buildEditorialHref } from "./urls";

export class EditorialValidationError extends Error {
  readonly relativePath: string;
  readonly details: string[];

  constructor(relativePath: string, details: string[], cause?: unknown) {
    super(
      `Conteúdo editorial inválido em ${relativePath}:\n${details.join("\n")}`,
      {
        cause,
      },
    );
    this.name = "EditorialValidationError";
    this.relativePath = relativePath;
    this.details = details;
  }
}

function formatZodError(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "frontmatter";
    return `${path}: ${issue.message}`;
  });
}

export function parseEditorialSource(
  rawSource: string,
  relativePath: string,
): EditorialDocument {
  let parsedMatter: ReturnType<typeof matter>;

  try {
    parsedMatter = matter(rawSource);
  } catch (error) {
    throw new EditorialValidationError(
      relativePath,
      ["não foi possível interpretar o YAML frontmatter"],
      error,
    );
  }

  const parsedFrontmatter = editorialFrontmatterSchema.safeParse(
    parsedMatter.data,
  );
  if (!parsedFrontmatter.success) {
    throw new EditorialValidationError(
      relativePath,
      formatZodError(parsedFrontmatter.error),
      parsedFrontmatter.error,
    );
  }

  const frontmatter = parsedFrontmatter.data;
  const route = {
    locale: frontmatter.locale,
    collection: frontmatter.collection,
    category: frontmatter.category,
    slug: frontmatter.slug,
  };

  return {
    frontmatter,
    source: parsedMatter.content.trim(),
    toc: buildTableOfContents(parsedMatter.content),
    readingTime: calculateReadingTime(parsedMatter.content, frontmatter.locale),
    relativePath: relativePath.replaceAll("\\", "/"),
    href: buildEditorialHref(route),
  };
}
