---
name: Corneta
description: Uma live. Várias comunidades. Tudo no seu controle.
colors:
  charcoal: "#100b07"
  surface: "#1a130c"
  surface-raised: "#221a10"
  surface-high: "#2e2314"
  panel: "#0b0805"
  border: "#3d301c"
  border-soft: "#281f12"
  ink-on-dark: "#fcf3e3"
  muted-on-dark: "#c6b69b"
  faint-on-dark: "#8c7a60"
  faint-on-raised: "#a08d70"
  paper: "#f3ead7"
  paper-raised: "#fffaf0"
  paper-line: "#cbb88f"
  ink: "#2a1c0a"
  ink-muted: "#5f4e36"
  ink-faint: "#6f5d3f"
  brass: "#ffb323"
  brass-strong: "#ffc857"
  brass-ink: "#2a1c00"
  tomato: "#ff5a36"
  tomato-strong: "#ff7a55"
  tomato-ink: "#b83218"
  live: "#ff4733"
  ok: "#56e39b"
  warn: "#ffc23d"
  bad: "#ff5e57"
  slate-brb: "#14100a"
  white: "#ffffff"
  twitch: "#9146ff"
  youtube: "#ff0000"
  kick: "#53fc18"
  facebook: "#1877f2"
  tiktok: "#25f4ee"
  instagram: "#e1306c"
  x: "#1d9bf0"
  custom: "#8b93a7"
typography:
  display:
    fontFamily: "var(--font-baloo), 'Segoe UI', system-ui, sans-serif"
    fontSize: "clamp(3rem, 6.4vw, 5.7rem)"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "var(--font-baloo), 'Segoe UI', system-ui, sans-serif"
    fontSize: "clamp(2.35rem, 4.2vw, 3.9rem)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.03em"
  title:
    fontFamily: "var(--font-baloo), 'Segoe UI', system-ui, sans-serif"
    fontSize: "clamp(1.3rem, 2.1vw, 1.8rem)"
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  body:
    fontFamily: "var(--font-inter), 'Segoe UI', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.68
  label:
    fontFamily: "var(--font-inter), 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.1em"
  action:
    fontFamily: "var(--font-baloo), 'Segoe UI', system-ui, sans-serif"
    fontSize: "1.24rem"
    fontWeight: 800
    lineHeight: 1
  ui:
    fontFamily: "var(--font-baloo), 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 700
    lineHeight: 1.15
  micro:
    fontFamily: "var(--font-inter), 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.62rem"
    fontWeight: 550
    lineHeight: 1.3
  mono:
    fontFamily: "ui-monospace, 'Cascadia Mono', monospace"
    fontSize: "0.7rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: "4px"
  md: "7px"
  lg: "10px"
  xl: "14px"
  pill: "999px"
spacing:
  control: "8px"
  compact: "10px"
  snug: "14px"
  component: "18px"
  panel: "22px"
  group: "26px"
  row: "46px"
  section: "clamp(78px, 8vw, 122px)"
components:
  button-download:
    backgroundColor: "{colors.tomato}"
    textColor: "{colors.brass-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    padding: "0 26px"
    height: "70px"
  button-download-hover:
    backgroundColor: "{colors.tomato-strong}"
    textColor: "{colors.brass-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    padding: "0 26px"
    height: "70px"
  button-download-compact:
    backgroundColor: "{colors.tomato}"
    textColor: "{colors.brass-ink}"
    rounded: "{rounded.sm}"
    padding: "0 15px"
    height: "44px"
  sticker:
    backgroundColor: "{colors.brass}"
    textColor: "{colors.brass-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "7px 12px"
  sticker-tomato:
    backgroundColor: "{colors.tomato}"
    textColor: "{colors.brass-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "7px 12px"
  chip-state:
    backgroundColor: "{colors.brass}"
    textColor: "{colors.brass-ink}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
  panel-dark:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-on-dark}"
    rounded: "{rounded.lg}"
    padding: "20px"
  panel-brass:
    backgroundColor: "{colors.brass}"
    textColor: "{colors.brass-ink}"
    rounded: "{rounded.xl}"
    padding: "clamp(26px, 3.5vw, 42px)"
  destination-row:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink-on-dark}"
    rounded: "{rounded.md}"
    padding: "12px 13px"
  app-window:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-on-dark}"
    rounded: "{rounded.xl}"
