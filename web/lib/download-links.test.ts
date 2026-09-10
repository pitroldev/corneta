import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const sourcePaths = [
  "../app/_sections/hero.tsx",
  "../app/_sections/closing.tsx",
  "../app/(site)/[locale]/page.tsx",
  "../app/_components/editorial/editorial-chrome.tsx",
] as const;

const sources = sourcePaths.map((path) =>
  ts.createSourceFile(
    path,
    readFileSync(new URL(path, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  ),
);

function elements(source: ts.SourceFile) {
  const result: ts.JsxOpeningLikeElement[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      result.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}

function attribute(element: ts.JsxOpeningLikeElement, name: string) {
  const value = element.attributes.properties.find(
    (node): node is ts.JsxAttribute =>
      ts.isJsxAttribute(node) && node.name.getText() === name,
  )?.initializer;
  if (!value) return undefined;
  if (ts.isStringLiteral(value)) return value.text;
  return ts.isJsxExpression(value) ? value.expression?.getText() : undefined;
}

describe("website download links", () => {
  it("uses ordinary anchors with the shared endpoint for every download link", () => {
    const downloads = sources.flatMap(elements).filter((element) => {
      const cta = attribute(element, "data-telemetry-cta");
      return cta === "ctaId" || cta?.endsWith("_download");
    });
    expect(
      downloads.map((element) => attribute(element, "data-telemetry-cta")),
    ).toEqual(["ctaId", "faq_download", "footer_download"]);

    for (const element of downloads) {
      expect(element.tagName.getText()).toBe("a");
      expect(attribute(element, "href")).toBe("DOWNLOAD_PATH");
      expect(element.attributes.properties.every(ts.isJsxAttribute)).toBe(true);
      for (const name of [
        "onClick",
        "onMouseEnter",
        "onPointerEnter",
        "prefetch",
        "data-placeholder-link",
      ]) {
        expect(attribute(element, name)).toBeUndefined();
      }
    }
  });

  it("shares the same button across the header, hero and final call to action", () => {
    const buttons = sources
      .flatMap(elements)
      .filter((element) => element.tagName.getText() === "DownloadButton");
    expect(buttons.map((element) => attribute(element, "ctaId"))).toEqual([
      "header_download",
      "hero_download",
      "final_download",
    ]);
  });

  it("does not override download destinations in either page or editorial chrome", () => {
    const footers = sources
      .flatMap(elements)
      .filter((element) => element.tagName.getText() === "SiteFooter");
    expect(footers).toHaveLength(2);
    for (const source of sources) {
      expect(source.text).not.toContain("NEXT_PUBLIC_PRIMARY_CTA_URL");
      for (const element of elements(source)) {
        expect(attribute(element, "downloadUrl")).toBeUndefined();
      }
    }
  });
});
