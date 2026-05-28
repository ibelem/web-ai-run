---
name: Web AI Benchmark
description: In-browser ML inference benchmark across WebNN, WebGPU, and Wasm backends.
colors:
  primary: "#0953DE"
  primary-hover: "#0742B0"
  primary-active: "#063594"
  accent: "#00C7FD"
  accent-light: "#F0FBFF"
  surface: "#FFFFFF"
  surface-raised: "#FFFFFF"
  surface-sunken: "#F5F7FA"
  surface-alt: "#EDF2F7"
  page-bg: "#FCFCFC"
  text-primary: "#181818"
  text-secondary: "#4A5568"
  text-muted: "#8F8F8F"
  border: "#E2E8F0"
  border-strong: "#ECECEC"
  backend-wasm: "#38A169"
  backend-webgpu: "#D69E2E"
  backend-webnn-cpu: "#00C7FD"
  backend-webnn-gpu: "#0953DE"
  backend-webnn-npu: "#002060"
  dtype-float: "#2B017F"
  dtype-int: "#0186B3"
  dtype-quant: "#D69E2E"
  dtype-mixed: "#38A169"
  semantic-success: "#38A169"
  semantic-error: "#E53E3E"
  semantic-warning: "#D69E2E"
  semantic-info: "#00C7FD"
  dark-surface: "#151F30"
  dark-page-bg: "#0A0F1A"
  dark-nav-bg: "#000000"
typography:
  title:
    fontFamily: "'Satoshi', system-ui, -apple-system, sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'Satoshi', system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Satoshi', system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  caption:
    fontFamily: "'Satoshi', system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  mono:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'tnum' 1"
rounded:
  sm: "3px"
  base: "3px"
  lg: "3px"
spacing:
  half: "3px"
  1: "6px"
  2: "9px"
  3: "15px"
  4: "18px"
  5: "21px"
  6: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "var(--space-1) var(--space-3)"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "var(--space-1) var(--space-3)"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.base}"
    padding: "6px 9px"
  chip-unselected:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.sm}"
    padding: "1px 7px"
  chip-selected:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "1px 7px"
  tag:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.sm}"
    padding: "1px 5px"
---

# Design System: Web AI Benchmark

## 1. Overview

**Creative North Star: "The Lab Notebook"**

This is a measurement instrument. Every screen is a readout: precise, dense, trusted. The Lab Notebook carries decades of legitimacy because it never performs — it records. This system applies the same discipline. Typography does the work; color signals state, not mood. White space is a breathing gap between data, not a decorative gesture.

The system runs two themes with equal conviction. Light mode: clean lab paper, high-contrast ink, zero warmth-washing. Dark mode: a deep navy field — not "dark mode for aesthetics" but the natural context for a developer staring at latency numbers at 2am on a monitor in a dim room. Both themes carry the same token vocabulary; only the surface values shift.

This system explicitly rejects: generic SaaS dashboard aesthetics (teal gradients, hero metrics, identical card grids), AI-demo aesthetics (glassmorphism, neon on black, gradient text, animated blobs), and the Inter + card-heavy combinations that read as "AI-generated UI." The Lab Notebook has no such reflexes. It has Satoshi for prose, JetBrains Mono for numbers, 3px radii everywhere, and a blue so specific it belongs to WebNN GPU.

**Key Characteristics:**
- Flat, almost-square corners (3px) — precision over softness
- Satoshi replaces Inter; same legibility, less ubiquity, more character
- JetBrains Mono for every metric, latency value, and model path — tabular figures, always
- A single blue primary accent (`#0953DE`) reserved for actions and active state only
- A secondary cyan (`#00C7FD`) exclusive to WebNN CPU and info states — not decoration
- Semantic backend colors form a consistent legend across every chart and badge
- 3px base spacing unit, non-standard — rhythm comes from multiples, not from 8px defaults

## 2. Colors: The Benchmark Palette

A restrained base with a deliberate data-visualization layer. The neutral surface does nothing; the semantic colors do everything.

### Primary
- **WebNN Blue** (`#0953DE`): Primary actions, active nav border, logo, WebNN GPU backend color, focus ring in light mode. This color has a job in the data layer and cannot be diluted as decoration.
- **Hover Depth** (`#0742B0`): Interactive hover state for primary buttons and links. Darkened in place, no hue shift.
- **Active Press** (`#063594`): Pressed/active state. One step darker still.

### Secondary
- **Calibration Cyan** (`#00C7FD`): WebNN CPU backend, info semantic, focus ring in dark mode, logo stroke in dark mode. Exclusively for WebNN CPU context and informational affordances. Never used as a general decorative accent.

### Neutral
- **Ink** (`#181818`): Primary text. Near-black with no blue tint — pure legibility.
- **Annotation** (`#4A5568`): Secondary text, nav labels, descriptive copy.
- **Faded** (`#8F8F8F`): Muted text, timestamps, helper labels.
- **Lab Paper** (`#FFFFFF` / `#FCFCFC`): Surfaces and page background. Literally white — no tinting.
- **Grid Line** (`#E2E8F0`): Standard border. Barely visible, purely structural.
- **Ruled Line** (`#F5F7FA`): Sunken/recessed surfaces — headers, sidebars, alternating rows.
- **Dark Field** (`#0A0F1A`): Dark mode page background. Deep navy, not charcoal — anchors the data visualization layer.
- **Dark Surface** (`#151F30`): Dark mode cards and panels. Elevated above the field by lightness, not shadow.

