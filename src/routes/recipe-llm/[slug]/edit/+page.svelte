<script lang="ts">
  import { goto } from '$app/navigation';
  import { deserialize } from '$app/forms';
  import type { PageData } from './$types';
  import type { LLMRecipeModel } from '$lib/engine/types';
  import LlmHFSearch from '$lib/components/LlmHFSearch.svelte';

  let { data }: { data: PageData } = $props();

  // Initial values from server-loaded recipe; intentionally read once.
  // svelte-ignore state_referenced_locally
  let recipeName = $state(data.recipe.name ?? '');
  // svelte-ignore state_referenced_locally
  let visibility = $state<'personal' | 'public'>(data.recipe.visibility ?? 'personal');
  // svelte-ignore state_referenced_locally
  let description = $state(data.recipe.description ?? '');
  // svelte-ignore state_referenced_locally
  let models = $state<LLMRecipeModel[]>(data.recipe.models ?? []);
  let hfSearchQuery = $state('');
  let saving = $state(false);
  let errorMsg = $state('');

  const canSave = $derived(recipeName.trim().length > 0);

  function formatSize(bytes?: number): string {
    if (!bytes || bytes < 1_000_000) return '';
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    return `${(bytes / 1_048_576).toFixed(0)} MB`;
  }

  type CheckStatus = 'idle' | 'checking' | 'ok' | 'not-found' | 'error';
  let checkStatuses = $state<Record<string, CheckStatus>>({});
  let checking = $state(false);

  const REQUIRED_FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json'];

  async function checkAllModels() {
    checking = true;
    const initial: Record<string, CheckStatus> = {};
    for (const m of models) initial[`${m.hf_model_id}::${m.data_type}`] = 'checking';
    checkStatuses = { ...initial };

    await Promise.all(models.map(async (m) => {
      const key = `${m.hf_model_id}::${m.data_type}`;
      try {
        const res = await fetch(`https://huggingface.co/api/models/${m.hf_model_id}/tree/main?recursive=true`);
        if (!res.ok) { checkStatuses = { ...checkStatuses, [key]: res.status === 404 ? 'not-found' : 'error' }; return; }
        const tree: any[] = await res.json();
        const paths = new Set(tree.map((f: any) => f.path ?? ''));
        const missingRequired = REQUIRED_FILES.filter(f => !paths.has(f));
        if (missingRequired.length > 0) { checkStatuses = { ...checkStatuses, [key]: 'error' }; return; }
        const suffix = m.data_type === 'fp32' ? '' : `_${m.data_type}`;
        const hasOnnx = tree.some((f: any) => {
          const p: string = (f.path ?? '').toLowerCase();
          return p.endsWith('.onnx') && !p.includes('.onnx_data') && (suffix === '' || p.includes(suffix.toLowerCase()));
        });
        checkStatuses = { ...checkStatuses, [key]: hasOnnx ? 'ok' : 'not-found' };
      } catch {
        checkStatuses = { ...checkStatuses, [key]: 'error' };
      }
    }));
    checking = false;
  }

  function addModel(hfModelId: string, dtype: string, sizeBytes?: number) {
    if (models.some(m => m.hf_model_id === hfModelId && m.data_type === dtype)) return;
    models = [...models, { hf_model_id: hfModelId, data_type: dtype, size_bytes: sizeBytes }];
  }

  function removeModel(i: number) {
    models = models.filter((_, idx) => idx !== i);
  }

  async function save() {
    if (!recipeName.trim()) { errorMsg = 'Recipe name is required'; return; }
    saving = true; errorMsg = '';
    const fd = new FormData();
    fd.set('name', recipeName.trim());
    fd.set('visibility', visibility);
    fd.set('description', description.trim());
    fd.set('models', JSON.stringify(models));
    const res = await fetch('?/save', { method: 'POST', body: fd });
    const result: any = deserialize(await res.text());
    saving = false;
    if (result?.type === 'failure' || result?.data?.error) { errorMsg = result.data?.error ?? 'Save failed'; return; }
    if (result?.data?.deleted) { goto('/recipe-llm'); return; }
    goto(`/recipe-llm/${data.recipe.slug}`);
  }
</script>

