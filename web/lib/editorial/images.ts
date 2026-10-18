import type {
  EditorialAssetManifestEntry,
  EditorialImage,
  EditorialImageReference,
} from "./types";

/** Completes an article's image reference from the asset manifest, the single source of file and provenance. */
export function resolveEditorialImage(
  reference: EditorialImageReference,
  assets: readonly EditorialAssetManifestEntry[],
): EditorialImage | undefined {
  const entry = assets.find((asset) => asset.baseName === reference.baseName);
  const derivative = entry?.derivatives[0];
  if (!entry || !derivative) return undefined;

  const image: Record<string, unknown> = {
    src: derivative.src,
    originalPath: entry.originalPath,
    baseName: entry.baseName,
    alt: reference.alt,
    caption: reference.caption,
    width: derivative.width,
    height: derivative.height,
    kind: entry.kind,
    source: entry.source,
    rights: entry.rights,
    language: entry.language,
    capturedAt: entry.capturedAt,
    productVersion: entry.productVersion,
    sourceVersion: entry.sourceVersion,
    externalUiReviewedAt: entry.externalUiReviewedAt,
    generatedAt: entry.generatedAt,
    generationModel: entry.generationModel,
  };
  for (const key of Object.keys(image)) {
    if (image[key] === undefined) delete image[key];
  }
  return image as EditorialImage;
}
