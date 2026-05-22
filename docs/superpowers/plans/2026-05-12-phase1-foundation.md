# Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the SvelteKit 5 app with Supabase auth, role-based routing, CSS design tokens, and the benchmark guard that gates /recipe and /custom behind authentication.

**Architecture:** SvelteKit 5 with TypeScript handles routing, layouts, and SSR. Supabase provides PostgreSQL storage, auth (GitHub/Google OAuth), and custom claims for the 5-tier role system. CSS custom properties from design-system.md v2.1 are the styling foundation. The benchmark guard is a pure function checked client-side when the user clicks "Run".

**Tech Stack:** SvelteKit 5, TypeScript, Vite, Supabase (Auth + PostgreSQL), CSS custom properties, Vercel adapter

---

## File Structure

```
src/
  app.html                          — Shell HTML with COOP/COEP headers meta, font preloads
  app.css                           — Global CSS custom properties (all design tokens)
  app.d.ts                          — Global TypeScript declarations (Supabase types)
  lib/
    supabase/
      client.ts                     — Supabase browser client singleton
      server.ts                     — Supabase server client (for hooks)
      types.ts                      — Generated DB types (profiles, recipes, models, results)
    guards/
      benchmark-guard.ts            — canRunBenchmark() pure function
      benchmark-guard.test.ts       — Tests for benchmark guard
    stores/
      auth.ts                       — Svelte store: user session + role
      theme.ts                      — Svelte store: light/dark theme preference
    types/
      roles.ts                      — Role type definitions and helpers
  routes/
    +layout.svelte                  — Root layout: nav bar, theme, auth provider
    +layout.server.ts               — Server layout: session validation
    +page.svelte                    — Landing/redirect to /model
    model/
      +page.svelte                  — Model benchmark page (stub)
    recipe/
      +page.svelte                  — Recipe benchmark page (stub, gated)
    custom/
      +page.svelte                  — Custom benchmark page (stub, gated)
    auth/
      callback/
        +server.ts                  — OAuth callback handler
    api/
      auth/
        role/
          +server.ts               — Admin endpoint: set user role (custom claims)
  hooks.server.ts                   — Server hooks: COOP/COEP headers, session refresh
  hooks.client.ts                   — Client hooks: (reserved)
tests/
  lib/
    guards/
      benchmark-guard.test.ts       — Unit tests (vitest)
  setup.ts                          — Vitest setup
static/
  fonts/
    archivo/                        — Archivo font files (woff2)
    jetbrains-mono/                 — JetBrains Mono font files (woff2)
supabase/
  migrations/
    001_profiles.sql                — Profiles table + RLS
    002_recipes.sql                 — Recipes table + RLS
    003_models.sql                  — Models cache table + RLS
    004_results.sql                 — Benchmark results table + RLS
  seed.sql                          — Dev seed data
  config.toml                       — Supabase local config
```

---

### Task 1: SvelteKit 5 Project Scaffolding

**Files:**
- Create: `package.json`, `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, `src/app.html`, `src/app.css`, `src/app.d.ts`

- [ ] **Step 1: Initialize SvelteKit project**

Run:
```bash
npx sv create web-ai-run --template minimal --types ts
```

Select: TypeScript, no additional options. This creates the SvelteKit 5 skeleton in the current directory.

If the directory already has files, run from a temp location and copy the scaffolded files over (preserving `docs/`, `references/`, `CLAUDE.md`, `.gitignore`).

- [ ] **Step 2: Install core dependencies**

Run:
```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D @sveltejs/adapter-vercel vitest @testing-library/svelte jsdom
```

- [ ] **Step 3: Configure svelte.config.js for Vercel**

```javascript
import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter()
  }
};

export default config;
```

- [ ] **Step 4: Configure vite.config.ts with vitest**

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts']
  }
});
```

- [ ] **Step 5: Create tests/setup.ts**

```typescript
import '@testing-library/svelte';
```

- [ ] **Step 6: Add scripts to package.json**

Ensure these scripts exist in `package.json`:
```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json"
  }
}
```

- [ ] **Step 7: Verify project builds**

Run: `npm run build`
Expected: Build completes without errors.

- [ ] **Step 8: Verify tests run**

Run: `npm run test`
Expected: Test runner executes (0 tests found is OK at this stage).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold SvelteKit 5 project with TypeScript and Vercel adapter"
```

---

### Task 2: App Shell HTML + Security Headers

**Files:**
- Modify: `src/app.html`
- Create: `src/hooks.server.ts`

- [ ] **Step 1: Configure app.html with font preloads and theme support**

Replace `src/app.html`:
```html
<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="preload" href="/fonts/archivo/archivo-variable.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="/fonts/jetbrains-mono/jetbrains-mono-variable.woff2" as="font" type="font/woff2" crossorigin />
    %sveltekit.head%
  </head>
  <body>
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

- [ ] **Step 2: Create hooks.server.ts with COOP/COEP headers**

