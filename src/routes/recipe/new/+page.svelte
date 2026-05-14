<script lang="ts">
  import { goto } from '$app/navigation';
  import ModelFilters from '$lib/components/ModelFilters.svelte';
  import ModelGrid from '$lib/components/ModelGrid.svelte';
  import { createRecipe } from '$lib/recipes/crud';
  import type { RecipeModel } from '$lib/supabase/types';
  import type { Backend } from '$lib/engine/types';

  let { data } = $props();

  let recipeName = $state('');
  let visibility = $state<'personal' | 'public'>('personal');
  let selectedIds = $state<Set<string>>(new Set());
  let selectedBackends = $state<Backend[]>(['wasm_1']);
  let saving = $state(false);
  let errorMessage = $state('');

  let searchQuery = $state('');
  let selectedRuntime = $state('');
  let selectedOrg = $state('');
  let selectedDataType = $state('');
  let selectedCategory = $state('');

  const allModels = $derived(data.models);
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
        if (!m.hf_model_id.toLowerCase().includes(q) && !m.file_path.toLowerCase().includes(q)) return false;
      }
      return true;
    })
  );

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  function handleFilter(filters: { runtime: string; org: string; dataType: string; category: string; search: string }) {
    selectedRuntime = filters.runtime;
    selectedOrg = filters.org;
    selectedDataType = filters.dataType;
    selectedCategory = filters.category;
    searchQuery = filters.search;
  }

  const ALL_BACKENDS: Backend[] = ['wasm_1', 'wasm_n', 'webgpu', 'webnn_cpu', 'webnn_gpu', 'webnn_npu'];

  function toggleBackend(b: Backend) {
    if (selectedBackends.includes(b)) {
      selectedBackends = selectedBackends.filter((x) => x !== b);
    } else {
      selectedBackends = [...selectedBackends, b];
    }
  }

  async function handleSave() {
    if (!recipeName.trim()) {
      errorMessage = 'Recipe name is required.';
      return;
    }
    if (selectedIds.size === 0) {
      errorMessage = 'Select at least one model.';
      return;
    }
    if (selectedBackends.length === 0) {
      errorMessage = 'Select at least one backend.';
      return;
    }

    saving = true;
    errorMessage = '';

    const models: RecipeModel[] = allModels
      .filter((m) => selectedIds.has(m.id))
      .map((m) => ({
        hf_model_id: m.hf_model_id,
        file_path: m.file_path,
        data_type: m.data_type,
        backends: [...selectedBackends],
      }));

    try {
      await createRecipe(data.userId, recipeName.trim(), models, visibility);
      goto('/recipe');
    } catch (e: any) {
      errorMessage = e.message ?? 'Failed to save recipe.';
    } finally {
      saving = false;
    }
  }
</script>

<div class="new-recipe-page">
  <header class="page-header">
    <h1>New Recipe</h1>
    <p>Name your recipe, pick models, and choose which backends to test.</p>
  </header>

  <section class="form-section">
    <div class="form-row">
      <label class="field">
        <span class="field-label">Recipe name</span>
        <input type="text" bind:value={recipeName} placeholder="e.g. Vision Models FP16" class="field-input" />
      </label>
      <label class="field field-sm">
        <span class="field-label">Visibility</span>
        <select bind:value={visibility} class="field-select">
          <option value="personal">Personal</option>
          <option value="public">Public</option>
        </select>
      </label>
    </div>

    <div class="backends-section">
      <span class="field-label">Backends</span>
      <div class="backend-chips">
        {#each ALL_BACKENDS as b}
          <button
            class="chip"
            class:chip-active={selectedBackends.includes(b)}
            onclick={() => toggleBackend(b)}
          >
            {b}
          </button>
        {/each}
      </div>
    </div>
  </section>

  <section class="models-section">
    <h2 class="section-title">
      Select Models
      {#if selectedIds.size > 0}
        <span class="selected-count">{selectedIds.size} selected</span>
      {/if}
    </h2>

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
  </section>

  {#if errorMessage}
    <p class="error-text">{errorMessage}</p>
  {/if}

  <div class="save-bar">
    <a href="/recipe" class="btn-ghost">Cancel</a>
    <button class="btn-primary" onclick={handleSave} disabled={saving}>
      {saving ? 'Saving...' : 'Save Recipe'}
    </button>
  </div>
</div>

<style>
  .new-recipe-page {
    max-width: 100%;
  }

  .page-header {
    margin-bottom: var(--space-3);
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

  .form-section {
    margin-bottom: var(--space-3);
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .form-row {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-half);
    flex: 1;
  }

  .field-sm {
    flex: 0 0 160px;
  }

  .field-label {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .field-input, .field-select {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    outline: none;
  }

  .field-input:focus, .field-select:focus {
    border-color: var(--color-focus-ring);
  }

  .backends-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-half);
  }

  .backend-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-half);
  }

  .chip {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    padding: 4px 10px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .chip:hover {
    border-color: var(--color-border-strong);
  }

  .chip-active {
    border-color: var(--color-info);
    background: color-mix(in srgb, var(--color-info) 10%, transparent);
    color: var(--color-text-primary);
  }

  .models-section {
    margin-bottom: var(--space-3);
  }

  .section-title {
    font-size: var(--text-base);
    font-weight: 500;
    margin-bottom: var(--space-2);
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .selected-count {
    font-size: var(--text-xs);
    font-weight: 400;
    color: var(--color-text-muted);
    padding: 2px 8px;
    background: var(--color-surface-sunken);
    border-radius: var(--radius-sm);
  }

  .error-text {
    color: var(--color-error);
    font-size: var(--text-sm);
    margin-bottom: var(--space-2);
  }

  .save-bar {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-1);
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border);
  }

  .btn-primary {
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

  .btn-primary:hover { opacity: 0.85; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-ghost {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    text-decoration: none;
  }

  .btn-ghost:hover { background: var(--color-nav-item-hover); }
</style>
