// ============================================================
// Dicionário pt-BR da LP — a fonte da verdade da copy.
//
// Gerado a partir das strings que já estavam nos componentes; daqui pra frente
// é AQUI que se escreve. Chave em dot.case, prefixada pela seção.
//
// O tipo `Dict` sai deste arquivo, então o TypeScript recusa build se o inglês
// esquecer uma chave — que é o jeito de a tradução não apodrecer em silêncio.
// Ver docs/TOM-DE-VOZ.md antes de mexer em qualquer frase.
// ============================================================

export const pt = {
  // ---- analysis ----
  "analysis.advice.app.cpu":
    "Fecha {app} antes da próxima live, ou deixa ele fazendo menos coisa (menos abas, nada baixando). Se for um jogo, limita os FPS ou baixa a física.",
  "analysis.advice.app.gpu":
    "Deixa um pedaço da placa de vídeo livre pro OBS: se {app} for um jogo, limita os FPS ou baixa sombras e efeitos; se não for, fecha ele antes da live.",
  "analysis.advice.app.memory":
    "Antes da live, fecha aba e programa que você não tá usando. Se {app} continuar crescendo, fecha e abre ele de novo antes de entrar no ar.",
  "analysis.advice.encoding":
    "No OBS, reduza a resolução ou os FPS em Configurações → Vídeo. Se houver a opção, escolha o codificador da placa de vídeo em Configurações → Saída.",
  "analysis.advice.local":
    "Reinicie o OBS e a Corneta antes da próxima live. Se isso voltar a acontecer, confira se só um OBS está enviando para a Corneta.",
  "analysis.advice.network":
    "Teste o upload antes da próxima live. Se ele estiver variando, baixe o bitrate na tela Qualidade ou tire uma plataforma da transmissão.",
  "analysis.advice.platform":
    "Confira a chave desse canal e a página de status da plataforma. Se acontecer de novo só nela, reconecte a conta.",
  "analysis.advice.render":
    "Alivie essa cena no OBS: desligue fontes que não aparecem, reduza filtros e evite vários vídeos animados ao mesmo tempo.",
  "analysis.advice.signal":
    "Confere se o OBS ficou aberto, transmitindo e apontando pra Corneta — nesse trecho a galera ficou sem imagem.",
  "analysis.advice.unknown": "Veja os sinais deste trecho.",
  "analysis.cause.app.cpu": "{app} ocupou quase todo o processador",
  "analysis.cause.app.gpu": "{app} ocupou quase toda a placa de vídeo",
  "analysis.cause.app.memory":
    "{app} ocupou muita memória enquanto ela estava no limite",
  "analysis.cause.encoding": "O OBS não conseguiu preparar todos os quadros",
  "analysis.cause.local": "O vídeo perdeu ritmo entre o OBS e a Corneta",
  "analysis.cause.network": "A internet até as plataformas oscilou",
  "analysis.cause.platform": "A conexão com {target} ficou instável",
  "analysis.cause.render": "O OBS demorou para montar a imagem",
  "analysis.cause.signal": "O vídeo parou de chegar do OBS",
  "analysis.cause.unknown":
    "Ainda não há dados suficientes para apontar a causa",
  "analysis.confirm.unknown":
    "Na próxima live, abre este relatório de novo: se o trecho não voltar, foi coisa daquele dia.",
  "analysis.confirm.app.gpu":
    "Faz uma live curta com {app} de FPS limitado ou fechado. Se o próximo relatório não mostrar o OBS pulando quadros, era ele.",
  "analysis.confirm.app.cpu":
    "Faz uma live curta sem {app} aberto. Se o próximo relatório sair limpo, era ele.",
  "analysis.confirm.app.memory":
    "Fecha e abre {app} antes da próxima live. Se a memória não encostar no limite no gráfico da máquina, era ele.",
  "analysis.confirm.render":
    "Tira uma fonte pesada da cena (navegador, câmera com filtro) e faz uma live curta. Se o OBS parar de pular quadros, era a cena.",
  "analysis.confirm.encoding":
    "Baixa a resolução ou os FPS no OBS e faz uma live curta. Se o OBS parar de pular quadros, o vídeo estava pesado demais pro PC.",
  "analysis.confirm.local":
    "Reinicia o OBS e a Corneta antes da próxima live. Se o trecho não voltar, era isso.",
  "analysis.confirm.network":
    "Testa o upload na tela Qualidade antes da próxima live. Se ele oscilar lá, a internet é o ponto.",
  "analysis.confirm.platform":
    "Na próxima live, olha se foi só {target} de novo. Duas vezes seguidas na mesma plataforma é a plataforma; se mudar, é a sua rota.",
  "analysis.confirm.signal":
    "Confere se o OBS ficou aberto e apontando pra Corneta. Se o trecho coincidir com você trocando de cena ou o OBS travar, é ali.",
  "analysis.event.cpuHigh": "CPU em {pct}%",
  "analysis.event.end": "Fim da transmissão",
  "analysis.event.error": "{target} com erro",
  "analysis.event.marker": "📍 {label}",
  "analysis.event.reconnect": "{target} reconectou",
  "analysis.event.recover": "{target} voltou",
  "analysis.event.signalLost": "{target} ficou sem sinal do OBS",
  "analysis.event.start": "Início da transmissão",
  "analysis.highlight.bits": "{user}: {n} bits",
  "analysis.highlight.chatSpike": "Chat explodiu ({rate}/min)",
  "analysis.highlight.raid": "Raid de {user} (+{n})",
  "analysis.highlight.subgift": "{user} presenteou {n} subs",
  "analysis.highlight.superchat": "Super chat gordo de {user}",
  "analysis.highlight.viewerJump": "+{delta} assistindo de uma vez",
  "analysis.parse.alert.userFallback": "alguém",
  "analysis.parse.marker.labelFallback": "Momento",
  // O caixa-alta do pôster é desenho: o recap.ts aplica .toUpperCase() aqui, como
  // já faz nos rótulos vizinhos do canvas.
  "analysis.recap.bestMoment": "Melhor momento",
  "analysis.signal.appCpu": "{app} chegou a {pct}% do processador",
  "analysis.signal.appGpu": "{app} chegou a {pct}% da placa de vídeo",
  "analysis.signal.appMemory": "{app} usou {gb} GB de memória",
  "analysis.signal.bitrateDrop": "A qualidade enviada caiu nesse trecho",
  "analysis.signal.cpu": "O processador chegou a {pct}%",
  "analysis.signal.gpu": "A placa de vídeo chegou a {pct}%",
  "analysis.signal.memory": "A memória chegou a {pct}%",
  "analysis.signal.obsCongested":
    "O envio do OBS para a Corneta ficou limitado ({pct}%)",
  "analysis.signal.obsRender":
    "O OBS levou até {ms} ms para montar cada quadro",
  "analysis.signal.obsSignalLost": "O OBS parou de enviar vídeo",
  "analysis.signal.outputSkipped":
    "O OBS não conseguiu preparar {count} quadros para envio",
  "analysis.signal.reconnected": "{targets} precisou reconectar",
  "analysis.signal.renderSkipped":
    "O OBS não conseguiu montar {count} quadros a tempo",
  "analysis.signal.targetDropped":
    "As plataformas perderam {count} quadros nesse trecho",
  "analysis.verdict.app.detail":
    "Em {n} {stretch}, {app} disputou recursos com o vídeo no mesmo momento em que quadros atrasaram.{brief}",
  "analysis.verdict.app.title": "{app} deixou pouco espaço para a live",
  "analysis.verdict.brief":
    " Foi coisa rápida ({sec}s no total) — a galera provavelmente nem percebeu.",
  "analysis.verdict.clean.detail":
    "Vasculhei a live inteira e não vi perrengue nenhum.",
  "analysis.verdict.clean.title": "Transmissão limpa",
  "analysis.verdict.encoding.detail":
    "Em {n} {stretch}, o OBS não conseguiu preparar todos os quadros a tempo.{brief} Reduza a resolução ou os FPS no OBS para deixar mais folga.",
  "analysis.verdict.encoding.title": "O vídeo ficou pesado para o computador",
  "analysis.verdict.encoding.title.brief": "Engasgo rápido ao preparar o vídeo",
  "analysis.verdict.local.detail":
    "Em {n} {stretch}, o vídeo perdeu ritmo antes mesmo de sair do seu computador.{brief}",
  "analysis.verdict.local.title": "O vídeo engasgou entre o OBS e a Corneta",
  "analysis.verdict.network.detail":
    "Em {n} {stretch}, a qualidade caiu ou mais de uma plataforma reconectou ao mesmo tempo.{brief}",
  "analysis.verdict.network.title": "A internet até as plataformas oscilou",
  "analysis.verdict.network.title.brief": "Oscilação rápida no envio",
  "analysis.verdict.platform.detail":
    "Em {n} {stretch}, só uma plataforma foi afetada. Isso aponta para a conexão daquele canal, mas ainda não confirma de qual lado foi.{brief}",
  "analysis.verdict.platform.title": "Uma plataforma perdeu o ritmo",
  "analysis.verdict.render.detail":
    "Em {n} {stretch}, o OBS demorou para montar a imagem. Alivie a cena, reduza filtros ou evite vários vídeos animados juntos.{brief}",
  "analysis.verdict.render.title": "O OBS demorou para montar a imagem",
  "analysis.verdict.signal.detail":
    "{n} {stretch} sem vídeo chegando do OBS — a galera ficou vendo tela parada.",
  "analysis.verdict.signal.title": "O sinal do OBS caiu",
  "analysis.verdict.windows.detail": "Veja os detalhes de cada um abaixo.",
  "analysis.verdict.windows.title": "{n} {patch} com problema",
  "analysis.why.delay.same": "Na mesma hora,",
  "analysis.why.delay.after": "{sec}s depois,",
  "analysis.why.app.gpu": "{app} segurou {pct}% da placa de vídeo",
  "analysis.why.app.cpu": "{app} segurou {pct}% do processador",
  "analysis.why.app.memory":
    "{app} chegou a {gb} GB com a memória do PC em {pct}%",
  "analysis.why.effect.render":
    "{delay} o OBS pulou {count} quadros ao montar a cena",
  "analysis.why.effect.encode":
    "{delay} o OBS não conseguiu codificar {count} quadros",
  "analysis.why.effect.renderLag":
    "{delay} o OBS passou a levar até {ms} ms por quadro",
  "analysis.why.effect.dropped":
    "{delay} as plataformas ficaram sem {count} quadros",
  "analysis.why.mech.render": "O OBS pulou {count} quadros ao montar a cena",
  "analysis.why.mech.encode": "O OBS não conseguiu codificar {count} quadros",
  "analysis.why.mech.renderLag": "O OBS passou a levar até {ms} ms por quadro",
  "analysis.why.mech.dropped": "As plataformas ficaram sem {count} quadros",
  "analysis.why.scope.pcOnly":
    "A internet e as plataformas seguiram normais — o gargalo foi dentro do PC",
  "analysis.why.scope.allTargets":
    "Todas as plataformas sentiram ao mesmo tempo",
  "analysis.why.scope.oneTarget":
    "Só {target} sentiu; as outras seguiram normais",
  "analysis.why.machine.gpu":
    "A placa de vídeo estava em {pct}%, mas nenhum programa sozinho explica",
  "analysis.why.machine.cpu":
    "O processador estava em {pct}%, mas nenhum programa sozinho explica",
  "analysis.why.machine.memory": "A memória do PC estava em {pct}%",
  "analysis.why.machine.headroom": "Placa de vídeo e processador tinham folga",
  "analysis.why.own.obs.gpu": "O próprio OBS chegou a {pct}% da placa de vídeo",
  "analysis.why.own.obs.cpu": "O próprio OBS chegou a {pct}% do processador",
  "analysis.why.own.corneta.gpu":
    "A própria Corneta chegou a {pct}% da placa de vídeo",
  "analysis.why.own.corneta.cpu":
    "A própria Corneta chegou a {pct}% do processador",
  "analysis.why.local.congested":
    "O envio do OBS pra Corneta ficou limitado em {pct}%",
  "analysis.why.local.beforeInternet":
    "Isso acontece antes de o vídeo sair do PC — internet e plataformas não entram nessa",
  "analysis.why.network.reconnect": "{targets} reconectaram ao mesmo tempo",
  "analysis.why.network.bitrate":
    "A qualidade enviada caiu pra todas as plataformas de uma vez",
  "analysis.why.network.pcFine":
    "O OBS e o PC estavam bem — o problema começou depois que o vídeo saiu daqui",
  "analysis.why.network.limit":
    "Com esses dados não dá pra separar internet, rota e plataforma",
  "analysis.why.platform.limit":
    "Pode ser a rota até {target} ou a própria plataforma — esses dados não separam os dois",
  "analysis.why.signal.stopped": "O OBS parou de mandar vídeo pra Corneta",
  "analysis.why.signal.blank":
    "Todas as plataformas ficaram sem imagem ao mesmo tempo",
  // Substantivos soltos, pros buracos das frases acima. Em português os dois são
  // a mesma palavra; em inglês {patch} anda sozinho e vira "rough patch".
  "analysis.verdict.patch.one": "trecho",
  "analysis.verdict.patch.other": "trechos",
  "analysis.verdict.stretch.one": "trecho",
  "analysis.verdict.stretch.other": "trechos",

  // ---- slate do JÁ VOLTO ----
  // Isto NÃO é interface: é o texto desenhado no cartão que vai AO AR quando o
  // sinal do OBS cai. Quem lê é o público do streamer.
  "brb.slate.subtitle": "já já tô de volta — segura a corneta 📣",
  "brb.slate.title": "JÁ VOLTO",

  // ---- chat ----
  "chat.account.brokerError":
    "Login oficial da Corneta fora do ar: {error}. Dá pra entrar com credenciais próprias nas opções avançadas.",
  "chat.account.byok.hide": "ocultar opções avançadas",
  "chat.account.byok.show": "usar credenciais próprias",
  "chat.account.desktopOnly": "Disponível no app instalado.",
  "chat.account.footer":
    "Sem entrar, a Corneta lê o chat mas não manda mensagem nem aplica timeout.",
  "chat.account.kick.forgot.toast": "Esqueci suas credenciais da Kick",
  "chat.account.kick.official.toast": "Login oficial da Kick de volta",
  "chat.account.kick.ownCreds.toast": "Usando suas credenciais da Kick 🔒",
  "chat.account.needChannel":
    "Adicione um canal da **Twitch**, **YouTube** ou **Kick** na aba Canais pra logar.",
  "chat.account.privacy.link": "Política de Privacidade",
  "chat.account.privacy.text":
    "A Corneta usa sua conta só pro que tá na {link}. Dá pra desconectar quando quiser.",
  "chat.account.youtube.forgot.toast": "Esqueci suas credenciais do YouTube",
  "chat.account.youtube.official.toast": "Login oficial do YouTube de volta",
  "chat.account.youtube.ownCreds.toast":
    "Usando suas credenciais do YouTube 🔒",
  "chat.action.configure": "Configurar",
  "chat.action.connect": "Conectar",
  "chat.action.connect.needChannel": "Adicione um canal primeiro",
  "chat.action.disconnect": "Desconectar",
  "chat.action.popout": "Janela flutuante",
  "chat.action.popout.title":
    "Uma janelinha do chat que fica por cima de tudo.",
  "chat.action.reconnect": "Reconectar",
  "chat.action.reconnect.title": "Religa as fontes que caíram.",
  "chat.alerts.button": "Alertas",
  "chat.alerts.button.count": "Alertas ({n})",
  "chat.alerts.clear.confirmLabel": "Limpar?",
  "chat.alerts.clear.confirmTitle": "Clique pra confirmar",
  "chat.alerts.clear.title": "Limpar alertas",
  "chat.alerts.newPulse": "Chegou alerta novo!",
  "chat.alerts.sourceDown":
    "{source} caiu — confere o token em Configurar → Fontes de alerta",
  "chat.alertsrc.add": "Adicionar fonte",
  "chat.alertsrc.collapse": "Recolher fonte",
  "chat.alertsrc.empty":
    "Nenhuma fonte de alerta. Adicione **Streamlabs** ou **StreamElements** pra ver doações.",
  "chat.alertsrc.expand": "Expandir fonte",
  "chat.alertsrc.hint.streamelements":
    'StreamElements → seu perfil → Channels → "Show secrets" → JWT Token. ⚠️ Expira a cada ~2 semanas — é só colar de novo.',
  "chat.alertsrc.hint.streamlabs":
    'Streamlabs → Account Settings → API Settings → "Your Socket API Token". Pega doações, follows, subs e bits.',
  "chat.alertsrc.lede":
    "Cole o token do **Streamlabs** ou **StreamElements** — as doações caem no feed de Alertas.",
  "chat.alertsrc.noToken": "sem token",
  "chat.alertsrc.remove": "Remover fonte",
  "chat.alertsrc.replace": "Trocar",
  "chat.alertsrc.section": "Fontes de alerta",
  "chat.alertsrc.status.dropped": "caiu",
  "chat.alertsrc.status.error": "erro",
  "chat.alertsrc.status.live": "no ar",
  "chat.alertsrc.tokenSaved": "token salvo",
  "chat.alertsrc.tokenStored.chip": "Token no cofre",
  "chat.alertsrc.tokenStored.toast": "Guardei o token no cofre 🔒",
  "chat.autoconnect.hint": "Sem clicar em Conectar toda live.",
  "chat.autoconnect.label": "Conectar o chat sozinho quando eu entrar no ar",
  "chat.byok.forget": "esquecer minhas credenciais",
  "chat.byok.officialDown":
    "(o oficial não respondeu na última checagem — suas credenciais ficam salvas de qualquer jeito)",
  "chat.byok.useOfficial": "Voltar pro login oficial da Corneta",
  "chat.byok.useSaved": "Usar as credenciais que já salvei",
  "chat.channels.add": "Adicionar canal",
  "chat.channels.empty":
    "Nenhum canal ainda. Adicione um da **Twitch**, **Kick**, **YouTube** ou **Cinefy (experimental)** — pode repetir a mesma (ex.: 2 Twitches).",
  "chat.channels.section": "Canais",
  "chat.channels.which": "De qual?",
  "chat.clear": "Limpar",
  "chat.clear.confirm": "Limpar mesmo?",
  "chat.common.cancel": "Cancelar",
  "chat.common.copied": "Copiado",
  "chat.common.copy": "Copiar",
  "chat.common.paste": "Colar",
  "chat.common.removeConfirm": "Remover mesmo?",
  "chat.common.save": "Salvar",
  "chat.common.test": "Testar",
  "chat.common.testing": "Testando…",
  "chat.config.tab.account": "Conta",
  "chat.config.tab.alerts": "Alertas",
  "chat.config.tab.channels": "Canais",
  "chat.config.tab.display": "Exibição",
  "chat.config.tab.overlays": "Overlays",
  "chat.config.title": "Configurar o chat",
  "chat.display.alertFontSize": "Tamanho da fonte dos alertas",
  "chat.display.badges": "Badges",
  "chat.display.badges.hint": "selos de sub/mod/VIP",
  "chat.display.chatFontSize": "Tamanho da fonte do chat",
  "chat.display.emotes": "Emotes",
  "chat.display.emotes.hint": "figurinhas no lugar do :código:",
  "chat.display.platform": "Plataforma",
  "chat.display.platform.hint": "de qual plataforma veio",
  "chat.display.section": "O que mostrar no feed",
  "chat.display.source": "Canal",
  "chat.display.source.hint": "útil com 2+ canais na mesma plataforma",
  "chat.display.timestamps": "Horário",
  "chat.display.timestamps.hint": "hora da mensagem",
  "chat.display.viewers": "Quem assiste",
  "chat.display.viewers.hint": "contador de espectadores",
  "chat.error.connect": "Não consegui conectar o chat — confira os canais.",
  // ---- Feed de alertas ----
  // O verbo entra depois do nome de quem fez: "@fulano seguiu".
  "chat.alerts.empty":
    "Inscrições, gifts, bits, raids e super chats de todas as plataformas aparecem aqui.",
  "chat.alerts.detail.bits": "{n} bits",
  "chat.alerts.detail.months.one": "1 mês",
  "chat.alerts.detail.months.other": "{count} meses",
  "chat.alerts.detail.raidViewers": "{n} viewers",
  "chat.alerts.detail.subs.one": "1 sub",
  "chat.alerts.detail.subs.other": "{count} subs",
  "chat.alerts.verb.bits": "mandou bits",
  "chat.alerts.verb.follow": "seguiu",
  "chat.alerts.verb.member": "virou membro",
  "chat.alerts.verb.raid": "trouxe um raid",
  "chat.alerts.verb.resub": "renovou a inscrição",
  "chat.alerts.verb.sub": "se inscreveu",
  "chat.alerts.verb.subgift": "presenteou",
  "chat.alerts.verb.superchat": "mandou um Super Chat",
  "chat.alerts.verb.tip": "doou",
  // ---- Estado vazio do feed de chat ----
  "chat.feed.empty.disconnected.body":
    "Adicione um canal (Twitch, Kick, YouTube ou Cinefy experimental) e clique em Conectar pra puxar o chat.",
  "chat.feed.empty.disconnected.title": "Chat desconectado",
  "chat.feed.empty.filtered.body":
    "Você desligou todas as plataformas. Religa uma ali em cima pra ver o chat de novo.",
  "chat.feed.empty.filtered.title": "Filtro escondeu tudo",
  "chat.feed.empty.waiting.body":
    "Assim que a galera mandar mensagem, aparece aqui.",
  "chat.feed.empty.waiting.title": "Esperando mensagens…",
  "chat.feed.deleted.body": "mensagem apagada",
  "chat.feed.deleted.stamp": "apagada",
  "chat.feed.follow": "Acompanhar chat",
  "chat.feed.hint.ready":
    "Enquanto não ligar, a Corneta não lê nada do seu chat.",
  "chat.feed.hint.setup":
    "Adicione um canal (Twitch, Kick, YouTube ou Cinefy experimental) e clique em Conectar.",
  "chat.header.kicker": "A galera junta",
  "chat.header.subtitle":
    "Twitch, Kick, YouTube e Cinefy experimental no mesmo feed — até 2 Twitches.",
  "chat.header.title": "Chat unificado",
  "chat.kick.creds.openDeveloper": "abrir Developer",
  "chat.kick.creds.redirect":
    "Use o redirect **http://localhost:7395/callback**. O segredo fica só no cofre do Windows.",
  "chat.kick.creds.saved.toast": "Credenciais da Kick no cofre 🔒",
  "chat.login.prompt": "Entre na sua conta pra **enviar** e **moderar**",
  "chat.login.prompt.cta": "Configurar →",
  "chat.loginrow.browser.note":
    "Abri a autorização no navegador — é só confirmar.",
  "chat.loginrow.browser.openAgain": "Abrir de novo",
  "chat.loginrow.device.note":
    "Já copiei o código e abri a página do Google pra você — é só colar e autorizar.",
  "chat.loginrow.device.openPage": "Abrir a página",
  "chat.loginrow.device.step1": "Copie o código",
  "chat.loginrow.device.step2": "Cole na página que eu abri",
  "chat.loginrow.device.step3": "Autorize e pronto — a Corneta entra sozinha.",
  "chat.loginrow.device.title": "Falta 1 passo — autorizar no navegador:",
  "chat.loginrow.device.waitingParens": "(aguardando…)",
  "chat.loginrow.signedIn": "logado",
  "chat.loginrow.signedInAs": "logado como @{login}",
  "chat.loginrow.signin": "Entrar",
  "chat.loginrow.signout": "Sair",
  "chat.loginrow.unavailable": "indisponível nesta versão",
  "chat.loginrow.waiting": "aguardando…",
  // title dos botões que aparecem ao passar o mouse na mensagem.
  "chat.mod.action.ban": "Banir",
  "chat.mod.action.delete": "Apagar",
  "chat.mod.action.timeout": "Timeout 10 min",
  "chat.mod.banned": "Bani do chat",
  "chat.mod.deleted": "Apaguei a mensagem",
  "chat.mod.timeout": "Dei 10 min de timeout",
  "chat.overlay.addToObs": "Adicionar no OBS",
  // {block} é o título do bloco em minúsculas ("chat", "alertas").
  "chat.overlay.added.toast": "Pus o overlay de {block} no OBS",
  "chat.overlay.aria.alertPosition": "Posição do overlay de alertas",
  "chat.overlay.aria.alertSize": "Tamanho do overlay de alertas",
  "chat.overlay.aria.badges": "Selos",
  "chat.overlay.aria.chatPosition": "Posição do overlay de chat",
  "chat.overlay.aria.fade": "Sumir após",
  "chat.overlay.aria.hideCommands": "Esconder comandos",
  "chat.overlay.aria.maxMessages": "Máximo de mensagens",
  "chat.overlay.block.alerts": "Alertas",
  "chat.overlay.block.chat": "Chat",
  "chat.overlay.chatPos.bottom": "Embaixo (sobe)",
  "chat.overlay.chatPos.top": "Em cima (desce)",
  "chat.overlay.fetchError":
    "Overlay ligado, mas não consegui pegar as URLs — tenta de novo.",
  "chat.overlay.lede":
    "Servidor local que joga os **alertas** e o **chat** (com emotes) no OBS. Adicione a URL como **Browser Source** — uma vez só.",
  "chat.overlay.opt.badges": "Selos (mod/sub)",
  "chat.overlay.opt.duration": "Tempo na tela",
  "chat.overlay.opt.fade": "Sumir após (0 = nunca)",
  "chat.overlay.opt.follows": "Mostrar seguidores",
  "chat.overlay.opt.fontSize": "Tamanho da fonte",
  "chat.overlay.opt.hideCommands": "Esconder comandos (!)",
  "chat.overlay.opt.maxMessages": "Máx. de mensagens",
  "chat.overlay.opt.platformIcon": "Ícone da plataforma",
  "chat.overlay.opt.position": "Posição",
  "chat.overlay.opt.size": "Tamanho",
  "chat.overlay.opt.sound": "Som ao aparecer",
  "chat.overlay.pos.bottom": "Embaixo",
  "chat.overlay.pos.bottomLeft": "Canto inf. esquerdo",
  "chat.overlay.pos.bottomRight": "Canto inf. direito",
  "chat.overlay.pos.center": "No centro",
  "chat.overlay.pos.top": "Em cima",
  "chat.overlay.pos.topLeft": "Canto sup. esquerdo",
  "chat.overlay.pos.topRight": "Canto sup. direito",
  "chat.overlay.reAddNote":
    "Mudou uma opção? Clique **Adicionar no OBS** de novo (ou atualize a URL da fonte lá).",
  "chat.overlay.reopenTab": "Overlay ligado — reabra esta aba pra ver as URLs.",
  "chat.overlay.scale.lg": "Grande",
  "chat.overlay.scale.md": "Médio",
  "chat.overlay.scale.sm": "Pequeno",
  "chat.overlay.section": "Overlays pro OBS",
  "chat.overlay.starting": "Ligando o overlay…",
  "chat.overlay.test.alerts": "Mandei um alerta de teste — olha no OBS 📣",
  "chat.overlay.test.chat": "Mandei uma mensagem de teste — olha no OBS",
  "chat.popout.alertFont": "Fonte dos alertas",
  "chat.popout.alertsFirst": "Alertas antes do chat",
  "chat.popout.bothLayout.arrangement": "Disposição",
  "chat.popout.bothLayout.auto": "Automático",
  "chat.popout.bothLayout.col": "Empilhado",
  "chat.popout.bothLayout.row": "Lado a lado",
  "chat.popout.bothLayout.section": "Layout do “Ambos”",
  "chat.popout.chatFont": "Fonte do chat",
  "chat.popout.clear.chat": "Limpar chat",
  "chat.popout.displaySettings": "Configurar exibição",
  "chat.popout.divider": "Redimensionar chat e alertas",
  "chat.popout.feed.hint.ready": "Clique em Conectar pra puxar o chat.",
  "chat.popout.feed.hint.setup":
    "Configure os canais na janela principal da Corneta e conecte por aqui.",
  "chat.popout.needSetup": "Configure os canais na janela principal da Corneta",
  "chat.popout.openMain": "Abrir a Corneta",
  "chat.popout.tab.alerts": "Alertas",
  "chat.popout.tab.alerts.count": "Alertas {n}",
  "chat.popout.tab.both": "Ambos",
  "chat.popout.tab.chat": "Chat",
  "chat.popout.win.close": "Fechar",
  "chat.popout.win.maximize": "Maximizar",
  "chat.popout.win.minimize": "Minimizar",
  "chat.popout.win.restore": "Restaurar",
  "chat.popout.windowTitle": "Chat da Corneta",
  "chat.send.button": "Mandar",
  "chat.send.placeholder": "Manda no chat",
  // Linha de status do envio, uma por canal, coladas com " · ".
  "chat.send.status.connect": "{label}: conecte o chat pra logar",
  "chat.send.status.invalidToken": "{label}: token de envio inválido",
  "chat.send.status.reconnect": "{label}: reconecte o chat pra logar",
  "chat.send.status.signIn": "{label}: entre no {platform}",
  "chat.send.status.signedIn": "{platform} logado",
  "chat.send.target.aria": "Pra qual plataforma mandar",
  "chat.send.target.all": "Todas",
  "chat.source.collapse": "Recolher canal",
  "chat.source.expand": "Expandir canal",
  "chat.source.hint.kick":
    "O nome que aparece no link: kick.com/SEUNOME. Às vezes a Kick bloqueia a leitura e não conecta.",
  "chat.source.hint.cinefy":
    "O nome no link da Cinefy. Experimental e somente leitura: depende de endpoints não documentados e pode mudar sem aviso.",
  "chat.source.hint.twitch":
    "Só o nome do canal — o que vem depois de twitch.tv/.",
  "chat.source.hint.youtube": "Seu canal (@handle, URL ou ID).",
  "chat.source.nickname": "Apelido",
  "chat.source.nickname.optional": "(opcional)",
  "chat.source.nickname.placeholder": "ex.: Pitrol",
  "chat.source.noChannel": "sem canal",
  "chat.source.placeholder.kick": "ex.: xqc",
  "chat.source.placeholder.cinefy": "ex.: kett",
  "chat.source.placeholder.twitch": "ex.: pitrol",
  "chat.source.placeholder.youtube": "ex.: @seucanal",
  "chat.source.platformLabel": "Plataforma",
  "chat.source.remove": "Remover canal",
  "chat.source.toggle": "Ligar ou desligar {name}",
  "chat.source.value.kick": "Nome no link",
  "chat.source.value.cinefy": "Nome no link",
  "chat.source.value.twitch": "Canal",
  "chat.source.value.youtube": "Canal",
  "chat.status.connecting": "conectando…",
  "chat.status.empty": "Nenhum canal ainda",
  "chat.status.explain.connecting": "conectando…",
  "chat.status.explain.error":
    "caiu — confira o nome do canal; tô tentando de novo sozinho",
  "chat.status.explain.error.kick":
    "caiu — às vezes a Kick bloqueia a leitura; tô tentando de novo sozinho",
  "chat.status.explain.error.cinefy":
    "caiu — a integração experimental da Cinefy não respondeu; tô tentando de novo sozinho",
  "chat.status.explain.error.youtube":
    "caiu — confira o canal (@handle ou URL); tô tentando de novo sozinho",
  "chat.status.explain.live": "no ar",
  "chat.status.explain.waiting":
    "esperando a live começar — conecto sozinho quando ela subir",
  "chat.status.explain.waiting.youtube":
    "esperando sua live do YouTube começar — conecto sozinho quando ela subir",
  "chat.status.label.connecting": "conectando",
  "chat.status.label.dropped": "caiu",
  "chat.status.label.live": "no ar",
  "chat.status.label.waiting": "aguardando",
  "chat.status.ready": "Tudo pronto — é só conectar",
  "chat.status.ready.auto":
    "Tudo pronto — conecte, ou entre no ar que eu ligo sozinho",
  "chat.status.tooltip": "{source}: {explain}",
  "chat.viewers.count": "{n} assistindo",
  "chat.viewers.tooltip.hide": "Clique pra esconder (volta na config)",
  "chat.viewers.tooltip.row": "{source}: {n}",
  "chat.youtube.apikey.check": "Verificar",
  "chat.youtube.apikey.checking": "Verificando…",
  "chat.youtube.apikey.label": "Chave da API do YouTube",
  "chat.youtube.apikey.optional": "· opcional (bom ter)",
  "chat.youtube.apikey.placeholder": "cole sua API key (Data API v3)",
  "chat.youtube.apikey.tooltip":
    "Sem ela a Corneta já lê o chat. Com ela você ganha a contagem de “assistindo” do YouTube.",
  "chat.youtube.creds.guide.hide": "ocultar guia",
  "chat.youtube.creds.guide.show": "como conseguir?",
  "chat.youtube.creds.saved.toast": "Credenciais do YouTube no cofre 🔒",
  "chat.youtube.guide.step1":
    "Abra o Google Cloud Console e crie um projeto (dê qualquer nome, ex.: “Corneta”). Quando terminar, confira lá no topo se o projeto novo é o que está selecionado.",
  // Cada **negrito** deste passo a passo é um rótulo REAL da tela do Google
  // Cloud, e é o que a pessoa vai caçar com o olho enquanto lê. Traduzir junto
  // com o Console: se o Google mudar o nome do menu, muda aqui.
  "chat.youtube.guide.step2":
    "No menu **☰ → APIs e serviços → Biblioteca**, busque por **YouTube Data API v3** e clique em **Ativar**.",
  "chat.youtube.guide.step3":
    "Ainda em **APIs e serviços**, procure por **Tela de permissão OAuth** (nas versões novas isso aparece como **Público-alvo** ou **Branding**). Se pedir o **Tipo de usuário**, escolha **Externo** e siga.",
  "chat.youtube.guide.step4":
    "Preencha os **campos obrigatórios**: **Nome do app** (o que quiser), **E-mail de suporte do usuário** (o seu e-mail) e, mais pra baixo, **E-mail de contato do desenvolvedor** (o seu e-mail de novo). Salve e continue.",
  "chat.youtube.guide.step5":
    "Procure a seção **Usuários de teste** (fica na aba **Público-alvo** / “Audience”) e **adicione o e-mail da sua conta do YouTube**. Sem isso o login nem funciona.",
  "chat.youtube.guide.step6":
    "Em **Credenciais → Criar credenciais → ID do cliente OAuth**, escolha o tipo **TVs e dispositivos de entrada limitada** e crie.",
  "chat.youtube.guide.step7":
    "Copie o **Client ID** e o **Client Secret** e cole aqui embaixo. ↓",
  "chat.youtube.guide.warn.label": "⚠️ Importante:",
  "chat.youtube.guide.warn.text":
    "enquanto o app ficar em modo **“Teste” (Testing)** — o normal, sem passar pela verificação do Google — o login do YouTube **expira a cada ~7 dias**. Quando cair, é só voltar aqui e clicar em **Entrar** de novo. Por isso o passo de se colocar como **Usuário de teste** é obrigatório (publicar/verificar o app é opcional e bem mais burocrático).",

  // ---- components ----
  "components.app.censored.body":
    "Um termo seu apareceu na tela — a live volta sozinha quando ele sumir.",
  "components.app.censored.title": "JÁ VOLTO no ar",
  "components.app.leak.toast":
    '🛡️ "{snippet}" apareceu na tela — cortei pro JÁ VOLTO',
  "components.app.live.aria.censored":
    "JÁ VOLTO no ar — um termo seu apareceu na tela",
  "components.app.live.aria.error": "Erro na transmissão",
  "components.app.live.aria.live": "No ar em todas as plataformas",
  "components.app.live.aria.live.down.one":
    "No ar, mas {count} plataforma fora",
  "components.app.live.aria.live.down.other":
    "No ar, mas {count} plataformas fora",
  "components.app.live.aria.connectingTargets":
    "OBS conectado; conectando às plataformas",
  "components.app.live.aria.starting": "Aguardando o OBS conectar",
  "components.app.live.aria.stopped": "Fora do ar",
  "components.app.loading.boot": "Abrindo sua bancada…",
  "components.app.loading.error":
    "Não consegui ler a sua configuração. Tenta de novo — se continuar assim, abre os logs e me manda.",
  "components.app.loading.screen": "Afinando esta tela…",
  "components.app.shortcut.taken":
    "Não consegui ativar o seu atalho {shortcut} — outro programa já tá usando ele. Troque em Configurações → Atalho global.",
  "components.firstLive.dismiss.aria": "Dispensar o guia",
  "components.firstLive.dismiss.title": "Dispensar o guia da 1ª live",
  "components.firstLive.step.golive": "BORA AO VIVO",
  "components.firstLive.step.key": "Cole a chave de uma plataforma",
  "components.firstLive.step.obs": "Conecte o OBS",
  "components.firstLive.title": "Sua 1ª live em 3 passos",
  "components.legal.accept":
    "Ao continuar, você aceita os {terms} e a {privacy}.",
  "components.legal.link.privacy": "Política de Privacidade",
  "components.legal.link.terms": "Termos de Uso",
  "components.onboarding.art.key.label": "sua chave",
  "components.onboarding.art.onair.label": "No ar",
  "components.onboarding.back": "Voltar",
  "components.onboarding.dismissed.toast":
    "Sem pressa — o tour fica em Sobre → Rever o tour.",
  "components.onboarding.dot.aria": "Passo {n}",
  "components.onboarding.legalUpdate.body":
    "A gente atualizou os Termos de Uso e a Política de Privacidade. Dá uma olhada no que mudou — seguir usando a Corneta significa aceitar a versão nova.",
  "components.onboarding.legalUpdate.cta": "Aceitar e continuar",
  "components.onboarding.legalUpdate.title": "Os termos mudaram",
  "components.onboarding.next": "Próximo",
  "components.onboarding.picker.note":
    "Dá pra mudar depois. TikTok, X e qualquer RTMP seu ficam na tela Plataformas.",
  "components.onboarding.picker.text":
    "Marque onde você faz live e a Corneta já deixa as plataformas prontas — depois é só colar a chave de cada uma.",
  "components.onboarding.picker.title": "Onde você transmite?",
  "components.onboarding.skip": "Pular",
  "components.onboarding.skip.aria": "Pular o tour",
  "components.onboarding.start": "Bora começar",
  "components.onboarding.step1.text":
    "Você manda 1 stream do OBS e a Corneta espalha pra Twitch, YouTube, Kick e mais — tudo de uma vez.",
  "components.onboarding.step1.title": "Uma live, todo lugar",
  "components.onboarding.step2.text":
    "Cada plataforma vira um destino com a sua própria chave de transmissão — é só colar a de cada uma.",
  "components.onboarding.step2.title": "Escolha as plataformas",
  "components.onboarding.step3.text":
    "Em Ao vivo, o botão “Configura pra mim” acerta o OBS sozinho — sem mexer em menu técnico.",
  "components.onboarding.step3.title": "Liga no OBS",
  "components.onboarding.step4.text":
    "Um clique e você entra no ar em todas. Acompanhe os números de cada plataforma.",
  "components.onboarding.step4.title": "Solta a corneta",
  "components.onboarding.step5.text":
    "Todo o chat num lugar e, ao encerrar, um relatório do que travou.",
  "components.onboarding.step5.title": "Chat e relatórios",
  "components.onboarding.subtitle": "Em {n} passos, do OBS até o relatório.",
  "components.onboarding.title": "Opa! Bora cornetar?",
  "components.telemetry.crashes.body":
    "Manda o que quebrou — a etapa, o código e a mensagem do erro — com nomes, caminhos e textos seus apagados antes de sair.",
  "components.telemetry.crashes.title": "Enviar relatórios de falha",
  "components.telemetry.notice.allowed":
    "Pode sair: versão, tela/etapa, resultado, plataforma em enum, categorias do sistema e IDs aleatórios de correlação.",
  "components.telemetry.notice.details":
    "O que pode — e o que nunca pode — ser enviado",
  "components.telemetry.notice.error":
    "Não consegui salvar sua escolha. Nada novo foi enviado.",
  "components.telemetry.notice.forbidden":
    "Nunca entra no evento: chave de live, token, chat, título/categoria, OCR, imagem, áudio, vídeo, caminho local, hostname, IP como propriedade ou log cru.",
  "components.telemetry.notice.none": "Desligar as duas",
  "components.telemetry.notice.privacy":
    "São dados técnicos pseudonimizados, tratados pelo PostHog por até 90 dias.",
  "components.telemetry.notice.privacyLink": "Leia a política de privacidade",
  "components.telemetry.notice.save": "Salvar minhas escolhas",
  "components.telemetry.notice.saved": "Salvei sua escolha.",
  "components.telemetry.notice.subtitle":
    "Vem ligado pra eu achar bug antes de você. Desliga aqui ou depois, em Configurações.",
  "components.telemetry.notice.title": "Já estou mandando dados técnicos",
  "components.telemetry.usage.body":
    "Envia etapas concluídas, versão, categorias do sistema e resultado das operações — nunca conteúdo da live.",
  "components.telemetry.usage.title": "Enviar dados de uso",
  "components.toaster.dismiss.aria": "Fechar aviso",
  "components.toaster.region.aria": "Avisos",
  "components.ui.copied": "Copiado",
  "components.ui.copy": "Copiar",
  "components.ui.copy.aria": "Copiar {label}",
  "components.ui.experimental.label": "experimental",
  "components.ui.experimental.title":
    "Feature experimental — ainda em teste, pode falhar ou mudar",
  "components.ui.hint.aria": "Ajuda",
  "components.update.blocked.live":
    "Você tá no ar — instalar agora derrubaria a live.",
  "components.update.check.busy": "Olhando…",
  "components.update.check.cta": "Ver se tem versão nova",
  "components.update.check.error": "Não consegui checar agora: {error}",
  "components.update.check.found":
    "Saiu a Corneta {version} — o aviso tá lá em cima.",
  "components.update.check.none":
    "Nada novo por aqui — você já tá na {version}.",
  "components.update.cta": "Atualizar agora",
  "components.update.cta.blocked.title": "Não dá pra reiniciar no meio da live",
  "components.update.dismiss.aria": "Fechar o aviso da atualização",
  "components.update.dismiss.title":
    "Fechar o aviso — eu volto a avisar na próxima checagem",
  "components.update.downloading": "Baixando…",
  "components.update.downloading.pct": "Baixando {pct}%",
  "components.update.headline": "Saiu a Corneta {version}",
  "components.update.install.error": "Não consegui instalar: {error}",
  "components.update.installed.toast":
    "Instalei — feche e abra a Corneta pra terminar.",
  "components.update.ready": "Instalo e abro de novo num instante.",

  // ---- core ----
  "core.auth.login.error.fallback": "erro no login",
  "core.chat.autoConnect.failed":
    "Não consegui ligar o chat sozinho — vá na tela Chat e clique em Conectar.",
  "core.mesa.camera.blocked":
    "Não consegui abrir a câmera e o microfone — o Windows tá bloqueando. Libera aí na privacidade.",
  "core.mesa.camera.busy":
    "Não consegui abrir a câmera — outro app tá usando ela? Fecha ele e liga de novo.",
  "core.mesa.camera.failed":
    "Não consegui abrir a câmera — vê se outro programa não tá usando ela.",
  "core.mesa.error.badInviteAddress":
    "O endereço do convite é inválido — pede um convite novo pro host.",
  "core.mesa.error.hostGone": "A Mesa caiu ou o host saiu de vez.",
  "core.mesa.error.hostUnreachable":
    "Não consegui alcançar o host — vocês estão na mesma rede?",
  "core.mesa.error.joinRefused":
    "A Mesa recusou a entrada — confere o convite ou pede um novo pro host.",
  "core.mesa.error.peerTaken":
    "Alguém já tá no seu lugar na Mesa — espera um instante e tenta de novo.",
  "core.mesa.invite.invalid": "Convite inválido. Confere o código.",
  "core.mesa.invite.loopback":
    "Esse convite aponta pra um endereço local. Pede um convite novo pro host.",
  "core.mesa.needsInstalledApp":
    "A Mesa precisa do app instalado — ela roda um servidor no seu PC.",
  "core.mesa.noLanNetwork":
    "Sem rede local — não consigo gerar um convite que a galera alcance.",
  "core.mesa.obs.addFailed":
    "Não consegui pôr a Mesa no OBS — vê se ele tá aberto com o WebSocket ligado.",
  "core.mesa.obs.added": "Pus a Mesa na sua cena do OBS 🎥",
  "core.mesa.obs.connecting": "Conectando à Mesa… tenta de novo num instante.",
  "core.mesa.obs.layoutUpdateFailed":
    "Não consegui atualizar a grade no OBS — vê se ele tá aberto.",
  "core.mesa.obs.layoutUpdated": "Atualizei a grade no OBS",
  "core.mesa.obs.removeFailed":
    "Não consegui tirar a Mesa do OBS — vê se ele tá aberto.",
  "core.mesa.obs.removed": "Tirei a Mesa do OBS.",
  "core.mesa.peer.unknownName": "convidado",
  "core.mesa.server.startFailed":
    "Não consegui subir o servidor da Mesa — tem outra Corneta aberta? Fecha e tenta de novo.",
  "core.mock.alert.resub.message": "valeu demais!",
  "core.mock.alert.superchat.message": "manda salve!",
  "core.mock.alert.tier.member": "Membro",
  "core.mock.alertToken.ok": "demo: token válido",
  "core.mock.captureFrame.unavailable":
    "captura de frame só no app instalado (e ao vivo)",
  "core.mock.chat.msg.1": "salve salve!",
  "core.mock.chat.msg.10": "📣📣📣",
  "core.mock.chat.msg.11": "cornetou demais",
  "core.mock.chat.msg.12": "GG",
  "core.mock.chat.msg.13": "alguém mais travando?",
  "core.mock.chat.msg.14": "joga de novo!",
  "core.mock.chat.msg.2": "kkkkk",
  "core.mock.chat.msg.3": "qual a build?",
  "core.mock.chat.msg.4": "primeiro 🎉",
  "core.mock.chat.msg.5": "tá lagando aí?",
  "core.mock.chat.msg.6": "som tá baixo",
  "core.mock.chat.msg.7": "boa live!",
  "core.mock.chat.msg.8": "manda um salve pro RJ",
  "core.mock.chat.msg.9": "que jogo é esse?",
  "core.mock.chat.self": "você",
  "core.mock.marker.twitchDropped": "Twitch caiu",
  "core.mock.target.test.ok": "demo: alcançável",
  "core.mock.youtubeKey.ok": "demo: chave válida",
  "core.platform.custom.name": "Personalizado",
  "core.platform.custom.note":
    "Você informa o endereço RTMP ou RTMPS — serve pra qualquer destino compatível fora da lista.",
  "core.platform.facebook.note":
    "Só entra com conexão criptografada (RTMPS). O modo antigo sem proteção saiu de cena — aqui já vai do jeito certo.",
  "core.platform.instagram.note":
    "O Instagram não recebe transmissão de fora oficialmente — use um serviço que gere uma URL RTMP pro seu perfil e cole a URL e a chave aqui. Ainda é experimental e pode falhar.",
  "core.platform.kick.note":
    "A chave sai do painel de criador da Kick. A URL já vem preenchida com o servidor padrão — se o seu painel mostrar outra, é só trocar aqui.",
  "core.platform.tagline.custom": "Qualquer servidor RTMP ou RTMPS",
  "core.platform.tagline.facebook": "Live pra página ou perfil",
  "core.platform.tagline.instagram":
    "Vídeo em pé — sem entrada oficial, pode falhar",
  "core.platform.tagline.kick": "No estilo da Twitch",
  "core.platform.tagline.tiktok": "Vídeo em pé — precisa de conta liberada",
  "core.platform.tagline.twitch": "A live de sempre",
  "core.platform.tagline.x": "A chave sai do Media Studio",
  "core.platform.tagline.youtube": "Aguenta qualidade alta numa boa",
  "core.platform.tiktok.note":
    "Vídeo em pé (720×1280, formato de celular). Pra transmitir, a TikTok precisa liberar sua conta — e nem todo mundo consegue a chave sozinho.",
  "core.platform.twitch.note":
    "Sem ser parceiro, a Twitch aguenta uns 6000 kbps. O servidor dela mais perto daqui fica em São Paulo — quanto mais perto, menos engasgo.",
  "core.platform.x.note":
    "A URL e a chave saem do Media Studio do X (aba Producer) — o link aqui embaixo te leva lá.",
  "core.platform.youtube.note":
    "Peça pro seu OBS mandar um keyframe (quadro que reinicia a imagem) a cada 2 s — no máximo 4 s.",
  "core.profile.default.name": "Padrão",
  "core.target.issue.badUrl": "URL inválida — use rtmp:// ou rtmps://",
  "core.target.issue.noKey": "sem chave",
  "core.target.issue.noName": "nome vazio",
  "core.target.issue.noUrl": "URL não definida",

  // ---- encoding ----
  "encoding.band.cta.hybridOk": "Usar o Esperto — cabe na sua banda",
  "encoding.band.cta.hybridWarn": "Usar o Esperto — fica no limite, mas passa",
  "encoding.band.fix.passthrough":
    "Baixe a **Taxa de bits no OBS** ({link}) ou tire uma plataforma.",
  "encoding.band.fix.passthrough.link": "ver o guia →",
  "encoding.band.fix.tuning":
    "Baixe a qualidade no {link} ou tire uma plataforma.",
  "encoding.band.fix.tuning.link": "ajuste fino",
  "encoding.band.over.body":
    "Este modo pede **{bitrate}** de upload, mas a sua internet mediu **{mbps} Mbps**. Vai engasgar no meio da live.",
  "encoding.card.upload.label": "Upload",
  "encoding.close": "Fechar",
  "encoding.encoder.cpu": "Processador (x264)",
  "encoding.encoder.gpu": "Placa de vídeo ({label})",
  "encoding.encoders.error":
    "Não consegui ver o que esta máquina tem pra recodificar — tenta de novo.",
  "encoding.encoders.loading": "Vendo o que esta máquina tem…",
  "encoding.encoders.noHw":
    "Sem placa de vídeo por aqui — funciona no processador, só pesa mais.",
  "encoding.encoders.title": "O que recodifica nesta máquina",
  "encoding.encoders.unavailable.sr": "(indisponível nesta máquina)",
  "encoding.empty.cta": "Ligar uma plataforma",
  "encoding.empty.title": "Nenhuma plataforma ligada",
  "encoding.fit.bad": "acima da sua banda",
  "encoding.fit.ok": "cabe folgado na sua banda",
  "encoding.fit.warn": "no limite da sua banda",
  "encoding.guide.badge.redo": "eu refaço",
  "encoding.guide.copy.suffix": "— recebem **exatamente** o que sai do OBS",
  "encoding.guide.done": "Deixei o OBS certinho",
  "encoding.guide.encoder.error":
    "Não consegui ver os encoders desta máquina — tenta de novo em Qualidade.",
  "encoding.guide.encoder.checking": "Verificando a placa de vídeo…",
  "encoding.guide.encoder.cpuOnly": "Processador — é o que essa máquina tem",
  // Não repete o fim do encoding.obs.noCopy: aquele texto está no card da tela
  // Qualidade cujo link ABRE este guia — as duas frases ficam a um clique.
  "encoding.guide.guardian":
    "Guardião ligado — mande o melhor sinal que der do OBS.",
  "encoding.guide.noPlatforms":
    "(nenhuma plataforma ativa ainda — os números abaixo assumem 1080p)",
  "encoding.guide.nohw.fps30":
    "Sem placa de vídeo, seu PC pode penar em {res}30: se a live engasgar ou o jogo travar, baixe a saída pra 720p (aba Vídeo) e, fora jogo muito rápido, ninguém nota.",
  "encoding.guide.nohw.fps60":
    "Sem placa de vídeo, seu PC pode penar em {res}60: se a live engasgar ou o jogo travar, baixe o FPS pra 30 (aba Vídeo) — pesa quase metade e, fora jogo muito rápido, ninguém nota.",
  "encoding.guide.path.lede": "O OBS encoda seu vídeo **uma vez**. Daí:",
  "encoding.guide.path.title": "O que cada plataforma recebe hoje",
  "encoding.guide.row.bitrate": "Taxa de bits",
  "encoding.guide.row.bitrate.noteCopy": "acima disso, {platform} trava a live",
  "encoding.guide.row.bitrate.noteFree":
    "quanto melhor o sinal, melhor a saída",
  "encoding.guide.row.encoder": "Encoder",
  "encoding.guide.row.keyframe": "Intervalo de quadro-chave",
  "encoding.guide.row.rateControl": "Controle de taxa",
  "encoding.guide.row.video": "Vídeo (aba Vídeo)",
  "encoding.guide.row.video.note720":
    "suas plataformas saem em 720p — mandar mais que isso só pesa no PC, sem ganho",
  "encoding.guide.row.video.noteFullHd":
    "mesma resolução da saída — evita borrar a imagem",
  "encoding.guide.setup.title":
    "Configure assim: OBS → Configurações → **Saída**",
  "encoding.guide.simpleMode":
    "No modo **Simples** do OBS, só bitrate e encoder aparecem — já resolve. Esses ajustes são na mão mesmo.",
  "encoding.guide.title": "Qualidade certa no OBS",
  "encoding.guide.why.cbr":
    "**CBR + quadro-chave 2 s** é exigência das plataformas — fora disso a live buferiza pros espectadores.",
  "encoding.guide.why.changed.strong":
    "Mudou as plataformas ou ligou o Guardião?",
  "encoding.guide.why.changed.text":
    "Volta aqui — os números acima acompanham a sua config.",
  "encoding.guide.why.onepass.strong": "Uma passada só.",
  "encoding.guide.why.onepass.text":
    "Refazer o vídeo à toa perde qualidade de graça.",
  "encoding.header.kicker": "Como a corneta toca",
  "encoding.header.subtitle":
    "Quanta qualidade sai pra cada plataforma — e quanto sua máquina vai suar por isso.",
  "encoding.header.title": "Qualidade",
  "encoding.load.label": "Peso no PC (estimado)",
  "encoding.load.word.easy": "tranquilo",
  "encoding.load.word.heavy": "pega pesado",
  "encoding.load.word.max": "no limite",
  "encoding.load.word.warm": "esquenta",
  "encoding.mode.hybrid.desc":
    "Ajusta cada plataforma só onde precisa. Decide sozinho.",
  "encoding.mode.hybrid.tag": "Recomendado",
  "encoding.mode.hybrid.title": "Esperto",
  "encoding.mode.passthrough.desc":
    "A mesma imagem vai pra todas as plataformas, no mesmo padrão.",
  "encoding.mode.passthrough.tag": "Mais leve",
  "encoding.mode.passthrough.title": "Na lata",
  "encoding.mode.perPlatform.desc":
    "Melhor imagem possível pra cada plataforma, mas é o mais pesado.",
  "encoding.mode.perPlatform.tag": "Máx. qualidade",
  "encoding.mode.perPlatform.title": "Caprichado",
  "encoding.obs.guideLink": "Ver o guia completo do OBS →",
  "encoding.obs.lcd":
    "Plataformas **em cópia** precisam do OBS em **~{bitrate}** — é o máximo que **{platform}** aceita.",
  "encoding.obs.noCopy":
    "Nenhuma plataforma **em cópia** agora: quanto melhor o sinal do OBS, melhor a saída.",
  "encoding.obs.path": "No OBS: Configurações → Saída → Taxa de bits. ",
  "encoding.sessions.over.hybrid":
    "Este modo pede **{n} recodificações na placa de vídeo** ao mesmo tempo, mas ela deve aguentar umas **{max}**. Pode falhar no meio da live — volte algumas plataformas pra **Copiar** no ajuste fino.",
  "encoding.sessions.over.other":
    "Este modo pede **{n} recodificações na placa de vídeo** ao mesmo tempo, mas ela deve aguentar umas **{max}**. Pode falhar no meio da live — use o **Esperto** ou tire uma plataforma.",
  "encoding.target.bitrate.aria": "Bitrate de {platform} em kbps",
  "encoding.target.bitrate.close": "fechar",
  "encoding.target.bitrate.edit": "ajustar número",
  "encoding.target.bitrate.range": "entre {min} e {max}",
  "encoding.target.bitrate.useRecommended": "usar recomendado ({kbps})",
  "encoding.target.copy.badge": "em cópia",
  "encoding.target.copy.body":
    "A qualidade se define no OBS (bitrate, resolução, fps).",
  "encoding.target.copy.headline": "vai exatamente como sai do OBS",
  "encoding.target.copy.resolution": "resolução e fps: os do OBS",
  "encoding.target.copy.verticalWarn":
    "⚠ vai sair torta aqui — troque pra “Recodificar”",
  "encoding.target.encoder.aria": "Quem recodifica em {platform}",
  "encoding.target.encoder.auto": "Automático",
  "encoding.target.encoder.hint":
    "A placa de vídeo poupa o processador. O processador entrega a melhor imagem, mas pesa mais no PC.",
  "encoding.target.encoder.label": "Quem recodifica",
  "encoding.target.encoder.uses": "usa {encoder}",
  "encoding.target.override.auto.copy": "Auto (copia)",
  "encoding.target.override.auto.transcode": "Auto (recodifica)",
  "encoding.target.override.copy": "Copiar",
  "encoding.target.override.transcode": "Recodificar",
  "encoding.target.quality.custom": "personalizado",
  "encoding.target.quality.hint":
    "Imagem melhor pede mais upload. O Padrão é o recomendado da plataforma.",
  "encoding.target.quality.label": "Qualidade da imagem",
  "encoding.target.quality.summary": "{stop} · {bitrate} · {link}",
  "encoding.target.reframe": "Enquadrar 9:16",
  "encoding.target.stop.eco": "Econômico",
  "encoding.target.stop.sharp": "Bonitão",
  "encoding.target.stop.standard": "Padrão",
  "encoding.tuning.advanced": "(avançado)",
  "encoding.tuning.noPlatforms":
    "Nenhuma plataforma ativa. Ative uma em Plataformas pra ajustar a qualidade dela.",
  "encoding.tuning.passthrough.empty":
    "No **Na lata** não tem o que ajustar — a qualidade se define no OBS. ",
  "encoding.tuning.passthrough.guideLink": "Ver o guia do OBS →",
  "encoding.tuning.title": "Ajuste fino por plataforma",
  "encoding.upload.measure.error":
    "Não consegui medir o upload — sem internet?",
  "encoding.upload.measureAgain": "medir de novo",
  "encoding.upload.measureNow": "medir agora",
  "encoding.upload.measured": "Sua internet sobe **~{mbps} Mbps**. ",
  "encoding.upload.measuring": "medindo…",
  "encoding.upload.onair": "A medição fica pra depois da live.",
  "encoding.upload.unmeasured": "Ainda não medi sua internet. ",
  "encoding.vertical.cta.auto": "Voltar pro Auto — ajusta em pé",
  "encoding.vertical.cta.hybrid": "Usar o Esperto — ele arruma isso sozinho",
  "encoding.vertical.warn.copy":
    "Em cópia vai o vídeo deitado pra **{platforms}**, que só aceita vídeo em pé — a live vai sair torta ou nem entrar.",
  "encoding.vertical.warn.join": " e ",
  "encoding.vertical.warn.passthrough":
    "Na lata manda o vídeo deitado pra **{platforms}**, que só aceita vídeo em pé — a live vai sair torta ou nem entrar.",
  "encoding.wizard.cta.connect": "Conectar e configurar",
  "encoding.wizard.cta.connecting": "Conectando…",
  "encoding.wizard.cta.done": "Fechar o guia",
  "encoding.wizard.cta.retry": "Tentar de novo",
  "encoding.wizard.error.auth.tip1":
    "Pegue a senha certa no OBS: Ferramentas → Configurações do Servidor WebSocket → Mostrar Chave de Conexão.",
  "encoding.wizard.error.auth.tip2":
    "Cole ela no passo 2 aqui em cima e tente de novo.",
  "encoding.wizard.error.auth.tip3":
    "Se “Ativar Autenticação” estiver desmarcado no OBS, é porque não tem senha — deixe o campo vazio.",
  "encoding.wizard.error.auth.title": "A senha do WebSocket não bateu.",
  "encoding.wizard.error.details": "Ver detalhe técnico",
  "encoding.wizard.error.generic.tip1":
    "Vê se o OBS tá aberto e com o WebSocket ligado (Ferramentas → Configurações do Servidor WebSocket).",
  "encoding.wizard.error.generic.tip2":
    "Sem estresse: dá pra configurar na mão logo abaixo.",
  "encoding.wizard.error.generic.title":
    "Não consegui configurar o OBS sozinha.",
  "encoding.wizard.error.notfound.tip1": "O OBS tá aberto aí no seu PC?",
  "encoding.wizard.error.notfound.tip2":
    "O WebSocket tá ligado? Ferramentas → Configurações do Servidor WebSocket → Ativar Servidor WebSocket.",
  "encoding.wizard.error.notfound.tip3": "A porta continua a padrão, 4455?",
  "encoding.wizard.error.notfound.tip4":
    "Algum firewall pode estar barrando a conexão — libere o OBS pra mim.",
  "encoding.wizard.error.notfound.title": "Não achei o OBS pra conectar.",
  "encoding.wizard.manual.key": "Chave de transmissão",
  "encoding.wizard.manual.lede":
    "Na mão também é rápido. No OBS: **Configurações → Transmissão → Serviço “Personalizado”** e cole estes dois campos:",
  "encoding.wizard.manual.note.autostart":
    "Com isso colado, na hora do **BORA AO VIVO** eu tento dar o play no OBS pra você — se nada acontecer, dê **Iniciar transmissão** nele.",
  "encoding.wizard.manual.note.manual":
    "Colou os dois no OBS? Então ele já aponta pra Corneta — sem WebSocket nenhum no meio.",
  "encoding.wizard.manual.server": "Servidor",
  "encoding.wizard.manual.toggle": "Prefiro configurar na mão",
  "encoding.wizard.ok.autostart":
    "Conectado! O OBS já aponta pra Corneta. Quando você der **BORA AO VIVO**, eu mando o OBS transmitir sozinho.",
  "encoding.wizard.ok.manual":
    "Conectado! O OBS já aponta pra Corneta. Na hora da live, é só clicar **Iniciar transmissão** no OBS.",
  "encoding.wizard.step1.body":
    "No OBS: **Ferramentas → Configurações do Servidor WebSocket** e marque **Ativar Servidor WebSocket** (a porta já vem 4455, pode deixar).",
  "encoding.wizard.step1.title": "Ative o WebSocket no OBS",
  "encoding.wizard.step2.body":
    "Se **Ativar Autenticação** estiver marcado, clique em **Mostrar Chave de Conexão**, copie e cole aqui. Sem senha? Deixe vazio.",
  "encoding.wizard.step2.placeholder": "senha do WebSocket",
  "encoding.wizard.step2.title": "Senha (se tiver)",
  "encoding.wizard.step3.body.autostart":
    "Eu conecto e configuro o OBS pra apontar pra cá. Na hora do **BORA AO VIVO**, eu mesma dou o play no OBS.",
  "encoding.wizard.step3.body.manual":
    "Eu conecto e configuro o OBS pra apontar pra cá. Depois, na hora da live, é só dar **Iniciar transmissão** no OBS.",
  "encoding.wizard.step3.title": "Conecte",
  "encoding.wizard.subtitle": "A Corneta configura o OBS sozinha.",
  "encoding.wizard.title": "Conectar ao OBS",

  // ---- golive ----
  "golive.band.atEdge": "no limite — dar uma folga",
  "golive.band.test": "Medir agora",
  // Só aparece com a live SUBINDO: o card inteiro some quando ela entra no ar
  // (GoLiveScreen.tsx:431) — prometer medição "depois que subir" seria mentira.
  "golive.band.test.disabledTitle":
    "A live tá subindo — medir agora ia roubar banda dela",
  "golive.band.testing": "Testando…",
  "golive.band.title": "Banda de upload",
  "golive.band.tooTight": "não dá conta — ajustar qualidade",
  "golive.bar.dismiss.aria": "Dispensar o aviso",
  "golive.bar.down": "{n} plataforma(s) fora",
  "golive.bar.error.aria": "Abrir o painel ao vivo — a transmissão caiu",
  "golive.bar.error.hint": "clica aqui pra ver o que houve e tentar de novo",
  "golive.bar.error.title": "A transmissão caiu",
  "golive.bar.onAir": "no ar",
  "golive.bar.open.aria": "Abrir o painel ao vivo",
  "golive.bar.panel": "Painel",
  "golive.bar.protection.bitrate": "Auto-bitrate",
  "golive.bar.protection.brb": "JÁ VOLTO",
  "golive.bar.protection.guardian": "Guardião",
  "golive.bar.connectingTargets": "OBS conectado · conectando às plataformas…",
  "golive.bar.waitingObs": "Aguardando o OBS…",
  "golive.bar.watching": "assistindo",
  "golive.block.fixTarget":
    "Resolva {nome}: {problemas} — cole a chave ou desligue a plataforma.",
  "golive.block.noPlatform": "Ative ao menos uma plataforma em Plataformas.",
  "golive.brb.armHint":
    "Quer pausa com um clique? Arme o {jaVolto} nas Configurações pra próxima live.",
  "golive.brb.back": "Voltei!",
  "golive.brb.now": "JÁ VOLTO agora",
  "golive.brb.title.back": "Tira o aviso do ar e volta pro seu conteúdo",
  "golive.brb.title.on": "Põe a tela “JÁ VOLTO” no ar (com o mic mudo)",
  "golive.brb.toast.back": "Voltou! Conteúdo no ar de novo",
  "golive.brb.toast.on": "JÁ VOLTO no ar — pode ir tranquilo, o mic tá mudo",
  "golive.cancel": "Cancelar",
  "golive.checkup.checking": "verificando…",
  "golive.checkup.encoder": "Encoder disponível",
  "golive.checkup.keys": "Chaves e URLs",
  "golive.checkup.keys.none": "nenhuma plataforma ativa",
  "golive.checkup.obsConnected": "OBS conectado",
  "golive.checkup.obsConnected.fix":
    "ative em Ferramentas → Configurações do Servidor WebSocket (e a senha em Configurações, se houver)",
  "golive.checkup.obsPointing": "OBS apontando pra Corneta",
  "golive.checkup.obsPointing.fix": "aponta o OBS pra cá com o botão ao lado",
  "golive.checkup.state.bad": "com problema",
  "golive.checkup.state.ok": "feito",
  "golive.checkup.state.warn": "falta",
  "golive.checkup.tip":
    "No OBS, em {caminho}: no modo Simples já tá certo — relaxa. No modo Avançado, confira {taxa} e {keyframe} — é o que as plataformas pedem pra não travar.",
  "golive.checkup.tip.guide": "Ver o guia completo →",
  "golive.checkup.tip.keyframe": "Intervalo de quadro-chave: 2 s",
  "golive.checkup.tip.path": "Configurações → Saída",
  "golive.checkup.tip.rateControl": "Controle de taxa: CBR",
  "golive.checkup.title": "Check-up pré-live",
  "golive.checkup.upload": "Upload",
  "golive.checkup.upload.detail": "{atual} / {necessario} Mbps",
  "golive.checkup.upload.detail.tight":
    "{atual} / {necessario} Mbps · no limite",
  "golive.checkup.upload.untested": "rode o teste em Banda de upload",
  "golive.cta": "BORA AO VIVO",
  "golive.cta.aria": "Bora ao vivo",
  "golive.cta.aria.blocked": "Bora ao vivo (travado: {motivo})",
  "golive.empty.noPlatforms":
    "Nenhuma plataforma ativa. Vá em {plataformas}, ative pelo menos uma e cole a chave.",
  "golive.error.body": "A transmissão parou. Vê os logs ou tenta de novo.",
  "golive.error.errorId": "ID do erro",
  "golive.error.logs": "Ver logs",
  "golive.error.operationId": "ID da operação",
  "golive.error.retry": "Tentar de novo",
  "golive.error.title": "Não consegui deixar sua live no ar",
  "golive.header.kicker": "Bora cornetar",
  "golive.header.subtitle":
    "Liga o OBS uma vez, vê se a internet aguenta e entra no ar em todo lugar — de uma tacada.",
  "golive.header.title": "Ao vivo",
  "golive.machine.label": "Máquina",
  "golive.marker.button": "Marcar momento",
  "golive.marker.title": "Cravar um marcador no relatório",
  "golive.obs.badge": "OBS: {status}",
  "golive.obs.check": "Verificar OBS",
  "golive.obs.field.key": "Chave de transmissão",
  "golive.obs.field.server": "Servidor",
  "golive.obs.fixForMe": "Configura pra mim",
  "golive.obs.hint": "No OBS: {caminho} e cole os dois campos abaixo.",
  "golive.obs.hint.path":
    "Configurações → Transmissão → Serviço “Personalizado”",
  "golive.obs.key.note":
    "Essa chave é só entre o OBS e a Corneta — não é de nenhuma plataforma.",
  "golive.obs.qualityGuide": "Qual a melhor qualidade pro OBS? Guia rápido →",
  "golive.obs.section.title": "Liga no OBS",
  "golive.obs.startStreamingButton": "Iniciar transmissão",
  "golive.obs.status.checking": "verificando…",
  "golive.obs.status.missing": "não configurado",
  "golive.obs.status.notPointing": "falta apontar pra cá",
  "golive.obs.status.ok": "configurado",
  "golive.onlyWhenLive": "Disponível quando estiver no ar",
  "golive.preflight.body":
    "Dá pra entrar no ar mesmo assim — a live só começa quando o OBS mandar o vídeo.",
  "golive.preflight.goAnyway": "Ir assim mesmo",
  "golive.preflight.title": "O OBS ainda não tá apontando pra cá",
  "golive.problems.pasteKey": "Colar a chave →",
  "golive.problems.title": "Resolva antes de iniciar:",
  "golive.problems.turnOff": "Desligar esta plataforma",
  "golive.problems.turnedOff.toast":
    "Desliguei {nome} — religue em Plataformas.",
  "golive.rescue.authFailed":
    "Achei o OBS, mas a senha do WebSocket não bateu — confere em Configurações → OBS.",
  "golive.rescue.body": "Ele tá aberto? Deu {botao}?",
  "golive.rescue.notPointing":
    "Achei o OBS, mas ele não tá apontando pra Corneta.",
  "golive.rescue.notReachable":
    "Não achei o OBS por aqui — parece fechado ou sem o WebSocket ligado.",
  "golive.rescue.title": "O OBS ainda não conectou",
  "golive.security.adjust": "Ajustar",
  "golive.security.armed": "Armado",
  "golive.security.bitrate.desc":
    "se a internet apertar, baixo a qualidade antes de a live travar",
  "golive.security.bitrate.desc.off":
    "se a internet apertar, a live trava em vez de só baixar a qualidade",
  "golive.security.bitrate.label": "Auto-bitrate",
  "golive.security.brb.desc":
    "se o OBS cair, corto pro JÁ VOLTO e a live nem pisca",
  "golive.security.brb.desc.off":
    "se o OBS cair, a galera fica olhando uma tela congelada",
  "golive.security.brb.label": "JÁ VOLTO",
  "golive.security.guardian.desc.off":
    "se uma palavra que não pode vazar aparecer na tela, vai pro ar",
  "golive.security.guardian.label": "Guardião",
  "golive.security.guardian.noTerms":
    "ligado, mas sem nada pra vigiar — adiciona um termo",
  "golive.security.guardian.watching":
    "de olho em {n} termo(s) — se um aparecer, corto pro JÁ VOLTO",
  "golive.security.loudness.desc": "acerto o seu volume sozinha",
  "golive.security.loudness.label": "Normalizador de áudio",
  "golive.security.off": "Off",
  "golive.security.title": "Suas redes de segurança",
  "golive.signalLost.body":
    "Pros espectadores a tela congelou. Confira o OBS (fechou? parou de transmitir?) — quando o sinal voltar, eu retomo sozinha.",
  "golive.signalLost.title": "O sinal do OBS sumiu — sua live tá sem imagem",
  "golive.starting.autoObs":
    "Chamei o OBS pra transmitir — se esta tela não mudar, dê {botao} nele.",
  "golive.starting.manualObs":
    "No OBS, clique {botao} — a Corneta entra no ar sozinha.",
  "golive.starting.connectingTargets":
    "OBS conectado — abrindo as plataformas…",
  "golive.starting.waiting": "Aguardando o OBS conectar…",
  "golive.stat.bitrate": "Bitrate",
  "golive.stat.drops": "Quedas",
  "golive.stat.fps": "FPS",
  "golive.stat.uptime": "No ar",
  "golive.state.brb": "JÁ VOLTO no ar",
  "golive.state.censor": "JÁ VOLTO (Guardião)",
  "golive.state.connecting": "Conectando",
  "golive.state.error": "Erro",
  "golive.state.idle": "Aguardando",
  "golive.state.live": "No ar",
  "golive.state.paused": "Pausado",
  "golive.state.reconnecting": "Reconectando",
  "golive.state.signalLost": "Sem sinal do OBS",
  "golive.state.waiting": "Aguardando sinal",
  "golive.stop": "Cortar transmissão",
  "golive.stop.confirm": "Cortar mesmo? (clica de novo)",
  "golive.streamInfo.applied": "Atualizei o título em {n} plataforma(s)",
  "golive.streamInfo.apply": "Mandar pras plataformas",
  "golive.streamInfo.game.placeholder": "Jogo / categoria (opcional)",
  "golive.streamInfo.needTitle": "Digite um título",
  "golive.streamInfo.partial": "{ok}/{total} ok — veja os detalhes",
  "golive.streamInfo.signIn": "Entrar na conta →",
  "golive.streamInfo.teaser":
    "Entre na sua conta e defina o título (e o jogo) de todas as plataformas daqui — sem abrir Studio nem dashboard.",
  "golive.streamInfo.title": "Título da live",
  "golive.streamInfo.title.placeholder":
    "Título da transmissão (vale pra todas)",
  "golive.streamInfo.youtubeAuto.desc":
    " — a Corneta cria a transmissão no BORA AO VIVO, sem abrir o Studio.",
  "golive.streamInfo.youtubeAuto.title": "YouTube automático",
  "golive.streamInfo.youtubeNote":
    "No YouTube dá pra mudar só o {titulo} (não o jogo).",
  "golive.target.noName": "(sem nome)",
  "golive.target.openChannel.aria": "Abrir o canal de {nome}",
  "golive.target.openChannel.title": "Abrir o canal na plataforma",
  "golive.target.pause": "Pausar",
  "golive.target.pause.title": "Pausar esta plataforma",
  "golive.target.resume": "Retomar",
  "golive.target.resume.title": "Retomar esta plataforma",
  "golive.target.retry": "Tentar de novo",
  "golive.target.swapKey": "Trocar a chave →",
  "golive.timer.onAir": "no ar",
  "golive.timer.connectingTargets": "OBS conectado · abrindo as plataformas…",
  "golive.timer.waiting": "Sem vídeo do OBS ainda…",
  "golive.toast.canceled": "Cancelei — você não chegou a entrar no ar.",
  "golive.toast.live": "No ar! A corneta tá tocando 📣",
  "golive.toast.markerSaved": "Marquei o momento 📍 — aparece no relatório",
  "golive.toast.obsPlay": "Mandei o OBS transmitir — entrando no ar…",
  "golive.toast.obsPlayFailed":
    "Não consegui dar play no OBS — dê play manualmente.",
  "golive.toast.obsPlayFailed.action": "Configurar OBS",
  "golive.toast.serverUp": "Servidor no ar! Agora é só dar play no OBS",
  "golive.toast.startFailed": "Não consegui entrar no ar: {erro}",
  "golive.toast.stopped": "Cortou! Tá fora do ar 👋",
  "golive.toast.stopped.action": "Ver relatório",
  "golive.toast.uploadTestFailed":
    "Não consegui medir o upload — sem internet?",
  "golive.viewers.label": "assistindo",

  // ---- platforms ----
  "platforms.about.blog.sub": "Meu blog e meus projetos.",
  "platforms.about.footer.made":
    "Corneta é grátis e de código aberto. Feita com {heart} e código.",
  "platforms.about.hero.body":
    "Fiz a Corneta pra matar um perrengue meu: um stream do OBS vira live na Twitch, YouTube, Kick e cia. de uma vez só — grátis.",
  "platforms.about.hero.title": "Oi, sou o Petro",
  "platforms.about.kicker": "Quem soprou essa corneta",
  "platforms.about.legal.privacy": "Política de Privacidade",
  "platforms.about.legal.terms": "Termos de Uso",
  "platforms.about.replayTour": "Rever o tour de boas-vindas",
  "platforms.about.site.sub": "Site oficial, dúvidas e download.",
  "platforms.about.title": "Sobre",
  "platforms.about.version": "Corneta v{version} · multi-stream",
  "platforms.add": "Adicionar",
  "platforms.chatBridge.ask": "Quer o chat {platform} aqui na Corneta também?",
  "platforms.chatBridge.cta": "Configurar",
  "platforms.empty.body":
    "Sua corneta ainda não aponta pra lugar nenhum. Bora colocar a primeira plataforma?",
  "platforms.empty.cta": "Adicionar plataforma",
  "platforms.empty.title": "Cadê as plataformas?",
  "platforms.key.cancelEdit": "Cancelar a troca da chave",
  "platforms.key.change": "Trocar",
  "platforms.key.hide": "Ocultar a chave",
  "platforms.key.pasteSave": "Colar e salvar",
  "platforms.key.pasteSaveTitle":
    "Cola da área de transferência e já guarda no cofre",
  "platforms.key.pastedUrlOnly":
    "Isso é o endereço do servidor, não a chave — cole a stream key que fica ao lado dele no painel 🔑",
  "platforms.key.placeholder":
    "Cole a chave de transmissão (stream key) que a plataforma te deu",
  "platforms.key.remove": "Remover",
  "platforms.key.removeConfirm": "Remover mesmo?",
  "platforms.key.removeFailed": "Não consegui remover a chave: {err}",
  "platforms.key.removed": "Tirei a chave do cofre",
  "platforms.key.save": "Salvar",
  "platforms.key.saveFailed": "Não consegui guardar a chave: {err}",
  "platforms.key.saved": "Chave no cofre",
  "platforms.key.savedToast": "Chave guardada no cofre 🔒",
  "platforms.key.show": "Mostrar a chave",
  "platforms.key.strippedUrl":
    "Isso parecia a URL completa — guardei só a chave 👍",
  "platforms.mesa.art.invite": "Convite",
  "platforms.mesa.art.you": "Você",
  "platforms.mesa.cam.off": "Sem vídeo",
  "platforms.mesa.cam.on": "Câmera",
  "platforms.mesa.camOn": "Liguei sua câmera",
  "platforms.mesa.cameraLabel": "Câmera",
  "platforms.mesa.conn.connecting": "ligando…",
  "platforms.mesa.conn.dropped": "caiu",
  "platforms.mesa.conn.left": "saiu",
  "platforms.mesa.conn.live": "no ar",
  "platforms.mesa.demoNotice":
    "Modo demonstração — a Mesa de verdade só roda no app instalado. Aqui dá pra testar a câmera e ver a interface.",
  "platforms.mesa.deviceDefault": "Padrão",
  "platforms.mesa.full.body":
    "No P2P direto cada câmera sai pra todo mundo — a conta de conexões explode e seu upload vai no talo passando de ~5. Modo servidor (SFU) pra mesas grandes tá vindo.",
  "platforms.mesa.full.title": "Mesa cheia pesa no upload",
  "platforms.mesa.full.uploadLabel": "seu upload",
  "platforms.mesa.full.uploadValue": "no talo",
  "platforms.mesa.grid.count": "Na Mesa ({n})",
  "platforms.mesa.grid.self": "{name} (você)",
  "platforms.mesa.guest": "convidado",
  "platforms.mesa.guestDefaultName": "Convidado",
  "platforms.mesa.hideSelfAria": "Esconder minha câmera na grade",
  "platforms.mesa.hideSelfLabel": "esconder minha câmera na grade",
  "platforms.mesa.host.body":
    "Você vira o host. A Corneta gera um convite — manda pra galera, eles entram, e as câmeras chegam direto na sua máquina.",
  "platforms.mesa.host.cta": "Abrir a Mesa",
  "platforms.mesa.host.title": "Criar uma Mesa",
  "platforms.mesa.hostDefaultName": "Host",
  "platforms.mesa.invite.body":
    "Manda esse código pra galera entrar. Na mesma rede conecta na hora; pela internet, só se der pra chegar no seu PC de fora.",
  "platforms.mesa.invite.label": "Convite",
  "platforms.mesa.invite.title": "Convite da Mesa",
  "platforms.mesa.join.body":
    "Recebeu um convite? Cola aqui pra entrar na Mesa de outro streamer.",
  "platforms.mesa.join.cta": "Entrar",
  "platforms.mesa.join.note":
    "Por enquanto funciona na mesma rede (ou com o host acessível pela internet) — relay tá vindo.",
  "platforms.mesa.join.title": "Entrar numa Mesa",
  "platforms.mesa.kicker": "Mesa · co-stream",
  "platforms.mesa.leave": "Sair da Mesa",
  "platforms.mesa.mic.off": "Mudo",
  "platforms.mesa.mic.on": "Mic",
  "platforms.mesa.micLabel": "Microfone",
  "platforms.mesa.muted": "mudo",
  "platforms.mesa.nameLabel": "Seu nome na Mesa",
  "platforms.mesa.namePlaceholder": "ex.: Pitrol",
  "platforms.mesa.obs.add": "Adicionar no OBS",
  "platforms.mesa.obs.body":
    "Entra como Browser Source na sua cena atual, cada um num slot fixo. É só posicionar.",
  "platforms.mesa.obs.remove": "Tirar do OBS",
  "platforms.mesa.obs.title": "Levar a Mesa pro OBS",
  "platforms.mesa.obs.waitTitle":
    "Conectando à Mesa… libero assim que conectar",
  "platforms.mesa.openCam": "Ligar minha câmera",
  "platforms.mesa.privacy.camera": "Abrir privacidade (câmera)",
  "platforms.mesa.privacy.mic": "Abrir privacidade (microfone)",
  "platforms.mesa.retry": "Tentar de novo",
  "platforms.mesa.status.connecting": "conectando…",
  "platforms.mesa.status.error": "deu ruim",
  "platforms.mesa.status.idle": "fora",
  "platforms.mesa.status.offline": "reconectando…",
  "platforms.mesa.status.online": "na mesa",
  "platforms.mesa.subtitle":
    "Webcam de cada um direto P2P, em alta — sem call do Discord, sem mosaico borrado. E quem cai vira 'JÁ VOLTO' no lugar, sem quebrar a sua cena.",
  "platforms.mesa.title": "Chama a galera pra Mesa",
  "platforms.mesa.waiting": "Esperando a galera entrar com o convite…",
  "platforms.mesa.you": "Você",
  "platforms.picker.already": "já tem",
  "platforms.picker.alreadyCount": "já tem ×{n}",
  "platforms.picker.title": "Quem entra na corneta?",
  "platforms.profile.active": "Perfil ativo",
  "platforms.profile.count": "{n} plataforma(s)",
  "platforms.profile.delete": "Excluir",
  "platforms.profile.deleteConfirm": "Excluir mesmo?",
  "platforms.profile.deleteTitle": 'Excluir o perfil "{name}"',
  "platforms.profile.defaultNew": "Perfil {n}",
  "platforms.profile.hint":
    "Um perfil é um conjunto salvo de plataformas. Crie um pra cada situação (ex.: 'Solo Twitch+YT', 'Evento com TikTok') e troque num clique.",
  "platforms.profile.label": "Perfil de transmissão",
  "platforms.profile.nameAria": "Nome do perfil",
  "platforms.profile.new": "Novo perfil",
  "platforms.profile.rename": "Renomear",
  "platforms.profile.renameTitle": "Renomear o perfil ativo",
  "platforms.profile.switchTo": 'Trocar pra "{name}"',
  "platforms.profile.untitled": "Sem nome",
  "platforms.readiness.allReady": "Tudo pronto pra live",
  "platforms.readiness.noKey": "{n} sem chave",
  "platforms.readiness.noUrl": "{n} sem URL",
  "platforms.readiness.off": "{n} desligado(s)",
  "platforms.readiness.ready": "{n} pronto(s)",
  "platforms.subtitle":
    "Escolha as plataformas, cole a chave de cada uma e eu toco seu vídeo do OBS em todas de uma vez.",
  "platforms.target.badge.noName": "Sem nome",
  "platforms.target.badge.noUrl": "Sem URL",
  "platforms.target.badge.pasteKey": "Cole a chave",
  "platforms.target.badge.ready": "Pronto",
  "platforms.target.badge.urlInvalid": "URL inválida",
  "platforms.target.collapseAria": "Recolher plataforma",
  "platforms.target.enableAria": "Ligar {name}",
  "platforms.target.expandAria": "Expandir plataforma",
  "platforms.target.getKey": "Pegar minha chave",
  "platforms.target.nameAria": "Nome da plataforma",
  // ---- Editor de enquadramento (modal) ----
  "platforms.reframe.capture": "Capturar frame do OBS",
  "platforms.reframe.cancel": "Cancelar",
  "platforms.reframe.center": "Centralizar",
  "platforms.reframe.close": "Fechar",
  "platforms.reframe.crop.aria":
    "Recorte vertical — arraste ou use as setas (Shift = 10%)",
  "platforms.reframe.hint.live":
    "Capture um frame do OBS pra enquadrar exatamente.",
  "platforms.reframe.hint.offline":
    "💡 A captura de frame fica disponível com o OBS ao vivo. Sem frame, use a grade pra posicionar.",
  "platforms.reframe.lede":
    "Arraste o quadro pra escolher que parte do seu vídeo vai pro **{size}** (vertical).",
  "platforms.reframe.preview": "prévia",
  "platforms.reframe.result": "Vai sair assim",
  "platforms.reframe.save": "Salvar",
  "platforms.reframe.saved.toast": "Salvei seu enquadramento",
  "platforms.reframe.title": "Enquadrar vertical",
  "platforms.reframe.titleWithTarget": "Enquadrar vertical · {target}",
  "platforms.reframe.zoom": "Zoom",
  "platforms.target.reframe": "Enquadrar vertical",
  "platforms.target.reframeTitle":
    "Recorta o 9:16 do seu vídeo pra esta saída vertical",
  "platforms.target.remove": "Remover",
  "platforms.target.reorderAria": "Reordenar plataforma (setas ↑/↓)",
  "platforms.target.reorderTitle": "Arraste ou use ↑/↓",
  "platforms.target.test.cta": "Testar o servidor",
  "platforms.target.test.ok": "📡 {msg}",
  "platforms.target.test.running": "Testando…",
  "platforms.target.test.title":
    "Vê se o servidor da plataforma tá respondendo — não confere a chave",
  "platforms.target.url.help":
    "— o endereço pra onde seu vídeo vai; cole a URL que o painel da plataforma te deu",
  "platforms.target.url.helpKick":
    "— o endereço pra onde seu vídeo vai; essa já vem pronta, só troque se o painel da Kick mostrar outra",
  "platforms.target.url.invalid": "URL inválida — use rtmp:// ou rtmps://",
  "platforms.target.url.label": "URL do servidor",
  "platforms.target.url.placeholder":
    "rtmp://servidor/app  (rtmp:// ou rtmps://)",
  "platforms.target.badge.off": "desligada",
  "platforms.target.urlUnset": "URL não definida",
  "platforms.title": "Plataformas",
  "platforms.title.kicker": "Pra onde a corneta toca",
  "platforms.toast.added": "{platform} entrou na corneta 📣",
  "platforms.toast.removed": "{name} saiu da corneta",
  "platforms.toast.undo": "Desfazer",

  // ---- gravação + replay ----
  "recorder.toast.diskFull":
    "Sem espaço pra gravar — a live segue normal, só sem gravação.",
  "recorder.toast.noDir":
    "Não achei a pasta de gravação. A live segue normal, só sem gravar.",
  "recorder.toast.resumed":
    "A gravação caiu e voltou — vai faltar um pedacinho.",
  "recorder.toast.gaveUp":
    "Não consegui gravar depois de 5 tentativas — a live segue no ar. Dá pra tentar de novo.",
  "recorder.toast.retry": "Tentar de novo",
  "recorder.toast.retrying": "Bora — tentando gravar de novo.",
  "recorder.toast.waitingSource":
    "Esperando o vídeo chegar pra começar a gravar. Se o OBS ainda não subiu, é isso.",
  "recorder.toast.failed": "Não consegui gravar: {error}",
  "recorder.toast.estimatedAnchor":
    "A sincronia do replay pode estar uns segundos fora — dá pra ajustar no relatório.",

  "replay.back10": "10s pra trás",
  "replay.chat.empty": "Ninguém tinha falado ainda.",
  "replay.chat.gap": "O chat caiu por aqui — pode faltar mensagem.",
  "replay.chat.hideDeleted": "esconder apagadas",
  "replay.chat.showDeleted": "mostrar apagadas",
  "replay.chat.scrollAria": "Mensagens do chat sincronizadas com o replay",
  "replay.chat.title": "Chat",
  "replay.clip.action": "Criar clipe",
  "replay.clip.cancel": "cancelar corte",
  "replay.clip.crossSegment":
    "Esse trecho atravessa duas gravações. Escolha um pedaço dentro da mesma.",
  "replay.clip.cta": "Cortar um trecho (marque o início, depois o fim)",
  "replay.clip.pending": "marque o fim",
  "replay.clip.saved": "Trecho salvo 📣",
  "replay.delete.confirm": "Apagar mesmo?",
  "replay.delete.cta": "Apagar a gravação desta live",
  "replay.delete.done": "Apaguei a gravação — o relatório continua aqui.",
  "replay.folder": "Abrir a pasta da gravação",
  "replay.fwd10": "10s pra frente",
  "replay.fullscreen": "Tela cheia",
  "replay.marker.added": "Momento marcado",
  "replay.marker.action": "Marcar momento",
  "replay.marker.cta": "Marcar este momento",
  "replay.marker.default": "Momento marcado no replay",
  "replay.loading": "Preparando a gravação…",
  "replay.missing": "O arquivo desta gravação não está mais no disco.",
  "replay.mute": "Silenciar",
  "replay.offset.label": "Ajuste de sincronia",
  "replay.offset.open": "vídeo fora de sincronia?",
  "replay.offset.reset": "zerar",
  "replay.rate.aria": "Velocidade",
  "replay.scrub.aria": "Linha do tempo do replay",
  "replay.pause": "Pausar replay",
  "replay.play": "Reproduzir replay",
  "replay.seek.cta": "Ver este momento no vídeo",
  "replay.seek.notRecorded": "Não gravei esse instante.",
  "replay.shortcuts":
    "Espaço toca/pausa · ← → pulam 10s (com Shift, 1min) · , e . andam quadro a quadro",
  "replay.stage.aria":
    "Player do replay; pressione Espaço para tocar ou pausar",
  "replay.title": "Replay da live",
  "replay.unmute": "Tirar do mudo",
  "replay.volume": "Volume",
  "replay.warn.codec":
    "Essa gravação está num formato que o player não toca. Abra na pasta.",
  "replay.warn.estimated":
    "Estimei a sincronia — se o vídeo estiver fora do gráfico, use o ajuste.",
  "replay.warn.segments":
    "Esta live tem {n} pedaços de gravação (a gravação caiu e voltou).",
  "replay.warn.truncated": "A gravação foi interrompida antes do fim da live.",

  // ---- reports ----
  "reports.alerts.bitsTotal": "bits no total",
  "reports.alerts.kind.follow.one": "follow",
  "reports.alerts.kind.follow.other": "follows",
  "reports.alerts.kind.member.one": "membro",
  "reports.alerts.kind.member.other": "membros",
  "reports.alerts.kind.raid.one": "raid",
  "reports.alerts.kind.raid.other": "raids",
  "reports.alerts.kind.resub.one": "resub",
  "reports.alerts.kind.resub.other": "resubs",
  "reports.alerts.kind.sub.one": "inscrição",
  "reports.alerts.kind.sub.other": "inscrições",
  "reports.alerts.kind.subgift.one": "gift",
  "reports.alerts.kind.subgift.other": "gifts",
  "reports.alerts.kind.superchat.one": "super chat",
  "reports.alerts.kind.superchat.other": "super chats",
  "reports.alerts.title": "Alertas da live",
  "reports.alerts.topRaid": "🚀 Maior raid: {user} (+{n})",
  "reports.bitrate.title": "Bitrate por plataforma (Mbps)",
  "reports.channel.avg": "méd",
  "reports.channel.peak": "pico",
  "reports.channel.share": "{pct}% da audiência",
  "reports.channels.followersNote":
    "💜 Seguidores vêm do contador da própria plataforma, então é o número líquido: quem deixou de seguir durante a live subtrai. Pode não bater com a contagem de alertas do Streamlabs/StreamElements.",
  "reports.channels.oldChatNote":
    "💬 Esta live é anterior à contagem de chat por canal — só o total dela aparece. Nas próximas, o chat também vem repartido.",
  "reports.channels.title": "Audiência por canal",
  "reports.channels.unattributed":
    "{n} alerta(s) sem canal identificado (vindos de Streamlabs/StreamElements, que não dizem de qual canal vieram).",
  "reports.chart.allChannels": "Somando os canais:",
  "reports.chat.series": "msgs/min",
  "reports.chat.summary": "Total {total} · pico {peak}/min · média {avg}/min",
  "reports.chat.title": "Atividade do chat (msgs/min)",
  "reports.copyTime": "Copiar tempo",
  "reports.copyTime.done": "Copiei o tempo.",
  // ---- Cabeçalhos do CSV ----
  // São NOMES DE COLUNA, não frase: minúsculas, sem acento e com underscore, pra
  // aguentar fórmula de planilha e import de script sem aspas em volta.
  "reports.csv.history.avgAudience": "media_audiencia",
  "reports.csv.history.bits": "bits",
  "reports.csv.history.chatMessages": "mensagens_chat",
  "reports.csv.history.date": "data",
  "reports.csv.history.durationMin": "duracao_min",
  "reports.csv.history.followersGained": "seguidores_ganhos",
  "reports.csv.history.mode": "modo",
  "reports.csv.history.peakAudience": "pico_audiencia",
  "reports.csv.history.platforms": "plataformas",
  "reports.csv.history.problemWindows": "trechos_com_problema",
  "reports.csv.history.raidViewers": "viewers_de_raid",
  "reports.csv.history.raids": "raids",
  "reports.csv.history.start": "inicio",
  "reports.csv.history.subs": "inscricoes",
  "reports.csv.history.verdict": "veredito",
  "reports.csv.series.bitrateKbpsFor": "bitrate_kbps_{target}",
  "reports.csv.series.chatPerMin": "chat_por_min",
  "reports.csv.series.chatPerMinFor": "chat_por_min_{source}",
  "reports.csv.series.clock": "horario",
  "reports.csv.series.cpuPct": "cpu_pct",
  "reports.csv.series.droppedFor": "quedas_{target}",
  "reports.csv.series.gpuPct": "gpu_pct",
  "reports.csv.series.memoryPct": "memoria_pct",
  "reports.csv.series.obsCongestionPct": "obs_congestao_pct",
  "reports.csv.series.obsRenderMs": "obs_render_ms",
  "reports.csv.series.relTimeS": "tempo_rel_s",
  "reports.csv.series.stateFor": "estado_{target}",
  "reports.csv.series.watchingLastKnownFor":
    "assistindo_ultimo_conhecido_{source}",
  "reports.delta.pct": "{pct}% vs última live",
  "reports.delta.same": "igual à última live",
  "reports.detail.back": "Voltar",
  "reports.detail.delete": "Excluir",
  "reports.detail.delete.confirm": "Excluir mesmo?",
  "reports.detail.delete.error":
    "Não consegui excluir o relatório — o arquivo continua na pasta. Tenta de novo ou abre a pasta e apaga na mão.",
  "reports.detail.deleted": "Excluí o relatório.",
  "reports.detail.download": "Baixar",
  "reports.detail.error.title": "Não consegui abrir esta live",
  "reports.detail.error.read":
    "Não consegui ler este relatório — o arquivo pode estar corrompido.",
  "reports.detail.heading": "Live de {date}",
  "reports.detail.loading": "Carregando relatório",
  "reports.detail.mode": "modo {mode}",
  "reports.detail.recap": "Montar recap",
  "reports.download.anon.desc":
    "Troca quem apareceu por “alguém”. Use ao mandar pra patrocinador ou agência — os números continuam todos lá.",
  "reports.download.anon.title": "Sem nomes de espectadores",
  "reports.download.csv.desc":
    "A live inteira, uma linha a cada ~2s, pronta pro Excel.",
  "reports.download.csv.label": "Planilha (CSV)",
  "reports.download.error": "Não consegui salvar o relatório: {err}",
  "reports.download.html.desc":
    "Abre em qualquer navegador, offline. Pra virar PDF: abra e use Imprimir → Salvar como PDF.",
  "reports.download.html.label": "Página (HTML)",
  "reports.download.json.desc":
    "O relatório já analisado, pra plugar em ferramenta própria.",
  "reports.download.json.label": "Dados (JSON)",
  "reports.download.modal.name": "Baixar relatório",
  "reports.download.saved": "Salvei o relatório.",
  // Nomes de arquivo: sem acento, sem espaço e sem barra — vão pro disco, e a data
  // ISO entra depois no código (ordena sozinha no explorador, não muda com o idioma).
  "reports.file.history": "corneta-historico",
  "reports.file.live": "corneta-live",
  "reports.file.seriesSuffix": "-serie",
  "reports.dur.hours": "{h}h{m}",
  "reports.dur.minutes": "{m}min",
  "reports.events.title": "Eventos",
  "reports.error.retry": "Tentar novamente",
  "reports.highlights.chartHint":
    "As marcas no gráfico correspondem aos momentos abaixo.",
  "reports.highlights.note":
    "Os tempos contam do início da live — ache o minuto na gravação (VOD) pra cortar o clipe.",
  "reports.highlights.more.one": "Ver mais 1 momento",
  "reports.highlights.more.other": "Ver mais {count} momentos",
  "reports.highlights.title": "Momentos de destaque (pra clipar)",
  "reports.history.busy": "Montando…",
  "reports.history.button": "Exportar histórico (CSV)",
  "reports.history.error.none":
    "Não consegui ler nenhuma live — use o Abrir pasta pra conferir os arquivos.",
  "reports.history.error.save": "Não consegui exportar o histórico: {err}",
  "reports.history.ok.all": "{n} live(s) na planilha",
  "reports.history.ok.some":
    "{n} live(s) exportadas — {bad} ilegível(is) ficaram de fora",
  "reports.html.docTitle": "{title} — Corneta",
  "reports.html.followersNote":
    "Seguidores vêm do contador da plataforma: é o número líquido (quem deixou de seguir subtrai).",
  "reports.html.footer":
    "Gerado pela Corneta em {date} · multistream que roda no seu PC",
  "reports.html.highlights.note":
    "Os tempos contam do início da live — use pra achar o trecho na gravação.",
  "reports.html.highlights.title": "Momentos de destaque",
  "reports.html.table.channel": "Canal",
  "reports.html.table.chat": "Chat",
  "reports.html.table.followers": "Seguidores",
  "reports.html.table.share": "Fatia",
  "reports.html.tag": "Corneta · relatório da live",
  "reports.html.viewers.title": "Audiência ao vivo",
  "reports.list.empty.body":
    "Quando a live encerra, monto o relatório dela aqui.",
  "reports.list.empty.title": "Nenhuma live ainda",
  "reports.list.error.body":
    "A pasta de relatórios não respondeu. Seus arquivos continuam no PC.",
  "reports.list.error.title": "Não consegui carregar suas lives",
  "reports.list.archive": "Lives anteriores",
  "reports.list.archiveCount.one": "Mais 1 live no arquivo",
  "reports.list.archiveCount.other": "Mais {count} lives no arquivo",
  "reports.list.kicker": "Depois da live",
  "reports.list.latest": "Última live",
  "reports.list.noData":
    "Sem números nessa live — abre pra ver o que ficou registrado.",
  "reports.list.openStory": "Abrir a história da live",
  "reports.list.openFolder": "Abrir pasta",
  "reports.list.result": "Resumo",
  "reports.list.subtitle":
    "Reveja cada live: onde a galera chegou, onde ela saiu e em que minuto a transmissão engasgou.",
  "reports.list.title": "Suas lives",
  "reports.machine.dangerLine": "zona de perigo",
  "reports.machine.memory": "Memória",
  "reports.machine.title": "Carga da máquina (%)",
  "reports.marker.error": "● erro",
  "reports.marker.noSignal": "● sem sinal do OBS",
  "reports.marker.reconnect": "● reconexão",
  "reports.mode.hybrid": "Esperto",
  "reports.mode.passthrough": "Na lata",
  "reports.mode.perPlatform": "Caprichado",
  "reports.obs.series": "Render lag",
  "reports.obs.title": "OBS — atraso pra montar o quadro (ms)",
  "reports.perTarget.avgBitrate": "~{mbps} Mbps méd.",
  "reports.perTarget.dropped": "{n} quadros perdidos",
  "reports.perTarget.reconnects": "{n} reconex.",
  "reports.perTarget.title": "Envio por plataforma",
  "reports.recap.copied":
    "Copiei a imagem — cola no WhatsApp/Discord/Twitter 📋",
  "reports.recap.copy": "Copiar imagem",
  "reports.recap.download": "Baixar PNG",
  "reports.recap.duration": "{duration} ao vivo",
  "reports.recap.error.canvas": "Não consegui desenhar o recap nesta máquina.",
  "reports.recap.error.copy": "Não consegui copiar; use o Baixar PNG",
  "reports.recap.error.download": "Não consegui baixar o recap: {err}",
  "reports.recap.error.draw": "Não consegui desenhar o recap: {err}",
  "reports.recap.footer": "transmitido com Corneta — multistream num app só",
  "reports.recap.modal.close": "Fechar recap",
  "reports.recap.modal.description":
    "Uma prévia vertical da live, pronta para copiar ou baixar.",
  "reports.recap.modal.format": "PNG · {width} × {height}",
  "reports.recap.modal.heading": "Recap pra postar",
  "reports.recap.modal.hint": "Revise a imagem inteira antes de compartilhar.",
  "reports.recap.modal.name": "Recap da live",
  "reports.recap.modal.ready": "Tudo cabe na prévia",
  "reports.recap.previewAria": "Prévia do recap da live",
  "reports.recap.stat.avg": "média",
  "reports.recap.stat.bits": "bits",
  "reports.recap.stat.messages": "mensagens",
  "reports.recap.stat.newFollowers": "novos seguidores",
  "reports.recap.stat.onAir": "tempo no ar",
  "reports.recap.stat.peakViewers": "pico de audiência",
  "reports.recap.stat.raids": "raids",
  "reports.recap.stat.subs": "inscrições",
  // O pôster desenha este título em caixa alta (recap.ts); aqui ele fica como se
  // fala, porque CAPS na string é ênfase à mão (§6).
  "reports.recap.title": "Live de {date}",
  "reports.row.chat.title": "Mensagens no chat",
  "reports.row.clean": "limpa",
  "reports.row.clean.title": "Transmissão limpa",
  "reports.row.hasVideo": "gravada",
  "reports.row.hasVideo.title":
    "Esta live tem gravação — dá pra assistir junto com os gráficos",
  "reports.row.onAir": "{dur} no ar",
  "reports.row.peakViewers.title": "Pico de audiência",
  // Variantes .one/.other: quem monta é o tp(). Zero tem frase própria
  // (reports.row.clean), então aqui a contagem sempre começa em 1.
  "reports.row.problems.one": "1 perrengue",
  "reports.row.problems.other": "{count} perrengues",
  "reports.row.problems.title": "Trechos com problema — abra pra ver",
  "reports.split.byChannel": "Por canal",
  "reports.split.total": "Total",
  "reports.stat.avg": "Média",
  "reports.stat.bits": "Bits",
  "reports.stat.followersNet": "Seguidores (líquido)",
  "reports.stat.maxCpu": "CPU máx.",
  "reports.stat.messages": "Mensagens",
  "reports.stat.newFollowers": "Novos seguidores",
  "reports.stat.peakViewers": "Pico de viewers",
  "reports.stat.raids": "Raids",
  "reports.stat.subs": "Inscrições",
  "reports.story.community.desc":
    "Chat, alertas e canais mostram onde a conversa ganhou força.",
  "reports.story.community.title": "A galera entrou na história",
  "reports.story.noEngagement":
    "Não registrei viewers, seguidores nem chat nesta live.",
  "reports.story.portrait.detail.chat":
    "Foram {duration} no ar, com a conversa marcando o ritmo da transmissão.",
  "reports.story.portrait.detail.duration":
    "A transmissão passou por {channels}.",
  "reports.story.portrait.detail.viewers":
    "Foram {duration} no ar, com média de audiência de {avg}.",
  "reports.story.portrait.detail.viewersChat":
    "Foram {duration} no ar, com média de audiência de {avg} e {messages} mensagens no chat.",
  "reports.story.portrait.title.chat.one": "1 mensagem deu o ritmo da live",
  "reports.story.portrait.title.chat.other":
    "{messages} mensagens deram o ritmo da live",
  "reports.story.portrait.title.duration": "{duration} ao vivo",
  "reports.story.portrait.title.viewers.one":
    "1 pessoa no melhor momento da live",
  "reports.story.portrait.title.viewers.other":
    "{peak} pessoas no melhor momento da live",
  "reports.story.replay.desc":
    "Clica num momento ou num ponto do gráfico e o vídeo pula pra lá.",
  "reports.story.replay.deletedBody":
    "O relatório continua aqui — só o vídeo foi embora.",
  "reports.story.replay.deletedTitle": "Você apagou a gravação desta live",
  "reports.story.replay.emptyBody":
    "Comecei a gravar, mas o arquivo ficou vazio. O resto do relatório tá logo abaixo.",
  "reports.story.replay.emptyDesc":
    "A gravação ficou vazia — o relatório segue sem o vídeo.",
  "reports.story.replay.emptyTitle": "A gravação não chegou a começar",
  "reports.story.replay.missingBody":
    "A gravação vem desligada. Liga em Configurações → Geral → Gravar a live e a próxima live já aparece aqui pra rever. Enquanto isso, a audiência, os destaques e o chat continuam logo abaixo.",
  "reports.story.replay.missingDesc":
    "Não há vídeo desta vez, então a história continua pelos sinais que a live deixou.",
  "reports.story.replay.missingTitle": "Esta live não foi gravada",
  "reports.story.replay.title": "A live, de novo",
  "reports.story.replay.turnOn": "Ligar a gravação",
  "reports.story.technical.clean": "Tudo em ordem",
  "reports.story.technical.desc":
    "Saúde do sinal, carga da máquina, possíveis causas e o registro de eventos ficam guardados aqui.",
  "reports.story.technical.review": "Tem nota técnica",
  "reports.story.technical.title": "Bastidores técnicos",
  "reports.story.timeline.desc":
    "A curva de audiência e os momentos marcantes mostram onde a transmissão mudou de ritmo.",
  "reports.story.timeline.title": "Como a live se desenrolou",
  "reports.story.verdict": "Em uma frase",
  "reports.technical.incidents.desc":
    "A Corneta cruza o que atrasou com o que estava pesado naquele instante. Abra só o que quiser investigar.",
  "reports.technical.incidents.confidence.high": "Causa provável",
  "reports.technical.incidents.confidence.low": "Pista, ainda sem confirmação",
  "reports.technical.incidents.confidence.medium": "Possível causa",
  "reports.technical.incidents.distribution":
    "Distribuição de {count} ocorrências ao longo da live",
  "reports.technical.incidents.groups":
    "Resumo por causa · total de pontos: {count}",
  "reports.technical.incidents.impact": "Impacto",
  "reports.technical.incidents.impact.allTargets": "todas as plataformas",
  "reports.technical.incidents.impact.from": "a partir de {time}",
  "reports.technical.incidents.confirm": "Como confirmar",
  "reports.technical.incidents.individual": "Ocorrências individuais",
  "reports.technical.incidents.longest": "Trechos mais longos",
  "reports.technical.incidents.next": "Pra próxima live",
  "reports.technical.pagination": "Páginas dos detalhes técnicos",
  "reports.technical.pagePrevious": "Anterior",
  "reports.technical.pageNext": "Próxima",
  "reports.technical.pageCount": "{page} de {pages}",
  "reports.technical.incidents.occurrences.one": "1 trecho",
  "reports.technical.incidents.occurrences.other": "{count} trechos",
  "reports.technical.incidents.signalsMore": "mais {count} evidências",
  "reports.technical.incidents.title": "Pontos técnicos, agrupados",
  "reports.technical.incidents.total": "{duration} somados",
  "reports.technical.incidents.why": "Por que eu acho isso",
  "reports.technical.showAll": "Ver todos ({count})",
  "reports.technical.showLess": "Mostrar menos",
  "reports.technical.tabs.events": "Registro",
  "reports.technical.tabs.label": "Escolha o detalhe técnico",
  "reports.technical.tabs.machine": "Máquina",
  "reports.technical.tabs.obs": "OBS",
  "reports.technical.tabs.platforms": "Plataformas",
  "reports.technical.tabs.signal": "Transmissão",
  "reports.viewers.peak": "Pico",
  "reports.viewers.raidsLegend": "● raids",
  "reports.viewers.series": "Assistindo",
  "reports.viewers.startEnd": "Começo {start} → fim {end}",
  "reports.viewers.title": "Audiência ao vivo (quanto da galera ficou)",
  "reports.windows.note": "Copie o tempo do trecho e ache ele no VOD.",
  "reports.windows.title": "Pontos técnicos para revisar",

  // ---- settings ----
  "settings.language.title": "Idioma",
  "settings.language.desc":
    "Em automático, a Corneta segue o idioma do Windows. A troca vale na hora, sem reiniciar.",
  "settings.language.auto": "Automático",
  "settings.appearance.lightTheme.title": "Tema claro",
  "settings.appearance.lightTheme.toggle": "Tema claro",
  "settings.appearance.title": "Aparência",
  "settings.brb.slate.custom": "Escolher um arquivo meu",
  "settings.brb.slate.default": "Usar a padrão da Corneta",
  "settings.brb.slate.label": "Tela do “JÁ VOLTO”",
  "settings.brb.slate.note":
    "{current} — entra no ar quando o sinal cai. Vídeo toca em loop e pode ter som.",
  "settings.brb.slate.preview.alt": "Prévia da tela do JÁ VOLTO",
  "settings.brb.slate.toast.default": "Botei de volta a tela padrão da Corneta",
  "settings.brb.slate.toast.defaultError":
    "Não consegui voltar pra tela padrão: {error}",
  "settings.brb.slate.toast.fileError":
    "Não consegui usar esse arquivo: {error}",
  "settings.brb.slate.toast.updated": "Atualizei a tela do JÁ VOLTO",
  "settings.brb.slate.using.default": "Usando: tela padrão da Corneta",
  "settings.brb.slate.using.image": "Usando: {file} (imagem)",
  "settings.brb.slate.using.image.fallback": "imagem enviada",
  "settings.brb.slate.using.video": "Usando: {file} (vídeo, com som)",
  "settings.brb.slate.using.video.fallback": "vídeo enviado",
  "settings.data.backup.desc":
    "Salva seus ajustes num arquivo. As chaves ficam no cofre, não vão junto. Importar substitui a config atual.",
  "settings.data.backup.export": "Exportar",
  "settings.data.backup.import": "Importar",
  "settings.data.backup.import.confirm": "Substituir a config atual?",
  "settings.data.backup.title": "Backup da config",
  "settings.data.logs.desc":
    "Exporte um resumo técnico estruturado pro suporte — sem logs, nomes, caminhos ou credenciais — ou abra os logs separadamente aqui no PC.",
  "settings.data.logs.export": "Exportar diagnóstico",
  "settings.data.logs.export.error": "Não consegui exportar o diagnóstico.",
  "settings.data.logs.open": "Abrir logs",
  "settings.data.logs.title": "Logs",
  "settings.data.title": "Dados & diagnóstico",
  "settings.telemetry.buildDisabled":
    "A coleta está desativada neste build; sua escolha fica guardada para uma versão configurada.",
  "settings.telemetry.crashes.desc":
    "O que quebrou, com dados seus apagados e sem anexar logs.",
  "settings.telemetry.deletion.cta": "Como pedir exclusão",
  "settings.telemetry.deletion.desc":
    "Com as duas opções desligadas, copie o ID acima e siga o canal indicado na política para excluir o que já foi enviado.",
  "settings.telemetry.explainer":
    "As duas vêm ligadas, por legítimo interesse — existem pra eu achar e consertar problema. Sai só dado técnico pseudonimizado do catálogo; o PostHog opera a coleta, com retenção inicial de 90 dias. Desligar aqui é o seu direito de oposição e vale na hora.",
  "settings.telemetry.id": "ID de telemetria",
  "settings.telemetry.id.pending":
    "O ID só é criado quando você liga pelo menos uma opção.",
  "settings.telemetry.loading": "Lendo suas escolhas de telemetria…",
  "settings.telemetry.privacy": "Política de privacidade e dados coletados",
  "settings.telemetry.regenerate.confirm": "Trocar o ID agora?",
  "settings.telemetry.regenerate.cta": "Usar outro ID",
  "settings.telemetry.regenerate.error": "Não consegui trocar o ID.",
  "settings.telemetry.regenerate.ok":
    "ID anterior desvinculado. Um novo será criado se você reativar a telemetria.",
  "settings.telemetry.saveError":
    "Não consegui salvar. A escolha anterior continua valendo.",
  "settings.telemetry.saved": "Salvei sua escolha.",
  "settings.telemetry.unavailable":
    "A telemetria não tá funcionando nesta versão da Corneta — não mandei nada.",
  "settings.telemetry.usage.desc":
    "Etapas e resultados em categorias, sem texto ou conteúdo da live.",
  "settings.guardian.cost.chat":
    "O chat e a interação chegam até você com esse mesmo atraso.",
  // Os {buracos} destas três viram negrito: são o preço da proteção, e é o que a
  // pessoa precisa ler mesmo passando o olho.
  "settings.guardian.cost.delay": "A transmissão fica {delay} do tempo real.",
  "settings.guardian.cost.delay.value": "12s atrás",
  "settings.guardian.cost.intro":
    "Quando um termo da sua lista aparece, a Corneta troca pra tela {jaVolto} antes daquele instante ir ao ar — nunca exposto, nem num clipe. Pra garantir isso:",
  "settings.guardian.cost.scope":
    "Só vigia os termos que você listar — {no} “qualquer segredo”.",
  "settings.guardian.cost.scope.no": "não",
  "settings.guardian.cost.smallText": "Texto muito pequeno ainda pode escapar.",
  "settings.guardian.cost.title": "🛡️ O preço da proteção",
  "settings.guardian.list.empty":
    "Sem termos (3+ letras), o guardião não faz nada — adicione ao menos um.",
  "settings.guardian.list.hint":
    "(um por linha — seu e-mail, nome real, endereço, seu @)",
  "settings.guardian.list.label": "Termos a vigiar",
  "settings.guardian.list.placeholder":
    "meu@email.com\nRua das Flores, 42\nMeu Nome Real",
  // Variantes .one/.other: quem monta é o tp(), com {count} = nº de termos.
  "settings.guardian.list.watching.one": "Vigiando 1 termo.",
  "settings.guardian.list.watching.other": "Vigiando {count} termos.",
  "settings.guardian.list.watchingManyShort.one":
    "Vigiando 1 termo — {short} ignorados por serem curtos demais (mínimo 3 letras): {terms}.",
  "settings.guardian.list.watchingManyShort.other":
    "Vigiando {count} termos — {short} ignorados por serem curtos demais (mínimo 3 letras): {terms}.",
  "settings.guardian.list.watchingOneShort.one":
    "Vigiando 1 termo — 1 ignorado por ser curto demais (mínimo 3 letras): {terms}.",
  "settings.guardian.list.watchingOneShort.other":
    "Vigiando {count} termos — 1 ignorado por ser curto demais (mínimo 3 letras): {terms}.",
  // ---- Barra lateral ----
  // Os rótulos são o NOME DAS TELAS: têm que bater com o título de cada uma
  // (platforms.title, encoding.header.title, …) e com toda frase que manda a
  // pessoa "lá em Plataformas". Mudou um, muda os dois.
  "sidebar.about": "Sobre",
  "sidebar.live.title": "Ver o painel ao vivo",
  "sidebar.nav.chat.hint": "todo chat num lugar",
  "sidebar.nav.chat.label": "Chat",
  "sidebar.nav.encoding.hint": "qualidade e peso no PC",
  "sidebar.nav.encoding.label": "Qualidade",
  "sidebar.nav.golive.hint": "bota tudo no ar",
  "sidebar.nav.golive.label": "Ao vivo",
  "sidebar.nav.mesa.hint": "co-stream com a galera",
  "sidebar.nav.mesa.label": "Mesa",
  "sidebar.nav.platforms.hint": "onde sua live aparece",
  "sidebar.nav.platforms.label": "Plataformas",
  "sidebar.nav.reports.hint": "como foi a live",
  "sidebar.nav.reports.label": "Relatórios",
  "sidebar.new": "novo",
  "sidebar.settings": "Configurações",
  "sidebar.start.title": "Ir pro Ao vivo e começar",
  "sidebar.state.error": "Erro",
  "sidebar.state.live": "No ar · cornetando",
  "sidebar.state.connectingTargets": "Conectando às plataformas",
  "sidebar.state.starting": "Aguardando o OBS",
  "sidebar.state.stopped": "Fora do ar",
  "sidebar.viewers": "assistindo",
  "settings.header.kicker": "Por baixo do capô",
  "settings.header.subtitle":
    "Como a Corneta conversa com o OBS e se comporta no ar.",
  "settings.header.title": "Configurações",
  "settings.hotkey.capture.idle": "definir atalho",
  "settings.hotkey.capture.needsModifier":
    "precisa de Ctrl, Alt ou Shift junto",
  "settings.hotkey.capture.prompt":
    "pressione Ctrl, Alt ou Shift + tecla… (Esc cancela)",
  "settings.hotkey.clear": "Limpar",
  "settings.hotkey.desc":
    "Começa/para a transmissão de qualquer lugar — mesmo com a Corneta minimizada na bandeja.",
  "settings.hotkey.title": "Atalho global",
  "settings.hotkey.toast.inUse":
    "Outro programa já tá usando esse atalho — mantive o anterior.",
  "settings.hotkey.toast.restoreFailed":
    "Não consegui restaurar o atalho anterior — defina um novo.",
  "settings.loading.body": "Já trago seus ajustes.",
  "settings.loading.title": "Carregando…",
  "settings.loudness.target.label": "Alvo de volume",
  "settings.loudness.target.minus14": "-14 · padrão (Twitch/YT)",
  "settings.loudness.target.minus16": "-16 · mais suave",
  "settings.loudness.target.minus18": "-18 · podcast/voz",
  "settings.obs.advanced.desc":
    "Só mexa aqui se a porta padrão (1935) já estiver em uso por outro programa. Mudou aqui, muda no OBS também.",
  "settings.obs.advanced.field.app": "Aplicação (app)",
  "settings.obs.advanced.field.host": "Host",
  "settings.obs.advanced.field.localKey": "Chave local",
  "settings.obs.advanced.field.port": "Porta",
  "settings.obs.advanced.port.invalid": "A porta vai de 1 a 65535.",
  "settings.obs.advanced.trigger": "Avançado — mudar o endereço local",
  // {button} = nome do botão; {path} = caminho de menu do OBS. Os dois em negrito:
  // são justamente as duas coisas que a pessoa vai PROCURAR na tela.
  "settings.obs.autoconfig.desc":
    "Pro botão {button} (na tela Ao vivo) funcionar, ative no OBS: {path}. Se tiver senha, cole aqui.",
  "settings.obs.autoconfig.desc.button": "“Configura pra mim”",
  "settings.obs.autoconfig.desc.path":
    "Ferramentas → Configurações do Servidor WebSocket",
  "settings.obs.autoconfig.title": "OBS — auto-config",
  "settings.obs.autostart.desc":
    "No BORA AO VIVO, a Corneta também manda o OBS começar a transmitir.",
  "settings.obs.autostart.title": "Ligar o OBS junto",
  "settings.obs.autostart.toggle": "Ligar o OBS junto",
  // {key} = a palavra "chave", em negrito: é ela que separa esta chave (interna,
  // OBS↔Corneta) da chave da plataforma — trocar as duas é erro caro.
  "settings.obs.ingest.desc":
    "Endereço local onde o OBS te entrega o vídeo. A {key} abaixo é só entre OBS e Corneta — não é a chave da plataforma, que fica no cofre.",
  "settings.obs.ingest.desc.key": "chave",
  "settings.obs.ingest.liveLock":
    "Você tá no ar — travei esse endereço pra não derrubar o OBS no meio da live.",
  "settings.obs.ingest.title": "Endereço pro OBS",
  "settings.obs.password.desc":
    "A senha aparece nessa mesma janela do OBS, no botão “Mostrar Chave de Conexão”. Se “Ativar Autenticação” estiver desmarcado lá, deixe vazio.",
  "settings.obs.password.placeholder": "(opcional)",
  "settings.obs.password.title": "Senha do WebSocket",
  "settings.obs.paste.field.key": "Chave",
  "settings.obs.paste.field.server": "Servidor",
  "settings.obs.paste.label": "Cole no OBS",
  "settings.obs.test.authFail":
    "Senha recusada — confira a senha do WebSocket no OBS (botão “Mostrar Chave de Conexão”).",
  "settings.obs.test.button": "Testar conexão",
  "settings.obs.test.notFound":
    "Não achei o OBS — ele tá aberto? O WebSocket tá ligado em Ferramentas → Configurações do Servidor WebSocket?",
  "settings.obs.test.ok": "Conectado",
  "settings.obs.test.okDetail": "Conectado · {width}×{height} · {fps}fps",
  "settings.obs.test.wrongTarget":
    "Conectado, mas o OBS não tá apontando pra Corneta — use “Configura pra mim” na tela Ao vivo.",
  "settings.safety.bitrate.desc":
    "Internet engasgou? A Corneta desce a qualidade do vídeo por um tempo em vez de deixar a live travar ou cair, e sobe de novo quando o upload firma.",
  "settings.safety.bitrate.title":
    "Segurar a live quando a internet aperta (auto-bitrate)",
  "settings.safety.brb.desc":
    "Se o OBS cair no meio da live, a tela “JÁ VOLTO” entra no ar sem derrubar as plataformas — pro espectador a live nem pisca, e volta sozinha quando o sinal retorna.",
  "settings.safety.brb.title": "Proteção contra quedas (JÁ VOLTO)",
  "settings.safety.desc":
    "O que segura a sua live quando o OBS cai, a internet aperta ou um dado seu aparece na tela.",
  "settings.safety.guardian.desc":
    "Se um termo seu (lista abaixo) aparece na tela, a Corneta corta pra “JÁ VOLTO” antes de ir ao ar. Rede de segurança, não garantia. Custo: a live inteira sai com 12s de atraso (o chat também).",
  "settings.safety.guardian.title": "Guardião de privacidade",
  "settings.safety.loudness.desc":
    "A Corneta acerta o volume do seu som antes de enviar — sem “tá baixo” nem estourando na troca de cena. Se você já normaliza no OBS, deixe desligado pra não brigar.",
  "settings.safety.loudness.title": "Normalizador de áudio",
  "settings.safety.state.armed": "Armado",
  "settings.safety.state.off": "desligado",
  "settings.safety.title": "Segurança ao vivo",
  "settings.system.autostart.desc":
    "Inicia a Corneta automaticamente quando você liga o computador.",
  "settings.system.autostart.title": "Abrir com o Windows",
  "settings.system.autostart.toggle": "Abrir com o Windows",
  "settings.system.title": "Sistema",
  "settings.system.tray.desc":
    "Fechar a janela esconde a Corneta perto do relógio (a transmissão continua). Pra sair de vez, use o menu da bandeja.",
  "settings.system.tray.title": "Minimizar pra bandeja ao fechar",
  "settings.system.tray.toggle": "Minimizar pra bandeja",
  "settings.record.chat.hint":
    "Guarda quem falou o quê, pra você rever o chat junto com o vídeo. Fica só no seu computador — a Corneta não recebe cópia.",
  "settings.record.chat.label": "Gravar o chat",
  "settings.record.desc":
    "Guarde a live no seu computador e reveja depois com os gráficos correndo junto, no relatório.",
  "settings.record.dir.default": "pasta padrão da Corneta",
  "settings.record.dir.error.kept":
    "{path} não serve — continuo gravando na pasta de antes.",
  "settings.record.dir.error.missing": "Não achei essa pasta — escolha outra.",
  "settings.record.dir.error.notDir":
    "Isso não é uma pasta — aponte pra uma pasta.",
  "settings.record.dir.error.readonly":
    "Não consigo escrever nessa pasta — escolha outra ou libere a permissão no Windows.",
  "settings.record.dir.free":
    "{size} GB livres — dá pra umas {hours} h de live",
  "settings.record.dir.label": "Salvar em",
  "settings.record.dir.open": "Abrir pasta",
  "settings.record.dir.pick": "Escolher pasta",
  "settings.record.dir.reset": "usar a padrão",
  "settings.record.group.space": "Espaço em disco",
  "settings.record.keep.hint":
    "Passou disso, a Corneta apaga as gravações mais antigas. Os relatórios ficam.",
  "settings.record.keep.hours": "≈{hours} h de live",
  "settings.record.keep.label": "Guardar até",
  "settings.record.keep.over":
    "O limite passa do espaço livre — o disco enche antes de a Corneta apagar.",
  "settings.record.privacy":
    "Tudo fica no seu computador: nada de gravação sobe pra lugar nenhum. Se gravar o chat, as mensagens ficam sob a sua responsabilidade.",
  "settings.record.test.busy": "Testando…",
  "settings.record.test.cta": "Testar a gravação",
  "settings.record.test.fail": "Não consegui terminar o teste: {error}",
  "settings.record.test.hint":
    "Grava 5 segundos e toca de volta. Vale fazer antes da primeira live.",
  "settings.record.test.modal": "Teste de gravação",
  "settings.record.test.modal.body":
    "Se você tá vendo e ouvindo isso, a gravação funciona nesta máquina: a pasta aceita escrita e o player toca o arquivo.",
  "settings.record.test.ok": "Gravação funcionando 📣",
  "settings.record.title": "Gravar a live",
  "settings.record.video.hint":
    "Guarda o que foi ao ar, sem pesar (não recodifica). Gasta uns {gb} GB por hora no seu bitrate atual.",
  "settings.record.video.label": "Gravar o vídeo",
  "settings.record.warn.longPath":
    "Esse caminho é bem comprido — o Windows pode reclamar.",
  "settings.record.warn.network":
    "Pasta de rede ou unidade removível: se ela sumir no meio da live, a gravação para (a transmissão não).",
  "settings.tab.general": "Geral",
  "settings.tab.obs": "OBS",
  "settings.tab.safety": "Segurança ao vivo",
  "settings.toast.export.error": "Não consegui exportar a config: {error}",
  "settings.toast.export.ok": "Exportei sua config",
  "settings.toast.import.error": "Não consegui importar esse arquivo: {error}",
  "settings.toast.import.ok":
    "Config importada — guardei a anterior num backup.",

  // ---- shell (janela principal) ----
  // aria-label + title do X da barra de título quando fechar esconde a Corneta perto do relógio.
  "shell.win.closeTray": "Fechar — a Corneta fica perto do relógio",
} as const;

export type Dict = Record<keyof typeof pt, string>;
export type MessageKey = keyof typeof pt;
