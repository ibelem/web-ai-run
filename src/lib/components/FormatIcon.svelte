<script lang="ts">
  interface Props {
    format: string;
    size?: number;
    selected?: boolean;
    hfModelId?: string;
    filePath?: string;
  }
  let { format, size = 16, selected = false, hfModelId, filePath }: Props = $props();

  const labels: Record<string, string> = {
    onnx:      'ONNX - Open Neural Network Exchange',
    tflite:    'TFLite - TensorFlow Lite (LiteRT)',
    litertlm:  'LiteRT LM - LiteRT Language Model',
  };

  const label = $derived(labels[format] ?? format);
  const href = $derived(
    hfModelId && filePath
      ? `https://huggingface.co/${hfModelId}/blob/main/${filePath}`
      : undefined
  );
</script>

<span class="fmt-icon-wrap" data-tooltip={label}>
  {#if href}
    <a {href} target="_blank" rel="noopener noreferrer" class="fmt-icon-link" title="View on Hugging Face" onclick={(e) => e.stopPropagation()}>
      {#if format === 'onnx'}
        <img src={selected ? '/icons/onnx-icon-selected.svg' : '/icons/onnx-icon.svg'} width={size} height={size} alt="onnx" class="fmt-icon" />
      {:else if format === 'tflite'}
        <img src="/icons/litert-icon.svg" width={size} height={size} alt="tflite" class="fmt-icon" />
      {:else if format === 'litertlm'}
        <img src="/icons/litertlm-icon.svg" width={size} height={size} alt="litertlm" class="fmt-icon" />
      {:else}
        <span class="fmt-icon-unknown">{format}</span>
      {/if}
    </a>
  {:else}
    {#if format === 'onnx'}
      <img src={selected ? '/icons/onnx-icon-selected.svg' : '/icons/onnx-icon.svg'} width={size} height={size} alt="onnx" class="fmt-icon" />
    {:else if format === 'tflite'}
      <img src="/icons/litert-icon.svg" width={size} height={size} alt="tflite" class="fmt-icon" />
    {:else if format === 'litertlm'}
      <img src="/icons/litertlm-icon.svg" width={size} height={size} alt="litertlm" class="fmt-icon" />
    {:else}
      <span class="fmt-icon-unknown">{format}</span>
    {/if}
  {/if}
</span>

<style>
  .fmt-icon-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    cursor: default;
  }

  .fmt-icon-link {
    display: inline-flex;
    align-items: center;
    opacity: 0.9;
    transition: opacity var(--transition-base);
    line-height: 0;
    pointer-events: auto;
  }

  .fmt-icon-link:hover {
    opacity: 1;
  }

  .fmt-icon-wrap::after {
    content: attr(data-tooltip);
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 500;
    color: var(--color-text-primary);
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 3px 7px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 120ms;
    z-index: 100;
    box-shadow: 0 2px 6px rgba(0,0,0,0.12);
  }

  .fmt-icon-wrap:hover::after {
    opacity: 1;
  }

  .fmt-icon {
    display: inline-block;
    vertical-align: middle;
    flex-shrink: 0;
  }

  .fmt-icon-unknown {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
  }
</style>
