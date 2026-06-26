# Corneta — Documento estratégico de UX/UI

**2026-06-26**

Este documento consolida a revisão de UX/UI da Corneta feita por 12 revisores (um por tela mais os transversais de design system, voz/copy e acessibilidade), com cada achado conferido contra o código-fonte. Aqui eu descarto o que foi refutado ou já está tratado, dou peso ao que foi confirmado, e — mais importante — conecto os achados isolados em **teses estruturais**: onde a arquitetura da informação, e não um detalhe de tela, é o que está nos atrapalhando.

A leitura honesta: **a Corneta tem identidade e fundação fortes**. A espinha de navegação (4 passos numerados em latão com sombra dura, botão de estado ao vivo com 4 variações claras, persistência da última tela) é sólida e fiel ao pôster/quadrinho. As telas Qualidade e Ao vivo traduzem jargão com graça ("Na lata / Esperto / Caprichado", "BORA AO VIVO", "a corneta tá tocando"), o ReframeEditor e o popout do chat são competentes, e o kit (`.pop`/`.marker`/`.accent-l`, latão/tomate sólidos, Stat com topo de latão) acerta a cara. Nada disso precisa ser "suavizado" — precisa ser **levado mais longe**.

Os problemas que importam não são de gosto visual; são quatro temas transversais:

1. **Descoberta das features matadoras** — Guardião, Proteção de queda, máquina do tempo, ReframeEditor, endpoint do OBS e Relatórios são o que diferencia a Corneta, e estão todos enterrados no rodapé de Configurações ou três níveis abaixo. O app esconde justamente suas joias.
2. **O estado "no ar" não viaja com o streamer** — cronômetro, máquina, saúde por destino, viewers e as proteções vivem _dentro_ da tela Ao vivo e somem quando ele troca de aba durante a live. O estado mais crítico do produto é o que menos acompanha o usuário.
3. **O caminho zero→ar tem becos sem saída** — o passo nº1 do público não-técnico (apontar o OBS pro `rtmp://127.0.0.1:1935/live`) nunca aparece de forma copiável no fluxo feliz, e quando o auto-config falha não há plano B manual. TikTok/X/Instagram não têm nem onde colar a URL de ingestão.
4. **A camada de estados e acessibilidade está rasa** — Configurações virou "ferro-velho de toggles", o kit não tem primitivos de loading/vazio/erro, e a acessibilidade de foco/teclado está quase ausente (zero `:focus-visible`, zero `aria-live`, zero `prefers-reduced-motion` no `src`). Tudo isso é corrigível **dentro** da linguagem pôster — anel de latão duro, não glow de SaaS.

---

## O quadro geral — estrutura & fluxo

### Tema A — Descoberta das features matadoras

**O problema.** As features que mais "corneta" — as que justificam o app existir — não têm nenhum ponto de descoberta no fluxo. O Guardião anti-vazamento e a Proteção de queda "JÁ VOLTO" são só dois toggles soltos no card "Comportamento" de Configurações (`SettingsScreen.tsx:158-187`), que por sua vez é um botão `text-ink-faint` no rodapé da sidebar (`Sidebar.tsx:106-114`). O endpoint do OBS — o dado mais necessário do público não-técnico — mora no mesmo lugar escondido. O ReframeEditor exige adicionar um destino vertical, colocá-lo em "transcode", rolar até o card e achar um botão `subtle` pequeno (`EncodingScreen.tsx:269`). O Relatório pós-live é um link de rodapé com o mesmo peso de "Sobre". A máquina do tempo não tem porta de entrada nenhuma na UI. O único feedback do Guardião é **reativo**: um toast e um banner que aparecem _depois_ do vazamento (`App.tsx:79-122`).

**A recomendação.** Inverter a lógica de "configuro escondido, descubro tarde" para "vejo o escudo antes de precisar dele":

- **Levar a segurança ao vivo pra dentro do Ao vivo.** Um bloco-pôster "SEU SEGURANÇA" no painel Ao vivo, com cards sólidos `.pop` e listra de acento, mostrando Guardião (ligado · N termos / desligado), JÁ VOLTO (armado) e Auto-bitrate, cada um com um adesivo de estado em latão ("ARMADO") e um atalho "Ajustar" que leva ao ajuste fino em Configurações. Espelhar isso como linhas no **Check-up pré-live** (`GoLiveScreen.tsx:521-570`), que hoje só valida encoder/chaves/upload/OBS. Assim o streamer **confirma a rede antes do BORA**. (Ressalva do código: `guardianEnabled` nasce `false` — então a copy do estado desligado precisa convidar a ligar, não só informar.)
- **Promover o endpoint do OBS pro caminho feliz.** Um cartão "Cole isso no OBS" no topo de Plataformas (ou como passo 0 do Ao vivo), URL em fonte mono dentro de bloco latão `.pop` com botão "COPIEI". Config segue existindo como ajuste fino, mas o caminho feliz deixa de depender de achar o rodapé.
- **Descobrir o vertical no contexto.** Selo `.marker` "enquadre o vertical" no card do destino portrait (em Plataformas e nos cartões de destino do Ao vivo), com link que abre o ReframeEditor. Hoje o streamer corre o risco de cortar a própria cara fora do quadro sem nunca saber que o editor existe.
- **Fechar o loop de recompensa.** Ao encerrar a live, um toast/banner "Relatório fresquinho — vê como foi" que leva pro Relatórios, e um selo "NOVO" tomate `.tilt` na sidebar enquanto há relatório não visto. O ciclo "terminei → vejo como foi → quero de novo" não está fechado.

**Por que é estratégico.** Discoverability é o tema declarado do produto. Cada feature densa escondida é trabalho de engenharia pago e não colhido — e, no caso do Guardião e do JÁ VOLTO, é proteção que o streamer só descobre **depois** do estrago. Mover essas joias pro lugar onde o olho ocupado já está é o maior multiplicador de valor percebido sem escrever uma feature nova.

### Tema B — O estado "no ar" tem que viajar com o streamer

**O problema.** Tudo que importa durante a live — cronômetro, uso de CPU/GPU, status por destino — está condicionado a `(live || starting)` e **preso dentro** de `GoLiveScreen.tsx:317-431`. Se o streamer vai pro Chat ou pra Plataformas no meio da transmissão (coisa rotineira), perde de vista o que mais precisa monitorar. O único resíduo global é o botão "No ar · cornetando" e um contador de viewers minúsculo em `text-ink-faint` no pé da sidebar, que ainda some quando o total é zero (`Sidebar.tsx:173-187`). Pior: a própria tela Ao vivo não muda de hierarquia ao entrar no ar — os cartões de setup ("Liga no OBS", "Banda de upload") continuam fixos no topo, empurrando a sala de guerra pra baixo da dobra, e o botão "Testar meu upload" segue clicável, podendo saturar o upload no meio da live (`GoLiveScreen.tsx:168, 203-211`).

