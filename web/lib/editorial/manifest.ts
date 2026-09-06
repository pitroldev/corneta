import { createHash } from "node:crypto";
import { assertValidEditorialCatalog } from "./catalog";
import type { EditorialDocument, PublishedEditorialDocument } from "./types";

export const EDITORIAL_MANIFEST_VERSION = 1;

export function createEditorialManifest(documents: EditorialDocument[]) {
  assertValidEditorialCatalog(documents);
  const published = documents.filter(
    (document): document is PublishedEditorialDocument =>
      document.frontmatter.status === "published",
  );
  const serialized = JSON.stringify(published);
  return {
    version: EDITORIAL_MANIFEST_VERSION,
    sha256: createHash("sha256").update(serialized).digest("hex"),
    documents: published,
  };
}

export function readEditorialManifest(
  source: string,
): PublishedEditorialDocument[] {
  const manifest = JSON.parse(source) as ReturnType<
    typeof createEditorialManifest
  >;
  if (
    manifest.version !== EDITORIAL_MANIFEST_VERSION ||
    !Array.isArray(manifest.documents)
  )
    throw new Error("Invalid editorial manifest version");
  if (
    createHash("sha256")
      .update(JSON.stringify(manifest.documents))
      .digest("hex") !== manifest.sha256
  )
    throw new Error("Invalid editorial manifest digest");
  if (
    manifest.documents.some(
      (document) => document.frontmatter.status !== "published",
    )
  )
    throw new Error("Unpublished document in public manifest");
  assertValidEditorialCatalog(manifest.documents);
  return manifest.documents;
}
