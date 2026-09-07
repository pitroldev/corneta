import { spawnSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sourceFiles } from "./source-files.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let checked = 0;
for (const file of sourceFiles(root).filter((file) =>
  /\.(?:mjs|cjs|js)$/.test(file),
)) {
  if (!existsSync(resolve(root, file))) continue;
  if (lstatSync(resolve(root, file)).isSymbolicLink())
    throw new Error("Scripts de validação não podem atravessar symlinks.");
  const result = spawnSync(process.execPath, ["--check", resolve(root, file)], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
  checked++;
}
console.log(
  `Sintaxe JavaScript: ${checked} arquivos (não substitui ESLint nem testes).`,
);
