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
  // ---- seo (não aparece na tela; é o que o buscador cita) ----
  "seo.howto.name": "How to stream to several platforms at once with Corneta",
  "seo.howto.description":
    "Three steps to take a single stream from your streaming app to Twitch, YouTube, Kick and other destinations at the same time.",
  "seo.howto.tool.software":
    "OBS Studio, Streamlabs, XSplit or any other RTMP app",
  "seo.howto.tool.pc": "A PC running Windows 10 or 11",
  "seo.app.subcategory": "Live streaming software (multistream)",
  "seo.app.requirements": "OBS Studio or any streaming app that speaks RTMP",

  // ---- replica (a réplica do app na LP) ----
  "replica.live.label": "live panel · 01:42:08",
  "replica.live.tag": "numbers are illustrative",
  "replica.report.label": "stream report · 3h12",
  "replica.report.tag": "sample session",
  "replica.crop.caption":
    "Pick a side of the frame: that is how you decide what goes vertical.",

  // ---- benefits ----
  "benefits.chat.body":
    "Twitch, YouTube and Kick scroll together, in the order things happened, and you reply right from there. The sub alert drops into the same column, right above whatever got typed next.",
  "benefits.chat.demo.input.placeholder": "Reply to all three at once…",
  // Sei que o guia proíbe "Enviar" sozinho em botão, mas aqui é a maquete de um campo de chat — a tela real de chat diz "enviar" mesmo. Se quiser corrigir
  "benefits.chat.demo.input.send": "send",
  "benefits.chat.demo.label": "chat in one place",
  // Handle brasileiro trocado por um handle que soa de chat gringo de verdade; mesmo formato (minúsculo, colado). Precisa de OK humano — ver intraduziveis
  "benefits.chat.demo.line1.author": "gabzilla · Twitch",
  "benefits.chat.demo.line1.message": "yooo just got here",
  // No YouTube o nome real é o padrão, então mantive o formato "Nome S." com um nome equivalente em inglês.
  "benefits.chat.demo.line2.author": "Marcus L. · YouTube",
  "benefits.chat.demo.line2.message": "audio's clean today 👏",
  "benefits.chat.demo.line3.author": "dannyxx · Kick",
  // "Cornetar" (nome do produto virando verbo) não tem equivalente. Versão funcional soa como chat de verdade, mas perde a piada — ver intraduziveis.
  "benefits.chat.demo.line3.message": "let's goooo!!",
  "benefits.chat.demo.tag": "example",
  "benefits.chat.note":
    "You can pop it out into its own window on your second monitor",
  "benefits.chat.title": "All three chats in one column, emotes and all",
  "benefits.heading.kicker": "After you hit GO LIVE",
  "benefits.heading.subtitle":
    "No alt-tab to find out who's still live and who's talking to you.",
  "benefits.heading.title": "One screen — even when it all goes sideways.",
  "benefits.routes.body":
    "Every platform gets its own connection. When one is reconnecting, the rest keep going — and you see it on the panel, which platform and what time, instead of finding out from chat.",
  "benefits.routes.demo.kick.state": "reconnecting",
  // Rótulo em caixa baixa no código (o CAPS, se houver, vem do CSS). Mantive minúsculo.
  "benefits.routes.demo.label": "your platforms",
  "benefits.routes.demo.tag": "example",
  "benefits.routes.demo.twitch.state": "live",
  "benefits.routes.demo.youtube.state": "live",
  "benefits.routes.note":
    "You can pause one platform and leave the rest running",
  "benefits.routes.title": "If Kick drops, Twitch never finds out",

  // ---- chrome ----
  // Atributo lang do <html> em layout.tsx.
  "chrome.html.lang": "en-US",
  "chrome.llms.contact.label": "contact:",
  "chrome.llms.heading.faq": "## Frequently asked questions",
  "chrome.llms.heading.features": "## What Corneta does",
  "chrome.llms.heading.notis": "## What Corneta is NOT",
  "chrome.llms.heading.pages": "## Pages",
  "chrome.llms.heading.platforms": "## Platforms",
  "chrome.llms.heading.steps": "## How to use it in three steps",
  "chrome.llms.heading.who": "## Who you're talking to",
  // Mantive "Built for Brazilian streamers" — é fato do produto e o llms.txt é onde o robô lê o que a Corneta é. Aqui o texto fala do streamer em terceira
  "chrome.llms.intro":
    "Local multistream, free and open source (MIT license), for Windows 10 and 11.\nBuilt for Brazilian streamers. It's not a cloud service, there's no subscription\nand no sign-up: the video goes straight from the streamer's computer to each\nplatform.",
  "chrome.llms.link.home": "Site and download",
  "chrome.llms.link.privacy": "Privacy policy",
  "chrome.llms.link.source": "Source code",
  "chrome.llms.link.terms": "Terms of use",
  "chrome.llms.notis.1":
    "- It doesn't replace OBS: scenes, camera and audio stay in your capture program.",
  "chrome.llms.notis.2":
    "- It's not a cloud relay: no server of ours receives, stores or forwards video.",
  "chrome.llms.notis.3":
    "- It doesn't need a Corneta account — there's no sign-up and no login on the site.",
  "chrome.llms.notis.4":
    "- There's no macOS or Linux version so far, and no public date for one.",
  "chrome.llms.platforms.body":
    "Ready to go in the app: Twitch, YouTube, Kick, Facebook and any custom RTMP or\nRTMPS server. Experimental, because they depend on the platform itself letting\nyou in: TikTok, Instagram and X. So far, Twitch is the one platform with a\ndocumented end-to-end stream.",
  // Troquei "controle" (substantivo abstrato proibido) por onde a coisa roda de verdade.
  "chrome.manifest.description":
    "Local multistream for streamers — one output per platform, all running on your PC.",
  "chrome.manifest.lang": "en-US",
  // 157 caracteres. Os três itens depois do travessão são coisas diferentes e concretas (chat / queda de sinal / relatório), não sinônimos — regra de três
  "chrome.meta.description":
    "Multistream from your PC to Twitch, YouTube, Kick and more — chat in one place, your stream still up when the signal drops, and a report on what choked. Free.",
  "chrome.meta.keywords.1": "multistream",
  "chrome.meta.keywords.10": "Kick",
  "chrome.meta.keywords.11": "open source",
  "chrome.meta.keywords.2": "stream to multiple platforms at once",
  "chrome.meta.keywords.3": "free multistream",
  "chrome.meta.keywords.4": "OBS multistream",
  "chrome.meta.keywords.5": "Twitch and YouTube at the same time",
  "chrome.meta.keywords.6": "simultaneous streaming",
  // Em inglês o nome do concorrente vai maiúsculo, senão a palavra vira genérica ("restream" = retransmitir).
  "chrome.meta.keywords.7": "Restream alternative",
  "chrome.meta.keywords.8": "unified chat for streamers",
  "chrome.meta.keywords.9": "OBS alert overlay",
  // 51 caracteres, dentro do limite de ~60. Mantive "multistream" no começo porque é o termo de busca, igual ao comentário do código. "live" como substant
  "chrome.meta.title.default":
    "Corneta — multistream: one stream, many communities",
  // A quebra de linha no pt é do JSX, não do texto.
  "chrome.notfound.body":
    "The main stream is still up. Head back home and try another way.",
  "chrome.notfound.cta": "Go to the homepage",
  "chrome.notfound.sticker": "Error 404",
  "chrome.notfound.title.line1": "This page",
  // Sorte rara: a gíria de rádio/TV é a mesma nas duas línguas e continua encaixando no tema de transmissão.
  "chrome.notfound.title.line2": "went off the air.",
  // "cada plataforma independente" ficaria vago em inglês ("independent" não diz o quê); "on its own connection" nomeia a coisa que existe.
  "chrome.og.description":
    "Multistream that runs on your PC: each platform on its own connection, chat in one place, and a report on what choked during your stream. Free for Windows.",
  // Não é copy, mas precisa virar junto com o texto, senão o Open Graph anuncia português.
  "chrome.og.locale": "en_US",
  "chrome.og.title": "Corneta — one stream, many communities",
  "chrome.twitter.description":
    "One stream, several platforms at once — and an app that keeps it up when the signal drops, then tells you what happened.",
  "chrome.twitter.title": "Corneta — one stream, many communities",

  // ---- closing ----
  "closing.cta.note": "Windows 10/11 · no sign-up · no subscription",
  "closing.cta.title":
    "Your next stream could already be in three places at once.",
  "closing.faq.cta": "Download for free",
  "closing.faq.kicker": "Before you download",
  // "não pegam bem pra gente" é auto-ironia; "don't make us look good" mantém a admissão do limite (§3.4) sem virar disclaimer formal.
  "closing.faq.subtitle": "Including the ones that don't make us look good.",
  "closing.faq.title": "What everybody asks before installing.",
  "closing.footer.download": "Download for Windows",
  // Manter por extenso: a verificação do Google procura exatamente a expressão "Privacy policy" na home.
  "closing.footer.link.privacy": "Privacy policy",
  "closing.footer.link.source": "Source code",
  "closing.footer.link.terms": "Terms of use",
  // aria-label funcional (§6): descreve o que é, sem piada.
  "closing.footer.nav.ariaLabel": "Footer links",
  "closing.footer.tagline":
    "Multistream that runs on your PC — not in somebody else's cloud.",
  // "Cornetar" carrega o nome do produto (corneta = horn) e o sentido de "soltar o berro / cornetar". "Sound the horn" salva a corneta e o imperativo curt
  "closing.ticker.item1": "Sound the horn",
  "closing.ticker.item2": "One stream · all your communities",
  "closing.ticker.item3": "Multistream that runs on your PC",
  "closing.ticker.item4": "Free and open source",
  "closing.tiny.kicker": "The small stuff",
  "closing.tiny.title":
    "The kind of thing you only notice on your third stream.",

  // ---- content ----
  "content.faq.free.answer":
    "It's free, no sign-up and no trial period. Everything that runs on your PC — multistream, chat, alerts, reports and protections — is open source under the MIT license and stays that way. If something paid ever shows up, it'll be an optional cloud service, and you'll know about it before you install anything.",
  "content.faq.free.question":
    "Is it really free? Will it turn into a subscription later?",
  "content.faq.macos_linux.answer":
    "Today the download is Windows only. It's built so other systems can come later, but there's no date to announce. If you're on macOS or Linux, the answer is: not yet.",
  "content.faq.macos_linux.question": "Does it work on macOS or Linux?",
  "content.faq.multistream_ban.answer":
    "Each platform decides that, not Corneta — and those rules have changed a lot in the last few years: several of them allow it now, with conditions that depend on your account type or on a contract you signed. Corneta doesn't change any of that, it just sends your signal where you tell it to. Before you go live in two places at once, read the terms of whoever you already signed with. Five minutes now saves you a headache later.",
  "content.faq.multistream_ban.question":
    "Can I stream to Twitch and YouTube at the same time? Won't I get banned?",
  "content.faq.obs_plugin.answer":
    "If all you want is to send the same video to more than one place, the plugin does the job — and we'd rather tell you that now than after the download. Corneta earns its place when the stream is more than just pushing video out: it holds the stream up when your program crashes (the plugin goes down with it, because it lives inside OBS), puts chat and alerts from every platform in one place, warns you if something private of yours shows up on screen and, at the end, builds a report that cross-checks your machine, your OBS and each platform to say why it stuttered.",
  "content.faq.obs_plugin.question":
    "I already use a multistream plugin in OBS. Why switch?",
  "content.faq.overlay.answer":
    "There is. Corneta runs a small server on your own PC that serves the alerts and the chat (emotes included) at a URL you add as a Browser Source — just once. Position, size, duration, sound and message limit are all adjustable, and there's a test alert button so you can check it right there.",
  "content.faq.overlay.question": "Is there an overlay I can use in OBS?",
  "content.faq.performance.answer":
    "Depends on the mode. Copying the signal from your program costs almost nothing — a modest PC handles it. Reworking the image for each platform puts the job on the graphics card (recent NVIDIA, Intel and AMD ones handle it fine) or, if you don't have one, on the processor, which hits a lot harder. Before you go live, Corneta estimates that load and how many conversions your card can take.",
  "content.faq.performance.question":
    "Will it lag my game? Do I need a good graphics card?",
  "content.faq.platforms.answer":
    "Twitch, YouTube, Kick, Facebook and any RTMP server you want to add. TikTok, Instagram and X show up as experimental because they depend on approval and on each platform's own way in.",
  "content.faq.platforms.question": "Which platforms show up in the app?",
  "content.faq.replaces_obs.answer":
    "No. You keep building scenes, camera and audio in the program you already use. Corneta picks up from there: it takes that signal, pushes it to the platforms, watches how each one is holding up, and keeps the stream's safety nets running.",
  "content.faq.replaces_obs.question": "Does Corneta replace OBS?",
  "content.faq.streamlabs_xsplit.answer":
    "It works. Corneta takes any program that streams over RTMP — just point it at the address the app shows you, same as you'd do with a platform. With OBS you get one extra shortcut: Corneta sets it up for you, and hits play when you press GO LIVE.",
  "content.faq.streamlabs_xsplit.question":
    "I use Streamlabs (or XSplit). Does it work?",
  "content.faq.upload.answer":
    "Each platform eats a slice of your upload. Before the stream, Corneta measures your connection, adds it all up and helps you pick a setup that fits with room to spare.",
  "content.faq.upload.question": "Am I going to need a lot of internet?",
  "content.faq.vertical_tiktok.answer":
    "Corneta crops a 9:16 out of your landscape video and you pick the framing, with a preview before it goes out. TikTok and Instagram are still experimental because getting in depends on the platform approving you; the same crop works for any vertical RTMP destination.",
  "content.faq.vertical_tiktok.question":
    "Can I send vertical video to TikTok?",
  "content.features.alerts":
    "Alerts from the platforms and from Streamlabs/StreamElements in the same panel",
  "content.features.auto_bitrate":
    "Auto-bitrate when your internet starts choking, plus an optional audio normalizer",
  "content.features.brb_screen":
    "BE RIGHT BACK screen that holds the stream up when the program's signal drops",
  "content.features.independent_connections":
    "Each platform on its own connection: if one drops, the others stay on air",
  "content.features.keys_in_vault":
    "Stream keys kept in Windows Credential Manager",
  "content.features.load_estimate":
    "Estimate of your total upload and of the load on your graphics card before you go live",
  "content.features.multistream":
    "Multistream from a single signal to Twitch, YouTube, Kick, Facebook and any RTMP server",
  "content.features.overlay":
    "Alert and chat overlay for OBS, served from your own machine as a Browser Source",
  "content.features.post_live_report":
    "Post-stream report that points at the likely cause of each stutter — encoding, internet or platform — with the minute to find it in the VOD",
  "content.features.privacy_guard":
    "Privacy guard: reads what's going out on air and cuts to BE RIGHT BACK if something private of yours shows up on screen",
  "content.features.quality_modes":
    "Three quality modes — copy the signal, convert only what needs it, or convert everything",
  "content.features.report_per_channel":
    "Viewers, chat and alerts in the report broken down by channel, with export to HTML, CSV and JSON",
  "content.features.unified_chat":
    "One chat for Twitch, Kick and YouTube, with emotes — you reply and moderate right there",
  "content.features.vertical_crop":
    "Vertical 9:16 crop with manual framing for TikTok and Instagram",
  // Frase citável por buscador: mantive a estrutura longa e o terceiro-pessoa "the streamer's own computer" do PT, porque aqui o leitor é o motor de busca
  "content.one_liner":
    "Corneta is a free, open source Windows app that takes a single video signal from OBS (or from any program that streams over RTMP) and sends it at the same time to Twitch, YouTube, Kick, Facebook and other destinations, each platform on its own connection. Beyond just sending the video, it handles the whole stream: it gathers chat and alerts from every platform, keeps the stream up when the program's signal drops, and builds a post-stream report that cross-checks the machine, OBS and the platforms to point at the likely cause of each instability — all of it processed on the streamer's own computer.",
  "content.scopes.kick.never":
    "This is the only login that goes through our server, because Kick requires a server-side secret in the exchange — and even then the token is not stored anywhere.",
  "content.scopes.kick.permission": "Read the channel, send chat, and moderate",
  "content.scopes.kick.title": "Kick account",
  "content.scopes.kick.why":
    "The same things as the unified chat: read, reply and moderate without leaving the app.",
  "content.scopes.twitch.never":
    "Nothing is posted to your channel unless you ask for it, and Corneta does not follow, subscribe or change anything in your account.",
  "content.scopes.twitch.permission":
    "Read and send chat, moderate, and manage the stream",
  "content.scopes.twitch.title": "Twitch account",
  "content.scopes.twitch.why":
    "Show the chat in the app, reply from there, delete a message or time someone out when you say so, and follow the state of your stream.",
  "content.scopes.youtube.never":
    "Corneta does not upload recorded video to your channel, does not touch the videos already there, does not read your history, and does not use this data for advertising or model training.",
  "content.scopes.youtube.permission": "Manage your YouTube account",
  "content.scopes.youtube.title": "YouTube account (Google)",
  // Registro formal, conforme a exceção do tom de voz para escopos de OAuth: sem contração, sem gíria, e a lista fiel ao que auth.rs pede.
  "content.scopes.youtube.why":
    "Create the live broadcast and get its stream key automatically, give it the title you wrote in the app, end it when the stream is over, read and send messages in the live chat, and show how many people are watching.",
  "content.steps.1.text":
    "Corneta opens the right page on each platform for you to copy the key, and keeps it in Windows Credential Manager — never in a config file.",
  "content.steps.1.title": "Pick where you want to show up",
  "content.steps.2.text":
    "With OBS, Corneta sets it up by itself. With anything else (Streamlabs, XSplit), you paste one address and one key — once, and never again.",
  "content.steps.2.title": "Hook up your streaming program",
  "content.steps.3.text":
    "The panel shows each platform coming on air, one by one, and you go back to the game. If you want, Corneta tells OBS to start along with it.",
  "content.steps.3.title": "Hit GO LIVE",

  // ---- hero ----
  "hero.cta.footnote":
    "Corneta for Windows 10/11 · no sign-up · no subscription",
  // aria-label: funcional, diz exatamente o que o link faz (regra §6 do tom de voz).
  "hero.download.aria": "Download Corneta free for Windows",
  "hero.download.compact": "Download",
  "hero.download.full": "Download free for Windows",
  "hero.header.brand.aria": "Corneta — home",
  "hero.header.download": "Download free",
  "hero.mechanism.aria": "How Corneta works",
  "hero.mechanism.step1.detail": "from OBS, Streamlabs, XSplit…",
  "hero.mechanism.step1.title": "1 signal",
  "hero.mechanism.step2.detail": "if one drops, the rest stay live",
  "hero.mechanism.step2.title": "Each platform on its own",
  "hero.mechanism.step3.detail":
    "your keys, your settings and the report from every stream",
  "hero.mechanism.step3.title": "All on your PC",
  "hero.nav.aria": "Main navigation",
  "hero.nav.chat": "Chat and alerts",
  "hero.nav.faq": "FAQ",
  "hero.nav.platforms": "Platforms",
  "hero.nav.protection": "Protection",
  "hero.nav.quality": "Quality",
  "hero.nav.why": "Why Corneta",
  // "joga esse sinal" virou "pushes that signal out to" — é como streamer fala em inglês ("push to Twitch"). "junta o chat de todas" virou "pulls every ch
  "hero.pitch":
    "In OBS you don't touch a thing — Corneta sets itself up in there. From then on each platform gets its own connection, they all sit side by side on one screen, and their chats land in a single window. And it doesn't disappear when you hit GO LIVE: it keeps showing you what is happening on each one, right up to the next day's report.",
  "hero.skiplink.label": "Skip to content",
  "hero.sticker": "Corneta · multistream on your PC",
  "hero.title.line1": "One stream.",
  "hero.title.line2": "All your communities.",
  // É a linha que carrega o argumento (a Corneta cuida da live inteira e te conta depois). "Nothing slips past you" mantém a promessa de que ninguém perde
  "hero.title.line3": "Nothing slips past you.",
  "hero.trust.aria": "Key facts",
  "hero.trust.free": "Free",
  "hero.trust.opensource": "Open source (MIT)",
  "hero.trust.watermark": "No watermark",

  // ---- page-data ----
  "page-data.destinations.custom.name": "Custom RTMP",
  "page-data.destinations.custom.note": "Any RTMP or RTMPS server",
  "page-data.destinations.facebook.name": "Facebook",
  "page-data.destinations.facebook.note": "Go live on a Page or a profile",
  "page-data.destinations.instagram.name": "Instagram",
  "page-data.destinations.instagram.note":
    "Vertical video — no official way in, so it can drop",
  "page-data.destinations.kick.name": "Kick",
  "page-data.destinations.kick.note": "Same deal as Twitch",
  "page-data.destinations.tiktok.name": "TikTok",
  // "vídeo em pé" é fala corrente, não termo técnico; "vertical video" é o equivalente falado em inglês ("portrait video" soa a manual de câmera).
  "page-data.destinations.tiktok.note":
    "Vertical video — your account has to be approved",
  "page-data.destinations.twitch.name": "Twitch",
  "page-data.destinations.twitch.note": "Your usual stream",
  "page-data.destinations.x.name": "X (Twitter)",
  "page-data.destinations.x.note": "You grab the key in Media Studio",
  "page-data.destinations.youtube.name": "YouTube",
  "page-data.destinations.youtube.note": "Handles high quality just fine",
  // "cofre" aqui é o Cofre do Windows (Windows Credential Manager), já nomeado em outra seção; mantive "the vault" curto pra não repetir o nome inteiro.
  "page-data.tiny.backup.text":
    "Exports your setup to a file. The keys stay in Windows Credential Manager and don't go with it.",
  "page-data.tiny.backup.title": "Settings backup",
  "page-data.tiny.chatwindow.text":
    "Chat, alerts, or both in a window that sits on top of everything, at whatever size you want.",
  "page-data.tiny.chatwindow.title": "Little chat window",
  "page-data.tiny.hotkey.text":
    "Start and cut the stream without leaving the game — the key works even when Corneta's in the background.",
  "page-data.tiny.hotkey.title": "Global hotkey",
  // Os três itens são concretos e diferentes (live comum, com convidado, de teste) — cabe na exceção da regra de três.
  "page-data.tiny.profiles.text":
    "Platform and quality presets, ready to go: your usual stream, the one with a guest, the test one.",
  "page-data.tiny.profiles.title": "Saved profiles",
  "page-data.tiny.startup.text":
    "Boots up with the PC, ready to stream — if you want it to.",
  "page-data.tiny.startup.title": "Starts with Windows",
  // "sopro de corneta" ecoa o nome do produto; em inglês "horn blast" guarda o som da animação mas perde o eco com "Corneta". Listado em intraduzíveis.
  "page-data.tiny.theme.text":
    "Corneta in dark or light — and flipping it blows the horn.",
  "page-data.tiny.theme.title": "Light and dark theme",
  "page-data.tiny.tray.text":
    "Closing the window hides Corneta next to the clock — the stream stays up.",
  "page-data.tiny.tray.title": "Lives in the tray",
  "page-data.tiny.youtube.text":
    "With your account connected, Corneta creates the broadcast and drops the key into GO LIVE. You never open YouTube Studio.",
  "page-data.tiny.youtube.title": "YouTube on autopilot",

  // ---- protection ----
  // ---- Prévia do app no hero ----
  // Réplica da tela "Ao vivo": os rótulos têm que bater com os da Sidebar do app
  // (sidebar.nav.*), senão a LP promete uma tela que não existe.
