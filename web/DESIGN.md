---
name: Corneta
description: Uma live. Várias comunidades. Tudo no seu controle.
colors:
  breu: "#100b07"
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
  tomate: "#ff5a36"
  tomate-strong: "#ff7a55"
  tomate-ink: "#b83218"
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
    fontSize: "clamp(2.95rem, 4.9vw, 4.45rem)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "var(--font-baloo), 'Segoe UI', system-ui, sans-serif"
    fontSize: "clamp(2.35rem, 4.2vw, 3.9rem)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.03em"
  title:
    fontFamily: "var(--font-baloo), 'Segoe UI', system-ui, sans-serif"
    fontSize: "clamp(1.7rem, 2.7vw, 2.5rem)"
    fontWeight: 800
    lineHeight: 1.05
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
    backgroundColor: "{colors.tomate}"
    textColor: "{colors.brass-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    padding: "0 26px"
    height: "70px"
  button-download-hover:
    backgroundColor: "{colors.tomate-strong}"
    textColor: "{colors.brass-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    padding: "0 26px"
    height: "70px"
  button-download-compact:
    backgroundColor: "{colors.tomate}"
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
  sticker-tomate:
    backgroundColor: "{colors.tomate}"
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

O palco é o breu quente do app (`#100b07`) com meio-tom impresso, cortado por faixas de papel
(`#f3ead7`, o tema claro do app) onde há leitura longa. O latão manda: é o bloco de destaque,
o item ativo, o adesivo torto e a régua sobre os números. O tomate é o pedido de ação — baixar
e entrar no ar. Menta reporta saúde, âmbar reporta reconexão. Nada de azul, nada de glow, nada
de sombra difusa decorativa: esses efeitos não pertencem à linguagem visual do site.

A voz é brasileira e direta, sem virar infantil. Baloo 2 fala; Inter explica e opera. Toda
demonstração de produto é rotulada como prévia ilustrativa, porque a honestidade é parte do
tom da marca. Os textos seguem o [guia de tom de voz](../docs/TOM-DE-VOZ.md).

**Key Characteristics:**

- Palco escuro com meio-tom impresso, interrompido por faixas de papel para leitura.
- Sombras duras de 3–10px sem desfoque; a peça parece adesivo colado, não elemento flutuante.
- Blocos sólidos de latão com tinta escura — inclusive a laje inclinada do título.
- Cantos secos (4–14px). Pílula só para pontos de estado e ondas sonoras.
- Logos oficiais das plataformas em chips de marca, iguais aos do app.
- Réplica funcional da tela "Ao vivo" como primeira prova, não mockup genérico.

## Colors

Paleta de duas temperaturas: o breu do estúdio e o papel da gráfica, com latão e tomate
carregando marca e ação.

### Primary

- **Breu Quente** (`#100b07`): fundo do palco — herói, jornada, CTA final, rodapé e as
  superfícies mais escuras do app. Sempre com o meio-tom de latão a 5%.
- **Latão** (`#ffb323`): a cor da marca. Bloco de destaque do título, faixa do mecanismo, item
  ativo, adesivos, réguas sobre números, painel da "conta honesta" e ícone da corneta.

### Secondary

- **Tomate** (`#ff5a36`): reservado à ação — baixar para Windows, o botão BORA AO VIVO e a
  faixa de ticker. Nunca decora um bloco que não pede clique.
- **Tinta de Latão** (`#2a1c00`): a tinta escura que sempre acompanha o latão (texto sobre
  latão, sombra dura sobre painel escuro).

### Tertiary

- **Menta** (`#56e39b`): destino no ar, folga de upload, itens confirmados. Não compete com a ação.
- **Âmbar de Aviso** (`#ffc23d`): reconectando, "pode falhar". A cor da ressalva honesta.
- **Vermelho AO VIVO** (`#ff4733`): só o ponto pulsante de transmissão no ar.

### Neutral

- **Superfície** (`#1a130c`): painel padrão sobre o palco e corpo da janela do app.
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
em tinta escura (`#2a1c00` ou `#0b0805`), não branco. A única exceção é o BORA AO VIVO dentro da
réplica — ele é branco porque o app é assim, e só passa em AA porque fica ≥18.66px em peso 800.

## Typography

