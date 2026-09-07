import { describe, expect, it } from "vitest";
import { pt } from "./pt";
import { en } from "./en";

const VAR_RE = /\{(\w+)\}/g;
const varsOf = (text: string) =>
  [...text.matchAll(VAR_RE)].map((m) => m[1]).sort();

const entries = (dict: object) => Object.entries(dict) as [string, string][];

describe("landing-page Portuguese and English dictionaries", () => {
  it("have exactly the same keys", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
  });

  it("use matching placeholders in every message", () => {
    const mismatched = Object.keys(pt)
      .map((key) => ({
        key,
        pt: varsOf(pt[key as keyof typeof pt]),
        en: varsOf(en[key as keyof typeof en]),
      }))
      .filter((row) => row.pt.join(",") !== row.en.join(","));
    expect(mismatched).toEqual([]);
  });

  it("contain no empty messages", () => {
    const empty = [...entries(pt), ...entries(en)]
      .filter(([, text]) => text.trim() === "")
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it("do not leak Portuguese into English copy", () => {
    const ACCENT = /[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/;
    const PORTUGUESE_TERMS = ["JÁ VOLTO", "BORA AO VIVO", "BORA", "Mesa"];
    const leaked = entries(en)
      .filter(([, text]) => {
        const withoutBrand = text.replace(/Corneta/g, "");
        return (
          ACCENT.test(withoutBrand) ||
          PORTUGUESE_TERMS.some((x) => withoutBrand.includes(x))
        );
      })
      .map(([key]) => key);
    expect(leaked).toEqual([]);
  });
  it("do not leak internal terminology into public copy", () => {
    const INTERNAL_TERMS =
      /\b(lat[ãa]o|breu|compositor|splicer|bomba|slate|ndjson|schemaVersion|halftone)\b/i;
    const leaked = [...entries(pt), ...entries(en)]
      .filter(([, text]) => INTERNAL_TERMS.test(text))
      .map(([key]) => key);
    expect(leaked).toEqual([]);
  });
});
