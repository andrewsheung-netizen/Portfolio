---
name: Portfolio
description: A live personal net-worth cockpit — committed dark teal, mono numerals, silence when nothing needs you.
colors:
  bg: "oklch(0.155 0.03 215)"
  surface: "oklch(0.19 0.035 214)"
  surface-2: "oklch(0.225 0.04 213)"
  surface-3: "oklch(0.27 0.042 212)"
  line: "oklch(0.31 0.04 212)"
  line-soft: "oklch(0.245 0.038 213)"
  ink: "oklch(0.94 0.012 200)"
  ink-2: "oklch(0.8 0.025 203)"
  muted: "oklch(0.7 0.035 206)"
  cyan: "oklch(0.8 0.125 200)"
  cyan-hover: "oklch(0.85 0.115 198)"
  cyan-soft: "oklch(0.8 0.125 200 / 0.14)"
  on-cyan: "oklch(0.14 0.03 215)"
  gain: "oklch(0.78 0.16 155)"
  gain-soft: "oklch(0.78 0.16 155 / 0.13)"
  loss: "oklch(0.73 0.17 25)"
  loss-soft: "oklch(0.73 0.17 25 / 0.13)"
  warn: "oklch(0.84 0.13 85)"
  warn-soft: "oklch(0.84 0.13 85 / 0.13)"
  viz-equity: "oklch(0.72 0.11 205)"
  viz-option: "oklch(0.66 0.1 255)"
  viz-crypto: "oklch(0.72 0.12 300)"
  viz-cash: "oklch(0.78 0.09 160)"
  viz-home: "oklch(0.74 0.1 75)"
typography:
  display:
    fontFamily: "JetBrains Mono Variable, SF Mono, Menlo, monospace"
    fontSize: "3.25rem"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Space Grotesk Variable, Avenir Next, Helvetica Neue, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.15
  title:
    fontFamily: "Space Grotesk Variable, Avenir Next, Helvetica Neue, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.15
  body:
    fontFamily: "Space Grotesk Variable, Avenir Next, Helvetica Neue, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.01em"
  label:
    fontFamily: "Space Grotesk Variable, Avenir Next, Helvetica Neue, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
  numeric:
    fontFamily: "JetBrains Mono Variable, SF Mono, Menlo, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    letterSpacing: "-0.01em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
spacing:
  s-1: "0.25rem"
  s-2: "0.5rem"
  s-3: "0.75rem"
  s-4: "1rem"
  s-5: "1.5rem"
  s-6: "2rem"
  s-7: "3rem"
  s-8: "4rem"
components:
  button-primary:
    backgroundColor: "{colors.cyan}"
    textColor: "{colors.on-cyan}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.cyan-hover}"
  button-ghost:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 1rem"
  button-danger:
    textColor: "{colors.loss}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 1rem"
  input:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.75rem"
  chip-tab:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.75rem"
  chip-tab-active:
    backgroundColor: "{colors.cyan}"
    textColor: "{colors.on-cyan}"
---

# Design System: Portfolio

## 1. Overview

**Creative North Star: "The Instrument Panel"**

Not a terminal, not a spreadsheet — an instrument panel. A purpose-built cockpit for one pilot, where a committed deep teal surface carries the identity and live numbers provide the motion. The brand color is not an accent applied to a gray app; the app is built *out of* the brand color. Depth comes from tonal steps of the same teal, interactivity speaks in one cyan voice, and every numeral on screen is set in a tabular monospace so values align, tick, and never shift the layout.

The system explicitly rejects its three gravitational pulls (from PRODUCT.md): **Bloomberg terminal clutter** — energy is not density; most pixels stay quiet so the live ones can move; the **spreadsheet aesthetic** — tables earn hierarchy through typography and spacing, never gridlines; and **generic SaaS dashboard scaffolding** — no cookie-cutter metric cards, no template grids. It is one person's instrument: zero marketing chrome, zero hand-holding, and an attention strip that simply does not exist when nothing needs attention.

**Key Characteristics:**
- Committed color: the teal surface family carries 30–60% of every screen
- Numbers as the kinetic layer — mono numerals that tick (350ms ease-out), rows that pulse once on change
- The three-second answer: net worth, today's move, and anything actionable win the visual race before any scroll
- Silence is a feature: flags, badges, and strips render only when something is genuinely wrong
- Quiet density: fewer, larger, better-set numbers beat many small ones

## 2. Colors: The Instrument Palette

A committed dark-teal surface family, one cyan interactive voice, and a strictly quarantined semantic pair.

