<script lang="ts">
  import { createClient } from '$lib/supabase/client';
  import { browser } from '$app/environment';
  import { auth, isAuthenticated } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { loginUrl, locationPath } from '$lib/utils/login-redirect';
  import { autoTitle } from '$lib/utils/auto-title';
  import type { PageData } from './$types';
  import type { ResultsLlmRow } from '$lib/engine/types';
  import { getBackendLabel } from '$lib/engine/backends';

  let { data }: { data: PageData } = $props();

  $effect(() => {
    if (browser && !$auth.loading && !$isAuthenticated) {
      goto(loginUrl(locationPath(window.location)));
    }
  });

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

  const filtered = $derived.by(() => {
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

  // Any filter active — used by the sidebar's Clear button and the empty-state hint.
  const anyFilterActive = $derived(
    !!(filterModel || filterBackend || filterDtype || filterFramework || filterStatus ||
       filterWebnnEp || filterOs || filterBrowser || filterBrowserVer ||
       filterCpu || filterGpu || filterGpuDriver || filterNpuDriver)
  );

  function clearFilters() {
    filterModel = ''; filterBackend = ''; filterDtype = ''; filterFramework = ''; filterStatus = '';
    filterWebnnEp = ''; filterOs = ''; filterBrowser = ''; filterBrowserVer = '';
    filterCpu = ''; filterGpu = ''; filterGpuDriver = ''; filterNpuDriver = '';
  }

  // ── Sorting ─────────────────────────────────────────────────────────
  type SortCol =
    | 'model' | 'dtype' | 'runtime' | 'backend' | 'status'
    | 'prompt_tokens' | 'tokens' | 'max_new_tokens'
    | 'ttft' | 'tps' | 'tpot' | 'e2e' | 'e2e_tps' | 'compile'
    | 'completed_at';
  let sortCol = $state<SortCol>('completed_at');
  let sortAsc = $state(false);

  function toggleSort(col: SortCol) {
    if (sortCol === col) sortAsc = !sortAsc;
    else { sortCol = col; sortAsc = col === 'model' || col === 'dtype' || col === 'runtime' || col === 'backend' || col === 'status'; }
  }

  function sortIndicator(col: SortCol): string {
    if (sortCol !== col) return '';
    return sortAsc ? ' ↑' : ' ↓';
  }

  const sorted = $derived(
    [...filtered].sort((a, b) => {
      let av: any, bv: any;
      // For "higher-is-better" metrics (TPS, E2E TPS), nulls sink to bottom in descending sort.
      // For "lower-is-better" metrics (TTFT, TPOT, E2E, compile), nulls sink to bottom in ascending sort.
      switch (sortCol) {
        case 'model':         av = a.hf_model_id.toLowerCase(); bv = b.hf_model_id.toLowerCase(); break;
        case 'dtype':         av = a.data_type ?? ''; bv = b.data_type ?? ''; break;
        case 'runtime':       av = frameworkLabel(a); bv = frameworkLabel(b); break;
        case 'backend':       av = a.backend ?? ''; bv = b.backend ?? ''; break;
        case 'status':        av = a.status ?? ''; bv = b.status ?? ''; break;
        case 'prompt_tokens': av = a.prompt_tokens ?? Infinity; bv = b.prompt_tokens ?? Infinity; break;
        case 'tokens':        av = a.output_tokens ?? Infinity; bv = b.output_tokens ?? Infinity; break;
        case 'max_new_tokens':av = a.max_new_tokens ?? Infinity; bv = b.max_new_tokens ?? Infinity; break;
        case 'ttft':          av = a.ttft_ms ?? Infinity; bv = b.ttft_ms ?? Infinity; break;
        case 'tps':           av = a.tps ?? -Infinity; bv = b.tps ?? -Infinity; break;
        case 'tpot':          av = a.tpot_ms ?? Infinity; bv = b.tpot_ms ?? Infinity; break;
        case 'e2e':           av = a.e2e_ms ?? Infinity; bv = b.e2e_ms ?? Infinity; break;
        case 'e2e_tps':       av = a.e2e_tps ?? -Infinity; bv = b.e2e_tps ?? -Infinity; break;
        case 'compile':       av = a.compilation_ms ?? Infinity; bv = b.compilation_ms ?? Infinity; break;
        case 'completed_at':  av = a.completed_at ?? ''; bv = b.completed_at ?? ''; break;
      }
      if (typeof av === 'string') {
        const cmp = av.localeCompare(bv);
        return sortAsc ? cmp : -cmp;
      }
      return sortAsc ? av - bv : bv - av;
    })
  );

  const totalPages = $derived(Math.max(1, Math.ceil(sorted.length / pageSize)));
  const paged      = $derived(sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize));

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

  const BACKEND_COLORS: Record<string, string> = {
    wasm:      'backend-wasm',
    wasm_1:    'backend-wasm',
    wasm_n:    'backend-wasm',
    webgpu:    'backend-webgpu',
    webnn_cpu: 'backend-webnn-cpu',
    webnn_gpu: 'backend-webnn-gpu',
    webnn_npu: 'backend-webnn-npu',
  };
  function backendClass(id: string): string {
    return BACKEND_COLORS[id] ?? 'backend-unknown';
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
    { key: 'prompt_tokens',   label: 'Prompt',          defaultVisible: true  },
    { key: 'tokens',          label: 'Output',          defaultVisible: true  },
    { key: 'max_new_tokens',  label: 'Max New',         defaultVisible: false },
    { key: 'ttft',            label: 'TTFT',            defaultVisible: true  },
    { key: 'tps',             label: 'TPS',             defaultVisible: true  },
    { key: 'tpot',            label: 'TPOT',            defaultVisible: true  },
    { key: 'e2e',             label: 'E2E',             defaultVisible: true  },
    { key: 'e2e_tps',         label: 'E2E TPS',         defaultVisible: true  },
    { key: 'compile',         label: 'Compile',         defaultVisible: true  },
    // Default-off
    { key: 'webnn_ep',        label: 'WebNN EP',        defaultVisible: false },
    { key: 'runs',            label: 'Runs',            defaultVisible: false },
    { key: 'runtime_version', label: 'Runtime Version', defaultVisible: false },
    { key: 'os',              label: 'OS',              defaultVisible: false },
    { key: 'browser',         label: 'Browser',         defaultVisible: false },
    { key: 'browser_ver',     label: 'Browser Version', defaultVisible: false },
    { key: 'cpu',             label: 'CPU',             defaultVisible: false },
    { key: 'gpu',             label: 'GPU',             defaultVisible: false },
    { key: 'gpu_driver',      label: 'GPU Driver',      defaultVisible: false },
    { key: 'npu_driver',      label: 'NPU Driver',      defaultVisible: false },
  ];

  const LS_KEY = 'results_llm_visible_cols_v2';

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

  // ─────── Export ───────
  let copyFeedback = $state('');

  function exportColumns(): { label: string; get: (r: ResultsLlmRow) => string }[] {
    const cols: { label: string; get: (r: ResultsLlmRow) => string }[] = [
      { label: 'Model', get: r => r.hf_model_id },
    ];
    if (isVisible('dtype'))           cols.push({ label: 'Dtype',           get: r => r.data_type });
    if (isVisible('runtime'))         cols.push({ label: 'Runtime',         get: r => r.runtime });
    if (isVisible('backend'))         cols.push({ label: 'Backend',         get: r => r.backend });
    if (isVisible('status'))          cols.push({ label: 'Status',          get: r => r.status + (r.error_phase ? ` [${r.error_phase}]` : '') });
    if (isVisible('prompt_tokens'))   cols.push({ label: 'Prompt Tokens',   get: r => r.prompt_tokens != null ? String(r.prompt_tokens) : '' });
    if (isVisible('tokens'))          cols.push({ label: 'Output Tokens',   get: r => r.output_tokens != null ? String(r.output_tokens) : '' });
    if (isVisible('max_new_tokens'))  cols.push({ label: 'Max New',         get: r => r.max_new_tokens != null ? String(r.max_new_tokens) : '' });
    if (isVisible('ttft'))            cols.push({ label: 'TTFT (ms)',       get: r => r.ttft_ms != null ? r.ttft_ms.toFixed(0) : '' });
    if (isVisible('tps'))             cols.push({ label: 'TPS (tok/s)',     get: r => r.tps != null ? r.tps.toFixed(1) : '' });
    if (isVisible('tpot'))            cols.push({ label: 'TPOT (ms)',       get: r => r.tpot_ms != null ? r.tpot_ms.toFixed(1) : '' });
    if (isVisible('e2e'))             cols.push({ label: 'E2E (ms)',        get: r => r.e2e_ms != null ? r.e2e_ms.toFixed(0) : '' });
    if (isVisible('e2e_tps'))         cols.push({ label: 'E2E TPS (tok/s)', get: r => r.e2e_tps != null ? r.e2e_tps.toFixed(1) : '' });
    if (isVisible('compile'))         cols.push({ label: 'Compile (ms)',    get: r => r.compilation_ms != null ? r.compilation_ms.toFixed(0) : '' });
    if (isVisible('webnn_ep'))        cols.push({ label: 'WebNN EP',        get: r => r.webnn_ep ?? '' });
    if (isVisible('runs'))            cols.push({ label: 'Runs',            get: r => r.runs != null ? String(r.runs) : '' });
    if (isVisible('runtime_version')) cols.push({ label: 'Runtime Ver',     get: r => r.runtime_version ?? '' });
    if (isVisible('os'))              cols.push({ label: 'OS',              get: r => r.os ?? '' });
    if (isVisible('browser'))         cols.push({ label: 'Browser',         get: r => r.browser ?? '' });
    if (isVisible('browser_ver'))     cols.push({ label: 'Browser Ver',     get: r => r.browser_version ?? '' });
    if (isVisible('cpu'))             cols.push({ label: 'CPU',             get: r => r.cpu ?? '' });
    if (isVisible('gpu'))             cols.push({ label: 'GPU',             get: r => r.gpu ?? '' });
    if (isVisible('gpu_driver'))      cols.push({ label: 'GPU Driver',      get: r => r.gpu_driver_version ?? '' });
    if (isVisible('npu_driver'))      cols.push({ label: 'NPU Driver',      get: r => r.npu_driver_version ?? '' });
    cols.push({ label: 'Date', get: r => r.completed_at ?? r.started_at ?? '' });
    return cols;
  }

  function toMarkdown(): string {
    const cols = exportColumns();
    const sep = cols.map(() => '---');
    const rows = filtered.map(r => cols.map(c => c.get(r)));
    return [cols.map(c => c.label).join(' | '), sep.join(' | '), ...rows.map(r => r.join(' | '))].join('\n');
  }
  function toJSON(): string {
    return JSON.stringify(filtered.map(r => {
      const obj: Record<string, any> = { model: r.hf_model_id };
      if (isVisible('dtype'))           obj.data_type           = r.data_type;
      if (isVisible('runtime'))         obj.runtime             = r.runtime;
      if (isVisible('backend'))         obj.backend             = r.backend;
      if (isVisible('status'))          obj.status              = r.status;
      if (r.error_phase) obj.error_phase = r.error_phase;
      if (isVisible('prompt_tokens'))   obj.prompt_tokens       = r.prompt_tokens;
      if (isVisible('tokens'))          obj.output_tokens       = r.output_tokens;
      if (isVisible('max_new_tokens'))  obj.max_new_tokens      = r.max_new_tokens;
      if (isVisible('ttft'))            obj.ttft_ms             = r.ttft_ms;
      if (isVisible('tps'))             obj.tps                 = r.tps;
      if (isVisible('tpot'))            obj.tpot_ms             = r.tpot_ms;
      if (isVisible('e2e'))             obj.e2e_ms              = r.e2e_ms;
      if (isVisible('e2e_tps'))         obj.e2e_tps             = r.e2e_tps;
      if (isVisible('compile'))         obj.compilation_ms      = r.compilation_ms;
      if (isVisible('webnn_ep'))        obj.webnn_ep            = r.webnn_ep;
      if (isVisible('runs'))            obj.runs                = r.runs;
      if (isVisible('runtime_version')) obj.runtime_version     = r.runtime_version;
      if (isVisible('os'))              obj.os                  = r.os;
      if (isVisible('browser'))         obj.browser             = r.browser;
      if (isVisible('browser_ver'))     obj.browser_version     = r.browser_version;
      if (isVisible('cpu'))             obj.cpu                 = r.cpu;
      if (isVisible('gpu'))             obj.gpu                 = r.gpu;
      if (isVisible('gpu_driver'))      obj.gpu_driver_version  = r.gpu_driver_version;
      if (isVisible('npu_driver'))      obj.npu_driver_version  = r.npu_driver_version;
      obj.started_at = r.started_at;
      if (r.completed_at) obj.completed_at = r.completed_at;
      return obj;
    }), null, 2);
  }
  function toCSV(): string {
    const cols = exportColumns();
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = filtered.map(r => cols.map(c => escape(c.get(r))));
    return [cols.map(c => escape(c.label)).join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  async function copyAs(format: 'markdown' | 'json' | 'csv') {
    const text = format === 'markdown' ? toMarkdown() : format === 'json' ? toJSON() : toCSV();
    await navigator.clipboard.writeText(text);
    copyFeedback = format;
    setTimeout(() => { copyFeedback = ''; }, 2000);
  }

  function saveFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  const dateSuffix = () => new Date().toISOString().slice(0, 10);
  const baseName = $derived(`results-llm-${dateSuffix()}`);
  function saveMarkdown() { saveFile(toMarkdown(), `${baseName}.md`,   'text/markdown'); }
  function saveJSON()     { saveFile(toJSON(),     `${baseName}.json`, 'application/json'); }
  function saveCSV()      { saveFile(toCSV(),      `${baseName}.csv`,  'text/csv'); }
</script>

<div class="results-page">
  {#if data.error}
    <p class="error-text">{data.error}</p>
  {/if}

  <header class="page-header page-header-row">
    <div class="page-header-text">
      <h1>My Results</h1>
      <p>Your LLM benchmark history. {(data.results ?? []).length} result{(data.results ?? []).length !== 1 ? 's' : ''}.</p>
    </div>
    <div class="page-header-actions">
      {#if selected.size > 0}
        <button class="delete-btn" onclick={deleteSelected} disabled={deleting}>
          {deleting ? 'Deleting…' : `Delete ${selected.size}`}
        </button>
        {#if deleteError}
          <span class="delete-error" role="alert">{deleteError}</span>
        {/if}
      {/if}
      {#if filtered.length > 0}
        <div class="export-group">
          <span class="export-group-icon" title="Copy to clipboard">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </span>
          <button class="export-group-btn" onclick={() => copyAs('markdown')} title="Copy as Markdown" class:active={copyFeedback === 'markdown'}>MD</button>
          <button class="export-group-btn" onclick={() => copyAs('json')} title="Copy as JSON" class:active={copyFeedback === 'json'}>JSON</button>
          <button class="export-group-btn" onclick={() => copyAs('csv')} title="Copy as CSV" class:active={copyFeedback === 'csv'}>CSV</button>
        </div>
        <div class="export-group">
          <span class="export-group-icon" title="Download">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </span>
          <button class="export-group-btn" onclick={saveMarkdown} title="Download Markdown">MD</button>
          <button class="export-group-btn" onclick={saveJSON} title="Download JSON">JSON</button>
          <button class="export-group-btn" onclick={saveCSV} title="Download CSV">CSV</button>
        </div>
      {/if}
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
    </div>
  </header>

  <section class="rs-layout">
    <aside class="rs-sidebar" use:autoTitle>
      <div class="sb-section">
        <div class="sb-section-head">
          <span class="sb-section-title">Search</span>
          {#if anyFilterActive}
            <button type="button" class="sb-clear-btn" onclick={clearFilters} title="Reset all filters">Clear filters</button>
          {/if}
        </div>
        <input class="sb-input sb-input-text" type="search" placeholder="Model…" bind:value={filterModel} />
      </div>

      <div class="sb-section">
        <div class="sb-section-head"><span class="sb-section-title">Run</span></div>
        <div class="sb-row">
          <span class="sb-label">Data Type</span>
          <select class="sb-input" bind:value={filterDtype}>
            <option value="">All</option>
            {#each (data.distinctDataTypes ?? []) as d}<option value={d}>{d}</option>{/each}
          </select>
        </div>
        <div class="sb-row">
          <span class="sb-label">Backend</span>
          <select class="sb-input" bind:value={filterBackend}>
            <option value="">All</option>
            {#each (data.distinctBackends ?? []) as b}<option value={b}>{getBackendLabel(b)}</option>{/each}
          </select>
        </div>
        <div class="sb-row">
          <span class="sb-label">WebNN EP</span>
          <select class="sb-input" bind:value={filterWebnnEp}>
            <option value="">All</option>
            {#each (data.distinctWebnnEps ?? []) as ep}<option value={ep}>{ep}</option>{/each}
          </select>
        </div>
        <div class="sb-row">
          <span class="sb-label">Framework</span>
          <select class="sb-input" bind:value={filterFramework}>
            <option value="">All</option>
            {#each (data.distinctFrameworks ?? []) as r}<option value={r}>{r}</option>{/each}
          </select>
        </div>
        <div class="sb-row">
          <span class="sb-label">Status</span>
          <select class="sb-input" bind:value={filterStatus}>
            <option value="">All</option>
            {#each (data.distinctStatuses ?? []) as s}<option value={s}>{s}</option>{/each}
          </select>
        </div>
      </div>

      <div class="sb-section">
        <div class="sb-section-head"><span class="sb-section-title">Environment</span></div>
        <div class="sb-row">
          <span class="sb-label">OS</span>
          <select class="sb-input" bind:value={filterOs}>
            <option value="">All</option>
            {#each (data.distinctOs ?? []) as v}<option value={v}>{v}</option>{/each}
          </select>
        </div>
        <div class="sb-row">
          <span class="sb-label">Browser</span>
          <select class="sb-input" bind:value={filterBrowser}>
            <option value="">All</option>
            {#each (data.distinctBrowsers ?? []) as v}<option value={v}>{v}</option>{/each}
          </select>
        </div>
        <div class="sb-row">
          <span class="sb-label">Browser Ver</span>
          <select class="sb-input" bind:value={filterBrowserVer}>
            <option value="">All</option>
            {#each (data.distinctBrowserVers ?? []) as v}<option value={v}>{v}</option>{/each}
          </select>
        </div>
      </div>

      <div class="sb-section">
        <div class="sb-section-head"><span class="sb-section-title">Hardware</span></div>
        <div class="sb-row">
          <span class="sb-label">CPU</span>
          <select class="sb-input" bind:value={filterCpu}>
            <option value="">All</option>
            {#each (data.distinctCpus ?? []) as v}<option value={v}>{v}</option>{/each}
          </select>
        </div>
        <div class="sb-row">
          <span class="sb-label">GPU</span>
          <select class="sb-input" bind:value={filterGpu}>
            <option value="">All</option>
            {#each (data.distinctGpus ?? []) as v}<option value={v}>{v}</option>{/each}
          </select>
        </div>
        <div class="sb-row">
          <span class="sb-label">GPU Driver</span>
          <select class="sb-input" bind:value={filterGpuDriver}>
            <option value="">All</option>
            {#each (data.distinctGpuDrivers ?? []) as v}<option value={v}>{v}</option>{/each}
          </select>
        </div>
        <div class="sb-row">
          <span class="sb-label">NPU Driver</span>
          <select class="sb-input" bind:value={filterNpuDriver}>
            <option value="">All</option>
            {#each (data.distinctNpuDrivers ?? []) as v}<option value={v}>{v}</option>{/each}
          </select>
        </div>
      </div>

    </aside>

    <div class="rs-main">
  {#if filtered.length > 0}
    <div class="table-wrap">
      <table class="results-table">
        <thead>
          <tr>
            <th class="th-check">
              <input type="checkbox" class="row-check" checked={allChecked} onchange={toggleAll} />
            </th>
            <th class="th-model sortable" onclick={() => toggleSort('model')}>Model{sortIndicator('model')}</th>
            {#if isVisible('dtype')}<th class="sortable" onclick={() => toggleSort('dtype')}>Dtype{sortIndicator('dtype')}</th>{/if}
            {#if isVisible('runtime')}<th class="sortable" onclick={() => toggleSort('runtime')}>Runtime{sortIndicator('runtime')}</th>{/if}
            {#if isVisible('backend')}<th class="sortable" onclick={() => toggleSort('backend')}>Backend{sortIndicator('backend')}</th>{/if}
            {#if isVisible('status')}<th class="sortable" onclick={() => toggleSort('status')}>Status{sortIndicator('status')}</th>{/if}
            {#if isVisible('prompt_tokens')}<th class="sortable" onclick={() => toggleSort('prompt_tokens')} title="Prompt Tokens (prompt_tokens) — number of input tokens fed to the model.">Prompt{sortIndicator('prompt_tokens')}</th>{/if}
            {#if isVisible('tokens')}<th class="sortable" onclick={() => toggleSort('tokens')} title="Output Tokens (output_tokens) — actual tokens generated this run. Equals Max New unless an end-of-sequence token stopped generation early.">Output{sortIndicator('tokens')}</th>{/if}
            {#if isVisible('max_new_tokens')}<th class="sortable" onclick={() => toggleSort('max_new_tokens')} title="Max New Tokens (max_new_tokens) — the cap passed to model.generate(). The model stops at this count, or earlier if EOS is emitted. The actual count is shown as 'Output'.">Max New{sortIndicator('max_new_tokens')}</th>{/if}
            {#if isVisible('ttft')}<th class="sortable" onclick={() => toggleSort('ttft')} title="Time To First Token (prefill latency). Lower is better. Time from generate() call to the first decoded token, in ms.">TTFT{sortIndicator('ttft')}</th>{/if}
            {#if isVisible('tps')}<th class="sortable" onclick={() => toggleSort('tps')} title="Decode throughput = (output_tokens − 1) / (e2e − ttft). Higher is better. Steady-state token generation rate in tok/s.">TPS{sortIndicator('tps')}</th>{/if}
            {#if isVisible('tpot')}<th class="sortable" onclick={() => toggleSort('tpot')} title="Time Per Output Token = (e2e − ttft) / (output_tokens − 1). Lower is better. Average per-token decode latency in ms.">TPOT{sortIndicator('tpot')}</th>{/if}
            {#if isVisible('e2e')}<th class="sortable" onclick={() => toggleSort('e2e')} title="End-to-End wall-clock time from generate() call to the last token. Lower is better. Includes prefill + decode, in ms.">E2E{sortIndicator('e2e')}</th>{/if}
            {#if isVisible('e2e_tps')}<th class="sortable" onclick={() => toggleSort('e2e_tps')} title="End-to-End throughput = output_tokens / e2e. Higher is better. Effective tok/s including prefill cost.">E2E TPS{sortIndicator('e2e_tps')}</th>{/if}
            {#if isVisible('compile')}<th class="sortable" onclick={() => toggleSort('compile')} title="Initial model compilation/load-and-compile time, in ms. One-time cost per session.">Compile{sortIndicator('compile')}</th>{/if}
            {#if isVisible('webnn_ep')}<th>WebNN EP</th>{/if}
            {#if isVisible('runs')}<th>Runs</th>{/if}
            {#if isVisible('runtime_version')}<th>Runtime Ver</th>{/if}
            {#if isVisible('os')}<th>OS</th>{/if}
            {#if isVisible('browser')}<th>Browser</th>{/if}
            {#if isVisible('browser_ver')}<th>Browser Ver</th>{/if}
            {#if isVisible('cpu')}<th>CPU</th>{/if}
            {#if isVisible('gpu')}<th>GPU</th>{/if}
            {#if isVisible('gpu_driver')}<th>GPU Driver</th>{/if}
            {#if isVisible('npu_driver')}<th>NPU Driver</th>{/if}
            <th class="sortable" onclick={() => toggleSort('completed_at')}>Date{sortIndicator('completed_at')}</th>
          </tr>
        </thead>
        <tbody>
          {#each paged as r (r.id)}
            <tr class:row-selected={selected.has(r.id)}>
              <td class="cell-check">
                <input type="checkbox" class="row-check" checked={selected.has(r.id)} onchange={() => toggleRow(r.id)} />
              </td>
              <td class="cell-model" title={r.hf_model_id}>
                <button type="button" class="cell-copy" onclick={() => copyCell(r.hf_model_id)} title="Copy">{r.hf_model_id}</button>
              </td>
              {#if isVisible('dtype')}<td><span class="dtype-chip" data-dtype={r.data_type}>{r.data_type === 'quantized' ? 'quant' : r.data_type}</span></td>{/if}
              {#if isVisible('runtime')}<td class="cell-opt">{r.runtime}</td>{/if}
              {#if isVisible('backend')}<td><span class="badge-backend {backendClass(r.backend)}">{getBackendLabel(r.backend)}</span></td>{/if}
              {#if isVisible('status')}
                <td class="cell-status" class:cell-error={r.status === 'error'} title={r.error_message ?? ''}>
                  {r.status}{r.error_phase ? ` [${r.error_phase}]` : ''}
                </td>
              {/if}
              {#if isVisible('prompt_tokens')}<td class="cell-metric">{r.prompt_tokens ?? '—'}</td>{/if}
              {#if isVisible('tokens')}<td class="cell-metric">{r.output_tokens ?? '—'}</td>{/if}
              {#if isVisible('max_new_tokens')}<td class="cell-metric">{r.max_new_tokens ?? '—'}</td>{/if}
              {#if isVisible('ttft')}<td class="cell-metric">{fmt(r.ttft_ms, 0, 'ms')}</td>{/if}
              {#if isVisible('tps')}<td class="cell-metric">{fmt(r.tps, 1, 'tok/s')}</td>{/if}
              {#if isVisible('tpot')}<td class="cell-metric">{fmt(r.tpot_ms, 1, 'ms')}</td>{/if}
              {#if isVisible('e2e')}<td class="cell-metric">{fmt(r.e2e_ms, 0, 'ms')}</td>{/if}
              {#if isVisible('e2e_tps')}<td class="cell-metric">{fmt(r.e2e_tps, 1, 'tok/s')}</td>{/if}
              {#if isVisible('compile')}<td class="cell-metric">{fmt(r.compilation_ms, 0, 'ms')}</td>{/if}
              {#if isVisible('webnn_ep')}<td class="cell-opt">{r.webnn_ep ?? '—'}</td>{/if}
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

  {#if filtered.length > 0}
    <div class="table-footer">
      <div class="footer-left">
        <span class="footer-count">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
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
  </section>
</div>

{#if cellCopiedMsg}
  <div class="copy-toast">{cellCopiedMsg}</div>
{/if}

<style>
  .results-page { max-width: 100%; }

  .rs-layout {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: var(--space-3);
    align-items: start;
  }
  .rs-sidebar {
    position: sticky;
    top: var(--space-2);
    align-self: start;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-height: calc(100dvh - 80px);
    overflow-y: auto;
    padding-right: var(--space-1);
  }
  .rs-sidebar::-webkit-scrollbar { width: 4px; }
  .rs-sidebar::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 2px;
  }
  .rs-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }

  .sb-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .sb-section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-1);
    margin-bottom: 4px;
  }
  .sb-clear-btn {
    font-family: var(--font-ui);
    font-size: 10px;
    font-weight: 500;
    color: var(--color-primary);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .sb-clear-btn:hover { text-decoration: underline; }
  .sb-section-title {
    font-family: var(--font-ui);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
  }

  .sb-row {
    display: grid;
    grid-template-columns: 68px 1fr;
    align-items: center;
    gap: 8px;
    min-height: 28px;
  }
  .sb-label {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sb-input {
    width: 100%;
    height: 28px;
    min-width: 0;
    padding: 0 8px;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }
  select.sb-input {
    cursor: pointer;
    color: var(--color-text-muted);
  }
  .sb-input-text {
    width: 100%;
    height: 28px;
    padding: 0 8px;
    font-family: var(--font-ui);
    font-size: var(--text-xs);
  }

  /* ── Export buttons ───────────────────────────────────── */
  .export-group {
    display: inline-flex;
    align-items: stretch;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    overflow: hidden;
  }
  .export-group-icon {
    display: flex;
    align-items: center;
    padding: 0 6px;
    color: var(--color-text-muted);
    border-right: 1px solid var(--color-border);
  }
  .export-group-btn {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 4px 8px;
    background: none;
    border: none;
    border-left: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background var(--transition-base), color var(--transition-base);
  }
  .export-group-btn:first-of-type { border-left: none; }
  .export-group-btn:hover, .export-group-btn.active {
    background: var(--color-accent-light);
    color: var(--color-primary);
  }

  /* ── Column picker ────────────────────────────────────── */
  .col-picker-wrap { position: relative; }
  .col-picker-btn {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 4px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    white-space: nowrap;
    transition: background var(--transition-base), border-color var(--transition-base), color var(--transition-base);
  }
  .col-picker-btn:hover {
    background: var(--color-accent-light);
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

  .error-text { color: var(--color-error); font-size: var(--text-sm); margin-bottom: var(--space-2); }


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

  .delete-error { font-size: var(--text-xs); color: var(--color-error); align-self: center; }

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
    padding: 2px var(--space-1);
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
    vertical-align: middle;
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
    width: 100%;
    padding: 0;
    margin: 0;
    background: none;
    border: none;
    font: inherit;
    color: inherit;
    text-align: left;
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
    .rs-layout { grid-template-columns: 1fr; }
    .rs-sidebar {
      position: static;
      max-height: none;
    }
    .table-footer { flex-direction: column; align-items: flex-start; }
    .footer-right { min-width: 0; justify-content: flex-start; }
  }

  /* ── Dtype chip — table-scoped uniform width so q4 and q4f16 don't visually drift ── */
  :global(.results-table .dtype-chip) {
    min-width: 56px;
  }

  /* ── Backend badge — fixed width so the column doesn't jitter as labels change ── */
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
    transition: opacity var(--transition-base);
  }
  .badge-backend:hover { opacity: 0.8; }

  .backend-wasm      { color: var(--color-backend-wasm-1);   border-color: var(--color-backend-wasm-1); }
  .backend-webgpu    { color: var(--color-backend-webgpu);   border-color: var(--color-backend-webgpu); }
  .backend-webnn-cpu { color: var(--color-backend-webnn-cpu);border-color: var(--color-backend-webnn-cpu); }
  .backend-webnn-gpu { color: var(--color-backend-webnn-gpu);border-color: var(--color-backend-webnn-gpu); }
  .backend-webnn-npu { color: var(--color-backend-webnn-npu);border-color: var(--color-backend-webnn-npu); }
  .backend-unknown   { color: var(--color-text-muted);       border-color: var(--color-border); }
</style>
