<script lang="ts">
  import { goto } from '$app/navigation';
  import HFSearch, { type SelectedHFModel } from '$lib/components/HFSearch.svelte';
  import HFUrlImport from '$lib/components/HFUrlImport.svelte';
  import FormatIcon from '$lib/components/FormatIcon.svelte';
  import { createRecipe } from '$lib/recipes/crud';
  import type { RecipeModel } from '$lib/supabase/types';

  let { data } = $props();

  let recipeName = $state('');
  let visibility = $state<'personal' | 'public'>('personal');
  let saving = $state(false);
  let errorMessage = $state('');

  let recipeModels = $state<RecipeModel[]>([]);

  let hfSearchQuery = $state('');
  let hfModels = $state<SelectedHFModel[]>([]);

  const isHFUrl = $derived((() => {
    try { return new URL(hfSearchQuery.trim()).hostname === 'huggingface.co'; }
    catch { return false; }
  })());

  $effect(() => {
    for (const m of hfModels) {
      const already = recipeModels.some(
        (r) => r.hf_model_id === m.hf_model_id && r.file_path === m.file_path
      );
      if (!already) {
        recipeModels = [...recipeModels, {
          hf_model_id: m.hf_model_id,
          file_path: m.file_path,
          data_type: m.data_type,
          size_bytes: m.size_bytes,
        }];
      }
    }
    if (hfModels.length > 0) hfModels = [];
  });

  function removeModel(index: number) {
    recipeModels = recipeModels.filter((_, i) => i !== index);
  }

  function basename(path: string) {
    return path.split('/').pop() ?? path;
  }

  const canSave = $derived(recipeName.trim().length > 0 && recipeModels.length > 0);

  async function handleSave() {
    if (!canSave) return;
    saving = true;
    errorMessage = '';
    try {
      await createRecipe(data.userId, recipeName.trim(), recipeModels, visibility);
      goto('/recipe');
    } catch (e: any) {
      errorMessage = e.message ?? 'Failed to create recipe.';
    } finally {
      saving = false;
    }
  }
</script>

