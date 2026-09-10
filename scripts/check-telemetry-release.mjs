import { appendFileSync } from "node:fs";
import { checkTelemetryRelease } from "./telemetry-release-gate.mjs";

const EXPECTED_NOTICE_VERSION = "2026-09-09";
const args = process.argv.slice(2);
if (
  new Set(args).size !== args.length ||
  args.some(
    (arg) => !["--wait-for-deployment", "--github-output"].includes(arg),
  ) ||
  (args.includes("--github-output") && !process.env.GITHUB_OUTPUT)
) {
  console.error(
    "Usage: pnpm telemetry:release:check [--wait-for-deployment] [--github-output]",
  );
  process.exitCode = 1;
} else {
  const result = await checkTelemetryRelease(process.env, {
    noticeVersion: EXPECTED_NOTICE_VERSION,
    waitMs: args.includes("--wait-for-deployment") ? 10 * 60_000 : 0,
    onRetry: () =>
      console.log(
        "Waiting for the tagged production deployment; release remains blocked.",
      ),
  });
  if (result.errors.length) {
    console.error(`Release blocked:\n- ${result.errors.join("\n- ")}`);
    process.exitCode = 1;
  } else {
    if (args.includes("--github-output")) {
      const configuration = {
        disabled: result.disabled,
        buildSha: result.buildSha,
        tokenDigest: result.tokenDigest,
        noticeVersion: EXPECTED_NOTICE_VERSION,
      };
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `configuration=${JSON.stringify(configuration)}\n`,
        "utf8",
      );
    }
    console.log(
      `Gate passed: desktop/site/API configuration and release SHA match; notice ${EXPECTED_NOTICE_VERSION} is declared; telemetry ${result.disabled ? "disabled" : "active in the US region"}.`,
    );
  }
}
