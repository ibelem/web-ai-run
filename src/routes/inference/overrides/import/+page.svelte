<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateOverridesCache } from '$lib/overrides-cache';

  let { form } = $props<{ form: { success?: boolean; error?: string; updated?: number; total?: number } | null }>();

  let data = $state('');
  let fileName = $state('');
  let parseError = $state('');
  let isDragOver = $state(false);
  let importing = $state(false);

  type CheckStatus = 'idle' | 'checking' | 'ok' | 'not-found' | 'error';
  let checkStatuses = $state<Record<string, CheckStatus>>({});
  let checking = $state(false);
  let parsedModels = $state<Array<{ hf_model_id: string; file_path: string }>>([]);

  async function handleFile(file: File) {
    parseError = '';
    fileName = file.name;
    const text = await file.text();
    data = text;
    parsedModels = parseModelsFromData(text);
    if (parsedModels.length === 0 && text.trim()) parseError = 'No valid entries found in file.';
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file) handleFile(file);
  }

  function handleFileInput(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) handleFile(file);
    (e.target as HTMLInputElement).value = '';
  }

  function handlePaste() {
    parsedModels = parseModelsFromData(data);
  }

  function parseModelsFromData(text?: string): Array<{ hf_model_id: string; file_path: string }> {
    const raw = (text ?? data).trim();
    if (!raw) return [];
    try {
      const json = JSON.parse(raw);
      if (Array.isArray(json)) {
        return json.filter((r: any) => r.hf_model_id && r.file_path).map((r: any) => ({
          hf_model_id: r.hf_model_id,
          file_path: r.file_path,
        }));
      }
      parseError = 'JSON must be an array of objects.';
    } catch {
      parseError = 'Invalid JSON.';
    }
    return [];
  }

  async function checkAllModels() {
    parsedModels = parseModelsFromData();
    if (parsedModels.length === 0) return;
    checking = true;
    const initial: Record<string, CheckStatus> = {};
    for (const m of parsedModels) {
      initial[`${m.hf_model_id}::${m.file_path}`] = 'checking';
    }
    checkStatuses = initial;
    await Promise.all(parsedModels.map(async (m) => {
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

  const checkSummary = $derived(() => {
    const statuses = Object.values(checkStatuses);
    if (statuses.length === 0) return null;
    const ok = statuses.filter(s => s === 'ok').length;
    const notFound = statuses.filter(s => s === 'not-found').length;
    const errors = statuses.filter(s => s === 'error').length;
    return { total: statuses.length, ok, notFound, errors };
  });
</script>

<div class="import-page">
  <header class="page-header">
    <div class="page-header-text">
      <h1>Batch Import Overrides</h1>
      <p>Import <code>freeDimensionOverrides</code> for multiple models at once.</p>
    </div>
    <a href="/inference/overrides" class="btn-cancel">Cancel</a>
  </header>

  {#if form?.error}
    <div class="error-banner">{form.error}</div>
  {/if}
  {#if form?.success && form?.updated}
    <div class="success-banner">Updated {form.updated} of {form.total} models.</div>
  {/if}

  <!-- Upload zone -->
  <section class="zone">
    <div class="zone-label">Upload file</div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <label
      class="upload-zone"
      class:drag-over={isDragOver}
      ondragover={(e) => { e.preventDefault(); isDragOver = true; }}
      ondragleave={() => { isDragOver = false; }}
      ondrop={handleDrop}
    >
      <input
        type="file"
        accept=".json"
        class="file-input-hidden"
        onchange={handleFileInput}
      />
      {#if fileName && !parseError}
        <span class="upload-filename">{fileName}</span>
        <span class="upload-hint">Click to replace</span>
      {:else}
        <span class="upload-icon">↑</span>
        <span class="upload-hint">Drag & drop or click to upload</span>
        <span class="upload-types">.json</span>
      {/if}
    </label>

    {#if parseError}
      <p class="parse-error">{parseError}</p>
    {/if}
  </section>

  <!-- Or paste directly -->
  <section class="zone">
    <div class="zone-label">Or paste data directly</div>
    <textarea
      name="data-input"
      class="paste-textarea"
      bind:value={data}
      oninput={handlePaste}
      rows="10"
      placeholder="Paste JSON array here..."
    ></textarea>
  </section>

  <!-- Format reference -->
  <section class="zone">
    <div class="zone-label">Expected format</div>
    <div class="format-examples">
      <div class="format-example">
        <pre><code>{`[
  {
    "hf_model_id": "microsoft/resnet-50",
    "file_path": "onnx/model.onnx",
    "overrides": { "batch_size": 1, "height": 224, "width": 224 }
  }
]`}</code></pre>
      </div>
    </div>
  </section>

  <!-- Preview & actions -->
  {#if parsedModels.length > 0}
    <section class="zone">
      <div class="zone-label">
        Parsed entries
        <span class="count-badge">{parsedModels.length}</span>
        <button class="btn-check" onclick={checkAllModels} disabled={checking} title="Check if model files are reachable on HuggingFace">
          {#if checking}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          {:else}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          {/if}
          Check
        </button>
      </div>

      {#if checkSummary()}
        <div class="check-results">
          <span class="check-ok">{checkSummary()!.ok} reachable</span>
          {#if checkSummary()!.notFound > 0}
            <span class="check-not-found">{checkSummary()!.notFound} not found</span>
          {/if}
          {#if checkSummary()!.errors > 0}
            <span class="check-error">{checkSummary()!.errors} errors</span>
          {/if}
          <span class="check-total">of {checkSummary()!.total}</span>
        </div>
      {/if}

      {#if parsedModels.some(m => checkStatuses[`${m.hf_model_id}::${m.file_path}`] === 'not-found')}
        {@const notFoundModels = parsedModels.filter(m => checkStatuses[`${m.hf_model_id}::${m.file_path}`] === 'not-found')}
        <div class="not-found-section">
          <div class="not-found-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Not found ({notFoundModels.length})
          </div>
          <div class="preview-table-wrap">
            <table class="preview-table">
              <thead>
                <tr>
                  <th>hf_model_id</th>
                  <th>file_path</th>
                </tr>
              </thead>
              <tbody>
                {#each notFoundModels as m, i (i)}
                  <tr class="row-not-found">
                    <td class="cell-mono">{m.hf_model_id}</td>
                    <td class="cell-mono">{m.file_path}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}

      <div class="preview-table-wrap">
        <table class="preview-table">
          <thead>
            <tr>
              <th>hf_model_id</th>
              <th>file_path</th>
              <th class="cell-check-head"></th>
            </tr>
          </thead>
          <tbody>
            {#each parsedModels.slice(0, 20) as m, i (i)}
              {@const ck = checkStatuses[`${m.hf_model_id}::${m.file_path}`] ?? 'idle'}
              <tr>
                <td class="cell-mono">{m.hf_model_id}</td>
                <td class="cell-mono">{m.file_path}</td>
                <td class="cell-check">
                  {#if ck !== 'idle'}
                    <span class="check-icon check-{ck}" title={ck === 'ok' ? 'File reachable' : ck === 'not-found' ? '404 Not Found' : ck === 'checking' ? 'Checking…' : 'Request error'}>
                      {#if ck === 'checking'}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                      {:else if ck === 'ok'}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      {:else if ck === 'not-found'}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      {:else}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      {/if}
                    </span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if parsedModels.length > 20}
          <p class="preview-more">… and {parsedModels.length - 20} more</p>
        {/if}
      </div>
    </section>
  {/if}

  <!-- Submit -->
  <form method="POST" use:enhance={() => {
    importing = true;
    return async ({ result, update }) => {
      if (result.type === 'redirect') invalidateOverridesCache();
      await update();
      importing = false;
    };
  }}>
    <input type="hidden" name="data" value={data} />
    <div class="submit-row">
      <button type="submit" class="btn-import" disabled={!data.trim() || importing}>
        {#if importing}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="spin">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          Importing…
        {:else}
          Import
        {/if}
      </button>
    </div>
  </form>
</div>

<style>
  .import-page {
    max-width: 680px;
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

  .page-header-text code {
    font-size: var(--text-xs);
    background: var(--color-surface-sunken);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

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

  .btn-cancel:hover {
    background: var(--color-surface-sunken);
  }

  .error-banner {
    padding: var(--space-2);
    border-radius: var(--radius-base);
    background: var(--color-danger-light, #fef2f2);
    color: var(--color-danger, #dc2626);
    margin-bottom: var(--space-3);
    font-size: var(--text-sm);
  }

  .success-banner {
    padding: var(--space-2);
    border-radius: var(--radius-base);
    background: var(--color-success-light, #f0fdf4);
    color: var(--color-success, #16a34a);
    margin-bottom: var(--space-3);
    font-size: var(--text-sm);
  }

  /* Zone sections */
  .zone {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
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

  code {
    font-family: var(--font-mono);
  }

  /* Upload zone */
  .upload-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: var(--space-4) var(--space-2);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface-sunken);
    cursor: pointer;
    transition: border-color var(--transition-base), background var(--transition-base);
    text-align: center;
  }

  .upload-zone:hover,
  .upload-zone.drag-over {
    border-color: var(--color-primary);
    background: var(--color-accent-light);
  }

  .file-input-hidden {
    display: none;
  }

  .upload-icon {
    font-size: 24px;
    color: var(--color-text-muted);
    line-height: 1;
  }

  .upload-hint {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .upload-types {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-family: var(--font-mono);
  }

  .upload-filename {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-primary);
    font-family: var(--font-mono);
  }

  .parse-error {
    font-size: var(--text-sm);
    color: var(--color-error);
    margin: 0;
  }

  /* Paste textarea */
  .paste-textarea {
    width: 100%;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    resize: vertical;
    transition: border-color var(--transition-base);
  }

  .paste-textarea:focus-visible {
    border-color: var(--color-focus-ring);
    outline: none;
  }

  /* Format examples */
  .format-examples {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    border-radius: var(--radius-base);
  }

  .format-example pre {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-2);
    overflow-x: auto;
    margin: 0;
  }

  .format-example code {
    font-size: 11px;
    color: var(--color-text-primary);
  }

  /* Check button */
  .btn-check {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    text-transform: none;
    letter-spacing: 0;
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

  /* Check results */
  .check-results {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
  }

  .check-ok { color: var(--color-success); }
  .check-not-found { color: var(--color-error); }
  .check-error { color: var(--color-warning, #f59e0b); }
  .check-total { color: var(--color-text-muted); }

  /* Not-found section */
  .not-found-section {
    margin-bottom: var(--space-2);
    border: 1px solid var(--color-error, #dc2626);
    border-radius: var(--radius-base);
    overflow: hidden;
  }

  .not-found-label {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px var(--space-2);
    background: var(--color-danger-light, #fef2f2);
    color: var(--color-error, #dc2626);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .not-found-section .preview-table-wrap {
    overflow-x: auto;
  }

  .row-not-found td {
    color: var(--color-error, #dc2626);
  }

  /* Preview table */
  .preview-table-wrap {
    overflow-x: auto;
  }

  .preview-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
  }

  .preview-table th {
    text-align: left;
    padding: var(--space-1);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--color-border-strong);
    white-space: nowrap;
  }

  .preview-table td {
    padding: var(--space-1);
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
  }

  .cell-mono {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .cell-check-head { width: 24px; }
  .cell-check { width: 24px; text-align: center; vertical-align: middle; }

  .check-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .check-checking { color: var(--color-text-muted); }

  .preview-more {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: var(--space-1) 0 0;
    text-align: center;
  }

  /* Submit */
  .submit-row {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--space-2);
  }

  .btn-import {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: 10px 24px;
    border: none;
    border-radius: var(--radius-base);
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-import:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .btn-import:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 0.8s linear infinite; }

  @media (max-width: 640px) {
    .page-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .btn-cancel {
      width: 100%;
      text-align: center;
    }
  }
</style>
