import { describe, expect, it } from "vitest";
import { markdownDestinations } from "./check-doc-links.mjs";

describe("Markdown local destinations", () => {
  it("ignores code blocks, inline code and comments", () => {
    expect(
      markdownDestinations(
        "```md\n[x](bad.md)\n```\n`[x](bad.md)`\n<!-- [x](bad.md) -->\n[real](README.md)",
      ),
    ).toEqual([{ destination: "README.md", line: 6 }]);
  });
  it("handles code fences longer than three characters and tildes", () => {
    expect(
      markdownDestinations("````\n```\n[x](bad)\n````\n~~~\n[x](bad)\n~~~"),
    ).toEqual([]);
  });
  it("handles route groups, spaces, escaped parentheses and images", () => {
    expect(
      markdownDestinations(
        "[a](web/app/(site)/page.tsx) [b](<folder with spaces/a.md>) [c](a\\(b\\).md) ![image](image.png)",
      ).map((item) => item.destination),
    ).toEqual([
      "web/app/(site)/page.tsx",
      "folder with spaces/a.md",
      "a(b).md",
      "image.png",
    ]);
  });
  it("resolves references but not checklist syntax or unused definitions", () => {
    expect(
      markdownDestinations(
        "[a][REF] [ref][] [ref]\n- [x] task\n[ref]: README.md\n[unused]: bad.md",
      ).map((item) => item.destination),
    ).toEqual(["README.md", "README.md", "README.md"]);
  });
});
