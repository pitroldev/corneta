# Conteúdo editorial da Corneta

Esta pasta é a fonte versionada de **Guias** e **Ajuda**. Os arquivos públicos são
gerados a partir de MDX validado; conteúdo com `status: draft` nunca entra nas
listagens públicas, no sitemap, nos alternates ou no lookup das rotas.

## Estrutura

```text
content/
  assets/
    manifest.json
    originals/
  templates/
  pt-BR/
    guides/{category}/{slug}.mdx
    help/{category}/{slug}.mdx
  en/
    guides/{category}/{slug}.mdx
    help/{category}/{slug}.mdx
  people.json
```

Todos os segmentos de URL, categorias, slugs, diretórios de asset e filenames
devem estar em inglês, em lowercase kebab-case. Isso vale mesmo quando título,
texto, alt e legenda estão em português. Exemplos:

- `/guides/multistream/obs-multistream`;
- `/help/getting-started/first-stream`;
- `/en/help/troubleshooting/obs-not-found`;
- `corneta-platform-status-connected.webp`.

As categorias permitidas e o registro versionado
`EDITORIAL_ENGLISH_PATH_APPROVALS` são exportados por
`lib/editorial/constants.ts`. A regex valida apenas a forma lowercase ASCII
kebab-case: antes de criar um arquivo, uma pessoa deve confirmar que todo o path
está em inglês, adicioná-lo ao registro e incrementar sua versão. Não crie uma
categoria ou path apenas no filesystem: altere o contrato, a navegação e os
testes juntos.

## Contrato do frontmatter

Use um arquivo de `templates/` como ponto de partida. Um artigo publicado precisa
de todos os campos abaixo; drafts podem omitir os campos ainda não validados.

```yaml
contentId: guide_obs_multistream
title: Como fazer multistream no OBS Studio
description: Descrição única e factual para busca e compartilhamento.
summary: Resposta curta que aparece no começo do artigo.
locale: pt-BR
collection: guides
kind: guide
category: multistream
slug: obs-multistream
translationKey: obs-multistream
status: draft
intent: informational
author: Petro Cardoso
reviewedBy: Petro Cardoso
updatedAt: 2026-08-01
productVersion: 0.6.0
testedWith:
  - name: Corneta
    version: 0.6.0
    environment: Windows 11
reviewIntervalDays: 90
experimental: false
primaryQuery: como fazer multistream no OBS
related: []
sources:
  - title: Corneta product reference
    kind: internal
    repoPath: web/PRODUCT.md
    reviewedAt: 2026-08-01
images: []
```

Ao publicar, acrescente `publishedAt`. O auditor exige uma fonte revisada,
versão testada e autor e revisor registrados em `people.json`. Artigos não usam
imagem de capa; screenshots úteis entram no corpo, perto do passo que explicam.
Datas usam `YYYY-MM-DD`; não atualize `updatedAt` sem uma revisão substancial.

O `contentId` é um identificador estável de telemetria, não uma URL. Use
`help_...` ou `guide_...`, apenas com minúsculas, dígitos e underscores, e nunca
reaproveite um ID removido para outro assunto.

`people.json` registra o tipo factual (`person` ou `organization`) e a URL de cada
assinatura. Conteúdo publicado exige autor e revisor do tipo `person`, com URL;
não represente uma equipe ou empresa como `Person` nos dados estruturados.

O template da página já renderiza o `title` como H1. Portanto, o corpo MDX começa
em H2 (`##`). H2 e H3 formam o sumário automaticamente. Markdown GFM é aceito;
links internos devem usar a URL pública em inglês.

Imagens no corpo usam somente um identificador literal já declarado em
`frontmatter.images`:

```mdx
<ContentImage baseName="corneta-platform-status-connected" />
```

Não use `![]()`, `<img>` nem `<EditorialImage>` diretamente. O template resolve
src, alt, legenda, dimensões e proveniência pelo frontmatter. Cada item de
`images` deve aparecer exatamente uma vez no corpo.

## Traduções

`translationKey` só deve permanecer em conteúdo publicado quando existirem as
versões completas `pt-BR` e `en`, ambas publicadas, com a mesma coleção,
categoria e slug. O loader só expõe alternates quando esse par é recíproco.

Tradução não significa copiar screenshots no idioma errado. Cada imagem declara
`language: pt-BR`, `language: en` ou `language: none`. Use `none` apenas quando o
visual não contém texto nem interface localizada.

## Protocolo reproduzível de screenshots

Antes da captura:

1. use uma conta e um perfil exclusivos de demonstração;
2. preencha canais, títulos e mensagens com dados fictícios plausíveis;
3. registre versão da Corneta, versão do software externo, Windows, idioma,
   tema, escala e dimensão da janela;
4. desligue notificações e feche janelas fora do tutorial;
5. reproduza o estado desde o início e confirme o resultado esperado;
6. capture a imagem original em PNG, sem redimensionar nem anotar;
7. revise o original em 100% de zoom antes de produzir a derivada.

