export interface EditorialRevisionSource {
  kind?: string;
  repoPath?: string;
  reviewedAt?: string;
  [key: string]: unknown;
}

export interface EditorialRevisionFrontmatter {
  contentId?: string;
  updatedAt: string;
  reviewedAt: string;
  productVersion?: string;
  sources?: EditorialRevisionSource[];
  [key: string]: unknown;
}

export interface EditorialRevisionSnapshot {
  relativePath: string;
  source: string;
  frontmatter: EditorialRevisionFrontmatter;
}

export interface EditorialRevisionIssue {
  code: string;
  message: string;
  file: string;
}

function substantiveFrontmatter(
  frontmatter: EditorialRevisionFrontmatter,
): Record<string, unknown> {
  const copy = structuredClone(frontmatter) as Record<string, unknown>;
  delete copy.updatedAt;
  delete copy.reviewedAt;
  delete copy.productVersion;
  delete copy.testedWith;

  if (Array.isArray(copy.sources)) {
    copy.sources = copy.sources.map((rawSource) => {
      const source = { ...(rawSource as Record<string, unknown>) };
      delete source.reviewedAt;
      return source;
    });
  }
  return copy;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

export function hasSubstantiveEditorialChange(
  previous: EditorialRevisionSnapshot,
  current: EditorialRevisionSnapshot,
): boolean {
  return (
    previous.source !== current.source ||
    JSON.stringify(
      canonicalValue(substantiveFrontmatter(previous.frontmatter)),
    ) !==
      JSON.stringify(
        canonicalValue(substantiveFrontmatter(current.frontmatter)),
      )
  );
}

export function validateEditorialRevision(
  previous: EditorialRevisionSnapshot,
  current: EditorialRevisionSnapshot,
): EditorialRevisionIssue[] {
  const issues: EditorialRevisionIssue[] = [];
  const substantiveChange = hasSubstantiveEditorialChange(previous, current);
  const updatedAdvanced =
    current.frontmatter.updatedAt > previous.frontmatter.updatedAt;

  if (substantiveChange && !updatedAdvanced) {
    issues.push({
      code: "substantive-change-without-updated-at",
      message:
        "o conteúdo mudou de forma substancial, mas updatedAt não avançou",
      file: current.relativePath,
    });
  }
  if (!substantiveChange && updatedAdvanced) {
    issues.push({
      code: "artificial-freshness-date",
      message:
        "updatedAt avançou sem mudança substancial; use reviewedAt para registrar somente a revisão",
      file: current.relativePath,
    });
  }
  if (current.frontmatter.reviewedAt < previous.frontmatter.reviewedAt) {
    issues.push({
      code: "review-date-regression",
      message: "reviewedAt não pode retroceder",
      file: current.relativePath,
    });
  }
  return issues;
}

export function validateChangedInternalSources(
  previous: EditorialRevisionSnapshot,
  current: EditorialRevisionSnapshot,
  changedRepositoryPaths: ReadonlySet<string>,
  productVersion?: string,
): EditorialRevisionIssue[] {
  const affectedSources = (current.frontmatter.sources ?? []).filter(
    (source) =>
      source.kind === "internal" &&
      source.repoPath &&
      changedRepositoryPaths.has(source.repoPath),
  );
  if (affectedSources.length === 0) return [];

  const issues: EditorialRevisionIssue[] = [];
  if (current.frontmatter.reviewedAt <= previous.frontmatter.reviewedAt) {
    issues.push({
      code: "changed-source-without-article-review",
      message: `fontes internas mudaram (${affectedSources
        .map((source) => source.repoPath)
        .join(", ")}), mas reviewedAt não avançou`,
      file: current.relativePath,
    });
  }

  const previousSources = new Map(
    (previous.frontmatter.sources ?? [])
      .filter((source) => source.repoPath)
      .map((source) => [source.repoPath, source]),
  );
  for (const source of affectedSources) {
    const previousSource = previousSources.get(source.repoPath);
    if (
      previousSource?.reviewedAt &&
      (!source.reviewedAt || source.reviewedAt <= previousSource.reviewedAt)
    ) {
      issues.push({
        code: "changed-source-without-source-review",
        message: `a fonte ${source.repoPath} mudou, mas sources[].reviewedAt não avançou`,
        file: current.relativePath,
      });
    }
  }

  if (productVersion && current.frontmatter.productVersion !== productVersion) {
    issues.push({
      code: "reviewed-against-wrong-product-version",
      message: `a revisão deve declarar productVersion ${productVersion}`,
      file: current.relativePath,
    });
  }
  return issues;
}
