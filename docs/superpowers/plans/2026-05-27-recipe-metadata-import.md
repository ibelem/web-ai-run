# Recipe Metadata Fields + Import Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `description` and `links` fields to recipes (editable in the edit form, displayed on the detail page), and create a `/recipe/import` page where users can upload `.json`, `.csv`, or `.md` files to create new recipes or merge models into existing ones.

**Architecture:** A new DB migration adds two nullable columns. The `Recipe` type and `updateRecipe()` are extended. The edit form gains a Metadata section with a textarea and dynamic link rows. The detail page renders these fields below the models list. A new `/recipe/import` page handles client-side file parsing, mode selection (create vs merge), and two SvelteKit form actions. All file parsing is done in the browser with no external libraries.

**Tech Stack:** SvelteKit 5 (Svelte runes: `$state`, `$derived`, `$props`), Supabase (Postgres + RLS), TypeScript. No new npm packages.

---

## File Map

| File | Action |
|------|--------|
| `supabase/migrations/021_recipe_metadata.sql` | Create |
| `src/lib/recipes/crud.ts` | Modify — `Recipe` type + `updateRecipe` signature |
| `src/routes/recipe/[slug]/edit/+page.svelte` | Modify — add Description + Links metadata section |
| `src/routes/recipe/[slug]/+page.svelte` | Modify — render description + links |
| `src/routes/recipe/+page.svelte` | Modify — add Import button in header |
| `src/routes/recipe/import/+page.server.ts` | Create — load + createRecipe + mergeRecipe actions |
| `src/routes/recipe/import/+page.svelte` | Create — full import UI |
| `static/templates/recipe-import.json` | Create |
| `static/templates/recipe-import.csv` | Create |
| `static/templates/recipe-import.md` | Create |

---

## Task 1: DB migration

**Files:**
- Create: `supabase/migrations/021_recipe_metadata.sql`

- [ ] **Step 1: Create the migration file**

```sql
alter table public.recipes
  add column description text,
  add column links jsonb not null default '[]';
```

- [ ] **Step 2: Apply the migration**

Apply via Supabase dashboard SQL editor or CLI:
```bash
supabase db push
```

- [ ] **Step 3: Verify columns exist**

In Supabase dashboard → Table editor → recipes, confirm `description` (text, nullable) and `links` (jsonb, default `[]`) are present.

---

## Task 2: Extend Recipe type and updateRecipe

**Files:**
- Modify: `src/lib/recipes/crud.ts`

- [ ] **Step 1: Update the Recipe interface**

Find the `Recipe` interface (lines 4–15) and add two fields after `featured_order`:

