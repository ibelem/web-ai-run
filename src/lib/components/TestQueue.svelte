<script lang="ts">
  import type { TestItem, Backend } from '$lib/engine/types';
  import { getBackendLabel } from '$lib/engine/backends';

  let { queue = [], onretry, isRunning = false }: { queue: TestItem[]; onretry?: (item: TestItem) => void; isRunning?: boolean } = $props();

  const BACKEND_ORDER: Backend[] = ['wasm_1', 'wasm_n', 'webnn_cpu', 'webgpu', 'webnn_gpu', 'webnn_npu'];

  type ModelGroup = {
    hf_model_id: string;
    file_path: string;
    items: Record<string, TestItem>;
  };

  const groupedModels = $derived.by(() => {
    const map = new Map<string, ModelGroup>();
    for (const item of queue) {
      const key = `${item.hf_model_id}::${item.file_path}`;
      if (!map.has(key)) {
        map.set(key, { hf_model_id: item.hf_model_id, file_path: item.file_path, items: {} });
      }
      map.get(key)!.items[item.backend] = item;
    }
    return [...map.values()];
  });

  const activeBackends = $derived(
    BACKEND_ORDER.filter(b => queue.some(item => item.backend === b))
  );

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
    return `Try: ${alts.map(id => getBackendLabel(id)).join(' or ')}`;
  }
</script>

<div class="test-queue">
  <h3 class="queue-title">Test Queue ({queue.length})</h3>
  <div class="queue-table-wrap">
    <table class="queue-table">
      <thead>
        <tr>
          <th class="th-model">ID</th>
          <th class="th-file">File</th>
          {#each activeBackends as b}
            <th class="th-backend">{getBackendLabel(b)}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each groupedModels as group}
          <tr>
            <td class="cell-model" title={group.hf_model_id}>{group.hf_model_id}</td>
            <td class="cell-file" title={group.file_path}>{group.file_path}</td>
            {#each activeBackends as b}
              {@const item = group.items[b]}
              <td class="cell-status">
                {#if item}
                  <span class="status-badge status-{item.status}" title={item.status === 'error' ? `${item.error}${suggestAlternative(item.backend) ? '\n' + suggestAlternative(item.backend) : ''}` : item.status}>
                    {#if item.status === 'pending'}
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/></svg>
                    {:else if item.status === 'downloading'}
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    {:else if item.status === 'compiling' || item.status === 'running'}
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    {:else if item.status === 'completed'}
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {:else if item.status === 'error'}
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    {/if}
                  </span>
                  {#if item.status === 'error' && onretry && !isRunning}
                    <button class="retry-btn" onclick={() => onretry!(item)} title="Retry">↺</button>
                  {/if}
                {:else}
                  <span class="cell-na">-</span>
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .queue-title {
    font-size: var(--text-sm);
    font-weight: 500;
    margin-bottom: var(--space-1);
    color: var(--color-text-secondary);
  }

  .queue-table-wrap {
    height: 200px;
    overflow-y: auto;
    overflow-x: auto;
    scroll-behavior: smooth;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  .queue-table-wrap::-webkit-scrollbar {
    width: 1px;
    height: 3px;
  }

  .queue-table-wrap::-webkit-scrollbar-button {
    width: 0;
    height: 0;
    display: none;
  }

  .queue-table-wrap::-webkit-scrollbar-track {
    background: transparent;
  }

  .queue-table-wrap::-webkit-scrollbar-thumb {
    background-color: var(--color-border-strong);
    border-radius: 3px;
  }

  .test-queue:hover .queue-table-wrap::-webkit-scrollbar-thumb {
    background-color: var(--color-primary);
  }

  .queue-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-xs);
    font-family: var(--font-mono);
  }

  .queue-table th {
    text-align: center;
    padding: 4px 8px;
    font-weight: 500;
    font-size: 11px;
    color: var(--color-text-muted);
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
  }

  .th-model, .th-file {
    text-align: center;
  }

  .queue-table td {
    padding: 5px 8px;
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
  }

  .cell-model {
    font-weight: 500;
    color: var(--color-text-primary);
    max-width: 5vw;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
  }

  .cell-file {
    max-width: 5vw;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-muted);
    text-align: center;
  }

  .cell-status {
    text-align: center;
    white-space: nowrap;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .status-pending { color: var(--color-text-muted); }
  .status-downloading { color: var(--color-text-secondary); animation: blink 1.2s ease-in-out infinite; }
  .status-compiling, .status-running { color: var(--color-primary); animation: blink 0.8s ease-in-out infinite; }
  .status-completed { color: var(--color-success); }
  .status-error { color: var(--color-error); }

  .cell-na {
    color: var(--color-text-muted);
  }

  .retry-btn {
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 0 4px;
    border: 0px solid var(--color-error);
    background: none;
    color: var(--color-error);
    cursor: pointer;
    line-height: 1.4;
    transition: background var(--transition-base), color var(--transition-base);
  }

  .retry-btn:hover {
    background: var(--color-error);
    color: var(--color-text-on-primary);
  }


  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 0.8s linear infinite; }

  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
</style>
