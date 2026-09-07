# Template: guide

Crie `{locale}/guides/{english-category}/{english-slug}.mdx` com o conteúdo do
bloco YAML abaixo, sem as cercas de código, começando por `---`. Escreva o corpo
depois do segundo `---`; não copie o título e as instruções deste template.

```yaml
---
contentId: guide_change_me
title: Título localizado que responde à consulta
description: Descrição factual e única entre 40 e 180 caracteres.
summary: Resposta direta em duas a quatro frases.
locale: pt-BR
collection: guides
kind: guide
category: multistream
slug: english-slug
status: draft
intent: informational
updatedAt: 2026-08-01
reviewedAt: 2026-08-01
productVersion: 0.6.0
testedWith: []
reviewIntervalDays: 90
experimental: false
primaryQuery: consulta principal localizada
related: []
sources: []
images: []
---
```

As datas e versões são exemplos. Antes de publicar, substitua-as por evidência
real e preencha `publishedAt`, `author` e `reviewedBy`, seguindo o
[contrato de autoria](../README.md#identidade-e-autoria). Não atribua uma revisão
antes que ela aconteça.

Ordem do corpo:

1. resposta direta e cenário em que ela se aplica;
2. versão, ambiente e método de teste;
3. decisão, cálculo ou procedimento reproduzível;
4. evidência própria e fontes primárias próximas da afirmação;
5. limites, inclusive quando a Corneta não é a melhor opção;
6. próximo passo e link relacionado contextual.

Use H2 e H3; o template da rota cria o H1.

Para uma imagem inline, declare-a em `frontmatter.images` e use uma única vez:
`<ContentImage baseName="english-base-name" />`. Não use sintaxe Markdown ou
`<img>`.
