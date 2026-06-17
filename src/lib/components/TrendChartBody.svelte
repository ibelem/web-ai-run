<script lang="ts">
  import { getContext } from 'svelte';
  import type { Readable } from 'svelte/store';
  import type { TrendSeries, TrendPoint } from './TrendChart.svelte';

  let {
    series,
    xMode,
    yLabel,
    xTickLabel,
    xDomainOrdinal,
  }: {
    series: TrendSeries[];
    xMode: 'time' | 'ordinal';
    yLabel: string;
    xTickLabel: (xv: number | Date) => string;
    xDomainOrdinal: (number | Date)[];
  } = $props();

  // LayerCake publishes its computed scales/dimensions as Svelte stores on context.
  const lc = getContext<{
    xScale: Readable<any>;
    yScale: Readable<any>;
    width: Readable<number>;
    height: Readable<number>;
  }>('LayerCake');

  const xScale = lc.xScale;
  const yScale = lc.yScale;
  const width = lc.width;
  const height = lc.height;

  function fmtY(v: number): string {
    if (v == null || isNaN(v)) return '—';
    if (v >= 1000) return v.toFixed(0);
    return v < 1 ? v.toFixed(3) : v.toFixed(2);
  }

  let hover = $state<{ cx: number; cy: number; s: TrendSeries; p: TrendPoint } | null>(null);

  const yTicks = $derived($yScale && typeof $yScale.ticks === 'function' ? $yScale.ticks(5) : []);
  const xTicks = $derived(
    xMode === 'time' && $xScale && typeof $xScale.ticks === 'function' ? $xScale.ticks(6) : xDomainOrdinal,
  );
</script>

<g>
  <!-- Y grid + ticks -->
  {#each yTicks as t}
    <line class="grid-line" x1={0} x2={$width} y1={$yScale(t)} y2={$yScale(t)} />
    <text class="axis-tick axis-tick-y" x={-8} y={$yScale(t)} dy="0.32em" text-anchor="end">{fmtY(t)}</text>
  {/each}

  <!-- X ticks. Ordinal labels (version strings, GPU names…) can be long, so
       rotate them ~-32° and anchor at the end — keeps the rightmost label from
       spilling past the plot edge and stops neighbours colliding. Time ticks
       are short, so leave those centered. -->
  {#each xTicks as t}
    {#if xMode === 'time'}
      <text class="axis-tick axis-tick-x" x={$xScale(t)} y={$height + 18} text-anchor="middle">{xTickLabel(t)}</text>
    {:else}
      <text
        class="axis-tick axis-tick-x"
        text-anchor="end"
        transform="translate({$xScale(t)}, {$height + 12}) rotate(-32)"
      >{xTickLabel(t)}</text>
    {/if}
  {/each}

  <!-- Series lines + dots -->
  {#each series as s}
    {@const pts = s.points.filter((p) => p.y != null && !isNaN(p.y))}
    {#if pts.length > 1}
      <polyline
        class="series-line"
        fill="none"
        stroke={s.color}
        points={pts.map((p) => `${$xScale(p.x)},${$yScale(p.y)}`).join(' ')}
      />
    {/if}
    {#each pts as p}
      <circle
        class="series-dot"
        cx={$xScale(p.x)}
        cy={$yScale(p.y)}
        r={4}
        fill={s.color}
        role="img"
        aria-label="{s.label}: {fmtY(p.y)}"
        onmouseenter={() => (hover = { cx: $xScale(p.x), cy: $yScale(p.y), s, p })}
        onmouseleave={() => (hover = null)}
      />
    {/each}
  {/each}

  {#if hover}
    <g class="tt-group" transform="translate({hover.cx}, {hover.cy})">
      <foreignObject x={-80} y={-58} width={160} height={50} style="overflow: visible;">
        <div class="trend-tooltip">
          <span class="tt-series" style="color: {hover.s.color}">{hover.s.label}</span>
          <span class="tt-val">{fmtY(hover.p.y)} {yLabel}</span>
          <span class="tt-x">{xTickLabel(hover.p.x)}</span>
        </div>
      </foreignObject>
    </g>
  {/if}
</g>

<style>
  .grid-line { stroke: var(--color-border); stroke-width: 1; opacity: 0.5; }
  .axis-tick { font-family: var(--font-mono); font-size: 10px; fill: var(--color-text-muted); }
  .series-line { stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .series-dot { cursor: pointer; }
  .series-dot:hover { r: 6; }

  .trend-tooltip {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 5px 9px;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    box-shadow: var(--shadow-dropdown);
    font-family: var(--font-mono);
    font-size: 11px;
    white-space: nowrap;
    width: max-content;
    transform: translateX(-50%);
  }
  .tt-series { font-weight: 600; }
  .tt-val { color: var(--color-text-primary); }
  .tt-x { color: var(--color-text-muted); }
</style>
