---
name: Corneta
description: One stream. Many communities. All under your control.
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

## Design file policy

This document guides the site's visual work; the styles and components in `app/` implement the interface. [PRODUCT.md](PRODUCT.md) defines what the product may claim. To implement changes, check this document and the code first. The design tool is not required to contribute, test or build, and its state is not versioned.

## Overview

**Creative North Star: "The megaphone poster"**

Corneta is a desktop app drawn like a printed comic-book poster, and the landing page comes off
the same press: solid blocks of color, **hard** shadows (offset, no blur), dry corners and fat
type that speaks loudly. The world is not invented for the page — it is inherited from the
app's `src/index.css`. Whoever downloads recognizes the screen; whoever arrives through the
landing page has already seen the product.

The landing page opens on the **desk**: paper (`#f3ead7`, the app's light theme) with the dot
grid, the same setting as Corneta's videos, with the intro video taped to it in the center.
After that it alternates the desk with the stage, the app's Warm Pitch (`#100b07`) with printed
halftone. Brass leads: it is the title's highlighter stroke, the video's play button, the active
item, the tilted sticker and the bar above the numbers. Tomato is the call to action —
download. Mint reports health, amber reports reconnection. No blue, no glow, no decorative
diffuse shadow: these effects do not belong to the site's visual language.

The voice is Brazilian and direct, without turning childish. Baloo 2 speaks; Inter explains and
operates. The app screens on the page are real crops with sample data, labeled as such, and the
photo in the video carries the "imagem ilustrativa" (illustrative image) seal in the frame itself — honesty is part of the brand's tone. Copy follows the
[voice and tone guide](../docs/VOICE-AND-TONE.md).

**Key Characteristics:**

- The paper desk with a dot grid in the hero; a dark stage with halftone in the product bands.
- Hard 3–10px shadows with no blur; each piece looks like a stuck-on sticker, not a floating element.
- Solid brass blocks with dark ink — including the video's play button.
- Dry corners (4–14px). Pills only for status dots and sound waves.
- Official platform logos in brand chips, the same as in the app.
- Corneta's video in the center and crops of the real app screens as proof, not a generic mockup.

## Colors

A two-temperature palette: the studio's pitch black and the print shop's paper, with brass and
tomato carrying brand and action.

### Primary

- **Warm Pitch** (`#100b07`): stage background — the four-step strip, platforms, closing CTA,
  footer and the app's darkest surfaces. Always with the brass halftone at 5%.
- **Brass** (`#ffb323`): the brand color. The title's highlighter stroke, the video's play
  button, the active item, stickers, bars above numbers, the "honest math" panel and the
  horn icon.

### Secondary

- **Tomato** (`#ff5a36`): reserved for action — download for Windows — and for the sticker on
  what is experimental. It never decorates a block that does not ask for a click; the video's
  play button is brass.
- **Brass Ink** (`#2a1c00`): the dark ink that always goes with brass (text on brass, hard
  shadow on a dark panel).

### Tertiary

- **Mint** (`#56e39b`): destination live, upload headroom, confirmed items. It does not compete with the action.
- **Warning Amber** (`#ffc23d`): reconnecting, "may fail". The color of the honest caveat.
- **LIVE Red** (`#ff4733`): only the pulsing on-air dot.

### Neutral

- **Surface** (`#1a130c`): default panel on the stage and the platform tile.
- **Raised Surface** (`#221a10`): rows and controls inside dark panels.
- **High Surface** (`#2e2314`): off state (switch turned off, destination down).
- **Deep Panel** (`#0b0805`): titlebar, sidebar, chat column, header and footer. It is also the
  color of every hard shadow on a dark background.
- **Cream** (`#fcf3e3`) / **Muted Cream** (`#c6b69b`) / **Faint Cream** (`#8c7a60`): text on
  dark, in three levels. On a raised surface (`#1a130c`/`#221a10`) the faint level moves up to
  **Raised Faint Cream** (`#a08d70`); otherwise contrast drops below AA.
- **Paper** (`#f3ead7`) and **Light Paper** (`#fffaf0`): reading bands; they alternate when two
  light sections touch.
- **Ink** (`#2a1c0a`) / **Muted Ink** (`#5f4e36`) / **Faint Ink** (`#6f5d3f`): text on paper.
  **Paper Line** (`#cbb88f`) separates light rows.
- **Tomato Ink** (`#b83218`): kicker on paper, where plain tomato would not have enough contrast.

### Named Rules

**The Two Jobs Rule.** Brass is brand and emphasis; tomato is action. If a tomato block neither
starts a download nor goes live, it is wrong. Mint reports health, amber reports caveats —
never the other way around.

**The No Blue Rule.** The system has no blue. Routing, links and states use brass, mint or
amber.

**The Ink on Color Rule.** Every saturated block (brass, tomato, mint, amber) gets text in dark
ink (`#2a1c00` or `#0b0805`), not white. The app screen crops stay as the app is, so they do
not follow this rule.

## Typography

**Display Font:** Baloo 2 (with `Segoe UI`, system-ui, sans-serif)
**Body Font:** Inter (with `Segoe UI`, system-ui, sans-serif)

**Character:** Baloo 2 is fat, round and spoken — it is the horn shouting. Inter is the voice
that explains the upload math without drama. Both are exactly the app's fonts, so the landing
page and the product sound the same.

### Hierarchy

- **Display** (800, `clamp(3rem, 6.4vw, 5.7rem)`, 0.92, -0.035em): only the hero promise, on
  two centered lines, the second underlined by a brass highlighter stroke.
- **Headline** (800, `clamp(2.35rem, 4.2vw, 3.9rem)`, 0.98): section turns and the closing CTA.
  In a narrow column (two-column layout) it drops to `clamp(2.1rem, 3.2vw, 3.05rem)`.
- **Title** (800, `clamp(1.3rem, 2.1vw, 1.8rem)`, 1.08): step and feature titles.
- **Body** (500, `1rem`, 1.68): explanations and caveats; measure between 46ch and 68ch.
- **Label** (800, `0.72rem`, `0.1em`, uppercase): kicker, panel label, sticker and state.
- **Action** (Baloo 800, `1.24rem`): download button. The button speaks in the brand font, not
  the body font.
- **UI** (Baloo 700, `0.9rem`) and **Micro** (Inter 550, `0.62rem`): the app's internal scale.
  It only appears on product surfaces drawn on the site; the landing page shows the product
  through crops of the real screens, so page text never goes down to that scale.

- **Mono** (`ui-monospace`, `0.7rem`): copyable values only. Monospace here is data, not a
  "techy" costume.

### Named Rules

**The Who Speaks Rule.** Baloo 2 for promises, names and buttons; Inter for everything the
streamer needs to understand or operate. A paragraph in Baloo is a mistake.

## Layout

A central shell of at most 1220px with a 3rem gutter, tightening to 2.5rem below 980px and 2rem
below 760px. Sections breathe `clamp(78px, 8vw, 122px)`; panels and product surfaces work with
8–26px of internal spacing.

The first viewport is the desk: sticker, centered two-line title, short pitch and the large
video in the center (up to 1140px), taped down, with the download button right below it. No
supporting text between the video and the button other than the "Windows 10/11 · no sign-up"
line. On mobile the video takes the full width and the tape disappears.

After the hero, in this order: the dark four-step strip (brass number, title, one sentence and
the shortcut to that part of the video); the feature mosaic on paper, with real crops and a row
of "Plus" chips; the platform wall on the dark stage; on the desk, what runs on your PC (title,
one sentence and three trust chips), the brass "honest math" panel with the crop of the app's
Quality screen (on mobile, only the recommended mode) and a line about the accounts with the
privacy policy link, where each permission is detailed; the FAQ — eight numbered questions, all
collapsed, with the title column sticky while scrolling and the guide and help cards in it (on
mobile they come after the questions); and the closing CTA. Below 980px the two-column layouts
and the mosaic collapse into one column; on mobile, each step becomes a row with the number
beside it.

**The One Sentence Rule.** Steps and feature cards get a title and one sentence; the screen
crop does the rest. A caveat fits in one line; what really needs more words — the account
permissions — goes in the privacy policy, with one line and the link on the page, never in a
sales paragraph. The FAQ does not repeat what the page already shows (platforms, overlay,
vertical video). If the page repeats the same promise in two sections, one of them goes.

**The Stage Before Grid Rule.** Start with a working product scene — the video — or with an
ordered sequence. Never with a grid of icon + title + text cards.

**The Alternating Rhythm Rule.** Two adjacent light sections switch tone (`#f3ead7` ↔
`#fffaf0`); two adjacent dark ones get a brass or tomato band between them.

## Elevation & Depth

Depth is print, not light: all relief is a **hard** offset shadow with no blur, like
out-of-register ink — including the video frame. Reading surfaces are flat and are separated by
a hairline or a change of tone.

### Shadow Vocabulary

- **Pop** (`box-shadow: 4px 4px 0 0 #0b0805`): default piece on a dark surface — stickers, the
  LIVE banner, stat blocks, the GO LIVE button.
- **Pop Small** (`box-shadow: 3px 3px 0 0 #0b0805`): trust chips and platform glyphs.
- **Pop Brass** (`box-shadow: 4px 4px 0 0 #2a1c00`): brass pieces on a dark panel (brand mark,
  active item, sticker, compact header button).
- **Pop Ink** (`box-shadow: 4px 4px 0 0 #2a1c0a` / `7px 7px` in the large version): dark panels
  and blocks resting on paper.
- **Pop Cream** (`box-shadow: 4px 4px 0 0 #fcf3e3`): only the download button on the dark
  stage, where a dark shadow would disappear.
- **Title Misregistration** (`box-shadow: 7px 7px 0 0 #ff5a36`): exclusive to the brass slab
  (`Slab`, on the 404 page) — the tomato behind the brass imitates out-of-register printing.
- **Video Frame** (`box-shadow: 10px 10px 0 0 #2a1c0a`): the largest shadow in the system, only
  for the video on the desk; drops to 6px on mobile.

### Named Rules

**The Dry Shadow Rule.** A shadow has an offset and no blur. If `blur` shows up, it has become
glow — and glow is the old world. The tape holding the video is flat paper, with no shadow.

**The Visible Offset Rule.** The shadow color depends on the background: `#0b0805` on dark,
`#2a1c0a` on paper, `#fcf3e3` for the action button on the stage. An invisible shadow is a wrong
shadow.

## Shapes

Dry geometry: 4px on indicators and stickers, 7px on controls, rows and buttons, 10px on
panels, 14px on windows and highlighted fields. Nothing above 14px. Pill (`999px`) only on
status dots, switch thumbs and sound waves. Borders exist to separate app zones (1px `#3d301c`
/ `#281f12`), for the editorial rules on paper (2–3px of solid ink) and as the 3px ink frame of
a piece resting on the desk (video, feature card), always together with Pop Ink. A colored
border never outlines anything.

Tilt is part of the system's material: stickers rotate between -3° and +2°. The brand mark uses
a brass square tilted -6°, with an outline and a solid shadow in brass ink, no blur. The horn
follows the tilt; the name stays straight. In exported icons, the transparent margin preserves
the corners and the shadow. Always on a small, solid piece — running text never rotates.

**The Dry Corner Rule.** If the radius goes past 14px, the drawing has left the world. A pill is
a state, not a silhouette.

## Components

### Buttons

- **Shape:** dry-cornered rectangle (7px), 70px tall in the hero dock, 64px in the closing CTA,
  44px with a 4px corner in the compact header version.
- **Primary (download):** tomato `#ff5a36` with `#2a1c00` ink, Baloo font, Pop Cream shadow on
  the stage (Pop Brass in the compact header version).
- **Hover / Active:** hover lightens to `#ff7a55`; the click **sinks** — `translate(4px, 4px)`
  and the shadow goes to zero, in 90ms. It is the same gesture as the app's button.
- **Video play button:** brass square with a 14px corner, 3px ink border, rotated -6° like the
  brand mark, hard ink shadow; it straightens on hover and sinks on click.
- **Focus:** 3px brass outline with a 3px offset; on brass the outline turns dark ink. On the
  desk, where brass disappears against the paper, the outline is tomato.

### Chips

- **Sticker (`.sticker`):** brass block with dark ink, 0.72rem uppercase, Pop Brass shadow and
  a -2.2° rotation. The tomato variant rotates +1.8° and keeps the dark ink.
- **State chip (`.chip`):** small solid block; mint = tested/live, amber = may fail, high
  surface = neutral. Text always in dark ink.
- **Destination tile:** surface with the platform's official glyph in the brand color (44px,
  4px corner, Pop Small shadow) and the name in Baloo. TikTok, Instagram and X carry the same
  "experimental" sticker the app shows on them, and the caveat comes in a single line below the
  wall. The page does **not** classify destinations by internal validation status: no “tested”,
  “pending” or “may fail” badge appears on them.

