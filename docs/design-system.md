# Design System: Web AI Benchmark (webai.run)

Version: 2.1 — consistency pass
Branch: plan

---

## Design Philosophy

Utility-first engineering tool. Dense, information-rich, zero decoration. The data presentation IS the brand. Think Chrome DevTools, Lighthouse, WebPageTest — not a marketing page.

---

## Layout

- **Dense tool layout** — all configuration visible at once, no wizard flows
- **Horizontal top bar** — `[Logo] [Benchmark] [Models] [Custom] ··· [theme toggle] [avatar/login]`
- **Role-gated nav items** — Leaderboard and Admin only visible for Intel/Admin roles
- **Desktop-first** — primary audience uses desktop Chrome/Edge with WebGPU/WebNN
- **Mobile** — horizontal scroll tables, collapsed hamburger nav. Functional, not optimized.

---

## Typography

| Role | Font | Usage |
|------|------|-------|
| Metrics | JetBrains Mono | All numbers, timing values, file sizes, version strings |
| UI | Archivo | Navigation, labels, descriptions, buttons, headings |

Both self-hosted in `/static/fonts/`. No CDN font loading.

JetBrains Mono uses tabular figures by default, so metric columns align without extra CSS.

### Scale

| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| `--text-xs` | 11px | 400 | Badges, metadata labels |
| `--text-sm` | 12px | 400 | Table cells, secondary text |
| `--text-base` | 13px | 300 | Body text, descriptions |
| `--text-lg` | 15px | 300 | Section headings |
| `--text-xl` | 17px | 300 | Page titles |
| `--text-metric` | 13px | 400 | JetBrains Mono, results table values |

> **v2.1 change:** Weights adjusted from uniform 200. Sizes ≤12px use weight 400 for legibility on Windows/ClearType. Body text (≥13px) uses 300 for a light but readable feel.

---

## Spacing

8px base grid. All spacing tokens are multiples of 8, with one explicit sub-grid exception.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-half` | 4px | Sub-grid. Badge internal padding, icon nudges only. Not for layout. |
| `--space-1` | 8px | Between related items, table cell padding |
| `--space-2` | 16px | Between sections within a panel |
| `--space-3` | 24px | Between panels |
| `--space-4` | 32px | Major section gaps |
| `--space-5` | 48px | Page-level vertical rhythm |

> **Note:** `--space-half` (4px) is a deliberate sub-grid value for tight component internals only. All layout decisions use `--space-1` or larger.

---

## Color System

All colors use semantic CSS custom properties. No cryptic names.

### Naming Convention

```
--color-{category}-{name}
--color-{category}-{name}-{modifier}
```

Modifiers: `-hover`, `-active`, `-muted` (10% opacity for backgrounds), `-dark` (dark-mode-only overrides).

### Theme

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--color-surface` | #ffffff | #1a1a1a | Page background |
| `--color-surface-raised` | #f8f9fa | #282828 | Cards, panels |
| `--color-surface-sunken` | #f1f3f5 | #141414 | Input backgrounds |
| `--color-text-primary` | #141718 | #e8e8e8 | Body text |
| `--color-text-secondary` | #374151 | #9ca3af | Labels, descriptions |
| `--color-text-muted` | #585f6b | #8a9199 | Timestamps, hints |
| `--color-border` | #e5e7eb | #333333 | Dividers, table borders |
| `--color-border-strong` | #d1d5db | #444444 | Input borders |