---

# Design System: Corneta

## Política dos arquivos de design

Este documento orienta o trabalho visual do site; os estilos/componentes em `app/` implementam a interface. [PRODUCT.md](PRODUCT.md) delimita o que o produto pode afirmar. O [snapshot `.impeccable/design.json`](.impeccable/design.json), schema 2 e data registrada em `generatedAt`, é preservado como material de intercâmbio/referência da ferramenta de design, não como configuração do Next.js nem fonte automática de CSS.

O snapshot guarda a composição documentada na sua data, incluindo exemplos HTML/CSS. Ele não certifica que esses exemplos estejam idênticos à interface atual. Para implementar mudanças, confira primeiro este documento e o código; não copie o export antigo sobre os componentes. A ferramenta de design não é requisito para contribuir, testar ou compilar, e não existe comando no build que regenere esse arquivo.

Ao atualizar o snapshot pela ferramenta ou manualmente, revise schema, exemplos e narrativa contra este documento, mantenha a data verdadeira da atualização e envie o diff no mesmo PR da decisão visual correspondente. Não atualize a data apenas por formatar JSON. Somente `web/.impeccable/design.json` é fonte compartilhada: os outros arquivos de estado da ferramenta são ignorados. O inventário de fontes preserva esse arquivo tanto em Git quanto em snapshots sem `.git`, sem seguir links simbólicos/junctions.

## Overview

**Creative North Star: "O pôster do megafone"**

A Corneta é um app de desktop desenhado como pôster de gibi impresso, e a LP é a mesma
gráfica: blocos sólidos de cor, sombras **duras** (deslocadas, sem desfoque), cantos secos e
tipografia gorda que fala alto. O mundo não é inventado para a página — ele é herdado de
`src/index.css` do app. Quem baixa reconhece a tela; quem chega pela LP já viu o produto.

A LP abre na **mesa**: papel (`#f3ead7`, o tema claro do app) com a grade de pontos, o mesmo
cenário dos vídeos da Corneta, e o vídeo de apresentação preso nela com fita, no centro. Depois
ela alterna a mesa com o palco, o breu quente do app (`#100b07`) com meio-tom impresso. O latão
manda: é o traço de marca-texto do título, o play do vídeo, o item ativo, o adesivo torto e a
régua sobre os números. O tomate é o pedido de ação — baixar. Menta reporta saúde, âmbar
reporta reconexão. Nada de azul, nada de glow, nada de sombra difusa decorativa: esses efeitos
não pertencem à linguagem visual do site.

A voz é brasileira e direta, sem virar infantil. Baloo 2 fala; Inter explica e opera. As telas
do app na página são recortes reais com dados de exemplo, rotulados assim, e a foto do vídeo
traz o selo "imagem ilustrativa" no próprio quadro — a honestidade é parte do tom da marca. Os textos seguem o
[guia de tom de voz](../docs/TOM-DE-VOZ.md).

**Key Characteristics:**

- A mesa de papel com grade de pontos no herói; palco escuro com meio-tom nas faixas de produto.
- Sombras duras de 3–10px sem desfoque; a peça parece adesivo colado, não elemento flutuante.
- Blocos sólidos de latão com tinta escura — inclusive o play do vídeo.
- Cantos secos (4–14px). Pílula só para pontos de estado e ondas sonoras.
- Logos oficiais das plataformas em chips de marca, iguais aos do app.
- O vídeo da Corneta no centro e recortes das telas reais do app como prova, não mockup genérico.

