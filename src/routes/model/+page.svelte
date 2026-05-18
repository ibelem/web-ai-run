<script lang="ts">
  import ModelFilters from '$lib/components/ModelFilters.svelte';
  import ModelGrid from '$lib/components/ModelGrid.svelte';
  import HFSearch, { type SelectedHFModel } from '$lib/components/HFSearch.svelte';
  import HFUrlImport from '$lib/components/HFUrlImport.svelte';
  import { isAuthenticated } from '$lib/stores/auth';
  import type { ModelRow } from './+page.ts';
  import { invalidateModelCache } from '$lib/model-cache';
  import ActionPanel from '$lib/components/ActionPanel.svelte';

  let { data } = $props<{ data: { models: ModelRow[]; error: string | null; initialSearch: string } }>();

  let searchQuery = $state(data.initialSearch);
  let selectedFormats = $state<Set<string>>(new Set());
  let selectedOrgs = $state<Set<string>>(new Set());
  let selectedDataTypes = $state<Set<string>>(new Set());
  let selectedCategories = $state<Set<string>>(new Set());
  let selectedSizes = $state<Set<string>>(new Set());
  function loadStoredSelection(): { ids: string[]; hfModels: SelectedHFModel[] } {
    try {
      const raw = sessionStorage.getItem('model_selection');
      if (raw) return JSON.parse(raw);
    } catch {}
    return { ids: [], hfModels: [] };
  }
  const _stored = loadStoredSelection();
  let selectedIds = $state<Set<string>>(new Set(_stored.ids));
  let selectedHFModels = $state<SelectedHFModel[]>(_stored.hfModels);
  let showFilters = $state(false);
  let showActionPanel = $state(false);
  let showHFSearch = $state(false);
  let refreshing = $state(false);

  function refreshModels() {
    refreshing = true;
    invalidateModelCache();
    window.location.reload();
  }

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

  $effect(() => {
    try {
      sessionStorage.setItem('model_selection', JSON.stringify({
        ids: [...selectedIds],
        hfModels: selectedHFModels,
      }));
    } catch {}
  });

  const totalSelected = $derived(selectedIds.size + selectedHFModels.length);

  function inferFormat(path: string): string {
    const lower = path.toLowerCase();
    if (lower.endsWith('.litertlm')) return 'litertlm';
    if (lower.endsWith('.tflite')) return 'tflite';
    if (lower.endsWith('.onnx')) return 'onnx';
    return 'unknown';
  }

  const allModels: ModelRow[] = $derived(data.models);

  const isHFUrl = $derived((() => {
    try { return new URL(searchQuery.trim()).hostname === 'huggingface.co'; }
    catch { return false; }
  })());
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
      if (searchQuery && !showHFSearch) {
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
      {#if totalSelected > 0}
        <div class="header-actions">
          {#if $isAuthenticated}
            <button class="btn-save" onclick={() => showActionPanel = true}>
              Save as Recipe
            </button>
          {/if}
          <button class="btn-run" onclick={() => showActionPanel = true}>
            Run {totalSelected} Selected
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
          {refreshing}
          onfilter={handleFilter}
          onrefresh={refreshModels}
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
          <span class="result-count">{filteredModels.length} models</span>
        </div>
        {#if isHFUrl}
          <HFUrlImport url={searchQuery.trim()} localModels={allModels} bind:selectedHFModels />
        {:else}
          {#if showHFSearch}
            <HFSearch {searchQuery} localModels={allModels} bind:selectedHFModels />
          {/if}
          <ModelGrid models={filteredModels} {selectedIds} ontoggle={toggleSelect} />
        {/if}
      </div>
    </div>
  {/if}
</div>

<ActionPanel
  bind:open={showActionPanel}
  localModels={allModels}
  {selectedIds}
  bind:selectedHFModels
  onclose={() => showActionPanel = false}
  ondeselect={(id) => toggleSelect(id)}
  ondeselecthf={(hf_model_id, file_path) => {
    selectedHFModels = selectedHFModels.filter(
      (m) => !(m.hf_model_id === hf_model_id && m.file_path === file_path)
    );
  }}
/>

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
    margin-left: auto;
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

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
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

  .error-banner {
    padding: var(--space-2);
    border-radius: var(--radius-base);
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

    .content-toolbar {
      flex-wrap: wrap;
    }

    .search-input {
      order: 10;
      width: 100%;
      flex-basis: 100%;
    }

    .result-count {
      margin-left: auto;
    }
  }
</style>
