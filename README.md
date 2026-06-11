# Web AI Benchmark

Benchmark ML models directly in the browser using WebNN, WebGPU, and WebAssembly. Compare inference performance across backends on your actual hardware, no install required.

**Live site:** [webai.run](https://webai.run)

## Features

- Run ONNX and LiteRT models in-browser with real timing data
- Compare backends: WebNN (CPU/GPU/NPU), WebGPU, Wasm (single/multi-thread)
- Auto-detect available hardware acceleration
- Upload custom .onnx, .tflite, .litertlm files
- Save and share benchmark recipes
- HuggingFace model discovery and sync

## Local Development

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your Supabase project URL and anon key

# Start dev server
npm run dev
```

The app runs at `https://localhost:5173` (or the next available port if 5173 is in use).

### Optional: HTTPS with local certificates

```bash
# Install mkcert, then:
mkcert -install
mkcert localhost
# This creates localhost.pem and localhost-key.pem in the project root
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run check` | Type-check with svelte-check |
| `npm run test` | Run tests |
| `npm run sync:models` | Invoke HuggingFace model sync |

## Tech Stack

- **Framework:** SvelteKit 5 (Svelte 5 runes)
- **Database:** Supabase (PostgreSQL + Auth + Edge Functions)
- **Deployment:** Vercel
- **ML Runtimes:** ONNX Runtime Web, LiteRT.js
- **Backends:** WebNN, WebGPU, WebAssembly

## Architecture

```
src/
  lib/
    engine/       # Benchmark engine, backend detection, worker pool
    huggingface/  # HF model discovery and sync
    supabase/     # Database client and auth
    stores/       # Svelte stores (auth state)
    components/   # Reusable UI components
  routes/
    /                    # Homepage with hero + detected environment
    /inference/          # Inference benchmark (model browser, run, custom upload, recipes)
    /llm/                # LLM benchmark (run, results, custom)
    /login               # Sign in (password, magic link, GitHub OAuth)
    /signup              # Create account
    /forgot-password     # Request password reset
    /reset-password      # Set new password (after email link)
    /account             # User profile, recipes, shared links
    /privacy             # Privacy policy
    /terms               # Terms of service
    /admin               # User management (admin only)
```
