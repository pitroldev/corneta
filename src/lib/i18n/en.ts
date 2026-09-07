// Desktop English dictionary. Follow docs/TOM-DE-VOZ.md; preserve placeholders, rich markup, units, and provider labels.
import type { Dict } from "./pt";

export const en: Dict = {
  "analysis.advice.app.cpu":
    "Close {app} before the next stream, or give it less to do (fewer tabs, nothing downloading). If it's a game, cap the frame rate or lower the physics.",
  "analysis.advice.app.gpu":
    "Leave some graphics-card headroom for OBS: if {app} is a game, cap the frame rate or lower shadows and effects; if it isn't, close it before the stream.",
  "analysis.advice.app.memory":
    "Before the stream, close tabs and apps you're not using. If {app} keeps growing, close and reopen it before you go live.",
  "analysis.advice.encoding":
    "In OBS, lower the resolution or frame rate under Settings → Video. If available, pick your graphics-card encoder under Settings → Output.",
  "analysis.advice.local":
    "Restart OBS and Corneta before the next stream. If it happens again, check that only one OBS is sending video to Corneta.",
  "analysis.advice.network":
    "Test your upload before the next stream. If it is fluctuating, lower the bitrate on the Quality screen or remove one platform.",
  "analysis.advice.platform":
    "Check that channel's stream key and the platform status page. If it happens again only there, reconnect the account.",
  "analysis.advice.render":
    "Lighten that scene in OBS: disable hidden sources, use fewer filters and avoid several animated videos at once.",
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
  "analysis.cause.platform": "The connection to {target} became unstable",
  "analysis.cause.render": "OBS took too long to assemble the picture",
  "analysis.cause.signal": "Video stopped arriving from OBS",
  "analysis.cause.unknown": "There isn't enough data to name a cause yet",
  "analysis.confirm.unknown":
    "Next stream, open this report again: if the stretch doesn't come back, it was a one-off.",
  "analysis.confirm.app.gpu":
    "Do a short stream with {app} capped on frame rate or closed. If the next report doesn't show OBS skipping frames, that was it.",
  "analysis.confirm.app.cpu":
    "Do a short stream without {app} open. If the next report comes out clean, that was it.",
  "analysis.confirm.app.memory":
    "Close and reopen {app} before the next stream. If memory stays off the ceiling on the machine chart, that was it.",
  "analysis.confirm.render":
    "Take one heavy source out of the scene (browser, camera with filters) and do a short stream. If OBS stops skipping frames, it was the scene.",
  "analysis.confirm.encoding":
    "Lower the resolution or frame rate in OBS and do a short stream. If OBS stops skipping frames, the video was too heavy for the PC.",
  "analysis.confirm.local":
    "Restart OBS and Corneta before the next stream. If the stretch doesn't come back, that was it.",
  "analysis.confirm.network":
    "Test your upload on the Quality screen before the next stream. If it wobbles there, the connection is the spot.",
  "analysis.confirm.platform":
    "Next stream, watch whether it's only {target} again. Twice in a row on the same platform is the platform; if it moves, it's your route.",
  "analysis.confirm.signal":
    "Check that OBS stayed open and pointed at Corneta. If the stretch lines up with a scene switch or OBS freezing, that's where it is.",
  "analysis.event.cpuHigh": "CPU at {pct}%",
  "analysis.event.end": "Stream ended",
  "analysis.event.error": "{target} hit an error",
  "analysis.event.marker": "📍 {label}",
  "analysis.event.reconnect": "{target} reconnected",
  "analysis.event.recover": "{target} came back",
  "analysis.event.signalLost": "{target} lost the OBS signal",
  "analysis.event.start": "Stream started",
  "analysis.highlight.bits": "{user}: {n} bits",
  "analysis.highlight.chatSpike": "Chat blew up ({rate}/min)",
  "analysis.highlight.raid": "Raid from {user} (+{n})",
  "analysis.highlight.subgift": "{user} gifted {n} subs",
  "analysis.highlight.superchat": "Big Super Chat from {user}",
  "analysis.highlight.viewerJump": "+{delta} people showed up at once",
  "analysis.parse.alert.userFallback": "someone",
  "analysis.parse.marker.labelFallback": "Marker",
  "analysis.recap.bestMoment": "Best moment",
  "analysis.signal.appCpu": "{app} reached {pct}% of the processor",
  "analysis.signal.appGpu": "{app} reached {pct}% of the graphics card",
  "analysis.signal.appMemory": "{app} used {gb} GB of memory",
  "analysis.signal.bitrateDrop": "The outgoing quality dropped in this stretch",
  "analysis.signal.cpu": "The processor reached {pct}%",
  "analysis.signal.gpu": "The graphics card reached {pct}%",
  "analysis.signal.memory": "Memory reached {pct}%",
  "analysis.signal.obsCongested":
    "The feed from OBS to Corneta became constrained ({pct}%)",
  "analysis.signal.obsRender": "OBS took up to {ms} ms to assemble each frame",
  "analysis.signal.obsSignalLost": "OBS stopped sending video",
  "analysis.signal.outputSkipped":
    "OBS couldn't prepare {count} frames for delivery",
  "analysis.signal.reconnected": "{targets} had to reconnect",
  "analysis.signal.renderSkipped":
    "OBS couldn't assemble {count} frames in time",
  "analysis.signal.targetDropped":
    "The platforms lost {count} frames in this stretch",
  "analysis.verdict.app.detail":
    "Across {n} {stretch}, {app} competed with the video at the same time frames fell behind.{brief}",
  "analysis.verdict.app.title": "{app} left too little room for the stream",
  // Preserve the leading space: this optional fragment follows another sentence.
  "analysis.verdict.brief":
    " It was quick ({sec}s in total) — chances are nobody watching even noticed.",
  "analysis.verdict.clean.detail": "Didn't spot any trouble in this one.",
  "analysis.verdict.clean.title": "Clean stream",
  "analysis.verdict.encoding.detail":
    "Across {n} {stretch}, OBS couldn't prepare every frame in time.{brief} Lower the resolution or frame rate in OBS to leave more headroom.",
  "analysis.verdict.encoding.title":
    "The video became too heavy for the computer",
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
  "analysis.verdict.signal.detail":
    "{n} {stretch} with no video coming in from OBS — everyone watching was stuck on a frozen frame.",
  "analysis.verdict.signal.title": "The OBS signal dropped",
  "analysis.verdict.windows.detail": "Check the details for each one below.",
  "analysis.verdict.windows.title": "{n} {patch}",
  "analysis.why.delay.same": "At the same moment,",
  "analysis.why.delay.after": "{sec}s later,",
  "analysis.why.app.gpu": "{app} held {pct}% of the graphics card",
  "analysis.why.app.cpu": "{app} held {pct}% of the processor",
  "analysis.why.app.memory":
    "{app} reached {gb} GB with the PC's memory at {pct}%",
  "analysis.why.effect.render":
    "{delay} OBS skipped {count} frames while assembling the scene",
  "analysis.why.effect.encode": "{delay} OBS couldn't encode {count} frames",
  "analysis.why.effect.renderLag":
    "{delay} OBS started taking up to {ms} ms per frame",
  "analysis.why.effect.dropped":
    "{delay} the platforms went without {count} frames",
  "analysis.why.mech.render":
    "OBS skipped {count} frames while assembling the scene",
  "analysis.why.mech.encode": "OBS couldn't encode {count} frames",
  "analysis.why.mech.renderLag": "OBS started taking up to {ms} ms per frame",
  "analysis.why.mech.dropped": "The platforms went without {count} frames",
  "analysis.why.scope.pcOnly":
    "Your connection and the platforms stayed fine — the bottleneck was inside the PC",
  "analysis.why.scope.allTargets": "Every platform felt it at the same time",
  "analysis.why.scope.oneTarget":
    "Only {target} felt it; the others stayed fine",
  "analysis.why.machine.gpu":
    "The graphics card was at {pct}%, but no single app explains it",
  "analysis.why.machine.cpu":
    "The processor was at {pct}%, but no single app explains it",
  "analysis.why.machine.memory": "The PC's memory was at {pct}%",
  "analysis.why.machine.headroom":
    "The graphics card and processor had headroom",
  "analysis.why.own.obs.gpu": "OBS itself reached {pct}% of the graphics card",
  "analysis.why.own.obs.cpu": "OBS itself reached {pct}% of the processor",
  "analysis.why.own.corneta.gpu":
    "Corneta itself reached {pct}% of the graphics card",
  "analysis.why.own.corneta.cpu":
    "Corneta itself reached {pct}% of the processor",
  "analysis.why.local.congested":
    "The feed from OBS to Corneta was held back at {pct}%",
  "analysis.why.local.beforeInternet":
    "This happens before the video leaves the PC — your connection and the platforms aren't part of it",
  "analysis.why.network.reconnect": "{targets} reconnected at the same time",
  "analysis.why.network.bitrate":
    "The outgoing quality dropped for every platform at once",
  "analysis.why.network.pcFine":
    "OBS and the PC were fine — the trouble started after the video left here",
  "analysis.why.network.limit":
    "With this data I can't tell your connection, the route and the platform apart",
  "analysis.why.platform.limit":
    "It could be the route to {target} or the platform itself — this data can't separate the two",
  "analysis.why.signal.stopped": "OBS stopped sending video to Corneta",
  "analysis.why.signal.blank":
    "Every platform went without a picture at the same time",
  // patch stands alone; stretch takes a qualifier. Preserve both placeholder families.
  "analysis.verdict.patch.one": "rough patch",
  "analysis.verdict.patch.other": "rough patches",
  "analysis.verdict.stretch.one": "stretch",
  "analysis.verdict.stretch.other": "stretches",

  // This copy appears on air to viewers, not only in the app.
  "brb.slate.subtitle": "back in a sec — hang tight 📣",
  "brb.slate.title": "BE RIGHT BACK",

  "chat.account.brokerError":
    "Corneta's official sign-in is down: {error}. You can sign in with your own credentials under advanced options.",
  "chat.account.byok.hide": "hide advanced options",
  "chat.account.byok.show": "use my own credentials",
  "chat.account.desktopOnly": "Only in the installed app.",
  "chat.account.footer":
    "Without signing in, Corneta reads the chat but can't send messages or time anyone out.",
  "chat.account.kick.forgot.toast": "Deleted your Kick credentials",
  "chat.account.kick.official.toast": "Kick's official sign-in is back on",
  "chat.account.kick.ownCreds.toast": "Using your own Kick credentials 🔒",
  "chat.account.needChannel":
    "Add a **Twitch**, **YouTube** or **Kick** channel in the Channels tab to sign in.",
  "chat.account.privacy.link": "Privacy policy",
  "chat.account.privacy.text":
    "Corneta uses your account only for what's in the {link}. You can disconnect whenever you want.",
  "chat.account.youtube.forgot.toast": "Deleted your YouTube credentials",
  "chat.account.youtube.official.toast":
    "YouTube's official sign-in is back on",
  "chat.account.youtube.ownCreds.toast":
    "Using your own YouTube credentials 🔒",
  "chat.action.configure": "Set up",
  "chat.action.connect": "Connect",
  "chat.action.connect.needChannel": "Add a channel first",
  "chat.action.disconnect": "Disconnect",
  "chat.action.popout": "Pop out",
  "chat.action.popout.title":
    "A little chat window that sits on top of everything.",
  "chat.action.reconnect": "Reconnect",
  "chat.action.reconnect.title": "Reconnects the sources that dropped.",
  "chat.alerts.button": "Alerts",
  "chat.alerts.button.count": "Alerts ({n})",
  "chat.alerts.clear.confirmLabel": "Clear?",
  "chat.alerts.clear.confirmTitle": "Click again to confirm",
  "chat.alerts.clear.title": "Clear alerts",
  "chat.alerts.newPulse": "New alert just came in!",
  "chat.alerts.sourceDown":
    "{source} dropped — check the token under Set up → Alert sources",
  "chat.alertsrc.add": "Add source",
  "chat.alertsrc.collapse": "Collapse source",
  "chat.alertsrc.empty":
    "No alert sources yet. Add **Streamlabs** or **StreamElements** to see donations.",
  "chat.alertsrc.expand": "Expand source",
  "chat.alertsrc.hint.streamelements":
    'StreamElements → your profile → Channels → "Show secrets" → JWT Token. ⚠️ It expires every ~2 weeks — just paste a new one.',
  "chat.alertsrc.hint.streamlabs":
    'Streamlabs → Account Settings → API Settings → "Your Socket API Token". Picks up donations, follows, subs and bits.',
  "chat.alertsrc.lede":
    "Paste your **Streamlabs** or **StreamElements** token — donations land in the Alerts feed.",
  "chat.alertsrc.noToken": "no token",
  "chat.alertsrc.remove": "Remove source",
  "chat.alertsrc.replace": "Replace",
  "chat.alertsrc.section": "Alert sources",
  "chat.alertsrc.status.dropped": "dropped",
  "chat.alertsrc.status.error": "error",
  "chat.alertsrc.status.live": "live",
  "chat.alertsrc.tokenSaved": "token saved",
  "chat.alertsrc.tokenStored.chip": "Token in Windows Credential Manager",
  "chat.alertsrc.tokenStored.toast":
    "Saved your token in Windows Credential Manager 🔒",
  "chat.autoconnect.hint": "So you don't have to click Connect every stream.",
  "chat.autoconnect.label": "Connect the chat for me when I go live",
  "chat.byok.forget": "forget my credentials",
  "chat.byok.officialDown":
    "(the official one didn't answer last time I checked — your credentials stay saved either way)",
  "chat.byok.useOfficial": "Go back to Corneta's official sign-in",
  "chat.byok.useSaved": "Use the credentials I already saved",
  "chat.channels.add": "Add channel",
  "chat.channels.empty":
    "No channels yet. Add one from **Twitch**, **Kick**, **YouTube** or **Cinefy (experimental)** — you can add more than one from the same platform (two Twitch channels, say).",
  "chat.channels.section": "Channels",
  "chat.channels.which": "Which one?",
  "chat.clear": "Clear",
  "chat.clear.confirm": "Clear for real?",
  "chat.common.cancel": "Cancel",
  "chat.common.copied": "Copied",
  "chat.common.copy": "Copy",
  "chat.common.paste": "Paste",
  "chat.common.removeConfirm": "Remove for real?",
  "chat.common.save": "Save",
  "chat.common.test": "Test",
  "chat.common.testing": "Testing…",
  "chat.config.tab.account": "Account",
  "chat.config.tab.alerts": "Alerts",
  "chat.config.tab.channels": "Channels",
  "chat.config.tab.display": "Display",
  "chat.config.tab.overlays": "Overlays",
  "chat.config.title": "Set up the chat",
  "chat.display.alertFontSize": "Alert font size",
  "chat.display.badges": "Badges",
  "chat.display.badges.hint": "sub/mod/VIP badges",
  "chat.display.chatFontSize": "Chat font size",
  "chat.display.emotes": "Emotes",
  "chat.display.emotes.hint": "pictures instead of :code:",
  "chat.display.platform": "Platform",
  "chat.display.platform.hint": "which platform it came from",
  "chat.display.section": "What to show in the feed",
  "chat.display.source": "Channel",
  "chat.display.source.hint": "handy with 2+ channels on the same platform",
  "chat.display.timestamps": "Time",
  "chat.display.timestamps.hint": "when the message came in",
  "chat.display.viewers": "Who's watching",
  "chat.display.viewers.hint": "viewer count",
  "chat.error.connect": "Couldn't connect the chat — check your channels.",
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
  "chat.header.kicker": "Everyone in one feed",
  "chat.header.subtitle":
    "Twitch, Kick, YouTube and experimental Cinefy in the same feed — up to two Twitch channels.",
  "chat.header.title": "Unified chat",
  "chat.kick.creds.openDeveloper": "open Developer",
  "chat.kick.creds.redirect":
    "Use the redirect **http://localhost:7395/callback**. The secret only ever goes into Windows Credential Manager.",
  "chat.kick.creds.saved.toast":
    "Saved your Kick credentials in Windows Credential Manager 🔒",
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
  "chat.loginrow.signedIn": "signed in",
  "chat.loginrow.signedInAs": "signed in as @{login}",
  "chat.loginrow.signin": "Sign in",
  "chat.loginrow.signout": "Sign out",
  "chat.loginrow.unavailable": "not available in this build",
  "chat.loginrow.waiting": "waiting…",
  "chat.mod.action.ban": "Ban",
  "chat.mod.action.delete": "Delete",
  "chat.mod.action.timeout": "Time out 10 min",
  "chat.mod.banned": "Banned them",
  "chat.mod.deleted": "Deleted that message",
  "chat.mod.timeout": "Timed them out",
  "chat.overlay.addToObs": "Add to OBS",
  "chat.overlay.added.toast": "Added the {block} overlay to OBS",
  "chat.overlay.aria.alertPosition": "Alert overlay position",
  "chat.overlay.aria.alertSize": "Alert overlay size",
  "chat.overlay.aria.badges": "Badges",
  "chat.overlay.aria.chatPosition": "Chat overlay position",
  "chat.overlay.aria.fade": "Fade out after",
  "chat.overlay.aria.hideCommands": "Hide commands",
  "chat.overlay.aria.maxMessages": "Maximum messages",
  "chat.overlay.block.alerts": "Alerts",
  "chat.overlay.block.chat": "Chat",
  "chat.overlay.chatPos.bottom": "Bottom (scrolls up)",
  "chat.overlay.chatPos.top": "Top (scrolls down)",
  "chat.overlay.fetchError":
    "Overlay's on, but I couldn't fetch the URLs — try again.",
  "chat.overlay.lede":
    "A local server that puts your **alerts** and **chat** (emotes and all) into OBS. Add the URL as a **Browser Source** — just once.",
  "chat.overlay.opt.badges": "Badges (mod/sub)",
  "chat.overlay.opt.duration": "Time on screen",
  "chat.overlay.opt.fade": "Fade out after (0 = never)",
  "chat.overlay.opt.follows": "Show followers",
  "chat.overlay.opt.fontSize": "Font size",
  "chat.overlay.opt.hideCommands": "Hide commands (!)",
  "chat.overlay.opt.maxMessages": "Max messages",
  "chat.overlay.opt.platformIcon": "Platform icon",
  "chat.overlay.opt.position": "Position",
  "chat.overlay.opt.size": "Size",
  "chat.overlay.opt.sound": "Sound when it pops up",
  "chat.overlay.pos.bottom": "Bottom",
  "chat.overlay.pos.bottomLeft": "Bottom left",
  "chat.overlay.pos.bottomRight": "Bottom right",
  "chat.overlay.pos.center": "Center",
  "chat.overlay.pos.top": "Top",
  "chat.overlay.pos.topLeft": "Top left",
  "chat.overlay.pos.topRight": "Top right",
  "chat.overlay.reAddNote":
    "Changed an option? Hit **Add to OBS** again (or update the source URL over there).",
  "chat.overlay.reopenTab": "Overlay's on — reopen this tab to see the URLs.",
  "chat.overlay.scale.lg": "Large",
  "chat.overlay.scale.md": "Medium",
  "chat.overlay.scale.sm": "Small",
  "chat.overlay.section": "Overlays for OBS",
  "chat.overlay.starting": "Turning the overlay on…",
  "chat.overlay.test.alerts": "Sent a test alert — check OBS 📣",
  "chat.overlay.test.chat": "Sent a test message — check OBS",
  "chat.popout.alertFont": "Alert font",
  "chat.popout.alertsFirst": "Alerts before the chat",
  "chat.popout.bothLayout.arrangement": "Arrangement",
  "chat.popout.bothLayout.auto": "Auto",
  "chat.popout.bothLayout.col": "Stacked",
  "chat.popout.bothLayout.row": "Side by side",
  "chat.popout.bothLayout.section": "“Both” layout",
  "chat.popout.chatFont": "Chat font",
  "chat.popout.clear.chat": "Clear chat",
  "chat.popout.displaySettings": "Display settings",
  "chat.popout.divider": "Resize chat and alerts",
  "chat.popout.feed.hint.ready": "Click Connect to pull the chat in.",
  "chat.popout.feed.hint.setup":
    "Set up your channels in the main Corneta window, then connect from here.",
  "chat.popout.needSetup": "Set up your channels in the main Corneta window",
  "chat.popout.openMain": "Open Corneta",
  "chat.popout.tab.alerts": "Alerts",
  "chat.popout.tab.alerts.count": "Alerts {n}",
  "chat.popout.tab.both": "Both",
  "chat.popout.tab.chat": "Chat",
  "chat.popout.win.close": "Close",
  "chat.popout.win.maximize": "Maximize",
  "chat.popout.win.minimize": "Minimize",
  "chat.popout.win.restore": "Restore",
  "chat.popout.windowTitle": "Corneta chat",
  "chat.send.button": "Send",
  "chat.send.placeholder": "Say something",
  "chat.send.status.connect": "{label}: connect chat to sign in",
  "chat.send.status.invalidToken": "{label}: send token isn't valid",
  "chat.send.status.reconnect": "{label}: reconnect chat to sign in",
  "chat.send.status.signIn": "{label}: sign in to {platform}",
  "chat.send.status.signedIn": "{platform} signed in",
  "chat.send.target.aria": "Which platform to send to",
  "chat.send.target.all": "All",
  "chat.source.collapse": "Collapse channel",
  "chat.source.expand": "Expand channel",
  "chat.source.hint.kick":
    "The name in the link: kick.com/YOURNAME. Kick sometimes blocks reading the chat and it won't connect.",
  "chat.source.hint.cinefy":
    "The name in the Cinefy link. Experimental and read-only: it relies on undocumented endpoints that may change without notice.",
  "chat.source.hint.twitch":
    "Just the channel name — whatever comes after twitch.tv/.",
  "chat.source.hint.youtube": "Your channel (@handle, URL or ID).",
  "chat.source.nickname": "Nickname",
  "chat.source.nickname.optional": "(optional)",
  "chat.source.nickname.placeholder": "e.g. Pitrol",
  "chat.source.noChannel": "no channel",
  "chat.source.placeholder.kick": "e.g. xqc",
  "chat.source.placeholder.cinefy": "e.g. kett",
  "chat.source.placeholder.twitch": "e.g. pitrol",
  "chat.source.placeholder.youtube": "e.g. @yourchannel",
  "chat.source.platformLabel": "Platform",
  "chat.source.remove": "Remove channel",
  "chat.source.toggle": "Turn {name} on or off",
  "chat.source.value.kick": "Name in the link",
  "chat.source.value.cinefy": "Name in the link",
  "chat.source.value.twitch": "Channel",
  "chat.source.value.youtube": "Channel",
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
  "chat.status.label.live": "live",
  "chat.status.label.waiting": "waiting",
  "chat.status.ready": "All set — just hit Connect",
  "chat.status.ready.auto":
    "All set — click Connect, or just go live and I'll connect on my own",
  "chat.status.tooltip": "{source}: {explain}",
  "chat.viewers.count": "{n} watching",
  "chat.viewers.tooltip.hide":
    "Click to hide (turn it back on in the settings)",
  "chat.viewers.tooltip.row": "{source}: {n}",
  "chat.youtube.apikey.check": "Check",
  "chat.youtube.apikey.checking": "Checking…",
  "chat.youtube.apikey.label": "YouTube API key",
  "chat.youtube.apikey.optional": "· optional (nice to have)",
  "chat.youtube.apikey.placeholder": "paste your API key (Data API v3)",
  "chat.youtube.apikey.tooltip":
    "Corneta reads the chat without it. With it, you also get YouTube's “watching” count.",
  "chat.youtube.creds.guide.hide": "hide the guide",
  "chat.youtube.creds.guide.show": "how do I get these?",
  "chat.youtube.creds.saved.toast":
    "Saved your YouTube credentials in Windows Credential Manager 🔒",
  "youtube.recovery.open": "Recover YouTube",
  "youtube.recovery.loading": "Checking recovery for this installation…",
  "youtube.recovery.loadFailed":
    "I couldn't check the pending broadcast. Try again.",
  "youtube.recovery.none":
    "No pending broadcast in this installation. You can use YouTube autopilot again.",
  "youtube.recovery.pending":
    "Corneta hasn't confirmed that the previous broadcast ended. Retrying ends it if it is live on YouTube. If it hasn't started, cancel it in YouTube Studio and check again. Corneta never deletes broadcasts automatically.",
  "youtube.recovery.unknown":
    "The connection failed during creation and YouTube didn't confirm the outcome. Open YouTube Studio and end or cancel any pending broadcast created by Corneta before allowing another attempt.",
  "youtube.recovery.studio": "Open YouTube Studio",
  "youtube.recovery.stopFirst":
    "Stop streaming in Corneta before recovering YouTube.",
  "youtube.recovery.confirm":
    "I checked YouTube Studio and ended or cancelled the pending broadcasts created by Corneta.",
  "youtube.recovery.acknowledge": "Confirm review and allow another attempt",
  "youtube.recovery.retry": "Retry ending the pending broadcast",
  "youtube.recovery.check": "Check again",
  "chat.youtube.guide.step1":
    "Open the Google Cloud Console and create a project (any name works, say “Corneta”). When you're done, check up top that the new project is the one selected.",
  "chat.youtube.guide.step2":
    "In the **☰ menu → APIs & Services → Library**, search for **YouTube Data API v3** and click **Enable**.",
  "chat.youtube.guide.step3":
    "Still under **APIs & Services**, look for **OAuth consent screen** (newer versions call it **Audience** or **Branding**). If it asks for **User type**, pick **External** and move on.",
  "chat.youtube.guide.step4":
    "Fill in the **required fields**: **App name** (whatever you want), **User support email** (your email) and, further down, **Developer contact email** (your email again). Save and continue.",
  "chat.youtube.guide.step5":
    "Find the **Test users** section (it's on the **Audience** tab) and **add the email of your YouTube account**. Without that, the sign-in doesn't even work.",
  "chat.youtube.guide.step6":
    "Under **Credentials → Create credentials → OAuth client ID**, pick the type **TVs and Limited Input devices** and create it.",
  "chat.youtube.guide.step7":
    "Copy the **Client ID** and the **Client Secret** and paste them down here. ↓",
  "chat.youtube.guide.warn.label": "⚠️ Heads up:",
  "chat.youtube.guide.warn.text":
    "while your app stays in **“Testing”** mode — the normal thing, without going through Google's verification — the YouTube sign-in **expires every ~7 days**. When it drops, come back here and click **Sign in** again. That's why adding yourself as a **Test user** isn't optional (publishing/verifying the app is, and it's a lot more paperwork).",

  "components.app.censored.body":
    "The Privacy Guard is covering the picture. The stream returns once the segment is checked and no terms are detected. The Privacy Guard does not mute audio.",
  "components.app.censored.title": "BE RIGHT BACK on air",
  "components.app.leak.toast":
    '🛡️ "{snippet}" showed up on screen — so I cut to BE RIGHT BACK',
  "components.app.live.aria.censored":
    "BE RIGHT BACK is on air — picture covered by the Privacy Guard",
  "guardian.status.starting.title": "Preparing the Privacy Guard",
  "guardian.status.starting.body":
    "The picture stays covered until the first check. The Privacy Guard does not mute audio.",
  "guardian.status.unavailable.title":
    "The Privacy Guard could not check the picture",
  "guardian.status.unavailable.body":
    "Unchecked segments stay covered by BE RIGHT BACK. The picture returns after a valid check. The Privacy Guard does not mute audio. If this continues, end and restart the stream.",
  "guardian.status.starting.short": "Preparing",
  "guardian.status.unavailable.short": "Check unavailable",
  "components.app.live.aria.error": "The stream hit an error",
  "components.app.live.aria.live": "Live on every platform",
  "components.app.live.aria.live.down.one": "On air, but {count} platform down",
  "components.app.live.aria.live.down.other":
    "On air, but {count} platforms down",
  "components.app.live.aria.connectingTargets":
    "OBS connected; connecting to the platforms",
  "components.app.live.aria.starting": "Waiting for OBS to connect",
  "components.app.live.aria.stopped": "Off air",
  "components.app.loading.boot": "Opening your workbench…",
  "components.app.loading.error":
    "Couldn't read your settings. Try again — if it keeps happening, open the logs and send them my way.",
  "components.app.loading.screen": "Tuning this screen…",
  "components.firstLive.dismiss.aria": "Dismiss the guide",
  "components.firstLive.dismiss.title": "Dismiss the first-stream guide",
  "components.firstLive.step.golive": "GO LIVE",
  "components.firstLive.step.key": "Paste one platform's stream key",
  "components.firstLive.step.obs": "Connect OBS",
  "components.firstLive.title": "Your first stream in 3 steps",
  "components.legal.accept":
    "By continuing, you accept the {terms} and the {privacy}.",
  "components.legal.link.privacy": "Privacy policy",
  "components.legal.link.terms": "Terms of use",
  "components.onboarding.art.key.label": "your key",
  "components.onboarding.art.onair.label": "On air",
  "components.onboarding.back": "Back",
  "components.onboarding.dismissed.toast":
    "No rush — the tour lives in About → Replay the tour.",
  "components.onboarding.dot.aria": "Step {n}",
  "components.onboarding.legalUpdate.body":
    "We updated the Terms of use and the Privacy policy. Take a look at what changed — if you keep using Corneta, you're accepting the new version.",
  "components.onboarding.legalUpdate.cta": "Accept and continue",
  "components.onboarding.legalUpdate.title": "The terms changed",
  "components.onboarding.next": "Next",
  "components.onboarding.picker.note":
    "You can change this later. TikTok, X and your own RTMP server are on the Platforms screen.",
  "components.onboarding.picker.text":
    "Check the ones you stream on and Corneta gets the platforms ready — then you just paste each stream key.",
  "components.onboarding.picker.title": "Where do you stream?",
  "components.onboarding.skip": "Skip",
  "components.onboarding.skip.aria": "Skip the tour",
  "components.onboarding.start": "Let's get started",
  "components.onboarding.step1.text":
    "You send 1 stream out of OBS and Corneta pushes it out to Twitch, YouTube, Kick and more — all at once.",
  "components.onboarding.step1.title": "One stream, everywhere",
  "components.onboarding.step2.text":
    "Each platform becomes a destination with its own stream key — you just paste one for each.",
  "components.onboarding.step2.title": "Pick your platforms",
  "components.onboarding.step3.text":
    "On the Live screen, “Set it up for me” sets OBS up for you — no technical menus to dig through.",
  "components.onboarding.step3.title": "Hook up OBS",
  "components.onboarding.step4.text":
    "One click and you're live on all of them. Keep an eye on each platform's numbers.",
  "components.onboarding.step4.title": "Let the horn rip",
  "components.onboarding.step5.text":
    "Every chat in one place and, when you wrap up, a report on what choked.",
  "components.onboarding.step5.title": "Chat and reports",
  "components.onboarding.subtitle": "{n} steps, from OBS to the report.",
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
  "components.toaster.region.aria": "Notices",
  "components.ui.copied": "Copied",
  "components.ui.copy": "Copy",
  "components.ui.copy.aria": "Copy {label}",
  "components.ui.experimental.label": "experimental",
  "components.ui.experimental.title":
    "Experimental feature — we're still testing it, so it might break or change",
  "components.ui.hint.aria": "Help",
  "components.update.blocked.live":
    "You're live — installing now would kill the stream.",
  "components.update.check.busy": "Looking…",
  "components.update.check.cta": "Check for a new version",
  "components.update.check.error": "Couldn't check right now: {error}",
  "components.update.check.found":
    "Corneta {version} is out — the notice is up top.",
  "components.update.check.none":
    "Nothing new here — you're already on {version}.",
  "components.update.cta": "Update now",
  "components.update.cta.blocked.title":
    "Can't restart in the middle of a stream",
  "components.update.dismiss.aria": "Close the update notice",
  "components.update.dismiss.title":
    "Close the notice — I'll bring it back on the next check",
  "components.update.downloading": "Downloading…",
  "components.update.downloading.pct": "Downloading {pct}%",
  "components.update.headline": "Corneta {version} is out",
  "components.update.inProgress": "Corneta is updating",
  "components.update.installing": "Installing and restarting…",
  "components.update.install.error": "Couldn't install it: {error}",
  "components.update.installed.toast":
    "Installed it — close and reopen Corneta to finish.",
  "components.update.ready": "I'll install it and reopen in a second.",

  "core.auth.login.error.fallback": "couldn't log in",
  "core.chat.autoConnect.failed":
    "Couldn't connect the chat on my own — open the Chat screen and hit Connect.",
  "core.mesa.camera.blocked":
    "Couldn't open your camera and mic — Windows is blocking them. Unblock them in Windows privacy.",
  "core.mesa.camera.busy":
    "Couldn't open your camera — is another app using it? Close it and turn it on again.",
  "core.mesa.camera.failed":
    "Couldn't open your camera — check that no other program is using it.",
  "core.mesa.error.badInviteAddress":
    "The invite address isn't valid — ask your host for a new one.",
  "core.mesa.error.hostGone": "The Table dropped, or the host left for good.",
  "core.mesa.error.hostUnreachable":
    "Couldn't reach the host — are you two on the same network?",
  "core.mesa.error.joinRefused":
    "The Table turned you away — check the invite or ask the host for a new one.",
  "core.mesa.error.peerTaken":
    "Somebody already took your seat at the Table — hang on a sec and try again.",
  "core.mesa.invite.invalid": "That invite isn't valid. Check the code.",
  "core.mesa.invite.loopback":
    "That invite points at a local address. Ask the host for a new one.",
  "core.mesa.needsInstalledApp":
    "The Table needs the installed app (it runs a server on your PC).",
  "core.mesa.noLanNetwork":
    "No local network — I can't make an invite anybody can connect to.",
  "core.mesa.obs.addFailed":
    "Couldn't put the Table into OBS — check that OBS is open with WebSocket turned on.",
  "core.mesa.obs.added": "Put the Table into your OBS scene 🎥",
  "core.mesa.obs.connecting": "Connecting to the Table… try again in a sec.",
  "core.mesa.obs.layoutUpdateFailed":
    "Couldn't update your OBS layout — check that OBS is open.",
  "core.mesa.obs.layoutUpdated": "Updated your OBS layout",
  "core.mesa.obs.removeFailed":
    "Couldn't take the Table out of OBS — check that OBS is open.",
  "core.mesa.obs.removed": "Took the Table out of OBS.",
  "core.mesa.peer.unknownName": "guest",
  "core.mesa.server.startFailed":
    "Couldn't start the Table server — is there another Corneta open? Close it and try again.",
  "core.mock.alert.resub.message": "thanks for everything!",
  "core.mock.alert.superchat.message": "shout me out!",
  "core.mock.alert.tier.member": "Member",
  "core.mock.alertToken.ok": "demo: token works",
  "core.mock.captureFrame.unavailable":
    "grabbing a frame only works in the installed app, and only while you're live",
  "core.mock.chat.msg.1": "yo yo!",
  "core.mock.chat.msg.10": "📣📣📣",
  "core.mock.chat.msg.11": "you called it 📣",
  "core.mock.chat.msg.12": "GG",
  "core.mock.chat.msg.13": "anyone else freezing?",
  "core.mock.chat.msg.14": "run it back!",
  "core.mock.chat.msg.2": "lmaooo",
  "core.mock.chat.msg.3": "what's the build?",
  "core.mock.chat.msg.4": "first 🎉",
  "core.mock.chat.msg.5": "you lagging over there?",
  "core.mock.chat.msg.6": "audio's low",
  "core.mock.chat.msg.7": "great stream!",
  "core.mock.chat.msg.8": "shout out to Texas",
  "core.mock.chat.msg.9": "what game is this?",
  "core.mock.chat.self": "you",
  "core.mock.marker.twitchDropped": "Twitch dropped",
  "core.mock.target.test.ok": "demo: reachable",
  "core.mock.youtubeKey.ok": "demo: key works",
  "core.platform.custom.name": "Custom RTMP",
  "core.platform.custom.note":
    "You type the RTMP or RTMPS address — works for any compatible destination that isn't on the list.",
  "core.platform.facebook.note":
    "Only takes an encrypted connection (RTMPS). The old unprotected way is gone — the URL already filled in here is the right one.",
  "core.platform.instagram.note":
    "Instagram doesn't officially take a stream from outside — use a service that generates an RTMP URL for your profile, then paste the URL and the stream key here. Still experimental, and it can fail.",
  "core.platform.kick.note":
    "The stream key comes from your Kick creator dashboard. The URL is already filled in with the default server — if your dashboard shows a different one, just swap it here.",
  "core.platform.tagline.custom": "Any RTMP or RTMPS server",
  "core.platform.tagline.facebook": "Go live on a Page or a profile",
  "core.platform.tagline.instagram":
    "Vertical video — no official way in, so it can drop",
  "core.platform.tagline.kick": "Same deal as Twitch",
  "core.platform.tagline.tiktok":
    "Vertical video — your account has to be approved",
  "core.platform.tagline.twitch": "Your usual stream",
  "core.platform.tagline.x": "You grab the key in Media Studio",
  "core.platform.tagline.youtube": "Handles high quality just fine",
  "core.platform.tiktok.note":
    "Vertical video (720×1280, the shape of a phone screen). To go live, TikTok has to approve your account — and not everybody can get a stream key on their own.",
  "core.platform.twitch.note":
    "If you're not a partner, Twitch tops out around 6000 kbps. Its closest server to Brazil is in São Paulo — the closer you are, the fewer hiccups.",
  "core.platform.x.note":
    "The URL and the stream key come from X's Media Studio (Producer tab) — the link down here takes you there.",
  "core.platform.youtube.note":
    "Tell OBS to send a keyframe (the frame that restarts the picture) every 2s — 4s at most.",
  "core.profile.default.name": "Default",
  "core.target.issue.badUrl": "URL isn't valid — use rtmp:// or rtmps://",
  "core.target.issue.noKey": "no stream key",
  "core.target.issue.noName": "no name",
  "core.target.issue.noUrl": "no URL set",

  "encoding.band.cta.hybridOk": "Switch to Smart — it fits your upload",
  "encoding.band.cta.hybridWarn":
    "Switch to Smart — right at the edge, but it makes it",
  "encoding.band.fix.passthrough":
    "Turn the **Bitrate** down in OBS ({link}) or take a platform off.",
  "encoding.band.fix.passthrough.link": "see the guide →",
  "encoding.band.fix.tuning":
    "Turn the quality down in the {link}, or take a platform off.",
  "encoding.band.fix.tuning.link": "fine-tuning",
  "encoding.band.over.body":
    "This mode wants **{bitrate}** of upload, but I measured your internet at **{mbps} Mbps**. It's going to stutter mid-stream.",
  "encoding.card.upload.label": "Upload",
  "encoding.close": "Close",
  "encoding.encoder.cpu": "Processor (x264)",
  "encoding.encoder.gpu": "Graphics card ({label})",
  "encoding.encoders.error":
    "Couldn't check what this machine has for re-encoding — try again.",
  "encoding.encoders.loading": "Checking what this machine has…",
  "encoding.encoders.noHw":
    "No graphics card here — it runs on the processor, it just hits a lot harder.",
  "encoding.encoders.title": "What converts video on this machine",
  "encoding.encoders.unavailable.sr": "(not available on this machine)",
  "encoding.empty.cta": "Turn a platform on",
  "encoding.empty.title": "No platform is on",
  "encoding.fit.bad": "more than your upload can take",
  "encoding.fit.ok": "fits your upload with room to spare",
  "encoding.fit.warn": "right at the edge of your upload",
  "encoding.guide.badge.redo": "I convert it",
  "encoding.guide.copy.suffix": "— they get **exactly** what comes out of OBS",
  "encoding.guide.done": "OBS is all set",
  "encoding.guide.encoder.error":
    "Couldn't check this machine's encoders — try again under Quality.",
  "encoding.guide.encoder.checking": "Checking your graphics card…",
  "encoding.guide.encoder.cpuOnly": "Processor — it's what this machine has",
  "encoding.guide.guardian":
    "Privacy guard is on — get the best signal you can out of OBS.",
  "encoding.guide.noPlatforms":
    "(no platform on yet — the numbers below assume 1080p)",
  "encoding.guide.nohw.fps30":
    "No graphics card here, so your PC can struggle at {res}30: if the stream stutters or the game locks up, drop the output to 720p (Video tab), and outside a really fast game nobody notices.",
  "encoding.guide.nohw.fps60":
    "No graphics card here, so your PC can struggle at {res}60: if the stream stutters or the game locks up, drop the FPS to 30 (Video tab) — that's almost half the load, and outside a really fast game nobody notices.",
  "encoding.guide.path.lede": "OBS encodes your video **once**. From there:",
  "encoding.guide.path.title": "Where your video goes right now",
  "encoding.guide.row.bitrate": "Bitrate",
  "encoding.guide.row.bitrate.noteCopy":
    "above that, {platform} freezes your stream",
  "encoding.guide.row.bitrate.noteFree":
    "the better the signal, the better it all looks",
  "encoding.guide.row.encoder": "Encoder",
  "encoding.guide.row.keyframe": "Keyframe Interval",
  "encoding.guide.row.rateControl": "Rate Control",
  "encoding.guide.row.video": "Video (Video tab)",
  "encoding.guide.row.video.note720":
    "your platforms go out at 720p — anything more just hits your PC for nothing",
  "encoding.guide.row.video.noteFullHd":
    "same resolution as what goes out — keeps the picture from going soft",
  "encoding.guide.setup.title":
    "Set it up like this: OBS → Settings → **Output**",
  "encoding.guide.simpleMode":
    "In OBS's **Simple** output mode only bitrate and encoder show up — that already does the job. You set these by hand, no way around it.",
  "encoding.guide.title": "Getting the OBS quality right",
  "encoding.guide.why.cbr":
    "**CBR + a 2 s keyframe** is what the platforms require — anything else and the stream buffers for whoever's watching.",
  "encoding.guide.why.changed.strong":
    "Changed platforms or turned the privacy guard on?",
  "encoding.guide.why.changed.text":
    "Come back here — the numbers up top follow your setup.",
  "encoding.guide.why.onepass.strong": "One pass only.",
  "encoding.guide.why.onepass.text":
    "Converting the video for no reason just throws quality away.",
  "encoding.header.kicker": "How good it looks on each platform",
  "encoding.header.subtitle":
    "How good the picture goes out — and how much your PC sweats for it.",
  "encoding.header.title": "Quality",
  "encoding.load.label": "Load on your PC (estimated)",
  "encoding.load.word.easy": "easy",
  "encoding.load.word.heavy": "hits hard",
  "encoding.load.word.max": "maxed out",
  "encoding.load.word.warm": "warms up",
  "encoding.mode.hybrid.desc":
    "Only touches the platforms that need it. Figures it out on its own.",
  "encoding.mode.hybrid.tag": "Recommended",
  "encoding.mode.hybrid.title": "Smart",
  "encoding.mode.passthrough.desc":
    "The same picture goes to every platform, at the same settings.",
  "encoding.mode.passthrough.tag": "Lightest",
  "encoding.mode.passthrough.title": "Straight up",
  "encoding.mode.perPlatform.desc":
    "Best picture each platform can take, but it's the heaviest.",
  "encoding.mode.perPlatform.tag": "Max quality",
  "encoding.mode.perPlatform.title": "All out",
  "encoding.obs.guideLink": "See the full OBS guide →",
  "encoding.obs.lcd":
    "Platforms **on copy** need OBS at **~{bitrate}** — that's the most **{platform}** will take.",
  "encoding.obs.noCopy":
    "No platform is **on copy** right now: the better the signal out of OBS, the better everything looks.",
  "encoding.obs.path": "In OBS: Settings → Output → Bitrate. ",
  "encoding.sessions.over.hybrid":
    "This mode wants **{n} conversions on your graphics card** at the same time, but it should handle about **{max}**. It can fail mid-stream — switch a few platforms back to **Copy** in the fine-tuning.",
  "encoding.sessions.over.other":
    "This mode wants **{n} conversions on your graphics card** at the same time, but it should handle about **{max}**. It can fail mid-stream — switch to **Smart** or take a platform off.",
  "encoding.target.bitrate.aria": "{platform} bitrate in kbps",
  "encoding.target.bitrate.close": "close",
  "encoding.target.bitrate.edit": "edit the number",
  "encoding.target.bitrate.range": "between {min} and {max}",
  "encoding.target.bitrate.useRecommended": "use recommended ({kbps})",
  "encoding.target.copy.badge": "on copy",
  "encoding.target.copy.body":
    "The quality is set in OBS (bitrate, resolution, fps).",
  "encoding.target.copy.headline": "goes out exactly as OBS sends it",
  "encoding.target.copy.resolution": "resolution and fps: whatever OBS sends",
  "encoding.target.copy.verticalWarn":
    "⚠ it'll go out sideways here — switch to “Convert”",
  "encoding.target.encoder.aria": "What converts {platform}",
  "encoding.target.encoder.auto": "Automatic",
  "encoding.target.encoder.hint":
    "The graphics card spares your processor. The processor gives the best picture, but hits your PC harder.",
  "encoding.target.encoder.label": "What converts it",
  "encoding.target.encoder.uses": "uses {encoder}",
  "encoding.target.override.auto.copy": "Auto (copies)",
  "encoding.target.override.auto.transcode": "Auto (converts)",
  "encoding.target.override.copy": "Copy",
  "encoding.target.override.transcode": "Convert",
  "encoding.target.quality.custom": "custom",
  "encoding.target.quality.hint":
    "A better picture eats more upload. Standard is what the platform recommends.",
  "encoding.target.quality.label": "Picture quality",
  "encoding.target.quality.summary": "{stop} · {bitrate} · {link}",
  "encoding.target.reframe": "Crop it to 9:16",
  "encoding.target.stop.eco": "Light",
  "encoding.target.stop.sharp": "Sharp",
  "encoding.target.stop.standard": "Standard",
  "encoding.tuning.advanced": "(advanced)",
  "encoding.tuning.noPlatforms":
    "No platform is on. Turn one on in Platforms to tune its quality.",
  "encoding.tuning.passthrough.empty":
    "On **Straight up** there's nothing to tune here — the quality is set in OBS. ",
  "encoding.tuning.passthrough.guideLink": "See the OBS guide →",
  "encoding.tuning.title": "Fine-tuning per platform",
  "encoding.upload.measure.error":
    "Couldn't measure your upload — no internet?",
  "encoding.upload.measureAgain": "measure again",
  "encoding.upload.measureNow": "measure now",
  "encoding.upload.measured": "Your internet uploads at **~{mbps} Mbps**. ",
  "encoding.upload.measuring": "measuring…",
  "encoding.upload.onair": "I'll measure this after the stream.",
  "encoding.upload.unmeasured": "Haven't measured your internet yet. ",
  "encoding.vertical.cta.auto": "Back to Auto — it converts to vertical",
  "encoding.vertical.cta.hybrid": "Switch to Smart — it fixes this on its own",
  "encoding.vertical.warn.copy":
    "On copy, landscape video goes to **{platforms}**, and vertical is the only thing that works there — your stream goes out sideways or doesn't go out at all.",
  "encoding.vertical.warn.join": " and ",
  "encoding.vertical.warn.passthrough":
    "On Straight up, landscape video goes to **{platforms}**, and vertical is the only thing that works there — your stream goes out sideways or doesn't go out at all.",
  "encoding.wizard.cta.connect": "Connect and set it up",
  "encoding.wizard.cta.connecting": "Connecting…",
  "encoding.wizard.cta.done": "Close the guide",
  "encoding.wizard.cta.retry": "Try again",
  "encoding.wizard.error.auth.tip1":
    "Grab the right password in OBS: Tools → WebSocket Server Settings → Show Connect Info.",
  "encoding.wizard.error.auth.tip2":
    "Paste it into step 2 up there and try again.",
  "encoding.wizard.error.auth.tip3":
    "If “Enable Authentication” is unchecked in OBS, there's no password — leave the field empty.",
  "encoding.wizard.error.auth.title": "That WebSocket password didn't match.",
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
  "encoding.wizard.error.notfound.title": "Couldn't find OBS to connect to.",
  "encoding.wizard.manual.key": "Stream key",
  "encoding.wizard.manual.lede":
    "Doing it by hand is quick too. In OBS: **Settings → Stream → Service “Custom”**, and paste these two fields:",
  "encoding.wizard.manual.note.autostart":
    "With that pasted in, when you hit **GO LIVE** I'll try to hit play in OBS for you — if nothing happens, hit **Start Streaming** there yourself.",
  "encoding.wizard.manual.note.manual":
    "Pasted both into OBS? Then it's pointing at Corneta — no WebSocket in the middle.",
  "encoding.wizard.manual.server": "Server",
  "encoding.wizard.manual.toggle": "I'd rather set it up by hand",
  "encoding.wizard.ok.autostart":
    "Connected! OBS is pointing at Corneta now. When you hit **GO LIVE**, I'll tell OBS to start streaming on its own.",
  "encoding.wizard.ok.manual":
    "Connected! OBS is pointing at Corneta now. When it's stream time, just click **Start Streaming** in OBS.",
  "encoding.wizard.step1.body":
    "In OBS: **Tools → WebSocket Server Settings**, and check **Enable WebSocket server** (the port already comes as 4455, leave it).",
  "encoding.wizard.step1.title": "Turn on the WebSocket in OBS",
  "encoding.wizard.step2.body":
    "If **Enable Authentication** is checked, click **Show Connect Info**, copy it and paste it here. No password? Leave it empty.",
  "encoding.wizard.step2.placeholder": "WebSocket password",
  "encoding.wizard.step2.title": "Password (if there is one)",
  "encoding.wizard.step3.body.autostart":
    "I connect and set OBS to point over here. When you hit **GO LIVE**, I hit play in OBS myself.",
  "encoding.wizard.step3.body.manual":
    "I connect and set OBS to point over here. Then, when it's stream time, just hit **Start Streaming** in OBS.",
  "encoding.wizard.step3.title": "Connect",
  "encoding.wizard.subtitle": "Corneta sets OBS up for you.",
  "encoding.wizard.title": "Connect to OBS",

  "golive.band.atEdge": "cutting it close — give it some room",
  "golive.band.test": "Measure now",
  "golive.band.test.disabledTitle":
    "Your stream is coming up — measuring now would steal bandwidth from it",
  "golive.band.testing": "Testing…",
  "golive.band.title": "Upload bandwidth",
  "golive.band.tooTight": "won't keep up — adjust the quality",
  "golive.bar.dismiss.aria": "Dismiss this warning",
  "golive.bar.down": "{n} platform(s) down",
  "golive.bar.error.aria": "Open the live panel — the stream went down",
  "golive.bar.error.hint": "click here to see what happened and try again",
  "golive.bar.error.title": "The stream went down",
  "golive.bar.onAir": "on air",
  "golive.bar.open.aria": "Open the live panel",
  "golive.bar.panel": "Panel",
  "golive.bar.protection.bitrate": "Auto-bitrate",
  "golive.bar.protection.brb": "BE RIGHT BACK",
  "golive.bar.protection.guardian": "Privacy guard",
  "golive.bar.connectingTargets":
    "OBS connected · connecting to the platforms…",
  "golive.bar.waitingObs": "Waiting for OBS…",
  "golive.bar.watching": "watching",
  "golive.block.fixTarget":
    "Fix {nome}: {problemas} — paste the stream key or turn that platform off.",
  "golive.block.noPlatform": "Turn on at least one platform under Platforms.",
  "golive.block.updating":
    "Corneta is updating. Wait for it to reopen before starting your stream.",
  "golive.brb.armHint":
    "Want a one-click break? Arm {jaVolto} in Settings for your next stream.",
  "golive.brb.back": "I'm back!",
  "golive.brb.now": "BE RIGHT BACK now",
  "golive.brb.title.back":
    "Takes BE RIGHT BACK off air and brings your content back",
  "golive.brb.title.on":
    "Puts the “BE RIGHT BACK” screen on air (with your mic muted)",
  "golive.brb.toast.back": "You're back! Your content's on air again",
  "golive.brb.toast.on":
    "BE RIGHT BACK is on air — go ahead, your mic is muted",
  "golive.cancel": "Cancel",
  "golive.checkup.checking": "checking…",
  "golive.checkup.encoder": "Encoder available",
  "golive.checkup.keys": "Keys and URLs",
  "golive.checkup.keys.none": "no platforms turned on",
  "golive.checkup.obsConnected": "OBS connected",
  "golive.checkup.obsConnected.fix":
    "turn it on under Tools → WebSocket Server Settings (and the password goes in Corneta's Settings, if you set one)",
  "golive.checkup.obsPointing": "OBS pointing at Corneta",
  "golive.checkup.obsPointing.fix":
    "point OBS here with the button next to this",
  "golive.checkup.state.bad": "problem",
  "golive.checkup.state.ok": "done",
  "golive.checkup.state.warn": "missing",
  "golive.checkup.tip":
    "In OBS, under {caminho}: Simple mode is already right — relax. In Advanced mode, check {taxa} and {keyframe} — that's what the platforms ask for so it doesn't stutter.",
  "golive.checkup.tip.guide": "See the full guide →",
  "golive.checkup.tip.keyframe": "Keyframe Interval: 2 s",
  "golive.checkup.tip.path": "Settings → Output",
  "golive.checkup.tip.rateControl": "Rate Control: CBR",
  "golive.checkup.title": "Pre-stream checkup",
  "golive.checkup.upload": "Upload",
  "golive.checkup.upload.detail": "{atual} / {necessario} Mbps",
  "golive.checkup.upload.detail.tight":
    "{atual} / {necessario} Mbps · cutting it close",
  "golive.checkup.upload.untested": "run the test in Upload bandwidth above",
  "golive.cta": "GO LIVE",
  "golive.cta.aria": "Go live",
  "golive.cta.aria.blocked": "Go live (blocked: {motivo})",
  "golive.empty.noPlatforms":
    "No platforms turned on. Head to {plataformas}, switch at least one on and paste its key.",
  "golive.error.body": "The stream stopped. Check the logs or try again.",
  "golive.error.errorId": "Error ID",
  "golive.error.logs": "See the logs",
  "golive.error.operationId": "Operation ID",
  "golive.error.retry": "Try again",
  "golive.error.title": "Couldn't get your stream on air",
  "golive.header.kicker": "Sound the horn",
  "golive.header.subtitle":
    "Hook OBS up once, see if your internet can take it, and go live everywhere in one shot.",
  "golive.header.title": "Live",
  "golive.machine.label": "Your machine",
  "golive.marker.button": "Mark this moment",
  "golive.marker.title": "Drop a marker into the report",
  "golive.obs.badge": "OBS: {status}",
  "golive.obs.check": "Check OBS",
  "golive.obs.field.key": "Stream key",
  "golive.obs.field.server": "Server",
  "golive.obs.fixForMe": "Set it up for me",
  "golive.obs.hint": "In OBS: {caminho} and paste the two fields below.",
  "golive.obs.hint.path": "Settings → Stream → Service “Custom”",
  "golive.obs.key.note":
    "This key is just between OBS and Corneta — it's not from any platform.",
  "golive.obs.qualityGuide": "What's the best quality for OBS? Quick guide →",
  "golive.obs.section.title": "Hook up OBS",
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
  "golive.problems.turnedOff.toast":
    "Turned {nome} off — switch it back on under Platforms.",
  "golive.rescue.authFailed":
    "Found OBS, but the WebSocket password didn't match — check it under Settings → OBS.",
  "golive.rescue.body": "Is it open? Did you hit {botao}?",
  "golive.rescue.notPointing": "Found OBS, but it's not pointing at Corneta.",
  "golive.rescue.notReachable":
    "Couldn't find OBS around here — looks like it's closed, or the WebSocket is off.",
  "golive.rescue.title": "OBS hasn't connected yet",
  "golive.security.adjust": "Adjust",
  "golive.security.armed": "Armed",
  "golive.security.bitrate.desc":
    "if your internet chokes, I drop the quality before the stream freezes",
  "golive.security.bitrate.desc.off":
    "if your internet chokes, the stream freezes instead of just losing some quality",
  "golive.security.bitrate.label": "Auto-bitrate",
  "golive.security.brb.desc":
    "if OBS drops, I cut to BE RIGHT BACK and the stream doesn't even blink",
  "golive.security.brb.desc.off":
    "if OBS drops, everyone's staring at a frozen frame",
  "golive.security.brb.label": "BE RIGHT BACK",
  "golive.security.guardian.desc.off":
    "if a word that can't leak shows up on screen, it goes on air",
  "golive.security.guardian.label": "Privacy guard",
  "golive.security.guardian.noTerms":
    "on, but nothing to watch yet — add a word",
  "golive.security.guardian.watching":
    "watching {n} word(s) — if one shows up, I cut to BE RIGHT BACK",
  "golive.security.loudness.desc": "I level your volume on my own",
  "golive.security.loudness.label": "Audio normalizer",
  "golive.security.off": "Off",
  "golive.security.title": "Your safety nets",
  "golive.signalLost.body":
    "Your viewers are staring at a frozen screen. Check OBS (did it close? did it stop streaming?) — when the signal comes back, I'll pick it up on my own.",
  "golive.signalLost.title":
    "Lost the signal from OBS — your stream has no picture",
  "golive.starting.autoObs":
    "I told OBS to start streaming — if this screen doesn't change, hit {botao} over there.",
  "golive.starting.manualObs":
    "In OBS, click {botao} — Corneta goes live on its own.",
  "golive.starting.connectingTargets": "OBS connected — opening the platforms…",
  "golive.starting.waiting": "Waiting for OBS to connect…",
  "golive.stat.bitrate": "Bitrate",
  "golive.stat.drops": "Drops",
  "golive.stat.fps": "FPS",
  "golive.stat.uptime": "On air",
  "golive.state.brb": "BE RIGHT BACK on air",
  "golive.state.censor": "BE RIGHT BACK (Privacy guard)",
  "golive.state.connecting": "Connecting",
  "golive.state.error": "Error",
  "golive.state.idle": "Waiting",
  "golive.state.live": "Live",
  "golive.state.paused": "Paused",
  "golive.state.reconnecting": "Reconnecting",
  "golive.state.signalLost": "No signal from OBS",
  "golive.state.waiting": "Waiting for signal",
  "golive.stop": "Cut the stream",
  "golive.stop.confirm": "Cut for real? (click again)",
  "golive.streamInfo.applied": "Updated your title on {n} platform(s)",
  "golive.streamInfo.apply": "Send it to the platforms",
  "golive.streamInfo.game.placeholder": "Game / category (optional)",
  "golive.streamInfo.needTitle": "Type a title first",
  "golive.streamInfo.partial": "{ok}/{total} ok — check the details",
  "golive.streamInfo.signIn": "Sign in →",
  "golive.streamInfo.teaser":
    "Sign in and set the title (and the game) for every platform right here — no Studio, no dashboard.",
  "golive.streamInfo.title": "Stream title",
  "golive.streamInfo.title.placeholder": "Stream title (goes to all of them)",
  // Preserve the leading space when appending this fragment.
  "golive.streamInfo.youtubeAuto.desc":
    " — Corneta creates the broadcast when you hit GO LIVE, so you never open YouTube Studio.",
  "golive.streamInfo.youtubeAuto.title": "YouTube on autopilot",
  "golive.streamInfo.youtubeNote":
    "On YouTube you can only change the {titulo} (not the game).",
  "golive.target.noName": "(no name)",
  "golive.target.openChannel.aria": "Open your {nome} channel",
  "golive.target.openChannel.title": "Open your channel on the platform",
  "golive.target.pause": "Pause",
  "golive.target.pause.title": "Pause this platform",
  "golive.target.resume": "Resume",
  "golive.target.resume.title": "Resume this platform",
  "golive.target.retry": "Try again",
  "golive.target.swapKey": "Swap the key →",
  "golive.timer.onAir": "on air",
  "golive.timer.connectingTargets": "OBS connected · opening the platforms…",
  "golive.timer.waiting": "No video from OBS yet…",
  "golive.toast.canceled": "Canceled — you never went on air.",
  "golive.toast.live": "You're live! The horn's blowing 📣",
  "golive.toast.markerSaved":
    "Dropped a marker 📍 — it'll show up in the report",
  "golive.toast.obsPlay": "Told OBS to start streaming — going live…",
  "golive.toast.obsPlayFailed":
    "Couldn't hit play in OBS — go hit Start Streaming over there.",
  "golive.toast.obsPlayFailed.action": "Set up OBS",
  "golive.toast.serverUp": "Server's up! Now just hit play in OBS",
  "golive.toast.startFailed": "Couldn't go live: {erro}",
  "golive.toast.stopped": "Cut! You're off the air 👋",
  "golive.toast.stopped.action": "See the report",
  "golive.toast.uploadTestFailed":
    "Couldn't measure your upload — no internet?",
  "golive.viewers.label": "watching",

  "platforms.about.blog.sub": "My blog and my projects.",
  "platforms.about.footer.made":
    "Corneta is free and open source. Made with {heart} and code.",
  "platforms.about.hero.body":
    "I built Corneta to kill a headache of my own: one stream out of OBS goes live on Twitch, YouTube, Kick and the rest all at once — free.",
  "platforms.about.hero.title": "Hi, I'm Petro",
  "platforms.about.kicker": "Who's behind the horn",
  "platforms.about.legal.privacy": "Privacy policy",
  "platforms.about.legal.terms": "Terms of use",
  "platforms.about.replayTour": "Replay the welcome tour",
  "platforms.about.site.sub": "Official site, FAQ and download.",
  "platforms.about.title": "About",
  "platforms.about.version": "Corneta v{version} · multistream",
  "platforms.add": "Add",
  "platforms.chatBridge.ask": "Want {platform} chat here in Corneta too?",
  "platforms.chatBridge.cta": "Set it up",
  "platforms.empty.body":
    "Your horn isn't pointed anywhere yet. Want to add the first platform?",
  "platforms.empty.cta": "Add platform",
  "platforms.empty.title": "So, no platforms yet?",
  "platforms.key.cancelEdit": "Cancel changing the key",
  "platforms.key.change": "Change",
  "platforms.key.hide": "Hide the stream key",
  "platforms.key.pasteSave": "Paste and save",
  "platforms.key.pasteSaveTitle":
    "Pastes from your clipboard and puts it straight into Windows Credential Manager",
  "platforms.key.pastedUrlOnly":
    "That's the server address, not the key — paste the stream key sitting right next to it in the dashboard 🔑",
  "platforms.key.placeholder": "Paste the stream key the platform gave you",
  "platforms.key.remove": "Remove",
  "platforms.key.removeConfirm": "Remove it for real?",
  "platforms.key.removeFailed": "Couldn't remove the stream key — {err}",
  "platforms.key.removed": "Removed your stream key",
  "platforms.key.save": "Save",
  "platforms.key.saveFailed": "Couldn't save the stream key — {err}",
  "platforms.key.saved": "Stream key in Windows Credential Manager",
  "platforms.key.savedToast":
    "Saved your stream key in Windows Credential Manager 🔒",
  "platforms.key.show": "Show the stream key",
  "platforms.key.strippedUrl":
    "That looked like the whole URL — I kept just the stream key 👍",
  "platforms.mesa.art.invite": "Invite",
  "platforms.mesa.art.you": "You",
  "platforms.mesa.cam.off": "No video",
  "platforms.mesa.cam.on": "Camera",
  "platforms.mesa.camOn": "Turned your camera on",
  "platforms.mesa.cameraLabel": "Camera",
  "platforms.mesa.conn.connecting": "connecting…",
  "platforms.mesa.conn.dropped": "dropped",
  "platforms.mesa.conn.left": "left",
  "platforms.mesa.conn.live": "live",
  "platforms.mesa.demoNotice":
    "Demo mode — the real Table only runs in the installed app. Here you can test your camera and click around.",
  "platforms.mesa.deviceDefault": "Default",
  "platforms.mesa.full.body":
    "With straight P2P every camera goes out to everybody — the connection count blows up, and past ~5 your upload is pinned. A server mode (SFU) for big Tables is on the way.",
  "platforms.mesa.full.title": "A full Table eats your upload",
  "platforms.mesa.full.uploadLabel": "your upload",
  "platforms.mesa.full.uploadValue": "maxed out",
  "platforms.mesa.grid.count": "At the Table ({n})",
  "platforms.mesa.grid.self": "{name} (you)",
  "platforms.mesa.guest": "guest",
  "platforms.mesa.guestDefaultName": "Guest",
  "platforms.mesa.hideSelfAria": "Hide my camera in the grid",
  "platforms.mesa.hideSelfLabel": "hide my camera in the grid",
  "platforms.mesa.host.body":
    "You're the host. Corneta makes you an invite — send it to your crew, they come in, and their cameras land straight on your machine.",
  "platforms.mesa.host.cta": "Open the Table",
  "platforms.mesa.host.title": "Create a Table",
  "platforms.mesa.hostDefaultName": "Host",
  "platforms.mesa.invite.body":
    "Send this code to your crew so they can come in. On the same network it connects right away; over the internet, only if your PC can be reached from outside.",
  "platforms.mesa.invite.label": "Invite",
  "platforms.mesa.invite.title": "Your Table invite",
  "platforms.mesa.join.body":
    "Got an invite? Paste it here to join another streamer's Table.",
  "platforms.mesa.join.cta": "Join",
  "platforms.mesa.join.note":
    "For now it works on the same network (or with the host reachable over the internet) — a relay is on the way.",
  "platforms.mesa.join.title": "Join a Table",
  "platforms.mesa.kicker": "Table · co-stream",
  "platforms.mesa.leave": "Leave the Table",
  "platforms.mesa.mic.off": "Muted",
  "platforms.mesa.mic.on": "Mic",
  "platforms.mesa.micLabel": "Microphone",
  "platforms.mesa.muted": "muted",
  "platforms.mesa.nameLabel": "Your name at the Table",
  "platforms.mesa.namePlaceholder": "e.g. Pitrol",
  "platforms.mesa.obs.add": "Add to OBS",
  "platforms.mesa.obs.body":
    "It goes into your current scene as a Browser Source, everybody in a fixed slot. All you do is drag it where you want it.",
  "platforms.mesa.obs.remove": "Take it out of OBS",
  "platforms.mesa.obs.title": "Put the Table in OBS",
  "platforms.mesa.obs.waitTitle":
    "Connecting to the Table… I'll unlock this the second it connects",
  "platforms.mesa.openCam": "Turn on my camera",
  "platforms.mesa.privacy.camera": "Open Windows privacy (camera)",
  "platforms.mesa.privacy.mic": "Open Windows privacy (microphone)",
  "platforms.mesa.retry": "Try again",
  "platforms.mesa.status.connecting": "connecting…",
  "platforms.mesa.status.error": "went sideways",
  "platforms.mesa.status.idle": "out",
  "platforms.mesa.status.offline": "reconnecting…",
  "platforms.mesa.status.online": "at the Table",
  "platforms.mesa.subtitle":
    "Everybody's webcam comes straight to you over P2P, in high quality — no Discord call, no blurry mosaic. And whoever drops turns into BE RIGHT BACK in their slot, without breaking your scene.",
  "platforms.mesa.title": "Bring your crew to the Table",
  "platforms.mesa.waiting": "Waiting for your crew to come in with the invite…",
  "platforms.mesa.you": "You",
  "platforms.picker.already": "already added",
  "platforms.picker.alreadyCount": "already added ×{n}",
  "platforms.picker.title": "Who gets your stream?",
  "platforms.profile.active": "Active profile",
  "platforms.profile.count": "Platforms in this profile: {n}",
  "platforms.profile.delete": "Delete",
  "platforms.profile.deleteConfirm": "Delete it for real?",
  "platforms.profile.deleteTitle": 'Delete the "{name}" profile',
  "platforms.profile.defaultNew": "Profile {n}",
  "platforms.profile.hint":
    "A profile is a saved set of platforms. Make one for each situation ('Solo Twitch+YT', 'Event with TikTok') and switch with one click.",
  "platforms.profile.label": "Stream profile",
  "platforms.profile.nameAria": "Profile name",
  "platforms.profile.new": "New profile",
  "platforms.profile.rename": "Rename",
  "platforms.profile.renameTitle": "Rename the active profile",
  "platforms.profile.switchTo": 'Switch to "{name}"',
  "platforms.profile.untitled": "Untitled",
  "platforms.readiness.allReady": "All set to go live",
  "platforms.readiness.noKey": "{n} with no stream key",
  "platforms.readiness.noUrl": "{n} with no URL",
  "platforms.readiness.off": "{n} turned off",
  "platforms.readiness.ready": "{n} ready",
  "platforms.subtitle":
    "Pick your platforms, paste each one's stream key, and I'll push your OBS video to all of them at once.",
  "platforms.target.badge.noName": "No name",
  "platforms.target.badge.noUrl": "No URL",
  "platforms.target.badge.pasteKey": "Paste the key",
  "platforms.target.badge.ready": "Ready",
  "platforms.target.badge.urlInvalid": "Bad URL",
  "platforms.target.collapseAria": "Collapse platform",
  "platforms.target.enableAria": "Turn {name} on",
  "platforms.target.expandAria": "Expand platform",
  "platforms.target.getKey": "Get my stream key",
  "platforms.target.nameAria": "Platform name",
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
  "platforms.target.remove": "Remove",
  "platforms.target.reorderAria": "Reorder platform (↑/↓ arrows)",
  "platforms.target.reorderTitle": "Drag it, or use ↑/↓",
  "platforms.target.test.cta": "Test the server",
  "platforms.target.test.ok": "📡 {msg}",
  "platforms.target.test.running": "Testing…",
  "platforms.target.test.title":
    "Checks whether the platform's server answers — it doesn't check your stream key",
  "platforms.target.url.help":
    "— where your video goes; paste the URL the platform's dashboard gave you",
  "platforms.target.url.helpKick":
    "— where your video goes; I filled this one in, only change it if Kick's dashboard shows a different one",
  "platforms.target.url.invalid":
    "That URL won't work — use rtmp:// or rtmps://",
  "platforms.target.url.label": "Server URL",
  "platforms.target.url.placeholder":
    "rtmp://server/app  (rtmp:// or rtmps://)",
  "platforms.target.badge.off": "off",
  "platforms.target.urlUnset": "No URL set",
  "platforms.title": "Platforms",
  "platforms.title.kicker": "Where your horn gets heard",
  "platforms.toast.added": "{platform} is in 📣",
  "platforms.toast.removed": "{name} is out",
  "platforms.toast.undo": "Undo",

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

  "reports.alerts.bitsTotal": "bits total",
  "reports.alerts.kind.follow.one": "follow",
  "reports.alerts.kind.follow.other": "follows",
  "reports.alerts.kind.member.one": "member",
  "reports.alerts.kind.member.other": "members",
  "reports.alerts.kind.raid.one": "raid",
  "reports.alerts.kind.raid.other": "raids",
  "reports.alerts.kind.resub.one": "resub",
  "reports.alerts.kind.resub.other": "resubs",
  "reports.alerts.kind.sub.one": "sub",
  "reports.alerts.kind.sub.other": "subs",
  "reports.alerts.kind.subgift.one": "gift",
  "reports.alerts.kind.subgift.other": "gifts",
  "reports.alerts.kind.superchat.one": "superchat",
  "reports.alerts.kind.superchat.other": "superchats",
  "reports.alerts.title": "Stream alerts",
  "reports.alerts.topRaid": "🚀 Biggest raid: {user} (+{n})",
  "reports.bitrate.title": "Bitrate per platform (Mbps)",
  "reports.channel.avg": "avg",
  "reports.channel.peak": "peak",
  "reports.channel.share": "{pct}% of viewers",
  "reports.channels.followersNote":
    "💜 Followers come from the platform's own counter, so it's the net number: anyone who unfollowed during the stream comes off it. It may not match the alert count from Streamlabs/StreamElements.",
  "reports.channels.oldChatNote":
    "💬 This stream is from before I started counting chat per channel, so only the total shows up here. From your next one on, chat comes split by channel too.",
  "reports.channels.title": "Viewers by channel",
  "reports.channels.unattributed":
    "{n} alert(s) with no channel attached (they came from Streamlabs/StreamElements, which don't say which channel they're from).",
  "reports.chart.allChannels": "All channels together:",
  "reports.chat.series": "msgs/min",
  "reports.chat.summary": "Total {total} · peak {peak}/min · average {avg}/min",
  "reports.chat.title": "Chat activity (msgs/min)",
  "reports.copyTime": "Copy timestamp",
  "reports.copyTime.done": "Copied the timestamp.",
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
  "reports.delta.pct": "{pct}% vs last stream",
  "reports.delta.same": "same as last stream",
  "reports.detail.back": "Back",
  "reports.detail.delete": "Delete",
  "reports.detail.delete.confirm": "Sure?",
  "reports.detail.delete.error":
    "Couldn't delete the report — the file is still in the folder. Try again, or open the folder and delete it by hand.",
  "reports.detail.deleted": "Deleted that report.",
  "reports.detail.download": "Download",
  "reports.detail.error.title": "I couldn't open this stream",
  "reports.detail.error.read":
    "Couldn't read this report — the file may be damaged.",
  "reports.detail.heading": "Stream on {date}",
  "reports.detail.loading": "Loading report",
  "reports.detail.mode": "{mode} mode",
  "reports.detail.recap": "Build recap",
  "reports.download.anon.desc":
    "Swaps whoever showed up for “someone”. Use it when you're sending this to a sponsor or an agency — every number stays.",
  "reports.download.anon.title": "No viewer names",
  "reports.download.csv.desc":
    "The whole stream, one row every ~2s, ready for Excel.",
  "reports.download.csv.label": "Spreadsheet (CSV)",
  "reports.download.error": "Couldn't save the report: {err}",
  "reports.download.html.desc":
    "Opens in any browser, offline. For a PDF: open it and use Print → Save as PDF.",
  "reports.download.html.label": "Web page (HTML)",
  "reports.download.json.desc":
    "The report already crunched, to plug into your own tool.",
  "reports.download.json.label": "Data (JSON)",
  "reports.download.modal.name": "Download report",
  "reports.download.saved": "Saved your report.",
  // Filename stems must not contain spaces or path separators; exporters append the date.
  "reports.file.history": "corneta-history",
  "reports.file.live": "corneta-live",
  "reports.file.seriesSuffix": "-series",
  "reports.dur.hours": "{h}h{m}",
  "reports.dur.minutes": "{m}min",
  "reports.events.title": "Events",
  "reports.error.retry": "Try again",
  "reports.highlights.chartHint":
    "The chart markers match the moments listed below.",
  "reports.highlights.note":
    "Times count from when the stream started — find that minute in the VOD to cut your clip.",
  "reports.highlights.more.one": "Show 1 more moment",
  "reports.highlights.more.other": "Show {count} more moments",
  "reports.highlights.title": "Highlights (worth clipping)",
  "reports.history.busy": "Building…",
  "reports.history.button": "Export history (CSV)",
  "reports.history.error.none":
    "Couldn't read a single stream — use Open folder to check the files.",
  "reports.history.error.save": "Couldn't export the history: {err}",
  "reports.history.ok.all": "{n} stream(s) in the spreadsheet",
  "reports.history.ok.some":
    "Exported {n} stream(s) — left out {bad} I couldn't read",
  "reports.html.docTitle": "{title} — Corneta",
  "reports.html.followersNote":
    "Followers come from the platform's own counter: it's the net number (anyone who unfollowed comes off it).",
  "reports.html.footer":
    "Made by Corneta on {date} · multistream that runs on your PC",
  "reports.html.highlights.note":
    "Times count from when the stream started — use them to find the moment in the VOD.",
  "reports.html.highlights.title": "Highlights",
  "reports.html.table.channel": "Channel",
  "reports.html.table.chat": "Chat",
  "reports.html.table.followers": "Followers",
  "reports.html.table.share": "Share",
  "reports.html.tag": "Corneta · stream report",
  "reports.html.viewers.title": "Live viewers",
  "reports.list.empty.body":
    "When your stream ends, I build the report right here.",
  "reports.list.empty.title": "No streams yet",
  "reports.list.error.body":
    "The reports folder did not respond. Your files are still on your computer.",
  "reports.list.error.title": "I couldn't load your streams",
  "reports.list.archive": "Earlier streams",
  "reports.list.archiveCount.one": "1 more stream in your archive",
  "reports.list.archiveCount.other": "{count} more streams in your archive",
  "reports.list.kicker": "After the stream",
  "reports.list.latest": "Latest stream",
  "reports.list.noData":
    "No numbers for this stream — open it to see what got recorded.",
  "reports.list.openStory": "Open the stream story",
  "reports.list.openFolder": "Open folder",
  "reports.list.result": "Recap",
  "reports.list.subtitle":
    "Replay each stream: where people showed up, where they left, and the minute it choked.",
  "reports.list.title": "Your streams",
  "reports.machine.dangerLine": "danger zone",
  "reports.machine.memory": "Memory",
  "reports.machine.title": "Machine load (%)",
  "reports.marker.error": "● error",
  "reports.marker.noSignal": "● no signal from OBS",
  "reports.marker.reconnect": "● reconnect",
  "reports.mode.hybrid": "Smart",
  "reports.mode.passthrough": "Straight up",
  "reports.mode.perPlatform": "All out",
  "reports.obs.series": "Render lag",
  "reports.obs.title": "OBS — delay building each frame (ms)",
  "reports.perTarget.avgBitrate": "~{mbps} Mbps avg",
  "reports.perTarget.dropped": "{n} dropped frames",
  "reports.perTarget.reconnects": "{n} reconnects",
  "reports.perTarget.title": "How each platform held up",
  "reports.recap.copied":
    "Copied the image — paste it in Discord, X or wherever you post 📋",
  "reports.recap.copy": "Copy image",
  "reports.recap.download": "Download PNG",
  "reports.recap.duration": "{duration} on air",
  "reports.recap.error.canvas": "Couldn't draw the recap on this machine.",
  "reports.recap.error.copy": "Couldn't copy it — use Download PNG instead",
  "reports.recap.error.download": "Couldn't download the recap: {err}",
  "reports.recap.error.draw": "Couldn't draw the recap: {err}",
  "reports.recap.footer": "streamed with Corneta — multistream in one app",
  "reports.recap.modal.close": "Close recap",
  "reports.recap.modal.description":
    "A vertical preview of the stream, ready to copy or download.",
  "reports.recap.modal.format": "PNG · {width} × {height}",
  "reports.recap.modal.heading": "Recap to post",
  "reports.recap.modal.hint": "Review the whole image before sharing it.",
  "reports.recap.modal.name": "Stream recap",
  "reports.recap.modal.ready": "Everything fits in the preview",
  "reports.recap.previewAria": "Stream recap preview",
  "reports.recap.stat.avg": "average",
  "reports.recap.stat.bits": "bits",
  "reports.recap.stat.messages": "messages",
  "reports.recap.stat.newFollowers": "new followers",
  "reports.recap.stat.onAir": "time on air",
  "reports.recap.stat.peakViewers": "peak viewers",
  "reports.recap.stat.raids": "raids",
  "reports.recap.stat.subs": "subs",
  "reports.recap.title": "Stream · {date}",
  "reports.row.chat.title": "Chat messages",
  "reports.row.clean": "clean",
  "reports.row.clean.title": "Clean stream",
  "reports.row.hasVideo": "recorded",
  "reports.row.hasVideo.title":
    "This stream has a recording — you can watch it alongside the charts",
  "reports.row.onAir": "{dur} on air",
  "reports.row.peakViewers.title": "Peak viewers",
  "reports.row.problems.one": "1 rough patch",
  "reports.row.problems.other": "{count} rough patches",
  "reports.row.problems.title": "Rough patches — open the report to see them",
  "reports.split.byChannel": "By channel",
  "reports.split.total": "Total",
  "reports.stat.avg": "Average",
  "reports.stat.bits": "Bits",
  "reports.stat.followersNet": "Followers (net)",
  "reports.stat.maxCpu": "Max CPU",
  "reports.stat.messages": "Messages",
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
  "reports.technical.incidents.impact": "Impact",
  "reports.technical.incidents.impact.allTargets": "every platform",
  "reports.technical.incidents.impact.from": "from {time}",
  "reports.technical.incidents.confirm": "How to confirm",
  "reports.technical.incidents.individual": "Individual occurrences",
  "reports.technical.incidents.longest": "Longest stretches",
  "reports.technical.incidents.next": "For your next stream",
  "reports.technical.pagination": "Technical details pages",
  "reports.technical.pagePrevious": "Previous",
  "reports.technical.pageNext": "Next",
  "reports.technical.pageCount": "{page} of {pages}",
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
  "reports.viewers.peak": "Peak",
  "reports.viewers.raidsLegend": "● raids",
  "reports.viewers.series": "Watching",
  "reports.viewers.startEnd": "Started with {start} → ended with {end}",
  "reports.viewers.title": "Live viewers (how many stuck around)",
  "reports.windows.note":
    "Copy the time of a rough patch and find it in the VOD.",
  "reports.windows.title": "Technical points to review",

  "settings.language.title": "Language",
  "settings.language.desc":
    "On automatic, Corneta follows your Windows language. Switching takes effect right away, no restart.",
  "settings.language.auto": "Automatic",
  "settings.appearance.lightTheme.title": "Light theme",
  "settings.appearance.lightTheme.toggle": "Light theme",
  "settings.appearance.title": "Appearance",
  "settings.brb.slate.custom": "Pick a file of mine",
  "settings.brb.slate.default": "Use Corneta's default",
  "settings.brb.slate.label": "Your “BE RIGHT BACK” screen",
  "settings.brb.slate.note":
    "{current} — goes on air when the signal drops. Video loops and can have sound.",
  "settings.brb.slate.preview.alt": "Preview of the BE RIGHT BACK screen",
  "settings.brb.slate.toast.default": "Put Corneta's default screen back",
  "settings.brb.slate.toast.defaultError":
    "Couldn't go back to the default screen — {error}",
  "settings.brb.slate.toast.fileError": "Couldn't use that file — {error}",
  "settings.brb.slate.toast.updated": "Updated your BE RIGHT BACK screen",
  "settings.brb.slate.using.default": "Using: Corneta's default screen",
  "settings.brb.slate.using.image": "Using: {file} (image)",
  "settings.brb.slate.using.image.fallback": "the image you picked",
  "settings.brb.slate.using.video": "Using: {file} (video, with sound)",
  "settings.brb.slate.using.video.fallback": "the video you picked",
  "settings.data.backup.desc":
    "Saves your settings to a file. Your stream keys stay in Windows Credential Manager and don't go with it. Importing replaces the settings you have now.",
  "settings.data.backup.export": "Export",
  "settings.data.backup.import": "Import",
  "settings.data.backup.import.confirm": "Replace your current settings?",
  "settings.data.backup.title": "Settings backup",
  "settings.data.logs.desc":
    "Export a structured technical summary for support — without logs, names, paths or credentials — or open logs separately on this PC.",
  "settings.data.logs.export": "Export diagnostics",
  "settings.data.logs.export.error": "Couldn't export diagnostics.",
  "settings.data.logs.open": "Open logs",
  "settings.data.logs.title": "Logs",
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
  "settings.guardian.cost.delay": "Your stream runs {delay} real time.",
  "settings.guardian.cost.delay.value": "12s behind",
  "settings.guardian.cost.intro":
    "When a term from your list shows up, Corneta switches to the {jaVolto} screen before that moment goes on air — it never gets out, not even in a clip. To pull that off:",
  "settings.guardian.cost.scope":
    "It only watches the terms you list — {no} “anything private”.",
  "settings.guardian.cost.scope.no": "not",
  "settings.guardian.cost.smallText":
    "Really small text can still slip through.",
  "settings.guardian.cost.title": "🛡️ What this protection costs",
  "settings.guardian.list.empty":
    "No terms with 3+ letters means the privacy guard has nothing to watch — add at least one.",
  "settings.guardian.list.hint":
    "(one per line — your email, real name, address, your @)",
  "settings.guardian.list.label": "Terms to watch",
  "settings.guardian.list.placeholder":
    "me@myemail.com\n42 Oak Street\nMy Real Name",
  "settings.guardian.list.watching.one": "Watching 1 term.",
  "settings.guardian.list.watching.other": "Watching {count} terms.",
  "settings.guardian.list.watchingManyShort.one":
    "Watching 1 term — {short} skipped for being too short (3 letters minimum): {terms}.",
  "settings.guardian.list.watchingManyShort.other":
    "Watching {count} terms — {short} skipped for being too short (3 letters minimum): {terms}.",
  "settings.guardian.list.watchingOneShort.one":
    "Watching 1 term — 1 skipped for being too short (3 letters minimum): {terms}.",
  "settings.guardian.list.watchingOneShort.other":
    "Watching {count} terms — 1 skipped for being too short (3 letters minimum): {terms}.",
  // Navigation labels must match screen titles and cross-screen references.
  "sidebar.about": "About",
  "sidebar.live.title": "Open the live panel",
  "sidebar.nav.chat.hint": "every chat in one place",
  "sidebar.nav.chat.label": "Chat",
  "sidebar.nav.encoding.hint": "picture vs PC load",
  "sidebar.nav.encoding.label": "Quality",
  "sidebar.nav.golive.hint": "puts it all on air",
  "sidebar.nav.golive.label": "Live",
  "sidebar.nav.mesa.hint": "co-stream with your crew",
  "sidebar.nav.mesa.label": "Table",
  "sidebar.nav.platforms.hint": "where your stream lands",
  "sidebar.nav.platforms.label": "Platforms",
  "sidebar.nav.reports.hint": "how the stream went",
  "sidebar.nav.reports.label": "Reports",
  "sidebar.new": "new",
  "sidebar.settings": "Settings",
  "sidebar.start.title": "Go to Live and get started",
  "sidebar.state.error": "Error",
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
  "settings.hotkey.capture.unsupported":
    "that key cannot be used as a hotkey — try another",
  "settings.hotkey.capture.needsModifier": "needs Ctrl, Alt or Shift with it",
  "settings.hotkey.capture.prompt":
    "press Ctrl, Alt or Shift + a key… (Esc cancels)",
  "settings.hotkey.clear": "Clear",
  "settings.hotkey.desc":
    "Starts and stops the stream from anywhere — even with Corneta tucked away in the tray.",
  "settings.hotkey.title": "Global hotkey",
  "settings.hotkey.toast.inUse":
    "That hotkey is already in use — choose another combination.",
  "settings.hotkey.toast.invalid":
    "That combination is not valid — choose another key with Ctrl, Alt or Shift.",
  "settings.hotkey.toast.registerFailed":
    "Couldn't activate that hotkey — try another combination.",
  "settings.hotkey.toast.unregisterFailed":
    "Couldn't remove the previous hotkey — try again before changing it.",
  "settings.hotkey.toast.cleanupFailed":
    "Couldn't safely finish changing the hotkey — restart Corneta before setting another one.",
  "settings.loading.body": "Pulling up your settings.",
  "settings.loading.title": "Loading…",
  "settings.loudness.target.label": "Volume target",
  "settings.loudness.target.minus14": "-14 · default (Twitch/YT)",
  "settings.loudness.target.minus16": "-16 · softer",
  "settings.loudness.target.minus18": "-18 · podcast/voice",
  "settings.obs.advanced.desc":
    "Only touch this if another program is already using the default port (1935). Change it here, change it in OBS too.",
  "settings.obs.test.saveFailed":
    "Couldn't save the settings. The connection was not checked with these values. Edit the field and try again.",
  "settings.obs.test.settingsChanged":
    "The settings changed while configuring OBS. Check the fields and try again.",
  "settings.obs.advanced.field.app": "Application (app)",
  "settings.obs.advanced.field.host": "Host",
  "settings.obs.advanced.field.localKey": "Local key",
  "settings.obs.advanced.field.port": "Port",
  "settings.obs.advanced.port.invalid": "Port goes from 1 to 65535.",
  "settings.obs.advanced.trigger": "Advanced — change the local address",
  "settings.obs.autoconfig.desc":
    "For the {button} button (on the Live screen) to work, turn the WebSocket server on in OBS, under {path}. If there's a password, paste it here.",
  "settings.obs.autoconfig.desc.button": "“Set it up for me”",
  "settings.obs.autoconfig.desc.path": "Tools → WebSocket Server Settings",
  "settings.obs.autoconfig.title": "OBS — auto setup",
  "settings.obs.autostart.desc":
    "When you hit GO LIVE, Corneta tells OBS to start streaming too.",
  "settings.obs.autostart.title": "Start OBS too",
  "settings.obs.autostart.toggle": "Start OBS too",
  "settings.obs.ingest.desc":
    "The local address where OBS hands your video over. The {key} below is only between OBS and Corneta — it's not your platform stream key, which stays in Windows Credential Manager.",
  "settings.obs.ingest.desc.key": "key",
  "settings.obs.ingest.liveLock":
    "You're live — I locked this address so I don't drop OBS in the middle of your stream.",
  "settings.obs.ingest.title": "Address for OBS",
  "settings.obs.password.desc":
    "The password shows up in that same OBS window, behind the “Show Connect Info” button. If “Enable Authentication” is unchecked there, leave this empty.",
  "settings.obs.password.placeholder": "(optional)",
  "settings.obs.password.title": "WebSocket password",
  // This is the local ingest key, not the destination platform's stream key.
  "settings.obs.paste.field.key": "Key",
  "settings.obs.paste.field.server": "Server",
  "settings.obs.paste.label": "Paste into OBS",
  "settings.obs.test.authFail":
    "Couldn't get in — check the WebSocket password in OBS (the “Show Connect Info” button).",
  "settings.obs.test.button": "Test connection",
  "settings.obs.test.notFound":
    "Couldn't find OBS — is it open? Is the WebSocket server on under Tools → WebSocket Server Settings?",
  "settings.obs.test.ok": "Connected",
  "settings.obs.test.okDetail": "Connected · {width}×{height} · {fps}fps",
  "settings.obs.test.wrongTarget":
    "Connected, but OBS isn't pointing at Corneta — hit “Set it up for me” on the Live screen.",
  "settings.safety.bitrate.desc":
    "Internet choking? Corneta drops the video quality for a while instead of letting the stream stutter or die, and brings it back up when your upload steadies.",
  "settings.safety.bitrate.title":
    "Hold the stream up when your internet chokes (auto-bitrate)",
  "settings.safety.brb.desc":
    "If OBS drops mid-stream, the “BE RIGHT BACK” screen goes on air without dropping the platforms — from the viewer's side the stream doesn't even blink, and it comes back on its own when the signal returns.",
  "settings.safety.brb.title": "Drop protection (BE RIGHT BACK)",
  "settings.safety.desc":
    "What holds your stream up when OBS drops, your internet chokes, or something private of yours shows up on screen.",
  "settings.safety.guardian.desc":
    "If one of your terms (list below) shows up on screen, Corneta cuts to “BE RIGHT BACK” before it goes on air. Safety net, not a guarantee. The cost: your whole stream goes out 12s behind (the chat too).",
  "settings.safety.guardian.title": "Privacy guard",
  "settings.safety.loudness.desc":
    "Corneta evens out your audio before it goes out — no “can't hear you” from chat, no blown-out ears when you switch scenes. If you already normalize in OBS, leave this off so the two don't fight.",
  "settings.safety.loudness.title": "Audio normalizer",
  "settings.safety.state.armed": "Armed",
  "settings.safety.state.off": "off",
  "settings.safety.title": "Safety nets",
  "settings.system.autostart.desc":
    "Opens Corneta on its own when you turn the PC on.",
  "settings.system.autostart.title": "Start with Windows",
  "settings.system.autostart.toggle": "Start with Windows",
  "settings.system.title": "System",
  "settings.system.tray.desc":
    "Closing the window hides Corneta next to the clock (the stream keeps going). To quit for good, use the tray menu.",
  "settings.system.tray.title": "Minimize to the tray on close",
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
  "settings.tab.obs": "OBS",
  "settings.tab.safety": "Safety nets",
  "settings.toast.export.error": "Couldn't export your settings — {error}",
  "settings.toast.export.ok": "Exported your settings",
  "settings.toast.import.error": "Couldn't import that file — {error}",
  "settings.toast.import.ok":
    "Imported your settings — I kept the old ones in a backup.",

  "shell.win.closeTray": "Close — Corneta stays by the clock",
};
