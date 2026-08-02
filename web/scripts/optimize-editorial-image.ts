import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { EDITORIAL_ASSET_MAX_BYTES } from "../lib/editorial/constants";

type Options = {
  input: string;
  output: string;
  width?: number;
  quality: number;
  force: boolean;
};

function fail(message: string): never {
  throw new Error(
    `${message}\n\nUso: pnpm content:image -- --input assets/originals/<path>.png --output images/editorial/<path>.webp [--width 1600] [--quality 82] [--force]`,
  );
}

function parseArgs(argv: string[]): Options {
  const values = new Map<string, string>();
  let force = false;
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--force") {
      force = true;
      continue;
    }
    if (!key?.startsWith("--")) fail(`Argumento desconhecido: ${key ?? ""}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`Valor ausente para ${key}`);
    values.set(key, value);
    index += 1;
  }

  const input = values.get("--input");
  const output = values.get("--output");
  if (!input || !output) fail("Informe --input e --output.");

  const widthText = values.get("--width");
  const width = widthText ? Number(widthText) : undefined;
  const quality = Number(values.get("--quality") ?? "82");
  if (
    width !== undefined &&
    (!Number.isInteger(width) || width < 320 || width > 4000)
  ) {
    fail("--width deve ser um inteiro entre 320 e 4000.");
  }
  if (!Number.isInteger(quality) || quality < 40 || quality > 95) {
    fail("--quality deve ser um inteiro entre 40 e 95.");
  }

  return { input, output, width, quality, force };
}

function inside(root: string, target: string) {
  const relative = path.relative(root, target);
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}

async function exists(candidate: string) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const webRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const originalsRoot = path.join(webRoot, "content", "assets", "originals");
  const publicRoot = path.join(webRoot, "public", "images", "editorial");
  const input = path.resolve(webRoot, "content", options.input);
  const output = path.resolve(webRoot, "public", options.output);

  if (!inside(originalsRoot, input)) {
    fail("O input precisa ficar dentro de content/assets/originals.");
  }
  if (!inside(publicRoot, output)) {
    fail("O output precisa ficar dentro de public/images/editorial.");
  }

  const relativeOutput = path
    .relative(publicRoot, output)
    .replaceAll("\\", "/");
  if (
    !/^(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*[a-z0-9]+(?:-[a-z0-9]+)*\.(?:webp|avif)$/.test(
      relativeOutput,
    )
  ) {
    fail(
      "O output deve usar diretórios e filename em lowercase ASCII kebab-case, com extensão WebP ou AVIF; a aprovação semântica em inglês acontece no registro editorial.",
    );
  }
  const inputBase = path.basename(input, path.extname(input));
  const outputBase = path.basename(output, path.extname(output));
  if (inputBase !== outputBase) {
    fail("Master e derivada precisam usar o mesmo baseName.");
  }
  if (!(await exists(input))) fail(`Master não encontrado: ${input}`);
  if (!options.force && (await exists(output))) {
    fail(
      "A derivada já existe; revise o destino ou use --force conscientemente.",
    );
  }

  let pipeline = sharp(input).rotate();
  if (options.width) {
    pipeline = pipeline.resize({
      width: options.width,
      withoutEnlargement: true,
    });
  }
  pipeline =
    path.extname(output).toLowerCase() === ".avif"
      ? pipeline.avif({ quality: options.quality, effort: 6 })
      : pipeline.webp({ quality: options.quality, effort: 5 });

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  if (data.byteLength > EDITORIAL_ASSET_MAX_BYTES) {
    fail(
      `A derivada teria ${data.byteLength} bytes; o limite editorial é ${EDITORIAL_ASSET_MAX_BYTES}. Reduza largura ou qualidade.`,
    );
  }

  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, data, { flag: options.force ? "w" : "wx" });
  process.stdout.write(
    `${JSON.stringify(
      {
        src: `/images/editorial/${relativeOutput}`,
        width: info.width,
        height: info.height,
        bytes: data.byteLength,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