// ---- after the stream: report + replay ----
  "after.kicker": "After the stream",
  "after.badge": "new",
  "after.title": "Click the glitch and see what was on screen.",
  "after.body":
    "Corneta records what went out. And stamps everything with the same clock: each platform's bitrate, your CPU, the chat and the alerts. When the stream ends, the report points at the minute — and the video jumps there.",
  "after.proof":
    "The report works even without recording video: from your first stream it already cross-references your machine, your OBS and every platform to say what choked and when.",
  "after.cost":
    "Recording takes disk: roughly 2.7 GB per hour at the default bitrate. That's why it ships off — you turn it on, pick the folder, and Corneta deletes the oldest recordings once you pass the cap you set.",
  "after.more.channels": "audience, chat and alerts split per channel",
  "after.more.export": "exports to HTML, CSV and JSON",
  "after.more.compare": "compares against your previous stream",
  "after.more.clip": "cuts a clip straight from the recording",

  "after.scope.axis": "the whole stream · 3h12",
  "after.scope.series.platforms": "what the platforms got",
  "after.scope.series.obs": "what OBS sent",
  "after.scope.chat": "chat at that moment",
  "after.scope.chart.aria":
    "Example chart of a stream, in two lanes: on top, what the platforms received; below, what OBS sent. Three moments are marked: the chat spike at 42 minutes, the Twitch drop at 1h58, and the moment OBS closed at 2h35 — when the bottom lane hits zero and the top one doesn't.",

  "after.frame.live": "on air",
  "after.frame.reconnect": "reconnecting",
  "after.frame.note": "the frame that went out that second",

  "after.moment.chat.tab": "chat spike",
  "after.moment.chat.title": "Moment: chat blew up at 42 minutes",
  "after.moment.chat.finding": "Chat 5× above average at 42min.",
  "after.moment.chat.reading":
    "The report flags it as a highlight on its own — it's the clip you'd have gone hunting for by hand.",
  "after.moment.chat.chat.1": "LETS GOOO",
  "after.moment.chat.chat.2": "clip that please",
  "after.moment.chat.chat.3": "best play of the month",
  "after.moment.chat.chat.4": "came back just to see it again",
  "after.moment.chat.chat.5": "BRO",
  "after.moment.chat.chat.6": "pause and read the chat lol",
  "after.moment.chat.chat.7": "that was way too clean",

  "after.moment.queda.tab": "Twitch dropped 8s",
  "after.moment.queda.title": "Moment: Twitch dropped for 8 seconds",
  "after.moment.queda.finding":
    "CPU was at 98% the same minute Twitch dropped.",
  "after.moment.queda.reading":
    "Likely an encoding bottleneck, not your internet — and YouTube and Kick never noticed.",
  "after.moment.queda.chat.1": "did it freeze?",
  "after.moment.queda.chat.2": "back now",
  "after.moment.queda.chat.3": "smooth over here",
  "after.moment.queda.chat.4": "froze for like 5s on twitch",
  "after.moment.queda.chat.5": "youtube didn't even blink",

  "after.moment.brb.tab": "OBS closed",
  "after.moment.brb.title": "Moment: OBS closed and BE RIGHT BACK took over",
  "after.moment.brb.finding": "All three platforms kept receiving video.",
  "after.moment.brb.reading":
    "OBS closed at 2h35 and BE RIGHT BACK took its place. Anyone watching saw the holding screen and stayed put.",
  "after.moment.brb.chat.1": "where'd he go",
  "after.moment.brb.chat.2": "he's back!!",
  "after.moment.brb.chat.3": "never even left the tab",
  "after.moment.brb.chat.4": "thought he crashed",
  "after.moment.brb.chat.5": "kept playing over here",

  "preview.badge": "ILLUSTRATIVE PREVIEW",
  "preview.chat.compose": "Reply to everyone at once…",
  "preview.chat.compose.send": "send",
  // Handles de exemplo — mesmos nomes da seção de proteção, pra a página parecer
  // um chat só.
  "preview.chat.msg.1.from": "gabizera",
  "preview.chat.msg.1.text": "yo yo, just got here!",
  "preview.chat.msg.2.from": "Marcos L.",
  "preview.chat.msg.2.text": "audio's clean today 👏",
  "preview.chat.msg.3.from": "duduxx",
  "preview.chat.msg.3.text": "let's gooo!!",
  "preview.chat.platforms": "3 platforms",
  "preview.chat.title": "Unified chat",
  "preview.cta": "GO LIVE",
  "preview.figure.alt":
    "Illustrative preview of the Corneta app on the “Live” screen: the OBS signal goes out to Twitch, YouTube and Kick, each destination with its own quality and its own switch, with chat from all three platforms gathered beside it.",
  // Têm que bater com a Sidebar do app (sidebar.nav.*).
  "preview.nav.chat.hint": "every chat in one place",
  "preview.nav.chat.label": "Chat",
  "preview.nav.encoding.hint": "how good it looks",
  "preview.nav.encoding.label": "Quality",
  "preview.nav.golive.hint": "puts it all on air",
  "preview.nav.golive.label": "Live",
  "preview.nav.platforms.hint": "where your stream lands",
  "preview.nav.platforms.label": "Platforms",
  "preview.nav.reports.badge": "new",
  "preview.nav.reports.hint": "how the stream went",
  "preview.nav.reports.label": "Reports",
  "preview.panel.title": "stream panel",
  "preview.settings": "Settings",
  "preview.stat.headroom": "headroom",
  "preview.stat.headroom.value": "easy",
  "preview.stat.needed.value": "18.5 Mb/s",
  "preview.stat.needed": "the stream needs",
  "preview.stat.upload.value": "25 Mb/s",
  "preview.stat.upload": "your upload",
  "preview.state.offAir": "Off air",
  // "Cópia" = passa o vídeo do OBS sem recodificar. Mesma palavra da tela
  // Qualidade do app (encoding.target.override.copy).
  "preview.target.copy": "Copy",
  "preview.titlebar.tag": "multi-stream",

  "protection.alerts.chip.bits": "bits",
  "protection.alerts.chip.member": "member",
  "protection.alerts.chip.subgift": "subgift",
  "protection.alerts.chip.tip": "tip",
  "protection.alerts.demo.example": "example",
  "protection.alerts.demo.label": "live alerts",
  "protection.alerts.item.follow.meta": "Twitch · just now",
  "protection.alerts.item.follow.title": "lucasrmk followed you",
  "protection.alerts.item.raid.meta":
    "Twitch · brought new people into the chat",
  // O handle do pt lê como frase ("canal do Zé") — em inglês vira um handle de
  // verdade, no mesmo formato dos outros exemplos desta tela.
  "protection.alerts.item.raid.title": "zeke_tv raided you",
  "protection.alerts.item.sub.amount": "3 months",
  "protection.alerts.item.sub.meta":
    "Twitch · tier 1 · “been here since day one!”",
  "protection.alerts.item.sub.title": "ana.play subscribed",
  // valor de exemplo; mantive uma quantia que soa natural de superchat em dólar. Se a LP em inglês tiver que mostrar moeda BR, decisão humana
  "protection.alerts.item.superchat.amount": "$5",
  "protection.alerts.item.superchat.meta":
    "YouTube · “walk us through your setup!”",
  "protection.alerts.item.superchat.title": "Superchat from Marcos L.",
  "protection.alerts.note":
    "Follows, subs, resubs, subgifts, bits, raids, members and superchats come straight from the platforms. Donations and goals come in through Streamlabs or StreamElements, with the token kept in Windows Credential Manager. The panel sits next to the chat — or in its own little window, on top of the game.",
  "protection.body":
    "Four nets you turn on (or don't) in Settings. Each one costs you something — and Corneta tells you what it costs before you go live, not in the middle of it.",
  // aria-label: funcional, descreve o que a arte é
  "protection.brb.art.aria": "The BE RIGHT BACK screen Corneta puts on air",
  // nome do produto, inalterado
  "protection.brb.art.brand": "CORNETA · MULTI-STREAM",
  // "segura a corneta" é "segura as pontas" com o nome do produto no lugar; em
  // inglês a expressão some e "hold the horn" mantém a imagem do 📣 ao lado.
  // TEM QUE SER IGUAL a `brb.slate.subtitle` do app: esta arte é o retrato do
  // cartão que vai ao ar de verdade, não uma ilustração livre.
  "protection.brb.art.line": "back in a sec — hold the horn 📣",
  // Igual a `brb.slate.title` do app — é o mesmo cartão.
  "protection.brb.art.title": "BE RIGHT BACK",
  "protection.brb.body":
    "If OBS drops mid-stream, this screen goes on air without dropping the platforms — from the viewer's side the stream doesn't even blink, and it comes back on its own when the signal returns. It also works for a manual break: one click and you're out of the chair with the mic muted.",
  "protection.brb.note": "Use Corneta's BE RIGHT BACK screen or your own image or video",
  "protection.brb.title":
    "“BE RIGHT BACK”: the signal drops, the stream keeps going",
  "protection.chat.body":
    "Read, reply and moderate without switching windows. Alerts from the platforms and from Streamlabs in the same panel. And an overlay you paste into OBS once and forget.",
  "protection.chat.demo.example": "example",
  "protection.chat.demo.label": "chat in one feed · 3 platforms",
  "protection.chat.input.placeholder": "Say something…",
  "protection.chat.input.sendAll": "send to all platforms",
  "protection.chat.kicker": "Everyone in one feed",
  "protection.chat.msg.1.action.delete": "delete",
  "protection.chat.msg.1.action.reply": "reply",
  "protection.chat.msg.1.action.timeout": "timeout",
  "protection.chat.msg.1.badge": "mod",
  // handle de exemplo, fica como está
  "protection.chat.msg.1.name": "gabizera",
  "protection.chat.msg.1.text": "yo yo, just got here!",
  "protection.chat.msg.2.badge": "member",
  // nome de exemplo, fica como está
  "protection.chat.msg.2.name": "Marcos L.",
  "protection.chat.msg.2.text": "audio's clean today 👏",
  // handle de exemplo, fica como está
  "protection.chat.msg.3.name": "duduxx",
  // "cornetar" carrega o nome do produto; em inglês o trocadilho morre. Fica a versão funcional — mesma energia de chat, sem forçar "let's corneta"
  "protection.chat.msg.3.text": "let's gooo!!",
  // handle de exemplo, fica como está
  "protection.chat.msg.4.name": "bot_spam_xyz",
  "protection.chat.msg.4.text": "message removed by a mod",
  "protection.chat.note":
    "Twitch, Kick and YouTube in the same feed — up to two Twitch channels at once. BTTV, FFZ and 7TV emotes, badges, timestamps and one field to send from. Delete and time out right in the feed: the message turns into a tombstone instead of vanishing with no explanation and leaving you in the dark.",
  "protection.chat.tabs.alerts.hint": "who showed up and chipped in",
  "protection.chat.tabs.alerts.title": "Alerts",
  "protection.chat.tabs.chat.hint": "read, reply, moderate",
  "protection.chat.tabs.chat.title": "Unified chat",
  // aria-label da tablist — funcional, sem piada
  "protection.chat.tabs.label": "Chat, alerts and overlay",
  "protection.chat.tabs.overlay.hint": "one URL, once",
  "protection.chat.tabs.overlay.title": "Overlay for OBS",
  "protection.chat.title":
    "Nobody's left talking to themselves in a tab you never opened.",
  "protection.guard.audio.body":
    "Corneta evens out your audio before it goes out — no “can't hear you” from chat, no blown-out ears when you switch scenes, in the same encode that was already running.",
  "protection.guard.audio.cost":
    "If you already normalize in OBS, leave this off so the two don't fight.",
  "protection.guard.audio.switch": "optional",
  "protection.guard.audio.title": "Audio normalizer",
  "protection.guard.bitrate.body":
    "If your internet chokes, Corneta drops the video quality for a while instead of letting the stream stutter or die — and brings it back up on its own.",
  "protection.guard.bitrate.cost":
    "Only works on the platforms being re-encoded; the ones getting a straight copy go out exactly the way OBS sent them.",
  "protection.guard.bitrate.switch": "on by default",
  "protection.guard.bitrate.title": "Auto-bitrate",
  "protection.guard.privacy.body":
    "You list the words that can't leak — email, real name, address. If one of them shows up on screen, Corneta cuts to BE RIGHT BACK before it goes on air.",
  "protection.guard.privacy.cost":
    "Costs 12s of delay on the whole stream (the chat too). Safety net, not a guarantee.",
  "protection.guard.privacy.switch": "experimental",
  "protection.guard.privacy.title": "Privacy guard",
  "protection.kicker": "Safety nets",
  "protection.overlay.alert": "ana.play subscribed · tier 1",
  "protection.overlay.camera": "camera",
  "protection.overlay.chat.1": "gabizera: yo yo!",
  "protection.overlay.chat.2": "Marcos L.: audio's clean",
  // mesma linha do feed de chat — tem que bater com protection.chat.msg.3.text
  "protection.overlay.chat.3": "duduxx: let's gooo!!",
  "protection.overlay.demo.example": "example",
  "protection.overlay.demo.label": "your OBS scene",
  // “Browser Source” está dentro de <strong> no meio da frase — manter o nome do OBS em inglês, como já está
  "protection.overlay.note":
    "A local server puts the alerts and the chat (emotes and all) on a URL you add as a Browser Source — once, and Corneta can even create the source in OBS for you. Position, size, duration, sound, how many messages stay on screen and hiding commands (“!”) are all adjustable. There's a test alert button so you can check it without waiting for anyone.",
  "protection.overlay.scene": "scene · your usual stream",
  // aparece nos dois campos de URL
  "protection.overlay.url.copy": "copy",
  "protection.title": "Your stream shouldn't end because OBS froze.",

  // ---- quality ----
  "quality.desk.demolabel.estimate": "app's estimate",
  "quality.desk.demolabel.platforms": "4 platforms hooked up",
  "quality.desk.summary.encodes": "conversions",
  "quality.desk.summary.load": "estimated load",
  "quality.desk.summary.upload": "total upload",
  // aria-label do tablist: funcional, sem graça.
  "quality.desk.tablist.label": "Quality modes",
  "quality.desk.tag.convert": "Convert",
  "quality.desk.tag.copy": "Copy",
  "quality.desk.tag.unusable": "Won't work",
  // "caprichada" vira "looking great" — o adjetivo some no nome do modo (All out), e aqui o que importa é a conta que vem depois.
  "quality.heading.body":
    "Your stream can go out looking great on every platform without frying your PC — but that's a choice, and it costs you upload and GPU. You see that bill before you go live, not halfway through it. Here's what changes in each mode:",
  "quality.heading.kicker": "How good it looks on each platform",
  "quality.heading.title":
    "The same picture for every platform, or one sized for each.",
  // "gravação" vira "the VOD": é o nome que o streamer usa em inglês e é coisa que existe na tela.
  "quality.journey.after.body":
    "It's not a pile of loose numbers: Corneta cross-checks what your machine, your OBS and each platform did, then points at the likely cause of every stutter — with the minute to jump to in the VOD and what to change so it doesn't happen again.",
  "quality.journey.after.sticker": "After the stream",
  "quality.journey.after.title":
    "Find out why it stuttered — and what to change.",
  "quality.journey.before.body":
    "Hook up the platforms, measure your upload and get everything ready in a few clicks. Corneta sets OBS up for you — and hits play on it when you press GO LIVE.",
  "quality.journey.before.check.checklist": "First-stream checklist",
  "quality.journey.before.check.obs": "Guided OBS setup",
  "quality.journey.before.check.upload": "A real upload test",
  "quality.journey.before.stat.caption":
    "enough for three platforms, with room to spare",
  "quality.journey.before.stat.label": "your upload · example",
  "quality.journey.before.stat.value": "25 Mb/s",
  "quality.journey.before.sticker": "Before the stream",
  // Primeira ocorrência sempre visível do nome — glosa aqui. "frio na barriga" vira "that pit in your stomach": mesmo registro falado, mesmo medo.
  "quality.journey.before.title":
    "Get to GO LIVE without that pit in your stomach.",
  "quality.journey.during.body":
    "Bitrate, fps, dropped frames and time on air for each platform, plus real CPU and GPU load. You can pause one without ending the others — and whichever one drops comes back on its own.",
  "quality.journey.during.sticker": "During the stream",
  "quality.journey.during.title":
    "One glance out of the corner of your eye and back to the game.",
  "quality.journey.kicker": "From setup to the report",
  "quality.journey.title": "Before, during and after — all in the same window.",
  "quality.mode.caprichado.encodes": "4 (on the GPU)",
  "quality.mode.caprichado.lead":
    "Best picture each platform can take, but it's the heaviest.",
  "quality.mode.caprichado.tag": "Max quality",
  // "Caprichado" carrega "capricho" — substantivo abstrato proibido em inglês. "All out" (ir com tudo) é curto, falado, e já avisa que pesa, que é justame
  "quality.mode.caprichado.title": "All out",
  "quality.mode.caprichado.upload": "24.6 Mb/s",
  "quality.mode.caprichado.verdict":
    "YouTube gets all 9000 kbps it can take and every platform gets the best picture it can show — but your upload and your GPU pay for it. You see that total before you hit GO LIVE.",
  "quality.mode.esperto.encodes": "1 (on the GPU)",
  "quality.mode.esperto.lead":
    "Only touches the platforms that need it. Figures it out on its own.",
  "quality.mode.esperto.tag": "Recommended",
  // "Esperto" é o malandro que resolve sem fazer força. "Smart" mantém curto e é o que o modo faz (decide sozinho). "Savvy" ficou mais perto do sabor, mas
  "quality.mode.esperto.title": "Smart",
  "quality.mode.esperto.upload": "21.6 Mb/s",
  "quality.mode.esperto.verdict":
    "One conversion, just for the vertical feed. The rest goes out as a copy: your machine barely feels it and nobody loses quality along the way.",
  "quality.mode.lata.encodes": "none",
  "quality.mode.lata.lead":
    "The same picture goes to every platform, at the same settings.",
  "quality.mode.lata.load": "almost none",
  "quality.mode.lata.row.tiktok.detail": "gets landscape video",
  "quality.mode.lata.tag": "Lightest",
  // "Na lata" é "sem rodeio, do jeito que é" — e o modo manda o mesmo sinal cru pra todo mundo. "Straight up" é curto, falado e diz as duas coisas. Descar
  "quality.mode.lata.title": "Straight up",
  // vírgula decimal vira ponto.
  "quality.mode.lata.upload": "12.6 Mb/s",
  "quality.mode.lata.verdict":
    "TikTok is the weakest one on the list, so everybody drops to its bitrate — and it still gets landscape video. Corneta shows you that damage before you go live, with the fix one click away.",
  "quality.vertical.body":
    "TikTok and Instagram only take vertical video. Instead of building a second scene and streaming twice, Corneta crops a 9:16 out of what's already on air — and you pick the framing by dragging the box, watching it as you go.",
  "quality.vertical.check.crop": "9:16 crop with pan and zoom",
  "quality.vertical.check.rtmp": "Works with any vertical RTMP destination",
  "quality.vertical.note":
    "TikTok and Instagram are still experimental: getting in depends on the platform clearing you first.",
  "quality.vertical.title": "Your landscape stream going out vertical",

  // ---- steps ----
  "steps.accounts.kicker": "Signing in with your account",
  "steps.accounts.label.never": "What doesn't happen:",
  "steps.accounts.label.why": "What it's for:",
  "steps.accounts.lede":
    "You can just paste your stream key and be done. But connect your account and the app does the boring part for you: creates the stream, grabs the key and pulls the chat in. Here's exactly what each permission is for.",
  "steps.accounts.privacy.link": "privacy policy",
  "steps.accounts.privacy.text":
    "Access tokens sit in Windows Credential Manager, on your machine — not on our servers, because there's no Corneta account and no database with your name in it. You can revoke access any time on the platform itself, and uninstalling the app wipes what it put there. The details are in the",
  "steps.accounts.title": "What Corneta asks for — and what it does with it.",
  // Rótulo do botão, igual ao que o app mostra na tela.
  "steps.badge.golive": "GO LIVE",
  "steps.kicker": "From your streaming app to everyone watching",
  "steps.lede": "No terminal, no Docker, no server address to memorize.",
  "steps.local.body":
    "The heavy lifting happens on the machine that's already streaming. Settings, keys and reports stay with you — and even the OBS overlay is a server that only answers inside your own computer.",
  "steps.local.check.free": "Free, no sign-up",
  "steps.local.check.keys": "Keys in Windows Credential Manager",
  "steps.local.check.license": "Open source, MIT license",
  "steps.local.check.watermark": "No watermark",
  // "a conta" (o valor somado) vira "the math" pra casar com o rótulo "The honest math" logo acima.
  "steps.local.honest.body":
    "And bumping the quality for each one hits your graphics card or your CPU. Corneta measures your connection, adds it all up and shows you the math before you go live — not halfway through it.",
  "steps.local.honest.label": "The honest math",
  "steps.local.honest.title": "Every platform eats a chunk of your upload.",
  "steps.local.kicker": "Actually runs on your PC",
  "steps.local.proof.link": "See the code",
  "steps.local.proof.text":
    "Open source: you can open the repo and see exactly what the app does with your key.",
  "steps.local.title":
    "No monthly fee, because there's no Corneta server in the middle.",
  "steps.platforms.kicker": "From your channel to everywhere",
  "steps.platforms.lede":
    "The big four come ready, with each one's address already filled in. Add as many as you want — including any RTMP server that isn't on this list.",
  "steps.platforms.note.experimental.strong":
    "TikTok, Instagram and X are experimental.",
  "steps.platforms.note.experimental.text":
    "Whether you get in depends on each platform's approval and its own sign-up flow, so they might just not work for your account.",
  "steps.platforms.note.validation":
    "So far, Twitch is the only platform where we've documented a real stream end to end. The others are built into the app and still being tested in the open.",
  "steps.platforms.title": "The big four ready to go — the rest is on you.",
  "steps.title": "You go live in three steps.",
};
