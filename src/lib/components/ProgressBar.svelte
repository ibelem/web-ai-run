<script lang="ts">
  let { percent = 0, label = '', loadedBytes = 0, totalBytes = 0 }: { percent: number; label: string; loadedBytes?: number; totalBytes?: number } = $props();

  function fmtBytes(bytes: number): string {
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  }
</script>

<div class="progress-wrapper">
  {#if label}
    <span class="progress-label">{label}</span>
  {/if}
  <div class="progress-track">
    <div class="progress-fill" style="transform: scaleX({Math.min(100, percent) / 100})"></div>
  </div>
  <span class="progress-percent">
    {percent.toFixed(2)}%
    {#if totalBytes > 0}
      ({fmtBytes(loadedBytes)} / {fmtBytes(totalBytes)})
    {/if}
  </span>
</div>

<style>
  .progress-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-family: var(--font-mono);
  }

  .progress-label {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    min-width: 80px;
  }

  .progress-track {
    flex: 1;
    height: 2px;
    background: var(--color-accent);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    width: 100%;
    background: var(--color-primary);
    border-radius: 2px;
    transform-origin: left;
    transition: transform 150ms ease;
    will-change: transform;
  }

  .progress-percent {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    min-width: 50px;
    text-align: right;
    white-space: nowrap;
  }
</style>
