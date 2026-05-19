<script lang="ts">
  import { inferFormat, stripExt } from '$lib/huggingface/parser';

  interface Props {
    hfModelId: string;
    filePath: string;
    dataType: string;
    sizeBytes: number;
    runtime: 'onnx' | 'litert';
    sourceOrg: string;
    task: string;
    selected?: boolean;
    ontoggle?: () => void;
  }

  let { hfModelId, filePath, dataType, sizeBytes, runtime, sourceOrg, task, selected = false, ontoggle }: Props = $props();

  function formatSize(bytes: number): string {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  const fileLabel = $derived(stripExt(filePath));
  const format = $derived(inferFormat(filePath));
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="model-row"
  class:selected
  class:clickable={!!ontoggle}
  onclick={ontoggle}
  role={ontoggle ? 'checkbox' : undefined}
  aria-checked={ontoggle ? selected : undefined}
  tabindex={ontoggle ? 0 : undefined}
  onkeydown={ontoggle ? (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); ontoggle!(); } } : undefined}
>
  <div class="col col-check">
    {#if ontoggle}
      <input type="checkbox" checked={selected} class="check" tabindex="-1" onclick={(e) => { e.stopPropagation(); ontoggle?.(); }} />
    {/if}
  </div>
  <div class="col col-task">
    {#if task && task !== 'uncategorized'}
      <span class="tag tag-task" title={task}>{task}</span>
    {/if}
  </div>
  <div class="col col-info" title="{hfModelId} — {filePath}">
    <span class="info-repo">{hfModelId}</span>
    <span class="info-file">{fileLabel}</span>
  </div>
  <div class="col col-format" title="Format: {format}">
    <span class="tag tag-format" data-format={format}>{format}</span>
  </div>
  <div class="col col-dtype" title="Data type: {dataType}">
    <span class="tag tag-dtype" data-dtype={dataType}>{dataType}</span>
  </div>
  <div class="col col-size" title="Size: {formatSize(sizeBytes)}">
    <span class="tag tag-size">{formatSize(sizeBytes)}</span>
  </div>
</div>

<style>
  .model-row {
    display: grid;
    grid-template-columns: 20px 80px 1fr 36px 36px 60px;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    min-width: 0;
    transition: border-color var(--transition-base), background var(--transition-base);
  }

  .clickable {
    cursor: pointer;
  }

  .clickable:hover {
    border-color: var(--color-border-strong);
    background: var(--color-accent-light);
  }

  .model-row.selected {
    border-color: var(--color-info);
    background: color-mix(in srgb, var(--color-info) 6%, var(--color-surface-raised));
  }

  .col {
    overflow: hidden;
    min-width: 0;
  }

  .col-check {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .check {
    width: 14px;
    height: 14px;
    cursor: pointer;

    flex-shrink: 0;
  }

  .col-info {
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
    overflow: hidden;
    line-height: 1.2;
  }

  .info-repo,
  .info-file {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .info-repo {
    color: var(--color-text-primary);
  }

  .info-file {
    color: var(--color-text-muted);
  }

  .col-size {
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }

  .tag-size {
    width: 100%;
    text-align: center;
    font-family: var(--font-mono);
  }

  .col-task,
  .col-format,
  .col-dtype {
    display: flex;
    align-items: center;
    overflow: hidden;
  }

  .tag-task,
  .tag-format,
  .tag-dtype {
    width: 100%;
  }

  .tag-format,
  .tag-dtype {
    text-align: center;
  }

  .tag-task {
    background: var(--color-surface-sunken);
  }

  @media (max-width: 600px) {
    .model-row {
      grid-template-columns: 20px 1fr 36px 36px 60px;
    }

    .col-task {
      display: none;
    }
  }

  .tag-format[data-format="onnx"]     { color: #3b82f6; border-color: #3b82f6; }
  .tag-format[data-format="tflite"]   { color: #10b981; border-color: #10b981; }
  .tag-format[data-format="litertlm"] { color: #f97316; border-color: #f97316; }

  .tag-dtype[data-dtype="fp32"] { color: var(--color-primary); border-color: var(--color-primary); }
  .tag-dtype[data-dtype="fp16"] { color: #8b5cf6; border-color: #8b5cf6; }
  .tag-dtype[data-dtype="bf16"] { color: #7c3aed; border-color: #7c3aed; }
  .tag-dtype[data-dtype="fp8"]  { color: #a855f7; border-color: #a855f7; }
  .tag-dtype[data-dtype="int8"] { color: #06b6d4; border-color: #06b6d4; }
  .tag-dtype[data-dtype="uint8"]{ color: #0891b2; border-color: #0891b2; }
  .tag-dtype[data-dtype="int4"] { color: #10b981; border-color: #10b981; }
  .tag-dtype[data-dtype="uint4"]{ color: #059669; border-color: #059669; }
  .tag-dtype[data-dtype="q4"]   { color: #16a34a; border-color: #16a34a; }
  .tag-dtype[data-dtype="q4f16"]{ color: #6366f1; border-color: #6366f1; }
  .tag-dtype[data-dtype="bnb4"]      { color: #f59e0b; border-color: #f59e0b; }
  .tag-dtype[data-dtype="quantized"] { color: #ea580c; border-color: #ea580c; }
</style>
