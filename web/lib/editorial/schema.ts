import { z } from "zod";
import {
  EDITORIAL_COLLECTIONS,
  EDITORIAL_ASSET_MAX_BYTES,
  EDITORIAL_CATEGORIES,
  EDITORIAL_CONTENT_ID_PATTERN,
  EDITORIAL_IMAGE_KINDS,
  EDITORIAL_IMAGE_LANGUAGES,
  EDITORIAL_IMAGE_RIGHTS,
  EDITORIAL_IMAGE_SOURCES,
  EDITORIAL_INTENTS,
  EDITORIAL_KINDS,
  EDITORIAL_LOCALES,
  EDITORIAL_ORIGINAL_ASSET_PATTERN,
  EDITORIAL_PUBLIC_ASSET_PATTERN,
  EDITORIAL_SOURCE_KINDS,
  LOWERCASE_ASCII_KEBAB_CASE_PATTERN,
  GUIDE_CATEGORIES,
  HELP_CATEGORIES,
  TRANSLATION_KEY_PATTERN,
} from "./constants";
import {
  hasUrlUserInfo,
  parseAbsoluteUrl,
  sensitiveQueryKeys,
} from "./url-security";

const parseYamlDate = (value: unknown) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : value;

export const isoDateSchema = z.preprocess(
  parseYamlDate,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "use a data no formato YYYY-MM-DD")
    .refine((value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().startsWith(value)
      );
    }, "use uma data real"),
);

const httpsUrlSchema = z
  .url("use uma URL absoluta válida")
  .superRefine((value, context) => {
    const url = parseAbsoluteUrl(value);
    if (!url || url.protocol !== "https:") {
      context.addIssue({ code: "custom", message: "use HTTPS" });
      return;
    }
    if (hasUrlUserInfo(url)) {
      context.addIssue({
        code: "custom",
        message: "a URL não pode conter usuário ou senha",
      });
    }
    const sensitiveKeys = sensitiveQueryKeys(url);
    if (sensitiveKeys.length > 0) {
      context.addIssue({
        code: "custom",
        message: `remova parâmetros sensíveis da URL: ${sensitiveKeys.join(", ")}`,
      });
    }
  });

const repositoryPathSchema = z
  .string()
  .min(1)
  .max(240)
  .refine((value) => !value.includes("\\"), "use barras normais")
  .refine(
    (value) => !value.startsWith("/"),
    "use um caminho relativo ao repositório",
  )
  .refine(
    (value) => !value.split("/").includes(".."),
    "o caminho não pode sair do repositório",
  );

export const testedVersionSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    version: z.string().trim().min(1).max(80),
    environment: z.string().trim().min(2).max(120).optional(),
  })
  .strict();

export const editorialSourceSchema = z
  .object({
    title: z.string().trim().min(3).max(180),
    kind: z.enum(EDITORIAL_SOURCE_KINDS),
    url: httpsUrlSchema.optional(),
    repoPath: repositoryPathSchema.optional(),
    reviewedAt: isoDateSchema.optional(),
  })
  .strict()
  .superRefine((source, context) => {
    if (!source.url && !source.repoPath) {
      context.addIssue({
        code: "custom",
        message: "informe url ou repoPath",
        path: ["url"],
      });
    }
    if (source.url && source.repoPath) {
      context.addIssue({
        code: "custom",
        message: "use url ou repoPath, não os dois",
        path: ["url"],
      });
    }
  });

const editorialImageBaseSchema = z
  .object({
    src: z
      .string()
      .regex(
        EDITORIAL_PUBLIC_ASSET_PATTERN,
        "use /images/editorial e nomes lowercase ASCII kebab-case; o idioma exige revisão humana",
      ),
    originalPath: z
      .string()
      .regex(
        EDITORIAL_ORIGINAL_ASSET_PATTERN,
        "use assets/originals e nomes lowercase ASCII kebab-case; o idioma exige revisão humana",
      ),
    baseName: z
      .string()
      .regex(
        LOWERCASE_ASCII_KEBAB_CASE_PATTERN,
        "use um nome lowercase ASCII kebab-case; o idioma exige revisão humana",
      ),
    alt: z.string().trim().min(8).max(240),
    caption: z.string().trim().min(3).max(320).optional(),
    width: z.number().int().positive().max(10_000),
    height: z.number().int().positive().max(10_000),
    kind: z.enum(EDITORIAL_IMAGE_KINDS),
    source: z.enum(EDITORIAL_IMAGE_SOURCES),
    rights: z.enum(EDITORIAL_IMAGE_RIGHTS),
    language: z.enum(EDITORIAL_IMAGE_LANGUAGES),
    capturedAt: isoDateSchema.optional(),
    productVersion: z.string().trim().min(1).max(80).optional(),
    sourceVersion: z.string().trim().min(1).max(80).optional(),
    externalUiReviewedAt: isoDateSchema.optional(),
    generatedAt: isoDateSchema.optional(),
    generationModel: z.string().trim().min(2).max(120).optional(),
  })
  .strict();