Create `src/hooks.server.ts`:
```typescript
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');

  return response;
};
```

- [ ] **Step 3: Verify dev server starts with headers**

Run: `npm run dev`

In another terminal:
```bash
curl -I http://localhost:5173
```

Expected output includes:
```
cross-origin-opener-policy: same-origin
cross-origin-embedder-policy: require-corp
```

- [ ] **Step 4: Commit**

```bash
git add src/app.html src/hooks.server.ts
git commit -m "feat: add COOP/COEP security headers and font preloads"
```

---

### Task 3: CSS Design Tokens

**Files:**
- Create: `src/app.css`
- Create: `static/fonts/archivo/.gitkeep`, `static/fonts/jetbrains-mono/.gitkeep`

- [ ] **Step 1: Create font directories with placeholders**

```bash
mkdir -p static/fonts/archivo static/fonts/jetbrains-mono
touch static/fonts/archivo/.gitkeep static/fonts/jetbrains-mono/.gitkeep
```

Font files are self-hosted. Download Archivo Variable and JetBrains Mono Variable (woff2) into these directories. For now, placeholders ensure the structure exists.

- [ ] **Step 2: Write the full CSS custom properties file**

Create `src/app.css`:
```css
/* Fonts */
@font-face {
  font-family: 'Archivo';
  src: url('/fonts/archivo/archivo-variable.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;
}

@font-face {
  font-family: 'JetBrains Mono';
  src: url('/fonts/jetbrains-mono/jetbrains-mono-variable.woff2') format('woff2');
  font-weight: 100 800;
  font-display: swap;
  font-feature-settings: 'tnum' 1;
}

/* Reset */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  /* Typography */
  --font-ui: 'Archivo', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --text-xs: 11px;
  --text-sm: 12px;
  --text-base: 13px;
  --text-lg: 15px;
  --text-xl: 17px;
  --text-metric: 13px;

  /* Spacing (8px grid) */
  --space-half: 4px;
  --space-1: 8px;
  --space-2: 16px;
  --space-3: 24px;
  --space-4: 32px;
  --space-5: 48px;

  /* Border radius */
  --radius-sm: 2px;
  --radius-base: 3px;
  --radius-lg: 5px;

  /* Z-index scale */
  --z-base: 0;
  --z-sticky: 10;
  --z-dropdown: 100;
  --z-overlay: 200;
  --z-toast: 300;

  /* Motion */
  --transition-base: 120ms ease;
  --transition-slow: 240ms ease;

  /* Theme: Light (default) */
  --color-surface: #ffffff;
  --color-surface-raised: #f8f9fa;
  --color-surface-sunken: #f1f3f5;
  --color-text-primary: #141718;
  --color-text-secondary: #374151;
  --color-text-muted: #585f6b;
  --color-border: #e5e7eb;
  --color-border-strong: #d1d5db;

  /* Focus */
  --color-focus-ring: #0068b5;

  /* Elevation */
  --shadow-dropdown: 0 4px 12px rgba(0, 0, 0, 0.12);
  --shadow-overlay: 0 8px 24px rgba(0, 0, 0, 0.2);

  /* Navigation */
  --color-nav-item-hover: rgba(0, 0, 0, 0.06);
  --color-nav-item-active: rgba(0, 0, 0, 0.10);

  /* Backend colors */
  --color-backend-wasm-1: #66bb6a;
  --color-backend-wasm-4: #2e7d32;
  --color-backend-webgpu: #e68a00;
  --color-backend-webnn-cpu: #00C7FD;
  --color-backend-webnn-gpu: #0953DE;
  --color-backend-webnn-npu: #002060;

  /* Metric colors (column header accents only) */
  --color-metric-load: #0603bd;
  --color-metric-central: #6ac600;
  --color-metric-best: #0acdc7;
  --color-metric-tail: #be65ff;
  --color-metric-throughput: #ff671f;

  /* Data type colors */
  --color-dtype-float: #c61a3e;
  --color-dtype-int: #0186b3;
  --color-dtype-quant: #9c27b0;
  --color-dtype-mixed: #109a7f;

  /* Runtime colors */
  --color-runtime-ort: #343433;
  --color-runtime-litert: #000d59;

  /* Semantic colors */
  --color-success: #2e8b38;
  --color-error: #c61a3e;
  --color-warning: #d48200;
  --color-info: #1976d2;
}

[data-theme="dark"] {
  --color-surface: #1a1a1a;
  --color-surface-raised: #282828;
  --color-surface-sunken: #141414;
  --color-text-primary: #e8e8e8;
  --color-text-secondary: #9ca3af;
  --color-text-muted: #8a9199;
  --color-border: #333333;
  --color-border-strong: #444444;

  --color-focus-ring: #4da3e0;

  --shadow-dropdown: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-overlay: 0 8px 24px rgba(0, 0, 0, 0.5);

  --color-nav-item-hover: rgba(255, 255, 255, 0.07);
  --color-nav-item-active: rgba(255, 255, 255, 0.12);

  /* Backend dark badge text */
  --color-backend-wasm-1: #a5dfa8;
  --color-backend-wasm-4: #6fcf74;
  --color-backend-webgpu: #ffbb55;
  --color-backend-webnn-cpu: #5dd8ff;
  --color-backend-webnn-gpu: #7aabff;
  --color-backend-webnn-npu: #a0c4ff;

  /* Data type dark badge text */
  --color-dtype-float: #f47a93;
  --color-dtype-int: #5dd8ff;
  --color-dtype-quant: #e08ef0;
  --color-dtype-mixed: #6eecd0;

  /* Runtime dark values */
  --color-runtime-ort: #c8c7c6;
  --color-runtime-litert: #a8b4e8;

  /* Semantic dark values */
  --color-success: #6fcf74;
  --color-error: #f47a93;
  --color-warning: #ffbb55;
  --color-info: #64b5f6;
}

/* Base styles */
html {
  font-family: var(--font-ui);
  font-size: var(--text-base);
  font-weight: 300;
  color: var(--color-text-primary);
  background: var(--color-surface);
  line-height: 1.5;
}

body {
  min-height: 100vh;
}
```