## Colors

Paleta de duas temperaturas: o breu do estúdio e o papel da gráfica, com latão e tomate
carregando marca e ação.

### Primary

- **Breu Quente** (`#100b07`): fundo do palco — régua dos quatro passos, plataformas, CTA
  final, rodapé e as superfícies mais escuras do app. Sempre com o meio-tom de latão a 5%.
- **Latão** (`#ffb323`): a cor da marca. Traço de marca-texto do título, play do vídeo,
  item ativo, adesivos, réguas sobre números, painel da "conta honesta" e
  ícone da corneta.

### Secondary

- **Tomate** (`#ff5a36`): reservado à ação — baixar para Windows — e ao adesivo do que é
  experimental. Nunca decora um bloco que não pede clique; o play do vídeo é latão.
- **Tinta de Latão** (`#2a1c00`): a tinta escura que sempre acompanha o latão (texto sobre
  latão, sombra dura sobre painel escuro).

### Tertiary

- **Menta** (`#56e39b`): destino no ar, folga de upload, itens confirmados. Não compete com a ação.
- **Âmbar de Aviso** (`#ffc23d`): reconectando, "pode falhar". A cor da ressalva honesta.
- **Vermelho AO VIVO** (`#ff4733`): só o ponto pulsante de transmissão no ar.

### Neutral

- **Superfície** (`#1a130c`): painel padrão sobre o palco e ladrilho das plataformas.
- **Superfície Elevada** (`#221a10`): linhas e controles dentro de painéis escuros.
- **Superfície Alta** (`#2e2314`): estado apagado (interruptor desligado, destino caído).
- **Painel Fundo** (`#0b0805`): titlebar, sidebar, coluna de chat, header e rodapé. É também a
  cor de toda sombra dura sobre fundo escuro.
- **Creme** (`#fcf3e3`) / **Creme Fosco** (`#c6b69b`) / **Creme Apagado** (`#8c7a60`): texto
  sobre o escuro, em três níveis. Sobre superfície elevada (`#1a130c`/`#221a10`) o apagado sobe
  para **Creme Apagado Elevado** (`#a08d70`), senão o contraste cai abaixo de AA.
- **Papel** (`#f3ead7`) e **Papel Claro** (`#fffaf0`): faixas de leitura; alternam entre si
  quando duas seções claras se encostam.
- **Tinta** (`#2a1c0a`) / **Tinta Fosca** (`#5f4e36`) / **Tinta Apagada** (`#6f5d3f`): texto
  sobre papel. **Fio de Papel** (`#cbb88f`) separa linhas claras.
- **Tomate Tinta** (`#b83218`): kicker sobre papel, onde o tomate puro não teria contraste.

### Named Rules

**A Regra dos Dois Trabalhos.** Latão é marca e destaque; tomate é ação. Se um bloco de tomate
não abre um download nem entra no ar, ele está errado. Menta reporta saúde, âmbar reporta
ressalva — nunca o contrário.

**A Regra do Sem Azul.** O sistema não tem azul. Roteamento, links e estados usam latão, menta
ou âmbar.

**A Regra da Tinta sobre Cor.** Todo bloco saturado (latão, tomate, menta, âmbar) recebe texto
em tinta escura (`#2a1c00` ou `#0b0805`), não branco. Os recortes das telas do app ficam como
o app é, e por isso não seguem esta regra.

## Typography

**Display Font:** Baloo 2 (com `Segoe UI`, system-ui, sans-serif)
**Body Font:** Inter (com `Segoe UI`, system-ui, sans-serif)

**Character:** Baloo 2 é gorda, redonda e falada — é a corneta gritando. Inter é a voz que
explica a conta de upload sem drama. As duas são exatamente as fontes do app, então a LP e o
produto soam iguais.

### Hierarchy

