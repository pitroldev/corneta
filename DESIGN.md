---
name: Corneta
description: "Stream to every platform at once, without the headache."
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
  tomato: "#ff5a36"
  tomato-strong: "#ff7a55"
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
  button-tomato:
    backgroundColor: "{colors.tomato}"
    textColor: "#ffffff"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-tomato-hover:
    backgroundColor: "{colors.tomato-strong}"
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

Interface copy follows the [voice and tone guide](docs/VOICE-AND-TONE.md), shared with the site and the editorial content. This document defines the visual language without duplicating the writing rules.

**Creative North Star: "A Corneta Poster at Work"**

Corneta is a desktop tool in **Operate** mode with the authorial voice of a poster and a comic: dark ink, warm paper, brass, tomato, solid blocks, sturdy type and dry shadows. The visual expression serves fast reading of a live-stream operation; the brand shows up in precise details, without competing with state, content or the next action.

In reports, the narrative is live-first and editorial. Each viewport must have one clear protagonist, and the reading order keeps the portrait of the stream before the replay, then evolution, audience and moments, community and, finally, technical data under progressive disclosure. Health and incidents are secondary notes inside the technical chapter, never the headline of the stream. Empty, missing, loading, unavailable and error states must say honestly what happened and which action is still possible.

The dark theme is the normative reference for the tokens above. The light theme keeps the same semantic roles, swapping ink for warm paper/comic surfaces while keeping brass, tomato and dark shadows; the actual overrides live in `src/index.css` and must not create a second component naming scheme.

**Key Characteristics:**

- Operational poster/comic, not a generic corporate dashboard.
- Brass for selection, orientation and the main action; tomato for call-outs and the live state.
- Solid surfaces and tonal hierarchy before borders.
- Hard, offset shadows with no blur.
- One protagonist per viewport, with technical complexity revealed on demand.
- Visible focus, AA contrast, reducible motion and honest states.

## Colors

The palette combines brown-black ink, warm papers, ivory and two high-energy print accents.

### Primary

- **Action Brass** (`colors.brass`): marks selected navigation, primary buttons, editorial icons, progress and highlighting.
- **Lit Brass** (`colors.brass-strong`): hover response on brass actions.
- **Ink on Brass** (`colors.brass-ink`): keeps text and focus readable on brass surfaces.

### Secondary

- **Call-out Tomato** (`colors.tomato`): emphatic action, live state and badges that need to interrupt scanning.
- **Lit Tomato** (`colors.tomato-strong`): hover response of the tomato call-out.

### Tertiary

- **Live Red** (`colors.live`): on-air presence and pulse.
- **Steady Green**, **Attention Yellow**, **Failure Red** and **Information Blue** (`colors.ok`, `colors.warn`, `colors.bad`, `colors.info`): semantic states; never trade these roles for decoration.

### Neutral

- **Background Ink** and **Navigation Panel** (`colors.bg`, `colors.panel`): app shell and sidebar.
- **Dark Papers** (`colors.surface`, `colors.surface-2`, `colors.surface-3`): layers by fill, from main content to supporting content.
- **Strokes** (`colors.border`, `colors.border-soft`): necessary divisions, not an automatic outline around every block.
- **Reading Ivories** (`colors.ink`, `colors.ink-muted`, `colors.ink-faint`): main content, supporting text and metadata.
- **Shadow Night** (`colors.night`): dry shadow and the replay stage.

### Named Rules

**The Solid Ink Rule.** Use solid patches of brass, tomato or surface; do not introduce glow, glass, generic gradients or decorative halos.

**The Semantic Signal Rule.** Green, yellow, failure red and information blue communicate state. Brass and tomato carry brand and priority; they do not replace the meaning of a state.

## Typography

**Display Font:** Baloo 2 (with Segoe UI and system-ui as fallback)

**Body Font:** Inter Variable / Inter (with Segoe UI and system-ui as fallback)

**Character:** Baloo 2 brings the rounded heft of signage and comics; Inter keeps explanations, controls and dense data crisp. The contrast between the two families is part of the identity and also separates story from instrumentation.

### Hierarchy

