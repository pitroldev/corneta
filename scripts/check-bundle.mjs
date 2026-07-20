import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const assets = join(process.cwd(), "dist", "assets");
const limit = 110 * 1024;
const failures = [];
for (const name of readdirSync(assets).filter((file) => file.endsWith(".js"))) {
  const bytes = gzipSync(readFileSync(join(assets, name))).byteLength;
  if (bytes > limit) failures.push(`${name}: ${(bytes / 1024).toFixed(1)} KiB gzip`);
}
if (failures.length) {
  console.error(`Chunks acima do budget de 110 KiB gzip:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("Bundle dentro do budget: nenhum chunk JS excede 110 KiB gzip.");
