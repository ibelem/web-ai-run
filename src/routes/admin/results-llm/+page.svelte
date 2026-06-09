<script lang="ts">
  import type { AdminResultsLlmRow, UserProfile } from './+page.server';
  import { browser } from '$app/environment';
  import { createClient } from '$lib/supabase/client';

  let { data } = $props();

  const sp = browser ? new URL(location.href).searchParams : new URLSearchParams();
  let filterUser      = $state(sp.get('user')    ?? '');
  let filterBackend   = $state(sp.get('backend') ?? '');
  let filterDataType  = $state(sp.get('dtype')   ?? '');
  let filterRuntime   = $state(sp.get('runtime') ?? '');
  let filterStatus    = $state(sp.get('status')  ?? '');
  let filterQuery     = $state(sp.get('q')       ?? '');
  let filterOs        = $state(sp.get('os')      ?? '');
  let filterBrowser   = $state(sp.get('br')      ?? '');
  let filterBrowserVer = $state(sp.get('brv')    ?? '');
  let filterCpu       = $state(sp.get('cpu')     ?? '');
  let filterGpu       = $state(sp.get('gpu')     ?? '');
  let filterWebnnEp   = $state(sp.get('ep')      ?? '');
  let filterGpuDriver = $state(sp.get('gpudrv')  ?? '');
  let filterNpuDriver = $state(sp.get('npudrv')  ?? '');

  $effect(() => {
    if (!browser) return;
    const params = new URLSearchParams();
    if (filterUser)       params.set('user',    filterUser);
    if (filterQuery)      params.set('q',       filterQuery);
    if (filterDataType)   params.set('dtype',   filterDataType);
    if (filterBackend)    params.set('backend', filterBackend);
    if (filterRuntime)    params.set('runtime', filterRuntime);
    if (filterStatus)     params.set('status',  filterStatus);
    if (filterOs)         params.set('os',      filterOs);
    if (filterBrowser)    params.set('br',      filterBrowser);
    if (filterBrowserVer) params.set('brv',     filterBrowserVer);
    if (filterCpu)        params.set('cpu',     filterCpu);
    if (filterGpu)        params.set('gpu',     filterGpu);
    if (filterWebnnEp)    params.set('ep',      filterWebnnEp);
    if (filterGpuDriver)  params.set('gpudrv',  filterGpuDriver);
    if (filterNpuDriver)  params.set('npudrv',  filterNpuDriver);
    const qs = params.toString();
    history.replaceState(history.state, '', qs ? `?${qs}` : location.pathname);
  });

  const backends  = $derived(data.distinctBackends  ?? []);
  const dataTypes = $derived(data.distinctDataTypes ?? []);
  const runtimes  = $derived(data.distinctRuntimes  ?? []);
  const statuses  = $derived(data.distinctStatuses  ?? []);
  const distinctOs          = $derived(data.distinctOs          ?? []);
  const distinctBrowsers    = $derived(data.distinctBrowsers    ?? []);
  const distinctBrowserVers = $derived(data.distinctBrowserVers ?? []);
  const distinctCpus        = $derived(data.distinctCpus        ?? []);
  const distinctGpus        = $derived(data.distinctGpus        ?? []);
  const distinctWebnnEps    = $derived(data.distinctWebnnEps    ?? []);
  const distinctGpuDrivers  = $derived(data.distinctGpuDrivers  ?? []);
  const distinctNpuDrivers  = $derived(data.distinctNpuDrivers  ?? []);
  const users               = $derived((data.users ?? []) as UserProfile[]);

  const filtered = $derived(
    (data.results as AdminResultsLlmRow[]).filter(r => {
      if (filterUser      && r.user_id !== filterUser) return false;
      if (filterBackend   && r.backend !== filterBackend) return false;
      if (filterDataType  && r.data_type !== filterDataType) return false;
      if (filterRuntime   && r.runtime !== filterRuntime) return false;
      if (filterStatus    && r.status !== filterStatus) return false;
      if (filterOs        && r.os !== filterOs) return false;
      if (filterBrowser   && r.browser !== filterBrowser) return false;
      if (filterBrowserVer && r.browser_version !== filterBrowserVer) return false;
      if (filterCpu       && r.cpu !== filterCpu) return false;
      if (filterGpu       && r.gpu !== filterGpu) return false;
      if (filterWebnnEp   && r.webnn_ep !== filterWebnnEp) return false;
      if (filterGpuDriver && r.gpu_driver_version !== filterGpuDriver) return false;
      if (filterNpuDriver && r.npu_driver_version !== filterNpuDriver) return false;
      if (filterQuery) {
        const q = filterQuery.toLowerCase();
        if (!r.hf_model_id.toLowerCase().includes(q)) return false;
      }
      return true;
    })
  );

  type SortCol = 'user' | 'model' | 'dtype' | 'runtime' | 'backend' | 'status' | 'ttft' | 'tps' | 'tpot' | 'e2e' | 'e2e_tps' | 'tokens' | 'compile' | 'started';
  let sortCol = $state<SortCol>('started');
  let sortAsc = $state(false);

  function toggleSort(col: SortCol) {
    if (sortCol === col) sortAsc = !sortAsc;
    else { sortCol = col; sortAsc = col === 'model' || col === 'user'; }
  }

  function sortIndicator(col: SortCol): string {
    if (sortCol !== col) return '';
    return sortAsc ? ' ↑' : ' ↓';
  }

  const sorted = $derived(
    [...filtered].sort((a: AdminResultsLlmRow, b: AdminResultsLlmRow) => {
      let av: any, bv: any;
      switch (sortCol) {
        case 'user':    av = (a.user_display_name ?? '').toLowerCase(); bv = (b.user_display_name ?? '').toLowerCase(); break;
        case 'model':   av = a.hf_model_id.toLowerCase(); bv = b.hf_model_id.toLowerCase(); break;
        case 'dtype':   av = a.data_type; bv = b.data_type; break;
        case 'runtime': av = a.runtime; bv = b.runtime; break;
        case 'backend': av = a.backend; bv = b.backend; break;
        case 'status':  av = a.status; bv = b.status; break;
        case 'ttft':    av = a.ttft_ms ?? Infinity; bv = b.ttft_ms ?? Infinity; break;
        case 'tps':     av = a.tps ?? -Infinity; bv = b.tps ?? -Infinity; break;
        case 'tpot':    av = a.tpot_ms ?? Infinity; bv = b.tpot_ms ?? Infinity; break;
        case 'e2e':     av = a.e2e_ms ?? Infinity; bv = b.e2e_ms ?? Infinity; break;
        case 'e2e_tps': av = a.e2e_tps ?? -Infinity; bv = b.e2e_tps ?? -Infinity; break;
        case 'tokens':  av = a.output_tokens ?? -Infinity; bv = b.output_tokens ?? -Infinity; break;
        case 'compile': av = a.compilation_ms ?? Infinity; bv = b.compilation_ms ?? Infinity; break;
        case 'started': av = a.started_at; bv = b.started_at; break;
      }
      if (typeof av === 'string') {
        const cmp = av.localeCompare(bv);
        return sortAsc ? cmp : -cmp;
      }
      return sortAsc ? av - bv : bv - av;
    })
  );

  const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000];
  let pageSize    = $state(20);
  let currentPage = $state(1);
  const totalPages = $derived(Math.ceil(sorted.length / pageSize));
  const paged      = $derived(sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize));

  $effect(() => {
    void filterUser, filterQuery, filterBackend, filterDataType, filterRuntime,
         filterStatus, filterOs, filterBrowser, filterBrowserVer, filterCpu, filterGpu,
         filterWebnnEp, filterGpuDriver, filterNpuDriver, pageSize;
    currentPage = 1;
  });

  let selectedIds = $state<Set<string>>(new Set());
  $effect(() => { void currentPage; selectedIds = new Set(); });

  const pagedIds = $derived(paged.map((r: AdminResultsLlmRow) => r.id));
  const allPageSelected  = $derived(pagedIds.length > 0 && pagedIds.every((id: string) => selectedIds.has(id)));
  const somePageSelected = $derived(pagedIds.some((id: string) => selectedIds.has(id)));

  let selectAllEl = $state<HTMLInputElement | null>(null);
  $effect(() => {
    if (selectAllEl) selectAllEl.indeterminate = somePageSelected && !allPageSelected;
  });

  function toggleSelectAll() {
    if (allPageSelected) {
      const next = new Set(selectedIds);
      pagedIds.forEach((id: string) => next.delete(id));
      selectedIds = next;
    } else {
      const next = new Set(selectedIds);
      pagedIds.forEach((id: string) => next.add(id));
      selectedIds = next;
    }
  }

  function toggleRow(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    selectedIds = next;
  }

  let deleteInProgress = $state(false);
  let deleteError = $state('');

  async function deleteSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} result${ids.length !== 1 ? 's' : ''}?`)) return;
    deleteInProgress = true; deleteError = '';
    try {
      const supabase = createClient();
      const { error } = await (supabase.from('results_llm') as any).delete().in('id', ids);
      if (error) throw new Error(error.message);
      data = { ...data, results: data.results.filter((r: AdminResultsLlmRow) => !selectedIds.has(r.id)) };
      selectedIds = new Set();
    } catch (e: any) {
      deleteError = e.message ?? 'Delete failed';
    } finally {
      deleteInProgress = false;
    }
  }

  type OptColKey = 'dtype' | 'runtime' | 'backend' | 'status' | 'prompt_tokens' | 'tokens' | 'max_new_tokens' | 'ttft' | 'tps' | 'tpot' | 'e2e' | 'e2e_tps' | 'compile' | 'os' | 'browser' | 'browser_ver' | 'cpu' | 'gpu';

  const OPTIONAL_COLS: { key: OptColKey; label: string; defaultVisible: boolean }[] = [
    { key: 'dtype',          label: 'Data Type', defaultVisible: true  },
    { key: 'runtime',        label: 'JS Framework', defaultVisible: true  },
    { key: 'backend',        label: 'Backend',   defaultVisible: true  },
    { key: 'status',         label: 'Status',    defaultVisible: true  },
    { key: 'prompt_tokens',  label: 'Prompt',    defaultVisible: true  },
    { key: 'tokens',         label: 'Output',    defaultVisible: true  },
    { key: 'max_new_tokens', label: 'Max New',   defaultVisible: false },
    { key: 'ttft',           label: 'TTFT',      defaultVisible: true  },
    { key: 'tps',            label: 'TPS',       defaultVisible: true  },
    { key: 'tpot',           label: 'TPOT',      defaultVisible: true  },
    { key: 'e2e',            label: 'E2E',       defaultVisible: true  },
    { key: 'e2e_tps',        label: 'E2E TPS',   defaultVisible: true  },
    { key: 'compile',        label: 'Compile',   defaultVisible: true  },
    { key: 'os',             label: 'OS',        defaultVisible: false },
    { key: 'browser',        label: 'Browser',   defaultVisible: false },
    { key: 'browser_ver',    label: 'Browser Ver', defaultVisible: false },
    { key: 'cpu',            label: 'CPU',       defaultVisible: false },
    { key: 'gpu',            label: 'GPU',       defaultVisible: false },
  ];

  const LS_KEY = 'admin_results_llm_visible_cols_v2';

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
    if (next.has(key)) next.delete(key); else next.add(key);
    visibleCols = next;
    if (browser) localStorage.setItem(LS_KEY, JSON.stringify([...next]));
  }

  function isVisible(key: OptColKey): boolean { return visibleCols.has(key); }

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

  const BACKEND_COLORS: Record<string, string> = {
    wasm: 'backend-wasm', webgpu: 'backend-webgpu',
    webnn_cpu: 'backend-webnn-cpu', webnn_gpu: 'backend-webnn-gpu', webnn_npu: 'backend-webnn-npu',
  };
  function backendClass(id: string): string { return BACKEND_COLORS[id] ?? 'backend-unknown'; }

  function fmt(n: number | null | undefined, digits = 0, unit = ''): string {
    if (n == null || isNaN(n as number)) return '—';
    return (n as number).toFixed(digits) + unit;
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
    <div>
      <h1>All LLM Results <span class="admin-badge">admin</span></h1>
      <p>{filtered.length} result{filtered.length !== 1 ? 's' : ''} across {users.length} user{users.length !== 1 ? 's' : ''}</p>
    </div>
    <input class="filter-input header-search" type="text" placeholder="Search model…" bind:value={filterQuery} />
  </header>

  {#if data.error}
    <p class="error-text">{data.error}</p>
  {:else if data.results.length === 0}
    <div class="empty"><p>No LLM results yet.</p></div>
  {:else}
    <div class="filters">
      <select class="filter-select filter-select-wide" bind:value={filterUser}>
        <option value="">All Users</option>
        {#each users as u}
          <option value={u.id}>{u.display_name ?? u.email}</option>
        {/each}
      </select>

      <select class="filter-select" bind:value={filterDataType}>
        <option value="">Data Type</option>
        {#each dataTypes as dt}<option value={dt}>{dt}</option>{/each}
      </select>

      <select class="filter-select" bind:value={filterBackend}>
        <option value="">Backend</option>
        {#each backends as b}<option value={b}>{b}</option>{/each}
      </select>

      <select class="filter-select" bind:value={filterWebnnEp}>
        <option value="">WebNN EP</option>
        {#each distinctWebnnEps as v}<option value={v}>{v}</option>{/each}
      </select>

      <select class="filter-select" bind:value={filterRuntime}>
        <option value="">JS Framework</option>
        {#each runtimes as r}<option value={r}>{r}</option>{/each}
      </select>

      <select class="filter-select" bind:value={filterStatus}>
        <option value="">Status</option>
        {#each statuses as s}<option value={s}>{s}</option>{/each}
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
                  <input type="checkbox" class="row-check" checked={isVisible(col.key)} onchange={() => toggleCol(col.key)} />
                  {col.label}
                </label>
              {/each}
            </div>
          {/if}
        </div>

        {#if selectedIds.size > 0}
          <button class="delete-btn" onclick={deleteSelected} disabled={deleteInProgress}>
            {deleteInProgress ? 'Deleting…' : `Delete ${selectedIds.size} row${selectedIds.size !== 1 ? 's' : ''}`}
          </button>
          {#if deleteError}<span class="delete-error">{deleteError}</span>{/if}
        {/if}
      </div>
    </div>

    <div class="table-wrapper">
      <table class="results-table">
        <thead>
          <tr>
            <th class="th-check">
              <input bind:this={selectAllEl} type="checkbox" class="row-check"
                checked={allPageSelected} onchange={toggleSelectAll} title="Select all on this page" />
            </th>
            <th class="th-model sortable" onclick={() => toggleSort('model')}>Model{sortIndicator('model')}</th>
            {#if isVisible('dtype')}<th class="sortable" onclick={() => toggleSort('dtype')}>Type{sortIndicator('dtype')}</th>{/if}
            {#if isVisible('runtime')}<th class="sortable" onclick={() => toggleSort('runtime')}>JS Framework{sortIndicator('runtime')}</th>{/if}
            {#if isVisible('backend')}<th class="sortable" onclick={() => toggleSort('backend')}>Backend{sortIndicator('backend')}</th>{/if}
            {#if isVisible('status')}<th class="sortable" onclick={() => toggleSort('status')}>Status{sortIndicator('status')}</th>{/if}
            {#if isVisible('prompt_tokens')}<th title="Prompt Tokens (prompt_tokens) — number of input tokens fed to the model.">Prompt</th>{/if}
            {#if isVisible('tokens')}<th class="sortable" title="Output Tokens (output_tokens) — actual tokens generated this run." onclick={() => toggleSort('tokens')}>Output{sortIndicator('tokens')}</th>{/if}
            {#if isVisible('max_new_tokens')}<th title="Max New Tokens (max_new_tokens) — the cap passed to model.generate(). The actual count is shown as 'Output'.">Max New</th>{/if}
            {#if isVisible('ttft')}<th class="sortable" onclick={() => toggleSort('ttft')}>TTFT{sortIndicator('ttft')}</th>{/if}
            {#if isVisible('tps')}<th class="sortable" onclick={() => toggleSort('tps')}>TPS{sortIndicator('tps')}</th>{/if}
            {#if isVisible('tpot')}<th class="sortable" onclick={() => toggleSort('tpot')}>TPOT{sortIndicator('tpot')}</th>{/if}
            {#if isVisible('e2e')}<th class="sortable" onclick={() => toggleSort('e2e')}>E2E{sortIndicator('e2e')}</th>{/if}
            {#if isVisible('e2e_tps')}<th class="sortable" onclick={() => toggleSort('e2e_tps')}>E2E TPS{sortIndicator('e2e_tps')}</th>{/if}
            {#if isVisible('compile')}<th class="sortable" onclick={() => toggleSort('compile')}>Compile{sortIndicator('compile')}</th>{/if}
            {#if isVisible('os')}<th>OS</th>{/if}
            {#if isVisible('browser')}<th>Browser</th>{/if}
            {#if isVisible('browser_ver')}<th>Browser Ver</th>{/if}
            {#if isVisible('cpu')}<th>CPU</th>{/if}
            {#if isVisible('gpu')}<th>GPU</th>{/if}
            <th class="th-user sortable" onclick={() => toggleSort('user')}>User{sortIndicator('user')}</th>
            <th class="sortable" onclick={() => toggleSort('started')}>Date{sortIndicator('started')}</th>
          </tr>
        </thead>
        <tbody>
          {#each paged as row}
            <tr class:row-selected={selectedIds.has(row.id)}>
              <td class="cell-check">
                <input type="checkbox" class="row-check" checked={selectedIds.has(row.id)} onchange={() => toggleRow(row.id)} />
              </td>
              <td class="cell-model cell-copy" title="Click to copy: {row.hf_model_id}" onclick={() => copyCell(row.hf_model_id)}>{row.hf_model_id}</td>
              {#if isVisible('dtype')}<td><span class="dtype-chip" data-dtype={row.data_type}>{row.data_type}</span></td>{/if}
              {#if isVisible('runtime')}<td class="cell-opt">{row.runtime}</td>{/if}
              {#if isVisible('backend')}<td><span class="badge-backend {backendClass(row.backend)}">{row.backend}</span></td>{/if}
              {#if isVisible('status')}<td><span class="status-dot" class:status-ok={row.status === 'completed'} class:status-error={row.status === 'error'} title={row.error_message ?? row.status}></span></td>{/if}
              {#if isVisible('prompt_tokens')}<td class="cell-metric">{row.prompt_tokens ?? '—'}</td>{/if}
              {#if isVisible('tokens')}<td class="cell-metric">{row.output_tokens ?? '—'}</td>{/if}
              {#if isVisible('max_new_tokens')}<td class="cell-metric">{row.max_new_tokens ?? '—'}</td>{/if}
              {#if isVisible('ttft')}<td class="cell-metric">{fmt(row.ttft_ms, 0, 'ms')}</td>{/if}
              {#if isVisible('tps')}<td class="cell-metric">{fmt(row.tps, 1, 't/s')}</td>{/if}
              {#if isVisible('tpot')}<td class="cell-metric">{fmt(row.tpot_ms, 1, 'ms')}</td>{/if}
              {#if isVisible('e2e')}<td class="cell-metric">{fmt(row.e2e_ms ? row.e2e_ms / 1000 : null, 2, 's')}</td>{/if}
              {#if isVisible('e2e_tps')}<td class="cell-metric">{fmt(row.e2e_tps, 1, 't/s')}</td>{/if}
              {#if isVisible('compile')}<td class="cell-metric">{fmt(row.compilation_ms ? row.compilation_ms / 1000 : null, 1, 's')}</td>{/if}
              {#if isVisible('os')}<td class="cell-opt">{row.os ?? '—'}</td>{/if}
              {#if isVisible('browser')}<td class="cell-opt">{row.browser ?? '—'}</td>{/if}
              {#if isVisible('browser_ver')}<td class="cell-opt">{row.browser_version ?? '—'}</td>{/if}
              {#if isVisible('cpu')}<td class="cell-opt cell-opt-long" title={row.cpu ?? ''}>{row.cpu ?? '—'}</td>{/if}
              {#if isVisible('gpu')}<td class="cell-opt cell-opt-long" title={row.gpu ?? ''}>{row.gpu ?? '—'}</td>{/if}
              <td class="cell-user">
                <div class="user-cell-wrap" title={row.user_display_name ?? row.user_id}>
                  {#if row.user_avatar_url}
                    <img src={row.user_avatar_url} alt="" class="user-avatar" crossorigin="anonymous" />
                  {:else}
                    <span class="user-avatar user-avatar-placeholder">
                      {(row.user_display_name ?? '?')[0].toUpperCase()}
                    </span>
                  {/if}
                  <span class="user-name">{row.user_display_name ?? row.user_id}</span>
                </div>
              </td>
              <td class="cell-date">{fmtDate(row.started_at)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="env-filters">
      <select class="filter-select" bind:value={filterOs}>
        <option value="">OS</option>
        {#each distinctOs as v}<option value={v}>{v}</option>{/each}
      </select>
      <select class="filter-select" bind:value={filterBrowser}>
        <option value="">Browser</option>
        {#each distinctBrowsers as v}<option value={v}>{v}</option>{/each}
      </select>
      <select class="filter-select" bind:value={filterBrowserVer}>
        <option value="">Browser Version</option>
        {#each distinctBrowserVers as v}<option value={v}>{v}</option>{/each}
      </select>
      <select class="filter-select filter-select-wide" bind:value={filterCpu}>
        <option value="">CPU</option>
        {#each distinctCpus as v}<option value={v}>{v}</option>{/each}
      </select>
      <select class="filter-select filter-select-wide" bind:value={filterGpu}>
        <option value="">GPU</option>
        {#each distinctGpus as v}<option value={v}>{v}</option>{/each}
      </select>
      <select class="filter-select" bind:value={filterGpuDriver}>
        <option value="">GPU Driver</option>
        {#each distinctGpuDrivers as v}<option value={v}>{v}</option>{/each}
      </select>
      <select class="filter-select" bind:value={filterNpuDriver}>
        <option value="">NPU Driver</option>
        {#each distinctNpuDrivers as v}<option value={v}>{v}</option>{/each}
      </select>
    </div>

    <div class="table-footer">
      <div class="footer-left">
        <span class="footer-count">{sorted.length} result{sorted.length !== 1 ? 's' : ''}</span>
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

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .header-search { flex-shrink: 0; min-width: 220px; }

  .page-header h1 {
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text-primary);
    margin-bottom: var(--space-half);
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .admin-badge {
    font-size: 10px;
    font-family: var(--font-ui);
    font-weight: 600;
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    vertical-align: middle;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .page-header p { font-size: var(--text-sm); color: var(--color-text-muted); }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-bottom: var(--space-2);
  }

  .filter-input { min-width: 200px; padding: var(--space-1) var(--space-2); }
  .filter-select { min-width: 140px; height: auto; padding: var(--space-1) var(--space-2); cursor: pointer; }
  .filter-select-wide { min-width: 200px; }

  .filters-actions { margin-left: auto; display: flex; align-items: center; gap: var(--space-1); }

  .env-filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border);
  }

  .empty { padding: var(--space-4); text-align: center; color: var(--color-text-muted); }

  .table-wrapper { overflow-x: auto; }

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
  .th-user  { text-align: left; min-width: 120px; }
  .th-model { text-align: left; max-width: 14vw; width: 14vw; }

  .sortable { cursor: pointer; user-select: none; }
  .sortable:hover { color: var(--color-text-primary); }

  .results-table td {
    padding: var(--space-1);
    border-bottom: 1px solid var(--color-border);
    text-align: center;
    white-space: nowrap;
  }

  .results-table tbody tr:hover { background: var(--color-nav-item-hover); }
  .results-table tbody tr.row-selected { background: var(--color-accent-light); }

  .cell-check { padding: var(--space-1) 6px !important; width: 28px; }

  .row-check { cursor: pointer; accent-color: var(--color-primary); width: 14px; height: 14px; vertical-align: middle; }

  .cell-user { text-align: left; }

  .user-cell-wrap { display: inline-flex; align-items: center; gap: 6px; max-width: 160px; overflow: hidden; }

  .user-avatar { width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0; outline: 1px solid var(--color-border); outline-offset: -1px; }

  .user-avatar-placeholder {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface-sunken);
    font-family: var(--font-ui);
    font-size: 9px;
    font-weight: 700;
    color: var(--color-text-secondary);
    width: 18px;
    height: 18px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .user-name { font-family: var(--font-ui); font-size: 11px; color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .cell-model { text-align: left; max-width: 14vw; overflow: hidden; text-overflow: ellipsis; }
  .cell-copy { cursor: pointer; }
  .cell-copy:hover { color: var(--color-primary); }

  .cell-metric { font-variant-numeric: tabular-nums; }
  .cell-date { font-family: var(--font-ui); font-size: 10px; color: var(--color-text-muted); }
  .cell-opt-long { max-width: 12vw; overflow: hidden; text-overflow: ellipsis; }

  :global(.results-table .dtype-chip) { min-width: 56px; }

  .badge-backend {
    font-family: var(--font-ui);
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    border: 1px solid;
    white-space: nowrap;
    display: inline-block;
    min-width: 72px;
    text-align: center;
    box-sizing: border-box;
  }

  .backend-wasm      { color: #78716c; border-color: #78716c; }
  .backend-webgpu    { color: #d97706; border-color: #d97706; }
  .backend-webnn-cpu { color: #0953DE; border-color: #0953DE; }
  .backend-webnn-gpu { color: #7c3aed; border-color: #7c3aed; }
  .backend-webnn-npu { color: #059669; border-color: #059669; }
  .backend-unknown   { color: var(--color-text-muted); border-color: var(--color-border); }

  :global([data-theme="dark"]) .backend-wasm      { color: #a8a29e; border-color: #a8a29e; }
  :global([data-theme="dark"]) .backend-webgpu    { color: #fbbf24; border-color: #fbbf24; }
  :global([data-theme="dark"]) .backend-webnn-cpu { color: #63B3ED; border-color: #63B3ED; }
  :global([data-theme="dark"]) .backend-webnn-gpu { color: #a78bfa; border-color: #a78bfa; }
  :global([data-theme="dark"]) .backend-webnn-npu { color: #34d399; border-color: #34d399; }

  .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--color-text-muted); }
  .status-ok    { background: #16a34a; }
  .status-error { background: var(--color-error); }

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

  .col-picker-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }

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

  .col-picker-item:hover { background: var(--color-nav-item-hover); color: var(--color-text-primary); }

  .delete-btn {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border: none;
    border-radius: var(--radius-base);
    background: var(--color-error);
    color: #fff;
    cursor: pointer;
    transition: background var(--transition-base), opacity var(--transition-base);
    white-space: nowrap;
  }

  .delete-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--color-error) 85%, black); }
  .delete-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .delete-error { font-size: var(--text-xs); color: var(--color-error); }

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
  .error-text { color: var(--color-error); font-size: var(--text-sm); }

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
</style>