- **Display** (800, 2.25rem; 3rem from 640px up, line-height 1): protagonist title of the report and of the featured session.
- **Headline** (800, 1.875rem, line-height 1.05): screen title, stream portrait and editorial section.
- **Title** (800, 1.25rem, line-height 1.05): panel, modal and technical disclosure titles.
- **Navigation** (700, 1rem, line-height 1.25): main sidebar navigation.
- **Action** (700, 0.875rem, line-height 1): brand buttons and compact CTAs.
- **Body** (400, 0.875rem, line-height 1.5): explanations and operational content; editorial descriptions stay within about 42rem.
- **Label** (700, 0.6875rem, tracking 0.025em, uppercase): kicker, stat, badge and short metadata.

### Named Rules

**The Two Voices Rule.** Use Baloo 2 for titles, navigation, protagonist numbers and brand actions; use Inter for reading, descriptions, forms and instrumentation.

**The Poster, Then Footnote Rule.** The hierarchy starts with a short, heavy phrase; context and precision come below in smaller Inter, never squeezed into the same title.

## Layout

The desktop shell uses a fixed 16rem sidebar and a scrollable main area with 2rem padding. Measure responsiveness by the width left after the sidebar, not by the whole window. The report list is capped at 64rem; the editorial detail opens up to 72rem.

The base rhythm uses 4px steps and relies mostly on 8, 12, 16, 20, 24 and 32px. Narrative sections of the report are 48px apart. Within a section, titles, cards and controls sit closer together so each block reads as one unit.

At the base size, content and controls stack in one column. At 640px, titles and paddings can grow. At 1280px, only pairings that gain a real comparison become two columns: stream portrait with stats, replay with chat, evolution with moments, and technical grids. The main narrative column always gets more width than the supporting one.

In reports, keep this progression: editorial summary → replay → evolution/audience/moments → community → technical. The technical section starts collapsed; replay adjustment details also stay hidden until there is a need or evidence of a problem.

### Named Rules

**The One Protagonist Rule.** Each viewport has one dominant block; auxiliary grids must not compete with it in size, color or shadow.

**The Sidebar-Aware Rule.** The wide breakpoint only applies when the content left after the sidebar's 16rem can hold both columns without crushing text or controls.

## Elevation & Depth

The system is tonal by default and uses shadows only as an offset print: depth comes from solid blocks at different surface levels, accent bars and hard shadows. There is no ambient shadow, blur or glow.

### Shadow Vocabulary

- **Pop** (`box-shadow: 4px 4px 0 0 var(--color-night)`): protagonist, empty state, modal and any block that should look like a printed sticker.
- **Pop Small** (`box-shadow: 3px 3px 0 0 var(--color-night)`): editorial icon, platform glyph and compact badge.
- **Pop Brass** (`box-shadow: 4px 4px 0 0 var(--color-brass-ink)`): button or navigation on brass.

### Named Rules

**The Dry Shadow Rule.** Shadows have a visible offset and zero blur; if the depth calls for haze, the solution lies outside Corneta's world.

**The Flat-by-Default Rule.** A regular panel stands apart by its fill. A border or shadow only comes in when it communicates grouping, interaction or protagonism.

## Shapes

Corners are dry, softened just enough to keep controls friendly: 4px on badges and small controls, 7px on buttons and navigation, 10px on panels and 14px on protagonist editorial blocks. Bars, handles and state indicators can be circular when their function calls for continuous reading.

Borders are firm, usually 2px on fields, options and empty states; structural dividers use 1px. Subtle tilts, between about -3° and 2°, belong to badges, the mascot and live states, not to long-form content.

### Named Rules

**The Dry Corner Rule.** Do not turn every component into a capsule. The pill shape is reserved for a timeline, a dot, progress or another naturally continuous element.

## Components

### Buttons

- **Shape:** medium dry corners (7px); heights of 32, 40 and 56px for `sm`, `md` and `lg`.
- **Primary:** brass block, dark ink, Baloo 2 bold and a dry brass shadow; hover lights up the brass.
- **Tomato:** emphatic call-out in tomato, white text and a dry night shadow.
- **Ghost / Outline / Subtle:** ghost is text only, with a fill on hover; outline uses a 2px stroke; subtle rests on `surface-2`.
- **Danger:** failure color on a translucent layer with a semantic border; confirmation changes the label instead of relying on color alone.
- **Active / Disabled:** actions with a shadow shift 4px and lose the shadow when pressed; disabled ones sit at 40% with no interaction or shadow.
- **Focus:** dry 3px brass outline with a 2px offset; on brass, the outline turns dark ink.

### Chips

- **Style:** compact sticker with a 4px radius, 2px × 8px padding, uppercase label and wide tracking.
- **State:** semantic tones always use the matching contrast text; platform glyphs keep their official color and get a short shadow.

