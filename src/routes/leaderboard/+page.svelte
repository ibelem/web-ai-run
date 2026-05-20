<script lang="ts">
  import type { LeaderboardRow } from './+page.ts';

  let { data } = $props();

  let filterModel = $state('');
  let filterBackend = $state('');
  let filterDataType = $state('');
  let sortColumn = $state<string>('average_ms');
  let sortAscending = $state(true);

  const models = $derived(
    [...new Set(data.results.map((r: LeaderboardRow) => r.model_id))].sort()
  );

  const backends = $derived(
    [...new Set(data.results.map((r: LeaderboardRow) => r.backend))].sort()
  );

  const dataTypes = $derived(
    [...new Set(data.results.map((r: LeaderboardRow) => r.data_type))].sort()
  );

  const filteredResults = $derived(
    data.results.filter((r: LeaderboardRow) => {
      if (filterModel && r.model_id !== filterModel) return false;
      if (filterBackend && r.backend !== filterBackend) return false;
      if (filterDataType && r.data_type !== filterDataType) return false;
      return true;
    })
  );

  const sortedResults = $derived(
    [...filteredResults].sort((a: LeaderboardRow, b: LeaderboardRow) => {
      let aVal: number | null = null;
      let bVal: number | null = null;

      switch (sortColumn) {
        case 'average_ms':
          aVal = a.average_ms ?? null;
          bVal = b.average_ms ?? null;
          break;
        case 'median_ms':
          aVal = a.median_ms ?? null;
          bVal = b.median_ms ?? null;
          break;
        case 'best_ms':
          aVal = a.best_ms ?? null;
          bVal = b.best_ms ?? null;
          break;
        case 'p90_ms':
          aVal = a.p90_ms ?? null;
          bVal = b.p90_ms ?? null;
          break;
        case 'throughput_fps':
          aVal = a.throughput_fps ?? null;
          bVal = b.throughput_fps ?? null;
          break;
        case 'compilation_ms':
          aVal = a.compilation_ms ?? null;
          bVal = b.compilation_ms ?? null;
          break;
        case 'load_and_compile_ms':
          aVal = a.load_and_compile_ms ?? null;
          bVal = b.load_and_compile_ms ?? null;
          break;
      }

      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      return sortAscending ? aVal - bVal : bVal - aVal;
    })
  );

  function toggleSort(column: string) {
    if (sortColumn === column) {
      sortAscending = !sortAscending;
    } else {
      sortColumn = column;
      sortAscending = column === 'throughput_fps' ? false : true;
    }
  }

  function sortIndicator(column: string): string {
    if (sortColumn !== column) return '';
    return sortAscending ? ' ↑' : ' ↓';
  }

  function modelName(id: string): string {
    return id.split('/').pop() ?? id;
  }
</script>

<div class="leaderboard-page">
  <header class="page-header">
    <h1>Leaderboard</h1>
    <p>Compare benchmark results across models, backends, and hardware.</p>
  </header>

  {#if data.error}
    <div class="error-banner">
      <p>Failed to load results: {data.error}</p>
    </div>
  {:else}
    <div class="filters">
      <select class="filter-select" bind:value={filterModel}>
        <option value="">All models</option>
        {#each models as m}
          <option value={m}>{modelName(m)}</option>
        {/each}
      </select>

      <select class="filter-select" bind:value={filterBackend}>
        <option value="">All backends</option>
        {#each backends as b}
          <option value={b}>{b}</option>
        {/each}
      </select>

      <select class="filter-select" bind:value={filterDataType}>
        <option value="">All data types</option>
        {#each dataTypes as dt}
          <option value={dt}>{dt}</option>
        {/each}
      </select>
    </div>

    {#if sortedResults.length === 0}
      <div class="empty">
        <p>No completed benchmark results found.</p>
      </div>
    {:else}
      <div class="results-table-wrapper">
        <table class="results-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Backend</th>
              <th>Data Type</th>
              <th class="sortable" onclick={() => toggleSort('compilation_ms')}>
                Compile (ms){sortIndicator('compilation_ms')}
              </th>
              <th class="sortable" onclick={() => toggleSort('load_and_compile_ms')}>
                Load+Compile (ms){sortIndicator('load_and_compile_ms')}
              </th>
              <th class="sortable" onclick={() => toggleSort('average_ms')}>
                Avg (ms){sortIndicator('average_ms')}
              </th>
              <th class="sortable" onclick={() => toggleSort('median_ms')}>
                Median (ms){sortIndicator('median_ms')}
              </th>
              <th class="sortable" onclick={() => toggleSort('best_ms')}>
                Best (ms){sortIndicator('best_ms')}
              </th>
              <th class="sortable" onclick={() => toggleSort('p90_ms')}>
                p90 (ms){sortIndicator('p90_ms')}
              </th>
              <th class="sortable" onclick={() => toggleSort('throughput_fps')}>
                Throughput (fps){sortIndicator('throughput_fps')}
              </th>
              <th>GPU</th>
              <th>Browser</th>
            </tr>
          </thead>
          <tbody>
            {#each sortedResults as result}
              <tr>
                <td class="cell-model" title={result.model_id}>
                  {modelName(result.model_id)}
                </td>
                <td><span class="badge">{result.backend}</span></td>
                <td><span class="badge">{result.data_type}</span></td>
                <td class="cell-metric">{result.compilation_ms?.toFixed(1) ?? '—'}</td>
                <td class="cell-metric">{result.load_and_compile_ms?.toFixed(1) ?? '—'}</td>
                <td class="cell-metric">{result.average_ms?.toFixed(1) ?? '—'}</td>
                <td class="cell-metric">{result.median_ms?.toFixed(1) ?? '—'}</td>
                <td class="cell-metric">{result.best_ms?.toFixed(1) ?? '—'}</td>
                <td class="cell-metric">{result.p90_ms?.toFixed(1) ?? '—'}</td>
                <td class="cell-metric">{result.throughput_fps?.toFixed(1) ?? '—'}</td>
                <td class="cell-info">{result.gpu || '—'}</td>
                <td class="cell-info">{result.browser || '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="results-count">
        {sortedResults.length} result{sortedResults.length !== 1 ? 's' : ''}
      </div>
    {/if}
  {/if}
</div>

<style>
  .leaderboard-page {
    max-width: 100%;
  }

  .error-banner {
    padding: var(--space-2);
    border-radius: var(--radius-base);
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-bottom: var(--space-2);
  }

  .filter-select {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    cursor: pointer;
    outline: none;
  }

  .filter-select:focus {
    border-color: var(--color-focus-ring);
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

  .results-table th.sortable {
    cursor: pointer;
    user-select: none;
  }

  .results-table th.sortable:hover {
    color: var(--color-text-primary);
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

  .cell-info {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
  }

  .badge {
    font-size: var(--text-xs);
    padding: 1px 5px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
  }

  .results-count {
    margin-top: var(--space-2);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-align: right;
  }
</style>
