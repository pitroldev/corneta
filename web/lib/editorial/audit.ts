import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { editorialImageMatchesManifest } from "./asset-provenance";
import {
  embeddedRasterMetadata,
  imageFormatMatchesExtension,
  inspectPublicEditorialSvg,
} from "./asset-safety";
import {
  extractEditorialBodyLinks,
  publicResourcePathFromHref,
  validateEditorialCatalog,
} from "./catalog";
import {
  EDITORIAL_ASSET_MAX_BYTES,
  EDITORIAL_ENGLISH_ASSET_PATH_APPROVALS,
} from "./constants";
import { isApprovedEnglishEditorialAssetPath } from "./language-approvals";
import { EditorialValidationError, parseEditorialSource } from "./parse";
import {
  editorialAssetManifestSchema,
  editorialPeopleRegistrySchema,
} from "./schema";
import type {
  EditorialAssetManifest,
  EditorialAssetManifestEntry,
  EditorialAuditOptions,
  EditorialAuditResult,
  EditorialDocument,
  EditorialImage,
  EditorialIssue,
  EditorialPerson,
} from "./types";

async function pathExists(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

async function fileSize(candidate: string): Promise<number | null> {
  try {
    const info = await stat(candidate);
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
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

function isInside(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function assetIssue(
  document: EditorialDocument,
  code: string,
  message: string,
  field: string,
): EditorialIssue {
  return {
    severity: "error",
    code,
    message,
    file: document.relativePath,
    field,
  };
}

async function validateImageFiles(
  document: EditorialDocument,
  image: EditorialImage,
  field: string,
  options: EditorialAuditOptions,
  manifestBySrc: Map<string, EditorialAssetManifestEntry>,
): Promise<EditorialIssue[]> {
  const issues: EditorialIssue[] = [];
  const publicFile = path.resolve(options.publicRoot, image.src.slice(1));
  const originalFile = path.resolve(options.contentRoot, image.originalPath);

  if (!isInside(options.publicRoot, publicFile)) {
    issues.push(
      assetIssue(
        document,
        "unsafe-public-asset",
        "asset público saiu de publicRoot",
        field,
      ),
    );
  } else {
    const bytes = await fileSize(publicFile);
    if (bytes === null) {
      issues.push(
        assetIssue(
          document,
          "missing-public-asset",
          `derivada pública não encontrada: ${image.src}`,
          field,
        ),
      );
    } else if (bytes > EDITORIAL_ASSET_MAX_BYTES) {
      issues.push(
        assetIssue(
          document,
          "public-asset-too-large",
          `derivada tem ${bytes} bytes; o limite é ${EDITORIAL_ASSET_MAX_BYTES}`,
          field,
        ),
      );
    }
  }

  if (!isInside(options.contentRoot, originalFile)) {
    issues.push(
      assetIssue(
        document,
        "unsafe-original-asset",
        "master saiu de contentRoot",
        field,
      ),
    );
  } else if (!(await pathExists(originalFile))) {
    issues.push(
      assetIssue(
        document,
        "missing-original-asset",
        `master não encontrado: ${image.originalPath}`,
        field,
      ),
    );
  }

  if (
    image.language !== "none" &&
    image.language !== document.frontmatter.locale
  ) {
    issues.push(
      assetIssue(
        document,
        "asset-language-mismatch",
        `imagem ${image.language} não corresponde ao conteúdo ${document.frontmatter.locale}`,
        `${field}.language`,
      ),
    );
  }

  const manifestEntry = manifestBySrc.get(image.src);
  if (!manifestEntry) {
    issues.push(
      assetIssue(
        document,
        "asset-missing-from-manifest",
        `asset não declarado em assets/manifest.json: ${image.src}`,
        field,
      ),
    );
  } else {
    if (!editorialImageMatchesManifest(image, manifestEntry)) {
      issues.push(
        assetIssue(
          document,
          "asset-manifest-mismatch",
          `metadados divergem de assets/manifest.json: ${image.src}`,
          field,
        ),
      );
    }
  }

  return issues;
}

async function validateDocumentFiles(
  document: EditorialDocument,
  options: EditorialAuditOptions,
  manifestBySrc: Map<string, EditorialAssetManifestEntry>,
  registeredPeople: Map<string, EditorialPerson>,
): Promise<EditorialIssue[]> {
  const checks: Promise<EditorialIssue[]>[] = [];
  document.frontmatter.images.forEach((image, index) => {
    checks.push(
      validateImageFiles(
        document,
        image,
        `images.${index}`,
        options,
        manifestBySrc,
      ),
    );
  });

  const issues = (await Promise.all(checks)).flat();

  for (const rawHref of extractEditorialBodyLinks(document.source)) {
    const resourcePath = publicResourcePathFromHref(rawHref);
    if (!resourcePath) continue;

    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(resourcePath);
    } catch {
      issues.push(
        assetIssue(
          document,
          "invalid-linked-public-resource",
          `recurso público tem encoding inválido: ${rawHref}`,
          "body",
        ),
      );
      continue;
    }

    const resourceFile = path.resolve(options.publicRoot, decodedPath.slice(1));
    if (!isInside(options.publicRoot, resourceFile)) {
      issues.push(
        assetIssue(
          document,
          "unsafe-linked-public-resource",
          `recurso público saiu de publicRoot: ${rawHref}`,
          "body",
        ),
      );
    } else if (!(await pathExists(resourceFile))) {
      issues.push(
        assetIssue(
          document,
          "missing-linked-public-resource",
          `recurso público não encontrado: ${rawHref}`,
          "body",
        ),
      );
    }
  }

  const repositoryRoot =
    options.repositoryRoot ?? path.resolve(options.contentRoot, "..", "..");

  for (const [index, source] of document.frontmatter.sources.entries()) {
    if (!source.repoPath) continue;
    const sourceFile = path.resolve(repositoryRoot, source.repoPath);
    if (!isInside(repositoryRoot, sourceFile)) {
      issues.push(
        assetIssue(
          document,
          "unsafe-source-path",
          "repoPath saiu do repositório",
          `sources.${index}.repoPath`,
        ),
      );
    } else if (!(await pathExists(sourceFile))) {
      issues.push(
        assetIssue(
          document,
          "missing-source-file",
          `fonte interna não encontrada: ${source.repoPath}`,
          `sources.${index}.repoPath`,
        ),
      );
    }
  }

  for (const field of ["author", "reviewedBy"] as const) {
    const person = document.frontmatter[field];
    const registryEntry = person ? registeredPeople.get(person) : undefined;
    if (person && !registryEntry) {
      issues.push(
        assetIssue(
          document,
          "unregistered-person",
          `${field} não existe em people.json: ${person}`,
          field,
        ),
      );
    } else if (
      document.frontmatter.status === "published" &&
      registryEntry &&
      (registryEntry.type !== "person" || !registryEntry.url)
    ) {
      issues.push(
        assetIssue(
          document,
          "invalid-published-person",
          `${field} de conteúdo publicado precisa ser person com URL factual`,
          field,
        ),
      );
    }
  }

  return issues;
}

async function loadEditorialRegistries(
  options: EditorialAuditOptions,
): Promise<{
  manifest: EditorialAssetManifest;
  registeredPeople: Map<string, EditorialPerson>;
  issues: EditorialIssue[];
}> {
  const issues: EditorialIssue[] = [];
  const manifestPath = path.join(
    options.contentRoot,
    "assets",
    "manifest.json",
  );
  const peoplePath = path.join(options.contentRoot, "people.json");
  let manifest: EditorialAssetManifest = { version: 1, assets: [] };
  let registeredPeople = new Map<string, EditorialPerson>();

  try {
    const parsed = editorialAssetManifestSchema.safeParse(
      JSON.parse(await readFile(manifestPath, "utf8")),
    );
    if (!parsed.success) {
      parsed.error.issues.forEach((item) => {
        issues.push({
          severity: "error",
          code: "invalid-asset-manifest",
          message: `${item.path.join(".") || "manifest"}: ${item.message}`,
          file: "assets/manifest.json",
        });
      });
    } else {
      manifest = parsed.data;
    }
  } catch (error) {
    issues.push({
      severity: "error",
      code: "missing-asset-manifest",
      message: error instanceof Error ? error.message : String(error),
      file: "assets/manifest.json",
    });
  }

  try {
    const parsed = editorialPeopleRegistrySchema.safeParse(
      JSON.parse(await readFile(peoplePath, "utf8")),
    );
    if (!parsed.success) {
      parsed.error.issues.forEach((item) => {
        issues.push({
          severity: "error",
          code: "invalid-people-registry",
          message: `${item.path.join(".") || "people"}: ${item.message}`,
          file: "people.json",
        });
      });
    } else {
      registeredPeople = new Map(
        parsed.data.people.map((person) => [person.name, person]),
      );
    }
  } catch (error) {
    issues.push({
      severity: "error",
      code: "missing-people-registry",
      message: error instanceof Error ? error.message : String(error),
      file: "people.json",
    });
  }

  const seenBaseNames = new Set<string>();
  const seenSources = new Set<string>();
  for (const entry of manifest.assets) {
    if (seenBaseNames.has(entry.baseName)) {
      issues.push({
        severity: "error",
        code: "duplicate-manifest-base-name",
        message: `baseName duplicado: ${entry.baseName}`,
        file: "assets/manifest.json",
      });
    }
    seenBaseNames.add(entry.baseName);

    if (
      !entry.derivatives.every((derivative) =>
        isApprovedEnglishEditorialAssetPath({
          baseName: entry.baseName,
          src: derivative.src,
          originalPath: entry.originalPath,
        }),
      )
    ) {
      issues.push({
        severity: "error",
        code: "unapproved-asset-path",
        message: `asset sem aprovação semântica do path completo: ${entry.originalPath} (allowlist v${EDITORIAL_ENGLISH_ASSET_PATH_APPROVALS.version})`,
        file: "assets/manifest.json",
      });
    }

    const originalFile = path.resolve(options.contentRoot, entry.originalPath);
    if (!isInside(options.contentRoot, originalFile)) {
      issues.push({
        severity: "error",
        code: "unsafe-manifest-original",
        message: `master saiu de contentRoot: ${entry.originalPath}`,
        file: "assets/manifest.json",
      });
    } else if (!(await pathExists(originalFile))) {
      issues.push({
        severity: "error",
        code: "missing-manifest-original",
        message: `master não encontrado: ${entry.originalPath}`,
        file: "assets/manifest.json",
      });
    } else {
      try {
        const metadata = await sharp(originalFile).metadata();
        if (!imageFormatMatchesExtension(entry.originalPath, metadata)) {
          issues.push({
            severity: "error",
            code: "manifest-original-format-mismatch",
            message: `${entry.originalPath} tem formato real ${metadata.format}${
              metadata.compression ? `/${metadata.compression}` : ""
            }, incompatível com a extensão`,
            file: "assets/manifest.json",
          });
        }

        const originalExtension = path
          .extname(entry.originalPath)
          .toLowerCase();
        if (originalExtension === ".svg") {
          const source = await readFile(originalFile, "utf8");
          for (const finding of inspectPublicEditorialSvg(source)) {
            issues.push({
              severity: "error",
              code: `original-${finding.code}`,
              message: `${entry.originalPath}: ${finding.message}`,
              file: "assets/manifest.json",
            });
          }
        } else {
          const embedded = embeddedRasterMetadata(metadata);
          if (embedded.length > 0) {
            issues.push({
              severity: "error",
              code: "embedded-original-raster-metadata",
              message: `${entry.originalPath} contém metadados incorporados: ${embedded.join(
                ", ",
              )}`,
              file: "assets/manifest.json",
            });
          }
        }
      } catch (error) {
        issues.push({
          severity: "error",
          code: "unreadable-manifest-original",
          message: `${entry.originalPath} não é uma imagem legível: ${
            error instanceof Error ? error.message : String(error)
          }`,
          file: "assets/manifest.json",
        });
      }
    }

    for (const derivative of entry.derivatives) {
      if (seenSources.has(derivative.src)) {
        issues.push({
          severity: "error",
          code: "duplicate-manifest-src",
          message: `src duplicado: ${derivative.src}`,
          file: "assets/manifest.json",
        });
      }
      seenSources.add(derivative.src);

      const publicFile = path.resolve(
        options.publicRoot,
        derivative.src.slice(1),
      );
      if (!isInside(options.publicRoot, publicFile)) {
        issues.push({
          severity: "error",
          code: "unsafe-manifest-derivative",
          message: `derivada saiu de publicRoot: ${derivative.src}`,
          file: "assets/manifest.json",
        });
        continue;
      }
      const actualBytes = await fileSize(publicFile);
      if (actualBytes === null) {
        issues.push({
          severity: "error",
          code: "missing-manifest-derivative",
          message: `derivada não encontrada: ${derivative.src}`,
          file: "assets/manifest.json",
        });
      } else if (actualBytes !== derivative.bytes) {
        issues.push({
          severity: "error",
          code: "manifest-byte-mismatch",
          message: `${derivative.src} declara ${derivative.bytes} bytes, mas tem ${actualBytes}`,
          file: "assets/manifest.json",
        });
      } else if (actualBytes > EDITORIAL_ASSET_MAX_BYTES) {
        issues.push({
          severity: "error",
          code: "manifest-asset-too-large",
          message: `${derivative.src} ultrapassa ${EDITORIAL_ASSET_MAX_BYTES} bytes`,
          file: "assets/manifest.json",
        });
      }

      if (actualBytes !== null) {
        try {
          const metadata = await sharp(publicFile).metadata();
          if (!imageFormatMatchesExtension(derivative.src, metadata)) {
            issues.push({
              severity: "error",
              code: "manifest-derivative-format-mismatch",
              message: `${derivative.src} tem formato real ${metadata.format}${
                metadata.compression ? `/${metadata.compression}` : ""
              }, incompatível com a extensão`,
              file: "assets/manifest.json",
            });
          }
          if (
            metadata.width !== derivative.width ||
            metadata.height !== derivative.height
          ) {
            issues.push({
              severity: "error",
              code: "manifest-dimension-mismatch",
              message: `${derivative.src} declara ${derivative.width}x${derivative.height}, mas tem ${metadata.width ?? "?"}x${metadata.height ?? "?"}`,
              file: "assets/manifest.json",
            });
          }

          const extension = path.extname(derivative.src).toLowerCase();
          if (extension === ".svg") {
            const source = await readFile(publicFile, "utf8");
            for (const finding of inspectPublicEditorialSvg(source)) {
              issues.push({
                severity: "error",
                code: finding.code,
                message: `${derivative.src}: ${finding.message}`,
                file: "assets/manifest.json",
              });
            }
          } else if (extension === ".webp" || extension === ".avif") {
            const embedded = embeddedRasterMetadata(metadata);
            if (embedded.length > 0) {
              issues.push({
                severity: "error",
                code: "embedded-raster-metadata",
                message: `${derivative.src} contém metadados incorporados: ${embedded.join(
                  ", ",
                )}`,
                file: "assets/manifest.json",
              });
            }
          }
        } catch (error) {
          issues.push({
            severity: "error",
            code: "unreadable-manifest-image",
            message: `${derivative.src} não pôde ter dimensões verificadas: ${
              error instanceof Error ? error.message : String(error)
            }`,
            file: "assets/manifest.json",
          });
        }
      }
    }
  }

  return { manifest, registeredPeople, issues };
}

export async function auditEditorialContent(
  options: EditorialAuditOptions,
): Promise<EditorialAuditResult> {
  const documents: EditorialDocument[] = [];
  const issues: EditorialIssue[] = [];
  const registries = await loadEditorialRegistries(options);
  issues.push(...registries.issues);
  const manifestBySrc = new Map<string, EditorialAssetManifestEntry>();
  registries.manifest.assets.forEach((entry) => {
    entry.derivatives.forEach((derivative) =>
      manifestBySrc.set(derivative.src, entry),
    );
  });
  const files = await findMdxFiles(options.contentRoot);

  for (const file of files) {
    const relativePath = path
      .relative(options.contentRoot, file)
      .replaceAll("\\", "/");
    try {
      const source = await readFile(file, "utf8");
      documents.push(parseEditorialSource(source, relativePath));
    } catch (error) {
      if (error instanceof EditorialValidationError) {
        error.details.forEach((detail) => {
          issues.push({
            severity: "error",
            code: "invalid-frontmatter",
            message: detail,
            file: relativePath,
          });
        });
      } else {
        issues.push({
          severity: "error",
          code: "unreadable-content",
          message: error instanceof Error ? error.message : String(error),
          file: relativePath,
        });
      }
    }
  }

  issues.push(...validateEditorialCatalog(documents));
  const fileIssues = await Promise.all(
    documents.map((document) =>
      validateDocumentFiles(
        document,
        options,
        manifestBySrc,
        registries.registeredPeople,
      ),
    ),
  );
  issues.push(...fileIssues.flat());

  return {
    documents,
    issues,
    errorCount: issues.filter((item) => item.severity === "error").length,
    warningCount: issues.filter((item) => item.severity === "warning").length,
  };
}
