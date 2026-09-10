import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  collectReleaseReadiness,
  evaluateReleaseReadiness,
} from "./release-readiness.mjs";

const args = process.argv.slice(2);
if (
  args.length &&
  !(
    args.length === 2 &&
    args[0] === "--repo" &&
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(args[1])
  )
) {
  console.error(
    "Usage: node scripts/check-release-readiness.mjs [--repo OWNER/REPOSITORY]",
  );
  process.exitCode = 1;
} else {
  let manifest;
  try {
    manifest = JSON.parse(
      readFileSync(
        resolve(import.meta.dirname, "../compliance/ffmpeg-sources.json"),
        "utf8",
      ),
    );
  } catch {
    manifest = null;
  }
  try {
    const snapshot = await collectReleaseReadiness(
      args[1] ?? "pitroldev/corneta",
    );
    const report = evaluateReleaseReadiness(snapshot, manifest);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.configurationReady ? 0 : 1;
  } catch {
    console.error(
      JSON.stringify({
        code: "READINESS_CHECK_FAILED",
        configurationReady: false,
        publicationVerified: false,
      }),
    );
    process.exitCode = 1;
  }
}
