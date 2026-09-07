import type { EditorialAssetManifestEntry, EditorialImage } from "./types";

export function editorialImageMatchesManifest(
  image: EditorialImage,
  manifestEntry: EditorialAssetManifestEntry,
): boolean {
  const derivative = manifestEntry.derivatives.find(
    (candidate) => candidate.src === image.src,
  );

  return (
    manifestEntry.baseName === image.baseName &&
    manifestEntry.originalPath === image.originalPath &&
    manifestEntry.kind === image.kind &&
    manifestEntry.source === image.source &&
    manifestEntry.rights === image.rights &&
    manifestEntry.language === image.language &&
    manifestEntry.capturedAt === image.capturedAt &&
    manifestEntry.productVersion === image.productVersion &&
    manifestEntry.sourceVersion === image.sourceVersion &&
    manifestEntry.externalUiReviewedAt === image.externalUiReviewedAt &&
    manifestEntry.generatedAt === image.generatedAt &&
    manifestEntry.generationModel === image.generationModel &&
    derivative?.width === image.width &&
    derivative?.height === image.height
  );
}
