import { afterEach, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { mergeEnvironment } from "./with-env.mjs";
import { detectedSecretNames, dotenvSecretValues } from "./bundle-secrets.mjs";
const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (dirname(directory) !== tmpdir())
      throw new Error("Invalid test cleanup");
    rmSync(directory, { recursive: true, force: true });
  }
});
it.each([
  "export PRIVATE_VALUE=synthetic_abcdefghijklmnop",
  "PRIVATE_VALUE=synthetic_abcdefghijklmnop # explanation",
  'PRIVATE_VALUE="synthetic_first_line\nsynthetic_second_line"',
  "PRIVATE_VALUE='synthetic_hash#equals=value'",
  "PRIVATE_VALUE='synthetic_with_\"quotes\"'",
])(
  "detects the launcher's effective value in a temporary artifact: %s",
  (source) => {
    const directory = mkdtempSync(join(tmpdir(), "corneta-bundle-parser-"));
    directories.push(directory);
    const value = mergeEnvironment(source, {}).env.PRIVATE_VALUE;
    const artifact = join(directory, "artifact.bin");
    writeFileSync(
      artifact,
      Buffer.concat([Buffer.from("fixture:"), Buffer.from(value)]),
    );
    expect(
      detectedSecretNames(readFileSync(artifact), dotenvSecretValues(source)),
    ).toEqual(["PRIVATE_VALUE"]);
  },
);
it("preserves inherited empty values and scans historical comments separately", () => {
  const source =
    '# export OLD_VALUE="synthetic_historical\n# continued_value"\nPRIVATE_VALUE=synthetic_new_value\nEMPTY=""';
  expect(mergeEnvironment(source, { PRIVATE_VALUE: "" }).env).toEqual({
    PRIVATE_VALUE: "",
    EMPTY: "",
  });
  const secrets = dotenvSecretValues(source);
  expect(
    detectedSecretNames(
      Buffer.from("synthetic_historical\ncontinued_value"),
      secrets,
    ),
  ).toEqual(["OLD_VALUE"]);
  expect(secrets.some((entry) => entry.name === "EMPTY")).toBe(false);
});
it("does not treat a private URL as public, or include explicitly public identities", () => {
  const source =
    "PRIVATE_VALUE=https://example.invalid/synthetic-secret\nVITE_POSTHOG_HOST=https://public.example.invalid";
  expect(dotenvSecretValues(source).map((entry) => entry.name)).toEqual([
    "PRIVATE_VALUE",
  ]);
});
