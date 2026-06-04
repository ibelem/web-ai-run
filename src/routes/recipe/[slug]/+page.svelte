<script lang="ts">
  import { goto } from '$app/navigation';
  import { deleteRecipe, updateRecipe } from '$lib/recipes/crud';
  import type { Recipe } from '$lib/recipes/crud';
  import FormatIcon from '$lib/components/FormatIcon.svelte';
  import NetronLink from '$lib/components/NetronLink.svelte';

  let { data } = $props();

  function getFormat(filePath: string): string {
    if (filePath.endsWith('.tflite')) return 'tflite';
    if (filePath.endsWith('.litertlm')) return 'litertlm';
    if (filePath.endsWith('.task')) return 'task';
    return 'onnx';
  }

  function basename(path: string) {
    return path.split('/').pop() ?? path;
  }

  function formatSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)}G`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)}M`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}K`;
    return `${bytes}B`;
  }

  function runRecipe(recipe: Recipe) {
    try {
      sessionStorage.setItem('hf_ext_models', JSON.stringify(
        recipe.models.map((m) => ({
          hf_model_id: m.hf_model_id,
          file_path: m.file_path,
          data_type: m.data_type,
          runtime: (m.file_path.endsWith('.tflite') || m.file_path.endsWith('.litertlm')) ? 'litert' : 'onnx',
        }))
      ));
    } catch {}
    window.location.href = '/run';
  }

  async function handleDelete() {
    if (!confirm(`Delete "${data.recipe.name}"?`)) return;
    await deleteRecipe(data.recipe.id);
    goto('/recipe');
  }

  async function toggleVisibility() {
    const next = data.recipe.visibility === 'public' ? 'personal' : 'public';
    await updateRecipe(data.recipe.id, { visibility: next });
    data.recipe = { ...data.recipe, visibility: next };
  }

  let copyFeedback = $state(false);

  async function copyShareLink() {
    await navigator.clipboard.writeText(window.location.href);
    copyFeedback = true;
    setTimeout(() => { copyFeedback = false; }, 2000);
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function downloadFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function safeName() {
    return data.recipe.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  }

  function exportJSON() {
    const payload = {
      name: data.recipe.name,
      ...(data.recipe.description ? { description: data.recipe.description } : {}),
      ...((data.recipe.links?.length) ? { links: data.recipe.links } : {}),
      models: data.recipe.models.map((m: any) => ({
        hf_model_id: m.hf_model_id,
        file_path: m.file_path,
      })),
    };
    downloadFile(JSON.stringify(payload, null, 2), `${safeName()}.json`, 'application/json');
  }

  function exportCSV() {
    const rows = [
      ['hf_model_id', 'file_path'],
      ...data.recipe.models.map((m: any) => [m.hf_model_id, m.file_path]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadFile(csv, `${safeName()}.csv`, 'text/csv');
  }

  function exportMD() {
    const lines: string[] = [`# ${data.recipe.name}`, ''];
    if (data.recipe.description) {
      lines.push(data.recipe.description, '');
    }
    if (data.recipe.links?.length) {
      for (const l of data.recipe.links) {
        lines.push(`- [${l.label || l.url}](${l.url})`);
      }
      lines.push('');
    }
    lines.push('| hf_model_id | file_path |');
    lines.push('|---|---|');
    for (const m of data.recipe.models) {
      lines.push(`| ${m.hf_model_id} | ${m.file_path} |`);
    }
    downloadFile(lines.join('\n'), `${safeName()}.md`, 'text/markdown');
  }

  let exportOpen = $state(false);

  type CheckStatus = 'idle' | 'checking' | 'ok' | 'not-found' | 'error';
  let checkStatuses = $state<Record<string, CheckStatus>>({});
  let checking = $state(false);

  async function checkAllModels() {
    checking = true;
    const initial: Record<string, CheckStatus> = {};
    for (const m of data.recipe.models) {
      initial[`${m.hf_model_id}::${m.file_path}`] = 'checking';
    }
    checkStatuses = initial;
    await Promise.all(data.recipe.models.map(async (m: any) => {
      const key = `${m.hf_model_id}::${m.file_path}`;
      const url = `https://huggingface.co/${m.hf_model_id}/resolve/main/${m.file_path}`;
      try {
        const res = await fetch(url, { method: 'HEAD' });
        checkStatuses[key] = res.ok ? 'ok' : res.status === 404 ? 'not-found' : 'error';
      } catch {
        checkStatuses[key] = 'error';
      }
    }));
    checking = false;
  }
