<script lang="ts">
  import type { TestResult } from '$lib/engine/types';
  import { getBackendLabel } from '$lib/engine/backends';

  let { results = [] }: { results: TestResult[] } = $props();

  let sortBy = $state<string>('median_ms');
  let sortAsc = $state(true);

  const sortedResults = $derived(
    [...results]
      .filter((r) => r.metrics)
      .sort((a, b) => {
        const aVal = (a.metrics as any)?.[sortBy] ?? (a as any)[sortBy] ?? 0;
        const bVal = (b.metrics as any)?.[sortBy] ?? (b as any)[sortBy] ?? 0;
        return sortAsc ? aVal - bVal : bVal - aVal;
      })
  );

  function toggleSort(col: string) {
    if (sortBy === col) sortAsc = !sortAsc;
    else { sortBy = col; sortAsc = true; }
  }

  function fmt(ms: number): string {
    return ms < 1 ? ms.toFixed(3) : ms.toFixed(2);
  }
</script>

<div class="results-wrapper">
  <h3 class="results-title">Results ({results.filter((r) => r.metrics).length})</h3>

  {#if sortedResults.length > 0}
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
          {#each sortedResults as result}
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
      {#each sortedResults as result}
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

  .results-title {
    font-size: var(--text-sm);
    font-weight: 500;
    margin-bottom: var(--space-1);
    color: var(--color-text-secondary);
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
