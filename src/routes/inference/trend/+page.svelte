<script lang="ts">
  import type { LeaderboardRow as ResultRow } from './+page.ts';
  import { getBackendLabel } from '$lib/engine/backends';
  import { browser } from '$app/environment';
  import { auth } from '$lib/stores/auth';
  import { isAtLeast } from '$lib/types/roles';
  import { goto } from '$app/navigation';
  import { loginUrl, locationPath } from '$lib/utils/login-redirect';
  import { autoTitle } from '$lib/utils/auto-title';
  import TrendChart, { type TrendSeries, type TrendPoint } from '$lib/components/TrendChart.svelte';

  let { data } = $props();

  // Leaderboard-scope gate (cross-user data) — same as /inference/leaderboard.
  const accessDenied = $derived(
    browser && !$auth.loading && !isAtLeast($auth.role ?? 'anonymous', 'partner')
  );

  $effect(() => {
    if (browser && !$auth.loading && $auth.role === 'anonymous' && !$auth.session) {
      goto(loginUrl(locationPath(window.location)));
    }
  });

  // ─────── Axis model (mirrors the leaderboard) ───────
  // The chosen AXIS becomes one line per distinct value. Every OTHER dimension
  // is a filter. X is either run time or an ordinal (version / iterations).
  type AxisKey =
    | 'backend' | 'data_type' | 'webnn_ep' | 'framework'
    | 'os' | 'browser' | 'browser_version'
    | 'cpu' | 'gpu' | 'gpu_driver_version' | 'npu_driver_version';

  interface AxisDef { key: AxisKey; label: string; get: (r: ResultRow) => string; }

  function getFrameworkLabel(r: ResultRow): string {
    if (r.ort_version) return `ORT Web ${r.ort_version}`;
    if (r.litert_version) return `LiteRT.js ${r.litert_version}`;
    return '';
  }

  const AXES: AxisDef[] = [
    { key: 'backend',            label: 'Backend',         get: r => r.backend },
    { key: 'data_type',          label: 'Data Type',       get: r => r.data_type },
    { key: 'webnn_ep',           label: 'WebNN EP',        get: r => r.webnn_ep || '' },
    { key: 'framework',          label: 'JS Framework',    get: getFrameworkLabel },
    { key: 'os',                 label: 'OS',              get: r => r.os || '' },
    { key: 'browser',            label: 'Browser',         get: r => r.browser || '' },
    { key: 'browser_version',    label: 'Browser Version', get: r => r.browser_version || '' },
    { key: 'cpu',                label: 'CPU',             get: r => r.cpu || '' },
    { key: 'gpu',                label: 'GPU',             get: r => r.gpu || '' },
    { key: 'gpu_driver_version', label: 'GPU Driver',      get: r => r.gpu_driver_version || '' },
    { key: 'npu_driver_version', label: 'NPU Driver',      get: r => r.npu_driver_version || '' },
  ];

  const METRICS = [
    { key: 'median_ms',           label: 'Median (ms)',         lowerBetter: true },
    { key: 'average_ms',          label: 'Average (ms)',        lowerBetter: true },
    { key: 'best_ms',             label: 'Best (ms)',           lowerBetter: true },
    { key: 'p90_ms',              label: 'P90 (ms)',            lowerBetter: true },
    { key: 'first_inference_ms',  label: 'First Inference (ms)',lowerBetter: true },
    { key: 'compilation_ms',      label: 'Compilation (ms)',    lowerBetter: true },
    { key: 'load_and_compile_ms', label: 'Load + Compile (ms)', lowerBetter: true },
    { key: 'throughput_fps',      label: 'Throughput (fps)',    lowerBetter: false },
  ] as const;
  type MetricKey = typeof METRICS[number]['key'];

  // X axis can be time, the numeric "iterations", or ANY dimension (browser
  // version, backend, GPU…). When it's a dimension, each distinct value is a
  // position on the X axis and metrics are averaged across matching runs.
  type XKey = 'time' | 'iterations' | AxisKey;
  const X_OPTIONS: { key: XKey; label: string }[] = [
    { key: 'time', label: 'Run date' },
    { key: 'iterations', label: 'Iterations' },
    ...AXES.map(a => ({ key: a.key as XKey, label: a.label })),
  ];
  // Series ("Compare") is any dimension, or none for a single aggregated line.
  type SeriesKey = 'none' | AxisKey;
  const SERIES_OPTIONS: { key: SeriesKey; label: string }[] = [
    { key: 'none', label: 'None (single line)' },
    ...AXES.map(a => ({ key: a.key as SeriesKey, label: a.label })),
  ];

  // Natural sort so "20" < "100" and "2.5.2" orders sanely.
  function naturalCompare(a: string, b: string): number {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }

  // ─────── State, initialised from URL query params (bidirectional) ───────
  const sp = browser ? new URL(location.href).searchParams : new URLSearchParams();
  let seriesDim = $state<SeriesKey>((sp.get('series') as SeriesKey) || 'backend');
  let metric    = $state<MetricKey>((sp.get('metric') as MetricKey) || 'median_ms');
  let xDim      = $state<XKey>((sp.get('x') as XKey) || 'time');

  let filterModel      = $state(sp.get('q')      ?? '');
  let filterFile       = $state(sp.get('f')      ?? '');
  let filterBackend    = $state(sp.get('backend')?? '');
  let filterDataType   = $state(sp.get('dtype')  ?? '');
  let filterWebnnEp    = $state(sp.get('ep')     ?? '');
  let filterFramework  = $state(sp.get('fw')     ?? '');
  let filterOs         = $state(sp.get('os')     ?? '');
  let filterBrowser    = $state(sp.get('br')     ?? '');
  let filterBrowserVer = $state(sp.get('brv')    ?? '');
  let filterCpu        = $state(sp.get('cpu')    ?? '');
  let filterGpu        = $state(sp.get('gpu')    ?? '');
  let filterGpuDriver  = $state(sp.get('gpudrv') ?? '');
  let filterNpuDriver  = $state(sp.get('npudrv') ?? '');

  // A dimension is "spread" when it's the series or the X axis — putting it on
  // either means you want to see all its values, so its single-value filter is
  // suppressed (and dropped from the URL) to avoid collapsing the chart.
  function isSpread(dim: AxisKey): boolean {
    return seriesDim === dim || xDim === dim;
  }

  // Write state → URL query string (replaceState, like /inference/results).
  $effect(() => {
    if (!browser) return;
    const params = new URLSearchParams();
    if (seriesDim !== 'backend') params.set('series', seriesDim);
    if (metric !== 'median_ms')  params.set('metric', metric);
    if (xDim !== 'time')         params.set('x', xDim);
    if (filterModel)                                  params.set('q', filterModel);
    if (filterFile)                                   params.set('f', filterFile);
    if (filterDataType   && !isSpread('data_type'))         params.set('dtype', filterDataType);
    if (filterBackend    && !isSpread('backend'))           params.set('backend', filterBackend);
    if (filterWebnnEp    && !isSpread('webnn_ep'))          params.set('ep', filterWebnnEp);
    if (filterFramework  && !isSpread('framework'))         params.set('fw', filterFramework);
    if (filterOs         && !isSpread('os'))                params.set('os', filterOs);
    if (filterBrowser    && !isSpread('browser'))           params.set('br', filterBrowser);
    if (filterBrowserVer && !isSpread('browser_version'))   params.set('brv', filterBrowserVer);
    if (filterCpu        && !isSpread('cpu'))               params.set('cpu', filterCpu);
    if (filterGpu        && !isSpread('gpu'))               params.set('gpu', filterGpu);
    if (filterGpuDriver  && !isSpread('gpu_driver_version')) params.set('gpudrv', filterGpuDriver);
    if (filterNpuDriver  && !isSpread('npu_driver_version')) params.set('npudrv', filterNpuDriver);
    const qs = params.toString();
    history.replaceState(history.state, '', qs ? `?${qs}` : location.pathname);
  });

  const backends   = $derived(data.distinctBackends   ?? []);
  const dataTypes  = $derived(data.distinctDataTypes  ?? []);
  const webnnEps   = $derived(data.distinctWebnnEps   ?? []);
  const frameworks = $derived(data.distinctFrameworks ?? []);
  const distinctOs          = $derived(data.distinctOs          ?? []);
  const distinctBrowsers    = $derived(data.distinctBrowsers    ?? []);
  const distinctBrowserVers = $derived(data.distinctBrowserVers ?? []);
  const distinctCpus        = $derived(data.distinctCpus        ?? []);
  const distinctGpus        = $derived(data.distinctGpus        ?? []);
  const distinctGpuDrivers  = $derived(data.distinctGpuDrivers  ?? []);
  const distinctNpuDrivers  = $derived(data.distinctNpuDrivers  ?? []);

  // Apply every single-value filter EXCEPT for dimensions that are spread on
  // the series or X axis (those need all their values to draw the chart).
  const filtered = $derived(
    data.results.filter((r: ResultRow) => {
      if (!isSpread('backend')          && filterBackend    && r.backend !== filterBackend) return false;
      if (!isSpread('data_type')        && filterDataType   && r.data_type !== filterDataType) return false;
      if (!isSpread('webnn_ep')         && filterWebnnEp    && r.webnn_ep !== filterWebnnEp) return false;
      if (!isSpread('framework')        && filterFramework  && getFrameworkLabel(r) !== filterFramework) return false;
      if (!isSpread('os')               && filterOs         && r.os !== filterOs) return false;
      if (!isSpread('browser')          && filterBrowser    && r.browser !== filterBrowser) return false;
      if (!isSpread('browser_version')  && filterBrowserVer && r.browser_version !== filterBrowserVer) return false;
      if (!isSpread('cpu')              && filterCpu        && r.cpu !== filterCpu) return false;
      if (!isSpread('gpu')              && filterGpu        && r.gpu !== filterGpu) return false;
      if (!isSpread('gpu_driver_version') && filterGpuDriver && r.gpu_driver_version !== filterGpuDriver) return false;
      if (!isSpread('npu_driver_version') && filterNpuDriver && r.npu_driver_version !== filterNpuDriver) return false;
      if (filterModel && !r.model_id.toLowerCase().includes(filterModel.toLowerCase())) return false;
      if (filterFile  && !r.file_path.toLowerCase().includes(filterFile.toLowerCase())) return false;
      return true;
    })
  );

  // Series colors — reuse backend tokens where the axis is backend, else a palette.
  const SERIES_PALETTE = ['#0953DE', '#d97706', '#7c3aed', '#059669', '#dc2626', '#0891b2', '#ca8a04', '#9333ea', '#16a34a', '#e11d48'];
  const BACKEND_COLORS: Record<string, string> = {
    wasm_1: '#78716c', wasm_n: '#78716c', webgpu: '#d97706',
    webnn_cpu: '#0953DE', webnn_gpu: '#7c3aed', webnn_npu: '#059669',
  };

  const activeMetric = $derived(METRICS.find(m => m.key === metric) ?? METRICS[0]);
  const xIsTime = $derived(xDim === 'time');
  const seriesAxisDef = $derived(seriesDim === 'none' ? null : (AXES.find(a => a.key === seriesDim) ?? null));
  const xAxisDef = $derived((xDim === 'time' || xDim === 'iterations') ? null : (AXES.find(a => a.key === xDim) ?? null));

  // The X value for a row: a Date (time), a number (iterations), or a dimension
  // label (e.g. a browser version). Returns null if the row can't be placed.
  function xRawOf(r: ResultRow): { key: string; label: string; sortVal: number | string } | null {
    if (xDim === 'time') {
      const d = new Date(r.started_at);
      return { key: r.started_at, label: '', sortVal: d.getTime() };
    }
    if (xDim === 'iterations') {
      if (r.iterations == null) return null;
      return { key: String(r.iterations), label: String(r.iterations), sortVal: r.iterations };
    }
    const v = xAxisDef?.get(r) ?? '';
    if (!v) return null;
    return { key: v, label: v, sortVal: v };
  }

  const series = $derived.by<TrendSeries[]>(() => {
    // 1. Build the shared, ordered X domain for dimensional/iteration X so every
    //    series shares the same X positions (mapped to an index for the scale).
    let xOrder: string[] = [];
    if (!xIsTime) {
      const seen = new Map<string, number | string>();
      for (const r of filtered) {
        const xr = xRawOf(r);
        if (xr && !seen.has(xr.key)) seen.set(xr.key, xr.sortVal);
      }
      xOrder = [...seen.entries()]
        .sort((a, b) => {
          if (typeof a[1] === 'number' && typeof b[1] === 'number') return a[1] - b[1];
          return naturalCompare(String(a[1]), String(b[1]));
        })
        .map(([k]) => k);
    }
    const xIndex = new Map(xOrder.map((k, i) => [k, i]));

    // 2. Group rows into series.
    const groups = new Map<string, ResultRow[]>();
    for (const r of filtered) {
      const k = seriesAxisDef ? (seriesAxisDef.get(r) || '') : '__all__';
      if (seriesAxisDef && !k) continue;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    const order = [...groups.keys()].sort(naturalCompare);

    return order.map((k, i): TrendSeries => {
      const rows = groups.get(k)!;

      // 3. Within a series, bucket by X key and AVERAGE the metric — this is what
      //    turns "many runs at the same X" into one clean point instead of a
      //    vertical scatter of dots.
      const buckets = new Map<string, { sum: number; n: number; label: string; x: number | Date }>();
      for (const r of rows) {
        const y = (r as any)[metric] as number | null;
        if (y == null) continue;
        const xr = xRawOf(r);
        if (!xr) continue;
        const xVal: number | Date = xIsTime ? new Date(r.started_at) : (xIndex.get(xr.key) ?? 0);
        const bk = xIsTime ? r.started_at : xr.key;
        const b = buckets.get(bk);
        if (b) { b.sum += y; b.n += 1; }
        else buckets.set(bk, { sum: y, n: 1, label: xr.label, x: xVal });
      }

      const points: TrendPoint[] = [...buckets.values()]
        .map((b) => ({ x: b.x, y: b.sum / b.n, label: b.label || undefined, n: b.n }))
        .sort((a, b) => Number(a.x instanceof Date ? a.x.getTime() : a.x) - Number(b.x instanceof Date ? b.x.getTime() : b.x));

      const color = seriesDim === 'backend' ? (BACKEND_COLORS[k] ?? SERIES_PALETTE[i % SERIES_PALETTE.length])
                                            : SERIES_PALETTE[i % SERIES_PALETTE.length];
      const label = seriesDim === 'none' ? activeMetric.label
                  : seriesDim === 'backend' ? getBackendLabel(k) : k;
      return { key: k, label, color, points };
    }).filter(s => s.points.length > 0);
  });

  const xLabel = $derived(X_OPTIONS.find(x => x.key === xDim)?.label ?? 'Run date');
  // Tell the chart whether the X axis is a real date scale or an ordinal index.
  const chartXMode = $derived<'time' | 'ordinal'>(xIsTime ? 'time' : 'ordinal');

  const anyFilterActive = $derived(
    !!(filterModel || filterFile || filterBackend || filterDataType || filterWebnnEp || filterFramework ||
       filterOs || filterBrowser || filterBrowserVer || filterCpu || filterGpu || filterGpuDriver || filterNpuDriver)
  );
  function clearFilters() {
    filterModel = ''; filterFile = ''; filterBackend = ''; filterDataType = ''; filterWebnnEp = ''; filterFramework = '';
    filterOs = ''; filterBrowser = ''; filterBrowserVer = ''; filterCpu = ''; filterGpu = ''; filterGpuDriver = ''; filterNpuDriver = '';
  }
</script>

{#if accessDenied}
  <div class="access-denied">
    <p class="access-denied-title">Access restricted</p>
    <p class="access-denied-body">Your account doesn't have permission to view this page. Please contact the administrator to request access.</p>
  </div>
{:else}
<div class="results-page">
  {#if data.error}
    <p class="error-text">{data.error}</p>
  {:else}
  <header class="page-header page-header-row">
    <div class="page-header-text">
      <h1>Trends</h1>
      <p>Model performance over time and versions. {filtered.length} result{filtered.length !== 1 ? 's' : ''} · {series.length} series.</p>
    </div>
  </header>

  {#if data.results.length === 0}
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
          <input class="sb-input sb-input-text" type="text" placeholder="Hugging Face ID… e.g. litert-community/vit_tiny" bind:value={filterModel} />
          <input class="sb-input sb-input-text" type="text" placeholder="File path… e.g. model.tflite" bind:value={filterFile} />
        </div>

        <div class="sb-section">
          <div class="sb-section-head"><span class="sb-section-title">Chart</span></div>
          <div class="sb-row">
            <span class="sb-label" title="What the X axis represents — time, iterations, or any dimension (browser version, backend, GPU…). When a dimension, metrics are averaged across matching runs.">X axis</span>
            <select class="sb-input" bind:value={xDim}>
              {#each X_OPTIONS as x}<option value={x.key}>{x.label}</option>{/each}
            </select>
          </div>
          <div class="sb-row">
            <span class="sb-label" title="Each distinct value of this dimension becomes one line. Pick None for a single aggregated line.">Lines</span>
            <select class="sb-input" bind:value={seriesDim}>
              {#each SERIES_OPTIONS as s}<option value={s.key}>{s.label}</option>{/each}
            </select>
          </div>
          <div class="sb-row">
            <span class="sb-label" title="The value plotted on the Y axis.">Metric</span>
            <select class="sb-input" bind:value={metric}>
              {#each METRICS as m}<option value={m.key}>{m.label}</option>{/each}
            </select>
          </div>
        </div>

        <div class="sb-section">
          <div class="sb-section-head"><span class="sb-section-title">Run</span></div>
          {#if !isSpread('data_type')}
          <div class="sb-row">
            <span class="sb-label">Data Type</span>
            <select class="sb-input" bind:value={filterDataType}>
              <option value="">All</option>
              {#each dataTypes as dt}<option value={dt}>{dt}</option>{/each}
            </select>
          </div>
          {/if}
          {#if !isSpread('backend')}
          <div class="sb-row">
            <span class="sb-label">Backend</span>
            <select class="sb-input" bind:value={filterBackend}>
              <option value="">All</option>
              {#each backends as b}<option value={b}>{getBackendLabel(b)}</option>{/each}
            </select>
          </div>
          {/if}
          {#if !isSpread('webnn_ep')}
          <div class="sb-row">
            <span class="sb-label">WebNN EP</span>
            <select class="sb-input" bind:value={filterWebnnEp}>
              <option value="">All</option>
              {#each webnnEps as ep}<option value={ep}>{ep}</option>{/each}
            </select>
          </div>
          {/if}
          {#if !isSpread('framework')}
          <div class="sb-row">
            <span class="sb-label">Framework</span>
            <select class="sb-input" bind:value={filterFramework}>
              <option value="">All</option>
              {#each frameworks as fw}<option value={fw}>{fw}</option>{/each}
            </select>
          </div>
          {/if}
        </div>

        <div class="sb-section">
          <div class="sb-section-head"><span class="sb-section-title">Environment</span></div>
          {#if !isSpread('os')}
          <div class="sb-row">
            <span class="sb-label">OS</span>
            <select class="sb-input" bind:value={filterOs}>
              <option value="">All</option>
              {#each distinctOs as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
          {/if}
          {#if !isSpread('browser')}
          <div class="sb-row">
            <span class="sb-label">Browser</span>
            <select class="sb-input" bind:value={filterBrowser}>
              <option value="">All</option>
              {#each distinctBrowsers as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
          {/if}
          {#if !isSpread('browser_version')}
          <div class="sb-row">
            <span class="sb-label">Browser Ver</span>
            <select class="sb-input" bind:value={filterBrowserVer}>
              <option value="">All</option>
              {#each distinctBrowserVers as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
          {/if}
        </div>

        <div class="sb-section">
          <div class="sb-section-head"><span class="sb-section-title">Hardware</span></div>
          {#if !isSpread('cpu')}
          <div class="sb-row">
            <span class="sb-label">CPU</span>
            <select class="sb-input" bind:value={filterCpu}>
              <option value="">All</option>
              {#each distinctCpus as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
          {/if}
          {#if !isSpread('gpu')}
          <div class="sb-row">
            <span class="sb-label">GPU</span>
            <select class="sb-input" bind:value={filterGpu}>
              <option value="">All</option>
              {#each distinctGpus as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
          {/if}
          {#if !isSpread('gpu_driver_version')}
          <div class="sb-row">
            <span class="sb-label">GPU Driver</span>
            <select class="sb-input" bind:value={filterGpuDriver}>
              <option value="">All</option>
              {#each distinctGpuDrivers as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
          {/if}
          {#if !isSpread('npu_driver_version')}
          <div class="sb-row">
            <span class="sb-label">NPU Driver</span>
            <select class="sb-input" bind:value={filterNpuDriver}>
              <option value="">All</option>
              {#each distinctNpuDrivers as v}<option value={v}>{v}</option>{/each}
            </select>
          </div>
          {/if}
        </div>
      </aside>

      <div class="rs-main">
        <TrendChart
          {series}
          xMode={chartXMode}
          yLabel={activeMetric.label}
          {xLabel}
          lowerIsBetter={activeMetric.lowerBetter}
        />
      </div>
    </section>
  {/if}
  {/if}
</div>
{/if}

<style>
  .results-page { max-width: 100%; }

  .access-denied {
    text-align: center;
    padding: var(--space-6) var(--space-3);
  }
  .access-denied-title {
    font-family: var(--font-ui);
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-1);
  }
  .access-denied-body {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
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
  .rs-sidebar::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 2px; }
  .rs-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }

  .sb-section { display: flex; flex-direction: column; gap: 4px; }
  .sb-section-head {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: var(--space-1); margin-bottom: 4px;
  }
  .sb-clear-btn {
    font-family: var(--font-ui); font-size: 10px; font-weight: 500;
    color: var(--color-primary); background: none; border: none; padding: 0; cursor: pointer;
  }
  .sb-clear-btn:hover { text-decoration: underline; }
  .sb-section-title {
    font-family: var(--font-ui); font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.1em; color: var(--color-text-muted);
  }
  .sb-row {
    display: grid; grid-template-columns: 68px 1fr; align-items: center; gap: 8px; min-height: 28px;
  }
  .sb-label {
    font-family: var(--font-ui); font-size: var(--text-xs); font-weight: 500;
    color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .sb-input {
    width: 100%; height: 28px; min-width: 0; padding: 0 8px;
    font-family: var(--font-mono); font-size: var(--text-xs);
  }
  select.sb-input { cursor: pointer; color: var(--color-text-muted); }
  .sb-input-text { width: 100%; height: 28px; padding: 0 8px; font-family: var(--font-ui); font-size: var(--text-xs); }

  .empty { text-align: center; padding: var(--space-4); color: var(--color-text-muted); }
  .error-text { color: var(--color-error); font-size: var(--text-sm); }

  @media (max-width: 768px) {
    .rs-layout { grid-template-columns: 1fr; }
    .rs-sidebar { position: static; max-height: none; }
  }
</style>
