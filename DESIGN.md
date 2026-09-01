---
name: Corneta
description: "Transmita para todas as plataformas ao mesmo tempo, sem dor de cabeça."
colors:
  bg: "#100b07"
  surface: "#1a130c"
  surface-2: "#221a10"
  surface-3: "#2e2314"
  border: "#3d301c"
  border-soft: "#281f12"
  ink: "#fcf3e3"
  ink-muted: "#c6b69b"
  ink-faint: "#9e8c70"
  brass: "#ffb323"
  brass-strong: "#ffc857"
  brass-ink: "#2a1c00"
  tomate: "#ff5a36"
  tomate-strong: "#ff7a55"
  live: "#ff4733"
  ok: "#56e39b"
  warn: "#ffc23d"
  bad: "#ff5e57"
  info: "#6aa6ff"
  night: "#0b0805"
  panel: "#0b0805"
typography:
  display:
    fontFamily: "Baloo 2, Segoe UI, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Baloo 2, Segoe UI, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Baloo 2, Segoe UI, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.015em"
  nav:
    fontFamily: "Baloo 2, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.25
  action:
    fontFamily: "Baloo 2, Segoe UI, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1
  body:
    fontFamily: "Inter Variable, Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter Variable, Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.025em"
rounded:
  sm: "4px"
  md: "7px"
  lg: "10px"
  xl: "14px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.brass}"
    textColor: "{colors.brass-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.brass-strong}"
    textColor: "{colors.brass-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-tomate:
    backgroundColor: "{colors.tomate}"
    textColor: "#ffffff"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-tomate-hover:
    backgroundColor: "{colors.tomate-strong}"
    textColor: "#ffffff"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-danger:
    backgroundColor: "rgb(255 94 87 / 0.15)"
    textColor: "{colors.bad}"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-subtle:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  input-default:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  badge-brass:
    backgroundColor: "{colors.brass}"
    textColor: "{colors.brass-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  card-solid:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  nav-active:
    backgroundColor: "{colors.brass}"
    textColor: "{colors.brass-ink}"
    typography: "{typography.nav}"
    rounded: "{rounded.md}"
    padding: "12px"
---

# Design System: Corneta

## Overview

**Creative North Star: "Pôster de Corneta em Operação"**

A Corneta é uma ferramenta desktop em modo **Operate** com voz autoral de pôster e quadrinho: tinta escura, papel quente, latão, tomate, blocos sólidos, tipografia robusta e sombras secas. A expressão visual serve à leitura rápida de uma operação de live; a marca aparece em detalhes precisos, sem competir com estado, conteúdo ou próxima ação.

Nos relatórios, a narrativa é live-first e editorial. Cada viewport deve ter uma protagonista clara e a ordem de leitura preserva o retrato da live antes do replay, depois evolução, audiência e momentos, comunidade e, por fim, dados técnicos sob progressive disclosure. Saúde e incidentes são notas secundárias dentro do capítulo técnico, nunca a manchete da transmissão. Estados vazios, ausentes, carregando, indisponíveis e de erro devem dizer honestamente o que aconteceu e qual ação ainda é possível.

O tema escuro é a referência normativa dos tokens acima. O tema claro mantém os mesmos papéis semânticos, substituindo tinta por superfícies de papel/quadrinho quentes e preservando latão, tomate e sombras escuras; os overrides reais vivem em `src/index.css` e não devem criar uma segunda nomenclatura de componentes.

**Key Characteristics:**

- Pôster/quadrinho operacional, não dashboard corporativo genérico.
- Latão para seleção, orientação e ação principal; tomate para chamada e estado ao vivo.
- Superfícies sólidas e hierarquia tonal antes de bordas.
- Sombras duras com deslocamento e sem desfoque.
- Uma protagonista por viewport e complexidade técnica revelada sob demanda.
- Foco visível, contraste AA, movimento reduzível e estados honestos.

## Colors

