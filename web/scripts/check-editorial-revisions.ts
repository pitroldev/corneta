import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import matter from "gray-matter";
import { auditEditorialContent } from "../lib/editorial/audit";
import { normalizeEditorialRevisionSource } from "./editorial-revision-source";
import { editorialArguments, isEditorialCliEntrypoint } from "./editorial-cli";
import {
  validateChangedInternalSources,
  validateEditorialRevision,
  type EditorialRevisionFrontmatter,
  type EditorialRevisionIssue,
  type EditorialRevisionSnapshot,
  type EditorialRevisionSource,
} from "../lib/editorial/revision-policy";
import {
  invalidSourceImpactDeclarations,
  SOURCE_IMPACT_FILE,
  sourceImpactSchema,
  sourcesWithoutImpact,
  type SourceImpactDeclaration,
} from "../lib/editorial/source-impact";

const execFileAsync = promisify(execFile);

interface Options {
  base: string;
  head: string;
  productVersion?: string;
}

function readValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

export function parseOptions(argv: string[]): Options {
  const args = editorialArguments(argv);
  let base: string | undefined;
  let head = "HEAD";
  let productVersion: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--base") {
      base = readValue(args, index, argument);
      index += 1;
    } else if (argument === "--head") {
      head = readValue(args, index, argument);
      index += 1;
    } else if (argument === "--product-version") {
      productVersion = readValue(args, index, argument);
      index += 1;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (!base) throw new Error("--base is required.");
  return { base, head, productVersion };
}

async function git(repositoryRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

function normalizeRepositoryPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function normalizeYamlValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(normalizeYamlValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalizeYamlValue(item),
      ]),
    );
  }
  return value;
}

function asSource(value: unknown): EditorialRevisionSource | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = normalizeYamlValue(value) as Record<string, unknown>;
  return {
    ...raw,
    kind: typeof raw.kind === "string" ? raw.kind : undefined,
    repoPath:
      typeof raw.repoPath === "string"
        ? normalizeRepositoryPath(raw.repoPath)
        : undefined,
    reviewedAt: typeof raw.reviewedAt === "string" ? raw.reviewedAt : undefined,
  };
}