<div class="edit-layout">
  <!-- Sidebar -->
  <aside class="recipe-sidebar">
    <div class="sidebar-header">
      <span class="sidebar-label">My Recipes</span>
      <a href="/recipe" class="sidebar-back">All</a>
    </div>
    <ul class="sidebar-list">
      <li>
        <span class="sidebar-item active new-item">New Recipe</span>
      </li>
      {#each data.recipes as r (r.id)}
        <li>
          <a
            href="/recipe/{r.slug}/edit"
            class="sidebar-item"
          >
            <span class="sidebar-item-name">{r.name}</span>
            <span class="sidebar-item-vis" class:is-public={r.visibility === 'public'}>
              {r.visibility === 'public' ? 'public' : 'personal'}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  </aside>

  <div class="edit-page">
    <header class="page-header">
      <h1>New Recipe</h1>
    </header>

    <!-- Name + Visibility -->
    <div class="meta-row">
      <input
        class="name-input"
        type="text"
        placeholder="Recipe name..."
        bind:value={recipeName}
      />
      <div class="visibility-tabs">
        <button
          class="visibility-tab"
          class:active={visibility === 'personal'}
          onclick={() => { visibility = 'personal'; }}
        >Personal</button>
        <button
          class="visibility-tab"
          class:active={visibility === 'public'}
          onclick={() => { visibility = 'public'; }}
        >Public</button>
      </div>
    </div>

    <!-- Zone 1: current models -->
    <section class="zone">
      <div class="zone-label">
        In this recipe
        {#if recipeModels.length > 0}
          <span class="count-badge">{recipeModels.length}</span>
        {/if}
      </div>

      {#if recipeModels.length === 0}
        <div class="empty-models">
          <p>No models yet. Search Hugging Face below to add some.</p>
        </div>
      {:else}
        <ul class="model-list">
          {#each recipeModels as m, i (`${m.hf_model_id}::${m.file_path}`)}
            {@const ext = m.file_path.endsWith('.litertlm') ? 'litertlm' : m.file_path.endsWith('.tflite') ? 'tflite' : 'onnx'}
            <li class="model-item">
              <div class="model-item-left">
                <div class="model-item-top">
                  <span class="model-item-repo">{m.hf_model_id}</span>
                </div>
                <div class="model-item-bottom">
                  <FormatIcon format={ext} size={14} />
                  <span class="model-item-name">{basename(m.file_path)}</span>
                </div>
              </div>
              {#if m.data_type}
                <span class="model-item-dtype" data-dtype={m.data_type}>{m.data_type === 'quantized' ? 'quant' : m.data_type}</span>
              {/if}
              <button class="remove-btn" onclick={() => removeModel(i)} aria-label="Remove">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <!-- Zone 2: add via HF search -->
    <section class="zone">
      <div class="zone-label">Add models from Hugging Face</div>
      <div class="search-wrap">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          class="search-input"
          type="text"
          placeholder="Search HF models or paste a URL..."
          bind:value={hfSearchQuery}
        />
        {#if hfSearchQuery}
          <button class="search-clear" onclick={() => { hfSearchQuery = ''; }} aria-label="Clear">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        {/if}
      </div>

      {#if isHFUrl}
        <HFUrlImport url={hfSearchQuery.trim()} bind:selectedHFModels={hfModels} />
      {:else if hfSearchQuery.trim()}
        <HFSearch searchQuery={hfSearchQuery} bind:selectedHFModels={hfModels} />
      {/if}
    </section>

    {#if errorMessage}
      <p class="error-text">{errorMessage}</p>
    {/if}

    <div class="save-bar">
      {#if !canSave}
        <p class="save-hint">
          {#if !recipeName.trim() && recipeModels.length === 0}
            Add a name and at least one model to create.
          {:else if !recipeName.trim()}
            Give your recipe a name.
          {:else}
            Add at least one model.
          {/if}
        </p>
      {/if}
      <div class="save-actions">
        <a href="/recipe" class="btn-ghost">Cancel</a>
        <button
          class="btn-save"
          onclick={handleSave}
          disabled={saving || !canSave}
        >
          {saving ? 'Creating...' : 'Create Recipe'}
        </button>
      </div>
    </div>
  </div>
</div>


<style>
  .edit-layout {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
  }

  /* Sidebar */
  .recipe-sidebar {
    width: 220px;
    flex-shrink: 0;
    position: sticky;
    top: calc(56px + var(--space-3));
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--space-1);
    margin-bottom: 2px;
  }

  .sidebar-label {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--color-text-muted);
  }

  .sidebar-back {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-decoration: none;
    transition: color var(--transition-base);
  }

  .sidebar-back:hover { color: var(--color-text-primary); }

  .sidebar-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .sidebar-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 8px;
    border-radius: var(--radius-base);
    border: 1px solid transparent;
    text-decoration: none;
    transition: background var(--transition-base), border-color var(--transition-base);
    cursor: pointer;
  }

  .sidebar-item:hover {
    background: var(--color-surface-sunken);
    border-color: var(--color-border);
  }

  .sidebar-item.active {
    background: var(--color-accent-light);
    border-color: var(--color-primary);
  }

  .new-item {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-primary);
  }

  .sidebar-item-name {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sidebar-item-vis {
    font-size: 10px;
    color: var(--color-dt-fp16);
    font-weight: 500;
  }

  .sidebar-item-vis.is-public { color: var(--color-dt-int8); }

  @media (max-width: 768px) {
    .edit-layout { flex-direction: column; }
    .recipe-sidebar { width: 100%; position: static; }
    .sidebar-header { display: none; }
    .sidebar-list { display: none; }
  }

  /* Main */
  .edit-page {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .meta-row {
    display: flex;
    gap: var(--space-1);
    align-items: center;
  }

  .name-input {
    flex: 1;
    font-family: var(--font-ui);
    font-size: var(--text-base);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    transition: border-color var(--transition-base);
  }

  .name-input:focus-visible { border-color: var(--color-focus-ring); }

  .visibility-tabs {
    display: flex;
    border-radius: var(--radius-base);
    overflow: hidden;
    flex-shrink: 0;
    min-width: 146px;
  }

  .visibility-tab {
    width: 50%;
    box-sizing: border-box;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    background: var(--color-surface-sunken);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background var(--transition-base), color var(--transition-base), border-color var(--transition-base);
  }

  .visibility-tab + .visibility-tab { border-left: none; }

  .visibility-tab.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: #fff;
  }

  .zone {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .zone-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--color-text-muted);
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
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
  }

  .empty-models {
    padding: var(--space-2);
    border-radius: var(--radius-base);
    border: 1px dashed var(--color-border);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    text-align: center;
  }

  .model-list {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3px;
  }

  @media (max-width: 900px) { .model-list { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 600px) { .model-list { grid-template-columns: 1fr; } }

  .model-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    min-width: 0;
    transition: border-color var(--transition-base), background var(--transition-base);
  }

  .model-item:hover {
    border-color: var(--color-primary);
    background: var(--color-accent-light);
  }

  .model-item-left {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    overflow: hidden;
    min-width: 0;
  }

  .model-item-top,
  .model-item-bottom {
    display: flex;
    align-items: center;
    gap: 5px;
    overflow: hidden;
    white-space: nowrap;
    min-width: 0;
  }

  .model-item-repo {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .model-item-name {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }


  .model-item-dtype {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    padding: 1px 7px;
    border-radius: var(--radius-sm);
    border: 1px solid;
    white-space: nowrap;
    flex-shrink: 0;
    line-height: 1.4;
  }

  .model-item-dtype[data-dtype="fp32"]      { color: var(--color-dt-fp32);      border-color: var(--color-dt-fp32); }
  .model-item-dtype[data-dtype="fp16"]      { color: var(--color-dt-fp16);      border-color: var(--color-dt-fp16); }
  .model-item-dtype[data-dtype="bf16"]      { color: var(--color-dt-bf16);      border-color: var(--color-dt-bf16); }
  .model-item-dtype[data-dtype="fp8"]       { color: var(--color-dt-fp8);       border-color: var(--color-dt-fp8); }
  .model-item-dtype[data-dtype="int8"]      { color: var(--color-dt-int8);      border-color: var(--color-dt-int8); }
  .model-item-dtype[data-dtype="uint8"]     { color: var(--color-dt-uint8);     border-color: var(--color-dt-uint8); }
  .model-item-dtype[data-dtype="int4"]      { color: var(--color-dt-int4);      border-color: var(--color-dt-int4); }
  .model-item-dtype[data-dtype="uint4"]     { color: var(--color-dt-uint4);     border-color: var(--color-dt-uint4); }
  .model-item-dtype[data-dtype="q4"]        { color: var(--color-dt-q4);        border-color: var(--color-dt-q4); }
  .model-item-dtype[data-dtype="q4f16"]     { color: var(--color-dt-q4f16);     border-color: var(--color-dt-q4f16); }
  .model-item-dtype[data-dtype="bnb4"]      { color: var(--color-dt-bnb4);      border-color: var(--color-dt-bnb4); }
  .model-item-dtype[data-dtype="quantized"] { color: var(--color-dt-quantized); border-color: var(--color-dt-quantized); }

  .remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border: none;
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background var(--transition-base), color var(--transition-base);
  }

  .remove-btn:hover {
    background: var(--color-surface-sunken);
    color: var(--color-text-primary);
  }

  .search-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 10px;
    color: var(--color-text-muted);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-1) 32px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    transition: border-color var(--transition-base);
  }

  .search-input:focus-visible { border-color: var(--color-focus-ring); }

  .search-clear {
    position: absolute;
    right: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .search-clear:hover {
    background: var(--color-surface-sunken);
    color: var(--color-text-primary);
  }

  .save-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding-top: var(--space-2);
  }

  .save-hint {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .save-actions {
    display: flex;
    gap: var(--space-1);
    margin-left: auto;
  }

  .btn-ghost {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: 10px 20px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-secondary);
    text-decoration: none;
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-ghost:hover { background: var(--color-surface-sunken); }

  .btn-save {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: 10px 20px;
    border: none;
    border-radius: var(--radius-base);
    background: var(--color-primary);
    color: #fff;
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-save:hover:not(:disabled) { background: var(--color-primary-hover); }

  .btn-save:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .error-text {
    font-size: var(--text-sm);
    color: var(--color-error);
  }

  @media (max-width: 640px) {
    .save-bar {
      flex-direction: column;
      align-items: stretch;
    }

    .save-actions {
      margin-left: 0;
      width: 100%;
    }

    .btn-ghost,
    .btn-save {
      flex: 1;
      text-align: center;
      min-height: 44px;
    }
  }
</style>
