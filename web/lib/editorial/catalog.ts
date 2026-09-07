import path from "node:path";
import {
  EDITORIAL_ENGLISH_ASSET_PATH_APPROVALS,
  EDITORIAL_ENGLISH_PATH_APPROVALS,
  GUIDE_CATEGORIES,
  HELP_CATEGORIES,
} from "./constants";
import {
  countMarkdownHeadings,
  extractMarkdownHeadingIds,
  sourceWithoutMarkdownCode,
} from "./headings";
import { isApprovedEnglishEditorialAssetPath } from "./language-approvals";
import type {
  EditorialDocument,
  EditorialIssue,
  PublishedEditorialDocument,
} from "./types";
import {
  hasUrlUserInfo,
  parseAbsoluteUrl,
  sensitiveQueryKeys,
} from "./url-security";

const PLACEHOLDER_PATTERN =
  /(?:\b(?:TODO|FIXME|TBD)\b|lorem ipsum|\[(?:replace|placeholder|preencher|substituir)[^\]]*\]|<placeholder>)/i;
const MARKDOWN_LINK_PATTERN =
  /(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
const HTML_LINK_PATTERN =
  /<(?:a|Link)\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
const HTML_DYNAMIC_LINK_PATTERN =
  /<(?:a|Link)\b[^>]*\bhref\s*=\s*\{[^}]*\}[^>]*>/gi;
