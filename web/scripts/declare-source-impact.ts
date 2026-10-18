import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  SOURCE_IMPACT_FILE,
  sourceImpactSchema,
  type SourceImpact,
} from "../lib/editorial/source-impact";
import { editorialArguments, isEditorialCliEntrypoint } from "./editorial-cli";

const execFileAsync = promisify(execFile);

interface Options {
  article: string;
  source: string;
  reason: string;
}

export function parseOptions(argv: string[]): Options {
  const args = editorialArguments(argv);
  const values: Partial<Options> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]?.replace(/^--/u, "");
    const value = args[index + 1];
    if (
      (key !== "article" && key !== "source" && key !== "reason") ||
      !value ||
      value.startsWith("--")
    ) {
      throw new Error(
        "Usage: content:impact:declare --article <locale/path.mdx> --source <repo path> --reason <text>",
      );
    }
    values[key] = value;
  }
  if (!values.article || !values.source || !values.reason) {
    throw new Error("--article, --source and --reason are required.");
  }
  return values as Options;
}

/** Records or replaces the declaration for one article and source, bound to the source at HEAD. */
async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const { stdout } = await execFileAsync(
    "git",
    ["rev-parse", "--show-toplevel"],
    { encoding: "utf8" },
  );
  const repositoryRoot = stdout.trim();
  const blob = (
    await execFileAsync(
      "git",
      ["rev-parse", "--verify", `HEAD:${options.source}`],
      { cwd: repositoryRoot, encoding: "utf8" },
    )
  ).stdout.trim();
  const file = path.join(repositoryRoot, SOURCE_IMPACT_FILE);
  let current: SourceImpact = { version: 1, declarations: [] };
  try {
    current = sourceImpactSchema.parse(
      JSON.parse(await readFile(file, "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const next = sourceImpactSchema.parse({
    version: 1,
    declarations: [
      ...current.declarations.filter(
        (declaration) =>
          declaration.article !== options.article ||
          declaration.source !== options.source,
      ),
      {
        article: options.article,
        source: options.source,
        sourceBlob: blob,
        reason: options.reason,
      },
    ].sort(
      (left, right) =>
        left.article.localeCompare(right.article, "en") ||
        left.source.localeCompare(right.source, "en"),
    ),
  });
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  process.stdout.write(
    `Declared ${options.source} without impact on ${options.article} (${blob.slice(0, 12)}).\n`,
  );
}

if (isEditorialCliEntrypoint(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `Source impact declaration failed: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  });
}
