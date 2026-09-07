import { describe, expect, it } from "vitest";
import { pt } from "./pt";
import { en } from "./en";

// TypeScript checks dictionary keys but not matching placeholders inside translated values.

const VAR_RE = /\{(\w+)\}/g;
const varsOf = (text: string) =>
  [...text.matchAll(VAR_RE)].map((m) => m[1]).sort();

const entries = (dict: object) => Object.entries(dict) as [string, string][];

describe("pt/en dictionaries", () => {
  it("contain exactly the same keys", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
  });

  it("use matching placeholders in each message", () => {
    const mismatched = Object.keys(pt)
      .map((key) => ({
        key,
        pt: varsOf(pt[key as keyof typeof pt]),
        en: varsOf(en[key as keyof typeof en]),
      }))
      .filter((row) => row.pt.join(",") !== row.en.join(","));
    expect(mismatched).toEqual([]);
  });

  it("do not contain ICU syntax unsupported by interpolate", () => {
    const icu = [...entries(pt), ...entries(en)]
      .filter(([, text]) => /\{\s*\w+\s*,/.test(text))
      .map(([key]) => key);
    expect(icu).toEqual([]);
  });

  it("close every bold marker", () => {
    const unbalanced = [...entries(pt), ...entries(en)]
      .filter(([, text]) => (text.match(/\*\*/g)?.length ?? 0) % 2 !== 0)
      .map(([key]) => key);
    expect(unbalanced).toEqual([]);
  });

  it("use bold markup in both locales or neither", () => {
    const halfMarked = Object.keys(pt).filter(
      (key) =>
        pt[key as keyof typeof pt].includes("**") !==
        en[key as keyof typeof en].includes("**"),
    );
    expect(halfMarked).toEqual([]);
  });

  it("contain no empty messages", () => {
    const empty = [...entries(pt), ...entries(en)]
      .filter(([, text]) => text.trim() === "")
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it("do not leak Portuguese into English copy", () => {
    // Preserve proper-name accents such as São Paulo.
    const ACCENTED_CHARACTER = /[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/;
    const PORTUGUESE_TERMS = ["JÁ VOLTO", "BORA AO VIVO", "BORA", "Mesa"];
    const PROPER_NAMES = /Corneta|São Paulo/g;
    const leaked = entries(en)
      .filter(([, text]) => {
        const cleaned = text.replace(PROPER_NAMES, "");
        return (
          ACCENTED_CHARACTER.test(cleaned) ||
          PORTUGUESE_TERMS.some((x) => cleaned.includes(x))
        );
      })
      .map(([key]) => key);
    expect(leaked).toEqual([]);
  });
  // Reject internal design-system vocabulary in user-facing copy; see docs/TOM-DE-VOZ.md.
  it("do not expose internal vocabulary in user-facing copy", () => {
    const INTERNAL_VOCABULARY =
      /\b(lat[ãa]o|breu|compositor|splicer|bomba|slate|ndjson|schemaVersion|halftone)\b/i;
    const leaked = [...entries(pt), ...entries(en)]
      .filter(([, text]) => INTERNAL_VOCABULARY.test(text))
      .map(([key]) => key);
    expect(leaked).toEqual([]);
  });
});
