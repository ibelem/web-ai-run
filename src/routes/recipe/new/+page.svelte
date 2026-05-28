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

  let recipeModels = $derived(hfModels.map((m) => ({
    hf_model_id: m.hf_model_id,
    file_path: m.file_path,
    data_type: m.data_type,
    size_bytes: m.size_bytes,
  })));

  type LinkRow = { label: string; url: string };
  let description = $state('');
  let links = $state<LinkRow[]>([{ label: '', url: '' }]);

  function addLink() {
    if (links.length < 10) links = [...links, { label: '', url: '' }];
  }

  function removeLink(i: number) {
    links = links.filter((_, idx) => idx !== i);
    if (links.length === 0) links = [{ label: '', url: '' }];
  }

  function formatSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)}G`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)}M`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}K`;
    return `${bytes}B`;
  }

  let hfSearchQuery = $state('');
  let hfModels = $state<SelectedHFModel[]>([]);

  const isHFUrl = $derived((() => {
    try { return new URL(hfSearchQuery.trim()).hostname === 'huggingface.co'; }
    catch { return false; }
  })());

  function removeModel(index: number) {
    const removed = recipeModels[index];
    hfModels = hfModels.filter(
      (m) => !(m.hf_model_id === removed.hf_model_id && m.file_path === removed.file_path)
    );
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
      await createRecipe(
        data.userId,
        recipeName.trim(),
        recipeModels,
        visibility,
        description.trim() || null,
        links.filter(l => l.url.trim()).map(l => ({ ...(l.label ? { label: l.label } : {}), url: l.url }))
      );
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
                  {#if m.data_type}
                    <span class="dtype-chip" data-dtype={m.data_type}>{m.data_type === 'quantized' ? 'quant' : m.data_type}</span>
                  {/if}
                </div>
                <div class="model-item-bottom">
                  <FormatIcon format={ext} size={14} />
                  <span class="model-item-name">{m.file_path}</span>
                  {#if m.size_bytes}
                    <span class="model-item-size">{formatSize(m.size_bytes)}</span>
                  {/if}
                </div>
              </div>
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
        <HFUrlImport url={hfSearchQuery.trim()} bind:selectedHFModels={hfModels} localModels={recipeModels} />
      {:else if hfSearchQuery.trim()}
        <HFSearch searchQuery={hfSearchQuery} bind:selectedHFModels={hfModels} localModels={recipeModels} />
      {/if}
    </section>

    <!-- Metadata section -->
    <section class="zone">
      <div class="zone-label">Metadata</div>

      <label class="meta-label" for="recipe-description">Description</label>
      <textarea
        id="recipe-description"
        class="meta-textarea"
        rows="3"
        placeholder="Describe what this recipe does…"
        bind:value={description}
      ></textarea>

      <div class="links-label-row">
        <span class="meta-label">Links</span>
        <button
          type="button"
          class="btn-add-link"
          onclick={addLink}
          disabled={links.length >= 10}
        >+ Add link</button>
      </div>

      <div class="links-list">
        {#each links as link, i (i)}
          <div class="link-row">
            <input
              type="text"
              class="link-label-input"
              placeholder="Label (optional)"
              bind:value={link.label}
            />
            <input
              type="url"
              class="link-url-input"
              placeholder="https://…"
              bind:value={link.url}
            />
            <button
              type="button"
              class="remove-btn"
              onclick={() => removeLink(i)}
              aria-label="Remove link"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        {/each}
      </div>
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
    .meta-row { flex-direction: column; align-items: stretch; }
    .name-input { width: 100%; height: 36px; }
    .visibility-tabs { min-width: 0; width: 100%; height: 36px; }
    .visibility-tab { flex: 1; }
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
    padding: var(--space-1) var(--space-3);
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
    color: var(--color-text-on-primary);
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
    color: var(--color-text-on-primary);
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
    align-items: flex-start;
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

  .model-item-top :global(.dtype-chip),
  .model-item-bottom .model-item-size {
    margin-left: auto;
    flex-shrink: 0;
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

  .model-item-size {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-text-muted);
    padding: 1px 7px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    white-space: nowrap;
    flex-shrink: 0;
    min-width: 48px;
    text-align: center;
    box-sizing: border-box;
  }

  /* dtype-chip uses global styles from app.css */

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
    background: var(--color-error);
    color: var(--color-text-on-primary);
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
    height: auto !important;
    padding: var(--space-1) 32px !important;
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
    padding: var(--space-1) var(--space-3);
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
    padding: var(--space-1) var(--space-3);
    border: none;
    border-radius: var(--radius-base);
    background: var(--color-primary);
    color: var(--color-text-on-primary);
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

  .meta-label {
    display: block;
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-muted);
    margin-bottom: 4px;
  }

  .meta-textarea {
    width: 100%;
    resize: vertical;
  }

  .meta-textarea:focus-visible {
    border-color: var(--color-focus-ring);
    outline: none;
  }

  .links-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .btn-add-link {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 2px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: border-color var(--transition-base), color var(--transition-base);
  }

  .btn-add-link:hover:not(:disabled) {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .btn-add-link:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .links-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .link-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .link-label-input {
    width: 130px;
    flex-shrink: 0;
  }

  .link-url-input {
    flex: 1;
    min-width: 0;
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

    .link-row {
      flex-direction: column;
      align-items: stretch;
    }

    .link-label-input {
      width: 100%;
    }
  }
</style>
