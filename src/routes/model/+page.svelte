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
  let selectedRuntime = $state('');
  let selectedOrg = $state('');
  let selectedDataType = $state('');
  let selectedCategory = $state('');
  let selectedIds = $state<Set<string>>(new Set());
  let showSaveDialog = $state(false);
  let recipeName = $state('');
  let savingRecipe = $state(false);

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
      if (selectedRuntime && m.runtime !== selectedRuntime) return false;
      if (selectedOrg && m.source_org !== selectedOrg) return false;
      if (selectedDataType && m.data_type !== selectedDataType) return false;
      if (selectedCategory && m.category !== selectedCategory) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesId = m.hf_model_id.toLowerCase().includes(q);
        const matchesFile = m.file_path.toLowerCase().includes(q);
        if (!matchesId && !matchesFile) return false;
      }
      return true;
    })
  );

  function handleFilter(filters: {
    runtime: string;
    org: string;
    dataType: string;
    category: string;
    search: string;
  }) {
    selectedRuntime = filters.runtime;
    selectedOrg = filters.org;
    selectedDataType = filters.dataType;
    selectedCategory = filters.category;
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
      bind:selectedRuntime
      bind:selectedOrg
      bind:selectedDataType
      bind:selectedCategory
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
    font-weight: 300;
    margin-bottom: var(--space-half);
  }

  .page-header p {
    font-size: var(--text-base);
    color: var(--color-text-secondary);
  }

  .header-actions {
    display: flex;
    gap: var(--space-1);
    align-items: center;
  }

  .btn-run {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius-base);
    background: var(--color-text-primary);
    color: var(--color-surface);
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-run:hover { opacity: 0.85; }

  .btn-save {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-primary);
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-save:hover { background: var(--color-nav-item-hover); }

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
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius-base);
    background: var(--color-text-primary);
    color: var(--color-surface);
    cursor: pointer;
  }

  .btn-primary-sm:hover { opacity: 0.85; }
  .btn-primary-sm:disabled { opacity: 0.5; cursor: not-allowed; }

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
