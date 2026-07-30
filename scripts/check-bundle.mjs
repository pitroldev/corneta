import { existsSync, readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, relative } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");
const assets = join(dist, "assets");
const limit = 110 * 1024;

// 1) Budget de tamanho dos chunks.
const oversized = [];
for (const name of readdirSync(assets).filter((file) => file.endsWith(".js"))) {
  const bytes = gzipSync(readFileSync(join(assets, name))).byteLength;
  if (bytes > limit)
    oversized.push(`${name}: ${(bytes / 1024).toFixed(1)} KiB gzip`);
}
if (oversized.length) {
  console.error(
    `Chunks acima do budget de 110 KiB gzip:\n${oversized.join("\n")}`,
  );
  process.exit(1);
}

// 2) Nenhum Client Secret no bundle.
//
// O critério de aceite do plano de OAuth diz que Client Secret nunca entra no binário nem no
// bundle Vite. Até aqui isso era disciplina, não teste: bastava prefixar uma variável com `VITE_`
// por engano pra publicar um segredo em todo build. Agora `pnpm check:app` quebra.
//
// Só o NOME da variável aparece na saída — nunca o valor.
const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else files.push({ path, bytes: readFileSync(path) });
  }
};
if (existsSync(dist)) walk(dist);

// Nomes que são públicos POR DESIGN neste projeto: o que o Vite/Next expõem de propósito, mais
// Client IDs e redirect URIs — que precisam estar no bundle pro OAuth funcionar.
const PUBLICO = /^(VITE_|NEXT_PUBLIC_)|_CLIENT_ID$|_REDIRECT_URIS?$/;
const leaks = [];
const onde = (file) => relative(root, file.path);

const envPath = join(root, ".env");
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    // Linha comentada também conta: pode ter sido usada num build anterior desta árvore.
    const line = raw.replace(/^\s*#\s*/, "").trim();
    const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, name, rawValue] = match;
    const value = rawValue.trim().replace(/^["']|["']$/g, "");
    // URLs e valores curtos são configuração, não segredo (e dariam falso positivo: o app mostra
    // o redirect da Kick na própria tela de ajuda).
    if (PUBLICO.test(name) || value.length < 12 || /^https?:\/\//.test(value))
      continue;
    for (const file of files) {
      if (file.bytes.includes(value)) leaks.push(`${name} em ${onde(file)}`);
    }
  }
}

// Formatos que são segredo por si, venham do .env ou de qualquer outro lugar.
const formatos = [
  [/GOCSPX-[A-Za-z0-9_-]{10,}/, "Client Secret do Google (GOCSPX-…)"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "chave privada PEM"],
];
for (const file of files) {
  const text = file.bytes.toString("latin1");
  for (const [padrao, rotulo] of formatos) {
    if (padrao.test(text)) leaks.push(`${rotulo} em ${onde(file)}`);
  }
}

if (leaks.length) {
  console.error(
    `Segredo no bundle — isso vai pra máquina do usuário:\n${[...new Set(leaks)].join("\n")}`,
  );
  process.exit(1);
}

console.log(
  "Bundle dentro do budget (nenhum chunk JS excede 110 KiB gzip) e sem segredo.",
);
