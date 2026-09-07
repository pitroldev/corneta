import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { bold, rich, strong, type Translate } from "./rich";
import type { MessageKey } from "./pt";
import { interpolate, type Vars } from "./locale";

const DICT: Record<string, string> = {
  plain: "sem nada pra destacar",
  slot: "clique em {botao} e pronto",
  "slot.reordered": "{botao} é o que você clica",
  two: "{a} vem antes de {b}",
  bold: "o OBS encoda **uma vez**. Daí:",
  "bold.many": "vá em **Ferramentas** e marque **Ativar**",
  "bold.withVar": "sua internet sobe **~{mbps} Mbps**",
  mixed: "baixe a **Taxa de bits** ({link}) ou tire uma plataforma",
};

const t = ((key: MessageKey, vars?: Vars) =>
  interpolate(DICT[key as string], vars)) as Translate;

const html = (nodes: ReactNode[]) => renderToStaticMarkup(<>{nodes}</>);
const k = (s: string) => s as MessageKey;

describe("rich", () => {
  it("replaces a placeholder with a node and preserves surrounding text", () => {
    expect(html(rich(t, k("slot"), { botao: <b>BORA</b> }))).toBe(
      "clique em <b>BORA</b> e pronto",
    );
  });

  it("follows translation order rather than code order", () => {
    expect(html(rich(t, k("slot.reordered"), { botao: <b>BORA</b> }))).toBe(
      "<b>BORA</b> é o que você clica",
    );
  });

  it("supports multiple placeholders", () => {
    expect(html(rich(t, k("two"), { a: <i>um</i>, b: <i>dois</i> }))).toBe(
      "<i>um</i> vem antes de <i>dois</i>",
    );
  });

  it("preserves sentences without placeholders", () => {
    expect(html(rich(t, k("plain"), {}))).toBe("sem nada pra destacar");
  });

  it("supports bold text between placeholders", () => {
    expect(html(rich(t, k("mixed"), { link: <button>guia</button> }))).toBe(
      "baixe a <strong>Taxa de bits</strong> (<button>guia</button>) ou tire uma plataforma",
    );
  });
});

describe("bold", () => {
  it("wraps asterisk-delimited text in strong", () => {
    expect(html(bold(t, k("bold")))).toBe(
      "o OBS encoda <strong>uma vez</strong>. Daí:",
    );
  });

  it("supports multiple emphasized spans", () => {
    expect(html(bold(t, k("bold.many")))).toBe(
      "vá em <strong>Ferramentas</strong> e marque <strong>Ativar</strong>",
    );
  });

  it("emphasizes interpolated values inside bold markup", () => {
    expect(html(bold(t, k("bold.withVar"), { mbps: "8,5" }))).toBe(
      "sua internet sobe <strong>~8,5 Mbps</strong>",
    );
  });

  it("preserves unmarked text", () => {
    expect(html(bold(t, k("plain")))).toBe("sem nada pra destacar");
  });
});

describe("strong", () => {
  it("wraps every replacement without repeated strong elements at the call site", () => {
    expect(html(strong(t, k("slot"), { botao: "BORA" }))).toBe(
      "clique em <strong>BORA</strong> e pronto",
    );
  });
});