```typescript
export interface Recipe {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  visibility: 'personal' | 'public';
  featured: boolean;
  featured_order: number | null;
  description: string | null;
  links: { label?: string; url: string }[];
  models: RecipeModel[];
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Update the updateRecipe signature**

Find the `updateRecipe` function and update the `updates` parameter type:

```typescript
export async function updateRecipe(
  id: string,
  updates: {
    name?: string;
    models?: RecipeModel[];
    visibility?: 'personal' | 'public';
    description?: string | null;
    links?: { label?: string; url: string }[];
  }
): Promise<Recipe> {
  const supabase = createClient();
  const { data, error } = await (supabase.from('recipes') as any)
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as Recipe;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

---

## Task 3: Create template static files

**Files:**
- Create: `static/templates/recipe-import.json`
- Create: `static/templates/recipe-import.csv`
- Create: `static/templates/recipe-import.md`

- [ ] **Step 1: Create JSON template**

Create `static/templates/recipe-import.json`:
```json
[
  { "hf_model_id": "microsoft/phi-2", "file_path": "phi-2-q4.gguf", "data_type": "int4" },
  { "hf_model_id": "google/gemma-2b", "file_path": "gemma-2b-fp16.gguf", "data_type": "fp16" }
]
```

- [ ] **Step 2: Create CSV template**

Create `static/templates/recipe-import.csv`:
```
hf_model_id,file_path,data_type
microsoft/phi-2,phi-2-q4.gguf,int4
google/gemma-2b,gemma-2b-fp16.gguf,fp16
```

- [ ] **Step 3: Create Markdown template**

Create `static/templates/recipe-import.md`:
```
| hf_model_id | file_path | data_type |
|---|---|---|
| microsoft/phi-2 | phi-2-q4.gguf | int4 |
| google/gemma-2b | gemma-2b-fp16.gguf | fp16 |
```

---

## Task 4: Edit form — add Description + Links metadata section

**Files:**
- Modify: `src/routes/recipe/[slug]/edit/+page.svelte`

Note: `+page.server.ts` does NOT need changes — it already uses `select('*')` which will include the new columns automatically.

- [ ] **Step 1: Add description and links state variables**

In the `<script>` block, after `let recipeModels = $state<RecipeModel[]>([...data.recipe.models]);`, add:

```typescript
type LinkRow = { label: string; url: string };

let description = $state(data.recipe.description ?? '');
let links = $state<LinkRow[]>(
  data.recipe.links?.length
    ? data.recipe.links.map((l: any) => ({ label: l.label ?? '', url: l.url }))
    : [{ label: '', url: '' }]
);

function addLink() {
  if (links.length < 10) links = [...links, { label: '', url: '' }];
}

function removeLink(i: number) {
  links = links.filter((_, idx) => idx !== i);
  if (links.length === 0) links = [{ label: '', url: '' }];
}
```

- [ ] **Step 2: Update the $effect sync block**

The existing `$effect` syncs form state when navigating between recipes in the sidebar. Replace the entire `$effect` block with:

```typescript
$effect(() => {
  recipeName = data.recipe.name;
  visibility = data.recipe.visibility;
  description = data.recipe.description ?? '';
  links = data.recipe.links?.length
    ? data.recipe.links.map((l: any) => ({ label: l.label ?? '', url: l.url }))
    : [{ label: '', url: '' }];
  recipeModels = [...data.recipe.models];
  hfSearchQuery = '';
  hfModels = [];
  errorMessage = '';
});
```

- [ ] **Step 3: Update isDirty to include description and links**

Replace the `isDirty` derived value:

```typescript
const isDirty = $derived(() => {
  if (recipeName !== data.recipe.name) return true;
  if (visibility !== data.recipe.visibility) return true;
  if (description.trim() !== (data.recipe.description?.trim() ?? '')) return true;
  const effectiveLinks = links
    .filter(l => l.url.trim())
    .map(l => ({ ...(l.label ? { label: l.label } : {}), url: l.url }));
  if (JSON.stringify(effectiveLinks) !== JSON.stringify(data.recipe.links ?? [])) return true;
  if (recipeModels.length !== data.recipe.models.length) return true;
  return recipeModels.some((m, i) => {
    const orig = data.recipe.models[i];
    return !orig || m.hf_model_id !== orig.hf_model_id || m.file_path !== orig.file_path;
  });
});
```

- [ ] **Step 4: Update handleSave to pass description and links**

In `handleSave`, update the `updateRecipe` call:

```typescript
await updateRecipe(data.recipe.id, {
  name: recipeName.trim(),
  models: recipeModels,
  visibility,
  description: description.trim() || null,
  links: links
    .filter(l => l.url.trim())
    .map(l => ({ ...(l.label ? { label: l.label } : {}), url: l.url })),
});
```

- [ ] **Step 5: Add the Metadata section to the HTML**

After the closing `</section>` of the "Add models from Hugging Face" zone (around line 258) and before the `{#if errorMessage}` block, insert:

```svelte
  <!-- Metadata section -->
  <section class="zone">
    <div class="zone-label">Metadata</div>

    <label class="meta-label" for="recipe-description">Description</label>
    <textarea
      id="recipe-description"
      class="meta-textarea"
      rows="3"
      placeholder="Describe what this recipe does…"
      bind:value={description}
    ></textarea>

    <div class="links-label-row">
      <span class="meta-label">Links</span>
      <button
        type="button"
        class="btn-add-link"
        onclick={addLink}
        disabled={links.length >= 10}
      >+ Add link</button>
    </div>

    <div class="links-list">
      {#each links as link, i (i)}
        <div class="link-row">
          <input
            type="text"
            class="link-label-input"
            placeholder="Label (optional)"
            bind:value={link.label}
          />
          <input
            type="url"
            class="link-url-input"
            placeholder="https://…"
            bind:value={link.url}
          />
          <button
            type="button"
            class="remove-btn"
            onclick={() => removeLink(i)}
            aria-label="Remove link"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      {/each}
    </div>
  </section>
```

- [ ] **Step 6: Add CSS for the metadata section**

At the end of the `<style>` block, before `</style>`, add:

```css
  .meta-label {
    display: block;
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-muted);
    margin-bottom: 4px;
  }

  .meta-textarea {
    width: 100%;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    resize: vertical;
    transition: border-color var(--transition-base);
    box-sizing: border-box;
  }

  .meta-textarea:focus-visible {
    border-color: var(--color-focus-ring);
    outline: none;
  }

  .links-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .btn-add-link {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 2px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: border-color var(--transition-base), color var(--transition-base);
  }

  .btn-add-link:hover:not(:disabled) {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .btn-add-link:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .links-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .link-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .link-label-input {
    width: 130px;
    flex-shrink: 0;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: 5px var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    transition: border-color var(--transition-base);
  }

  .link-label-input:focus-visible {
    border-color: var(--color-focus-ring);
    outline: none;
  }

  .link-url-input {
    flex: 1;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: 5px var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    min-width: 0;
    transition: border-color var(--transition-base);
  }

  .link-url-input:focus-visible {
    border-color: var(--color-focus-ring);
    outline: none;
  }
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

---

## Task 5: Recipe detail page — display description and links

**Files:**
- Modify: `src/routes/recipe/[slug]/+page.svelte`

- [ ] **Step 1: Add description + links block to HTML**

In the HTML, after the `<div class="models-section">` closing `</div>` (around line 111) and before `{#if data.isOwner}`, insert:

```svelte
  {#if data.recipe.description || (data.recipe.links && data.recipe.links.length > 0)}
    <div class="meta-section">
      {#if data.recipe.description}
        <p class="recipe-description">{data.recipe.description}</p>
      {/if}
      {#if data.recipe.links && data.recipe.links.length > 0}
        <div class="recipe-links">
          {#each data.recipe.links as link}
            <a
              href={link.url}
              class="recipe-link"
              target="_blank"
              rel="noopener noreferrer"
            >{link.label || link.url}</a>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
```

- [ ] **Step 2: Add CSS for the meta section**

At the end of the `<style>` block, before `</style>`, add:

```css
  .meta-section {
    margin-bottom: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .recipe-description {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    line-height: 1.6;
    margin: 0;
    white-space: pre-wrap;
  }

  .recipe-links {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .recipe-link {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: var(--color-primary);
    text-decoration: none;
    padding: 2px 8px;
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-sm);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 240px;
    transition: background var(--transition-base);
  }

  .recipe-link:hover {
    background: var(--color-accent-light);
  }
```

---

## Task 6: Recipe list page — add Import button

**Files:**
- Modify: `src/routes/recipe/+page.svelte`

- [ ] **Step 1: Add Import button in page header**

Find the `<div class="page-header-actions">` block in the HTML. It currently contains a search input and a "New Recipe" link. Add the Import link between the search input and the New Recipe link:

Find:
```svelte
      <a href="/recipe/new" class="btn-new-recipe">New Recipe</a>
```

Replace with:
```svelte
      <a href="/recipe/import" class="btn-import-recipe">Import</a>
      <a href="/recipe/new" class="btn-new-recipe">New Recipe</a>
```

- [ ] **Step 2: Add CSS for the Import button**

In the `<style>` block, after the `.btn-new-recipe` rule block, add:

```css
  .btn-import-recipe {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-secondary);
    text-decoration: none;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background var(--transition-base), border-color var(--transition-base), color var(--transition-base);
  }

  .btn-import-recipe:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
```

- [ ] **Step 3: Update the mobile media query for page-header-actions**

In the `@media (max-width: 768px)` block, the existing `.page-header-actions { width: 100%; flex-direction: column; }` rule already handles it. Add the import button to the full-width rule in the same media block (it's already covered by `flex-direction: column` — no change needed). Verify the Import button looks correct on mobile by checking the responsive styles are sufficient.

---

## Task 7: Import page server

**Files:**
- Create: `src/routes/recipe/import/+page.server.ts`

- [ ] **Step 1: Create the file**

Create `src/routes/recipe/import/+page.server.ts`:

```typescript
import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { RecipeModel } from '$lib/supabase/types';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export const load: PageServerLoad = async ({ locals }) => {
  const session = await locals.getSession();
  if (!session) throw redirect(302, '/login');

  const { data, error: dbError } = await (locals.supabase.from('recipes') as any)
    .select('id, name, slug, models')
    .eq('owner_id', session.user.id)
    .order('updated_at', { ascending: false });

  if (dbError) throw error(500, dbError.message);

  return {
    myRecipes: ((data as any[]) ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      modelCount: (r.models as any[]).length,
    })),
  };
};

export const actions: Actions = {
  createRecipe: async ({ request, locals }) => {
    const session = await locals.getSession();
    if (!session) throw redirect(302, '/login');

    const formData = await request.formData();
    const name = (formData.get('name') as string | null)?.trim();
    if (!name) return fail(400, { error: 'Recipe name is required.' });

    const visibility = (formData.get('visibility') as string) === 'public' ? 'public' : 'personal';
    const description = (formData.get('description') as string | null)?.trim() || null;

    let links: { label?: string; url: string }[] = [];
    try {
      links = JSON.parse((formData.get('links') as string) || '[]');
    } catch {
      links = [];
    }

    let models: RecipeModel[] = [];
    try {
      models = JSON.parse((formData.get('models') as string) || '[]');
    } catch {
      return fail(400, { error: 'Invalid models data.' });
    }

    for (const m of models) {
      if (!m.hf_model_id || !m.file_path || !m.data_type) {
        return fail(400, { error: 'Each model must have hf_model_id, file_path, and data_type.' });
      }
    }

    if (models.length === 0) return fail(400, { error: 'At least one model is required.' });

    const slug = `${slugify(name)}-${Date.now().toString(36)}`;

    const { data, error: dbError } = await (locals.supabase.from('recipes') as any)
      .insert({ owner_id: session.user.id, name, slug, visibility, models, description, links })
      .select('slug')
      .single();

    if (dbError) return fail(500, { error: dbError.message });

    throw redirect(302, `/recipe/${(data as any).slug}`);
  },

  mergeRecipe: async ({ request, locals }) => {
    const session = await locals.getSession();
    if (!session) throw redirect(302, '/login');

    const formData = await request.formData();
    const recipeId = formData.get('recipeId') as string | null;
    if (!recipeId) return fail(400, { error: 'No recipe selected.' });

    let newModels: RecipeModel[] = [];
    try {
      newModels = JSON.parse((formData.get('models') as string) || '[]');
    } catch {
      return fail(400, { error: 'Invalid models data.' });
    }

    if (newModels.length === 0) return fail(400, { error: 'At least one model is required.' });

    const { data: recipe, error: loadError } = await (locals.supabase.from('recipes') as any)
      .select('id, owner_id, slug, models')
      .eq('id', recipeId)
      .single();

    if (loadError || !recipe) return fail(404, { error: 'Recipe not found.' });
    if ((recipe as any).owner_id !== session.user.id) return fail(403, { error: 'Not your recipe.' });

    const existing: RecipeModel[] = (recipe as any).models ?? [];
    const toAdd: RecipeModel[] = [];
    let skipped = 0;

    for (const m of newModels) {
      const isDupe = existing.some(
        (e) => e.hf_model_id === m.hf_model_id && e.file_path === m.file_path && e.data_type === m.data_type
      );
      if (isDupe) {
        skipped++;
      } else {
        toAdd.push(m);
      }
    }

    if (toAdd.length > 0) {
      const { error: updateError } = await (locals.supabase.from('recipes') as any)
        .update({ models: [...existing, ...toAdd] })
        .eq('id', recipeId);

      if (updateError) return fail(500, { error: updateError.message });
    }

    return { success: true, added: toAdd.length, skipped, slug: (recipe as any).slug };
  },
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

---

## Task 8: Import page UI

**Files:**
- Create: `src/routes/recipe/import/+page.svelte`

- [ ] **Step 1: Create the file**

Create `src/routes/recipe/import/+page.svelte`:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { enhance } from '$app/forms';

  let { data, form } = $props<{ data: any; form: any }>();

  type ParsedModel = { hf_model_id: string; file_path: string; data_type: string };
  type LinkRow = { label: string; url: string };
  type Mode = 'create' | 'merge';

  // File parse state
  let parsedModels = $state<ParsedModel[]>([]);
  let parseError = $state('');
  let fileName = $state('');
  let isDragOver = $state(false);

  // Mode
  let mode = $state<Mode>('create');

  // Create new fields
  let recipeName = $state('');
  let visibility = $state<'personal' | 'public'>('personal');
  let description = $state('');
  let links = $state<LinkRow[]>([{ label: '', url: '' }]);

  // Merge field
  let selectedRecipeId = $state('');

  // Submit state
  let submitting = $state(false);
  let mergeResult = $state('');
  let formError = $state(form?.error ?? '');

  // Derived: a model row is invalid if any required field is missing
  const hasInvalidRows = $derived(parsedModels.some(m => !m.hf_model_id || !m.file_path || !m.data_type));
  const canSubmit = $derived(
    parsedModels.length > 0 &&
    !hasInvalidRows &&
    (mode === 'create' ? recipeName.trim().length > 0 : selectedRecipeId.length > 0)
  );

  // Serialized for hidden inputs
  const modelsJson = $derived(JSON.stringify(parsedModels));
  const linksJson = $derived(
    JSON.stringify(
      links
        .filter(l => l.url.trim())
        .map(l => ({ ...(l.label ? { label: l.label } : {}), url: l.url }))
    )
  );

  // CSV parser helpers
  function parseCsvRow(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  function parseJson(text: string): ParsedModel[] {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) throw new Error('JSON must be an array of model objects.');
    return arr.map((item: any) => ({
      hf_model_id: String(item.hf_model_id ?? ''),
      file_path: String(item.file_path ?? ''),
      data_type: String(item.data_type ?? ''),
    }));
  }

  function parseCsv(text: string): ParsedModel[] {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row.');
    const headers = parseCsvRow(lines[0]).map(h => h.toLowerCase());
    const idxId = headers.indexOf('hf_model_id');
    const idxPath = headers.indexOf('file_path');
    const idxDtype = headers.indexOf('data_type');
    if (idxId < 0 || idxPath < 0 || idxDtype < 0) {
      throw new Error('CSV must have columns: hf_model_id, file_path, data_type');
    }
    return lines.slice(1).map(line => {
      const cols = parseCsvRow(line);
      return {
        hf_model_id: cols[idxId] ?? '',
        file_path: cols[idxPath] ?? '',
        data_type: cols[idxDtype] ?? '',
      };
    });
  }

  function parseMd(text: string): ParsedModel[] {
    const lines = text.split('\n');
    const tableStart = lines.findIndex(l => l.trim().startsWith('|'));
    if (tableStart < 0) throw new Error('No markdown table found.');
    const tableLines = lines.slice(tableStart).filter(l => l.trim().startsWith('|'));
    if (tableLines.length < 3) throw new Error('Markdown table needs header row, separator row, and at least one data row.');
    const parseRow = (line: string) => line.split('|').slice(1, -1).map(c => c.trim());
    const headers = parseRow(tableLines[0]).map(h => h.toLowerCase());
    const idxId = headers.indexOf('hf_model_id');
    const idxPath = headers.indexOf('file_path');
    const idxDtype = headers.indexOf('data_type');
    if (idxId < 0 || idxPath < 0 || idxDtype < 0) {
      throw new Error('Markdown table must have columns: hf_model_id, file_path, data_type');
    }
    return tableLines.slice(2).map(line => {
      const cols = parseRow(line);
      return {
        hf_model_id: cols[idxId] ?? '',
        file_path: cols[idxPath] ?? '',
        data_type: cols[idxDtype] ?? '',
      };
    });
  }

  async function handleFile(file: File) {
    parseError = '';
    parsedModels = [];
    fileName = file.name;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['json', 'csv', 'md'].includes(ext ?? '')) {
      parseError = 'Unsupported file type. Use .json, .csv, or .md';
      return;
    }
    const text = await file.text();
    try {
      if (ext === 'json') parsedModels = parseJson(text);
      else if (ext === 'csv') parsedModels = parseCsv(text);
      else parsedModels = parseMd(text);
      if (parsedModels.length === 0) parseError = 'No models found in file.';
    } catch (e: any) {
      parseError = e.message ?? 'Failed to parse file.';
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file) handleFile(file);
  }

  function handleFileInput(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) handleFile(file);
    (e.target as HTMLInputElement).value = '';
  }

  function removeModel(i: number) {
    parsedModels = parsedModels.filter((_, idx) => idx !== i);
  }

  function addLink() {
    if (links.length < 10) links = [...links, { label: '', url: '' }];
  }

  function removeLink(i: number) {
    links = links.filter((_, idx) => idx !== i);
    if (links.length === 0) links = [{ label: '', url: '' }];
  }

  function switchMode(m: Mode) {
    mode = m;
    recipeName = '';
    visibility = 'personal';
    description = '';
    links = [{ label: '', url: '' }];
    selectedRecipeId = '';
    mergeResult = '';
    formError = '';
  }
</script>

<div class="import-page">
  <header class="page-header">
    <div class="page-header-text">
      <h1>Import Recipe</h1>
      <p>Upload a .json, .csv, or .md file to create or update a recipe.</p>
    </div>
    <a href="/recipe" class="btn-cancel">Cancel</a>
  </header>

  <!-- Upload zone -->
  <section class="zone">
    <div class="zone-label">Upload file</div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <label
      class="upload-zone"
      class:drag-over={isDragOver}
      ondragover={(e) => { e.preventDefault(); isDragOver = true; }}
      ondragleave={() => { isDragOver = false; }}
      ondrop={handleDrop}
    >
      <input
        type="file"
        accept=".json,.csv,.md"
        class="file-input-hidden"
        onchange={handleFileInput}
      />
      {#if fileName && !parseError}
        <span class="upload-filename">{fileName}</span>
        <span class="upload-hint">Click to replace</span>
      {:else}
        <span class="upload-icon">↑</span>
        <span class="upload-hint">Drag & drop or click to upload</span>
        <span class="upload-types">.json · .csv · .md</span>
      {/if}
    </label>

    {#if parseError}
      <p class="parse-error">{parseError}</p>
    {/if}

    <div class="template-links">
      <span class="template-label">Templates:</span>
      <a href="/templates/recipe-import.json" download class="template-link">JSON</a>
      <a href="/templates/recipe-import.csv" download class="template-link">CSV</a>
      <a href="/templates/recipe-import.md" download class="template-link">Markdown</a>
    </div>
  </section>

  <!-- Parsed models preview -->
  {#if parsedModels.length > 0}
    <section class="zone">
      <div class="zone-label">
        Parsed models
        <span class="count-badge">{parsedModels.length}</span>
        {#if hasInvalidRows}<span class="invalid-badge">Fix errors before importing</span>{/if}
      </div>
      <div class="preview-table-wrap">
        <table class="preview-table">
          <thead>
            <tr>
              <th>hf_model_id</th>
              <th>file_path</th>
              <th>data_type</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each parsedModels as m, i (i)}
              <tr class:row-invalid={!m.hf_model_id || !m.file_path || !m.data_type}>
                <td class="cell-mono">{m.hf_model_id || <span class="missing">missing</span>}</td>
                <td class="cell-mono">{m.file_path || <span class="missing">missing</span>}</td>
                <td class="cell-mono">{m.data_type || <span class="missing">missing</span>}</td>
                <td class="cell-remove">
                  <button class="remove-btn" onclick={() => removeModel(i)} aria-label="Remove row">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <!-- Mode toggle -->
    <div class="mode-toggle">
      <button
        class="mode-btn"
        class:active={mode === 'create'}
        onclick={() => switchMode('create')}
      >Create new recipe</button>
      <button
        class="mode-btn"
        class:active={mode === 'merge'}
        onclick={() => switchMode('merge')}
      >Add to existing recipe</button>
    </div>

    {#if formError}
      <p class="form-error">{formError}</p>
    {/if}

    {#if mergeResult}
      <p class="merge-result">{mergeResult}</p>
    {/if}

    <!-- Create new form -->
    {#if mode === 'create'}
      <form
        method="POST"
        action="?/createRecipe"
        use:enhance={() => {
          submitting = true;
          formError = '';
          return async ({ result, update }) => {
            submitting = false;
            if (result.type === 'failure') {
              formError = (result.data as any)?.error ?? 'Import failed.';
              return;
            }
            await update();
          };
        }}
      >
        <input type="hidden" name="models" value={modelsJson} />

        <section class="zone">
          <div class="zone-label">New recipe details</div>

          <div class="field-row">
            <label class="field-label" for="new-name">Name <span class="required">*</span></label>
            <input
              id="new-name"
              type="text"
              name="name"
              class="text-input"
              placeholder="Recipe name…"
              bind:value={recipeName}
              required
            />
          </div>

          <div class="field-row">
            <span class="field-label">Visibility</span>
            <div class="visibility-tabs">
              <button
                type="button"
                class="visibility-tab"
                class:active={visibility === 'personal'}
                onclick={() => { visibility = 'personal'; }}
              >Personal</button>
              <button
                type="button"
                class="visibility-tab"
                class:active={visibility === 'public'}
                onclick={() => { visibility = 'public'; }}
              >Public</button>
            </div>
            <input type="hidden" name="visibility" value={visibility} />
          </div>

          <div class="field-row">
            <label class="field-label" for="new-desc">Description</label>
            <textarea
              id="new-desc"
              name="description"
              class="meta-textarea"
              rows="3"
              placeholder="Describe what this recipe does…"
              bind:value={description}
            ></textarea>
          </div>

          <div class="field-row">
            <div class="links-label-row">
              <span class="field-label">Links</span>
              <button
                type="button"
                class="btn-add-link"
                onclick={addLink}
                disabled={links.length >= 10}
              >+ Add link</button>
            </div>
            <div class="links-list">
              {#each links as link, i (i)}
                <div class="link-row">
                  <input
                    type="text"
                    class="link-label-input"
                    placeholder="Label (optional)"
                    bind:value={link.label}
                  />
                  <input
                    type="url"
                    class="link-url-input"
                    placeholder="https://…"
                    bind:value={link.url}
                  />
                  <button
                    type="button"
                    class="remove-btn"
                    onclick={() => removeLink(i)}
                    aria-label="Remove link"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              {/each}
            </div>
            <input type="hidden" name="links" value={linksJson} />
          </div>
        </section>

        <div class="submit-row">
          <button type="submit" class="btn-import" disabled={!canSubmit || submitting}>
            {submitting ? 'Creating…' : 'Create Recipe'}
          </button>
        </div>
      </form>

    <!-- Merge into existing form -->
    {:else}
      <form
        method="POST"
        action="?/mergeRecipe"
        use:enhance={() => {
          submitting = true;
          formError = '';
          return async ({ result, update }) => {
            submitting = false;
            if (result.type === 'failure') {
              formError = (result.data as any)?.error ?? 'Import failed.';
              return;
            }
            if (result.type === 'success') {
              const d = result.data as any;
              mergeResult = `Added ${d.added} model${d.added !== 1 ? 's' : ''}, skipped ${d.skipped} duplicate${d.skipped !== 1 ? 's' : ''}.`;
              setTimeout(() => goto(`/recipe/${d.slug}`), 1500);
              return;
            }
            await update();
          };
        }}
      >
        <input type="hidden" name="models" value={modelsJson} />

        <section class="zone">
          <div class="zone-label">Select recipe to update</div>

          <div class="field-row">
            <label class="field-label" for="existing-recipe">Recipe <span class="required">*</span></label>
            {#if data.myRecipes.length === 0}
              <p class="no-recipes">You don't have any recipes yet. <a href="/recipe/new">Create one first.</a></p>
            {:else}
              <select
                id="existing-recipe"
                name="recipeId"
                class="recipe-select"
                bind:value={selectedRecipeId}
              >
                <option value="">— Choose a recipe —</option>
                {#each data.myRecipes as r (r.id)}
                  <option value={r.id}>{r.name} ({r.modelCount} model{r.modelCount !== 1 ? 's' : ''})</option>
                {/each}
              </select>
            {/if}
          </div>
        </section>

        <div class="submit-row">
          <button type="submit" class="btn-import" disabled={!canSubmit || submitting}>
            {submitting ? 'Merging…' : 'Add to Recipe'}
          </button>
        </div>
      </form>
    {/if}
  {/if}
</div>

<style>
  .import-page {
    max-width: 680px;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .page-header-text h1 {
    font-size: var(--text-xl);
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .page-header-text p {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 2px 0 0;
  }

  .btn-cancel {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-secondary);
    text-decoration: none;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background var(--transition-base);
  }

  .btn-cancel:hover {
    background: var(--color-surface-sunken);
  }

  .zone {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-3);
  }

  .zone-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--color-text-muted);
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
    letter-spacing: 0;
    text-transform: none;
  }

  .invalid-badge {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-error);
    text-transform: none;
    letter-spacing: 0;
  }

  /* Upload zone */
  .upload-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: var(--space-4) var(--space-2);
    border: 2px dashed var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface-sunken);
    cursor: pointer;
    transition: border-color var(--transition-base), background var(--transition-base);
    text-align: center;
  }

  .upload-zone:hover,
  .upload-zone.drag-over {
    border-color: var(--color-primary);
    background: var(--color-accent-light);
  }

  .file-input-hidden {
    display: none;
  }

  .upload-icon {
    font-size: 24px;
    color: var(--color-text-muted);
    line-height: 1;
  }

  .upload-hint {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .upload-types {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-family: var(--font-mono);
  }

  .upload-filename {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-primary);
    font-family: var(--font-mono);
  }

  .parse-error {
    font-size: var(--text-sm);
    color: var(--color-error);
    margin: 0;
  }

  .template-links {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-top: 4px;
  }

  .template-label {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .template-link {
    font-size: var(--text-xs);
    color: var(--color-primary);
    text-decoration: none;
    padding: 1px 6px;
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    transition: background var(--transition-base);
  }

  .template-link:hover {
    background: var(--color-accent-light);
  }

  /* Preview table */
  .preview-table-wrap {
    overflow-x: auto;
  }

  .preview-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
  }

  .preview-table th {
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

  .preview-table td {
    padding: var(--space-1);
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
  }

  .preview-table tr.row-invalid td {
    background: color-mix(in srgb, var(--color-error) 6%, transparent);
  }

  .cell-mono {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .missing {
    color: var(--color-error);
    font-style: italic;
  }

  .cell-remove {
    width: 32px;
    text-align: right;
  }

  .remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border: none;
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background var(--transition-base), color var(--transition-base);
  }

  .remove-btn:hover {
    background: var(--color-surface-sunken);
    color: var(--color-text-primary);
  }

  /* Mode toggle */
  .mode-toggle {
    display: flex;
    border-radius: var(--radius-base);
    overflow: hidden;
    margin-bottom: var(--space-3);
    width: fit-content;
  }

  .mode-btn {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    background: var(--color-surface-sunken);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background var(--transition-base), color var(--transition-base), border-color var(--transition-base);
  }

  .mode-btn + .mode-btn {
    border-left: none;
  }

  .mode-btn.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-text-on-primary);
  }

  /* Form fields */
  .field-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: var(--space-2);
  }

  .field-label {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .required {
    color: var(--color-error);
  }

  .text-input {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    transition: border-color var(--transition-base);
  }

  .text-input:focus-visible {
    border-color: var(--color-focus-ring);
    outline: none;
  }

  .visibility-tabs {
    display: flex;
    border-radius: var(--radius-base);
    overflow: hidden;
    width: fit-content;
  }

  .visibility-tab {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    background: var(--color-surface-sunken);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background var(--transition-base), color var(--transition-base), border-color var(--transition-base);
  }

  .visibility-tab + .visibility-tab {
    border-left: none;
  }

  .visibility-tab.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-text-on-primary);
  }

  .meta-textarea {
    width: 100%;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    resize: vertical;
    transition: border-color var(--transition-base);
    box-sizing: border-box;
  }

  .meta-textarea:focus-visible {
    border-color: var(--color-focus-ring);
    outline: none;
  }

  .links-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .btn-add-link {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 2px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: border-color var(--transition-base), color var(--transition-base);
  }

  .btn-add-link:hover:not(:disabled) {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .btn-add-link:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .links-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .link-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .link-label-input {
    width: 130px;
    flex-shrink: 0;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: 5px var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    transition: border-color var(--transition-base);
  }

  .link-label-input:focus-visible {
    border-color: var(--color-focus-ring);
    outline: none;
  }

  .link-url-input {
    flex: 1;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: 5px var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    min-width: 0;
    transition: border-color var(--transition-base);
  }

  .link-url-input:focus-visible {
    border-color: var(--color-focus-ring);
    outline: none;
  }

  /* Recipe select */
  .recipe-select {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    width: 100%;
    max-width: 400px;
    transition: border-color var(--transition-base);
  }

  .recipe-select:focus-visible {
    border-color: var(--color-focus-ring);
    outline: none;
  }

  .no-recipes {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 0;
  }

  .no-recipes a {
    color: var(--color-primary);
    text-decoration: none;
  }

  .no-recipes a:hover {
    text-decoration: underline;
  }

  /* Submit */
  .submit-row {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--space-2);
  }

  .btn-import {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: 10px 24px;
    border: none;
    border-radius: var(--radius-base);
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-import:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .btn-import:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Messages */
  .form-error {
    font-size: var(--text-sm);
    color: var(--color-error);
    margin: 0 0 var(--space-2);
  }

  .merge-result {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-2);
  }

  @media (max-width: 640px) {
    .page-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .btn-cancel {
      width: 100%;
      text-align: center;
    }

    .mode-toggle {
      width: 100%;
    }

    .mode-btn {
      flex: 1;
    }
  }
</style>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
```

Check:
- [ ] `/recipe/import` loads, shows upload zone and template download links
- [ ] Uploading a valid JSON file shows the parsed models table
- [ ] Invalid rows (missing fields) show red highlighting
- [ ] Removing a row updates the count badge
- [ ] "Create new recipe" mode shows name/visibility/description/links fields
- [ ] Import button is disabled until name is filled and file is parsed without errors
- [ ] "Add to existing recipe" mode shows the recipe dropdown
- [ ] Creating a new recipe redirects to the new recipe's detail page
- [ ] Merging shows "Added N models, skipped M duplicates" then redirects
- [ ] Template download links work (`.json`, `.csv`, `.md` files download)
- [ ] Import button appears in the recipe list header (left of New Recipe)
- [ ] Edit form shows Description textarea and Links rows for existing recipes
- [ ] Saving from edit form persists description and links
- [ ] Recipe detail page shows description and links when present

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|-------------|------|
| `description` + `links` DB columns | Task 1 |
| `Recipe` type extended | Task 2 |
| `updateRecipe` accepts new fields | Task 2 |
| Edit form — Description textarea (rows=3) | Task 4 |
| Edit form — dynamic Links rows, + Add link, × remove, max 10 | Task 4 |
| Edit form — links optional | Task 4 |
| `isDirty` includes new fields | Task 4 |
| `$effect` sync includes new fields | Task 4 |
| Detail page — description as `<p>` if non-empty | Task 5 |
| Detail page — links as `<a>` anchors, `target="_blank"` | Task 5 |
| Recipe list — Import button left of New Recipe | Task 6 |
| Template static files | Task 3 |
| Import page load — auth + user's recipes list | Task 7 |
| Import — `createRecipe` action (validate, insert, redirect) | Task 7 |
| Import — `mergeRecipe` action (dedup, update, return stats) | Task 7 |
| Import UI — file upload zone, drag-and-drop | Task 8 |
| Import UI — parse JSON/CSV/MD client-side | Task 8 |
| Import UI — preview table with flagged invalid rows | Task 8 |
| Import UI — row removal | Task 8 |
| Import UI — mode toggle (create / merge) | Task 8 |
| Import UI — create: name, visibility, description, links | Task 8 |
| Import UI — merge: recipe dropdown with model count | Task 8 |
| Import UI — Import button disabled logic | Task 8 |
| Import UI — merge result display + redirect | Task 8 |

All requirements covered. No placeholders. Types consistent across all tasks: `description: string | null`, `links: { label?: string; url: string }[]`, `LinkRow = { label: string; url: string }`.
