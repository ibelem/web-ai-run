<script lang="ts">
  import { goto } from '$app/navigation';
  import { get } from 'svelte/store';
  import ModelFilters from '$lib/components/ModelFilters.svelte';
  import ModelGrid from '$lib/components/ModelGrid.svelte';
  import { isAuthenticated, auth } from '$lib/stores/auth';
  import { createRecipe } from '$lib/recipes/crud';
  import type { RecipeModel } from '$lib/supabase/types';
  import type { ModelRow } from './+page.ts';

  let { data } = $props<{ data: { models: ModelRow[]; error: string | null; initialSearch: string } }>();

  let searchQuery = $state(data.initialSearch);
  let selectedRuntimes = $state<Set<string>>(new Set());
  let selectedOrgs = $state<Set<string>>(new Set());
  let selectedDataTypes = $state<Set<string>>(new Set());
  let selectedCategories = $state<Set<string>>(new Set());
  let selectedSizes = $state<Set<string>>(new Set());
  let selectedIds = $state<Set<string>>(new Set());
  let showSaveDialog = $state(false);
  let recipeName = $state('');
  let savingRecipe = $state(false);

  const SIZE_BUCKETS = [
    { key: 'lt1m',  test: (b: number) => b < 1_000_000 },
    { key: '1m',    test: (b: number) => b >= 1_000_000 && b < 5_000_000 },
    { key: '5m',    test: (b: number) => b >= 5_000_000 && b < 10_000_000 },
    { key: '10m',   test: (b: number) => b >= 10_000_000 && b < 20_000_000 },
    { key: '20m',   test: (b: number) => b >= 20_000_000 && b < 50_000_000 },
    { key: '50m',   test: (b: number) => b >= 50_000_000 && b < 100_000_000 },
    { key: '100m',  test: (b: number) => b >= 100_000_000 && b < 200_000_000 },
    { key: '200m',  test: (b: number) => b >= 200_000_000 && b < 500_000_000 },
    { key: '500m',  test: (b: number) => b >= 500_000_000 && b < 1_000_000_000 },
    { key: '1gb',   test: (b: number) => b >= 1_000_000_000 && b < 2_000_000_000 },
    { key: '2gb',   test: (b: number) => b >= 2_000_000_000 && b < 3_000_000_000 },
    { key: '3gb',   test: (b: number) => b >= 3_000_000_000 && b < 4_000_000_000 },
    { key: 'gt4gb', test: (b: number) => b >= 4_000_000_000 },
  ];

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  function runSelected() {
    const ids = [...selectedIds].join(',');
    window.location.href = `/run?models=${ids}`;
  }

  async function saveAsRecipe() {
    if (!recipeName.trim()) return;
    savingRecipe = true;
    const authState = get(auth);
    if (!authState.user) return;

    const models: RecipeModel[] = data.models
      .filter((m: ModelRow) => selectedIds.has(m.id))
      .map((m: ModelRow) => ({
        hf_model_id: m.hf_model_id,
        file_path: m.file_path,
        data_type: m.data_type,
        backends: ['wasm_1'],
      }));

    try {
      await createRecipe(authState.user.id, recipeName.trim(), models);
      showSaveDialog = false;
      recipeName = '';
      goto('/recipe');
    } finally {
      savingRecipe = false;
    }
  }

  const allModels: ModelRow[] = $derived(data.models);
  const runtimes = $derived([...new Set(allModels.map((m) => m.runtime))].sort());
  const orgs = $derived([...new Set(allModels.map((m) => m.source_org))].sort());
  const dataTypes = $derived([...new Set(allModels.map((m) => m.data_type))].sort());
  const categories = $derived(
    [...new Set(allModels.map((m) => m.category))].filter((c) => c !== 'uncategorized').sort()
  );

  const filteredModels = $derived(
    allModels.filter((m) => {
      if (selectedRuntimes.size > 0 && !selectedRuntimes.has(m.runtime)) return false;
      if (selectedOrgs.size > 0 && !selectedOrgs.has(m.source_org)) return false;
      if (selectedDataTypes.size > 0 && !selectedDataTypes.has(m.data_type)) return false;
      if (selectedCategories.size > 0 && !selectedCategories.has(m.category)) return false;
      if (selectedSizes.size > 0) {
        const bucket = SIZE_BUCKETS.find((b) => selectedSizes.has(b.key) && b.test(m.size_bytes));
        if (!bucket) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!m.hf_model_id.toLowerCase().includes(q) && !m.file_path.toLowerCase().includes(q)) return false;
      }
      return true;
    })
  );

  function handleFilter(filters: {
    runtimes: Set<string>;
    orgs: Set<string>;
    dataTypes: Set<string>;
    categories: Set<string>;
    sizes: Set<string>;
    search: string;
  }) {
    selectedRuntimes = filters.runtimes;
    selectedOrgs = filters.orgs;
    selectedDataTypes = filters.dataTypes;
    selectedCategories = filters.categories;
    selectedSizes = filters.sizes;
    searchQuery = filters.search;
  }
