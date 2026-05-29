<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateOverridesCache } from '$lib/overrides-cache';

  let { form } = $props<{ form: { success?: boolean; error?: string } | null }>();

  const HF_API = 'https://huggingface.co/api';

  let hfModelId = $state('');
  let filePath = $state('');
  let overrides = $state('');

  let repoSuggestions = $state<string[]>([]);
  let fileSuggestions = $state<string[]>([]);
  let repoLoading = $state(false);
  let fileLoading = $state(false);
  let showRepoDropdown = $state(false);
  let showFileDropdown = $state(false);
  let repoTimeout: ReturnType<typeof setTimeout> | undefined;
  let fileTimeout: ReturnType<typeof setTimeout> | undefined;

  type CheckStatus = 'idle' | 'checking' | 'ok' | 'not-found' | 'error';
  let checkStatus = $state<CheckStatus>('idle');

  async function checkModel() {
    if (!hfModelId.trim() || !filePath.trim()) return;
    checkStatus = 'checking';
    const url = `https://huggingface.co/${hfModelId.trim()}/resolve/main/${filePath.trim()}`;
    try {
      const res = await fetch(url, { method: 'HEAD' });
      checkStatus = res.ok ? 'ok' : res.status === 404 ? 'not-found' : 'error';
    } catch {
      checkStatus = 'error';
    }
  }

  function onRepoInput() {
    clearTimeout(repoTimeout);
    if (!hfModelId.trim() || hfModelId.trim().length < 2) {
      repoSuggestions = [];
      showRepoDropdown = false;
      return;
    }
    repoTimeout = setTimeout(() => searchRepos(hfModelId.trim()), 400);
  }

  async function searchRepos(q: string) {
    repoLoading = true;
    try {
      const res = await fetch(`${HF_API}/models?search=${encodeURIComponent(q)}&limit=10`);
      if (!res.ok) { repoSuggestions = []; return; }
      const data: Array<{ id: string }> = await res.json();
      repoSuggestions = data.map(r => r.id);
      showRepoDropdown = repoSuggestions.length > 0;
    } catch {
      repoSuggestions = [];
    } finally {
      repoLoading = false;
    }
  }

  function selectRepo(id: string) {
    hfModelId = id;
    showRepoDropdown = false;
    filePath = '';
    fileSuggestions = [];
    fetchFiles(id);
  }

  function onFileInput() {
    clearTimeout(fileTimeout);
    if (!hfModelId.trim()) return;
    fileTimeout = setTimeout(() => fetchFiles(hfModelId.trim()), 300);
  }

  async function fetchFiles(repoId: string) {
    fileLoading = true;
    try {
      const res = await fetch(`${HF_API}/models/${repoId}?blobs=true`);
      if (!res.ok) { fileSuggestions = []; return; }
      const data = await res.json();
      const siblings: Array<{ rfilename: string }> = data.siblings ?? [];
      fileSuggestions = siblings
        .map(s => s.rfilename)
        .filter(f => f.endsWith('.onnx'));
      showFileDropdown = fileSuggestions.length > 0;
    } catch {
      fileSuggestions = [];
    } finally {
      fileLoading = false;
    }
  }

  function selectFile(f: string) {
    filePath = f;
    showFileDropdown = false;
  }
</script>

