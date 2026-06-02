<script lang="ts">
  import type { WebNNEpRow } from './+page.ts';
  import { getBackendLabel } from '$lib/engine/backends';
  import { browser } from '$app/environment';
  import { auth } from '$lib/stores/auth';
  import { isAtLeast } from '$lib/types/roles';
  import { goto } from '$app/navigation';

  let { data } = $props();

  $effect(() => {
    if (browser && !$auth.loading && !isAtLeast($auth.role ?? 'anonymous', 'partner')) {
      goto('/login');
    }
  });

  const METRICS = [
    { key: 'median_ms', label: 'Median (ms)' },
    { key: 'average_ms', label: 'Average (ms)' },
    { key: 'best_ms', label: 'Best (ms)' },
    { key: 'p90_ms', label: 'P90 (ms)' },
    { key: 'first_inference_ms', label: 'First Inference (ms)' },
    { key: 'compilation_ms', label: 'Compilation (ms)' },
    { key: 'load_and_compile_ms', label: 'Load + Compile (ms)' },
    { key: 'throughput_fps', label: 'Throughput (fps)' },
  ] as const;

  let filterBackend = $state('');
  let filterDataType = $state('');
  let filterFramework = $state('');
  let selectedMetric = $state<string>('median_ms');
  let epA = $state('');
  let epB = $state('');

  const isThroughput = $derived(selectedMetric === 'throughput_fps');
  const metricLabel = $derived(METRICS.find(m => m.key === selectedMetric)?.label ?? 'Median (ms)');

  const webnnEps = $derived(data.distinctEps ?? []);

  const backends = $derived(data.distinctBackends ?? []);
  const dataTypes = $derived(data.distinctDataTypes ?? []);

  function getFrameworkLabel(r: WebNNEpRow): string {
    if (r.ort_version) return `ORT Web ${r.ort_version}`;
    if (r.litert_version) return `LiteRT.js ${r.litert_version}`;
    return '';
  }

  const frameworks = $derived(data.distinctFrameworks ?? []);

  // Auto-select first two EPs
  $effect(() => {
    if (webnnEps.length >= 2 && !epA && !epB) {
      epA = webnnEps[0];
      epB = webnnEps[1];
    } else if (webnnEps.length === 1 && !epA) {
      epA = webnnEps[0];
    }
  });

  const filtered = $derived(
    data.results.filter((r: WebNNEpRow) => {
      if (filterBackend && r.backend !== filterBackend) return false;
      if (filterDataType && r.data_type !== filterDataType) return false;
      if (filterFramework && getFrameworkLabel(r) !== filterFramework) return false;
      return r.webnn_ep === epA || r.webnn_ep === epB;
    })
  );

  interface CompareRow {
    model_id: string;
    file_path: string;
    backend: string;
    data_type: string;
    valA: number | null;
    valB: number | null;
    errorA: string | null;
    errorB: string | null;
  }

  const compareRows = $derived.by(() => {
    const map = new Map<string, { a: number[]; b: number[]; errA: string | null; errB: string | null }>();

    for (const r of filtered) {
      const key = `${r.model_id}::${r.file_path}::${r.backend}::${r.data_type}`;
      if (!map.has(key)) map.set(key, { a: [], b: [], errA: null, errB: null });
      const entry = map.get(key)!;

      if (r.status === 'error') {
        if (r.webnn_ep === epA) entry.errA = r.error_message || 'Error';
        if (r.webnn_ep === epB) entry.errB = r.error_message || 'Error';
      } else {
        const val = (r as any)[selectedMetric] as number | null;
        if (r.webnn_ep === epA && val != null) entry.a.push(val);
        if (r.webnn_ep === epB && val != null) entry.b.push(val);
      }
    }

    const rows: CompareRow[] = [];
    for (const [key, { a, b, errA, errB }] of map) {
      if (a.length === 0 && b.length === 0 && !errA && !errB) continue;
      const [model_id, file_path, backend, data_type] = key.split('::');
      const valA = a.length > 0 ? a.reduce((s, v) => s + v, 0) / a.length : null;
      const valB = b.length > 0 ? b.reduce((s, v) => s + v, 0) / b.length : null;
      rows.push({ model_id, file_path, backend, data_type, valA, valB, errorA: errA, errorB: errB });
    }

    return rows;
  });

  let baseline = $state<'a' | 'b'>('a');

  function swapBaseline() {
    baseline = baseline === 'a' ? 'b' : 'a';
  }

  function relPct(row: CompareRow): number | null {
    const base = baseline === 'a' ? row.valA : row.valB;
    const other = baseline === 'a' ? row.valB : row.valA;
    if (base == null || other == null || base === 0) return null;
    return (other / base) * 100;
  }

  let sortCol = $state<'model' | 'file' | 'backend' | 'type' | 'valA' | 'valB'>('model');
  let sortAsc = $state(true);

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) sortAsc = !sortAsc;
    else { sortCol = col; sortAsc = true; }
  }

  const sortedRows = $derived(
    [...compareRows].sort((a, b) => {
      let av: any, bv: any;
      switch (sortCol) {
        case 'model': av = a.model_id.toLowerCase(); bv = b.model_id.toLowerCase(); break;
        case 'file': av = a.file_path.toLowerCase(); bv = b.file_path.toLowerCase(); break;
        case 'backend': av = a.backend; bv = b.backend; break;
        case 'type': av = a.data_type; bv = b.data_type; break;
        case 'valA': av = a.valA ?? Infinity; bv = b.valA ?? Infinity; break;
        case 'valB': av = a.valB ?? Infinity; bv = b.valB ?? Infinity; break;
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
    return val < 1 ? val.toFixed(3) : val.toFixed(2);
  }

  function fmtPct(pct: number | null): string {
    if (pct == null) return '—';
    return `${pct.toFixed(1)}%`;
  }

  function geomean(values: number[]): number | null {
    const valid = values.filter(v => v > 0);
    if (valid.length === 0) return null;
    const logSum = valid.reduce((s, v) => s + Math.log(v), 0);
    return Math.exp(logSum / valid.length);
  }

  let copyFeedback = $state('');
  let cellCopiedMsg = $state('');

  function toMarkdown(): string {
    const baseEp = baseline === 'a' ? epA : epB;
    const otherEp = baseline === 'a' ? epB : epA;
    const cols = ['Model', 'File', 'Backend', 'Type', `${baseEp} (100%)`, `${otherEp} (%)`];
    const sep = cols.map(() => '---');
    const rows = compareRows.map(r => {
      const base = baseline === 'a' ? r.valA : r.valB;
      const other = baseline === 'a' ? r.valB : r.valA;
      const errBase = baseline === 'a' ? r.errorA : r.errorB;
      const errOther = baseline === 'a' ? r.errorB : r.errorA;
      const pct = base != null && other != null && base > 0 ? ((other / base) * 100).toFixed(1) + '%' : '—';
      return [
        r.model_id,
        r.file_path,
        getBackendLabel(r.backend),
        r.data_type,
        errBase ? 'Error' : '100%',
        errOther ? 'Error' : pct,
      ];
    });
    return [cols.join(' | '), sep.join(' | '), ...rows.map(r => r.join(' | '))].join('\n');
  }

  function toJSON(): string {
    const baseEp = baseline === 'a' ? epA : epB;
    const otherEp = baseline === 'a' ? epB : epA;
    return JSON.stringify(compareRows.map(r => {
      const base = baseline === 'a' ? r.valA : r.valB;
      const other = baseline === 'a' ? r.valB : r.valA;
      const pct = base != null && other != null && base > 0 ? (other / base) * 100 : null;
      return {
        model: r.model_id,
        file: r.file_path,
        backend: r.backend,
        data_type: r.data_type,
        [`${baseEp}_ms`]: base,
        [`${otherEp}_ms`]: other,
        [`${otherEp}_pct`]: pct,
      };
    }), null, 2);
  }

  function toCSV(): string {
    const baseEp = baseline === 'a' ? epA : epB;
    const otherEp = baseline === 'a' ? epB : epA;
    const cols = ['Model', 'File', 'Backend', 'Type', `${baseEp} (100%)`, `${otherEp} (%)`];
    const rows = compareRows.map(r => {
      const base = baseline === 'a' ? r.valA : r.valB;
      const other = baseline === 'a' ? r.valB : r.valA;
      const errBase = baseline === 'a' ? r.errorA : r.errorB;
      const errOther = baseline === 'a' ? r.errorB : r.errorA;
      const pct = base != null && other != null && base > 0 ? ((other / base) * 100).toFixed(1) : '';
      return [
        `"${r.model_id}"`,
        `"${r.file_path}"`,
        getBackendLabel(r.backend),
        r.data_type,
        errBase ? 'Error' : '100%',
        errOther ? 'Error' : pct,
      ];
    });
    return [cols.join(','), ...rows.map(r => r.join(','))].join('\n');
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
  function saveMarkdown() { saveFile(toMarkdown(), `webnnep-compare-${epA}-vs-${epB}-${dateSuffix()}.md`, 'text/markdown'); }
  function saveJSON() { saveFile(toJSON(), `webnnep-compare-${epA}-vs-${epB}-${dateSuffix()}.json`, 'application/json'); }
  function saveCSV() { saveFile(toCSV(), `webnnep-compare-${epA}-vs-${epB}-${dateSuffix()}.csv`, 'text/csv'); }

  const validRows = $derived(compareRows.filter(r => r.valA != null && r.valB != null && !r.errorA && !r.errorB));
  const geomeanA = $derived(geomean(validRows.map(r => r.valA).filter((v): v is number => v != null)));
  const geomeanB = $derived(geomean(validRows.map(r => r.valB).filter((v): v is number => v != null)));
  const geomeanRelPct = $derived.by(() => {
    const base = baseline === 'a' ? geomeanA : geomeanB;
    const other = baseline === 'a' ? geomeanB : geomeanA;
    if (base == null || other == null || base === 0) return null;
    return (other / base) * 100;
  });

  // URL hash sync
  function parseHash() {
    if (!browser) return {};
    const params = new URLSearchParams(location.hash.slice(1));
    return {
      a: params.get('a') ?? '',
      b: params.get('b') ?? '',
      backend: params.get('backend') ?? '',
      framework: params.get('framework') ?? '',
      dtype: params.get('dtype') ?? '',
      metric: params.get('metric') ?? 'median_ms',
    };
  }

  const parsed = parseHash();
  if (parsed.a) epA = parsed.a;
  if (parsed.b) epB = parsed.b;
  if (parsed.backend) filterBackend = parsed.backend;
  if (parsed.framework) filterFramework = parsed.framework;
  if (parsed.dtype) filterDataType = parsed.dtype;
  if (parsed.metric) selectedMetric = parsed.metric;

  $effect(() => {
    if (!browser) return;
    const params = new URLSearchParams();
    if (epA) params.set('a', epA);
    if (epB) params.set('b', epB);
    if (filterBackend) params.set('backend', filterBackend);
    if (filterFramework) params.set('framework', filterFramework);
    if (filterDataType) params.set('dtype', filterDataType);
    if (selectedMetric !== 'median_ms') params.set('metric', selectedMetric);
    history.replaceState(null, '', `#${params}`);
  });
</script>

<div class="webnnep-page">
  <header class="page-header">
    <h1>WebNN EP Comparison</h1>
    <p>Compare inference performance between WebNN Execution Providers.</p>
  </header>

  {#if data.error}
    <p class="error-text">{data.error}</p>
  {:else}
    <div class="filters">
      <select class="filter-select" bind:value={epA}>
        {#each webnnEps as ep}
          <option value={ep}>{ep}</option>
        {/each}
      </select>

      <span class="vs-label">vs</span>

      <select class="filter-select" bind:value={epB}>
        {#each webnnEps as ep}
          <option value={ep}>{ep}</option>
        {/each}
      </select>

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

      <select class="filter-select" bind:value={filterFramework}>
        <option value="">JS Framework</option>
        {#each frameworks as fw}
          <option value={fw}>{fw}</option>
        {/each}
      </select>

      <select class="filter-select" bind:value={selectedMetric}>
        {#each METRICS as m}
          <option value={m.key}>{m.label}</option>
        {/each}
      </select>

      {#if epA && epB && compareRows.length > 0}
        <div class="export-bar">
          <div class="export-group">
            <span class="export-group-icon">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </span>
            <button class="export-group-btn" onclick={() => copyAs('markdown')} title="Copy as Markdown" class:active={copyFeedback === 'markdown'}>MD</button>
            <button class="export-group-btn" onclick={() => copyAs('json')} title="Copy as JSON" class:active={copyFeedback === 'json'}>JSON</button>
            <button class="export-group-btn" onclick={() => copyAs('csv')} title="Copy as CSV" class:active={copyFeedback === 'csv'}>CSV</button>
          </div>
          <div class="export-group">
            <span class="export-group-icon">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </span>
            <button class="export-group-btn" onclick={saveMarkdown} title="Download Markdown">MD</button>
            <button class="export-group-btn" onclick={saveJSON} title="Download JSON">JSON</button>
            <button class="export-group-btn" onclick={saveCSV} title="Download CSV">CSV</button>
          </div>
        </div>
      {/if}
    </div>

    {#if !epA || !epB}
      <p class="hint">Select two WebNN EPs to compare.</p>
    {:else if compareRows.length === 0}
      <p class="hint">No matching results for these filters.</p>
    {:else}
      <div class="table-wrapper">
        <table class="compare-table">
          <thead>
            <tr>
              <th class="th-model sortable" onclick={() => toggleSort('model')}>Model{sortCol === 'model' ? (sortAsc ? ' ↑' : ' ↓') : ''}</th>
              <th class="th-file sortable" onclick={() => toggleSort('file')}>File{sortCol === 'file' ? (sortAsc ? ' ↑' : ' ↓') : ''}</th>
              <th class="th-dtype sortable" onclick={() => toggleSort('type')}>Type{sortCol === 'type' ? (sortAsc ? ' ↑' : ' ↓') : ''}</th>
              <th class="th-backend sortable" onclick={() => toggleSort('backend')}>Backend{sortCol === 'backend' ? (sortAsc ? ' ↑' : ' ↓') : ''}</th>
              <th class="th-metric sortable" onclick={() => toggleSort('valA')}>
                {epA}{sortCol === 'valA' ? (sortAsc ? ' ↑' : ' ↓') : ''}
                <br><span class="th-metric-label">{metricLabel}</span>
              </th>
              <th class="th-metric sortable" onclick={() => toggleSort('valB')}>
                {epB}{sortCol === 'valB' ? (sortAsc ? ' ↑' : ' ↓') : ''}
                <br><span class="th-metric-label">{metricLabel}</span>
              </th>
              <th class="th-pct" class:th-baseline={baseline === 'a'} onclick={() => { if (baseline !== 'a') swapBaseline(); }}>
                {epA}{baseline === 'a' ? ' (100%)' : ' (%)'}
              </th>
              <th class="th-pct" class:th-baseline={baseline === 'b'} onclick={() => { if (baseline !== 'b') swapBaseline(); }}>
                {epB}{baseline === 'b' ? ' (100%)' : ' (%)'}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr class="geomean-row">
              <td class="cell-geomean" colspan="4">Geomean ({validRows.length}/{compareRows.length} models)</td>
              <td class="cell-metric cell-geomean">{fmt(geomeanA)}</td>
              <td class="cell-metric cell-geomean">{fmt(geomeanB)}</td>
              <td class="cell-pct cell-geomean">{baseline === 'a' ? '100%' : fmtPct(geomeanA != null && geomeanB != null && geomeanB > 0 ? (geomeanA / geomeanB) * 100 : null)}</td>
              <td class="cell-pct cell-geomean">{baseline === 'b' ? '100%' : fmtPct(geomeanRelPct)}</td>
            </tr>
            {#each sortedRows as row}
              <tr>
                <td class="cell-model cell-copy" title="Click to copy: {row.model_id}" onclick={() => { navigator.clipboard.writeText(row.model_id); cellCopiedMsg = 'Copied!'; setTimeout(() => cellCopiedMsg = '', 1500); }}>{row.model_id}</td>
                <td class="cell-file cell-copy" title="Click to copy: {row.file_path}" onclick={() => { navigator.clipboard.writeText(row.file_path); cellCopiedMsg = 'Copied!'; setTimeout(() => cellCopiedMsg = '', 1500); }}>{row.file_path}</td>
                <td><span>{row.data_type}</span></td>
                <td><span>{getBackendLabel(row.backend)}</span></td>
                <td class="cell-metric">
                  {#if row.errorA}
                    <span class="cell-error" title={row.errorA}>Error</span>
                  {:else}
                    {fmt(row.valA)}
                  {/if}
                </td>
                <td class="cell-metric">
                  {#if row.errorB}
                    <span class="cell-error" title={row.errorB}>Error</span>
                  {:else}
                    {fmt(row.valB)}
                  {/if}
                </td>
                <td class="cell-pct">
                  {#if row.errorA}
                    —
                  {:else if baseline === 'a'}
                    100%
                  {:else}
                    {row.valA != null && row.valB != null && row.valB > 0 ? fmtPct((row.valA / row.valB) * 100) : '—'}
                  {/if}
                </td>
                <td class="cell-pct">
                  {#if row.errorB}
                    —
                  {:else if baseline === 'b'}
                    100%
                  {:else}
                    {relPct(row) != null ? fmtPct(relPct(row)) : '—'}
                  {/if}
                </td>
              </tr>
            {/each}
            <tr class="geomean-row">
              <td class="cell-geomean" colspan="4">Geomean ({validRows.length}/{compareRows.length} models)</td>
              <td class="cell-metric cell-geomean">{fmt(geomeanA)}</td>
              <td class="cell-metric cell-geomean">{fmt(geomeanB)}</td>
              <td class="cell-pct cell-geomean">{baseline === 'a' ? '100%' : fmtPct(geomeanA != null && geomeanB != null && geomeanB > 0 ? (geomeanA / geomeanB) * 100 : null)}</td>
              <td class="cell-pct cell-geomean">{baseline === 'b' ? '100%' : fmtPct(geomeanRelPct)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</div>

{#if cellCopiedMsg}
  <div class="copy-toast">{cellCopiedMsg}</div>
{/if}

<style>
  .webnnep-page {
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
    align-items: center;
    gap: var(--space-1);
    margin-bottom: var(--space-2);
  }

  .filter-select {
    min-width: 160px;
    height: auto;
    padding: var(--space-1) var(--space-2);
    cursor: pointer;
  }

  .filter-select:focus-visible {
    border-color: var(--color-focus-ring);
  }

  .vs-label {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-muted);
    padding: 0 var(--space-half);
  }

  .export-bar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-left: auto;
  }

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

  .export-group-btn:first-of-type {
    border-left: none;
  }

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

  .table-wrapper {
    overflow-x: auto;
  }

  .compare-table {
    width: 100%;
    table-layout: fixed;
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
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--color-border);
    text-align: center;
    white-space: nowrap;
  }

  .th-model, .th-file {
    text-align: left;
    width: 15vw;
    max-width: 15vw;
  }

  .th-backend, .th-dtype {
    width: 5vw;
    max-width: 5vw;
  }

  .sortable {
    cursor: pointer;
    user-select: none;
  }

  .sortable:hover {
    color: var(--color-text-primary);
  }

  .th-pct {
    cursor: pointer;
    user-select: none;
  }

  .th-baseline {
    color: var(--color-primary);
  }

  .cell-pct {
    font-variant-numeric: tabular-nums;
  }

  .th-metric-label {
    font-weight: 400;
    font-size: 10px;
    text-transform: none;
    letter-spacing: 0;
    opacity: 0.7;
  }

  .compare-table td {
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--color-border);
    text-align: center;
    white-space: nowrap;
  }

  .cell-model {
    text-align: left;
    max-width: 15vw;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cell-file {
    text-align: left;
    max-width: 15vw;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cell-copy {
    cursor: pointer;
  }

  .cell-copy:hover {
    color: var(--color-primary);
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

  .cell-metric {
    font-variant-numeric: tabular-nums;
  }


  .geomean-row {
    background: var(--color-accent-light);
  }

  .cell-error {
    color: var(--color-error);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    cursor: help;
  }

  .badge {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
  }

  .error-text {
    font-size: var(--text-sm);
    color: var(--color-error);
  }

  @media (max-width: 768px) {
    .filters {
      flex-direction: column;
    }

    .filter-select {
      width: 100%;
    }

    .vs-label {
      align-self: center;
    }

    .export-bar {
      margin-left: 0;
      width: 100%;
    }
  }
</style>
