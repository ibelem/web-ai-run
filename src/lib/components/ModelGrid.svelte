<script lang="ts">
  import ModelCard from './ModelCard.svelte';
  import { inferFormat, stripExt, sortByDtype } from '$lib/huggingface/parser';

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
    task: string;
    inLibrary: boolean;
    variants: { id: string; dataType: string; sizeBytes: number; filePath: string }[];
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

  function groupModels(flat: Model[], libIds: Set<string>): GroupedModel[] {
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
          task: m.task,
          inLibrary: false,
          variants: [],
        });
      }
      const group = map.get(key)!;
      group.variants.push({ id: m.id, dataType: m.data_type, sizeBytes: m.size_bytes, filePath: m.file_path });
      if (libIds.has(m.id)) group.inLibrary = true;
    }
    return [...map.values()].map(g => ({ ...g, variants: sortByDtype(g.variants) }));
  }

  const groups = $derived(groupModels(models, inLibraryIds));
  const totalPages = $derived(Math.ceil(groups.length / PAGE_SIZE));
  const pagedGroups = $derived(
    groups.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  );

  $effect(() => {
    groups;
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
    <p class="empty-hint">Try clearing your filters, or <a href="/inference/custom">upload your own model</a> to benchmark.</p>
  </div>
{:else}
  <div class="list-wrap">
    {#each pagedGroups as group (group.key)}
      <ModelCard
        hfModelId={group.hfModelId}
        filePath={group.filePath}
        format={group.format}
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
      {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, groups.length)} of {groups.length} model{groups.length === 1 ? '' : 's'}
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
    background:var(--color-accent-light);
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