const MARKDOWN_AUTOLINK_PATTERN = /<(https?:\/\/[^<>\s]+|mailto:[^<>\s]+)>/gi;
const GFM_BARE_URL_PATTERN = /\bhttps?:\/\/[^\s<>()]+/gi;
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\([^)]+\)/g;
const MARKDOWN_REFERENCE_IMAGE_PATTERN = /!\[[^\]]*\]\s*\[[^\]]*\]/g;
const MARKDOWN_REFERENCE_LINK_PATTERN = /(?<!!)\[([^\]]+)\]\s*\[([^\]]*)\]/g;
const MARKDOWN_SHORTCUT_LINK_PATTERN =
  /(?<!!)(?<!\])\[([^\]]+)\](?!\s*[\[(:])/g;
const MARKDOWN_REFERENCE_DEFINITION_PATTERN =
  /^\s{0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))/gm;
const MARKDOWN_SHORTCUT_IMAGE_PATTERN = /!\[([^\]]+)\](?!\s*[\[(])/g;
const RAW_IMAGE_PATTERN = /<(?:img|EditorialImage)\b/gi;
const HTML_H1_PATTERN = /<h1\b[^>]*>/i;
const CONTENT_IMAGE_PATTERN = /<ContentImage\b([^>]*)\/?>/g;
const CONTENT_IMAGE_BASE_NAME_PATTERN =
  /\bbaseName\s*=\s*["']([a-z0-9]+(?:-[a-z0-9]+)*)["']/;
const SAFE_BODY_LINK_PROTOCOLS = new Set(["https:", "mailto:", "tel:"]);
const STATIC_INTERNAL_PAGE_PATHS = new Set([
  "/",
  "/en",
  "/legal/privacy",
  "/legal/terms-of-use",
  "/en/legal/privacy",
  "/en/legal/terms-of-use",
]);
const PUBLIC_RESOURCE_PREFIXES = [
  "/images",
  "/assets",
  "/fonts",
  "/downloads",
] as const;
const INTERNAL_RESOURCE_PATHS = new Set([
  "/favicon.ico",
  "/icon.svg",
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/opengraph-image",
]);
const PUBLIC_ASSET_EXTENSION_PATTERN =
  /\.(?:avif|webp|png|jpe?g|gif|svg|ico|pdf|txt|xml|json|webmanifest|zip|exe|msi)$/i;
const approvedEnglishPaths = new Set<string>(
  EDITORIAL_ENGLISH_PATH_APPROVALS.paths,
);

function issue(
  document: EditorialDocument,
  code: string,
  message: string,
  field?: string,
): EditorialIssue {
  return {
    severity: "error",
    code,
    message,
    file: document.relativePath,
    field,
  };
}

function expectedRelativePath(document: EditorialDocument): string {
  const { locale, collection, category, slug } = document.frontmatter;
  return `${locale}/${collection}/${category}/${slug}.mdx`;
}

function bodyHeadingIds(document: EditorialDocument): Set<string> {
  return new Set(extractMarkdownHeadingIds(document.source));
}

function normalizeReferenceLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function extractReferenceDefinitions(source: string): Map<string, string> {
  const definitions = new Map<string, string>();
  MARKDOWN_REFERENCE_DEFINITION_PATTERN.lastIndex = 0;
  let definition: RegExpExecArray | null;
  while (
    (definition = MARKDOWN_REFERENCE_DEFINITION_PATTERN.exec(source)) !== null
  ) {
    const label = normalizeReferenceLabel(definition[1]);
    if (!definitions.has(label)) {
      definitions.set(label, definition[2] ?? definition[3]);
    }
  }
  return definitions;
}

export function extractEditorialBodyLinks(source: string): string[] {
  const links = new Set<string>();
  const liveSource = sourceWithoutMarkdownCode(source);
  for (const pattern of [
    MARKDOWN_LINK_PATTERN,
    HTML_LINK_PATTERN,
    MARKDOWN_AUTOLINK_PATTERN,
    GFM_BARE_URL_PATTERN,
  ]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(liveSource)) !== null) {
      links.add(match[1] ?? match[0]);
    }
  }

  const definitions = extractReferenceDefinitions(liveSource);

  for (const pattern of [
    MARKDOWN_REFERENCE_LINK_PATTERN,
    MARKDOWN_SHORTCUT_LINK_PATTERN,
  ]) {
    pattern.lastIndex = 0;
    let reference: RegExpExecArray | null;
    while ((reference = pattern.exec(liveSource)) !== null) {
      const label = normalizeReferenceLabel(reference[2] || reference[1]);
      const href = definitions.get(label);
      if (href) links.add(href);
    }
  }

  return [...links];
}

function validateContentImages(document: EditorialDocument): EditorialIssue[] {
  const issues: EditorialIssue[] = [];
  const source = sourceWithoutMarkdownCode(document.source);

  for (const image of document.frontmatter.images) {
    if (!isApprovedEnglishEditorialAssetPath(image)) {
      issues.push(
        issue(
          document,
          "unapproved-asset-path",
          `asset lacks human approval for its complete path (registry v${EDITORIAL_ENGLISH_ASSET_PATH_APPROVALS.version}): ${image.src} | ${image.originalPath}`,
          "images",
        ),
      );
    }
  }

  if (MARKDOWN_IMAGE_PATTERN.test(source)) {
    issues.push(
      issue(
        document,
        "raw-markdown-image",
        'use <ContentImage baseName="..." /> instead of a Markdown image',
      ),
    );
  }
  MARKDOWN_IMAGE_PATTERN.lastIndex = 0;

  if (MARKDOWN_REFERENCE_IMAGE_PATTERN.test(source)) {
    issues.push(
      issue(
        document,
        "raw-markdown-image",
        'use <ContentImage baseName="..." /> instead of a reference-style Markdown image',
      ),
    );
  }
  MARKDOWN_REFERENCE_IMAGE_PATTERN.lastIndex = 0;

  const referenceDefinitions = extractReferenceDefinitions(source);
  MARKDOWN_SHORTCUT_IMAGE_PATTERN.lastIndex = 0;
  let shortcutImage: RegExpExecArray | null;
  while ((shortcutImage = MARKDOWN_SHORTCUT_IMAGE_PATTERN.exec(source))) {
    if (referenceDefinitions.has(normalizeReferenceLabel(shortcutImage[1]))) {
      issues.push(
        issue(
          document,
          "raw-markdown-image",
          'use <ContentImage baseName="..." /> instead of a shortcut-reference Markdown image',
        ),
      );
      break;
    }
  }
  MARKDOWN_SHORTCUT_IMAGE_PATTERN.lastIndex = 0;

  if (RAW_IMAGE_PATTERN.test(source)) {
    issues.push(
      issue(
        document,
        "raw-image-component",
        "use ContentImage; img and EditorialImage bypass the editorial manifest",
      ),
    );
  }
  RAW_IMAGE_PATTERN.lastIndex = 0;

  const declaredByBaseName = new Map<string, number>();
  for (const image of document.frontmatter.images) {
    declaredByBaseName.set(
      image.baseName,
      (declaredByBaseName.get(image.baseName) ?? 0) + 1,
    );
  }
  for (const [baseName, count] of declaredByBaseName) {
    if (count > 1) {
      issues.push(
        issue(
          document,
          "ambiguous-content-image",
          `images contains multiple entries with baseName ${baseName}`,
          "images",
        ),
      );
    }
  }

  const usageByBaseName = new Map<string, number>();
  let match: RegExpExecArray | null;
  while ((match = CONTENT_IMAGE_PATTERN.exec(source)) !== null) {
    const baseNameMatch = match[1].match(CONTENT_IMAGE_BASE_NAME_PATTERN);
    if (!baseNameMatch) {
      issues.push(
        issue(
          document,
          "invalid-content-image",
          "ContentImage requires a literal English kebab-case baseName",
        ),
      );
      continue;
    }

    const baseName = baseNameMatch[1];
    usageByBaseName.set(baseName, (usageByBaseName.get(baseName) ?? 0) + 1);
    if (!declaredByBaseName.has(baseName)) {
      issues.push(
        issue(
          document,
          "undeclared-content-image",
          `ContentImage is missing from frontmatter.images: ${baseName}`,
        ),
      );
    }
  }
  CONTENT_IMAGE_PATTERN.lastIndex = 0;

  for (const baseName of declaredByBaseName.keys()) {
    const usages = usageByBaseName.get(baseName) ?? 0;
    if (usages === 0) {
      issues.push(
        issue(
          document,
          "unused-content-image",
          `frontmatter.images is unused in the body: ${baseName}`,
          "images",
        ),
      );
    } else if (usages > 1) {
      issues.push(
        issue(
          document,
          "duplicate-content-image-use",
          `ContentImage must appear once: ${baseName} aparece ${usages}`,
        ),
      );
    }
  }

  return issues;
}

function splitHref(href: string): { pathname: string; hash?: string } {
  const hashIndex = href.indexOf("#");
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const queryIndex = withoutHash.indexOf("?");
  return {
    pathname: queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash,
    hash: hashIndex >= 0 ? href.slice(hashIndex + 1) : undefined,
  };
}

function isEditorialPath(pathname: string): boolean {
  return /^\/(?:en\/)?(?:help|guides)(?:\/|$)/.test(pathname);
}

function isEditorialHub(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  const offset = segments[0] === "en" ? 1 : 0;
  const collection = segments[offset];
  if (segments.length === offset + 1) return true;
  if (segments.length !== offset + 2) return false;

  const category = segments[offset + 1];
  return collection === "help"
    ? (HELP_CATEGORIES as readonly string[]).includes(category)
    : collection === "guides"
      ? (GUIDE_CATEGORIES as readonly string[]).includes(category)
      : false;
}

function normalizeAbsolutePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function semanticEditorialPath(href: string): string {
  return href.startsWith("/en/") ? href.slice(3) : href;
}

function isPublicResourcePath(pathname: string): boolean {
  if (PUBLIC_ASSET_EXTENSION_PATTERN.test(pathname)) return true;
  return PUBLIC_RESOURCE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isForbiddenInternalEndpoint(pathname: string): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/_next" ||
    pathname.startsWith("/_next/")
  );
}

