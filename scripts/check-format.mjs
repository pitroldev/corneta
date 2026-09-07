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
      "Baseline de formatação inválida ou versão de Prettier diferente; revise a migração explicitamente.",
    );
  }
  const result = { checked: 0, legacy: [], failures: [], formatted: [] };
  const workspaceReal = realpathSync(workspace);
  for (const path of sourceFiles(workspace)) {
    const file = resolve(workspace, path);
    if (!file.startsWith(`${resolve(workspace)}${sep}`))
      throw new Error("Caminho de fonte fora do workspace.");
    if (!existsSync(file)) continue; // tracked deletion in a working tree
    if (lstatSync(file).isSymbolicLink())
      throw new Error(`Symlink não é fonte formatável: ${path}`);
    if (!realpathSync(file).startsWith(`${workspaceReal}${sep}`))
      throw new Error(`Fonte formatável fora do workspace: ${path}`);
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
    console.error("Uso: node scripts/check-format.mjs [--write] [--all]");
    process.exitCode = 1;
  } else {
    checkFormatting(root, {
      write: flags.includes("--write"),
      strict: flags.includes("--all"),
    })
      .then((result) => {
        console.log(
          `Formatação: ${result.checked} arquivos inspecionados; ${result.legacy.length} débitos históricos inalterados; ${result.formatted.length} formatados.`,
        );
        if (result.failures.length) {
          console.error(
            `Arquivos novos/modificados fora do padrão:\n${result.failures.join("\n")}\nExecute pnpm format. --all verifica também a dívida histórica.`,
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
