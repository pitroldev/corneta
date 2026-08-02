# Template: guide

Copie este arquivo para `{locale}/guides/{english-category}/{english-slug}.mdx`.
Remova todas as instruções antes de publicar.

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
author: Petro Cardoso
reviewedBy: Petro Cardoso
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