- **Display** (800, `clamp(3rem, 6.4vw, 5.7rem)`, 0.92, -0.035em): só a promessa do herói, em
  duas linhas centralizadas, a segunda sublinhada por um traço de marca-texto em latão.
- **Headline** (800, `clamp(2.35rem, 4.2vw, 3.9rem)`, 0.98): viradas de seção e CTA final. Em
  coluna estreita (layout de duas colunas) desce para `clamp(2.1rem, 3.2vw, 3.05rem)`.
- **Title** (800, `clamp(1.3rem, 2.1vw, 1.8rem)`, 1.08): título de passo e de recurso.
- **Body** (500, `1rem`, 1.68): explicações e ressalvas; medida entre 46ch e 68ch.
- **Label** (800, `0.72rem`, `0.1em`, caixa alta): kicker, rótulo de painel, adesivo e estado.
- **Action** (Baloo 800, `1.24rem`): botão de download. O botão fala com a fonte da marca, não
  com a do corpo.
- **UI** (Baloo 700, `0.9rem`) e **Micro** (Inter 550, `0.62rem`): a escala interna do app.
  Ela só aparece em superfície de produto desenhada no site; a LP mostra o produto por recortes
  das telas reais, então o texto da página nunca desce para lá.

- **Mono** (`ui-monospace`, `0.7rem`): só valor copiável. Monoespaçado aqui é dado, não
  fantasia de "técnico".

### Named Rules

**A Regra de Quem Fala.** Baloo 2 para promessas, nomes e botões; Inter para tudo que o
streamer precisa entender ou operar. Um parágrafo em Baloo é erro.

## Layout

Casca central de no máximo 1220px com 3rem de goteira, apertando para 2.5rem abaixo de 980px e
2rem abaixo de 760px. Seções respiram `clamp(78px, 8vw, 122px)`; painéis e superfícies de
produto trabalham com 8–26px internos.

O primeiro viewport é a mesa: adesivo, título de duas linhas centralizado, pitch curto e o
vídeo grande no centro (até 1140px), preso com fita, e o botão de download logo abaixo dele.
Nada de texto de apoio entre o vídeo e o botão além da linha "Windows 10/11 · sem cadastro". No
celular o vídeo ocupa a largura e as fitas somem.

Depois do herói, nesta ordem: a régua escura dos quatro passos (número de latão, título, uma
frase e o atalho pro trecho do vídeo); o mosaico de recursos no papel, com recortes reais e uma
linha de chips "E mais"; o paredão de plataformas no escuro; na mesa, o que roda no seu PC
(título, uma frase e três chips de confiança), o painel de latão da conta honesta com o recorte
da tela Qualidade do app (no celular, só o modo recomendado) e uma linha sobre as contas com o
link da política de privacidade, onde mora o detalhe de cada permissão; as dúvidas — oito perguntas
numeradas, todas fechadas, com a coluna do título fixa ao rolar e os cartões de guias e ajuda
nela (no celular eles vêm depois das perguntas); e o CTA final. Abaixo de 980px as colunas duplas e o mosaico
colapsam em uma coluna; no celular, cada passo vira uma linha com o número ao lado.

**A Regra da Frase Única.** Passo e cartão de recurso têm título e uma frase; o recorte da tela
faz o resto. Ressalva cabe numa linha (a do Guardião é uma); o que de fato precisa de mais
palavras — as permissões das contas — fica na política de privacidade, com uma linha e o link na
página, nunca num parágrafo de venda. O FAQ não repete o que a página já mostra (plataformas, overlay, vídeo em pé). Se a página repete
a mesma promessa em duas seções, uma delas sai.

**A Regra do Palco antes da Grade.** Comece por uma cena de produto funcionando — o vídeo — ou
por uma sequência ordenada. Nunca por uma grade de cards de ícone + título + texto.

**A Regra do Ritmo Alternado.** Duas seções claras encostadas trocam de tom (`#f3ead7` ↔
`#fffaf0`); duas escuras encostadas ganham uma faixa de latão ou tomate entre elas.

