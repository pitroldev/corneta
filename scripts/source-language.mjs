import ts from "typescript";

// High-confidence regression markers, not a natural-language classifier.
const portugueseWords = new Set(
  "acao acoes aguarda aguardando amostra amostras arquivo arquivos atualizar comentario comentarios configura configuracao configuracoes conectado conexao conecta dados declara depois descreve destino destinos encerrar enquanto entrada entradas erro erros escopo esperado falha falhas falhou fazer funciona imagem imagens invalido invalida janela janelas largura lista mensagem mensagens mostra mudar nao nome nomes numero numeros onde padrao primeiro propriedade quando quem removeu retorna saida saidas salva salvar salvando segredo segredos senha senhas tamanho ultrapassa usuario usuarios valores verifica verificar voce".split(
    " ",
  ),
);
const protectedNotice =
  /(?:@license|SPDX-License-Identifier|copyright|eslint-|@ts-|istanbul|c8 ignore|<reference\s|sourceMappingURL)/i;

export function languageIssue(text, kind) {
  if (kind === "comment" && protectedNotice.test(text)) return null;
  const prose =
    kind === "comment" ? text.replace(/`[^`]*`|https?:\/\/\S+/g, "") : text;
  const words =
    prose
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .match(/[\p{L}]+/gu) ?? [];
  if (
    (kind === "identifier" && /^_*oQue(?:_|$)/.test(text)) ||
    words.some((word) =>
      portugueseWords.has(word.normalize("NFD").replace(/\p{M}/gu, "")),
    )
  ) {
    return "english-source";
  }
  if (kind === "comment") {
    const plain = text
      .replace(/^\s*(?:\/\*+|\/\/!?\/?|\*)|\*\/\s*$/gm, "")
      .trim();
    if (
      /^[-=_*─━\s]{3,}$/.test(plain) ||
      /^(?:Set the value to (?:one|1)|Increment the counter|Return the result|Initialize the variables)\.?$/i.test(
        plain,
      )
    ) {
      return "redundant-comment";
    }
  }
  return null;
}

export const issueMessages = {
  "english-source":
    "Use English for developer prose and identifiers; preserve localized data separately.",
  "redundant-comment":
    "Remove decorative separators or comments that only narrate the statement.",
  "localized-log":
    "Keep localized UI messages out of technical logs; use an English diagnostic or stable code.",
  "source-syntax": "Cannot inspect invalid source; fix its syntax first.",
};

function callName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node))
    return `${callName(node.expression)}.${node.name.text}`;
  if (ts.isCallExpression(node)) return callName(node.expression);
  return "";
}

export function inspectJavaScript(source, filename = "source.ts") {
  const ast = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const editorialImplementation =
    filename.replaceAll("\\", "/").includes("web/lib/editorial/") &&
    !/\.test\.[cm]?[jt]sx?$/.test(filename);
  const jsxTextRanges = [];
  function collectJsxText(node) {
    if (ts.isJsxText(node)) jsxTextRanges.push([node.pos, node.end]);
    ts.forEachChild(node, collectJsxText);
  }
  collectJsxText(ast);
  const issues = new Map();
  function report(text, kind, offset) {
    const code = languageIssue(text, kind);
    if (code) issues.set(`${offset}:${code}`, { code, offset });
  }
  function literal(node) {
    if (!node) return;
    if (ts.isStringLiteralLike(node))
      report(node.text, "diagnostic", node.getStart(ast));
    else if (ts.isTemplateExpression(node)) {
      literal(node.head);
      for (const span of node.templateSpans) literal(span.literal);
    } else if (
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      report(node.text, "diagnostic", node.getStart(ast));
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      literal(node.left);
      literal(node.right);
    }
  }
  function binding(node) {
    if (!node) return;
    if (ts.isIdentifier(node))
      report(node.text, "identifier", node.getStart(ast));
    else if (ts.isBindingPattern(node))
      for (const element of node.elements) {
        if (ts.isBindingElement(element)) binding(element.name);
      }
  }
  function visit(node) {
    for (const range of [
      ...(ts.getLeadingCommentRanges(source, node.pos) ?? []),
      ...(ts.getTrailingCommentRanges(source, node.end) ?? []),
    ])
      if (
        !jsxTextRanges.some(
          ([start, end]) => start <= range.pos && range.pos < end,
        )
      )
        report(source.slice(range.pos, range.end), "comment", range.pos);
    if (
      ts.isVariableDeclaration(node) ||
      ts.isParameter(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isImportClause(node) ||
      ts.isImportSpecifier(node) ||
      ts.isNamespaceImport(node) ||
      ts.isImportEqualsDeclaration(node)
    )
      binding(node.name);
    if (
      ts.isNewExpression(node) &&
      /^(?:Error|TypeError|RangeError|SyntaxError|AggregateError)$/.test(
        callName(node.expression),
      )
    ) {
      literal(
        node.arguments?.[
          callName(node.expression) === "AggregateError" ? 1 : 0
        ],
      );
    }
    if (ts.isCallExpression(node)) {
      const name = callName(node.expression);
      if (
        /^(?:console|log|logger)\.(?:log|info|warn|error|debug|trace)$/.test(
          name,
        )
      )
        node.arguments.forEach(literal);
      if (
        /^(?:it|test|describe)(?:\.(?:only|skip|todo|concurrent|sequential|each))*$/.test(
          name,
        ) &&
        (!name.endsWith(".each") || ts.isCallExpression(node.expression))
      ) {
        literal(node.arguments[0]);
        const callback = node.arguments[1];
        if (
          ts.isCallExpression(node.expression) &&
          callback &&
          (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) &&
          callback.parameters[0]?.name.getText(ast) === "_"
        ) {
          const rows = node.expression.arguments[0];
          if (rows && ts.isArrayLiteralExpression(rows))
            for (const row of rows.elements) {
              if (ts.isArrayLiteralExpression(row)) literal(row.elements[0]);
            }
        }
      }
      if (name === "expect") literal(node.arguments[1]);
      if (/^assert(?:\.ok)?$/.test(name)) literal(node.arguments[1]);
      if (
        /^assert\.(?:equal|strictEqual|deepEqual|deepStrictEqual|match)$/.test(
          name,
        )
      )
        literal(node.arguments[2]);
      // These helpers construct editorial diagnostics, not translated article content.
      if (editorialImplementation && name === "assetIssue")
        literal(node.arguments[2]);
    }
    if (editorialImplementation && ts.isObjectLiteralExpression(node)) {
      const properties = node.properties.filter(ts.isPropertyAssignment);
      if (
        properties.some((p) => p.name.getText(ast) === "code") &&
        properties.some((p) => p.name.getText(ast) === "severity")
      ) {
        for (const property of properties)
          if (property.name.getText(ast) === "message")
            literal(property.initializer);
      }
    }
    for (const child of node.getChildren(ast)) visit(child);
  }
  for (const diagnostic of ast.parseDiagnostics)
    issues.set(`${diagnostic.start}:syntax`, {
      code: "source-syntax",
      offset: diagnostic.start ?? 0,
    });
  visit(ast);
  return [...issues.values()].sort((a, b) => a.offset - b.offset);
}
