import { writeFile } from "node:fs/promises";
import { stat } from "node:fs/promises";
import path from "node:path";
import { auditEditorialContent } from "../lib/editorial/audit";
import {
  buildEditorialReviewQueue,
  renderEditorialReviewMarkdown,
} from "../lib/editorial/maintenance";

type OutputFormat = "text" | "json" | "github";

interface Options {
  asOf: string;
  warningDays: number;
  failOnOverdue: boolean;
  format: OutputFormat;
  output?: string;
}

async function isDirectory(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

async function resolveWebRoot(): Promise<string> {
  const candidates = [process.cwd(), path.resolve(process.cwd(), "web")];
  for (const candidate of candidates) {
    if (
      (await isDirectory(path.join(candidate, "content"))) &&
      (await isDirectory(path.join(candidate, "lib")))
    ) {
      return candidate;
    }
  }
  throw new Error("Não encontrei web/content a partir do diretório atual.");
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function realIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
  );
}

function readValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} exige um valor.`);
  }
  return value;
}

function parseOptions(args: string[]): Options {
  const options: Options = {
    asOf: todayUtc(),
    warningDays: 28,
    failOnOverdue: false,
    format: "text",
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--as-of") {
      options.asOf = readValue(args, index, argument);
      index += 1;
    } else if (argument === "--warning-days") {
      const value = Number(readValue(args, index, argument));
      if (!Number.isInteger(value) || value < 0 || value > 365) {
        throw new Error("--warning-days deve ser um inteiro entre 0 e 365.");
      }
      options.warningDays = value;
      index += 1;
    } else if (argument === "--format") {
      const value = readValue(args, index, argument);
      if (
        !(["text", "json", "github"] as const).includes(value as OutputFormat)
      ) {
        throw new Error("--format aceita text, json ou github.");
      }
      options.format = value as OutputFormat;
      index += 1;
    } else if (argument === "--output") {
      options.output = readValue(args, index, argument);
      index += 1;
    } else if (argument === "--fail-on-overdue") {
      options.failOnOverdue = true;
    } else {
      throw new Error(`Opção desconhecida: ${argument}`);
    }
  }

  if (!realIsoDate(options.asOf)) {
    throw new Error("--as-of deve usar uma data real no formato YYYY-MM-DD.");
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const webRoot = await resolveWebRoot();
  const audit = await auditEditorialContent({
    contentRoot: path.join(webRoot, "content"),
    publicRoot: path.join(webRoot, "public"),
    repositoryRoot: path.resolve(webRoot, ".."),
  });

  if (audit.errorCount > 0) {
    throw new Error(
      `O conteúdo tem ${audit.errorCount} erro(s); rode content:check antes da manutenção.`,
    );
  }

  const queue = buildEditorialReviewQueue(audit.documents, options);
  const rendered =
    options.format === "json"
      ? `${JSON.stringify(queue, null, 2)}\n`
      : renderEditorialReviewMarkdown(queue);

  if (options.output) {
    const output = path.resolve(process.cwd(), options.output);
    await writeFile(output, rendered, "utf8");
  }
  if (!options.output || options.format !== "github") {
    process.stdout.write(rendered);
  }

  if (options.failOnOverdue && queue.overdueCount > 0) {
    process.stderr.write(
      `\nManutenção editorial vencida: ${queue.overdueCount} artigo(s).\n`,
    );
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Falha ao verificar manutenção editorial: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
