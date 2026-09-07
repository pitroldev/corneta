# Template: help

Crie `{locale}/help/{english-category}/{english-slug}.mdx` com o conteúdo do
bloco YAML abaixo, sem as cercas de código, começando por `---`. Escreva o corpo
depois do segundo `---`; não copie o título e as instruções deste template.

```yaml
---
contentId: help_change_me
title: Resultado ou tarefa usando o nome real da interface
description: Descrição factual e única entre 40 e 180 caracteres.
summary: Resultado esperado e condição principal para alcançá-lo.
locale: pt-BR
collection: help
kind: help
category: getting-started
slug: english-slug
status: draft
intent: support
updatedAt: 2026-08-01
reviewedAt: 2026-08-01
productVersion: 0.6.0
testedWith: []
reviewIntervalDays: 90
experimental: false
primaryQuery: tarefa localizada
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

1. resultado esperado;
2. “aplica-se a” e pré-requisitos;
3. passos numerados com o estado esperado nos pontos críticos;
4. sintomas, causas, confirmação e correção;
5. dados seguros para coletar se o problema continuar;
6. aviso explícito sobre o que nunca compartilhar.

Use exatamente os nomes visíveis na versão testada.

Cada imagem inline deve estar em `frontmatter.images` e aparecer uma vez como
`<ContentImage baseName="english-base-name" />`. O hero não entra no corpo.