> **v2 changes:**
> - `--color-text-muted` light darkened from `#6b7280` → `#585f6b` to pass AA (4.5:1) on `--color-surface-sunken`
> - `--color-text-muted` dark changed from `#6b7280` → `#8a9199` to pass AA (4.5:1) on `--color-surface` (#1a1a1a)
> - `--color-surface-raised` dark changed from `#242424` → `#282828` for clearer panel/page separation

### Global Tokens

```css
/* Focus */
--color-focus-ring: #0068b5;

[data-theme="dark"] {
  --color-focus-ring: #4da3e0;
}

/* Border radius */
--radius-sm: 2px;    /* skeletons, subtle rounding */
--radius-base: 3px;  /* badges, code spans, dropdowns, inputs */
--radius-lg: 5px;    /* cards, modals, toasts */

/* Elevation (box-shadow) */
--shadow-dropdown: 0 4px 12px rgba(0, 0, 0, 0.12);
--shadow-overlay: 0 8px 24px rgba(0, 0, 0, 0.2);

[data-theme="dark"] {
  --shadow-dropdown: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-overlay: 0 8px 24px rgba(0, 0, 0, 0.5);
}

/* Navigation hover/active */
--color-nav-item-hover: rgba(0, 0, 0, 0.06);
--color-nav-item-active: rgba(0, 0, 0, 0.10);

[data-theme="dark"] {
  --color-nav-item-hover: rgba(255, 255, 255, 0.07);
  --color-nav-item-active: rgba(255, 255, 255, 0.12);
}

/* Z-index scale */
--z-base:     0;
--z-sticky:   10;    /* sticky headers */
--z-dropdown: 100;   /* dropdowns, tooltips */
--z-overlay:  200;   /* modals, drawers */
--z-toast:    300;   /* notification toasts */

/* Motion */
--transition-base: 120ms ease;
--transition-slow: 240ms ease;
```

### Motion Policy

Transitions are permitted only on interactive state changes (hover, focus, active). No entrance animations, no decorative motion.

- Use `--transition-base` (120ms) for color/border changes (hover, focus ring appearance).
- Use `--transition-slow` (240ms) for structural changes (panel expand/collapse, progress bar fill).
- Benchmark progress bar fill may animate continuously; all other animations must be state-triggered.
- All animations **must** be wrapped in `@media (prefers-reduced-motion: no-preference)`. Default: no animation.

```css
@media (prefers-reduced-motion: no-preference) {
  .progress-bar-fill {
    transition: width var(--transition-slow);
  }
}
```

### Backend Colors

Each backend has a full-color value, a `-muted` background (10% opacity), and explicit dark-mode text overrides for badge use.

| Backend | Token | Color | Dark badge text |
|---------|-------|-------|-----------------|
| wasm_1 | `--color-backend-wasm-1` | #66bb6a | #a5dfa8 |
| wasm_4 | `--color-backend-wasm-4` | #2e7d32 | #6fcf74 |
| webgpu | `--color-backend-webgpu`  | #e68a00 | #ffbb55 |
| webnn_cpu | `--color-backend-webnn-cpu` | #00C7FD | #5dd8ff |
| webnn_gpu | `--color-backend-webnn-gpu` | #0953DE | #7aabff |
| webnn_npu | `--color-backend-webnn-npu` | #002060 | #a0c4ff |

Each backend has a `-muted` variant at 10% opacity for badge backgrounds. In dark mode, use the `-dark` text value instead of the base color — the base colors are too dark against dark surfaces.

### Metric Colors

Metric tokens are used as **decorative column header accents only** — never as standalone text color. Column header text must use `--color-text-primary`; the metric color appears as a 3px bottom border or left accent on the `<th>`.

Metrics are grouped into 5 visual families. Columns within the same family share one accent color — the table still labels each column individually, but the accent groups related measurements visually.

| Family | Columns | Token | Color |
|--------|---------|-------|-------|
| Load phase | Compilation, First inference, Time to first | `--color-metric-load` | #0603bd |
| Central tendency | Average, Median | `--color-metric-central` | #6ac600 |
| Best | Best | `--color-metric-best` | #0acdc7 |
| Tail latency | P90 | `--color-metric-tail` | #be65ff |
| Throughput | Throughput (FPS) | `--color-metric-throughput` | #ff671f |

> **v2.1 change:** Consolidated from 8 individual metric colors to 5 families. Compilation/First/TimeToFirst are all "load phase" — one accent. Average/Median are both "central tendency" — one accent. Reduces visual noise in the table header without losing the grouping signal.

### Data Type Colors

Data types are grouped into 4 families by precision class. All types within a family share one color — the badge text differentiates (e.g., "fp32" vs "fp16" is readable from the label, not just the color).

| Family | Types | Token | Color | Dark badge text |
|--------|-------|-------|-------|-----------------|
| Float | fp32, fp16 | `--color-dtype-float` | #c61a3e | #f47a93 |
| Integer | int8, uint8, int4 | `--color-dtype-int` | #0186b3 | #5dd8ff |
| Quantized | q4, q4f16, bnb4 | `--color-dtype-quant` | #9c27b0 | #e08ef0 |
| Mixed | quantized (generic) | `--color-dtype-mixed` | #109a7f | #6eecd0 |

In dark mode, use the `-dark` text value instead of the base color — same rule as backends. Each also has a `-muted` variant at 10% opacity for badge backgrounds.

> **v2.1 change:** Consolidated from 9 individual dtype colors to 4 families. Users distinguish types by the badge label text ("fp16", "int8"), not solely by color. Grouping by precision class (float/integer/quantized/mixed) gives just enough visual clustering to scan a table without 9 competing hues.

### Runtime Colors

These colors are near-black and only work on light surfaces. In dark mode, override to light equivalents.

| Runtime | Token | Light value | Dark value |
|---------|-------|-------------|------------|
| ONNX Runtime Web | `--color-runtime-ort` | #343433 | #c8c7c6 |
| LiteRT.js | `--color-runtime-litert` | #000d59 | #a8b4e8 |

```css
[data-theme="dark"] {
  --color-runtime-ort: #c8c7c6;
  --color-runtime-litert: #a8b4e8;
}
```

### Semantic Colors

Semantic colors are reserved for status communication. They must not duplicate any category color (backend, dtype, metric) to avoid ambiguity.

| Token | Color | Dark value | Usage |
|-------|-------|------------|-------|
| `--color-success` | #2e8b38 | #6fcf74 | Benchmark complete, model cached |
| `--color-error` | #c61a3e | #f47a93 | Failures, OOM, download errors |
| `--color-warning` | #d48200 | #ffbb55 | Rate limit approaching, stale data |
| `--color-info` | #1976d2 | #64b5f6 | Informational badges, links |

> **v2.1 change:** Semantic colors adjusted to avoid collisions with category colors. `--color-success` changed from #6ac600 (was identical to `--color-metric-central`) to #2e8b38. `--color-info` changed from #0186b3 (was identical to `--color-dtype-int`) to #1976d2. `--color-warning` shifted from #ff9600 to #d48200 for better contrast. Added dark values for all.

---

## Components

### Badges

Badges convey categorical metadata: backend, data type, runtime, status. They are read-only — not interactive filter controls. If badge-as-filter is added later, a separate `chip` component with a remove affordance must be defined (see Chip, below).

**Light mode:** 10%-opacity background of the category color, full color as text.
**Dark mode:** 10%-opacity background of the category color over the dark surface, with the `-dark` text token (not the base color).

```css
.badge {
  display: inline-flex;
  align-items: center;
  font-size: var(--text-xs);
  padding: var(--space-half) var(--space-1);
  border-radius: var(--radius-base);
  line-height: 1;
  white-space: nowrap;
}

.badge-webgpu {
  background: color-mix(in srgb, var(--color-backend-webgpu) 10%, transparent);
  color: var(--color-backend-webgpu);
}

[data-theme="dark"] .badge-webgpu {
  color: var(--color-backend-webgpu-dark);
}
```

### Results Table

- JetBrains Mono for all numeric cells
- Numbers right-aligned
- Alternating row backgrounds: `--color-surface` and `--color-surface-raised`
- Sortable column headers (click to sort, `↑`/`↓` indicator)
- Metric column headers use their `--color-metric-*` token as a 3px `border-bottom` accent on the `<th>`; header text color is always `--color-text-primary`
- Horizontal scroll on viewport < 1024px
- Table uses `<th scope="col">` for all column headers

```css
.results-table th[data-metric="compilation"],
.results-table th[data-metric="first-inference"],
.results-table th[data-metric="time-to-first"] {
  border-bottom: 3px solid var(--color-metric-load);
}

.results-table th[data-metric="average"],
.results-table th[data-metric="median"] {
  border-bottom: 3px solid var(--color-metric-central);
}

.results-table th[data-metric="best"] {
  border-bottom: 3px solid var(--color-metric-best);
}

.results-table th[data-metric="p90"] {
  border-bottom: 3px solid var(--color-metric-tail);
}

.results-table th[data-metric="throughput"] {
  border-bottom: 3px solid var(--color-metric-throughput);
}
```

### Buttons

| Variant | Usage | Style notes |
|---------|-------|-------------|
| Primary | "Run Benchmark" | High contrast. Minimum 44px height. |
| Secondary | "Save Results", "Create Recipe" | Outlined. Minimum 44px height. |
| Ghost | "Cancel", navigation actions | Text only. Minimum 44px height. |
| Danger | "Delete Recipe" | Error color. Requires confirmation dialog before destructive action. |

All buttons use `--transition-base` on background/border color changes. Focus state: `outline: 2px solid var(--color-focus-ring); outline-offset: 2px`.

### Tooltip

Tooltips appear on hover/focus of elements where a label is truncated or a metric header needs elaboration.

- Trigger: hover (200ms delay) or focus
- Delay: 200ms show, 0ms hide
- Position: above the trigger, centered. Flip to below if insufficient space above.
- Max width: 240px
- Background: `--color-text-primary` (inverted surface)
- Text: `--color-surface`, `--text-xs`
- Border-radius: `var(--radius-base)`
- Padding: `var(--space-half) var(--space-1)`
- `role="tooltip"` on the tooltip element; `aria-describedby` on the trigger
- Z-index: `var(--z-dropdown)`
- No arrow/caret — flat rectangular callout

### Dropdown / Select

Used for the recipe selector and any other single-value selection. Replaces native `<select>` for visual consistency.

- Trigger button: same height as Secondary button (44px min), chevron icon right-aligned
- Panel: `--color-surface-raised` background, `--color-border-strong` border, `border-radius: var(--radius-base)`, `box-shadow` defined below
- Max height: 320px with internal scroll
- Items: 36px height, `--text-sm`, left-padded 12px. Hover: `--color-nav-item-hover` background. Selected: checkmark icon right-aligned.
- Z-index: `var(--z-dropdown)`
- Box shadow: `var(--shadow-dropdown)`
- Keyboard: Arrow keys navigate, Enter selects, Escape closes, Tab closes and moves focus forward

```css
.dropdown-panel {
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-base);
  box-shadow: var(--shadow-dropdown);
  z-index: var(--z-dropdown);
  max-height: 320px;
  overflow-y: auto;
}
```

### Progress Indicators

**Download:** Linear progress bar, full width of container. Height 4px. Fill color `--color-info`. Shows percentage label (right-aligned, `--text-sm`) + speed (MB/s) + ETA inline below. Fill transition uses `--transition-slow`.

**Benchmark:** Iteration counter "23/100" (`--text-metric`, JetBrains Mono) + real-time inference log (collapsible — see Collapsible below). Log container max-height 200px, internal scroll.

**Loading skeletons:** Pulse animation (opacity 0.4 → 1.0 → 0.4, 1.5s cycle). Background `--color-border`. Shape matches expected content:
- Table rows: full-width rect, height 36px, `border-radius: var(--radius-sm)`
- Single-line text: 60% width rect, height 14px
- Wrap in `@media (prefers-reduced-motion: no-preference)` — without motion, show static state at 0.6 opacity

```css
@keyframes skeleton-pulse {
  0%, 100% { opacity: 0.4; }
  50%       { opacity: 1.0; }
}

@media (prefers-reduced-motion: no-preference) {
  .skeleton {
    animation: skeleton-pulse 1.5s ease-in-out infinite;
  }
}

.skeleton {
  background: var(--color-border);
  border-radius: var(--radius-sm);
  opacity: 0.6;
}
```

### Toast / Notification

Appears for async outcomes: benchmark complete, download failed, sync result. Does not appear for inline form validation errors.

- Position: bottom-right, 24px from edges
- Width: 320px fixed
- Stack order: newest on top, max 3 visible simultaneously
- Auto-dismiss: success 4s, info 4s, warning 6s, error — persists until dismissed
- Z-index: `var(--z-toast)`
- Structure: colored left border (4px, semantic color) + icon + message text + close button
- Dismiss: click close button, or swipe right on touch
- `role="status"` for success/info; `role="alert"` for warning/error

### Collapsible / Disclosure

Used for the benchmark inference log and any secondary detail panel.

- Toggle button contains label + chevron icon (`↓` collapsed, `↑` expanded)
- Chevron rotates 180° on expand, using `--transition-base`
- Content area: `overflow: hidden`. Height animates from 0 → auto using `grid-template-rows: 0fr` → `1fr` trick (avoids `max-height` hacks)
- Collapsed state is the default for the benchmark log
- `aria-expanded` on the toggle button; `aria-controls` pointing to content id

```css
.collapsible-content {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--transition-slow);
}

.collapsible-content.open {
  grid-template-rows: 1fr;
}

.collapsible-content > div {
  overflow: hidden;
}
```

### Inline Code Span

For model names, file sizes, version strings, and paths used inline in body text and error messages.

```css
code, .code-inline {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.9em;            /* relative to parent so it works in any text size */
  background: var(--color-surface-sunken);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  padding: 1px 7px;
  color: var(--color-text-primary);
}
```

Example: `OPFS quota exceeded (<code>model: 450MB</code>). Clear cache in settings.`

### Chip (removable filter)

Distinct from badges. Used when a user actively applies a filter that can be removed.

- Same visual base as badges (category color, muted background)
- Append a `×` remove button (16px, `aria-label="Remove [filter name]"`)
- Remove button touch target: minimum 24×24px (chips are unlikely to be used on mobile but must not be below minimum)
- On remove: announce removal via `aria-live="polite"` region

### Confirmation Dialog

Used before destructive actions (delete recipe, clear cache). Triggered by Danger buttons.

- Backdrop: `rgba(0, 0, 0, 0.5)`, covers full viewport
- Z-index: `var(--z-overlay)`
- Panel: `--color-surface-raised` background, `--color-border-strong` border, `border-radius: var(--radius-lg)`, max-width 400px, centered
- Box shadow: `var(--shadow-overlay)`
- Content: title (`--text-lg`) + description (`--text-base`, `--color-text-secondary`) + button row
- Buttons: right-aligned, Danger (confirm) + Ghost (cancel). Cancel is always first in tab order.
- Keyboard: Escape dismisses (same as cancel), Tab is trapped within the dialog, autofocus on cancel button
- `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby` pointing to title

```css
.dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: var(--z-overlay);
  display: grid;
  place-items: center;
}

.dialog-panel {
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  padding: var(--space-3);
  max-width: 400px;
  width: calc(100% - var(--space-4));
  box-shadow: var(--shadow-overlay);
}
```

### Text Input

Used for CPU model entry (save results), recipe name, search filters.

- Height: 44px (matches button height)
- Background: `--color-surface-sunken`
- Border: `1px solid var(--color-border-strong)`
- Border-radius: `var(--radius-base)`
- Padding: `0 var(--space-1)`
- Font: Archivo, `--text-base`
- Placeholder: `--color-text-muted`
- Focus: `outline: 2px solid var(--color-focus-ring); outline-offset: 2px`, border color unchanged
- Error state: border changes to `--color-error`, error message below in `--text-xs` + `--color-error`
- Disabled: opacity 0.5, `cursor: not-allowed`

```css
.text-input {
  height: 44px;
  background: var(--color-surface-sunken);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-base);
  padding: 0 var(--space-1);
  font-family: 'Archivo', sans-serif;
  font-size: var(--text-base);
  color: var(--color-text-primary);
  width: 100%;
}

.text-input:focus {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}

.text-input::placeholder {
  color: var(--color-text-muted);
}

.text-input[aria-invalid="true"] {
  border-color: var(--color-error);
}

.text-input-error {
  font-size: var(--text-xs);
  color: var(--color-error);
  margin-top: var(--space-half);
}
```

---

## Interaction States

| Feature | Loading | Empty | Error | Success |
|---------|---------|-------|-------|---------|
| Model list | Skeleton rows | "No models found. Sync running…" + spinner | "Sync failed. Retry?" + retry button | Populated list |
| Recipe selector | Spinner in dropdown trigger | "Try a featured recipe" + CTA | "Failed to load recipes. Retry?" | Recipe loaded |
| Benchmark run | Progress bar + collapsible log | N/A | Plain error message (see format below) | Results table |
| Download | Progress % + speed + ETA | N/A | "Download failed. Tap to retry." | `Cached` badge |
| Results table | N/A | "Run a benchmark to see results." | N/A | Sortable table |
| Auth | Spinner on avatar | Login button | "Auth failed. Try again." | Avatar + role badge |

All empty states follow the same pattern:
1. One sentence describing what goes here.
2. One primary action button.
3. No illustrations, no emoji, no inline tutorials.

---

## Error Messages

Plain, technical, actionable. No cute language.

**Format:** `{What failed}. {What to do.}`

Technical identifiers (model names, file sizes, paths) appear in an inline `<code>` span.

| Scenario | Message |
|----------|---------|
| Network error | `Runtime unavailable. Check network and retry.` |
| OPFS quota | `OPFS quota exceeded (<code>model: 450MB</code>). Clear cache in settings.` |
| OOM | `Model failed to load. Out of memory.` |
| Interrupted download | `Download interrupted. Tap to retry.` |
| Multiple failures | `3 backends failed. See log for details.` (collapse individual errors into a count; expose details in the collapsible log) |
| Partial failure | `WebGPU failed. Results show remaining 2 backends.` |

**Length cap:** Error message text (excluding identifiers) must fit on one line at `--text-sm` in a 320px toast. Approximately 45 characters (accounting for padding + left border + close button). If more detail is needed, link to or expand a log panel — do not put a paragraph in a toast.

---

## Accessibility

- Keyboard navigation for all interactive elements (tab order follows visual order)
- ARIA landmarks: `<nav>`, `<main>`, `<aside>` for config panels
- Minimum 4.5:1 contrast ratio on all body text (WCAG AA) — see color tokens above for verified values
- Visible focus indicators: `outline: 2px solid var(--color-focus-ring); outline-offset: 2px`
- Touch targets minimum 44×44px on all clickable elements (read-only badges excluded)
- `aria-live="polite"` region for benchmark progress **summary only** (e.g. "23 of 100 complete"). The raw inference log must use `aria-hidden="true"` unless the user expands it.
- Results table uses `<th scope="col">` on all column headers
- Theme toggle respects `prefers-color-scheme` on first visit; preference then persisted to `localStorage`
- All animations gated on `prefers-reduced-motion: no-preference`

---

## Dark Mode

Toggle in top navigation bar. Preference persisted to `localStorage`. All colors defined as CSS custom properties, switched via `[data-theme="dark"]` on `<html>`.

Light mode is the default for new visitors.

**Implementation checklist for dark mode:**
- Badge text uses `-dark` token variants, not the base color (see badge component) — applies to backends AND data types
- Semantic colors use their dark values (see Semantic Colors table)
- Runtime tokens (`--color-runtime-ort`, `--color-runtime-litert`) use their dark overrides
- `--color-focus-ring` uses `#4da3e0` (lighter blue for visibility on dark surfaces)
- `--color-nav-item-hover` and `--color-nav-item-active` use their dark overrides
- `--shadow-dropdown` and `--shadow-overlay` switch to darker variants (defined in Global Tokens)
- `--color-text-muted` uses `#8a9199` in dark mode (not the light-mode value)

---

## Logo

Keep existing SVG logo from web-ai-test (`Header.svelte`). No redesign for v1.

---

## What This Is Not

- Not a marketing site (no hero, no feature grid, no testimonials)
- Not a dashboard (no widgets, no charts on landing page)
- Not mobile-first (WebGPU/WebNN are desktop APIs friendly, able to use in mobile, though)
- Not decorative (no gradients, blobs, illustrations, or emoji)

---

## Versioning

This document is v2.1. The token layer (colors, spacing, typography, z-index, motion, border-radius) is considered stable and should not change without a version increment. Component specs may be refined during implementation without a version bump provided no tokens change. Breaking changes to tokens require updating this document version and notifying all consumers.

Changes between versions are marked with `> v2 changes:` / `> v2.1 change:` callouts in each section.
