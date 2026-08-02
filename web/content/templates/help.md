# Template: help

Copie para `{locale}/help/{english-category}/{english-slug}.mdx`.

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
author: Petro Cardoso
reviewedBy: Petro Cardoso
updatedAt: 2026-08-01
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
