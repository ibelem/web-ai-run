# Grouped Model Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace one-card-per-variant with one-card-per-filename, showing dtype variants as clickable chips on the right side of each card — across ModelCard/ModelGrid, HFSearch, and HFUrlImport.

**Architecture:** ModelCard gets new grouped props and a chip-based layout. ModelGrid groups raw `Model[]` by `(hf_model_id, stripExt(file_path), format)` before rendering. HFSearch and HFUrlImport group their file lists within each repo group and render chip rows inline. The dtype filter in `model/+page.svelte` is unchanged — it pre-filters variants, so after grouping, only matching chips appear naturally.

**Tech Stack:** Svelte 5 (runes), TypeScript, CSS variables from `app.css`, `$lib/huggingface/parser` utilities.

---

## File Map

| File | Change |
|------|--------|
| `src/lib/components/ModelCard.svelte` | Full rewrite — new props + grouped layout |
| `src/lib/components/ModelGrid.svelte` | Add grouping derivation, update pagination footer |
| `src/lib/components/HFSearch.svelte` | Add `groupFiles()` helper, replace `file-card` per-file render with grouped chips |
| `src/lib/components/HFUrlImport.svelte` | Same as HFSearch |

No changes needed to `model/+page.svelte`, `HFSearch.SelectedHFModel`, or `ActionPanel`.

---

## Task 1: Rewrite ModelCard.svelte

**Files:**
- Modify: `src/lib/components/ModelCard.svelte`

The new card has a flex layout: left side (inert, repo/file info) + right side (interactive dtype chips). The card body itself has `pointer-events: none` except for the chips.

- [ ] **Step 1: Replace the entire file with the new implementation**

```svelte
<script lang="ts">
  interface Variant {
    id: string;
    dataType: string;
    sizeBytes: number;
  }

  interface Props {
    hfModelId: string;
    filePath: string;
    format: string;
    sourceOrg: string;
    task: string;
    inLibrary?: boolean;
    variants: Variant[];
    selectedIds?: Set<string>;
    ontoggle?: (id: string) => void;
  }

  let {
    hfModelId,
    filePath,
    format,
    sourceOrg,
    task,
    inLibrary = false,
    variants,
    selectedIds = new Set(),
    ontoggle,
  }: Props = $props();

  function formatSize(bytes: number): string {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  const hasSelection = $derived(variants.some((v) => selectedIds.has(v.id)));

  const sizeRange = $derived.by(() => {
    if (variants.length === 0) return '';
    const sizes = variants.map((v) => v.sizeBytes);
    const min = Math.min(...sizes);
    const max = Math.max(...sizes);
    return min === max ? formatSize(min) : `${formatSize(min)}–${formatSize(max)}`;
  });
</script>

<div class="model-card" class:has-selection={hasSelection}>
  <div class="card-left">
    <div class="card-row card-top">
      {#if task && task !== 'uncategorized'}
        <span class="tag tag-task" title={task}>{task}</span>
      {/if}
      {#if inLibrary}
        <span class="tag tag-inlib">In library</span>
      {/if}
      <span class="info-repo" title={hfModelId}>{hfModelId}</span>
    </div>
    <div class="card-row card-bottom">
      <span class="tag tag-format" data-format={format}>{format}</span>
      <span class="info-file" title={filePath}>{filePath}</span>
      {#if sizeRange}
        <span class="size-range">{sizeRange}</span>
      {/if}
    </div>
  </div>
  <div class="card-right">
    {#each variants as variant (variant.id)}
      <button
        class="chip"
        class:chip-selected={selectedIds.has(variant.id)}
        data-dtype={variant.dataType}
        title={formatSize(variant.sizeBytes)}
        onclick={() => ontoggle?.(variant.id)}
      >{variant.dataType}</button>
    {/each}
  </div>
</div>

<style>
  .model-card {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    min-width: 0;
    transition: border-color var(--transition-base), background var(--transition-base);
    pointer-events: none;
  }

  .model-card.has-selection {
    border-color: rgba(99, 102, 241, 0.5);
    background: color-mix(in srgb, #6366f1 4%, var(--color-surface-raised));
  }

  .card-left {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    overflow: hidden;
    min-width: 0;
  }

  .card-row {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .card-right {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    justify-content: flex-end;
    align-content: flex-start;
    max-width: 200px;
    flex-shrink: 0;
    pointer-events: auto;
  }

  .info-repo {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .info-file {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .size-range {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--color-text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .tag-task {
    background: var(--color-surface-sunken);
    flex-shrink: 0;
  }

  .tag-inlib {
    background: color-mix(in srgb, #10b981 12%, transparent);
    color: #10b981;
    border-color: color-mix(in srgb, #10b981 30%, transparent);
    flex-shrink: 0;
  }

  .tag-format { flex-shrink: 0; }
  .tag-format[data-format="onnx"]     { color: #3b82f6; border-color: #3b82f6; }
  .tag-format[data-format="tflite"]   { color: #10b981; border-color: #10b981; }
  .tag-format[data-format="litertlm"] { color: #f97316; border-color: #f97316; }

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

  .chip:hover {
    opacity: 0.8;
    transform: translateY(-1px);
  }

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

  .chip.chip-selected { color: #fff !important; }
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

  @media (max-width: 600px) {
    .card-right { max-width: 140px; }
  }
</style>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run check 2>&1 | head -40`

