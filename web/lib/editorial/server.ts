import "server-only";

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { assertValidEditorialCatalog } from "./catalog";
import { parseEditorialSource } from "./parse";
import {
  editorialAssetManifestSchema,
  editorialPeopleRegistrySchema,
} from "./schema";
import { readEditorialManifest } from "./manifest";
import type {
  EditorialAlternates,
  EditorialDocument,
  EditorialListOptions,
  EditorialPerson,
  EditorialRouteKey,
  PublishedEditorialDocument,
} from "./types";

async function directoryExists(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

async function resolveContentRoot(): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), "content"),
    path.resolve(process.cwd(), "web", "content"),
  ];

  for (const candidate of candidates) {
    if (await directoryExists(candidate)) return candidate;
  }

  throw new Error(
    `Editorial directory not found. Checked paths: ${candidates.join(", ")}`,
  );
}

async function findMdxFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith("."))
      .map(async (entry) => {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) return findMdxFiles(absolutePath);
        return entry.isFile() && entry.name.endsWith(".mdx")
          ? [absolutePath]
          : [];
      }),
  );

  return nested.flat().sort((left, right) => left.localeCompare(right, "en"));
}

let productionCatalog: Promise<EditorialDocument[]> | undefined;

const readEditorialCatalog = cache(async (): Promise<EditorialDocument[]> => {
  if (process.env.NODE_ENV === "production") {
    productionCatalog ??= (async () => {
      const contentRoot = await resolveContentRoot();
      return readEditorialManifest(
        await readFile(
          path.join(contentRoot, "..", ".generated", "editorial.json"),
          "utf8",
        ),
      );
    })().catch((error) => {
      productionCatalog = undefined;
      throw error;
    });
    return productionCatalog;
  }
  const contentRoot = await resolveContentRoot();
  const { assets } = editorialAssetManifestSchema.parse(
    JSON.parse(
      await readFile(path.join(contentRoot, "assets", "manifest.json"), "utf8"),
    ),
  );
  const files = await findMdxFiles(contentRoot);
  const documents = await Promise.all(
    files.map(async (file) => {
      const source = await readFile(file, "utf8");
      const relativePath = path
        .relative(contentRoot, file)
        .replaceAll("\\", "/");
      return parseEditorialSource(source, relativePath, assets);
    }),
  );

  assertValidEditorialCatalog(documents);
  return documents;
});

const readEditorialPeople = cache(async (): Promise<EditorialPerson[]> => {
  const contentRoot = await resolveContentRoot();
  const source = await readFile(path.join(contentRoot, "people.json"), "utf8");
  const parsed = editorialPeopleRegistrySchema.parse(JSON.parse(source));
  return parsed.people;
});

function isPublished(
  document: EditorialDocument,
): document is PublishedEditorialDocument {
  return document.frontmatter.status === "published";
}

function comparePublishedDocuments(
  left: PublishedEditorialDocument,
  right: PublishedEditorialDocument,
): number {
  const byDate = right.frontmatter.updatedAt.localeCompare(
    left.frontmatter.updatedAt,
  );
  if (byDate !== 0) return byDate;
  return left.frontmatter.title.localeCompare(
    right.frontmatter.title,
    left.frontmatter.locale,
  );
}

export async function listPublishedEditorial(
  options: EditorialListOptions = {},
): Promise<PublishedEditorialDocument[]> {
  const documents = await readEditorialCatalog();
  return documents
    .filter(isPublished)
    .filter(
      (document) =>
        (!options.locale || document.frontmatter.locale === options.locale) &&
        (!options.collection ||
          document.frontmatter.collection === options.collection) &&
        (!options.category ||
          document.frontmatter.category === options.category),
    )
    .sort(comparePublishedDocuments);
}

export async function getPublishedEditorial(
  route: EditorialRouteKey,
): Promise<PublishedEditorialDocument | null> {
  const documents = await listPublishedEditorial({
    locale: route.locale,
    collection: route.collection,
    category: route.category,
  });
  return (
    documents.find((document) => document.frontmatter.slug === route.slug) ??
    null
  );
}

async function getPublishedTranslation(
  document: PublishedEditorialDocument,
): Promise<PublishedEditorialDocument | null> {
  const translationKey = document.frontmatter.translationKey;
  if (!translationKey) return null;

  const documents = await listPublishedEditorial({
    collection: document.frontmatter.collection,
  });
  const counterpart = documents.find(
    (candidate) =>
      candidate.frontmatter.translationKey === translationKey &&
      candidate.frontmatter.locale !== document.frontmatter.locale &&
      candidate.frontmatter.category === document.frontmatter.category &&
      candidate.frontmatter.slug === document.frontmatter.slug,
  );
  return counterpart ?? null;
}

export async function getPublishedEditorialAlternates(
  document: PublishedEditorialDocument,
): Promise<EditorialAlternates> {
  const translation = await getPublishedTranslation(document);
  if (!translation) return {};

  return {
    [document.frontmatter.locale]: document.href,
    [translation.frontmatter.locale]: translation.href,
  };
}

export async function getPublishedRelated(
  document: PublishedEditorialDocument,
): Promise<PublishedEditorialDocument[]> {
  if (document.frontmatter.related.length === 0) return [];

  const byId = new Map(
    (await listPublishedEditorial()).map((candidate) => [
      candidate.frontmatter.contentId,
      candidate,
    ]),
  );
  return document.frontmatter.related
    .map((contentId) => byId.get(contentId))
    .filter(
      (candidate): candidate is PublishedEditorialDocument =>
        candidate !== undefined,
    );
}

export async function getEditorialPerson(
  name: string,
): Promise<EditorialPerson | null> {
  return (
    (await readEditorialPeople()).find((person) => person.name === name) ?? null
  );
}