</script>

<div class="model-page">
  <header class="page-header">
    <div class="header-row">
      <div>
        <h1>Model Browser</h1>
        <p>Select models to benchmark. All models are sourced from HuggingFace.</p>
      </div>
      {#if selectedIds.size > 0}
        <div class="header-actions">
          {#if $isAuthenticated}
            <button class="btn-save" onclick={() => showSaveDialog = true}>
              Save as Recipe
            </button>
          {/if}
          <button class="btn-run" onclick={runSelected}>
            Run {selectedIds.size} Selected
          </button>
        </div>
      {/if}
    </div>
  </header>

  {#if data.error}
    <div class="error-banner">
      <p>Failed to load models: {data.error}</p>
    </div>
  {:else}
    <ModelFilters
      {runtimes}
      {orgs}
      {dataTypes}
      {categories}
      bind:selectedRuntimes
      bind:selectedOrgs
      bind:selectedDataTypes
      bind:selectedCategories
      bind:selectedSizes
      bind:searchQuery
      onfilter={handleFilter}
    />

    <ModelGrid models={filteredModels} {selectedIds} ontoggle={toggleSelect} />
  {/if}
</div>

{#if showSaveDialog}
  <div class="dialog-backdrop" role="presentation" onclick={() => showSaveDialog = false}>
    <div class="dialog-panel" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()}>
      <h2 class="dialog-title">Save as Recipe</h2>
      <p class="dialog-desc">{selectedIds.size} model{selectedIds.size > 1 ? 's' : ''} selected</p>
      <input
        type="text"
        class="dialog-input"
        placeholder="Recipe name"
        bind:value={recipeName}
        onkeydown={(e) => { if (e.key === 'Enter') saveAsRecipe(); }}
      />
      <div class="dialog-actions">
        <button class="btn-ghost" onclick={() => showSaveDialog = false}>Cancel</button>
        <button class="btn-primary-sm" onclick={saveAsRecipe} disabled={savingRecipe || !recipeName.trim()}>
          {savingRecipe ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .model-page {
    max-width: 100%;
  }

  .page-header {
    margin-bottom: var(--space-3);
  }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .page-header h1 {
    font-size: var(--text-xl);
    font-weight: 700;
    letter-spacing: -0.01em;
    margin-bottom: var(--space-half);
  }

  .page-header p {
    font-size: var(--color-text-secondary, var(--text-base));
    color: var(--color-text-secondary);
  }

  .header-actions {
    display: flex;
    gap: var(--space-1);
    align-items: center;
  }

  .btn-run {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: 10px 20px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--color-primary);
    color: #FFFFFF;
    cursor: pointer;
    white-space: nowrap;
    transition: background var(--transition-base);
  }

  .btn-run:hover { background: var(--color-primary-hover); }

  .btn-save {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: 10px 20px;
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-primary);
    cursor: pointer;
    white-space: nowrap;
    transition: background var(--transition-base);
  }

  .btn-save:hover { background: var(--color-accent-light); }

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

  .dialog-title {
    font-size: var(--text-lg);
    font-weight: 300;
    margin-bottom: var(--space-half);
  }

  .dialog-desc {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin-bottom: var(--space-2);
  }

  .dialog-input {
    width: 100%;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    outline: none;
    margin-bottom: var(--space-2);
  }

  .dialog-input:focus { border-color: var(--color-focus-ring); }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-1);
  }

  .btn-primary-sm {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: 10px 20px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--color-primary);
    color: #FFFFFF;
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-primary-sm:hover { background: var(--color-primary-hover); }
  .btn-primary-sm:disabled { background: var(--color-disabled); color: var(--color-text-muted); cursor: not-allowed; }

  .btn-ghost {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
  }

  .btn-ghost:hover { background: var(--color-nav-item-hover); }

  .error-banner {
    padding: var(--space-2);
    border: 1px solid var(--color-error);
    border-radius: var(--radius-base);
    background: var(--color-surface-sunken);
    color: var(--color-error);
    font-size: var(--text-sm);
  }
</style>
