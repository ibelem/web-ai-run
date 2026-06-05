<script lang="ts">
  let { iterations = $bindable(50) }: { iterations: number } = $props();

  const iterationOptions = [1, 10, 20, 50, 100, 500, 1000, 10000];

  const HIGH_ITER_THRESHOLD = 500;
  const showHighIterWarning = $derived(iterations >= HIGH_ITER_THRESHOLD);
</script>

<div class="run-config">
  <div class="config-row">
    <span class="config-label">Iterations</span>
    <div class="segment-group">
      {#each iterationOptions as opt}
        <button
          class="segment-btn"
          class:active={iterations === opt}
          onclick={() => iterations = opt}
        >{opt}</button>
      {/each}
    </div>
  </div>
  {#if showHighIterWarning}
    <p class="iter-warning">
      {iterations.toLocaleString()} iterations can take several minutes and may slow your browser tab on large models.
    </p>
  {/if}
</div>

<style>
  .run-config {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .config-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .config-label {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
  }

  .segment-group {
    display: flex;
    align-items: stretch;
    width: 100%;
    border-radius: var(--radius-base);
    overflow: hidden;
  }

  .segment-btn {
    flex: 1 1 0;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    padding: 0 4px;
    height: 32px;
    box-sizing: border-box;
    border: 1px solid var(--color-border);
    border-left: none;
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    white-space: nowrap;
    text-align: center;
    transition: background var(--transition-base), color var(--transition-base), border-color var(--transition-base);
  }

  .segment-btn:first-child {
    border-left: 1px solid var(--color-border);
  }

  .segment-btn:hover:not(.active) {
    background: var(--color-accent-light);
    color: var(--color-primary);
  }

  .segment-btn.active:hover {
    background: var(--color-primary-hover, var(--color-primary));
  }

  .segment-btn.active {
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    border-color: var(--color-primary);
  }

  .segment-btn.active + .segment-btn {
    border-left-color: var(--color-primary);
  }


  .iter-warning {
    font-size: var(--text-sm);
    color: var(--color-warning, #d97706);
    margin: 0;
  }
</style>
