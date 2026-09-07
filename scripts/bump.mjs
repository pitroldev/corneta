#!/usr/bin/env node
// Bump da versão em SINCRONIA: package.json, src-tauri/tauri.conf.json,
// src-tauri/Cargo.toml (e Cargo.lock, se existir).
//
//   pnpm bump patch            0.1.0 -> 0.1.1
//   pnpm bump minor            0.1.0 -> 0.2.0
//   pnpm bump major            0.1.0 -> 1.0.0
//   pnpm bump <kind> --commit  também faz git commit + tag vX.Y.Z
//   pnpm bump <kind> 1.2.3     define a versão exata (ignora o kind)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const commit = args.includes("--commit");
const positional = args.filter((a) => !a.startsWith("--"));
const kind = positional[0];
const explicit = positional[1]; // versão exata opcional

const KINDS = ["patch", "minor", "major"];
if (!KINDS.includes(kind) && !explicit) {
  console.error("Uso: pnpm bump <patch|minor|major> [versão exata] [--commit]");
  process.exit(1);
}

// Versão atual = package.json (fonte da verdade).
const pkgPath = join(root, "package.json");
const cur = readFileSync(pkgPath, "utf8").match(
  /"version":\s*"(\d+)\.(\d+)\.(\d+)"/,
);
if (!cur) {
  console.error("Não achei a versão atual no package.json.");
  process.exit(1);
}
const from = `${cur[1]}.${cur[2]}.${cur[3]}`;

let to;
if (explicit) {
  if (!/^\d+\.\d+\.\d+$/.test(explicit)) {
    console.error(`Versão exata inválida: "${explicit}" (esperado X.Y.Z).`);
    process.exit(1);
  }
  to = explicit;
} else {
  let [maj, min, pat] = [Number(cur[1]), Number(cur[2]), Number(cur[3])];
  if (kind === "major") {
    maj++;
    min = 0;
    pat = 0;
  } else if (kind === "minor") {
    min++;
    pat = 0;
  } else pat++;
  to = `${maj}.${min}.${pat}`;
}

// Alvos: cada um com 1+ regex (substitui só a 1ª ocorrência de cada).
const SEM = "\\d+\\.\\d+\\.\\d+";
const targets = [
  {
    file: "package.json",
    res: [new RegExp(`("version":\\s*")${SEM}(")`)],
    required: true,
  },
  {
    file: "src-tauri/tauri.conf.json",
    res: [new RegExp(`("version":\\s*")${SEM}(")`)],
    required: true,
  },
  {
    file: "src-tauri/Cargo.toml",
    res: [new RegExp(`^(version\\s*=\\s*")${SEM}(")`, "m")],
    required: true,
  },
  {
    file: "src-tauri/Cargo.lock",
    res: [
      new RegExp(`(name = "corneta"\\r?\\nversion = ")${SEM}(")`),
      new RegExp(`(name = "corneta_lib"\\r?\\nversion = ")${SEM}(")`),
    ],
    required: false,
  },
];

// Valida tudo ANTES de escrever (evita deixar pela metade). Em arquivos opcionais,
// cada regex é independente (ex.: o Cargo.lock só tem a entrada "corneta").
const writes = [];
for (const t of targets) {
  const p = join(root, t.file);
  if (!existsSync(p)) {
    if (t.required) fail(`Arquivo não encontrado: ${t.file}`);
    continue;
  }
  let txt = readFileSync(p, "utf8");
  let changed = false;
  for (const re of t.res) {
    if (re.test(txt)) {
      txt = txt.replace(re, `$1${to}$2`);
      changed = true;
    } else if (t.required) {
      fail(`Não achei a versão em ${t.file}.`);
    }
  }
  if (!changed) {
    console.warn(`  (aviso) pulei ${t.file} — versão não encontrada.`);
    continue;
  }
  writes.push({ p, txt, file: t.file });
}

for (const w of writes) {
  writeFileSync(w.p, w.txt);
  console.log(`  ${w.file}`);
}
console.log(`\n✓ Versão: ${from} → ${to}`);

if (commit) {
  const files = writes.map((w) => w.file).join(" ");
  run(`git add ${files}`);
  run(`git commit -m "chore: v${to}"`);
  run(`git tag v${to}`);
  console.log(`✓ Commit + tag v${to}.`);
} else {
  console.log("Revise e commite quando quiser (ou rode com --commit).");
}

function run(cmd) {
  execSync(cmd, { cwd: root, stdio: "inherit" });
}
function fail(msg) {
  console.error(msg);
  process.exit(1);
}