Uma imagem é reprovada se mostrar, mesmo parcialmente:

- stream key, token, senha, API key, cookie ou URL com credencial;
- e-mail, conta, chat, avatar ou nome de uma pessoa real;
- ID real de telemetria, operação, relatório ou erro;
- caminho local, username do Windows, IP ou notificação pessoal;
- watchlist, tela adjacente ou dado que não seja necessário para a tarefa.

Não use blur como única proteção de segredo. Prepare dados fictícios antes da
captura e prefira cortar a região. OCR e busca por padrões podem complementar,
mas nunca substituir, a revisão humana no arquivo original.

Screenshots de Twitch, YouTube, Kick e OBS só entram quando a localização visual
evita um erro real. Registre `capturedAt` e `externalUiReviewedAt`; para OBS,
registre também `sourceVersion` com a versão capturada. `productVersion` continua
reservado à versão da Corneta. Esses campos devem ser idênticos no frontmatter e
no manifesto. Confira as regras de marca atuais e refaça a captura quando a
interface mudar. Não copie imagens de centrais de ajuda.

## Pipeline e manifesto de assets

O master e a derivada são arquivos diferentes:

```text
content/assets/originals/multistream/obs-multistream-flow.png
public/images/editorial/multistream/obs-multistream-flow.webp
```

1. preserve o master sanitizado em `content/assets/originals/`;
2. exporte screenshot ou arte raster em WebP ou AVIF com o comando reproduzível;
   diagramas podem ser SVG;
3. mantenha cada derivada abaixo de **512 KiB**;
4. preserve proporção, legibilidade mobile e dimensões declaradas;
5. adicione master e todas as derivadas a `assets/manifest.json`;
6. copie os mesmos metadados para o item de `images` do artigo;
7. execute `pnpm content:check` dentro de `web`.

Exemplo executado a partir de `web/`:

```powershell
pnpm content:image -- --input assets/originals/multistream/obs-multistream-flow.png --output images/editorial/multistream/obs-multistream-flow.webp --width 1600 --quality 82
```

O comando lê somente dentro de `content/assets/originals`, grava somente dentro
de `public/images/editorial`, exige o mesmo `baseName`, recusa sobrescrever sem
`--force` e falha antes de gravar se ultrapassar 512 KiB. Copie `src`, largura,
altura e bytes exibidos para o manifesto; use `--force` apenas depois de revisar
a mudança da derivada.

O auditor rejeita PNG/JPEG como derivada pública, arquivos ausentes, nomes fora
da convenção, estouro de bytes, dimensões declaradas divergentes do manifesto,
dimensões reais divergentes do manifesto, idioma incompatível e asset não
registrado. Masters e derivadas também precisam ser imagens legíveis cujo formato
real corresponda à extensão; EXIF, XMP, IPTC, ICC, comentários e metadata de
Photoshop não podem permanecer nem no arquivo versionado nem no público.

SVG é analisado como XML estrito e limitado a uma allowlist passiva. Não use
scripts, `foreignObject`, handlers `on*`, CSS, animação, links ou recursos
externos; todo SVG deve ter exatamente um `<title>` e um `<desc>` diretos e não
vazios. `next/image` ainda negocia e otimiza o formato entregue ao navegador;
isso não elimina a obrigação de manter uma derivada pública enxuta, rastreável e
separada do master.

`baseName` deve ser idêntico ao nome, sem extensão, do master e da derivada. A
validação automática de sintaxe garante apenas lowercase ASCII kebab-case. A
revisão humana confirma que diretórios, filenames e `baseName` estão em inglês,
adiciona a tripla exata (`baseName`, `src`, `originalPath`) a
`EDITORIAL_ENGLISH_ASSET_PATH_APPROVALS` e incrementa a versão desse registro
antes de usá-la no frontmatter ou manifesto. Aprovar apenas o filename não aprova
seus diretórios. O frontmatter funciona como uso localizado do asset (alt e
legenda); o manifesto é a origem comum de procedência, direitos, datas, versão e
variantes.

Imagens geradas por IA são permitidas apenas como apoio abstrato. Nunca podem
simular a Corneta, OBS, uma plataforma, um erro, uma métrica ou prova de
funcionalidade. Registre modelo e data no manifesto. Para fluxos e explicações,
prefira um SVG próprio e mantenha a mesma informação em HTML próximo.

## Processo de publicação

1. valide intenção, sobreposição e `contentId`;
2. parta do template correto;
3. execute a tarefa na versão declarada;
4. escreva a resposta direta e depois os detalhes;
5. prepare fontes primárias e pacote visual;
6. faça revisão técnica e editorial com pessoas registradas;
7. troque para `status: published` apenas quando o auditor passar;
8. confirme canonical, imagem social e links no preview;
9. publique e revise no intervalo declarado.

Comparativos exigem teste hands-on recente e metodologia explícita.
Troubleshooting segue “sintoma → causa provável → como confirmar → correção”.
Não transforme recurso experimental em promessa estável.
