<script lang="ts">
  import { fly } from 'svelte/transition';
  import { inferDataType, DTYPE_ORDER } from '$lib/huggingface/parser';

  interface Props {
    query: string;
    localModels?: { hf_model_id: string; data_type: string }[];
    onadd?: (hfModelId: string, dtype: string, sizeBytes?: number) => void;
  }

  let { query, localModels = [], onadd }: Props = $props();

  interface HFRepo {
    id: string;
    pipeline_tag?: string;
    likes: number;
  }

  interface DtypeChip {
    dtype: string;
    onnxPath: string;
    sizeBytes: number;
  }

  interface ResolvedRepo {
    repo: HFRepo;
    dtypes: DtypeChip[];
    eligible: boolean;
    missingFiles: string[];
  }

  const HF_API = 'https://huggingface.co/api';
  const PAGE_SIZE = 20;
  const TREE_CONCURRENCY = 4;
  const REQUIRED = ['config.json', 'tokenizer.json', 'tokenizer_config.json'];

  let loading = $state(false);
  let loadingMore = $state(false);
  let hasMore = $state(false);
  let skip = $state(0);
  let searchError = $state('');
  let scanning = $state(false);
  let scanningName = $state('');
  let scannedCount = $state(0);
  let totalToScan = $state(0);
  let resolvedRepos = $state<ResolvedRepo[]>([]);

  const localSet = $derived(
    new Set(localModels.map(m => `${m.hf_model_id}::${m.data_type}`))
  );

  function formatSize(bytes: number): string {
    if (!bytes || bytes < 1_000_000) return '';
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    return `${(bytes / 1_048_576).toFixed(0)} MB`;
  }

  async function fetchRepoInfo(repoId: string): Promise<ResolvedRepo | null> {
    try {
      const res = await fetch(`${HF_API}/models/${repoId}/tree/main?recursive=true`);
      if (!res.ok) return null;
      const tree: any[] = await res.json();
      const paths = new Set(tree.map((f: any) => f.path ?? ''));

      const missingFiles = REQUIRED.filter(r => !paths.has(r));
      const eligible = missingFiles.length === 0;

      // Find .onnx files — any directory, not sidecar data files
      const onnxFiles = tree.filter((f: any) => {
        const p: string = (f.path ?? '').toLowerCase();
        return p.endsWith('.onnx') && !p.includes('.onnx_data') && !p.endsWith('.onnx.data');
      });

      // Group by dtype — one chip per unique dtype
      const dtypeMap = new Map<string, DtypeChip>();
      for (const f of onnxFiles) {
        const dtype = inferDataType(f.path);
        if (!dtypeMap.has(dtype) || (f.lfs?.size ?? f.size ?? 0) > dtypeMap.get(dtype)!.sizeBytes) {
          dtypeMap.set(dtype, {
            dtype,
            onnxPath: f.path,
            sizeBytes: f.lfs?.size ?? f.size ?? 0,
          });
        }
      }

      // Sort by DTYPE_ORDER
      const dtypes = [...dtypeMap.values()].sort((a, b) => {
        const ai = DTYPE_ORDER.indexOf(a.dtype);
        const bi = DTYPE_ORDER.indexOf(b.dtype);
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        return a.dtype.localeCompare(b.dtype);
      });

      if (dtypes.length === 0) return null; // No ONNX files — skip

      // Repo meta (pipeline_tag + likes) from search result already; use a minimal fallback
      const repo: HFRepo = { id: repoId, likes: 0 };
      return { repo, dtypes, eligible, missingFiles };
    } catch {
      return null;
    }
  }

  async function scanRepos(repos: HFRepo[]) {
    scanning = true;
    totalToScan += repos.length;
    let idx = 0;

    async function worker() {
      while (idx < repos.length) {
        const repo = repos[idx++];
        scanningName = repo.id;
        const resolved = await fetchRepoInfo(repo.id);
        scannedCount += 1;
        if (resolved) {
          resolved.repo.pipeline_tag = repo.pipeline_tag;
          resolved.repo.likes = repo.likes;
          resolvedRepos = [...resolvedRepos, resolved];
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
      // If query looks like a direct repo ID (org/repo), also try fetching it directly
      const isRepoId = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(q.trim());

      const url = `${HF_API}/models?search=${encodeURIComponent(q)}&filter=text-generation&limit=${PAGE_SIZE}&skip=0`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HF API error: ${res.status}`);
      const data: HFRepo[] = await res.json();

      let repos = data.filter((r: any) => !r.private && !r.disabled);

      // If the exact repo ID isn't in results, prepend a synthetic entry so
      // typing org/repo always finds that repo even if the search doesn't surface it
      if (isRepoId) {
        const exactId = q.trim().toLowerCase();
        const alreadyIn = repos.some(r => r.id.toLowerCase() === exactId);
        if (!alreadyIn) {
          repos = [{ id: q.trim(), pipeline_tag: 'text-generation', likes: 0 }, ...repos];
        }
      }

      hasMore = data.length === PAGE_SIZE;
      skip = PAGE_SIZE;
      scanRepos(repos);
    } catch (e: any) {
      searchError = e.message ?? 'Failed to search HuggingFace';
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    loadingMore = true;
    try {
      const res = await fetch(`${HF_API}/models?search=${encodeURIComponent(query)}&filter=text-generation&limit=${PAGE_SIZE}&skip=${skip}`);
      if (!res.ok) throw new Error(`HF API error: ${res.status}`);
      const data: HFRepo[] = await res.json();
      const repos = data.filter((r: any) => !r.private && !r.disabled);
      hasMore = data.length === PAGE_SIZE;
      skip += PAGE_SIZE;
      scanRepos(repos);
    } catch (e: any) {
      searchError = e.message ?? 'Failed to load more';
    } finally {
      loadingMore = false;
    }
  }

  let searchTimeout: ReturnType<typeof setTimeout>;
  $effect(() => {
    const q = query;
    clearTimeout(searchTimeout);
    if (!q.trim()) return;
    searchTimeout = setTimeout(() => doSearch(q), 400);
    return () => clearTimeout(searchTimeout);
  });
</script>

<div class="llm-search">
  {#if !query.trim()}
    <div class="hf-status">Type a repo name or search query to find text-generation models.</div>
  {:else if loading}
    <div class="hf-status"><span class="spinner"></span> Searching…</div>
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
              <span class="scan-name" in:fly={{ y: 8, duration: 140 }} out:fly={{ y: -8, duration: 140 }}>{scanningName}</span>
            {/key}
          </div>
          <span class="scan-progress">{scannedCount}/{totalToScan}</span>
        {:else if resolvedRepos.length === 0}
          <span class="scan-empty">No text-generation repos with ONNX files found.</span>
        {:else}
          <span class="scan-done">{resolvedRepos.length} repo{resolvedRepos.length !== 1 ? 's' : ''} found</span>
        {/if}
        {#if !scanning}
          <div class="scan-row-actions">
            {#if loadingMore}
              <span class="spinner spinner-sm"></span>
            {:else if hasMore}
              <button class="btn-load-more" onclick={loadMore}>Load more</button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    {#if resolvedRepos.length > 0}
      <div class="repo-list">
        {#each resolvedRepos as { repo, dtypes, eligible, missingFiles } (repo.id)}
          <div class="repo-card" class:ineligible={!eligible}>
            <div class="repo-header">
              <div class="repo-header-left">
                {#if repo.pipeline_tag}
                  <span class="tag tag-task" title={repo.pipeline_tag}>{repo.pipeline_tag}</span>
                {/if}
                <a class="repo-name" href="https://huggingface.co/{repo.id}" target="_blank" rel="noopener noreferrer">{repo.id}</a>
                {#if !eligible}
                  <span class="warn-badge" title="Missing: {missingFiles.join(', ')}">⚠ missing files</span>
                {/if}
              </div>
              {#if repo.likes > 0}
                <span class="repo-likes">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                  {repo.likes}
                </span>
              {/if}
            </div>

            <div class="dtype-row">
              {#if !eligible}
                <span class="ineligible-hint">Missing: {missingFiles.join(', ')} — tokenizer/config required for Transformers.js</span>
              {:else}
                {#each dtypes as chip (chip.dtype)}
                  {@const inLocal = localSet.has(`${repo.id}::${chip.dtype}`)}
                  <div class="chip-wrap">
                    <button
                      class="chip-dtype"
                      class:chip-added={inLocal}
                      data-dtype={chip.dtype}
                      title="{chip.onnxPath}{formatSize(chip.sizeBytes) ? ' · ' + formatSize(chip.sizeBytes) : ''}"
                      onclick={() => onadd?.(repo.id, chip.dtype, chip.sizeBytes || undefined)}
                    >{chip.dtype}</button>
                    {#if formatSize(chip.sizeBytes)}
                      <span class="chip-size">{formatSize(chip.sizeBytes)}</span>
                    {/if}
                  </div>
                {/each}
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .llm-search { margin-top: var(--space-1); }

  .hf-status {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    padding: var(--space-2) 0;
  }

  .hf-error { font-size: var(--text-sm); color: var(--color-error); padding: var(--space-2) 0; }

  .scan-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    min-height: 28px;
    overflow: hidden;
    margin-bottom: var(--space-1);
  }

  .scan-label { font-weight: 600; color: var(--color-text-secondary); flex-shrink: 0; }

  .scan-ticker { flex: 1; position: relative; height: 18px; overflow: hidden; min-width: 0; }

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

  .scan-progress { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted); flex-shrink: 0; }
  .scan-done { font-size: var(--text-xs); color: var(--color-text-secondary); flex: 1; }
  .scan-empty { font-size: var(--text-xs); color: var(--color-text-muted); font-style: italic; flex: 1; }
  .scan-row-actions { display: flex; align-items: center; flex-shrink: 0; }

  .btn-load-more {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 3px 10px;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background var(--transition-base), border-color var(--transition-base), color var(--transition-base);
  }

  .btn-load-more:hover { border-color: var(--color-primary); color: var(--color-primary); background: var(--color-accent-light); }

  .repo-list { display: flex; flex-direction: column; gap: 4px; }

  .repo-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface-raised);
    overflow: hidden;
  }

  .repo-card.ineligible { opacity: 0.7; }

  .repo-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-1);
    padding: 4px 10px;
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

  .repo-likes {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .warn-badge {
    font-size: 10px;
    color: var(--color-warning, #d97706);
    background: color-mix(in srgb, var(--color-warning, #d97706) 10%, transparent);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    white-space: nowrap;
    cursor: help;
  }

  .tag-task {
    background: var(--color-surface-sunken);
    flex-shrink: 0;
  }

  .dtype-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
  }

  .ineligible-hint {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-style: italic;
  }

  .chip-wrap { display: inline-flex; align-items: center; gap: 4px; }

  .chip-dtype {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    padding: 1px 8px;
    line-height: 1.4;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: none;
    cursor: pointer;
    transition: opacity 0.12s, transform 0.12s, background 0.12s;
    user-select: none;
    white-space: nowrap;
  }

  .chip-dtype:hover { opacity: 0.8; transform: translateY(-1px); }

  .chip-dtype.chip-added {
    color: var(--color-text-on-primary) !important;
  }

  .chip-size {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-text-muted);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    padding: 0 5px;
    white-space: nowrap;
  }

  /* dtype chip colors — matching the rest of the app */
  .chip-dtype[data-dtype="fp32"]      { color: var(--color-dt-fp32); border-color: var(--color-dt-fp32); }
  .chip-dtype[data-dtype="fp16"]      { color: var(--color-dt-fp16); border-color: var(--color-dt-fp16); }
  .chip-dtype[data-dtype="bf16"]      { color: var(--color-dt-bf16); border-color: var(--color-dt-bf16); }
  .chip-dtype[data-dtype="fp8"]       { color: var(--color-dt-fp8); border-color: var(--color-dt-fp8); }
  .chip-dtype[data-dtype="int8"]      { color: var(--color-dt-int8); border-color: var(--color-dt-int8); }
  .chip-dtype[data-dtype="uint8"]     { color: var(--color-dt-uint8); border-color: var(--color-dt-uint8); }
  .chip-dtype[data-dtype="int4"]      { color: var(--color-dt-int4); border-color: var(--color-dt-int4); }
  .chip-dtype[data-dtype="uint4"]     { color: var(--color-dt-uint4); border-color: var(--color-dt-uint4); }
  .chip-dtype[data-dtype="q4"]        { color: var(--color-dt-q4); border-color: var(--color-dt-q4); }
  .chip-dtype[data-dtype="q4f16"]     { color: var(--color-dt-q4f16); border-color: var(--color-dt-q4f16); }
  .chip-dtype[data-dtype="bnb4"]      { color: var(--color-dt-bnb4); border-color: var(--color-dt-bnb4); }
  .chip-dtype[data-dtype="quantized"] { color: var(--color-dt-quantized); border-color: var(--color-dt-quantized); }

  .chip-dtype.chip-added[data-dtype="fp32"]      { background: var(--color-dt-fp32); }
  .chip-dtype.chip-added[data-dtype="fp16"]      { background: var(--color-dt-fp16); }
  .chip-dtype.chip-added[data-dtype="bf16"]      { background: var(--color-dt-bf16); }
  .chip-dtype.chip-added[data-dtype="fp8"]       { background: var(--color-dt-fp8); }
  .chip-dtype.chip-added[data-dtype="int8"]      { background: var(--color-dt-int8); }
  .chip-dtype.chip-added[data-dtype="uint8"]     { background: var(--color-dt-uint8); }
  .chip-dtype.chip-added[data-dtype="int4"]      { background: var(--color-dt-int4); }
  .chip-dtype.chip-added[data-dtype="uint4"]     { background: var(--color-dt-uint4); }
  .chip-dtype.chip-added[data-dtype="q4"]        { background: var(--color-dt-q4); }
  .chip-dtype.chip-added[data-dtype="q4f16"]     { background: var(--color-dt-q4f16); }
  .chip-dtype.chip-added[data-dtype="bnb4"]      { background: var(--color-dt-bnb4); }
  .chip-dtype.chip-added[data-dtype="quantized"] { background: var(--color-dt-quantized); }
</style>
