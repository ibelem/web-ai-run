<script lang="ts">
  import { deleteRecipe, updateRecipe } from '$lib/recipes/crud';
  import type { Recipe } from '$lib/recipes/crud';

  let { data } = $props();

  // svelte-ignore state_referenced_locally
  let recipes = $state<Recipe[]>(data.recipes);
  $effect(() => { recipes = data.recipes; });

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
    window.location.href = '/inference/run';
  }

  async function handleDelete(recipe: Recipe) {
    if (!confirm(`Delete "${recipe.name}"?`)) return;
    await deleteRecipe(recipe.id);
    recipes = recipes.filter((r) => r.id !== recipe.id);
  }

  async function toggleVisibility(recipe: Recipe) {
    const next = recipe.visibility === 'public' ? 'personal' : 'public';
    await updateRecipe(recipe.id, { visibility: next });
    recipes = recipes.map((r) =>
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
    recipes
      .filter((r: any) => r.visibility === 'public' && r.featured)
      .sort((a: any, b: any) => {
        const ao = a.featured_order ?? Infinity;
        const bo = b.featured_order ?? Infinity;
        if (ao !== bo) return ao - bo;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      })
  );

  const communityRecipes = $derived(
    recipes
      .filter((r: any) => r.visibility === 'public' && !r.featured)
      .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  );

  const mineRecipes = $derived(
    recipes
      .filter((r: any) => r.owner_id === data.userId)
      .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  );

  function filterBySearch(recipes: any[]): any[] {
    if (!searchQuery.trim()) return recipes;
    const q = searchQuery.toLowerCase();
    return recipes.filter(r => r.name.toLowerCase().includes(q));
  }

  const filteredFeatured = $derived(filterBySearch(featuredRecipes));
  const filteredCommunity = $derived(filterBySearch(communityRecipes));
  const filteredMine = $derived(filterBySearch(mineRecipes));
</script>

{#snippet recipeCard(recipe: any, visLabel: string, showOwner = false, showOwnerActions = false)}
  <div class="recipe-card">
    <div class="card-top">
      <a href="/inference/recipe/{recipe.slug}" class="card-name" title={recipe.name}>
        <span class="card-name-text">{recipe.name}</span>
        <span class="card-count">{(recipe.models ?? []).length}</span>
      </a>
      <span class="card-date">{formatDate(recipe.updated_at)}</span>
    </div>
    {#if showOwner}
      {@const formats = [...new Set(recipe.models.map((m: any) => m.file_path.endsWith('.tflite') ? 'tflite' : m.file_path.endsWith('.litertlm') ? 'litertlm' : m.file_path.endsWith('.task') ? 'task' : 'onnx'))]}
      <div class="card-owner">
        <div class="card-owner-left">
          {#if recipe.owner_avatar_url}
            <img src={recipe.owner_avatar_url} alt="" class="owner-avatar" crossorigin="anonymous" />
          {:else}
            <span class="owner-avatar owner-avatar-placeholder">{(recipe.owner_display_name ?? '?')[0].toUpperCase()}</span>
          {/if}
          <span class="owner-name">{recipe.owner_display_name ?? 'Unknown'}</span>
        </div>
        <div class="card-formats">
          {#each formats as fmt}
            {#if fmt === 'onnx'}
              <img src="/icons/onnx-icon.svg" width="14" height="14" alt="onnx" title="ONNX" class="fmt-badge" />
            {:else if fmt === 'tflite'}
              <img src="/icons/litert-icon.svg" width="14" height="14" alt="tflite" title="TFLite / LiteRT" class="fmt-badge" />
            {:else if fmt === 'litertlm'}
              <img src="/icons/litertlm-icon.svg" width="14" height="14" alt="litertlm" title="LiteRT LM" class="fmt-badge" />
            {/if}
          {/each}
        </div>
      </div>
    {/if}
    <div class="card-models">
      {#each recipe.models as m}
        <div class="card-model-row">
          <div class="card-model-info">
            <span class="card-model-id">{m.hf_model_id}</span>
            <span class="card-model-file">{m.file_path}</span>
          </div>
          <span class="dtype-chip" data-dtype={m.data_type}>{m.data_type}</span>
        </div>
      {/each}
    </div>
    <div class="card-actions">
      <button class="action-btn action-run" onclick={() => runRecipe(recipe)}>Run</button>
      <button class="action-btn action-share" onclick={() => copyShareLink(recipe)}>
        {copyFeedback === recipe.id ? '✓' : 'Link'}
      </button>
      {#if showOwnerActions && data.userId === recipe.owner_id}
        <button class="action-btn action-vis" onclick={() => toggleVisibility(recipe)}>{recipe.visibility === 'public' ? '→ Personal' : '→ Public'}</button>
        <a href="/inference/recipe/{recipe.slug}/edit" class="action-btn action-edit">Edit</a>
        <button class="action-btn action-delete" onclick={() => handleDelete(recipe)}>Delete</button>
      {/if}
    </div>
  </div>
{/snippet}

{#snippet recipeGrid(col: any[], visLabel: string, showOwner = false, showOwnerActions = false)}
  {#if col.length > 0}
    <div class="recipe-grid">
      {#each col as recipe (recipe.id)}
        {@render recipeCard(recipe, visLabel, showOwner, showOwnerActions)}
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
      <a href="/inference/recipe/import" class="btn-import-recipe">Import</a>
      <a href="/inference/recipe/new" class="btn-new-recipe">New Recipe</a>
    </div>
  </header>

  <div class="tabs-row">
    <nav class="tabs">
      <button class="tab" class:active={activeTab === 'featured'} onclick={() => setTab('featured')}>
        Featured <span class="tab-count">{filteredFeatured.length}</span>
      </button>
      <button class="tab" class:active={activeTab === 'community'} onclick={() => setTab('community')}>
        Community <span class="tab-count">{filteredCommunity.length}</span>
      </button>
      <button class="tab" class:active={activeTab === 'mine'} onclick={() => setTab('mine')}>
        Mine <span class="tab-count">{filteredMine.length}</span>
      </button>
    </nav>
    <input
      type="search"
      class="search-input"
      placeholder="Search recipes…"
      bind:value={searchQuery}
      aria-label="Search recipes"
    />
  </div>

  {#if data.error}
    <div class="error-banner">
      <p>Failed to load recipes: {data.error}</p>
    </div>
  {:else}
    <section class="tab-content">
      {#if activeTab === 'featured'}
        {#if filteredFeatured.length === 0}
          <div class="empty"><p>{featuredRecipes.length === 0 ? 'No featured recipes yet.' : 'No recipes match your search.'}</p></div>
        {:else}
          {@render recipeGrid(filteredFeatured, '→ Personal', true, false)}
        {/if}

      {:else if activeTab === 'community'}
        {#if filteredCommunity.length === 0}
          <div class="empty"><p>{communityRecipes.length === 0 ? 'No community recipes yet.' : 'No recipes match your search.'}</p></div>
        {:else}
          {@render recipeGrid(filteredCommunity, '→ Personal', true, false)}
        {/if}

      {:else if activeTab === 'mine'}
        {#if filteredMine.length === 0}
          <div class="empty">
            <p>{mineRecipes.length === 0 ? 'No recipes yet. Browse models and save them as a recipe from the Cart panel.' : 'No recipes match your search.'}</p>
          </div>
        {:else}
          {@render recipeGrid(filteredMine, '→ Public', false, true)}
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

  .page-header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .btn-new-recipe {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
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

  .error-banner {
    padding: var(--space-2);
    border-radius: var(--radius-base);
  }

  .empty p {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  /* ── Tabs row ─────────────────────────────────────────── */

  .tabs-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-2);
    border-bottom: 1px solid var(--color-border);
    margin-bottom: var(--space-3);
  }

  .search-input {
    width: 200px;
    flex-shrink: 0;
    margin-bottom: 6px;
  }

  .search-input:focus-visible {
    border-color: var(--color-focus-ring);
    outline: none;
  }

  .tabs {
    display: flex;
    gap: 0;
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

  /* ── Recipe grid ──────────────────────────────────────── */

  .recipe-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
  }

  @media (max-width: 1100px) {
    .recipe-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .recipe-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    padding: var(--space-2);
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    background: var(--color-surface);
    transition: border-color var(--transition-base);
  }

  .recipe-card:hover {
    border-color: var(--color-border-strong);
  }

  .card-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-1);
    min-width: 0;
  }

  .card-name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-primary);
    text-decoration: none;
    min-width: 0;
    flex: 1;
    overflow: hidden;
    transition: color var(--transition-base);
  }

  .card-name-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .card-name:hover {
    color: var(--color-primary);
  }

  .card-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--color-surface-sunken);
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .card-date {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .card-owner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 5px;
  }

  .card-owner-left {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    overflow: hidden;
  }

  .card-formats {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .fmt-badge {
    display: block;
    opacity: 0.75;
  }

  .owner-avatar {
    width: 18px;
    height: 18px;
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

  .owner-name {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-models {
    display: flex;
    flex-direction: column;
    gap: 3px;
    /* ~3 rows: each row is roughly 20px line-height + 3px gap */
    max-height: calc(3 * 20px + 2 * 3px);
    padding-right: 5px;
    overflow-y: auto;
    scroll-behavior: smooth;
  }

  .card-models::-webkit-scrollbar {
    width: 1px;
    height: 3px;
  }

  .card-models::-webkit-scrollbar-button {
    width: 0;
    height: 0;
    display: none;
  }

  .card-models::-webkit-scrollbar-track {
    background: transparent;
  }

  .card-models::-webkit-scrollbar-thumb {
    background-color: var(--color-border-strong);
    border-radius: 3px;
  }

  .recipe-card:hover .card-models::-webkit-scrollbar-thumb {
    background-color: var(--color-primary);
  }
 

  .card-model-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
  }

  .card-model-info {
    flex: 1;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    overflow: hidden;
  }

  .card-model-id {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .card-model-file {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  /* dtype-chip uses global styles from app.css */

  .card-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: auto;
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    text-align: center;
    transition: color var(--transition-base), border-color var(--transition-base), background var(--transition-base);
  }

  .action-run    { border-color: var(--color-primary); background: var(--color-primary); color: var(--color-text-on-primary); }
  .action-share  {}
  .action-vis    {}
  .action-edit   {}
  .action-delete {}

  .action-run:hover {
    background: var(--color-primary-hover);
    border-color: var(--color-primary-hover);
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

  /* ── Mobile ───────────────────────────────────────────── */

  @media (max-width: 768px) {
    .page-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .page-header-actions {
      width: 100%;
      flex-direction: column;
    }

    .btn-import-recipe,
    .btn-new-recipe {
      width: 100%;
      text-align: center;
    }

    .tabs-row {
      flex-direction: column;
      align-items: stretch;
      border-bottom: none;
    }

    .tabs {
      border-bottom: 1px solid var(--color-border);
    }

    .search-input {
      width: 100%;
      margin-bottom: 0;
      margin-top: var(--space-1);
    }

    .recipe-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
