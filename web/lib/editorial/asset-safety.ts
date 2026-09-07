import { SaxesParser } from "saxes";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";

const PASSIVE_SVG_ELEMENTS = new Set([
  "circle",
  "clipPath",
  "defs",
  "desc",
  "ellipse",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feDisplacementMap",
  "feDistantLight",
  "feDropShadow",
  "feFlood",
  "feFuncA",
  "feFuncB",
  "feFuncG",
  "feFuncR",
  "feGaussianBlur",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "fePointLight",
  "feSpecularLighting",
  "feSpotLight",
  "feTile",
  "feTurbulence",
  "filter",
  "g",
  "line",
  "linearGradient",
  "marker",
  "mask",
  "path",
  "pattern",
  "polygon",
  "polyline",
  "radialGradient",
  "rect",
  "stop",
  "svg",
  "symbol",
  "text",
  "title",
  "tspan",
]);

const PASSIVE_SVG_ATTRIBUTES = new Set([
  "alignment-baseline",
  "aria-describedby",
  "aria-hidden",
  "aria-label",
  "aria-labelledby",
  "azimuth",
  "baseFrequency",
  "baseline-shift",
  "bias",
  "clip-path",
  "clip-rule",
  "clipPathUnits",
  "color",
  "color-interpolation",
  "color-interpolation-filters",
  "cx",
  "cy",
  "d",
  "diffuseConstant",
  "divisor",
  "dominant-baseline",
  "dx",
  "dy",
  "edgeMode",
  "elevation",
  "fill",
  "fill-opacity",
  "fill-rule",
  "filter",
  "filterUnits",
  "flood-color",
  "flood-opacity",
  "font-family",
  "font-size",
  "font-stretch",
  "font-style",
  "font-weight",
  "fr",
  "fx",
  "fy",
  "gradientTransform",
  "gradientUnits",
  "height",
  "id",
  "in",
  "in2",
  "k1",
  "k2",
  "k3",
  "k4",
  "kernelMatrix",
  "kernelUnitLength",
  "lengthAdjust",
  "letter-spacing",
  "lighting-color",
  "limitingConeAngle",
  "marker-end",
  "marker-mid",
  "marker-start",
  "markerHeight",
  "markerUnits",
  "markerWidth",
  "mask",
  "maskContentUnits",
  "maskUnits",
  "mode",
  "numOctaves",
  "offset",
  "opacity",
  "operator",
  "order",
  "orient",
  "overflow",
  "paint-order",
  "pathLength",
  "patternContentUnits",
  "patternTransform",
  "patternUnits",
  "points",
  "preserveAlpha",
  "preserveAspectRatio",
  "primitiveUnits",
  "r",
  "radius",
  "refX",
  "refY",
  "result",
  "role",
  "rotate",
  "rx",
  "ry",
  "scale",
  "seed",
  "shape-rendering",
  "specularConstant",
  "specularExponent",
  "spreadMethod",
  "stdDeviation",
  "stitchTiles",
  "stop-color",
  "stop-opacity",
  "stroke",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-opacity",
  "stroke-width",
  "surfaceScale",
  "targetX",
  "targetY",
  "text-anchor",
  "text-rendering",
  "textLength",
  "transform",
  "type",
  "values",
  "vector-effect",
  "version",
  "viewBox",
  "width",
  "word-spacing",
  "x",
  "x1",
  "x2",
  "xChannelSelector",
  "y",
  "y1",
  "y2",
  "yChannelSelector",
]);

const INTERNAL_FRAGMENT_ATTRIBUTES = new Set([
  "clip-path",
  "fill",
  "filter",
  "marker-end",
  "marker-mid",
  "marker-start",
  "mask",
  "stroke",
]);

