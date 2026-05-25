<script lang="ts">
  import type { ResultRow } from './+page';
  import { getBackendLabel } from '$lib/engine/backends';

  let { data } = $props();

  interface RunGroup {
    run_id: string | null;
    rows: ResultRow[];
    started_at: string;
    cpu: string;
    gpu: string;
    os: string;
    browser: string;
  }

  const runGroups = $derived((): RunGroup[] => {
    const map = new Map<string, RunGroup>();
    for (const r of data.results) {
      const key = r.run_id ?? `solo-${r.id}`;
      const existing = map.get(key);
      if (existing) {
        existing.rows.push(r);
        if (r.started_at < existing.started_at) existing.started_at = r.started_at;
      } else {
        map.set(key, {
          run_id: r.run_id,
          rows: [r],
          started_at: r.started_at,
          cpu: r.cpu,
          gpu: r.gpu,
          os: r.os,
          browser: r.browser,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.started_at.localeCompare(a.started_at));
  });

  let expandedRuns = $state<Set<string>>(new Set());

  function toggleRun(key: string) {
    const next = new Set(expandedRuns);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expandedRuns = next;
  }

  function runKey(g: RunGroup): string {
    return g.run_id ?? `solo-${g.rows[0]?.id}`;
  }

  function isExpanded(g: RunGroup): boolean {
    return expandedRuns.has(runKey(g));
  }

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

  function runGroupHref(g: RunGroup): string {
    const models = g.rows.map((r) => `${r.model_id}|${r.file_path}`).join(',');
    const params = new URLSearchParams();
    params.set('models', models);
    params.set('backend', g.rows[0]?.backend ?? '');
    params.set('n', String(g.rows[0]?.iterations ?? 50));
    return `/run#${params}`;
  }

  function groupStatusSummary(rows: ResultRow[]): string {
    const ok = rows.filter((r) => r.status === 'completed').length;
    const err = rows.filter((r) => r.status === 'error').length;
    if (err === 0) return `${ok} completed`;
    return `${ok} ok, ${err} failed`;
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
    <div class="run-groups">
      {#each runGroups() as group (runKey(group))}
        {@const expanded = isExpanded(group)}
        {@const isSolo = group.rows.length === 1}
        <div class="run-group" class:expanded>
          <div class="run-group-header" role="button" tabindex="0"
            onclick={() => !isSolo && toggleRun(runKey(group))}
            onkeydown={(e) => { if (!isSolo && (e.key === 'Enter' || e.key === ' ')) toggleRun(runKey(group)); }}
            style={isSolo ? 'cursor: default;' : ''}
          >
            <div class="run-group-summary">
              {#if !isSolo}
                <span class="expand-chevron" class:open={expanded}>›</span>
              {/if}
              <span class="run-backends">
                {[...new Set(group.rows.map((r) => getBackendLabel(r.backend)))].join(', ')}
              </span>
              <span class="run-model-count">
                {group.rows.length} model{group.rows.length !== 1 ? 's' : ''}
              </span>
              <span class="run-status-summary">{groupStatusSummary(group.rows)}</span>
            </div>
            <div class="run-group-meta">
              <span class="run-hw">{group.gpu || group.cpu || '—'}</span>
              <span class="run-date">{formatDate(group.started_at)}</span>
              <a class="run-again-link" href={runGroupHref(group)} title="Re-run this session" onclick={(e) => e.stopPropagation()}>↺</a>
            </div>
          </div>

          {#if expanded || isSolo}
            <div class="run-rows-wrap">
              <table class="results-table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Data Type</th>
                    <th>Status</th>
                    <th>Avg (ms)</th>
                    <th>p90 (ms)</th>
                    <th>Throughput</th>
                    <th>Duration</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {#each group.rows as result (result.id)}
                    <tr>
                      <td class="cell-model" title={result.model_id}>
                        {result.model_id.split('/').pop() ?? result.model_id}
                      </td>
                      <td><span class="badge badge-dtype">{result.data_type}</span></td>
                      <td><span class="status-dot {statusClass(result.status)}"></span> {result.status}</td>
                      <td class="cell-metric">{result.average_ms?.toFixed(1) ?? '—'}</td>
                      <td class="cell-metric">{result.p90_ms?.toFixed(1) ?? '—'}</td>
                      <td class="cell-metric">{result.throughput_fps ? `${result.throughput_fps.toFixed(1)} fps` : '—'}</td>
                      <td class="cell-duration">{formatDuration(result.started_at, result.completed_at)}</td>
                      <td class="cell-action">
                        <a class="run-again-link" href={runAgainHref(result)} title="Run again">↺</a>
                        <a class="run-again-link" href={`/results/${result.id}`} title="Shareable result page">↗</a>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      {/each}
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

  .run-groups {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .run-group {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .run-group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    background: var(--color-surface);
    cursor: pointer;
    user-select: none;
    transition: background var(--transition-base);
  }

  .run-group-header:hover {
    background: var(--color-nav-item-hover);
  }

  .run-group-summary {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex: 1;
    min-width: 0;
  }

  .expand-chevron {
    font-size: var(--text-base);
    color: var(--color-text-muted);
    transition: transform var(--transition-base);
    flex-shrink: 0;
    line-height: 1;
  }

  .expand-chevron.open {
    transform: rotate(90deg);
  }

  .run-backends {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-primary);
    white-space: nowrap;
  }

  .run-model-count {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .run-status-summary {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .run-group-meta {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .run-hw {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .run-date {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .run-rows-wrap {
    overflow-x: auto;
    border-top: 1px solid var(--color-border);
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

  .results-table tbody tr:last-child td {
    border-bottom: none;
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

  .cell-duration {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .badge {
    font-size: var(--text-xs);
    padding: 1px 7px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
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

  @media (max-width: 640px) {
    .run-group-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-half);
    }

    .run-group-meta {
      width: 100%;
      justify-content: flex-start;
    }

    .run-hw {
      max-width: none;
    }

    .results-table {
      font-size: var(--text-xs);
    }

    .results-table th,
    .results-table td {
      padding: var(--space-half) 6px;
    }

    .cell-model {
      max-width: 100px;
    }
  }
</style>
