<script lang="ts">
  import { goto } from '$app/navigation';
  import { isAuthenticated, auth } from '$lib/stores/auth';
  import { get } from 'svelte/store';
  import { listRecipes, createRecipe, updateRecipe } from '$lib/recipes/crud';

  interface Props {
    searchQuery: string;
    localModels?: { hf_model_id: string; file_path: string }[];
  }
  let { searchQuery, localModels = [] }: Props = $props();

  interface HFRepo {
    id: string;
    author: string;
    pipeline_tag?: string;
    likes: number;
  }

  interface HFFile {
    path: string;
    size: number;
    format: string;
    dataType: string;
    runtime: 'onnx' | 'litert';
  }

  interface FileRow {
    repoId: string;
    author: string;
    pipelineTag: string;
    likes: number;
    file: HFFile;
  }

  const HF_API = 'https://huggingface.co/api';
  const PAGE_SIZE = 20;

  let hfResults = $state<HFRepo[]>([]);
  let loading = $state(false);
  let loadingMore = $state(false);
  let hasMore = $state(false);
  let skip = $state(0);
  let searchError = $state('');
  let repoFiles = $state<Record<string, HFFile[] | null>>({});
  let recipeTarget = $state<{ repoId: string; file: HFFile } | null>(null);
  let recipes = $state<any[]>([]);
  let loadingRecipes = $state(false);
  let selectedRecipeId = $state<string>('');
  let newRecipeName = $state('');
  let savingRecipe = $state(false);
  let recipeError = $state('');
  let recipeSaved = $state(false);

  const localSet = $derived(
    new Set(localModels.map((m) => `${m.hf_model_id}::${m.file_path}`))
  );

  function inferFormat(path: string): string {
    const lower = path.toLowerCase();
    if (lower.endsWith('.litertlm')) return 'litertlm';
    if (lower.endsWith('.tflite')) return 'tflite';
    if (lower.endsWith('.onnx')) return 'onnx';
    return '';
  }

  function inferDataType(path: string): string {
    const lower = (path.split('/').pop() ?? path).toLowerCase();
    if (/[_-]q4f16/.test(lower)) return 'q4f16';
    if (/[_-]bnb4/.test(lower)) return 'bnb4';
    if (/[_-]fp8/.test(lower)) return 'fp8';
    if (/[_-]bf16/.test(lower)) return 'bf16';
    if (/[_-]fp16/.test(lower)) return 'fp16';
    if (/[_-]fp32/.test(lower)) return 'fp32';
    if (/[_-]uint8/.test(lower)) return 'uint8';
    if (/[_-]uint4/.test(lower)) return 'uint4';
    if (/[_-]int4/.test(lower)) return 'int4';
    if (/[_-]int8/.test(lower)) return 'int8';
    if (/[_-]q8/.test(lower)) return 'int8';
    if (/[_-]quantized/.test(lower)) return 'quantized';
    if (/[_-]q4(?!f)/.test(lower)) return 'q4';
    return 'fp32';
  }

  function inferRuntime(path: string): 'onnx' | 'litert' | null {
    const lower = path.toLowerCase();
    if (lower.endsWith('.onnx') && !lower.endsWith('.onnx.data') && !lower.includes('.onnx_data')) return 'onnx';
    if (lower.endsWith('.tflite') || lower.endsWith('.litertlm')) return 'litert';
    return null;
  }

  function formatSize(bytes: number): string {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  function stripExt(path: string): string {
    const name = path.split('/').pop() ?? path;
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    return base.replace(/[_-](q4f16|bnb4|fp8|bf16|fp16|fp32|uint8|uint4|int4|int8|q8|quantized|q4)$/i, '');
  }

  function repoName(id: string): string {
    return id.includes('/') ? id.split('/')[1] : id;
  }

  function orgName(id: string): string {
    return id.includes('/') ? id.split('/')[0] : '';
  }

  async function fetchTree(repoId: string): Promise<HFFile[]> {
    const res = await fetch(`${HF_API}/models/${repoId}/tree/main?recursive=true`);
    if (!res.ok) return [];
    const tree: any[] = await res.json();
    return tree
      .filter((item: any) => {
        const p = (item.path ?? '').toLowerCase();
        return (p.endsWith('.onnx') || p.endsWith('.tflite') || p.endsWith('.litertlm')) &&
          !p.endsWith('.onnx.data') && !p.includes('.onnx_data');
      })
      .map((item: any) => {
        const path = item.path ?? '';
        return {
          path,
          size: item.size ?? 0,
          format: inferFormat(path),
          dataType: inferDataType(path),
          runtime: inferRuntime(path) as 'onnx' | 'litert',
        };
      })
      .filter((f) => f.runtime !== null);
  }

  async function doSearch(q: string) {
    loading = true;
    searchError = '';
    hfResults = [];
    repoFiles = {};
    hasMore = false;
    skip = 0;

    try {
      const res = await fetch(
        `${HF_API}/models?search=${encodeURIComponent(q)}&limit=${PAGE_SIZE}&skip=0`
      );
      if (!res.ok) throw new Error(`HF API error: ${res.status}`);
      const data: HFRepo[] = await res.json();
      const filtered = data.filter((r: any) => !r.private && !r.disabled);
      hfResults = filtered;
      hasMore = data.length === PAGE_SIZE;
      skip = PAGE_SIZE;
      fetchTrees(filtered);
    } catch (e: any) {
      searchError = e.message ?? 'Failed to search HuggingFace';
    } finally {
      loading = false;
    }
  }

  function fetchTrees(repos: HFRepo[]) {
    for (const repo of repos) {
      if (repoFiles[repo.id] !== undefined) continue;
      repoFiles = { ...repoFiles, [repo.id]: null }; // null = loading
      fetchTree(repo.id).then((files) => {
        repoFiles = { ...repoFiles, [repo.id]: files };
      });
    }
  }

  async function loadMore() {
    loadingMore = true;
    try {
      const res = await fetch(
        `${HF_API}/models?search=${encodeURIComponent(searchQuery)}&limit=${PAGE_SIZE}&skip=${skip}`
      );
      if (!res.ok) throw new Error(`HF API error: ${res.status}`);
      const data: HFRepo[] = await res.json();
      const filtered = data.filter((r: any) => !r.private && !r.disabled);
      hfResults = [...hfResults, ...filtered];
      hasMore = data.length === PAGE_SIZE;
      skip = skip + PAGE_SIZE;
      fetchTrees(filtered);
    } catch (e: any) {
      searchError = e.message ?? 'Failed to load more';
    } finally {
      loadingMore = false;
    }
  }

  // Flatten repos + files into rows for display
  const rows = $derived(
    hfResults.flatMap((repo): FileRow[] => {
      const files = repoFiles[repo.id];
      if (!files || files.length === 0) {
        // Placeholder row while loading or when no files
        return [{
          repoId: repo.id,
          author: orgName(repo.id),
          pipelineTag: repo.pipeline_tag ?? '',
          likes: repo.likes,
          file: { path: '', size: 0, format: '', dataType: '', runtime: 'onnx' },
        }];
      }
      return files.map((file) => ({
        repoId: repo.id,
        author: orgName(repo.id),
        pipelineTag: repo.pipeline_tag ?? '',
        likes: repo.likes,
        file,
      }));
    })
  );

  function runFile(repoId: string, file: HFFile) {
    const payload = [{
      hf_model_id: repoId,
      file_path: file.path,
      data_type: file.dataType,
      runtime: file.runtime,
    }];
    sessionStorage.setItem('hf_ext_models', JSON.stringify(payload));
    goto('/run');
  }

  async function openRecipePicker(repoId: string, file: HFFile) {
    if (recipeTarget && recipeTarget.repoId === repoId && recipeTarget.file.path === file.path) {
      recipeTarget = null;
      return;
    }
    recipeTarget = { repoId, file };
    recipeSaved = false;
    recipeError = '';
    selectedRecipeId = '';
    newRecipeName = '';
    if (!get(isAuthenticated)) return;
    loadingRecipes = true;
    try {
      const authState = get(auth);
      recipes = await listRecipes(authState.user?.id);
    } catch (e: any) {
      recipeError = e.message ?? 'Failed to load recipes';
    } finally {
      loadingRecipes = false;
    }
  }

  async function saveToRecipe() {
    if (!recipeTarget) return;
    savingRecipe = true;
    recipeError = '';
    try {
      const authState = get(auth);
      if (!authState.user) throw new Error('Not authenticated');
      const model = {
        hf_model_id: recipeTarget.repoId,
        file_path: recipeTarget.file.path,
        data_type: recipeTarget.file.dataType,
        backends: ['wasm_1'],
      };
      if (selectedRecipeId === 'new') {
        if (!newRecipeName.trim()) throw new Error('Recipe name is required');
        await createRecipe(authState.user.id, newRecipeName.trim(), [model]);
      } else {
        const recipe = recipes.find((r) => r.id === selectedRecipeId);
        if (!recipe) throw new Error('Recipe not found');
        await updateRecipe(recipe.id, { models: [...(recipe.models ?? []), model] });
      }
      recipeSaved = true;
      recipeTarget = null;
      goto('/recipe');
    } catch (e: any) {
      recipeError = e.message ?? 'Failed to save recipe';
    } finally {
      savingRecipe = false;
    }
  }

  let searchTimeout: ReturnType<typeof setTimeout>;
  $effect(() => {
    const q = searchQuery;
    clearTimeout(searchTimeout);
    if (!q.trim()) return;
    searchTimeout = setTimeout(() => doSearch(q), 400);
    return () => clearTimeout(searchTimeout);
  });
</script>

<div class="hf-search">
  <div class="hf-section-header">
    <span class="hf-label">HuggingFace</span>
    <h3>Live results for "{searchQuery}"</h3>
    <span class="hf-hint">"In library" means already in the local database.</span>
  </div>

  {#if loading}
    <div class="hf-status">
      <span class="spinner"></span>
      Searching HuggingFace...
    </div>
  {:else if searchError}
    <div class="hf-error">{searchError}</div>
  {:else if hfResults.length === 0}
    <div class="hf-status">No results found on HuggingFace for "{searchQuery}".</div>
  {:else}
    <div class="hf-list">
      {#each rows as row (`${row.repoId}::${row.file.path}`)}
        {@const inLibrary = row.file.path ? localSet.has(`${row.repoId}::${row.file.path}`) : false}
        {@const isLoading = repoFiles[row.repoId] === null}
        {@const noFiles = repoFiles[row.repoId] !== null && repoFiles[row.repoId] !== undefined && (repoFiles[row.repoId]?.length ?? 0) === 0 && !row.file.path}
        {@const isRecipeOpen = recipeTarget?.repoId === row.repoId && recipeTarget?.file.path === row.file.path}

        <div class="file-card" class:in-library={inLibrary}>
          {#if row.pipelineTag}
            <span class="col col-task tag tag-task" title={row.pipelineTag}>{row.pipelineTag}</span>
          {:else}
            <span class="col col-task"></span>
          {/if}
          <span class="col col-org" title={row.author}>{row.author}</span>
          <span class="col col-repo" title={row.repoId}>{repoName(row.repoId)}</span>
          <span class="col col-file">
            {#if isLoading}
              <span class="spinner spinner-sm"></span>
            {:else if noFiles}
              <span class="no-files">No ONNX or LiteRT files</span>
            {:else if row.file.path}
              <span title={row.file.path}>{stripExt(row.file.path)}</span>
            {/if}
          </span>
          {#if row.file.format}
            <span class="col col-format tag tag-format" data-format={row.file.format} title="Format: {row.file.format}">{row.file.format}</span>
          {:else}
            <span class="col col-format"></span>
          {/if}
          {#if row.file.dataType}
            <span class="col col-dtype tag tag-dtype" data-dtype={row.file.dataType} title="Data type: {row.file.dataType}">{row.file.dataType}</span>
          {:else}
            <span class="col col-dtype"></span>
          {/if}
          <span class="col col-size" title={row.file.size > 0 ? `Size: ${formatSize(row.file.size)}` : ''}>{row.file.size > 0 ? formatSize(row.file.size) : ''}</span>
          {#if row.likes > 0}
            <span class="col col-stars stars">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
              {row.likes}
            </span>
          {:else}
            <span class="col col-stars"></span>
          {/if}
          {#if inLibrary}
            <span class="col col-lib tag tag-inlib">In library</span>
          {:else}
            <span class="col col-lib"></span>
          {/if}
          <span class="col col-actions">
            {#if row.file.path}
              <button class="btn-run" onclick={() => runFile(row.repoId, row.file)}>Run</button>
              <button
                class="btn-recipe"
                class:active={isRecipeOpen}
                onclick={() => openRecipePicker(row.repoId, row.file)}
              >+ Recipe</button>
            {/if}
          </span>
        </div>

        {#if isRecipeOpen}
          <div class="recipe-picker">
            {#if !$isAuthenticated}
              <p class="recipe-signin">
                <a href="/auth/login">Sign in to save</a> this model to a recipe.
              </p>
            {:else if loadingRecipes}
              <div class="recipe-loading">
                <span class="spinner spinner-sm"></span>
                Loading recipes...
              </div>
            {:else}
              <p class="recipe-picker-label">Add to recipe</p>
              <div class="recipe-options">
                {#if recipes.length === 0}
                  <div class="recipe-empty">No recipes yet.</div>
                {:else}
                  {#each recipes as recipe (recipe.id)}
                    <label class="recipe-option" class:selected={selectedRecipeId === recipe.id}>
                      <input type="radio" name="recipe-picker-{row.repoId}-{row.file.path}" value={recipe.id} bind:group={selectedRecipeId} />
                      <span class="recipe-option-name">{recipe.name}</span>
                      <span class="recipe-option-count">{recipe.models?.length ?? 0} model{(recipe.models?.length ?? 0) === 1 ? '' : 's'}</span>
                    </label>
                  {/each}
                {/if}
                <label class="recipe-option recipe-option-new" class:selected={selectedRecipeId === 'new'}>
                  <input type="radio" name="recipe-picker-{row.repoId}-{row.file.path}" value="new" bind:group={selectedRecipeId} />
                  <span class="recipe-option-name">New recipe</span>
                </label>
              </div>
              {#if selectedRecipeId === 'new'}
                <input
                  type="text"
                  class="recipe-name-input"
                  placeholder="Recipe name"
                  bind:value={newRecipeName}
                  onkeydown={(e) => { if (e.key === 'Enter') saveToRecipe(); }}
                />
              {/if}
              {#if recipeError}
                <p class="recipe-error">{recipeError}</p>
              {/if}
              <div class="recipe-picker-actions">
                <button class="btn-recipe-cancel" onclick={() => { recipeTarget = null; }}>Cancel</button>
                <button
                  class="btn-recipe-save"
                  onclick={saveToRecipe}
                  disabled={savingRecipe || !selectedRecipeId || (selectedRecipeId === 'new' && !newRecipeName.trim())}
                >{savingRecipe ? 'Saving...' : 'Save'}</button>
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    </div>

    {#if hasMore}
      <div class="load-more-wrap">
        <button class="btn-load-more" onclick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .hf-search {
    margin-top: var(--space-3);
    border: 1.5px dashed var(--color-border-strong);
    border-radius: var(--radius-lg);
    background: var(--color-surface-sunken);
    padding: var(--space-3);
  }

  .hf-section-header {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-bottom: var(--space-2);
  }

  .hf-label {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-primary);
    background: var(--color-accent-light);
    padding: 2px 7px;
    border-radius: var(--radius-sm);
  }

  .hf-section-header h3 {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .hf-hint {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .hf-status {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    padding: var(--space-2) 0;
  }

  .hf-error {
    font-size: var(--text-sm);
    color: var(--color-error);
    padding: var(--space-2) 0;
  }

  .hf-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-1);
  }

  @media (max-width: 700px) {
    .hf-list {
      grid-template-columns: 1fr;
    }
  }

  /* 76px task | 72px org | 120px repo | 1fr file | 58px format | 52px dtype | 56px size | 44px stars | 68px in-lib | 110px actions */
  .file-card {
    display: grid;
    grid-template-columns: 76px 72px 120px 1fr 58px 52px 56px 44px 68px 110px;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    min-width: 0;
    transition: border-color var(--transition-base), background var(--transition-base);
  }

  .file-card:hover {
    border-color: var(--color-border-strong);
  }

  .file-card.in-library {
    border-color: color-mix(in srgb, var(--color-success, #10b981) 40%, var(--color-border));
    background: color-mix(in srgb, var(--color-success, #10b981) 5%, var(--color-surface-raised));
  }

  .col {
    overflow: hidden;
    min-width: 0;
  }

  .col-task,
  .col-format,
  .col-dtype,
  .col-lib {
    display: flex;
    align-items: center;
    overflow: hidden;
  }

  .col-org,
  .col-repo,
  .col-file {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-org {
    color: var(--color-text-muted);
  }

  .col-repo {
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .col-file {
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .col-size {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    text-align: right;
  }

  .col-stars {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }

  .col-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    justify-content: flex-end;
  }

  .stars {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .no-files {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-style: italic;
  }

  .tag {
    font-family: var(--font-ui);
    font-size: 10px;
    padding: 1px 5px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    display: inline-block;
    line-height: 1.6;
  }

  .tag-task,
  .tag-format,
  .tag-dtype {
    width: 100%;
  }

  .tag-format,
  .tag-dtype {
    text-align: center;
  }

  .tag-task {
    background: var(--color-surface-sunken);
  }

  .tag-format[data-format="onnx"]     { color: #3b82f6; border-color: #3b82f6; }
  .tag-format[data-format="tflite"]   { color: #10b981; border-color: #10b981; }
  .tag-format[data-format="litertlm"] { color: #f97316; border-color: #f97316; }

  .tag-dtype[data-dtype="fp32"] { color: var(--color-primary); border-color: var(--color-primary); }
  .tag-dtype[data-dtype="fp16"] { color: #8b5cf6; border-color: #8b5cf6; }
  .tag-dtype[data-dtype="bf16"] { color: #7c3aed; border-color: #7c3aed; }
  .tag-dtype[data-dtype="fp8"]  { color: #a855f7; border-color: #a855f7; }
  .tag-dtype[data-dtype="int8"] { color: #06b6d4; border-color: #06b6d4; }
  .tag-dtype[data-dtype="uint8"]{ color: #0891b2; border-color: #0891b2; }
  .tag-dtype[data-dtype="int4"] { color: #10b981; border-color: #10b981; }
  .tag-dtype[data-dtype="uint4"]{ color: #059669; border-color: #059669; }
  .tag-dtype[data-dtype="q4"]   { color: #16a34a; border-color: #16a34a; }
  .tag-dtype[data-dtype="q4f16"]{ color: #6366f1; border-color: #6366f1; }
  .tag-dtype[data-dtype="bnb4"]      { color: #f59e0b; border-color: #f59e0b; }
  .tag-dtype[data-dtype="quantized"] { color: #ea580c; border-color: #ea580c; }

  .tag-inlib {
    background: color-mix(in srgb, var(--color-success, #10b981) 12%, transparent);
    color: var(--color-success, #10b981);
    border-color: color-mix(in srgb, var(--color-success, #10b981) 30%, transparent);
  }

  .btn-run {
    font-family: var(--font-ui);
    font-size: 10px;
    font-weight: 500;
    padding: 2px 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--color-primary);
    color: #fff;
    cursor: pointer;
    white-space: nowrap;
    transition: background var(--transition-base);
  }

  .btn-run:hover {
    background: var(--color-primary-hover);
  }

  .btn-recipe {
    font-family: var(--font-ui);
    font-size: 10px;
    font-weight: 500;
    padding: 2px 8px;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    white-space: nowrap;
    transition: background var(--transition-base), border-color var(--transition-base), color var(--transition-base);
  }

  .btn-recipe:hover,
  .btn-recipe.active {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-accent-light);
  }

  /* Recipe picker */
  .recipe-picker {
    grid-column: 1 / -1;
    margin: 0 var(--space-2) var(--space-1);
    padding: var(--space-2);
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
  }

  .recipe-signin {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .recipe-signin a {
    color: var(--color-primary);
    text-decoration: none;
  }

  .recipe-signin a:hover {
    text-decoration: underline;
  }

  .recipe-loading {
    display: flex;
    align-items: center;
    gap: var(--space-half);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .recipe-picker-label {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
    margin-bottom: var(--space-1);
  }

  .recipe-options {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: var(--space-1);
    max-height: 180px;
    overflow-y: auto;
  }

  .recipe-empty {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    padding: var(--space-half) 0;
  }

  .recipe-option {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-half) var(--space-1);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--transition-base), border-color var(--transition-base);
  }

  .recipe-option:hover {
    background: var(--color-surface-sunken);
    border-color: var(--color-border);
  }

  .recipe-option.selected {
    background: var(--color-accent-light);
    border-color: var(--color-primary);
  }

  .recipe-option input[type="radio"] {
    accent-color: var(--color-primary);
    flex-shrink: 0;
  }

  .recipe-option-name {
    font-size: var(--text-sm);
    color: var(--color-text-primary);
    flex: 1;
  }

  .recipe-option-count {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .recipe-option-new .recipe-option-name {
    color: var(--color-primary);
    font-weight: 500;
  }

  .recipe-name-input {
    width: 100%;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-half) var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-primary);
    outline: none;
    margin-bottom: var(--space-1);
    box-sizing: border-box;
    transition: border-color var(--transition-base);
  }

  .recipe-name-input:focus {
    border-color: var(--color-primary);
  }

  .recipe-error {
    font-size: var(--text-xs);
    color: var(--color-error);
    margin-bottom: var(--space-half);
  }

  .recipe-picker-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-half);
  }

  .btn-recipe-cancel {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    padding: 4px 10px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
  }

  .btn-recipe-cancel:hover {
    background: var(--color-surface-sunken);
  }

  .btn-recipe-save {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 4px 12px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--color-primary);
    color: #fff;
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-recipe-save:hover {
    background: var(--color-primary-hover);
  }

  .btn-recipe-save:disabled {
    background: var(--color-disabled, #ccc);
    color: var(--color-text-muted);
    cursor: not-allowed;
  }

  .load-more-wrap {
    display: flex;
    justify-content: center;
    margin-top: var(--space-2);
  }

  .btn-load-more {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background var(--transition-base), border-color var(--transition-base);
  }

  .btn-load-more:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-accent-light);
  }

  .btn-load-more:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  .spinner-sm {
    width: 10px;
    height: 10px;
    border-width: 1.5px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
