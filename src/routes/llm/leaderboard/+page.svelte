<script lang="ts">
  import type { ResultsLlmRow } from '$lib/engine/types';
  import { getBackendLabel } from '$lib/engine/backends';
  import { browser } from '$app/environment';
  import { auth } from '$lib/stores/auth';
  import { isAtLeast } from '$lib/types/roles';
  import { goto } from '$app/navigation';
  import { loginUrl, locationPath } from '$lib/utils/login-redirect';
  import { autoTitle } from '$lib/utils/auto-title';

  let { data } = $props();

  const accessDenied = $derived(
    browser && !$auth.loading && !isAtLeast($auth.role ?? 'anonymous', 'partner')
  );

  $effect(() => {
    if (browser && !$auth.loading && $auth.role === 'anonymous' && !$auth.session) {
      goto(loginUrl(locationPath(window.location)));
    }
  });

  // ─────── Axes ───────
  type AxisKey =
    | 'framework' | 'backend' | 'webnn_ep' | 'data_type'
    | 'browser' | 'browser_version'
    | 'cpu' | 'gpu' | 'gpu_driver_version' | 'npu_driver_version';

  function frameworkLabel(r: ResultsLlmRow): string {
    if (!r.runtime) return '';
    return r.runtime_version ? `${r.runtime} ${r.runtime_version}` : r.runtime;
  }

  interface AxisDef {
    key: AxisKey;
    label: string;
    titleNoun: string;
    titleVerb: string;
    /** Returns the comparison value for a row. */
    getValue: (r: ResultsLlmRow) => string | null | undefined;
    options: string[];
    fmt?: (v: string) => string;
  }

  const axisDefs = $derived<AxisDef[]>([
    {
      key: 'framework', label: 'Runtime / Version', titleNoun: 'LLM Runtime',
      titleVerb: 'Compare LLM performance between runtimes / versions',
      getValue: frameworkLabel, options: data.distinctFrameworks ?? [],
    },
    {
      key: 'backend', label: 'Backend', titleNoun: 'Backend',
      titleVerb: 'Compare LLM performance between backends',
      getValue: r => r.backend, options: data.distinctBackends ?? [], fmt: getBackendLabel,
    },
    {
      key: 'webnn_ep', label: 'WebNN EP', titleNoun: 'WebNN EP',
      titleVerb: 'Compare LLM performance between WebNN Execution Providers',
      getValue: r => r.webnn_ep, options: data.distinctEps ?? [],
    },
    {
      key: 'data_type', label: 'Data Type', titleNoun: 'Data Type',
      titleVerb: 'Compare LLM performance between data types',
      getValue: r => r.data_type, options: data.distinctDataTypes ?? [],
    },
    {
      key: 'browser', label: 'Browser', titleNoun: 'Browser',
      titleVerb: 'Compare LLM performance between browsers',
      getValue: r => r.browser, options: data.distinctBrowsers ?? [],
    },
    {
      key: 'browser_version', label: 'Browser Version', titleNoun: 'Browser Version',
      titleVerb: 'Compare LLM performance between browser versions',
      getValue: r => r.browser_version, options: data.distinctBrowserVers ?? [],
    },
    {
      key: 'cpu', label: 'CPU', titleNoun: 'CPU',
      titleVerb: 'Compare LLM performance between CPUs',
      getValue: r => r.cpu, options: data.distinctCpus ?? [],
    },
    {
      key: 'gpu', label: 'GPU', titleNoun: 'GPU',
      titleVerb: 'Compare LLM performance between GPUs',
      getValue: r => r.gpu, options: data.distinctGpus ?? [],
    },
    {
      key: 'gpu_driver_version', label: 'GPU Driver', titleNoun: 'GPU Driver',
      titleVerb: 'Compare LLM performance between GPU drivers',
      getValue: r => r.gpu_driver_version, options: data.distinctGpuDrivers ?? [],
    },
    {
      key: 'npu_driver_version', label: 'NPU Driver', titleNoun: 'NPU Driver',
      titleVerb: 'Compare LLM performance between NPU drivers',
      getValue: r => r.npu_driver_version, options: data.distinctNpuDrivers ?? [],
    },
  ]);

  const METRICS = [
    { key: 'tps',                  label: 'TPS (tok/s)',           higherBetter: true,  tooltip: 'Decode throughput = (output_tokens − 1) / (e2e − ttft). Higher is better. Steady-state token generation rate in tok/s.' },
    { key: 'e2e_tps',              label: 'E2E TPS (tok/s)',       higherBetter: true,  tooltip: 'End-to-end throughput = output_tokens / e2e. Higher is better. Effective tok/s including prefill cost.' },
    { key: 'ttft_ms',              label: 'TTFT (ms)',             higherBetter: false, tooltip: 'Time To First Token. Lower is better. Wall clock from generate() to the first decoded token.' },
    { key: 'tpot_ms',              label: 'TPOT (ms/tok)',         higherBetter: false, tooltip: 'Time Per Output Token = (e2e − ttft) / (output_tokens − 1). Lower is better. Average per-token decode latency.' },
    { key: 'decode_ms',            label: 'Decode (ms)',           higherBetter: false, tooltip: 'Decode-phase wall time. e2e − ttft. Lower is better.' },
    { key: 'e2e_ms',               label: 'E2E (ms)',              higherBetter: false, tooltip: 'End-to-end wall time from generate() to last token. Lower is better. Includes prefill + decode.' },
    { key: 'compilation_ms',       label: 'Compilation (ms)',      higherBetter: false, tooltip: 'Initial model compilation time. One-time cost per session. Lower is better.' },
    { key: 'load_and_compile_ms',  label: 'Load + Compile (ms)',   higherBetter: false, tooltip: 'Fetch model bytes + compile. One-time cost per session. Lower is better.' },
    { key: 'output_tokens',        label: 'Output Tokens',         higherBetter: true,  tooltip: 'Tokens the model generated this run. Equals max_new_tokens unless EOS stopped it early.' },
  ] as const;

  // ─────── State (URL hash) ───────
  function parseHash(): Record<string, string> {
    if (!browser) return {};
    const params = new URLSearchParams(location.hash.slice(1));
    const out: Record<string, string> = {};
    for (const [k, v] of params) out[k] = v;
    return out;
  }

  const initial = parseHash();
  let axis           = $state<AxisKey>((initial.axis as AxisKey) || 'framework');
  let valueA         = $state(initial.a ?? '');
  let valueB         = $state(initial.b ?? '');
  let selectedMetric = $state<string>(initial.metric ?? 'tps');

  let filterBackend     = $state(initial.backend ?? '');
  let filterDataType    = $state(initial.dtype ?? '');
  let filterFramework   = $state(initial.framework ?? '');
  let filterEp          = $state(initial.ep ?? '');
  let filterBrowser     = $state(initial.br ?? '');
  let filterBrowserVer  = $state(initial.brv ?? '');
  let filterCpu         = $state(initial.cpu ?? '');
  let filterGpu         = $state(initial.gpu ?? '');
  let filterGpuDriver   = $state(initial.gpudrv ?? '');
  let filterNpuDriver   = $state(initial.npudrv ?? '');

  const currentAxis = $derived(axisDefs.find(a => a.key === axis) ?? axisDefs[0]);
  const currentMetric = $derived(METRICS.find(m => m.key === selectedMetric) ?? METRICS[0]);
  const axisOptions = $derived(currentAxis.options);

  // Swap A and B in one click — common power-user move when comparing.
  function swapAB() {
    const tmp = valueA;
    valueA = valueB;
    valueB = tmp;
    baseline = baseline === 'a' ? 'b' : 'a';
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

  $effect(() => {
    if (!axisOptions.length) return;
    const valid = new Set(axisOptions);
    if (!valid.has(valueA)) valueA = axisOptions[0] ?? '';
    if (!valid.has(valueB)) valueB = axisOptions[1] ?? axisOptions[0] ?? '';
  });

  $effect(() => {
    if (!browser) return;
    function onHashChange() {
      const p = parseHash();
      if (p.axis !== undefined)      axis             = (p.axis as AxisKey) || 'framework';
      if (p.a !== undefined)         valueA           = p.a;
      if (p.b !== undefined)         valueB           = p.b;
      if (p.backend !== undefined)   filterBackend    = p.backend;
      if (p.dtype !== undefined)     filterDataType   = p.dtype;
      if (p.framework !== undefined) filterFramework  = p.framework;
      if (p.ep !== undefined)        filterEp         = p.ep;
      if (p.br !== undefined)        filterBrowser    = p.br;
      if (p.brv !== undefined)       filterBrowserVer = p.brv;
      if (p.cpu !== undefined)       filterCpu        = p.cpu;
      if (p.gpu !== undefined)       filterGpu        = p.gpu;
      if (p.gpudrv !== undefined)    filterGpuDriver  = p.gpudrv;
      if (p.npudrv !== undefined)    filterNpuDriver  = p.npudrv;
      if (p.metric !== undefined)    selectedMetric   = p.metric;
      if (p.bl !== undefined)        baseline         = p.bl === 'b' ? 'b' : 'a';
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  });

  $effect(() => {
    if (!browser) return;
    const params = new URLSearchParams();
    if (axis !== 'framework') params.set('axis', axis);
    if (valueA) params.set('a', valueA);
    if (valueB) params.set('b', valueB);
    if (axis !== 'backend' && filterBackend) params.set('backend', filterBackend);
    if (axis !== 'data_type' && filterDataType) params.set('dtype', filterDataType);
    if (axis !== 'framework' && filterFramework) params.set('framework', filterFramework);
    if (axis !== 'webnn_ep' && filterEp) params.set('ep', filterEp);
    if (axis !== 'browser' && filterBrowser) params.set('br', filterBrowser);
    if (axis !== 'browser_version' && filterBrowserVer) params.set('brv', filterBrowserVer);
    if (axis !== 'cpu' && filterCpu) params.set('cpu', filterCpu);
    if (axis !== 'gpu' && filterGpu) params.set('gpu', filterGpu);
    if (axis !== 'gpu_driver_version' && filterGpuDriver) params.set('gpudrv', filterGpuDriver);
    if (axis !== 'npu_driver_version' && filterNpuDriver) params.set('npudrv', filterNpuDriver);
    if (selectedMetric !== 'tps') params.set('metric', selectedMetric);
    if (baseline === 'b') params.set('bl', 'b');
    history.replaceState(null, '', `#${params}`);
  });

  // ─────── Derived ───────
  const metricLabel = $derived(currentMetric.label);
  const higherBetter = $derived(currentMetric.higherBetter);
  const metricTooltip = $derived(currentMetric.tooltip ?? '');

  const backends = $derived(data.distinctBackends ?? []);
  const dataTypes = $derived(data.distinctDataTypes ?? []);
  const frameworks = $derived(data.distinctFrameworks ?? []);
  const webnnEps = $derived(data.distinctEps ?? []);
  const browsersList = $derived(data.distinctBrowsers ?? []);
  const browserVersList = $derived(data.distinctBrowserVers ?? []);
  const cpus = $derived(data.distinctCpus ?? []);
  const gpus = $derived(data.distinctGpus ?? []);
  const gpuDrivers = $derived(data.distinctGpuDrivers ?? []);
  const npuDrivers = $derived(data.distinctNpuDrivers ?? []);

  const filtered = $derived(
    data.results.filter((r: ResultsLlmRow) => {
      if (axis !== 'backend' && filterBackend && r.backend !== filterBackend) return false;
      if (axis !== 'data_type' && filterDataType && r.data_type !== filterDataType) return false;
      if (axis !== 'framework' && filterFramework && frameworkLabel(r) !== filterFramework) return false;
      if (axis !== 'webnn_ep' && filterEp && r.webnn_ep !== filterEp) return false;
      if (axis !== 'browser' && filterBrowser && r.browser !== filterBrowser) return false;
      if (axis !== 'browser_version' && filterBrowserVer && r.browser_version !== filterBrowserVer) return false;
      if (axis !== 'cpu' && filterCpu && r.cpu !== filterCpu) return false;
      if (axis !== 'gpu' && filterGpu && r.gpu !== filterGpu) return false;
      if (axis !== 'gpu_driver_version' && filterGpuDriver && r.gpu_driver_version !== filterGpuDriver) return false;
      if (axis !== 'npu_driver_version' && filterNpuDriver && r.npu_driver_version !== filterNpuDriver) return false;
      const v = currentAxis.getValue(r) ?? '';
      return v === valueA || v === valueB;
    })
  );

  interface CompareRow {
    hf_model_id: string;
    data_type: string;
    backend: string;
    framework: string;
    webnn_ep: string | null;
    browser: string | null;
    browser_version: string | null;
    cpu: string | null;
    gpu: string | null;
    os: string | null;
    gpu_driver_version: string | null;
    npu_driver_version: string | null;
    valA: number | null;
    valB: number | null;
    errorA: string | null;
    errorB: string | null;
  }

  function rowKey(r: ResultsLlmRow): string {
    const parts = [r.hf_model_id];
    if (axis !== 'data_type') parts.push(r.data_type);
    if (axis !== 'backend') parts.push(r.backend);
    return parts.join('::');
  }

  const compareRows = $derived.by(() => {
    type Entry = {
      valA: number | null; valB: number | null;
      errA: string | null; errB: string | null;
      seenA: boolean; seenB: boolean;
      data_type: string; backend: string; framework: string;
      webnn_ep: string | null;
      browser: string | null; browser_version: string | null;
      cpu: string | null; gpu: string | null; os: string | null;
      gpu_driver_version: string | null; npu_driver_version: string | null;
    };
    const map = new Map<string, Entry>();

    for (const r of filtered) {
      const k = rowKey(r);
      if (!map.has(k)) {
        map.set(k, {
          valA: null, valB: null, errA: null, errB: null,
          seenA: false, seenB: false,
          data_type: r.data_type, backend: r.backend, framework: frameworkLabel(r),
          webnn_ep: r.webnn_ep ?? null,
          browser: r.browser, browser_version: r.browser_version,
          cpu: r.cpu, gpu: r.gpu, os: r.os,
          gpu_driver_version: r.gpu_driver_version,
          npu_driver_version: r.npu_driver_version,
        });
      }
      const entry = map.get(k)!;
      const v = currentAxis.getValue(r) ?? '';

      if (v === valueA && !entry.seenA) {
        entry.seenA = true;
        if (r.status === 'error') entry.errA = r.error_message || 'Error';
        else entry.valA = (r as any)[selectedMetric] as number | null;
      }
      if (v === valueB && !entry.seenB) {
        entry.seenB = true;
        if (r.status === 'error') entry.errB = r.error_message || 'Error';
        else entry.valB = (r as any)[selectedMetric] as number | null;
      }
    }

    const rows: CompareRow[] = [];
    for (const [key, e] of map) {
      if (e.valA == null && e.valB == null && !e.errA && !e.errB) continue;
      const [hf_model_id] = key.split('::');
      rows.push({
        hf_model_id,
        data_type: e.data_type, backend: e.backend, framework: e.framework,
        webnn_ep: e.webnn_ep,
        browser: e.browser, browser_version: e.browser_version,
        cpu: e.cpu, gpu: e.gpu, os: e.os,
        gpu_driver_version: e.gpu_driver_version,
        npu_driver_version: e.npu_driver_version,
        valA: e.valA, valB: e.valB, errorA: e.errA, errorB: e.errB,
      });
    }
    return rows;
  });

  let baseline = $state<'a' | 'b'>(initial.bl === 'b' ? 'b' : 'a');

  function relPct(row: CompareRow): number | null {
    const base = baseline === 'a' ? row.valA : row.valB;
    const other = baseline === 'a' ? row.valB : row.valA;
    if (base == null || other == null || base === 0) return null;
    return (other / base) * 100;
  }

  function changePct(row: CompareRow): number | null {
    if (row.valA == null || row.valB == null || row.valA === 0) return null;
    return ((row.valB - row.valA) / row.valA) * 100;
  }

  // ─────── Sort ───────
  type SortCol =
    | 'model' | 'dtype' | 'backend' | 'framework' | 'webnn_ep'
    | 'browser' | 'browser_version' | 'cpu' | 'gpu' | 'os'
    | 'gpu_driver' | 'npu_driver'
    | 'valA' | 'valB' | 'change';
  let sortCol = $state<SortCol>('model');
  let sortAsc = $state(true);

  function toggleSort(col: SortCol) {
    if (sortCol === col) sortAsc = !sortAsc;
    else { sortCol = col; sortAsc = true; }
  }
  function sortIndicator(col: SortCol): string {
    if (sortCol !== col) return '';
    return sortAsc ? ' ↑' : ' ↓';
  }

  const sortedRows = $derived(
    [...compareRows].sort((a, b) => {
      let av: any, bv: any;
      switch (sortCol) {
        case 'model': av = a.hf_model_id.toLowerCase(); bv = b.hf_model_id.toLowerCase(); break;
        case 'dtype': av = a.data_type; bv = b.data_type; break;
        case 'backend': av = a.backend; bv = b.backend; break;
        case 'framework': av = a.framework; bv = b.framework; break;
        case 'webnn_ep': av = a.webnn_ep ?? ''; bv = b.webnn_ep ?? ''; break;
        case 'browser': av = (a.browser ?? '').toLowerCase(); bv = (b.browser ?? '').toLowerCase(); break;
        case 'browser_version': av = a.browser_version ?? ''; bv = b.browser_version ?? ''; break;
        case 'cpu': av = (a.cpu ?? '').toLowerCase(); bv = (b.cpu ?? '').toLowerCase(); break;
        case 'gpu': av = (a.gpu ?? '').toLowerCase(); bv = (b.gpu ?? '').toLowerCase(); break;
        case 'os': av = (a.os ?? '').toLowerCase(); bv = (b.os ?? '').toLowerCase(); break;
        case 'gpu_driver': av = a.gpu_driver_version ?? ''; bv = b.gpu_driver_version ?? ''; break;
        case 'npu_driver': av = a.npu_driver_version ?? ''; bv = b.npu_driver_version ?? ''; break;
        case 'valA': av = a.valA ?? Infinity; bv = b.valA ?? Infinity; break;
        case 'valB': av = a.valB ?? Infinity; bv = b.valB ?? Infinity; break;
        case 'change': av = changePct(a) ?? Infinity; bv = changePct(b) ?? Infinity; break;
      }
      if (typeof av === 'string') {
        const cmp = av.localeCompare(bv);
        return sortAsc ? cmp : -cmp;
      }
      return sortAsc ? av - bv : bv - av;
    })
  );

  function fmt(val: number | null): string {
    if (val == null) return '—';
    if (Math.abs(val) >= 100) return val.toFixed(1);
    if (Math.abs(val) >= 1) return val.toFixed(2);
    return val.toFixed(3);
  }
  function fmtPct(pct: number | null): string {
    if (pct == null) return '—';
    return `${pct.toFixed(1)}%`;
  }
  function fmtChange(pct: number | null): string {
    if (pct == null) return '—';
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(2)}%`;
  }

  function geomean(values: number[]): number | null {
    const valid = values.filter(v => v > 0);
    if (valid.length === 0) return null;
    const logSum = valid.reduce((s, v) => s + Math.log(v), 0);
    return Math.exp(logSum / valid.length);
  }

  const validRows = $derived(compareRows.filter(r => r.valA != null && r.valB != null && !r.errorA && !r.errorB));
  const geomeanA = $derived(geomean(validRows.map(r => r.valA).filter((v): v is number => v != null)));
  const geomeanB = $derived(geomean(validRows.map(r => r.valB).filter((v): v is number => v != null)));
  const geomeanRelPct = $derived.by(() => {
    const base = baseline === 'a' ? geomeanA : geomeanB;
    const other = baseline === 'a' ? geomeanB : geomeanA;
    if (base == null || other == null || base === 0) return null;
    return (other / base) * 100;
  });
  const geomeanChange = $derived.by(() => {
    if (geomeanA == null || geomeanB == null || geomeanA === 0) return null;
    return ((geomeanB - geomeanA) / geomeanA) * 100;
  });

  // For LLM, only the framework/runtime axis is meaningfully a "version" comparison.
  const isVersionAxis = $derived(axis === 'framework' || axis === 'browser_version');

  // ─────── Optional columns ───────
  type OptColKey =
    | 'dtype' | 'backend' | 'framework' | 'webnn_ep'
    | 'browser' | 'browser_version' | 'cpu' | 'gpu' | 'os'
    | 'gpu_driver' | 'npu_driver';

  interface OptCol {
    key: OptColKey;
    label: string;
    defaultVisible: boolean;
    axisField?: AxisKey | AxisKey[];
  }

  const OPTIONAL_COLS: OptCol[] = [
    { key: 'dtype',           label: 'Type',        defaultVisible: true,  axisField: 'data_type' },
    { key: 'backend',         label: 'Backend',     defaultVisible: true,  axisField: 'backend' },
    { key: 'framework',       label: 'Framework',   defaultVisible: false, axisField: 'framework' },
    { key: 'webnn_ep',        label: 'WebNN EP',    defaultVisible: false, axisField: 'webnn_ep' },
    { key: 'browser',         label: 'Browser',     defaultVisible: true,  axisField: 'browser' },
    { key: 'browser_version', label: 'Browser Ver', defaultVisible: true,  axisField: 'browser_version' },
    { key: 'cpu',             label: 'CPU',         defaultVisible: false, axisField: 'cpu' },
    { key: 'gpu',             label: 'GPU',         defaultVisible: false, axisField: 'gpu' },
    { key: 'os',              label: 'OS',          defaultVisible: false },
    { key: 'gpu_driver',      label: 'GPU Driver',  defaultVisible: false, axisField: 'gpu_driver_version' },
    { key: 'npu_driver',      label: 'NPU Driver',  defaultVisible: false, axisField: 'npu_driver_version' },
  ];

  const LS_KEY = 'leaderboard_llm_visible_cols_v1';

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
  function colHiddenByAxis(col: OptCol): boolean {
    if (!col.axisField) return false;
    const axes = Array.isArray(col.axisField) ? col.axisField : [col.axisField];
    return axes.includes(axis);
  }
  function isVisible(key: OptColKey): boolean {
    const col = OPTIONAL_COLS.find(c => c.key === key);
    if (col && colHiddenByAxis(col)) return false;
    return visibleCols.has(key);
  }
  const visibleColsCount = $derived(
    OPTIONAL_COLS.filter(c => visibleCols.has(c.key) && !colHiddenByAxis(c)).length
  );

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

  // ─────── Header ───────
  const headerTitle = $derived.by(() => {
    if (!valueA || !valueB) return `${currentAxis.titleNoun} Comparison (LLM)`;
    const a = currentAxis.fmt ? currentAxis.fmt(valueA) : valueA;
    const b = currentAxis.fmt ? currentAxis.fmt(valueB) : valueB;
    return `${currentAxis.titleNoun}: ${a} vs ${b}`;
  });
  const headerSubtitle = $derived(currentAxis.titleVerb + '.');

  // ─────── Export ───────
  let copyFeedback = $state('');
  let cellCopiedMsg = $state('');

  function exportColumns(): { label: string; get: (r: CompareRow) => string }[] {
    const cols: { label: string; get: (r: CompareRow) => string }[] = [
      { label: 'Model', get: r => r.hf_model_id },
    ];
    if (isVisible('dtype'))           cols.push({ label: 'Type',         get: r => r.data_type });
    if (isVisible('backend'))         cols.push({ label: 'Backend',      get: r => getBackendLabel(r.backend) });
    if (isVisible('framework'))       cols.push({ label: 'Framework',    get: r => r.framework });
    if (isVisible('webnn_ep'))        cols.push({ label: 'WebNN EP',     get: r => r.webnn_ep ?? '' });
    if (isVisible('browser'))         cols.push({ label: 'Browser',      get: r => r.browser ?? '' });
    if (isVisible('browser_version')) cols.push({ label: 'Browser Ver',  get: r => r.browser_version ?? '' });
    if (isVisible('cpu'))             cols.push({ label: 'CPU',          get: r => r.cpu ?? '' });
    if (isVisible('gpu'))             cols.push({ label: 'GPU',          get: r => r.gpu ?? '' });
    if (isVisible('os'))              cols.push({ label: 'OS',           get: r => r.os ?? '' });
    if (isVisible('gpu_driver'))      cols.push({ label: 'GPU Driver',   get: r => r.gpu_driver_version ?? '' });
    if (isVisible('npu_driver'))      cols.push({ label: 'NPU Driver',   get: r => r.npu_driver_version ?? '' });
    cols.push({ label: `${valueA} ${metricLabel}`, get: r => r.errorA ? 'Error' : fmt(r.valA) });
    cols.push({ label: `${valueB} ${metricLabel}`, get: r => r.errorB ? 'Error' : fmt(r.valB) });
    if (isVersionAxis) {
      cols.push({ label: 'Change', get: r => fmtChange(changePct(r)) });
    } else {
      cols.push({ label: `${valueA} (%)`, get: r => baseline === 'a' ? '100%' : (r.valA != null && r.valB != null && r.valB > 0 ? fmtPct((r.valA / r.valB) * 100) : '—') });
      cols.push({ label: `${valueB} (%)`, get: r => baseline === 'b' ? '100%' : (relPct(r) != null ? fmtPct(relPct(r)) : '—') });
    }
    return cols;
  }

  function toMarkdown(): string {
    const cols = exportColumns();
    const sep = cols.map(() => '---');
    const rows = sortedRows.map(r => cols.map(c => c.get(r)));
    return [cols.map(c => c.label).join(' | '), sep.join(' | '), ...rows.map(r => r.join(' | '))].join('\n');
  }
  function toJSON(): string {
    return JSON.stringify(sortedRows.map(r => {
      const obj: Record<string, any> = { model: r.hf_model_id };
      if (isVisible('dtype'))           obj.data_type       = r.data_type;
      if (isVisible('backend'))         obj.backend         = r.backend;
      if (isVisible('framework'))       obj.framework       = r.framework;
      if (isVisible('webnn_ep'))        obj.webnn_ep        = r.webnn_ep;
      if (isVisible('browser'))         obj.browser         = r.browser;
      if (isVisible('browser_version')) obj.browser_version = r.browser_version;
      if (isVisible('cpu'))             obj.cpu             = r.cpu;
      if (isVisible('gpu'))             obj.gpu             = r.gpu;
      if (isVisible('os'))              obj.os              = r.os;
      if (isVisible('gpu_driver'))      obj.gpu_driver      = r.gpu_driver_version;
      if (isVisible('npu_driver'))      obj.npu_driver      = r.npu_driver_version;
      obj[`${valueA}`] = r.errorA ? { error: r.errorA } : r.valA;
      obj[`${valueB}`] = r.errorB ? { error: r.errorB } : r.valB;
      if (isVersionAxis) obj.change_pct = changePct(r);
      return obj;
    }), null, 2);
  }
  function toCSV(): string {
    const cols = exportColumns();
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = sortedRows.map(r => cols.map(c => escape(c.get(r))));
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
  const fileSafe = (s: string) => s.replace(/[^\w.-]+/g, '_');
  const baseName = $derived(`leaderboard-llm-${axis}-${fileSafe(valueA || 'A')}-vs-${fileSafe(valueB || 'B')}-${dateSuffix()}`);
  function saveMarkdown() { saveFile(toMarkdown(), `${baseName}.md`,   'text/markdown'); }
  function saveJSON()     { saveFile(toJSON(),     `${baseName}.json`, 'application/json'); }
  function saveCSV()      { saveFile(toCSV(),      `${baseName}.csv`,  'text/csv'); }
</script>

{#if accessDenied}
  <div class="access-denied">
    <p class="access-denied-title">Access restricted</p>
    <p class="access-denied-body">Your account doesn't have permission to view this page. Please contact the administrator to request access.</p>
  </div>
{:else}
<div class="leaderboard-page">
  {#if data.error}
    <p class="error-text">{data.error}</p>
  {:else}
  <section class="lb-layout">
    <aside class="lb-sidebar" use:autoTitle>
      <div class="sb-section">
        <div class="sb-section-head"><span class="sb-section-title">Compare</span></div>
        <div class="sb-row">
          <span class="sb-label">Axis</span>
          <select class="sb-input" bind:value={axis}>
            {#each axisDefs as a}
              <option value={a.key}>{a.label}</option>
            {/each}
          </select>
        </div>
        <div class="sb-row">
          <span class="sb-label">A</span>
          <select class="sb-input" bind:value={valueA}>
            {#each axisOptions as o}
              <option value={o}>{currentAxis.fmt ? currentAxis.fmt(o) : o}</option>
            {/each}
          </select>
        </div>
        <div class="sb-row">
          <span class="sb-label">B</span>
          <select class="sb-input" bind:value={valueB}>
            {#each axisOptions as o}
              <option value={o}>{currentAxis.fmt ? currentAxis.fmt(o) : o}</option>
            {/each}
          </select>
        </div>
        <div class="sb-row sb-row-swap">
          <button type="button" class="sb-swap-btn" onclick={swapAB} disabled={!valueA || !valueB || valueA === valueB} title="Swap A and B (also flips the baseline)">
            Swap A &harr; B
          </button>
        </div>
        <div class="sb-row">
          <span class="sb-label">Metric</span>
          <select class="sb-input" bind:value={selectedMetric}>
            {#each METRICS as m}
              <option value={m.key}>{m.label}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="sb-section">
        <div class="sb-section-head"><span class="sb-section-title">Filters</span></div>
        {#if axis !== 'data_type'}
          <div class="sb-row">
            <span class="sb-label">Data Type</span>
            <select class="sb-input" bind:value={filterDataType}>
              <option value="">All</option>
              {#each dataTypes as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
        {/if}
        {#if axis !== 'backend'}
          <div class="sb-row">
            <span class="sb-label">Backend</span>
            <select class="sb-input" bind:value={filterBackend}>
              <option value="">All</option>
              {#each backends as v}<option value={v}>{getBackendLabel(v)}</option>{/each}
            </select>
          </div>
        {/if}
        {#if axis !== 'framework'}
          <div class="sb-row">
            <span class="sb-label">Framework</span>
            <select class="sb-input" bind:value={filterFramework}>
              <option value="">All</option>
              {#each frameworks as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
        {/if}
        {#if axis !== 'webnn_ep'}
          <div class="sb-row">
            <span class="sb-label">WebNN EP</span>
            <select class="sb-input" bind:value={filterEp}>
              <option value="">All</option>
              {#each webnnEps as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
        {/if}
        {#if axis !== 'browser'}
          <div class="sb-row">
            <span class="sb-label">Browser</span>
            <select class="sb-input" bind:value={filterBrowser}>
              <option value="">All</option>
              {#each browsersList as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
        {/if}
        {#if axis !== 'browser_version'}
          <div class="sb-row">
            <span class="sb-label">Browser Ver</span>
            <select class="sb-input" bind:value={filterBrowserVer}>
              <option value="">All</option>
              {#each browserVersList as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
        {/if}
        {#if axis !== 'cpu'}
          <div class="sb-row">
            <span class="sb-label">CPU</span>
            <select class="sb-input" bind:value={filterCpu}>
              <option value="">All</option>
              {#each cpus as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
        {/if}
        {#if axis !== 'gpu'}
          <div class="sb-row">
            <span class="sb-label">GPU</span>
            <select class="sb-input" bind:value={filterGpu}>
              <option value="">All</option>
              {#each gpus as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
        {/if}
        {#if axis !== 'gpu_driver_version'}
          <div class="sb-row">
            <span class="sb-label">GPU Driver</span>
            <select class="sb-input" bind:value={filterGpuDriver}>
              <option value="">All</option>
              {#each gpuDrivers as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
        {/if}
        {#if axis !== 'npu_driver_version'}
          <div class="sb-row">
            <span class="sb-label">NPU Driver</span>
            <select class="sb-input" bind:value={filterNpuDriver}>
              <option value="">All</option>
              {#each npuDrivers as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
        {/if}
      </div>
    </aside>

    <div class="lb-main">
      <header class="page-header">
        <div class="page-header-text">
          <h1>{headerTitle}</h1>
          <p>{headerSubtitle}</p>
        </div>
        <div class="page-header-actions">
          {#if valueA && valueB && compareRows.length > 0}
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
              Columns {visibleColsCount > 0 ? `(+${visibleColsCount})` : ''}
            </button>
            {#if colPickerOpen}
              <div class="col-picker-dropdown">
                {#each OPTIONAL_COLS as col}
                  <label class="col-picker-item" class:col-picker-item-disabled={colHiddenByAxis(col)} title={colHiddenByAxis(col) ? 'Hidden because this is the compare axis' : ''}>
                    <input
                      type="checkbox"
                      class="row-check"
                      checked={visibleCols.has(col.key)}
                      disabled={colHiddenByAxis(col)}
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

      {#if !valueA || !valueB}
        <p class="hint">Select two {currentAxis.titleNoun} values from the sidebar to compare.</p>
      {:else if valueA === valueB}
        <p class="hint">A and B are the same. Pick different {currentAxis.titleNoun} values.</p>
      {:else if compareRows.length === 0}
        <p class="hint">No matching results for these filters.</p>
      {:else}
        <div class="table-wrapper">
          <table class="compare-table">
            <caption class="sr-only">
              Compare {currentAxis.titleNoun.toLowerCase()} {currentAxis.fmt ? currentAxis.fmt(valueA) : valueA} versus {currentAxis.fmt ? currentAxis.fmt(valueB) : valueB} on {metricLabel}. Baseline: column {baseline === 'a' ? 'A' : 'B'}.
            </caption>
            <thead>
              <tr>
                <th class="th-model sortable" onclick={() => toggleSort('model')}>Model{sortIndicator('model')}</th>
                {#if isVisible('dtype')}<th class="sortable" onclick={() => toggleSort('dtype')}>Type{sortIndicator('dtype')}</th>{/if}
                {#if isVisible('backend')}<th class="sortable" onclick={() => toggleSort('backend')}>Backend{sortIndicator('backend')}</th>{/if}
                {#if isVisible('framework')}<th class="sortable" onclick={() => toggleSort('framework')}>Framework{sortIndicator('framework')}</th>{/if}
                {#if isVisible('webnn_ep')}<th class="sortable" onclick={() => toggleSort('webnn_ep')}>WebNN EP{sortIndicator('webnn_ep')}</th>{/if}
                {#if isVisible('browser')}<th class="sortable" onclick={() => toggleSort('browser')}>Browser{sortIndicator('browser')}</th>{/if}
                {#if isVisible('browser_version')}<th class="sortable" onclick={() => toggleSort('browser_version')}>Browser Ver{sortIndicator('browser_version')}</th>{/if}
                {#if isVisible('cpu')}<th class="sortable" onclick={() => toggleSort('cpu')}>CPU{sortIndicator('cpu')}</th>{/if}
                {#if isVisible('gpu')}<th class="sortable" onclick={() => toggleSort('gpu')}>GPU{sortIndicator('gpu')}</th>{/if}
                {#if isVisible('os')}<th class="sortable" onclick={() => toggleSort('os')}>OS{sortIndicator('os')}</th>{/if}
                {#if isVisible('gpu_driver')}<th class="sortable" onclick={() => toggleSort('gpu_driver')}>GPU Driver{sortIndicator('gpu_driver')}</th>{/if}
                {#if isVisible('npu_driver')}<th class="sortable" onclick={() => toggleSort('npu_driver')}>NPU Driver{sortIndicator('npu_driver')}</th>{/if}
                <th class="th-metric sortable" onclick={() => toggleSort('valA')} title={metricTooltip}>
                  {currentAxis.fmt ? currentAxis.fmt(valueA) : valueA}{sortIndicator('valA')}
                  <br><span class="th-metric-label">{metricLabel}</span>
                </th>
                <th class="th-metric sortable" onclick={() => toggleSort('valB')} title={metricTooltip}>
                  {currentAxis.fmt ? currentAxis.fmt(valueB) : valueB}{sortIndicator('valB')}
                  <br><span class="th-metric-label">{metricLabel}</span>
                </th>
                {#if isVersionAxis}
                  <th class="th-change sortable" onclick={() => toggleSort('change')}>Change{sortIndicator('change')}</th>
                {:else}
                  <th class="th-pct" class:th-baseline={baseline === 'a'} onclick={() => baseline = 'a'} title="Click to set as baseline">
                    {currentAxis.fmt ? currentAxis.fmt(valueA) : valueA}{baseline === 'a' ? ' (100%)' : ' (%)'}
                  </th>
                  <th class="th-pct" class:th-baseline={baseline === 'b'} onclick={() => baseline = 'b'} title="Click to set as baseline">
                    {currentAxis.fmt ? currentAxis.fmt(valueB) : valueB}{baseline === 'b' ? ' (100%)' : ' (%)'}
                  </th>
                {/if}
              </tr>
            </thead>
            <tbody>
              {#snippet geomeanRow()}
                <tr class="geomean-row">
                  <td class="cell-geomean cell-geomean-label" colspan={1 + (isVisible('dtype')?1:0) + (isVisible('backend')?1:0) + (isVisible('framework')?1:0) + (isVisible('webnn_ep')?1:0) + (isVisible('browser')?1:0) + (isVisible('browser_version')?1:0) + (isVisible('cpu')?1:0) + (isVisible('gpu')?1:0) + (isVisible('os')?1:0) + (isVisible('gpu_driver')?1:0) + (isVisible('npu_driver')?1:0)}>
                    Geomean ({validRows.length}/{compareRows.length} models)
                  </td>
                  <td class="cell-metric cell-geomean">{fmt(geomeanA)}</td>
                  <td class="cell-metric cell-geomean">{fmt(geomeanB)}</td>
                  {#if isVersionAxis}
                    {@const gImproved = geomeanChange != null && (higherBetter ? geomeanChange > 0 : geomeanChange < 0)}
                    {@const gRegressed = geomeanChange != null && (higherBetter ? geomeanChange < 0 : geomeanChange > 0)}
                    <td class="cell-change cell-geomean" class:improved={gImproved} class:regressed={gRegressed}>
                      {#if gImproved}<span class="change-arrow" aria-hidden="true">▲</span>{:else if gRegressed}<span class="change-arrow" aria-hidden="true">▼</span>{/if}
                      {fmtChange(geomeanChange)}
                    </td>
                  {:else}
                    <td class="cell-pct cell-geomean">
                      {baseline === 'a' ? '100%' : fmtPct(geomeanA != null && geomeanB != null && geomeanB > 0 ? (geomeanA / geomeanB) * 100 : null)}
                    </td>
                    <td class="cell-pct cell-geomean">
                      {baseline === 'b' ? '100%' : fmtPct(geomeanRelPct)}
                    </td>
                  {/if}
                </tr>
              {/snippet}

              {@render geomeanRow()}

              {#each sortedRows as row}
                <tr>
                  <td class="cell-model cell-copy" title="Click to copy: {row.hf_model_id}" onclick={() => { navigator.clipboard.writeText(row.hf_model_id); cellCopiedMsg = 'Copied!'; setTimeout(() => cellCopiedMsg = '', 1500); }}>{row.hf_model_id}</td>
                  {#if isVisible('dtype')}<td><span>{row.data_type}</span></td>{/if}
                  {#if isVisible('backend')}<td><span class="badge-backend {backendClass(row.backend)}">{getBackendLabel(row.backend)}</span></td>{/if}
                  {#if isVisible('framework')}<td><span>{row.framework}</span></td>{/if}
                  {#if isVisible('webnn_ep')}<td><span>{row.webnn_ep ?? '—'}</span></td>{/if}
                  {#if isVisible('browser')}<td><span>{row.browser ?? '—'}</span></td>{/if}
                  {#if isVisible('browser_version')}<td><span>{row.browser_version ?? '—'}</span></td>{/if}
                  {#if isVisible('cpu')}<td class="cell-truncate" title={row.cpu ?? ''}><span>{row.cpu ?? '—'}</span></td>{/if}
                  {#if isVisible('gpu')}<td class="cell-truncate" title={row.gpu ?? ''}><span>{row.gpu ?? '—'}</span></td>{/if}
                  {#if isVisible('os')}<td><span>{row.os ?? '—'}</span></td>{/if}
                  {#if isVisible('gpu_driver')}<td><span>{row.gpu_driver_version ?? '—'}</span></td>{/if}
                  {#if isVisible('npu_driver')}<td><span>{row.npu_driver_version ?? '—'}</span></td>{/if}
                  <td class="cell-metric">
                    {#if row.errorA}<span class="cell-error" title={row.errorA}>Error</span>
                    {:else}{fmt(row.valA)}{/if}
                  </td>
                  <td class="cell-metric">
                    {#if row.errorB}<span class="cell-error" title={row.errorB}>Error</span>
                    {:else}{fmt(row.valB)}{/if}
                  </td>
                  {#if isVersionAxis}
                    {@const rChange = changePct(row)}
                    {@const rImproved = rChange != null && (higherBetter ? rChange > 0 : rChange < 0)}
                    {@const rRegressed = rChange != null && (higherBetter ? rChange < 0 : rChange > 0)}
                    <td class="cell-change" class:improved={rImproved} class:regressed={rRegressed}>
                      {#if rImproved}<span class="change-arrow" aria-hidden="true">▲</span>{:else if rRegressed}<span class="change-arrow" aria-hidden="true">▼</span>{/if}
                      {fmtChange(rChange)}
                    </td>
                  {:else}
                    <td class="cell-pct">
                      {#if row.errorA || row.errorB}—
                      {:else if baseline === 'a'}100%
                      {:else}{row.valA != null && row.valB != null && row.valB > 0 ? fmtPct((row.valA / row.valB) * 100) : '—'}{/if}
                    </td>
                    <td class="cell-pct">
                      {#if row.errorA || row.errorB}—
                      {:else if baseline === 'b'}100%
                      {:else}{relPct(row) != null ? fmtPct(relPct(row)) : '—'}{/if}
                    </td>
                  {/if}
                </tr>
              {/each}

              {@render geomeanRow()}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  </section>
  {/if}
</div>
{/if}

{#if cellCopiedMsg}
  <div class="copy-toast">{cellCopiedMsg}</div>
{/if}

<style>
  .access-denied {
    padding: var(--space-5) var(--space-3);
    text-align: center;
    max-width: 480px;
    margin: 0 auto;
  }
  .access-denied-title {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: var(--space-1);
  }
  .access-denied-body {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    line-height: 1.6;
  }

  .leaderboard-page { max-width: 100%; }

  .lb-layout {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: var(--space-3);
    align-items: start;
  }

  .lb-sidebar {
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
  .lb-sidebar::-webkit-scrollbar { width: 4px; }
  .lb-sidebar::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 2px;
  }

  .lb-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }

  .sb-section { display: flex; flex-direction: column; gap: 4px; }
  .sb-section-head { margin-bottom: 4px; }
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
  select.sb-input {
    width: 100%;
    height: 28px;
    min-width: 0;
    padding: 0 8px;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    cursor: pointer;
    color: var(--color-text-muted);
  }

  .page-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
    flex-wrap: wrap;
  }
  .page-header-text { min-width: 0; }
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
  .page-header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-wrap: wrap;
  }

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
    min-width: 180px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    box-shadow: var(--shadow-dropdown);
    padding: 4px;
    z-index: var(--z-dropdown);
  }
  .col-picker-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: var(--color-text-primary);
    cursor: pointer;
    border-radius: var(--radius-sm);
  }
  .col-picker-item:hover { background: var(--color-nav-item-hover); }
  .col-picker-item-disabled { opacity: 0.4; cursor: not-allowed; }

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

  .hint {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    padding: var(--space-2);
    border-radius: var(--radius-base);
    border: 1px solid var(--color-border);
    text-align: center;
  }

  .table-wrapper { overflow-x: auto; }
  .compare-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-xs);
    font-family: var(--font-mono);
  }
  .compare-table th {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted);
    padding: 2px var(--space-2);
    border-bottom: 1px solid var(--color-border);
    text-align: center;
    white-space: nowrap;
  }
  .th-model { text-align: left; }
  .sortable { cursor: pointer; user-select: none; }
  .sortable:hover { color: var(--color-text-primary); }
  .th-pct {
    cursor: pointer;
    user-select: none;
    border-bottom: 2px dotted transparent;
    transition: border-color var(--transition-base), color var(--transition-base);
  }
  .th-pct:hover {
    color: var(--color-text-primary);
    border-bottom-color: var(--color-border-strong);
  }
  .th-baseline {
    color: var(--color-primary);
    border-bottom: 2px solid var(--color-primary);
  }
  .th-baseline:hover { border-bottom-color: var(--color-primary); }
  .th-metric-label {
    font-weight: 400;
    font-size: 10px;
    text-transform: none;
    letter-spacing: 0;
    opacity: 0.7;
  }

  .compare-table td {
    padding: 2px var(--space-2);
    border-bottom: 1px solid var(--color-border);
    text-align: center;
    white-space: nowrap;
  }
  .cell-model {
    text-align: left;
    max-width: 28ch;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cell-truncate {
    max-width: 22ch;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cell-copy { cursor: pointer; }
  .cell-copy:hover { color: var(--color-primary); }

  .cell-metric, .cell-pct, .cell-change {
    font-variant-numeric: tabular-nums;
  }
  .cell-change { font-weight: 600; }
  .cell-change.improved { color: #16a34a; }
  .cell-change.regressed { color: var(--color-error); }

  .geomean-row { background: var(--color-accent-light); }
  .cell-geomean-label { text-align: left; font-weight: 600; }

  .cell-error {
    color: var(--color-error);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    cursor: help;
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

  .error-text {
    font-size: var(--text-sm);
    color: var(--color-error);
  }

  @media (max-width: 768px) {
    .lb-layout { grid-template-columns: 1fr; }
    .lb-sidebar {
      position: static;
      max-height: none;
    }
  }

  /* ── Screen-reader-only caption ────────────────────────────────── */
  .sr-only {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* ── Swap A↔B ─────────────────────────────────────────────────── */
  .sb-row-swap .sb-swap-btn { grid-column: 2; }
  .sb-swap-btn {
    width: 100%;
    height: 28px;
    padding: 0 8px;
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background var(--transition-base), color var(--transition-base), border-color var(--transition-base);
  }
  .sb-swap-btn:hover:not(:disabled) {
    background: var(--color-accent-light);
    color: var(--color-primary);
    border-color: var(--color-primary);
  }
  .sb-swap-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Improved/regressed arrow glyph ──────────────────────────────── */
  .change-arrow {
    display: inline-block;
    font-size: 9px;
    margin-right: 2px;
    transform: translateY(-1px);
  }

  /* ── Backend badge — uniform width matches results pages ─────────── */
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
  .backend-wasm      { color: var(--color-backend-wasm-1);    border-color: var(--color-backend-wasm-1); }
  .backend-webgpu    { color: var(--color-backend-webgpu);    border-color: var(--color-backend-webgpu); }
  .backend-webnn-cpu { color: var(--color-backend-webnn-cpu); border-color: var(--color-backend-webnn-cpu); }
  .backend-webnn-gpu { color: var(--color-backend-webnn-gpu); border-color: var(--color-backend-webnn-gpu); }
  .backend-webnn-npu { color: var(--color-backend-webnn-npu); border-color: var(--color-backend-webnn-npu); }
  .backend-unknown   { color: var(--color-text-muted);        border-color: var(--color-border); }
</style>