### Cards / Containers

- **Corner Style:** 10px on panels and crops, 14px on cards, the video frame and the brass panel.
- **Background:** `#1a130c` for a dark panel on paper, `#221a10` for inner rows, brass for the
  "honest math" panel.
- **Shadow Strategy:** one hard shadow per piece, colored according to the background (see
  Elevation).
- **Border:** between app zones (1px), as an editorial rule on paper (2–3px) and as the 3px ink
  frame of a piece resting on the desk.
- **Internal Padding:** 18–26px is the recurring range.

### Navigation

Header sticky at the top in translucent `#0b0805` with a `#281f12` hairline. Links in Inter 650,
muted cream; on hover the text turns cream and a 3px brass bar grows from the left. Below 760px
the navigation goes away and only the compact action remains.

### Signature: the video on the desk

The centerpiece is Corneta's intro video (the same "paper on the desk" as the ads), in the
page's language version. It is a native `<video>` with controls and a poster — the "your PC →
Corneta → Twitch, YouTube and Kick" frame — that plays without JavaScript; with JavaScript, the
cover with the brass play button and the duration comes in, along with the steps' "Watch it"
shortcuts. On the cover, the poster is darkened by a flat 80% night veil, with no blur, and the
play button sits exactly on the poster's brass logo, with the duration tag over the word
"Corneta"; the veil disappears on play. There are no chapters or transcript on the page: the
narration comes as WebVTT captions in the player itself (off by default), generated from the
real timing of each line. The video does not autoplay and only downloads on click
(`preload="none"`): AV1/Opus in WebM and, for browsers that cannot decode AV1, H.264/AAC in 720p
MP4.