### Backend Legend (data-viz layer)
- **Wasm** (`#38A169` light / `#68D391` dark): Green — execution throughput.
- **WebGPU** (`#D69E2E` light / `#F6E05E` dark): Amber — GPU compute.
- **WebNN CPU** (`#00C7FD`): Cyan — matches info/calibration role.
- **WebNN GPU** (`#0953DE`): Blue — matches primary action color intentionally (WebNN GPU is the target backend).
- **WebNN NPU** (`#002060` light / `#A0C4FF` dark): Deep navy / periwinkle — specialized, rare.

### Named Rules
**The One-Blue Rule.** `#0953DE` appears on ≤10% of any screen surface. It marks exactly one thing: "this is the action, or this is WebNN GPU." Using it in two semantic contexts simultaneously (a button AND a decorative border) collapses the signal. Prohibited.

**The No-Decoration Rule.** Backend and dtype colors exist to encode data identity, not to make the page feel colorful. A chip is green because it is Wasm, not because green looks good. Adding these colors to non-data UI elements (section backgrounds, dividers, icon fills) is prohibited.

## 3. Typography

**UI Font:** Satoshi (variable, 300–900), with `system-ui, -apple-system, sans-serif` fallback
**Mono Font:** JetBrains Mono (variable, 200–800), with `ui-monospace, monospace` fallback

**Character:** Satoshi is geometric without being cold, precise without being clinical. It replaced Inter specifically because Inter has become the default signal for "AI-generated tool." JetBrains Mono carries the data: every latency number, model ID, and backend label is monospaced so columns stay stable under live benchmark updates.

### Hierarchy
- **Title** (400, 22px, −0.01em tracking, 1.2 line-height): Page headings only. One per page. Not bold.
- **Headline** (500, 18px, normal tracking): Section headers, dialog titles. Rarely used — the UI is dense, not structured around headings.
- **Body** (400, 14px, 1.5 line-height): Default prose, descriptions, labels.
- **Label** (500, 13px): Button text, nav items, form labels, table headers. Weight distinguishes from body without a size jump.
- **Caption** (400, 12px): Tags, timestamps, muted helpers, badge text.
- **Mono** (400, 12px, `tnum` on): Model IDs, file paths, latency values, all benchmark metrics. Tabular figures (`font-variant-numeric: tabular-nums` also set globally).

### Named Rules
**The No-Display Rule.** There is no display size larger than 22px. This tool does not have a hero. Heading size hierarchy is achieved through weight contrast (400 vs 500 vs 700) and spacing, not font-size escalation.

**The Mono-for-Numbers Rule.** Every numeric value produced by the benchmark engine — milliseconds, FPS, iteration counts, byte sizes — renders in JetBrains Mono with tabular figures. No exceptions. Satoshi does not render benchmark output.

## 4. Elevation

This system is flat by default. Surfaces are layered through background color, not shadow. The shadow vocabulary is minimal and functional.

Light mode depth is achieved by tonal offset: `#FFFFFF` (surface) sits on `#FCFCFC` (page), sunken elements use `#F5F7FA`. No shadows on static elements. Dark mode uses the same tonal logic: `#151F30` (surface) above `#0A0F1A` (page).

Shadows exist in exactly two contexts: dropdowns and overlays. They are ambient and low-contrast — depth cues, not decorative lifts.

### Shadow Vocabulary
- **Dropdown** (`0 1px 3px rgba(0,0,0,0.08)` light / `0 1px 3px rgba(0,0,0,0.30)` dark): Used for nav dropdowns and user menus. Barely perceptible in light mode; slightly stronger in dark where the surface contrast is lower.
- **Overlay** (`0 4px 24px rgba(0,0,0,0.15)` light / `0 4px 24px rgba(0,0,0,0.50)` dark): Dialogs and modal panels only.

### Named Rules
**The Flat-By-Default Rule.** Cards, panels, table rows, sidebar sections: no box-shadow at rest. State change (hover, selection, focus) can add a background tint; it cannot add a shadow. Shadows are for floating layers only.

## 5. Components

### Buttons
Clean, square-cornered, unambiguous affordance.
- **Shape:** 3px radius — nearly square. No pill shapes; no fully rounded buttons.
- **Primary:** `#0953DE` fill, white text, 10px/20px padding, 14px Satoshi 500. Hover: `#0742B0`. Disabled: `#ECECEC` fill, muted text.
- **Ghost:** Transparent fill, `#4A5568` text, 6px/9px padding. Hover: `#F5F7FA` background tint.
- **Transition:** 150ms ease on background color only. No scale, no shadow, no translate.

### Tags and Chips
The primary data-labeling system. Two distinct components:

**Tags** (non-interactive): 10px caption, 1px border, 3px radius, 1px/5px padding. Used for model format labels (onnx, tflite), task categories, "In library" indicators. Background varies by context.

**Chips** (interactive, dtype/format selectors): 11px JetBrains Mono 600, 1px colored border matching the dtype color, 2px/7px padding. Unselected: colored text, transparent background. Selected: white text, solid colored background. Hover: 0.8 opacity + −1px translateY. These are the primary selection affordance in the HF model browser.

### Cards and Panels
- **Corner Style:** 3px radius — matches all other surfaces.
- **Background:** `--color-surface-raised` (matches surface in light; same in dark). Tonal layering, not shadow.
- **Border:** 1px `--color-border` at rest. No shadow. Selected state uses `--color-accent-light` background tint.
- **Internal Padding:** Varies by density. Repo group headers: 7px/12px. File cards: 2px/10px. Dialogs: 15px.
- **No nested cards.** A card inside a card is always wrong.

### Inputs
- **Style:** 1px border `--color-border-strong`, `--color-surface` background, 3px radius.
- **Focus:** `2px solid --color-focus-ring` outline, offset 2px.
- **Search (home HF box):** Full-width within 600px container, 100px border-radius (pill) — the one exception to the 3px rule, intentional as a Google-style search affordance.

### Navigation (Top Bar)
- **Height:** 56px, sticky, `--color-nav-bg` background, 1px bottom border.
- **Nav items:** 14px Satoshi 500, 6px/12px padding, 3px radius. Default: 0.7 opacity. Hover: 1.0 opacity. Active: 1.0 opacity + 2px bottom border in `--color-nav-active-border`.
- **Cart badge:** 18px pill, `--color-primary` fill, white 11px mono text.
- **Mobile:** Hamburger at ≤640px, full-width dropdown overlay.

### Scan Ticker (Signature Component)
The HF model search scanning row — a live marquee showing which repo is being checked for supported model files.
- **Container:** Max-width 600px, centered, 1px border, 3px radius, `--color-surface-sunken` background, 6px/12px padding.
- **Ticker:** Fixed-height (18px) overflow-hidden div. Repo names fly in from bottom (y: 8px, 140ms) and out top. Svelte `fly` transition.
- **Progress:** JetBrains Mono 12px muted (`scannedCount/totalToScan`).
- **Load More:** Right-aligned in the same row via `flex: 1` spacer. Only visible when not scanning.

### Backend and Dtype Badges
Consistent legend across all result tables, model cards, and charts.
- **Backend:** Small 1px-bordered tag. Color per the Backend Legend in Colors section. Label always present alongside color (color is not the sole encoding).
- **Dtype:** Colored chip. Float family: purple `#2B017F`. Int: teal `#0186B3`. Quant: amber `#D69E2E`. Mixed: green `#38A169`.

## 6. Do's and Don'ts

### Do:
- **Do** use JetBrains Mono for every benchmark output value — milliseconds, FPS, byte sizes, model paths, iteration counts.
- **Do** use `#0953DE` for exactly one semantic role per screen: either primary action or WebNN GPU data identity, never both simultaneously.
- **Do** use 3px border-radius on every interactive element except the home search pill (intentional exception).
- **Do** use tonal background layering (`#FFFFFF` → `#F5F7FA` → `#EDF2F7`) to express depth in light mode. Same logic applies in dark.
- **Do** include both color AND label on every backend and dtype badge. Color alone fails WCAG AAA and fails in print.
- **Do** keep the scan-ticker row at max-width 600px centered — same width as the search box above it.
- **Do** respect `prefers-reduced-motion`: disable the scan ticker's fly animation, disable all hover transforms.

### Don't:
- **Don't** use Inter. It reads as "AI-generated UI." The anti-reference is explicit: Inter + generic sans combinations that read as AI-generated are prohibited.
- **Don't** use gradient text (`background-clip: text`). Ever. Not for the logo, not for headings, not for hero copy.
- **Don't** use glassmorphism (backdrop-filter blur on card surfaces). This is in the anti-references by name.
- **Don't** use neon-on-dark or `#00C7FD` as a decorative accent in dark mode. It is a data-identity color for WebNN CPU and an info semantic. Using it as a glow or background tint collapses its meaning.
- **Don't** build cards with shadow at rest. Static elevation via box-shadow is prohibited. Use background tints.
- **Don't** use `border-left` greater than 1px as a colored stripe on cards, alerts, or list items. Rewrite with full borders, background tints, or leading icons.
- **Don't** use font sizes larger than 22px. No hero typography, no display sizes. The tool has no hero.
- **Don't** use Material-style fully-rounded buttons (pill shape) anywhere except the home search input (explicit exception). Square-cornered buttons are the rule.
- **Don't** repeat the generic SaaS hero-metric template: big number, small label, supporting stats, gradient accent. This is an explicit anti-reference.
- **Don't** render benchmark numbers in Satoshi. Proportional figures in a metric column look wrong when values update live.
- **Don't** add decorative motion to page load. State-change transitions only: 150ms ease on background/opacity/border. No orchestrated entrances, no scroll-driven sequences.
