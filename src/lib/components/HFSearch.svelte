<script lang="ts">
  import { inferFormat, inferDataType, inferRuntime, stripExt } from '$lib/huggingface/parser';

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

  interface GroupedHFFile {
    key: string;
    strippedPath: string;
    format: string;
    runtime: 'onnx' | 'litert';
    files: HFFile[];
  }

  function groupFiles(files: HFFile[]): GroupedHFFile[] {
    const map = new Map<string, GroupedHFFile>();
    for (const f of files) {
      const stripped = stripExt(f.path);
      const key = `${stripped}::${f.format}`;
      if (!map.has(key)) {
        map.set(key, { key, strippedPath: stripped, format: f.format, runtime: f.runtime, files: [] });
      }
      map.get(key)!.files.push(f);
    }
    return [...map.values()];
  }

  function dtypeLabel(dt: string): string {
    return dt === 'quantized' ? 'quant' : dt;
  }

  function groupSizeRange(files: HFFile[]): string {
    if (files.length === 0) return '';
    const sizes = files.map((f) => f.size);
    const min = Math.min(...sizes);
    const max = Math.max(...sizes);
    return min === max ? formatSize(min) : `${formatSize(min)}...${formatSize(max)}`;
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

  function formatSize(bytes: number): string {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${bytes} B`;
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
            {@const grouped = groupFiles(files)}
            <div class="file-grid">
              {#each grouped as group (group.key)}
                {@const task = repo.pipeline_tag ?? ''}
                {@const anySelected = group.files.some((f) => isSelected(repo.id, f.path))}
                {@const inLibrary = group.files.some((f) => localSet.has(`${repo.id}::${f.path}`))}

                <div
                  class="file-card"
                  class:has-selection={anySelected}
                  class:in-library={inLibrary}
                >
                  <div class="card-left">
                    <div class="card-top">
                      {#if task && task !== 'uncategorized'}
                        <span class="info-task">{task}</span>
                      {/if}
                      {#if inLibrary}
                        <span class="tag tag-inlib">In library</span>
                      {/if}
                      <span class="info-file" title={group.strippedPath}>{group.strippedPath}</span>
                    </div>
                    <div class="card-bottom">
                      <span class="tag tag-format" data-format={group.format}>{group.format}</span>
                    </div>
                  </div>
                  <div class="card-chips">
                    {#each group.files as file (file.path)}
                      <button
                        class="chip"
                        class:chip-selected={isSelected(repo.id, file.path)}
                        data-dtype={file.dataType}
                        title={`${file.dataType} · ${formatSize(file.size)}`}
                        onclick={() => toggleFile(repo.id, file, task)}
                      >{dtypeLabel(file.dataType)}</button>
                    {/each}
                  </div>
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
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-bottom: 1px solid var(--color-border);
    min-width: 0;
    pointer-events: none;
    transition: background var(--transition-base);
  }

  .file-card:nth-child(odd) {
    border-right: 1px solid var(--color-border);
  }

  .file-card.has-selection {
    border-color: rgba(99, 102, 241, 0.5);
    background: color-mix(in srgb, #6366f1 4%, var(--color-surface-raised));
  }

  .file-card.in-library {
    background: color-mix(in srgb, #10b981 5%, var(--color-surface-raised));
  }

  .card-left {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
    min-width: 0;
  }

  .card-top,
  .card-bottom {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .card-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    justify-content: flex-end;
    align-content: flex-start;
    max-width: 180px;
    flex-shrink: 0;
    pointer-events: auto;
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
    min-width: 0;
  }

  .size-range {
    font-family: var(--font-mono);
    color: var(--color-text-muted);
    border-color: var(--color-border);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .chip {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: var(--radius-sm);
    border: 1px solid;
    background: none;
    cursor: pointer;
    transition: opacity 0.12s, transform 0.12s;
    user-select: none;
    line-height: 1.4;
  }

  .chip:hover { opacity: 0.8; transform: translateY(-1px); }

  .chip[data-dtype="fp32"]      { color: var(--color-primary); border-color: var(--color-primary); }
  .chip[data-dtype="fp16"]      { color: #8b5cf6; border-color: #8b5cf6; }
  .chip[data-dtype="bf16"]      { color: #7c3aed; border-color: #7c3aed; }
  .chip[data-dtype="fp8"]       { color: #a855f7; border-color: #a855f7; }
  .chip[data-dtype="int8"]      { color: #06b6d4; border-color: #06b6d4; }
  .chip[data-dtype="uint8"]     { color: #0891b2; border-color: #0891b2; }
  .chip[data-dtype="int4"]      { color: #10b981; border-color: #10b981; }
  .chip[data-dtype="uint4"]     { color: #059669; border-color: #059669; }
  .chip[data-dtype="q4"]        { color: #16a34a; border-color: #16a34a; }
  .chip[data-dtype="q4f16"]     { color: #6366f1; border-color: #6366f1; }
  .chip[data-dtype="bnb4"]      { color: #f59e0b; border-color: #f59e0b; }
  .chip[data-dtype="quantized"] { color: #ea580c; border-color: #ea580c; }

  .chip.chip-selected { color: #fff; }
  .chip.chip-selected[data-dtype="fp32"]      { background: var(--color-primary); border-color: var(--color-primary); }
  .chip.chip-selected[data-dtype="fp16"]      { background: #8b5cf6; border-color: #8b5cf6; }
  .chip.chip-selected[data-dtype="bf16"]      { background: #7c3aed; border-color: #7c3aed; }
  .chip.chip-selected[data-dtype="fp8"]       { background: #a855f7; border-color: #a855f7; }
  .chip.chip-selected[data-dtype="int8"]      { background: #06b6d4; border-color: #06b6d4; }
  .chip.chip-selected[data-dtype="uint8"]     { background: #0891b2; border-color: #0891b2; }
  .chip.chip-selected[data-dtype="int4"]      { background: #10b981; border-color: #10b981; }
  .chip.chip-selected[data-dtype="uint4"]     { background: #059669; border-color: #059669; }
  .chip.chip-selected[data-dtype="q4"]        { background: #16a34a; border-color: #16a34a; }
  .chip.chip-selected[data-dtype="q4f16"]     { background: #6366f1; border-color: #6366f1; }
  .chip.chip-selected[data-dtype="bnb4"]      { background: #f59e0b; border-color: #f59e0b; }
  .chip.chip-selected[data-dtype="quantized"] { background: #ea580c; border-color: #ea580c; }

  @media (max-width: 700px) {
    .file-grid {
      grid-template-columns: 1fr;
    }

    .file-card:nth-child(odd) {
      border-right: none;
    }
  }

  .tag-task {
    background: var(--color-surface-sunken);
  }

  .tag-format[data-format="onnx"]     { color: #3b82f6; border-color: #3b82f6; }
  .tag-format[data-format="tflite"]   { color: #10b981; border-color: #10b981; }
  .tag-format[data-format="litertlm"] { color: #f97316; border-color: #f97316; }

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
