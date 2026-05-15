<script lang="ts">
  import ModelCard from './ModelCard.svelte';

  interface Model {
    id: string;
    hf_model_id: string;
    file_path: string;
    data_type: string;
    size_bytes: number;
    runtime: 'onnx' | 'litert';
    source_org: string;
    category: string;
  }

  interface Props {
    models: Model[];
    selectedIds?: Set<string>;
    ontoggle?: (id: string) => void;
  }

  let { models, selectedIds = new Set(), ontoggle }: Props = $props();

  const PAGE_SIZE = 200;
  let currentPage = $state(1);

  const totalPages = $derived(Math.ceil(models.length / PAGE_SIZE));
  const pagedModels = $derived(
    models.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  );

  // Reset to page 1 when models list changes (filters applied)
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

{#if models.length === 0}
  <div class="empty">
    <p>No models found matching your filters.</p>
    <p class="empty-hint">Try clearing your filters, or <a href="/custom">upload your own model</a> to benchmark.</p>
  </div>
{:else}
  <div class="grid">
    {#each pagedModels as model (model.id)}
      <ModelCard
        hfModelId={model.hf_model_id}
        filePath={model.file_path}
        dataType={model.data_type}
        sizeBytes={model.size_bytes}
        runtime={model.runtime}
        sourceOrg={model.source_org}
        category={model.category}
        selected={selectedIds.has(model.id)}
        ontoggle={ontoggle ? () => ontoggle(model.id) : undefined}
      />
    {/each}
  </div>

  <div class="footer">
    <p class="count">
      {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, models.length)} of {models.length} model{models.length === 1 ? '' : 's'}
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
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-2);
  }

  .empty {
    text-align: center;
    padding: var(--space-5) var(--space-2);
    color: var(--color-text-muted);
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
