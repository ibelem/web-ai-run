<script lang="ts">
  let { percent = 0, label = '' }: { percent: number; label: string } = $props();
</script>

<div class="progress-wrapper">
  {#if label}
    <span class="progress-label">{label}</span>
  {/if}
  <div class="progress-track">
    <div class="progress-fill" style="transform: scaleX({Math.min(100, percent) / 100})"></div>
  </div>
  <span class="progress-percent">{percent.toFixed(0)}%</span>
</div>

<style>
  .progress-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .progress-label {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    min-width: 80px;
  }

  .progress-track {
    flex: 1;
    height: 4px;
    background: var(--color-surface-sunken);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    width: 100%;
    background: var(--color-info);
    border-radius: 2px;
    transform-origin: left;
    transition: transform 150ms ease;
    will-change: transform;
  }

  .progress-percent {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    min-width: 32px;
    text-align: right;
  }
</style>