- [ ] **Step 3: Import app.css in the root layout**

Create `src/routes/+layout.svelte`:
```svelte
<script>
  import '../app.css';

  let { children } = $props();
</script>

{@render children()}
```

- [ ] **Step 4: Verify tokens render in browser**

Run: `npm run dev`

Open browser, inspect `<html>` element. Confirm CSS custom properties are present in computed styles.

- [ ] **Step 5: Commit**

```bash
git add src/app.css src/routes/+layout.svelte static/fonts/
git commit -m "feat: add CSS design tokens from design-system.md v2.1"
```

---

### Task 4: TypeScript Role Types

**Files:**
- Create: `src/lib/types/roles.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/types/roles.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { isAtLeast, ROLE_HIERARCHY, type Role } from '$lib/types/roles';

describe('Role hierarchy', () => {
  it('recognizes admin as highest', () => {
    expect(isAtLeast('admin', 'admin')).toBe(true);
    expect(isAtLeast('admin', 'anonymous')).toBe(true);
  });

  it('recognizes member is above anonymous', () => {
    expect(isAtLeast('member', 'anonymous')).toBe(true);
    expect(isAtLeast('member', 'member')).toBe(true);
  });

  it('anonymous cannot access member features', () => {
    expect(isAtLeast('anonymous', 'member')).toBe(false);
  });

  it('partner is above member', () => {
    expect(isAtLeast('partner', 'member')).toBe(true);
    expect(isAtLeast('member', 'partner')).toBe(false);
  });

  it('intel is above partner', () => {
    expect(isAtLeast('intel', 'partner')).toBe(true);
    expect(isAtLeast('partner', 'intel')).toBe(false);
  });

  it('hierarchy has 5 tiers', () => {
    expect(ROLE_HIERARCHY.length).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/types/roles.test.ts`
Expected: FAIL — module `$lib/types/roles` not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/types/roles.ts`:
```typescript
export const ROLE_HIERARCHY = ['anonymous', 'member', 'partner', 'intel', 'admin'] as const;

export type Role = (typeof ROLE_HIERARCHY)[number];

