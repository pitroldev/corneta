import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as prettier from "prettier";
import { sourceFiles } from "./source-files.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const normalizedHash = (source) =>
  `sha256:${createHash("sha256").update(source.replace(/\r\n?/g, "\n")).digest("hex")}`;

export function grandfathered(path, source, baseline, strict = false) {
  return !strict && baseline.files[path] === normalizedHash(source);
}

export async function checkFormatting(
  workspace,
  { write = false, strict = false } = {},
) {
  const baseline = JSON.parse(
    readFileSync(resolve(workspace, ".format-baseline.json"), "utf8"),
  );
  if (
    baseline.schemaVersion !== 1 ||
    baseline.prettierVersion !== prettier.version ||
    !baseline.files ||
    typeof baseline.files !== "object" ||
    Array.isArray(baseline.files) ||
    Object.values(baseline.files).some(
      (hash) => typeof hash !== "string" || !/^sha256:[a-f\d]{64}$/.test(hash),
    )
  ) {
    throw new Error(
      "Invalid formatting baseline or mismatched Prettier version; explicitly review the migration.",
    );
  }
  const result = { checked: 0, legacy: [], failures: [], formatted: [] };
  const workspaceReal = realpathSync(workspace);
  for (const path of sourceFiles(workspace)) {
    const file = resolve(workspace, path);
    if (!file.startsWith(`${resolve(workspace)}${sep}`))
      throw new Error("Source path is outside the workspace.");
    if (!existsSync(file)) continue; // tracked deletion in a working tree
    if (lstatSync(file).isSymbolicLink())
      throw new Error(`Cannot format a symlink source: ${path}`);
    if (!realpathSync(file).startsWith(`${workspaceReal}${sep}`))
      throw new Error(`Formatting source is outside the workspace: ${path}`);
    const info = await prettier.getFileInfo(file, {
      ignorePath: resolve(workspace, ".prettierignore"),
    });
    if (info.ignored || !info.inferredParser) continue;
    const source = readFileSync(file, "utf8");
    const options = await prettier.resolveConfig(file, { editorconfig: true });
    const formatted = await prettier.format(source, {
      ...options,
      filepath: file,
    });
    result.checked++;
    if (source.replace(/\r\n?/g, "\n") === formatted.replace(/\r\n?/g, "\n"))
      continue;
    if (grandfathered(path, source, baseline, strict)) {
      result.legacy.push(path);
      continue;
    }
    if (write) {
      writeFileSync(file, formatted);
      result.formatted.push(path);
    } else result.failures.push(path);
  }
  return result;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const flags = process.argv.slice(2);
  if (flags.some((flag) => !["--write", "--all"].includes(flag))) {
    console.error("Usage: node scripts/check-format.mjs [--write] [--all]");
    process.exitCode = 1;
  } else {
    checkFormatting(root, {
      write: flags.includes("--write"),
      strict: flags.includes("--all"),
    })
      .then((result) => {
        console.log(
          `Formatting: ${result.checked} files checked; ${result.legacy.length} unchanged legacy exceptions; ${result.formatted.length} formatted.`,
        );
        if (result.failures.length) {
          console.error(
            `New or modified files are not formatted:\n${result.failures.join("\n")}\nRun pnpm format. --all also checks legacy exceptions.`,
          );
          process.exitCode = 1;
        }
      })
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
  }
}
