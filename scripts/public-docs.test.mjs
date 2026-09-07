import { existsSync, readFileSync } from "node:fs";
import { posix, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { markdownDestinations } from "./check-doc-links.mjs";
import { sourceFiles } from "./source-files.mjs";

const root = resolve(import.meta.dirname, "..");
const retiredNames = new Set(
  [
    "ALERTAS.md",
    "CHAT.md",
    "ENVIO.md",
    "YOUTUBE-AUTO.md",
    "RELATORIO-POS-LIVE.md",
    "DECISAO-OAUTH-VIA-API.md",
    "PLANEJAMENTO.md",
    "MONETIZACAO.md",
    "SLOGAN.md",
    "PROPOSTA-DE-VALOR.md",
    "DOMINIOS.md",
    "BUY-ME-A-COFFEE.md",
    "ANALISE-CONCORRENCIA.md",
    "PENDENCIAS.md",
    "RUNBOOK-BETA.md",
  ].map((name) => name.toLowerCase()),
);

function historicalDocument(file) {
  if (!/^docs\//i.test(file)) return false;
  const path = file.slice("docs/".length);
  return (
    /(?:^|\/)(?:PLANO-|FEATURE-|IDEIAS|AUDITORIA-|CORRECOES-|OTIMIZACOES-|IMPLEMENTACAO-|REVISAO-)/i.test(
      path,
    ) || retiredNames.has(posix.basename(path).toLowerCase())
  );
}

function indexedDocuments(source) {
  const paths = new Set();
  for (const { destination } of markdownDestinations(source)) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(destination)) continue;
    const path = decodeURIComponent(destination.split(/[?#]/, 1)[0]);
    const target = posix.normalize(
      path.startsWith("/") ? path.slice(1) : posix.join("docs", path),
    );
    if (target.startsWith("docs/") && target.endsWith(".md")) paths.add(target);
  }
  paths.delete("docs/README.md");
  return [...paths].sort();
}

describe("current public documentation", () => {
  const files = sourceFiles(root).filter((file) =>
    existsSync(resolve(root, file)),
  );

  it("keeps retired plans and dated implementation reports out of published sources", () => {
    expect(files.filter(historicalDocument)).toEqual([]);
  });

  it("does not restore one-off LP migration tools or remove the supported report smoke test", () => {
    for (const file of [
      "web/scripts/audit.mjs",
      "web/scripts/shot.mjs",
      "web/scripts/css-slice.mjs",
    ]) {
      expect(existsSync(resolve(root, file)), file).toBe(false);
    }
    expect(existsSync(resolve(root, "scripts/smoke-reports.mjs"))).toBe(true);
    const scripts = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8"),
    ).scripts;
    expect(scripts["smoke:reports"]).toBe("node scripts/smoke-reports.mjs");
  });

  it("uses the documentation index as the complete catalog, without another allowlist", () => {
    const documents = files.filter(
      (file) =>
        file.startsWith("docs/") &&
        file.endsWith(".md") &&
        file !== "docs/README.md",
    );
    expect(documents.length).toBeGreaterThan(0);
    expect(
      indexedDocuments(readFileSync(resolve(root, "docs/README.md"), "utf8")),
    ).toEqual(documents.sort());
  });

  it("does not retain formatting exceptions for absent source files", () => {
    const baseline = JSON.parse(
      readFileSync(resolve(root, ".format-baseline.json"), "utf8"),
    );
    const inventory = new Set(files);
    expect(
      Object.keys(baseline.files).filter((file) => !inventory.has(file)),
    ).toEqual([]);
  });

  it("recognizes retired families and exact names without banning current guides", () => {
    for (const name of [
      "PLANO-example.md",
      "FEATURE-example.md",
      "IDEIAS-v5.md",
      "ideias-v4/example.md",
      "AUDITORIA-example.md",
      "CORRECOES-example.md",
      "OTIMIZACOES-example.md",
      "IMPLEMENTACAO-example.md",
      "REVISAO-example.md",
      "archive/PLANO-example.md",
      "archive/ALERTAS.md",
      ...retiredNames,
    ])
      expect(historicalDocument(`docs/${name}`), name).toBe(true);
    for (const file of [
      "docs/PUBLICACAO.md",
      "docs/ARQUITETURA.md",
      "docs/RUNBOOK-POSTHOG.md",
      "web/content/README.md",
    ])
      expect(historicalDocument(file), file).toBe(false);
  });

  it("ignores example and external links while resolving local index destinations", () => {
    expect(
      indexedDocuments(
        "[Current](PUBLICACAO.md#checks) [Again](/docs/PUBLICACAO.md) " +
          "[Root](../README.md) [External](https://example.com/guide.md) " +
          "`[Example](PLANO-example.md)`\n[Config][config]\n" +
          "[config]: CONFIGURACAO.md\n[Unused]: UNUSED.md",
      ),
    ).toEqual(["docs/CONFIGURACAO.md", "docs/PUBLICACAO.md"]);
  });
});
