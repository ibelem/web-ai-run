# Recipe Metadata Fields + Import Page — Design Spec

## Overview

Two related enhancements to the recipe system:

1. **Metadata fields** — add `description` (text) and `links` (dynamic URL list with optional labels) to recipes. Editable by owners on the edit form, displayed on the recipe detail page.
2. **Import page** (`/recipe/import`) — upload `.json`, `.csv`, or `.md` files to create a new recipe or merge models into an existing recipe. Includes model deduplication and template downloads.

---

## Data Model

New migration `021_recipe_metadata.sql`:

```sql
alter table public.recipes
  add column description text,
  add column links jsonb not null default '[]';
```

- `description` — nullable text, free-form, no length limit enforced at DB level
- `links` — array of `{label?: string, url: string}` objects, defaults to `[]`

Both fields are covered by the existing `"Owners can update own recipes"` RLS policy. No new policies needed.

### Recipe type extension

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

`updateRecipe()` in `crud.ts` already accepts a `Partial<Recipe>` updates object — no signature change needed, just ensure `description` and `links` are included in the type.

---

## Edit Form (`/recipe/[slug]/edit`)

A new **Metadata** section is added below the models list.

### Description field

```
<textarea rows="3" placeholder="Describe what this recipe does…" />
```

Optional. Plain text. No markdown rendering.

### Links field

Dynamic list of URL rows. Each row:

```
[label input — optional, placeholder "Label"]  [url input — placeholder "https://…"]  [× remove]
```

- Starts with one empty row on load (populated from existing data if editing)
- `+ Add link` button appends a new empty row
- Max 10 links (client-side enforcement)
- URL validated as `https://` on blur — invalid URLs show inline error, but do not block save
- Label is optional — if blank, the URL itself is used as link text on the detail page
- All links are optional; an empty links list is valid

### Server action

The existing `default` action in `+page.server.ts` passes `description` and `links` (serialized from FormData) to `updateRecipe()`. `links` is serialized as JSON in a hidden field and parsed server-side.

---

## Recipe Detail Page (`/recipe/[slug]`)

Below the existing recipe header/model table, add:

- **Description** — rendered as a `<p>` block if non-null and non-empty. Plain text, no markdown.
- **Links** — rendered as a small list of `<a>` anchors with `target="_blank" rel="noopener noreferrer"`. Link text = label if present, otherwise the URL. Only rendered if `links.length > 0`.

The recipe list tabs (`/recipe`) are unchanged — description and links are detail-page content only.

---

## Import Page (`/recipe/import`)

New standalone page. Linked from the recipe list header with an "Import" button, left of "New Recipe".

### Layout (top to bottom)

1. **File upload zone** — drag-and-drop or click-to-browse. Accepts `.json`, `.csv`, `.md`. Parsing is entirely client-side (FileReader API). On parse error, an inline error message replaces the preview.

2. **Template downloads** — three small links below the upload zone: `Download JSON template`, `Download CSV template`, `Download Markdown template`. Each links to a static file in `static/templates/`.

3. **Parsed models preview** — shown after successful parse. Table with columns: `hf_model_id`, `file_path`, `data_type`. Rows missing any required field are flagged with a red outline. User can remove individual rows with an `×` button. Import is blocked if any flagged rows remain (user must remove them).

4. **Mode toggle** — `Create new recipe` / `Add to existing recipe` (two tab-style buttons). Default: `Create new`. Switching mode preserves the parsed model list but resets the form fields below.

5. **Create new recipe fields:**
   - Name (text input, required)
   - Visibility toggle: Personal / Public (default Personal)
   - Description (textarea, rows=3, optional)
   - Links (same dynamic `+` UI as edit form, optional)

6. **Add to existing recipe fields:**
   - Searchable dropdown of user's own recipes (all Mine recipes, showing name + current model count)
   - No other fields — description/links/visibility are not modified on merge

7. **Import button** — disabled until: file is parsed with no flagged rows AND (name is filled for new mode OR recipe is selected for merge mode).

### Server actions (`/recipe/import`)

**`createRecipe` action:**
- Validates name is non-empty
- Parses `models` JSON, `links` JSON from FormData
- Validates each model has `hf_model_id`, `file_path`, `data_type`
- Inserts new recipe row, redirects to `/recipe/[slug]`

**`mergeRecipe` action:**
- Validates target recipe ID and that the current user owns it
- Loads existing recipe models
- Deduplicates: a model is a duplicate if `hf_model_id` + `file_path` + `data_type` all match an existing model
- Merges non-duplicate models in, updates `updated_at`
- Returns `{ added: N, skipped: N }` for display, then redirects to `/recipe/[slug]`

Both actions require authentication (redirect to `/login` if no session).

---

## File Formats

All three formats encode one model per row. Required fields: `hf_model_id`, `file_path`, `data_type`.

### JSON (`recipe-import.json`)
```json
[
  { "hf_model_id": "microsoft/phi-2", "file_path": "phi-2-q4.gguf", "data_type": "int4" },
  { "hf_model_id": "google/gemma-2b", "file_path": "gemma-2b-fp16.gguf", "data_type": "fp16" }
]
```

### CSV (`recipe-import.csv`)
```csv
hf_model_id,file_path,data_type
microsoft/phi-2,phi-2-q4.gguf,int4
google/gemma-2b,gemma-2b-fp16.gguf,fp16
```

### Markdown (`recipe-import.md`)
```markdown
| hf_model_id | file_path | data_type |
|---|---|---|
| microsoft/phi-2 | phi-2-q4.gguf | int4 |
| google/gemma-2b | gemma-2b-fp16.gguf | fp16 |
```

The Markdown parser reads the first table found in the file. Header row is required. Column order does not matter — columns are matched by header name.

---

## Template Static Files

| File | Content |
|------|---------|
| `static/templates/recipe-import.json` | JSON template with 2 example rows |
| `static/templates/recipe-import.csv` | CSV template with 2 example rows |
| `static/templates/recipe-import.md` | Markdown table template with 2 example rows |

---

## Files Changed / Created

| File | Action |
|------|--------|
| `supabase/migrations/021_recipe_metadata.sql` | Create — adds `description`, `links` columns |
| `src/lib/recipes/crud.ts` | Modify — add `description`, `links` to `Recipe` type; include in `updateRecipe` |
| `src/routes/recipe/[slug]/edit/+page.svelte` | Modify — add Description + Links fields in Metadata section |
| `src/routes/recipe/[slug]/edit/+page.server.ts` | Modify — pass `description`, `links` through update action |
| `src/routes/recipe/[slug]/+page.svelte` | Modify — render description + links on detail page |
| `src/routes/recipe/import/+page.svelte` | Create — import UI (upload zone, preview, mode toggle, form) |
| `src/routes/recipe/import/+page.server.ts` | Create — `createRecipe` and `mergeRecipe` actions |
| `src/routes/recipe/+page.svelte` | Modify — add "Import" button in page header left of "New Recipe" |
| `static/templates/recipe-import.json` | Create — template download |
| `static/templates/recipe-import.csv` | Create — template download |
| `static/templates/recipe-import.md` | Create — template download |

---

## Out of Scope

- Markdown rendering for description (plain text only)
- Import from URL (file upload only)
- Bulk import of multiple recipes in one file
- Export recipe as file (separate feature)
- Description/links shown in the recipe list table or search results
