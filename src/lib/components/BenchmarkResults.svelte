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
            <th class="sortable" onclick={() => toggleSort('compilation_ms')}>Compile (ms)</th>
            <th class="sortable" onclick={() => toggleSort('load_and_compile_ms')}>Load+Compile (ms)</th>
            <th class="sortable" onclick={() => toggleSort('first_inference_ms')}>1st Inf (ms)</th>
            <th class="sortable" onclick={() => toggleSort('median_ms')}>Median (ms)</th>
            <th class="sortable" onclick={() => toggleSort('average_ms')}>Avg (ms)</th>
            <th class="sortable" onclick={() => toggleSort('best_ms')}>Best (ms)</th>
            <th class="sortable" onclick={() => toggleSort('p90_ms')}>P90 (ms)</th>
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
    font-size: var(--text-sm);
    font-family: var(--font-mono);
  }

  .results-table th {
    text-align: left;
    padding: var(--space-half) var(--space-1);
    font-weight: 500;
    color: var(--color-text-secondary);
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
    padding: var(--space-half) var(--space-1);
    border-bottom: 1px solid var(--color-border);
  }

  .results-table tr:last-child td {
    border-bottom: none;
  }

  .model-col {
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .metric {
    text-align: right;
    color: var(--color-text-secondary);
  }

  .metric.highlight {
    color: var(--color-text-primary);
    font-weight: 500;
  }

  .no-results {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    padding: var(--space-2) 0;
  }
</style>
