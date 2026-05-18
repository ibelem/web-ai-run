<script lang="ts">
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { auth, isAuthenticated } from '$lib/stores/auth';
  import { createRecipe, updateRecipe, listRecipes, type Recipe } from '$lib/recipes/crud';
  import type { RecipeModel } from '$lib/supabase/types';
  import { BACKENDS } from '$lib/engine/backends';
  import type { Backend } from '$lib/engine/types';
  import type { SelectedHFModel } from './HFSearch.svelte';
  import type { ModelRow } from '../../routes/model/+page';

  interface Props {
    open?: boolean;
    localModels: ModelRow[];
    selectedIds: Set<string>;
    selectedHFModels: SelectedHFModel[];
    onclose?: () => void;
    ondeselect?: (id: string) => void;
    ondeselecthf?: (hf_model_id: string, file_path: string) => void;
  }

  let {
    open = false,
    localModels,
    selectedIds,
    selectedHFModels = $bindable([]),
    onclose,
    ondeselect,
    ondeselecthf,
  }: Props = $props();

  // --- Backend selection (persisted) ---
  const STORAGE_BACKENDS = 'action_panel_backends';
  const STORAGE_ITERATIONS = 'action_panel_iterations';
  const ITERATION_OPTIONS = [1, 10, 20, 50, 100, 500, 1000, 10000];

  function loadStoredBackends(): Backend[] {
    try {
      const raw = sessionStorage.getItem(STORAGE_BACKENDS);
      if (raw) return JSON.parse(raw);
    } catch {}
    return ['webgpu'];
  }

  function loadStoredIterations(): number {
    try {
      const raw = sessionStorage.getItem(STORAGE_ITERATIONS);
      if (raw) return JSON.parse(raw);
    } catch {}
    return 50;
  }

  let selectedBackends = $state<Backend[]>(loadStoredBackends());
  let selectedIterations = $state<number>(loadStoredIterations());

  $effect(() => {
    try {
      sessionStorage.setItem(STORAGE_BACKENDS, JSON.stringify(selectedBackends));
    } catch {}
  });

  $effect(() => {
    try {
      sessionStorage.setItem(STORAGE_ITERATIONS, JSON.stringify(selectedIterations));
    } catch {}
  });

  function toggleBackend(id: Backend) {
    if (selectedBackends.includes(id)) {
      if (selectedBackends.length > 1) selectedBackends = selectedBackends.filter((b) => b !== id);
    } else {
      selectedBackends = [...selectedBackends, id];
    }
  }

  // --- Recipe section ---
  const RECIPE_MODE_KEY = 'action_panel_recipe_mode';

  type RecipeMode = 'new' | 'append';
  let recipeMode = $state<RecipeMode>('new');
  let recipeName = $state('');
  let saving = $state(false);
  let saveError = $state('');
  let existingRecipes = $state<Recipe[]>([]);
  let selectedRecipeId = $state('');
  let loadingRecipes = $state(false);

  $effect(() => {
    if (open && $isAuthenticated) {
      loadExistingRecipes();
    }
  });

  async function loadExistingRecipes() {
    loadingRecipes = true;
    try {
      const authState = get(auth);
      existingRecipes = await listRecipes(authState.user?.id);
    } catch {
      existingRecipes = [];
    } finally {
      loadingRecipes = false;
    }
  }

  // --- Derived selected models ---
  const selectedLocalModels = $derived(
    localModels.filter((m) => selectedIds.has(m.id))
  );

  const totalSelected = $derived(selectedLocalModels.length + selectedHFModels.length);

  // --- Run ---
  function runSelected() {
    if (totalSelected === 0) return;

    const allModels = [
      ...selectedLocalModels.map((m) => ({
        hf_model_id: m.hf_model_id,
        file_path: m.file_path,
        data_type: m.data_type,
        runtime: m.runtime,
        backends: selectedBackends,
        iterations: selectedIterations,
      })),
      ...selectedHFModels.map((m) => ({
        ...m,
        backends: selectedBackends,
        iterations: selectedIterations,
      })),
    ];

    try {
      sessionStorage.setItem('hf_ext_models', JSON.stringify(allModels));
      sessionStorage.removeItem('model_selection');
    } catch {}

    const ids = selectedLocalModels.map((m) => m.id).join(',');
    window.location.href = `/run?models=${ids}`;
  }

  // --- Save as Recipe ---
  async function saveRecipe() {
    saveError = '';
    const authState = get(auth);
    if (!authState.user) return;

    const recipeModels: RecipeModel[] = [
      ...selectedLocalModels.map((m) => ({
        hf_model_id: m.hf_model_id,
        file_path: m.file_path,
        data_type: m.data_type,
        backends: selectedBackends,
      })),
      ...selectedHFModels.map((m) => ({
        hf_model_id: m.hf_model_id,
        file_path: m.file_path,
        data_type: m.data_type,
        backends: selectedBackends,
      })),
    ];

    saving = true;
    try {
      if (recipeMode === 'new') {
        if (!recipeName.trim()) return;
        await createRecipe(authState.user.id, recipeName.trim(), recipeModels);
        sessionStorage.removeItem('model_selection');
        goto('/recipe');
      } else {
        if (!selectedRecipeId) return;
        const target = existingRecipes.find((r) => r.id === selectedRecipeId);
        if (!target) return;
        const merged = [...target.models, ...recipeModels];
        await updateRecipe(selectedRecipeId, { models: merged });
        sessionStorage.removeItem('model_selection');
        goto(`/recipe`);
      }
    } catch (e: any) {
      saveError = e.message ?? 'Failed to save recipe';
    } finally {
      saving = false;
    }
  }

  function basename(path: string): string {
    return path.split('/').pop() ?? path;
  }
