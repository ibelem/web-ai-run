<script lang="ts">
  import type { SelectedHFModel } from './HFSearch.svelte';
  import { inferFormat, inferDataType, inferRuntime, stripExt } from '$lib/huggingface/parser';
  import FormatIcon from './FormatIcon.svelte';
  import NetronLink from './NetronLink.svelte';

  interface Props {
    url: string;
    localModels?: { hf_model_id: string; file_path: string }[];
    selectedHFModels?: SelectedHFModel[];
  }

  let { url, localModels = [], selectedHFModels = $bindable([]) }: Props = $props();

  interface ParsedUrl {
    type: 'file' | 'repo' | 'org';
    org: string;
    repo?: string;   // org/repo
    filePath?: string;
  }

  interface ImportedFile {
    path: string;
    size: number;
    format: string;
    dataType: string;
    runtime: 'onnx' | 'litert';
  }

  interface GroupedImportedFile {
    key: string;
    strippedPath: string;
    format: string;
    runtime: 'onnx' | 'litert';
    files: ImportedFile[];
  }

  function groupFiles(files: ImportedFile[]): GroupedImportedFile[] {
    const map = new Map<string, GroupedImportedFile>();
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

  interface ImportedRepo {
    id: string;          // org/repo
    task: string;
    likes: number;
    files: ImportedFile[];
  }

  const HF_API = 'https://huggingface.co/api';

  let repos = $state<ImportedRepo[]>([]);
  let loading = $state(false);
  let error = $state('');

  const localSet = $derived(
    new Set(localModels.map((m) => `${m.hf_model_id}::${m.file_path}`))
  );

  // --- Parsers ---

  function parseHFUrl(raw: string): ParsedUrl | null {
    let u: URL;
    try { u = new URL(raw.trim()); } catch { return null; }
    if (u.hostname !== 'huggingface.co') return null;

    // Remove leading slash, split
    const parts = u.pathname.replace(/^\//, '').split('/');
    if (parts.length < 1 || !parts[0]) return null;

    const org = parts[0];

    // org only: /org or /org/
    if (parts.length <= 1 || (parts.length === 2 && parts[1] === '')) {
      return { type: 'org', org };
    }

    const repoName = parts[1];
    const repoId = `${org}/${repoName}`;

    // repo only: /org/repo or /org/repo/
    if (parts.length <= 2 || (parts.length === 3 && parts[2] === '')) {
      return { type: 'repo', org, repo: repoId };
    }

    // file: /org/repo/blob/main/path/to/file.onnx
    //    or /org/repo/resolve/main/path/to/file.onnx
    if ((parts[2] === 'blob' || parts[2] === 'resolve') && parts.length >= 5) {
      // parts[3] = branch (main), parts[4..] = file path
      const filePath = parts.slice(4).join('/');
      if (filePath) return { type: 'file', org, repo: repoId, filePath };
    }

    // Fallback: treat as repo
    return { type: 'repo', org, repo: repoId };
  }

  // --- Helpers ---

  function isSupported(path: string): boolean {
    return inferRuntime(path) !== null;
  }

  function formatSize(bytes: number): string {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  // --- Fetchers ---

  async function fetchRepoMeta(repoId: string): Promise<{ task: string; likes: number }> {
    try {
      const res = await fetch(`${HF_API}/models/${repoId}`);
      if (!res.ok) return { task: '', likes: 0 };
      const data = await res.json();
      return { task: data.pipeline_tag ?? '', likes: data.likes ?? 0 };
    } catch {
      return { task: '', likes: 0 };
    }
  }

  async function fetchRepoTree(repoId: string): Promise<ImportedFile[]> {
    const res = await fetch(`${HF_API}/models/${repoId}/tree/main?recursive=true`);
    if (!res.ok) return [];
    const tree: any[] = await res.json();
    return tree
      .filter((item) => item.type === 'file' && isSupported(item.path ?? ''))
      .map((item) => {
        const path = item.path ?? '';
        return {
          path,
          size: item.lfs?.size ?? item.size ?? 0,
          format: inferFormat(path),
          dataType: inferDataType(path),
          runtime: inferRuntime(path) as 'onnx' | 'litert',
        };
      });
  }

  async function fetchOrgRepos(org: string): Promise<string[]> {
    const res = await fetch(`${HF_API}/models?author=${encodeURIComponent(org)}&limit=1000`);
    if (!res.ok) return [];
    const data: any[] = await res.json();
    return data.filter((r) => !r.private && !r.disabled).map((r) => r.id);
  }

  // --- Import logic ---

  async function runImport(parsed: ParsedUrl) {
    loading = true;
    error = '';
    repos = [];

    try {
      if (parsed.type === 'file' && parsed.repo && parsed.filePath) {
        const path = parsed.filePath;
        if (!isSupported(path)) {
          error = `Unsupported file format. Only .onnx, .tflite, and .litertlm are supported.`;
          return;
        }
        // Fetch tree to get accurate size
        const [meta, tree] = await Promise.all([
          fetchRepoMeta(parsed.repo),
          fetchRepoTree(parsed.repo),
        ]);
        // Find the exact file in the tree for size, fall back to 0
        const treeFile = tree.find((f) => f.path === path);
        const file: ImportedFile = treeFile ?? {
          path,
          size: 0,
          format: inferFormat(path),
          dataType: inferDataType(path),
          runtime: inferRuntime(path) as 'onnx' | 'litert',
        };
        repos = [{ id: parsed.repo, task: meta.task, likes: meta.likes, files: [file] }];

      } else if (parsed.type === 'repo' && parsed.repo) {
        const [meta, files] = await Promise.all([
          fetchRepoMeta(parsed.repo),
          fetchRepoTree(parsed.repo),
        ]);
        repos = [{ id: parsed.repo, task: meta.task, likes: meta.likes, files }];

      } else if (parsed.type === 'org') {
        const repoIds = await fetchOrgRepos(parsed.org);
        if (repoIds.length === 0) {
          error = `No public repos found for org "${parsed.org}".`;
          return;
        }
        // Fetch meta + trees concurrently (cap at 10)
        const CONCURRENCY = 10;
        const results: ImportedRepo[] = [];
        let idx = 0;
        async function worker() {
          while (idx < repoIds.length) {
            const i = idx++;
            const repoId = repoIds[i];
            const [meta, files] = await Promise.all([
              fetchRepoMeta(repoId),
              fetchRepoTree(repoId),
            ]);
            if (files.length > 0) {
              results[i] = { id: repoId, task: meta.task, likes: meta.likes, files };
            }
          }
        }
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
        repos = results.filter(Boolean);
        if (repos.length === 0) {
          error = `No repos with supported files found for org "${parsed.org}".`;
        }
      }
    } catch (e: any) {
      error = e.message ?? 'Failed to import from HuggingFace';
    } finally {
      loading = false;
    }
  }

  // Run import whenever url changes and parses successfully
  $effect(() => {
    const parsed = parseHFUrl(url);
    if (!parsed) return;
    runImport(parsed);
  });

  // --- Selection ---

  function isSelected(repoId: string, filePath: string): boolean {
    return selectedHFModels.some((m) => m.hf_model_id === repoId && m.file_path === filePath);
  }

  function toggleFile(repo: ImportedRepo, file: ImportedFile) {
    if (isSelected(repo.id, file.path)) {
      selectedHFModels = selectedHFModels.filter(
        (m) => !(m.hf_model_id === repo.id && m.file_path === file.path)
      );
    } else {
      selectedHFModels = [...selectedHFModels, {
        hf_model_id: repo.id,
        file_path: file.path,
        data_type: file.dataType,
        runtime: file.runtime,
        task: repo.task,
        size_bytes: file.size,
      }];
    }
  }

  function formatCounts(files: ImportedFile[]): { format: string; count: number }[] {
    const counts: Record<string, number> = {};
    for (const f of files) if (f.format) counts[f.format] = (counts[f.format] ?? 0) + 1;
    return Object.entries(counts).map(([format, count]) => ({ format, count }));
  }

  const parsed = $derived(parseHFUrl(url));
</script>

{#if parsed}
  <div class="hf-import">
    <div class="hf-import-header">
      <span class="hf-label">HuggingFace URL</span>
      {#if parsed.type === 'file'}
        <span class="import-desc">Single file from <strong>{parsed.repo}</strong></span>
      {:else if parsed.type === 'repo'}
        <span class="import-desc">Repo <strong>{parsed.repo}</strong></span>
      {:else}
        <span class="import-desc">Org <strong>{parsed.org}</strong></span>
      {/if}
    </div>

    {#if loading}
      <div class="import-status">
        <span class="spinner"></span>
        Fetching from HuggingFace...
      </div>
    {:else if error}
      <div class="import-error">{error}</div>
    {:else if repos.length === 0}
      <div class="import-status">No supported files found.</div>
    {:else}
      <div class="repo-list">
        {#each repos as repo (repo.id)}
          {@const counts = formatCounts(repo.files)}
          <div class="repo-group">
            <div class="repo-header">
              <div class="repo-header-left">
                {#if repo.task && repo.task !== 'uncategorized'}
                  <span class="tag tag-task">{repo.task}</span>
                {/if}
                <a class="repo-name" href="https://huggingface.co/{repo.id}" target="_blank" rel="noopener noreferrer">{repo.id}</a>
                {#if repo.files.length === 0}
                  <span class="no-formats-label">No supported formats (onnx / tflite / litertlm)</span>
                {:else}
                  {#each counts as c (c.format)}
                    <span class="fmt-count-wrap">
                      <FormatIcon format={c.format} size={14} />
                      <span class="fmt-count-num">×{c.count}</span>
                    </span>
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

            {#if repo.files.length > 0}
            {@const grouped = groupFiles(repo.files)}
            <div class="file-grid">
              {#each grouped as group (group.key)}
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
                      <FormatIcon format={group.format} size={14} hfModelId={repo.id} filePath="{group.strippedPath}.{group.format}" />
                      <NetronLink hfModelId={repo.id} filePath="{group.strippedPath}.{group.format}" />
                      <span class="info-file" title="{group.strippedPath}.{group.format}">{group.strippedPath}.{group.format}</span>
                    </div>
                  </div>
                  <div class="card-chips">
                    {#each group.files as file (file.path)}
                      <div class="chip-row">
                        <button
                          class="chip-dtype"
                          class:chip-selected={isSelected(repo.id, file.path)}
                          data-dtype={file.dataType}
                          onclick={() => toggleFile(repo, file)}
                        >{dtypeLabel(file.dataType)}</button>
                        {#if file.size}
                          <span class="chip-size">{formatSize(file.size)}</span>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .hf-import {
    margin-bottom: var(--space-3);
  }

  .hf-import-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-1);
    flex-wrap: wrap;
    margin-bottom: var(--space-2);
    margin-top: var(--space-2);
  }

  .hf-label {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-primary);
    background:var(--color-accent-light);
    padding: 1px 7px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  .import-desc {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .import-status {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    padding: var(--space-1) 0;
  }

  .import-error {
    font-size: var(--text-sm);
    color: var(--color-error);
    padding: var(--space-1) 0;
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

  @media (max-width: 700px) {
    .file-grid {
      grid-template-columns: 1fr;
    }

    .file-card:nth-child(odd) {
      border-right: none;
    }
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
    border-right: 0px solid var(--color-border);
  }

  .file-card.has-selection {
    background:var(--color-accent-light);
  }

  .file-card.in-library {
    background: color-mix(in srgb, var(--color-backend-wasm-1) 1%, var(--color-surface-raised));
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
    min-width: 0;
    overflow: hidden;
  }

  .card-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    justify-content: flex-end;
    align-content: flex-start;
    width: clamp(60px, 20%, 120px);
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




  .chip-dtype,
  .chip-size {
    width: 52px;
    text-align: center;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    padding: 0 4px;
    line-height: 1.4;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chip-dtype {
    cursor: pointer;
    transition: opacity 0.12s, transform 0.12s;
    user-select: none;
  }

  .chip-dtype:hover { opacity: 0.8; transform: translateY(-1px); }

  .chip-size {
    font-weight: 500;
    color: var(--color-text-muted);
    cursor: default;
  }

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

  .chip-dtype.chip-selected { color: var(--color-text-on-primary); }
  .chip-dtype.chip-selected[data-dtype="fp32"]      { background: var(--color-dt-fp32); border-color: var(--color-dt-fp32); }
  .chip-dtype.chip-selected[data-dtype="fp16"]      { background: var(--color-dt-fp16); border-color: var(--color-dt-fp16); }
  .chip-dtype.chip-selected[data-dtype="bf16"]      { background: var(--color-dt-bf16); border-color: var(--color-dt-bf16); }
  .chip-dtype.chip-selected[data-dtype="fp8"]       { background: var(--color-dt-fp8); border-color: var(--color-dt-fp8); }
  .chip-dtype.chip-selected[data-dtype="int8"]      { background: var(--color-dt-int8); border-color: var(--color-dt-int8); }
  .chip-dtype.chip-selected[data-dtype="uint8"]     { background: var(--color-dt-uint8); border-color: var(--color-dt-uint8); }
  .chip-dtype.chip-selected[data-dtype="int4"]      { background: var(--color-dt-int4); border-color: var(--color-dt-int4); }
  .chip-dtype.chip-selected[data-dtype="uint4"]     { background: var(--color-dt-uint4); border-color: var(--color-dt-uint4); }
  .chip-dtype.chip-selected[data-dtype="q4"]        { background: var(--color-dt-q4); border-color: var(--color-dt-q4); }
  .chip-dtype.chip-selected[data-dtype="q4f16"]     { background: var(--color-dt-q4f16); border-color: var(--color-dt-q4f16); }
  .chip-dtype.chip-selected[data-dtype="bnb4"]      { background: var(--color-dt-bnb4); border-color: var(--color-dt-bnb4); }
  .chip-dtype.chip-selected[data-dtype="quantized"] { background: var(--color-dt-quantized); border-color: var(--color-dt-quantized); }

  .tag-inlib {
    flex-shrink: 0;
  }

  .tag-task { background: var(--color-surface-sunken); }

  .fmt-count-wrap {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .fmt-count-num {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

</style>
