<script lang="ts">
  import type { TestResult, TestItem } from '$lib/engine/types';
  import type { Backend } from '$lib/engine/types';
  import { getBackendLabel } from '$lib/engine/backends';

  let { results = [], backends = [], queue = [], isRunning = false, onretry }: {
    results: TestResult[];
    backends: Backend[];
    queue?: TestItem[];
    isRunning?: boolean;
    onretry?: (item: TestItem) => void;
  } = $props();

  const BACKEND_ORDER: Backend[] = ['wasm_1', 'wasm_n', 'webnn_cpu', 'webgpu', 'webnn_gpu', 'webnn_npu'];
  const orderedBackends = $derived(
    BACKEND_ORDER.filter(b => backends.includes(b))
  );

  let sortBy = $state<string>('model');
  let sortAsc = $state(true);
  let filterQuery = $state('');
  let currentPage = $state(1);
  const pageSize = $derived(isRunning ? 10 : 20);

  let visibleMetrics = $state<Record<string, boolean>>({
    load_and_compile_ms: false,
    compilation_ms: false,
    first_inference_ms: false,
    time_to_first_ms: false,
    average_ms: false,
    median_ms: true,
    p90_ms: false,
    best_ms: false,
    throughput_fps: false,
  });

  const metricDefs: { key: string; label: string; color: string }[] = [
    { key: 'load_and_compile_ms', label: 'Load+Compile', color: '#8b5cf6' },
    { key: 'compilation_ms', label: 'Compilation', color: '#6366f1' },
    { key: 'first_inference_ms', label: 'First Inference', color: '#0ea5e9' },
    { key: 'time_to_first_ms', label: 'Time to First', color: '#06b6d4' },
    { key: 'average_ms', label: 'Average', color: '#f59e0b' },
    { key: 'median_ms', label: 'Median', color: '#10b981' },
    { key: 'p90_ms', label: '90th Percentile', color: '#f97316' },
    { key: 'best_ms', label: 'Best', color: '#ec4899' },
    { key: 'throughput_fps', label: 'Throughput', color: '#14b8a6' },
  ];

  const activeMetrics = $derived(metricDefs.filter(m => visibleMetrics[m.key]));

  function toggleMetric(key: string) {
    visibleMetrics[key] = !visibleMetrics[key];
    if (!Object.values(visibleMetrics).some(v => v)) {
      visibleMetrics.median_ms = true;
    }
  }

  // Index queue items by model+file+backend for fast lookup
  const queueIndex = $derived.by(() => {
    const map = new Map<string, TestItem>();
    for (const item of queue) {
      map.set(`${item.hf_model_id}::${item.file_path}::${item.backend}`, item);
    }
    return map;
  });

  type ModelRow = {
    hf_model_id: string;
    file_path: string;
    byBackend: Record<string, TestResult>;
  };

  // Build rows from both results AND pending queue items so the table appears
  // as soon as a run starts, not only after the first result arrives.
  const modelRows = $derived.by(() => {
    const map = new Map<string, ModelRow>();

    // Seed rows from queue so pending items show up immediately
    for (const item of queue) {
      const key = `${item.hf_model_id}::${item.file_path}`;
      if (!map.has(key)) {
        map.set(key, { hf_model_id: item.hf_model_id, file_path: item.file_path, byBackend: {} });
      }
    }
    // Fill in completed results
    for (const r of results) {
      const key = `${r.test_item.hf_model_id}::${r.test_item.file_path}`;
      if (!map.has(key)) {
        map.set(key, { hf_model_id: r.test_item.hf_model_id, file_path: r.test_item.file_path, byBackend: {} });
      }
      map.get(key)!.byBackend[r.test_item.backend] = r;
    }
    return [...map.values()];
  });

  const filteredRows = $derived(
    modelRows.filter(row => {
      if (!filterQuery.trim()) return true;
      const q = filterQuery.toLowerCase();
      return row.hf_model_id.toLowerCase().includes(q) || row.file_path.toLowerCase().includes(q);
    })
  );

  const sortedRows = $derived(
    [...filteredRows].sort((a, b) => {
      let aVal: any, bVal: any;
      if (sortBy === 'model') {
        aVal = a.hf_model_id.toLowerCase();
        bVal = b.hf_model_id.toLowerCase();
      } else {
        const aResult = a.byBackend[sortBy];
        const bResult = b.byBackend[sortBy];
        aVal = aResult?.metrics?.median_ms ?? Infinity;
        bVal = bResult?.metrics?.median_ms ?? Infinity;
      }
      if (typeof aVal === 'string') {
        const cmp = aVal.localeCompare(bVal);
        return sortAsc ? cmp : -cmp;
      }
      return sortAsc ? aVal - bVal : bVal - aVal;
    })
  );

  const webnnBackends = $derived(
    BACKEND_ORDER.filter(b => b.startsWith('webnn_') && backends.includes(b))
  );

  // Rows where at least one WebNN backend has partial delegation (supported < total)
  const partialDelegationRows = $derived.by(() => {
    return sortedRows.filter(row =>
      webnnBackends.some(b => {
        const cap = row.byBackend[b]?.webnn_capability;
        return cap && cap.supported_nodes < cap.total_nodes;
      })
    );
  });

  const totalPages = $derived(Math.ceil(sortedRows.length / pageSize));
  const pagedRows = $derived(
    sortedRows.length <= pageSize
      ? sortedRows
      : sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  );

  $effect(() => {
    void filterQuery;
    currentPage = 1;
  });

  function toggleSort(col: string) {
    if (sortBy === col) sortAsc = !sortAsc;
    else { sortBy = col; sortAsc = true; }
  }

  function fmt(ms: number): string {
    return ms < 1 ? ms.toFixed(3) : ms.toFixed(2);
  }


  let copyFeedback = $state('');

  function toMarkdown(): string {
    const cols = ['HuggingFace ID', 'File', ...orderedBackends.map(b => getBackendLabel(b))];
    const rows = sortedRows.map(row => [
      row.hf_model_id,
      row.file_path,
      ...orderedBackends.map(b => {
        const r = row.byBackend[b];
        if (!r) return '-';
        if (r.error_message) return `Error: ${r.error_message}`;
        if (!r.metrics) return '-';
        return activeMetrics.map(m => {
          const val = (r.metrics as any)?.[m.key];
          return val != null ? fmt(val) : 'n/a';
        }).join(' / ');
      }),
    ]);
    const sep = cols.map(() => '---');
    return [cols.join(' | '), sep.join(' | '), ...rows.map(r => r.join(' | '))].join('\n');
  }

  function toJSON(): string {
    return JSON.stringify(sortedRows.map(row => ({
      model: row.hf_model_id,
      file: row.file_path,
      ...Object.fromEntries(orderedBackends.map(b => {
        const r = row.byBackend[b];
        if (!r) return [b, null];
        if (r.error_message) return [b, { error: r.error_message }];
        return [b, r.metrics ?? null];
      })),
    })), null, 2);
  }

  function toCSV(): string {
    const metricCols = activeMetrics.map(m => m.label);
    const cols = ['HuggingFace ID', 'File', ...orderedBackends.flatMap(b => metricCols.map(mc => `${getBackendLabel(b)} ${mc}`))];
    const rows = sortedRows.map(row => [
      row.hf_model_id,
      row.file_path,
      ...orderedBackends.flatMap(b => {
        const r = row.byBackend[b];
        if (r?.error_message) return activeMetrics.map((_, i) => i === 0 ? `Error: ${r.error_message}` : '');
        return activeMetrics.map(m => {
          const val = (r?.metrics as any)?.[m.key];
          return val != null ? fmt(val) : '';
        });
      }),
    ]);
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

  function saveMarkdown() { saveFile(toMarkdown(), `benchmark-results-${dateSuffix()}.md`, 'text/markdown'); }
  function saveJSON() { saveFile(toJSON(), `benchmark-results-${dateSuffix()}.json`, 'application/json'); }
  function saveCSV() { saveFile(toCSV(), `benchmark-results-${dateSuffix()}.csv`, 'text/csv'); }

  let copyCapFeedback = $state('');

  function toCapMarkdown(): string {
    const backendCols = webnnBackends.flatMap(b => [`${getBackendLabel(b)} Partitions`, `${getBackendLabel(b)} Total`, `${getBackendLabel(b)} Supported`, `${getBackendLabel(b)} Unsupported`]);
    const cols = ['HuggingFace ID', 'File', ...backendCols];
    const sep = cols.map(() => '---');
    const rows = partialDelegationRows.map(row => [
      row.hf_model_id,
      row.file_path,
      ...webnnBackends.flatMap(b => {
        const cap = row.byBackend[b]?.webnn_capability;
        if (!cap) return ['-', '-', '-', '-'];
        return [cap.partitions ?? '-', cap.total_nodes, cap.supported_nodes, cap.unsupported_ops.length > 0 ? cap.unsupported_ops.join('; ') : '-'];
      }),
    ]);
    return [cols.join(' | '), sep.join(' | '), ...rows.map(r => r.join(' | '))].join('\n');
  }

  function toCapJSON(): string {
    return JSON.stringify(partialDelegationRows.map(row => ({
      model: row.hf_model_id,
      file: row.file_path,
      ...Object.fromEntries(webnnBackends.map(b => {
        const cap = row.byBackend[b]?.webnn_capability;
        return [b, cap ?? null];
      })),
    })), null, 2);
  }

  function toCapCSV(): string {
    const backendCols = webnnBackends.flatMap(b => [`${getBackendLabel(b)} Partitions`, `${getBackendLabel(b)} Total`, `${getBackendLabel(b)} Supported`, `${getBackendLabel(b)} Unsupported`]);
    const cols = ['HuggingFace ID', 'File', ...backendCols];
    const rows = partialDelegationRows.map(row => [
      row.hf_model_id,
      row.file_path,
      ...webnnBackends.flatMap(b => {
        const cap = row.byBackend[b]?.webnn_capability;
        if (!cap) return ['', '', '', ''];
        return [cap.partitions ?? '', cap.total_nodes, cap.supported_nodes, cap.unsupported_ops.join('; ')];
      }),
    ]);
    return [cols.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
  }

  async function copyCapAs(format: 'markdown' | 'json' | 'csv') {
    const text = format === 'markdown' ? toCapMarkdown() : format === 'json' ? toCapJSON() : toCapCSV();
    await navigator.clipboard.writeText(text);
    copyCapFeedback = format;
    setTimeout(() => { copyCapFeedback = ''; }, 2000);
  }

  function saveCapMarkdown() { saveFile(toCapMarkdown(), `webnn-delegation-${dateSuffix()}.md`, 'text/markdown'); }
  function saveCapJSON() { saveFile(toCapJSON(), `webnn-delegation-${dateSuffix()}.json`, 'application/json'); }
  function saveCapCSV() { saveFile(toCapCSV(), `webnn-delegation-${dateSuffix()}.csv`, 'text/csv'); }
</script>

<div class="results-wrapper">
  <div class="results-header" class:hidden={isRunning}>
    <h3 class="results-title">Results ({filteredRows.length})</h3>
    <div class="results-header-right">
      {#if modelRows.length > pageSize}
        <input
          class="results-filter"
          type="text"
          placeholder="Filter by model..."
          bind:value={filterQuery}
        />
      {/if}
      {#if results.length > 0}
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
  </div>

  {#if pagedRows.length > 0}
    <div class="metric-toggles">
      {#each metricDefs as m}
        <button
          class="metric-pill"
          class:active={visibleMetrics[m.key]}
          style="--pill-color: {m.color}"
          onclick={() => toggleMetric(m.key)}
        >{m.label}</button>
      {/each}
    </div>

    <div class="results-table-wrapper">
      <table class="results-table">
        <thead>
          <tr>
            <th class="sortable th-model" onclick={() => toggleSort('model')}>HuggingFace ID</th>
            <th class="th-file">File</th>
            {#each orderedBackends as b}
              <th class="sortable th-backend" onclick={() => toggleSort(b)}>{getBackendLabel(b)}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each pagedRows as row}
            <tr>
              <td class="model-col" title={row.hf_model_id}>{row.hf_model_id}</td>
              <td class="file-col" title={row.file_path}>{row.file_path}</td>
              {#each orderedBackends as b}
                {@const r = row.byBackend[b]}
                {@const qi = queueIndex.get(`${row.hf_model_id}::${row.file_path}::${b}`)}
                <td class="backend-cell">
                  {#if r?.metrics}
                    {#each activeMetrics as m}
                      {@const val = (r.metrics as any)?.[m.key]}
                      <span class="metric-value" style="color: {m.color}" title="{m.label}: {val != null ? fmt(val) : 'n/a'}">
                        {val != null ? fmt(val) : 'n/a'}
                      </span>
                    {/each}
                  {:else if r?.error_message}
                    <span class="status-icon status-error" title="{r.error_message}">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </span>
                    {#if onretry && !isRunning}
                      <button class="retry-btn" onclick={() => onretry!(qi ?? r.test_item)} title="Retry">↺</button>
                    {/if}
                  {:else if qi}
                    {#if qi.status === 'pending'}
                      <span class="status-icon status-pending" title="Pending">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/></svg>
                      </span>
                    {:else if qi.status === 'downloading'}
                      <span class="status-icon status-downloading" title="Downloading">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      </span>
                    {:else if qi.status === 'compiling' || qi.status === 'running'}
                      <span class="status-icon status-running" title="{qi.status}">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                      </span>
                    {:else if qi.status === 'uploading'}
                      <span class="status-icon status-uploading" title="Uploading to database">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                      </span>
                    {:else if qi.status === 'error'}
                      {#if qi.error === 'Stopped by user'}
                        <span class="cell-na" title="Stopped">-</span>
                      {:else}
                        <span class="status-icon status-error" title="{qi.error ?? 'Error'}">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </span>
                        {#if onretry && !isRunning}
                          <button class="retry-btn" onclick={() => onretry!(qi)} title="Retry">↺</button>
                        {/if}
                      {/if}
                    {/if}
                  {:else}
                    <span class="cell-na">-</span>
                  {/if}
                </td>
              {/each}
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

    {#if partialDelegationRows.length > 0 && webnnBackends.length > 0}
      <div class="cap-header">
        <h4 class="capability-title">WebNN Partial Delegation ({partialDelegationRows.length})</h4>
        <div class="export-bar">
          <div class="export-group">
            <span class="export-group-icon">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </span>
            <button class="export-group-btn" onclick={() => copyCapAs('markdown')} title="Copy as Markdown" class:active={copyCapFeedback === 'markdown'}>MD</button>
            <button class="export-group-btn" onclick={() => copyCapAs('json')} title="Copy as JSON" class:active={copyCapFeedback === 'json'}>JSON</button>
            <button class="export-group-btn" onclick={() => copyCapAs('csv')} title="Copy as CSV" class:active={copyCapFeedback === 'csv'}>CSV</button>
          </div>
          <div class="export-group">
            <span class="export-group-icon">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </span>
            <button class="export-group-btn" onclick={saveCapMarkdown} title="Download Markdown">MD</button>
            <button class="export-group-btn" onclick={saveCapJSON} title="Download JSON">JSON</button>
            <button class="export-group-btn" onclick={saveCapCSV} title="Download CSV">CSV</button>
          </div>
        </div>
      </div>
      <div class="results-table-wrapper">
        <table class="results-table capability-table">
          <thead>
            <tr>
              <th class="th-model" rowspan="2">HuggingFace ID</th>
              <th class="th-file" rowspan="2">File</th>
              {#each webnnBackends as b}
                <th class="th-cap" colspan="4">{getBackendLabel(b)}</th>
              {/each}
            </tr>
            <tr class="cap-subhead">
              {#each webnnBackends as _b}
                <th>Partitions</th>
                <th>Total</th>
                <th>Supported</th>
                <th>Unsupported</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each partialDelegationRows as row}
              <tr>
                <td class="model-col" title={row.hf_model_id}>{row.hf_model_id}</td>
                <td class="file-col" title={row.file_path}>{row.file_path}</td>
                {#each webnnBackends as b}
                  {@const cap = row.byBackend[b]?.webnn_capability}
                  {#if cap}
                    <td class="cap-num cap-group-start">{cap.partitions ?? '-'}</td>
                    <td class="cap-num">{cap.total_nodes}</td>
                    <td class="cap-num cap-num-supported" class:cap-partial={cap.supported_nodes < cap.total_nodes}>{cap.supported_nodes}</td>
                    <td class="cap-ops" title={cap.unsupported_ops.join(', ')}>{cap.unsupported_ops.length > 0 ? cap.unsupported_ops.join(', ') : '-'}</td>
                  {:else}
                    <td class="cell-na cap-group-start" colspan="4">-</td>
                  {/if}
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {:else}
    <p class="no-results">No results yet. Run a benchmark to see metrics.</p>
  {/if}
</div>

<style>
  .hidden {
    display: none !important;
  }

  .results-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
    flex-wrap: wrap;
  }

  .results-title {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
    flex-shrink: 0;
  }

  .results-header-right {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-wrap: wrap;
  }

  .metric-toggles {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: var(--space-2);
    justify-content: center;
  }

  .metric-pill {
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 500;
    padding: 3px 10px;
    border-radius: 12px;
    border: 1px solid var(--color-border);
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .metric-pill:hover {
    border-color: var(--pill-color);
    color: var(--pill-color);
  }

  .metric-pill.active {
    background: var(--pill-color);
    border-color: var(--pill-color);
    color: #fff;
  }

  .results-filter {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    padding: 3px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    width: 180px;
    transition: border-color var(--transition-base);
  }

  .results-filter:focus-visible {
    border-color: var(--color-focus-ring);
  }

  .results-table-wrapper {
    overflow-x: auto;
  }

  .results-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    border-left: 1px solid var(--color-border);
    border-right: 1px solid var(--color-border);
  }

  .results-table th {
    text-align: center;
    padding: var(--space-1) var(--space-1);
    font-weight: 500;
    font-size: 11px;
    color: var(--color-text-muted);
    border-top: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
  }

  .results-table th.sortable {
    cursor: pointer;
  }

  .results-table th.sortable:hover {
    color: var(--color-text-primary);
  }

  .th-model, .th-file {
    text-align: center;
  }

  .results-table td {
    padding: var(--space-1) var(--space-1);
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
  }

  .results-table tbody tr:nth-child(even) {
    background: var(--color-surface-sunken);
  }

  .model-col {
    font-weight: 500;
    color: var(--color-text-muted);
    width: 15vw;
    max-width: 15vw;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
  }

  .file-col {
    width: 15vw;
    max-width: 15vw;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-muted);
    text-align: center;
  }

  .backend-cell {
    text-align: center;
    white-space: nowrap;
  }

  .metric-value {
    display: block;
    font-weight: 500;
  }

  .status-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .status-pending { color: var(--color-text-muted); }
  .status-downloading { color: var(--color-text-secondary); animation: blink 1.2s ease-in-out infinite; }
  .status-running { color: var(--color-primary); }
  .status-uploading { color: var(--color-warning, #f59e0b); }
  .status-error { color: var(--color-error); }

  .cell-na {
    color: var(--color-text-muted);
  }

  .retry-btn {
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 0 4px;
    border: 1px solid var(--color-error);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-error);
    cursor: pointer;
    margin-left: 4px;
    line-height: 1.4;
    transition: background var(--transition-base), color var(--transition-base);
  }

  .retry-btn:hover {
    background: var(--color-error);
    color: var(--color-text-on-primary);
  }

  .export-bar {
    display: flex;
    align-items: center;
    gap: var(--space-1);
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
    padding: 3px 7px;
    border: none;
    border-left: 1px solid var(--color-border);
    background: none;
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

  .pagination {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-top: var(--space-1);
  }

  .page-btn {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 3px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    cursor: pointer;
    transition: border-color var(--transition-base);
  }

  .page-btn:hover:not(:disabled) {
    border-color: var(--color-primary);
  }

  .page-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-info {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }


  .no-results {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    padding: var(--space-2) 0;
  }

  .cap-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: var(--space-3) 0 var(--space-1);
  }

  .capability-title {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
    margin: 0;
  }

  .capability-table th,
  .capability-table td {
    text-align: center;
  }

  .capability-table .th-cap,
  .capability-table .th-file,
  .capability-table .cap-subhead th:nth-child(4n + 1),
  .capability-table .cap-group-start,
  .capability-table .file-col {
    border-left: 1px solid var(--color-border);
  }

  .capability-table .cap-subhead th {
    font-size: 10px;
    font-weight: 500;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .cap-num {
    font-family: var(--font-mono);
    color: var(--color-text-primary);
  }

  .cap-num-supported.cap-partial {
    color: var(--color-warning, #f59e0b);
    font-weight: 600;
  }

  .cap-ops {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-error);
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 0.8s linear infinite; }

  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
</style>