### Signature: app screen crops

The screens shown in the features are crops of the real app screens at 2×, taken from the
contributor demo mode, with the same sample data as the video and labeled "App screens with
sample data." They sit inside the mosaic's paper cards, in a 2px ink frame with a 10px corner,
below the title and the sentence. Since the Quality screen was only captured in Portuguese, the English crop replaces each string with
the one from the app's own dictionary, key by key. Two wide cards stack pieces. In the report,
the "Highlights (worth clipping)" list rests on the right edge of the per-platform audience
curve, with Pop Ink, and the three exports (YouTube chapters, CSV, EDL) sit in chips below the
curve. In Deck mode, which comes before the report because it is the "during" of the stream,
two upright phone screens (the buttons, and the chat with a notice) sit side by side. The chat
one sits lower and leans against the other, both with a 5px ink frame, a 14px corner and Pop
Ink, so they read as a device and not as a crop. The text sits beside them: title, sentence,
chips for what the phone does and the network caveat in one line. The app interface is never
redrawn in HTML for the page: when the app changes, the crops are redone.

### Accent stripe

Inherited from the app (`.accent-l`): a 4px brass bar on the left edge of a block on a deeper
surface. It is the only place where a thick colored border is allowed, and it exists to
highlight a note within running text (the callout on the legal pages). Outside that role, a
thick colored border remains forbidden.