**Display Font:** Baloo 2 (com `Segoe UI`, system-ui, sans-serif)
**Body Font:** Inter (com `Segoe UI`, system-ui, sans-serif)

**Character:** Baloo 2 é gorda, redonda e falada — é a corneta gritando. Inter é a voz que
explica a conta de upload sem drama. As duas são exatamente as fontes do app, então a LP e o
produto soam iguais.

### Hierarchy

- **Display** (800, `clamp(2.95rem, 4.9vw, 4.45rem)`, 0.95, -0.035em): só a promessa do herói,
  em três linhas curtas, com a linha do meio dentro da laje de latão.
- **Headline** (800, `clamp(2.35rem, 4.2vw, 3.9rem)`, 0.98): viradas de seção e CTA final. Em
  coluna estreita (layout de duas colunas) desce para `clamp(2.1rem, 3.2vw, 3.05rem)`.
- **Title** (800, `clamp(1.7rem, 2.7vw, 2.5rem)`, 1.05): título de benefício, passo e etapa da
  jornada.
- **Body** (500, `1rem`, 1.68): explicações e ressalvas; medida entre 46ch e 68ch.
- **Label** (800, `0.72rem`, `0.1em`, caixa alta): kicker, rótulo de painel, adesivo e estado.
- **Action** (Baloo 800, `1.24rem`): botão de download. O botão fala com a fonte da marca, não
  com a do corpo.
- **UI** (Baloo 700, `0.9rem`) e **Micro** (Inter 550, `0.62rem`): a escala interna da réplica
  do app — nome de destino, item de navegação, detalhe de bitrate, rótulo de painel. Vive entre
  0.54rem e 0.95rem e existe só dentro de superfícies de produto; texto da página nunca desce
  para lá.

- **Mono** (`ui-monospace`, `0.7rem`): só valor copiável — a URL do overlay que vai pro OBS.
  Monoespaçado aqui é dado, não fantasia de "técnico".

### Named Rules

**A Regra de Quem Fala.** Baloo 2 para promessas, nomes e botões; Inter para tudo que o
streamer precisa entender ou operar. Um parágrafo em Baloo é erro.

## Layout

Casca central de no máximo 1220px com 3rem de goteira, apertando para 2.5rem abaixo de 980px e
2rem abaixo de 760px. Seções respiram `clamp(78px, 8vw, 122px)`; painéis e superfícies de
produto trabalham com 8–26px internos.

O primeiro viewport é: adesivo, título de três linhas, pitch curto à direita e a janela do app
em largura total, com o botão de download logo abaixo dela (separado, nunca colado ao BORA do
app). A janela é um grid de três zonas — sidebar numerada, painel Ao vivo, chat — que perde o
chat abaixo de 1180px e vira uma faixa horizontal de navegação abaixo de 760px.

O corpo alterna palco e papel, sempre em linhas largas: benefício com demonstração ao lado,
jornada em três linhas separadas por fios de 2px, passos numerados sobre réguas de 3px de
tinta. Abaixo de 980px todas as colunas duplas colapsam; abaixo de 760px a jornada e os chips
de plataforma ocupam a largura inteira.

**A Regra do Palco antes da Grade.** Comece por uma cena de produto funcionando ou por uma
sequência ordenada. Nunca por uma grade de cards de ícone + título + texto.

**A Regra do Ritmo Alternado.** Duas seções claras encostadas trocam de tom (`#f3ead7` ↔
`#fffaf0`); duas escuras encostadas ganham uma faixa de latão ou tomate entre elas.

## Elevation & Depth

Profundidade é impressão, não luz: todo relevo é uma sombra **dura** deslocada, sem desfoque,
como tinta fora de registro. O único desfoque permitido é o halo ambiente sob a janela do app,
que existe para separá-la do palco. Superfícies de leitura são planas e se separam por fio ou
troca de tom.

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
- **Desregistro de Título** (`box-shadow: 7px 7px 0 0 #ff5a36`): exclusivo da laje de latão do
  herói — o tomate atrás do latão imita a impressão fora de registro.
- **Janela do App** (`box-shadow: 10px 10px 0 0 #0b0805, 0 30px 60px rgb(0 0 0 / 42%)`): a
  única peça com sombra dura + halo ambiente; cai para 5px e halo menor no mobile.

### Named Rules