export function isAtLeast(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY.indexOf(userRole) >= ROLE_HIERARCHY.indexOf(requiredRole);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/types/roles.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/roles.ts tests/lib/types/roles.test.ts
git commit -m "feat: add role type definitions and hierarchy helper"
```

---

### Task 5: Benchmark Guard

**Files:**
- Create: `src/lib/guards/benchmark-guard.ts`
- Create: `tests/lib/guards/benchmark-guard.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/guards/benchmark-guard.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { canRunBenchmark, type TestType, type GuardResult } from '$lib/guards/benchmark-guard';

describe('canRunBenchmark', () => {
  describe('anonymous user', () => {
    it('allows /model tests', () => {
      const result = canRunBenchmark(false, 'model');
      expect(result).toEqual({ allowed: true });
    });

    it('blocks /recipe tests', () => {
      const result = canRunBenchmark(false, 'recipe');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Sign in');
    });

    it('blocks /custom tests', () => {
      const result = canRunBenchmark(false, 'custom');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Sign in');
    });
  });

  describe('authenticated user', () => {
    it('allows /model tests', () => {
      const result = canRunBenchmark(true, 'model');
      expect(result).toEqual({ allowed: true });
    });

    it('allows /recipe tests', () => {
      const result = canRunBenchmark(true, 'recipe');
      expect(result).toEqual({ allowed: true });
    });

    it('allows /custom tests', () => {
      const result = canRunBenchmark(true, 'custom');
      expect(result).toEqual({ allowed: true });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/guards/benchmark-guard.test.ts`
Expected: FAIL — module `$lib/guards/benchmark-guard` not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/guards/benchmark-guard.ts`:
```typescript
export type TestType = 'model' | 'recipe' | 'custom';

export interface GuardResult {
  allowed: boolean;
  reason?: string;
}

export function canRunBenchmark(isAuthenticated: boolean, testType: TestType): GuardResult {
  if (testType === 'model') {
    return { allowed: true };
  }
  if (isAuthenticated) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: 'Running recipe and custom tests requires a free account. Sign in to continue.'
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/guards/benchmark-guard.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/guards/benchmark-guard.ts tests/lib/guards/benchmark-guard.test.ts
git commit -m "feat: add benchmark guard for role-based test type gating"
```

---

### Task 6: Supabase Client Setup

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/types.ts`
- Create: `.env.example`

- [ ] **Step 1: Create environment variable example file**

Create `.env.example`:
```bash
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 2: Create the browser client**

Create `src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Database } from './types';

export function createClient() {
  return createBrowserClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
}
```

- [ ] **Step 3: Create the server client**

Create `src/lib/supabase/server.ts`:
```typescript
import { createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Database } from './types';
import type { Cookies } from '@sveltejs/kit';

export function createServerSupabaseClient(cookies: Cookies) {
  return createServerClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, { ...options, path: '/' });
        });
      }
    }
  });
}
```

- [ ] **Step 4: Create the database types placeholder**

Create `src/lib/supabase/types.ts`:
```typescript
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          role: 'anonymous' | 'member' | 'partner' | 'intel' | 'admin';
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: 'anonymous' | 'member' | 'partner' | 'intel' | 'admin';
          display_name?: string | null;
          avatar_url?: string | null;
        };
        Update: {
          role?: 'anonymous' | 'member' | 'partner' | 'intel' | 'admin';
          display_name?: string | null;
          avatar_url?: string | null;
        };
      };
      recipes: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          slug: string;
          visibility: 'personal' | 'public';
          models: RecipeModel[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          owner_id: string;
          name: string;
          slug: string;
          visibility?: 'personal' | 'public';
          models: RecipeModel[];
        };
        Update: {
          name?: string;
          slug?: string;
          visibility?: 'personal' | 'public';
          models?: RecipeModel[];
        };
      };
      models: {
        Row: {
          id: string;
          hf_model_id: string;
          file_path: string;
          data_type: string;
          size_bytes: number;
          runtime: 'onnx' | 'litert';
          source_org: string;
          last_synced: string;
        };
        Insert: {
          hf_model_id: string;
          file_path: string;
          data_type: string;
          size_bytes: number;
          runtime: 'onnx' | 'litert';
          source_org: string;
        };
        Update: {
          data_type?: string;
          size_bytes?: number;
          last_synced?: string;
        };
      };
      results: {
        Row: {
          id: string;
          run_id: string | null;
          user_id: string;
          model_id: string;
          backend: string;
          data_type: string;
          status: 'running' | 'completed' | 'timeout' | 'crashed' | 'error';
          timeout_phase: 'download' | 'compilation' | 'inference' | null;
          error_message: string | null;
          cpu: string;
          gpu: string;
          os: string;
          os_version: string;
          browser: string;
          browser_version: string;
          metrics: BenchmarkMetrics | null;
          iterations: number;
          iterations_completed: number;
          started_at: string;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          run_id?: string | null;
          user_id: string;
          model_id: string;
          backend: string;
          data_type: string;
          status?: 'running' | 'completed' | 'timeout' | 'crashed' | 'error';
          cpu: string;
          gpu: string;
          os: string;
          os_version: string;
          browser: string;
          browser_version: string;
          metrics?: BenchmarkMetrics | null;
          iterations: number;
          iterations_completed?: number;
        };
        Update: {
          status?: 'running' | 'completed' | 'timeout' | 'crashed' | 'error';
          timeout_phase?: 'compilation' | 'inference' | null;
          error_message?: string | null;
          metrics?: BenchmarkMetrics | null;
          iterations_completed?: number;
          completed_at?: string;
        };
      };
    };
  };
}

export interface RecipeModel {
  hf_model_id: string;
  file_path: string;
  data_type: string;
  backends: string[];
}

export interface BenchmarkMetrics {
  compilation_ms: number;
  first_inference_ms: number;
  time_to_first_ms: number;
  average_ms: number;
  median_ms: number;
  best_ms: number;
  p90_ms: number;
  throughput_fps: number;
}
```

- [ ] **Step 5: Add .env to .gitignore**

Append to `.gitignore`:
```
.env
.env.local
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx svelte-kit sync && npx svelte-check`
Expected: No type errors (Supabase env vars will show warnings without actual .env, which is expected).

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase/ .env.example .gitignore
git commit -m "feat: add Supabase client setup and database type definitions"
```

---

### Task 7: Supabase Database Migrations

**Files:**
- Create: `supabase/migrations/001_profiles.sql`
- Create: `supabase/migrations/002_recipes.sql`
- Create: `supabase/migrations/003_models.sql`
- Create: `supabase/migrations/004_results.sql`

- [ ] **Step 1: Create profiles migration**

Create `supabase/migrations/001_profiles.sql`:
```sql
-- Profiles table: extends Supabase auth.users with app-specific fields
create type public.app_role as enum ('anonymous', 'member', 'partner', 'intel', 'admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role public.app_role not null default 'member',
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: users can read their own profile, admins can read all
alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Admins can read all profiles"
  on public.profiles for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Users can update own profile (non-role fields)"
  on public.profiles for update
  using (auth.uid() = id)
  with check (role = (select role from public.profiles where id = auth.uid()));

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Function to set custom claims (role) in JWT
create or replace function public.set_user_role(target_user_id uuid, new_role public.app_role)
returns void as $$
begin
  -- Only admins can call this
  if (auth.jwt() -> 'app_metadata' ->> 'role') != 'admin' then
    raise exception 'Only admins can set roles';
  end if;

  update public.profiles set role = new_role, updated_at = now() where id = target_user_id;
  update auth.users set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', new_role) where id = target_user_id;
end;
$$ language plpgsql security definer;
```

- [ ] **Step 2: Create recipes migration**

Create `supabase/migrations/002_recipes.sql`:
```sql
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  slug text not null unique,
  visibility text not null default 'personal' check (visibility in ('personal', 'public')),
  models jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_recipes_slug on public.recipes(slug);
create index idx_recipes_owner on public.recipes(owner_id);

alter table public.recipes enable row level security;

-- Anyone can read public recipes
create policy "Anyone can read public recipes"
  on public.recipes for select
  using (visibility = 'public');

-- Owners can read their own recipes
create policy "Owners can read own recipes"
  on public.recipes for select
  using (auth.uid() = owner_id);

-- Members+ can create recipes
create policy "Members can create recipes"
  on public.recipes for insert
  with check (auth.uid() = owner_id);

-- Owners can update their recipes
create policy "Owners can update own recipes"
  on public.recipes for update
  using (auth.uid() = owner_id);

-- Owners can delete their recipes
create policy "Owners can delete own recipes"
  on public.recipes for delete
  using (auth.uid() = owner_id);
```

- [ ] **Step 3: Create models cache migration**

Create `supabase/migrations/003_models.sql`:
```sql
create table public.models (
  id uuid primary key default gen_random_uuid(),
  hf_model_id text not null,
  file_path text not null,
  data_type text not null,
  size_bytes bigint not null,
  runtime text not null check (runtime in ('onnx', 'litert')),
  source_org text not null,
  last_synced timestamptz not null default now(),
  unique(hf_model_id, file_path)
);

create index idx_models_runtime on public.models(runtime);
create index idx_models_source on public.models(source_org);

alter table public.models enable row level security;

-- Anyone can read models (public catalog)
create policy "Anyone can read models"
  on public.models for select
  using (true);

-- Only service role can insert/update (Edge Function sync)
create policy "Service role can manage models"
  on public.models for all
  using (auth.role() = 'service_role');
```

- [ ] **Step 4: Create results migration**

Create `supabase/migrations/004_results.sql`:
```sql
create table public.results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid,
  user_id uuid not null references public.profiles(id) on delete cascade,
  model_id text not null,
  backend text not null,
  data_type text not null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'timeout', 'crashed', 'error')),
  timeout_phase text
    check (timeout_phase in ('download', 'compilation', 'inference') or timeout_phase is null),
  error_message text,
  cpu text not null,
  gpu text not null,
  os text not null,
  os_version text not null,
  browser text not null,
  browser_version text not null,
  metrics jsonb,
  iterations integer not null,
  iterations_completed integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_results_user on public.results(user_id);
create index idx_results_model on public.results(model_id);
create index idx_results_run on public.results(run_id);
create index idx_results_status on public.results(user_id, status);
create index idx_results_created on public.results(created_at desc);

alter table public.results enable row level security;

-- Users can read their own results
create policy "Users can read own results"
  on public.results for select
  using (auth.uid() = user_id);

-- Intel/Admin can read all results (hidden leaderboard)
create policy "Intel and Admin can read all results"
  on public.results for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('intel', 'admin'));

-- Members+ can insert their own results
create policy "Members can insert own results"
  on public.results for insert
  with check (auth.uid() = user_id);

-- Members+ can update their own running results (two-phase write)
create policy "Members can update own running results"
  on public.results for update
  using (auth.uid() = user_id and status = 'running');
```

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "feat: add Supabase migrations for profiles, recipes, models, and results"
```

---

### Task 8: Auth Store and Session Handling

**Files:**
- Create: `src/lib/stores/auth.ts`
- Modify: `src/hooks.server.ts`
- Create: `src/routes/+layout.server.ts`

- [ ] **Step 1: Create the auth store**

Create `src/lib/stores/auth.ts`:
```typescript
import { writable, derived } from 'svelte/store';
import type { Session, User } from '@supabase/supabase-js';
import type { Role } from '$lib/types/roles';

interface AuthState {
  session: Session | null;
  user: User | null;
  role: Role;
  loading: boolean;
}

export const auth = writable<AuthState>({
  session: null,
  user: null,
  role: 'anonymous',
  loading: true
});

export const isAuthenticated = derived(auth, ($auth) => $auth.session !== null);
export const userRole = derived(auth, ($auth) => $auth.role);
```

- [ ] **Step 2: Update hooks.server.ts to handle session**

Replace `src/hooks.server.ts`:
```typescript
import type { Handle } from '@sveltejs/kit';
import { createServerSupabaseClient } from '$lib/supabase/server';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.supabase = createServerSupabaseClient(event.cookies);

  event.locals.getSession = async () => {
    const { data: { session } } = await event.locals.supabase.auth.getSession();
    return session;
  };

  const response = await resolve(event, {
    filterSerializedResponseHeaders(name) {
      return name === 'content-range' || name === 'x-supabase-api-version';
    }
  });

  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');

  return response;
};
```

- [ ] **Step 3: Create layout server load function**

Create `src/routes/+layout.server.ts`:
```typescript
import type { LayoutServerLoad } from './$types';
import type { Role } from '$lib/types/roles';

export const load: LayoutServerLoad = async ({ locals }) => {
  const session = await locals.getSession();

  let role: Role = 'anonymous';
  if (session?.user) {
    role = (session.user.app_metadata?.role as Role) ?? 'member';
  }

  return {
    session,
    role
  };
};
```

- [ ] **Step 4: Update app.d.ts with locals types**

Create `src/app.d.ts`:
```typescript
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/types';

declare global {
  namespace App {
    interface Locals {
      supabase: SupabaseClient<Database>;
      getSession: () => Promise<Session | null>;
    }
    interface PageData {
      session: Session | null;
      role: import('$lib/types/roles').Role;
    }
  }
}

export {};
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/auth.ts src/hooks.server.ts src/routes/+layout.server.ts src/app.d.ts
git commit -m "feat: add auth store and server-side session handling"
```

---

### Task 9: Theme Store

**Files:**
- Create: `src/lib/stores/theme.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/stores/theme.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { theme, toggleTheme, initTheme } from '$lib/stores/theme';

describe('theme store', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn()
    });
    vi.stubGlobal('document', {
      documentElement: { setAttribute: vi.fn() }
    });
    vi.stubGlobal('window', {
      matchMedia: vi.fn(() => ({ matches: false }))
    });
  });

  it('defaults to light', () => {
    initTheme();
    expect(get(theme)).toBe('light');
  });

  it('toggles from light to dark', () => {
    initTheme();
    toggleTheme();
    expect(get(theme)).toBe('dark');
  });

  it('toggles from dark to light', () => {
    initTheme();
    toggleTheme();
    toggleTheme();
    expect(get(theme)).toBe('light');
  });

  it('persists to localStorage on toggle', () => {
    initTheme();
    toggleTheme();
    expect(localStorage.setItem).toHaveBeenCalledWith('theme', 'dark');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/stores/theme.test.ts`
Expected: FAIL — module `$lib/stores/theme` not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/stores/theme.ts`:
```typescript
import { writable, get } from 'svelte/store';

export type Theme = 'light' | 'dark';

export const theme = writable<Theme>('light');

export function initTheme(): void {
  const stored = localStorage.getItem('theme') as Theme | null;
  if (stored === 'light' || stored === 'dark') {
    setTheme(stored);
    return;
  }
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(prefersDark ? 'dark' : 'light');
}

export function toggleTheme(): void {
  const current = get(theme);
  const next: Theme = current === 'light' ? 'dark' : 'light';
  setTheme(next);
}

function setTheme(value: Theme): void {
  theme.set(value);
  document.documentElement.setAttribute('data-theme', value);
  localStorage.setItem('theme', value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/stores/theme.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/theme.ts tests/lib/stores/theme.test.ts
git commit -m "feat: add theme store with localStorage persistence"
```

---

### Task 10: Root Layout with Navigation

**Files:**
- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1: Update the root layout with nav and auth**

Replace `src/routes/+layout.svelte`:
```svelte
<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { initTheme, toggleTheme, theme } from '$lib/stores/theme';
  import { auth, isAuthenticated } from '$lib/stores/auth';
  import { createClient } from '$lib/supabase/client';
  import { isAtLeast } from '$lib/types/roles';
  import type { Role } from '$lib/types/roles';

  let { data, children } = $props();

  const supabase = createClient();

  onMount(() => {
    initTheme();

    const role: Role = data.session?.user?.app_metadata?.role ?? 'anonymous';
    auth.set({
      session: data.session,
      user: data.session?.user ?? null,
      role: data.session ? role : 'anonymous',
      loading: false
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const newRole: Role = session?.user?.app_metadata?.role ?? 'anonymous';
      auth.set({
        session,
        user: session?.user ?? null,
        role: session ? newRole : 'anonymous',
        loading: false
      });
    });

    return () => subscription.unsubscribe();
  });

  async function signIn(provider: 'github' | 'google') {
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const navItems = [
    { href: '/model', label: 'Model' },
    { href: '/recipe', label: 'Recipe' },
    { href: '/custom', label: 'Custom' }
  ];
</script>

<nav class="top-bar">
  <div class="nav-left">
    <a href="/" class="logo">webai.run</a>
    {#each navItems as item}
      <a
        href={item.href}
        class="nav-item"
        class:active={$page.url.pathname.startsWith(item.href)}
      >
        {item.label}
      </a>
    {/each}
  </div>
  <div class="nav-right">
    <button class="nav-item" onclick={toggleTheme} aria-label="Toggle theme">
      {$theme === 'light' ? '🌙' : '☀️'}
    </button>
    {#if $isAuthenticated}
      <button class="nav-item" onclick={signOut}>Sign out</button>
    {:else}
      <button class="nav-item" onclick={() => signIn('github')}>Sign in</button>
    {/if}
  </div>
</nav>

<main>
  {@render children()}
</main>

<style>
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 48px;
    padding: 0 var(--space-2);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
    position: sticky;
    top: 0;
    z-index: var(--z-sticky);
  }

  .nav-left, .nav-right {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .logo {
    font-family: var(--font-mono);
    font-size: var(--text-lg);
    font-weight: 400;
    text-decoration: none;
    color: var(--color-text-primary);
    margin-right: var(--space-2);
  }

  .nav-item {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 400;
    text-decoration: none;
    color: var(--color-text-secondary);
    padding: var(--space-half) var(--space-1);
    border-radius: var(--radius-base);
    border: none;
    background: none;
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .nav-item:hover {
    background: var(--color-nav-item-hover);
  }

  .nav-item.active {
    color: var(--color-text-primary);
    background: var(--color-nav-item-active);
  }

  main {
    padding: var(--space-3);
    max-width: 1280px;
    margin: 0 auto;
  }
</style>
```

- [ ] **Step 2: Verify layout renders in browser**

Run: `npm run dev`

Open browser at `http://localhost:5173`. Confirm:
- Top navigation bar with "webai.run" logo, Model/Recipe/Custom links
- Theme toggle button works (switches light/dark)
- Sign in button visible for anonymous users
- Nav highlights active route

- [ ] **Step 3: Commit**

```bash
git add src/routes/+layout.svelte
git commit -m "feat: add root layout with navigation bar, theme toggle, and auth"
```

---

### Task 11: Route Pages (Stubs)

**Files:**
- Create: `src/routes/+page.svelte`
- Create: `src/routes/model/+page.svelte`
- Create: `src/routes/recipe/+page.svelte`
- Create: `src/routes/custom/+page.svelte`

- [ ] **Step 1: Create the landing page (redirects to /model)**

Create `src/routes/+page.svelte`:
```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(() => {
    goto('/model', { replaceState: true });
  });
</script>
```

- [ ] **Step 2: Create /model page stub**

Create `src/routes/model/+page.svelte`:
```svelte
<script lang="ts">
  import { isAuthenticated } from '$lib/stores/auth';
  import { canRunBenchmark } from '$lib/guards/benchmark-guard';

  let guardResult = $derived(canRunBenchmark($isAuthenticated, 'model'));
</script>

<h1>Model Benchmark</h1>
<p>Run a single model benchmark. Available to all users.</p>

<button class="btn-primary" disabled={!guardResult.allowed}>
  Run Benchmark
</button>
```

- [ ] **Step 3: Create /recipe page stub with guard**

Create `src/routes/recipe/+page.svelte`:
```svelte
<script lang="ts">
  import { isAuthenticated } from '$lib/stores/auth';
  import { canRunBenchmark } from '$lib/guards/benchmark-guard';

  let showSignInModal = $state(false);
  let guardResult = $derived(canRunBenchmark($isAuthenticated, 'recipe'));

  function handleRun() {
    if (!guardResult.allowed) {
      showSignInModal = true;
      return;
    }
    // TODO: run benchmark
  }
</script>

<h1>Recipe Benchmark</h1>
<p>Run a curated multi-model benchmark. Requires sign-in.</p>

<button class="btn-primary" onclick={handleRun}>
  Run Benchmark
</button>

{#if showSignInModal}
  <div class="dialog-backdrop" onclick={() => showSignInModal = false}>
    <div class="dialog-panel" onclick|stopPropagation>
      <h2>Sign in to continue</h2>
      <p>{guardResult.reason}</p>
      <div class="dialog-actions">
        <button class="btn-ghost" onclick={() => showSignInModal = false}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
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

  .dialog-panel h2 {
    font-size: var(--text-lg);
    margin-bottom: var(--space-1);
  }

  .dialog-panel p {
    font-size: var(--text-base);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-2);
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-1);
  }
</style>
```

- [ ] **Step 4: Create /custom page stub with guard**

Create `src/routes/custom/+page.svelte`:
```svelte
<script lang="ts">
  import { isAuthenticated } from '$lib/stores/auth';
  import { canRunBenchmark } from '$lib/guards/benchmark-guard';

  let showSignInModal = $state(false);
  let guardResult = $derived(canRunBenchmark($isAuthenticated, 'custom'));

  function handleRun() {
    if (!guardResult.allowed) {
      showSignInModal = true;
      return;
    }
    // TODO: run benchmark
  }
</script>

<h1>Custom Benchmark</h1>
<p>Upload and test your own model. Requires sign-in.</p>

<button class="btn-primary" onclick={handleRun}>
  Run Benchmark
</button>

{#if showSignInModal}
  <div class="dialog-backdrop" onclick={() => showSignInModal = false}>
    <div class="dialog-panel" onclick|stopPropagation>
      <h2>Sign in to continue</h2>
      <p>{guardResult.reason}</p>
      <div class="dialog-actions">
        <button class="btn-ghost" onclick={() => showSignInModal = false}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
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

  .dialog-panel h2 {
    font-size: var(--text-lg);
    margin-bottom: var(--space-1);
  }

  .dialog-panel p {
    font-size: var(--text-base);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-2);
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-1);
  }
</style>
```

- [ ] **Step 5: Verify all routes in browser**

Run: `npm run dev`

- Navigate to `/` — redirects to `/model`
- Navigate to `/model` — shows "Run Benchmark" (enabled)
- Navigate to `/recipe` — shows "Run Benchmark", clicking shows sign-in modal (when not authenticated)
- Navigate to `/custom` — same behavior as /recipe
- Nav highlights the active route

- [ ] **Step 6: Commit**

```bash
git add src/routes/
git commit -m "feat: add route pages with benchmark guard integration"
```

---

### Task 12: OAuth Callback Handler

**Files:**
- Create: `src/routes/auth/callback/+server.ts`

- [ ] **Step 1: Create the OAuth callback endpoint**

Create `src/routes/auth/callback/+server.ts`:
```typescript
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/model';

  if (code) {
    const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      redirect(303, next);
    }
  }

  redirect(303, '/model');
};
```

- [ ] **Step 2: Verify the callback route exists**

Run: `npm run build`
Expected: Build succeeds. The `/auth/callback` route is registered.

- [ ] **Step 3: Commit**

```bash
git add src/routes/auth/callback/
git commit -m "feat: add OAuth callback handler for Supabase auth code exchange"
```

---

### Task 13: Run All Tests and Type Check

**Files:** (none created, verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: All tests pass (roles, benchmark-guard, theme store).

- [ ] **Step 2: Run type checking**

Run: `npm run check`
Expected: No type errors.

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: Production build completes without errors.

- [ ] **Step 4: Manual browser verification**

Run: `npm run dev`

Verify:
1. `/model` page loads, "Run Benchmark" button enabled
2. `/recipe` page loads, clicking "Run Benchmark" shows sign-in modal
3. `/custom` page loads, clicking "Run Benchmark" shows sign-in modal
4. Theme toggle works (light ↔ dark)
5. Nav active state highlights correctly
6. COOP/COEP headers present (check Network tab)

- [ ] **Step 5: Commit if any fixes were needed**

Only commit if steps 1-3 revealed issues that required fixes:
```bash
git add -A
git commit -m "fix: resolve type/test issues from integration verification"
```

---

## Phase Summary

After completing all 13 tasks, the project will have:
- SvelteKit 5 app with TypeScript, building to Vercel
- Full CSS design token layer from design-system.md v2.1
- Supabase client/server setup with typed database interface
- Database migrations for all 4 core tables (profiles, recipes, models, results)
- Five-tier role system with type-safe hierarchy checking
- Benchmark guard that gates /recipe and /custom behind authentication
- Sign-in modal triggered when anonymous users attempt gated actions
- OAuth callback handler for GitHub/Google sign-in
- Theme store with localStorage persistence and system preference detection
- Navigation shell with role-aware routing

## What Comes Next (Future Phases)

- **Phase 2: HuggingFace Integration** — Model discovery, HF API client, daily sync Edge Function, model browser UI
- **Phase 3: Benchmark Engine** — Runtime loading (ORT + LiteRT), input extraction, inference runner, metric collection
- **Phase 4: Recipes** — CRUD, sharing via URL slug, recipe runner integration
- **Phase 5: Results & Leaderboard** — Save flow, environment detection, Intel/Admin-only leaderboard view