function asFrontmatter(
  value: unknown,
  relativePath: string,
): EditorialRevisionFrontmatter {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${relativePath}: missing frontmatter.`);
  }
  const raw = normalizeYamlValue(value) as Record<string, unknown>;
  if (typeof raw.updatedAt !== "string") {
    throw new Error(
      `${relativePath}: previous updatedAt is missing or invalid.`,
    );
  }

  return {
    ...raw,
    contentId: typeof raw.contentId === "string" ? raw.contentId : undefined,
    updatedAt: raw.updatedAt,
    // Older frontmatter used updatedAt as its only review timestamp.
    reviewedAt:
      typeof raw.reviewedAt === "string" ? raw.reviewedAt : raw.updatedAt,
    productVersion:
      typeof raw.productVersion === "string" ? raw.productVersion : undefined,
    sources: Array.isArray(raw.sources)
      ? raw.sources
          .map(asSource)
          .filter(
            (source): source is EditorialRevisionSource => source !== null,
          )
      : [],
  };
}

function snapshotFromRaw(
  raw: string,
  relativePath: string,
): EditorialRevisionSnapshot {
  const parsed = matter(raw);
  return {
    relativePath,
    source: parsed.content.trim(),
    frontmatter: asFrontmatter(parsed.data, relativePath),
  };
}

async function previousSnapshot(
  repositoryRoot: string,
  base: string,
  repositoryPath: string,
  relativePath: string,
): Promise<EditorialRevisionSnapshot | null> {
  try {
    await git(repositoryRoot, ["cat-file", "-e", `${base}:${repositoryPath}`]);
  } catch {
    return null;
  }
  const raw = await git(repositoryRoot, ["show", `${base}:${repositoryPath}`]);
  return snapshotFromRaw(raw, relativePath);
}

async function readSourceImpact(
  repositoryRoot: string,
): Promise<SourceImpactDeclaration[]> {
  let raw: string;
  try {
    raw = await readFile(path.join(repositoryRoot, SOURCE_IMPACT_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return sourceImpactSchema.parse(JSON.parse(raw)).declarations;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const repositoryRoot = (
    await git(process.cwd(), ["rev-parse", "--show-toplevel"])
  ).trim();
  const webRoot = path.join(repositoryRoot, "web");

  await git(repositoryRoot, [
    "rev-parse",
    "--verify",
    `${options.base}^{commit}`,
  ]);
  await git(repositoryRoot, [
    "rev-parse",
    "--verify",
    `${options.head}^{commit}`,
  ]);

  const changedPaths = new Set(
    (
      await git(repositoryRoot, [
        "diff",
        "--name-only",
        "--diff-filter=ACMR",
        `${options.base}...${options.head}`,
        "--",
      ])
    )
      .split(/\r?\n/u)
      .map(normalizeRepositoryPath)
      .filter(Boolean),
  );

  const audit = await auditEditorialContent({
    contentRoot: path.join(webRoot, "content"),
    publicRoot: path.join(webRoot, "public"),
    repositoryRoot,
  });
  if (audit.errorCount > 0) {
    throw new Error(
      `Current content has ${audit.errorCount} error(s); run content:check first.`,
    );
  }

  const declarations = await readSourceImpact(repositoryRoot);
  const invalidDeclarations = invalidSourceImpactDeclarations(
    declarations,
    new Map(
      audit.documents
        .filter((document) => document.frontmatter.status === "published")
        .map((document) => [
          document.relativePath,
          new Set(
            (document.frontmatter.sources ?? [])
              .filter((source) => source.kind === "internal" && source.repoPath)
              .map((source) => normalizeRepositoryPath(source.repoPath!)),
          ),
        ]),
    ),
  );
  if (invalidDeclarations.length > 0) {
    throw new Error(
      `${SOURCE_IMPACT_FILE} has invalid declarations:\n- ${invalidDeclarations.join("\n- ")}`,
    );
  }
  const blobs = new Map<string, string>();
  const blobAtHead = async (repositoryPath: string) => {
    let blob = blobs.get(repositoryPath);
    if (blob === undefined) {
      blob = (
        await git(repositoryRoot, [
          "rev-parse",
          "--verify",
          `${options.head}:${repositoryPath}`,
        ])
      ).trim();
      blobs.set(repositoryPath, blob);
    }
    return blob;
  };

  const issues: EditorialRevisionIssue[] = [];
  let comparedArticles = 0;
  let sourceAffectedArticles = 0;
  let declaredArticles = 0;

  for (const document of audit.documents) {
    if (document.frontmatter.status !== "published") continue;
    const repositoryPath = `web/content/${document.relativePath}`;
    const previous = await previousSnapshot(
      repositoryRoot,
      options.base,
      repositoryPath,
      document.relativePath,
    );
    if (!previous) continue;

    comparedArticles += 1;
    const current: EditorialRevisionSnapshot = {
      relativePath: document.relativePath,
      source: document.source,
      frontmatter: document.frontmatter,
    };

    if (changedPaths.has(repositoryPath)) {
      const [normalizedPrevious, normalizedCurrent] = await Promise.all([
        normalizeEditorialRevisionSource(previous),
        normalizeEditorialRevisionSource(current),
      ]);
      issues.push(
        ...validateEditorialRevision(normalizedPrevious, normalizedCurrent),
      );
    }

    const affected = (current.frontmatter.sources ?? [])
      .filter((source) => source.kind === "internal" && source.repoPath)
      .map((source) => normalizeRepositoryPath(source.repoPath!))
      .filter((repositoryPath) => changedPaths.has(repositoryPath));
    if (affected.length > 0) {
      sourceAffectedArticles += 1;
      // A declaration covers only the exact source blob it was written for.
      const withoutImpact = sourcesWithoutImpact(
        declarations,
        document.relativePath,
        new Map(
          await Promise.all(
            affected.map(
              async (repositoryPath) =>
                [repositoryPath, await blobAtHead(repositoryPath)] as const,
            ),
          ),
        ),
      );
      if (
        affected.every((repositoryPath) => withoutImpact.has(repositoryPath))
      ) {
        declaredArticles += 1;
      } else {
        issues.push(
          ...validateChangedInternalSources(
            previous,
            current,
            new Set(
              [...changedPaths].filter(
                (repositoryPath) => !withoutImpact.has(repositoryPath),
              ),
            ),
            options.productVersion,
          ),
        );
      }
    }
  }

  if (issues.length > 0) {
    process.stderr.write(
      `Editorial policy found ${issues.length} issue(s):
`,
    );
    for (const issue of issues) {
      process.stderr.write(
        `- [${issue.code}] ${issue.file}: ${issue.message}\n`,
      );
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `Editorial policy passed: ${comparedArticles} article(s) compared, ${sourceAffectedArticles} affected by internal sources, ${declaredArticles} declared without impact.
`,
  );
}

if (isEditorialCliEntrypoint(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `Editorial revision check failed: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  });
}
