# TODOS — Web AI Benchmark

## Phase 2

### Shareable Benchmark Result Cards
- **What:** Server-side OG image generation (Vercel OG / Satori) for benchmark results. Dynamic route `/results/{id}` that renders a branded card with key metrics, model name, backend, hardware info. OG meta tags for social preview.
- **Why:** Organic distribution. Every shared result is a branded advertisement for webai.run. Engineers share benchmark numbers in Slack/Twitter constantly.
- **Effort:** M (human: ~3 days / CC: ~1 hour)
- **Priority:** P2
- **Depends on:** Results schema + save flow (v1 scope)
- **Context:** All required data (results, hardware info, model name) is already collected and stored in v1. This is purely an output/presentation feature with zero schema changes.

## Phase 3

### PWA (Service Worker + Install Prompt)
- **What:** Progressive Web App with service worker for app shell caching, offline recipe browsing, and install-to-home-screen prompt.
- **Why:** Instant load on repeat visits (<100ms from SW cache). Installable on desktop/mobile for power users who benchmark daily.
- **Effort:** M (human: ~2 days / CC: ~45 min)
- **Priority:** P3
- **Depends on:** Core app complete, stable route structure
- **Context:** OPFS already handles model file caching (the heavy content). The app shell is small (~200KB). Service worker adds value for repeat visitors but introduces cache invalidation complexity (stale UI after deploy). SvelteKit has built-in SW support via `$service-worker` module.

## Leaderboard improvements (from LiteRT leaderboard reference review)

Reference: https://github.com/google-ai-edge/litert-samples/blob/main/benchmark/leaderboard/index.html
Applies to `/inference/leaderboard` and `/llm/leaderboard` (trend pages for item 2).

### Accessible sortable table headers
- **What:** Make sortable `<th>` content a real `<button>` with `aria-sort="ascending|descending|none"` on the `<th>`, replacing the click-only ↑/↓ text indicator. Keep visual styling identical.
- **Why:** Keyboard and screen-reader access. Headers are currently mouse-only.
- **Effort:** S (~15 min per leaderboard)
- **Priority:** P2
- **Context:** Check whether `th` styles are shared with other tables before changing CSS.

### Shareable URL state for leaderboard filters
- **What:** Sync axis, A/B values, metric, and all filters (data type, backend, framework, EP, browser, versions, CPU/GPU/drivers) to `page.url.searchParams`. Read on load; write with `goto(..., { replaceState: true, keepFocus: true })`; omit defaults to keep URLs short.
- **Why:** Link a specific comparison in bug reports and to browser teams.
- **Effort:** M (~1-2 h per leaderboard; ~3 h for leaderboards + trend pages)
- **Priority:** P2
- **Context:** Handle stale values no longer in the data. Keep the localStorage column-visibility key separate from URL state.

### Methodology card
- **What:** Collapsible `<details>` under the leaderboard explaining how rows are measured: warm-up and run counts, cold vs warm cache, cross-origin isolation, and "compare only within the same hardware/backend/task".
- **Why:** Makes WebNN/WebGPU numbers easier to trust and interpret.
- **Effort:** S-M (~30 min)
- **Priority:** P3
- **Depends on:** Confirming measurement details (derive from engine code or owner input).

### Other ideas (not scheduled)
- Expandable per-row detail (p5/min/max/std dev/warm-up avg etc.) so the main table stays compact.
- Hero stat cards (rows, models, devices, runtime versions) above the leaderboard.
- Inline delegation info (nodes delegated N/M, partitions) in the accelerator cell, linked to the partial-delegation table.
- Public raw-data download/endpoint for the full dataset.
- Verify explicit error and empty states ("data did not load", "no rows match these filters").