**A recomendação.**

- **Criar uma faixa de status global persistente** que aparece quando `live || starting`, reaproveitando exatamente o padrão visual da barra "JÁ VOLTO" que já existe (`App.tsx:110-122`): bloco sólido latão, borda grossa, tipografia display. Conteúdo: cronômetro chunky + viewers somados (número gigante em Baloo com `.marker` atrás — placar de pôster, não rótulo) + alerta se algum destino caiu + indicador de proteções armadas.
- **Fazer a tela Ao vivo trocar de modo.** Quando no ar, recolher os cartões de setup atrás de `!live && !starting` (ou num adesivo "AJUSTES" `.tilt` fechado) e promover cronômetro + Máquina + cartões por destino pro topo. Desabilitar "Testar meu upload" enquanto transmite.
- **Anunciar o estado por leitor de tela.** Uma região `aria-live="polite"` única no shell, alimentada pelo mesmo `snapshot.state`, que reflita "No ar / Aguardando OBS / Sinal recebido / Erro". Hoje a transição é puramente visual+colorida e nunca é anunciada — o feedback mais crítico do app é invisível pra quem não vê a cor.

**Por que é estratégico.** Pra um app cujo estado mais crítico é "estou no ar", o status sumir quando o usuário troca de tela é uma falha de modelo, não um detalhe. Uma faixa global resolve de uma vez o viewers escondido, a saúde por destino fora de vista e o anúncio acessível — três achados em uma estrutura, toda em linguagem que o app já fala.

### Tema C — O caminho zero→ar não pode ter beco sem saída

**O problema.** O fluxo de 1ª vez é desenhado só pro caminho feliz. O assistente do OBS só sabe `obs_autoconfigure` via obs-websocket (`ObsWizard.tsx:26`); se falhar (OBS antigo, WebSocket bloqueado, firewall, outra porta), o usuário leva o erro cru na cara — `setError(String(e))` renderizado direto (`ObsWizard.tsx:28-29, 96`) — e **a URL `rtmp://127.0.0.1:1935/live` nunca aparece em lugar nenhum** pra ele configurar na mão. Some-se a isso que TikTok/X/Instagram têm `ingestUrl: 'rtmp://'` (incompleto) e **não têm campo pra colar a URL** que o painel da plataforma deu — o campo só renderiza pra "Personalizado" (`PlatformsScreen.tsx:235`), e o card ainda exibe `'rtmp://'` como se a URL estivesse definida. E a validação que o app já calcula (`targetIssues`) só é consumida no Ao vivo — na tela Plataformas, um destino habilitado sem chave não se distingue de um pronto.

**A recomendação.**

- **Dar um plano B manual sempre presente.** No estado de erro do wizard (e como aba "Prefiro na mão"), e também na tela Ao vivo perto do "Aguardando OBS", um bloco copiável: Serviço = Personalizado, Servidor = `rtmp://127.0.0.1:1935/live`, Chave = `live`, cada um com botão copiar, em blocos `.pop-sm` com rótulo `.marker` — "instrução de gibi".
- **Traduzir o erro do OBS.** Mapear as falhas comuns pra recados na voz da Corneta com checklist ("Não achei o OBS. Ele tá aberto? O WebSocket tá ligado em Ferramentas? A porta bate (4455)? A senha tá certa?"), mantendo o erro técnico num "detalhes" colapsável pra quem quiser copiar.
- **Abrir o campo de URL pra TikTok/X/Instagram.** Mostrar o campo sempre que a `ingestUrl` do preset for incompleta (`INGEST_URL_RE.test() === false`), com placeholder "cole a URL que o painel da plataforma te deu", e tratar `'rtmp://'` como URL não definida no resumo do card.
- **Trazer a validação pra Plataformas.** Selo de estado no card — "PRONTO" (latão) vs "FALTA CHAVE"/"SEM URL" (tomate, `.pop-sm`) — alimentado por `targetIssues(t)`. O Ao vivo deixa de ser o primeiro lugar onde o erro aparece.

**Por que é estratégico.** O público é declaradamente não-técnico. Cada um desses pontos é onde mais gente abandona — e três deles são bloqueadores reais (sem fallback manual, sem campo de URL pros betas, erro cru). Fechar os becos do caminho crítico converte instalações em primeiras lives.

### Tema D — Configurações: do ferro-velho a um kit de estados

**O problema.** O card "Comportamento" empilha 8 itens de naturezas completamente diferentes com o mesmo peso visual (`SettingsScreen.tsx:133-264`): segurança ao vivo (JÁ VOLTO, auto-bitrate, Guardião), sistema (bandeja, autostart), aparência (tema) e dados (backup, logs). "Guardião anti-vazamento" pesa o mesmo que "Tema claro". No detalhe, faltam feedbacks críticos: o bloco "No OBS" mostra URL+chave mas **não tem botão de copiar** (`:74-79`), os campos de ingestão persistem a cada tecla sem guarda de live e o campo Porta vazio vira `0` (`:63`, `store.ts:234-238`). E na raiz disso tudo está o **kit**: o design system não tem primitivo de loading (só `disabled:opacity-40`), nem de estado vazio, nem de erro de input, nem badge semântico — então cada tela improvisa estados fora da linguagem.

**A recomendação.**

- **Quebrar "Comportamento" em sub-cards rotulados:** "Segurança ao vivo", "Sistema", "Aparência", "Dados & diagnóstico", usando `SectionTitle`/`.accent-l` como os outros cards. Reforça o pôster e dá hierarquia.
- **Dar feedback nas ações críticas:** botões "Copiar" (URL e chave) com toast; desabilitar/avisar os campos de ingestão quando ao vivo e validar porta (1-65535) com borda `bad`; confirmação no import destrutivo; teste de conexão do obs-websocket ali mesmo.
- **Construir os primitivos que faltam** (isto é o investimento de fundação): `loading` no Button + Spinner on-brand (bloco/listra de latão girando), `EmptyState` reutilizável (Card `.tilt` + `.marker` + CTA `.pop`), `invalid` no Input (borda tomate + `aria-invalid` + slot de mensagem), e variantes semânticas no Badge (ok/warn/bad/live, como o Stat já tem). Cada um desses elimina improviso em várias telas de uma vez.

