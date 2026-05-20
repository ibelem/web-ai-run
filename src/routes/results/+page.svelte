<script lang="ts">
  let { data } = $props();

  function formatDuration(startedAt: string, completedAt: string | null): string {
    if (!completedAt) return 'running...';
    const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function statusClass(status: string): string {
    if (status === 'completed') return 'status-ok';
    if (status === 'running') return 'status-running';
    return 'status-error';
  }

  const groupedByRun = $derived(() => {
    const groups = new Map<string, typeof data.results>();
    for (const r of data.results) {
      const key = r.run_id ?? r.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    return [...groups.entries()];
  });
</script>

<div class="results-page">
  <header class="page-header">
    <h1>Results</h1>
    <p>Your benchmark history.</p>
  </header>

  {#if data.error}
    <div class="error-banner">
      <p>Failed to load results: {data.error}</p>
    </div>
  {:else if data.results.length === 0}
    <div class="empty">
      <p>No benchmark results yet. Run a benchmark with "Save results" enabled.</p>
    </div>
  {:else}
    <div class="results-table-wrapper">
      <table class="results-table">
        <thead>
          <tr>
            <th>Model</th>
            <th>Backend</th>
            <th>Data Type</th>
            <th>Status</th>
            <th>Avg (ms)</th>
            <th>p90 (ms)</th>
            <th>Throughput</th>
            <th>Duration</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {#each data.results as result (result.id)}
            <tr>
              <td class="cell-model" title={result.model_id}>
                {result.model_id.split('/').pop() ?? result.model_id}
              </td>
              <td><span class="badge badge-backend">{result.backend}</span></td>
              <td><span class="badge badge-dtype">{result.data_type}</span></td>
              <td><span class="status-dot {statusClass(result.status)}"></span> {result.status}</td>
              <td class="cell-metric">
                {result.average_ms?.toFixed(1) ?? '—'}
              </td>
              <td class="cell-metric">
                {result.p90_ms?.toFixed(1) ?? '—'}
              </td>
              <td class="cell-metric">
                {result.throughput_fps ? `${result.throughput_fps.toFixed(1)} fps` : '—'}
              </td>
              <td class="cell-duration">{formatDuration(result.started_at, result.completed_at)}</td>
              <td class="cell-date">{formatDate(result.started_at)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .results-page {
    max-width: 100%;
  }

  .error-banner {
    padding: var(--space-2);
    border-radius: var(--radius-base);
  }

  .results-table-wrapper {
    overflow-x: auto;
  }

  .results-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
    font-family: var(--font-ui);
  }

  .results-table th {
    text-align: left;
    padding: var(--space-1) var(--space-1);
    border-bottom: 1px solid var(--color-border-strong);
    color: var(--color-text-muted);
    font-weight: 400;
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  .results-table td {
    padding: var(--space-1) var(--space-1);
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-primary);
    white-space: nowrap;
  }

  .results-table tbody tr:hover {
    background: var(--color-nav-item-hover);
  }

  .cell-model {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cell-metric {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    text-align: right;
  }

  .cell-duration, .cell-date {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .badge {
    font-size: var(--text-xs);
    padding: 1px 5px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
  }

  .badge-backend {
    color: var(--color-text-secondary);
  }

  .badge-dtype {
    color: var(--color-text-secondary);
  }

  .status-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-right: 4px;
  }

  .status-ok {
    background: var(--color-success, #22c55e);
  }

  .status-running {
    background: var(--color-warning, #f59e0b);
  }

  .status-error {
    background: var(--color-error);
  }
</style>
