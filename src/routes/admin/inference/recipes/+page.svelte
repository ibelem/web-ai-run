<script lang="ts">
  import { enhance } from '$app/forms';

  let { data, form } = $props<{ data: any; form: any }>();

  // svelte-ignore state_referenced_locally
  let featuredList = $state([...data.recipes.filter((r: any) => r.featured)]
    .sort((a: any, b: any) => {
      const ao = a.featured_order ?? Infinity;
      const bo = b.featured_order ?? Infinity;
      if (ao !== bo) return ao - bo;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    })
  );

  // svelte-ignore state_referenced_locally
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
                <a href="/inference/recipe/{recipe.slug}" class="name-link">{recipe.name}</a>
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
    <h2>Community <span class="count-badge">{filteredUnfeatured.length}</span></h2>
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
                <a href="/inference/recipe/{recipe.slug}" class="name-link">{recipe.name}</a>
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
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--color-text-muted);
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
    padding: 0px var(--space-1);
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
    width: 60px;
    padding: 2px 6px !important;
    height: auto !important;
    border-radius: var(--radius-sm);
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
    min-width: 80px;
    text-align: center;
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