import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { parseOptions as parseMaintenance } from "./check-editorial-maintenance";
import { parseOptions as parseRevision } from "./check-editorial-revisions";
import { parseArgs as parseImage } from "./optimize-editorial-image";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const source = (file: string) => readFileSync(path.join(root, file), "utf8");
const imageArgs = [
  "--input",
  "assets/originals/example.png",
  "--output",
  "images/editorial/example.webp",
];

describe("editorial CLI arguments", () => {
  it.each([[], ["--"]])(
    "accepts direct arguments and a single leading pnpm separator (%j)",
    (...prefix) => {
      expect(
        parseRevision([
          ...prefix,
          "--base",
          "origin/main",
          "--head",
          "HEAD",
          "--product-version",
          "0.7.0",
        ]),
      ).toEqual({
        base: "origin/main",
        head: "HEAD",
        productVersion: "0.7.0",
      });
      expect(
        parseMaintenance([
          ...prefix,
          "--as-of",
          "2026-08-02",
          "--warning-days",
          "28",
          "--format",
          "github",
          "--output",
          "queue.md",
          "--fail-on-overdue",
        ]),
      ).toEqual({
        asOf: "2026-08-02",
        warningDays: 28,
        format: "github",
        output: "queue.md",
        failOnOverdue: true,
      });
      expect(
        parseImage([
          ...prefix,
          ...imageArgs,
          "--width",
          "1600",
          "--quality",
          "82",
          "--force",
        ]),
      ).toEqual({
        input: imageArgs[1],
        output: imageArgs[3],
        width: 1600,
        quality: 82,
        force: true,
      });
    },
  );

  it.each([[], ["--"]])(
    "keeps validation after a leading separator (%j)",
    (...prefix) => {
      expect(() => parseRevision(prefix)).toThrow("--base é obrigatório");
      expect(() => parseRevision([...prefix, "--base"])).toThrow(
        "exige um valor",
      );
      expect(() =>
        parseMaintenance([...prefix, "--as-of", "2026-02-30"]),
      ).toThrow("data real");
      expect(() =>
        parseMaintenance([...prefix, "--warning-days", "366"]),
      ).toThrow("entre 0 e 365");
      expect(() => parseMaintenance([...prefix, "--format", "xml"])).toThrow(
        "text, json ou github",
      );
      expect(() =>
        parseImage([...prefix, ...imageArgs, "--width", "319"]),
      ).toThrow("entre 320 e 4000");
      expect(() =>
        parseImage([...prefix, ...imageArgs, "--quality", "100"]),
      ).toThrow("entre 40 e 95");
      expect(() => parseImage([...prefix, "--input"])).toThrow("Valor ausente");
      for (const [parseArgs, args] of [
        [parseRevision, ["--base", "HEAD"]],
        [parseMaintenance, []],
        [parseImage, imageArgs],
      ] as const) {
        expect(() =>
          parseArgs([...prefix, ...args, "--unknown", "value"]),
        ).toThrow("desconhecid");
        expect(() =>
          parseArgs([...prefix, ...args, "--", "--unknown"]),
        ).toThrow("desconhecid");
      }
    },
  );
});

// These checked-in examples use static shell words, quoted values and line
// continuations. Replace workflow expressions, but never execute their commands.
function editorialCommands(text: string): string[][] {
  return text
    .replace(/\$\{\{[^}]*\}\}/g, "fixture-ref")
    .replace(/(?:\\|`)\r?\n\s*/g, " ")
    .split(/\r?\n/)
    .filter((line) => /^\s*pnpm\s/.test(line))
    .map((line) =>
      (line.match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? []).map((token) =>
        token.replace(/^(['"])(.*)\1$/, "$2"),
      ),
    )
    .filter((tokens) => tokens.some((token) => token in parsers));
}

const parsers = {
  "content:revision:check": parseRevision,
  "content:maintenance": parseMaintenance,
  "content:maintenance:check": (args: string[]) =>
    parseMaintenance(["--fail-on-overdue", ...args]),
  "content:image": parseImage,
};

function checkCommands(commands: string[][]): void {
  expect(commands.length).toBeGreaterThan(0);
  for (const tokens of commands) {
    const index = tokens.findIndex((token) => token in parsers);
    const task = tokens[index] as keyof typeof parsers;
    const args = tokens.slice(index + 1);
    expect(args).not.toContain("--");
    expect(() => parsers[task](args)).not.toThrow();
  }
}

describe("executable editorial instructions", () => {
  it.each([
    ["ci", 1],
    ["release", 1],
    ["editorial-maintenance", 1],
  ])(
    "passes real arguments from the %s workflow to its parser",
    (name, expected) => {
      const workflow = parse(source(`.github/workflows/${name}.yml`)) as {
        jobs: Record<string, { steps?: { run?: string }[] }>;
      };
      const commands = Object.values(workflow.jobs)
        .flatMap((job) => job.steps ?? [])
        .flatMap((step) => editorialCommands(step.run ?? ""));
      expect(commands).toHaveLength(expected);
      checkCommands(commands);
    },
  );

  it.each([
    ["docs/RUNBOOK-MANUTENCAO-EDITORIAL.md", 5],
    ["web/content/README.md", 1],
  ])("validates arguments copied from %s", (file, count) => {
    const commands = editorialCommands(source(file as string));
    expect(commands).toHaveLength(count);
    checkCommands(commands);
  });
});