### Safety net block

The safety net is the tall card in the feature mosaic: title in Baloo, one sentence in Inter,
and the crop of the app's Safety nets drawer (with the switches as the app shows them).

**The Visible Cost Rule.** No safety net block ends without saying what it costs (delay, load,
conflict with OBS). Selling the net without the price is the opposite of the brand's tone.

### Motion

One orchestrated entrance and nothing more: sticker, title, pitch and video rise 16px with
`cubic-bezier(0.16, 1, 0.3, 1)` over staggered 500–720ms, starting from an already visible
state (opacity 0.2). Right after, the highlighter stroke draws itself once under the second
line of the title (720ms). The only continuous motion is the mascot's "shout" in the CTA
(2.4s); what moves on the page is the video, and only when the person presses play.
`prefers-reduced-motion` cuts all of them and makes the video shortcuts jump without smooth
scrolling.

## Do's and Don'ts

### Do:

- **Do** inherit tokens from `../src/index.css`: if it changes in the app, it changes here.
- **Do** use a hard shadow with an offset and no blur, with the color chosen by the background.
- **Do** keep brass as brand/emphasis and tomato as the only action color.
- **Do** show the app working (the video and the crops of the real screens) instead of
  illustrating a concept.
- **Do** label the screens as sample data; the photo in the video already carries the "imagem
  ilustrativa" (illustrative image) seal.
- **Do** show bandwidth and load only through the crop of the app's Quality screen (which
  computes with `src/lib/estimates.ts`), never with made-up values.
- **Do** keep the page usable without JavaScript: the video is a native `<video>`, and the cover
  and shortcuts only enhance what already works.
- **Do** state the cost of each feature in the same piece that sells it.
- **Do** use the platforms' official logos in their real colors, as the app does.
- **Do** alternate the dark stage and paper bands to give the reading a rhythm.

### Don't:

- **Don't** use blue, gradients, glow, glass or decorative diffuse shadows.
- **Don't** go past a 14px radius or use a pill as the silhouette of a button, chip or panel.
- **Don't** turn the page into a grid of identical icon + title + text cards.
- **Don't** rotate running text; tilt is only for stickers and small solid blocks.
- **Don't** paint the video's play button or an ornament tomato: tomato means download.
- **Don't** redraw app screens in HTML for the page; use crops of the real screens.
- **Don't** put white text on brass, mint or amber.
- **Don't** invent metrics, testimonials or customer logos: there are none.
- **Don't** show a feature that is turned off by a feature flag (the co-stream “Table” is out).
- **Don't** organize the page by internal QA status (“validated”, “pending”): that is project
  paperwork. The caveat goes with the item, in the words of the person using it.
- **Don't** use monospace outside copyable values.
