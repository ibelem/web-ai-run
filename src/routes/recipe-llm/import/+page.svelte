<script lang="ts">
  import { goto } from '$app/navigation';
  import { deserialize } from '$app/forms';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const TEMPLATE = `# Recipe name

## Description
Optional description of what this recipe benchmarks.

## Models
- onnx-community/Phi-4-mini-instruct-ONNX q4f16
- onnx-community/Phi-3.5-mini-instruct-onnx-web q4f16
`;

  let markdown = $state(TEMPLATE);
  let importing = $state(false);
  let errorMsg = $state('');
  let mergeResult = $state('');

  // Mode
  type Mode = 'create' | 'merge';
  let mode = $state<Mode>('create');
  let selectedRecipeId = $state('');

  // ── Markdown parser ────────────────────────────────────────────────────────
  interface ParsedRecipe {
    name: string;
    description: string;
    models: { hf_model_id: string; data_type: string }[];
  }

  function parseMarkdown(md: string): ParsedRecipe | null {
    const lines = md.split('\n').map(l => l.trimEnd());
    const nameLine = lines.find(l => l.startsWith('# '));
    const name = nameLine?.replace(/^#\s+/, '').trim() ?? '';
    if (!name) return null;

    let description = '';
    const descStart = lines.findIndex(l => l.match(/^##\s+description/i));
    if (descStart !== -1) {
      const descLines: string[] = [];
      for (let i = descStart + 1; i < lines.length; i++) {
        if (lines[i].startsWith('##')) break;
        descLines.push(lines[i]);
      }
      description = descLines.join('\n').trim();
    }

    const models: { hf_model_id: string; data_type: string }[] = [];
    const modelsStart = lines.findIndex(l => l.match(/^##\s+models/i));
    if (modelsStart !== -1) {
      for (let i = modelsStart + 1; i < lines.length; i++) {
        if (lines[i].startsWith('##')) break;
        const m = lines[i].match(/^[-*]\s+(\S+)\s+(\S+)/);
        if (m) models.push({ hf_model_id: m[1], data_type: m[2] });
      }
    }

    if (!name || models.length === 0) return null;
    return { name, description, models };
  }

  const parsed = $derived(parseMarkdown(markdown));
  const isEdited = $derived(markdown.trim() !== TEMPLATE.trim());
  const canImport = $derived(
    !!parsed && isEdited &&
    (mode === 'create' || selectedRecipeId.length > 0)
  );

  // ── Check ──────────────────────────────────────────────────────────────────
  const REQUIRED_FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json'];
  type CheckStatus = 'idle' | 'checking' | 'ok' | 'not-found' | 'error';
  let checkStatuses = $state<Record<string, CheckStatus>>({});
  let checking = $state(false);

  // Reset check statuses when markdown changes
  $effect(() => { void markdown; checkStatuses = {}; });

  async function checkAllModels() {
    if (!parsed) return;
    checking = true;
    const initial: Record<string, CheckStatus> = {};
    for (const m of parsed.models) initial[`${m.hf_model_id}::${m.data_type}`] = 'checking';
    checkStatuses = { ...initial };

    await Promise.all(parsed.models.map(async m => {
      const key = `${m.hf_model_id}::${m.data_type}`;
      try {
        const res = await fetch(`https://huggingface.co/api/models/${m.hf_model_id}/tree/main?recursive=true`);
        if (!res.ok) { checkStatuses = { ...checkStatuses, [key]: res.status === 404 ? 'not-found' : 'error' }; return; }
        const tree: any[] = await res.json();
        const paths = new Set(tree.map((f: any) => f.path ?? ''));
        const missing = REQUIRED_FILES.filter(f => !paths.has(f));
        if (missing.length > 0) { checkStatuses = { ...checkStatuses, [key]: 'error' }; return; }
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

  function switchMode(m: Mode) {
    mode = m;
    selectedRecipeId = '';
    mergeResult = '';
    errorMsg = '';
  }

  // ── Import ─────────────────────────────────────────────────────────────────
  async function doImport() {
    errorMsg = '';
    mergeResult = '';
    if (!parsed) { errorMsg = 'Could not parse recipe. Make sure you have a # Name and at least one model under ## Models.'; return; }

    importing = true;
    const fd = new FormData();
    fd.set('json', JSON.stringify({ name: parsed.name, description: parsed.description || null, models: parsed.models }));

    if (mode === 'merge') {
      fd.set('recipeId', selectedRecipeId);
      const res = await fetch('?/merge', { method: 'POST', body: fd });
      const result: any = deserialize(await res.text());
      importing = false;
      if (result?.type === 'failure' || result?.data?.error) { errorMsg = result.data?.error ?? 'Merge failed'; return; }
      if (result?.data?.success) {
        mergeResult = `Added ${result.data.added} model${result.data.added !== 1 ? 's' : ''}, skipped ${result.data.skipped} duplicate${result.data.skipped !== 1 ? 's' : ''}.`;
        setTimeout(() => goto(`/recipe-llm/${result.data.slug}`), 1500);
      }
    } else {
      const res = await fetch('?/import', { method: 'POST', body: fd });
      const result: any = deserialize(await res.text());
      importing = false;
      if (result?.type === 'failure' || result?.data?.error) { errorMsg = result.data?.error ?? 'Import failed'; return; }
      if (result?.data?.slug) goto(`/recipe-llm/${result.data.slug}`);
    }
  }
</script>

<div class="import-page">
  <header class="page-header">
    <div class="page-header-text">
      <h1>Import LLM Recipe</h1>
      <p>Edit the template below, then click Import.</p>
    </div>
    <a href="/recipe-llm" class="btn-cancel">Cancel</a>
  </header>

  <!-- Markdown editor -->
  <section class="zone">
    <div class="zone-label">Recipe</div>
    <p class="zone-hint">
      Format: <code># Recipe name</code>, optional <code>## Description</code>, then <code>## Models</code> with one <code>- org/repo dtype</code> per line.
    </p>
    <textarea
      class="md-input"
      rows="10"
      bind:value={markdown}
      spellcheck="false"
    ></textarea>
  </section>

  <!-- Live preview of parsed models -->
  {#if parsed && isEdited}
    <section class="zone">
      <div class="zone-label">
        Parsed: {parsed.name}
        {#if parsed.models.length > 0}
          <span class="count-badge">{parsed.models.length}</span>
        {/if}
      </div>
      {#if parsed.models.length === 0}
        <div class="empty-models"><p>No models found under ## Models.</p></div>
      {:else}
        <ul class="model-list">
          {#each parsed.models as m}
            {@const ck = checkStatuses[`${m.hf_model_id}::${m.data_type}`] ?? 'idle'}
            <li class="model-item">
              <div class="model-item-left">
                <span class="model-item-repo">{m.hf_model_id}</span>
              </div>
              <div class="model-item-meta">
                <span class="dtype-chip" data-dtype={m.data_type}>{m.data_type}</span>
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
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <!-- Mode toggle -->
    <div class="mode-toggle">
      <button class="mode-btn" class:active={mode === 'create'} onclick={() => switchMode('create')}>Create new recipe</button>
      <button class="mode-btn" class:active={mode === 'merge'} onclick={() => switchMode('merge')}>Add to existing recipe</button>
    </div>

    {#if mode === 'merge'}
      <section class="zone">
        <div class="zone-label">Select recipe to update</div>
        <div class="field-row">
          {#if data.myRecipes.length === 0}
            <p class="no-recipes">You don't have any LLM recipes yet. <a href="/recipe-llm/new">Create one first.</a></p>
          {:else}
            <select class="recipe-select" bind:value={selectedRecipeId}>
              <option value="">— Choose a recipe —</option>
              {#each data.myRecipes as r (r.id)}
                <option value={r.id}>{r.name} ({r.modelCount} model{r.modelCount !== 1 ? 's' : ''})</option>
              {/each}
            </select>
          {/if}
        </div>
      </section>
    {/if}
  {/if}

  {#if errorMsg}
    <p class="error-text">{errorMsg}</p>
  {/if}

  {#if mergeResult}
    <p class="merge-result">{mergeResult}</p>
  {/if}

  <div class="save-bar">
    {#if !parsed && isEdited}
      <p class="save-hint">Could not parse — check the format above.</p>
    {/if}
    <div class="save-actions">
      {#if parsed?.models.length}
        <button class="btn-check" onclick={checkAllModels} disabled={checking} title="Verify required files exist on Hugging Face">
          {#if checking}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          {:else}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          {/if}
          Check
        </button>
      {/if}
      <button class="btn-save" onclick={doImport} disabled={importing || !canImport}>
        {#if importing}
          {mode === 'merge' ? 'Merging…' : 'Importing…'}
        {:else}
          {mode === 'merge' ? 'Add to Recipe' : 'Import recipe'}
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .import-page { max-width: 100%; display: flex; flex-direction: column; gap: var(--space-3); }

  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .page-header-text h1 {
    font-size: var(--text-xl);
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .page-header-text p { font-size: var(--text-sm); color: var(--color-text-muted); margin: 2px 0 0; }

  .btn-cancel {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-secondary);
    text-decoration: none;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background var(--transition-base);
  }

  .btn-cancel:hover { background: var(--color-surface-sunken); }

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

  .zone-hint { font-size: var(--text-xs); color: var(--color-text-muted); margin: 0; }

  code {
    font-family: var(--font-mono);
    font-size: 11px;
    background: var(--color-surface-sunken);
    padding: 1px 4px;
    border-radius: var(--radius-sm);
  }

  .md-input {
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.6;
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    padding: var(--space-2);
  }

  .md-input:focus-visible { border-color: var(--color-focus-ring); outline: none; }

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
  .model-item-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }

  .check-icon { display: inline-flex; align-items: center; flex-shrink: 0; }
  .check-checking { color: var(--color-text-muted); }
  .check-ok       { color: var(--color-success, #16a34a); }
  .check-not-found { color: var(--color-error); }
  .check-error    { color: var(--color-warning, #f59e0b); }

  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 0.8s linear infinite; }

  /* Mode toggle */
  .mode-toggle {
    display: flex;
    border-radius: var(--radius-base);
    overflow: hidden;
    width: fit-content;
  }

  .mode-btn {
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

  .mode-btn + .mode-btn { border-left: none; }

  .mode-btn.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-text-on-primary);
  }

  /* Merge recipe select */
  .field-row { display: flex; flex-direction: column; gap: 4px; }

  .recipe-select { width: 100%; max-width: 400px; }
  .recipe-select:focus-visible { border-color: var(--color-focus-ring); outline: none; }

  .no-recipes { font-size: var(--text-sm); color: var(--color-text-muted); margin: 0; }
  .no-recipes a { color: var(--color-primary); text-decoration: none; }
  .no-recipes a:hover { text-decoration: underline; }

  .error-text { color: var(--color-error); font-size: var(--text-sm); margin: 0; }
  .merge-result { font-size: var(--text-sm); color: var(--color-text-secondary); margin: 0; }

  .save-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding-top: var(--space-2);
  }

  .save-hint { font-size: var(--text-sm); color: var(--color-text-muted); }

  .save-actions { display: flex; gap: var(--space-1); margin-left: auto; }

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
</style>
