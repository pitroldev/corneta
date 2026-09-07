import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sourceFiles } from "./source-files.mjs";

// Small local-path checker, not an MDX renderer or an external URL checker.
// Keep offsets/newlines while masking examples so errors point at the source.
function proseOnly(source) {
  let fence;
  const text = source
    .split("\n")
    .map((line) => {
      const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (match && !fence) {
        fence = match[1];
        return " ".repeat(line.length);
      }
      if (fence) {
        if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line))
          fence = undefined;
        return " ".repeat(line.length);
      }
      return line;
    })
    .join("\n");
  return text
    .replace(/<!--[^]*?-->/g, (value) => value.replace(/[^\n]/g, " "))
    .replace(/(`+)([^]*?)\1(?!`)/g, (value) => value.replace(/[^\n]/g, " "));
}

export function markdownDestinations(source) {
  const prose = proseOnly(source);
  const references = new Map();
  const destinations = [];
  for (const match of prose.matchAll(
    /^ {0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))/gm,
  )) {
    const key = match[1].trim().replace(/\s+/g, " ").toLowerCase();
    if (!references.has(key)) references.set(key, match[2] ?? match[3]);
  }
  for (const match of prose.matchAll(
    /(?<!!)\[([^\]\n]*)\](?:\[([^\]\n]*)\])?/g,
  )) {
    const after = match.index + match[0].length;
    let destination;
    if (prose[after] === "(") {
      let cursor = after + 1;
      while (/\s/.test(prose[cursor] ?? "") && cursor < prose.length) cursor++;
      if (prose[cursor] === "<") {
        const end = prose.indexOf(">", cursor + 1);
        if (end !== -1) destination = prose.slice(cursor + 1, end);
      } else {
        const start = cursor;
        let depth = 0;
        for (; cursor < prose.length; cursor++) {
          if (prose[cursor] === "\\") {
            cursor++;
            continue;
          }
          if (prose[cursor] === "(") depth++;
          else if (prose[cursor] === ")") {
            if (!depth) break;
            depth--;
          } else if (/\s/.test(prose[cursor]) && !depth) break;
        }
        destination = prose.slice(start, cursor);
      }
    } else if (prose[after] !== ":") {
      const key = (match[2] || match[1])
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
      destination = references.get(key);
    }
    if (destination)
      destinations.push({
        destination: destination.replace(/\\([()\\])/g, "$1"),
        line: prose.slice(0, match.index).split("\n").length,
      });
  }
  // Images follow the same destination syntax; checking them is useful too.
  if (prose.includes("!["))
    destinations.push(
      ...markdownDestinations(prose.replace(/!\[/g, "[")).filter(
        (entry) =>
          !destinations.some(
            (item) =>
              item.destination === entry.destination &&
              item.line === entry.line,
          ),
      ),
    );
  return destinations;
}

export function checkDocLinks(root) {
  const files = sourceFiles(root).filter(
    (file) => file.endsWith(".md") && existsSync(resolve(root, file)),
  );
  const errors = [];
  let checked = 0;
  for (const file of files) {
    const absolute = resolve(root, file);
    if (lstatSync(absolute).isSymbolicLink()) {
      errors.push(`${file}: documento é um link de filesystem.`);
      continue;
    }
    for (const { destination, line } of markdownDestinations(
      readFileSync(absolute, "utf8"),
    )) {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(destination)) continue;
      let path;
      try {
        path = decodeURIComponent(destination.split(/[?#]/, 1)[0]);
      } catch {
        errors.push(`${file}:${line}: escape inválido.`);
        continue;
      }
      if (!path) continue;
      const target = path.startsWith("/")
        ? resolve(root, `.${path}`)
        : resolve(dirname(absolute), path);
      const rel = relative(root, target);
      checked++;
      if (rel.startsWith("..") || isAbsolute(rel) || !existsSync(target))
        errors.push(
          `${file}:${line}: destino local inexistente/externo: ${destination}`,
        );
    }
  }
  return { documents: files.length, checked, errors };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const result = checkDocLinks(
    resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  );
  for (const error of result.errors) console.error(error);
  console.log(
    `Links locais: ${result.documents} documentos, ${result.checked} destinos, ${result.errors.length} erros. Âncoras e URLs externas não são verificadas.`,
  );
  if (result.errors.length) process.exitCode = 1;
}
