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

  function dtypeLabel(dt: string): string {
    return dt === 'quantized' ? 'quant' : dt;
  }

  const hasSelection = $derived(variants.some((v) => selectedIds.has(v.id)));
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
    </div>
  </div>
  <div class="card-right">
    {#each variants as variant (variant.id)}
      <button
        class="chip"
        class:chip-selected={selectedIds.has(variant.id)}
        data-dtype={variant.dataType}
        title={`${variant.dataType} · ${formatSize(variant.sizeBytes)}`}
        onclick={() => ontoggle?.(variant.id)}
      >{dtypeLabel(variant.dataType)}</button>
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

  .model-card:hover {
    border-color: var(--color-primary);
    background:var(--color-accent-light);
  }

  .model-card.has-selection {
    border-color: var(--color-primary-light);
    background:var(--color-accent-light);
  }

  .model-card.has-selection:hover {
    border-color: var(--color-primary);
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

  .card-top,
  .card-bottom {
    flex-wrap: nowrap;
    overflow: hidden;
  }

  .card-right {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    justify-content: flex-end;
    align-content: flex-start;
    width: 220px;
    padding-top: 1px;
    overflow: hidden;
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


  .tag-task {
    background: var(--color-surface-sunken);
    flex-shrink: 0;
  }

  .tag-inlib {
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
    transform: translateX(-1px) translateY(-1px);
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

</style>
