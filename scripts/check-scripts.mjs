import { spawnSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sourceFiles } from "./source-files.mjs";
import { runSourceLanguageCheck } from "./check-source-language.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let checked = 0;
for (const file of sourceFiles(root).filter((file) =>
  /\.(?:mjs|cjs|js)$/.test(file),
)) {
  if (!existsSync(resolve(root, file))) continue;
  if (lstatSync(resolve(root, file)).isSymbolicLink())
    throw new Error("Validation scripts must not traverse symlinks.");
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
  `JavaScript syntax: ${checked} files (does not replace ESLint or tests).`,
);
if (!process.exitCode && !(await runSourceLanguageCheck(root)))
  process.exitCode = 1;
