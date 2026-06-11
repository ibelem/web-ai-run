<script lang="ts">
  import { goto } from '$app/navigation';
  import { enhance } from '$app/forms';

  let { data, form } = $props<{ data: any; form: any }>();

  type ParsedModel = { hf_model_id: string; file_path: string };
  type LinkRow = { label: string; url: string };
  type Mode = 'create' | 'merge';

  // Input mode
  type InputMode = 'file' | 'text';
  let inputMode = $state<InputMode>('file');
  let pasteText = $state('');

  // File parse state
  let parsedModels = $state<ParsedModel[]>([]);
  let parseError = $state('');
  let fileName = $state('');
  let isDragOver = $state(false);

  // Mode
  let mode = $state<Mode>('create');

  // Create new fields
  let recipeName = $state('');
  let visibility = $state<'personal' | 'public'>('personal');
  let description = $state('');
  let links = $state<LinkRow[]>([{ label: '', url: '' }]);

  // Merge field
  let selectedRecipeId = $state('');

  // Model usability check
  type CheckStatus = 'idle' | 'checking' | 'ok' | 'not-found' | 'error';
  let checkStatuses = $state<Record<string, CheckStatus>>({});
  let checking = $state(false);

  async function checkAllModels() {
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

  // Submit state
  let submitting = $state(false);
  let mergeResult = $state('');
  // svelte-ignore state_referenced_locally
  let formError = $state(form?.error ?? '');

  // Derived: a model row is invalid if any required field is missing
  const hasInvalidRows = $derived(parsedModels.some(m => !m.hf_model_id || !m.file_path));
  const canSubmit = $derived(
    parsedModels.length > 0 &&
    !hasInvalidRows &&
    (mode === 'create' ? recipeName.trim().length > 0 : selectedRecipeId.length > 0)
  );

  // Serialized for hidden inputs
  const modelsJson = $derived(JSON.stringify(parsedModels));
  const linksJson = $derived(
    JSON.stringify(
      links
        .filter(l => l.url.trim())
        .map(l => ({ ...(l.label ? { label: l.label } : {}), url: l.url }))
    )
  );

  // CSV parser helpers
  function parseCsvRow(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  function parseJson(text: string): ParsedModel[] {
    const parsed = JSON.parse(text);
    // Enriched export format: { name, description?, links?, models: [...] }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.models)) {
      if (parsed.name) recipeName = parsed.name;
      if (parsed.description) description = parsed.description;
      if (Array.isArray(parsed.links) && parsed.links.length > 0) {
        links = parsed.links.map((l: any) => ({ label: l.label ?? '', url: l.url ?? '' }));
      }
      return parsed.models.map((item: any) => ({
        hf_model_id: String(item.hf_model_id ?? ''),
        file_path: String(item.file_path ?? ''),
      }));
    }
    if (!Array.isArray(parsed)) throw new Error('JSON must be an array of model objects or a recipe export object.');
    return parsed.map((item: any) => ({
      hf_model_id: String(item.hf_model_id ?? ''),
      file_path: String(item.file_path ?? ''),
    }));
  }

  function parseCsv(text: string): ParsedModel[] {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row.');
    const headers = parseCsvRow(lines[0]).map(h => h.toLowerCase());
    const idxId = headers.indexOf('hf_model_id');
    const idxPath = headers.indexOf('file_path');
    if (idxId < 0 || idxPath < 0) {
      throw new Error('CSV must have columns: hf_model_id, file_path');
    }
    return lines.slice(1).map(line => {
      const cols = parseCsvRow(line);
      return {
        hf_model_id: cols[idxId] ?? '',
        file_path: cols[idxPath] ?? '',
      };
    });
  }

  function parseMd(text: string): ParsedModel[] {
    const lines = text.split('\n');
    const tableStart = lines.findIndex(l => l.trim().startsWith('|'));
    if (tableStart < 0) throw new Error('No markdown table found.');
    const tableLines = lines.slice(tableStart).filter(l => l.trim().startsWith('|'));
    if (tableLines.length < 3) throw new Error('Markdown table needs header row, separator row, and at least one data row.');
    const parseRow = (line: string) => line.split('|').slice(1, -1).map(c => c.trim());
    const headers = parseRow(tableLines[0]).map(h => h.toLowerCase());
    const idxId = headers.indexOf('hf_model_id');
    const idxPath = headers.indexOf('file_path');
    if (idxId < 0 || idxPath < 0) {
      throw new Error('Markdown table must have columns: hf_model_id, file_path');
    }
    return tableLines.slice(2).map(line => {
      const cols = parseRow(line);
      return {
        hf_model_id: cols[idxId] ?? '',
        file_path: cols[idxPath] ?? '',
      };
    });
  }

  async function handleFile(file: File) {
    parseError = '';
    parsedModels = [];
    fileName = file.name;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['json', 'csv', 'md'].includes(ext ?? '')) {
      parseError = 'Unsupported file type. Use .json, .csv, or .md';
      return;
    }
    const text = await file.text();
    try {
      if (ext === 'json') parsedModels = parseJson(text);
      else if (ext === 'csv') parsedModels = parseCsv(text);
      else parsedModels = parseMd(text);
      if (parsedModels.length === 0) parseError = 'No models found in file.';
    } catch (e: any) {
      parseError = e.message ?? 'Failed to parse file.';
    }
  }

  function parsePasteText(text: string) {
    parseError = '';
    parsedModels = [];
    fileName = '';
    if (!text.trim()) return;
    const lower = text.trimStart();
    try {
      if (lower.startsWith('{') || lower.startsWith('[')) {
        parsedModels = parseJson(text);
      } else if (lower.startsWith('|')) {
        parsedModels = parseMd(text);
      } else if (lower.toLowerCase().startsWith('hf_model_id')) {
        parsedModels = parseCsv(text);
      } else {
        // Try each in order
        try { parsedModels = parseJson(text); return; } catch {}
        try { parsedModels = parseMd(text); return; } catch {}
        parsedModels = parseCsv(text);
      }
      if (parsedModels.length === 0) parseError = 'No models found in text.';
    } catch (e: any) {
      parseError = e.message ?? 'Failed to parse text.';
    }
  }

  $effect(() => {
    if (inputMode === 'text') {
      parsePasteText(pasteText);
    }
  });

  function switchInputMode(m: InputMode) {
    inputMode = m;
    parsedModels = [];
    parseError = '';
    fileName = '';
    pasteText = '';
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

  function removeModel(i: number) {
    parsedModels = parsedModels.filter((_, idx) => idx !== i);
  }

  function addLink() {
    if (links.length < 10) links = [...links, { label: '', url: '' }];
  }

  function removeLink(i: number) {
    links = links.filter((_, idx) => idx !== i);
    if (links.length === 0) links = [{ label: '', url: '' }];
  }

  function switchMode(m: Mode) {
    mode = m;
    recipeName = '';
    visibility = 'personal';
    description = '';
    links = [{ label: '', url: '' }];
    selectedRecipeId = '';
    mergeResult = '';
    formError = '';
  }
</script>

<div class="import-page">
  <header class="page-header">
    <div class="page-header-text">
      <h1>Import Recipe</h1>
      <p>Upload a .json, .csv, or .md file to create or update a recipe.</p>
    </div>
    <a href="/inference/recipe" class="btn-cancel">Cancel</a>
  </header>

  <!-- Input mode toggle + zone -->
  <section class="zone">
    <div class="input-mode-toggle">
      <button class="input-mode-btn" class:active={inputMode === 'file'} onclick={() => switchInputMode('file')}>Upload file</button>
      <button class="input-mode-btn" class:active={inputMode === 'text'} onclick={() => switchInputMode('text')}>Paste text</button>
    </div>

    {#if inputMode === 'file'}
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
          accept=".json,.csv,.md"
          class="file-input-hidden"
          onchange={handleFileInput}
        />
        {#if fileName && !parseError}
          <span class="upload-filename">{fileName}</span>
          <span class="upload-hint">Click to replace</span>
        {:else}
          <span class="upload-icon">↑</span>
          <span class="upload-hint">Drag & drop or click to upload</span>
          <span class="upload-types">.json · .csv · .md</span>
        {/if}
      </label>

      <div class="template-links">
        <span class="template-label">Templates:</span>
        <a href="/templates/recipe-import.json" download class="template-link">JSON</a>
        <a href="/templates/recipe-import.csv" download class="template-link">CSV</a>
        <a href="/templates/recipe-import.md" download class="template-link">Markdown</a>
      </div>
    {:else}
      <p class="zone-hint">Paste JSON, CSV, or Markdown table with <code>hf_model_id</code> and <code>file_path</code> columns.</p>
      <textarea
        class="paste-input"
        rows="10"
        placeholder="Paste your JSON, CSV, or Markdown here…"
        bind:value={pasteText}
        spellcheck="false"
      ></textarea>
    {/if}

    {#if parseError}
      <p class="parse-error">{parseError}</p>
    {/if}
  </section>

  <!-- Parsed models preview -->
  {#if parsedModels.length > 0}
    <section class="zone">
      <div class="zone-label">
        Parsed models
        <span class="count-badge">{parsedModels.length}</span>
        {#if hasInvalidRows}<span class="invalid-badge">Fix errors before importing</span>{/if}
        <button class="btn-check" onclick={checkAllModels} disabled={checking} title="Check if all model files are reachable on Hugging Face">
          {#if checking}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          {:else}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          {/if}
          Check
        </button>
      </div>
      <div class="preview-table-wrap">
        <table class="preview-table">
          <thead>
            <tr>
              <th>hf_model_id</th>
              <th>file_path</th>
              <th class="cell-check-head"></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each parsedModels as m, i (i)}
              {@const ck = checkStatuses[`${m.hf_model_id}::${m.file_path}`] ?? 'idle'}
              <tr class:row-invalid={!m.hf_model_id || !m.file_path}>
                <td class="cell-mono">{m.hf_model_id || ''}</td>
                <td class="cell-mono">{m.file_path || ''}</td>
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
                <td class="cell-remove">
                  <button class="remove-btn" onclick={() => removeModel(i)} aria-label="Remove row">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <!-- Mode toggle -->
    <div class="mode-toggle">
      <button
        class="mode-btn"
        class:active={mode === 'create'}
        onclick={() => switchMode('create')}
      >Create new recipe</button>
      <button
        class="mode-btn"
        class:active={mode === 'merge'}
        onclick={() => switchMode('merge')}
      >Add to existing recipe</button>
    </div>

    {#if formError}
      <p class="form-error">{formError}</p>
    {/if}

    {#if mergeResult}
      <p class="merge-result">{mergeResult}</p>
    {/if}

    <!-- Create new form -->
    {#if mode === 'create'}
      <form
        method="POST"
        action="?/createRecipe"
        use:enhance={() => {
          submitting = true;
          formError = '';
          return async ({ result, update }) => {
            submitting = false;
            if (result.type === 'failure') {
              formError = (result.data as any)?.error ?? 'Import failed.';
              return;
            }
            await update();
          };
        }}
      >
        <input type="hidden" name="models" value={modelsJson} />

        <section class="zone">
          <div class="zone-label">New recipe details</div>

          <div class="field-row">
            <label class="field-label" for="new-name">Name <span class="required">*</span></label>
            <input
              id="new-name"
              type="text"
              name="name"
              class="text-input"
              placeholder="Recipe name…"
              bind:value={recipeName}
              required
            />
          </div>

          <div class="field-row">
            <span class="field-label">Visibility</span>
            <div class="visibility-tabs">
              <button
                type="button"
                class="visibility-tab"
                class:active={visibility === 'personal'}
                onclick={() => { visibility = 'personal'; }}
              >Personal</button>
              <button
                type="button"
                class="visibility-tab"
                class:active={visibility === 'public'}
                onclick={() => { visibility = 'public'; }}
              >Public</button>
            </div>
            <input type="hidden" name="visibility" value={visibility} />
          </div>

          <div class="field-row">
            <label class="field-label" for="new-desc">Description</label>
            <textarea
              id="new-desc"
              name="description"
              class="meta-textarea"
              rows="3"
              placeholder="Describe what this recipe does…"
              bind:value={description}
            ></textarea>
          </div>

          <div class="field-row">
            <div class="links-label-row">
              <span class="field-label">Links</span>
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
            <input type="hidden" name="links" value={linksJson} />
          </div>
        </section>

        <div class="submit-row">
          <button type="submit" class="btn-import" disabled={!canSubmit || submitting}>
            {submitting ? 'Creating…' : 'Create Recipe'}
          </button>
        </div>
      </form>

    <!-- Merge into existing form -->
    {:else}
      <form
        method="POST"
        action="?/mergeRecipe"
        use:enhance={() => {
          submitting = true;
          formError = '';
          return async ({ result, update }) => {
            submitting = false;
            if (result.type === 'failure') {
              formError = (result.data as any)?.error ?? 'Import failed.';
              return;
            }
            if (result.type === 'success') {
              const d = result.data as any;
              mergeResult = `Added ${d.added} model${d.added !== 1 ? 's' : ''}, skipped ${d.skipped} duplicate${d.skipped !== 1 ? 's' : ''}.`;
              setTimeout(() => goto(`/inference/recipe/${d.slug}`), 1500);
              return;
            }
            await update();
          };
        }}
      >
        <input type="hidden" name="models" value={modelsJson} />

        <section class="zone">
          <div class="zone-label">Select recipe to update</div>

          <div class="field-row">
            <label class="field-label" for="existing-recipe">Recipe <span class="required">*</span></label>
            {#if data.myRecipes.length === 0}
              <p class="no-recipes">You don't have any recipes yet. <a href="/inference/recipe/new">Create one first.</a></p>
            {:else}
              <select
                id="existing-recipe"
                name="recipeId"
                class="recipe-select"
                bind:value={selectedRecipeId}
              >
                <option value="">— Choose a recipe —</option>
                {#each data.myRecipes as r (r.id)}
                  <option value={r.id}>{r.name} ({r.modelCount} model{r.modelCount !== 1 ? 's' : ''})</option>
                {/each}
              </select>
            {/if}
          </div>
        </section>

        <div class="submit-row">
          <button type="submit" class="btn-import" disabled={!canSubmit || submitting}>
            {submitting ? 'Merging…' : 'Add to Recipe'}
          </button>
        </div>
      </form>
    {/if}
  {/if}
</div>

<style>
  .import-page {
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

  code {
    font-family: var(--font-mono);
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

  /* Input mode toggle */
  .input-mode-toggle {
    display: flex;
    border-radius: var(--radius-base);
    overflow: hidden;
    width: fit-content;
    margin-bottom: var(--space-1);
  }

  .input-mode-btn {
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

  .input-mode-btn + .input-mode-btn { border-left: none; }

  .input-mode-btn.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-text-on-primary);
  }

  .zone-hint {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: 0;
  }

  .paste-input {
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.6;
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    padding: var(--space-2);
  }

  .paste-input:focus-visible { border-color: var(--color-focus-ring); outline: none; }

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

  .invalid-badge {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-error);
    text-transform: none;
    letter-spacing: 0;
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

  .template-links {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-top: 4px;
  }

  .template-label {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .template-link {
    font-size: var(--text-xs);
    color: var(--color-primary);
    text-decoration: none;
    padding: 1px 6px;
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    transition: background var(--transition-base);
  }

  .template-link:hover {
    background: var(--color-accent-light);
  }

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

  .cell-check-head { width: 24px; }
  .cell-check { width: 24px; text-align: center; vertical-align: middle; }

  .check-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .check-checking { color: var(--color-text-muted); }
  .check-ok { color: var(--color-success); }
  .check-not-found { color: var(--color-error); }
  .check-error { color: var(--color-warning, #f59e0b); }

  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 0.8s linear infinite; }

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

  .preview-table tr.row-invalid td {
    background: color-mix(in srgb, var(--color-error) 6%, transparent);
  }

  .cell-mono {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .cell-remove {
    width: 32px;
    text-align: right;
  }

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

  /* Mode toggle */
  .mode-toggle {
    display: flex;
    border-radius: var(--radius-base);
    overflow: hidden;
    margin-bottom: var(--space-3);
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

  .mode-btn + .mode-btn {
    border-left: none;
  }

  .mode-btn.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-text-on-primary);
  }

  /* Form fields */
  .field-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: var(--space-2);
  }

  .field-label {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .required {
    color: var(--color-error);
  }

  .text-input:focus-visible {
    border-color: var(--color-focus-ring);
    outline: none;
  }

  .visibility-tabs {
    display: flex;
    border-radius: var(--radius-base);
    overflow: hidden;
    width: fit-content;
  }

  .visibility-tab {
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

  .visibility-tab + .visibility-tab {
    border-left: none;
  }

  .visibility-tab.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-text-on-primary);
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

  .link-label-input:focus-visible {
    border-color: var(--color-focus-ring);
    outline: none;
  }

  .link-url-input {
    flex: 1;
    min-width: 0;
  }

  .link-url-input:focus-visible {
    border-color: var(--color-focus-ring);
    outline: none;
  }

  /* Recipe select */
  .recipe-select {
    width: 100%;
    max-width: 400px;
  }

  .recipe-select:focus-visible {
    border-color: var(--color-focus-ring);
    outline: none;
  }

  .no-recipes {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 0;
  }

  .no-recipes a {
    color: var(--color-primary);
    text-decoration: none;
  }

  .no-recipes a:hover {
    text-decoration: underline;
  }

  /* Submit */
  .submit-row {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--space-2);
  }

  .btn-import {
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

  /* Messages */
  .form-error {
    font-size: var(--text-sm);
    color: var(--color-error);
    margin: 0 0 var(--space-2);
  }

  .merge-result {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-2);
  }

  @media (max-width: 640px) {
    .page-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .btn-cancel {
      width: 100%;
      text-align: center;
    }

    .mode-toggle {
      width: 100%;
    }

    .mode-btn {
      flex: 1;
    }
  }
</style>