### Primary
- **Instrument Cyan** (`oklch(0.8 0.125 200)`, `cyan`): the single interactive voice — primary buttons, links, focus rings, active tabs, the sparkline, selection. Text on a cyan fill is always **Panel Ink-Dark** (`on-cyan`), never white (11.2:1). Hover brightens to `cyan-hover`; `cyan-soft` (14% alpha) is the row-pulse and selection wash.

### Neutral (the Panel Teal surface ramp)
- **Panel Teal** (`oklch(0.155 0.03 215)`, `bg`): the body surface. Depth is expressed by climbing this ramp, never by shadow:
  - `surface` (L 0.19) — panels, sheets, hover wash on table rows
  - `surface-2` (L 0.225) — skeletons, icon-button hover
  - `surface-3` (L 0.27) — progress troughs, deepest layer
  - `line-soft` (L 0.245) / `line` (L 0.31) — hairline row separators / bordered controls
- **Panel Ink** (`oklch(0.94 0.012 200)`, `ink`): primary text, tinted toward the teal — never neutral gray. Secondary `ink-2` (L 0.8), tertiary `muted` (L 0.7, still 7.4:1 on bg).

### Semantic (quarantined)
- **Signal Green** (`oklch(0.78 0.16 155)`, `gain`) / **Signal Red** (`oklch(0.73 0.17 25)`, `loss`): performance direction only, always paired with an explicit +/− sign or arrow.
- **Caution Amber** (`oklch(0.84 0.13 85)`, `warn`): staleness, expiry, missing data.
- Each has a 13% alpha `-soft` twin for tinted chips and confirm states.

### Data viz (deliberate full-palette moment)
- The five allocation classes get fixed hues: `viz-equity` (teal 205), `viz-option` (blue 255), `viz-crypto` (violet 300), `viz-cash` (green 160), `viz-home` (amber 75). These appear **only** in the allocation band and its legend.

### Named Rules
**The Committed Surface Rule.** The teal is the surface, not a garnish. If a screen reads as neutral-with-a-teal-accent, it has drifted off-system.

**The Semantic Quarantine Rule.** Gain/loss/warn colors mark direction and state exclusively. They never decorate, never brand, never appear on non-directional elements — and never appear without a sign, arrow, or word carrying the same meaning.

**The One Voice Rule.** Cyan means "you can act here." Anything cyan is interactive; nothing decorative is cyan.

## 3. Typography

**UI Font:** Space Grotesk Variable (with Avenir Next, Helvetica Neue fallbacks)
**Numeric Font:** JetBrains Mono Variable (with SF Mono, Menlo fallbacks)

**Character:** The sans does the talking, the mono does the counting. Space Grotesk's sharp terminals give the chrome its engineered confidence; JetBrains Mono's inherent tabular spacing is what makes columns align and live values tick without layout shift. Light-on-dark is compensated with +0.01em body letter-spacing.

### Hierarchy
- **Display** (mono 600, 3.25rem / 2.5rem mobile, 1.05, −0.02em): the net-worth numeral only — the single biggest thing on the home screen.
- **Headline** (sans 600, 1.375rem): section heads ("Holdings", "Home", "Activity").
- **Title** (sans 600, 1.125rem): sheet titles, the move line.
- **Body** (sans 400, 1rem, 1.5): prose, form values; max measure 65ch on notes.
- **Label** (sans 500, 0.75rem): field labels, table column heads, status text — normal case, never tracked-uppercase.
- **Numeric** (mono 400, 0.875rem table / scales with context): every figure in a data context.

### Named Rules
**The Mono Numbers Rule.** Every numeral in a data context is set in JetBrains Mono. A figure set in Space Grotesk is a bug.

**The Quiet Caps Rule.** No tracked-uppercase eyebrows, kickers, or label caps anywhere. Hierarchy comes from weight, size, and the ink ramp.

## 4. Elevation

Flat, with depth by light: this system uses **no box-shadows at all**. Layering is conveyed by climbing the Panel Teal lightness ramp (bg → surface → surface-2 → surface-3) and by 1px hairlines (`line-soft` within groups, `line` around controls). Modal sheets separate from the page with a dimmed backdrop (`oklch(0.08 0.02 215 / 0.65)`) rather than a drop shadow. Motion carries the remaining depth cues — the sheet slides up 24px on an expo curve.

### Named Rules
**The No-Shadow Rule.** If an element needs to feel "above," lighten its surface one ramp step. A box-shadow appearing anywhere in this codebase is off-system.

## 5. Components

Tactile and confident: controls read as pressable instruments — saturated fills, crisp 1px borders, instant (120ms) feedback, a 0.97 press scale. Nothing is decorative; state change is the only flourish.