## Elevation & Depth

Profundidade é impressão, não luz: todo relevo é uma sombra **dura** deslocada, sem desfoque,
como tinta fora de registro — inclusive a moldura do vídeo. Superfícies de leitura são planas e
se separam por fio ou troca de tom.

### Shadow Vocabulary

- **Pop** (`box-shadow: 4px 4px 0 0 #0b0805`): peça padrão sobre superfície escura — adesivos,
  faixa AO VIVO, blocos de estatística, botão BORA.
- **Pop Pequeno** (`box-shadow: 3px 3px 0 0 #0b0805`): chips de confiança e glifos de plataforma.
- **Pop de Latão** (`box-shadow: 4px 4px 0 0 #2a1c00`): peças de latão sobre painel escuro
  (marca, item ativo, adesivo, botão compacto do header).
- **Pop de Tinta** (`box-shadow: 4px 4px 0 0 #2a1c0a` / `7px 7px` na versão grande): painéis
  escuros e blocos pousados sobre papel.
- **Pop Creme** (`box-shadow: 4px 4px 0 0 #fcf3e3`): só o botão de download sobre o palco
  escuro, onde uma sombra escura desapareceria.
- **Desregistro de Título** (`box-shadow: 7px 7px 0 0 #ff5a36`): exclusivo da laje de latão
  (`Slab`, na página 404) — o tomate atrás do latão imita a impressão fora de registro.
- **Moldura do Vídeo** (`box-shadow: 10px 10px 0 0 #2a1c0a`): a maior sombra do sistema, só
  para o vídeo sobre a mesa; cai para 6px no celular.

### Named Rules

**A Regra da Sombra Seca.** Sombra tem offset e não tem blur. Se apareceu `blur`, virou glow — e
glow é o mundo antigo. A fita que prende o vídeo é papel chapado, sem sombra.

**A Regra do Offset que Aparece.** A cor da sombra depende do fundo: `#0b0805` sobre o escuro,
`#2a1c0a` sobre papel, `#fcf3e3` para o botão de ação no palco. Sombra invisível é sombra errada.

## Shapes

Geometria seca: 4px em indicadores e adesivos, 7px em controles, linhas e botões, 10px em
painéis, 14px em janelas e campos de destaque. Nada acima de 14px. Pílula (`999px`) só em ponto
de estado, polegar de interruptor e ondas sonoras. Bordas existem para separar zonas de app
(1px `#3d301c` / `#281f12`), para as réguas editoriais no papel (2–3px de tinta cheia) e
como moldura de tinta de 3px de peça pousada na mesa (vídeo, cartão de recurso), sempre junto
do Pop de Tinta. Borda colorida não contorna nada.

A inclinação é material do sistema: adesivos giram entre -3° e +2°. A marca usa um quadrado
de latão inclinado a -6°, contorno e sombra sólida em tinta de latão, sem desfoque. A corneta
acompanha a inclinação; o nome permanece reto. Em ícones exportados, a margem transparente
preserva os cantos e a sombra. Sempre em peça pequena e sólida — texto corrido nunca gira.

**A Regra do Canto Seco.** Se o raio passou de 14px, o desenho saiu do mundo. Pílula é estado,
não silhueta.

## Components

### Buttons

- **Shape:** retângulo de canto seco (7px), 70px de altura no dock do herói, 64px no CTA final,
  44px e 4px de canto na versão compacta do header.
- **Primary (download):** tomate `#ff5a36` com tinta `#2a1c00`, fonte Baloo, sombra Pop Creme
  sobre o palco (Pop de Latão na versão compacta do header).
- **Hover / Active:** hover clareia para `#ff7a55`; o clique **afunda** — `translate(4px, 4px)`
  e a sombra vai a zero, em 90ms. É o mesmo gesto do botão do app.
