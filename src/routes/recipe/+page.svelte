<script lang="ts">
  import { deleteRecipe, updateRecipe } from '$lib/recipes/crud';
  import type { Recipe } from '$lib/recipes/crud';

  let { data } = $props();

  function runRecipe(recipe: Recipe) {
    try {
      sessionStorage.setItem('hf_ext_models', JSON.stringify(
        recipe.models.map((m) => ({
          hf_model_id: m.hf_model_id,
          file_path: m.file_path,
          data_type: m.data_type,
          runtime: (m.file_path.endsWith('.tflite') || m.file_path.endsWith('.litertlm')) ? 'litert' : 'onnx',
        }))
      ));
    } catch {}
    window.location.href = '/run';
  }

  async function handleDelete(recipe: Recipe) {
    if (!confirm(`Delete "${recipe.name}"?`)) return;
    await deleteRecipe(recipe.id);
    data.recipes = data.recipes.filter((r) => r.id !== recipe.id);
  }

  async function toggleVisibility(recipe: Recipe) {
    const next = recipe.visibility === 'public' ? 'personal' : 'public';
    await updateRecipe(recipe.id, { visibility: next });
    data.recipes = data.recipes.map((r) =>
      r.id === recipe.id ? { ...r, visibility: next } : r
    );
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  let copyFeedback = $state<string | null>(null);

  async function copyShareLink(recipe: Recipe) {
    const url = `${window.location.origin}/recipe/${recipe.slug}`;
    await navigator.clipboard.writeText(url);
    copyFeedback = recipe.id;
    setTimeout(() => { copyFeedback = null; }, 2000);
  }

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
</script>

{#snippet recipeRow(recipe: any, visLabel: string, showOwner = false, showOwnerActions = false)}
  <tr class="recipe-row">
    <td class="cell-name">
      <a href="/recipe/{recipe.slug}" class="name-link" title={recipe.name}>{recipe.name}</a>
      <div class="model-popup">
        {#each recipe.models as m}
          <div class="popup-row">
            <span class="popup-repo">{m.hf_model_id}</span>
            <span class="popup-file">{m.file_path}</span>
            <span class="dtype-chip" data-dtype={m.data_type}>{m.data_type}</span>
          </div>
        {/each}
      </div>
    </td>
    {#if showOwner}
      <td class="cell-owner">
        {#if recipe.owner_avatar_url}
          <img src={recipe.owner_avatar_url} alt="" class="owner-avatar" crossorigin="anonymous" />
        {:else}
          <span class="owner-avatar owner-avatar-placeholder">{(recipe.owner_display_name ?? '?')[0].toUpperCase()}</span>
        {/if}
        <span class="owner-name">{recipe.owner_display_name ?? 'Unknown'}</span>
      </td>
    {/if}
    <td class="cell-date">{formatDate(recipe.updated_at)}</td>
    <td class="cell-actions">
      <span class="cell-actions-inner">
        <button class="action-btn action-run" onclick={() => runRecipe(recipe)}>Run</button>
        <button class="action-btn action-share" onclick={() => copyShareLink(recipe)}>
          {copyFeedback === recipe.id ? '✓' : 'Link'}
        </button>
        {#if showOwnerActions && data.userId === recipe.owner_id}
          <button class="action-btn action-vis" onclick={() => toggleVisibility(recipe)}>{visLabel}</button>
          <a href="/recipe/{recipe.slug}/edit" class="action-btn action-edit">Edit</a>
          <button class="action-btn action-delete" onclick={() => handleDelete(recipe)}>Del</button>
        {/if}
      </span>
    </td>
  </tr>
{/snippet}

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
      <a href="/recipe/import" class="btn-import-recipe">Import</a>
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


<style>
  .recipe-page {
    max-width: 100%;
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

  .btn-new-recipe {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: 10px 20px;
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-primary);
    text-decoration: none;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background var(--transition-base);
  }

  .btn-new-recipe:hover {
    background: var(--color-accent-light);
  }

  .btn-import-recipe {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: 10px 20px;
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

  .error-banner {
    padding: var(--space-2);
    border-radius: var(--radius-base);
  }

  .empty p {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .table-wrapper {
    overflow: visible;
  }

  .recipe-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    table-layout: fixed;
  }

  .recipe-table th {
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

  .recipe-table td {
    padding: var(--space-1);
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
    white-space: nowrap;
    overflow: hidden;
  }

  /* Name fills remaining space; others are fixed */
  .col-name    { width: auto; }
  .col-owner   { width: 120px; }
  .col-date    { width: 90px; }
  .col-actions { width: 290px; }

  /* Name cell — relative so popup anchors to it */
  .cell-name {
    position: relative;
    overflow: visible !important;
  }

  .name-link {
    display: block;
    font-weight: 500;
    color: var(--color-text-primary);
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color var(--transition-base);
  }

  .name-link:hover {
    color: var(--color-primary);
  }

  /* Hover popup */
  .model-popup {
    display: none;
    position: absolute;
    top: calc(100% + 0px);
    left: 0;
    z-index: var(--z-dropdown);
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-base);
    border-top-left-radius: 0;
    border-top-right-radius: 0;
    box-shadow: var(--shadow-dropdown);
    padding: var(--space-1) var(--space-2);
    width: calc(100% + 120px + 90px + 290px);
    pointer-events: none;
  }

  .recipe-row:hover .model-popup {
    display: block;
  }

  .popup-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: 3px 0;
    border-bottom: 1px solid var(--color-border);
  }

  .popup-row:last-child {
    border-bottom: none;
  }

  .popup-repo {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 300px;
    flex-shrink: 0;
  }

  .popup-file {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }

  .dtype-chip {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    border: 1px solid;
    line-height: 1.4;
    white-space: nowrap;
    display: inline-block;
    vertical-align: middle;
    margin-right: 2px;
  }

  .dtype-chip[data-dtype="fp32"]      { color: var(--color-dt-fp32);      border-color: var(--color-dt-fp32); }
  .dtype-chip[data-dtype="fp16"]      { color: var(--color-dt-fp16);      border-color: var(--color-dt-fp16); }
  .dtype-chip[data-dtype="bf16"]      { color: var(--color-dt-bf16);      border-color: var(--color-dt-bf16); }
  .dtype-chip[data-dtype="fp8"]       { color: var(--color-dt-fp8);       border-color: var(--color-dt-fp8); }
  .dtype-chip[data-dtype="int8"]      { color: var(--color-dt-int8);      border-color: var(--color-dt-int8); }
  .dtype-chip[data-dtype="uint8"]     { color: var(--color-dt-uint8);     border-color: var(--color-dt-uint8); }
  .dtype-chip[data-dtype="int4"]      { color: var(--color-dt-int4);      border-color: var(--color-dt-int4); }
  .dtype-chip[data-dtype="uint4"]     { color: var(--color-dt-uint4);     border-color: var(--color-dt-uint4); }
  .dtype-chip[data-dtype="q4"]        { color: var(--color-dt-q4);        border-color: var(--color-dt-q4); }
  .dtype-chip[data-dtype="q4f16"]     { color: var(--color-dt-q4f16);     border-color: var(--color-dt-q4f16); }
  .dtype-chip[data-dtype="bnb4"]      { color: var(--color-dt-bnb4);      border-color: var(--color-dt-bnb4); }
  .dtype-chip[data-dtype="quantized"] { color: var(--color-dt-quantized); border-color: var(--color-dt-quantized); }

  .cell-owner {
    vertical-align: middle;
  }

  .owner-avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    vertical-align: middle;
    flex-shrink: 0;
  }

  .owner-avatar-placeholder {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface-sunken);
    border: 1px solid var(--color-border);
    font-size: 10px;
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .cell-owner {
    display: table-cell;
  }

  .cell-owner > .owner-avatar,
  .cell-owner > .owner-name {
    display: inline;
    vertical-align: middle;
  }

  .owner-name {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-left: 5px;
  }

  .cell-date {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .cell-actions {
    vertical-align: middle;
    text-align: center;
  }

  .cell-actions-inner {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    vertical-align: middle;
    white-space: nowrap;
  }

  .action-btn {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    padding: 1px 6px;
    line-height: 1.4;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    text-decoration: none;
    white-space: nowrap;
    display: inline-block;
    vertical-align: middle;
    transition: color var(--transition-base), border-color var(--transition-base), background var(--transition-base);
  }

  .action-run    { width: 34px;  text-align: center; border-color: var(--color-primary); color: var(--color-primary); }
  .action-share  { width: 40px;  text-align: center; }
  .action-vis    { width: 96px;  text-align: center; }
  .action-edit   { width: 40px;  text-align: center; }
  .action-delete { width: 34px;  text-align: center; }

  .action-run:hover {
    background: var(--color-primary);
    color: var(--color-text-on-primary);
  }

  .action-share:hover,
  .action-edit:hover,
  .action-vis:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .action-delete:hover {
    border-color: var(--color-error);
    color: var(--color-error);
  }

  .recipe-table tbody tr:hover td {
    background: var(--color-surface-sunken);
  }

  .mobile-cards {
    display: none;
  }

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

    .table-wrapper {
      display: none;
    }

    .mobile-cards {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .mobile-card {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-base);
      padding: var(--space-2);
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .mobile-card-top {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-1);
    }

    .mobile-card-name {
      font-size: var(--text-sm);
      font-weight: 500;
      color: var(--color-text-primary);
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }

    .mobile-card-name:hover {
      color: var(--color-primary);
    }

    .mobile-card-date {
      font-size: var(--text-xs);
      color: var(--color-text-muted);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .mobile-card-owner {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .mobile-card-models {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .mobile-model-row {
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }

    .mobile-model-id {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
    }

    .mobile-card-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding-top: var(--space-1);
      border-top: 1px solid var(--color-border);
    }
  }

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
</style>