### Buttons
- **Shape:** subtly rounded (6px), padding 0.5rem 1rem, weight 600.
- **Primary:** Instrument Cyan fill with Panel Ink-Dark text; hover brightens to `cyan-hover`; active scales to 0.97.
- **Ghost:** transparent with 1px `line` border, `ink-2` text; hover swaps border to cyan and text to ink.
- **Danger:** `loss` text, transparent at rest; two-step confirm — first press turns it into a `loss`-bordered, `loss-soft`-tinted "Confirm" state that resets on blur. Destructive actions are never one click.
- **Icon buttons:** 2.25rem square, hit area expanded to 44px via inset pseudo-element.

### Chips / Tabs
- **Type tabs** (Equity / Option / Crypto / Cash / Property): ghost-style chips; the active one fills cyan with dark text at weight 600.
- **Attention chips** (action strip): `surface` fill, 7px status dot, border tinted toward the status color at ~35% alpha. Loss-bordered when expired, amber when stale.
- **Currency toggle:** a small bordered chip showing the current mode ("HKD" / "Native"), cyan text, `aria-pressed`.

### Cards / Containers
- **Corner style:** 16px for sheets and the home card; cards are rare — the home panel is the only card on the dashboard, and cards never nest.
- **Background:** `surface` with a 1px `line-soft` border; no shadow (see Elevation).
- **Internal padding:** 1.5rem.

### Inputs / Fields
- **Style:** sunken — `bg` fill (one step *below* the sheet's `surface`) with 1px `line` border, 6px radius.
- **Focus:** border swaps to Instrument Cyan; no glow.
- **Invalid:** `:user-invalid` swaps the border to Signal Red — only after the user has touched the field.
- **Labels:** 0.75rem, weight 500, above the field, with inline muted hints ("per share", "% per year").

### Tables (the Ledger)
- **No gridlines.** Rows separate with 1px `line-soft` hairlines; the last row has none. Group heads carry a single stronger `line` rule.
- Numeric columns right-aligned in mono; position identity is a two-line cell (ticker bold, name muted small).
- Rows are interactive: tonal `surface` hover, keyboard-focusable (tabIndex 0, Enter opens edit), and a one-shot `cyan-soft` pulse when a live value changes.
- Secondary columns (`.col-md`) drop entirely below 640px — mobile keeps identity, quantity, value.

### Sheets (dialogs)
- Native `<dialog>`: bottom sheet on phones (rounded top corners, safe-area padding), centered 560px panel ≥640px. Backdrop click and Esc close. Slides up 24px / 320ms / ease-out-expo; reduced motion collapses it to instant.

### Signature: the Answer Block
Net worth as a display-scale mono numeral over a label, the signed move line beneath (arrow + amount + percent + honest comparison label), and an edge-to-edge cyan sparkline with soft area fill. This is the product's face; nothing may compete with it above the fold.

## 6. Do's and Don'ts

### Do:
- **Do** set every numeral in a data context in JetBrains Mono (The Mono Numbers Rule) — alignment and shift-free ticking depend on it.
- **Do** pair every gain/loss color with a sign, arrow, or word; color is never the only encoding.
- **Do** express depth by lightening the teal ramp one step; keep the system shadow-free.
- **Do** keep the action strip silent when nothing is wrong — absence is the success state.
- **Do** give every animation a `prefers-reduced-motion` collapse; ticks and pulses become instant updates.
- **Do** keep microcopy terse and informational: "as of 16:02", "expires in 9d", "valued 4 mo ago — update?". No exclamation marks.

### Don't:
- **Don't** drift into **Bloomberg terminal clutter** — no wall-to-wall density, no intimidating chrome, not every pixel filled (PRODUCT.md anti-reference, verbatim).
- **Don't** ship the **spreadsheet aesthetic** — no gridlines-everywhere, flat-hierarchy "Excel in a browser" tables (PRODUCT.md anti-reference, verbatim).
- **Don't** reach for generic SaaS dashboard scaffolding — cookie-cutter metric-card grids and template hero-stats undercut the purpose-built, single-owner character.
- **Don't** put white text on the cyan fill — it's a pale fill; dark `on-cyan` text is the system's contract (11.2:1).
- **Don't** use box-shadows, gradient text, side-stripe borders, tracked-uppercase eyebrows, or spinners over content (skeletons hold the space instead).
- **Don't** use the viz palette outside the allocation band, or cyan on anything non-interactive.
- **Don't** let a destructive action fire on first click — the two-step confirm pattern is mandatory for delete and undo.
