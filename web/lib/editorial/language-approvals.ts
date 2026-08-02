import {
  EDITORIAL_ENGLISH_ASSET_PATH_APPROVALS,
  type EditorialEnglishAssetPathApproval,
} from "./constants";

export interface EditorialAssetPathIdentity {
  baseName: string;
  src: string;
  originalPath: string;
}

export function isApprovedEnglishEditorialAssetPath(
  asset: EditorialAssetPathIdentity,
  approvals: readonly EditorialEnglishAssetPathApproval[] = EDITORIAL_ENGLISH_ASSET_PATH_APPROVALS.paths,
): boolean {
  return approvals.some(
    (approval) =>
      approval.baseName === asset.baseName &&
      approval.src === asset.src &&
      approval.originalPath === asset.originalPath,
  );
}
