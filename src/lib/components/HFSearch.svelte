<script lang="ts">
  interface Props {
    searchQuery: string;
    localModels?: { hf_model_id: string; file_path: string }[];
    selectedHFModels?: SelectedHFModel[];
  }

  export interface SelectedHFModel {
    hf_model_id: string;
    file_path: string;
    data_type: string;
    runtime: 'onnx' | 'litert';
    task: string;
  }

  let { searchQuery, localModels = [], selectedHFModels = $bindable([]) }: Props = $props();

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

  const HF_API = 'https://huggingface.co/api';
  const PAGE_SIZE = 20;

  let hfResults = $state<HFRepo[]>([]);
  let loading = $state(false);
  let loadingMore = $state(false);
  let hasMore = $state(false);
  let skip = $state(0);
  let searchError = $state('');
  let autoFetchCount = $state(0);
  const MAX_AUTO_FETCH = 3;
  let dismissingRepos = $state(new Set<string>());
  let dismissedRepos = $state(new Set<string>());
  let repoFiles = $state<Record<string, HFFile[] | null>>({});

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
    dismissingRepos = new Set();
    dismissedRepos = new Set();

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
      autoFetchCount = 0;
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
      repoFiles = { ...repoFiles, [repo.id]: null };
      fetchTree(repo.id).then((files) => {
        repoFiles = { ...repoFiles, [repo.id]: files };
        if (files.length === 0) {
          setTimeout(() => {
            dismissingRepos = new Set([...dismissingRepos, repo.id]);
            setTimeout(() => {
              dismissedRepos = new Set([...dismissedRepos, repo.id]);
            }, 450);
          }, 300); // brief pause so user sees the repo before it fades
        }
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
      autoFetchCount += 1;
      fetchTrees(filtered);
    } catch (e: any) {
      searchError = e.message ?? 'Failed to load more';
    } finally {
      loadingMore = false;
    }
  }

  // Hide only fully dismissed repos (animation complete)
  const visibleRepos = $derived(
    hfResults.filter((repo) => !dismissedRepos.has(repo.id))
  );

  // When all current repos are resolved and hasMore, auto-fetch up to MAX_AUTO_FETCH times
  const allResolved = $derived(
    hfResults.length > 0 && hfResults.every((r) => repoFiles[r.id] !== null && repoFiles[r.id] !== undefined)
  );

  $effect(() => {
    if (allResolved && hasMore && !loadingMore && autoFetchCount < MAX_AUTO_FETCH) {
      loadMore();
    }
  });

  function formatCounts(files: HFFile[]): { format: string; count: number }[] {
    const counts: Record<string, number> = {};
    for (const f of files) if (f.format) counts[f.format] = (counts[f.format] ?? 0) + 1;
    return Object.entries(counts).map(([format, count]) => ({ format, count }));
  }

  function fileKey(repoId: string, filePath: string): string {
    return `${repoId}::${filePath}`;
  }

  function isSelected(repoId: string, filePath: string): boolean {
    return selectedHFModels.some((m) => m.hf_model_id === repoId && m.file_path === filePath);
  }

  function toggleFile(repoId: string, file: HFFile, task: string) {
    if (isSelected(repoId, file.path)) {
      selectedHFModels = selectedHFModels.filter(
        (m) => !(m.hf_model_id === repoId && m.file_path === file.path)
      );
    } else {
      selectedHFModels = [...selectedHFModels, {
        hf_model_id: repoId,
        file_path: file.path,
        data_type: file.dataType,
        runtime: file.runtime,
        task,
      }];
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
  {#if !searchQuery.trim()}
    <div class="hf-status">Type a search query above to search HuggingFace.</div>
  {:else}
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
    <div class="repo-list">
      {#each visibleRepos as repo (repo.id)}
        {@const files = repoFiles[repo.id]}
        {@const isLoading = files === null}
        {@const counts = files ? formatCounts(files) : []}

        <div class="repo-group" class:dismissing={dismissingRepos.has(repo.id)}>
          <!-- Repo header: full width -->
          <div class="repo-header">
            <div class="repo-header-left">
              {#if repo.pipeline_tag}
                <span class="tag tag-task" title={repo.pipeline_tag}>{repo.pipeline_tag}</span>
              {/if}
              <a class="repo-name" href="https://huggingface.co/{repo.id}" target="_blank" rel="noopener noreferrer" title={repo.id}>{repo.id}</a>
              {#if isLoading}
                <span class="spinner spinner-sm"></span>
              {:else if files !== null && files !== undefined && files.length === 0}
                <span class="no-formats-label">No supported formats (onnx / tflite / litertlm)</span>
              {:else}
                {#each counts as c (c.format)}
                  <span class="tag tag-format fmt-count" data-format={c.format}>{c.format} ×{c.count}</span>
                {/each}
              {/if}
            </div>
            <div class="repo-header-right">
              {#if repo.likes > 0}
                <span class="stars">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                  {repo.likes}
                </span>
              {/if}
            </div>
          </div>
          {#if files && files.length > 0}
            <div class="file-grid">
              {#each files as file (file.path)}
                {@const inLibrary = localSet.has(`${repo.id}::${file.path}`)}
                {@const selected = isSelected(repo.id, file.path)}
                {@const task = repo.pipeline_tag ?? ''}

                <div
                  class="file-card"
                  class:in-library={inLibrary}
                  class:selected
                  onclick={() => toggleFile(repo.id, file, task)}
                  role="checkbox"
                  aria-checked={selected}
                  tabindex="0"
                  onkeydown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleFile(repo.id, file, task); } }}
                >
                  <div class="col col-check">
                    <input type="checkbox" checked={selected} class="check" tabindex="-1" onclick={(e) => { e.stopPropagation(); toggleFile(repo.id, file, task); }} />
                  </div>
                  <div class="col col-info" title="{repo.id} — {file.path}">
                    {#if task && task !== 'uncategorized'}
                      <span class="info-task">{task}</span>
                    {/if}
                    <span class="info-file">{stripExt(file.path)}</span>
                  </div>
                  <span class="col col-lib">{#if inLibrary}<span class="tag tag-inlib">In library</span>{/if}</span>
                  <span class="col col-format" title="Format: {file.format}"><span class="tag tag-format" data-format={file.format}>{file.format}</span></span>
                  <span class="col col-dtype" title="Data type: {file.dataType}"><span class="tag tag-dtype" data-dtype={file.dataType}>{file.dataType}</span></span>
                  <span class="col col-size" title="Size: {formatSize(file.size)}"><span class="tag tag-size">{formatSize(file.size)}</span></span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    {#if loadingMore}
      <div class="load-more-wrap">
        <span class="spinner spinner-sm"></span>
        <span class="load-more-hint">Fetching more repos...</span>
      </div>
    {:else if hasMore && autoFetchCount >= MAX_AUTO_FETCH}
      <div class="load-more-wrap">
        <button class="btn-load-more" onclick={loadMore}>Load more</button>
      </div>
    {/if}
  {/if}
  {/if}
</div>

<style>
  .hf-search {
    margin-top: var(--space-3);
    margin-bottom: var(--space-3);
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

  .repo-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .repo-group {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface-raised);
    overflow: hidden;
    transform-origin: top;
  }

  .repo-group.dismissing {
    animation: repo-dismiss 400ms ease-out forwards;
    pointer-events: none;
  }

  @keyframes repo-dismiss {
    0%   { opacity: 1; transform: scaleY(1);   max-height: 400px; margin-bottom: var(--space-2); }
    60%  { opacity: 0; transform: scaleY(0.85); }
    100% { opacity: 0; transform: scaleY(0);    max-height: 0;    margin-bottom: 0; padding: 0; }
  }

  .repo-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-1);
    padding: 7px 12px;
    background: var(--color-surface-sunken);
    border-bottom: 1px solid var(--color-border);
  }

  .repo-header-left {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex: 1;
    flex-wrap: wrap;
  }

  .repo-header-right {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .repo-name {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-primary);
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .repo-name:hover {
    text-decoration: underline;
  }

  .fmt-count {
    flex-shrink: 0;
    width: auto !important;
  }

  .stars {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .no-files {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-style: italic;
  }

  .no-formats-label {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-style: italic;
  }

  .file-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
  }

  .file-card {
    display: grid;
    grid-template-columns: 20px 1fr 60px 46px 46px 60px;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-bottom: 1px solid var(--color-border);
    min-width: 0;
    cursor: pointer;
    transition: background var(--transition-base), border-color var(--transition-base);
  }

  @media (max-width: 700px) {
    .file-grid {
      grid-template-columns: 1fr;
    }

    .file-card:nth-child(odd) {
      border-right: none;
    }
  }

  @media (max-width: 500px) {
    .file-card {
      grid-template-columns: 20px 1fr 46px 46px;
    }

    .col-lib,
    .col-size {
      display: none;
    }
  }

  .file-card.selected {
    border-color: var(--color-info);
    background: color-mix(in srgb, var(--color-info) 6%, var(--color-surface-raised));
  }


  .file-card:nth-child(odd) {
    border-right: 1px solid var(--color-border);
  }

  .file-card:hover {
    background: var(--color-accent-light);
  }

  .file-card.in-library {
    background: color-mix(in srgb, var(--color-success, #10b981) 5%, var(--color-surface-raised));
  }

  .file-card.in-library:hover {
    background: color-mix(in srgb, var(--color-success, #10b981) 10%, var(--color-surface-raised));
  }

  .col {
    overflow: hidden;
    min-width: 0;
  }

  .col-check {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .check {
    width: 14px;
    height: 14px;
    cursor: pointer;

    flex-shrink: 0;
  }

  .col-format,
  .col-dtype,
  .col-lib {
    display: flex;
    align-items: center;
    overflow: hidden;
  }

  .col-info {
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
    overflow: hidden;
    line-height: 1.2;
  }

  .info-task {
    font-family: var(--font-ui);
    font-size: 10px;
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .info-file {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-size {
    display: flex;
    align-items: center;
    overflow: hidden;
  }

  .tag-size {
    width: 100%;
    text-align: center;
    font-family: var(--font-mono);
  }


  /* Inside file-card columns, stretch to fill */
  .col-format .tag-format,
  .col-dtype .tag-dtype,
  .col-lib .tag-inlib,
  .col-size .tag-size {
    width: 100%;
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


  .load-more-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }

  .load-more-hint {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
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

</style>
