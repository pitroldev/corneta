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

/**
 * Componentes autorizados no documento atual. `ContentImage` aceita somente
 * um baseName declarado no frontmatter: o autor do MDX nunca controla src,
 * dimensões, alt, legenda ou proveniência pelo corpo do artigo.
 */
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
        `ContentImage referencia asset não declarado no frontmatter: ${baseName ?? "ausente"}`,
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