**Por que é estratégico.** "Ferro-velho de toggles" é o anti-padrão direto da identidade pôster: uma lista homogênea de SaaS no app que cultiva blocos sólidos. E os primitivos ausentes são a causa-raiz de metade dos achados de estado espalhados por todas as telas — investir no kit é a alavanca mais barata pra subir a consistência de uma vez.

### Tema E — Acessibilidade dentro do pôster (não é "suavizar", é terminar o trabalho)

**O problema.** Uma busca no `src` inteiro não acha **nenhum** `:focus-visible`, `prefers-reduced-motion`, `aria-live`, `aria-current` nem `role="dialog"`. Navegação por teclado é literalmente invisível: Button, Toggle e o thumb do Slider não têm anel de foco, a navbar só muda no hover, e Input/Select usam `outline-none` trocando só a cor da borda. O Select custom não é combobox (sem setas, sem `role="listbox"`, sem typeahead). Animações infinitas (pulso AO VIVO, marquee, mascote) rodam mesmo pra quem pede menos movimento. No tema claro, `--color-ink-faint` (#92805f) dá ~3.2:1 sobre o fundo — reprovado em AA, e a maioria dos usos é texto pequeno de apoio.

**A recomendação.** Tudo isto cabe na marca, nada de glow:

- **Um anel de foco global on-brand:** `outline: 3px solid var(--color-brass); outline-offset: 2px` via `:focus-visible`, aplicado em Button, navbar, Toggle e thumb do Slider. Traço sólido seco, no espírito das sombras `.pop`.
- **`@media (prefers-reduced-motion: reduce)`** zerando/encurtando marquee, `.animate-shout` e o pulso (que vira bloco sólido fixo).
- **Select como combobox de verdade** (aria + setas/Home/End/typeahead), visual idêntico.
- **Escurecer `ink-faint` no tema papel** (algo como #6f5d3f) pra cruzar 4.5:1 — continua sendo o tom apagado da hierarquia, só legível.
- **`aria-current` na navbar** e `aria-live` no estado ao vivo e nos toasts.

**Por que é estratégico.** É um app desktop operado durante a live, às vezes com uma mão só no teclado, com atalho global. Foco invisível é uma barreira de uso real, não um item de checklist. E como o sistema de design tem opinião forte, dá pra fazer acessibilidade que **parece** Corneta — o anel de latão duro reforça a identidade em vez de diluí-la.

---

## Achados por tela

### IA & Navegação global
A espinha é sólida e on-brand; o que falta é descoberta e status. Os dois maiores são estruturais e já viraram os Temas A e B acima.

| Severidade | Problema | Recomendação | Esforço |
|---|---|---|---|
| Alta | Guardião + Proteção de queda só existem como toggle no rodapé de Config (`SettingsScreen.tsx:158/178`); nenhum ponto de descoberta | Levar pro painel Ao vivo como bloco "SEU SEGURANÇA" (cards `.pop` + acento); Config vira ajuste fino | M |
| Alta | Cronômetro/máquina/saúde por destino somem ao trocar de tela ao vivo (`GoLiveScreen.tsx:317-349`) | Faixa de status global persistente reaproveitando a barra "JÁ VOLTO" (`App.tsx:110`) | M |
| Alta | Endpoint RTMP do OBS — passo nº1 do não-técnico — mora num link de rodapé | Cartão "Cole isso no OBS" fixo no topo de Plataformas/Ao vivo, com copiar | M |
| Baixa | Numeração 01–04 promete wizard, mas Chat (04) roda em paralelo, não fecha o funil | Numerar só os 3 passos de preparo; Chat como aba-companheira sem número | S |
| Baixa | Passos numerados não mostram conclusão (feito/pendente) | Selo carimbo `.tilt` em latão quando pronto; ponto tomate na pendência | M |
| Baixa | Viewers espremido no rodapé (`text-ink-faint`, some em 0); breakdown só no `title` (hover) | Subir pra faixa global, número display grande + mini-lista por plataforma | M |
| Baixa | Relatório pós-live sem nada que puxe o streamer até ele | Toast "Relatório fresquinho" no stop + selo "NOVO" na sidebar | M |
| Baixa | Sem `focus-visible` na sidebar/títulobar; sem `aria-current` no item ativo | Anel de foco tomate duro + `aria-current="page"` | S |
| Baixa | "Qualidade" tem peso de passo principal sendo set-and-forget | Considerar presets em destaque ou rebaixar a cartão dentro de outra tela | L |
| Baixa | Badge "pitrol.dev" no item Sobre destoa da voz 1ª pessoa do Petro | Trocar por "feito pelo Petro" ou mover o link pra dentro de Sobre | S |

### Primeiro uso & Onboarding
Voz e identidade bem aplicadas; o buraco é resiliência ao erro no gargalo nº1 (conectar o OBS).

| Severidade | Problema | Recomendação | Esforço |
|---|---|---|---|
| Bloqueador | Nenhum plano B manual: `rtmp://127.0.0.1:1935/live` e a key `live` nunca aparecem se o auto-config falha | Bloco manual copiável (Personalizado/Servidor/Chave) no erro do wizard e na tela Ao vivo | M |
| Alta | Erro do OBS joga `String(e)` cru na cara do streamer (`ObsWizard.tsx:28-29, 96`) | Mapear falhas comuns pra recados com checklist; técnico em "detalhes" colapsável | S |
| Parcial | "Pular" só no passo 0; sem X nem Esc (mitigado: os dots deixam voltar ao passo 0) | Manter "Pular"/X visível em todos os passos + fechar com Esc | S |
| Baixa | Onboarding é só folheto: termina sem entregar a 1ª ação; "Pular" não dispara `onStart` | Último passo e o Pular levam a Plataformas com estado-vazio convidativo | M |
| Baixa | Nome do auto-config muda a cada tela (Configurar sozinho / Conectar e configurar / Conectar ao OBS) | Um nome só, repetido no onboarding, no botão e no header do wizard | S |
| Baixa | Porta 4455 fixa no texto, sem campo pra host/porta | Host/porta como campos opcionais colapsados em "avançado" | M |
| Baixa | Jargão "keyframe 2s + CBR" jogado no público não-técnico | Tirar do onboarding; prometer que a Corneta acerta isso por você | S |
| Baixa | Secundários (Voltar/Pular/Fechar) em `text-ink-faint`, alvos minúsculos; dots de 8px | Subir contraste pra `ink-muted`, padding ≥40px, dots como blocos quadrados | S |
| Baixa | Modais sem `role=dialog`, focus trap ou Esc | `role="dialog"` + foco inicial + trap + Esc + `aria-live` na troca de passo | M |
| Baixa | "Conectando…" pode travar sem timeout nem cancelar | Timeout (~10s) que cai em erro claro; segurar fechar-por-backdrop | S |
| Baixa | Tutorial some pra sempre depois de `corneta.welcomed` | "Rever o tour" em Sobre/Config reabrindo o carrossel | S |

### Plataformas
Cards densos, drag handle, cofre de chave e empty state com mascote funcionam bem. Os dois maiores são estruturais (Tema C).

| Severidade | Problema | Recomendação | Esforço |
|---|---|---|---|
| Bloqueador | TikTok/X/Instagram não têm onde colar a URL de ingestão; card mostra `'rtmp://'` como se fosse válido (`PlatformsScreen.tsx:235`, `platforms.ts:67/77/87`) | Abrir o campo sempre que `ingestUrl` for incompleta; tratar `'rtmp://'` como não definida | M |
| Alta | Destino quebrado (sem chave/nome vazio) não dá sinal aqui — `targetIssues` só roda no Ao vivo | Selo "PRONTO" (latão) vs "FALTA CHAVE"/"SEM URL" (tomate) no card | M |
| Baixa | "Pegar minha chave" some justo em TikTok/X/IG/Custom (sem `keyUrl`) | Mostrar a `note` existente + link pro painel genérico da plataforma | S |
| Baixa | Remover chave é destrutivo, sem confirmar nem desfazer (vs. undo no remover destino) | Confirmação inline ou toast com "Desfazer" | S |
| Baixa | Reordenar destinos só por mouse/drag | Handlers de teclado (setas) na alça ou botões ▲▼ | M |
| Baixa | Modal "Quem entra na corneta?" sem `role=dialog`/foco/trap | `role="dialog"` + foco gerenciado + `focus-visible` duro | M |
| Baixa | Nome do destino é editável mas parece texto fixo (borda só no hover) | Lápis discreto ou underline pontilhado, igual ao nome do Perfil | S |
| Baixa | "Twitch 2" (add) vs "Twitch (cópia)" (duplicar): dois padrões de nome | Unificar a convenção (nome é renomeável de qualquer jeito) | S |
| Baixa | Resultado de "Testar rede" não limpa ao trocar chave/URL/enabled | Zerar `testResult` no `useEffect` da chave do target, ou marcar timestamp | S |
| Baixa | Picker não sinaliza plataformas já adicionadas | Selo discreto "já na corneta ×N" (sem desabilitar) | S |

### Qualidade (encoding)
A didática é ótima ("Na lata/Esperto/Caprichado", barra de carga, estimativa de upload). Faltam travas e a ponte com a realidade da máquina.

| Severidade | Problema | Recomendação | Esforço |
|---|---|---|---|
| Alta | Mostra `X sessões` do encoder mas nunca compara `transcodeCount` com `maxSessions` — a live quebra sem aviso | Bloco de erro duro quando transcodes > maxSessions, já no card do modo que vai estourar | M |
| Alta | Campo de bitrate aceita 0, negativo ou absurdo (`onChange` direto, sem min/max) | Validação inline pôster (borda tomate + microcopy), clamp e chip "recomendado: 6000" | M |
| Baixa | "Encoders na máquina" despeja jargão cru, sem estado carregando/vazio | Frase didática 1ª pessoa + estados "Vendo o que tem aqui…" / "Sem placa, vai de CPU" | S |
| Baixa | Barra de CPU comunica perigo só pela cor; `Math.min(1,load)` esconde estouros | Palavra ao lado do % ("tranquilo/pega pesado/vai travar"); "ALÉM DA CONTA" quando passa de 1 | S |
| Baixa | Hints (bitrate, hardware×software) só abrem no hover | Tornar o ícone focável e abrir em focus/tap | S |
| Baixa | "Caprichado = sob medida" mas resolução e FPS são só leitura | Expor res/FPS como selects (presets seguros) ou ajustar a copy do card | M |
| Baixa | ReframeEditor só aparece com vertical + transcode + botão `subtle` pequeno | Aviso "vertical recortado no centro — ajuste" com botão em destaque | S |
| Baixa | "Automático" no encoder não revela o que vai usar de verdade | Mostrar o destino inline ("Automático → NVENC") | S |
| Baixa | Subtítulo fala "codificado", neutro/técnico, fora da voz | Reescrever no tom do dono ("quanto a tua máquina vai suar…") | S |
| Baixa | Tags "Mais leve/Máx. qualidade" em contraste fraco e inconsistentes com o badge do hybrid | Padronizar todas como mini-badge sólido no mesmo canto | S |

**Não procede / já tratado:** "Estima upload mas nunca pergunta 'cabe na minha internet?'" foi **refutado** — o produto já tem teste de upload real e o GoLive compara `est.uploadKbps` com a banda real gerando tom ok/warn/bad e alerta explícito (`GoLiveScreen.tsx:98-108, 240-246, 534-543`). Por design, a EncodingScreen é a tela de custo/qualidade, não a de pré-voo; não duplicar.

### Ao vivo (caminho crítico)
Carrega bem a personalidade e cobre muita coisa, mas tenta ser bancada de setup E sala de guerra na mesma hierarquia (Tema B).

| Severidade | Problema | Recomendação | Esforço |
|---|---|---|---|
| Alta | Cartões de setup ("Liga no OBS", "Banda de upload") ficam fixos no topo enquanto AO VIVO; "Testar upload" segue clicável | Recolher setup atrás de `!live && !starting`; promover cronômetro/máquina/destinos; desabilitar o teste ao vivo | M |
| Alta | Guardião, Proteção de queda e Auto-bitrate não aparecem aqui — sem sinal de "armado" | Linhas/selos "ARMADO" no Check-up pré-live, com atalho pra Config | M |
| Baixa | Viewers somados ausentes na própria tela Ao vivo | Número chunky "X assistindo" perto do cronômetro + viewer por destino | M |
| Baixa | Cartão de erro não oferece nenhuma saída (`GoLiveScreen.tsx:156-166`) | Botões "Tentar de novo", "Ver logs", "Configurar OBS" (ações já existem na API) | S |
| Baixa | "Marcar momento" falha em silêncio durante "starting" (catch vazio) | Desabilitar em `starting` ou dar toast "ainda não tô gravando" | S |
| Baixa | Pausar destino: alvo ~32px, sem rótulo, sem confirmar/desfazer | Pílula rotulada "Pausar/Retomar" ≥40px + toast com desfazer | M |
| Baixa | "Aguardando o OBS… (cancelar)" mistura status e ação; mensagem repetida 3× | Separar status (faixa não clicável) de um "Cancelar" menor; consolidar as 3 mensagens | M |
| Baixa | Máquina do tempo / replay instantâneo sem ponto de descoberta | "Salvar últimos 30s" ao lado de "Marcar momento" (ou gancho "em breve") | L |
| Baixa | Enquadramento 9:16 não é descobrível a partir do Ao vivo | Selo "vertical 9:16" + "ajustar enquadramento" nos cartões de destino vertical | M |
| Baixa | Bitrate/FPS/Quedas somem inteiros abaixo de 640px (`hidden ... sm:flex`) | Manter ao menos Bitrate e Quedas em larguras estreitas | S |
| Baixa | "keyframe 2s + CBR" repetido 3× na mesma tela | Manter a dica uma vez só (no Check-up); remover do cartão de copiar | S |

### Chat, Alertas & Popout
Feed denso, auto-scroll inteligente, badges por papel e popout always-on-top bem resolvidos. O problema é a cadeia de descoberta e os estados que mentem.

| Severidade | Problema | Recomendação | Esforço |
|---|---|---|---|
| Alta | Botão CONECTAR desabilitado sem explicação + config recolhida = beco no 1º uso | `!configured` abre a config (ou o Conectar expande e foca "Adicionar canal"); `title` no botão apagado | S |
| Alta | Quando o filtro esconde tudo, o feed mente "Esperando mensagens…" | Passar flag `allFilteredOut` pro ChatFeed e mostrar vazio próprio com "religa um aí" | S |
| Alta | Deleção de moderação some sem rastro (feature anunciada, invisível) | Tombstone como carimbo de censura (`.pop-sm` tomate, texto tachado), com opção "esconder removidas" | M |
| Baixa | Subtítulo promete "origem" mas "Nome do canal" nasce desligado — 2 Twitches viram bagunça | Ligar o badge de origem por padrão quando há 2+ fontes da mesma plataforma | S |
| Baixa | Chips de filtro fixos por plataforma, ignoram fontes e não separam 2 Twitches | Gerar chips a partir das fontes ativas; filtrar por `source.id` | M |
| Baixa | Status de conexão é só uma bolinha colorida, sem rótulo/`aria` | `title`/`aria-label` + rótulo curto em estados não-ok ("caiu", "aguardando") | S |
| Baixa | No popout, Conectar não trava nem dá feedback sem canal; não dá pra configurar canal lá | Replicar o gating + aviso "Abrir Corneta pra configurar" (foca a janela principal) | M |
| Baixa | Limpar chat/alertas é destrutivo, sem confirmar nem desfazer | Confirmação leve (carimbo "Confirmar?") ou "Desfazer" por alguns segundos | S |
| Baixa | Mesmos ajustes têm nomes diferentes na tela e no popout | Padronizar os rótulos (constante compartilhada) | S |
| Baixa | "Acompanhar chat" não diz quantas mensagens passaram na pausa | Contador "Acompanhar chat · +37" em bloco latão | M |
| Baixa | Chips/abas/botões de janela sem foco visível; chips sem `aria-pressed` | Anel de foco latão duro + `aria-pressed` | S |
| Baixa | A tela inteira muda de largura ao ligar/desligar Alertas (`max-w-3xl ↔ 5xl`) | Manter `max-w-5xl` fixo; só a coluna de alertas entra/sai | S |

### Relatórios pós-live
A tela é rica e bem resolvida no conteúdo (hero stats, veredito, retenção, highlights pra clipar, atividade de chat, alertas, bitrate/CPU/GPU, render lag do OBS, janelas problemáticas, timeline) e — ao contrário das outras telas — **já tem estados de carregando, vazio e erro**. O buraco aqui não é ausência de estado: é que esses estados e cards fogem da identidade pôster, mais a falta de descoberta (Tema A) e um excluir destrutivo. _(Revisada diretamente nesta finalização: a rodada automática devolveu material de placeholder pra esta superfície.)_

| Severidade | Problema | Recomendação | Esforço |
|---|---|---|---|
| Alta | "Excluir" é destrutivo, botão `ghost` do mesmo peso de "Voltar" e logo ao lado dele; apaga na hora, sem confirmar nem desfazer (`ReportsScreen.tsx:153-157, 250-257`) | Confirmação inline ("Confirmar?") ou toast com "Desfazer"; afastar/rebaixar visualmente do "Voltar" | S |
| Alta | Nada puxa o streamer até o relatório quando a live acaba (transversal, Tema A — é um dos maiores prêmios do app) | Toast "Relatório fresquinho — vê como foi" no `stop` + selo "NOVO" na sidebar até abrir | M |
| Média | Marcadores dos gráficos (reconexão laranja, erro vermelho, raid azul, pico de chat latão) são pontos **só-cor**; só o de retenção tem legenda ("● raids") — nos de bitrate/chat o usuário não sabe o que o ponto significa (`ReportsScreen.tsx:189-218, 411-424`) | Legenda inline de marcadores em cada gráfico (bloco + rótulo), não depender só da cor | S |
| Média | Estado vazio e cards fogem do pôster: o vazio usa ícone genérico `Activity` + texto plano (`:86-93`) em vez do mascote+bloco latão de Plataformas; hero stats e cards de gráfico são planos (`border-border-soft`, sem `.pop`/`.accent-l`/topo de latão) e reimplementam o `Stat` à mão (`:269-288`) | Mascote no vazio (igual Plataformas); usar o primitivo `Stat` e as props `accent`/`pop` nos cards | M |
| Média | Veredito sempre com ícone `AlertTriangle`, mesmo no tom "ok" verde (`:291-297`) — triângulo de alerta num veredito positivo manda sinal trocado | Ícone por tom (check no ok, triângulo no warn/bad) | S |
| Baixa | A tela é uma pilha vertical de 7+ cards de gráfico; muito scroll pra responder "como foi minha live?" (hero stats + veredito no topo ajudam) | Manter o resumo no topo; recolher gráficos secundários (render lag do OBS, eventos) atrás de "ver detalhes" | M |
| Baixa | Só "Abrir pasta"/"Excluir"; sem exportar o relatório (imagem/PDF) pra compartilhar — loop de orgulho fica aberto (Fase 5 já planejada nas pendências) | Botão "Exportar" quando a Fase 5 entrar; por ora, "copiar resumo" | M |
| Baixa | Sem foco visível nas linhas de sessão / botões de copiar-tempo; gráficos sem alternativa textual | Anel de foco latão duro; resumo textual dos picos já existe no card — referenciar via `aria` | S |

**Já tratado:** carregando (`:84-85, 159-167`), vazio (`:86-93`) e erro de leitura (`:169-178`) **já existem** — não recriar; só vesti-los na linguagem pôster.

### Configurações
Honesta e bem escrita, mas estruturalmente é "ferro-velho de toggles" e os cards são planos demais pra marca (Tema D).

| Severidade | Problema | Recomendação | Esforço |
|---|---|---|---|
| Alta | Bloco "No OBS" mostra URL+chave mas não tem botão de copiar (`:74-79`) | Botões "Copiar" (URL e chave) + toast, no estilo subtle já usado em Backup/Logs | S |
| Alta | Campos de ingestão persistem a cada tecla, sem guarda ao vivo; Porta vazia vira `0` | Desabilitar/avisar quando ao vivo; validar porta 1-65535; salvar no blur | M |
| Alta | Card "Comportamento" mistura 8 coisas (segurança/sistema/aparência/dados) com peso igual | Quebrar em sub-cards rotulados com `SectionTitle`/`.accent-l` | M |
| Parcial | Segurança ao vivo enterrada como toggles planos (parte cross-screen confirmada no Tema A) | Bloco "Segurança ao vivo" distinto + badge de status, espelhado no Ao vivo | M |
| Baixa | obs-websocket: senha cega, sem testar conexão nem status | "Testar conexão" aqui mesmo, com estado carregando/ok/erro (Stat tone) | M |
| Baixa | Captura de atalho não trata falha de registro nem permite limpar | Tratar retorno de `registerShortcut` (toast de erro) + botão "Limpar" | M |
| Baixa | Importar config sobrescreve tudo sem confirmação | Confirmação antes de sobrescrever; diferenciar visualmente de Exportar | S |
| Baixa | Cards planos — quase não usam `.pop`/`.accent-l`/`.marker` | Ativar props que já existem (`accent`/`pop`) + `.marker` no título | S |
| Baixa | Senha do OBS é `<label>` solto fora do padrão `SettingRow` | Unificar no padrão `SettingRow` / "ação à direita" | S |
| Baixa | `if (!config) return null` — tela em branco enquanto carrega | Placeholder pôster ("carregando…") | S |
| Baixa | Watchlist do Guardião salva `split('\n')` cru, sem trim/dedup nem contagem positiva | "Vigiando 3 termos" + ignorar/trim linhas vazias ao salvar | S |

### Sobre & Editor de enquadramento
ReframeEditor é competente e on-brand, mas tem dois problemas de modelo mental e descoberta enterrada. Sobre é fino demais pro slot.

| Severidade | Problema | Recomendação | Esforço |
|---|---|---|---|
| Alta | Slider "Zoom" está invertido — máximo = menos zoom (`cropH = zoom`) | Inverter o mapeamento (`f = 1.4 - zoom`) mantendo o label; mostrar o valor ("1.4×") | S |
| Alta | "Capturar frame do OBS" sempre clicável, mas só funciona ao vivo; aviso escondido em 11px faint | Gate por `viewers.anyLive` (store já expõe); hint legível inline; botão primário quando vivo | M |
| Alta | "Enquadrar" mora 3 níveis abaixo (vertical + transcode + botão `subtle`), sem sinal de descoberta | Etiqueta `.marker`/badge brass no card do destino vertical; subir peso do botão quando não há reframe salvo | M |
| Baixa | "Centralizar" também zera o zoom — o label mente | Renomear pra "Do zero"/"Resetar", ou só centralizar (preservar zoom) | S |
| Baixa | Grade de terços só aparece quando NÃO há frame | Mostrar a grade sempre (ou toggle), por cima do frame | S |
| Baixa | Clique fora descarta o enquadramento sem aviso; sem Esc | Não fechar no backdrop com mudança não salva; adicionar Esc | M |
| Baixa | Recorte só por ponteiro — sem nudge por teclado nem foco gerenciado | Quadro focável + setas (1%/Shift 10%); autofocus + trap | M |
| Baixa | Sobre é fino demais pro slot de nav — falta versão/update/changelog/repo | Enriquecer (versão + "verificar atualizações" + repo) ou fundir em Config | M |
| Baixa | Link do GitHub vai pro perfil pessoal, não pro repo da Corneta | Link explícito pro repositório (star/issues/contribuir) | S |
| Baixa | Favicon do blog buscado da rede a cada visita, sem loading | Empacotar como asset local | S |
| Baixa | Preview "Vai sair assim" vazio só mostra "9:16", sem orientar | Micro-instrução no tom da casa ("Captura um frame pra ver o corte") | S |

### Design system & componentes
O kit acerta a identidade; o buraco é cobertura de estados e acessibilidade de foco — a causa-raiz de muitos achados de outras telas (Temas D e E).

| Severidade | Problema | Recomendação | Esforço |
|---|---|---|---|
| Alta | Button, Toggle e thumb do Slider sem foco visível (Input/Select têm `focus:border-brass` — inconsistente) | Anel de foco latão único (`focus-visible:ring`/outline duro, sem glow) nos três | S |
| Alta | Select custom não é combobox (sem setas/`role=listbox`/`aria`/typeahead) | Tornar combobox de verdade; visual 100% idêntico | M |
| Alta | Não existe primitivo de loading (só `disabled:opacity-40`) | Prop `loading` no Button + Spinner on-brand (bloco/listra de latão) | M |
| Alta | Falta primitivo de estado vazio — descoberta sofre nas telas que nascem vazias | `EmptyState` reutilizável (Card `.tilt` + `.marker` + CTA `.pop`) | M |
| Alta | Hint usa hex fixo (#1a130c/#fcf3e3) e quebra no tema claro; duplica o Tooltip | Consolidar num Tooltip só (tokens `bg-panel`/`text-ink`) | S |
| Alta | Input não tem estado de erro/inválido apesar de validação inline ser core | Prop `invalid` (border-bad + `aria-invalid`) + slots de prefixo/sufixo/mensagem | M |
| Baixa | Select (h-9, `bg-surface`) não alinha com Input/Button (h-10, `bg-surface-2`) | Padronizar altura (h-10) e fill (`surface-2`) | S |
| Baixa | Badge não tem tons semânticos — cada tela improvisa status | Variantes ok/warn/bad/live como o Stat já tem; default com fundo (adesivo) | S |
| Baixa | Toasts sem `aria-live`; tipo só muda a cor do ícone | `aria-live` no container + listra `.accent-l` por tipo | S |
| Baixa | Toggle: alvo de 24px, label não clicável, sem `disabled` | Label clicável ao lado + suporte a `disabled` | S |
| Baixa | Caixa de valor do Slider (w-10) corta valores grandes; sem `disabled` | `min-width` + `tabular-nums`; estado `disabled` | S |
| Baixa | "pop" colide: variante do Button, prop do Card e utilitário de sombra | Renomear a variante do Button ("tomate"/"shout"); reservar "pop" pra sombra | S |

### Voz, copy & didática (transversal)
A voz Corneta brilha quando aparece; o problema é inconsistência de registro e erros crus vazando.

| Severidade | Problema | Recomendação | Esforço |
|---|---|---|---|
| Alta | Card de banda mistura "meu"/"seu"/"teu" no mesmo bloco (`GoLiveScreen.tsx:219/229/244`) | Fixar UM registro; eliminar o "teu" | S |
| Alta | Erros técnicos crus (provável inglês) vazam pro não-técnico (`toast.error(\`Não rolou: ${e}\`)`, `snapshot.message`, `st.message`) | Mapa de erros comuns → frase pt-BR com próximo passo; técnico só no "ver detalhe" | M |
| Baixa | Toast "Transmissão encerrada" é corporativo no meio da gíria | "Cortou! Tá fora do ar 👋", alinhado ao verbo "Cortar" | S |
| Baixa | "Configurar sozinho" pode ser lido como "eu configuro na mão" (oposto do sentido) | Deixar o sujeito claro: "Configura pra mim" / "Deixa a Corneta configurar" | S |
| Baixa | Stat "Transcodes" usa jargão que a tela Qualidade evita de propósito | Usar "Recodificadas" nas duas telas; nunca expor "transcode" | S |
| Baixa | "CBR" e "keyframe" são afirmados como obrigatórios mas nunca explicados | Hint curto explicando cada um (como Bitrate/Encoder já têm) | M |
| Baixa | "BORA AO VIVO" desabilitado não diz por quê (sem `title`/`aria`) | `title`/`aria` dinâmico com o 1º problema; micro-legenda abaixo | S |
| Baixa | Onboarding só deixa pular no 1º passo; sem X/Esc | "Pular"/X em todos os passos + Esc | S |
| Baixa | Hints da sidebar ("como toca") não comunicam a função | Manter a gíria como kicker, garantir que o label carregue o sentido | S |
| Baixa | "Em 5 passos" é texto fixo desacoplado de `STEPS.length` | Interpolar `{STEPS.length}` | S |
| Baixa | Cópia dá feedback duplo: toast "Copiado!" + botão "Copiado" | Ficar só com o feedback inline do botão | S |

### Acessibilidade & interação (transversal)
A camada de acessibilidade está praticamente ausente, mas corrigível dentro do pôster (Tema E). Itens não duplicados nos transversais acima:

| Severidade | Problema | Recomendação | Esforço |
|---|---|---|---|
| Bloqueador | Navegação por teclado invisível — nenhum anel de foco em botões/navbar; Input/Select com `outline-none` | Utilitário `.focus-pop` (outline latão 3px + offset) via `:focus-visible`, aplicado globalmente | M |
| Alta | `prefers-reduced-motion` ignorado — pulso/marquee/shout rodam sempre | `@media (prefers-reduced-motion: reduce)` zerando/encurtando as animações | S |
| Alta | Estado AO VIVO não é anunciado a leitor de tela (só cor + ponto) | Região `aria-live="polite"` única no shell, alimentada por `snapshot.state` | M |
| Alta | `ink-faint` no tema claro fica ~3.2:1 (abaixo de AA), em texto pequeno de apoio | Escurecer o token (~#6f5d3f) pra cruzar 4.5:1, mantendo a hierarquia | S |
| Baixa | Modal de onboarding sem `role=dialog`/trap/Esc (mesmo padrão no ObsWizard) | `role="dialog"` + `aria-labelledby` + foco/trap/Esc | M |
| Baixa | Hint só no hover — invisível pra teclado/toque | Gatilho `<button>` focável + `focus-within` + `aria-describedby` | S |
| Baixa | Tela ativa na sidebar só por cor, sem `aria-current` | `aria-current="page"` no item ativo (principais e rodapé) | S |
| Baixa | Vários alvos de clique <~44px (ícones do Ao vivo, dots, rodapé) | Garantir alvo ~40-44px (padding/min-h) mantendo o ícone | S |
| Baixa | `user-select:none` global impede copiar mensagens de erro | `data-selectable` nas mensagens de erro ou botão "copiar erro" | S |
| Baixa | "BORA AO VIVO" desabilitado não expõe o motivo de forma acessível (`pointer-events-none` mata o tooltip) | `aria-describedby` ligando os cards de pendência ao botão | S |

---

## Roadmap priorizado

### (a) Ganhos rápidos — alto impacto, esforço S
Fundação barata que conserta vários achados de uma vez.

| Item | Por quê |
|---|---|
| Anel de foco global on-brand (`:focus-visible`, latão duro) | Resolve o bloqueador de teclado em botões, navbar, Toggle e Slider de uma só regra |
| `@media (prefers-reduced-motion: reduce)` no `index.css` | Respeita desconforto vestibular numa janela aberta horas; trivial e on-brand |
| Hint usando tokens (não hex fixo) | Conserta o tema claro quebrado e elimina o tooltip duplicado |
| Escurecer `ink-faint` no tema papel | Cruza AA em todo o texto de apoio pequeno; só ajusta um token |
| Botão copiar URL+chave do OBS em Config | Tira a fricção do dado mais acionável da tela do público não-técnico |
| Traduzir o erro do OBS (recado + checklist; técnico colapsável) | Ataca o ponto nº1 de abandono no onboarding |
| Unificar pronomes no card de banda ("seu", eliminar "teu") | Recupera a ilusão de voz única na tela mais crítica |
| `aria-current` na navbar + anel de foco | Custo quase zero, navegação principal acessível |
| Inverter o slider "Zoom" do ReframeEditor + mostrar o valor | Conserta um modelo mental invertido contra todo editor de vídeo |
| Cartão de erro do Ao vivo com saídas ("Tentar de novo/Ver logs/Configurar OBS") | As ações já existem na API; só não são oferecidas onde dói |

### (b) Apostas médias — esforço M
Mexem em uma tela ou criam um primitivo.

| Item | Por quê |
|---|---|
| Faixa de status global ao vivo (cronômetro + viewers + saúde + proteções + `aria-live`) | Resolve Tema B inteiro: status que viaja com o streamer, em linguagem que o app já tem |
| Tela Ao vivo troca de modo (recolhe setup, promove sala de guerra, trava o teste de upload) | Para de empurrar o que importa pra baixo da dobra durante a live |
| Bloco "SEU SEGURANÇA" no Ao vivo + selos "ARMADO" no Check-up | Descobre Guardião/JÁ VOLTO/Auto-bitrate antes de precisar deles |
| Cartão "Cole no OBS" no fluxo + fallback manual RTMP no erro do wizard | Fecha o beco sem saída do caminho crítico zero→ar |
| Campo de URL de ingestão pra TikTok/X/Instagram | Destrava destinos hoje impossíveis de completar |
| Selo de validação ("PRONTO"/"FALTA CHAVE") no card de Plataformas | Para o Ao vivo de ser o primeiro lugar onde o erro aparece |
| Tombstone de moderação no chat + estado vazio correto quando o filtro esconde tudo | Honestidade de estados; deleção vira feature visível |
| Conectar do chat abre/foca a config no 1º uso | Tira o iniciante do beco do botão apagado |
| Primitivos do kit: `loading` no Button + Spinner, `EmptyState`, `invalid` no Input | Causa-raiz de metade dos achados de estado; investimento que se paga em todas as telas |
| Select como combobox de verdade | Acessibilidade de teclado num componente usado no app inteiro |
| Validação de `maxSessions` e trava de bitrate em Qualidade | Evita a live quebrar/ser rejeitada sem aviso |
| Guarda de live nos campos de ingestão de Config | Impede quebrar a recepção do OBS no meio da transmissão |
| Gate de live na captura do ReframeEditor + descoberta do enquadre vertical | Conserta erro silencioso e expõe feature de alto valor no contexto |

### (c) Movimentos estruturais — reorganizam a arquitetura (M–L)

| Item | Esforço | Por quê |
|---|---|---|
| Quebrar Config "Comportamento" em sub-cards (Segurança ao vivo / Sistema / Aparência / Dados) | M | Acaba com o "ferro-velho de toggles" e dá hierarquia pôster |
| Repensar a numeração da nav (só os 3 passos de preparo; Chat como companheira; grupo "durante a live") | S–M | A IA para de prometer um wizard que o Chat quebra; abre espaço pra Alertas/segurança |
| EmptyState + descoberta plantada em cada tela vazia (Plataformas/Chat/Relatórios) | M | Transforma telas vazias em palco pra ensinar features densas |
| Loop de recompensa pós-live (toast + selo "NOVO" → Relatórios) | M | Fecha o ciclo "terminei → vejo como foi → quero de novo" |
| Máquina do tempo / replay com ponto de entrada ao lado de "Marcar momento" | L | A descoberta mais valiosa que falta no calor da transmissão |
| Qualidade como presets em destaque ("Bom/Melhor/Turbo") com avançado escondido | L | Reduz a sensação de "preciso entender encoding pra ir ao ar" |
| Enriquecer ou fundir a tela Sobre (versão/update/changelog/repo) | M | Hoje não paga o slot de navegação que ocupa |

---

## Princípios pra não errar

- **Pôster/quadrinho é a régua, não um tema a suavizar.** Toda correção — inclusive foco, estados vazios e erro — se resolve com bloco sólido, sombra dura, latão/tomate e marca-texto. Anel de foco é traço seco de latão, nunca glow. Se uma recomendação pede "respiro", borda cinza fina ou canto muito redondo, ela está errada.
- **Mostre o escudo antes do estrago.** Guardião, JÁ VOLTO e Auto-bitrate têm que ser visíveis e confirmáveis **antes** do BORA, não descobertos pelo toast que aparece depois do vazamento.
- **O estado "no ar" acompanha o streamer.** Cronômetro, viewers, saúde por destino e proteções viajam com ele em qualquer tela, e são anunciados também por leitor de tela. É o estado mais crítico do app — não pode morar dentro de uma aba.
- **Nenhum beco sem saída no caminho zero→ar.** Todo erro tem próximo passo na voz da casa; todo passo manual (URL do OBS, chave) é copiável e tem plano B. O público é não-técnico por definição.
- **Didática sem condescendência e numa voz só.** Traduzir jargão como a tela Qualidade já faz, com um único registro (o streamer-dono em 1ª pessoa / falando "seu" direto). Nada de "meu/seu/teu" no mesmo card, nada de erro cru em inglês, nada de "transcode" onde o resto diz "recodificar".
- **Conserte no kit, não na tela.** Loading, vazio, erro de input e badge semântico são primitivos — improvisá-los por tela gera a inconsistência que estamos pagando. Investir no design system é a alavanca mais barata de coerência.
- **Configurações é ajuste fino, não a casa das features.** O que muda a vida ao vivo mora onde a ação acontece; Config guarda o parafuso, não a joia.

---

## Método & cobertura

- **Como foi feito:** 12 revisores especializados (um por superfície — telas + transversais de design system, voz/copy e acessibilidade), cada um lendo o código real e ancorando os achados em `arquivo:linha`. Os achados de **alta severidade e bloqueadores foram conferidos contra o código** por um passe cético independente, descartando os refutados e os já tratados.
- **Números:** 123 achados no total — **3 bloqueadores, 32 de alta** (todos conferidos: 32 confirmados, 2 parciais, 1 já tratado), 56 médios, 25 baixos, 7 nits. 26 são estruturais (mudam organização entre telas). Categorias mais frequentes: estados (30), acessibilidade (21), descoberta (18).
- **Calibração honesta:** os achados de média/baixa severidade **não** passaram todos pelo passe de verificação linha a linha — trate-os como pistas fortes, não veredito. Os bloqueadores e as cinco teses estruturais (Temas A–E) são os que têm lastro mais sólido.
- **Lacuna conhecida:** a rodada automática devolveu placeholder pra superfície de Relatórios; aquela seção foi **revisada à mão** nesta finalização. Onde o documento cita "refutado/já tratado", a recomendação correspondente foi rebaixada ou removida de propósito.
- **Verificações pontuais confirmadas ao fechar:** zero `:focus-visible` / `prefers-reduced-motion` / `aria-live` / `aria-current` / `role="dialog"` em todo o `src`; Zoom do `ReframeEditor` invertido (`cropH = zoom`); TikTok/X/Instagram com `ingestUrl: "rtmp://"` e sem campo pra corrigir; modos de Qualidade "Na lata/Esperto/Caprichado".