**A Regra da Sombra Seca.** Sombra tem offset e não tem blur. Se apareceu `blur` fora da janela
do app, virou glow — e glow é o mundo antigo.

**A Regra do Offset que Aparece.** A cor da sombra depende do fundo: `#0b0805` sobre o escuro,
`#2a1c0a` sobre papel, `#fcf3e3` para o botão de ação no palco. Sombra invisível é sombra errada.

## Shapes

Geometria seca: 4px em indicadores e adesivos, 7px em controles, linhas e botões, 10px em
painéis, 14px em janelas e campos de destaque. Nada acima de 14px. Pílula (`999px`) só em ponto
de estado, polegar de interruptor e ondas sonoras. Bordas existem para separar zonas de app
(1px `#3d301c` / `#281f12`) e para as réguas editoriais no papel (2–3px de tinta cheia); não
existem para contornar cards.

A inclinação é material do sistema: adesivos e blocos de marca giram entre -3° e +2°. Sempre em
peça pequena e sólida — texto corrido nunca gira.

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
- **Focus:** traço de latão de 3px com offset de 3px; sobre latão o traço vira tinta escura.

### Chips

- **Adesivo (`.sticker`):** bloco de latão com tinta escura, caixa alta 0.72rem, sombra Pop de
  Latão e rotação de -2.2°. A variante tomate gira +1.8° e mantém a tinta escura.
- **Chip de estado (`.chip`):** bloco sólido pequeno; menta = testado/no ar, âmbar = pode
  falhar, superfície alta = neutro. Texto sempre em tinta escura.
- **Linha de destino:** superfície elevada com o glifo oficial da plataforma na cor da marca
  (38px, canto 4px, sombra Pop Pequeno), nome em Baloo e, abaixo, a frase que o próprio app usa
  pra aquele destino. A ressalva de cada plataforma vive nessa frase, na linguagem do produto —
  o painel **não** classifica destinos por status interno de validação, e nenhum selo de
  “testado”, “pendente” ou “pode falhar” aparece sobre eles.

### Cards / Containers

- **Corner Style:** 10px em painel de demonstração, 14px em janela e painel de latão.
- **Background:** `#1a130c` para painel escuro no papel, `#221a10` para linhas internas,
  latão para o painel da "conta honesta".
- **Shadow Strategy:** uma sombra dura por peça, cor conforme o fundo (ver Elevation).
- **Border:** só entre zonas de app (1px) e como régua editorial no papel (2–3px).
- **Internal Padding:** 18–26px é a faixa recorrente.

### Navigation

Header colado no topo em `#0b0805` translúcido com fio `#281f12`. Links em Inter 650 creme
fosco; no hover o texto vira creme e uma régua de latão de 3px cresce da esquerda. Abaixo de
760px a navegação sai e sobra a ação compacta.

### Signature: janela "Ao vivo"

A peça central é a réplica da tela do app: titlebar com a corneta em latão e os botões de
janela, sidebar com os cinco destinos numerados (01–05, os atalhos Alt+N reais) e o item ativo
em bloco de latão, painel com as três estatísticas de banda sob réguas de latão, uma linha por
destino (glifo da marca + qualidade + interruptor de canto seco) e o BORA AO VIVO em tomate. A
coluna de chat reúne as plataformas. Toda instância carrega o selo "PRÉVIA ILUSTRATIVA" e
números ilustrativos — a réplica prova o produto, não simula métrica real.

### Signature: chave de troca (abas sem JavaScript)

Toda demonstração que tem mais de um estado troca por `input[type=radio]` escondido + `label`,
com os painéis mostrados por seletor de irmão. O grupo é um radiogroup real: navega por seta,
respeita o teclado e o anel de latão vai pro rótulo (o input está fora de vista). A aba ativa
vira bloco de latão com sombra Pop de Latão; as inativas ficam em superfície elevada. Nenhuma
demonstração da página depende de JavaScript.

### Signature: mesa de qualidade

Três abas com os nomes reais do app (“Na lata”, “Esperto”, “Caprichado”) trocam um painel que
lista os quatro destinos, o que cada um recebe (tag **Cópia**, **Recodifica** ou **Não serve**),
e fecha com três blocos de estatística: upload somado, recodificações e carga estimada. Abaixo,
uma linha de veredito com o custo honesto daquele modo. Os números vêm da mesma conta do app
(`src/lib/estimates.ts`) — nunca de estimativa inventada para a página.

