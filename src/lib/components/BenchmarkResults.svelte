<script lang="ts">
  import type { TestResult } from '$lib/engine/types';
  import { getBackendLabel } from '$lib/engine/backends';

  let { results = [] }: { results: TestResult[] } = $props();

  let sortBy = $state<string>('median_ms');
  let sortAsc = $state(true);
  let filterQuery = $state('');
  let currentPage = $state(1);
  const PAGE_SIZE = 20;

  const filteredResults = $derived(
    [...results]
      .filter((r) => r.metrics)
      .filter((r) => {
        if (!filterQuery.trim()) return true;
        const q = filterQuery.toLowerCase();
        return r.test_item.hf_model_id.toLowerCase().includes(q) ||
               r.test_item.backend.toLowerCase().includes(q);
      })
  );

  const sortedResults = $derived(
    [...filteredResults]
      .sort((a, b) => {
        const aVal = (a.metrics as any)?.[sortBy] ?? (a as any)[sortBy] ?? 0;
        const bVal = (b.metrics as any)?.[sortBy] ?? (b as any)[sortBy] ?? 0;
        return sortAsc ? aVal - bVal : bVal - aVal;
      })
  );

  const totalPages = $derived(Math.ceil(sortedResults.length / PAGE_SIZE));
  const pagedResults = $derived(
    sortedResults.length <= PAGE_SIZE
      ? sortedResults
      : sortedResults.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  );

  $effect(() => {
    void filterQuery;
    currentPage = 1;
  });

  function toggleSort(col: string) {
    if (sortBy === col) sortAsc = !sortAsc;
    else { sortBy = col; sortAsc = true; }
  }

  function fmt(ms: number): string {
    return ms < 1 ? ms.toFixed(3) : ms.toFixed(2);
  }

  let copyFeedback = $state('');

  function toMarkdown(): string {
    const cols = ['Model', 'Backend', 'Compile', 'Load+Compile', '1st Inf', 'Median', 'Avg', 'Best', 'P90', 'FPS'];
    const rows = sortedResults.map(r => [
      r.test_item.hf_model_id.split('/')[1],
      getBackendLabel(r.test_item.backend),
      r.metrics!.compilation_ms != null ? fmt(r.metrics!.compilation_ms) : '-',
      r.metrics!.load_and_compile_ms != null ? fmt(r.metrics!.load_and_compile_ms) : '-',
      fmt(r.metrics!.first_inference_ms),
      fmt(r.metrics!.median_ms),
      fmt(r.metrics!.average_ms),
      fmt(r.metrics!.best_ms),
      fmt(r.metrics!.p90_ms),
      fmt(r.metrics!.throughput_fps),
    ]);
    const sep = cols.map(() => '---');
    return [cols.join(' | '), sep.join(' | '), ...rows.map(r => r.join(' | '))].join('\n');
  }

  function toJSON(): string {
    return JSON.stringify(sortedResults.map(r => ({
      model: r.test_item.hf_model_id,
      file: r.test_item.file_path,
      backend: r.test_item.backend,
      ...r.metrics,
    })), null, 2);
  }

  function toCSV(): string {
    const cols = ['Model', 'File', 'Backend', 'Compile (ms)', 'Load+Compile (ms)', '1st Inference (ms)', 'Median (ms)', 'Avg (ms)', 'Best (ms)', 'P90 (ms)', 'FPS'];
    const rows = sortedResults.map(r => [
      r.test_item.hf_model_id,
      r.test_item.file_path,
      r.test_item.backend,
      r.metrics!.compilation_ms ?? '',
      r.metrics!.load_and_compile_ms ?? '',
      r.metrics!.first_inference_ms,
      r.metrics!.median_ms,
      r.metrics!.average_ms,
      r.metrics!.best_ms,
      r.metrics!.p90_ms,
      r.metrics!.throughput_fps,
    ]);
    return [cols.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  async function copyAs(format: 'markdown' | 'json' | 'csv') {
    const text = format === 'markdown' ? toMarkdown() : format === 'json' ? toJSON() : toCSV();
    await navigator.clipboard.writeText(text);
    copyFeedback = format;
    setTimeout(() => { copyFeedback = ''; }, 2000);
  }

  function saveCSV() {
    const blob = new Blob([toCSV()], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `benchmark-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="results-wrapper">
  <div class="results-header">
    <h3 class="results-title">Results ({filteredResults.length})</h3>
    {#if results.filter((r) => r.metrics).length > PAGE_SIZE}
      <input
        class="results-filter"
        type="text"
        placeholder="Filter by model or backend..."
        bind:value={filterQuery}
      />
    {/if}
  </div>

  {#if pagedResults.length > 0}
    <div class="results-table-wrapper">
      <table class="results-table">
        <thead>
          <tr>
            <th>Model</th>
            <th>Backend</th>
            <th class="sortable" onclick={() => toggleSort('compilation_ms')}>Compile</th>
            <th class="sortable" onclick={() => toggleSort('load_and_compile_ms')}>Load+Compile</th>
            <th class="sortable" onclick={() => toggleSort('first_inference_ms')}>1st Inf</th>
            <th class="sortable" onclick={() => toggleSort('median_ms')}>Median</th>
            <th class="sortable" onclick={() => toggleSort('average_ms')}>Avg</th>
            <th class="sortable" onclick={() => toggleSort('best_ms')}>Best</th>
            <th class="sortable" onclick={() => toggleSort('p90_ms')}>P90</th>
            <th class="sortable" onclick={() => toggleSort('throughput_fps')}>FPS</th>
          </tr>
        </thead>
        <tbody>
          {#each pagedResults as result}
            <tr>
              <td class="model-col">{result.test_item.hf_model_id.split('/')[1]}</td>
              <td>{getBackendLabel(result.test_item.backend)}</td>
              <td class="metric">{result.metrics!.compilation_ms != null ? fmt(result.metrics!.compilation_ms) : '—'}</td>
              <td class="metric">{result.metrics!.load_and_compile_ms != null ? fmt(result.metrics!.load_and_compile_ms) : '—'}</td>
              <td class="metric">{fmt(result.metrics!.first_inference_ms)}</td>
              <td class="metric highlight">{fmt(result.metrics!.median_ms)}</td>
              <td class="metric">{fmt(result.metrics!.average_ms)}</td>
              <td class="metric">{fmt(result.metrics!.best_ms)}</td>
              <td class="metric">{fmt(result.metrics!.p90_ms)}</td>
              <td class="metric">{fmt(result.metrics!.throughput_fps)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Mobile card layout -->
    <div class="results-cards">
      {#each pagedResults as result}
        <div class="result-card">
          <div class="card-header">
            <span class="card-model">{result.test_item.hf_model_id.split('/')[1]}</span>
            <span class="card-backend">{getBackendLabel(result.test_item.backend)}</span>
          </div>
          <div class="card-metrics">
            <div class="card-metric">
              <span class="card-metric-value">{fmt(result.metrics!.median_ms)}</span>
              <span class="card-metric-label">Median ms</span>
            </div>
            <div class="card-metric">
              <span class="card-metric-value">{fmt(result.metrics!.best_ms)}</span>
              <span class="card-metric-label">Best ms</span>
            </div>
            <div class="card-metric">
              <span class="card-metric-value">{fmt(result.metrics!.throughput_fps)}</span>
              <span class="card-metric-label">FPS</span>
            </div>
            <div class="card-metric">
              <span class="card-metric-value">{fmt(result.metrics!.p90_ms)}</span>
              <span class="card-metric-label">P90 ms</span>
            </div>
          </div>
        </div>
      {/each}
    </div>
    <div class="results-footer">
      <div class="export-bar">
        <button class="export-btn" onclick={() => copyAs('markdown')}>
          {copyFeedback === 'markdown' ? 'Copied!' : 'Copy Markdown'}
        </button>
        <button class="export-btn" onclick={() => copyAs('json')}>
          {copyFeedback === 'json' ? 'Copied!' : 'Copy JSON'}
        </button>
        <button class="export-btn" onclick={() => copyAs('csv')}>
          {copyFeedback === 'csv' ? 'Copied!' : 'Copy CSV'}
        </button>
        <button class="export-btn" onclick={saveCSV}>
          Save CSV
        </button>
      </div>
      {#if totalPages > 1}
        <div class="pagination">
          <button class="page-btn" disabled={currentPage === 1} onclick={() => currentPage--}>Prev</button>
          <span class="page-info">{currentPage}/{totalPages}</span>
          <button class="page-btn" disabled={currentPage === totalPages} onclick={() => currentPage++}>Next</button>
        </div>
      {/if}
    </div>
  {:else}
    <p class="no-results">No results yet. Run a benchmark to see metrics.</p>
  {/if}
</div>

<style>
  .results-wrapper {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-2);
  }

  .results-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
  }

  .results-title {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .results-filter {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    padding: 3px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    width: 180px;
    transition: border-color var(--transition-base);
  }

  .results-filter:focus-visible {
    border-color: var(--color-focus-ring);
  }

  .results-table-wrapper {
    overflow-x: auto;
  }

  .results-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-xs);
    font-family: var(--font-mono);
  }

  .results-table th {
    text-align: left;
    padding: var(--space-1) var(--space-1);
    font-weight: 500;
    font-size: 11px;
    color: var(--color-text-muted);
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
  }

  .results-table th.sortable {
    cursor: pointer;
  }

  .results-table th.sortable:hover {
    color: var(--color-text-primary);
  }

  .results-table td {
    padding: var(--space-2) var(--space-1);
    border-bottom: 1px solid var(--color-border);
  }

  .results-table tbody tr:nth-child(even) {
    background: var(--color-surface-sunken);
  }

  .results-table tr:last-child td {
    border-bottom: none;
  }

  .model-col {
    font-weight: 500;
    color: var(--color-text-primary);
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .metric {
    text-align: right;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .metric.highlight {
    color: var(--color-text-primary);
    font-weight: 600;
  }

  .results-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-top: var(--space-2);
    flex-wrap: wrap;
  }

  .export-bar {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
  }

  .pagination {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .page-btn {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 3px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    cursor: pointer;
    transition: border-color var(--transition-base);
  }

  .page-btn:hover:not(:disabled) {
    border-color: var(--color-primary);
  }

  .page-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-info {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .export-btn {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 4px 10px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: border-color var(--transition-base), color var(--transition-base), background var(--transition-base);
  }

  .export-btn:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-accent-light);
  }

  .no-results {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    padding: var(--space-2) 0;
  }

  /* Mobile card layout */
  .results-cards {
    display: none;
    flex-direction: column;
    gap: var(--space-1);
  }

  .result-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    padding: var(--space-2);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-1);
  }

  .card-model {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .card-backend {
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 1px 7px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .card-metrics {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-1);
  }

  .card-metric {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .card-metric-value {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .card-metric-label {
    font-size: 10px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  @media (max-width: 640px) {
    .results-table-wrapper {
      display: none;
    }

    .results-cards {
      display: flex;
    }

    .card-metrics {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
