# Recipe Tabs + Featured Curation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the `/recipe` page into three tabs (Featured / Community / Mine) with client-side search, and add an `/admin/recipes` panel where admins can feature public recipes and set their display order via an editable number field.

**Architecture:** A DB migration adds `featured` and `featured_order` to the `recipes` table. The recipe page server load already fetches all relevant recipes in one query — we extend it to return the two new fields. The client splits recipes into three derived lists and renders them in tabs. A new admin page handles feature/unfeature/reorder via SvelteKit form actions. No new client-side libraries needed.

**Tech Stack:** SvelteKit 5 (Svelte runes), Supabase (Postgres + RLS), TypeScript. All existing patterns (form actions with `enhance`, `$state`, `$derived`, `locals.supabase`) are followed throughout.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/020_recipes_featured.sql` | Create | Add `featured`, `featured_order` columns + index + admin RLS policy |
| `src/lib/recipes/crud.ts` | Modify | Add `featured`, `featured_order` to `Recipe` type |
| `src/routes/recipe/+page.server.ts` | Modify | Return `featured`, `featured_order` in loaded recipes |
| `src/routes/recipe/+page.svelte` | Modify | Tabs, search, remove splitTwo, single-table layout per tab |
| `src/routes/admin/+layout.svelte` | Modify | Add Recipes link to admin subnav |
| `src/routes/admin/recipes/+page.server.ts` | Create | Load all public recipes; featureRecipe / unfeatureRecipe / updateOrder actions |
| `src/routes/admin/recipes/+page.svelte` | Create | Admin curation UI — featured list with editable order, unfeatured list with Feature button |

---

## Task 1: DB migration — add featured columns

**Files:**
- Create: `supabase/migrations/020_recipes_featured.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/020_recipes_featured.sql` with:

```sql
alter table public.recipes
  add column featured boolean not null default false,
  add column featured_order integer;

create index idx_recipes_featured on public.recipes(featured, featured_order)
  where featured = true;

-- Admins can update featured/featured_order on any public recipe
create policy "Admins can feature recipes"
  on public.recipes for update
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
```

- [ ] **Step 2: Apply the migration**

Apply via Supabase dashboard SQL editor or CLI:
```bash
supabase db push
```

- [ ] **Step 3: Verify columns exist**

In the Supabase dashboard → Table editor → recipes, confirm `featured` (bool, default false) and `featured_order` (int4, nullable) columns are present.

---

## Task 2: Extend Recipe type

**Files:**
- Modify: `src/lib/recipes/crud.ts`

- [ ] **Step 1: Add fields to the Recipe interface**

Find the `Recipe` interface (lines 4–13) and add the two new fields:

```typescript
export interface Recipe {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  visibility: 'personal' | 'public';
  featured: boolean;
  featured_order: number | null;
  models: RecipeModel[];
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors (pre-existing errors in admin/orgs and tests are unrelated).

---

## Task 3: Recipe page server — return featured fields

**Files:**
- Modify: `src/routes/recipe/+page.server.ts`

The current query uses `select('*, profiles!owner_id(display_name, email, avatar_url)')`. The `*` already selects all columns, so `featured` and `featured_order` are automatically included once the migration runs. The only change needed is to update the `RecipeWithOwner` interface to include them.

- [ ] **Step 1: Update RecipeWithOwner**

The current file has:

```typescript
export interface RecipeWithOwner extends Recipe {
  owner_display_name: string | null;
  owner_avatar_url: string | null;
}
```

`Recipe` now includes `featured` and `featured_order`, so `RecipeWithOwner` inherits them. No code change needed — just verify by reading the file and confirming `Recipe` is imported from `$lib/recipes/crud`.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

---

## Task 4: Recipe page — tabs, search, single-table layout

This is the largest task. Read the current `src/routes/recipe/+page.svelte` carefully before editing — it is ~670 lines.

**Files:**
- Modify: `src/routes/recipe/+page.svelte`

- [ ] **Step 1: Replace derived state — add tabs and search**

In the `<script>` block, replace:

```typescript
const publicRecipes = $derived(data.recipes.filter(r => r.visibility === 'public'));
const personalRecipes = $derived(data.recipes.filter(r => r.visibility === 'personal'));

function splitTwo(recipes: Recipe[]): [Recipe[], Recipe[]] {
  return [recipes.filter((_, i) => i % 2 === 0), recipes.filter((_, i) => i % 2 === 1)];
}
```

With:

```typescript
const TABS = ['featured', 'community', 'mine'] as const;
type Tab = typeof TABS[number];

function getTabFromHash(): Tab {
  if (typeof window === 'undefined') return 'featured';
  const hash = location.hash.slice(1);
  return (TABS as readonly string[]).includes(hash) ? (hash as Tab) : 'featured';
}

let activeTab = $state<Tab>(getTabFromHash());
let searchQuery = $state('');

function setTab(tab: Tab) {
  activeTab = tab;
  searchQuery = '';
  history.replaceState(null, '', `#${tab}`);
}

