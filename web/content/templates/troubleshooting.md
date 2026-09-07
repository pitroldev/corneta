# Template: troubleshooting

Crie `{locale}/help/troubleshooting/{english-slug}.mdx` com o conteúdo do bloco
YAML abaixo, sem as cercas de código, começando por `---`. Escreva o corpo depois
do segundo `---`; não copie o título e as instruções deste template.

```yaml
---
contentId: help_change_me
title: Sintoma usando o nome real da interface
description: Descrição factual do sintoma e do cenário em que a ajuda se aplica.
summary: Primeiro teste seguro para confirmar o sintoma e encontrar a causa provável.
locale: pt-BR
collection: help
kind: troubleshooting
category: troubleshooting
slug: english-slug
status: draft
intent: support
updatedAt: 2026-08-01
reviewedAt: 2026-08-01
productVersion: 0.6.0
testedWith: []
reviewIntervalDays: 90
experimental: false
primaryQuery: sintoma localizado
related: []
sources: []
images: []
---
```

As datas e versões são exemplos. Antes de publicar, substitua-as por evidência
real e preencha `publishedAt`, `author` e `reviewedBy`, seguindo o
[contrato de autoria](../README.md#identidade-e-autoria). Não atribua uma revisão
antes que ela aconteça.

Estruture o corpo por decisão:

1. sintoma exato e estado esperado;
2. primeiro teste seguro, do mais provável e barato ao mais invasivo;
3. para cada ramo: causa provável → como confirmar → correção;
4. como saber que a correção funcionou;
5. quando desfazer a mudança;
6. quais dados sanitizados exportar para suporte;
7. o que nunca compartilhar.

Separe rede, renderização, codificação, autenticação e falha isolada por destino.
Não esconda hipóteses diferentes sob “reinicie tudo”. Screenshots mostram apenas
o estado que evita ambiguidade e seguem o protocolo de privacidade do README.