- **Play do vídeo:** quadrado de latão de canto 14px, borda de tinta de 3px, girado -6° como a
  marca, sombra dura de tinta; endireita no hover e afunda no clique.
- **Focus:** traço de latão de 3px com offset de 3px; sobre latão o traço vira tinta escura. Na
  mesa, onde o latão some contra o papel, o traço é tomate.

### Chips

- **Adesivo (`.sticker`):** bloco de latão com tinta escura, caixa alta 0.72rem, sombra Pop de
  Latão e rotação de -2.2°. A variante tomate gira +1.8° e mantém a tinta escura.
- **Chip de estado (`.chip`):** bloco sólido pequeno; menta = testado/no ar, âmbar = pode
  falhar, superfície alta = neutro. Texto sempre em tinta escura.
- **Ladrilho de destino:** superfície com o glifo oficial da plataforma na cor da marca (44px,
  canto 4px, sombra Pop Pequeno) e o nome em Baloo. TikTok, Instagram e X levam o mesmo adesivo
  "experimental" que o app mostra neles, e a ressalva vem numa linha só, embaixo do paredão. A
  página **não** classifica destinos por status interno de validação: nenhum selo de “testado”,
  “pendente” ou “pode falhar” aparece sobre eles.

### Cards / Containers

- **Corner Style:** 10px em painel e recorte, 14px em cartão, moldura do vídeo e painel de latão.
- **Background:** `#1a130c` para painel escuro no papel, `#221a10` para linhas internas,
  latão para o painel da "conta honesta".
- **Shadow Strategy:** uma sombra dura por peça, cor conforme o fundo (ver Elevation).
- **Border:** entre zonas de app (1px), como régua editorial no papel (2–3px) e como moldura de
  tinta de 3px da peça pousada na mesa.
- **Internal Padding:** 18–26px é a faixa recorrente.

### Navigation

Header colado no topo em `#0b0805` translúcido com fio `#281f12`. Links em Inter 650 creme
fosco; no hover o texto vira creme e uma régua de latão de 3px cresce da esquerda. Abaixo de
760px a navegação sai e sobra a ação compacta.

### Signature: o vídeo na mesa

A peça central é o vídeo de apresentação da Corneta (o mesmo "papel sobre a mesa" dos anúncios),
na versão do idioma da página. É um `<video>` nativo com controles e pôster — o quadro "seu PC →
Corneta → Twitch, YouTube e Kick" — que toca sem JavaScript; com JavaScript entram a capa com o
play de latão e a duração, e os atalhos "ver no vídeo" dos passos. Na capa, o pôster fica
escurecido por um véu chapado de noite a 80%, sem desfoque, e o play pousa exatamente sobre o
logo de latão do pôster, com a etiqueta da duração sobre a palavra "Corneta"; o véu some no
play. Não há capítulos nem transcrição na página: a narração vem em legendas WebVTT no próprio
player (desligadas por padrão), geradas dos tempos reais de cada fala. O vídeo não toca sozinho
e só baixa no clique (`preload="none"`): AV1/Opus em WebM e, para quem não decodifica AV1,
H.264/AAC em MP4 de 720p.

### Signature: recortes do app

As telas que aparecem nos recursos são recortes das telas reais do app em 2×,
tirados do modo demo de contribuidor, com os mesmos dados de exemplo do vídeo e rotulados como
"telas do app com dados de exemplo". Ficam dentro dos cartões de papel do mosaico, em moldura de
tinta de 2px e canto 10px, embaixo do título e da frase. Como a tela Qualidade só foi capturada em português, o recorte em inglês troca cada texto pelo
do dicionário do próprio app, chave por chave. Só o relatório empilha duas folhas: a
lista "Momentos de destaque (pra clipar)" pousa na borda direita da curva de audiência por
plataforma, com Pop de Tinta, e as três exportações (capítulos do YouTube, CSV, EDL) ficam em
chips embaixo da curva. Nunca se redesenha a interface do app em HTML para a página: quando o
app muda, os recortes são refeitos.

