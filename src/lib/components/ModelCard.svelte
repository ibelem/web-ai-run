<script lang="ts">
  interface Props {
    hfModelId: string;
    filePath: string;
    dataType: string;
    sizeBytes: number;
    runtime: 'onnx' | 'litert';
    sourceOrg: string;
    category: string;
  }

  let { hfModelId, filePath, dataType, sizeBytes, runtime, sourceOrg, category }: Props = $props();

  function formatSize(bytes: number): string {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  const modelName = $derived(hfModelId.split('/').pop() ?? hfModelId);
  const fileName = $derived(filePath.split('/').pop() ?? filePath);
</script>

<div class="card">
  <div class="card-header">
    <span class="model-name" title={hfModelId}>{modelName}</span>
    <span class="org-badge">{sourceOrg}</span>
  </div>

  <div class="card-meta">
    <span class="file-name" title={filePath}>{fileName}</span>
  </div>

  <div class="card-badges">
    <span class="badge badge-runtime" data-runtime={runtime}>{runtime}</span>
    <span class="badge badge-dtype" data-dtype={dataType}>{dataType}</span>
    <span class="badge badge-size">{formatSize(sizeBytes)}</span>
    {#if category !== 'uncategorized'}
      <span class="badge badge-category">{category}</span>
    {/if}
  </div>
</div>

<style>
  .card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-2);
    background: var(--color-surface-raised);
    transition: border-color var(--transition-base);
  }

  .card:hover {
    border-color: var(--color-border-strong);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-1);
    margin-bottom: var(--space-half);
  }

  .model-name {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .org-badge {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .card-meta {
    margin-bottom: var(--space-1);
  }

  .file-name {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }

  .card-badges {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-half);
  }

  .badge {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
  }

  .badge-runtime[data-runtime="onnx"] {
    color: var(--color-runtime-ort);
    border-color: var(--color-runtime-ort);
  }

  .badge-runtime[data-runtime="litert"] {
    color: var(--color-runtime-litert);
    border-color: var(--color-runtime-litert);
  }

  .badge-dtype[data-dtype="fp16"] {
    color: var(--color-dtype-float);
    border-color: var(--color-dtype-float);
  }

  .badge-dtype[data-dtype="int8"],
  .badge-dtype[data-dtype="int4"] {
    color: var(--color-dtype-int);
    border-color: var(--color-dtype-int);
  }

  .badge-dtype[data-dtype="q4"],
  .badge-dtype[data-dtype="q4f16"] {
    color: var(--color-dtype-quant);
    border-color: var(--color-dtype-quant);
  }
</style>
