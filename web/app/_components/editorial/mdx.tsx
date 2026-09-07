import { EditorialCallout } from "./article";
import { EditorialImage } from "./editorial-image";
import { UploadCalculator } from "./upload-calculator";
import type { EditorialImage as EditorialImageData } from "@/lib/editorial/types";

export interface EditorialMdxImagePresentation {
  source: string;
  version?: string;
  zoomLabel: string;
  zoomCloseLabel: string;
  zoomInLabel: string;
  zoomOutLabel: string;
  zoomFitLabel: string;
}

// Images must come from validated frontmatter, not arbitrary MDX sources or dimensions.
export function createEditorialMdxComponents({
  images,
  imagePresentation,
}: {
  images: readonly EditorialImageData[];
  imagePresentation: (
    image: EditorialImageData,
  ) => EditorialMdxImagePresentation;
}) {
  const imagesByBaseName = new Map(
    images.map((image) => [image.baseName, image] as const),
  );

  function ContentImage({ baseName }: { baseName?: string }) {
    const image = baseName ? imagesByBaseName.get(baseName) : undefined;
    if (!image) {
      throw new Error(
        `ContentImage references an asset not declared in frontmatter: ${baseName ?? "missing"}`,
      );
    }
    const presentation = imagePresentation(image);

    return (
      <EditorialImage
        src={image.src}
        alt={image.alt}
        width={image.width}
        height={image.height}
        caption={image.caption}
        source={presentation.source}
        version={presentation.version}
        zoomLabel={presentation.zoomLabel}
        zoomCloseLabel={presentation.zoomCloseLabel}
        zoomInLabel={presentation.zoomInLabel}
        zoomOutLabel={presentation.zoomOutLabel}
        zoomFitLabel={presentation.zoomFitLabel}
      />
    );
  }

  return {
    Callout: EditorialCallout,
    ContentImage,
    UploadCalculator,
  };
}