</script>

{#if open}
  <div class="panel-backdrop" role="presentation" onclick={onclose} onkeydown={() => {}}></div>
{/if}

<div class="action-panel" class:open>
  <div class="panel-header">
    <span class="panel-title">Actions</span>
    <button class="panel-close" onclick={onclose} aria-label="Close">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>

  <div class="panel-body">
    <!-- Selected models -->
    <section class="panel-section">
      <div class="section-label">
        Selected models
        <span class="count-badge">{totalSelected}</span>
      </div>
      {#if totalSelected === 0}
        <p class="empty-hint">No models selected.</p>
      {:else}
        <ul class="model-list">
          {#each selectedLocalModels as m (m.id)}
            <li class="model-row">
              <div class="model-info">
                <span class="model-name" title={m.file_path}>{basename(m.file_path)}</span>
                <span class="model-meta">{m.hf_model_id}</span>
              </div>
              <div class="model-tags">
                {#if m.data_type}
                  <span class="tag tag-dtype" data-dtype={m.data_type}>{m.data_type}</span>
                {/if}
              </div>
              <button class="deselect-btn" onclick={() => ondeselect?.(m.id)} aria-label="Remove {m.hf_model_id}">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </li>
          {/each}
          {#each selectedHFModels as m (`${m.hf_model_id}::${m.file_path}`)}
            <li class="model-row hf-row">
              <div class="model-info">
                <span class="model-name" title={m.file_path}>{basename(m.file_path)}</span>
                <span class="model-meta">{m.hf_model_id}</span>
              </div>
              <div class="model-tags">
                {#if m.data_type}
                  <span class="tag tag-dtype" data-dtype={m.data_type}>{m.data_type}</span>
                {/if}
              </div>
              <button class="deselect-btn" onclick={() => ondeselecthf?.(m.hf_model_id, m.file_path)} aria-label="Remove {m.hf_model_id}">
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

    <!-- Backend picker -->
    <section class="panel-section">
      <div class="section-label">Backends</div>
      <div class="backend-grid">
        {#each BACKENDS as b}
          <button
            class="backend-btn"
            class:active={selectedBackends.includes(b.id)}
            onclick={() => toggleBackend(b.id)}
          >
            {b.label}
          </button>
        {/each}
      </div>
    </section>

    <!-- Iterations -->
    <section class="panel-section">
      <div class="section-label">Iterations</div>
      <div class="backend-grid">
        {#each ITERATION_OPTIONS as opt}
          <button
            class="backend-btn"
            class:active={selectedIterations === opt}
            onclick={() => selectedIterations = opt}
          >{opt}</button>
        {/each}
      </div>
    </section>

    <!-- Recipe section (auth-gated) -->
    {#if $isAuthenticated}
      <section class="panel-section">
        <div class="section-label">Save as Recipe</div>
        <div class="recipe-mode-tabs">
          <button
            class="mode-tab"
            class:active={recipeMode === 'new'}
            onclick={() => { recipeMode = 'new'; }}
          >New</button>
          <button
            class="mode-tab"
            class:active={recipeMode === 'append'}
            onclick={() => { recipeMode = 'append'; }}
          >Add to existing</button>
        </div>

        {#if recipeMode === 'new'}
          <input
            class="recipe-input"
            type="text"
            placeholder="Recipe name..."
            bind:value={recipeName}
            onkeydown={(e) => { if (e.key === 'Enter') saveRecipe(); }}
          />
        {:else}
          {#if loadingRecipes}
            <p class="hint">Loading recipes...</p>
          {:else if existingRecipes.length === 0}
            <p class="hint">No recipes yet. Create one first.</p>
          {:else}
            <select class="recipe-select" bind:value={selectedRecipeId}>
              <option value="">Select a recipe...</option>
              {#each existingRecipes as r (r.id)}
                <option value={r.id}>{r.name}</option>
              {/each}
            </select>
          {/if}
        {/if}

        {#if saveError}
          <p class="save-error">{saveError}</p>
        {/if}

        <button
          class="btn-save-recipe"
          onclick={saveRecipe}
          disabled={saving || totalSelected === 0 || (recipeMode === 'new' ? !recipeName.trim() : !selectedRecipeId)}
        >
          {saving ? 'Saving...' : recipeMode === 'new' ? 'Save Recipe' : 'Append to Recipe'}
        </button>
      </section>
    {/if}
  </div>

  <!-- Run footer always visible -->
  <div class="panel-footer">
    <button class="btn-run" onclick={runSelected} disabled={totalSelected === 0}>
      Run {totalSelected} model{totalSelected !== 1 ? 's' : ''}
    </button>
  </div>
</div>

<style>
  .panel-backdrop {
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-overlay) - 1);
  }

  .action-panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 360px;
    background: var(--color-surface-raised);
    border-left: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    z-index: var(--z-overlay);
    transform: translateX(100%);
    transition: transform var(--transition-slow);
    box-shadow: var(--shadow-overlay);
  }

  .action-panel.open {
    transform: translateX(0);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-3) var(--space-2);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .panel-title {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .panel-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background var(--transition-base), color var(--transition-base);
  }

  .panel-close:hover {
    background: var(--color-surface-sunken);
    color: var(--color-text-primary);
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2) var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .panel-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .section-label {
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

  .empty-hint {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .model-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .model-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: 5px 7px;
    border-radius: var(--radius-base);
    background: var(--color-surface-sunken);
    min-width: 0;
  }

.model-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .model-name {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .model-meta {
    font-size: 11px;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

.model-tags {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
  }

.deselect-btn {
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

  .deselect-btn:hover {
    background: var(--color-error);
    color: #fff;
  }

  /* Backend grid */
  .backend-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-half);
  }

  .backend-btn {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    padding: var(--space-half) var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-base);
    white-space: nowrap;
  }

  .backend-btn:hover {
    border-color: var(--color-border-strong);
  }

  .backend-btn.active {
    background: var(--color-primary);
    color: #fff;
    border-color: var(--color-primary);
  }

  /* Recipe */
  .recipe-mode-tabs {
    display: flex;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    overflow: hidden;
  }

  .mode-tab {
    flex: 1;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-half) var(--space-1);
    border: none;
    background: var(--color-surface-sunken);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background var(--transition-base), color var(--transition-base);
  }

  .mode-tab + .mode-tab {
    border-left: 1px solid var(--color-border);
  }

  .mode-tab.active {
    background: var(--color-surface);
    color: var(--color-text-primary);
    font-weight: 500;
  }

  .recipe-input,
  .recipe-select {
    width: 100%;
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

  .recipe-input:focus,
  .recipe-select:focus {
    border-color: var(--color-focus-ring);
  }

  .hint {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .save-error {
    font-size: var(--text-sm);
    color: var(--color-error);
  }

  .btn-save-recipe {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    width: 100%;
    padding: 10px 20px;
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-primary);
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-save-recipe:hover:not(:disabled) {
    background: var(--color-accent-light);
  }

  .btn-save-recipe:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Footer */
  .panel-footer {
    padding: var(--space-2) var(--space-3);
    border-top: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .btn-run {
    width: 100%;
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: 10px 20px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--color-primary);
    color: #fff;
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-run:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .btn-run:disabled {
    background: var(--color-disabled);
    color: var(--color-text-muted);
    cursor: not-allowed;
  }

  /* dtype colors (same as HFSearch/HFUrlImport) */
  .tag-dtype[data-dtype="fp32"]      { color: var(--color-primary); border-color: var(--color-primary); }
  .tag-dtype[data-dtype="fp16"]      { color: #8b5cf6; border-color: #8b5cf6; }
  .tag-dtype[data-dtype="bf16"]      { color: #7c3aed; border-color: #7c3aed; }
  .tag-dtype[data-dtype="fp8"]       { color: #a855f7; border-color: #a855f7; }
  .tag-dtype[data-dtype="int8"]      { color: #06b6d4; border-color: #06b6d4; }
  .tag-dtype[data-dtype="uint8"]     { color: #0891b2; border-color: #0891b2; }
  .tag-dtype[data-dtype="int4"]      { color: #10b981; border-color: #10b981; }
  .tag-dtype[data-dtype="uint4"]     { color: #059669; border-color: #059669; }
  .tag-dtype[data-dtype="q4"]        { color: #16a34a; border-color: #16a34a; }
  .tag-dtype[data-dtype="q4f16"]     { color: #6366f1; border-color: #6366f1; }
  .tag-dtype[data-dtype="bnb4"]      { color: #f59e0b; border-color: #f59e0b; }
  .tag-dtype[data-dtype="quantized"] { color: #ea580c; border-color: #ea580c; }
</style>
