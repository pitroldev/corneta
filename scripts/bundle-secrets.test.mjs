import { afterEach, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { mergeEnvironment } from "./with-env.mjs";
import {
  containsPemPrivateKey,
  detectedSecretNames,
  dotenvSecretValues,
} from "./bundle-secrets.mjs";
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

const syntheticBody = Buffer.from(
  "Synthetic test input, not a private key.",
).toString("base64");
const begin = (label) => `-----BEGIN ${label}-----`;
const end = (label) => `-----END ${label}-----`;
const pem = (label, body = syntheticBody) =>
  `${begin(label)}\n${body}\n${end(label)}`;

it.each([
  "PRIVATE KEY",
  "RSA PRIVATE KEY",
  "EC PRIVATE KEY",
  "DSA PRIVATE KEY",
  "ENCRYPTED PRIVATE KEY",
  "OPENSSH PRIVATE KEY",
])("detects synthetic PEM payloads labeled %s", (label) => {
  expect(containsPemPrivateKey(Buffer.from(pem(label)))).toBe(true);
});

it("detects truncated and multiline payloads without requiring a valid key or footer", () => {
  const payload = syntheticBody.slice(0, 32);
  expect(
    containsPemPrivateKey(Buffer.from(`${begin("PRIVATE KEY")}\n${payload}`)),
  ).toBe(true);
  expect(
    containsPemPrivateKey(
      Buffer.from(
        `${begin("PRIVATE KEY")}\n${payload.slice(0, 16)}\n${payload.slice(16)}\0`,
      ),
    ),
  ).toBe(true);
  expect(
    containsPemPrivateKey(
      Buffer.from(`${begin("PRIVATE KEY")}\n${payload.slice(0, 31)}`),
    ),
  ).toBe(false);
});

it("accepts traditional encrypted PEM metadata before the payload", () => {
  const metadata =
    "Proc-Type: 4,ENCRYPTED\nDEK-Info: AES-128-CBC,00000000000000000000000000000000\n\n";
  expect(
    containsPemPrivateKey(
      Buffer.from(pem("RSA PRIVATE KEY", metadata + syntheticBody)),
    ),
  ).toBe(true);
  expect(
    containsPemPrivateKey(Buffer.from(pem("RSA PRIVATE KEY", metadata))),
  ).toBe(false);
});

it.each([
  ["CRLF", (value) => value.replaceAll("\n", "\r\n")],
  ["escaped LF", (value) => JSON.stringify(value)],
  ["escaped CRLF", (value) => JSON.stringify(value.replaceAll("\n", "\r\n"))],
])("detects a PEM payload in %s source representation", (_name, encode) => {
  expect(containsPemPrivateKey(Buffer.from(encode(pem("PRIVATE KEY"))))).toBe(
    true,
  );
});

it("ignores header-only and NUL-terminated parser literals, even with a separate footer", () => {
  for (const label of [
    "RSA PRIVATE KEY",
    "EC PRIVATE KEY",
    "OPENSSH PRIVATE KEY",
  ]) {
    expect(containsPemPrivateKey(Buffer.from(begin(label)))).toBe(false);
    expect(
      containsPemPrivateKey(
        Buffer.from(`${begin(label)}\0${syntheticBody}\0${end(label)}`),
      ),
    ).toBe(false);
  }
  expect(
    containsPemPrivateKey(
      Buffer.from("-----BEGIN %s-----\0RSA PRIVATE KEY-----\0"),
    ),
  ).toBe(false);
});

it("does not confuse format placeholders or public PEM blocks with private material", () => {
  expect(containsPemPrivateKey(Buffer.from(pem("PRIVATE KEY", "%s")))).toBe(
    false,
  );
  for (const label of ["CERTIFICATE", "PUBLIC KEY", "RSA PUBLIC KEY"])
    expect(containsPemPrivateKey(Buffer.from(pem(label)))).toBe(false);
});

it("continues scanning after harmless and oversized candidates", () => {
  const harmless = `${begin("RSA PRIVATE KEY")}\0${begin("PRIVATE KEY")}\n%s\n`;
  const oversized = `${begin("EC PRIVATE KEY")}\n${" ".repeat(64 * 1024)}`;
  expect(containsPemPrivateKey(Buffer.from(harmless + oversized))).toBe(false);
  expect(
    containsPemPrivateKey(
      Buffer.from(harmless + oversized + pem("PRIVATE KEY")),
    ),
  ).toBe(true);
});