<div class="edit-layout">

<aside class="recipe-sidebar">
  <div class="sidebar-header">
    <span class="sidebar-label">My LLM Recipes</span>
    <a href="/recipe-llm" class="sidebar-back">All</a>
  </div>
  <ul class="sidebar-list">
    <li>
      <a href="/recipe-llm/new" class="sidebar-item new-item">New Recipe</a>
    </li>
    {#each (data.recipes ?? []) as r (r.id)}
      <li>
        <a href="/recipe-llm/{r.slug}/edit" class="sidebar-item" class:active={r.slug === data.recipe.slug}>
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
    <h1>Edit LLM Recipe</h1>
    <a href="/recipe-llm/{data.recipe.slug}" class="btn-back">← Back</a>
  </header>

  <div class="meta-row">
    <input class="name-input" type="text" placeholder="Recipe name…" bind:value={recipeName} />
    <div class="visibility-tabs">
      <button class="visibility-tab" class:active={visibility === 'personal'} onclick={() => visibility = 'personal'}>Personal</button>
      <button class="visibility-tab" class:active={visibility === 'public'} onclick={() => visibility = 'public'}>Public</button>
    </div>
  </div>

  <section class="zone">
    <div class="zone-label">
      In this recipe
      {#if models.length > 0}
        <span class="count-badge">{models.length}</span>
      {/if}
    </div>
    {#if models.length === 0}
      <div class="empty-models"><p>No models — saving will delete this recipe.</p></div>
    {:else}
      <ul class="model-list">
        {#each models as m, i}
          {@const ck = checkStatuses[`${m.hf_model_id}::${m.data_type}`] ?? 'idle'}
          <li class="model-item">
            <div class="model-item-left">
              <span class="model-item-repo">{m.hf_model_id}</span>
            </div>
            <div class="model-item-meta">
              <span class="dtype-chip" data-dtype={m.data_type}>{m.data_type}</span>
              {#if formatSize(m.size_bytes)}
                <span class="model-item-size">{formatSize(m.size_bytes)}</span>
              {/if}
            </div>
            <div class="model-item-actions">
              {#if ck !== 'idle'}
                <span class="check-icon check-{ck}" title={ck === 'ok' ? 'Required files found' : ck === 'not-found' ? 'Missing ONNX or tokenizer files' : ck === 'checking' ? 'Checking…' : 'Request error'}>
                  {#if ck === 'checking'}
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  {:else if ck === 'ok'}
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {:else if ck === 'not-found'}
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {:else}
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  {/if}
                </span>
              {/if}
              <button class="remove-btn" onclick={() => removeModel(i)} aria-label="Remove">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="zone">
    <div class="zone-label">Add LLMs from Hugging Face</div>
    <div class="search-wrap">
      <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input class="search-input" type="text" placeholder="Search text-generation repos…" style="padding-left: 32px" bind:value={hfSearchQuery} />
      {#if hfSearchQuery}
        <button class="search-clear" onclick={() => hfSearchQuery = ''} aria-label="Clear">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      {/if}
    </div>
    <LlmHFSearch
      query={hfSearchQuery}
      localModels={models}
      onadd={(hfModelId, dtype, sizeBytes) => addModel(hfModelId, dtype, sizeBytes)}
    />
  </section>

  <section class="zone">
    <div class="zone-label">Description</div>
    <textarea class="meta-textarea" rows="3" placeholder="What is this recipe testing?" bind:value={description}></textarea>
  </section>

  {#if errorMsg}
    <p class="error-text">{errorMsg}</p>
  {/if}

  <div class="save-bar">
    {#if !canSave && models.length > 0}
      <p class="save-hint">Give your recipe a name.</p>
    {/if}
    <div class="save-actions">
      {#if models.length > 0}
        <button class="btn-check" onclick={checkAllModels} disabled={checking} title="Verify required files exist on Hugging Face for each model">
          {#if checking}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          {:else}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          {/if}
          Check
        </button>
      {/if}
      <a href="/recipe-llm/{data.recipe.slug}" class="btn-ghost">Cancel</a>
      <button class="btn-save" onclick={save} disabled={saving || !canSave}>
        {saving ? 'Saving…' : models.length === 0 ? 'Delete recipe' : 'Save changes'}
      </button>
    </div>
  </div>
</div><!-- /edit-page -->
</div><!-- /edit-layout -->

<style>
  .edit-layout {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
  }

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

  .edit-page { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-3); }

  .page-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .page-header h1 {
    font-size: var(--text-xl);
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .btn-back {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    text-decoration: none;
    transition: color var(--transition-base);
  }

  .btn-back:hover { color: var(--color-text-primary); }

  .meta-row { display: flex; gap: var(--space-1); align-items: center; }
  .name-input { flex: 1; }
  .name-input:focus-visible { border-color: var(--color-focus-ring); }

  .visibility-tabs { display: flex; border-radius: var(--radius-base); overflow: hidden; flex-shrink: 0; min-width: 146px; }

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
  .visibility-tab.active { background: var(--color-primary); border-color: var(--color-primary); color: var(--color-text-on-primary); }

  .zone { display: flex; flex-direction: column; gap: var(--space-1); }

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
    gap: 4px;
  }

  @media (max-width: 900px) { .model-list { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 600px) { .model-list { grid-template-columns: 1fr; } }

  .model-item {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: 8px 10px;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    min-width: 0;
    transition: border-color var(--transition-base), background var(--transition-base);
  }

  .model-item:hover { border-color: var(--color-primary); background: var(--color-accent-light); }
  .model-item-left { flex: 1; min-width: 0; overflow: hidden; }

  .model-item-repo {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }

  .model-item-meta { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .model-item-size { font-family: var(--font-mono); font-size: 11px; color: var(--color-text-muted); }
  .model-item-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }

  .remove-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: var(--radius-sm);
    border: none;
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: color var(--transition-base), background var(--transition-base);
  }

  .remove-btn:hover { color: var(--color-error); background: color-mix(in srgb, var(--color-error) 10%, transparent); }

  .search-wrap { position: relative; display: flex; align-items: center; }
  .search-icon { position: absolute; left: 10px; color: var(--color-text-muted); pointer-events: none; }
  .search-input { width: 100%; padding-left: 32px; }
  .search-input:focus-visible { border-color: var(--color-focus-ring); outline: none; }

  .search-clear {
    position: absolute;
    right: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: none;
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
  }

  .search-clear:hover { color: var(--color-text-primary); background: var(--color-surface-sunken); }

  .meta-textarea { width: 100%; box-sizing: border-box; resize: vertical; font-family: var(--font-ui); }
  .meta-textarea:focus-visible { border-color: var(--color-focus-ring); outline: none; }

  .error-text { color: var(--color-error); font-size: var(--text-sm); margin: 0; }

  .check-icon { display: inline-flex; align-items: center; flex-shrink: 0; }
  .check-checking { color: var(--color-text-muted); }
  .check-ok       { color: var(--color-success, #16a34a); }
  .check-not-found { color: var(--color-error); }
  .check-error    { color: var(--color-warning, #f59e0b); }

  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 0.8s linear infinite; }

  .btn-check {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-base);
    border: 1px solid var(--color-border);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    white-space: nowrap;
    transition: border-color var(--transition-base), color var(--transition-base);
  }

  .btn-check:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-primary); }
  .btn-check:disabled { opacity: 0.6; cursor: not-allowed; }

  .save-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding-top: var(--space-2);
  }

  .save-hint { font-size: var(--text-sm); color: var(--color-text-muted); }

  .save-actions { display: flex; gap: var(--space-1); margin-left: auto; }

  .btn-save {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-base);
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    cursor: pointer;
    transition: background var(--transition-base), border-color var(--transition-base);
  }

  .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-save:not(:disabled):hover { background: var(--color-primary-hover); border-color: var(--color-primary-hover); }

  .btn-ghost {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    text-decoration: none;
    transition: border-color var(--transition-base), color var(--transition-base);
  }

  .btn-ghost:hover { border-color: var(--color-primary); color: var(--color-primary); }

  @media (max-width: 768px) {
    .meta-row { flex-direction: column; align-items: stretch; }
    .visibility-tabs { min-width: 0; width: 100%; }
    .visibility-tab { flex: 1; }
  }
</style>
