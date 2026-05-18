<script lang="ts">
  import { goto } from '$app/navigation';
  import { get } from 'svelte/store';
  import ModelFilters from '$lib/components/ModelFilters.svelte';
  import ModelGrid from '$lib/components/ModelGrid.svelte';
  import HFSearch from '$lib/components/HFSearch.svelte';
  import { isAuthenticated, auth } from '$lib/stores/auth';
  import { createRecipe } from '$lib/recipes/crud';
  import type { RecipeModel } from '$lib/supabase/types';
  import type { ModelRow } from './+page.ts';

  let { data } = $props<{ data: { models: ModelRow[]; error: string | null; initialSearch: string } }>();

  let searchQuery = $state(data.initialSearch);
  let selectedFormats = $state<Set<string>>(new Set());
  let selectedOrgs = $state<Set<string>>(new Set());
  let selectedDataTypes = $state<Set<string>>(new Set());
  let selectedCategories = $state<Set<string>>(new Set());
  let selectedSizes = $state<Set<string>>(new Set());
  let selectedIds = $state<Set<string>>(new Set());
  let showSaveDialog = $state(false);
  let recipeName = $state('');
  let savingRecipe = $state(false);
  let showFilters = $state(false);
  let showHFSearch = $state(false);

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

  function inferFormat(path: string): string {
    const lower = path.toLowerCase();
    if (lower.endsWith('.litertlm')) return 'litertlm';
    if (lower.endsWith('.tflite')) return 'tflite';
    if (lower.endsWith('.onnx')) return 'onnx';
    return 'unknown';
  }

  const allModels: ModelRow[] = $derived(data.models);
  const formats = $derived([...new Set(allModels.map((m) => inferFormat(m.file_path)))].sort());
  const orgs = $derived([...new Set(allModels.map((m) => m.source_org))].sort());
  const dataTypes = $derived([...new Set(allModels.map((m) => m.data_type))].sort());
  const categories = $derived(
    [...new Set(allModels.map((m) => m.task))].filter((c) => c !== 'uncategorized').sort()
  );

  const filteredModels = $derived(
    allModels.filter((m) => {
      if (selectedFormats.size > 0 && !selectedFormats.has(inferFormat(m.file_path))) return false;
      if (selectedOrgs.size > 0 && !selectedOrgs.has(m.source_org)) return false;
      if (selectedDataTypes.size > 0 && !selectedDataTypes.has(m.data_type)) return false;
      if (selectedCategories.size > 0 && !selectedCategories.has(m.task)) return false;
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
    formats: Set<string>;
    orgs: Set<string>;
    dataTypes: Set<string>;
    categories: Set<string>;
    sizes: Set<string>;
  }) {
    selectedFormats = filters.formats;
    selectedOrgs = filters.orgs;
    selectedDataTypes = filters.dataTypes;
    selectedCategories = filters.categories;
    selectedSizes = filters.sizes;
  }
</script>

<div class="model-page">
  <header class="page-header">
    <div class="header-row">
      <div>
        <h1>Model Browser</h1>
        <p>Select models to benchmark.</p>
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
    <div class="page-body">
      <div class="sidebar-wrap" class:open={showFilters}>
        <ModelFilters
          {formats}
          {orgs}
          {dataTypes}
          {categories}
          bind:selectedFormats
          bind:selectedOrgs
          bind:selectedDataTypes
          bind:selectedCategories
          bind:selectedSizes
          onfilter={handleFilter}
        />
      </div>

      <div class="content">
        <div class="content-toolbar">
          <button class="filter-toggle" onclick={() => showFilters = !showFilters}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"/>
              <line x1="8" y1="12" x2="20" y2="12"/>
              <line x1="12" y1="18" x2="20" y2="18"/>
            </svg>
            Filters
            {#if selectedFormats.size + selectedOrgs.size + selectedDataTypes.size + selectedCategories.size + selectedSizes.size > 0}
              <span class="filter-count">{selectedFormats.size + selectedOrgs.size + selectedDataTypes.size + selectedCategories.size + selectedSizes.size}</span>
            {/if}
          </button>
          <input
            type="search"
            class="search-input"
            placeholder="Search models..."
            bind:value={searchQuery}
          />
          <span class="result-count">{filteredModels.length} models</span>
          <button
            class="hf-toggle"
            class:active={showHFSearch}
            onclick={() => showHFSearch = !showHFSearch}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            HuggingFace
          </button>
        </div>
        <ModelGrid models={filteredModels} {selectedIds} ontoggle={toggleSelect} />
        {#if showHFSearch && searchQuery.trim()}
          <HFSearch {searchQuery} localModels={allModels} />
        {:else if showHFSearch && !searchQuery.trim()}
          <div class="hf-search-hint">Type a search query above to search HuggingFace.</div>
        {/if}
      </div>
    </div>
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

  .page-body {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: var(--space-4);
    align-items: start;
  }

  .sidebar-wrap {
    /* visible on desktop always */
  }

  .content {
    min-width: 0;
  }

  .content-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .filter-toggle {
    display: none;
    align-items: center;
    gap: 6px;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .filter-toggle:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .filter-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--color-primary);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
  }

  .search-input {
    flex: 1;
    max-width: 360px;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    outline: none;
    transition: border-color var(--transition-base);
  }

  .search-input:focus {
    border-color: var(--color-focus-ring);
  }

  .result-count {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .hf-toggle {
    display: flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: border-color var(--transition-base), color var(--transition-base), background var(--transition-base);
  }

  .hf-toggle:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .hf-toggle.active {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-accent-light);
  }

  .hf-search-hint {
    margin-top: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 1.5px dashed var(--color-border-strong);
    border-radius: var(--radius-lg);
    background: var(--color-surface-sunken);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
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

  @media (max-width: 768px) {
    .page-header {
      margin-bottom: var(--space-2);
    }

    .header-row {
      flex-wrap: wrap;
      gap: var(--space-1);
    }

    .page-header h1 {
      font-size: var(--text-lg);
    }

    .page-header p {
      font-size: var(--text-sm);
    }

    .header-actions {
      width: 100%;
    }

    .btn-run,
    .btn-save {
      flex: 1;
      font-size: var(--text-sm);
      padding: 8px 14px;
      text-align: center;
    }

    .page-body {
      grid-template-columns: 1fr;
    }

    .sidebar-wrap {
      display: none;
    }

    .sidebar-wrap.open {
      display: block;
    }

    .filter-toggle {
      display: flex;
    }

    .search-input {
      max-width: none;
    }
  }
</style>