export const editorialImageSchema = editorialImageBaseSchema.superRefine(
  (image, context) => {
    const publicFileName = image.src.split("/").at(-1) ?? "";
    const publicBaseName = publicFileName.replace(/\.[^.]+$/, "");
    const originalFileName = image.originalPath.split("/").at(-1) ?? "";
    const originalBaseName = originalFileName.replace(/\.[^.]+$/, "");

    if (
      publicBaseName !== image.baseName ||
      originalBaseName !== image.baseName
    ) {
      context.addIssue({
        code: "custom",
        message:
          "baseName deve ser igual ao nome dos arquivos original e público",
        path: ["baseName"],
      });
    }

    if (image.kind === "screenshot" && !image.capturedAt) {
      context.addIssue({
        code: "custom",
        message: "screenshot precisa de capturedAt",
        path: ["capturedAt"],
      });
    }

    if (
      image.kind === "screenshot" &&
      image.source === "corneta" &&
      !image.productVersion
    ) {
      context.addIssue({
        code: "custom",
        message: "screenshot da Corneta precisa de productVersion",
        path: ["productVersion"],
      });
    }

    if (
      image.kind === "screenshot" &&
      image.source === "obs" &&
      !image.sourceVersion
    ) {
      context.addIssue({
        code: "custom",
        message: "screenshot do OBS precisa de sourceVersion",
        path: ["sourceVersion"],
      });
    }

    if (
      image.kind === "screenshot" &&
      ["obs", "twitch", "youtube", "kick"].includes(image.source) &&
      !image.externalUiReviewedAt
    ) {
      context.addIssue({
        code: "custom",
        message: "screenshot externo precisa de externalUiReviewedAt",
        path: ["externalUiReviewedAt"],
      });
    }

    if (image.kind === "generated") {
      if (image.source !== "generated") {
        context.addIssue({
          code: "custom",
          message: "imagem gerada deve declarar source: generated",
          path: ["source"],
        });
      }
      if (!image.generatedAt || !image.generationModel) {
        context.addIssue({
          code: "custom",
          message: "imagem gerada precisa de generatedAt e generationModel",
          path: ["generationModel"],
        });
      }
    } else if (image.source === "generated") {
      context.addIssue({
        code: "custom",
        message: "source: generated só pode ser usado com kind: generated",
        path: ["source"],
      });
    }
  },
);

const identityShape = {
  contentId: z
    .string()
    .min(3)
    .max(64)
    .regex(
      EDITORIAL_CONTENT_ID_PATTERN,
      "use help_... ou guide_..., com minúsculas, dígitos e underscores",
    ),
  locale: z.enum(EDITORIAL_LOCALES),
  collection: z.enum(EDITORIAL_COLLECTIONS),
  kind: z.enum(EDITORIAL_KINDS),
  category: z.enum(EDITORIAL_CATEGORIES),
  slug: z
    .string()
    .max(100)
    .regex(
      LOWERCASE_ASCII_KEBAB_CASE_PATTERN,
      "use lowercase ASCII kebab-case; o catálogo exige aprovação humana do path em inglês",
    ),
  translationKey: z.string().max(100).regex(TRANSLATION_KEY_PATTERN).optional(),
};