</script>

<div class="recipe-detail">
  <header class="page-header">
    <div class="page-header-text">
      <h1>{data.recipe.name}</h1>
      <p>{data.recipe.models.length} model{data.recipe.models.length !== 1 ? 's' : ''} &middot; {data.recipe.visibility} &middot; Updated {formatDate(data.recipe.updated_at)}</p>
    </div>
    <div class="header-actions">
      <button class="btn-run" onclick={() => runRecipe(data.recipe)}>Run</button>
      <button class="btn-share" onclick={copyShareLink}>
        {copyFeedback ? 'Copied!' : 'Share'}
      </button>
      <button class="btn-check" onclick={checkAllModels} disabled={checking} title="Check if all model files are reachable on Hugging Face">
        {#if checking}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        {:else}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        {/if}
        Check
      </button>
      <div class="export-wrap">
        <button class="btn-export" onclick={() => exportOpen = !exportOpen}>Export ▾</button>
        {#if exportOpen}
          <div class="export-menu" role="menu">
            <button class="export-item" onclick={() => { exportJSON(); exportOpen = false; }}>JSON</button>
            <button class="export-item" onclick={() => { exportCSV(); exportOpen = false; }}>CSV</button>
            <button class="export-item" onclick={() => { exportMD(); exportOpen = false; }}>Markdown</button>
          </div>
        {/if}
      </div>
      {#if data.isOwner}
        <a href="/recipe/{data.recipe.slug}/edit" class="btn-edit">Edit</a>
        <button class="btn-delete" onclick={handleDelete}>Delete</button>
      {/if}
    </div>
  </header>

  <div class="models-section">
    <div class="zone-label">
      Models
      <span class="count-badge">{data.recipe.models.length}</span>
    </div>
    <ul class="model-list">
      {#each data.recipe.models as m (`${m.hf_model_id}::${m.file_path}`)}
        {@const ext = getFormat(m.file_path)}
        {@const ck = checkStatuses[`${m.hf_model_id}::${m.file_path}`] ?? 'idle'}
        <li class="model-item">
          <div class="model-item-left">
            <div class="model-item-top">
              <span class="model-item-repo">{m.hf_model_id}</span>
              {#if m.data_type}
                <span class="dtype-chip" data-dtype={m.data_type}>{m.data_type === 'quantized' ? 'quant' : m.data_type}</span>
              {/if}
            </div>
            <div class="model-item-bottom">
              <FormatIcon format={ext} size={14} hfModelId={m.hf_model_id} filePath={m.file_path} />
              <NetronLink hfModelId={m.hf_model_id} filePath={m.file_path} />
              <span class="model-item-name">{m.file_path}</span>
              {#if m.size_bytes}
                <span class="size-chip">{formatSize(m.size_bytes)}</span>
              {/if}
            </div>
          </div>
          {#if ck !== 'idle'}
            <span class="check-icon check-{ck}" title={ck === 'ok' ? 'File reachable' : ck === 'not-found' ? '404 Not Found' : ck === 'checking' ? 'Checking…' : 'Request error'}>
              {#if ck === 'checking'}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              {:else if ck === 'ok'}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              {:else if ck === 'not-found'}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {:else}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              {/if}
            </span>
          {/if}
        </li>
      {/each}
    </ul>
  </div>

  {#if data.recipe.description || (data.recipe.links && data.recipe.links.length > 0)}
    <div class="meta-section">
      {#if data.recipe.description}
        <p class="recipe-description">{data.recipe.description}</p>
      {/if}
      {#if data.recipe.links && data.recipe.links.length > 0}
        <div class="recipe-links">
          {#each data.recipe.links as link}
            <a
              href={link.url}
              class="recipe-link"
              target="_blank"
              rel="noopener noreferrer"
            >{link.label || link.url}</a>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if data.isOwner}
    <div class="visibility-section">
      <button class="vis-toggle" class:is-public={data.recipe.visibility === 'public'} onclick={toggleVisibility}>
        {data.recipe.visibility === 'public' ? 'Make Personal' : 'Make Public'}
      </button>
    </div>
  {/if}

  <div class="back-link">
    <a href="/recipe">&larr; All Recipes</a>
  </div>
</div>

<style>
  .recipe-detail {
    max-width: 100%;
  }

  .page-header {
    display: flex;
    align-items: center;
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

  .btn-run, .btn-share, .btn-edit, .btn-delete {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
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

  .btn-run:hover {
    background: var(--color-primary-hover);
  }

  .btn-share {
    background: none;
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
  }

  .btn-share:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .btn-edit {
    background: none;
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
  }

  .btn-edit:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

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

  .btn-check:hover:not(:disabled) {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .btn-check:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .check-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    border-radius: 50%;
  }

  .check-checking { color: var(--color-text-muted); }
  .check-ok { color: var(--color-success); }
  .check-not-found { color: var(--color-error); }
  .check-error { color: var(--color-warning, #f59e0b); }

  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 0.8s linear infinite; }

  .export-wrap {
    position: relative;
  }

  .btn-export {
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
    transition: background var(--transition-base), border-color var(--transition-base), color var(--transition-base);
  }

  .btn-export:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .export-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-base);
    box-shadow: var(--shadow-dropdown);
    z-index: var(--z-dropdown);
    min-width: 110px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .export-item {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    padding: var(--space-1) var(--space-3);
    background: none;
    border: none;
    text-align: left;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background var(--transition-base), color var(--transition-base);
  }

  .export-item:hover {
    background: var(--color-surface-sunken);
    color: var(--color-text-primary);
  }

  .models-section {
    margin-bottom: var(--space-3);
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

  .model-list {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3px;
  }

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

  .model-item-top :global(.dtype-chip),
  .model-item-bottom :global(.size-chip) {
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

  .visibility-section {
    margin-bottom: var(--space-3);
  }

  .vis-toggle {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: 6px 14px;
    border-radius: var(--radius-base);
    border: 1px solid var(--color-border);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: color var(--transition-base), border-color var(--transition-base);
  }

  .vis-toggle:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .vis-toggle.is-public {
    border-color: var(--color-dt-int8);
    color: var(--color-dt-int8);
  }

  .back-link a {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    text-decoration: none;
    transition: color var(--transition-base);
  }

  .back-link a:hover {
    color: var(--color-primary);
  }

  @media (max-width: 900px) {
    .model-list { grid-template-columns: repeat(2, 1fr); }
  }

  @media (max-width: 640px) {
    .page-header {
      flex-direction: column;
    }

    .header-actions {
      width: 100%;
    }

    .btn-run, .btn-share, .btn-export, .btn-edit, .btn-delete {
      flex: 1;
      text-align: center;
    }

    .export-wrap {
      flex: 1;
    }

    .btn-export {
      width: 100%;
    }

    .model-list { grid-template-columns: 1fr; }
  }

  .meta-section {
    margin-bottom: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .recipe-description {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin: 0;
    white-space: pre-wrap;
  }

  .recipe-links {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .recipe-link {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: var(--color-primary);
    text-decoration: none;
    padding: 2px 8px;
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-sm);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 240px;
    transition: background var(--transition-base);
  }

  .recipe-link:hover {
    background: var(--color-accent-light);
  }
</style>
