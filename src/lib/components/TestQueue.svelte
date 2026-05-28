<script lang="ts">
  import type { TestItem } from '$lib/engine/types';
  import { getBackendLabel, BACKENDS } from '$lib/engine/backends';

  let { queue = [], onretry, isRunning = false }: { queue: TestItem[]; onretry?: (item: TestItem) => void; isRunning?: boolean } = $props();

  const statusIcons: Record<string, string> = {
    pending: '○',
    downloading: '◎',
    compiling: '◉',
    running: '●',
    completed: '✓',
    error: '✗',
  };

  function suggestAlternative(failedBackend: string): string {
    const fallbacks: Record<string, string[]> = {
      webnn_npu: ['webnn_gpu', 'webgpu'],
      webnn_gpu: ['webgpu', 'wasm_n'],
      webnn_cpu: ['wasm_n', 'wasm_1'],
      webgpu: ['wasm_n', 'wasm_1'],
      wasm_n: ['wasm_1'],
    };
    const alts = fallbacks[failedBackend];
    if (!alts) return '';
    const labels = alts.map(id => getBackendLabel(id)).join(' or ');
    return `Try: ${labels}`;
  }
</script>

<div class="test-queue">
  <h3 class="queue-title">Test Queue ({queue.length})</h3>
  <div class="queue-list">
    {#each queue as item}
      <div class="queue-item" class:active={item.status === 'running' || item.status === 'downloading' || item.status === 'compiling'} class:done={item.status === 'completed'} class:failed={item.status === 'error'}>
        <span class="status-icon">{statusIcons[item.status]}</span>
        <span class="item-model">{item.hf_model_id.split('/')[1]}</span>
        <span class="item-file">{item.file_path}</span>
        <span class="item-backend">{getBackendLabel(item.backend)}</span>
        {#if item.status === 'error' && onretry && !isRunning}
          <button class="retry-btn" onclick={() => onretry!(item)} title="Retry this item">↺</button>
        {/if}
      </div>
      {#if item.status === 'error' && item.error}
        <div class="error-detail">
          <span class="error-msg">{item.error}</span>
          {#if suggestAlternative(item.backend)}
            <span class="error-suggestion">{suggestAlternative(item.backend)}</span>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>

  .queue-title {
    font-size: var(--text-sm);
    font-weight: 500;
    margin-bottom: var(--space-1);
    color: var(--color-text-secondary);
  }

  .queue-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .queue-item {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-half) var(--space-1);
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
  }

  .queue-item.active {
    background: var(--color-surface-sunken);
    color: var(--color-text-primary);
  }

  .queue-item.done { color: var(--color-success); }
  .queue-item.failed { color: var(--color-error); }

  .status-icon { width: 12px; text-align: center; }
  .item-model { flex: 1; }
  .item-file { color: var(--color-text-muted); }
  .item-backend { min-width: 100px; text-align: right; }

  .retry-btn {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    padding: 0 6px;
    border: 1px solid var(--color-error);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-error);
    cursor: pointer;
    line-height: 1.5;
    transition: background var(--transition-base), color var(--transition-base);
    flex-shrink: 0;
  }

  .retry-btn:hover {
    background: var(--color-error);
    color: var(--color-text-on-primary);
  }

  .error-detail {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-half) var(--space-2);
    padding: 2px var(--space-1) var(--space-half) 24px;
    font-size: 11px;
    line-height: 1.4;
  }

  .error-msg {
    color: var(--color-error);
    word-break: break-word;
  }

  .error-suggestion {
    color: var(--color-text-secondary);
    font-weight: 500;
  }

</style>