### Signature: quadro de recorte vertical

Moldura 16:9 com meio-tom representando o sinal do OBS e um retângulo 9:16 de latão sobre ela.
Três áreas invisíveis de clique (esquerda, centro, direita) movem o recorte com transição de
220ms. É a geometria do editor do app, não uma cena falsa de streamer: o que se mostra é o
enquadramento, com as duas resoluções rotuladas.

### Signature: slate JÁ VOLTO

A tela que o app coloca no ar quando o OBS cai é reproduzida como está: fundo `#14100a` com
meio-tom, kicker "CORNETA · MULTI-STREAM" em latão, "JÁ VOLTO" em laje de latão girada -1.7°
com sombra dura e a legenda "já já tô de volta — segura a corneta 📣".

### Listra de acento

Herdada do app (`.accent-l`): uma barra de latão de 4px na borda esquerda de um bloco de
superfície mais funda. É o único lugar onde uma borda colorida grossa é permitida, e existe para
destacar uma observação dentro de texto corrido (o callout das páginas legais). Fora dessa
função, borda colorida grossa continua proibida.

### Bloco de proteção

Cada rede de segurança é um bloco escuro com ícone de latão inclinado, título em Baloo, a
explicação em Inter e — obrigatoriamente — a linha de **custo** ao pé, em creme apagado com um
ícone de informação. O que é experimental leva o adesivo tomate; o estado padrão aparece como o
próprio interruptor do app (ligado em latão, desligado em superfície alta).

**A Regra do Custo Visível.** Nenhum bloco de proteção fecha sem dizer o que ele cobra (atraso,
carga, conflito com o OBS). Vender a rede sem o preço é o oposto do tom da marca.

### Motion

Uma entrada orquestrada e nada mais: adesivo, título, pitch e janela sobem 16–22px com
`cubic-bezier(0.16, 1, 0.3, 1)` em 500–720ms escalonados, partindo de um estado já visível
(opacidade 0.2–0.3). Os movimentos contínuos são os do próprio app: pulso do ponto AO VIVO
(1.4s), ticker de tomate (34s) e o "grito" do mascote no CTA (2.4s). `prefers-reduced-motion`
corta todos.

## Do's and Don'ts

### Do:

- **Do** herdar tokens de `../src/index.css`: mudou no app, muda aqui.
- **Do** usar sombra dura com offset e sem blur, com a cor escolhida pelo fundo.
- **Do** manter o latão como marca/destaque e o tomate como única cor de ação.
- **Do** mostrar o app trabalhando (janela Ao vivo, slate JÁ VOLTO, chat reunido) em vez de
  ilustrar conceito.
- **Do** rotular toda demonstração como prévia ilustrativa e todo número como exemplo.
- **Do** tirar os números de banda e carga da conta do app (`src/lib/estimates.ts`) em vez de
  inventar valores bonitos.
- **Do** fazer as demonstrações trocarem de estado com radio + CSS: a página não carrega
  JavaScript de interação.
- **Do** dizer o custo de cada recurso na mesma peça que o vende.
- **Do** usar os logos oficiais das plataformas nas cores reais, como o app faz.
- **Do** alternar palco escuro e faixa de papel para dar ritmo à leitura.

### Don't:

- **Don't** usar azul, gradiente, glow, vidro ou sombra difusa decorativa.
- **Don't** passar de 14px de raio nem usar pílula como silhueta de botão, chip ou painel.
- **Don't** transformar a página em grade de cards iguais de ícone + título + texto.
- **Don't** girar texto corrido; a inclinação é só para adesivo e bloco sólido pequeno.
- **Don't** colocar o botão de download colado ao BORA AO VIVO da prévia — dois blocos de
  tomate vizinhos viram um só borrão de ação.
- **Don't** escrever texto branco sobre latão, menta ou âmbar.
- **Don't** inventar métrica, depoimento ou logo de cliente: não existem.
- **Don't** mostrar um recurso desligado por feature flag (a “Mesa” de co-stream está fora).
- **Don't** organizar a página por status interno de QA (“validado”, “pendente”): isso é
  papelada do projeto. A ressalva vai junto do item, na linguagem de quem usa.
- **Don't** usar monoespaçado fora de valor copiável.
