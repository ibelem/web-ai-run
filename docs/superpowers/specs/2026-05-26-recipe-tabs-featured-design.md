# Recipe Page: Tabs + Featured Curation — Design Spec

## Overview

Redesign the `/recipe` page from a two-section (Public/Personal) layout to a three-tab interface: **Featured / Community / Mine**. Add admin-only recipe curation via a new `/admin/recipes` panel where admins can mark public recipes as Featured and set their display order by typing a number directly.

---

## Tabs

All tabs require login. The whole `/recipe` page stays auth-gated (existing behaviour). Shared recipe links (`/recipe/[slug]`) work as before — user must log in first.

| Tab | Content | Default sort |
|-----|---------|--------------|
| **Featured** | `visibility='public' AND featured=true` | `featured_order ASC NULLS LAST`, then `updated_at DESC` for ties |
| **Community** | `visibility='public' AND featured=false` | `updated_at DESC` |
| **Mine** | `owner_id = userId` (personal + own public) | `updated_at DESC` |

- **Default tab on load:** Featured
- **URL hash:** `#featured`, `#community`, `#mine` — preserves active tab on navigation/share
- The underlying `visibility` value stays `'public'` — "Community" is a display label only

---

## Search

- Text input in the page header, **left of "New Recipe"** button
- Filters by recipe `name` client-side within the active tab only
- Clears when switching tabs
- No server round-trip — all recipes already loaded in one query

---

## Data Model

New migration `020_recipes_featured.sql`:

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

- `featured_order` is a nullable integer. Ties in order sort by `updated_at DESC`.
- Gap-friendly: values like `1, 1, 2, 100` are valid. No repacking needed.
- Unfeaturing a recipe sets `featured=false` and clears `featured_order` to `null`.

---

## Recipe Page (`/recipe`)

### Server load

Single query (same as today): `owner_id = userId OR visibility = 'public'`, joined with `profiles` for owner avatar/name. Client splits into three derived lists.

New fields returned per recipe: `featured`, `featured_order`.

### Client tab logic

```
featuredRecipes  = recipes where visibility='public' AND featured=true
                   sorted by featured_order ASC NULLS LAST, then updated_at DESC
communityRecipes = recipes where visibility='public' AND featured=false
                   sorted by updated_at DESC
mineRecipes      = recipes where owner_id = userId
                   sorted by updated_at DESC
```

### Layout changes

- Replace the current `Public / Personal` section headers with three tab buttons: `Featured (N)`, `Community (N)`, `Mine (N)`
- Search input added to page header left of "New Recipe"
- Table structure inside each tab is unchanged (Name, User, Updated, actions)
- The `splitTwo()` two-column layout is removed — single full-width table per tab
- `→ Personal` / `→ Public` visibility toggle buttons remain in the Mine tab for own recipes

---

## Admin Panel (`/admin/recipes`)

New page at `/admin/recipes`. Accessible only to `role = 'admin'` (server-side check, redirects to `/` otherwise).

### Layout

Two sections:

**1. Featured recipes** — ordered list of all `featured=true` public recipes

| Order | Name | Owner | Actions |
|-------|------|-------|---------|
| `[  1]` | WebNN Developer Preview | Vulcan AI | Unfeature |
| `[  1]` | Hello-China | Belem Zhang | Unfeature |
| `[100]` | Low priority recipe | … | Unfeature |

- Order field is an inline `<input type="number" min="1">`, clicking makes it editable
- Blur or Enter saves — fires `updateOrder` action
- Rows sorted by `featured_order ASC NULLS LAST`, `updated_at DESC`

**2. All public recipes** — full list of `visibility='public'` recipes not yet featured

- Search input to filter by name
- Each row has a **Feature** button
- After featuring, row moves to section 1

### Server actions on `/admin/recipes`

All actions verify `role = 'admin'` server-side before executing.

| Action | What it does |
|--------|-------------|
| `featureRecipe(id)` | Sets `featured=true`, sets `featured_order = max(featured_order) + 10` (appends to end) |
| `unfeatureRecipe(id)` | Sets `featured=false`, clears `featured_order = null` |
| `updateOrder(id, order)` | Sets `featured_order` to the submitted integer (any positive integer accepted) |

### RLS note

The existing `"Owners can update own recipes"` RLS policy only allows owners to update their own rows. The new `"Admins can feature recipes"` policy allows admins to update `featured` and `featured_order` on any row. Since both policies exist, an admin who is also an owner benefits from either.

---

## Files Changed / Created

| File | Action |
|------|--------|
| `supabase/migrations/020_recipes_featured.sql` | Create — adds `featured`, `featured_order`, index, admin RLS policy |
| `src/routes/recipe/+page.server.ts` | Modify — return `featured`, `featured_order` fields |
| `src/routes/recipe/+page.svelte` | Modify — tabs, search, remove splitTwo |
| `src/lib/recipes/crud.ts` | Modify — add `featured`, `featured_order` to `Recipe` type |
| `src/routes/admin/recipes/+page.server.ts` | Create — load + featureRecipe/unfeatureRecipe/updateOrder actions |
| `src/routes/admin/recipes/+page.svelte` | Create — admin curation UI |

---

## Out of Scope

- Drag-and-drop reordering (order field covers this)
- Public/unauthenticated access to recipe page
- Per-tab pagination (client-side filtering is sufficient for current scale)