### Listra de acento

Herdada do app (`.accent-l`): uma barra de latão de 4px na borda esquerda de um bloco de
superfície mais funda. É o único lugar onde uma borda colorida grossa é permitida, e existe para
destacar uma observação dentro de texto corrido (o callout das páginas legais). Fora dessa
função, borda colorida grossa continua proibida.

### Bloco de proteção

A rede de proteção é o cartão alto do mosaico de recursos: título em Baloo, uma frase em Inter,
o recorte da gaveta de proteções do app (com os interruptores como o app os mostra) e —
obrigatoriamente — uma linha com o adesivo tomate dizendo o que o Guardião faz e o que custa:
esconde a tela, atrasa a live em 12s, pode deixar passar termos e não censura o áudio. O
comportamento em falha (a tela fica coberta) mora nos termos de uso, não na página.

**A Regra do Custo Visível.** Nenhum bloco de proteção fecha sem dizer o que ele cobra (atraso,
carga, conflito com o OBS). Vender a rede sem o preço é o oposto do tom da marca.

### Motion

Uma entrada orquestrada e nada mais: adesivo, título, pitch e vídeo sobem 16px com
`cubic-bezier(0.16, 1, 0.3, 1)` em 500–720ms escalonados, partindo de um estado já visível
(opacidade 0.2). Logo depois, o traço de marca-texto se desenha uma vez sob a segunda linha do
título (720ms). O único movimento contínuo é o "grito" do mascote no CTA (2.4s); quem se mexe na
página é o vídeo, e só quando a pessoa aperta o play. `prefers-reduced-motion` corta todos e faz
os atalhos do vídeo pularem sem rolagem suave.

## Do's and Don'ts

### Do:

- **Do** herdar tokens de `../src/index.css`: mudou no app, muda aqui.
- **Do** usar sombra dura com offset e sem blur, com a cor escolhida pelo fundo.
- **Do** manter o latão como marca/destaque e o tomate como única cor de ação.
- **Do** mostrar o app trabalhando (o vídeo e os recortes das telas reais) em vez de ilustrar
  conceito.
- **Do** rotular as telas como dados de exemplo; a foto do vídeo já vem com o selo "imagem
  ilustrativa".
- **Do** mostrar banda e carga só pelo recorte da tela Qualidade do app (que calcula com
  `src/lib/estimates.ts`), nunca com valores inventados.
- **Do** manter a página utilizável sem JavaScript: o vídeo é um `<video>` nativo, e a capa e
  os atalhos só melhoram o que já funciona.
- **Do** dizer o custo de cada recurso na mesma peça que o vende.
- **Do** usar os logos oficiais das plataformas nas cores reais, como o app faz.
- **Do** alternar palco escuro e faixa de papel para dar ritmo à leitura.

### Don't:

- **Don't** usar azul, gradiente, glow, vidro ou sombra difusa decorativa.
- **Don't** passar de 14px de raio nem usar pílula como silhueta de botão, chip ou painel.
- **Don't** transformar a página em grade de cards iguais de ícone + título + texto.
- **Don't** girar texto corrido; a inclinação é só para adesivo e bloco sólido pequeno.
- **Don't** pintar de tomate o play do vídeo ou um enfeite: tomate é baixar.
- **Don't** redesenhar telas do app em HTML para a página; use recortes das telas reais.
- **Don't** escrever texto branco sobre latão, menta ou âmbar.
- **Don't** inventar métrica, depoimento ou logo de cliente: não existem.
- **Don't** mostrar um recurso desligado por feature flag (a “Mesa” de co-stream está fora).
- **Don't** organizar a página por status interno de QA (“validado”, “pendente”): isso é
  papelada do projeto. A ressalva vai junto do item, na linguagem de quem usa.
- **Don't** usar monoespaçado fora de valor copiável.