A paleta combina tinta marrom-negra, papéis quentes, marfim e dois acentos de impressão de alta energia.

### Primary

- **Latão de Ação** (`colors.brass`): seleciona navegação, botões primários, ícones editoriais, progresso e marca-texto.
- **Latão Aceso** (`colors.brass-strong`): resposta de hover sobre ações de latão.
- **Tinta sobre Latão** (`colors.brass-ink`): garante leitura e foco em superfícies de latão.

### Secondary

- **Tomate de Chamada** (`colors.tomate`): ação enfática, estado ao vivo e selos que precisam interromper a varredura.
- **Tomate Aceso** (`colors.tomate-strong`): resposta de hover da chamada tomate.

### Tertiary

- **Vermelho Ao Vivo** (`colors.live`): presença e pulso de transmissão.
- **Verde Firme**, **Amarelo Atenção**, **Vermelho Falha** e **Azul Informação** (`colors.ok`, `colors.warn`, `colors.bad`, `colors.info`): estados semânticos; nunca trocar esses papéis por decoração.

### Neutral

- **Tinta de Fundo** e **Painel de Navegação** (`colors.bg`, `colors.panel`): casca do aplicativo e sidebar.
- **Papéis Escuros** (`colors.surface`, `colors.surface-2`, `colors.surface-3`): camadas por preenchimento, do conteúdo principal ao apoio.
- **Traços** (`colors.border`, `colors.border-soft`): divisões necessárias, não contorno automático de todo bloco.
- **Marfins de Leitura** (`colors.ink`, `colors.ink-muted`, `colors.ink-faint`): conteúdo principal, apoio e metadado.
- **Noite de Sombra** (`colors.night`): sombra seca e palco do replay.

### Named Rules

**The Solid Ink Rule.** Use manchas sólidas de latão, tomate ou superfície; não introduza glow, vidro, gradiente genérico ou halo decorativo.

**The Semantic Signal Rule.** Verde, amarelo, vermelho de falha e azul informativo comunicam estado. Latão e tomate carregam marca e prioridade, não substituem o significado do estado.

## Typography

**Display Font:** Baloo 2 (com Segoe UI e system-ui como fallback)

**Body Font:** Inter Variable / Inter (com Segoe UI e system-ui como fallback)

**Character:** Baloo 2 traz o volume arredondado de letreiro e quadrinho; Inter mantém explicações, controles e dados densos nítidos. O contraste entre as famílias é parte da identidade e também separa história de instrumentação.

### Hierarchy

- **Display** (800, 2.25rem; 3rem a partir de 640px, line-height 1): título protagonista do relatório e da sessão em destaque.
- **Headline** (800, 1.875rem, line-height 1.05): título de tela, retrato da live e seção editorial.
- **Title** (800, 1.25rem, line-height 1.05): títulos de painel, modal e disclosure técnico.
- **Navigation** (700, 1rem, line-height 1.25): jornada principal da sidebar.
- **Action** (700, 0.875rem, line-height 1): botões de marca e CTAs compactos.
- **Body** (400, 0.875rem, line-height 1.5): explicações e conteúdo operacional; descrições editoriais ficam em até cerca de 42rem.
- **Label** (700, 0.6875rem, tracking 0.025em, uppercase): kicker, estatística, selo e metadado curto.

### Named Rules

**The Two Voices Rule.** Use Baloo 2 para títulos, navegação, números protagonistas e ações de marca; use Inter para leitura, descrição, formulário e instrumentação.

**The Poster, Then Footnote Rule.** A hierarquia começa com uma frase curta e volumosa; contexto e precisão entram abaixo em Inter menor, nunca espremidos dentro do mesmo título.

## Layout

O shell desktop usa sidebar fixa de 16rem e uma área principal rolável com padding de 2rem. Meça responsividade pela largura restante depois da sidebar, não pela janela inteira. A lista de relatórios se limita a 64rem; o detalhe editorial se abre até 72rem.