const draftEditorialFrontmatterSchema = z
  .object({
    ...identityShape,
    status: z.literal("draft"),
    title: z.string().trim().min(8).max(140).optional(),
    description: z.string().trim().min(40).max(180).optional(),
    summary: z.string().trim().min(20).max(500).optional(),
    intent: z.enum(EDITORIAL_INTENTS).optional(),
    author: z.string().trim().min(2).max(100).optional(),
    reviewedBy: z.string().trim().min(2).max(100).optional(),
    publishedAt: isoDateSchema.optional(),
    updatedAt: isoDateSchema.optional(),
    productVersion: z.string().trim().min(1).max(80).optional(),
    testedWith: z.array(testedVersionSchema).default([]),
    reviewIntervalDays: z.number().int().min(1).max(730).optional(),
    experimental: z.boolean().default(false),
    primaryQuery: z.string().trim().min(3).max(180).optional(),
    related: z
      .array(z.string().regex(EDITORIAL_CONTENT_ID_PATTERN))
      .default([]),
    sources: z.array(editorialSourceSchema).default([]),
    images: z.array(editorialImageSchema).default([]),
  })
  .strict();

export const publishedEditorialFrontmatterSchema = z
  .object({
    ...identityShape,
    status: z.literal("published"),
    title: z.string().trim().min(8).max(140),
    description: z.string().trim().min(40).max(180),
    summary: z.string().trim().min(20).max(500),
    intent: z.enum(EDITORIAL_INTENTS),
    author: z.string().trim().min(2).max(100),
    reviewedBy: z.string().trim().min(2).max(100),
    publishedAt: isoDateSchema,
    updatedAt: isoDateSchema,
    productVersion: z.string().trim().min(1).max(80),
    testedWith: z.array(testedVersionSchema).min(1),
    reviewIntervalDays: z.number().int().min(1).max(730),
    experimental: z.boolean(),
    primaryQuery: z.string().trim().min(3).max(180),
    related: z.array(z.string().regex(EDITORIAL_CONTENT_ID_PATTERN)),
    sources: z.array(editorialSourceSchema).min(1),
    images: z.array(editorialImageSchema),
  })
  .strict();

export const editorialFrontmatterSchema = z
  .discriminatedUnion("status", [
    draftEditorialFrontmatterSchema,
    publishedEditorialFrontmatterSchema,
  ])
  .superRefine((frontmatter, context) => {
    const allowedCategories =
      frontmatter.collection === "help" ? HELP_CATEGORIES : GUIDE_CATEGORIES;

    if (
      !(allowedCategories as readonly string[]).includes(frontmatter.category)
    ) {
      context.addIssue({
        code: "custom",
        message: `categoria inválida para ${frontmatter.collection}`,
        path: ["category"],
      });
    }

    if (
      (frontmatter.collection === "help" &&
        !frontmatter.contentId.startsWith("help_")) ||
      (frontmatter.collection === "guides" &&
        !frontmatter.contentId.startsWith("guide_"))
    ) {
      context.addIssue({
        code: "custom",
        message: "o prefixo de contentId deve corresponder à coleção",
        path: ["contentId"],
      });
    }

    const validKind =
      (frontmatter.collection === "help" &&
        ["help", "troubleshooting"].includes(frontmatter.kind)) ||
      (frontmatter.collection === "guides" &&
        ["guide", "comparison"].includes(frontmatter.kind));

    if (!validKind) {
      context.addIssue({
        code: "custom",
        message: `kind incompatível com a coleção ${frontmatter.collection}`,
        path: ["kind"],
      });
    }

    if (
      frontmatter.publishedAt &&
      frontmatter.updatedAt &&
      frontmatter.updatedAt < frontmatter.publishedAt
    ) {
      context.addIssue({
        code: "custom",
        message: "updatedAt não pode ser anterior a publishedAt",
        path: ["updatedAt"],
      });
    }

    if (frontmatter.status === "published") {
      frontmatter.sources.forEach((source, index) => {
        if (!source.reviewedAt) {
          context.addIssue({
            code: "custom",
            message: "fonte de conteúdo publicado precisa de reviewedAt",
            path: ["sources", index, "reviewedAt"],
          });
        }
      });
    }

    const seenSources = new Set<string>();
    frontmatter.images.forEach((image, index) => {
      if (seenSources.has(image.src)) {
        context.addIssue({
          code: "custom",
          message: "o mesmo asset foi declarado mais de uma vez",
          path: ["images", index, "src"],
        });
      }
      seenSources.add(image.src);
    });
  });

