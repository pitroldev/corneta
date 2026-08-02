import type { z } from "zod";
import type {
  editorialFrontmatterSchema,
  editorialAssetManifestEntrySchema,
  editorialAssetManifestSchema,
  editorialImageSchema,
  editorialPeopleRegistrySchema,
  editorialSourceSchema,
  publishedEditorialFrontmatterSchema,
  testedVersionSchema,
} from "./schema";

export type EditorialLocale = "pt-BR" | "en";
export type EditorialCollection = "help" | "guides";
export type EditorialKind = "guide" | "help" | "comparison" | "troubleshooting";
export type EditorialStatus = "draft" | "published";
export type EditorialCategory =
  | "getting-started"
  | "streaming-software"
  | "platforms"
  | "quality"
  | "chat-and-alerts"
  | "reports-and-data"
  | "troubleshooting"
  | "multistream"
  | "operations"
  | "security"
  | "comparisons";

export type EditorialImage = z.infer<typeof editorialImageSchema>;
export type EditorialAssetManifestEntry = z.infer<
  typeof editorialAssetManifestEntrySchema
>;
export type EditorialAssetManifest = z.infer<
  typeof editorialAssetManifestSchema
>;
export type EditorialPeopleRegistry = z.infer<
  typeof editorialPeopleRegistrySchema
>;
export type EditorialPerson = EditorialPeopleRegistry["people"][number];
export type EditorialSource = z.infer<typeof editorialSourceSchema>;
export type TestedVersion = z.infer<typeof testedVersionSchema>;
export type EditorialFrontmatter = z.infer<typeof editorialFrontmatterSchema>;
export type PublishedEditorialFrontmatter = z.infer<
  typeof publishedEditorialFrontmatterSchema
>;

export type TocLevel = 2 | 3;

export interface TocItem {
  id: string;
  title: string;
  level: TocLevel;
  children: TocItem[];
}

export interface ReadingTime {
  words: number;
  minutes: number;
  label: string;
}

export interface EditorialRouteKey {
  locale: EditorialLocale;
  collection: EditorialCollection;
  category: EditorialCategory;
  slug: string;
}

export interface EditorialDocument<
  TFrontmatter extends EditorialFrontmatter = EditorialFrontmatter,
> {
  frontmatter: TFrontmatter;
  source: string;
  toc: TocItem[];
  readingTime: ReadingTime;
  relativePath: string;
  href: string;
}

export type PublishedEditorialDocument =
  EditorialDocument<PublishedEditorialFrontmatter>;

export interface EditorialListOptions {
  locale?: EditorialLocale;
  collection?: EditorialCollection;
  category?: EditorialCategory;
}

export interface EditorialIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  file?: string;
  field?: string;
}

export type EditorialAlternates = Partial<Record<EditorialLocale, string>>;

export interface EditorialAuditOptions {
  contentRoot: string;
  publicRoot: string;
  repositoryRoot?: string;
}

export interface EditorialAuditResult {
  documents: EditorialDocument[];
  issues: EditorialIssue[];
  errorCount: number;
  warningCount: number;
}