Expected: 0 new errors introduced by ModelCard (pre-existing errors are OK).

---

## Task 2: Update ModelGrid.svelte

**Files:**
- Modify: `src/lib/components/ModelGrid.svelte`

ModelGrid needs to: (1) group the flat `Model[]` into grouped cards by `(hf_model_id, stripExt(file_path), inferFormat(file_path))`, (2) paginate by group count, (3) pass grouped data to ModelCard with new props, (4) update footer to show "N models (M files)".

The dtype filter in `model/+page.svelte` already pre-filters rows before they reach ModelGrid. So if `int8` filter is active, only `int8` rows arrive here — after grouping, each card has only the `int8` chip. No additional filter logic needed in ModelGrid.

- [ ] **Step 3: Replace ModelGrid.svelte with the grouped version**

```svelte
<script lang="ts">
  import ModelCard from './ModelCard.svelte';
  import { inferFormat, stripExt } from '$lib/huggingface/parser';

  interface Model {
    id: string;
    hf_model_id: string;
    file_path: string;
    data_type: string;
    size_bytes: number;
    runtime: 'onnx' | 'litert';
    source_org: string;
    task: string;
  }

  interface GroupedModel {
    key: string;
    hfModelId: string;
    filePath: string;
    format: string;
    sourceOrg: string;
    task: string;
    inLibrary: boolean;
    variants: { id: string; dataType: string; sizeBytes: number }[];
  }

  interface Props {
    models: Model[];
    inLibraryIds?: Set<string>;
    selectedIds?: Set<string>;
    ontoggle?: (id: string) => void;
  }

  let { models, inLibraryIds = new Set(), selectedIds = new Set(), ontoggle }: Props = $props();

  const PAGE_SIZE = 200;
  let currentPage = $state(1);

  function groupModels(flat: Model[]): GroupedModel[] {
    const map = new Map<string, GroupedModel>();
    for (const m of flat) {
      const stripped = stripExt(m.file_path);
      const format = inferFormat(m.file_path);
      const key = `${m.hf_model_id}::${stripped}::${format}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          hfModelId: m.hf_model_id,
          filePath: stripped,
          format,
          sourceOrg: m.source_org,
          task: m.task,
          inLibrary: false,
          variants: [],
        });
      }
      const group = map.get(key)!;
      group.variants.push({ id: m.id, dataType: m.data_type, sizeBytes: m.size_bytes });
      if (inLibraryIds.has(m.id)) group.inLibrary = true;
    }
    return [...map.values()];
  }

  const groups = $derived(groupModels(models));
  const totalPages = $derived(Math.ceil(groups.length / PAGE_SIZE));
  const pagedGroups = $derived(
    groups.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  );

  $effect(() => {
    models;
    currentPage = 1;
  });

  function goTo(page: number) {
    if (page >= 1 && page <= totalPages) {
      currentPage = page;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
</script>

{#if groups.length === 0}
  <div class="empty">
    <p>No models found matching your filters.</p>
    <p class="empty-hint">Try clearing your filters, or <a href="/custom">upload your own model</a> to benchmark.</p>
  </div>
{:else}
  <div class="list-wrap">
    {#each pagedGroups as group (group.key)}
      <ModelCard
        hfModelId={group.hfModelId}
        filePath={group.filePath}
        format={group.format}
        sourceOrg={group.sourceOrg}
        task={group.task}
        inLibrary={group.inLibrary}
        variants={group.variants}
        {selectedIds}
        {ontoggle}
      />
    {/each}
  </div>

  <div class="footer">
    <p class="count">
      {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, groups.length)} of {groups.length} model{groups.length === 1 ? '' : 's'}
      {#if models.length !== groups.length}
        <span class="file-count">({models.length} files)</span>
      {/if}
    </p>

    {#if totalPages > 1}
      <nav class="pagination">
        <button class="page-btn" disabled={currentPage === 1} onclick={() => goTo(1)}>«</button>
        <button class="page-btn" disabled={currentPage === 1} onclick={() => goTo(currentPage - 1)}>Previous</button>
        <span class="page-info">Page {currentPage} of {totalPages}</span>
        <button class="page-btn" disabled={currentPage === totalPages} onclick={() => goTo(currentPage + 1)}>Next</button>
        <button class="page-btn" disabled={currentPage === totalPages} onclick={() => goTo(totalPages)}>»</button>
      </nav>
    {/if}
  </div>
{/if}

<style>
  .list-wrap {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-1);
  }

  @media (max-width: 700px) {
    .list-wrap {
      grid-template-columns: 1fr;
    }
  }

  .empty-hint {
    margin-top: var(--space-1);
    font-size: var(--text-sm);
  }

  .empty-hint a {
    color: var(--color-primary);
    text-decoration: none;
  }

  .empty-hint a:hover {
    text-decoration: underline;
  }

  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: var(--space-2);
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .count {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .file-count {
    color: var(--color-text-muted);
    opacity: 0.7;
  }

  .pagination {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .page-btn {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: 6px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-primary);
    cursor: pointer;
    transition: border-color var(--transition-base), background var(--transition-base);
  }

  .page-btn:hover:not(:disabled) {
    border-color: var(--color-primary);
    background: var(--color-accent-light);
  }

  .page-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-info {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    padding: 0 var(--space-half);
  }
</style>
```

- [ ] **Step 4: Check ModelGrid's callers don't pass `inLibraryIds`**

The current `model/+page.svelte` passes `models`, `selectedIds`, and `ontoggle` to ModelGrid. The new `inLibraryIds` prop is optional and defaults to `new Set()`, so no changes are needed in callers. Verify:

Run: `grep -n "ModelGrid" src/routes/model/+page.svelte`

Expected output shows `<ModelGrid {filteredModels}` or similar. No `inLibraryIds` needed — the DB list doesn't show "In library" badges (that's for HFSearch/HFUrlImport which have their own rendering).

Actually, `inLibrary` in ModelCard is for the DB model page showing which models are already in the benchmark library. For now, leave `inLibraryIds` as optional/unused — the feature is wired but not populated, which is fine.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npm run check 2>&1 | head -40`

Expected: 0 new errors.

---

## Task 3: Update HFSearch.svelte — grouped file cards

**Files:**
- Modify: `src/lib/components/HFSearch.svelte`

Within each repo group, group files by `stripExt(file.path) + '::' + file.format`. Replace the per-file `<div class="file-card">` block with a per-group card that has chips on the right. The existing `toggleFile` and `isSelected` functions are unchanged.

- [ ] **Step 6: Add `GroupedHFFile` interface and `groupFiles` helper after the existing interfaces in the `<script>` block**

Find this existing block in HFSearch.svelte:
```ts
  interface HFFile {
    path: string;
    size: number;
    format: string;
    dataType: string;
    runtime: 'onnx' | 'litert';
  }
```

Replace it with:
```ts
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

  function groupSizeRange(files: HFFile[]): string {
    if (files.length === 0) return '';
    const sizes = files.map((f) => f.size);
    const min = Math.min(...sizes);
    const max = Math.max(...sizes);
    return min === max ? formatSize(min) : `${formatSize(min)}–${formatSize(max)}`;
  }
```

- [ ] **Step 7: Replace the file-grid render block in HFSearch.svelte**

Find this block (around line 271):
```svelte
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
```

Replace with:
```svelte
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
                      <span class="size-range">{groupSizeRange(group.files)}</span>
                    </div>
                  </div>
                  <div class="card-chips">
                    {#each group.files as file (file.path)}
                      {@const selected = isSelected(repo.id, file.path)}
                      <button
                        class="chip"
                        class:chip-selected={selected}
                        data-dtype={file.dataType}
                        title={formatSize(file.size)}
                        onclick={() => toggleFile(repo.id, file, task)}
                      >{file.dataType}</button>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
```

- [ ] **Step 8: Replace the CSS for `.file-card` in HFSearch.svelte**

Find the `.file-card` style block and all related column styles (`col-check`, `col-info`, `col-format`, `col-dtype`, `col-lib`, `col-size`, `.check`, `.info-task`, `.info-file`, `.tag-inlib`, `.tag-size`, `.tag-dtype`).

Replace the entire `.file-card` layout section (keep `.file-grid`, repo styles, spinner, load-more) with:

```css
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
    font-size: 10px;
    color: var(--color-text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .tag-inlib {
    background: color-mix(in srgb, #10b981 12%, transparent);
    color: #10b981;
    border-color: color-mix(in srgb, #10b981 30%, transparent);
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

  .chip.chip-selected { color: #fff !important; }
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
    .file-grid { grid-template-columns: 1fr; }
    .file-card:nth-child(odd) { border-right: none; }
  }
```

Also remove the existing responsive `@media (max-width: 500px)` block that hid `col-lib` and `col-size` since those columns no longer exist.

- [ ] **Step 9: Verify TypeScript compiles**

Run: `npm run check 2>&1 | head -40`

Expected: 0 new errors.

---

## Task 4: Update HFUrlImport.svelte — grouped file cards

**Files:**
- Modify: `src/lib/components/HFUrlImport.svelte`

Same change pattern as HFSearch. `ImportedFile` is structurally identical to `HFFile`.

- [ ] **Step 10: Add `GroupedImportedFile` interface and helpers in HFUrlImport.svelte's `<script>` block**

After the `ImportedFile` interface, add:

```ts
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

  function groupSizeRange(files: ImportedFile[]): string {
    if (files.length === 0) return '';
    const sizes = files.map((f) => f.size);
    const min = Math.min(...sizes);
    const max = Math.max(...sizes);
    return min === max ? formatSize(min) : `${formatSize(min)}–${formatSize(max)}`;
  }
```

- [ ] **Step 11: Replace the file-grid render block in HFUrlImport.svelte**

Find this block (around line 299):
```svelte
            {#if repo.files.length > 0}
            <div class="file-grid">
              {#each repo.files as file (file.path)}
                {@const inLibrary = localSet.has(`${repo.id}::${file.path}`)}
                {@const selected = isSelected(repo.id, file.path)}
                <div
                  class="file-card"
                  class:in-library={inLibrary}
                  class:selected
                  onclick={() => toggleFile(repo, file)}
                  role="checkbox"
                  aria-checked={selected}
                  tabindex="0"
                  onkeydown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleFile(repo, file); } }}
                >
                  <div class="col col-check">
                    <input type="checkbox" checked={selected} class="check" tabindex="-1" onclick={(e) => { e.stopPropagation(); toggleFile(repo, file); }} />
                  </div>
                  <div class="col col-info" title="{repo.id} — {file.path}">
                    {#if repo.task && repo.task !== 'uncategorized'}
                      <span class="info-task">{repo.task}</span>
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
```

Replace with:
```svelte
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
                      {#if repo.task && repo.task !== 'uncategorized'}
                        <span class="info-task">{repo.task}</span>
                      {/if}
                      {#if inLibrary}
                        <span class="tag tag-inlib">In library</span>
                      {/if}
                      <span class="info-file" title={group.strippedPath}>{group.strippedPath}</span>
                    </div>
                    <div class="card-bottom">
                      <span class="tag tag-format" data-format={group.format}>{group.format}</span>
                      <span class="size-range">{groupSizeRange(group.files)}</span>
                    </div>
                  </div>
                  <div class="card-chips">
                    {#each group.files as file (file.path)}
                      {@param selected = isSelected(repo.id, file.path)}
                      <button
                        class="chip"
                        class:chip-selected={isSelected(repo.id, file.path)}
                        data-dtype={file.dataType}
                        title={formatSize(file.size)}
                        onclick={() => toggleFile(repo, file)}
                      >{file.dataType}</button>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
            {/if}
```

Note: Remove `{@param selected = ...}` — that's a mistake above. The chip uses `isSelected(repo.id, file.path)` directly. The corrected inner loop is:

```svelte
                  <div class="card-chips">
                    {#each group.files as file (file.path)}
                      <button
                        class="chip"
                        class:chip-selected={isSelected(repo.id, file.path)}
                        data-dtype={file.dataType}
                        title={formatSize(file.size)}
                        onclick={() => toggleFile(repo, file)}
                      >{file.dataType}</button>
                    {/each}
                  </div>
```

- [ ] **Step 12: Replace the CSS for `.file-card` in HFUrlImport.svelte**

Same replacement as Step 8 (HFSearch). Find and replace all the old column-based `.file-card` layout CSS with the new flex-based layout. Copy the complete CSS block from Step 8 verbatim.

Remove the `@media (max-width: 500px)` block that references `col-lib` and `col-size`.

- [ ] **Step 13: Final TypeScript check**

Run: `npm run check 2>&1 | head -60`

Expected: 0 new errors beyond any pre-existing ones.

---

## Tag and class reference (shared across all files)

These CSS class names and `data-*` attributes are referenced in multiple tasks above:

| Class/attribute | Where defined | Purpose |
|----------------|---------------|---------|
| `.tag` | `app.css` | Base pill tag style (font, padding, border-radius) |
| `.tag-task` | per-component | Task label badge |
| `.tag-format` | per-component | Format badge (onnx/tflite/litertlm) |
| `.tag-inlib` | per-component | "In library" badge |
| `data-dtype` | chip button | Drives CSS color via attribute selector |
| `data-format` | format span | Drives CSS color via attribute selector |
| `.chip` | per-component | Dtype chip base style |
| `.chip-selected` | per-component | Filled chip state |
| `.has-selection` | card container | Soft highlight when any chip selected |
| `.card-left` | per-component | Left inert info area |
| `.card-chips` | per-component | Right chip wrap area |

---

## Verification Checklist

After all tasks complete, manually verify in the browser:

- [ ] Model browser page: multiple dtype variants for same model grouped into one card with chips
- [ ] Selecting fp16 chip increments the "Run X Selected" counter by 1; selecting int8 on same card increments to 2
- [ ] Deselecting a chip decrements the counter
- [ ] Dtype filter (left sidebar): activating `int8` filter shows only int8 chip on each card; cards with no int8 variant disappear
- [ ] Format filter, org filter, size filter: all still work (pre-grouping filters unchanged)
- [ ] Footer shows "N models (M files)" when models > groups
- [ ] HFSearch: searching a model with multiple dtypes shows one grouped card with chips per file stem
- [ ] HFUrlImport: pasting a repo URL with multiple dtypes shows grouped chips
- [ ] "In library" badge appears on HFSearch/HFUrlImport cards when files exist in DB
- [ ] Single-variant card: shows just one chip, no visual regression