O ritmo-base usa passos de 4px e recorre principalmente a 8, 12, 16, 20, 24 e 32px. Seções narrativas do relatório se separam por 48px. Dentro de uma seção, títulos, cartões e controles ficam mais próximos para que cada bloco seja lido como uma unidade.

Em base, conteúdos e controles empilham em uma coluna. Em 640px, títulos e paddings podem crescer. Em 1280px, somente relações que ganham comparação real viram duas colunas: retrato da live com estatísticas, replay com chat, evolução com momentos e grades técnicas. A coluna narrativa principal sempre recebe mais largura que o apoio.

Nos relatórios, preserve esta progressão: resumo editorial → replay → evolução/audiência/momentos → comunidade → técnica. A seção técnica começa recolhida; detalhes de ajuste do replay também ficam escondidos até haver necessidade ou evidência de problema.

### Named Rules

**The One Protagonist Rule.** Cada viewport tem um bloco dominante; grades auxiliares não podem disputar tamanho, cor e sombra com ele.

**The Sidebar-Aware Rule.** O breakpoint amplo só vale quando o conteúdo restante, após as 16rem da sidebar, sustenta as duas colunas sem esmagar texto ou controles.

## Elevation & Depth

O sistema é tonal por padrão e usa sombras apenas como impressão deslocada: a profundidade vem de blocos sólidos em níveis de superfície, barras de acento e sombras duras. Não há sombra ambiente, blur nem glow.

### Shadow Vocabulary

- **Pop** (`box-shadow: 4px 4px 0 0 var(--color-night)`): protagonista, estado vazio, modal e bloco que deve parecer um adesivo impresso.
- **Pop Small** (`box-shadow: 3px 3px 0 0 var(--color-night)`): ícone editorial, glyph de plataforma e selo compacto.
- **Pop Brass** (`box-shadow: 4px 4px 0 0 var(--color-brass-ink)`): botão ou navegação sobre latão.

### Named Rules

**The Dry Shadow Rule.** Sombras têm offset visível e blur zero; se a profundidade pede névoa, a solução está fora do mundo da Corneta.

**The Flat-by-Default Rule.** Um painel comum se diferencia pelo preenchimento. Borda ou sombra só entra quando comunica agrupamento, interação ou protagonismo.

## Shapes

Os cantos são secos, apenas suavizados o suficiente para manter controles amigáveis: 4px em selos e controles pequenos, 7px em botões e navegação, 10px em painéis e 14px em blocos editoriais protagonistas. Barras, handles e indicadores de estado podem ser circulares quando a função pede leitura contínua.

Bordas são firmes, normalmente de 2px em campos, opções e estados vazios; divisores estruturais usam 1px. Inclinações discretas, entre cerca de -3° e 2°, pertencem a selos, mascote e estados ao vivo, não a conteúdo longo.

### Named Rules

**The Dry Corner Rule.** Não transforme todo componente em cápsula. O formato pill fica reservado a régua, ponto, progresso ou outro elemento naturalmente contínuo.

## Components

### Buttons

- **Shape:** cantos secos médios (7px); alturas de 32, 40 e 56px para `sm`, `md` e `lg`.
- **Primary:** bloco de latão, tinta escura, Baloo 2 bold e sombra seca de latão; o hover acende o latão.
- **Tomate:** chamada enfática em tomate, texto branco e sombra seca noturna.
- **Ghost / Outline / Subtle:** ghost usa texto e preenchimento apenas no hover; outline usa traço de 2px; subtle repousa em `surface-2`.
- **Danger:** falha em camada translúcida e borda semântica; confirmação muda o rótulo, não depende só da cor.
- **Active / Disabled:** ações com sombra deslocam 4px e perdem a sombra ao pressionar; desabilitados ficam a 40% e sem interação ou sombra.
- **Focus:** traço seco de latão com 3px e offset de 2px; sobre latão, o traço muda para tinta escura.

### Chips

