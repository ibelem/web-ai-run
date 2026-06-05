<script lang="ts">
  import { createClient } from '$lib/supabase/client';
  import { browser } from '$app/environment';
  import type { PageData } from './$types';
  import type { ResultsLlmRow } from '$lib/engine/types';

  let { data }: { data: PageData } = $props();

  const supabase = createClient();

  const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000];

  // Filters
  let filterModel       = $state('');
  let filterBackend     = $state('');
  let filterDtype       = $state('');
  let filterFramework   = $state('');
  let filterStatus      = $state('');
  let filterWebnnEp     = $state('');
  let filterOs          = $state('');
  let filterBrowser     = $state('');
  let filterBrowserVer  = $state('');
  let filterCpu         = $state('');
  let filterGpu         = $state('');
  let filterGpuDriver   = $state('');
  let filterNpuDriver   = $state('');

  function frameworkLabel(r: ResultsLlmRow): string {
    if (!r.runtime) return '';
    return r.runtime_version ? `${r.runtime} ${r.runtime_version}` : r.runtime;
  }

  // Pagination
  let pageSize    = $state(20);
  let currentPage = $state(1);

  $effect(() => {
    void filterModel, filterBackend, filterDtype, filterFramework, filterStatus, filterWebnnEp,
         filterOs, filterBrowser, filterBrowserVer, filterCpu, filterGpu,
         filterGpuDriver, filterNpuDriver, pageSize;
    currentPage = 1;
  });

  // Selection
  let selected = $state(new Set<string>());
  let deleting  = $state(false);
  let deleteError = $state('');

  let cellCopiedMsg = $state('');

  const filtered = $derived(() => {
    let rows: ResultsLlmRow[] = data.results ?? [];
    if (filterModel)      rows = rows.filter(r => r.hf_model_id.toLowerCase().includes(filterModel.toLowerCase()));
    if (filterBackend)    rows = rows.filter(r => r.backend === filterBackend);
    if (filterDtype)      rows = rows.filter(r => r.data_type === filterDtype);
    if (filterFramework)  rows = rows.filter(r => frameworkLabel(r) === filterFramework);
    if (filterStatus)     rows = rows.filter(r => r.status === filterStatus);
    if (filterWebnnEp)    rows = rows.filter(r => r.webnn_ep === filterWebnnEp);
    if (filterOs)         rows = rows.filter(r => r.os === filterOs);
    if (filterBrowser)    rows = rows.filter(r => r.browser === filterBrowser);
    if (filterBrowserVer) rows = rows.filter(r => r.browser_version === filterBrowserVer);
    if (filterCpu)        rows = rows.filter(r => r.cpu === filterCpu);
    if (filterGpu)        rows = rows.filter(r => r.gpu === filterGpu);
    if (filterGpuDriver)  rows = rows.filter(r => r.gpu_driver_version === filterGpuDriver);
    if (filterNpuDriver)  rows = rows.filter(r => r.npu_driver_version === filterNpuDriver);
    return rows;
  });

  const totalPages = $derived(Math.max(1, Math.ceil(filtered().length / pageSize)));
  const paged      = $derived(filtered().slice((currentPage - 1) * pageSize, currentPage * pageSize));

  function toggleAll() {
    if (paged.every(r => selected.has(r.id))) {
      paged.forEach(r => selected.delete(r.id));
    } else {
      paged.forEach(r => selected.add(r.id));
    }
    selected = new Set(selected);
  }

  function toggleRow(id: string) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    selected = new Set(selected);
  }

  async function deleteSelected() {
    if (selected.size === 0 || !confirm(`Delete ${selected.size} result(s)?`)) return;
    deleting = true; deleteError = '';
    const ids = [...selected];
    const { error } = await (supabase.from('results_llm') as any).delete().in('id', ids);
    if (error) { deleteError = error.message; deleting = false; return; }
    data.results = data.results.filter((r: ResultsLlmRow) => !selected.has(r.id));
    selected = new Set();
    deleting = false;
  }

  async function copyCell(text: string) {
    await navigator.clipboard.writeText(text);
    cellCopiedMsg = 'Copied!';
    setTimeout(() => { cellCopiedMsg = ''; }, 1500);
  }

  function fmt(n: number | null | undefined, digits = 0, unit = '') {
    if (n == null || isNaN(n as number)) return '—';
    return (n as number).toFixed(digits) + unit;
  }

  function fmtDate(s: string | null) {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const allChecked = $derived(paged.length > 0 && paged.every(r => selected.has(r.id)));

  // Optional columns — user can show/hide, persisted to localStorage
  type OptColKey =
    | 'dtype' | 'runtime' | 'backend' | 'status'
    | 'ttft' | 'tps' | 'tpot' | 'e2e' | 'e2e_tps' | 'tokens' | 'compile'
    | 'webnn_ep' | 'prompt_tokens' | 'max_new_tokens' | 'runs' | 'runtime_version'
    | 'os' | 'browser' | 'browser_ver' | 'cpu' | 'gpu' | 'gpu_driver' | 'npu_driver';

  interface OptCol { key: OptColKey; label: string; defaultVisible: boolean; }

  const OPTIONAL_COLS: OptCol[] = [
    // Default-on
    { key: 'dtype',           label: 'Dtype',           defaultVisible: true  },
    { key: 'runtime',         label: 'Runtime',         defaultVisible: true  },
    { key: 'backend',         label: 'Backend',         defaultVisible: true  },
    { key: 'status',          label: 'Status',          defaultVisible: true  },
    { key: 'ttft',            label: 'TTFT',            defaultVisible: true  },
    { key: 'tps',             label: 'TPS',             defaultVisible: true  },
    { key: 'tpot',            label: 'TPOT',            defaultVisible: true  },
    { key: 'e2e',             label: 'E2E',             defaultVisible: true  },
    { key: 'e2e_tps',         label: 'E2E TPS',         defaultVisible: true  },
    { key: 'tokens',          label: 'Tokens',          defaultVisible: true  },
    { key: 'compile',         label: 'Compile',         defaultVisible: true  },
    // Default-off
    { key: 'webnn_ep',        label: 'WebNN EP',        defaultVisible: false },
    { key: 'prompt_tokens',   label: 'Prompt Tokens',   defaultVisible: false },
    { key: 'max_new_tokens',  label: 'Max New Tokens',  defaultVisible: false },
    { key: 'runs',            label: 'Runs',            defaultVisible: false },
    { key: 'runtime_version', label: 'Runtime Version', defaultVisible: false },
    { key: 'os',              label: 'OS',              defaultVisible: true  },
    { key: 'browser',         label: 'Browser',         defaultVisible: true  },
    { key: 'browser_ver',     label: 'Browser Version', defaultVisible: false },
    { key: 'cpu',             label: 'CPU',             defaultVisible: false },
    { key: 'gpu',             label: 'GPU',             defaultVisible: false },
    { key: 'gpu_driver',      label: 'GPU Driver',      defaultVisible: false },
    { key: 'npu_driver',      label: 'NPU Driver',      defaultVisible: false },
  ];

  const LS_KEY = 'results_llm_visible_cols_v1';

  function loadVisibleCols(): Set<OptColKey> {
    const defaults = new Set(OPTIONAL_COLS.filter(c => c.defaultVisible).map(c => c.key));
    if (!browser) return defaults;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw !== null) return new Set(JSON.parse(raw) as OptColKey[]);
    } catch {}
    localStorage.setItem(LS_KEY, JSON.stringify([...defaults]));
    return defaults;
  }

  let visibleCols = $state<Set<OptColKey>>(loadVisibleCols());

  function toggleCol(key: OptColKey) {
    const next = new Set(visibleCols);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    visibleCols = next;
    if (browser) localStorage.setItem(LS_KEY, JSON.stringify([...next]));
  }

  function isVisible(key: OptColKey): boolean {
    return visibleCols.has(key);
  }

  let colPickerOpen = $state(false);
  let colPickerEl = $state<HTMLDivElement | null>(null);

  $effect(() => {
    if (!browser || !colPickerOpen) return;
    function onOutside(e: MouseEvent) {
      if (colPickerEl && !colPickerEl.contains(e.target as Node)) colPickerOpen = false;
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  });
</script>

<div class="results-page">
  <header class="page-header">
    <h1>My Results</h1>
    <p>Your LLM benchmark history. {(data.results ?? []).length} result{(data.results ?? []).length !== 1 ? 's' : ''}.</p>
  </header>

  {#if data.error}
    <p class="error-text">{data.error}</p>
  {/if}

  <div class="filters">
    <input class="filter-input" type="search" placeholder="Search model…" bind:value={filterModel} />
    <select class="filter-select" bind:value={filterBackend}>
      <option value="">Backends</option>
      {#each (data.distinctBackends ?? []) as b}<option value={b}>{b}</option>{/each}
    </select>
    <select class="filter-select" bind:value={filterDtype}>
      <option value="">Data Type</option>
      {#each (data.distinctDataTypes ?? []) as d}<option value={d}>{d}</option>{/each}
    </select>
    <select class="filter-select" bind:value={filterFramework}>
      <option value="">JS Framework</option>
      {#each (data.distinctFrameworks ?? []) as r}<option value={r}>{r}</option>{/each}
    </select>
    <select class="filter-select" bind:value={filterWebnnEp}>
      <option value="">WebNN EP</option>
      {#each (data.distinctWebnnEps ?? []) as ep}<option value={ep}>{ep}</option>{/each}
    </select>
    <select class="filter-select" bind:value={filterStatus}>
      <option value="">Status</option>
      {#each (data.distinctStatuses ?? []) as s}<option value={s}>{s}</option>{/each}
    </select>

    <div class="filters-actions">
      <div class="col-picker-wrap" bind:this={colPickerEl}>
        <button class="col-picker-btn" onclick={() => colPickerOpen = !colPickerOpen}>
          Columns {visibleCols.size > 0 ? `(+${visibleCols.size})` : ''}
        </button>
        {#if colPickerOpen}
          <div class="col-picker-dropdown">
            {#each OPTIONAL_COLS as col}
              <label class="col-picker-item">
                <input
                  type="checkbox"
                  class="row-check"
                  checked={isVisible(col.key)}
                  onchange={() => toggleCol(col.key)}
                />
                {col.label}
              </label>
            {/each}
          </div>
        {/if}
      </div>

      {#if selected.size > 0}
        <button class="delete-btn" onclick={deleteSelected} disabled={deleting}>
          {deleting ? 'Deleting…' : `Delete ${selected.size}`}
        </button>
      {/if}
    </div>
  </div>

  {#if deleteError}
    <p class="delete-error">{deleteError}</p>
  {/if}

  {#if filtered().length > 0}
    <div class="table-wrap">
      <table class="results-table">
        <thead>
          <tr>
            <th class="th-check">
              <input type="checkbox" class="row-check" checked={allChecked} onchange={toggleAll} />
            </th>
            <th class="th-model">Model</th>
            {#if isVisible('dtype')}<th>Dtype</th>{/if}
            {#if isVisible('runtime')}<th>Runtime</th>{/if}
            {#if isVisible('backend')}<th>Backend</th>{/if}
            {#if isVisible('status')}<th>Status</th>{/if}
            {#if isVisible('ttft')}<th title="Time To First Token (prefill latency). Lower is better. Time from generate() call to the first decoded token, in ms.">TTFT</th>{/if}
            {#if isVisible('tps')}<th title="Decode throughput = (output_tokens − 1) / (e2e − ttft). Higher is better. Steady-state token generation rate in tok/s.">TPS</th>{/if}
            {#if isVisible('tpot')}<th title="Time Per Output Token = (e2e − ttft) / (output_tokens − 1). Lower is better. Average per-token decode latency in ms.">TPOT</th>{/if}
            {#if isVisible('e2e')}<th title="End-to-End wall-clock time from generate() call to the last token. Lower is better. Includes prefill + decode, in ms.">E2E</th>{/if}
            {#if isVisible('e2e_tps')}<th title="End-to-End throughput = output_tokens / e2e. Higher is better. Effective tok/s including prefill cost.">E2E TPS</th>{/if}
            {#if isVisible('tokens')}<th title="Number of output tokens generated in this run.">Tokens</th>{/if}
            {#if isVisible('compile')}<th title="Initial model compilation/load-and-compile time, in ms. One-time cost per session.">Compile</th>{/if}
            {#if isVisible('webnn_ep')}<th>WebNN EP</th>{/if}
            {#if isVisible('prompt_tokens')}<th>Prompt Tokens</th>{/if}
            {#if isVisible('max_new_tokens')}<th>Max New</th>{/if}
            {#if isVisible('runs')}<th>Runs</th>{/if}
            {#if isVisible('runtime_version')}<th>Runtime Ver</th>{/if}
            {#if isVisible('os')}<th>OS</th>{/if}
            {#if isVisible('browser')}<th>Browser</th>{/if}
            {#if isVisible('browser_ver')}<th>Browser Ver</th>{/if}
            {#if isVisible('cpu')}<th>CPU</th>{/if}
            {#if isVisible('gpu')}<th>GPU</th>{/if}
            {#if isVisible('gpu_driver')}<th>GPU Driver</th>{/if}
            {#if isVisible('npu_driver')}<th>NPU Driver</th>{/if}
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {#each paged as r (r.id)}
            <tr class:row-selected={selected.has(r.id)}>
              <td class="cell-check">
                <input type="checkbox" class="row-check" checked={selected.has(r.id)} onchange={() => toggleRow(r.id)} />
              </td>
              <td class="cell-model" title={r.hf_model_id}>
                <span class="cell-copy" onclick={() => copyCell(r.hf_model_id)} title="Copy">{r.hf_model_id}</span>
              </td>
              {#if isVisible('dtype')}<td><span class="dtype-chip" data-dtype={r.data_type}>{r.data_type}</span></td>{/if}
              {#if isVisible('runtime')}<td class="cell-opt">{r.runtime}</td>{/if}
              {#if isVisible('backend')}<td class="cell-opt">{r.backend}</td>{/if}
              {#if isVisible('status')}
                <td class="cell-status" class:cell-error={r.status === 'error'} title={r.error_message ?? ''}>
                  {r.status}{r.error_phase ? ` [${r.error_phase}]` : ''}
                </td>
              {/if}
              {#if isVisible('ttft')}<td class="cell-metric">{fmt(r.ttft_ms, 0, 'ms')}</td>{/if}
              {#if isVisible('tps')}<td class="cell-metric">{fmt(r.tps, 1, 'tok/s')}</td>{/if}
              {#if isVisible('tpot')}<td class="cell-metric">{fmt(r.tpot_ms, 1, 'ms')}</td>{/if}
              {#if isVisible('e2e')}<td class="cell-metric">{fmt(r.e2e_ms, 0, 'ms')}</td>{/if}
              {#if isVisible('e2e_tps')}<td class="cell-metric">{fmt(r.e2e_tps, 1, 'tok/s')}</td>{/if}
              {#if isVisible('tokens')}<td class="cell-metric">{r.output_tokens ?? '—'}</td>{/if}
              {#if isVisible('compile')}<td class="cell-metric">{fmt(r.compilation_ms, 0, 'ms')}</td>{/if}
              {#if isVisible('webnn_ep')}<td class="cell-opt">{r.webnn_ep ?? '—'}</td>{/if}
              {#if isVisible('prompt_tokens')}<td class="cell-metric">{r.prompt_tokens ?? '—'}</td>{/if}
              {#if isVisible('max_new_tokens')}<td class="cell-metric">{r.max_new_tokens ?? '—'}</td>{/if}
              {#if isVisible('runs')}<td class="cell-metric">{r.runs ?? '—'}</td>{/if}
              {#if isVisible('runtime_version')}<td class="cell-opt">{r.runtime_version ?? '—'}</td>{/if}
              {#if isVisible('os')}<td class="cell-opt">{r.os ?? '—'}</td>{/if}
              {#if isVisible('browser')}<td class="cell-opt">{r.browser ?? '—'}</td>{/if}
              {#if isVisible('browser_ver')}<td class="cell-opt">{r.browser_version ?? '—'}</td>{/if}
              {#if isVisible('cpu')}<td class="cell-opt cell-opt-long" title={r.cpu ?? ''}>{r.cpu ?? '—'}</td>{/if}
              {#if isVisible('gpu')}<td class="cell-opt cell-opt-long" title={r.gpu ?? ''}>{r.gpu ?? '—'}</td>{/if}
              {#if isVisible('gpu_driver')}<td class="cell-opt">{r.gpu_driver_version ?? '—'}</td>{/if}
              {#if isVisible('npu_driver')}<td class="cell-opt">{r.npu_driver_version ?? '—'}</td>{/if}
              <td class="cell-date">{fmtDate(r.completed_at)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

  {:else}
    <div class="empty"><p>{(data.results ?? []).length === 0 ? 'No LLM results yet. Run a benchmark from /run-llm to see results here.' : 'No results match the current filters.'}</p></div>
  {/if}

  <div class="env-filters">
    <select class="filter-select" bind:value={filterOs}>
      <option value="">OS</option>
      {#each (data.distinctOs ?? []) as v}<option value={v}>{v}</option>{/each}
    </select>
    <select class="filter-select" bind:value={filterBrowser}>
      <option value="">Browser</option>
      {#each (data.distinctBrowsers ?? []) as v}<option value={v}>{v}</option>{/each}
    </select>
    <select class="filter-select" bind:value={filterBrowserVer}>
      <option value="">Browser Version</option>
      {#each (data.distinctBrowserVers ?? []) as v}<option value={v}>{v}</option>{/each}
    </select>
    <select class="filter-select filter-select-wide" bind:value={filterCpu}>
      <option value="">CPU</option>
      {#each (data.distinctCpus ?? []) as v}<option value={v}>{v}</option>{/each}
    </select>
    <select class="filter-select filter-select-wide" bind:value={filterGpu}>
      <option value="">GPU</option>
      {#each (data.distinctGpus ?? []) as v}<option value={v}>{v}</option>{/each}
    </select>
    <select class="filter-select" bind:value={filterGpuDriver}>
      <option value="">GPU Driver</option>
      {#each (data.distinctGpuDrivers ?? []) as v}<option value={v}>{v}</option>{/each}
    </select>
    <select class="filter-select" bind:value={filterNpuDriver}>
      <option value="">NPU Driver</option>
      {#each (data.distinctNpuDrivers ?? []) as v}<option value={v}>{v}</option>{/each}
    </select>
  </div>

  {#if filtered().length > 0}
    <div class="table-footer">
      <div class="footer-left">
        <span class="footer-count">{filtered().length} result{filtered().length !== 1 ? 's' : ''}</span>
      </div>
      <div class="footer-center">
        {#if totalPages > 1}
          <button class="page-btn" disabled={currentPage === 1} onclick={() => currentPage--}>Prev</button>
          <span class="page-info">{currentPage}/{totalPages}</span>
          <button class="page-btn" disabled={currentPage === totalPages} onclick={() => currentPage++}>Next</button>
        {/if}
      </div>
      <div class="footer-right">
        <span class="rows-label">Rows</span>
        <select class="rows-select" bind:value={pageSize}>
          {#each PAGE_SIZE_OPTIONS as n}<option value={n}>{n}</option>{/each}
        </select>
      </div>
    </div>
  {/if}
</div>

{#if cellCopiedMsg}
  <div class="copy-toast">{cellCopiedMsg}</div>
{/if}

<style>
  .results-page { max-width: 100%; }

  .page-header { margin-bottom: var(--space-3); }

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

  .page-header a { color: var(--color-primary); }

  .error-text { color: var(--color-error); font-size: var(--text-sm); margin-bottom: var(--space-2); }

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

  .filter-select-wide { min-width: 220px; }

  .env-filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: var(--space-1);
    padding-top: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .filters-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  /* ── Column picker ────────────────────────────────────── */
  .col-picker-wrap { position: relative; }

  .col-picker-btn {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    white-space: nowrap;
    transition: border-color var(--transition-base), color var(--transition-base);
  }

  .col-picker-btn:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .col-picker-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    box-shadow: var(--shadow-dropdown);
    padding: var(--space-1) 0;
    min-width: 160px;
    z-index: 100;
  }

  .col-picker-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px var(--space-2);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    cursor: pointer;
    user-select: none;
  }

  .col-picker-item:hover {
    background: var(--color-nav-item-hover);
    color: var(--color-text-primary);
  }

  .cell-opt-long {
    max-width: 12vw;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .delete-btn {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-error);
    border-radius: var(--radius-base);
    background-color: transparent;
    color: var(--color-error);
    cursor: pointer;
    white-space: nowrap;
  }

  .delete-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-error) 100%, black);
    color: white;
  }

  .delete-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .delete-error { font-size: var(--text-xs); color: var(--color-error); margin-bottom: var(--space-1); }

  .table-wrap { overflow-x: auto; }

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
    padding: var(--space-1);
    border-bottom: 1px solid var(--color-border);
    text-align: center;
    white-space: nowrap;
  }

  .th-check { width: 28px; padding: var(--space-1) 6px !important; }
  .th-model { text-align: left; max-width: 12vw; width: 12vw; }

  .results-table td {
    padding: 1px var(--space-1);
    border-bottom: 1px solid var(--color-border);
    text-align: center;
    white-space: nowrap;
  }

  .results-table tbody tr:hover { background: var(--color-nav-item-hover); }
  .results-table tbody tr.row-selected { background: var(--color-accent-light); }

  .cell-check { padding: 0 6px !important; width: 28px; }

  .row-check {
    cursor: pointer;
    accent-color: var(--color-primary);
    width: 14px;
    height: 14px;
  }

  .cell-model {
    text-align: left;
    max-width: 12vw;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cell-copy {
    cursor: pointer;
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color var(--transition-base);
  }

  .cell-copy:hover { color: var(--color-primary); }

  .cell-metric { font-variant-numeric: tabular-nums; }
  
  .cell-error { color: var(--color-error); }

  .cell-date {
    font-family: var(--font-ui);
    font-size: 10px;
    color: var(--color-text-muted);
  }

  .empty p {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    padding: var(--space-4) 0;
  }

  /* Table footer — identical to results/+page.svelte */
  .table-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-top: var(--space-2);
    flex-wrap: wrap;
  }

  .footer-left { display: flex; align-items: center; gap: var(--space-1); min-width: 120px; }
  .footer-center { display: flex; align-items: center; gap: var(--space-2); }
  .footer-right { display: flex; align-items: center; gap: var(--space-1); min-width: 120px; justify-content: flex-end; }

  .footer-count { font-size: var(--text-xs); color: var(--color-text-muted); }

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

  .page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .page-btn:not(:disabled):hover { border-color: var(--color-primary); color: var(--color-primary); }

  .page-info { font-size: var(--text-xs); color: var(--color-text-muted); }

  .rows-label { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--color-text-muted); }

  .rows-select {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    padding: 3px 6px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    min-width: 60px;
  }

  .rows-select:hover { border-color: var(--color-primary); color: var(--color-primary); }

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
    .filters { flex-direction: column; }
    .filter-select, .filter-input { min-width: 0; width: 100%; }
    .filters-actions { margin-left: 0; }
    .table-footer { flex-direction: column; align-items: flex-start; }
    .footer-right { min-width: 0; justify-content: flex-start; }
  }
</style>
