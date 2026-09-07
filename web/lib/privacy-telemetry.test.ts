import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Contrato textual, sem SDK nem rede: bloqueia a regressão que fazia o resumo e
// a seção do app prometerem opt-in enquanto a seção de bases dizia opt-out.
function privacySource(locale: "pt" | "en") {
  return readFileSync(
    new URL(
      `../app/(legal)/[locale]/legal/_content/privacy.${locale}.tsx`,
      import.meta.url,
    ),
    "utf8",
  ).replace(/\s+/g, " ");
}

describe("public telemetry disclosure parity", () => {
  it("describes the active default and opposition in Portuguese", () => {
    const source = privacySource("pt");
    expect(source).toContain(
      "vêm ligados por padrão quando a coleta está configurada",
    );
    expect(source).toContain("independentes, ligadas por padrão");
    expect(source).toContain("inclusive antes de uma escolha no primeiro uso");
    expect(source).toContain("Desligar não desfaz uma requisição já iniciada");
    expect(source).not.toContain("só são enviados se você ativar");
    expect(source).not.toContain("independentes, desligados por padrão");
    expect(source).not.toContain("você der consentimento");
    expect(source).not.toContain("UUID nasce somente ao ativar");
  });

  it("describes the same default and opposition in English", () => {
    const source = privacySource("en");
    expect(source).toContain(
      "start on by default when collection is configured",
    );
    expect(source).toContain("and both start on");
    expect(source).toContain("including before a choice on first use");
    expect(source).toContain("does not undo a request already in flight");
    expect(source).not.toContain("only if you enable each purpose");
    expect(source).not.toContain("both start off");
    expect(source).not.toContain("may be sent if you consent");
    expect(source).not.toContain("UUID is created only after you enable");
  });
});