- **Style:** adesivo compacto com raio de 4px, padding de 2px × 8px, label em uppercase e tracking amplo.
- **State:** os tons semânticos sempre usam texto de contraste correspondente; glyphs de plataforma preservam a cor oficial e recebem sombra curta.

### Cards / Containers

- **Corner Style:** painel comum em 10px; bloco editorial protagonista em 14px.
- **Background:** `surface` para conteúdo principal e `surface-2` para conteúdo interno ou de apoio.
- **Shadow Strategy:** sem sombra por padrão; `pop` somente em protagonistas, estados vazios e modais.
- **Border:** ausente por padrão; use barra de latão, divisor suave ou borda semântica quando houver significado.
- **Internal Padding:** 20px no painel comum; 24–32px em protagonistas responsivos.

### Inputs / Fields

- **Style:** altura de 40px, fundo `surface-2`, borda sólida de 2px, raio de 7px e padding horizontal de 12px.
- **Focus:** a borda vira latão e o foco global permanece visível.
- **Error / Disabled:** erro troca borda e foco para `bad`; desabilitado mantém o valor legível com 50% de opacidade e cursor de indisponível.

### Navigation

A sidebar é uma jornada numerada. O item ativo é um bloco de latão com ícone, Baloo 2 bold, dica curta em Inter e sombra seca; os inativos usam tinta apagada e ganham superfície somente em hover. A sidebar permanece com 16rem no shell desktop.

### Report Story

O relatório abre com título e contexto, seguido por um retrato protagonista da live que combina alcance, duração, conversa e até quatro estatísticas. Cabeçalhos de história usam um ícone de latão com sombra curta, título Baloo e descrição Inter. O replay ocupa o palco noturno; evolução, momentos e comunidade entram em blocos sólidos; saúde, incidentes e instrumentação técnica vivem juntos dentro de `details` e começam recolhidos.

### Replay

O player sincronizado mantém vídeo, régua e controles como protagonista. Chat passa para coluna lateral somente em 1280px; antes disso, empilha. Régua e volume aceitam teclado, controles expõem nomes acessíveis, ausência de gravação ganha estado próprio e ajustes de sincronia aparecem apenas quando necessários.

### Motion

Transições de botão usam 75ms; entrada de tela usa 110ms com `easeOut`; a sessão em destaque reage em 150ms. Pulso ao vivo (1.4s), mascote (2.4s) e marquee (14s) só aparecem onde o estado ou a marca justificam. `prefers-reduced-motion` reduz transições e remove animações infinitas.

## Do's and Don'ts

### Do:

- **Do** preserve latão para orientação e ação principal, tomate para chamada e as cores semânticas para estado.
- **Do** construir hierarquia com tamanho, preenchimento sólido, espaço e uma sombra seca seletiva.
- **Do** manter uma protagonista por viewport e a ordem editorial dos relatórios.
- **Do** tratar problemas como insight técnico secundário, depois da história da live.
- **Do** calcular layouts largos no espaço que sobra depois da sidebar fixa de 16rem.
- **Do** oferecer foco visível, contraste AA, teclado, redução de movimento e texto que nomeia o estado.
- **Do** mostrar loading, vazio, erro, replay ausente e controle indisponível como estados diferentes e honestos.

### Don't:

- **Don't** introduzir glow, vidro, blur, gradiente genérico ou sombra ambiente.
- **Don't** contornar todos os painéis; superfícies tonais são o agrupamento padrão.
- **Don't** transformar todo bloco em card flutuante, toda forma em pill ou toda seção em grade de métricas.
- **Don't** abrir a instrumentação técnica antes da história da live ou deixar ajustes raros permanentemente expostos.
- **Don't** usar falhas, quedas ou comparação negativa como manchete do relatório ou resumo do arquivo.
- **Don't** usar Baloo 2 para parágrafos densos nem Inter para substituir a voz dos títulos protagonistas.
- **Don't** depender apenas de cor, hover ou animação para comunicar significado ou operação.
