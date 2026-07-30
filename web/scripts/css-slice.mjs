// Ferramenta da migração CSS → utilitário do Tailwind.
//
//   node scripts/css-slice.mjs show <arquivo.tsx>   → imprime as regras das classes que ele usa
//   node scripts/css-slice.mjs drop <classe>...     → apaga essas regras do globals.css
//   node scripts/css-slice.mjs dead                 → lista classes definidas e nunca usadas
//
// Existe porque o globals.css tem ~4.400 linhas e as regras de um componente
// ficam espalhadas: procurar à mão é onde se perde declaração e o desenho anda.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";

const CSS = new URL("../app/globals.css", import.meta.url).pathname.replace(
  /^\//,
  "",
);

function tsxFiles(dir = "app", out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (![".next", "node_modules", ".shots"].includes(e.name))
        tsxFiles(p, out);
    } else if (extname(e.name) === ".tsx") out.push(p);
  }
  return out;
}

const css = readFileSync(CSS, "utf8");
const defined = new Set(
  [...css.matchAll(/^\.([a-z][a-z0-9-]*)/gm)].map((m) => m[1]),
);

function usedIn(file) {
  const src = readFileSync(file, "utf8");
  const found = new Set();
  for (const m of src.matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\})/g))
    for (const c of (m[1] ?? m[2]).split(/[\s${}?:'"()]+/))
      if (defined.has(c)) found.add(c);
  return found;
}

// Uma regra = do começo do seletor até a chave que fecha.
//
// O seletor pode ocupar VÁRIAS linhas ("h1,\nh2,\nh3,\n.display {"), por isso o
// casamento começa depois da chave anterior e não no início da linha. Ignorar
// isso já custou caro: `.display` fez a regra base dos títulos inteira ser
// apagada e a tipografia da LP sumiu.
// Varre o arquivo em vez de usar regex: seletor pode ocupar várias linhas e
// comentário pode conter chave, coisas que regex erra em silêncio. Devolve as
// regras de TOPO (não entra em @media — quem quiser mexer lá faz à mão).
function topLevelRules() {
  const out = [];
  let i = 0,
    selStart = 0;
  while (i < css.length) {
    if (css.startsWith("/*", i)) {
      const end = css.indexOf("*/", i + 2);
      i = end < 0 ? css.length : end + 2;
      if (css.slice(selStart, i).trim().startsWith("/*")) selStart = i;
      continue;
    }
    if (css[i] === "{") {
      const selector = css.slice(selStart, i).trim();
      let depth = 1,
        j = i + 1;
      while (j < css.length && depth > 0) {
        if (css.startsWith("/*", j)) {
          const e = css.indexOf("*/", j + 2);
          j = e < 0 ? css.length : e + 2;
          continue;
        }
        if (css[j] === "{") depth++;
        else if (css[j] === "}") depth--;
        j++;
      }
      // A posição inicial ignora o comentário que precede a regra.
      const bodyStart = selStart + (css.slice(selStart).length - css.slice(selStart).trimStart().length);
      out.push({ selector, start: bodyStart, end: j, text: css.slice(bodyStart, j) });
      i = j;
      selStart = j;
      continue;
    }
    i++;
  }
  return out;
}

function rulesFor(names) {
  const want = new Set(names);
  const hasWanted = (p) =>
    [...p.matchAll(/\.([a-z][a-z0-9-]*)/g)].some((s) => want.has(s[1]));
  return topLevelRules().filter((r) => {
    if (!r.selector || r.selector.startsWith("@")) return false;
    const parts = r.selector.split(",").map((p) => p.trim());
    if (!parts.some(hasWanted)) return false;
    // Regra compartilhada com seletor de elemento ou com classe que fica:
    // apagar levaria junto estilo que ninguém pediu pra remover. Foi assim que
    // `.display` fez a regra base de h1/h2/h3 sumir e a tipografia da LP morrer.
    const survivors = parts.filter((p) => !hasWanted(p));
    if (survivors.length) {
      console.warn(
        `  ! pulando "${r.selector.replace(/\s+/g, " ")}" — também casa ${survivors.join(", ")}`,
      );
      return false;
    }
    return true;
  });
}

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === "show") {
  const names = usedIn(rest[0]);
  console.log(`/* ${rest[0]} — ${names.size} classes */\n`);
  for (const r of rulesFor(names)) console.log(r.text + "\n");
} else if (cmd === "drop") {
  const rules = rulesFor(rest).sort((a, b) => b.start - a.start);
  let next = css;
  for (const r of rules) next = next.slice(0, r.start) + next.slice(r.end);
  next = next.replace(/\n{3,}/g, "\n\n");
  writeFileSync(CSS, next);
  console.log(
    `${rules.length} regras removidas · ${css.split("\n").length} → ${next.split("\n").length} linhas`,
  );
} else if (cmd === "dead") {
  const all = new Set();
  for (const f of tsxFiles()) for (const c of usedIn(f)) all.add(c);
  const dead = [...defined].filter((c) => !all.has(c));
  console.log(dead.join(" "));
} else {
  console.error("uso: show <arquivo> | drop <classe>... | dead");
  process.exit(1);
}