<div class="page">
  <header class="page-header">
    <h1>Add Free Dimension Override</h1>
    <p>Configure <code>freeDimensionOverrides</code> for an ONNX model with dynamic input shapes.</p>
  </header>

  {#if form?.error}
    <div class="error-banner">{form.error}</div>
  {/if}

  <form method="POST" use:enhance={() => {
    return async ({ result, update }) => {
      if (result.type === 'redirect') invalidateOverridesCache();
      await update();
    };
  }}>
    <div class="form-group">
      <label for="hf_model_id">HuggingFace Model ID</label>
      <div class="autocomplete-wrap">
        <input
          id="hf_model_id"
          type="text"
          name="hf_model_id"
          bind:value={hfModelId}
          oninput={onRepoInput}
          onfocus={() => { if (repoSuggestions.length) showRepoDropdown = true; }}
          onblur={() => setTimeout(() => { showRepoDropdown = false; }, 200)}
          placeholder="e.g. microsoft/resnet-50"
          autocomplete="off"
        />
        {#if repoLoading}
          <span class="loading-indicator">...</span>
        {/if}
        {#if showRepoDropdown}
          <ul class="dropdown">
            {#each repoSuggestions as repo}
              <li>
                <button type="button" onmousedown={() => selectRepo(repo)}>{repo}</button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>

    <div class="form-group">
      <label for="file_path">File Path</label>
      <div class="autocomplete-wrap">
        <input
          id="file_path"
          type="text"
          name="file_path"
          bind:value={filePath}
          oninput={onFileInput}
          onfocus={() => { if (fileSuggestions.length) showFileDropdown = true; }}
          onblur={() => setTimeout(() => { showFileDropdown = false; }, 200)}
          placeholder="e.g. onnx/model.onnx"
          autocomplete="off"
        />
        {#if fileLoading}
          <span class="loading-indicator">...</span>
        {/if}
        {#if showFileDropdown}
          <ul class="dropdown">
            {#each fileSuggestions.filter(f => !filePath || f.toLowerCase().includes(filePath.toLowerCase())) as file}
              <li>
                <button type="button" onmousedown={() => selectFile(file)}>{file}</button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>

    <div class="form-group">
      <label for="overrides">Overrides</label>
      <input
        id="overrides"
        type="text"
        name="overrides"
        bind:value={overrides}
        placeholder="batch_size: 1, num_channels: 3, height: 224, width: 224"
      />
      <p class="hint">Comma-separated key: value pairs. Values must be positive integers.</p>
    </div>

    <div class="form-actions">
      <button type="button" class="btn btn-check" onclick={checkModel} disabled={checkStatus === 'checking' || !hfModelId.trim() || !filePath.trim()} title="Check if model file is reachable on HuggingFace">
        {#if checkStatus === 'checking'}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        {:else}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        {/if}
        Check
        {#if checkStatus === 'ok'}
          <span class="check-icon check-ok" title="File reachable">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          </span>
        {:else if checkStatus === 'not-found'}
          <span class="check-icon check-not-found" title="404 Not Found">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </span>
        {:else if checkStatus === 'error'}
          <span class="check-icon check-error" title="Request error">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </span>
        {/if}
      </button>
      <button type="submit" class="btn btn-primary">Save Override</button>
      <a href="/onnx/overrides" class="btn btn-secondary">Cancel</a>
    </div>
  </form>
</div>

<style>
  .page {
    max-width: 100%;
  }

  .page-header {
    margin-bottom: var(--space-4);
  }

  .page-header p {
    margin-top: var(--space-1);
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .page-header code {
    font-size: var(--text-xs);
    background: var(--color-surface-sunken);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  .error-banner {
    padding: var(--space-2);
    border-radius: var(--radius-base);
    background: var(--color-danger-light, #fef2f2);
    color: var(--color-danger, #dc2626);
    margin-bottom: var(--space-3);
    font-size: var(--text-sm);
  }

  .form-group {
    margin-bottom: var(--space-3);
  }

  .form-group label {
    display: block;
    font-size: var(--text-sm);
    font-weight: 500;
    margin-bottom: 4px;
    color: var(--color-text-primary);
  }

  .form-group input {
    width: 100%;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    transition: border-color var(--transition-base);
  }

  .form-group input:focus-visible {
    border-color: var(--color-focus-ring);
  }

  .hint {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin-top: 4px;
  }

  .autocomplete-wrap {
    position: relative;
  }

  .loading-indicator {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 50;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    max-height: 200px;
    overflow-y: auto;
    list-style: none;
    padding: 4px 0;
    margin: 2px 0 0;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .dropdown li button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 6px 12px;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    background: none;
    border: none;
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .dropdown li button:hover {
    background: var(--color-accent-light);
  }

  .form-actions {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }

  .btn {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-base);
    text-decoration: none;
    cursor: pointer;
    transition: background var(--transition-base), border-color var(--transition-base);
  }

  .btn-primary {
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    border: 1px solid var(--color-primary);
  }

  .btn-primary:hover {
    background: var(--color-primary-hover);
  }

  .btn-secondary {
    background: var(--color-surface);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border);
  }

  .btn-secondary:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .btn-check {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
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
    flex-shrink: 0;
  }

  .check-ok { color: var(--color-success); }
  .check-not-found { color: var(--color-error); }
  .check-error { color: var(--color-warning, #f59e0b); }

  code {
    font-family: var(--font-mono);
  }

  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 0.8s linear infinite; }
</style>
