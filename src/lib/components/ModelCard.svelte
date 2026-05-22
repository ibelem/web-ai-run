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
  .tag-format[data-format="onnx"]     { color: var(--color-fmt-onnx); border-color: var(--color-fmt-onnx); }
  .tag-format[data-format="tflite"]   { color: var(--color-fmt-tflite); border-color: var(--color-fmt-tflite); }
  .tag-format[data-format="litertlm"] { color: var(--color-fmt-litertlm); border-color: var(--color-fmt-litertlm); }

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

  .chip:hover {
    opacity: 0.8;
    transform: translateX(-1px) translateY(-1px);
  }

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

</style>
