import { languageIssue } from "./source-language.mjs";

export function rustSpans(source) {
  const spans = [];
  for (let index = 0; index < source.length;) {
    const start = index;
    if (source.startsWith("//", index)) {
      index = source.indexOf("\n", index);
      if (index < 0) index = source.length;
      spans.push({ kind: "comment", start, end: index });
    } else if (source.startsWith("/*", index)) {
      let depth = 1;
      index += 2;
      while (index < source.length && depth) {
        if (source.startsWith("/*", index)) {
          depth++;
          index += 2;
        } else if (source.startsWith("*/", index)) {
          depth--;
          index += 2;
        } else index++;
      }
      if (depth) throw new Error("Unclosed Rust block comment.");
      spans.push({ kind: "comment", start, end: index });
    } else {
      // Raw strings may contain comment delimiters; lifetimes are not character literals.
      const raw = /^(?:br|cr|r)(#*)"/.exec(source.slice(index));
      if (raw && (index === 0 || !/[\p{L}\p{N}_]/u.test(source[index - 1]))) {
        const terminator = `"${raw[1]}`;
        const close = source.indexOf(terminator, index + raw[0].length);
        if (close < 0) throw new Error("Unclosed Rust raw string.");
        index = close + terminator.length;
        spans.push({ kind: "string", start, end: index });
      } else if (source[index] === '"') {
        index++;
        let closed = false;
        while (index < source.length) {
          if (source[index] === "\\") {
            index += 2;
            continue;
          }
          if (source[index++] === '"') {
            closed = true;
            break;
          }
        }
        if (!closed) throw new Error("Unclosed Rust string.");
        spans.push({ kind: "string", start, end: index });
      } else {
        const char =
          /^'(?:\\(?:u\{[0-9a-fA-F_]+\}|x[0-9a-fA-F]{2}|.)|[^'\\\r\n])'/u.exec(
            source.slice(index),
          );
        if (char) {
          index += char[0].length;
          spans.push({ kind: "char", start, end: index });
        } else index++;
      }
    }
  }
  return spans;
}

export function inspectRust(source) {
  const issues = [];
  let spans;
  try {
    spans = rustSpans(source);
  } catch {
    return [{ code: "source-syntax", offset: 0 }];
  }
  const add = (text, kind, offset) => {
    const code = languageIssue(text, kind);
    if (code) issues.push({ code, offset });
  };
  let cursor = 0,
    codeOnly = "";
  for (const span of [
    ...spans,
    { start: source.length, end: source.length, kind: "end" },
  ]) {
    const code = source.slice(cursor, span.start);
    for (const match of code.matchAll(/[\p{L}_][\p{L}\p{N}_]*/gu))
      add(match[0], "identifier", cursor + match.index);
    codeOnly +=
      code + source.slice(span.start, span.end).replace(/[^\r\n]/g, " ");
    if (span.kind === "comment")
      add(source.slice(span.start, span.end), "comment", span.start);
    if (
      span.kind === "string" &&
      /(?:log::(?:error|warn|info|debug|trace)|e?println|e?print)!\s*\(\s*$/.test(
        codeOnly.slice(0, span.start),
      )
    )
      add(source.slice(span.start, span.end), "diagnostic", span.start);
    cursor = span.end;
  }
  for (const match of codeOnly.matchAll(
    /\b(?:log::(?:error|warn|info|debug|trace)|e?println|e?print)!\s*\(/g,
  )) {
    let end = match.index + match[0].length,
      depth = 1;
    for (; end < codeOnly.length && depth; end++) {
      if (codeOnly[end] === "(") depth++;
      else if (codeOnly[end] === ")") depth--;
    }
    const body = codeOnly.slice(match.index, end);
    if (/\bMsg::/.test(body) && /\.now\s*\(/.test(body))
      issues.push({ code: "localized-log", offset: match.index });
  }
  return issues.sort((a, b) => a.offset - b.offset);
}
