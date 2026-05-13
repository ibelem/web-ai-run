<script lang="ts">
  import ModelFilters from '$lib/components/ModelFilters.svelte';
  import ModelGrid from '$lib/components/ModelGrid.svelte';
  import type { ModelRow } from './+page.ts';

  let { data } = $props<{ data: { models: ModelRow[]; error: string | null } }>();

  let searchQuery = $state('');
  let selectedRuntime = $state('');
  let selectedOrg = $state('');
  let selectedDataType = $state('');
  let selectedCategory = $state('');
  let selectedIds = $state<Set<string>>(new Set());

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
        <button class="btn-run" onclick={runSelected}>
          Run {selectedIds.size} Selected
        </button>
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

  .error-banner {
    padding: var(--space-2);
    border: 1px solid var(--color-error);
    border-radius: var(--radius-base);
    background: var(--color-surface-sunken);
    color: var(--color-error);
    font-size: var(--text-sm);
  }
</style>
