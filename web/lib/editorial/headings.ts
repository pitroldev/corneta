import GithubSlugger from "github-slugger";
import { DEFAULT_READING_WORDS_PER_MINUTE } from "./constants";
import type { EditorialLocale, ReadingTime, TocItem, TocLevel } from "./types";

type MarkdownHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

interface MarkdownHeading {
  id: string;
  title: string;
  level: MarkdownHeadingLevel;
}

const FENCE_PATTERN = /^\s*(`{3,}|~{3,})/;
const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const SETEXT_PATTERN = /^\s*(=+|-+)\s*$/;

function blankExceptLineBreaks(value: string): string {
  return value.replace(/[^\r\n]/g, " ");
}

function isEscaped(source: string, index: number): boolean {
  let backslashes = 0;
  for (
    let cursor = index - 1;
    cursor >= 0 && source[cursor] === "\\";
    cursor--
  ) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function maskInlineCode(source: string): string {
  let result = "";
  let cursor = 0;

  while (cursor < source.length) {
    if (source[cursor] !== "`" || isEscaped(source, cursor)) {
      result += source[cursor];
      cursor += 1;
      continue;
    }

    const openerStart = cursor;
    while (source[cursor] === "`") cursor += 1;
    const delimiterLength = cursor - openerStart;
    let searchFrom = cursor;
    let closerEnd = -1;

    while (searchFrom < source.length) {
      const candidateStart = source.indexOf("`", searchFrom);
      if (candidateStart < 0) break;
      if (isEscaped(source, candidateStart)) {
        searchFrom = candidateStart + 1;
        continue;
      }

      let candidateEnd = candidateStart;
      while (source[candidateEnd] === "`") candidateEnd += 1;
      if (candidateEnd - candidateStart === delimiterLength) {
        closerEnd = candidateEnd;
        break;
      }
      searchFrom = candidateEnd;
    }

    if (closerEnd < 0) {
      result += source.slice(openerStart, cursor);
      continue;
    }

    result += blankExceptLineBreaks(source.slice(openerStart, closerEnd));
    cursor = closerEnd;
  }

  return result;
}

/**
 * Masks fenced and inline Markdown code while preserving line boundaries.
 * Validators can inspect MDX syntax without flagging examples as live markup.
 */
export function sourceWithoutMarkdownCode(source: string): string {
  const parts = source.split(/(\r?\n)/);
  let fence: { marker: string; length: number } | null = null;
  let withoutFences = "";

  for (let index = 0; index < parts.length; index += 2) {
    const line = parts[index] ?? "";
    const lineBreak = parts[index + 1] ?? "";
    const fenceMatch = line.match(FENCE_PATTERN);

    if (!fence && fenceMatch) {
      fence = {
        marker: fenceMatch[1][0],
        length: fenceMatch[1].length,
      };
      withoutFences += blankExceptLineBreaks(line) + lineBreak;
      continue;
    }

    if (fence) {
      const closingMatch = line.match(/^\s*(`{3,}|~{3,})\s*$/);
      if (
        closingMatch?.[1][0] === fence.marker &&
        closingMatch[1].length >= fence.length
      ) {
        fence = null;
      }
      withoutFences += blankExceptLineBreaks(line) + lineBreak;
      continue;
    }

    withoutFences += line + lineBreak;
  }

  return maskInlineCode(withoutFences);
}

function plainHeadingText(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[*_~]/g, "")
    .replace(/\\([\\`*{}\[\]()#+\-.!_>])/g, "$1")
    .trim();
}

function extractAllMarkdownHeadings(source: string): MarkdownHeading[] {
  const slugger = new GithubSlugger();
  const headings: MarkdownHeading[] = [];
  const lines = sourceWithoutMarkdownCode(source).split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(HEADING_PATTERN);
    let level: MarkdownHeadingLevel;
    let rawTitle: string;

    if (match) {
      level = match[1].length as MarkdownHeadingLevel;
      rawTitle = match[2];
    } else {
      const underline = lines[index + 1]?.match(SETEXT_PATTERN);
      if (!line.trim() || !underline) continue;
      level = underline[1][0] === "=" ? 1 : 2;
      rawTitle = line;
      index += 1;
    }

    const title = plainHeadingText(rawTitle);
    if (!title) continue;
    headings.push({
      id: slugger.slug(title),
      title,
      level: level as TocLevel,
    });
  }

  return headings;
}

export function extractMarkdownHeadingIds(
  source: string,
  minimumLevel: MarkdownHeadingLevel = 2,
  maximumLevel: MarkdownHeadingLevel = 6,
): string[] {
  return extractAllMarkdownHeadings(source)
    .filter(
      (heading) =>
        heading.level >= minimumLevel && heading.level <= maximumLevel,
    )
    .map((heading) => heading.id);
}

export function buildTableOfContents(source: string): TocItem[] {
  const roots: TocItem[] = [];
  let currentH2: TocItem | null = null;

  for (const heading of extractAllMarkdownHeadings(source)) {
    if (heading.level !== 2 && heading.level !== 3) continue;
    const item: TocItem = {
      ...heading,
      level: heading.level as TocLevel,
      children: [],
    };
    if (heading.level === 2) {
      roots.push(item);
      currentH2 = item;
    } else if (currentH2) {
      currentH2.children.push(item);
    } else {
      roots.push(item);
    }
  }

  return roots;
}

function textForWordCount(source: string): string {
  return source
    .replace(/^---[\s\S]*?---\s*/u, "")
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~`|{}\[\]()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function calculateReadingTime(
  source: string,
  locale: EditorialLocale,
  wordsPerMinute = DEFAULT_READING_WORDS_PER_MINUTE,
): ReadingTime {
  const text = textForWordCount(source);
  const words = text ? text.split(/\s+/u).length : 0;
  const minutes = Math.max(1, Math.ceil(words / wordsPerMinute));
  const label =
    locale === "pt-BR" ? `${minutes} min de leitura` : `${minutes} min read`;

  return { words, minutes, label };
}

export function countMarkdownHeadings(source: string, level: number): number {
  return extractAllMarkdownHeadings(source).filter(
    (heading) => heading.level === level,
  ).length;
}
