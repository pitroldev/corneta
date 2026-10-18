import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serialize } from "next-mdx-remote/serialize";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";
import { extractMarkdownHeadingIds } from "./headings";
import { parseEditorialSource } from "./parse";

const contentRoot = fileURLToPath(new URL("../../content", import.meta.url));

interface HastNode {
  type: string;
  tagName?: string;
  properties?: { id?: unknown };
  children?: HastNode[];
}

async function mdxFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return mdxFiles(absolutePath);
      return entry.name.endsWith(".mdx") ? [absolutePath] : [];
    }),
  );
  return nested.flat();
}

function collectHeadingIds(ids: string[]) {
  const visit = (node: HastNode) => {
    if (
      node.type === "element" &&
      /^h[1-6]$/u.test(node.tagName ?? "") &&
      typeof node.properties?.id === "string"
    ) {
      ids.push(node.properties.id);
    }
    node.children?.forEach(visit);
  };
  return () => visit;
}

describe("article heading ids", () => {
  it("match the ids the article page renders with rehype-slug", async () => {
    const files = await mdxFiles(contentRoot);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const relativePath = path
        .relative(contentRoot, file)
        .replaceAll("\\", "/");
      const document = parseEditorialSource(
        await readFile(file, "utf8"),
        relativePath,
      );
      const rendered: string[] = [];
      await serialize(document.source, {
        mdxOptions: {
          remarkPlugins: [remarkGfm],
          rehypePlugins: [rehypeSlug, collectHeadingIds(rendered)],
        },
      });
      expect(
        extractMarkdownHeadingIds(document.source, 1, 6),
        relativePath,
      ).toEqual(rendered);
    }
  }, 60_000);
});
