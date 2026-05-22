# Product

## Register

product

## Users

Browser engineers, ML framework developers, and web developers at Intel, Qualcomm, Google, Microsoft, and HuggingFace. They benchmark on-device AI model performance across WebNN, WebGPU, and Wasm backends. Context: often working on a dev machine mid-experiment, comparing inference latency across hardware configurations, or sharing results with a colleague. Secondary users: open-source developers exploring client-side ML who want to know which models run well in their browser.

## Product Purpose

webai.run is the open benchmark for in-browser ML inference. It auto-discovers models from HuggingFace, runs them across ONNX Runtime Web and LiteRT.js on every available backend, and collects reproducible results. The benchmark surface is the Trojan horse; the aggregated hardware performance data (visible only to Intel/Admin) is the product's strategic value. Success: any user can click a recipe URL, run real benchmarks, and see results in under 30 seconds.

## Brand Personality

Precise, technical, confident. The tool practices what it preaches: fast, dense, no decorative weight. Tone is expert-to-expert, never tutorial-condescending. When something is broken, it says so plainly.

## Anti-references

- Generic SaaS dashboards: teal/purple gradients, big hero metrics, identical card grids, Stripe/Vercel clones.
- AI-demo aesthetics: glassmorphism, neon on black, gradient text, animated blobs.
- Google Material heavy: overly rounded corners, card-everything layouts, Material 3 defaults.
- Inter + generic sans combinations that read "AI-generated UI."

## Design Principles

1. **Measurement as identity.** The UI is a measurement instrument. Every visual choice should reinforce precision, not distract from it. If it doesn't help the user understand the data, remove it.
2. **Density earns trust.** Experts distrust dashboards that hide information behind whitespace. Show the numbers. Let tables breathe just enough to be scannable, not so much they feel like a presentation.
3. **Practice what you preach.** The app benchmarks performance. It should be visibly fast itself: no layout jank, no loading spinners for things that could be instant, no decorative animations that fight the data.
4. **Expert confidence, zero condescension.** Labels, tooltips, and empty states speak to someone who knows what fp16 and WebNN mean. Never over-explain. Never soften technical vocabulary.
5. **Typography over decoration.** Hierarchy through type weight and scale, not color washes or card shadows. The font choice signals seriousness.

## Accessibility & Inclusion

WCAG 2.1 AAA. Meaningful contrast ratios throughout (7:1 for body text). Full keyboard navigation. Respect `prefers-reduced-motion` for all transitions. Color is never the sole encoding for data (backend badges also use labels; status dots also use text).
