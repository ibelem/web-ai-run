<script lang="ts">
  import type { TestItem } from '$lib/engine/types';
  import { getBackendLabel } from '$lib/engine/backends';

  let { queue = [] }: { queue: TestItem[] } = $props();

  const statusIcons: Record<string, string> = {
    pending: '○',
    downloading: '◎',
    compiling: '◉',
    running: '●',
    completed: '✓',
    error: '✗',
  };
</script>

<div class="test-queue">
  <h3 class="queue-title">Test Queue ({queue.length})</h3>
  <div class="queue-list">
    {#each queue as item}
      <div class="queue-item" class:active={item.status === 'running' || item.status === 'downloading' || item.status === 'compiling'} class:done={item.status === 'completed'} class:failed={item.status === 'error'}>
        <span class="status-icon">{statusIcons[item.status]}</span>
        <span class="item-model">{item.hf_model_id.split('/')[1]}</span>
        <span class="item-file">{item.file_path.split('/').pop()}</span>
        <span class="item-backend">{getBackendLabel(item.backend)}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .test-queue {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-2);
  }

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
</style>
