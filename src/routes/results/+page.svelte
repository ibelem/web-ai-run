<script lang="ts">
  import type { ResultRow } from './+page';
  import { getBackendLabel } from '$lib/engine/backends';

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

  function runAgainHref(result: ResultRow): string {
    const params = new URLSearchParams();
    params.set('models', `${result.model_id}|${result.file_path}`);
    params.set('backend', result.backend);
    params.set('n', String(result.iterations));
    return `/run#${params}`;
  }

  function exportCsv() {
    const headers = ['model_id', 'file_path', 'backend', 'data_type', 'status', 'avg_ms', 'p90_ms', 'throughput_fps', 'iterations', 'date', 'cpu', 'gpu', 'os', 'browser'];
    const rows = data.results.map((r) => [
      r.model_id,
      r.file_path,
      r.backend,
      r.data_type,
      r.status,
      r.average_ms ?? '',
      r.p90_ms ?? '',
      r.throughput_fps ?? '',
      r.iterations,
      r.started_at,
      r.cpu,
      r.gpu,
      r.os,
      r.browser,
    ].map((v) => JSON.stringify(v ?? '')).join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `benchmark-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="results-page">
  <header class="page-header">
    <div class="header-row">
      <div>
        <h1>Results</h1>
        <p>Your benchmark history.</p>
      </div>
      {#if data.results.length > 0}
        <button class="btn-export" onclick={exportCsv}>Export CSV</button>
      {/if}
    </div>
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
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each data.results as result (result.id)}
            <tr>
              <td class="cell-model" title={result.model_id}>
                {result.model_id.split('/').pop() ?? result.model_id}
              </td>
              <td><span class="badge badge-backend">{getBackendLabel(result.backend)}</span></td>
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
              <td class="cell-action">
                <a class="run-again-link" href={runAgainHref(result)} title="Run again with this config">↺</a>
              </td>
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

  .header-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .btn-export {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 4px 12px;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    cursor: pointer;
    white-space: nowrap;
    transition: border-color var(--transition-base), color var(--transition-base), background var(--transition-base);
    flex-shrink: 0;
    align-self: center;
  }

  .btn-export:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-accent-light);
  }

  .cell-action {
    text-align: center;
    padding-right: var(--space-1);
  }

  .run-again-link {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    text-decoration: none;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    transition: color var(--transition-base), background var(--transition-base);
    display: inline-block;
  }

  .run-again-link:hover {
    color: var(--color-primary);
    background: var(--color-accent-light);
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
    font-size: var(--text-sm);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cell-metric {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    text-align: right;
  }

  .cell-duration, .cell-date {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .badge {
    font-size: var(--text-xs);
    padding: 1px 7px;
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
