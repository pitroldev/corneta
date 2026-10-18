import matter from "gray-matter";
import { ZodError } from "zod";
import { buildTableOfContents, calculateReadingTime } from "./headings";
import { resolveEditorialImage } from "./images";
import { editorialFrontmatterSchema, editorialImageSchema } from "./schema";
import type {
  EditorialAssetManifestEntry,
  EditorialDocument,
  EditorialFrontmatter,
  EditorialImage,
} from "./types";
import { buildEditorialHref } from "./urls";

export class EditorialValidationError extends Error {
  readonly relativePath: string;
  readonly details: string[];

  constructor(relativePath: string, details: string[], cause?: unknown) {
    super(
      `Invalid editorial content in ${relativePath}:\n${details.join("\n")}`,
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
  assets: readonly EditorialAssetManifestEntry[] = [],
): EditorialDocument {
  let parsedMatter: ReturnType<typeof matter>;

  try {
    parsedMatter = matter(rawSource);
  } catch (error) {
    throw new EditorialValidationError(
      relativePath,
      ["could not parse YAML frontmatter"],
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

  const images: EditorialImage[] = [];
  const imageIssues: string[] = [];
  parsedFrontmatter.data.images.forEach((reference, index) => {
    const resolved = resolveEditorialImage(reference, assets);
    if (!resolved) {
      imageIssues.push(
        `images.${index}.baseName: not declared in assets/manifest.json: ${reference.baseName}`,
      );
      return;
    }
    const checked = editorialImageSchema.safeParse(resolved);
    if (!checked.success) {
      imageIssues.push(
        ...formatZodError(checked.error).map(
          (detail) => `images.${index}.${detail}`,
        ),
      );
      return;
    }
    images.push(checked.data);
  });
  if (imageIssues.length > 0) {
    throw new EditorialValidationError(relativePath, imageIssues);
  }

  const frontmatter = {
    ...parsedFrontmatter.data,
    images,
  } as EditorialFrontmatter;
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
