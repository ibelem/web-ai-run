<script lang="ts">
  import type { LeaderboardRow } from './+page.ts';
  import { getBackendLabel } from '$lib/engine/backends';

  let { data } = $props();

  let filterModel = $state('');
  let filterBackend = $state('');
  let filterDataType = $state('');
  let filterFramework = $state('');
  let filterWebnnEp = $state('');
  let filterDateFrom = $state('');
  let filterDateTo = $state('');
  let groupByHardware = $state(false);
  let showAllColumns = $state(false);
  let sortColumn = $state<string>('average_ms');
  let sortAscending = $state(true);

  const models = $derived(
    [...new Set(data.results.map((r: LeaderboardRow) => r.model_id))].sort()
  );

  const backends = $derived(
    [...new Set(data.results.map((r: LeaderboardRow) => r.backend))].sort()
  );

  const DTYPE_ORDER = ['fp32', 'fp16', 'bf16', 'fp8', 'int8', 'uint8', 'int4', 'uint4', 'q4'];
  const dataTypes = $derived(
    [...new Set([...DTYPE_ORDER, ...data.results.map((r: LeaderboardRow) => r.data_type)])]
      .filter(dt => DTYPE_ORDER.includes(dt) || data.results.some((r: LeaderboardRow) => r.data_type === dt))
      .sort((a: string, b: string) => {
        const ai = DTYPE_ORDER.indexOf(a), bi = DTYPE_ORDER.indexOf(b);
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        return a.localeCompare(b);
      })
  );

  function getFrameworkLabel(r: LeaderboardRow): string {
    if (r.ort_version) return `ORT ${r.ort_version}`;
    if (r.litert_version) return `LiteRT ${r.litert_version}`;
    return '';
  }

  const frameworks = $derived(
    [...new Set(data.results.map((r: LeaderboardRow) => getFrameworkLabel(r)).filter(Boolean))].sort()
  );

  const webnnEps = $derived(
    [...new Set(data.results.map((r: LeaderboardRow) => r.webnn_ep).filter(Boolean))].sort()
  );

  const filteredResults = $derived(
    data.results.filter((r: LeaderboardRow) => {
      if (filterModel && r.model_id !== filterModel) return false;
      if (filterBackend && r.backend !== filterBackend) return false;
      if (filterDataType && r.data_type !== filterDataType) return false;
      if (filterFramework && getFrameworkLabel(r) !== filterFramework) return false;
      if (filterWebnnEp && r.webnn_ep !== filterWebnnEp) return false;
      if (filterDateFrom && r.started_at < filterDateFrom) return false;
      if (filterDateTo && r.started_at > filterDateTo + 'T23:59:59') return false;
      return true;
    })
  );

  type GroupedRow = LeaderboardRow & { rowCount: number };

  const groupedResults = $derived((): GroupedRow[] => {
    if (!groupByHardware) return filteredResults.map((r) => ({ ...r, rowCount: 1 }));
    const map = new Map<string, { rows: LeaderboardRow[]; count: number }>();
    for (const r of filteredResults) {
      const key = `${r.model_id}::${r.file_path}::${r.backend}::${r.data_type}::${r.gpu || ''}::${r.cpu || ''}`;
      const entry = map.get(key);
      if (entry) {
        entry.rows.push(r);
        entry.count++;
      } else {
        map.set(key, { rows: [r], count: 1 });
      }
    }
    return [...map.values()].map(({ rows, count }) => {
      const nums = (field: keyof LeaderboardRow) =>
        rows.map((r) => r[field] as number | null).filter((v): v is number => v !== null);
      const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
      return {
        ...rows[0],
        compilation_ms: avg(nums('compilation_ms')),
        load_and_compile_ms: avg(nums('load_and_compile_ms')),
        first_inference_ms: avg(nums('first_inference_ms')),
        time_to_first_ms: avg(nums('time_to_first_ms')),
        average_ms: avg(nums('average_ms')),
        median_ms: avg(nums('median_ms')),
        best_ms: avg(nums('best_ms')),
        p90_ms: avg(nums('p90_ms')),
        throughput_fps: avg(nums('throughput_fps')),
        rowCount: count,
      };
    });
  });

  const sortedResults = $derived(
    [...groupedResults()].sort((a: GroupedRow, b: GroupedRow) => {
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

  function clearDateFilters() {
    filterDateFrom = '';
    filterDateTo = '';
  }

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
    min-width: 180px;
    height: auto;
    padding: var(--space-1) var(--space-2);
    cursor: pointer;
  }

  .filter-select:focus-visible {
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
    text-align: center;
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
    text-align: center;
  }

  .results-table tbody tr:hover {
    background: var(--color-nav-item-hover);
  }

  .cell-model,
  .cell-path {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    max-width: 10vw;
    width: 10vw;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell-path {
    color: var(--color-text-muted);
  }

  .cell-metric {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }

  .cell-info {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
  }

  .badge {
    font-size: var(--text-xs);
    padding: 1px 7px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
  }

  .results-count {
    margin-top: var(--space-2);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-align: right;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-1);
  }

  .results-count-note {
    color: var(--color-text-muted);
    font-style: italic;
  }

  .date-range {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .filter-date {
    padding: var(--space-1);
    cursor: pointer;
    width: 130px;
  }

  .filter-date:focus-visible {
    border-color: var(--color-focus-ring);
  }

  .date-sep {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .clear-dates {
    font-size: var(--text-sm);
    width: 22px;
    height: 22px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .clear-dates:hover {
    background: var(--color-surface-sunken);
    color: var(--color-text-primary);
  }

  .group-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
  }

  .group-toggle input[type="checkbox"] {
    cursor: pointer;
  }

  .row-count {
    font-size: 10px;
    color: var(--color-text-muted);
    margin-left: 4px;
  }

  @media (max-width: 768px) {
    .filters {
      flex-direction: column;
    }

    .filter-select {
      width: 100%;
    }

    .date-range {
      width: 100%;
    }

    .filter-date {
      flex: 1;
      width: auto;
    }

    .results-table-wrapper {
      margin: 0 calc(-1 * var(--space-2));
      padding: 0 var(--space-2);
    }

    .results-table {
      font-size: var(--text-xs);
    }

    .results-table th,
    .results-table td {
      padding: var(--space-half) 6px;
    }

    .cell-model {
      max-width: 120px;
    }
  }
</style>
