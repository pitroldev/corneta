import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkSourceLanguage,
  inspectSource,
} from "./check-source-language.mjs";
import { inspectJavaScript, languageIssue } from "./source-language.mjs";
import { inspectRust } from "./source-language-rust.mjs";

describe("source language regression markers", () => {
  it.each([
    "// salva os dados",
    "const [quem, oQue, escopo] = signals;",
    "const oQue = signal;",
    "function salvar(numero) { return numero; }",
    'import { value as escopo } from "./api";',
    'it("verifica erro", () => {});',
    'it.each([["propriedade", "a", "b"]])("checks %s", (_, before, after) => {});',
    'console.error("Não foi possível salvar");',
    'throw new Error("arquivo invalido");',
    "const view = <div>{/* mostra dados */}</div>;",
  ])("rejects technical Portuguese in %s", (source) => {
    expect(
      inspectJavaScript(source, "contract.test.tsx").some(
        (issue) => issue.code === "english-source",
      ),
    ).toBe(true);
  });

  it.each([
    "const { senha: password } = storedConfiguration;",
    'const message = "Não foi possível salvar";',
    "const message = `// dados: ${value}`;",
    "const marker = /\\/\\/ dados/;",
    "const view = <div>// dados</div>;",
    "const view = <div>/* dados */</div>;",
    'const view = <div>{"// dados"}</div>;',
    'assert.strictEqual(message, "mensagem");',
    'assert.equal(config.name, "nome");',
    'assert.deepEqual(message, "mensagem");',
    'expect(message).toBe("mensagem");',
    'it.each(["mensagem"])("renders %s", (input) => {});',
    'const fixture = { code: "E42", severity: "warning", message: "Não foi possível carregar dados" };',
    "const data = { total: 1, local: true, Mesa: true };",
    "// Preserve proper-name accents such as São Paulo.\nconst value = 1;",
    "// Keep the persisted `senha` field for compatibility.\nconst value = 1;",
    "// SAFETY: The buffer outlives the pointer.\nconst value = 1;",
    "// TODOs are emitted as editor annotations.\nconst value = 1;",
    "// Preserve the audio tempo.\nconst tempo = 1;",
    "// @ts-expect-error intentional protocol fixture\nconst value = 1;",
    "/* Copyright Example. Todos os direitos reservados. */\nconst value = 1;",
  ])("preserves localized data, contracts and notices in %s", (source) => {
    expect(inspectJavaScript(source, "contract.test.tsx")).toEqual([]);
  });

  it("checks assertion messages without treating expected values as prose", () => {
    expect(
      inspectJavaScript(
        'assert.equal(actual, "mensagem", "mensagem invalida");',
      ),
    ).toHaveLength(1);
    expect(
      inspectJavaScript('assert.ok(actual, "dados invalidos");'),
    ).toHaveLength(1);
  });

  it("checks static fragments of editorial diagnostics", () => {
    const file = "web/lib/editorial/audit.ts";
    expect(
      inspectJavaScript(
        'assetIssue(document, "E42", `imagem ${language} does not match content`);',
        file,
      ),
    ).toHaveLength(1);
    expect(
      inspectJavaScript(
        'const issue = { severity: "error", code: "E42", message: `${path} declara ${size} bytes` };',
        file,
      ),
    ).toHaveLength(1);
    expect(
      inspectJavaScript(
        'const issue = { severity: "error", code: "E42", message: `${path} declares ${size} bytes` };',
        file,
      ),
    ).toEqual([]);
  });

  it("rejects narrow narration patterns without claiming to grade all comments", () => {
    expect(languageIssue("// Set the value to one.", "comment")).toBe(
      "redundant-comment",
    );
    expect(languageIssue("// ----------------", "comment")).toBe(
      "redundant-comment",
    );
    expect(
      languageIssue(
        "// Initialize once because StrictMode mounts twice.",
        "comment",
      ),
    ).toBeNull();
  });

  it("fails closed on invalid syntax", () => {
    expect(
      inspectJavaScript("const = ;").some(
        (issue) => issue.code === "source-syntax",
      ),
    ).toBe(true);
    expect(inspectRust('let value = "')).toEqual([
      { code: "source-syntax", offset: 0 },
    ]);
    expect(inspectRust("/* unclosed")).toEqual([
      { code: "source-syntax", offset: 0 },
    ]);
  });
});

describe("native and embedded source language", () => {
  it("preserves raw strings, Unicode characters, lifetimes and localized fixtures", () => {
    expect(
      inspectRust(
        `fn render<'a>(value: &'a str) { let sample = r###"/* dados */ // mensagem"###; let letter = 'ç'; let quote = '\\''; let title = "arquivo"; }`,
      ),
    ).toEqual([]);
  });
  it("checks Rust identifiers, nested comments and diagnostic macros", () => {
    expect(inspectRust("let escopo = value;")).toHaveLength(1);
    expect(inspectRust("/* invariant /* dados */ */")).toHaveLength(1);
    expect(
      inspectRust('log::warn!(/* format */ "dados indisponiveis");'),
    ).toHaveLength(1);
    expect(
      inspectRust('log::error!("{}", Msg::EngineMediamtxDied.now());').map(
        (issue) => issue.code,
      ),
    ).toContain("localized-log");
    expect(inspectRust('log::error!("engine: {}", failure.code());')).toEqual(
      [],
    );
  });
  it.each([
    ["sample.css", 'a { content: "/* dados */"; }', 0],
    ["sample.css", "/* dados */ a { color: red; }", 1],
    ["sample.html", "<div>dados</div>", 0],
    ["sample.html", "<!-- dados --><div>Content</div>", 1],
    [
      "sample.html",
      '<script type="application/json">{"message":"dados"}</script>',
      0,
    ],
    ["sample.html", '<script>const message = "// dados";</script>', 0],
    ["sample.html", '<script>// dados\nconst message = "value";</script>', 1],
    ["sample.html", '<style>a { content: "/* dados */"; }</style>', 0],
    ["sample.html", "<style>/* dados */ a { color: red; }</style>", 1],
  ])(
    "inspects %s without treating payload as code",
    async (file, source, count) => {
      expect(await inspectSource(source, file)).toHaveLength(count);
    },
  );

  it("checks exported source archives without loading dotenv or generated trees", async () => {
    const root = mkdtempSync(join(tmpdir(), "corneta-source-language-test-"));
    try {
      mkdirSync(join(root, "src"));
      mkdirSync(join(root, "node_modules"));
      writeFileSync(join(root, "src/example.ts"), "const numero = 1;");
      writeFileSync(
        join(root, ".env.ts"),
        "invalid source that must not be read",
      );
      writeFileSync(
        join(root, "node_modules/third-party.ts"),
        "invalid source",
      );
      const result = await checkSourceLanguage(root);
      expect(result.checked).toBe(1);
      expect(result.failures).toEqual([
        { file: "src/example.ts", line: 1, code: "english-source" },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