### Cards / Containers

- **Corner Style:** regular panel at 10px; protagonist editorial block at 14px.
- **Background:** `surface` for main content and `surface-2` for nested or supporting content.
- **Shadow Strategy:** no shadow by default; `pop` only on protagonists, empty states and modals.
- **Border:** none by default; use a brass bar, a soft divider or a semantic border when it carries meaning.
- **Internal Padding:** 20px on a regular panel; 24–32px on responsive protagonists.

### Inputs / Fields

- **Style:** 40px tall, `surface-2` background, solid 2px border, 7px radius and 12px horizontal padding.
- **Focus:** the border turns brass and the global focus ring stays visible.
- **Error / Disabled:** an error switches border and focus to `bad`; a disabled field keeps its value readable at 50% opacity with a not-allowed cursor.

### Navigation

The sidebar separates what you use during the stream (**Streaming**: Live, Chat, Reports) from what you prepare beforehand (**Set up**: Platforms, Quality), with no step numbers — the screens are not a mandatory sequence. The stream state (off air, connecting, on air with the elapsed time, error) sits at the top of the sidebar, visible on every screen. The active item is a brass block with an icon, Baloo 2 bold, a short hint in Inter and a dry shadow; inactive items use faded ink and only get a surface on hover. An attention dot marks Platforms when an enabled platform is not ready yet. The sidebar stays at 16rem in the desktop shell.

### Live Screen

The Live screen has one protagonist per state. Off air, four indicators (Platforms, OBS, Internet, Safety nets) say what is ready; each one opens its detail in a side drawer without leaving the screen. GO LIVE sits in a fixed bottom bar with a single status line — the same pending item never appears in more than one block. On air, the screen becomes a cockpit: per-platform numbers, machine load and, from 1280px up, the unified chat alongside.

### Drawer

On-demand detail opens in a 26rem side drawer, with a brass icon header, scrollable content and, when there is one, a footer with the path to the full screen. The drawer uses a 2px border and a dry shadow offset to the left; the backdrop darkens with ink, without blur.

### First-run Setup

First-time setup fills the window below the title bar: a brass step track on the left and one step at a time on the right. Each step finishes something real (platform connected, OBS pointed at Corneta, upload measured) instead of only explaining, and any step can be left for later — the dashboard shows what is still missing.

### Report Story

The report opens with a title and context, followed by a protagonist portrait of the stream that combines reach, duration, conversation and up to four stats. Story headers use a brass icon with a short shadow, a Baloo title and an Inter description. The replay takes the night stage; evolution, moments and community come in solid blocks; health, incidents and technical instrumentation live together inside `details` and start collapsed.

### Replay

The synced player keeps video, timeline and controls as the protagonist. Chat moves to a side column only at 1280px; below that, it stacks. Timeline and volume accept the keyboard, controls expose accessible names, a missing recording gets its own state, and sync adjustments only appear when needed.

### Motion

Button transitions take 75ms; screen entry takes 110ms with `easeOut`; the featured session reacts in 150ms. The live pulse (1.4s), the mascot (2.4s) and the marquee (14s) only appear where state or brand justify them. `prefers-reduced-motion` shortens transitions and removes infinite animations.

## Do's and Don'ts

### Do:

- **Do** reserve brass for orientation and the main action, tomato for call-outs and the semantic colors for state.
- **Do** build hierarchy with size, solid fill, space and one selective dry shadow.
- **Do** keep one protagonist per viewport and the editorial order of reports.
- **Do** treat problems as a secondary technical insight, after the story of the stream.
- **Do** compute wide layouts in the space left after the fixed 16rem sidebar.
- **Do** provide visible focus, AA contrast, keyboard support, reduced motion and text that names the state.
- **Do** show loading, empty, error, missing replay and unavailable control as distinct, honest states.

### Don't:

- **Don't** introduce glow, glass, blur, generic gradients or ambient shadow.
- **Don't** outline every panel; tonal surfaces are the default grouping.
- **Don't** turn every block into a floating card, every shape into a pill or every section into a metrics grid.
- **Don't** open the technical instrumentation before the story of the stream or leave rare adjustments permanently exposed.
- **Don't** use failures, drops or negative comparisons as the report headline or the archive summary.
- **Don't** use Baloo 2 for dense paragraphs or Inter in place of the voice of protagonist titles.
- **Don't** rely only on color, hover or animation to convey meaning or operation.
