<script lang="ts">
  import { goto } from '$app/navigation';
  import ModelFilters from '$lib/components/ModelFilters.svelte';
  import ModelGrid from '$lib/components/ModelGrid.svelte';
  import { createRecipe } from '$lib/recipes/crud';
  import type { RecipeModel } from '$lib/supabase/types';
  import { inferFormat } from '$lib/huggingface/parser';

  let { data } = $props();

  let recipeName = $state('');
  let visibility = $state<'personal' | 'public'>('personal');
  let selectedIds = $state<Set<string>>(new Set());
  let saving = $state(false);
  let errorMessage = $state('');

  let searchQuery = $state('');
  let selectedFormats = $state<Set<string>>(new Set());
  let selectedOrgs = $state<Set<string>>(new Set());
  let selectedDataTypes = $state<Set<string>>(new Set());
  let selectedCategories = $state<Set<string>>(new Set());
  let selectedSizes = $state<Set<string>>(new Set());

  const allModels = $derived(data.models);
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

  function handleFilter(filters: { formats: Set<string>; orgs: Set<string>; dataTypes: Set<string>; categories: Set<string>; sizes: Set<string> }) {
    selectedFormats = filters.formats;
    selectedOrgs = filters.orgs;
    selectedDataTypes = filters.dataTypes;
    selectedCategories = filters.categories;
    selectedSizes = filters.sizes;
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
    saving = true;
    errorMessage = '';

    const models: RecipeModel[] = allModels
      .filter((m) => selectedIds.has(m.id))
      .map((m) => ({
        hf_model_id: m.hf_model_id,
        file_path: m.file_path,
        data_type: m.data_type,
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

  </section>

  <section class="models-section">
    <h2 class="section-title">
      Select Models
      {#if selectedIds.size > 0}
        <span class="selected-count">{selectedIds.size} selected</span>
      {/if}
    </h2>

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
  }

  .field-input:focus-visible, .field-select:focus-visible {
    border-color: var(--color-focus-ring);
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

</style>
