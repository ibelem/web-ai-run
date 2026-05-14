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
</script>

{#if models.length === 0}
  <div class="empty">
    <p>No models found matching your filters.</p>
    <p class="empty-hint">Try clearing your filters, or <a href="/custom">upload your own model</a> to benchmark.</p>
  </div>
{:else}
  <div class="grid">
    {#each models as model (model.id)}
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
  <p class="count">{models.length} model{models.length === 1 ? '' : 's'}</p>
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

  .count {
    margin-top: var(--space-2);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-align: right;
  }
</style>