const INTERNAL_FRAGMENT_URL = /^url\(\s*#[A-Za-z_][A-Za-z0-9_.:-]*\s*\)$/;
const URI_OR_ACTIVE_VALUE =
  /(?:\b(?:data|file|ftp|https?|javascript|vbscript)\s*:|^\s*\/\/|@import\b|expression\s*\()/i;
const INVISIBLE_TEXT = /[\s\u00a0\u200b-\u200f\u2060\ufeff]/gu;

export interface EditorialAssetSafetyFinding {
  code:
    | "invalid-svg"
    | "unsafe-svg-content"
    | "inaccessible-svg-title"
    | "inaccessible-svg-description";
  message: string;
}

interface InspectableImageMetadata {
  format: string;
  compression?: string;
  orientation?: number;
  hasProfile?: boolean;
  exif?: Uint8Array;
  icc?: Uint8Array;
  iptc?: Uint8Array;
  xmp?: Uint8Array;
  xmpAsString?: string;
  tifftagPhotoshop?: Uint8Array;
  comments?: readonly unknown[];
}

function hasBytes(value: Uint8Array | undefined): boolean {
  return value !== undefined && value.byteLength > 0;
}

function hasReadableText(value: string): boolean {
  return value.replace(INVISIBLE_TEXT, "").length > 0;
}

function pushUniqueFinding(
  findings: EditorialAssetSafetyFinding[],
  finding: EditorialAssetSafetyFinding,
): void {
  if (
    !findings.some(
      (candidate) =>
        candidate.code === finding.code &&
        candidate.message === finding.message,
    )
  ) {
    findings.push(finding);
  }
}

// Parse a strict passive XML allowlist; a blocklist cannot cover every active SVG feature.
export function inspectPublicEditorialSvg(
  source: string,
): EditorialAssetSafetyFinding[] {
  const findings: EditorialAssetSafetyFinding[] = [];
  const parser = new SaxesParser({ xmlns: true, fragment: false });
  const stack: string[] = [];
  let rootSeen = false;
  let directTitleCount = 0;
  let directDescriptionCount = 0;
  let titleText = "";
  let descriptionText = "";

  const unsafe = (message: string) =>
    pushUniqueFinding(findings, {
      code: "unsafe-svg-content",
      message,
    });

  parser.on("doctype", () => unsafe("DOCTYPE/ENTITY is not allowed"));
  parser.on("processinginstruction", () =>
    unsafe("processing instructions are not allowed"),
  );

  parser.on("opentag", (tag) => {
    const parent = stack.at(-1);
    const localName = tag.local;

    if (!rootSeen) {
      rootSeen = true;
      if (localName !== "svg" || tag.uri !== SVG_NAMESPACE) {
        unsafe("the root element must be svg in the official SVG namespace");
      }
    } else if (tag.uri !== SVG_NAMESPACE) {
      unsafe(`namespace not allowed on <${tag.name}>`);
    }

    if (!PASSIVE_SVG_ELEMENTS.has(localName)) {
      unsafe(`active or unknown element not allowed: <${tag.name}>`);
    }

    if (parent === "title" || parent === "desc") {
      unsafe(`<${parent}> must contain text only`);
    }

    if (parent === "svg" && localName === "title") directTitleCount += 1;
    if (parent === "svg" && localName === "desc") {
      directDescriptionCount += 1;
    }

    for (const attribute of Object.values(tag.attributes)) {
      const isDefaultSvgNamespace =
        attribute.name === "xmlns" &&
        attribute.uri === XMLNS_NAMESPACE &&
        attribute.value === SVG_NAMESPACE;
      const isXmlSpace =
        attribute.local === "space" &&
        attribute.uri === XML_NAMESPACE &&
        ["default", "preserve"].includes(attribute.value);

      if (isDefaultSvgNamespace || isXmlSpace) continue;

      if (
        attribute.uri !== "" ||
        !PASSIVE_SVG_ATTRIBUTES.has(attribute.local)
      ) {
        unsafe(`active or unknown attribute not allowed: ${attribute.name}`);
        continue;
      }

      if (URI_OR_ACTIVE_VALUE.test(attribute.value)) {
        unsafe(`active or external value not allowed in ${attribute.name}`);
      }

      if (/\burl\s*\(/i.test(attribute.value)) {
        if (
          !INTERNAL_FRAGMENT_ATTRIBUTES.has(attribute.local) ||
          !INTERNAL_FRAGMENT_URL.test(attribute.value)
        ) {
          unsafe(`external reference not allowed in ${attribute.name}`);
        }
      }
    }

    stack.push(localName);
  });

  const appendAccessibleText = (text: string) => {
    if (stack.length === 2 && stack[0] === "svg" && stack[1] === "title") {
      titleText += text;
    }
    if (stack.length === 2 && stack[0] === "svg" && stack[1] === "desc") {
      descriptionText += text;
    }
  };
  parser.on("text", appendAccessibleText);
  parser.on("cdata", appendAccessibleText);
  parser.on("closetag", () => {
    stack.pop();
  });

  try {
    parser.write(source).close();
  } catch (error) {
    findings.push({
      code: "invalid-svg",
      message: `SVG is not valid XML: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }

  if (directTitleCount !== 1 || !hasReadableText(titleText)) {
    findings.push({
      code: "inaccessible-svg-title",
      message: "public SVG requires exactly one nonempty direct <title>",
    });
  }
  if (directDescriptionCount !== 1 || !hasReadableText(descriptionText)) {
    findings.push({
      code: "inaccessible-svg-description",
      message: "public SVG requires exactly one nonempty direct <desc>",
    });
  }

  return findings;
}

export function embeddedRasterMetadata(
  metadata: InspectableImageMetadata,
): string[] {
  const embedded = new Set<string>();
  if (hasBytes(metadata.exif) || metadata.orientation !== undefined) {
    embedded.add("EXIF");
  }
  if (hasBytes(metadata.icc) || metadata.hasProfile === true) {
    embedded.add("ICC");
  }
  if (hasBytes(metadata.iptc)) embedded.add("IPTC");
  if (hasBytes(metadata.xmp) || metadata.xmpAsString) embedded.add("XMP");
  if (hasBytes(metadata.tifftagPhotoshop)) {
    embedded.add("TIFFTAG_PHOTOSHOP");
  }
  if (metadata.comments && metadata.comments.length > 0) {
    embedded.add("comments");
  }
  return [...embedded];
}

export function imageFormatMatchesExtension(
  filePath: string,
  metadata: Pick<InspectableImageMetadata, "format" | "compression">,
): boolean {
  const extension = filePath.split(".").at(-1)?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") {
    return metadata.format === "jpeg";
  }
  if (extension === "avif") {
    return metadata.format === "heif" && metadata.compression === "av1";
  }
  return metadata.format === extension;
}