export const editorialAssetManifestEntrySchema = z
  .object({
    baseName: z.string().regex(LOWERCASE_ASCII_KEBAB_CASE_PATTERN),
    originalPath: z.string().regex(EDITORIAL_ORIGINAL_ASSET_PATTERN),
    derivatives: z
      .array(
        z
          .object({
            src: z.string().regex(EDITORIAL_PUBLIC_ASSET_PATTERN),
            width: z.number().int().positive().max(10_000),
            height: z.number().int().positive().max(10_000),
            bytes: z.number().int().positive().max(EDITORIAL_ASSET_MAX_BYTES),
          })
          .strict(),
      )
      .min(1),
    kind: z.enum(EDITORIAL_IMAGE_KINDS),
    source: z.enum(EDITORIAL_IMAGE_SOURCES),
    rights: z.enum(EDITORIAL_IMAGE_RIGHTS),
    language: z.enum(EDITORIAL_IMAGE_LANGUAGES),
    capturedAt: isoDateSchema.optional(),
    productVersion: z.string().trim().min(1).max(80).optional(),
    sourceVersion: z.string().trim().min(1).max(80).optional(),
    externalUiReviewedAt: isoDateSchema.optional(),
    generatedAt: isoDateSchema.optional(),
    generationModel: z.string().trim().min(2).max(120).optional(),
  })
  .strict()
  .superRefine((entry, context) => {
    const originalBaseName = (
      entry.originalPath.split("/").at(-1) ?? ""
    ).replace(/\.[^.]+$/, "");
    if (originalBaseName !== entry.baseName) {
      context.addIssue({
        code: "custom",
        message: "baseName deve ser igual ao nome do master",
        path: ["originalPath"],
      });
    }
    entry.derivatives.forEach((derivative, index) => {
      const derivativeBaseName = (
        derivative.src.split("/").at(-1) ?? ""
      ).replace(/\.[^.]+$/, "");
      if (derivativeBaseName !== entry.baseName) {
        context.addIssue({
          code: "custom",
          message: "baseName deve ser igual ao nome da derivada",
          path: ["derivatives", index, "src"],
        });
      }
    });

    if (entry.kind === "screenshot" && !entry.capturedAt) {
      context.addIssue({
        code: "custom",
        message: "screenshot precisa de capturedAt",
        path: ["capturedAt"],
      });
    }
    if (
      entry.kind === "screenshot" &&
      entry.source === "corneta" &&
      !entry.productVersion
    ) {
      context.addIssue({
        code: "custom",
        message: "screenshot da Corneta precisa de productVersion",
        path: ["productVersion"],
      });
    }
    if (
      entry.kind === "screenshot" &&
      entry.source === "obs" &&
      !entry.sourceVersion
    ) {
      context.addIssue({
        code: "custom",
        message: "screenshot do OBS precisa de sourceVersion",
        path: ["sourceVersion"],
      });
    }
    if (
      entry.kind === "screenshot" &&
      ["obs", "twitch", "youtube", "kick"].includes(entry.source) &&
      !entry.externalUiReviewedAt
    ) {
      context.addIssue({
        code: "custom",
        message: "screenshot externo precisa de externalUiReviewedAt",
        path: ["externalUiReviewedAt"],
      });
    }
    if (entry.kind === "generated") {
      if (entry.source !== "generated") {
        context.addIssue({
          code: "custom",
          message: "imagem gerada deve declarar source: generated",
          path: ["source"],
        });
      }
      if (!entry.generatedAt || !entry.generationModel) {
        context.addIssue({
          code: "custom",
          message: "imagem gerada precisa de generatedAt e generationModel",
          path: ["generationModel"],
        });
      }
    } else if (entry.source === "generated") {
      context.addIssue({
        code: "custom",
        message: "source: generated só pode ser usado com kind: generated",
        path: ["source"],
      });
    }
  });

export const editorialAssetManifestSchema = z
  .object({
    version: z.literal(1),
    assets: z.array(editorialAssetManifestEntrySchema),
  })
  .strict();

export const editorialPeopleRegistrySchema = z
  .object({
    version: z.literal(1),
    people: z
      .array(
        z
          .object({
            name: z.string().trim().min(2).max(100),
            role: z.string().trim().min(2).max(120),
            type: z.enum(["person", "organization"]),
            url: httpsUrlSchema.optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export type EditorialFrontmatterInput = z.input<
  typeof editorialFrontmatterSchema
>;
