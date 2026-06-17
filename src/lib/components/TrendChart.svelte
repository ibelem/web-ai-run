<script lang="ts" module>
  // One plotted point / one series — exported as types for consumers + the body.
  export interface TrendPoint {
    x: number | Date;   // numeric (ordinal index / version index) or Date (time mode)
    y: number;          // metric value (averaged across n runs)
    label?: string;     // x tick label (for ordinal axes, e.g. a version string)
    n?: number;         // number of runs averaged into this point
    raw?: any;          // original row, for the tooltip
  }
  export interface TrendSeries {
    key: string;        // series id (the axis value, e.g. "webgpu")
    label: string;      // display label
    color: string;      // resolved CSS color (token value)
    points: TrendPoint[];
  }
</script>

<script lang="ts">
  import { LayerCake, Svg } from 'layercake';
  import { scaleTime, scaleLinear, scalePoint } from 'd3-scale';
  import TrendChartBody from './TrendChartBody.svelte';

  let {
    series = [],
    xMode = 'ordinal',          // 'time' | 'ordinal'
    yLabel = '',
    xLabel = '',
    lowerIsBetter = true,
  }: {
    series?: TrendSeries[];
    xMode?: 'time' | 'ordinal';
    yLabel?: string;
    xLabel?: string;
    lowerIsBetter?: boolean;
  } = $props();

  // Flatten for domain computation.
  const allPoints = $derived(series.flatMap((s) => s.points));
  const hasData = $derived(allPoints.length > 0);

  // For an ordinal X axis, the domain is the ordered set of distinct labels;
  // for time it's [minDate, maxDate]; LayerCake gets a flat record per point.
  const flat = $derived(
    series.flatMap((s) =>
      s.points.map((p) => ({ x: p.x, y: p.y, seriesKey: s.key })),
    ),
  );

  // Distinct ordinal x positions, sorted ascending so the scalePoint axis is
  // monotonic regardless of which series introduced a value first. The page maps
  // ordinal X to a numeric index, so a numeric sort gives the intended order.
  const xDomainOrdinal = $derived.by(() => {
    const seen = new Set<string>();
    const out: (number | Date)[] = [];
    for (const s of series) {
      for (const p of s.points) {
        const k = String(p.x);
        if (!seen.has(k)) { seen.add(k); out.push(p.x); }
      }
    }
    return out.sort((a, b) =>
      Number(a instanceof Date ? a.getTime() : a) - Number(b instanceof Date ? b.getTime() : b),
    );
  });

  // Map an x value to a readable tick label.
  const xTickLabel = $derived.by(() => {
    const map = new Map<string, string>();
    for (const s of series) {
      for (const p of s.points) {
        if (p.label) map.set(String(p.x), p.label);
      }
    }
    return (xv: number | Date): string => {
      const k = String(xv);
      if (map.has(k)) return map.get(k)!;
      if (xMode === 'time') {
        const d = xv instanceof Date ? xv : new Date(Number(xv));
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
      return k;
    };
  });

  // ─────── Pivot table (matches the chart exactly) ───────
  // Rows = X positions (in chart order), columns = series, cells = the same
  // averaged y the chart plots, plus the run count n.
  function fmtY(v: number | null | undefined): string {
    if (v == null || isNaN(v as number)) return '—';
    return (v as number) < 1 ? (v as number).toFixed(3) : (v as number).toFixed(2);
  }

  // Ordered, de-duplicated X positions across all series.
  const xRows = $derived.by(() => {
    const seen = new Set<string>();
    const rows: { x: number | Date; label: string }[] = [];
    for (const s of series) {
      for (const p of s.points) {
        const k = String(p.x);
        if (!seen.has(k)) { seen.add(k); rows.push({ x: p.x, label: xTickLabel(p.x) }); }
      }
    }
    return rows.sort((a, b) =>
      Number(a.x instanceof Date ? a.x.getTime() : a.x) - Number(b.x instanceof Date ? b.x.getTime() : b.x),
    );
  });

  // Fast lookup: seriesKey → (xKey → point).
  const pointIndex = $derived.by(() => {
    const m = new Map<string, Map<string, TrendPoint>>();
    for (const s of series) {
      const inner = new Map<string, TrendPoint>();
      for (const p of s.points) inner.set(String(p.x), p);
      m.set(s.key, inner);
    }
    return m;
  });

  function cell(seriesKey: string, x: number | Date): TrendPoint | undefined {
    return pointIndex.get(seriesKey)?.get(String(x));
  }

  // ─────── Export (MD / JSON / CSV), same buttons as the results pages ───────
  function exportMatrix(): { header: string[]; rows: string[][] } {
    const header = [xLabel || 'X', ...series.map((s) => s.label)];
    const rows = xRows.map((r) => [
      r.label,
      ...series.map((s) => {
        const p = cell(s.key, r.x);
        return p ? fmtY(p.y) : '';
      }),
    ]);
    return { header, rows };
  }

  function toMarkdown(): string {
    const { header, rows } = exportMatrix();
    const sep = header.map(() => '---');
    return [header.join(' | '), sep.join(' | '), ...rows.map((r) => r.join(' | '))].join('\n');
  }
  function toCSV(): string {
    const { header, rows } = exportMatrix();
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    return [header.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  }
  function toJSON(): string {
    return JSON.stringify(
      {
        x_axis: xLabel,
        metric: yLabel,
        series: series.map((s) => ({
          name: s.label,
          points: s.points.map((p) => ({ x: p.label ?? p.x, value: p.y, runs: p.n })),
        })),
      },
      null,
      2,
    );
  }

  let copyFeedback = $state('');
  async function copyAs(fmt: 'markdown' | 'json' | 'csv') {
    const text = fmt === 'markdown' ? toMarkdown() : fmt === 'json' ? toJSON() : toCSV();
    await navigator.clipboard.writeText(text);
    copyFeedback = fmt;
    setTimeout(() => { if (copyFeedback === fmt) copyFeedback = ''; }, 2000);
  }
  function saveFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
  const dateSuffix = () => new Date().toISOString().slice(0, 10);
  function saveMarkdown() { saveFile(toMarkdown(), `trend-${dateSuffix()}.md`,   'text/markdown'); }
  function saveJSON()     { saveFile(toJSON(),     `trend-${dateSuffix()}.json`, 'application/json'); }
  function saveCSV()      { saveFile(toCSV(),      `trend-${dateSuffix()}.csv`,  'text/csv'); }
</script>

{#if !hasData}
  <div class="trend-empty">
    <p>No data points for this selection.</p>
    <p class="trend-empty-hint">A trend needs at least two runs across the chosen X axis. Run more benchmarks, or widen the filters / pick a different axis.</p>
  </div>
{:else}
  <div class="trend-chart-wrap">
    <div class="trend-plot">
      <LayerCake
        padding={{ top: 12, right: 24, bottom: xMode === 'time' ? 36 : 72, left: 52 }}
        x="x"
        y="y"
        xScale={xMode === 'time' ? scaleTime() : scalePoint()}
        xDomain={xMode === 'time' ? undefined : (xDomainOrdinal as any)}
        yScale={scaleLinear()}
        yDomain={[0, null]}
        yNice
        data={flat}
      >
        <Svg>
          <TrendChartBody {series} {xMode} {yLabel} {xTickLabel} {xDomainOrdinal} />
        </Svg>
      </LayerCake>
    </div>

    <!-- Legend -->
    <div class="trend-legend">
      {#each series as s}
        <span class="legend-item">
          <span class="legend-swatch" style="background: {s.color}"></span>
          <span class="legend-label">{s.label}</span>
        </span>
      {/each}
      <span class="legend-meta">{yLabel}{lowerIsBetter ? ' · lower is better' : ' · higher is better'}</span>
    </div>

    <!-- Data table — pivot matching the chart (rows = X, cols = series) -->
    <div class="trend-table-head">
      <span class="trend-table-title">Data · {yLabel}</span>
      <div class="export-row">
        <div class="export-group">
          <span class="export-group-icon" title="Copy to clipboard">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </span>
          <button class="export-group-btn" class:active={copyFeedback === 'markdown'} onclick={() => copyAs('markdown')} title="Copy as Markdown">MD</button>
          <button class="export-group-btn" class:active={copyFeedback === 'json'} onclick={() => copyAs('json')} title="Copy as JSON">JSON</button>
          <button class="export-group-btn" class:active={copyFeedback === 'csv'} onclick={() => copyAs('csv')} title="Copy as CSV">CSV</button>
        </div>
        <div class="export-group">
          <span class="export-group-icon" title="Download">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </span>
          <button class="export-group-btn" onclick={saveMarkdown} title="Download Markdown">MD</button>
          <button class="export-group-btn" onclick={saveJSON} title="Download JSON">JSON</button>
          <button class="export-group-btn" onclick={saveCSV} title="Download CSV">CSV</button>
        </div>
      </div>
    </div>
    <div class="trend-table-wrap">
      <table class="trend-table">
        <thead>
          <tr>
            <th class="th-x">{xLabel || 'X'}</th>
            {#each series as s}
              <th>
                <span class="th-swatch" style="background: {s.color}"></span>{s.label}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each xRows as r}
            <tr>
              <td class="td-x" title={r.label}>{r.label}</td>
              {#each series as s}
                {@const p = cell(s.key, r.x)}
                <td class="td-val" title={p && p.n ? `${p.n} run${p.n !== 1 ? 's' : ''} averaged` : ''}>
                  {#if p}{fmtY(p.y)}{#if p.n && p.n > 1}<span class="td-n">n={p.n}</span>{/if}{:else}—{/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}

<style>
  .trend-chart-wrap {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  /* LayerCake needs an explicitly sized parent. */
  .trend-plot {
    position: relative;
    width: 100%;
    height: 420px;
  }

  .trend-legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding-top: var(--space-1);
  }
  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
  }
  .legend-swatch {
    width: 12px;
    height: 3px;
    border-radius: 2px;
  }
  .legend-meta {
    margin-left: auto;
    font-family: var(--font-ui);
    font-size: 10px;
    color: var(--color-text-muted);
  }

  .trend-empty {
    text-align: center;
    padding: var(--space-5) var(--space-3);
    color: var(--color-text-muted);
  }
  .trend-empty-hint {
    font-size: var(--text-xs);
    margin-top: var(--space-1);
  }

  /* ── Data table (pivot) ── */
  .trend-table-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-top: var(--space-3);
    flex-wrap: wrap;
  }
  .trend-table-title {
    font-family: var(--font-ui);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
  }
  .export-row {
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

  .trend-table-wrap {
    overflow-x: auto;
    margin-top: var(--space-1);
  }
  .trend-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-xs);
    font-family: var(--font-mono);
  }
  .trend-table th {
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
  .trend-table th.th-x { text-align: left; }
  .th-swatch {
    display: inline-block;
    width: 10px;
    height: 3px;
    border-radius: 2px;
    margin-right: 5px;
    vertical-align: middle;
  }
  .trend-table td {
    padding: 2px var(--space-1);
    border-bottom: 1px solid var(--color-border);
    text-align: center;
    white-space: nowrap;
  }
  .trend-table tbody tr:hover { background: var(--color-nav-item-hover); }
  .td-x {
    text-align: left;
    color: var(--color-text-secondary);
    font-family: var(--font-ui);
    max-width: 16vw;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .td-val { font-variant-numeric: tabular-nums; }
  .td-n {
    margin-left: 5px;
    font-size: 9px;
    color: var(--color-text-muted);
  }

  @media (max-width: 768px) {
    .trend-plot { height: 320px; }
  }
</style>
