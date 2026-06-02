<script lang="ts">
  import type { ResultRow } from './+page';
  import { getBackendLabel } from '$lib/engine/backends';
  import { browser } from '$app/environment';
  import { auth, isAuthenticated } from '$lib/stores/auth';
  import { goto } from '$app/navigation';

  let { data } = $props();

  $effect(() => {
    if (browser && !$auth.loading && !$isAuthenticated) {
      goto('/login');
    }
  });

  let filterBackend = $state('');
  let filterDataType = $state('');
  let filterStatus = $state('');
  let filterWebnnEp = $state('');
  let filterFramework = $state('');
  let filterQuery = $state('');

  const backends = $derived(data.distinctBackends ?? []);
  const dataTypes = $derived(data.distinctDataTypes ?? []);
  const statuses = $derived(data.distinctStatuses ?? []);
  const webnnEps = $derived(data.distinctWebnnEps ?? []);
  const frameworks = $derived(data.distinctFrameworks ?? []);

  function getFrameworkLabel(r: ResultRow): string {
    if (r.ort_version) return `ORT Web ${r.ort_version}`;
    if (r.litert_version) return `LiteRT.js ${r.litert_version}`;
    return '';
  }

  const filtered = $derived(
    data.results.filter((r: ResultRow) => {
      if (filterBackend && r.backend !== filterBackend) return false;
      if (filterDataType && r.data_type !== filterDataType) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      if (filterWebnnEp && r.webnn_ep !== filterWebnnEp) return false;
      if (filterFramework && getFrameworkLabel(r) !== filterFramework) return false;
      if (filterQuery) {
        const q = filterQuery.toLowerCase();
        if (!r.model_id.toLowerCase().includes(q) && !r.file_path.toLowerCase().includes(q)) return false;
      }
      return true;
    })
  );

  type SortCol = 'model' | 'file' | 'backend' | 'webnn_ep' | 'dtype' | 'status' | 'compilation' | 'load_compile' | 'first_inf' | 'ttf' | 'avg' | 'median' | 'best' | 'p90' | 'fps' | 'started';
  let sortCol = $state<SortCol>('started');
  let sortAsc = $state(false);

  function toggleSort(col: SortCol) {
    if (sortCol === col) sortAsc = !sortAsc;
    else { sortCol = col; sortAsc = col === 'model' || col === 'file'; }
  }

  function sortIndicator(col: SortCol): string {
    if (sortCol !== col) return '';
    return sortAsc ? ' ↑' : ' ↓';
  }

  const sorted = $derived(
    [...filtered].sort((a, b) => {
      let av: any, bv: any;
      switch (sortCol) {
        case 'model': av = a.model_id.toLowerCase(); bv = b.model_id.toLowerCase(); break;
        case 'file': av = a.file_path.toLowerCase(); bv = b.file_path.toLowerCase(); break;
        case 'backend': av = a.backend; bv = b.backend; break;
        case 'webnn_ep': av = a.webnn_ep || ''; bv = b.webnn_ep || ''; break;
        case 'dtype': av = a.data_type; bv = b.data_type; break;
        case 'status': av = a.status; bv = b.status; break;
        case 'compilation': av = a.compilation_ms ?? Infinity; bv = b.compilation_ms ?? Infinity; break;
        case 'load_compile': av = a.load_and_compile_ms ?? Infinity; bv = b.load_and_compile_ms ?? Infinity; break;
        case 'first_inf': av = a.first_inference_ms ?? Infinity; bv = b.first_inference_ms ?? Infinity; break;
        case 'ttf': av = a.time_to_first_ms ?? Infinity; bv = b.time_to_first_ms ?? Infinity; break;
        case 'avg': av = a.average_ms ?? Infinity; bv = b.average_ms ?? Infinity; break;
        case 'median': av = a.median_ms ?? Infinity; bv = b.median_ms ?? Infinity; break;
        case 'best': av = a.best_ms ?? Infinity; bv = b.best_ms ?? Infinity; break;
        case 'p90': av = a.p90_ms ?? Infinity; bv = b.p90_ms ?? Infinity; break;
        case 'fps': av = a.throughput_fps ?? -Infinity; bv = b.throughput_fps ?? -Infinity; break;
        case 'started': av = a.started_at; bv = b.started_at; break;
      }
      if (typeof av === 'string') {
        const cmp = av.localeCompare(bv);
        return sortAsc ? cmp : -cmp;
      }
      return sortAsc ? av - bv : bv - av;
    })
  );

  let currentPage = $state(1);
  const PAGE_SIZE = 20;
  const totalPages = $derived(Math.ceil(sorted.length / PAGE_SIZE));
  const paged = $derived(sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

  $effect(() => { void filterQuery, filterBackend, filterDataType, filterStatus, filterWebnnEp, filterFramework; currentPage = 1; });

  function fmt(val: number | null): string {
    if (val == null) return '—';
    return val < 1 ? val.toFixed(3) : val.toFixed(2);
  }

  function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  let cellCopiedMsg = $state('');
  function copyCell(text: string) {
    navigator.clipboard.writeText(text);
    cellCopiedMsg = 'Copied!';
    setTimeout(() => cellCopiedMsg = '', 1500);
  }
</script>

<div class="results-page">
  <header class="page-header">
    <h1>My Results</h1>
    <p>Your benchmark history. {filtered.length} result{filtered.length !== 1 ? 's' : ''}.</p>
  </header>

  {#if data.error}
    <p class="error-text">{data.error}</p>
  {:else if data.results.length === 0}
    <div class="empty">
      <p>No benchmark results yet. Run a benchmark with "Save results" enabled.</p>
    </div>
  {:else}
    <div class="filters">
      <input class="filter-input" type="text" placeholder="Search model or file..." bind:value={filterQuery} />

      <select class="filter-select" bind:value={filterDataType}>
        <option value="">Data Type</option>
        {#each dataTypes as dt}
          <option value={dt}>{dt}</option>
        {/each}
      </select>

      <select class="filter-select" bind:value={filterBackend}>
        <option value="">Backend</option>
        {#each backends as b}
          <option value={b}>{getBackendLabel(b)}</option>
        {/each}
      </select>

      <select class="filter-select" bind:value={filterWebnnEp}>
        <option value="">WebNN EP</option>
        {#each webnnEps as ep}
          <option value={ep}>{ep}</option>
        {/each}
      </select>

      <select class="filter-select" bind:value={filterFramework}>
        <option value="">JS Framework</option>
        {#each frameworks as fw}
          <option value={fw}>{fw}</option>
        {/each}
      </select>

      <select class="filter-select" bind:value={filterStatus}>
        <option value="">Status</option>
        {#each statuses as s}
          <option value={s}>{s}</option>
        {/each}
      </select>
    </div>

    <div class="table-wrapper">
      <table class="results-table">
        <thead>
          <tr>
            <th class="th-model sortable" onclick={() => toggleSort('model')}>Model{sortIndicator('model')}</th>
            <th class="th-file sortable" onclick={() => toggleSort('file')}>File{sortIndicator('file')}</th>
            <th class="sortable" onclick={() => toggleSort('dtype')}>Type{sortIndicator('dtype')}</th>
            <th class="sortable" onclick={() => toggleSort('backend')}>Backend{sortIndicator('backend')}</th>
            <th class="sortable" onclick={() => toggleSort('webnn_ep')}>WebNN EP{sortIndicator('webnn_ep')}</th>
            <th class="sortable" onclick={() => toggleSort('status')}>Status{sortIndicator('status')}</th>
            <th class="sortable" onclick={() => toggleSort('compilation')}>Compile{sortIndicator('compilation')}</th>
            <th class="sortable" onclick={() => toggleSort('load_compile')}>Load+Compile{sortIndicator('load_compile')}</th>
            <th class="sortable" onclick={() => toggleSort('first_inf')}>1st Inf{sortIndicator('first_inf')}</th>
            <th class="sortable" onclick={() => toggleSort('ttf')}>TTF{sortIndicator('ttf')}</th>
            <th class="sortable" onclick={() => toggleSort('avg')}>Avg{sortIndicator('avg')}</th>
            <th class="sortable" onclick={() => toggleSort('median')}>Median{sortIndicator('median')}</th>
            <th class="sortable" onclick={() => toggleSort('best')}>Best{sortIndicator('best')}</th>
            <th class="sortable" onclick={() => toggleSort('p90')}>P90{sortIndicator('p90')}</th>
            <th class="sortable" onclick={() => toggleSort('fps')}>FPS{sortIndicator('fps')}</th>
            <th class="sortable" onclick={() => toggleSort('started')}>Date{sortIndicator('started')}</th>
          </tr>
        </thead>
        <tbody>
          {#each paged as row}
            <tr>
              <td class="cell-model cell-copy" title="Click to copy: {row.model_id}" onclick={() => copyCell(row.model_id)}>{row.model_id}</td>
              <td class="cell-file"><a href="/results/{row.id}" class="cell-link" title={row.file_path}>{row.file_path}</a></td>
              <td><span class="badge">{row.data_type}</span></td>
              <td><span class="badge">{getBackendLabel(row.backend)}</span></td>
              <td class="cell-ep">{row.webnn_ep || '—'}</td>
              <td><span class="status-dot" class:status-ok={row.status === 'completed'} class:status-error={row.status === 'error'} class:status-running={row.status === 'running'} title={row.error_message || row.status}></span></td>
              <td class="cell-metric">{fmt(row.compilation_ms)}</td>
              <td class="cell-metric">{fmt(row.load_and_compile_ms)}</td>
              <td class="cell-metric">{fmt(row.first_inference_ms)}</td>
              <td class="cell-metric">{fmt(row.time_to_first_ms)}</td>
              <td class="cell-metric">{fmt(row.average_ms)}</td>
              <td class="cell-metric">{fmt(row.median_ms)}</td>
              <td class="cell-metric">{fmt(row.best_ms)}</td>
              <td class="cell-metric">{fmt(row.p90_ms)}</td>
              <td class="cell-metric">{fmt(row.throughput_fps)}</td>
              <td class="cell-date">{fmtDate(row.started_at)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if totalPages > 1}
      <div class="pagination">
        <button class="page-btn" disabled={currentPage === 1} onclick={() => currentPage--}>Prev</button>
        <span class="page-info">{currentPage}/{totalPages}</span>
        <button class="page-btn" disabled={currentPage === totalPages} onclick={() => currentPage++}>Next</button>
      </div>
    {/if}
  {/if}
</div>

{#if cellCopiedMsg}
  <div class="copy-toast">{cellCopiedMsg}</div>
{/if}

<style>
  .results-page {
    max-width: 100%;
  }

  .page-header {
    margin-bottom: var(--space-3);
  }

  .page-header h1 {
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text-primary);
    margin-bottom: var(--space-half);
  }

  .page-header p {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-bottom: var(--space-2);
  }

  .filter-input {
    min-width: 200px;
    padding: var(--space-1) var(--space-2);
  }

  .filter-select {
    min-width: 140px;
    height: auto;
    padding: var(--space-1) var(--space-2);
    cursor: pointer;
  }

  .empty {
    text-align: center;
    padding: var(--space-4);
    color: var(--color-text-muted);
  }

  .table-wrapper {
    overflow-x: auto;
  }

  .results-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-xs);
    font-family: var(--font-mono);
  }

  .results-table th {
    font-family: var(--font-ui);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted);
    padding: var(--space-1) var(--space-1);
    border-bottom: 1px solid var(--color-border);
    text-align: center;
    white-space: nowrap;
  }

  .th-model, .th-file {
    text-align: left;
    max-width: 10vw;
    width: 10vw;
  }

  .sortable {
    cursor: pointer;
    user-select: none;
  }

  .sortable:hover {
    color: var(--color-text-primary);
  }

  .results-table td {
    padding: var(--space-1) var(--space-1);
    border-bottom: 1px solid var(--color-border);
    text-align: center;
    white-space: nowrap;
  }

  .results-table tbody tr:hover {
    background: var(--color-nav-item-hover);
  }

  .cell-model, .cell-file {
    text-align: left;
    max-width: 10vw;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cell-copy {
    cursor: pointer;
  }

  .cell-copy:hover {
    color: var(--color-primary);
  }

  .cell-link {
    color: inherit;
    text-decoration: none;
  }

  .cell-link:hover {
    color: var(--color-primary);
  }

  .cell-ep {
    font-family: var(--font-ui);
    font-size: 10px;
    color: var(--color-text-muted);
  }

  .cell-metric {
    font-variant-numeric: tabular-nums;
  }

  .cell-date {
    font-family: var(--font-ui);
    font-size: 10px;
    color: var(--color-text-muted);
  }

  .badge {
    font-family: var(--font-ui);
    font-size: 10px;
    padding: 1px 5px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
  }

  .status-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-text-muted);
  }

  .status-ok { background: #16a34a; }
  .status-error { background: var(--color-error); }
  .status-running { background: var(--color-primary); }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .page-btn {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    padding: 4px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
  }

  .page-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-btn:not(:disabled):hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .page-info {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .error-text {
    color: var(--color-error);
    font-size: var(--text-sm);
  }

  .copy-toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    padding: 6px 16px;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    color: var(--color-primary);
    box-shadow: var(--shadow-dropdown);
    z-index: 9999;
  }

  @media (max-width: 768px) {
    .filters {
      flex-direction: column;
    }

    .filter-select, .filter-input {
      width: 100%;
    }
  }
</style>
