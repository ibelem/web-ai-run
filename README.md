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

The app runs at `https://localhost:5173` (HTTPS with local certs) or `http://localhost:5173`.

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
    /             # Homepage with hero + detected environment
    /model        # Model browser with filters
    /run          # Benchmark execution
    /custom       # Upload custom model files
    /recipe       # Saved benchmark configurations
    /login        # Auth (GitHub, Google, Microsoft, email)
    /admin        # User management (admin only)
```
