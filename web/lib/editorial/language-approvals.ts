import { EDITORIAL_ENGLISH_ASSET_PATH_APPROVALS } from "./constants";

export interface EditorialAssetPathIdentity {
  baseName: string;
  src: string;
  originalPath: string;
}

const PUBLIC_ASSET_PATH = /^\/images\/editorial\/(.+)\/([^/]+)\.[a-z0-9]+$/;
const ORIGINAL_ASSET_PATH = /^assets\/originals\/(.+)\/([^/]+)\.[a-z0-9]+$/;

/** A human approves the public path; the original must sit in the same directories under the same baseName. */
export function isApprovedEnglishEditorialAssetPath(
  asset: EditorialAssetPathIdentity,
  approvals: readonly string[] = EDITORIAL_ENGLISH_ASSET_PATH_APPROVALS.paths,
): boolean {
  const publicPath = PUBLIC_ASSET_PATH.exec(asset.src);
  const originalPath = ORIGINAL_ASSET_PATH.exec(asset.originalPath);
  return (
    approvals.includes(asset.src) &&
    publicPath !== null &&
    originalPath !== null &&
    publicPath[1] === originalPath[1] &&
    publicPath[2] === asset.baseName &&
    originalPath[2] === asset.baseName
  );
}