const featuredRecipes = $derived(
  data.recipes
    .filter((r: any) => r.visibility === 'public' && r.featured)
    .sort((a: any, b: any) => {
      const ao = a.featured_order ?? Infinity;
      const bo = b.featured_order ?? Infinity;
      if (ao !== bo) return ao - bo;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    })
);

const communityRecipes = $derived(
  data.recipes
    .filter((r: any) => r.visibility === 'public' && !r.featured)
    .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
);

const mineRecipes = $derived(
  data.recipes
    .filter((r: any) => r.owner_id === data.userId)
    .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
);

function filterBySearch(recipes: any[]): any[] {
  if (!searchQuery.trim()) return recipes;
  const q = searchQuery.toLowerCase();
  return recipes.filter(r => r.name.toLowerCase().includes(q));
}
```

- [ ] **Step 2: Update the `recipeRow` snippet — remove visibility toggle from non-Mine tabs**

The current `recipeRow` snippet shows the `→ Personal` / `→ Public` visibility toggle button for recipe owners. This should only appear in the Mine tab. Replace the condition inside `recipeRow`:

Find:
```svelte
{#if data.userId === recipe.owner_id}
  <button class="action-btn action-vis" onclick={() => toggleVisibility(recipe)}>{visLabel}</button>
  <a href="/recipe/{recipe.slug}/edit" class="action-btn action-edit">Edit</a>
  <button class="action-btn action-delete" onclick={() => handleDelete(recipe)}>Del</button>
{/if}
```

Replace with (add `showOwnerActions` parameter to the snippet):

Update the snippet signature from:
```svelte
{#snippet recipeRow(recipe: any, visLabel: string, showOwner = false)}
```
To:
```svelte
{#snippet recipeRow(recipe: any, visLabel: string, showOwner = false, showOwnerActions = false)}
```

And replace the owner actions block:
```svelte
{#if showOwnerActions && data.userId === recipe.owner_id}
  <button class="action-btn action-vis" onclick={() => toggleVisibility(recipe)}>{visLabel}</button>
  <a href="/recipe/{recipe.slug}/edit" class="action-btn action-edit">Edit</a>
  <button class="action-btn action-delete" onclick={() => handleDelete(recipe)}>Del</button>
{/if}
```

Do the same in the `recipeTable` snippet — update its signature and pass `showOwnerActions` through to `recipeRow`:

```svelte
{#snippet recipeTable(col: any[], visLabel: string, showOwner = false, showOwnerActions = false)}
  {#if col.length > 0}
    <div class="table-wrapper">
      <table class="recipe-table">
        <thead>
          <tr>
            <th class="col-name">Name</th>
            {#if showOwner}<th class="col-owner">User</th>{/if}
            <th class="col-date">Updated</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          {#each col as recipe (recipe.id)}
            {@render recipeRow(recipe, visLabel, showOwner, showOwnerActions)}
          {/each}
        </tbody>
      </table>
    </div>
    <!-- Mobile cards -->
    <div class="mobile-cards">
      {#each col as recipe (recipe.id)}
        <div class="mobile-card">
          <div class="mobile-card-top">
            <a href="/recipe/{recipe.slug}" class="mobile-card-name">{recipe.name}</a>
            <span class="mobile-card-date">{formatDate(recipe.updated_at)}</span>
          </div>
          {#if showOwner}
            <div class="mobile-card-owner">
              {#if recipe.owner_avatar_url}
                <img src={recipe.owner_avatar_url} alt="" class="owner-avatar" crossorigin="anonymous" />
              {:else}
                <span class="owner-avatar owner-avatar-placeholder">{(recipe.owner_display_name ?? '?')[0].toUpperCase()}</span>
              {/if}
              <span class="owner-name">{recipe.owner_display_name ?? 'Unknown'}</span>
            </div>
          {/if}
          <div class="mobile-card-models">
            {#each recipe.models as m}
              <div class="mobile-model-row">
                <span class="mobile-model-id">{m.hf_model_id}</span>
                <span class="dtype-chip" data-dtype={m.data_type}>{m.data_type}</span>
              </div>
            {/each}
          </div>
          <div class="mobile-card-actions">
            <button class="action-btn action-run" onclick={() => runRecipe(recipe)}>Run</button>
            <button class="action-btn action-share" onclick={() => copyShareLink(recipe)}>
              {copyFeedback === recipe.id ? '✓' : 'Link'}
            </button>
            {#if showOwnerActions && data.userId === recipe.owner_id}
              <button class="action-btn action-vis" onclick={() => toggleVisibility(recipe)}>{visLabel}</button>
              <a href="/recipe/{recipe.slug}/edit" class="action-btn action-edit">Edit</a>
              <button class="action-btn action-delete" onclick={() => handleDelete(recipe)}>Del</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
{/snippet}
```

- [ ] **Step 3: Replace the page body HTML**

Replace the entire content inside `<div class="recipe-page">` (from `<header>` through the closing `</div>`) with:

```svelte
<div class="recipe-page">
  <header class="page-header">
    <div class="page-header-text">
      <h1>Recipes</h1>
      <p>Saved model combinations for quick re-runs.</p>
    </div>
    <div class="page-header-actions">
      <input
        type="search"
        class="search-input"
        placeholder="Search recipes…"
        bind:value={searchQuery}
        aria-label="Search recipes"
      />
      <a href="/recipe/new" class="btn-new-recipe">New Recipe</a>
    </div>
  </header>

  <nav class="tabs">
    <button class="tab" class:active={activeTab === 'featured'} onclick={() => setTab('featured')}>
      Featured <span class="tab-count">{featuredRecipes.length}</span>
    </button>
    <button class="tab" class:active={activeTab === 'community'} onclick={() => setTab('community')}>
      Community <span class="tab-count">{communityRecipes.length}</span>
    </button>
    <button class="tab" class:active={activeTab === 'mine'} onclick={() => setTab('mine')}>
      Mine <span class="tab-count">{mineRecipes.length}</span>
    </button>
  </nav>

  {#if data.error}
    <div class="error-banner">
      <p>Failed to load recipes: {data.error}</p>
    </div>
  {:else}
    <section class="tab-content">
      {#if activeTab === 'featured'}
        {#if featuredRecipes.length === 0}
          <div class="empty"><p>No featured recipes yet.</p></div>
        {:else}
          {@render recipeTable(filterBySearch(featuredRecipes), '→ Personal', true, false)}
        {/if}

      {:else if activeTab === 'community'}
        {#if communityRecipes.length === 0}
          <div class="empty"><p>No community recipes yet.</p></div>
        {:else}
          {@render recipeTable(filterBySearch(communityRecipes), '→ Personal', true, false)}
        {/if}

      {:else if activeTab === 'mine'}
        {#if mineRecipes.length === 0}
          <div class="empty">
            <p>No recipes yet. Browse models and save them as a recipe from the Cart panel.</p>
          </div>
        {:else}
          {@render recipeTable(filterBySearch(mineRecipes), '→ Public', false, true)}
        {/if}
      {/if}
    </section>
  {/if}
</div>
```

- [ ] **Step 4: Replace CSS — remove two-col, add tabs and search styles**

Remove the `.two-col` rule and its `@media (max-width: 900px)` override (they no longer exist in the HTML). Then add the following CSS rules after `.recipe-section` (or at the end of the style block, before closing `</style>`):

Remove this block:
```css
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }
```

And remove:
```css
  @media (max-width: 900px) {
    .two-col {
      grid-template-columns: 1fr;
    }
  }
```

Also remove `.recipe-section` and `.section-header` and `.section-title` and `.section-public` and `.section-personal` and `.count-badge` rules (these were for the old Public/Personal section headers — they're replaced by tabs).

Add these new rules:

```css
  .page-header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .search-input {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: 8px var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    width: 200px;
    transition: border-color var(--transition-base);
  }

  .search-input:focus-visible {
    border-color: var(--color-focus-ring);
    outline: none;
  }

  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--color-border);
    margin-bottom: var(--space-3);
  }

  .tab {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-2) var(--space-3);
    border: none;
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: color var(--transition-base), border-color var(--transition-base);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tab:hover {
    color: var(--color-text-primary);
  }

  .tab.active {
    color: var(--color-text-primary);
    border-bottom-color: var(--color-primary);
  }

  .tab-count {
    font-size: 11px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 9px;
    background: var(--color-surface-sunken);
    color: var(--color-text-muted);
  }

  .tab.active .tab-count {
    background: var(--color-primary);
    color: var(--color-text-on-primary);
  }

  .tab-content {
    min-height: 200px;
  }
```

- [ ] **Step 5: Fix mobile media query — remove two-col reference**

In the `@media (max-width: 768px)` block, there is no `.two-col` to remove (already removed above). Verify `page-header` responsive styles handle the new `.page-header-actions` wrapper. Replace the existing mobile page-header rule:

Find:
```css
  @media (max-width: 768px) {
    .page-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .btn-new-recipe {
      width: 100%;
      text-align: center;
    }
```

Replace with:
```css
  @media (max-width: 768px) {
    .page-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .page-header-actions {
      width: 100%;
      flex-direction: column;
    }

    .search-input {
      width: 100%;
    }

    .btn-new-recipe {
      width: 100%;
      text-align: center;
    }
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Manual smoke test**

```bash
npm run dev
```

Check:
- [ ] Page loads on Featured tab by default
- [ ] Tab counts show correct numbers
- [ ] Clicking Community / Mine switches content
- [ ] URL hash updates on tab switch
- [ ] Search filters names within active tab only
- [ ] Search clears when switching tabs
- [ ] Mine tab shows Edit / Del / visibility toggle; Featured and Community do not
- [ ] Existing Run / Link buttons work on all tabs

---

## Task 5: Admin subnav — add Recipes link

**Files:**
- Modify: `src/routes/admin/+layout.svelte`

- [ ] **Step 1: Add Recipes link to subnav**

Find the admin subnav links. After the Models link, add:

```svelte
<a href="/admin/recipes" class="subnav-item" class:active={$page.url.pathname === '/admin/recipes'}>
  Recipes
</a>
```

The full subnav should look like:

```svelte
<nav class="admin-subnav">
  <a href="/admin/users" class="subnav-item" class:active={$page.url.pathname === '/admin/users'}>
    Users
  </a>
  <a href="/admin/orgs" class="subnav-item" class:active={$page.url.pathname === '/admin/orgs'}>
    Orgs
  </a>
  <a href="/admin/models" class="subnav-item" class:active={$page.url.pathname === '/admin/models'}>
    Models
  </a>
  <a href="/admin/recipes" class="subnav-item" class:active={$page.url.pathname === '/admin/recipes'}>
    Recipes
  </a>
  <a href="/admin/export" class="subnav-export subnav-item" download>
    Export SQL
  </a>
</nav>
```

---

## Task 6: Admin recipes server

**Files:**
- Create: `src/routes/admin/recipes/+page.server.ts`

- [ ] **Step 1: Create the file**

Create `src/routes/admin/recipes/+page.server.ts`:

```typescript
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

function requireAdmin(session: any) {
  if (!session) throw redirect(303, '/');
  if (session.user.app_metadata?.role !== 'admin') throw error(403, 'Admin access required');
}

export const load: PageServerLoad = async ({ locals }) => {
  const session = await locals.getSession();
  requireAdmin(session);

  const { data, error: dbError } = await (locals.supabase.from('recipes') as any)
    .select('*, profiles!owner_id(display_name, email, avatar_url)')
    .eq('visibility', 'public')
    .order('featured_order', { ascending: true, nullsFirst: false });

  if (dbError) throw error(500, dbError.message);

  const recipes = (data ?? []).map((r: any) => ({
    ...r,
    owner_display_name: r.profiles?.display_name || r.profiles?.email?.split('@')[0] || null,
    owner_avatar_url: r.profiles?.avatar_url ?? null,
    profiles: undefined,
  }));

  return { recipes };
};

export const actions: Actions = {
  featureRecipe: async ({ request, locals }) => {
    const session = await locals.getSession();
    requireAdmin(session);

    const formData = await request.formData();
    const id = formData.get('id') as string;
    if (!id) return { success: false, error: 'Missing id' };

    // Append to end: max(featured_order) + 10
    const { data: maxRow } = await (locals.supabase.from('recipes') as any)
      .select('featured_order')
      .eq('featured', true)
      .order('featured_order', { ascending: false, nullsFirst: false })
      .limit(1)
      .single();

    const nextOrder = ((maxRow?.featured_order as number | null) ?? 0) + 10;

    const { error: dbError } = await (locals.supabase.from('recipes') as any)
      .update({ featured: true, featured_order: nextOrder })
      .eq('id', id);

    if (dbError) return { success: false, error: dbError.message };
    return { success: true };
  },

  unfeatureRecipe: async ({ request, locals }) => {
    const session = await locals.getSession();
    requireAdmin(session);

    const formData = await request.formData();
    const id = formData.get('id') as string;
    if (!id) return { success: false, error: 'Missing id' };

    const { error: dbError } = await (locals.supabase.from('recipes') as any)
      .update({ featured: false, featured_order: null })
      .eq('id', id);

    if (dbError) return { success: false, error: dbError.message };
    return { success: true };
  },

  updateOrder: async ({ request, locals }) => {
    const session = await locals.getSession();
    requireAdmin(session);

    const formData = await request.formData();
    const id = formData.get('id') as string;
    const orderRaw = formData.get('order') as string;
    const order = parseInt(orderRaw, 10);

    if (!id || isNaN(order) || order < 1) return { success: false, error: 'Invalid input' };

    const { error: dbError } = await (locals.supabase.from('recipes') as any)
      .update({ featured_order: order })
      .eq('id', id);

    if (dbError) return { success: false, error: dbError.message };
    return { success: true };
  },
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

---

## Task 7: Admin recipes UI

**Files:**
- Create: `src/routes/admin/recipes/+page.svelte`

- [ ] **Step 1: Create the file**

Create `src/routes/admin/recipes/+page.svelte`:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';

  let { data, form } = $props<{ data: any; form: any }>();

  let featuredList = $state([...data.recipes.filter((r: any) => r.featured)]
    .sort((a: any, b: any) => {
      const ao = a.featured_order ?? Infinity;
      const bo = b.featured_order ?? Infinity;
      if (ao !== bo) return ao - bo;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    })
  );

  let unfeaturedList = $state([...data.recipes.filter((r: any) => !r.featured)]);

  let communitySearch = $state('');

  const filteredUnfeatured = $derived(
    communitySearch.trim()
      ? unfeaturedList.filter((r: any) => r.name.toLowerCase().includes(communitySearch.toLowerCase()))
      : unfeaturedList
  );

  // Optimistic: move recipe from unfeatured to featured on feature action
  function onFeature(id: string) {
    const recipe = unfeaturedList.find((r: any) => r.id === id);
    if (!recipe) return;
    const maxOrder = featuredList.reduce((m: number, r: any) => Math.max(m, r.featured_order ?? 0), 0);
    const updated = { ...recipe, featured: true, featured_order: maxOrder + 10 };
    featuredList = [...featuredList, updated].sort((a: any, b: any) => {
      const ao = a.featured_order ?? Infinity;
      const bo = b.featured_order ?? Infinity;
      return ao !== bo ? ao - bo : new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    unfeaturedList = unfeaturedList.filter((r: any) => r.id !== id);
  }

  // Optimistic: move recipe from featured to unfeatured on unfeature action
  function onUnfeature(id: string) {
    const recipe = featuredList.find((r: any) => r.id === id);
    if (!recipe) return;
    featuredList = featuredList.filter((r: any) => r.id !== id);
    unfeaturedList = [{ ...recipe, featured: false, featured_order: null }, ...unfeaturedList];
  }

  // Optimistic: update order in featuredList
  function onUpdateOrder(id: string, order: number) {
    featuredList = featuredList.map((r: any) => r.id === id ? { ...r, featured_order: order } : r)
      .sort((a: any, b: any) => {
        const ao = a.featured_order ?? Infinity;
        const bo = b.featured_order ?? Infinity;
        return ao !== bo ? ao - bo : new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
</script>

<div class="admin-recipes">
  <h1>Recipe Curation</h1>

  {#if form?.error}
    <p class="form-error">{form.error}</p>
  {/if}

  <!-- Featured section -->
  <section class="curation-section">
    <h2>Featured <span class="count-badge">{featuredList.length}</span></h2>
    {#if featuredList.length === 0}
      <p class="empty">No featured recipes. Feature some from the list below.</p>
    {:else}
      <table class="curation-table">
        <thead>
          <tr>
            <th class="col-order">Order</th>
            <th class="col-name">Name</th>
            <th class="col-owner">Owner</th>
            <th class="col-date">Updated</th>
            <th class="col-action"></th>
          </tr>
        </thead>
        <tbody>
          {#each featuredList as recipe (recipe.id)}
            <tr>
              <td class="cell-order">
                <form
                  method="POST"
                  action="?/updateOrder"
                  use:enhance={() => {
                    return async ({ result, update }) => {
                      await update({ reset: false });
                    };
                  }}
                >
                  <input type="hidden" name="id" value={recipe.id} />
                  <input
                    type="number"
                    name="order"
                    class="order-input"
                    min="1"
                    value={recipe.featured_order ?? ''}
                    onchange={(e) => {
                      const val = parseInt((e.target as HTMLInputElement).value, 10);
                      if (!isNaN(val) && val >= 1) {
                        onUpdateOrder(recipe.id, val);
                        (e.target as HTMLInputElement).form?.requestSubmit();
                      }
                    }}
                  />
                </form>
              </td>
              <td class="cell-name">
                <a href="/recipe/{recipe.slug}" class="name-link">{recipe.name}</a>
              </td>
              <td class="cell-owner">{recipe.owner_display_name ?? '—'}</td>
              <td class="cell-date">{formatDate(recipe.updated_at)}</td>
              <td class="cell-action">
                <form method="POST" action="?/unfeatureRecipe" use:enhance={() => {
                  return async ({ update }) => {
                    onUnfeature(recipe.id);
                    await update({ reset: false });
                  };
                }}>
                  <input type="hidden" name="id" value={recipe.id} />
                  <button type="submit" class="action-btn action-unfeature">Unfeature</button>
                </form>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <!-- Community (unfeatured public) section -->
  <section class="curation-section">
    <h2>Community <span class="count-badge">{unfeaturedList.length}</span></h2>
    <input
      type="search"
      class="search-input"
      placeholder="Search community recipes…"
      bind:value={communitySearch}
      aria-label="Search community recipes"
    />
    {#if filteredUnfeatured.length === 0}
      <p class="empty">{communitySearch ? 'No matches.' : 'All public recipes are featured.'}</p>
    {:else}
      <table class="curation-table">
        <thead>
          <tr>
            <th class="col-name">Name</th>
            <th class="col-owner">Owner</th>
            <th class="col-date">Updated</th>
            <th class="col-action"></th>
          </tr>
        </thead>
        <tbody>
          {#each filteredUnfeatured as recipe (recipe.id)}
            <tr>
              <td class="cell-name">
                <a href="/recipe/{recipe.slug}" class="name-link">{recipe.name}</a>
              </td>
              <td class="cell-owner">{recipe.owner_display_name ?? '—'}</td>
              <td class="cell-date">{formatDate(recipe.updated_at)}</td>
              <td class="cell-action">
                <form method="POST" action="?/featureRecipe" use:enhance={() => {
                  return async ({ update }) => {
                    onFeature(recipe.id);
                    await update({ reset: false });
                  };
                }}>
                  <input type="hidden" name="id" value={recipe.id} />
                  <button type="submit" class="action-btn action-feature">Feature</button>
                </form>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
</div>

<style>
  .admin-recipes {
    max-width: 800px;
  }

  h1 {
    font-size: var(--text-xl);
    font-weight: 600;
    margin: 0 0 var(--space-4);
    color: var(--color-text-primary);
  }

  .curation-section {
    margin-bottom: var(--space-5);
  }

  h2 {
    font-size: var(--text-base);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-2);
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    font-size: 11px;
    font-weight: 600;
    font-family: var(--font-mono);
    letter-spacing: 0;
    text-transform: none;
  }

  .search-input {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: 6px var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    width: 280px;
    margin-bottom: var(--space-2);
    transition: border-color var(--transition-base);
  }

  .search-input:focus-visible {
    border-color: var(--color-focus-ring);
    outline: none;
  }

  .curation-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
  }

  .curation-table th {
    text-align: left;
    padding: var(--space-1);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--color-border-strong);
    white-space: nowrap;
  }

  .curation-table td {
    padding: var(--space-1);
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
  }

  .curation-table tbody tr:hover td {
    background: var(--color-surface-sunken);
  }

  .col-order  { width: 80px; }
  .col-name   { width: auto; }
  .col-owner  { width: 140px; }
  .col-date   { width: 110px; }
  .col-action { width: 100px; text-align: right; }

  .order-input {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    width: 60px;
    padding: 2px 6px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-primary);
    text-align: center;
  }

  .order-input:focus-visible {
    border-color: var(--color-focus-ring);
    outline: none;
  }

  .cell-name {
    min-width: 0;
    overflow: hidden;
  }

  .name-link {
    font-weight: 500;
    color: var(--color-text-primary);
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
  }

  .name-link:hover { color: var(--color-primary); }

  .cell-owner {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cell-date {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .cell-action {
    text-align: right;
  }

  .action-btn {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    line-height: 1.4;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: none;
    cursor: pointer;
    white-space: nowrap;
    transition: color var(--transition-base), border-color var(--transition-base);
  }

  .action-feature {
    color: var(--color-primary);
    border-color: var(--color-primary);
  }

  .action-feature:hover {
    background: var(--color-accent-light);
  }

  .action-unfeature {
    color: var(--color-text-secondary);
  }

  .action-unfeature:hover {
    color: var(--color-error);
    border-color: var(--color-error);
  }

  .empty {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .form-error {
    font-size: var(--text-sm);
    color: var(--color-error);
    margin-bottom: var(--space-2);
  }
</style>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Manual smoke test (as admin user)**

```bash
npm run dev
```

Check:
- [ ] `/admin/recipes` loads (admin user only — non-admin redirects to `/`)
- [ ] "Recipes" link appears in admin subnav
- [ ] Community section shows all unfeatured public recipes
- [ ] Clicking Feature moves recipe to Featured section optimistically
- [ ] Clicking Unfeature moves recipe back to Community optimistically
- [ ] Editing the order number and pressing Enter updates the order and re-sorts the list
- [ ] On `/recipe`, Featured tab shows featured recipes in correct order

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|-------------|------|
| `featured` + `featured_order` columns + index + RLS | Task 1 |
| `Recipe` type updated | Task 2 |
| Server returns new fields | Task 3 (via `*` select — automatic) |
| Three tabs: Featured / Community / Mine | Task 4 |
| Search left of New Recipe, client-side per tab, clears on switch | Task 4 |
| URL hash preserves tab | Task 4 |
| Visibility toggle only in Mine tab | Task 4 |
| Admin subnav — Recipes link | Task 5 |
| Admin server — load, featureRecipe, unfeatureRecipe, updateOrder | Task 6 |
| Admin UI — featured list with editable order, community list with Feature button | Task 7 |
| Admin-only auth check server-side | Task 6 (`requireAdmin`) |
| `featureRecipe` appends at max+10 | Task 6 |
| `updateOrder` accepts any positive integer | Task 6 |
| Optimistic UI updates | Task 7 |

All requirements covered. No placeholders. Types consistent: `featured: boolean`, `featured_order: number | null` used throughout Tasks 2–7.
