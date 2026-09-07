import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { EDITORIAL_ASSET_MAX_BYTES } from "../lib/editorial/constants";
import { editorialArguments, isEditorialCliEntrypoint } from "./editorial-cli";

type Options = {
  input: string;
  output: string;
  width?: number;
  quality: number;
  force: boolean;
};

function fail(message: string): never {
  throw new Error(
    `${message}

Usage: pnpm content:image --input assets/originals/<path>.png --output images/editorial/<path>.webp [--width 1600] [--quality 82] [--force]`,
  );
}

export function parseArgs(args: string[]): Options {
  const argv = editorialArguments(args);
  const values = new Map<string, string>();
  let force = false;
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--force") {
      force = true;
      continue;
    }
    if (!["--input", "--output", "--width", "--quality"].includes(key)) {
      fail(`Unknown argument: ${key ?? ""}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`Missing value for ${key}`);
    values.set(key, value);
    index += 1;
  }

  const input = values.get("--input");
  const output = values.get("--output");
  if (!input || !output) fail("Provide --input and --output.");

  const widthText = values.get("--width");
  const width = widthText ? Number(widthText) : undefined;
  const quality = Number(values.get("--quality") ?? "82");
  if (
    width !== undefined &&
    (!Number.isInteger(width) || width < 320 || width > 4000)
  ) {
    fail("--width must be an integer between 320 and 4000.");
  }
  if (!Number.isInteger(quality) || quality < 40 || quality > 95) {
    fail("--quality must be an integer between 40 and 95.");
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
    fail("Input must remain within content/assets/originals.");
  }
  if (!inside(publicRoot, output)) {
    fail("Output must remain within public/images/editorial.");
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
      "Output directories and filenames must use lowercase ASCII kebab-case with a WebP or AVIF extension; the editorial registry handles semantic English approval.",
    );
  }
  const inputBase = path.basename(input, path.extname(input));
  const outputBase = path.basename(output, path.extname(output));
  if (inputBase !== outputBase) {
    fail("The master and derivative must share the same baseName.");
  }
  if (!(await exists(input))) fail(`Master not found: ${input}`);
  if (!options.force && (await exists(output))) {
    fail(
      "The derivative already exists; review the destination or explicitly use --force.",
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
      `The derivative would contain ${data.byteLength} bytes; the editorial limit is ${EDITORIAL_ASSET_MAX_BYTES}. Reduce width or quality.`,
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

if (isEditorialCliEntrypoint(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
