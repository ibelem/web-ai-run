<script lang="ts">
  import { fly } from 'svelte/transition';
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
    size_bytes?: number;
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

  interface ResolvedRepo {
    repo: HFRepo;
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

  const HF_API = 'https://huggingface.co/api';
  const PAGE_SIZE = 20;
  const TREE_CONCURRENCY = 4;

  let loading = $state(false);
  let loadingMore = $state(false);
  let hasMore = $state(false);
  let skip = $state(0);
  let searchError = $state('');

  // Scanning ticker state
  let scanning = $state(false);
  let scanningName = $state('');
  let scannedCount = $state(0);
  let totalToScan = $state(0);

  // Only repos with supported files, in order found
  let resolvedRepos = $state<ResolvedRepo[]>([]);

  const localSet = $derived(
    new Set(localModels.map((m) => `${m.hf_model_id}::${m.file_path}`))
  );

  function formatSize(bytes: number): string {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${bytes} B`;
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
          size: item.lfs?.size ?? item.size ?? 0,
          format: inferFormat(path),
          dataType: inferDataType(path),
          runtime: inferRuntime(path) as 'onnx' | 'litert',
        };
      })
      .filter((f) => f.runtime !== null);
  }

  async function scanRepos(repos: HFRepo[]) {
    scanning = true;
    totalToScan += repos.length;

    let idx = 0;
    async function worker() {
      while (idx < repos.length) {
        const repo = repos[idx++];
        scanningName = repo.id;
        const files = await fetchTree(repo.id);
        scannedCount += 1;
        if (files.length > 0) {
          resolvedRepos = [...resolvedRepos, { repo, files }];
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(TREE_CONCURRENCY, repos.length) }, worker));
    scanning = false;
  }

  async function doSearch(q: string) {
    loading = true;
    searchError = '';
    resolvedRepos = [];
    hasMore = false;
    skip = 0;
    scanning = false;
    scanningName = '';
    scannedCount = 0;
    totalToScan = 0;

    try {
      const res = await fetch(
        `${HF_API}/models?search=${encodeURIComponent(q)}&limit=${PAGE_SIZE}&skip=0`
      );
      if (!res.ok) throw new Error(`HF API error: ${res.status}`);
      const data: HFRepo[] = await res.json();
      const filtered = data.filter((r: any) => !r.private && !r.disabled);
      hasMore = data.length === PAGE_SIZE;
      skip = PAGE_SIZE;
      scanRepos(filtered);
    } catch (e: any) {
      searchError = e.message ?? 'Failed to search HuggingFace';
    } finally {
      loading = false;
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
      hasMore = data.length === PAGE_SIZE;
      skip = skip + PAGE_SIZE;
      scanRepos(filtered);
    } catch (e: any) {
      searchError = e.message ?? 'Failed to load more';
    } finally {
      loadingMore = false;
    }
  }

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
        size_bytes: file.size,
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
  {:else if loading}
    <div class="hf-status">
      <span class="spinner"></span>
      Searching HuggingFace...
    </div>
  {:else if searchError}
    <div class="hf-error">{searchError}</div>
  {:else}

    {#if scanning || resolvedRepos.length > 0 || scannedCount > 0}
      <div class="scan-row">
        {#if scanning}
          <span class="spinner spinner-sm"></span>
          <span class="scan-label">Checking</span>
          <div class="scan-ticker">
            {#key scanningName}
              <span
                class="scan-name"
                in:fly={{ y: 8, duration: 140 }}
                out:fly={{ y: -8, duration: 140 }}
              >{scanningName}</span>
            {/key}
          </div>
          <span class="scan-progress">{scannedCount}/{totalToScan}</span>
        {:else if resolvedRepos.length === 0}
          <span class="scan-empty">No repos with supported formats (.onnx, .tflite, .litertlm) found</span>
        {:else}
          <span class="scan-done">
            {resolvedRepos.length} repo{resolvedRepos.length !== 1 ? 's' : ''} with supported models
            <span class="scan-hint"> · "In library" = already in local database</span>
          </span>
        {/if}
        {#if !scanning}
          <div class="scan-row-actions">
            {#if loadingMore}
              <span class="spinner spinner-sm"></span>
            {:else if hasMore}
              <button class="btn-load-more-inline" onclick={loadMore}>Load more</button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    {#if resolvedRepos.length > 0}
      <div class="repo-list">
        {#each resolvedRepos as { repo, files } (repo.id)}
          {@const counts = formatCounts(files)}
          {@const grouped = groupFiles(files)}
          <div class="repo-group">
            <div class="repo-header">
              <div class="repo-header-left">
                {#if repo.pipeline_tag}
                  <span class="tag tag-task" title={repo.pipeline_tag}>{repo.pipeline_tag}</span>
                {/if}
                <a class="repo-name" href="https://huggingface.co/{repo.id}" target="_blank" rel="noopener noreferrer" title={repo.id}>{repo.id}</a>
                {#each counts as c (c.format)}
                  <span class="tag tag-format fmt-count" data-format={c.format}>{c.format} ×{c.count}</span>
                {/each}
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
                      {#if inLibrary}
                        <span class="tag tag-inlib">In library</span>
                      {/if}
                      <span class="info-file" title="{group.strippedPath}.{group.format}">{group.strippedPath}.{group.format}</span>
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
          </div>
        {/each}
      </div>
    {/if}


  {/if}
</div>

<style>
  .hf-search {
    margin-top: var(--space-1);
    margin-bottom: var(--space-1);
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

  /* Scan ticker */
  .scan-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    margin: 0 auto var(--space-1);
    max-width: 600px;
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    min-height: 32px;
    overflow: hidden;
  }

  .scan-label {
    font-weight: 600;
    color: var(--color-text-secondary);
    flex-shrink: 0;
  }

  .scan-ticker {
    flex: 1;
    position: relative;
    height: 18px;
    overflow: hidden;
    min-width: 0;
  }

  .scan-name {
    position: absolute;
    inset: 0;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 18px;
  }

  .scan-progress {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .scan-done {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    flex: 1;
  }

  .scan-row-actions {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .btn-load-more-inline {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 3px 10px;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    cursor: pointer;
    white-space: nowrap;
    transition: background var(--transition-base), border-color var(--transition-base), color var(--transition-base);
  }

  .btn-load-more-inline:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background:var(--color-accent-light);
  }


  .scan-hint {
    color: var(--color-text-muted);
  }

  .scan-empty {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-style: italic;
    flex: 1;
  }

  /* Repo cards */
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
  }

  .repo-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-1);
    padding: 3px 10px;
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

  .repo-name:hover { text-decoration: underline; }

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

  .file-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
  }

  .file-card {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 10px;
    min-width: 0;
    pointer-events: none;
    transition: background var(--transition-base);
  }

  .file-card {
    border-bottom: 0px solid var(--color-border);
  }

  .file-card.has-selection {
    border-color: var(--color-primary);
    background:var(--color-accent-light);
  }

  .file-card.in-library {
    background: color-mix(in srgb, var(--color-backend-wasm-1) 3%, var(--color-surface-raised));
  }

  .card-left {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
    min-width: 0;
  }

  .card-top {
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
    width: clamp(80px, 40%, 200px);
    flex-shrink: 0;
    pointer-events: auto;
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

  .chip {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    padding: 1px 7px;
    border-radius: var(--radius-sm);
    border: 1px solid;
    background: none;
    cursor: pointer;
    transition: opacity 0.12s, transform 0.12s;
    user-select: none;
    line-height: 1.4;
  }

  .chip:hover { opacity: 0.8; transform: translateY(-1px); }

  .chip[data-dtype="fp32"]      { color: var(--color-dt-fp32); border-color: var(--color-dt-fp32); }
  .chip[data-dtype="fp16"]      { color: var(--color-dt-fp16); border-color: var(--color-dt-fp16); }
  .chip[data-dtype="bf16"]      { color: var(--color-dt-bf16); border-color: var(--color-dt-bf16); }
  .chip[data-dtype="fp8"]       { color: var(--color-dt-fp8); border-color: var(--color-dt-fp8); }
  .chip[data-dtype="int8"]      { color: var(--color-dt-int8); border-color: var(--color-dt-int8); }
  .chip[data-dtype="uint8"]     { color: var(--color-dt-uint8); border-color: var(--color-dt-uint8); }
  .chip[data-dtype="int4"]      { color: var(--color-dt-int4); border-color: var(--color-dt-int4); }
  .chip[data-dtype="uint4"]     { color: var(--color-dt-uint4); border-color: var(--color-dt-uint4); }
  .chip[data-dtype="q4"]        { color: var(--color-dt-q4); border-color: var(--color-dt-q4); }
  .chip[data-dtype="q4f16"]     { color: var(--color-dt-q4f16); border-color: var(--color-dt-q4f16); }
  .chip[data-dtype="bnb4"]      { color: var(--color-dt-bnb4); border-color: var(--color-dt-bnb4); }
  .chip[data-dtype="quantized"] { color: var(--color-dt-quantized); border-color: var(--color-dt-quantized); }

  .chip.chip-selected { color: #fff; }
  .chip.chip-selected[data-dtype="fp32"]      { background: var(--color-dt-fp32); border-color: var(--color-dt-fp32); }
  .chip.chip-selected[data-dtype="fp16"]      { background: var(--color-dt-fp16); border-color: var(--color-dt-fp16); }
  .chip.chip-selected[data-dtype="bf16"]      { background: var(--color-dt-bf16); border-color: var(--color-dt-bf16); }
  .chip.chip-selected[data-dtype="fp8"]       { background: var(--color-dt-fp8); border-color: var(--color-dt-fp8); }
  .chip.chip-selected[data-dtype="int8"]      { background: var(--color-dt-int8); border-color: var(--color-dt-int8); }
  .chip.chip-selected[data-dtype="uint8"]     { background: var(--color-dt-uint8); border-color: var(--color-dt-uint8); }
  .chip.chip-selected[data-dtype="int4"]      { background: var(--color-dt-int4); border-color: var(--color-dt-int4); }
  .chip.chip-selected[data-dtype="uint4"]     { background: var(--color-dt-uint4); border-color: var(--color-dt-uint4); }
  .chip.chip-selected[data-dtype="q4"]        { background: var(--color-dt-q4); border-color: var(--color-dt-q4); }
  .chip.chip-selected[data-dtype="q4f16"]     { background: var(--color-dt-q4f16); border-color: var(--color-dt-q4f16); }
  .chip.chip-selected[data-dtype="bnb4"]      { background: var(--color-dt-bnb4); border-color: var(--color-dt-bnb4); }
  .chip.chip-selected[data-dtype="quantized"] { background: var(--color-dt-quantized); border-color: var(--color-dt-quantized); }

  @media (max-width: 700px) {
    .file-grid { grid-template-columns: 1fr; }
    .file-card:nth-child(odd) { border-right: none; }
  }

  .tag-task { background: var(--color-surface-sunken); }

  .tag-format[data-format="onnx"]     { color: var(--color-fmt-onnx); border-color: var(--color-fmt-onnx); }
  .tag-format[data-format="tflite"]   { color: var(--color-fmt-tflite); border-color: var(--color-fmt-tflite); }
  .tag-format[data-format="litertlm"] { color: var(--color-fmt-litertlm); border-color: var(--color-fmt-litertlm); }

</style>
