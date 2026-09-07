import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";
import { sourceFiles } from "./source-files.mjs";
import {
  inspectJavaScript,
  issueMessages,
  languageIssue,
} from "./source-language.mjs";
import { inspectRust } from "./source-language-rust.mjs";

export async function inspectSource(source, file) {
  if (/\.rs$/.test(file)) return inspectRust(source);
  if (/\.(?:[cm]?js|tsx?)$/.test(file)) return inspectJavaScript(source, file);
  const issues = [];
  function comment(text, offset) {
    const code = languageIssue(text, "comment");
    if (code) issues.push({ code, offset });
  }
  async function css(text, base = 0) {
    const { ast } = await prettier.__debug.parse(text, { parser: "css" });
    function visit(node) {
      if (node.type === "css-comment")
        comment(node.text, base + (node.source?.start?.offset ?? 0));
      node.nodes?.forEach(visit);
    }
    visit(ast);
  }
  try {
    if (/\.css$/.test(file)) await css(source);
    if (/\.html$/.test(file)) {
      const { ast } = await prettier.__debug.parse(source, { parser: "html" });
      async function visit(node) {
        const offset = node.sourceSpan.start.offset;
        if (node.kind === "comment") comment(node.value, offset);
        if (node.name === "script" || node.name === "style") {
          for (const child of node.children) {
            const base = child.sourceSpan.start.offset;
            if (node.name === "style") await css(child.value, base);
            else if (
              !node.attrs.some(
                (attribute) =>
                  attribute.name === "type" &&
                  !/^(?:module|text\/javascript|application\/javascript)$/.test(
                    attribute.value,
                  ),
              )
            ) {
              issues.push(
                ...inspectJavaScript(child.value, `${file}.js`).map(
                  (issue) => ({ ...issue, offset: base + issue.offset }),
                ),
              );
            }
          }
        } else for (const child of node.children ?? []) await visit(child);
      }
      await visit(ast);
    }
  } catch {
    issues.push({ code: "source-syntax", offset: 0 });
  }
  return issues;
}

export async function checkSourceLanguage(root) {
  const workspace = realpathSync(root);
  let checked = 0;
  const failures = [];
  for (const file of sourceFiles(root)) {
    if (
      !/\.(?:[cm]?js|tsx?|rs|css|html)$/.test(file) ||
      file.split(/[\\/]/).some((part) => part.startsWith(".env"))
    )
      continue;
    const absolute = resolve(workspace, file),
      inside = relative(workspace, absolute);
    if (isAbsolute(inside) || inside === ".." || inside.startsWith(`..${sep}`))
      throw new Error("Source language check cannot leave the workspace.");
    if (!existsSync(absolute)) continue;
    const actual = realpathSync(absolute);
    if (
      lstatSync(absolute).isSymbolicLink() ||
      (process.platform === "win32"
        ? actual.toLowerCase() !== absolute.toLowerCase()
        : actual !== absolute)
    )
      throw new Error(
        "Source language check cannot traverse filesystem links.",
      );
    const source = readFileSync(absolute, "utf8");
    const issues = await inspectSource(source, file);
    failures.push(
      ...issues.map((issue) => ({
        file,
        line: source.slice(0, issue.offset).split("\n").length,
        code: issue.code,
      })),
    );
    checked++;
  }
  return { checked, failures };
}

export async function runSourceLanguageCheck(root) {
  const result = await checkSourceLanguage(root);
  for (const issue of result.failures)
    console.error(`${issue.file}:${issue.line}: ${issueMessages[issue.code]}`);
  console.log(
    `Source language: ${result.checked} files, ${result.failures.length} violations. Heuristics do not replace comment review.`,
  );
  return result.failures.length === 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (
      !(await runSourceLanguageCheck(
        resolve(dirname(fileURLToPath(import.meta.url)), ".."),
      ))
    )
      process.exitCode = 1;
  } catch {
    console.error(
      "Source language check failed; no clean result can be claimed.",
    );
    process.exitCode = 1;
  }
}
