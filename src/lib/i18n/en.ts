// ============================================================
// Dicionário en da LP.
//
// NÃO é tradução literal do pt-BR: o registro é o mesmo (informal, concreto,
// primeira pessoa), mas a frase é reescrita pra soar de gente em inglês.
// Ver docs/TOM-DE-VOZ.md §3 — as regras valem nos dois idiomas.
//
// Tipado como `Dict`: faltou chave, o build quebra.
// ============================================================
import type { Dict } from "./pt";

export const en: Dict = {
  // ---- analysis ----
  "analysis.advice.app.cpu":
    "Before the next stream, close anything you are not using. If {app} is the game, reduce view distance or physics, or cap its frame rate.",
  "analysis.advice.app.gpu":
    "If {app} is the game, cap its frame rate or lower shadows and effects. Try to leave some graphics-card headroom for OBS.",
  "analysis.advice.app.memory":
    "Before the stream, close tabs and apps you're not using. If {app} keeps growing, close and reopen it before you go live.",
  // "Settings → Output → Encoder" são os rótulos reais do menu do OBS em inglês — não traduzir de novo. "tela Qualidade" é uma tela da Corneta: tem que ca
  "analysis.advice.encoding":
    "In OBS, lower the resolution or frame rate under Settings → Video. If available, pick your graphics-card encoder under Settings → Output.",
  "analysis.advice.local":
    "Restart OBS and Corneta before the next stream. If it happens again, check that only one OBS is sending video to Corneta.",
  // "live" (substantivo BR) → "stream", conforme glossário.
  "analysis.advice.network":
    "Test your upload before the next stream. If it is fluctuating, lower the bitrate on the Quality screen or remove one platform.",
  // "chave" → "stream key"; "o status dela" virou "their status page", que é a coisa que existe pra abrir.
  "analysis.advice.platform":
    "Check that channel's stream key and the platform status page. If it happens again only there, reconnect the account.",
  // "resolução base" é o campo Base (Canvas) Resolution do OBS: em EN "base resolution" bate com o rótulo real.
  "analysis.advice.render":
    "Lighten that scene in OBS: disable hidden sources, use fewer filters and avoid several animated videos at once.",
  // Convive na mesma tela com analysis.verdict.signal.detail, que diz quase a mesma coisa; variei "a galera" (nobody watching / everyone watching) pra não
  "analysis.advice.signal":
    "Check that OBS stayed open, streaming and pointed at Corneta — nobody watching had a picture that whole stretch.",
  "analysis.advice.unknown": "Check the signals in this stretch.",
  "analysis.cause.app.cpu": "{app} used almost all of the processor",
  "analysis.cause.app.gpu": "{app} used almost all of the graphics card",
  "analysis.cause.app.memory":
    "{app} used a lot of memory while it was nearly full",
  "analysis.cause.encoding": "OBS couldn't prepare every frame in time",
  "analysis.cause.local": "The video lost pace between OBS and Corneta",
  "analysis.cause.network": "Your connection to the platforms got shaky",
  // {target} é o nome do destino (Twitch, Kick, o rótulo que o streamer deu). Troquei o substantivo abstrato "instabilidade" por verbo, senão a frase fica
  "analysis.cause.platform": "The connection to {target} became unstable",
  "analysis.cause.render": "OBS took too long to assemble the picture",
  "analysis.cause.signal": "Video stopped arriving from OBS",
  // Vira o título do card do trecho. Em EN entra no formato fixo "Couldn't ..." e o advice abaixo dá o passo — o PT aqui é mais frio que o resto do app.
  "analysis.cause.unknown": "There isn't enough data to name a cause yet",
  "analysis.event.cpuHigh": "CPU at {pct}%",
  "analysis.event.end": "Stream ended",
  // No código o rótulo é montado por concatenação (`${t.name} ${estado}`) — em EN a frase inteira precisa ser uma chave só, senão a ordem quebra.
  "analysis.event.error": "{target} hit an error",
  // {label} é o texto que o streamer digitou no marcador (dado, não copy) — só o prefixo 📍 é do app.
  "analysis.event.marker": "📍 {label}",
  // Chave separada de analysis.signal.reconnected: aqui é UM destino, lá é a lista juntada.
  "analysis.event.reconnect": "{target} reconnected",
  "analysis.event.recover": "{target} came back",
  "analysis.event.signalLost": "{target} lost the OBS signal",
  // Item da linha do tempo, com horário ao lado.
  "analysis.event.start": "Stream started",
  // Igual nos dois idiomas ("bits" é termo da Twitch), mas é string montada — precisa da chave.
  "analysis.highlight.bits": "{user}: {n} bits",
  "analysis.highlight.chatSpike": "Chat blew up ({rate}/min)",
  // {user} é quem mandou a raid (dado da plataforma). "raid" fica como está — é termo da Twitch.
  "analysis.highlight.raid": "Raid from {user} (+{n})",
  "analysis.highlight.subgift": "{user} gifted {n} subs",
  // O nome do recurso no YouTube é "Super Chat" (duas palavras, maiúsculas). "gordo" é elogio afetivo sem equivalente — "Big" segura o tamanho, perde o ca
  "analysis.highlight.superchat": "Big Super Chat from {user}",
  // Literal seria "+{delta} watching all at once", que em EN dá a entender total e não salto. A frase descreve um pulo na audiência entre duas amostras.
  "analysis.highlight.viewerJump": "+{delta} people showed up at once",
  // Fallback do nome de quem disparou o alerta quando o NDJSON não trouxe `user`. Aparece dentro de highlights ("Raid de alguém") e na exportação.
  "analysis.parse.alert.userFallback": "someone",
  // Fallback do rótulo do marcador; vai pra linha do tempo já com o prefixo 📍.
  "analysis.parse.marker.labelFallback": "Marker",
  // O caixa-alta do pôster é desenho: o recap.ts aplica .toUpperCase() aqui, como já faz nos rótulos vizinhos do canvas.
  "analysis.recap.bestMoment": "Best moment",
  "analysis.signal.appCpu": "{app} reached {pct}% of the processor",
  "analysis.signal.appGpu": "{app} reached {pct}% of the graphics card",
  "analysis.signal.appMemory": "{app} used {gb} GB of memory",
  "analysis.signal.bitrateDrop": "The outgoing quality dropped in this stretch",
  // Idêntico nos dois idiomas, mas é string montada — precisa de chave pra não virar concatenação solta.
  "analysis.signal.cpu": "The processor reached {pct}%",
  "analysis.signal.gpu": "The graphics card reached {pct}%",
  "analysis.signal.memory": "Memory reached {pct}%",
  "analysis.signal.obsCongested":
    "The feed from OBS to Corneta became constrained ({pct}%)",
  "analysis.signal.obsRender": "OBS took up to {ms} ms to assemble each frame",
  // Chip de sinal dentro do card do trecho — minúscula proposital, é item de lista.
  "analysis.signal.obsSignalLost": "OBS stopped sending video",
  "analysis.signal.outputSkipped":
    "OBS couldn't prepare {count} frames for delivery",
  // {targets} é a lista de destinos afetados já juntada com ", " no código. Em EN o verbo não muda no plural, mas o PT sim ("reconectou/reconectaram") — a
  "analysis.signal.reconnected": "{targets} had to reconnect",
  "analysis.signal.renderSkipped":
    "OBS couldn't assemble {count} frames in time",
  "analysis.signal.targetDropped":
    "The platforms lost {count} frames in this stretch",
  "analysis.verdict.app.detail":
    "Across {n} {stretch}, {app} competed with the video at the same time frames fell behind.{brief}",
  "analysis.verdict.app.title": "{app} left too little room for the stream",
  // ATENÇÃO: a string começa com espaço porque é colada no meio dos detalhes (marcada como {brief} nas outras chaves). Mantive o espaço no pt e no en.
  "analysis.verdict.brief":
    " It was quick ({sec}s in total) — chances are nobody watching even noticed.",
  // "perrengue" → "trouble" (glossário). Primeira pessoa do que o app fez (§3.1) em vez de "no problems were detected".
  "analysis.verdict.clean.detail": "Didn't spot any trouble in this one.",
  "analysis.verdict.clean.title": "Clean stream",
  // {brief} é analysis.verdict.brief (já vem com o espaço na frente) e pode ser vazio. "no talo" → "maxed out".
  "analysis.verdict.encoding.detail":
    "Across {n} {stretch}, OBS couldn't prepare every frame in time.{brief} Lower the resolution or frame rate in OBS to leave more headroom.",
  "analysis.verdict.encoding.title":
    "The video became too heavy for the computer",
  // "engasgo" → "stutter" (glossário).
  "analysis.verdict.encoding.title.brief":
    "A quick stutter while preparing video",
  "analysis.verdict.local.detail":
    "Across {n} {stretch}, the video lost pace before it even left your computer.{brief}",
  "analysis.verdict.local.title": "Video stuttered between OBS and Corneta",
  "analysis.verdict.network.detail":
    "Across {n} {stretch}, quality dropped or more than one platform reconnected at the same time.{brief}",
  "analysis.verdict.network.title":
    "Your connection to the platforms got shaky",
  "analysis.verdict.network.title.brief": "A quick delivery fluctuation",
  "analysis.verdict.platform.detail":
    "Across {n} {stretch}, only one platform was affected. That points to the channel connection, but doesn't confirm which end caused it.{brief}",
  "analysis.verdict.platform.title": "One platform lost pace",
  "analysis.verdict.render.detail":
    "Across {n} {stretch}, OBS took too long to assemble the picture. Lighten the scene, use fewer filters or avoid several animated videos together.{brief}",
  "analysis.verdict.render.title": "OBS took too long to assemble the picture",
  // Esse veredito nunca recebe {brief} (o código só usa briefNote quando não houve perda de sinal).
  "analysis.verdict.signal.detail":
    "{n} {stretch} with no video coming in from OBS — everyone watching was stuck on a frozen frame.",
  "analysis.verdict.signal.title": "The OBS signal dropped",
  "analysis.verdict.windows.detail": "Check the details for each one below.",
  // Aqui "trecho" vira "rough patch" porque anda sozinho; nas outras chaves vira "stretch" porque sempre vem com o qualificador atrás ("stretch(es) with C
  "analysis.verdict.windows.title": "{n} {patch}",
  // Substantivos soltos, pros buracos das frases acima. São DOIS porque em inglês
  // a palavra muda de acordo com a companhia: {stretch} sempre vem com o
  // qualificador atrás ("stretch with CPU maxed out"), e {patch} anda sozinho no
  // título. Em português os dois são "trecho".
  "analysis.verdict.patch.one": "rough patch",
  "analysis.verdict.patch.other": "rough patches",
  "analysis.verdict.stretch.one": "stretch",
  "analysis.verdict.stretch.other": "stretches",

  // Isto NÃO é interface: é o texto desenhado no cartão que vai AO AR quando o
  // sinal do OBS cai. Quem lê é o público do streamer — por isso segue o idioma.
  "brb.slate.subtitle": "back in a sec — hang tight 📣",
  "brb.slate.title": "BE RIGHT BACK",

  // ---- chat ----
  // No JSX a primeira metade está dentro de <strong> e {error} vem do backend (não traduzido aqui).
  "chat.account.brokerError":
    "Corneta's official sign-in is down: {error}. You can sign in with your own credentials under advanced options.",
  // Aparece 2x (YouTube e Kick).
  "chat.account.byok.hide": "hide advanced options",
  // Aparece 2x (YouTube e Kick).
  "chat.account.byok.show": "use my own credentials",
  // Aparece 2x: aba Conta e card de Overlays.
  "chat.account.desktopOnly": "Only in the installed app.",
  // Diz o que falta sem entrar, em vez de repetir o chat.login.prompt.
  "chat.account.footer":
    "Without signing in, Corneta reads the chat but can't send messages or time anyone out.",
  "chat.account.kick.forgot.toast": "Deleted your Kick credentials",
  "chat.account.kick.official.toast": "Kick's official sign-in is back on",
  "chat.account.kick.ownCreds.toast": "Using your own Kick credentials 🔒",
  // "aba Canais" tem que casar com chat.config.tab.channels.
  "chat.account.needChannel":
    "Add a **Twitch**, **YouTube** or **Kick** channel in the Channels tab to sign in.",
  // Mesma forma da LP (closing.footer.link.privacy).
  "chat.account.privacy.link": "Privacy policy",
  // Texto de divulgação exigido pela Limited Use do Google — precisa continuar claro no consentimento.
  "chat.account.privacy.text":
    "Corneta uses your account only for what's in the {link}. You can disconnect whenever you want.",
  // Primeira pessoa do que o app fez, casando com o botão "forget my credentials".
  "chat.account.youtube.forgot.toast": "Deleted your YouTube credentials",
  "chat.account.youtube.official.toast":
    "YouTube's official sign-in is back on",
  "chat.account.youtube.ownCreds.toast":
    "Using your own YouTube credentials 🔒",
  "chat.action.configure": "Set up",
  // Aparece 3x na ChatScreen (topo, estado vazio) e 1x no popout.
  "chat.action.connect": "Connect",
  "chat.action.connect.needChannel": "Add a channel first",
  "chat.action.disconnect": "Disconnect",
  // O PT usa substantivo (não verbo). Alternativa mais falada em inglês: "Pop out" — decisão humana.
  "chat.action.popout": "Pop out",
  // Casa com a LP: "in a window that sits on top of everything".
  "chat.action.popout.title":
    "A little chat window that sits on top of everything.",
  "chat.action.reconnect": "Reconnect",
  "chat.action.reconnect.title": "Reconnects the sources that dropped.",
  // Também é o título do painel lateral de alertas.
  "chat.alerts.button": "Alerts",
  // O código concatena " ({n})" ao rótulo — ver riscos.
  "chat.alerts.button.count": "Alerts ({n})",
  "chat.alerts.clear.confirmLabel": "Clear?",
  "chat.alerts.clear.confirmTitle": "Click again to confirm",
  // title e aria-label do botão da lixeira do painel de alertas.
  "chat.alerts.clear.title": "Clear alerts",
  "chat.alerts.newPulse": "New alert just came in!",
  "chat.alerts.sourceDown":
    "{source} dropped — check the token under Set up → Alert sources",
  "chat.alertsrc.add": "Add source",
  // aria-label funcional (§6).
  "chat.alertsrc.collapse": "Collapse source",
  "chat.alertsrc.empty":
    "No alert sources yet. Add **Streamlabs** or **StreamElements** to see donations.",
  // aria-label funcional (§6).
  "chat.alertsrc.expand": "Expand source",
  // "Channels", "Show secrets" e "JWT Token" são rótulos da UI do StreamElements.
  "chat.alertsrc.hint.streamelements":
    'StreamElements → your profile → Channels → "Show secrets" → JWT Token. ⚠️ It expires every ~2 weeks — just paste a new one.',
  // O caminho de menu já está em inglês porque é a UI do Streamlabs — não traduzir.
  "chat.alertsrc.hint.streamlabs":
    'Streamlabs → Account Settings → API Settings → "Your Socket API Token". Picks up donations, follows, subs and bits.',
  // Nomes das plataformas ficam dentro de <strong> no JSX.
  "chat.alertsrc.lede":
    "Paste your **Streamlabs** or **StreamElements** token — donations land in the Alerts feed.",
  "chat.alertsrc.noToken": "no token",
  "chat.alertsrc.remove": "Remove source",
  "chat.alertsrc.replace": "Replace",
  "chat.alertsrc.section": "Alert sources",
  "chat.alertsrc.status.dropped": "dropped",
  "chat.alertsrc.status.error": "error",
  // ALERT_STATUS — as CHAVES (connected/error/disconnected) são valores de enum, só o valor é copy.
  "chat.alertsrc.status.live": "live",
  // Renderizado como "· {texto}" — o "·" é decoração do JSX.
  "chat.alertsrc.tokenSaved": "token saved",
  // Fica numa linha estreita — se estourar, considerar "Token in the Credential Manager".
  "chat.alertsrc.tokenStored.chip": "Token in Windows Credential Manager",
  // Glossário: cofre → Windows Credential Manager.
  "chat.alertsrc.tokenStored.toast":
    "Saved your token in Windows Credential Manager 🔒",
  "chat.autoconnect.hint": "So you don't have to click Connect every stream.",
  "chat.autoconnect.label": "Connect the chat for me when I go live",
  "chat.byok.forget": "forget my credentials",
  // Assume o limite antes de a pessoa descobrir (§3.4).
  "chat.byok.officialDown":
    "(the official one didn't answer last time I checked — your credentials stay saved either way)",
  "chat.byok.useOfficial": "Go back to Corneta's official sign-in",
  "chat.byok.useSaved": "Use the credentials I already saved",
  // Também é o rótulo do botão do estado vazio do feed.
  "chat.channels.add": "Add channel",
  // No JSX os nomes das plataformas estão dentro de <strong>; a frase precisa ficar inteira numa chave só.
  "chat.channels.empty":
    "No channels yet. Add one from **Twitch**, **Kick**, **YouTube** or **Cinefy (experimental)** — you can add more than one from the same platform (two Twitch channels, say).",
  // Rótulo da seção dentro da aba (mesma palavra da aba, chave separada porque pode divergir).
  "chat.channels.section": "Channels",
  // Aparece 2x: escolha de plataforma e escolha de fonte de alerta.
  "chat.channels.which": "Which one?",
  "chat.clear": "Clear",
  "chat.clear.confirm": "Clear for real?",
  // Usado no botão de adicionar canal e no de adicionar fonte de alerta.
  "chat.common.cancel": "Cancel",
  "chat.common.copied": "Copied",
  // Aparece no overlay e no código de login.
  "chat.common.copy": "Copy",
  "chat.common.paste": "Paste",
  // Aparece no card de canal e no card de fonte de alerta.
  "chat.common.removeConfirm": "Remove for real?",
  // Aparece 3x: fonte de alerta, credenciais do YouTube e da Kick.
  "chat.common.save": "Save",
  "chat.common.test": "Test",
  "chat.common.testing": "Testing…",
  "chat.config.tab.account": "Account",
  "chat.config.tab.alerts": "Alerts",
  "chat.config.tab.channels": "Channels",
  "chat.config.tab.display": "Display",
  // Já em inglês no PT; é o nome que o streamer usa.
  "chat.config.tab.overlays": "Overlays",
  // Aparece 2x: prop title do Modal (acessibilidade) e o <h3> visível.
  "chat.config.title": "Set up the chat",
  // Rótulo + aria-label do Slider (também no popout).
  "chat.display.alertFontSize": "Alert font size",
  "chat.display.badges": "Badges",
  "chat.display.badges.hint": "sub/mod/VIP badges",
  // Aparece como rótulo e como aria-label do Slider (também no popout).
  "chat.display.chatFontSize": "Chat font size",
  // Termo já em inglês no PT — é como o streamer fala.
  "chat.display.emotes": "Emotes",
  "chat.display.emotes.hint": "pictures instead of :code:",
  // Glossário: plataforma → platform, sempre.
  "chat.display.platform": "Platform",
  "chat.display.platform.hint": "which platform it came from",
  "chat.display.section": "What to show in the feed",
  "chat.display.source": "Channel",
  "chat.display.source.hint": "handy with 2+ channels on the same platform",
  "chat.display.timestamps": "Time",
  "chat.display.timestamps.hint": "when the message came in",
  "chat.display.viewers": "Who's watching",
  "chat.display.viewers.hint": "viewer count",
  // Formato fixo de erro: "Couldn't …" + o que fazer.
  "chat.error.connect": "Couldn't connect the chat — check your channels.",
  // ---- Feed de alertas ----
  // O verbo entra depois do nome de quem fez: "@fulano followed".
  "chat.alerts.empty":
    "Subs, gifts, bits, raids and super chats from every platform show up here.",
  "chat.alerts.detail.bits": "{n} bits",
  "chat.alerts.detail.months.one": "1 month",
  "chat.alerts.detail.months.other": "{count} months",
  "chat.alerts.detail.raidViewers": "{n} viewers",
  "chat.alerts.detail.subs.one": "1 sub",
  "chat.alerts.detail.subs.other": "{count} subs",
  "chat.alerts.verb.bits": "sent bits",
  "chat.alerts.verb.follow": "followed",
  "chat.alerts.verb.member": "became a member",
  "chat.alerts.verb.raid": "brought a raid",
  "chat.alerts.verb.resub": "resubscribed",
  "chat.alerts.verb.sub": "subscribed",
  "chat.alerts.verb.subgift": "gifted",
  "chat.alerts.verb.superchat": "sent a Super Chat",
  "chat.alerts.verb.tip": "tipped",
  // ---- Estado vazio do feed de chat ----
  "chat.feed.empty.disconnected.body":
    "Add a channel (Twitch, Kick, YouTube or experimental Cinefy) and click Connect to pull the chat in.",
  "chat.feed.empty.disconnected.title": "Chat's disconnected",
  "chat.feed.empty.filtered.body":
    "You turned every platform off. Flip one back on up there to see the chat again.",
  "chat.feed.empty.filtered.title": "The filter hid everything",
  "chat.feed.empty.waiting.body":
    "The moment anyone says something, it shows up here.",
  "chat.feed.empty.waiting.title": "Waiting on messages…",
  "chat.feed.deleted.body": "message deleted",
  "chat.feed.deleted.stamp": "deleted",
  "chat.feed.follow": "Follow chat",
  "chat.feed.hint.ready": "Until you connect, Corneta isn't reading your chat.",
  "chat.feed.hint.setup":
    "Add a channel (Twitch, Kick, YouTube or experimental Cinefy) and click Connect.",
  // Mesmo termo da LP (protection.chat.kicker).
  "chat.header.kicker": "Everyone in one feed",
  // LP já traduz "2 Twitches" como "two Twitch channels at once".
  "chat.header.subtitle":
    "Twitch, Kick, YouTube and experimental Cinefy in the same feed — up to two Twitch channels.",
  // Mesmo termo da LP (protection.chat.tabs.chat.title).
  "chat.header.title": "Unified chat",
  // "Developer" é o nome da página em kick.com/settings/developer.
  "chat.kick.creds.openDeveloper": "open Developer",
  // A URL é protocolo — não traduzir nem reescrever.
  "chat.kick.creds.redirect":
    "Use the redirect **http://localhost:7395/callback**. The secret only ever goes into Windows Credential Manager.",
  "chat.kick.creds.saved.toast":
    "Saved your Kick credentials in Windows Credential Manager 🔒",
  // "enviar" e "moderar" em <strong> no JSX.
  "chat.login.prompt": "Sign in to your account to **send** and **moderate**",
  "chat.login.prompt.cta": "Set up →",
  "chat.loginrow.browser.note":
    "I opened the authorization page in your browser — just confirm.",
  "chat.loginrow.browser.openAgain": "Open it again",
  "chat.loginrow.device.note":
    "I already copied the code and opened Google's page for you — just paste it and authorize.",
  "chat.loginrow.device.openPage": "Open the page",
  "chat.loginrow.device.step1": "Copy the code",
  "chat.loginrow.device.step2": "Paste it on the page I opened",
  "chat.loginrow.device.step3":
    "Authorize it and that's it — Corneta signs in on its own.",
  "chat.loginrow.device.title":
    "One step to go — authorize it in your browser:",
  "chat.loginrow.device.waitingParens": "(waiting…)",
  // Renderizado como "· logado" quando não há login conhecido.
  "chat.loginrow.signedIn": "signed in",
  // O código concatena " como @" + login; em inglês a frase precisa ser uma só (ver riscos).
  "chat.loginrow.signedInAs": "signed in as @{login}",
  "chat.loginrow.signin": "Sign in",
  "chat.loginrow.signout": "Sign out",
  "chat.loginrow.unavailable": "not available in this build",
  "chat.loginrow.waiting": "waiting…",
  // Nunca "the user" (glossário).
  // title dos botões que aparecem ao passar o mouse na mensagem.
  "chat.mod.action.ban": "Ban",
  "chat.mod.action.delete": "Delete",
  "chat.mod.action.timeout": "Time out 10 min",
  "chat.mod.banned": "Banned them",
  // 1ª pessoa do que o app fez (§3.1), igual ao PT.
  "chat.mod.deleted": "Deleted that message",
  "chat.mod.timeout": "Timed them out",
  // Citado dentro de chat.overlay.reAddNote — os dois precisam bater.
  "chat.overlay.addToObs": "Add to OBS",
  // {tipo} é o título do bloco em minúsculas (alerts/chat) — concatenação frágil, ver riscos.
  "chat.overlay.added.toast": "Added the {block} overlay to OBS",
  "chat.overlay.aria.alertPosition": "Alert overlay position",
  "chat.overlay.aria.alertSize": "Alert overlay size",
  // Label acessível do Toggle.
  "chat.overlay.aria.badges": "Badges",
  "chat.overlay.aria.chatPosition": "Chat overlay position",
  "chat.overlay.aria.fade": "Fade out after",
  // Label acessível do Toggle.
  "chat.overlay.aria.hideCommands": "Hide commands",
  "chat.overlay.aria.maxMessages": "Maximum messages",
  // Título do bloco; é interpolado em minúsculas no toast do OBS (ver riscos).
  "chat.overlay.block.alerts": "Alerts",
  "chat.overlay.block.chat": "Chat",
  "chat.overlay.chatPos.bottom": "Bottom (scrolls up)",
  "chat.overlay.chatPos.top": "Top (scrolls down)",
  "chat.overlay.fetchError":
    "Overlay's on, but I couldn't fetch the URLs — try again.",
  // "Browser Source" é o nome do recurso no OBS — fica em inglês (igual à LP).
  "chat.overlay.lede":
    "A local server that puts your **alerts** and **chat** (emotes and all) into OBS. Add the URL as a **Browser Source** — just once.",
  "chat.overlay.opt.badges": "Badges (mod/sub)",
  // Também é o aria-label do Slider.
  "chat.overlay.opt.duration": "Time on screen",
  "chat.overlay.opt.fade": "Fade out after (0 = never)",
  // Rótulo + label acessível do Toggle.
  "chat.overlay.opt.follows": "Show followers",
  "chat.overlay.opt.fontSize": "Font size",
  "chat.overlay.opt.hideCommands": "Hide commands (!)",
  "chat.overlay.opt.maxMessages": "Max messages",
  // Rótulo + label acessível do Toggle.
  "chat.overlay.opt.platformIcon": "Platform icon",
  "chat.overlay.opt.position": "Position",
  "chat.overlay.opt.size": "Size",
  // Rótulo + label acessível do Toggle.
  "chat.overlay.opt.sound": "Sound when it pops up",
  "chat.overlay.pos.bottom": "Bottom",
  "chat.overlay.pos.bottomLeft": "Bottom left",
  "chat.overlay.pos.bottomRight": "Bottom right",
  "chat.overlay.pos.center": "Center",
  // Só o label é copy; o value ("top") vai na query string do overlay.
  "chat.overlay.pos.top": "Top",
  "chat.overlay.pos.topLeft": "Top left",
  "chat.overlay.pos.topRight": "Top right",
  "chat.overlay.reAddNote":
    "Changed an option? Hit **Add to OBS** again (or update the source URL over there).",
  "chat.overlay.reopenTab": "Overlay's on — reopen this tab to see the URLs.",
  "chat.overlay.scale.lg": "Large",
  "chat.overlay.scale.md": "Medium",
  "chat.overlay.scale.sm": "Small",
  // Rótulo da seção + label acessível do Toggle.
  "chat.overlay.section": "Overlays for OBS",
  "chat.overlay.starting": "Turning the overlay on…",
  "chat.overlay.test.alerts": "Sent a test alert — check OBS 📣",
  "chat.overlay.test.chat": "Sent a test message — check OBS",
  "chat.popout.alertFont": "Alert font",
  "chat.popout.alertsFirst": "Alerts before the chat",
  "chat.popout.bothLayout.arrangement": "Arrangement",
  // Values auto/row/col são enum.
  "chat.popout.bothLayout.auto": "Auto",
  "chat.popout.bothLayout.col": "Stacked",
  "chat.popout.bothLayout.row": "Side by side",
  // Cita o rótulo da aba — tem que bater com chat.popout.tab.both.
  "chat.popout.bothLayout.section": "“Both” layout",
  "chat.popout.chatFont": "Chat font",
  "chat.popout.clear.chat": "Clear chat",
  // title do botão de engrenagem.
  "chat.popout.displaySettings": "Display settings",
  // title funcional do divisor.
  "chat.popout.divider": "Resize chat and alerts",
  "chat.popout.feed.hint.ready": "Click Connect to pull the chat in.",
  "chat.popout.feed.hint.setup":
    "Set up your channels in the main Corneta window, then connect from here.",
  // title do botão Conectar desabilitado.
  "chat.popout.needSetup": "Set up your channels in the main Corneta window",
  "chat.popout.openMain": "Open Corneta",
  "chat.popout.tab.alerts": "Alerts",
  // Concatenação de " {n}" ao rótulo (sem parênteses, diferente da tela principal).
  "chat.popout.tab.alerts.count": "Alerts {n}",
  "chat.popout.tab.both": "Both",
  "chat.popout.tab.chat": "Chat",
  "chat.popout.win.close": "Close",
  "chat.popout.win.maximize": "Maximize",
  // aria-label + title.
  "chat.popout.win.minimize": "Minimize",
  "chat.popout.win.restore": "Restore",
  // Título da titlebar customizada da janelinha.
  "chat.popout.windowTitle": "Corneta chat",
  // No popout é aria-label + title do botão só-ícone.
  "chat.send.button": "Send",
  // Mesma string da LP (protection.chat.input.placeholder).
  "chat.send.placeholder": "Say something",
  // Linha de status do envio, uma por canal, coladas com " · " — cabe pouco.
  "chat.send.status.connect": "{label}: connect chat to sign in",
  "chat.send.status.invalidToken": "{label}: send token isn't valid",
  "chat.send.status.reconnect": "{label}: reconnect chat to sign in",
  // {platform} é nome próprio (YouTube, Kick) — não traduz.
  "chat.send.status.signIn": "{label}: sign in to {platform}",
  "chat.send.status.signedIn": "{platform} signed in",
  // Opção do seletor de destino do envio; o value "all" é identificador.
  "chat.send.target.aria": "Which platform to send to",
  "chat.send.target.all": "All",
  // aria-label funcional.
  "chat.source.collapse": "Collapse channel",
  // aria-label funcional.
  "chat.source.expand": "Expand channel",
  // Assume o limite antes (§3.4). "SEUNOME" é texto de exemplo dentro da URL, traduzido pra YOURNAME.
  "chat.source.hint.kick":
    "The name in the link: kick.com/YOURNAME. Kick sometimes blocks reading the chat and it won't connect.",
  "chat.source.hint.cinefy":
    "The name in the Cinefy link. Experimental and read-only: it relies on undocumented endpoints that may change without notice.",
  "chat.source.hint.twitch":
    "Just the channel name — whatever comes after twitch.tv/.",
  "chat.source.hint.youtube": "Your channel (@handle, URL or ID).",
  "chat.source.nickname": "Nickname",
  // Está num <span> separado do rótulo.
  "chat.source.nickname.optional": "(optional)",
  "chat.source.nickname.placeholder": "e.g. Pitrol",
  // Renderizado como "· {texto}".
  "chat.source.noChannel": "no channel",
  "chat.source.placeholder.kick": "e.g. xqc",
  "chat.source.placeholder.cinefy": "e.g. kett",
  // "pitrol" é um handle real de exemplo — decisão humana se troca.
  "chat.source.placeholder.twitch": "e.g. pitrol",
  "chat.source.placeholder.youtube": "e.g. @yourchannel",
  "chat.source.platformLabel": "Platform",
  "chat.source.remove": "Remove channel",
  // Rótulo acessível do Toggle; aparece no card de canal e no de fonte de alerta.
  "chat.source.toggle": "Turn {name} on or off",
  "chat.source.value.kick": "Name in the link",
  "chat.source.value.cinefy": "Name in the link",
  "chat.source.value.twitch": "Channel",
  "chat.source.value.youtube": "Channel",
  // Reticência de estado de espera (§6 do tom de voz).
  "chat.status.connecting": "connecting…",
  "chat.status.empty": "No channels yet",
  "chat.status.explain.connecting": "connecting…",
  "chat.status.explain.error":
    "dropped — check the channel name; I'm retrying on my own",
  "chat.status.explain.error.kick":
    "dropped — Kick sometimes blocks reading the chat; I'm retrying on my own",
  "chat.status.explain.error.cinefy":
    "dropped — the experimental Cinefy integration didn't answer; I'm retrying on my own",
  "chat.status.explain.error.youtube":
    "dropped — check the channel (@handle or URL); I'm retrying on my own",
  "chat.status.explain.live": "live",
  "chat.status.explain.waiting":
    "waiting for the stream to start — I'll connect on my own the moment it does",
  "chat.status.explain.waiting.youtube":
    "waiting for your YouTube stream to start — I'll connect on my own the moment it does",
  "chat.status.label.connecting": "connecting",
  "chat.status.label.dropped": "dropped",
  // O CAPS vem do CSS (uppercase), não do texto.
  "chat.status.label.live": "live",
  "chat.status.label.waiting": "waiting",
  "chat.status.ready": "All set — just hit Connect",
  "chat.status.ready.auto":
    "All set — click Connect, or just go live and I'll connect on my own",
  // {source} é o rótulo da fonte (nome do canal, não traduzível); {explain} vem de chat.status.explain.*
  "chat.status.tooltip": "{source}: {explain}",
  // {n} é formatado com toLocaleString("pt-BR") — ver riscos.
  "chat.viewers.count": "{n} watching",
  // O código junta esta linha às linhas por canal com \n.
  "chat.viewers.tooltip.hide":
    "Click to hide (turn it back on in the settings)",
  // Uma linha por canal no title; {source} é o rótulo da fonte.
  "chat.viewers.tooltip.row": "{source}: {n}",
  "chat.youtube.apikey.check": "Check",
  "chat.youtube.apikey.checking": "Checking…",
  "chat.youtube.apikey.label": "YouTube API key",
  "chat.youtube.apikey.optional": "· optional (nice to have)",
  // "Data API v3" é o nome do produto do Google.
  "chat.youtube.apikey.placeholder": "paste your API key (Data API v3)",
  "chat.youtube.apikey.tooltip":
    "Corneta reads the chat without it. With it, you also get YouTube's “watching” count.",
  "chat.youtube.creds.guide.hide": "hide the guide",
  "chat.youtube.creds.guide.show": "how do I get these?",
  "chat.youtube.creds.saved.toast":
    "Saved your YouTube credentials in Windows Credential Manager 🔒",
  // "Google Cloud Console" é um <button> que abre a URL — o nome fica igual.
  "chat.youtube.guide.step1":
    "Open the Google Cloud Console and create a project (any name works, say “Corneta”). When you're done, check up top that the new project is the one selected.",
  // Cada **negrito** é um rótulo REAL da tela do Google Cloud — em inglês são os
  // nomes de verdade (APIs & Services, Library, Enable), não tradução do pt.
  "chat.youtube.guide.step2":
    "In the **☰ menu → APIs & Services → Library**, search for **YouTube Data API v3** and click **Enable**.",
  // Rótulos reais do Google em inglês: OAuth consent screen, Audience, Branding, User type, External.
  "chat.youtube.guide.step3":
    "Still under **APIs & Services**, look for **OAuth consent screen** (newer versions call it **Audience** or **Branding**). If it asks for **User type**, pick **External** and move on.",
  // Rótulos reais do Google em inglês.
  "chat.youtube.guide.step4":
    "Fill in the **required fields**: **App name** (whatever you want), **User support email** (your email) and, further down, **Developer contact email** (your email again). Save and continue.",
  // A glosa 'Público-alvo / “Audience”' some em inglês: lá o rótulo já é Audience.
  "chat.youtube.guide.step5":
    "Find the **Test users** section (it's on the **Audience** tab) and **add the email of your YouTube account**. Without that, the sign-in doesn't even work.",
  // Rótulos reais do Google em inglês.
  "chat.youtube.guide.step6":
    "Under **Credentials → Create credentials → OAuth client ID**, pick the type **TVs and Limited Input devices** and create it.",
  "chat.youtube.guide.step7":
    "Copy the **Client ID** and the **Client Secret** and paste them down here. ↓",
  // Está em <strong> separado do resto do parágrafo.
  "chat.youtube.guide.warn.label": "⚠️ Heads up:",
  // "clicar em Entrar" tem que casar com chat.loginrow.signin (Sign in).
  "chat.youtube.guide.warn.text":
    "while your app stays in **“Testing”** mode — the normal thing, without going through Google's verification — the YouTube sign-in **expires every ~7 days**. When it drops, come back here and click **Sign in** again. That's why adding yourself as a **Test user** isn't optional (publishing/verifying the app is, and it's a lot more paperwork).",

  // ---- components ----
  "components.app.censored.body":
    "One of your terms showed up on screen — the stream comes back on its own once it's gone.",
  // Título da faixa vermelha do guardião de privacidade.
  "components.app.censored.title": "BE RIGHT BACK on air",
  // snippet = o trecho vazado detectado pelo guardião, vem entre aspas retas no código. Emoji funcional (§6) — mantido. Primeira pessoa do que o app fez (
  "components.app.leak.toast":
    '🛡️ "{snippet}" showed up on screen — so I cut to BE RIGHT BACK',
  // Região sr-only aria-live que anuncia o estado da transmissão.
  "components.app.live.aria.censored":
    "BE RIGHT BACK is on air — one of your terms showed up on screen",
  // Anúncio de leitor de tela: funcional, não bem-humorado (§6). Ecoa analysis.event.error ("{target} hit an error") pra quem ouve saber QUAL é o estado.
  "components.app.live.aria.error": "The stream hit an error",
  "components.app.live.aria.live": "Live on every platform",
  "components.app.live.aria.live.down.one": "On air, but {count} platform down",
  "components.app.live.aria.live.down.other":
    "On air, but {count} platforms down",
  "components.app.live.aria.connectingTargets":
    "OBS connected; connecting to the platforms",
  "components.app.live.aria.starting": "Waiting for OBS to connect",
  "components.app.live.aria.stopped": "Off air",
  // Tela de boot, enquanto o config não carregou.
  "components.app.loading.boot": "Opening your workbench…",
  "components.app.loading.error":
    "Couldn't read your settings. Try again — if it keeps happening, open the logs and send them my way.",
  // Fallback do Suspense. "Afinar" é de instrumento — "tuning" guarda a metáfora da corneta.
  "components.app.loading.screen": "Tuning this screen…",
  // shortcut = a combinação já com "CommandOrControl" trocado por "Ctrl" (ex.: "Ctrl+Shift+L") — o VALOR não se traduz. "Global hotkey" é o termo já fixad
  "components.app.shortcut.taken":
    "Couldn't turn on your {shortcut} shortcut — another program is already using it. Pick a new one in Settings → Global hotkey.",
  "components.firstLive.dismiss.aria": "Dismiss the guide",
  // title funcional (§6), como o pt: o aria-label ao lado diz "the guide", este diz QUAL guia. A piada antiga ("I've got this") saiu dos dois idiomas.
  "components.firstLive.dismiss.title": "Dismiss the first-stream guide",
  // Rótulo do botão, igual ao que o app mostra na tela.
  "components.firstLive.step.golive": "GO LIVE",
  "components.firstLive.step.key": "Paste one platform's stream key",
  // Diferente de propósito do "Hook up OBS" do tour (components.onboarding.step3.title): o pt também usa dois verbos diferentes ("Liga no OBS" x "Conecte
  "components.firstLive.step.obs": "Connect OBS",
  // O "3" é literal no pt (não vem de steps.length), então mantive literal no en. Se virar dinâmico, marcar {n} nos dois.
  "components.firstLive.title": "Your first stream in 3 steps",
  // No código a frase está QUEBRADA em pedaços de JSX em volta de dois <LegalLink>. Tem que virar uma string só com dois buracos, senão a ordem das palavr
  "components.legal.accept":
    "By continuing, you accept the {terms} and the {privacy}.",
  // Caixa idêntica à da LP (closing.footer.link.privacy) — que é por extenso porque a verificação do Google procura a expressão exata.
  "components.legal.link.privacy": "Privacy policy",
  // Caixa idêntica à da LP (closing.footer.link.terms). É o texto do link dentro de components.legal.accept.
  "components.legal.link.terms": "Terms of use",
  // Texto DENTRO do SVG do passo 2 (ArtKeyVault). O <svg> é aria-hidden, mas o texto é lido com os olhos — precisa virar.
  "components.onboarding.art.key.label": "your key",
  // Texto dentro do SVG do passo 4 (ArtOnAir). Caixa igual à do selo real da live (golive.bar.onAir) — a arte não grita o que a tela não grita (§6).
  "components.onboarding.art.onair.label": "On air",
  "components.onboarding.back": "Back",
  // Cita a tela Sobre e o botão "Rever o tour", ambos da AboutScreen (outra área) — ver riscos.
  "components.onboarding.dismissed.toast":
    "No rush — the tour lives in About → Replay the tour.",
  // aria-label de cada bolinha de paginação; no código é `Passo ${i + 1}`.
  "components.onboarding.dot.aria": "Step {n}",
  // "Terms of use" e "Privacy policy" com a caixa exata da LP (closing.footer.link.terms/privacy).
  "components.onboarding.legalUpdate.body":
    "We updated the Terms of use and the Privacy policy. Take a look at what changed — if you keep using Corneta, you're accepting the new version.",
  "components.onboarding.legalUpdate.cta": "Accept and continue",
  // Aparece 2x no LegalUpdate (prop title do Modal e o <h2> visível) — uma chave só.
  "components.onboarding.legalUpdate.title": "The terms changed",
  "components.onboarding.next": "Next",
  // "tela Plataformas" é o nome da tela (PlatformsScreen), de outra área — ver riscos.
  "components.onboarding.picker.note":
    "You can change this later. TikTok, X and your own RTMP server are on the Platforms screen.",
  "components.onboarding.picker.text":
    "Check the ones you stream on and Corneta gets the platforms ready — then you just paste each stream key.",
  "components.onboarding.picker.title": "Where do you stream?",
  "components.onboarding.skip": "Skip",
  // aria-label do X do canto — funcional, sem piada (§6).
  "components.onboarding.skip.aria": "Skip the tour",
  // Botão do último passo — fecha o tour e cai na tela Plataformas.
  "components.onboarding.start": "Let's get started",
  "components.onboarding.step1.text":
    "You send 1 stream out of OBS and Corneta pushes it out to Twitch, YouTube, Kick and more — all at once.",
  "components.onboarding.step1.title": "One stream, everywhere",
  // Glossário: plataforma→platform, destino→destination, chave de transmissão→stream key.
  "components.onboarding.step2.text":
    "Each platform becomes a destination with its own stream key — you just paste one for each.",
  "components.onboarding.step2.title": "Pick your platforms",
  // Cita duas coisas de OUTRA área: o nome da tela ("Ao vivo") e o rótulo do botão ("Configura pra mim"), ambos da GoLiveScreen. Tem que casar com a tradu
  "components.onboarding.step3.text":
    "On the Live screen, “Set it up for me” sets OBS up for you — no technical menus to dig through.",
  // "Hook up" é o verbo já usado na LP pra ligar o programa de live (content.steps.2.title).
  "components.onboarding.step3.title": "Hook up OBS",
  "components.onboarding.step4.text":
    "One click and you're live on all of them. Keep an eye on each platform's numbers.",
  // O pt é nosso ("Solta a corneta"), então o en guarda a corneta e troca o verbo — assim não repete o "Sound the horn" do título do modal (components.onboarding.title), que fica na tela ao mesmo tempo no passo 4 (§8).
  "components.onboarding.step4.title": "Let the horn rip",
  // "o que travou" → "what choked": é a forma que a LP já usa pro relatório (chrome.meta.description, chrome.og.description).
  "components.onboarding.step5.text":
    "Every chat in one place and, when you wrap up, a report on what choked.",
  "components.onboarding.step5.title": "Chat and reports",
  // n = STEPS.length (hoje 5). Interpolado no código como {STEPS.length}.
  "components.onboarding.subtitle": "{n} steps, from OBS to the report.",
  // Aparece 2x no mesmo componente (prop title do Modal, que vira o Dialog.Title sr-only, e o <h2> visível) — uma chave só pros dois. "Sound the horn" é a
  "components.onboarding.title": "Hey! Ready to sound the horn?",
  "components.telemetry.crashes.body":
    "Sends what broke — the stage, error code and message — with your names, paths and text scrubbed out before it leaves.",
  "components.telemetry.crashes.title": "Send crash reports",
  "components.telemetry.notice.allowed":
    "May be sent: version, screen/stage, outcome, enumerated platform, system categories, and random correlation IDs.",
  "components.telemetry.notice.details":
    "What may be sent — and what never leaves",
  "components.telemetry.notice.error":
    "Couldn't save your choice. Nothing new was sent.",
  "components.telemetry.notice.forbidden":
    "Never included in an event: stream keys, tokens, chat, title/category, OCR, images, audio, video, local paths, hostname, IP as a property, or raw logs.",
  "components.telemetry.notice.none": "Turn both off",
  "components.telemetry.notice.privacy":
    "This is pseudonymized technical data, processed by PostHog for up to 90 days.",
  "components.telemetry.notice.privacyLink": "Read the privacy policy",
  "components.telemetry.notice.save": "Save my choices",
  "components.telemetry.notice.saved": "Saved your choice.",
  "components.telemetry.notice.subtitle":
    "It starts on so I can catch bugs before you do. Turn it off here or later, in Settings.",
  "components.telemetry.notice.title": "I'm already sending technical data",
  "components.telemetry.usage.body":
    "Sends completed stages, version, system categories, and operation outcomes — never stream content.",
  "components.telemetry.usage.title": "Send usage data",
  "components.toaster.dismiss.aria": "Close notice",
  // aria-label da região aria-live dos toasts. Evitei "Alerts" de propósito: "Alertas" já é o nome da feature de follow/sub/bits no app, e o leitor de tel
  "components.toaster.region.aria": "Notices",
  // Estado do botão por 1,4s depois do clique.
  "components.ui.copied": "Copied",
  // Rótulo do botão do CopyField; também é o fallback do aria-label quando não tem `label`.
  "components.ui.copy": "Copy",
  // No código é `Copiar${label ? ` ${label}` : ""}` — concatenação. Ao traduzir, virar duas chaves (esta e components.ui.copy) em vez de montar a string,
  "components.ui.copy.aria": "Copy {label}",
  // Texto do selo, minúsculo no literal (o CAPS vem do CSS). Igual à LP (protection.guard.privacy.switch).
  "components.ui.experimental.label": "experimental",
  // title do ExperimentalBadge. Assume o limite (§3.4).
  "components.ui.experimental.title":
    "Experimental feature — we're still testing it, so it might break or change",
  // aria-label do botãozinho (i) do Hint.
  "components.ui.hint.aria": "Help",
  // Assume o limite antes da pessoa clicar (§3.4): diz o MOTIVO de o botão estar morto.
  "components.update.blocked.live":
    "You're live — installing now would kill the stream.",
  // Estado de espera do botão.
  "components.update.check.busy": "Looking…",
  // Botão da tela Sobre.
  "components.update.check.cta": "Check for a new version",
  "components.update.check.error": "Couldn't check right now: {error}",
  // Aponta pra faixa do UpdateBanner, que fica no topo da janela.
  "components.update.check.found":
    "Corneta {version} is out — the notice is up top.",
  // version = a versão instalada, prop do CheckUpdateButton.
  "components.update.check.none":
    "Nothing new here — you're already on {version}.",
  "components.update.cta": "Update now",
  // title do botão desabilitado — funcional.
  "components.update.cta.blocked.title":
    "Can't restart in the middle of a stream",
  // O TOM-DE-VOZ cita exatamente essa string como o jeito certo de escrever aria-label (§6).
  "components.update.dismiss.aria": "Close the update notice",
  "components.update.dismiss.title":
    "Close the notice — I'll bring it back on the next check",
  // Reticência de estado de espera (§6).
  "components.update.downloading": "Downloading…",
  // pct = inteiro 0–100; o % é literal.
  "components.update.downloading.pct": "Downloading {pct}%",
  // version = info.version (ex.: "1.4.2").
  "components.update.headline": "Corneta {version} is out",
  // error = errMsg(e), texto cru do erro. Formato fixo "Não consegui" → "Couldn't".
  "components.update.install.error": "Couldn't install it: {error}",
  // Primeira pessoa do que o app fez (§3.1) — o TOM-DE-VOZ cita essa frase como exemplo bom.
  "components.update.installed.toast":
    "Installed it — close and reopen Corneta to finish.",
  "components.update.ready": "I'll install it and reopen in a second.",

  // ---- core ----
  // Fallback quando o backend não manda motivo. Renderizado como fragmento depois de um ponto médio na ChatScreen.tsx:2392 ("· erro no login"), por isso m
  "core.auth.login.error.fallback": "couldn't log in",
  // Toast de erro quando a auto-conexão do chat falha ao entrar no ar. "Chat" e "Conectar/Connect" nomeiam a tela e o botão — têm que bater com os rótulos
  "core.chat.autoConnect.failed":
    "Couldn't connect the chat on my own — open the Chat screen and hit Connect.",
  // Nomeia o Windows porque logo ao lado tem o atalho pras configurações de privacidade dele.
  "core.mesa.camera.blocked":
    "Couldn't open your camera and mic — Windows is blocking them. Unblock them in Windows privacy.",
  "core.mesa.camera.busy":
    "Couldn't open your camera — is another app using it? Close it and turn it on again.",
  "core.mesa.camera.failed":
    "Couldn't open your camera — check that no other program is using it.",
  // Vira toast via mesaStore.onError. "host" já é a palavra usada nos dois idiomas pra quem abriu a Mesa.
  "core.mesa.error.badInviteAddress":
    "The invite address isn't valid — ask your host for a new one.",
  // Mensagem de desistência quando a conexão JÁ tinha funcionado antes.
  "core.mesa.error.hostGone": "The Table dropped, or the host left for good.",
  // Formato fixo de erro: "Couldn't" + palpite honesto. Desistência quando nunca chegou a conectar.
  "core.mesa.error.hostUnreachable":
    "Couldn't reach the host — are you two on the same network?",
  "core.mesa.error.joinRefused":
    "The Table turned you away — check the invite or ask the host for a new one.",
  // Corresponde ao código de erro "peer-taken" do relay (o código NÃO se traduz).
  "core.mesa.error.peerTaken":
    "Somebody already took your seat at the Table — hang on a sec and try again.",
  "core.mesa.invite.invalid": "That invite isn't valid. Check the code.",
  "core.mesa.invite.loopback":
    "That invite points at a local address. Ask the host for a new one.",
  // Duas ocorrências idênticas (host() e join()).
  "core.mesa.needsInstalledApp":
    "The Table needs the installed app (it runs a server on your PC).",
  "core.mesa.noLanNetwork":
    "No local network — I can't make an invite anybody can connect to.",
  // "WebSocket" é o nome do recurso na tela do OBS — inalterado.
  "core.mesa.obs.addFailed":
    "Couldn't put the Table into OBS — check that OBS is open with WebSocket turned on.",
  // Emoji funcional (câmera) — mantido.
  "core.mesa.obs.added": "Put the Table into your OBS scene 🎥",
  // Reticências só porque é estado de espera (regra de mecânica do tom de voz).
  "core.mesa.obs.connecting": "Connecting to the Table… try again in a sec.",
  "core.mesa.obs.layoutUpdateFailed":
    "Couldn't update your OBS layout — check that OBS is open.",
  // Primeira pessoa do que o app fez — sem ponto final, igual ao PT.
  "core.mesa.obs.layoutUpdated": "Updated your OBS layout",
  "core.mesa.obs.removeFailed":
    "Couldn't take the Table out of OBS — check that OBS is open.",
  "core.mesa.obs.removed": "Took the Table out of OBS.",
  // Nome de fallback do par que sinalizou antes de anunciar o nome — aparece embaixo do tile de vídeo na sala de controle.
  "core.mesa.peer.unknownName": "guest",
  // Duas ocorrências idênticas (host() e join()).
  "core.mesa.server.startFailed":
    "Couldn't start the Table server — is there another Corneta open? Close it and try again.",
  // Mock: mensagem que acompanha o resub de exemplo.
  "core.mock.alert.resub.message": "thanks for everything!",
  // Mock: mensagem do superchat de exemplo.
  "core.mock.alert.superchat.message": "shout me out!",
  // Mock: campo `tier` do alerta de membro do YouTube. É exibido como texto no card de alerta (diferente de "T1", que é código de tier e não se traduz).
  "core.mock.alert.tier.member": "Member",
  // Mock do navegador — resultado do teste de token da fonte de alerta (ChatScreen.tsx:1876).
  "core.mock.alertToken.ok": "demo: token works",
  // É um `throw new Error(...)` cuja mensagem vira toast em ReframeEditor.tsx:106 (`\`${e}\`.replace("Error: ", "")`) — ou seja, o streamer lê isso na tel
  "core.mock.captureFrame.unavailable":
    "grabbing a frame only works in the installed app, and only while you're live",
  // Mock CHAT_MSGS — linhas do chat de demonstração. Mesmo registro da LP (benefits.chat.demo.line1.message: "yooo just got here").
  "core.mock.chat.msg.1": "yo yo!",
  // Só emoji — fica igual. Listado em intraduzíveis.
  "core.mock.chat.msg.10": "📣📣📣",
  // "cornetar" carrega o nome do produto e morre em inglês — mesma perda que a LP registrou. O 📣 recupera a corneta sem forçar o verbo.
  "core.mock.chat.msg.11": "you called it 📣",
  // Gíria de jogo idêntica nas duas línguas.
  "core.mock.chat.msg.12": "GG",
  "core.mock.chat.msg.13": "anyone else freezing?",
  "core.mock.chat.msg.14": "run it back!",
  // Risada de chat BR → risada de chat gringo. Tradução literal ("hahaha") soaria de legenda, não de chat.
  "core.mock.chat.msg.2": "lmaooo",
  "core.mock.chat.msg.3": "what's the build?",
  "core.mock.chat.msg.4": "first 🎉",
  // Pergunta pro streamer. Não confundir com a msg.13, que pergunta pro resto do chat.
  "core.mock.chat.msg.5": "you lagging over there?",
  // Ecoa a linha da LP ("audio's clean today") — mesma contração, mesmo registro.
  "core.mock.chat.msg.6": "audio's low",
  // "live" (substantivo) → "stream" (glossário).
  "core.mock.chat.msg.7": "great stream!",
  // PRECISA DE OK HUMANO: troquei a referência regional BR por uma dos EUA, do mesmo jeito que a LP trocou os handles. Se a decisão for manter o sabor bra
  "core.mock.chat.msg.8": "shout out to Texas",
  "core.mock.chat.msg.9": "what game is this?",
  // Mock: source e author da mensagem que você mesmo mandou (eco local). Duas ocorrências na mesma chamada. "você" → "you" (glossário).
  "core.mock.chat.self": "you",
  // Mock: rótulo do marcador na sessão de exemplo — aparece na linha do tempo do relatório.
  "core.mock.marker.twitchDropped": "Twitch dropped",
  // Mock do navegador (pnpm dev, fora do Tauri). Vira o resultado do botão "Testar" no card do destino (PlatformsScreen.tsx:374).
  "core.mock.target.test.ok": "demo: reachable",
  // Mock do navegador — resultado do teste da API key do YouTube (ChatScreen.tsx:1776).
  "core.mock.youtubeKey.ok": "demo: key works",
  // Mesmo termo da LP (page-data.destinations.custom.name). Vira o nome padrão do destino quando você adiciona um RTMP fora da lista, então precisa ler be
  "core.platform.custom.name": "Custom RTMP",
  // "destino" → "destination" (glossário).
  "core.platform.custom.note":
    "You type the RTMP or RTMPS address — works for any compatible destination that isn't on the list.",
  "core.platform.facebook.note":
    "Only takes an encrypted connection (RTMPS). The old unprotected way is gone — the URL already filled in here is the right one.",
  // Aqui "serviço" é mesmo um serviço de terceiro (não é o "plataforma" do glossário), então "service" está certo.
  "core.platform.instagram.note":
    "Instagram doesn't officially take a stream from outside — use a service that generates an RTMP URL for your profile, then paste the URL and the stream key here. Still experimental, and it can fail.",
  // "chave" → "stream key" (glossário).
  "core.platform.kick.note":
    "The stream key comes from your Kick creator dashboard. The URL is already filled in with the default server — if your dashboard shows a different one, just swap it here.",
  // Idêntico à LP: page-data.destinations.custom.note.
  "core.platform.tagline.custom": "Any RTMP or RTMPS server",
  // Idêntico à LP: page-data.destinations.facebook.note.
  "core.platform.tagline.facebook": "Go live on a Page or a profile",
  // Idêntico à LP: page-data.destinations.instagram.note.
  "core.platform.tagline.instagram":
    "Vertical video — no official way in, so it can drop",
  // Idêntico à LP: page-data.destinations.kick.note.
  "core.platform.tagline.kick": "Same deal as Twitch",
  // Idêntico à LP: page-data.destinations.tiktok.note.
  "core.platform.tagline.tiktok":
    "Vertical video — your account has to be approved",
  // Idêntico à LP: page-data.destinations.twitch.note.
  "core.platform.tagline.twitch": "Your usual stream",
  // Idêntico à LP: page-data.destinations.x.note.
  "core.platform.tagline.x": "You grab the key in Media Studio",
  // Idêntico à LP: page-data.destinations.youtube.note.
  "core.platform.tagline.youtube": "Handles high quality just fine",
  // "vídeo em pé" → "vertical video", igual à LP (page-data.destinations.tiktok.note).
  "core.platform.tiktok.note":
    "Vertical video (720×1280, the shape of a phone screen). To go live, TikTok has to approve your account — and not everybody can get a stream key on their own.",
  // Aparece embaixo do card do destino e como title do botão no picker (PlatformsScreen.tsx:472 e :800).
  // O PT nomeia as três cidades brasileiras porque é onde o streamer BR está; em
  // inglês isso vira conselho errado (e o nome da cidade sem acento só existe pra
  // escapar do teste). Fica na forma agnóstica de região.
  "core.platform.twitch.note":
    "If you're not a partner, Twitch tops out around 6000 kbps. Its closest server to Brazil is in São Paulo — the closer you are, the fewer hiccups.",
  // "Media Studio" e "Producer" são nomes de tela do X — inalterados.
  "core.platform.x.note":
    "The URL and the stream key come from X's Media Studio (Producer tab) — the link down here takes you there.",
  // A glosa de keyframe entre parênteses é parte da voz (explica o termo técnico na hora) — mantida em inglês.
  "core.platform.youtube.note":
    "Tell OBS to send a keyframe (the frame that restarts the picture) every 2s — 4s at most.",
  // Nome do perfil criado na migração de configs antigas — aparece no seletor de perfis. A MESMA string nasce em src/lib/factory.ts:90 (config nova); trad
  "core.profile.default.name": "Default",
  // rtmp:// e rtmps:// são esquemas literais — não mexer neles dentro da frase.
  "core.target.issue.badUrl": "URL isn't valid — use rtmp:// or rtmps://",
  // "chave" → "stream key" (glossário). Item de lista, minúsculo.
  "core.target.issue.noKey": "no stream key",
  "core.target.issue.noName": "no name",
  // A MESMA string literal aparece de novo em src/screens/PlatformsScreen.tsx:443 (texto do campo de URL vazio). As duas cópias têm que mudar juntas.
  "core.target.issue.noUrl": "no URL set",

  // ---- encoding ----
  "encoding.band.cta.hybridOk": "Switch to Smart — it fits your upload",
  "encoding.band.cta.hybridWarn":
    "Switch to Smart — right at the edge, but it makes it",
  // {link} é o botão inline do guia, não um valor. "Taxa de bits" é o rótulo do OBS em pt; o OBS em inglês chama de "Bitrate" — traduzir pro rótulo real,
  "encoding.band.fix.passthrough":
    "Turn the **Bitrate** down in OBS ({link}) or take a platform off.",
  "encoding.band.fix.passthrough.link": "see the guide →",
  // "ajuste fino" tem que bater com encoding.tuning.title.
  "encoding.band.fix.tuning":
    "Turn the quality down in the {link}, or take a platform off.",
  "encoding.band.fix.tuning.link": "fine-tuning",
  // "engasgar" -> "stutter" (glossário). {bitrate} sai de fmtBitrate e {mbps} é número cru; ambos dentro de <strong> no JSX.
  "encoding.band.over.body":
    "This mode wants **{bitrate}** of upload, but I measured your internet at **{mbps} Mbps**. It's going to stutter mid-stream.",
  // Mesma palavra nos dois idiomas; a LP também usa "total upload".
  "encoding.card.upload.label": "Upload",
  // aria-label do X nos dois modais e o botão de texto no rodapé do wizard. Funcional, sem piada (§6).
  "encoding.close": "Close",
  // Mesma string nos dois arquivos (friendlyEncoder e encoderLabel) — uma chave só. "x264" é nome de produto, fica.
  "encoding.encoder.cpu": "Processor (x264)",
  // {label} vem do Rust (ex.: NVENC, QSV) — nome de produto, não traduzir.
  "encoding.encoder.gpu": "Graphics card ({label})",
  // Estado de espera — mantém a reticência.
  "encoding.encoders.error":
    "Couldn't check what this machine has for re-encoding — try again.",
  "encoding.encoders.loading": "Checking what this machine has…",
  // "hits a lot harder" já é a formulação da LP pra CPU (content.faq.performance.answer).
  "encoding.encoders.noHw":
    "No graphics card here — it runs on the processor, it just hits a lot harder.",
  "encoding.encoders.title": "What converts video on this machine",
  "encoding.encoders.unavailable.sr": "(not available on this machine)",
  "encoding.empty.cta": "Turn a platform on",
  "encoding.empty.title": "No platform is on",
  "encoding.fit.bad": "more than your upload can take",
  // "with room to spare" já é o termo da LP (quality.journey.before.stat.caption).
  "encoding.fit.ok": "fits your upload with room to spare",
  "encoding.fit.warn": "right at the edge of your upload",
  // Badge em primeira pessoa (§3.1) — é o app dizendo o que ele faz com aquele destino.
  "encoding.guide.badge.redo": "I convert it",
  // Fragmento que fecha a linha depois da lista de plataformas em cópia. Sempre plural no pt (a lista tem 1+); em en "they" também serve pra um item só qu
  "encoding.guide.copy.suffix": "— they get **exactly** what comes out of OBS",
  // É o streamer confirmando, não o app: o botão fecha o guia, não o OBS. A versão en confirma o mesmo estado ("deixei o OBS certinho") sem inventar piada.
  "encoding.guide.done": "OBS is all set",
  "encoding.guide.encoder.error":
    "Couldn't check this machine's encoders — try again under Quality.",
  "encoding.guide.encoder.checking": "Checking your graphics card…",
  "encoding.guide.encoder.cpuOnly": "Processor — it's what this machine has",
  // "Guardião" não é nome próprio protegido: a LP já o traduz como "Privacy guard" (protection.guard.privacy.title).
  "encoding.guide.guardian":
    "Privacy guard is on — get the best signal you can out of OBS.",
  "encoding.guide.noPlatforms":
    "(no platform on yet — the numbers below assume 1080p)",
  "encoding.guide.nohw.fps30":
    "No graphics card here, so your PC can struggle at {res}30: if the stream stutters or the game locks up, drop the output to 720p (Video tab), and outside a really fast game nobody notices.",
  // No código a frase é montada com 3 ternários (resolução, fps, conselho). Guardei as duas variantes inteiras; {res} vale "1080p" ou "720p".
  "encoding.guide.nohw.fps60":
    "No graphics card here, so your PC can struggle at {res}60: if the stream stutters or the game locks up, drop the FPS to 30 (Video tab) — that's almost half the load, and outside a really fast game nobody notices.",
  // "uma vez" está em <strong>.
  "encoding.guide.path.lede": "OBS encodes your video **once**. From there:",
  "encoding.guide.path.title": "Where your video goes right now",
  // Rótulo real do OBS em inglês (no modo Simples é "Video Bitrate").
  "encoding.guide.row.bitrate": "Bitrate",
  // {platform} é lcd.capBy — nome do destino, não traduzir.
  "encoding.guide.row.bitrate.noteCopy":
    "above that, {platform} freezes your stream",
  // Tem que rimar com encoding.obs.noCopy na tela de Qualidade.
  "encoding.guide.row.bitrate.noteFree":
    "the better the signal, the better it all looks",
  // Rótulo do OBS, igual nos dois idiomas.
  "encoding.guide.row.encoder": "Encoder",
  // Rótulo real do OBS em inglês.
  "encoding.guide.row.keyframe": "Keyframe Interval",
  // Rótulo real do OBS em inglês.
  "encoding.guide.row.rateControl": "Rate Control",
  "encoding.guide.row.video": "Video (Video tab)",
  "encoding.guide.row.video.note720":
    "your platforms go out at 720p — anything more just hits your PC for nothing",
  "encoding.guide.row.video.noteFullHd":
    "same resolution as what goes out — keeps the picture from going soft",
  // "Saída" está em <strong>. Rótulos reais do menu do OBS em inglês.
  "encoding.guide.setup.title":
    "Set it up like this: OBS → Settings → **Output**",
  // "Simples" está em <strong> e é o rótulo do OBS: em inglês, "Simple" (Output Mode).
  "encoding.guide.simpleMode":
    "In OBS's **Simple** output mode only bitrate and encoder show up — that already does the job. You set these by hand, no way around it.",
  // Aparece duas vezes no mesmo componente: prop title do Modal (vira o nome acessível) e o h3 visível. Uma chave só.
  "encoding.guide.title": "Getting the OBS quality right",
  // "CBR + quadro-chave 2 s" está em <strong> no meio da frase: manter a frase inteira na chave e aplicar a ênfase por marcação.
  "encoding.guide.why.cbr":
    "**CBR + a 2 s keyframe** is what the platforms require — anything else and the stream buffers for whoever's watching.",
  // "Guardião" -> "privacy guard", igual a encoding.guide.guardian e à LP.
  "encoding.guide.why.changed.strong":
    "Changed platforms or turned the privacy guard on?",
  "encoding.guide.why.changed.text":
    "Come back here — the numbers up top follow your setup.",
  // Frase inteira em <strong>; a próxima chave é a frase seguinte, não um pedaço da mesma.
  "encoding.guide.why.onepass.strong": "One pass only.",
  "encoding.guide.why.onepass.text":
    "Converting the video for no reason just throws quality away.",
  // Kicker da SectionTitle. Trocadilho com o nome do produto (corneta = horn); a LP já usa "Sound the horn" pra "Cornetar", então o eco se mantém.
  "encoding.header.kicker": "How good it looks on each platform",
  // "capricho" é substantivo abstrato proibido em en; virou a coisa concreta (a imagem que sai).
  "encoding.header.subtitle":
    "How good the picture goes out — and how much your PC sweats for it.",
  // Bate com hero.nav.quality da LP.
  "encoding.header.title": "Quality",
  "encoding.load.label": "Load on your PC (estimated)",
  "encoding.load.word.easy": "easy",
  "encoding.load.word.heavy": "hits hard",
  // Veredito de uma palavra da LoadBar (load >= 0.95). Cabe em espaço curto.
  "encoding.load.word.max": "maxed out",
  "encoding.load.word.warm": "warms up",
  // Idêntico a quality.mode.esperto.lead da LP.
  "encoding.mode.hybrid.desc":
    "Only touches the platforms that need it. Figures it out on its own.",
  // Idêntico a quality.mode.esperto.tag da LP.
  "encoding.mode.hybrid.tag": "Recommended",
  // Idêntico a quality.mode.esperto.title da LP.
  "encoding.mode.hybrid.title": "Smart",
  // Idêntico a quality.mode.lata.lead da LP.
  "encoding.mode.passthrough.desc":
    "The same picture goes to every platform, at the same settings.",
  // Idêntico a quality.mode.lata.tag da LP.
  "encoding.mode.passthrough.tag": "Lightest",
  // Idêntico a quality.mode.lata.title da LP.
  "encoding.mode.passthrough.title": "Straight up",
  // Idêntico a quality.mode.caprichado.lead da LP.
  "encoding.mode.perPlatform.desc":
    "Best picture each platform can take, but it's the heaviest.",
  // Idêntico a quality.mode.caprichado.tag da LP.
  "encoding.mode.perPlatform.tag": "Max quality",
  // Idêntico a quality.mode.caprichado.title da LP.
  "encoding.mode.perPlatform.title": "All out",
  "encoding.obs.guideLink": "See the full OBS guide →",
  // {platform} é lcd.capBy — nome editável do destino, não traduzir. "em cópia" e o bitrate estão em <strong>.
  "encoding.obs.lcd":
    "Platforms **on copy** need OBS at **~{bitrate}** — that's the most **{platform}** will take.",
  // Tem que rimar com encoding.guide.row.bitrate.noteFree, que diz a mesma coisa no guia.
  "encoding.obs.noCopy":
    "No platform is **on copy** right now: the better the signal out of OBS, the better everything looks.",
  // Caminho de menu do OBS: usar os rótulos reais do OBS em inglês, não tradução livre.
  "encoding.obs.path": "In OBS: Settings → Output → Bitrate. ",
  // No pt a frase é montada com um <>…</> condicional depois do travessão. Guardei as duas variantes inteiras. "recodificação" -> "conversion" (a LP usa "
  "encoding.sessions.over.hybrid":
    "This mode wants **{n} conversions on your graphics card** at the same time, but it should handle about **{max}**. It can fail mid-stream — switch a few platforms back to **Copy** in the fine-tuning.",
  "encoding.sessions.over.other":
    "This mode wants **{n} conversions on your graphics card** at the same time, but it should handle about **{max}**. It can fail mid-stream — switch to **Smart** or take a platform off.",
  // aria-label funcional (§6). {platform} é t.name.
  "encoding.target.bitrate.aria": "{platform} bitrate in kbps",
  // Fecha o editor de número, não o modal.
  "encoding.target.bitrate.close": "close",
  "encoding.target.bitrate.edit": "edit the number",
  // Mensagem de valor inválido; {min}/{max} são MIN_BR/MAX_BR.
  "encoding.target.bitrate.range": "between {min} and {max}",
  "encoding.target.bitrate.useRecommended": "use recommended ({kbps})",
  // Mesma badge nos dois arquivos — uma chave só.
  "encoding.target.copy.badge": "on copy",
  "encoding.target.copy.body":
    "The quality is set in OBS (bitrate, resolution, fps).",
  "encoding.target.copy.headline": "goes out exactly as OBS sends it",
  "encoding.target.copy.resolution": "resolution and fps: whatever OBS sends",
  // "Recodificar" aqui cita o rótulo do botão — tem que bater com encoding.target.override.transcode. Aspas curvas mantidas.
  "encoding.target.copy.verticalWarn":
    "⚠ it'll go out sideways here — switch to “Convert”",
  // aria-label do Select.
  "encoding.target.encoder.aria": "What converts {platform}",
  // Opção do Select. O valor "auto" é enum e não muda.
  "encoding.target.encoder.auto": "Automatic",
  // Tooltip.
  "encoding.target.encoder.hint":
    "The graphics card spares your processor. The processor gives the best picture, but hits your PC harder.",
  "encoding.target.encoder.label": "What converts it",
  // Aparece no texto e no title do mesmo elemento. {encoder} é encoding.encoder.cpu/gpu já resolvido.
  "encoding.target.encoder.uses": "uses {encoder}",
  "encoding.target.override.auto.copy": "Auto (copies)",
  // O pt monta com template string; guardei as duas variantes inteiras pra não concatenar.
  "encoding.target.override.auto.transcode": "Auto (converts)",
  // Idêntico a quality.desk.tag.copy da LP.
  "encoding.target.override.copy": "Copy",
  // Idêntico a quality.desk.tag.convert da LP.
  "encoding.target.override.transcode": "Convert",
  // Entra no {stop} de encoding.target.quality.summary quando o número não bate com nenhuma parada.
  "encoding.target.quality.custom": "custom",
  // Tooltip. "Padrão" tem que bater com encoding.target.stop.standard.
  "encoding.target.quality.hint":
    "A better picture eats more upload. Standard is what the platform recommends.",
  "encoding.target.quality.label": "Picture quality",
  // Linha de status montada com o nome da parada (ou "personalizado"), o bitrate formatado e o botão inline. Só a ordem/separador é copy.
  "encoding.target.quality.summary": "{stop} · {bitrate} · {link}",
  // Botão = verbo. "9:16" é proporção, não traduzir.
  "encoding.target.reframe": "Crop it to 9:16",
  // Parada de qualidade (60% do recomendado). Botão de 11px — palavra curta obrigatória. Alternativa se "Light" colidir com o selo "Lightest" do modo Na l
  "encoding.target.stop.eco": "Light",
  // "Bonitão" é afeto, não medida; "Sharp" é o que o streamer diz de imagem boa e cabe no botão.
  "encoding.target.stop.sharp": "Sharp",
  "encoding.target.stop.standard": "Standard",
  "encoding.tuning.advanced": "(advanced)",
  // "Plataformas" é o nome da outra tela (em <strong>) — tem que bater com o rótulo de navegação traduzido lá.
  "encoding.tuning.noPlatforms":
    "No platform is on. Turn one on in Platforms to tune its quality.",
  // O nome do modo está em <strong>. Espaço final é do layout (o link vem depois).
  "encoding.tuning.passthrough.empty":
    "On **Straight up** there's nothing to tune here — the quality is set in OBS. ",
  "encoding.tuning.passthrough.guideLink": "See the OBS guide →",
  "encoding.tuning.title": "Fine-tuning per platform",
  // Toast de erro no formato fixo "Couldn't … + palpite honesto" (§3.2).
  "encoding.upload.measure.error":
    "Couldn't measure your upload — no internet?",
  "encoding.upload.measureAgain": "measure again",
  "encoding.upload.measureNow": "measure now",
  // No JSX o trecho "~{mbps} Mbps" está dentro de <strong>. Manter a frase inteira na chave e aplicar a ênfase por marcação, não quebrando em pedaços.
  "encoding.upload.measured": "Your internet uploads at **~{mbps} Mbps**. ",
  // Estado de espera — mantém a reticência (§6).
  "encoding.upload.measuring": "measuring…",
  // pt está em voz neutra; en assume a primeira pessoa (§3.1) porque quem mede é o app.
  "encoding.upload.onair": "I'll measure this after the stream.",
  // Primeira pessoa do que o app (não) fez. O espaço final é do layout — a frase seguinte é o botão de medir.
  "encoding.upload.unmeasured": "Haven't measured your internet yet. ",
  // "Auto" aqui é o rótulo do segmented de override, tem que bater com encoding.target.override.auto.*
  "encoding.vertical.cta.auto": "Back to Auto — it converts to vertical",
  // Rótulo de botão = verbo do que vai acontecer (§6).
  "encoding.vertical.cta.hybrid": "Switch to Smart — it fixes this on its own",
  // Variante quando o estrago vem de um override "Copiar" no Esperto/Caprichado, não do modo Na lata.
  "encoding.vertical.warn.copy":
    "On copy, landscape video goes to **{platforms}**, and vertical is the only thing that works there — your stream goes out sideways or doesn't go out at all.",
  // Separador do verticalNames.join(). É copy: a lista é lida. Se um dia virar 3+ itens, en pede vírgula serial ("A, B and C") — hoje o join é burro nos d
  "encoding.vertical.warn.join": " and ",
  // O pt concatena prefixo por modo + "m" de plural ("aceita{m}"). Em en a frase foi reescrita pra não depender de concordância de número: serve pra 1 ou
  "encoding.vertical.warn.passthrough":
    "On Straight up, landscape video goes to **{platforms}**, and vertical is the only thing that works there — your stream goes out sideways or doesn't go out at all.",
  "encoding.wizard.cta.connect": "Connect and set it up",
  // Estado de espera — reticência.
  "encoding.wizard.cta.connecting": "Connecting…",
  "encoding.wizard.cta.done": "Close the guide",
  "encoding.wizard.cta.retry": "Try again",
  "encoding.wizard.error.auth.tip1":
    "Grab the right password in OBS: Tools → WebSocket Server Settings → Show Connect Info.",
  "encoding.wizard.error.auth.tip2":
    "Paste it into step 2 up there and try again.",
  // Aspas curvas mantidas.
  "encoding.wizard.error.auth.tip3":
    "If “Enable Authentication” is unchecked in OBS, there's no password — leave the field empty.",
  "encoding.wizard.error.auth.title": "That WebSocket password didn't match.",
  // <summary> de um <details>.
  "encoding.wizard.error.details": "Show the technical detail",
  "encoding.wizard.error.generic.tip1":
    "Check that OBS is open with the WebSocket on (Tools → WebSocket Server Settings).",
  "encoding.wizard.error.generic.tip2":
    "No worries — you can set it up by hand right below.",
  "encoding.wizard.error.generic.title": "Couldn't set OBS up on my own.",
  "encoding.wizard.error.notfound.tip1": "Is OBS open there on your PC?",
  "encoding.wizard.error.notfound.tip2":
    "Is the WebSocket on? Tools → WebSocket Server Settings → Enable WebSocket server.",
  "encoding.wizard.error.notfound.tip3": "Is the port still the default, 4455?",
  "encoding.wizard.error.notfound.tip4":
    "A firewall might be blocking the connection — let OBS through for me.",
  // Formato fixo de erro (§3.2): "Couldn't …".
  "encoding.wizard.error.notfound.title": "Couldn't find OBS to connect to.",
  // Glossário: chave -> stream key. Também é o rótulo "Stream Key" do OBS.
  "encoding.wizard.manual.key": "Stream key",
  // O caminho de menu está em <strong>. "Personalizado" é a opção "Custom…" do OBS em inglês.
  "encoding.wizard.manual.lede":
    "Doing it by hand is quick too. In OBS: **Settings → Stream → Service “Custom”**, and paste these two fields:",
  // Promessa mais modesta que a do passo 3 de propósito (o WebSocket pode não estar de pé) — manter a diferença em en.
  "encoding.wizard.manual.note.autostart":
    "With that pasted in, when you hit **GO LIVE** I'll try to hit play in OBS for you — if nothing happens, hit **Start Streaming** there yourself.",
  // Não repete mais o fim do encoding.wizard.step3.body.manual, que aparece no mesmo modal uns 200px acima: aqui a frase fecha com o estado, não com a instrução repetida.
  "encoding.wizard.manual.note.manual":
    "Pasted both into OBS? Then it's pointing at Corneta — no WebSocket in the middle.",
  // Rótulo do CopyField; bate com o campo "Server" do OBS.
  "encoding.wizard.manual.server": "Server",
  "encoding.wizard.manual.toggle": "I'd rather set it up by hand",
  "encoding.wizard.ok.autostart":
    "Connected! OBS is pointing at Corneta now. When you hit **GO LIVE**, I'll tell OBS to start streaming on its own.",
  "encoding.wizard.ok.manual":
    "Connected! OBS is pointing at Corneta now. When it's stream time, just click **Start Streaming** in OBS.",
  // Os dois caminhos de menu estão em <strong>. São rótulos do OBS: usar os do OBS em inglês, não tradução livre do pt.
  "encoding.wizard.step1.body":
    "In OBS: **Tools → WebSocket Server Settings**, and check **Enable WebSocket server** (the port already comes as 4455, leave it).",
  "encoding.wizard.step1.title": "Turn on the WebSocket in OBS",
  // "Mostrar Chave de Conexão" é o botão "Show Connect Info" do OBS em inglês — não é "stream key".
  "encoding.wizard.step2.body":
    "If **Enable Authentication** is checked, click **Show Connect Info**, copy it and paste it here. No password? Leave it empty.",
  "encoding.wizard.step2.placeholder": "WebSocket password",
  "encoding.wizard.step2.title": "Password (if there is one)",
  "encoding.wizard.step3.body.autostart":
    "I connect and set OBS to point over here. When you hit **GO LIVE**, I hit play in OBS myself.",
  // "Iniciar transmissão" é o botão "Start Streaming" do OBS.
  "encoding.wizard.step3.body.manual":
    "I connect and set OBS to point over here. Then, when it's stream time, just hit **Start Streaming** in OBS.",
  "encoding.wizard.step3.title": "Connect",
  // A LP já diz "Corneta sets it up for you" (content.faq.streamlabs_xsplit.answer).
  "encoding.wizard.subtitle": "Corneta sets OBS up for you.",
  // Duas ocorrências: prop title do Modal (nome acessível) e o h2 visível. Uma chave só.
  "encoding.wizard.title": "Connect to OBS",

  // ---- golive ----
  "golive.band.atEdge": "cutting it close — give it some room",
  "golive.band.test": "Measure now",
  // title do botão — funcional (§6). Só aparece com a live SUBINDO: o card
  // inteiro some quando ela entra no ar (GoLiveScreen.tsx:431), então não pode
  // prometer medição "depois que subir" — a essa altura o botão nem existe.
  "golive.band.test.disabledTitle":
    "Your stream is coming up — measuring now would steal bandwidth from it",
  "golive.band.testing": "Testing…",
  "golive.band.title": "Upload bandwidth",
  "golive.band.tooTight": "won't keep up — adjust the quality",
  "golive.bar.dismiss.aria": "Dismiss this warning",
  // Plural montado no código com +'s'; serve igual em EN.
  "golive.bar.down": "{n} platform(s) down",
  // aria-label funcional (§6).
  "golive.bar.error.aria": "Open the live panel — the stream went down",
  "golive.bar.error.hint": "click here to see what happened and try again",
  "golive.bar.error.title": "The stream went down",
  "golive.bar.onAir": "on air",
  "golive.bar.open.aria": "Open the live panel",
  // Aparece 2x (faixa de erro e faixa ao vivo).
  "golive.bar.panel": "Panel",
  "golive.bar.protection.bitrate": "Auto-bitrate",
  "golive.bar.protection.brb": "BE RIGHT BACK",
  // Tem que bater com golive.security.guardian.label.
  "golive.bar.protection.guardian": "Privacy guard",
  "golive.bar.connectingTargets":
    "OBS connected · connecting to the platforms…",
  "golive.bar.waitingObs": "Waiting for OBS…",
  "golive.bar.watching": "watching",
  // {problemas} vem de blockingIssues() em validation.ts (outra área) — os itens da lista precisam ser traduzidos lá, senão essa frase sai metade em PT.
  "golive.block.fixTarget":
    "Fix {nome}: {problemas} — paste the stream key or turn that platform off.",
  // 'Plataformas' no fim é o nome da tela na Sidebar — tem que bater com a tradução de lá.
  "golive.block.noPlatform": "Turn on at least one platform under Platforms.",
  "golive.brb.armHint":
    "Want a one-click break? Arm {jaVolto} in Settings for your next stream.",
  "golive.brb.back": "I'm back!",
  "golive.brb.now": "BE RIGHT BACK now",
  // title do botão. 'aviso' → 'slate', termo já usado na LP (protection.brb.note).
  "golive.brb.title.back":
    "Takes BE RIGHT BACK off air and brings your content back",
  "golive.brb.title.on":
    "Puts the “BE RIGHT BACK” screen on air (with your mic muted)",
  "golive.brb.toast.back": "You're back! Your content's on air again",
  "golive.brb.toast.on":
    "BE RIGHT BACK is on air — go ahead, your mic is muted",
  // Aparece 2x (pré-voo e rodapé de 'starting').
  "golive.cancel": "Cancel",
  // Detalhe da linha do encoder; mesma string do badge do OBS.
  "golive.checkup.checking": "checking…",
  "golive.checkup.encoder": "Encoder available",
  "golive.checkup.keys": "Keys and URLs",
  "golive.checkup.keys.none": "no platforms turned on",
  "golive.checkup.obsConnected": "OBS connected",
  // 'Ferramentas → Configurações do Servidor WebSocket' é menu do OBS (rótulo real em inglês). O segundo 'Configurações' é a tela da Corneta.
  "golive.checkup.obsConnected.fix":
    "turn it on under Tools → WebSocket Server Settings (and the password goes in Corneta's Settings, if you set one)",
  "golive.checkup.obsPointing": "OBS pointing at Corneta",
  "golive.checkup.obsPointing.fix":
    "point OBS here with the button next to this",
  "golive.checkup.state.bad": "problem",
  "golive.checkup.state.ok": "done",
  "golive.checkup.state.warn": "missing",
  // 'travar' → 'stutter' (glossário: engasgo → stutter). 'Simples'/'Avançado' são os modos do OBS ('Simple'/'Advanced').
  "golive.checkup.tip":
    "In OBS, under {caminho}: Simple mode is already right — relax. In Advanced mode, check {taxa} and {keyframe} — that's what the platforms ask for so it doesn't stutter.",
  "golive.checkup.tip.guide": "See the full guide →",
  // Campo do OBS.
  "golive.checkup.tip.keyframe": "Keyframe Interval: 2 s",
  // Menu do OBS.
  "golive.checkup.tip.path": "Settings → Output",
  // Campo do OBS.
  "golive.checkup.tip.rateControl": "Rate Control: CBR",
  "golive.checkup.title": "Pre-stream checkup",
  "golive.checkup.upload": "Upload",
  // O código formata {necessario} com vírgula decimal (.replace('.', ',')) — em EN tem que voltar a ser ponto. Ver riscos.
  "golive.checkup.upload.detail": "{atual} / {necessario} Mbps",
  // Escrevi a frase inteira em vez do sufixo ' · no limite' pra não concatenar pedaço.
  "golive.checkup.upload.detail.tight":
    "{atual} / {necessario} Mbps · cutting it close",
  // 'Banda de upload' é o card logo acima — tem que bater com golive.band.title.
  "golive.checkup.upload.untested": "run the test in Upload bandwidth above",
  // Rótulo do botão, igual ao que o app mostra na tela.
  "golive.cta": "GO LIVE",
  // aria-label é funcional (§6): diz o que o botão faz, sem o nome próprio.
  "golive.cta.aria": "Go live",
  // {motivo} é golive.block.noPlatform ou golive.block.fixTarget.
  "golive.cta.aria.blocked": "Go live (blocked: {motivo})",
  // {plataformas} é o nome da tela em <strong> ('Plataformas' → 'Platforms').
  "golive.empty.noPlatforms":
    "No platforms turned on. Head to {plataformas}, switch at least one on and paste its key.",
  // Fallback quando snapshot.message vem vazio; a mensagem real vem do backend.
  "golive.error.body": "The stream stopped. Check the logs or try again.",
  "golive.error.errorId": "Error ID",
  // Abre a pasta de logs.
  "golive.error.logs": "See the logs",
  "golive.error.operationId": "Operation ID",
  "golive.error.retry": "Try again",
  "golive.error.title": "Couldn't get your stream on air",
  // Kicker da tela. 'Bora cornetar' é nosso e carrega a corneta (instrumento e marca); 'Sound the horn' é a forma que a LP já usa em inglês e atravessa com o mesmo fato.
  "golive.header.kicker": "Sound the horn",
  "golive.header.subtitle":
    "Hook OBS up once, see if your internet can take it, and go live everywhere in one shot.",
  // Nome da tela; tem que bater com o item da Sidebar (outra área).
  "golive.header.title": "Live",
  // Rótulo da faixa de CPU/GPU (o CAPS vem do CSS).
  "golive.machine.label": "Your machine",
  "golive.marker.button": "Mark this moment",
  // title do botão.
  "golive.marker.title": "Drop a marker into the report",
  // {status} é um dos golive.obs.status.*
  "golive.obs.badge": "OBS: {status}",
  // Aparece 3x (sinal perdido, resgate, check-up).
  "golive.obs.check": "Check OBS",
  "golive.obs.field.key": "Stream key",
  // Rótulo do CopyField; casa com o campo 'Server' do OBS.
  "golive.obs.field.server": "Server",
  // Aparece 5x (card de erro, bancada do OBS, sinal perdido, resgate, pré-voo) — mesma string.
  "golive.obs.fixForMe": "Set it up for me",
  // {caminho} é o trecho em <strong> — virou placeholder pra a ordem das palavras poder mudar.
  "golive.obs.hint": "In OBS: {caminho} and paste the two fields below.",
  // Caminho de menu do OBS — usar os rótulos da interface do OBS em inglês, não tradução livre.
  "golive.obs.hint.path": "Settings → Stream → Service “Custom”",
  "golive.obs.key.note":
    "This key is just between OBS and Corneta — it's not from any platform.",
  "golive.obs.qualityGuide": "What's the best quality for OBS? Quick guide →",
  "golive.obs.section.title": "Hook up OBS",
  // Nome do botão DENTRO do OBS — usar o rótulo real da interface do OBS em inglês. Aparece 3x (resgate e as duas legendas do rodapé).
  "golive.obs.startStreamingButton": "Start Streaming",
  "golive.obs.status.checking": "checking…",
  "golive.obs.status.missing": "not set up",
  "golive.obs.status.notPointing": "not pointing here yet",
  "golive.obs.status.ok": "set up",
  "golive.onlyWhenLive": "Available once you're live",
  "golive.preflight.body":
    "You can go live anyway — the stream only starts when OBS sends the video.",
  "golive.preflight.goAnyway": "Go anyway",
  "golive.preflight.title": "OBS isn't pointing here yet",
  "golive.problems.pasteKey": "Paste the key →",
  "golive.problems.title": "Fix this before you start:",
  "golive.problems.turnOff": "Turn this platform off",
  // Os dois lados falam em primeira pessoa do que o app fez (§3.1): 'Desliguei {nome}' / 'Turned {nome} off'.
  "golive.problems.turnedOff.toast":
    "Turned {nome} off — switch it back on under Platforms.",
  "golive.rescue.authFailed":
    "Found OBS, but the WebSocket password didn't match — check it under Settings → OBS.",
  "golive.rescue.body": "Is it open? Did you hit {botao}?",
  "golive.rescue.notPointing": "Found OBS, but it's not pointing at Corneta.",
  "golive.rescue.notReachable":
    "Couldn't find OBS around here — looks like it's closed, or the WebSocket is off.",
  "golive.rescue.title": "OBS hasn't connected yet",
  // Leva pra Configurações → Segurança ao vivo.
  "golive.security.adjust": "Adjust",
  "golive.security.armed": "Armed",
  "golive.security.bitrate.desc":
    "if your internet chokes, I drop the quality before the stream freezes",
  "golive.security.bitrate.desc.off":
    "if your internet chokes, the stream freezes instead of just losing some quality",
  // Mesmo termo da LP.
  "golive.security.bitrate.label": "Auto-bitrate",
  "golive.security.brb.desc":
    "if OBS drops, I cut to BE RIGHT BACK and the stream doesn't even blink",
  "golive.security.brb.desc.off":
    "if OBS drops, everyone's staring at a frozen frame",
  "golive.security.brb.label": "BE RIGHT BACK",
  "golive.security.guardian.desc.off":
    "if a word that can't leak shows up on screen, it goes on air",
  // Termo já fixado na LP (protection.guard.privacy.title). A imagem do 'guardião' (pessoa) se perde, mas divergir da LP seria pior.
  "golive.security.guardian.label": "Privacy guard",
  "golive.security.guardian.noTerms":
    "on, but nothing to watch yet — add a word",
  // Plural montado no código com +'s'; funciona igual em EN. 'termo' → 'word' porque a LP fala 'the words that can't leak'.
  "golive.security.guardian.watching":
    "watching {n} word(s) — if one shows up, I cut to BE RIGHT BACK",
  "golive.security.loudness.desc": "I level your volume on my own",
  // Mesmo termo da LP (protection.guard.audio.title).
  "golive.security.loudness.label": "Audio normalizer",
  // Já está em inglês no PT; fica igual.
  "golive.security.off": "Off",
  // Mesma imagem dos dois lados: 'Suas redes de segurança' / 'Your safety nets', o termo já fixado na LP (protection.kicker).
  "golive.security.title": "Your safety nets",
  // 'eu retomo sozinha' — primeira pessoa do app; mantida em EN ('I pick it up').
  "golive.signalLost.body":
    "Your viewers are staring at a frozen screen. Check OBS (did it close? did it stop streaming?) — when the signal comes back, I'll pick it up on my own.",
  // Sem CAPS: a urgência vem do card vermelho e do negrito, não da caixa alta (§6).
  "golive.signalLost.title":
    "Lost the signal from OBS — your stream has no picture",
  "golive.starting.autoObs":
    "I told OBS to start streaming — if this screen doesn't change, hit {botao} over there.",
  "golive.starting.manualObs":
    "In OBS, click {botao} — Corneta goes live on its own.",
  "golive.starting.connectingTargets": "OBS connected — opening the platforms…",
  // É status, não botão.
  "golive.starting.waiting": "Waiting for OBS to connect…",
  "golive.stat.bitrate": "Bitrate",
  // Quedas de quadro (dropped frames); rótulo curto.
  "golive.stat.drops": "Drops",
  "golive.stat.fps": "FPS",
  // Rótulo do tempo no ar por destino — não confundir com o StatePill 'No ar' (estado), que vira 'Live'.
  "golive.stat.uptime": "On air",
  "golive.state.brb": "BE RIGHT BACK on air",
  // Estado em que o Guardião cortou o vídeo.
  "golive.state.censor": "BE RIGHT BACK (Privacy guard)",
  "golive.state.connecting": "Connecting",
  "golive.state.error": "Error",
  "golive.state.idle": "Waiting",
  // Estado do destino — a LP já usa 'live'/'reconnecting' nos mesmos pills (benefits.routes.demo.*).
  "golive.state.live": "Live",
  "golive.state.paused": "Paused",
  "golive.state.reconnecting": "Reconnecting",
  // O StatePill já aplica uppercase no CSS — a string fica em caixa normal, como os outros estados.
  "golive.state.signalLost": "No signal from OBS",
  "golive.state.waiting": "Waiting for signal",
  "golive.stop": "Cut the stream",
  "golive.stop.confirm": "Cut for real? (click again)",
  // O PT do código monta o plural com `${okN > 1 ? 's' : ''}`. Em EN o app fala em primeira pessoa ('Updated'), não passiva. O plural em EN também é só +s
  "golive.streamInfo.applied": "Updated your title on {n} platform(s)",
  "golive.streamInfo.apply": "Send it to the platforms",
  "golive.streamInfo.game.placeholder": "Game / category (optional)",
  "golive.streamInfo.needTitle": "Type a title first",
  "golive.streamInfo.partial": "{ok}/{total} ok — check the details",
  "golive.streamInfo.signIn": "Sign in →",
  "golive.streamInfo.teaser":
    "Sign in and set the title (and the game) for every platform right here — no Studio, no dashboard.",
  // 'live' (substantivo BR) → 'stream', conforme glossário.
  "golive.streamInfo.title": "Stream title",
  "golive.streamInfo.title.placeholder": "Stream title (goes to all of them)",
  // Começa com espaço no código (colado no rótulo anterior); mantive.
  "golive.streamInfo.youtubeAuto.desc":
    " — Corneta creates the broadcast when you hit GO LIVE, so you never open YouTube Studio.",
  // Mesmo termo da LP (page-data.tiny.youtube.title).
  "golive.streamInfo.youtubeAuto.title": "YouTube on autopilot",
  // {titulo} é a palavra em <strong> ('título' → 'title').
  "golive.streamInfo.youtubeNote":
    "On YouTube you can only change the {titulo} (not the game).",
  // Aparece 2x: no blockReason e na lista 'Resolva antes de iniciar'.
  "golive.target.noName": "(no name)",
  // aria-label funcional (§6). {nome} é o nome do destino, dado pelo streamer.
  "golive.target.openChannel.aria": "Open your {nome} channel",
  "golive.target.openChannel.title": "Open your channel on the platform",
  "golive.target.pause": "Pause",
  "golive.target.pause.title": "Pause this platform",
  "golive.target.resume": "Resume",
  "golive.target.resume.title": "Resume this platform",
  // Link de retry de um destino em erro (sem cortar a live).
  "golive.target.retry": "Try again",
  "golive.target.swapKey": "Swap the key →",
  "golive.timer.onAir": "on air",
  "golive.timer.connectingTargets": "OBS connected · opening the platforms…",
  "golive.timer.waiting": "No video from OBS yet…",
  "golive.toast.canceled": "Canceled — you never went on air.",
  // 'A corneta' é o instrumento e o nome do produto ao mesmo tempo; em inglês só sobra o instrumento.
  "golive.toast.live": "You're live! The horn's blowing 📣",
  "golive.toast.markerSaved":
    "Dropped a marker 📍 — it'll show up in the report",
  "golive.toast.obsPlay": "Told OBS to start streaming — going live…",
  "golive.toast.obsPlayFailed":
    "Couldn't hit play in OBS — go hit Start Streaming over there.",
  // Rótulo do botão do toast.
  "golive.toast.obsPlayFailed.action": "Set up OBS",
  "golive.toast.serverUp": "Server's up! Now just hit play in OBS",
  // {erro} é a mensagem do backend (Rust) — cai fora desta área. Os dois lados usam o formato fixo de erro (§3.2).
  "golive.toast.startFailed": "Couldn't go live: {erro}",
  "golive.toast.stopped": "Cut! You're off the air 👋",
  // Rótulo do botão do toast; leva pra tela Relatórios.
  "golive.toast.stopped.action": "See the report",
  // Formato fixo de erro (§3.2): 'Couldn't …' + palpite honesto.
  "golive.toast.uploadTestFailed":
    "Couldn't measure your upload — no internet?",
  "golive.viewers.label": "watching",

  // ---- platforms ----
  "platforms.about.blog.sub": "My blog and my projects.",
  // {heart} é o ícone <Heart> no meio da frase — hoje o JSX quebra o texto em dois pedaços; virou placeholder pra ordem das palavras poder mudar.
  "platforms.about.footer.made":
    "Corneta is free and open source. Made with {heart} and code.",
  // Aqui quem fala é o Petro, não o app — primeira pessoa mesmo. "live" (substantivo) → "stream"/"goes live", conforme glossário.
  "platforms.about.hero.body":
    "I built Corneta to kill a headache of my own: one stream out of OBS goes live on Twitch, YouTube, Kick and the rest all at once — free.",
  "platforms.about.hero.title": "Hi, I'm Petro",
  "platforms.about.kicker": "Who's behind the horn",
  // Mesma forma da LP (closing.footer.link.privacy) — o Google procura exatamente "Privacy policy".
  "platforms.about.legal.privacy": "Privacy policy",
  // Mesma forma da LP (closing.footer.link.terms).
  "platforms.about.legal.terms": "Terms of use",
  "platforms.about.replayTour": "Replay the welcome tour",
  // Legenda do botão corneta.live (o domínio em si não traduz).
  "platforms.about.site.sub": "Official site, FAQ and download.",
  "platforms.about.title": "About",
  // A LP em inglês grafa "multistream" sem hífen — alinhei. {version} vem de getVersion()/__APP_VERSION__.
  "platforms.about.version": "Corneta v{version} · multistream",
  // Botão compacto no cabeçalho, ao lado do título "Plataformas".
  "platforms.add": "Add",
  // No PT o código monta com CHAT_BRIDGE_LABEL ("da Twitch" / "do YouTube" / "da Kick") — fragmentos que só existem por causa da preposição+gênero. Em ing
  "platforms.chatBridge.ask": "Want {platform} chat here in Corneta too?",
  // Ação do toast que leva pra tela de Chat.
  "platforms.chatBridge.cta": "Set it up",
  "platforms.empty.body":
    "Your horn isn't pointed anywhere yet. Want to add the first platform?",
  "platforms.empty.cta": "Add platform",
  "platforms.empty.title": "So, no platforms yet?",
  "platforms.key.cancelEdit": "Cancel changing the key",
  "platforms.key.change": "Change",
  // aria-label + title do olhinho.
  "platforms.key.hide": "Hide the stream key",
  "platforms.key.pasteSave": "Paste and save",
  "platforms.key.pasteSaveTitle":
    "Pastes from your clipboard and puts it straight into Windows Credential Manager",
  "platforms.key.pastedUrlOnly":
    "That's the server address, not the key — paste the stream key sitting right next to it in the dashboard 🔑",
  // O PT glosa "stream key" porque o termo é emprestado; em inglês a glosa some.
  "platforms.key.placeholder": "Paste the stream key the platform gave you",
  // Botão de remover a chave (contexto diferente do platforms.target.remove).
  "platforms.key.remove": "Remove",
  "platforms.key.removeConfirm": "Remove it for real?",
  // Formato fixo de erro: "Couldn't …". {err} é a mensagem crua do backend.
  "platforms.key.removeFailed": "Couldn't remove the stream key — {err}",
  // PT está em particípio; em inglês vai pra primeira pessoa do que o app fez (§3.1), sem voz passiva.
  "platforms.key.removed": "Removed your stream key",
  "platforms.key.save": "Save",
  "platforms.key.saveFailed": "Couldn't save the stream key — {err}",
  // Glossário fixa cofre → Windows Credential Manager, então a linha fica bem mais longa que o PT — conferir se cabe no layout.
  "platforms.key.saved": "Stream key in Windows Credential Manager",
  "platforms.key.savedToast":
    "Saved your stream key in Windows Credential Manager 🔒",
  "platforms.key.show": "Show the stream key",
  "platforms.key.strippedUrl":
    "That looked like the whole URL — I kept just the stream key 👍",
  // Texto dentro do SVG do ingresso. O "MESA1" logo abaixo NÃO traduz — é o prefixo do código.
  "platforms.mesa.art.invite": "Invite",
  // Texto dentro do SVG da ilustração "Criar uma Mesa".
  "platforms.mesa.art.you": "You",
  "platforms.mesa.cam.off": "No video",
  // Botão de câmera ligada.
  "platforms.mesa.cam.on": "Camera",
  "platforms.mesa.camOn": "Turned your camera on",
  // Aparece 3x: rótulo do Select, aria-label do Select e fallback quando o dispositivo não tem label.
  "platforms.mesa.cameraLabel": "Camera",
  // CONN_LABEL: value dos estados "new" e "connecting" (as chaves são ids do WebRTC, não traduzir).
  "platforms.mesa.conn.connecting": "connecting…",
  // CONN_LABEL de "disconnected" e "failed".
  "platforms.mesa.conn.dropped": "dropped",
  // CONN_LABEL["closed"].
  "platforms.mesa.conn.left": "left",
  // CONN_LABEL["connected"].
  "platforms.mesa.conn.live": "live",
  "platforms.mesa.demoNotice":
    "Demo mode — the real Table only runs in the installed app. Here you can test your camera and click around.",
  // Label da opção; o value "default" é id, não traduz.
  "platforms.mesa.deviceDefault": "Default",
  "platforms.mesa.full.body":
    "With straight P2P every camera goes out to everybody — the connection count blows up, and past ~5 your upload is pinned. A server mode (SFU) for big Tables is on the way.",
  "platforms.mesa.full.title": "A full Table eats your upload",
  "platforms.mesa.full.uploadLabel": "your upload",
  "platforms.mesa.full.uploadValue": "maxed out",
  "platforms.mesa.grid.count": "At the Table ({n})",
  // {name} cai em platforms.mesa.you quando o campo está vazio.
  "platforms.mesa.grid.self": "{name} (you)",
  // Fallback do rótulo do tile de quem entrou sem nome (minúsculo, como no código).
  "platforms.mesa.guest": "guest",
  // Nome padrão de quem entra sem preencher o campo.
  "platforms.mesa.guestDefaultName": "Guest",
  // aria-label do Toggle.
  "platforms.mesa.hideSelfAria": "Hide my camera in the grid",
  // Texto visível ao lado do Toggle — mesma frase em minúscula; se o i18n unificar, cuidar do caixa.
  "platforms.mesa.hideSelfLabel": "hide my camera in the grid",
  // No JSX a palavra "convite" está dentro de <b>; a chave precisa de rich text (ou marcação inline) pra manter o negrito.
  "platforms.mesa.host.body":
    "You're the host. Corneta makes you an invite — send it to your crew, they come in, and their cameras land straight on your machine.",
  "platforms.mesa.host.cta": "Open the Table",
  "platforms.mesa.host.title": "Create a Table",
  // Nome padrão de quem abre a Mesa sem preencher o campo — aparece pros outros na grade. Igual nas duas línguas.
  "platforms.mesa.hostDefaultName": "Host",
  // §8: a promessa de relay ficou só no card de entrar; aqui a frase diz a condição, não o futuro.
  "platforms.mesa.invite.body":
    "Send this code to your crew so they can come in. On the same network it connects right away; over the internet, only if your PC can be reached from outside.",
  // Aparece 2x: rótulo do campo no lobby e label do CopyField na Mesa ativa.
  "platforms.mesa.invite.label": "Invite",
  "platforms.mesa.invite.title": "Your Table invite",
  "platforms.mesa.join.body":
    "Got an invite? Paste it here to join another streamer's Table.",
  "platforms.mesa.join.cta": "Join",
  // §3.4: assume o limite antes de a pessoa descobrir sozinha.
  "platforms.mesa.join.note":
    "For now it works on the same network (or with the host reachable over the internet) — a relay is on the way.",
  "platforms.mesa.join.title": "Join a Table",
  "platforms.mesa.kicker": "Table · co-stream",
  // Aparece 2x (card de erro e botão do rodapé).
  "platforms.mesa.leave": "Leave the Table",
  "platforms.mesa.mic.off": "Muted",
  "platforms.mesa.mic.on": "Mic",
  // Mesmo caso: rótulo, aria-label e fallback do dispositivo.
  "platforms.mesa.micLabel": "Microphone",
  // Sub-rótulo do tile quando o mic está fechado.
  "platforms.mesa.muted": "muted",
  "platforms.mesa.nameLabel": "Your name at the Table",
  // "Pitrol" é o handle do autor usado como exemplo — mantido.
  "platforms.mesa.namePlaceholder": "e.g. Pitrol",
  "platforms.mesa.obs.add": "Add to OBS",
  // "Browser Source" é nome do recurso do OBS — fica em inglês nas duas línguas.
  "platforms.mesa.obs.body":
    "It goes into your current scene as a Browser Source, everybody in a fixed slot. All you do is drag it where you want it.",
  "platforms.mesa.obs.remove": "Take it out of OBS",
  "platforms.mesa.obs.title": "Put the Table in OBS",
  // "libero" é primeira pessoa do app (§3.1) — mantido em "I'll unlock".
  "platforms.mesa.obs.waitTitle":
    "Connecting to the Table… I'll unlock this the second it connects",
  "platforms.mesa.openCam": "Turn on my camera",
  // Abre as configurações de privacidade do Windows (api.openPrivacySettings) — nomear o Windows deixa claro pra onde vai (§3.5).
  "platforms.mesa.privacy.camera": "Open Windows privacy (camera)",
  "platforms.mesa.privacy.mic": "Open Windows privacy (microphone)",
  "platforms.mesa.retry": "Try again",
  "platforms.mesa.status.connecting": "connecting…",
  // A LP já usa "goes sideways" pro mesmo registro.
  "platforms.mesa.status.error": "went sideways",
  // STATUS_LABEL: badge do topo.
  "platforms.mesa.status.idle": "out",
  "platforms.mesa.status.offline": "reconnecting…",
  "platforms.mesa.status.online": "at the Table",
  "platforms.mesa.subtitle":
    "Everybody's webcam comes straight to you over P2P, in high quality — no Discord call, no blurry mosaic. And whoever drops turns into BE RIGHT BACK in their slot, without breaking your scene.",
  "platforms.mesa.title": "Bring your crew to the Table",
  // Estado vazio da grade.
  "platforms.mesa.waiting": "Waiting for your crew to come in with the invite…",
  // Rótulo do próprio tile de vídeo.
  "platforms.mesa.you": "You",
  // Badge no card da plataforma já cadastrada.
  "platforms.picker.already": "already added",
  // Hoje o código concatena "já tem" + " ×N" — vira uma string só pra sobreviver à tradução.
  "platforms.picker.alreadyCount": "already added ×{n}",
  // Aparece 2x com a mesma string: prop `title` do Modal (nome acessível, sr-only) e o h3 visível. "Get on the horn" é idiom americano de "entrar na ligaç
  "platforms.picker.title": "Who gets your stream?",
  // title da pílula ativa.
  "platforms.profile.active": "Active profile",
  // title do contador. O código monta singular/plural com um ternário — em inglês o plural é só o "s", mesma estrutura.
  "platforms.profile.count": "Platforms in this profile: {n}",
  "platforms.profile.delete": "Delete",
  // Segundo clique do botão de excluir (confirmação inline, volta sozinho em 3s).
  "platforms.profile.deleteConfirm": "Delete it for real?",
  "platforms.profile.deleteTitle": 'Delete the "{name}" profile',
  "platforms.profile.defaultNew": "Profile {n}",
  // Texto do tooltip (Hint).
  "platforms.profile.hint":
    "A profile is a saved set of platforms. Make one for each situation ('Solo Twitch+YT', 'Event with TikTok') and switch with one click.",
  "platforms.profile.label": "Stream profile",
  // aria-label do input de renomear.
  "platforms.profile.nameAria": "Profile name",
  "platforms.profile.new": "New profile",
  "platforms.profile.rename": "Rename",
  "platforms.profile.renameTitle": "Rename the active profile",
  // title da pílula inativa; {name} cai no fallback platforms.profile.untitled.
  "platforms.profile.switchTo": 'Switch to "{name}"',
  // Fallback do nome do perfil; usado em 3 lugares (pílula, title de trocar, title de excluir).
  "platforms.profile.untitled": "Untitled",
  "platforms.readiness.allReady": "All set to go live",
  "platforms.readiness.noKey": "{n} with no stream key",
  "platforms.readiness.noUrl": "{n} with no URL",
  // Plataformas com o interruptor desligado.
  "platforms.readiness.off": "{n} turned off",
  // O código hoje monta número + "pronto" + "s"; em inglês "ready" não flexiona — a chave vira uma string só.
  "platforms.readiness.ready": "{n} ready",
  // "eu toco" é primeira pessoa do app (§3.1) — "I'll push" mantém.
  "platforms.subtitle":
    "Pick your platforms, paste each one's stream key, and I'll push your OBS video to all of them at once.",
  // Selo do destino sem nome — chave diferente do fallback de perfil.
  "platforms.target.badge.noName": "No name",
  "platforms.target.badge.noUrl": "No URL",
  // Selo curto; a palavra inteira "stream key" aparece no campo logo abaixo.
  "platforms.target.badge.pasteKey": "Paste the key",
  "platforms.target.badge.ready": "Ready",
  // Selo de prontidão no cabeçalho do card.
  "platforms.target.badge.urlInvalid": "Bad URL",
  "platforms.target.collapseAria": "Collapse platform",
  // aria-label do Toggle — funcional (§6), então nomeia o que o interruptor liga.
  "platforms.target.enableAria": "Turn {name} on",
  "platforms.target.expandAria": "Expand platform",
  // Abre a página da plataforma onde a chave fica.
  "platforms.target.getKey": "Get my stream key",
  "platforms.target.nameAria": "Platform name",
  // ---- Editor de enquadramento (modal) ----
  "platforms.reframe.capture": "Grab a frame from OBS",
  "platforms.reframe.cancel": "Cancel",
  "platforms.reframe.center": "Recenter",
  "platforms.reframe.close": "Close",
  "platforms.reframe.crop.aria":
    "Vertical crop — drag it or use the arrow keys (Shift = 10%)",
  "platforms.reframe.hint.live": "Grab a frame from OBS to line it up exactly.",
  "platforms.reframe.hint.offline":
    "💡 Grabbing a frame needs OBS live. Without one, use the grid to line it up.",
  "platforms.reframe.lede":
    "Drag the box to pick which part of your video goes to the **{size}** (vertical).",
  "platforms.reframe.preview": "preview",
  "platforms.reframe.result": "How it'll look",
  "platforms.reframe.save": "Save",
  "platforms.reframe.saved.toast": "Saved your framing.",
  "platforms.reframe.title": "Frame the vertical",
  "platforms.reframe.titleWithTarget": "Frame the vertical · {target}",
  "platforms.reframe.zoom": "Zoom",
  "platforms.target.reframe": "Frame the 9:16",
  "platforms.target.reframeTitle":
    "Crops the 9:16 out of your video for this vertical destination",
  // Mesma string no texto do botão e no aria-label ("Remover") do card da plataforma.
  "platforms.target.remove": "Remove",
  // aria-label da alça de arrastar.
  "platforms.target.reorderAria": "Reorder platform (↑/↓ arrows)",
  "platforms.target.reorderTitle": "Drag it, or use ↑/↓",
  "platforms.target.test.cta": "Test the server",
  // {msg} vem do backend (api.testTarget) — hoje chega em PT; ver riscos.
  "platforms.target.test.ok": "📡 {msg}",
  "platforms.target.test.running": "Testing…",
  // §3.4: assume o limite do teste antes de a pessoa confiar demais nele.
  "platforms.target.test.title":
    "Checks whether the platform's server answers — it doesn't check your stream key",
  // Mesmo caso: era concatenação de fragmento + `preset.name`.
  "platforms.target.url.help":
    "— where your video goes; paste the URL the platform's dashboard gave you",
  // Hoje o JSX concatena " — o endereço pra onde seu vídeo vai; " + o ramo da Kick. Virou uma frase só: em inglês a ordem muda.
  "platforms.target.url.helpKick":
    "— where your video goes; I filled this one in, only change it if Kick's dashboard shows a different one",
  "platforms.target.url.invalid":
    "That URL won't work — use rtmp:// or rtmps://",
  "platforms.target.url.label": "Server URL",
  // "servidor/app" é exemplo ilustrativo; "rtmp://" e "rtmps://" são protocolo e ficam.
  "platforms.target.url.placeholder":
    "rtmp://server/app  (rtmp:// or rtmps://)",
  // Linha abaixo do nome quando a URL ainda não vale.
  "platforms.target.badge.off": "off",
  "platforms.target.urlUnset": "No URL set",
  "platforms.title": "Platforms",
  // Kicker acima de "Plataformas". Mantém a metáfora da corneta que a LP já usa ("Sound the horn", "blows the horn").
  "platforms.title.kicker": "Where your horn gets heard",
  // {platform} é PLATFORMS[id].name (nome de produto, não traduz).
  "platforms.toast.added": "{platform} is in 📣",
  // Par do toast de entrada — mantive o mesmo verbo pros dois.
  "platforms.toast.removed": "{name} is out",
  "platforms.toast.undo": "Undo",

  // ---- recording + replay ----
  "recorder.toast.diskFull":
    "No room to record — your stream is fine, it just isn't being saved.",
  "recorder.toast.noDir":
    "Couldn't find the recording folder. Your stream is fine, it just isn't being saved.",
  "recorder.toast.resumed":
    "Recording dropped and came back — a little bit is missing.",
  "recorder.toast.gaveUp":
    "Couldn't record after 5 tries — your stream is still going. You can try again.",
  "recorder.toast.retry": "Try again",
  "recorder.toast.retrying": "On it — trying to record again.",
  "recorder.toast.waitingSource":
    "Waiting for video before recording starts. If OBS isn't up yet, that's why.",
  "recorder.toast.failed": "Couldn't record: {error}",
  "recorder.toast.estimatedAnchor":
    "Replay sync might be a few seconds off — you can nudge it in the report.",

  "replay.back10": "Back 10s",
  "replay.chat.empty": "Nobody had said anything yet.",
  "replay.chat.gap": "Chat dropped around here — messages may be missing.",
  "replay.chat.hideDeleted": "hide deleted",
  "replay.chat.showDeleted": "show deleted",
  "replay.chat.scrollAria": "Chat messages synchronized with the replay",
  "replay.chat.title": "Chat",
  "replay.clip.action": "Create clip",
  "replay.clip.cancel": "cancel clip",
  "replay.clip.crossSegment":
    "That range spans two recordings. Pick a stretch inside one of them.",
  "replay.clip.cta": "Cut a clip (mark the start, then the end)",
  "replay.clip.pending": "mark the end",
  "replay.clip.saved": "Clip saved 📣",
  "replay.delete.confirm": "Delete it for real?",
  "replay.delete.cta": "Delete this stream's recording",
  "replay.delete.done": "Deleted the recording — the report is still here.",
  "replay.folder": "Open the recording folder",
  "replay.fwd10": "Forward 10s",
  "replay.fullscreen": "Fullscreen",
  "replay.marker.added": "Moment marked",
  "replay.marker.action": "Mark moment",
  "replay.marker.cta": "Mark this moment",
  "replay.marker.default": "Marked during replay",
  "replay.loading": "Preparing the recording…",
  "replay.missing": "This recording's file isn't on disk anymore.",
  "replay.mute": "Mute",
  "replay.offset.label": "Sync nudge",
  "replay.offset.open": "video out of sync?",
  "replay.offset.reset": "reset",
  "replay.rate.aria": "Speed",
  "replay.scrub.aria": "Replay timeline",
  "replay.pause": "Pause replay",
  "replay.play": "Play replay",
  "replay.seek.cta": "See this moment in the video",
  "replay.seek.notRecorded": "Didn't record that moment.",
  "replay.shortcuts":
    "Space plays/pauses · ← → jump 10s (Shift for 1min) · , and . step frame by frame",
  "replay.stage.aria": "Replay player; press Space to play or pause",
  "replay.title": "Stream replay",
  "replay.unmute": "Unmute",
  "replay.volume": "Volume",
  "replay.warn.codec":
    "This recording is in a format the player can't play. Open it from the folder.",
  "replay.warn.estimated":
    "I estimated the sync — if the video is off from the chart, use the nudge.",
  "replay.warn.segments":
    "This stream has {n} recording pieces (recording dropped and came back).",
  "replay.warn.truncated": "Recording stopped before the stream ended.",

  // ---- reports ----
  "reports.alerts.bitsTotal": "bits total",
  "reports.alerts.kind.follow.one": "follow",
  "reports.alerts.kind.follow.other": "follows",
  "reports.alerts.kind.member.one": "member",
  "reports.alerts.kind.member.other": "members",
  "reports.alerts.kind.raid.one": "raid",
  "reports.alerts.kind.raid.other": "raids",
  "reports.alerts.kind.resub.one": "resub",
  "reports.alerts.kind.resub.other": "resubs",
  // ALERT_LABELS — a 1ª posição da tupla ('sub','resub','subgift'…) é id de evento, não traduzir.
  "reports.alerts.kind.sub.one": "sub",
  "reports.alerts.kind.sub.other": "subs",
  "reports.alerts.kind.subgift.one": "gift",
  "reports.alerts.kind.subgift.other": "gifts",
  // A LP escreve 'superchats' junto.
  "reports.alerts.kind.superchat.one": "superchat",
  "reports.alerts.kind.superchat.other": "superchats",
  "reports.alerts.title": "Stream alerts",
  // {user} pode virar 'alguém'/'somebody' quando a exportação anônima está ligada.
  "reports.alerts.topRaid": "🚀 Biggest raid: {user} (+{n})",
  "reports.bitrate.title": "Bitrate per platform (Mbps)",
  // Abreviação inline; 'avg' é a abreviação equivalente.
  "reports.channel.avg": "avg",
  // Inline minúsculo na linha do canal.
  "reports.channel.peak": "peak",
  "reports.channel.share": "{pct}% of viewers",
  // Assume o limite antes de a pessoa achar que é bug (§3.4).
  "reports.channels.followersNote":
    "💜 Followers come from the platform's own counter, so it's the net number: anyone who unfollowed during the stream comes off it. It may not match the alert count from Streamlabs/StreamElements.",
  "reports.channels.oldChatNote":
    "💬 This stream is from before I started counting chat per channel, so only the total shows up here. From your next one on, chat comes split by channel too.",
  // 'Audiência' vira a coisa que existe na tela em inglês (viewers); casa com o toggle 'By channel'.
  "reports.channels.title": "Viewers by channel",
  "reports.channels.unattributed":
    "{n} alert(s) with no channel attached (they came from Streamlabs/StreamElements, which don't say which channel they're from).",
  // Aparece 2x (gráfico de audiência e de chat). Avisa que os números abaixo são da live inteira, não da linha que está no gráfico repartido.
  "reports.chart.allChannels": "All channels together:",
  // Legenda da linha; abreviação igual nas duas línguas.
  "reports.chat.series": "msgs/min",
  // No código isso está quebrado em 5 pedaços de JSX com <strong> no meio — é o exemplo de frase que não sobrevive concatenada.
  "reports.chat.summary": "Total {total} · peak {peak}/min · average {avg}/min",
  "reports.chat.title": "Chat activity (msgs/min)",
  // title + aria-label, em WindowCard e HighlightRow (4 ocorrências). Funcional, sem piada (§6).
  "reports.copyTime": "Copy timestamp",
  // 2 ocorrências.
  "reports.copyTime.done": "Copied the timestamp.",
  // ---- Cabeçalhos do CSV ----
  // São NOMES DE COLUNA, não frase: minúsculas e com underscore, pra aguentar
  // fórmula de planilha e import de script sem aspas em volta.
  "reports.csv.history.avgAudience": "avg_audience",
  "reports.csv.history.bits": "bits",
  "reports.csv.history.chatMessages": "chat_messages",
  "reports.csv.history.date": "date",
  "reports.csv.history.durationMin": "duration_min",
  "reports.csv.history.followersGained": "followers_gained",
  "reports.csv.history.mode": "mode",
  "reports.csv.history.peakAudience": "peak_audience",
  "reports.csv.history.platforms": "platforms",
  "reports.csv.history.problemWindows": "rough_patches",
  "reports.csv.history.raidViewers": "raid_viewers",
  "reports.csv.history.raids": "raids",
  "reports.csv.history.start": "start",
  "reports.csv.history.subs": "subs",
  "reports.csv.history.verdict": "verdict",
  "reports.csv.series.bitrateKbpsFor": "bitrate_kbps_{target}",
  "reports.csv.series.chatPerMin": "chat_per_min",
  "reports.csv.series.chatPerMinFor": "chat_per_min_{source}",
  "reports.csv.series.clock": "clock",
  "reports.csv.series.cpuPct": "cpu_pct",
  "reports.csv.series.droppedFor": "dropped_{target}",
  "reports.csv.series.gpuPct": "gpu_pct",
  "reports.csv.series.memoryPct": "memory_pct",
  "reports.csv.series.obsCongestionPct": "obs_congestion_pct",
  "reports.csv.series.obsRenderMs": "obs_render_ms",
  "reports.csv.series.relTimeS": "rel_time_s",
  "reports.csv.series.stateFor": "state_{target}",
  "reports.csv.series.watchingLastKnownFor": "watching_last_known_{source}",
  // O sinal (+/−) já vem dentro de {pct}.
  "reports.delta.pct": "{pct}% vs last stream",
  "reports.delta.same": "same as last stream",
  // 3 ocorrências (carregando, ilegível, cabeçalho).
  "reports.detail.back": "Back",
  "reports.detail.delete": "Delete",
  // Segundo clique do botão de excluir. 'Sure?' é o que se fala; 'Confirm?' soa a caixa de diálogo.
  "reports.detail.delete.confirm": "Sure?",
  "reports.detail.delete.error":
    "Couldn't delete the report — the file is still in the folder. Try again, or open the folder and delete it by hand.",
  // Primeira pessoa nos dois idiomas: quem apagou foi o app (§3.1).
  "reports.detail.deleted": "Deleted that report.",
  "reports.detail.download": "Download",
  "reports.detail.error.title": "I couldn't open this stream",
  // Formato fixo do §3.2 nos dois idiomas: assume a falha e diz o que pode ser.
  "reports.detail.error.read":
    "Couldn't read this report — the file may be damaged.",
  // 'live' (substantivo BR) → 'stream'. Mesma frase no h1 do HTML exportado e no <title> do arquivo.
  "reports.detail.heading": "Stream on {date}",
  "reports.detail.loading": "Loading report",
  // A ordem inverte em inglês ('Smart mode') — é o caso clássico de não concatenar.
  "reports.detail.mode": "{mode} mode",
  // Rótulo de botão é verbo do que vai acontecer (§6) — casa com o 'Building…' do histórico.
  "reports.detail.recap": "Build recap",
  // A palavra entre aspas TEM que ser a mesma de analysis.parse.alert.userFallback — é a que o anonimizador (src/lib/export/anonymize.ts) põe no lugar do nome.
  "reports.download.anon.desc":
    "Swaps whoever showed up for “someone”. Use it when you're sending this to a sponsor or an agency — every number stays.",
  "reports.download.anon.title": "No viewer names",
  "reports.download.csv.desc":
    "The whole stream, one row every ~2s, ready for Excel.",
  // Aparece 3x: opção do modal, filtro do Salvar do relatório e filtro do Salvar do histórico.
  "reports.download.csv.label": "Spreadsheet (CSV)",
  "reports.download.error": "Couldn't save the report: {err}",
  // 'Imprimir → Salvar como PDF' são itens de menu do navegador — em inglês são literalmente Print → Save as PDF.
  "reports.download.html.desc":
    "Opens in any browser, offline. For a PDF: open it and use Print → Save as PDF.",
  // Aparece 2x: título da opção e filtro do diálogo Salvar do Windows.
  "reports.download.html.label": "Web page (HTML)",
  "reports.download.json.desc":
    "The report already crunched, to plug into your own tool.",
  "reports.download.json.label": "Data (JSON)",
  // Aparece 2x: nome acessível do Dialog e h3 visível.
  "reports.download.modal.name": "Download report",
  // Primeira pessoa nos dois idiomas: quem gravou o arquivo foi o app (§3.1).
  "reports.download.saved": "Saved your report.",
  // Nomes de arquivo: sem espaço e sem barra — vão pro disco, e a data ISO entra
  // depois no código (ordena sozinha no explorador, não muda com o idioma).
  "reports.file.history": "corneta-history",
  "reports.file.live": "corneta-live",
  "reports.file.seriesSuffix": "-series",
  // fmtDur — duplicado nos dois arquivos. Forma idêntica em en-US (3h12); extraído só pra não ficar solto no código.
  "reports.dur.hours": "{h}h{m}",
  // fmtDur — 'min' é a mesma abreviação nas duas línguas.
  "reports.dur.minutes": "{m}min",
  "reports.events.title": "Events",
  "reports.error.retry": "Try again",
  "reports.highlights.chartHint":
    "The chart markers match the moments listed below.",
  // 'gravação (VOD)' → só 'the VOD' (é o nome que o streamer usa em inglês, igual à LP).
  "reports.highlights.note":
    "Times count from when the stream started — find that minute in the VOD to cut your clip.",
  "reports.highlights.more.one": "Show 1 more moment",
  "reports.highlights.more.other": "Show {count} more moments",
  "reports.highlights.title": "Highlights (worth clipping)",
  // Reticência de estado de espera (§6).
  "reports.history.busy": "Building…",
  // Rótulo de botão é verbo do que vai acontecer (§6); vira 'Building…' enquanto roda.
  "reports.history.button": "Export history (CSV)",
  // Formato fixo do §3.2 e aponta a saída que existe na tela (o botão Abrir pasta).
  "reports.history.error.none":
    "Couldn't read a single stream — use Open folder to check the files.",
  // Formato fixo 'Couldn't ...' (§3.2), igual ao pt.
  "reports.history.error.save": "Couldn't export the history: {err}",
  "reports.history.ok.all": "{n} stream(s) in the spreadsheet",
  "reports.history.ok.some":
    "Exported {n} stream(s) — left out {bad} I couldn't read",
  // <title> do arquivo exportado; {title} é reports.detail.heading.
  "reports.html.docTitle": "{title} — Corneta",
  // Versão curta da nota da tela — chave separada de propósito.
  "reports.html.followersNote":
    "Followers come from the platform's own counter: it's the net number (anyone who unfollowed comes off it).",
  // A segunda metade é literalmente a tagline da LP (closing.footer.tagline) — manter idêntica.
  "reports.html.footer":
    "Made by Corneta on {date} · multistream that runs on your PC",
  // 'gravação' → 'the VOD', igual à LP.
  "reports.html.highlights.note":
    "Times count from when the stream started — use them to find the moment in the VOD.",
  // Sem o '(pra clipar)' da tela — chave separada.
  "reports.html.highlights.title": "Highlights",
  "reports.html.table.channel": "Channel",
  "reports.html.table.chat": "Chat",
  "reports.html.table.followers": "Followers",
  // Coluna da barrinha de fatia da audiência.
  "reports.html.table.share": "Share",
  // Mesmo termo da LP (replica.report.label: 'stream report').
  "reports.html.tag": "Corneta · stream report",
  // Sem o parêntese que a tela tem — chave separada.
  "reports.html.viewers.title": "Live viewers",
  // Primeira pessoa do que o app faz (§3.1) — não virar 'the report will be generated'.
  "reports.list.empty.body":
    "When your stream ends, I build the report right here.",
  "reports.list.empty.title": "No streams yet",
  "reports.list.error.body":
    "The reports folder did not respond. Your files are still on your computer.",
  "reports.list.error.title": "I couldn't load your streams",
  "reports.list.archive": "Earlier streams",
  "reports.list.archiveCount.one": "1 more stream in your archive",
  "reports.list.archiveCount.other": "{count} more streams in your archive",
  // Mesmo termo da LP (quality.journey.after.sticker).
  "reports.list.kicker": "After the stream",
  "reports.list.latest": "Latest stream",
  "reports.list.noData":
    "No numbers for this stream — open it to see what got recorded.",
  "reports.list.openStory": "Open the stream story",
  // Rótulo de botão = verbo do que vai acontecer.
  "reports.list.openFolder": "Open folder",
  "reports.list.result": "Recap",
  "reports.list.subtitle":
    "Replay each stream: where people showed up, where they left, and the minute it choked.",
  "reports.list.title": "Your streams",
  // Rótulo da linha tracejada em 92%.
  "reports.machine.dangerLine": "danger zone",
  "reports.machine.memory": "Memory",
  "reports.machine.title": "Machine load (%)",
  "reports.marker.error": "● error",
  "reports.marker.noSignal": "● no signal from OBS",
  "reports.marker.reconnect": "● reconnect",
  // MODE_LABEL. Igual à LP (quality.mode.esperto.title).
  "reports.mode.hybrid": "Smart",
  // MODE_LABEL. Igual à LP (quality.mode.lata.title).
  "reports.mode.passthrough": "Straight up",
  // MODE_LABEL. Termo já fixado na LP (quality.mode.caprichado.title). A CHAVE 'per-platform' é enum — não traduzir.
  "reports.mode.perPlatform": "All out",
  // Já em inglês no pt — é o nome que o OBS usa. Fica.
  "reports.obs.series": "Render lag",
  "reports.obs.title": "OBS — delay building each frame (ms)",
  "reports.perTarget.avgBitrate": "~{mbps} Mbps avg",
  // São quadros perdidos (maxDropped) — 'drops' é como o streamer fala.
  "reports.perTarget.dropped": "{n} dropped frames",
  // O pt abrevia por espaço; em inglês a palavra inteira cabe. Conferir a linha no layout apertado.
  "reports.perTarget.reconnects": "{n} reconnects",
  "reports.perTarget.title": "How each platform held up",
  "reports.recap.copied":
    "Copied the image — paste it in Discord, X or wherever you post 📋",
  "reports.recap.copy": "Copy image",
  "reports.recap.download": "Download PNG",
  "reports.recap.duration": "{duration} on air",
  "reports.recap.error.canvas": "Couldn't draw the recap on this machine.",
  // Nomeia o botão que está na tela (§3.5); tem que casar com reports.recap.download.
  "reports.recap.error.copy": "Couldn't copy it — use Download PNG instead",
  "reports.recap.error.download": "Couldn't download the recap: {err}",
  // Formato fixo 'Couldn't ...' (§3.2), igual ao vizinho reports.recap.error.canvas.
  "reports.recap.error.draw": "Couldn't draw the recap: {err}",
  "reports.recap.footer": "streamed with Corneta — multistream in one app",
  "reports.recap.modal.close": "Close recap",
  "reports.recap.modal.description":
    "A vertical preview of the stream, ready to copy or download.",
  "reports.recap.modal.format": "PNG · {width} × {height}",
  "reports.recap.modal.heading": "Recap to post",
  "reports.recap.modal.hint": "Review the whole image before sharing it.",
  // Nome acessível do Dialog (sr-only) — funcional, sem piada (§6).
  "reports.recap.modal.name": "Stream recap",
  "reports.recap.modal.ready": "Everything fits in the preview",
  "reports.recap.previewAria": "Stream recap preview",
  "reports.recap.stat.avg": "average",
  "reports.recap.stat.bits": "bits",
  "reports.recap.stat.messages": "messages",
  "reports.recap.stat.newFollowers": "new followers",
  "reports.recap.stat.onAir": "time on air",
  // Rótulo desenhado no pôster de recap (minúsculo por design).
  "reports.recap.stat.peakViewers": "peak viewers",
  "reports.recap.stat.raids": "raids",
  // 'subs' é como o streamer fala em inglês (a LP já usa).
  "reports.recap.stat.subs": "subs",
  // Título do pôster: o CAPS é do desenho (recap.ts), não da string (§6). O canvas
  // tem largura fixa (RECAP_WIDTH), então drawRecap reduz a fonte antes de desenhar.
  "reports.recap.title": "Stream · {date}",
  // title do ícone de balão na lista.
  "reports.row.chat.title": "Chat messages",
  // Chip minúsculo ao lado do ponto colorido.
  "reports.row.clean": "clean",
  // title do ponto verde.
  "reports.row.clean.title": "Clean stream",
  "reports.row.hasVideo": "recorded",
  "reports.row.hasVideo.title":
    "This stream has a recording — you can watch it alongside the charts",
  "reports.row.onAir": "{dur} on air",
  // title do ícone de olho na lista.
  "reports.row.peakViewers.title": "Peak viewers",
  // No código o plural é montado à mão (`perrengue${n>1?'s':''}`) — em en precisa de patch/patches, mesma mecânica. Ver intraduzíveis: o glossário fixa pe
  // Variantes .one/.other: quem monta é o tp().
  "reports.row.problems.one": "1 rough patch",
  "reports.row.problems.other": "{count} rough patches",
  // title do ponto amarelo/vermelho.
  "reports.row.problems.title": "Rough patches — open the report to see them",
  "reports.split.byChannel": "By channel",
  "reports.split.total": "Total",
  // Painel de números, rodapé do gráfico de audiência e cabeçalho da tabela do HTML — mesma palavra nos três.
  "reports.stat.avg": "Average",
  "reports.stat.bits": "Bits",
  // Usado quando o número vem do contador da plataforma.
  "reports.stat.followersNet": "Followers (net)",
  "reports.stat.maxCpu": "Max CPU",
  "reports.stat.messages": "Messages",
  // Usado quando o número vem de alertas de follow.
  "reports.stat.newFollowers": "New followers",
  "reports.stat.peakViewers": "Peak viewers",
  "reports.stat.raids": "Raids",
  "reports.stat.subs": "Subs",
  "reports.story.community.desc":
    "Chat, alerts, and channels show where the conversation picked up.",
  "reports.story.community.title": "The crowd joined the story",
  "reports.story.noEngagement":
    "I didn't record viewers, followers or chat for this stream.",
  "reports.story.portrait.detail.chat":
    "It was live for {duration}, with the conversation setting the pace.",
  "reports.story.portrait.detail.duration":
    "The broadcast went out to {channels}.",
  "reports.story.portrait.detail.viewers":
    "It was live for {duration}, with an average audience of {avg}.",
  "reports.story.portrait.detail.viewersChat":
    "It was live for {duration}, with an average audience of {avg} and {messages} chat messages.",
  "reports.story.portrait.title.chat.one": "1 message set the stream's pace",
  "reports.story.portrait.title.chat.other":
    "{messages} messages set the stream's pace",
  "reports.story.portrait.title.duration": "Live for {duration}",
  "reports.story.portrait.title.viewers.one":
    "1 viewer at the stream's biggest moment",
  "reports.story.portrait.title.viewers.other":
    "{peak} viewers at the stream's biggest moment",
  "reports.story.replay.desc":
    "Click a moment or a point on the chart and the video jumps there.",
  "reports.story.replay.deletedBody":
    "The report is still here — only the video is gone.",
  "reports.story.replay.deletedTitle": "You deleted this stream's recording",
  "reports.story.replay.emptyBody":
    "I started recording, but the file came out empty. The rest of the report is right below.",
  "reports.story.replay.emptyDesc":
    "The recording came out empty — the report goes on without the video.",
  "reports.story.replay.emptyTitle": "The recording never got started",
  "reports.story.replay.missingBody":
    "Recording starts off. Turn it on under Settings → General → Record the stream and your next stream shows up here to rewatch. Meanwhile, viewers, highlights and chat are still right below.",
  "reports.story.replay.missingDesc":
    "There is no video this time, so the story continues through the signals the stream left behind.",
  "reports.story.replay.missingTitle": "This stream was not recorded",
  "reports.story.replay.title": "Watch the stream again",
  "reports.story.replay.turnOn": "Turn recording on",
  "reports.story.technical.clean": "All in order",
  "reports.story.technical.desc":
    "Signal health, machine load, possible causes, and the event log are kept here.",
  "reports.story.technical.review": "Has a technical note",
  "reports.story.technical.title": "Technical backstage",
  "reports.story.timeline.desc":
    "The viewer curve and standout moments show where the broadcast changed pace.",
  "reports.story.timeline.title": "How the stream unfolded",
  "reports.story.verdict": "In one sentence",
  "reports.technical.incidents.desc":
    "Corneta matches what fell behind with what was under pressure at that moment. Open only what you want to investigate.",
  "reports.technical.incidents.confidence.high": "Likely cause",
  "reports.technical.incidents.confidence.low": "A clue, not confirmed yet",
  "reports.technical.incidents.confidence.medium": "Possible cause",
  "reports.technical.incidents.distribution":
    "Distribution of {count} occurrences across the stream",
  "reports.technical.incidents.groups":
    "Grouped by cause · total points: {count}",
  "reports.technical.incidents.individual": "Individual occurrences",
  "reports.technical.incidents.longest": "Longest stretches",
  "reports.technical.incidents.next": "What to try",
  "reports.technical.incidents.occurrences.one": "1 stretch",
  "reports.technical.incidents.occurrences.other": "{count} stretches",
  "reports.technical.incidents.signalsMore": "{count} more pieces of evidence",
  "reports.technical.incidents.title": "Technical points, grouped",
  "reports.technical.incidents.total": "{duration} combined",
  "reports.technical.incidents.why": "Why I think this",
  "reports.technical.showAll": "Show all ({count})",
  "reports.technical.showLess": "Show less",
  "reports.technical.tabs.events": "Log",
  "reports.technical.tabs.label": "Choose a technical detail",
  "reports.technical.tabs.machine": "Machine",
  "reports.technical.tabs.obs": "OBS",
  "reports.technical.tabs.platforms": "Platforms",
  "reports.technical.tabs.signal": "Broadcast",
  // Rodapé do gráfico e cabeçalho de coluna do HTML.
  "reports.viewers.peak": "Peak",
  "reports.viewers.raidsLegend": "● raids",
  // Legenda da linha do gráfico.
  "reports.viewers.series": "Watching",
  // São contagens de gente (quantos estavam vendo no começo e no fim), não horários.
  "reports.viewers.startEnd": "Started with {start} → ended with {end}",
  "reports.viewers.title": "Live viewers (how many stuck around)",
  "reports.windows.note":
    "Copy the time of a rough patch and find it in the VOD.",
  "reports.windows.title": "Technical points to review",

  // ---- settings ----
  "settings.language.title": "Language",
  "settings.language.desc":
    "On automatic, Corneta follows your Windows language. Switching takes effect right away, no restart.",
  "settings.language.auto": "Automatic",
  "settings.appearance.lightTheme.title": "Light theme",
  // aria-label do Toggle, mesma string do título.
  "settings.appearance.lightTheme.toggle": "Light theme",
  "settings.appearance.title": "Appearance",
  "settings.brb.slate.custom": "Pick a file of mine",
  "settings.brb.slate.default": "Use Corneta's default",
  "settings.brb.slate.label": "Your “BE RIGHT BACK” screen",
  // {current} é uma das quatro linhas "Usando: …" acima; hoje o código concatena a frase depois dela — precisa virar interpolação pra sobreviver.
  "settings.brb.slate.note":
    "{current} — goes on air when the signal drops. Video loops and can have sound.",
  // alt de imagem — funcional, sem piada.
  "settings.brb.slate.preview.alt": "Preview of the BE RIGHT BACK screen",
  // Primeira pessoa do que o app fez, em vez do "voltou" sem dono.
  "settings.brb.slate.toast.default": "Put Corneta's default screen back",
  "settings.brb.slate.toast.defaultError":
    "Couldn't go back to the default screen — {error}",
  "settings.brb.slate.toast.fileError": "Couldn't use that file — {error}",
  "settings.brb.slate.toast.updated": "Updated your BE RIGHT BACK screen",
  "settings.brb.slate.using.default": "Using: Corneta's default screen",
  "settings.brb.slate.using.image": "Using: {file} (image)",
  // Entra no lugar de {file} quando o nome do arquivo não foi guardado.
  "settings.brb.slate.using.image.fallback": "the image you picked",
  "settings.brb.slate.using.video": "Using: {file} (video, with sound)",
  // Entra no lugar de {file} quando o nome do arquivo não foi guardado.
  "settings.brb.slate.using.video.fallback": "the video you picked",
  // "cofre" → "Windows Credential Manager" conforme o glossário.
  "settings.data.backup.desc":
    "Saves your settings to a file. Your stream keys stay in Windows Credential Manager and don't go with it. Importing replaces the settings you have now.",
  "settings.data.backup.export": "Export",
  "settings.data.backup.import": "Import",
  // Segundo estado do mesmo botão: o primeiro clique pede confirmação e volta sozinho em 3s.
  "settings.data.backup.import.confirm": "Replace your current settings?",
  // Mesmo termo da LP (page-data.tiny.backup.title).
  "settings.data.backup.title": "Settings backup",
  // O diagnóstico compartilhável é estruturado e allowlisted; logs ficam num fluxo local separado.
  "settings.data.logs.desc":
    "Export a structured technical summary for support — without logs, names, paths or credentials — or open logs separately on this PC.",
  // No JSX o texto quebra em duas linhas, mas é um rótulo só.
  "settings.data.logs.export": "Export diagnostics",
  "settings.data.logs.export.error": "Couldn't export diagnostics.",
  "settings.data.logs.open": "Open logs",
  "settings.data.logs.title": "Logs",
  // No JSX o & está escrito como &amp;.
  "settings.data.title": "Data & diagnostics",
  "settings.telemetry.buildDisabled":
    "Collection is disabled in this build; your choice stays saved for a configured version.",
  "settings.telemetry.crashes.desc":
    "What broke, with your data scrubbed out and no logs attached.",
  "settings.telemetry.deletion.cta": "How to request deletion",
  "settings.telemetry.deletion.desc":
    "With both options off, copy the ID above and use the channel listed in the policy to delete data already sent.",
  "settings.telemetry.explainer":
    "Both start on, under legitimate interest — they exist so I can find and fix problems. Only pseudonymized technical data from the catalog goes out; PostHog processes collection, with an initial 90-day retention. Turning a switch off is your right to object and takes effect immediately.",
  "settings.telemetry.id": "Telemetry ID",
  "settings.telemetry.id.pending":
    "The ID is only created after you turn on at least one option.",
  "settings.telemetry.loading": "Reading your telemetry choices…",
  "settings.telemetry.privacy": "Privacy policy and collected data",
  "settings.telemetry.regenerate.confirm": "Change the ID now?",
  "settings.telemetry.regenerate.cta": "Use another ID",
  "settings.telemetry.regenerate.error": "Couldn't change the ID.",
  "settings.telemetry.regenerate.ok":
    "Previous ID unlinked. A new one will be created if you enable telemetry again.",
  "settings.telemetry.saveError":
    "Couldn't save that. Your previous choice still applies.",
  "settings.telemetry.saved": "Saved your choice.",
  "settings.telemetry.unavailable":
    "Telemetry isn't working in this version of Corneta — I didn't send anything.",
  "settings.telemetry.usage.desc":
    "Stages and outcomes in categories, without text or stream content.",
  "settings.guardian.cost.chat":
    "Chat and alerts reach you with that same delay.",
  // "12s atrás" / "12s behind" está em <strong>.
  // Os {buracos} destas três viram negrito: são o preço da proteção, e é o que a
  // pessoa precisa ler mesmo passando o olho.
  "settings.guardian.cost.delay": "Your stream runs {delay} real time.",
  "settings.guardian.cost.delay.value": "12s behind",
  "settings.guardian.cost.intro":
    "When a term from your list shows up, Corneta switches to the {jaVolto} screen before that moment goes on air — it never gets out, not even in a clip. To pull that off:",
  "settings.guardian.cost.scope":
    "It only watches the terms you list — {no} “anything private”.",
  "settings.guardian.cost.scope.no": "not",
  "settings.guardian.cost.smallText":
    "Really small text can still slip through.",
  // Emoji funcional (§6), mantido.
  "settings.guardian.cost.title": "🛡️ What this protection costs",
  "settings.guardian.list.empty":
    "No terms with 3+ letters means the privacy guard has nothing to watch — add at least one.",
  // Span separado, em peso normal, colado no rótulo acima.
  "settings.guardian.list.hint":
    "(one per line — your email, real name, address, your @)",
  "settings.guardian.list.label": "Terms to watch",
  // Exemplos, não dados: o endereço brasileiro virou um endereço que soa de gente em inglês. Três linhas separadas por \n dentro do placeholder.
  "settings.guardian.list.placeholder":
    "me@myemail.com\n42 Oak Street\nMy Real Name",
  // O código monta o plural com `termo{watchCount > 1 ? "s" : ""}` — em inglês o plural cai em lugar diferente, então a frase tem que ser inteira, nunca c
  // Variantes .one/.other: quem monta é o tp(), com {count} = nº de termos.
  "settings.guardian.list.watching.one": "Watching 1 term.",
  "settings.guardian.list.watching.other": "Watching {count} terms.",
  // {terms} é a lista já unida por vírgula, com cada termo entre aspas.
  "settings.guardian.list.watchingManyShort.one":
    "Watching 1 term — {short} skipped for being too short (3 letters minimum): {terms}.",
  "settings.guardian.list.watchingManyShort.other":
    "Watching {count} terms — {short} skipped for being too short (3 letters minimum): {terms}.",
  // {terms} chega já com aspas em volta do termo, montado pelo código.
  "settings.guardian.list.watchingOneShort.one":
    "Watching 1 term — 1 skipped for being too short (3 letters minimum): {terms}.",
  "settings.guardian.list.watchingOneShort.other":
    "Watching {count} terms — 1 skipped for being too short (3 letters minimum): {terms}.",
  // ---- Barra lateral ----
  // Os rótulos são o NOME DAS TELAS: têm que bater com o título de cada uma
  // (platforms.title = "Platforms", encoding.header.title = "Quality", …) e com
  // toda frase que manda a pessoa "over under Platforms".
  "sidebar.about": "About",
  "sidebar.live.title": "Open the live panel",
  "sidebar.nav.chat.hint": "every chat in one place",
  "sidebar.nav.chat.label": "Chat",
  "sidebar.nav.encoding.hint": "picture vs PC load",
  "sidebar.nav.encoding.label": "Quality",
  "sidebar.nav.golive.hint": "puts it all on air",
  "sidebar.nav.golive.label": "Live",
  // junto sobrevive; o nome em português, não).
  "sidebar.nav.mesa.hint": "co-stream with your crew",
  "sidebar.nav.mesa.label": "Table",
  "sidebar.nav.platforms.hint": "where your stream lands",
  "sidebar.nav.platforms.label": "Platforms",
  "sidebar.nav.reports.hint": "how the stream went",
  "sidebar.nav.reports.label": "Reports",
  // Selo do item Relatórios quando tem live nova pra ver (o CAPS vem do CSS).
  "sidebar.new": "new",
  "sidebar.settings": "Settings",
  "sidebar.start.title": "Go to Live and get started",
  "sidebar.state.error": "Error",
  // "cornetando" é a marca em movimento; em en vira o verbo que a marca sugere.
  "sidebar.state.live": "On air · blowing the horn",
  "sidebar.state.connectingTargets": "Connecting to the platforms",
  "sidebar.state.starting": "Waiting on OBS",
  "sidebar.state.stopped": "Off air",
  "sidebar.viewers": "watching",
  "settings.header.kicker": "Under the hood",
  "settings.header.subtitle":
    "How Corneta talks to OBS and how it behaves on air.",
  "settings.header.title": "Settings",
  "settings.hotkey.capture.idle": "set a hotkey",
  "settings.hotkey.capture.needsModifier": "needs Ctrl, Alt or Shift with it",
  // Ctrl/Alt/Shift/Esc são nomes de tecla do teclado — não traduzir.
  "settings.hotkey.capture.prompt":
    "press Ctrl, Alt or Shift + a key… (Esc cancels)",
  "settings.hotkey.clear": "Clear",
  "settings.hotkey.desc":
    "Starts and stops the stream from anywhere — even with Corneta tucked away in the tray.",
  // Mesmo termo da LP (page-data.tiny.hotkey.title).
  "settings.hotkey.title": "Global hotkey",
  "settings.hotkey.toast.inUse":
    "Another program's already using that combo — I kept the old one.",
  "settings.hotkey.toast.restoreFailed":
    "Couldn't put the old hotkey back — set a new one.",
  // Primeira pessoa do que o app está fazendo, sem "please wait".
  "settings.loading.body": "Pulling up your settings.",
  // Reticência de estado de espera, conforme §6 do tom de voz.
  "settings.loading.title": "Loading…",
  "settings.loudness.target.label": "Volume target",
  // "YT" é a abreviação de YouTube nas duas línguas.
  "settings.loudness.target.minus14": "-14 · default (Twitch/YT)",
  "settings.loudness.target.minus16": "-16 · softer",
  "settings.loudness.target.minus18": "-18 · podcast/voice",
  "settings.obs.advanced.desc":
    "Only touch this if another program is already using the default port (1935). Change it here, change it in OBS too.",
  // "app" entre parênteses é o termo do RTMP que aparece na URL — mantido cru nos dois idiomas.
  "settings.obs.advanced.field.app": "Application (app)",
  "settings.obs.advanced.field.host": "Host",
  "settings.obs.advanced.field.localKey": "Local key",
  "settings.obs.advanced.field.port": "Port",
  "settings.obs.advanced.port.invalid": "Port goes from 1 to 65535.",
  "settings.obs.advanced.trigger": "Advanced — change the local address",
  // Duas coisas vêm de fora desta área: “Set it up for me” é o rótulo do botão do GoLiveScreen e "Live screen" é o item do Sidebar — as duas traduções têm
  // {button} = nome do botão; {path} = caminho de menu do OBS (rótulos REAIS do
  // OBS em inglês, não tradução livre). Os dois em negrito.
  "settings.obs.autoconfig.desc":
    "For the {button} button (on the Live screen) to work, turn the WebSocket server on in OBS, under {path}. If there's a password, paste it here.",
  "settings.obs.autoconfig.desc.button": "“Set it up for me”",
  "settings.obs.autoconfig.desc.path": "Tools → WebSocket Server Settings",
  "settings.obs.autoconfig.title": "OBS — auto setup",
  "settings.obs.autostart.desc":
    "When you hit GO LIVE, Corneta tells OBS to start streaming too.",
  "settings.obs.autostart.title": "Start OBS too",
  // aria-label do Toggle (prop label vira aria-label) — funcional, igual ao título da linha.
  "settings.obs.autostart.toggle": "Start OBS too",
  // A palavra "chave"/"key" está dentro de um <strong> no meio da frase — a marcação precisa acompanhar a palavra, não a posição.
  // {key} = a palavra "key", em negrito: é ela que separa esta chave (interna,
  // OBS↔Corneta) da chave da plataforma.
  "settings.obs.ingest.desc":
    "The local address where OBS hands your video over. The {key} below is only between OBS and Corneta — it's not your platform stream key, which stays in Windows Credential Manager.",
  "settings.obs.ingest.desc.key": "key",
  "settings.obs.ingest.liveLock":
    "You're live — I locked this address so I don't drop OBS in the middle of your stream.",
  "settings.obs.ingest.title": "Address for OBS",
  // “Show Connect Info” e “Enable Authentication” são os rótulos reais do OBS em inglês (ver riscos).
  "settings.obs.password.desc":
    "The password shows up in that same OBS window, behind the “Show Connect Info” button. If “Enable Authentication” is unchecked there, leave this empty.",
  "settings.obs.password.placeholder": "(optional)",
  "settings.obs.password.title": "WebSocket password",
  // O OBS chama o campo de "Stream Key", mas o parágrafo logo acima diz que esta NÃO é a chave da plataforma — usar "Stream key" aqui confundiria as duas.
  "settings.obs.paste.field.key": "Key",
  // Bate com o campo "Server" do OBS em inglês.
  "settings.obs.paste.field.server": "Server",
  "settings.obs.paste.label": "Paste into OBS",
  // O pt abre com o diagnóstico; o en volta pro formato fixo de erro ("Couldn't …" + o que fazer).
  "settings.obs.test.authFail":
    "Couldn't get in — check the WebSocket password in OBS (the “Show Connect Info” button).",
  "settings.obs.test.button": "Test connection",
  "settings.obs.test.notFound":
    "Couldn't find OBS — is it open? Is the WebSocket server on under Tools → WebSocket Server Settings?",
  "settings.obs.test.ok": "Connected",
  "settings.obs.test.okDetail": "Connected · {width}×{height} · {fps}fps",
  // Mesmo rótulo de botão da linha settings.obs.autoconfig.desc.
  "settings.obs.test.wrongTarget":
    "Connected, but OBS isn't pointing at Corneta — hit “Set it up for me” on the Live screen.",
  // Idêntica à LP (protection.guard.bitrate.body) — mesma tradução.
  "settings.safety.bitrate.desc":
    "Internet choking? Corneta drops the video quality for a while instead of letting the stream stutter or die, and brings it back up when your upload steadies.",
  "settings.safety.bitrate.title":
    "Hold the stream up when your internet chokes (auto-bitrate)",
  // aria-label do Toggle.
  // Frase quase idêntica à da LP (protection.brb.body) — reaproveitei a tradução já aprovada.
  "settings.safety.brb.desc":
    "If OBS drops mid-stream, the “BE RIGHT BACK” screen goes on air without dropping the platforms — from the viewer's side the stream doesn't even blink, and it comes back on its own when the signal returns.",
  "settings.safety.brb.title": "Drop protection (BE RIGHT BACK)",
  // aria-label do Toggle.
  "settings.safety.desc":
    "What holds your stream up when OBS drops, your internet chokes, or something private of yours shows up on screen.",
  // "Safety net, not a guarantee" e os 12s vêm da LP — mantidos palavra por palavra.
  "settings.safety.guardian.desc":
    "If one of your terms (list below) shows up on screen, Corneta cuts to “BE RIGHT BACK” before it goes on air. Safety net, not a guarantee. The cost: your whole stream goes out 12s behind (the chat too).",
  // Ao lado dele o <ExperimentalBadge> imprime "experimental" e um title — essa string mora em src/components/ui.tsx, fora desta área.
  "settings.safety.guardian.title": "Privacy guard",
  // aria-label do Toggle. "Guard" sozinho não diz o que o controle faz; aria-label é funcional (§6), então repete o nome inteiro.
  // Junta protection.guard.audio.body + .cost da LP, que dizem exatamente isso.
  "settings.safety.loudness.desc":
    "Corneta evens out your audio before it goes out — no “can't hear you” from chat, no blown-out ears when you switch scenes. If you already normalize in OBS, leave this off so the two don't fight.",
  "settings.safety.loudness.title": "Audio normalizer",
  // aria-label do Toggle.
  // Badge que aparece quando a proteção está ligada.
  "settings.safety.state.armed": "Armed",
  // Selo sobre a miniatura; o CAPS vem do CSS, a string é minúscula.
  "settings.safety.state.off": "off",
  // Mesma string do rótulo da aba; tem que traduzir igual.
  "settings.safety.title": "Safety nets",
  "settings.system.autostart.desc":
    "Opens Corneta on its own when you turn the PC on.",
  // Mesmo termo da LP (page-data.tiny.startup.title = "Starts with Windows").
  "settings.system.autostart.title": "Start with Windows",
  // aria-label do Toggle.
  "settings.system.autostart.toggle": "Start with Windows",
  "settings.system.title": "System",
  // "next to the clock" é a mesma imagem concreta que a LP usa (page-data.tiny.tray.text).
  "settings.system.tray.desc":
    "Closing the window hides Corneta next to the clock (the stream keeps going). To quit for good, use the tray menu.",
  "settings.system.tray.title": "Minimize to the tray on close",
  // aria-label do Toggle.
  "settings.system.tray.toggle": "Minimize to the tray",
  "settings.record.chat.hint":
    "Saves who said what, so you can replay chat alongside the video. Stays on your computer — Corneta never gets a copy.",
  "settings.record.chat.label": "Record chat",
  "settings.record.desc":
    "Keep the stream on your computer and replay it later with the charts running alongside, in the report.",
  "settings.record.dir.default": "Corneta's default folder",
  "settings.record.dir.error.kept":
    "{path} won't work — I'm still recording to the folder you had.",
  "settings.record.dir.error.missing":
    "I couldn't find that folder — pick another one.",
  "settings.record.dir.error.notDir":
    "That isn't a folder — point me at a folder.",
  "settings.record.dir.error.readonly":
    "I can't write to that folder — pick another one or allow it in Windows.",
  "settings.record.dir.free": "{size} GB free — about {hours} h of streaming",
  "settings.record.dir.label": "Save to",
  "settings.record.dir.open": "Open folder",
  "settings.record.dir.pick": "Choose folder",
  "settings.record.dir.reset": "use the default",
  "settings.record.group.space": "Disk space",
  "settings.record.keep.hint":
    "Past this, Corneta deletes the oldest recordings. The reports stay.",
  "settings.record.keep.hours": "≈{hours} h of streaming",
  "settings.record.keep.label": "Keep up to",
  "settings.record.keep.over":
    "The limit is bigger than the free space — the disk fills up before Corneta deletes anything.",
  "settings.record.privacy":
    "Everything stays on your computer: no recording is uploaded anywhere. If you record chat, those messages are your responsibility.",
  "settings.record.test.busy": "Testing…",
  "settings.record.test.cta": "Test recording",
  "settings.record.test.fail": "Couldn't finish the test — {error}",
  "settings.record.test.hint":
    "Records 5 seconds and plays it back. Worth doing before your first stream.",
  "settings.record.test.modal": "Recording test",
  "settings.record.test.modal.body":
    "If you can see and hear this, recording works on this machine: the folder accepts writes and the player plays the file.",
  "settings.record.test.ok": "Recording works 📣",
  "settings.record.title": "Record the stream",
  "settings.record.video.hint":
    "Saves what went out, without the weight (no re-encoding). Uses about {gb} GB per hour at your current bitrate.",
  "settings.record.video.label": "Record video",
  "settings.record.warn.longPath":
    "That path is quite long — Windows may complain.",
  "settings.record.warn.network":
    "Network or removable drive: if it disappears mid-stream, recording stops (your stream doesn't).",
  "settings.tab.general": "General",
  // Nome de produto, inalterado.
  "settings.tab.obs": "OBS",
  // Mesmo termo da LP (protection.kicker = "Safety nets"). "Live safety" soa a treinamento de trabalho; "Safety nets" é o que a página já ensinou.
  "settings.tab.safety": "Safety nets",
  // {error} vem cru do backend em pt-BR; o texto do erro em si mora no Rust, não aqui.
  "settings.toast.export.error": "Couldn't export your settings — {error}",
  "settings.toast.export.ok": "Exported your settings",
  "settings.toast.import.error": "Couldn't import that file — {error}",
  "settings.toast.import.ok":
    "Imported your settings — I kept the old ones in a backup.",

  // ---- shell (janela principal) ----
  "shell.win.closeTray": "Close — Corneta stays by the clock",
};
