import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { bold, rich, strong, type Translate } from "./rich";
import type { MessageKey } from "./pt";
import { interpolate, type Vars } from "./locale";

/** Dicionário de mentira: o que importa aqui é a MARCAÇÃO, não a copy. */
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
  it("troca o buraco pelo nó, mantendo o texto em volta", () => {
    expect(html(rich(t, k("slot"), { botao: <b>BORA</b> }))).toBe(
      "clique em <b>BORA</b> e pronto",
    );
  });

  it("segue a ORDEM DO IDIOMA, não a ordem do código", () => {
    // Esta é a razão do módulo existir: a mesma chamada, com a frase montada de
    // outro jeito, põe o nó no começo — costurado no JSX ele estaria preso ao meio.
    expect(html(rich(t, k("slot.reordered"), { botao: <b>BORA</b> }))).toBe(
      "<b>BORA</b> é o que você clica",
    );
  });

  it("aceita mais de um buraco", () => {
    expect(html(rich(t, k("two"), { a: <i>um</i>, b: <i>dois</i> }))).toBe(
      "<i>um</i> vem antes de <i>dois</i>",
    );
  });

  it("frase sem buraco passa inteira", () => {
    expect(html(rich(t, k("plain"), {}))).toBe("sem nada pra destacar");
  });

  it("entende **negrito** no texto entre os buracos", () => {
    expect(html(rich(t, k("mixed"), { link: <button>guia</button> }))).toBe(
      "baixe a <strong>Taxa de bits</strong> (<button>guia</button>) ou tire uma plataforma",
    );
  });
});

describe("bold", () => {
  it("põe em <strong> o que está entre asteriscos", () => {
    expect(html(bold(t, k("bold")))).toBe(
      "o OBS encoda <strong>uma vez</strong>. Daí:",
    );
  });

  it("aguenta vários destaques na mesma frase", () => {
    expect(html(bold(t, k("bold.many")))).toBe(
      "vá em <strong>Ferramentas</strong> e marque <strong>Ativar</strong>",
    );
  });

  it("destaca o valor JÁ interpolado — o {buraco} pode estar dentro do negrito", () => {
    expect(html(bold(t, k("bold.withVar"), { mbps: "8,5" }))).toBe(
      "sua internet sobe <strong>~8,5 Mbps</strong>",
    );
  });

  it("frase sem marca sai igual", () => {
    expect(html(bold(t, k("plain")))).toBe("sem nada pra destacar");
  });
});

describe("strong", () => {
  it("embrulha todo pedaço sem precisar repetir <strong> na chamada", () => {
    expect(html(strong(t, k("slot"), { botao: "BORA" }))).toBe(
      "clique em <strong>BORA</strong> e pronto",
    );
  });
});
