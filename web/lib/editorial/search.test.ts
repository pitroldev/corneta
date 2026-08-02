import { describe, expect, it } from "vitest";
import type { PublishedEditorialDocument } from "./types";
import {
  normalizeEditorialSearch,
  sanitizeEditorialSearchQuery,
  searchPublishedEditorial,
} from "./search";

function document(
  title: string,
  summary: string,
  primaryQuery: string,
): PublishedEditorialDocument {
  return {
    href: `/guides/quality/${title.toLowerCase().replaceAll(" ", "-")}`,
    frontmatter: {
      title,
      summary,
      description: summary,
      primaryQuery,
      collection: "guides",
      category: "quality",
      slug: title.toLowerCase().replaceAll(" ", "-"),
      locale: "pt-BR",
    },
  } as PublishedEditorialDocument;
}

describe("editorial search", () => {
  const documents = [
    document(
      "Quanto upload é necessário para fazer multistream?",
      "Some o bitrate de todas as saídas.",
      "quanto upload precisa para multistream",
    ),
    document(
      "Por que minha live trava?",
      "Separe internet, GPU e encoder antes de mudar a qualidade.",
      "por que minha live trava OBS",
    ),
  ];

  it("ignora caixa, acentos e pontuação", () => {
    expect(normalizeEditorialSearch("  TRANSMISSÃO, estável! ")).toBe(
      "transmissao estavel",
    );
  });

  it("exige todos os termos e ordena pelo campo mais relevante", () => {
    expect(searchPublishedEditorial(documents, "upload multistream")).toEqual([
      documents[0],
    ]);
    expect(searchPublishedEditorial(documents, "live encoder")).toEqual([
      documents[1],
    ]);
  });

  it("aceita somente o primeiro valor e limita o tamanho da consulta", () => {
    expect(sanitizeEditorialSearchQuery(["  OBS  ", "upload"])).toBe("OBS");
    expect(sanitizeEditorialSearchQuery("x".repeat(200))).toHaveLength(120);
  });
});
