<script lang="ts">
  import { goto } from '$app/navigation';
  import { createClient } from '$lib/supabase/client';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  // svelte-ignore state_referenced_locally
  const { userId } = data;
  // svelte-ignore state_referenced_locally
  let recipe = $state<any>(data.recipe);
  const isOwner = recipe.owner_id === userId;
  const supabase = createClient();

  let copyFeedback = $state(false);

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatSize(bytes?: number): string {
    if (!bytes || bytes < 1_000_000) return '';
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    return `${(bytes / 1_048_576).toFixed(0)} MB`;
  }

  function runRecipe() {
    const models: { hf_model_id: string; data_type: string }[] = recipe.models ?? [];
    const hash = new URLSearchParams();
    if (models.length) {
      hash.set('llm', models.map(m => `${m.hf_model_id}|${m.data_type}`).join(','));
    }
    goto(`/llm/run#${hash}`);
  }

  async function copyShareLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/llm/recipe/${recipe.slug}`);
    copyFeedback = true;
    setTimeout(() => { copyFeedback = false; }, 2000);
  }

  async function handleDelete() {
    if (!confirm(`Delete "${recipe.name}"?`)) return;
    await (supabase.from('recipes') as any).delete().eq('id', recipe.id);
    goto('/llm/recipe');
  }

  // Check button — same logic as new/edit pages
  const REQUIRED_FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json'];
  type CheckStatus = 'idle' | 'checking' | 'ok' | 'not-found' | 'error';
  let checkStatuses = $state<Record<string, CheckStatus>>({});
  let checking = $state(false);

  async function checkAllModels() {
    checking = true;
    const initial: Record<string, CheckStatus> = {};
    for (const m of (recipe.models ?? [])) initial[`${m.hf_model_id}::${m.data_type}`] = 'checking';
    checkStatuses = { ...initial };

    await Promise.all((recipe.models ?? []).map(async (m: any) => {
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
</script>

<div class="recipe-page">
  <header class="page-header">
    <div class="page-header-text">
      <h1>{recipe.name}</h1>
      <p>
        {(recipe.models ?? []).length} model{(recipe.models ?? []).length !== 1 ? 's' : ''}
        &middot; {recipe.visibility}
        &middot; Updated {formatDate(recipe.updated_at)}
      </p>
    </div>
    <div class="header-actions">
      <button class="btn-run" onclick={runRecipe}>Run</button>
      <button class="btn-share" onclick={copyShareLink}>{copyFeedback ? 'Copied!' : 'Share'}</button>
      <button class="btn-check" onclick={checkAllModels} disabled={checking} title="Check if all model files are reachable on Hugging Face">
        {#if checking}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        {:else}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        {/if}
        Check
      </button>
      <a href="/llm/recipe/new?fork={recipe.slug}" class="btn-fork">Fork</a>
      {#if isOwner}
        <a href="/llm/recipe/{recipe.slug}/edit" class="btn-edit">Edit</a>
        <button class="btn-delete" onclick={handleDelete}>Delete</button>
      {/if}
    </div>
  </header>

  {#if recipe.owner_display_name}
    <div class="owner-row">
      {#if recipe.owner_avatar_url}
        <img src={recipe.owner_avatar_url} alt="" class="owner-avatar" crossorigin="anonymous" />
      {:else}
        <span class="owner-avatar owner-avatar-placeholder">{(recipe.owner_display_name ?? '?')[0].toUpperCase()}</span>
      {/if}
      <span class="owner-name">{recipe.owner_display_name}</span>
    </div>
  {/if}

  {#if recipe.description}
    <p class="recipe-description">{recipe.description}</p>
  {/if}

  <div class="models-section">
    <div class="zone-label">
      Models
      <span class="count-badge">{(recipe.models ?? []).length}</span>
    </div>
    {#if (recipe.models ?? []).length === 0}
      <div class="empty-models"><p>No models in this recipe.</p></div>
    {:else}
      <ul class="model-list">
        {#each recipe.models as m}
          {@const ck = checkStatuses[`${m.hf_model_id}::${m.data_type}`] ?? 'idle'}
          <li class="model-item">
            <div class="model-item-left">
              <div class="model-item-top">
                <a class="model-item-repo" href="https://huggingface.co/{m.hf_model_id}" target="_blank" rel="noopener">{m.hf_model_id}</a>
                <span class="model-item-right">
                  <span class="dtype-chip" data-dtype={m.data_type}>{m.data_type}</span>
                  {#if formatSize(m.size_bytes)}
                    <span class="model-item-size">{formatSize(m.size_bytes)}</span>
                  {/if}
                </span>
              </div>
            </div>
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
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  {#if recipe.links?.length}
    <div class="links-section">
      {#each recipe.links as l}
        <a class="recipe-link" href={l} target="_blank" rel="noopener">{l}</a>
      {/each}
    </div>
  {/if}
</div>

<style>
  .recipe-page { max-width: 100%; }

  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .page-header-text h1 {
    font-size: var(--text-xl);
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .page-header-text p {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 2px 0 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .btn-run, .btn-share, .btn-edit, .btn-fork, .btn-delete {
    display: inline-flex;
    align-items: center;
    height: 32px;
    padding: 0 var(--space-3);
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    border-radius: var(--radius-base);
    border: none;
    cursor: pointer;
    text-decoration: none;
    white-space: nowrap;
    transition: background var(--transition-base), opacity var(--transition-base);
  }

  .btn-run {
    background: var(--color-primary);
    color: var(--color-text-on-primary);
  }

  .btn-run:hover { background: var(--color-primary-hover); }

  .btn-share {
    background: none;
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
  }

  .btn-share:hover { border-color: var(--color-primary); color: var(--color-primary); }

  .btn-edit, .btn-fork {
    background: none;
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
  }

  .btn-edit:hover, .btn-fork:hover { border-color: var(--color-primary); color: var(--color-primary); }

  .btn-delete {
    background: none;
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
  }

  .btn-delete:hover {
    background: var(--color-error);
    border-color: var(--color-error);
    color: var(--color-text-on-primary);
  }

  .btn-check {
    display: inline-flex;
    align-items: center;
    height: 32px;
    gap: 5px;
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: 0 var(--space-3);
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

  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 0.8s linear infinite; }

  .owner-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: var(--space-2);
  }

  .owner-avatar { width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0; }

  .owner-avatar-placeholder {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface-sunken);
    border: 1px solid var(--color-border);
    font-size: 10px;
    font-weight: 600;
    color: var(--color-text-secondary);
    width: 18px;
    height: 18px;
    border-radius: 50%;
  }

  .owner-name { font-size: var(--text-xs); color: var(--color-text-secondary); }

  .recipe-description {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-2);
  }

  .models-section { margin-bottom: var(--space-3); }

  .zone-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--color-text-muted);
    margin-bottom: var(--space-1);
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

  .model-item-left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; overflow: hidden; }

  .model-item-top, .model-item-bottom {
    display: flex;
    align-items: center;
    gap: 5px;
    overflow: hidden;
  }

  .model-item-right {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    flex-shrink: 0;
  }

  .model-item-repo {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
    text-decoration: none;
    min-width: 0;
  }

  .model-item-repo:hover { text-decoration: underline; }

  .model-item-size {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .check-icon { display: inline-flex; align-items: center; flex-shrink: 0; }
  .check-checking { color: var(--color-text-muted); }
  .check-ok       { color: var(--color-success, #16a34a); }
  .check-not-found { color: var(--color-error); }
  .check-error    { color: var(--color-warning, #f59e0b); }

  .links-section { display: flex; flex-direction: column; gap: 4px; margin-bottom: var(--space-3); }

  .recipe-link {
    font-size: var(--text-xs);
    color: var(--color-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 768px) {
    .page-header { flex-direction: column; }
    .header-actions { width: 100%; }
    .btn-run, .btn-share, .btn-edit, .btn-fork, .btn-delete, .btn-check { flex: 1; justify-content: center; }
  }
</style>
