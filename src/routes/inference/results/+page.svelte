<script lang="ts">
  import type { ResultRow } from './+page.server';
  import { getBackendLabel } from '$lib/engine/backends';
  import { browser } from '$app/environment';
  import { auth, isAuthenticated } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { createClient } from '$lib/supabase/client';
  import { loginUrl, locationPath } from '$lib/utils/login-redirect';
  import { autoTitle } from '$lib/utils/auto-title';

  let { data } = $props();

  $effect(() => {
    if (browser && !$auth.loading && !$isAuthenticated) {
      goto(loginUrl(locationPath(window.location)));
    }
  });

  // Initialise filters from URL params (enables shareable/bookmarkable filter URLs)
  const sp = browser ? new URL(location.href).searchParams : new URLSearchParams();
  let filterBackend    = $state(sp.get('backend')  ?? '');
  let filterDataType   = $state(sp.get('dtype')    ?? '');
  let filterStatus     = $state(sp.get('status')   ?? '');
  let filterWebnnEp    = $state(sp.get('ep')       ?? '');
  let filterFramework  = $state(sp.get('fw')       ?? '');
  let filterQuery      = $state(sp.get('q')        ?? '');
  let filterOs         = $state(sp.get('os')       ?? '');
  let filterBrowser    = $state(sp.get('br')       ?? '');
  let filterBrowserVer = $state(sp.get('brv')      ?? '');
  let filterCpu        = $state(sp.get('cpu')      ?? '');
  let filterGpu        = $state(sp.get('gpu')      ?? '');
  let filterGpuDriver  = $state(sp.get('gpudrv')   ?? '');
  let filterNpuDriver  = $state(sp.get('npudrv')   ?? '');

  // Sync filter state → URL (replaceState so it doesn't pollute browser history)
  $effect(() => {
    if (!browser) return;
    const params = new URLSearchParams();
    if (filterQuery)      params.set('q',       filterQuery);
    if (filterDataType)   params.set('dtype',    filterDataType);
    if (filterBackend)    params.set('backend',  filterBackend);
    if (filterWebnnEp)    params.set('ep',       filterWebnnEp);
    if (filterFramework)  params.set('fw',       filterFramework);
    if (filterStatus)     params.set('status',   filterStatus);
    if (filterOs)         params.set('os',       filterOs);
    if (filterBrowser)    params.set('br',       filterBrowser);
    if (filterBrowserVer) params.set('brv',      filterBrowserVer);
    if (filterCpu)        params.set('cpu',      filterCpu);
    if (filterGpu)        params.set('gpu',      filterGpu);
    if (filterGpuDriver)  params.set('gpudrv',   filterGpuDriver);
    if (filterNpuDriver)  params.set('npudrv',   filterNpuDriver);
    const qs = params.toString();
    const next = qs ? `?${qs}` : location.pathname;
    history.replaceState(history.state, '', next);
  });

  const backends  = $derived(data.distinctBackends  ?? []);
  const dataTypes = $derived(data.distinctDataTypes ?? []);
  const statuses  = $derived(data.distinctStatuses  ?? []);
  const webnnEps  = $derived(data.distinctWebnnEps  ?? []);
  const frameworks = $derived(data.distinctFrameworks ?? []);

  const distinctOs          = $derived(data.distinctOs          ?? []);
  const distinctBrowsers    = $derived(data.distinctBrowsers    ?? []);
  const distinctBrowserVers = $derived(data.distinctBrowserVers ?? []);
  const distinctCpus        = $derived(data.distinctCpus        ?? []);
  const distinctGpus        = $derived(data.distinctGpus        ?? []);
  const distinctGpuDrivers  = $derived(data.distinctGpuDrivers  ?? []);
  const distinctNpuDrivers  = $derived(data.distinctNpuDrivers  ?? []);

  function getFrameworkLabel(r: ResultRow): string {
    if (r.ort_version) return `ORT Web ${r.ort_version}`;
    if (r.litert_version) return `LiteRT.js ${r.litert_version}`;
    return '';
  }

  const filtered = $derived(
    data.results.filter((r: ResultRow) => {
      if (filterBackend    && r.backend !== filterBackend) return false;
      if (filterDataType   && r.data_type !== filterDataType) return false;
      if (filterStatus     && r.status !== filterStatus) return false;
      if (filterWebnnEp    && r.webnn_ep !== filterWebnnEp) return false;
      if (filterFramework  && getFrameworkLabel(r) !== filterFramework) return false;
      if (filterOs         && r.os !== filterOs) return false;
      if (filterBrowser    && r.browser !== filterBrowser) return false;
      if (filterBrowserVer && r.browser_version !== filterBrowserVer) return false;
      if (filterCpu        && r.cpu !== filterCpu) return false;
      if (filterGpu        && r.gpu !== filterGpu) return false;
      if (filterGpuDriver  && r.gpu_driver_version !== filterGpuDriver) return false;
      if (filterNpuDriver  && r.npu_driver_version !== filterNpuDriver) return false;
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

  // Pagination
  const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000];
  let pageSize = $state(20);
  let currentPage = $state(1);
  const totalPages = $derived(Math.ceil(sorted.length / pageSize));
  const paged = $derived(sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize));

  $effect(() => { void filterQuery, filterBackend, filterDataType, filterStatus, filterWebnnEp, filterFramework, filterOs, filterBrowser, filterBrowserVer, filterCpu, filterGpu, filterGpuDriver, filterNpuDriver, pageSize; currentPage = 1; });

  // Any filter active — used by the sidebar's Clear button.
  const anyFilterActive = $derived(
    !!(filterQuery || filterBackend || filterDataType || filterStatus || filterWebnnEp ||
       filterFramework || filterOs || filterBrowser || filterBrowserVer ||
       filterCpu || filterGpu || filterGpuDriver || filterNpuDriver)
  );

  function clearFilters() {
    filterQuery = ''; filterBackend = ''; filterDataType = ''; filterStatus = ''; filterWebnnEp = '';
    filterFramework = ''; filterOs = ''; filterBrowser = ''; filterBrowserVer = '';
    filterCpu = ''; filterGpu = ''; filterGpuDriver = ''; filterNpuDriver = '';
  }

  // Bulk selection — current page only
  let selectedIds = $state<Set<string>>(new Set());

  // Reset selection when page changes
  $effect(() => {
    void currentPage;
    selectedIds = new Set();
  });

  const pagedIds = $derived(paged.map((r: ResultRow) => r.id));
  const allPageSelected = $derived(pagedIds.length > 0 && pagedIds.every((id: string) => selectedIds.has(id)));
  const somePageSelected = $derived(pagedIds.some((id: string) => selectedIds.has(id)));

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
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  // Delete selected rows
  let deleteInProgress = $state(false);
  let deleteError = $state('');

  async function deleteSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} result${ids.length !== 1 ? 's' : ''}?`)) return;
    deleteInProgress = true;
    deleteError = '';
    try {
      const supabase = createClient();
      const { error, count } = await (supabase.from('results') as any).delete().in('id', ids).select('id', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      if (count === 0) throw new Error('Delete blocked — no permission or rows not found.');
      // Remove from local state via reactive reassignment
      data = { ...data, results: data.results.filter((r: ResultRow) => !selectedIds.has(r.id)) };
      selectedIds = new Set();
    } catch (e: any) {
      deleteError = e.message ?? 'Delete failed';
    } finally {
      deleteInProgress = false;
    }
  }

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

  // Indeterminate state for select-all checkbox
  let selectAllEl = $state<HTMLInputElement | null>(null);
  $effect(() => {
    if (selectAllEl) selectAllEl.indeterminate = somePageSelected && !allPageSelected;
  });

  // Backend badge colors
  const BACKEND_COLORS: Record<string, string> = {
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

  // Optional columns — user can show/hide, persisted to localStorage
  type OptColKey =
    | 'dtype' | 'backend' | 'webnn_ep' | 'status'
    | 'compilation' | 'load_compile' | 'first_inf' | 'ttf'
    | 'avg' | 'median' | 'best' | 'p90' | 'fps'
    | 'framework' | 'iterations'
    | 'os' | 'browser' | 'browser_ver' | 'cpu' | 'gpu' | 'gpu_driver' | 'npu_driver';

  interface OptCol {
    key: OptColKey;
    label: string;
    defaultVisible: boolean;
  }

  const OPTIONAL_COLS: OptCol[] = [
    // Default-on
    { key: 'dtype',       label: 'Data Type',       defaultVisible: true  },
    { key: 'backend',     label: 'Backend',         defaultVisible: true  },
    { key: 'webnn_ep',    label: 'WebNN EP',        defaultVisible: true  },
    { key: 'status',      label: 'Status',          defaultVisible: true  },
    { key: 'compilation', label: 'Compile',         defaultVisible: true  },
    { key: 'load_compile',label: 'Load+Compile',    defaultVisible: true  },
    { key: 'first_inf',   label: '1st Inf',         defaultVisible: true  },
    { key: 'ttf',         label: 'TTF',             defaultVisible: true  },
    { key: 'avg',         label: 'Avg',             defaultVisible: true  },
    { key: 'median',      label: 'Median',          defaultVisible: true  },
    { key: 'best',        label: 'Best',            defaultVisible: true  },
    { key: 'p90',         label: 'P90',             defaultVisible: true  },
    { key: 'fps',         label: 'FPS',             defaultVisible: true  },
    // Default-off
    { key: 'framework',   label: 'JS Framework',    defaultVisible: false },
    { key: 'iterations',  label: 'Iterations',      defaultVisible: false },
    { key: 'os',          label: 'OS',              defaultVisible: false },
    { key: 'browser',     label: 'Browser',         defaultVisible: false },
    { key: 'browser_ver', label: 'Browser Version', defaultVisible: false },
    { key: 'cpu',         label: 'CPU',             defaultVisible: false },
    { key: 'gpu',         label: 'GPU',             defaultVisible: false },
    { key: 'gpu_driver',  label: 'GPU Driver',      defaultVisible: false },
    { key: 'npu_driver',  label: 'NPU Driver',      defaultVisible: false },
  ];

  const LS_KEY = 'results_visible_cols_v2';

  function loadVisibleCols(): Set<OptColKey> {
    const defaults = new Set(OPTIONAL_COLS.filter(c => c.defaultVisible).map(c => c.key));
    if (!browser) return defaults;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw !== null) return new Set(JSON.parse(raw) as OptColKey[]);
    } catch {}
    // First visit — persist defaults immediately
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

  function exportColumns(): { label: string; get: (r: ResultRow) => string }[] {
    const cols: { label: string; get: (r: ResultRow) => string }[] = [
      { label: 'Model', get: r => r.model_id },
      { label: 'File',  get: r => r.file_path },
    ];
    if (isVisible('dtype'))        cols.push({ label: 'Type',         get: r => r.data_type });
    if (isVisible('backend'))      cols.push({ label: 'Backend',      get: r => getBackendLabel(r.backend) });
    if (isVisible('webnn_ep'))     cols.push({ label: 'WebNN EP',     get: r => r.webnn_ep ?? '' });
    if (isVisible('status'))       cols.push({ label: 'Status',       get: r => r.status });
    if (isVisible('compilation'))  cols.push({ label: 'Compile',      get: r => fmt(r.compilation_ms) });
    if (isVisible('load_compile')) cols.push({ label: 'Load+Compile', get: r => fmt(r.load_and_compile_ms) });
    if (isVisible('first_inf'))    cols.push({ label: '1st Inf',      get: r => fmt(r.first_inference_ms) });
    if (isVisible('ttf'))          cols.push({ label: 'TTF',          get: r => fmt(r.time_to_first_ms) });
    if (isVisible('avg'))          cols.push({ label: 'Avg',          get: r => fmt(r.average_ms) });
    if (isVisible('median'))       cols.push({ label: 'Median',       get: r => fmt(r.median_ms) });
    if (isVisible('best'))         cols.push({ label: 'Best',         get: r => fmt(r.best_ms) });
    if (isVisible('p90'))          cols.push({ label: 'P90',          get: r => fmt(r.p90_ms) });
    if (isVisible('fps'))          cols.push({ label: 'FPS',          get: r => fmt(r.throughput_fps) });
    if (isVisible('framework'))    cols.push({ label: 'Framework',    get: r => getFrameworkLabel(r) });
    if (isVisible('iterations'))   cols.push({ label: 'Iterations',   get: r => `${r.iterations_completed}/${r.iterations}` });
    if (isVisible('os'))           cols.push({ label: 'OS',           get: r => r.os ?? '' });
    if (isVisible('browser'))      cols.push({ label: 'Browser',      get: r => r.browser ?? '' });
    if (isVisible('browser_ver'))  cols.push({ label: 'Browser Ver',  get: r => r.browser_version ?? '' });
    if (isVisible('cpu'))          cols.push({ label: 'CPU',          get: r => r.cpu ?? '' });
    if (isVisible('gpu'))          cols.push({ label: 'GPU',          get: r => r.gpu ?? '' });
    if (isVisible('gpu_driver'))   cols.push({ label: 'GPU Driver',   get: r => r.gpu_driver_version ?? '' });
    if (isVisible('npu_driver'))   cols.push({ label: 'NPU Driver',   get: r => r.npu_driver_version ?? '' });
    cols.push({ label: 'Date', get: r => r.started_at });
    return cols;
  }

  function toMarkdown(): string {
    const cols = exportColumns();
    const sep = cols.map(() => '---');
    const rows = sorted.map(r => cols.map(c => c.get(r)));
    return [cols.map(c => c.label).join(' | '), sep.join(' | '), ...rows.map(r => r.join(' | '))].join('\n');
  }
  function toJSON(): string {
    return JSON.stringify(sorted.map(r => {
      const obj: Record<string, any> = { model: r.model_id, file: r.file_path };
      if (isVisible('dtype'))        obj.data_type           = r.data_type;
      if (isVisible('backend'))      obj.backend             = r.backend;
      if (isVisible('webnn_ep'))     obj.webnn_ep            = r.webnn_ep;
      if (isVisible('status'))       obj.status              = r.status;
      if (isVisible('compilation'))  obj.compilation_ms      = r.compilation_ms;
      if (isVisible('load_compile')) obj.load_and_compile_ms = r.load_and_compile_ms;
      if (isVisible('first_inf'))    obj.first_inference_ms  = r.first_inference_ms;
      if (isVisible('ttf'))          obj.time_to_first_ms    = r.time_to_first_ms;
      if (isVisible('avg'))          obj.average_ms          = r.average_ms;
      if (isVisible('median'))       obj.median_ms           = r.median_ms;
      if (isVisible('best'))         obj.best_ms             = r.best_ms;
      if (isVisible('p90'))          obj.p90_ms              = r.p90_ms;
      if (isVisible('fps'))          obj.throughput_fps      = r.throughput_fps;
      if (isVisible('framework'))    obj.framework           = getFrameworkLabel(r);
      if (isVisible('iterations'))   obj.iterations          = { completed: r.iterations_completed, total: r.iterations };
      if (isVisible('os'))           obj.os                  = r.os;
      if (isVisible('browser'))      obj.browser             = r.browser;
      if (isVisible('browser_ver'))  obj.browser_version     = r.browser_version;
      if (isVisible('cpu'))          obj.cpu                 = r.cpu;
      if (isVisible('gpu'))          obj.gpu                 = r.gpu;
      if (isVisible('gpu_driver'))   obj.gpu_driver_version  = r.gpu_driver_version;
      if (isVisible('npu_driver'))   obj.npu_driver_version  = r.npu_driver_version;
      obj.started_at = r.started_at;
      return obj;
    }), null, 2);
  }
  function toCSV(): string {
    const cols = exportColumns();
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = sorted.map(r => cols.map(c => escape(c.get(r))));
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
  const baseName = $derived(`results-${dateSuffix()}`);
  function saveMarkdown() { saveFile(toMarkdown(), `${baseName}.md`,   'text/markdown'); }
  function saveJSON()     { saveFile(toJSON(),     `${baseName}.json`, 'application/json'); }
  function saveCSV()      { saveFile(toCSV(),      `${baseName}.csv`,  'text/csv'); }
</script>

<div class="results-page">
  {#if data.error}
    <p class="error-text">{data.error}</p>
  {:else if data.results.length === 0}
    <header class="page-header">
      <h1>My Results</h1>
      <p>Your benchmark history. 0 results.</p>
    </header>
    <div class="empty">
      <p>No benchmark results yet. Run a benchmark with "Save results" enabled.</p>
    </div>
  {:else}
    <section class="rs-layout">
      <aside class="rs-sidebar" use:autoTitle>
        <div class="sb-section">
          <div class="sb-section-head">
            <span class="sb-section-title">Search</span>
            {#if anyFilterActive}
              <button type="button" class="sb-clear-btn" onclick={clearFilters} title="Reset all filters">Clear filters</button>
            {/if}
          </div>
          <input class="sb-input sb-input-text" type="text" placeholder="Model or file…" bind:value={filterQuery} />
        </div>

        <div class="sb-section">
          <div class="sb-section-head"><span class="sb-section-title">Run</span></div>
          <div class="sb-row">
            <span class="sb-label">Data Type</span>
            <select class="sb-input" bind:value={filterDataType}>
              <option value="">All</option>
              {#each dataTypes as dt}<option value={dt}>{dt}</option>{/each}
            </select>
          </div>
          <div class="sb-row">
            <span class="sb-label">Backend</span>
            <select class="sb-input" bind:value={filterBackend}>
              <option value="">All</option>
              {#each backends as b}<option value={b}>{getBackendLabel(b)}</option>{/each}
            </select>
          </div>
          <div class="sb-row">
            <span class="sb-label">WebNN EP</span>
            <select class="sb-input" bind:value={filterWebnnEp}>
              <option value="">All</option>
              {#each webnnEps as ep}<option value={ep}>{ep}</option>{/each}
            </select>
          </div>
          <div class="sb-row">
            <span class="sb-label">Framework</span>
            <select class="sb-input" bind:value={filterFramework}>
              <option value="">All</option>
              {#each frameworks as fw}<option value={fw}>{fw}</option>{/each}
            </select>
          </div>
          <div class="sb-row">
            <span class="sb-label">Status</span>
            <select class="sb-input" bind:value={filterStatus}>
              <option value="">All</option>
              {#each statuses as s}<option value={s}>{s}</option>{/each}
            </select>
          </div>
        </div>

        <div class="sb-section">
          <div class="sb-section-head"><span class="sb-section-title">Environment</span></div>
          <div class="sb-row">
            <span class="sb-label">OS</span>
            <select class="sb-input" bind:value={filterOs}>
              <option value="">All</option>
              {#each distinctOs as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
          <div class="sb-row">
            <span class="sb-label">Browser</span>
            <select class="sb-input" bind:value={filterBrowser}>
              <option value="">All</option>
              {#each distinctBrowsers as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
          <div class="sb-row">
            <span class="sb-label">Browser Ver</span>
            <select class="sb-input" bind:value={filterBrowserVer}>
              <option value="">All</option>
              {#each distinctBrowserVers as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
        </div>

        <div class="sb-section">
          <div class="sb-section-head"><span class="sb-section-title">Hardware</span></div>
          <div class="sb-row">
            <span class="sb-label">CPU</span>
            <select class="sb-input" bind:value={filterCpu}>
              <option value="">All</option>
              {#each distinctCpus as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
          <div class="sb-row">
            <span class="sb-label">GPU</span>
            <select class="sb-input" bind:value={filterGpu}>
              <option value="">All</option>
              {#each distinctGpus as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
          <div class="sb-row">
            <span class="sb-label">GPU Driver</span>
            <select class="sb-input" bind:value={filterGpuDriver}>
              <option value="">All</option>
              {#each distinctGpuDrivers as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
          <div class="sb-row">
            <span class="sb-label">NPU Driver</span>
            <select class="sb-input" bind:value={filterNpuDriver}>
              <option value="">All</option>
              {#each distinctNpuDrivers as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
        </div>

      </aside>

      <div class="rs-main">
        <header class="page-header page-header-row">
          <div class="page-header-text">
            <h1>My Results</h1>
            <p>Your benchmark history. {filtered.length} result{filtered.length !== 1 ? 's' : ''}.</p>
          </div>
          <div class="page-header-actions">
            {#if selectedIds.size > 0}
              <button
                class="delete-btn"
                onclick={deleteSelected}
                disabled={deleteInProgress}
              >
                {deleteInProgress ? 'Deleting…' : `Delete ${selectedIds.size} row${selectedIds.size !== 1 ? 's' : ''}`}
              </button>
              {#if deleteError}
                <span class="delete-error">{deleteError}</span>
              {/if}
            {/if}
            {#if sorted.length > 0}
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

    <div class="table-wrapper">
      <table class="results-table">
        <thead>
          <tr>
            <th class="th-check">
              <input
                bind:this={selectAllEl}
                type="checkbox"
                class="row-check"
                checked={allPageSelected}
                onchange={toggleSelectAll}
                title="Select all on this page"
              />
            </th>
            <th class="th-model sortable" onclick={() => toggleSort('model')}>Model{sortIndicator('model')}</th>
            <th class="th-file sortable" onclick={() => toggleSort('file')}>File{sortIndicator('file')}</th>
            {#if isVisible('dtype')}<th class="sortable" onclick={() => toggleSort('dtype')}>Type{sortIndicator('dtype')}</th>{/if}
            {#if isVisible('backend')}<th class="sortable" onclick={() => toggleSort('backend')}>Backend{sortIndicator('backend')}</th>{/if}
            {#if isVisible('webnn_ep')}<th class="sortable" onclick={() => toggleSort('webnn_ep')}>WebNN EP{sortIndicator('webnn_ep')}</th>{/if}
            {#if isVisible('status')}<th class="sortable" onclick={() => toggleSort('status')}>Status{sortIndicator('status')}</th>{/if}
            {#if isVisible('compilation')}<th class="sortable" onclick={() => toggleSort('compilation')} title="Compilation time (compilation_ms) — time for the runtime to compile/JIT the model graph for the selected backend, in ms. One-time cost per session. Lower is better.">Compile{sortIndicator('compilation')}</th>{/if}
            {#if isVisible('load_compile')}<th class="sortable" onclick={() => toggleSort('load_compile')} title="Load + Compile (load_and_compile_ms) — total time to fetch/decode model bytes plus compile, in ms. One-time cost per session. Lower is better.">Load+Compile{sortIndicator('load_compile')}</th>{/if}
            {#if isVisible('first_inf')}<th class="sortable" onclick={() => toggleSort('first_inf')} title="First Inference latency (first_inference_ms) — wall-clock time of the very first run() call after the model is compiled, in ms. Includes warm-up/JIT effects, so usually higher than steady-state runs. Lower is better.">1st Inf{sortIndicator('first_inf')}</th>{/if}
            {#if isVisible('ttf')}<th class="sortable" onclick={() => toggleSort('ttf')} title="Time To First inference (time_to_first_ms) — total time from kicking off the benchmark to producing the first inference result. Includes load + compile + first inference. Lower is better.">TTF{sortIndicator('ttf')}</th>{/if}
            {#if isVisible('avg')}<th class="sortable" onclick={() => toggleSort('avg')} title="Average inference latency (average_ms) — arithmetic mean across the timed iterations (warm-up excluded), in ms. Lower is better.">Avg{sortIndicator('avg')}</th>{/if}
            {#if isVisible('median')}<th class="sortable" onclick={() => toggleSort('median')} title="Median inference latency (median_ms) — 50th percentile across timed iterations, in ms. Robust to outliers. Lower is better.">Median{sortIndicator('median')}</th>{/if}
            {#if isVisible('best')}<th class="sortable" onclick={() => toggleSort('best')} title="Best inference latency (best_ms) — minimum (fastest) iteration time, in ms. Reflects best-case throughput on this hardware. Lower is better.">Best{sortIndicator('best')}</th>{/if}
            {#if isVisible('p90')}<th class="sortable" onclick={() => toggleSort('p90')} title="P90 inference latency (p90_ms) — 90th percentile across timed iterations, in ms. Useful for tail-latency / worst-case behavior. Lower is better.">P90{sortIndicator('p90')}</th>{/if}
            {#if isVisible('fps')}<th class="sortable" onclick={() => toggleSort('fps')} title="Throughput (throughput_fps) — frames/inferences per second, computed as 1000 / median_ms. Higher is better.">FPS{sortIndicator('fps')}</th>{/if}
            {#if isVisible('framework')}<th>Framework</th>{/if}
            {#if isVisible('iterations')}<th>Iters</th>{/if}
            {#if isVisible('os')}<th>OS</th>{/if}
            {#if isVisible('browser')}<th>Browser</th>{/if}
            {#if isVisible('browser_ver')}<th>Browser Ver</th>{/if}
            {#if isVisible('cpu')}<th>CPU</th>{/if}
            {#if isVisible('gpu')}<th>GPU</th>{/if}
            {#if isVisible('gpu_driver')}<th>GPU Driver</th>{/if}
            {#if isVisible('npu_driver')}<th>NPU Driver</th>{/if}
            <th class="sortable" onclick={() => toggleSort('started')}>Date{sortIndicator('started')}</th>
          </tr>
        </thead>
        <tbody>
          {#each paged as row}
            <tr class:row-selected={selectedIds.has(row.id)}>
              <td class="cell-check">
                <input
                  type="checkbox"
                  class="row-check"
                  checked={selectedIds.has(row.id)}
                  onchange={() => toggleRow(row.id)}
                />
              </td>
              <td class="cell-model cell-copy" title="Click to copy: {row.model_id}" onclick={() => copyCell(row.model_id)}>{row.model_id}</td>
              <td class="cell-file"><a href="/inference/results/{row.id}" class="cell-link" title={row.file_path}>{row.file_path}</a></td>
              {#if isVisible('dtype')}<td><span class="dtype-chip" data-dtype={row.data_type}>{row.data_type}</span></td>{/if}
              {#if isVisible('backend')}<td><span class="badge-backend {backendClass(row.backend)}">{getBackendLabel(row.backend)}</span></td>{/if}
              {#if isVisible('webnn_ep')}<td class="cell-ep">{row.webnn_ep || '—'}</td>{/if}
              {#if isVisible('status')}<td><span class="status-dot" class:status-ok={row.status === 'completed'} class:status-error={row.status === 'error'} class:status-running={row.status === 'running'} title={row.error_message || row.status}></span></td>{/if}
              {#if isVisible('compilation')}<td class="cell-metric">{fmt(row.compilation_ms)}</td>{/if}
              {#if isVisible('load_compile')}<td class="cell-metric">{fmt(row.load_and_compile_ms)}</td>{/if}
              {#if isVisible('first_inf')}<td class="cell-metric">{fmt(row.first_inference_ms)}</td>{/if}
              {#if isVisible('ttf')}<td class="cell-metric">{fmt(row.time_to_first_ms)}</td>{/if}
              {#if isVisible('avg')}<td class="cell-metric">{fmt(row.average_ms)}</td>{/if}
              {#if isVisible('median')}<td class="cell-metric">{fmt(row.median_ms)}</td>{/if}
              {#if isVisible('best')}<td class="cell-metric">{fmt(row.best_ms)}</td>{/if}
              {#if isVisible('p90')}<td class="cell-metric">{fmt(row.p90_ms)}</td>{/if}
              {#if isVisible('fps')}<td class="cell-metric">{fmt(row.throughput_fps)}</td>{/if}
              {#if isVisible('framework')}<td class="cell-opt">{getFrameworkLabel(row) || '—'}</td>{/if}
              {#if isVisible('iterations')}<td class="cell-opt">{row.iterations_completed}/{row.iterations}</td>{/if}
              {#if isVisible('os')}<td class="cell-opt">{row.os || '—'}</td>{/if}
              {#if isVisible('browser')}<td class="cell-opt">{row.browser || '—'}</td>{/if}
              {#if isVisible('browser_ver')}<td class="cell-opt">{row.browser_version || '—'}</td>{/if}
              {#if isVisible('cpu')}<td class="cell-opt cell-opt-long" title={row.cpu}>{row.cpu || '—'}</td>{/if}
              {#if isVisible('gpu')}<td class="cell-opt cell-opt-long" title={row.gpu}>{row.gpu || '—'}</td>{/if}
              {#if isVisible('gpu_driver')}<td class="cell-opt">{row.gpu_driver_version || '—'}</td>{/if}
              {#if isVisible('npu_driver')}<td class="cell-opt">{row.npu_driver_version || '—'}</td>{/if}
              <td class="cell-date">{fmtDate(row.started_at)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
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
          {#each PAGE_SIZE_OPTIONS as n}
            <option value={n}>{n}</option>
          {/each}
        </select>
      </div>
    </div>
      </div>
    </section>
  {/if}
</div>

{#if cellCopiedMsg}
  <div class="copy-toast">{cellCopiedMsg}</div>
{/if}

<style>
  .results-page {
    max-width: 100%;
  }

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
  .col-picker-wrap {
    position: relative;
  }
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

  .cell-opt-long {
    max-width: 12vw;
    overflow: hidden;
    text-overflow: ellipsis;
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

  .th-check {
    width: 28px;
    padding: var(--space-1) 6px !important;
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
    padding: 2px var(--space-1);
    border-bottom: 1px solid var(--color-border);
    text-align: center;
    white-space: nowrap;
  }

  .results-table tbody tr:hover {
    background: var(--color-nav-item-hover);
  }

  .results-table tbody tr.row-selected {
    background: var(--color-accent-light);
  }

  .cell-check {
    padding: 0 6px !important;
    width: 28px;
  }

  .row-check {
    cursor: pointer;
    accent-color: var(--color-primary);
    width: 14px;
    height: 14px;
    vertical-align: middle;
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

  .cell-metric {
    font-variant-numeric: tabular-nums;
  }

  .cell-date {
    font-family: var(--font-ui);
    font-size: 10px;
    color: var(--color-text-muted);
  }

  /* ── Data type chip — reuses global dtype-chip but overrides min-width for table */
  :global(.results-table .dtype-chip) {
    min-width: unset;
  }

  /* ── Backend badges ────────────────────────────────────── */
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

  .badge-backend:hover {
    opacity: 0.8;
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

  /* ── Status dot ───────────────────────────────────────── */
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

  /* ── Table footer ─────────────────────────────────────── */
  .table-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-top: var(--space-2);
    flex-wrap: wrap;
  }

  .footer-left {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 120px;
  }

  .footer-center {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .footer-right {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 120px;
    justify-content: flex-end;
  }

  .footer-count {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
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

  .delete-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .delete-error {
    font-size: var(--text-xs);
    color: var(--color-error);
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

  .rows-label {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

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

  .rows-select:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
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
    .rs-layout {
      grid-template-columns: 1fr;
    }
    .rs-sidebar {
      position: static;
      max-height: none;
    }
    .table-footer {
      flex-direction: column;
      align-items: stretch;
    }
    .footer-center { justify-content: center; }
    .footer-right { justify-content: flex-start; }
  }
</style>
