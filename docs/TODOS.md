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