export function publicResourcePathFromHref(rawHref: string): string | null {
  if (!rawHref.startsWith("/") || rawHref.startsWith("//")) return null;
  const pathname = normalizeAbsolutePath(splitHref(rawHref).pathname);
  return isPublicResourcePath(pathname) ? pathname : null;
}

function sensitiveInternalQueryKeys(
  document: EditorialDocument,
  rawHref: string,
): string[] {
  try {
    const url = new URL(rawHref, `https://editorial.invalid${document.href}`);
    return url.origin === "https://editorial.invalid"
      ? sensitiveQueryKeys(url)
      : [];
  } catch {
    return [];
  }
}

function validateAbsoluteBodyLink(
  document: EditorialDocument,
  rawHref: string,
): { handled: boolean; issues: EditorialIssue[] } {
  const href = rawHref.trim();
  if (href.startsWith("//")) {
    return {
      handled: true,
      issues: [
        issue(
          document,
          "unsafe-link-scheme",
          `absolute link must declare a safe scheme: ${rawHref}`,
        ),
      ],
    };
  }

  const scheme = href.match(/^([a-z][a-z\d+.-]*):/i)?.[1].toLowerCase();
  if (!scheme) return { handled: false, issues: [] };

  const protocol = `${scheme}:`;
  if (!SAFE_BODY_LINK_PROTOCOLS.has(protocol)) {
    return {
      handled: true,
      issues: [
        issue(
          document,
          "unsafe-link-scheme",
          `link scheme is not allowed: ${protocol}`,
        ),
      ],
    };
  }

  const url = parseAbsoluteUrl(href);
  if (!url || (protocol === "https:" && !/^https:\/\//i.test(href))) {
    return {
      handled: true,
      issues: [
        issue(
          document,
          "invalid-absolute-link",
          `invalid absolute URL: ${rawHref}`,
        ),
      ],
    };
  }

  const issues: EditorialIssue[] = [];
  if (hasUrlUserInfo(url)) {
    issues.push(
      issue(
        document,
        "unsafe-link-credentials",
        `absolute link cannot contain a username or password: ${rawHref}`,
      ),
    );
  }
  const sensitiveKeys = sensitiveQueryKeys(url);
  if (sensitiveKeys.length > 0) {
    issues.push(
      issue(
        document,
        "sensitive-link-query",
        `absolute link contains a sensitive parameter (${sensitiveKeys.join(", ")}): ${rawHref}`,
      ),
    );
  }

  return { handled: true, issues };
}

function resolveRelativeContentLink(
  document: EditorialDocument,
  href: string,
): string | null {
  const { pathname } = splitHref(href);
  if (
    !pathname ||
    pathname.startsWith("/") ||
    /^[a-z][a-z\d+.-]*:/i.test(pathname)
  ) {
    return null;
  }
  if (!pathname.endsWith(".mdx")) return null;

  return path.posix.normalize(
    path.posix.join(path.posix.dirname(document.relativePath), pathname),
  );
}

function validateBodyLinks(
  documents: EditorialDocument[],
  byHref: Map<string, EditorialDocument>,
  byRelativePath: Map<string, EditorialDocument>,
): EditorialIssue[] {
  const issues: EditorialIssue[] = [];

  for (const document of documents) {
    const liveSource = sourceWithoutMarkdownCode(document.source);
    HTML_DYNAMIC_LINK_PATTERN.lastIndex = 0;
    if (HTML_DYNAMIC_LINK_PATTERN.test(liveSource)) {
      issues.push(
        issue(
          document,
          "dynamic-link-href",
          "dynamic href cannot be audited; use a string literal",
        ),
      );
    }
    HTML_DYNAMIC_LINK_PATTERN.lastIndex = 0;

    for (const rawHref of extractEditorialBodyLinks(document.source)) {
      const internalSensitiveKeys = sensitiveInternalQueryKeys(
        document,
        rawHref,
      );
      if (internalSensitiveKeys.length > 0) {
        issues.push(
          issue(
            document,
            "sensitive-link-query",
            `internal link contains a sensitive parameter (${internalSensitiveKeys.join(", ")}): ${rawHref}`,
          ),
        );
        continue;
      }

      if (rawHref.startsWith("#")) {
        const hash = rawHref.slice(1);
        if (hash && !bodyHeadingIds(document).has(hash)) {
          issues.push(
            issue(
              document,
              "broken-anchor",
              `internal anchor does not exist: ${rawHref}`,
            ),
          );
        }
        continue;
      }

      const absoluteLink = validateAbsoluteBodyLink(document, rawHref);
      if (absoluteLink.handled) {
        issues.push(...absoluteLink.issues);
        continue;
      }

      const relativeTarget = resolveRelativeContentLink(document, rawHref);
      if (relativeTarget) {
        const { hash } = splitHref(rawHref);
        const target = byRelativePath.get(relativeTarget);
        if (!target) {
          issues.push(
            issue(
              document,
              "broken-relative-link",
              `file not found: ${rawHref}`,
            ),
          );
        } else if (
          document.frontmatter.status === "published" &&
          target.frontmatter.status !== "published"
        ) {
          issues.push(
            issue(
              document,
              "published-links-to-draft",
              `published content links to a draft: ${rawHref}`,
            ),
          );
        }
        if (target && hash && !bodyHeadingIds(target).has(hash)) {
          issues.push(
            issue(
              document,
              "broken-anchor",
              `editorial anchor does not exist: ${rawHref}`,
            ),
          );
        }
        continue;
      }

      let resolvedHref = rawHref;
      if (!rawHref.startsWith("/")) {
        try {
          const resolved = new URL(
            rawHref,
            `https://editorial.invalid${document.href}`,
          );
          resolvedHref = `${resolved.pathname}${resolved.search}${resolved.hash}`;
        } catch {
          issues.push(
            issue(
              document,
              "unverifiable-relative-link",
              `relative link cannot be verified: ${rawHref}`,
            ),
          );
          continue;
        }
      }

      const split = splitHref(resolvedHref);
      const pathname = normalizeAbsolutePath(split.pathname);
      const { hash } = split;
      if (!pathname.startsWith("/")) continue;
      if (
        STATIC_INTERNAL_PAGE_PATHS.has(pathname) ||
        INTERNAL_RESOURCE_PATHS.has(pathname) ||
        isPublicResourcePath(pathname)
      ) {
        continue;
      }
      if (isForbiddenInternalEndpoint(pathname)) {
        issues.push(
          issue(
            document,
            "disallowed-internal-endpoint",
            `content cannot link to an internal endpoint: ${rawHref}`,
          ),
        );
        continue;
      }
      if (!isEditorialPath(pathname)) {
        issues.push(
          issue(
            document,
            "broken-internal-link",
            `internal URL does not exist: ${rawHref}`,
          ),
        );
        continue;
      }
      if (isEditorialHub(pathname)) continue;

      const target = byHref.get(pathname.replace(/\/$/, ""));
      if (!target) {
        issues.push(
          issue(
            document,
            "broken-editorial-link",
            `editorial URL does not exist: ${rawHref}`,
          ),
        );
        continue;
      }
      if (
        document.frontmatter.status === "published" &&
        target.frontmatter.status !== "published"
      ) {
        issues.push(
          issue(
            document,
            "published-links-to-draft",
            `published content links to a draft: ${rawHref}`,
          ),
        );
      }
      if (hash && !bodyHeadingIds(target).has(hash)) {
        issues.push(
          issue(
            document,
            "broken-anchor",
            `editorial anchor does not exist: ${rawHref}`,
          ),
        );
      }
    }
  }

  return issues;
}

export function validateEditorialCatalog(
  documents: EditorialDocument[],
): EditorialIssue[] {
  const issues: EditorialIssue[] = [];
  const byId = new Map<string, EditorialDocument>();
  const byHref = new Map<string, EditorialDocument>();
  const byRelativePath = new Map<string, EditorialDocument>();
  const translationGroups = new Map<string, EditorialDocument[]>();

  for (const document of documents) {
    const { frontmatter } = document;
    const normalizedPath = document.relativePath.replaceAll("\\", "/");
    byRelativePath.set(normalizedPath, document);

    if (normalizedPath !== expectedRelativePath(document)) {
      issues.push(
        issue(
          document,
          "frontmatter-path-mismatch",
          `file must be located at ${expectedRelativePath(document)}`,
        ),
      );
    }

    if (!approvedEnglishPaths.has(semanticEditorialPath(document.href))) {
      issues.push(
        issue(
          document,
          "unapproved-editorial-path",
          `path lacks human language approval (registry v${EDITORIAL_ENGLISH_PATH_APPROVALS.version}): ${document.href}`,
          "slug",
        ),
      );
    }

    const existingId = byId.get(frontmatter.contentId);
    if (existingId) {
      issues.push(
        issue(
          document,
          "duplicate-content-id",
          `contentId is also used in ${existingId.relativePath}`,
          "contentId",
        ),
      );
    } else {
      byId.set(frontmatter.contentId, document);
    }

    const existingHref = byHref.get(document.href);
    if (existingHref) {
      issues.push(
        issue(
          document,
          "duplicate-href",
          `URL is also used in ${existingHref.relativePath}`,
          "slug",
        ),
      );
    } else {
      byHref.set(document.href, document);
    }

    if (frontmatter.translationKey) {
      const group = translationGroups.get(frontmatter.translationKey) ?? [];
      group.push(document);
      translationGroups.set(frontmatter.translationKey, group);
    }

    const sourceWithoutCode = sourceWithoutMarkdownCode(document.source);
    if (
      countMarkdownHeadings(document.source, 1) > 0 ||
      HTML_H1_PATTERN.test(sourceWithoutCode)
    ) {
      issues.push(
        issue(
          document,
          "body-h1",
          "do not use H1 in MDX; the template renders title as H1",
        ),
      );
    }

    if (
      frontmatter.status === "published" &&
      PLACEHOLDER_PATTERN.test(
        `${JSON.stringify(frontmatter)}\n${document.source}`,
      )
    ) {
      issues.push(
        issue(
          document,
          "published-placeholder",
          "published content contains an editorial placeholder",
        ),
      );
    }

    issues.push(...validateContentImages(document));
  }

  for (const document of documents) {
    const uniqueRelated = new Set<string>();
    for (const relatedId of document.frontmatter.related) {
      if (relatedId === document.frontmatter.contentId) {
        issues.push(
          issue(document, "self-related", "related cannot reference itself"),
        );
        continue;
      }
      if (uniqueRelated.has(relatedId)) {
        issues.push(
          issue(
            document,
            "duplicate-related",
            `duplicate related entry: ${relatedId}`,
          ),
        );
        continue;
      }
      uniqueRelated.add(relatedId);

      const target = byId.get(relatedId);
      if (!target) {
        issues.push(
          issue(
            document,
            "missing-related",
            `related contentId does not exist: ${relatedId}`,
          ),
        );
      } else if (
        document.frontmatter.status === "published" &&
        target.frontmatter.status !== "published"
      ) {
        issues.push(
          issue(
            document,
            "published-related-draft",
            `published content relates to a draft: ${relatedId}`,
          ),
        );
      }
    }
  }

  for (const [translationKey, group] of translationGroups) {
    const perLocale = new Map<string, EditorialDocument>();
    for (const document of group) {
      const existingLocale = perLocale.get(document.frontmatter.locale);
      if (existingLocale) {
        issues.push(
          issue(
            document,
            "duplicate-translation-locale",
            `${translationKey} already has ${document.frontmatter.locale} at ${existingLocale.relativePath}`,
            "translationKey",
          ),
        );
      } else {
        perLocale.set(document.frontmatter.locale, document);
      }
    }

    const published = group.filter(
      (document): document is PublishedEditorialDocument =>
        document.frontmatter.status === "published",
    );
    if (published.length > 0 && published.length !== 2) {
      for (const document of published) {
        issues.push(
          issue(
            document,
            "incomplete-published-translation",
            `translationKey ${translationKey} requires published pt-BR and en versions`,
            "translationKey",
          ),
        );
      }
    }

    if (published.length === 2) {
      const locales = new Set(
        published.map((document) => document.frontmatter.locale),
      );
      const semanticPaths = new Set(
        published.map(
          (document) =>
            `${document.frontmatter.collection}/${document.frontmatter.category}/${document.frontmatter.slug}`,
        ),
      );
      if (
        !locales.has("pt-BR") ||
        !locales.has("en") ||
        semanticPaths.size !== 1
      ) {
        for (const document of published) {
          issues.push(
            issue(
              document,
              "non-reciprocal-translation",
              "published translations must use pt-BR/en and the same semantic path",
              "translationKey",
            ),
          );
        }
      }
    }
  }

  issues.push(...validateBodyLinks(documents, byHref, byRelativePath));
  return issues;
}

export function assertValidEditorialCatalog(
  documents: EditorialDocument[],
): void {
  const errors = validateEditorialCatalog(documents).filter(
    (item) => item.severity === "error",
  );
  if (errors.length === 0) return;

  const details = errors
    .map((item) => `${item.file ?? "content"} [${item.code}] ${item.message}`)
    .join("\n");
  throw new Error(`Invalid editorial catalog:
${details}`);
}
