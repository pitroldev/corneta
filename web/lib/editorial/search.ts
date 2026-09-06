import type { PublishedEditorialDocument } from "./types";

const SEARCH_QUERY_MAX_LENGTH = 120;

export function normalizeEditorialSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function sanitizeEditorialSearchQuery(
  value: string | string[] | undefined,
): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim().slice(0, SEARCH_QUERY_MAX_LENGTH);
}

const searchFields = new WeakMap<
  PublishedEditorialDocument,
  {
    title: string;
    primaryQuery: string;
    summary: string;
    taxonomy: string;
    haystack: string;
  }
>();

function fieldsFor(document: PublishedEditorialDocument) {
  const cached = searchFields.get(document);
  if (cached) return cached;
  const { frontmatter } = document;
  const title = normalizeEditorialSearch(frontmatter.title);
  const primaryQuery = normalizeEditorialSearch(frontmatter.primaryQuery);
  const summary = normalizeEditorialSearch(
    `${frontmatter.summary} ${frontmatter.description}`,
  );
  const taxonomy = normalizeEditorialSearch(
    `${frontmatter.collection} ${frontmatter.category} ${frontmatter.slug}`,
  );
  const fields = {
    title,
    primaryQuery,
    summary,
    taxonomy,
    haystack: `${title} ${primaryQuery} ${summary} ${taxonomy}`,
  };
  searchFields.set(document, fields);
  return fields;
}

function scoreDocument(
  document: PublishedEditorialDocument,
  normalizedQuery: string,
  tokens: readonly string[],
): number {
  const { title, primaryQuery, summary, taxonomy, haystack } =
    fieldsFor(document);

  if (!tokens.every((token) => haystack.includes(token))) return -1;

  let score = 0;
  if (title === normalizedQuery) score += 100;
  else if (title.startsWith(normalizedQuery)) score += 70;
  else if (title.includes(normalizedQuery)) score += 50;
  if (primaryQuery.includes(normalizedQuery)) score += 35;

  for (const token of tokens) {
    if (title.includes(token)) score += 12;
    if (primaryQuery.includes(token)) score += 8;
    if (summary.includes(token)) score += 4;
    if (taxonomy.includes(token)) score += 2;
  }

  return score;
}

export function searchPublishedEditorial(
  documents: readonly PublishedEditorialDocument[],
  query: string,
): PublishedEditorialDocument[] {
  const normalizedQuery = normalizeEditorialSearch(query);
  if (!normalizedQuery) return [];
  const tokens = normalizedQuery.split(" ").filter(Boolean);

  return documents
    .map((document) => ({
      document,
      score: scoreDocument(document, normalizedQuery, tokens),
    }))
    .filter((item) => item.score >= 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.document.frontmatter.title.localeCompare(
          right.document.frontmatter.title,
          left.document.frontmatter.locale,
        ),
    )
    .map((item) => item.document);
}
