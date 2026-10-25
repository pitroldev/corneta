// Use natural English with the register defined in docs/VOICE-AND-TONE.md, not literal Portuguese phrasing.
import type { Dict } from "./pt";

export const en: Dict = {
  "seo.howto.name": "How to stream to several platforms at once with Corneta",
  "seo.howto.description":
    "Four steps to take a single stream from your streaming app to Twitch, YouTube, Kick and other destinations at the same time.",
  "seo.howto.tool.software":
    "OBS Studio, Streamlabs, XSplit or any other RTMP app",
  "seo.howto.tool.pc": "A PC running Windows 10 or 11",
  "seo.app.subcategory": "Live streaming software (multistream)",
  "seo.app.requirements": "OBS Studio or any streaming app that speaks RTMP",

  "chrome.html.lang": "en-US",
  "chrome.llms.contact.label": "contact:",
  "chrome.llms.heading.faq": "## Frequently asked questions",
  "chrome.llms.heading.features": "## What Corneta does",
  "chrome.llms.heading.notis": "## What Corneta is NOT",
  "chrome.llms.heading.pages": "## Pages",
  "chrome.llms.heading.platforms": "## Platforms",
  "chrome.llms.heading.steps": "## How to use it in three steps",
  "chrome.llms.heading.who": "## Who you're talking to",
  "chrome.llms.intro":
    "Local multistream, free and open source (MIT license), for Windows 10 and 11.\nMade in Brazil, in Portuguese and English. It's not a cloud service, there's no\nsubscription and no sign-up: the video goes straight from the streamer's\ncomputer to each platform.",
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
    "Available in the app: Twitch, YouTube, Kick, Facebook and custom RTMP or\nRTMPS destinations. TikTok, Instagram and X are experimental: access depends\non approval from the platform itself.",
  "chrome.manifest.description":
    "Local multistream for streamers — one output per platform, all running on your PC.",
  "chrome.manifest.lang": "en-US",
  "chrome.meta.description":
    "Multistream from your PC to Twitch, YouTube, Kick and more — one chat, a stream that stays up when the signal drops, and a report for each platform. Free.",
  "chrome.meta.keywords.1": "multistream",
  "chrome.meta.keywords.10": "Kick",
  "chrome.meta.keywords.11": "open source",
  "chrome.meta.keywords.2": "stream to multiple platforms at once",
  "chrome.meta.keywords.3": "free multistream",
  "chrome.meta.keywords.4": "OBS multistream",
  "chrome.meta.keywords.5": "Twitch and YouTube at the same time",
  "chrome.meta.keywords.6": "simultaneous streaming",
  "chrome.meta.keywords.7": "Restream alternative",
  "chrome.meta.keywords.8": "unified chat for streamers",
  "chrome.meta.keywords.9": "OBS alert overlay",
  "chrome.meta.title.default":
    "Corneta — multistream: one stream, three platforms",
  "chrome.notfound.body":
    "The main stream is still up. Head back home and try another way.",
  "chrome.notfound.cta": "Go to the homepage",
  "chrome.notfound.sticker": "Error 404",
  "chrome.notfound.title.line1": "This page",
  "chrome.notfound.title.line2": "went off the air.",
  "chrome.og.description":
    "Multistream that runs on your PC: each platform on its own connection, chat in one place, and a report with the audience for each channel. Free for Windows.",
  "chrome.og.locale": "en_US",
  "chrome.og.title": "Corneta — one stream, three platforms, one chat",
  "chrome.twitter.description":
    "One stream, several platforms at once — and an app that keeps it up when the signal drops, then keeps the numbers for each one.",
  "chrome.twitter.title": "Corneta — one stream, three platforms, one chat",

  "closing.cta.note": "Windows 10/11 · no sign-up · no subscription",
  "closing.cta.title": "Go live everywhere.",
  "closing.faq.cta": "Download for free",
  "closing.faq.kicker": "Before you download",
  "closing.faq.subtitle": "Including the ones that don't make us look good.",
  "closing.faq.title": "What everybody asks before installing.",
  "closing.footer.download": "Download for Windows",
  "closing.footer.group.content": "Content",
  "closing.footer.group.legal": "Legal",
  "closing.footer.group.product": "Product",
  "closing.footer.link.privacy": "Privacy policy",
  "closing.footer.link.guides": "Guides",
  "closing.footer.link.help": "Help",
  "closing.footer.link.source": "Source code",
  "closing.footer.link.terms": "Terms of use",
  "closing.footer.nav.ariaLabel": "Footer links",
  "closing.footer.tagline":
    "Multistream that runs on your PC — not in somebody else's cloud.",

  "content.faq.free.answer":
    "It's free, with no sign-up and no trial. Everything that runs on your PC is open source and stays that way. If something paid ever shows up, it'll be an optional cloud service, and you'll know before.",
  "content.faq.free.question":
    "Is it really free? Will it turn into a subscription later?",
  "content.faq.macos_linux.answer":
    "Today the download is Windows only. It's built so other systems can come later, but there's no date to announce. If you're on macOS or Linux, the answer is: not yet.",
  "content.faq.macos_linux.question": "Does it work on macOS or Linux?",
  "content.faq.multistream_ban.answer":
    "Each platform decides that, not Corneta, and the rules depend on your account type and any contract you signed. Corneta just sends your signal where you tell it to: before your first simulcast, check the terms of whoever you've signed with.",
  "content.faq.multistream_ban.question":
    "Can I stream to Twitch and YouTube at the same time? Won't I get banned?",
  "content.faq.obs_plugin.answer":
    "If all you want is to send the same video to more than one place, the plugin does the job. Corneta earns its place when the stream is more than that: it holds the stream up if OBS crashes (the plugin goes down with it, since it lives inside OBS), puts every platform's chat and alerts in one place and, at the end, builds a report for each one.",
  "content.faq.obs_plugin.question":
    "I already use a multistream plugin in OBS. Why switch?",
  "content.faq.performance.answer":
    "Depends on the mode. Just copying the signal costs almost nothing. Re-encoding for each platform puts the work on the graphics card (recent NVIDIA, Intel or AMD) or, without one, on the processor, which hits harder. Corneta shows that load before you go live.",
  "content.faq.performance.question":
    "Will it lag my game? Do I need a good graphics card?",
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
  "content.features.deck_mode":
    "Deck mode: your phone becomes the stream panel over your home Wi-Fi, with mark a moment, BE RIGHT BACK, scene, mic, warnings, chat and stream health, no app to install",
  "content.features.load_estimate":
    "Estimate of your total upload and of the load on your graphics card before you go live",
  "content.features.multistream":
    "Multistream from a single signal to Twitch, YouTube, Kick, Facebook and any RTMP server",
  "content.features.overlay":
    "Alert and chat overlay for OBS, served from your own machine as a Browser Source",
  "content.features.post_live_report":
    "Post-stream report with audience, chat, alerts and followers per channel, comparison with your previous stream and export to HTML, CSV and JSON",
  "content.features.quality_modes":
    "Three quality modes — copy the signal, convert only what needs it, or convert everything",
  "content.features.report_per_channel":
    "Viewers, chat and alerts in the report broken down by channel, with export to HTML, CSV and JSON",
  "content.features.unified_chat":
    "One chat for Twitch, Kick and YouTube, with emotes — you reply and moderate right there",
  "content.features.vertical_crop":
    "Vertical 9:16 crop with manual framing for TikTok and Instagram",
  "content.one_liner":
    "Corneta is a free, open source Windows app that takes a single video signal from OBS (or from any program that streams over RTMP) and sends it at the same time to Twitch, YouTube, Kick, Facebook and other destinations, each platform on its own connection. Beyond just sending the video, it handles the whole stream: it gathers chat and alerts from every platform, keeps the stream up when the program's signal drops, and builds a post-stream report that cross-checks the machine, OBS and the platforms to point at the likely cause of each instability — all of it processed on the streamer's own computer.",
  "content.steps.1.text":
    "One click and OBS sends the stream to Corneta. Another app? Paste an address and a key once.",
  "content.steps.1.title": "It sets up OBS for you",
  "content.steps.2.text":
    "Twitch, YouTube, Kick and more. Sign in and the key fills itself in.",
  "content.steps.2.title": "Pick your platforms",
  "content.steps.3.text":
    "Each platform goes live on its own, and you watch them all on one panel.",
  "content.steps.3.title": "Hit GO LIVE",

  "hero.cta.footnote":
    "Corneta for Windows 10/11 · no sign-up · no subscription",
  "hero.download.compact": "Download",
  "hero.download.full": "Download free for Windows",
  "hero.header.brand.aria": "Corneta — home",
  "hero.header.download": "Download free",
  "hero.nav.aria": "Main navigation",
  "hero.nav.guides": "Guides",
  "hero.nav.help": "Help",
  "hero.nav.platforms": "Platforms",
  "hero.nav.lang": "View in Portuguese",

  "knowledge.guides.action": "Step-by-step guides",
  "knowledge.help.action": "Help center",
  "hero.pitch":
    "From your OBS to Twitch, YouTube and Kick at the same time, with one chat. Free, and it runs on your PC.",
  "hero.skiplink.label": "Skip to content",
  "hero.sticker": "Multistreaming that runs on your PC",
  "hero.title.line1": "One stream.",
  "hero.title.line2": "Every platform.",
  "hero.trust.opensource": "Open source",

  "page-data.destinations.custom.name": "Custom RTMP",
  "page-data.destinations.facebook.name": "Facebook",
  "page-data.destinations.instagram.name": "Instagram",
  "page-data.destinations.kick.name": "Kick",
  "page-data.destinations.tiktok.name": "TikTok",
  "page-data.destinations.twitch.name": "Twitch",
  "page-data.destinations.x.name": "X (Twitter)",
  "page-data.destinations.youtube.name": "YouTube",
  "page-data.tiny.backup.title": "Settings backup",
  "page-data.tiny.chatwindow.title": "Little chat window",
  "page-data.tiny.hotkey.title": "Global hotkey",
  "page-data.tiny.profiles.title": "Saved profiles",
  "page-data.tiny.startup.title": "Starts with Windows",
  "page-data.tiny.theme.title": "Light and dark theme",
  "page-data.tiny.tray.title": "Lives in the tray",
  "page-data.tiny.youtube.title": "YouTube on autopilot",

  "steps.accounts.lede":
    "Connecting your account is optional. With it, Corneta creates the YouTube broadcast, gets the key and brings in the chat; what it does with each permission is in the",
  "steps.accounts.privacy.link": "privacy policy",
  "steps.local.body":
    "The stream goes from your computer straight to each platform, and your keys, settings and reports stay with you.",
  "steps.local.check.free": "Free, no sign-up",
  "steps.local.check.keys": "Keys in Windows Credential Manager",
  "steps.local.check.license": "Open source",
  "steps.local.honest.body":
    "And re-encoding loads your GPU or CPU. Corneta measures your connection and shows, mode by mode, how much upload and PC the stream will take, before you go live.",
  "steps.local.honest.label": "The honest math",
  "steps.local.honest.title": "Every platform eats a chunk of your upload.",
  "steps.local.kicker": "Runs on your PC",
  "steps.local.proof.link": "See the code",
  "steps.local.title": "No server in the middle. No monthly fee.",
  "steps.platforms.kicker": "Platforms",
  "steps.platforms.lede": "And you can add any RTMP server.",
  "steps.platforms.note.experimental.strong":
    "TikTok, Instagram and X are experimental.",
  "steps.platforms.note.validation":
    "Test each destination with your account and setup before an important stream: being in the app doesn't guarantee the platform will accept it.",
  "steps.platforms.title": "The big four come ready.",
  "closing.cta.replay": "Watch the video again",
  "feat.tiny.title": "Plus",
  "feat.report.alt":
    "Stream audience chart by platform, with Twitch, YouTube and Kick and the highlight markers",
  "feat.report.text":
    "Each platform's audience and the stream's best moments, with the exact minute to clip.",
  "feat.report.title": "The report after the stream",
  "feat.chat.alt":
    "Corneta unified chat with messages from Twitch, YouTube and Kick",
  "feat.chat.text":
    "Twitch, YouTube and Kick in one feed, plus alerts and an OBS overlay.",
  "feat.chat.title": "Chat, alerts and overlay",
  "feat.deck.title": "Your phone becomes your stream panel",
  "feat.deck.text":
    "Mark moments, turn on BE RIGHT BACK, switch scenes and answer chat without alt-tabbing out of your game, with no app to install and no account.",
  "feat.deck.does.label": "On your phone",
  "feat.deck.does.mark": "mark a moment",
  "feat.deck.does.brb": "BE RIGHT BACK",
  "feat.deck.does.scene": "scene and mic",
  "feat.deck.does.alerts": "warnings with the fix",
  "feat.deck.does.chat": "chat and stream health",
  "feat.deck.does.combos": "combos",
  "feat.deck.cost":
    "Off by default, works only on the PC's Wi-Fi, and the connection isn't encrypted: skip public networks.",
  "feat.deck.keys.alt":
    "Deck mode on a phone mid-stream, with the big mark-a-moment button plus BE RIGHT BACK, mic, scene, title, chat message and end stream",
  "feat.deck.chat.alt":
    "Twitch, YouTube and Kick chat on a phone, with the warning that someone mentioned you and the Reply button",
  "feat.protection.alt":
    "Corneta's safety nets drawer with BE RIGHT BACK and auto-bitrate turned on",
  "feat.protection.text":
    "If OBS drops, BE RIGHT BACK goes on air without ending the stream. If your internet chokes, auto-bitrate eases the re-encoded destinations.",
  "feat.protection.title": "Safety nets",
  "feat.independent.alt":
    "Corneta live panel: Twitch and YouTube live, Kick reconnecting",
  "feat.independent.text":
    "Each platform has its own connection: if one drops, only that one reconnects.",
  "feat.independent.title": "If one drops, the rest keep going",
  "feat.title": "Built to keep the stream up.",
  "feat.kicker": "What comes with it",
  "content.steps.4.text":
    "Twitch, YouTube and Kick in one feed: reply and moderate from there.",
  "content.steps.4.title": "One chat for all",
  "how.watch": "Watch it ({time})",
  "how.title": "From OBS to live in four steps.",
  "hero.video.real": "Real app screens",
  "hero.video.label": "Video: one stream, every platform — how Corneta works",
  "hero.video.play": "Watch Corneta in action",
  "hero.nav.features": "Features",
  "hero.nav.how": "How it works",
  "feat.sample": "App screens with sample data.",
  "feat.more.quality": "3 quality modes",
  "feat.more.vertical": "9:16 vertical crop",
  "steps.platforms.tag.experimental": "experimental",
  "closing.faq.more": "Didn't find yours?",
  "feat.report.moments.alt":
    "Highlights worth clipping: audience spikes and the minute the chat blew up",
  "feat.report.export.label": "Exports as",
  "feat.report.export.chapters": "YouTube chapters",
  "feat.report.export.csv": "spreadsheet (CSV)",
  "feat.report.export.edl": "EDL for your editor",
  "hero.video.captions": "English",
  "steps.local.honest.alt":
    "Corneta Quality screen: the Straight up, Smart and All out modes with each one's PC load and upload, and the connection measured at 24 Mbps",
};
