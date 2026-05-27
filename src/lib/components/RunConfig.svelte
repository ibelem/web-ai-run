<script lang="ts">
  let { iterations = $bindable(50) }: { iterations: number } = $props();

  const iterationOptions = [1, 10, 20, 50, 100, 500, 1000, 10000];

  const HIGH_ITER_THRESHOLD = 500;
  const showHighIterWarning = $derived(iterations >= HIGH_ITER_THRESHOLD);
</script>

<div class="run-config">
  <div class="config-row">
    <span class="config-label">Iterations</span>
    <div class="iter-group">
      {#each iterationOptions as opt}
        <button
          class="iter-btn"
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
    white-space: nowrap;
  }

  .iter-group {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: var(--space-half);
  }

  .iter-btn {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    padding: var(--space-half) var(--space-1);
    min-height: 28px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-base);
    white-space: nowrap;
    width: 100%;
    text-align: center;
  }

  @media (pointer: coarse) {
    .iter-btn { min-height: 28px; padding: var(--space-1) var(--space-2); }
  }

  @media (max-width: 640px) {
    .iter-group { grid-template-columns: repeat(4, 1fr); }
  }

  @media (max-width: 360px) {
    .iter-group { grid-template-columns: repeat(4, 1fr); }
  }

  .iter-btn:hover {
    border-color: var(--color-border-strong);
  }

  .iter-btn.active {
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    border-color: var(--color-primary);
  }

  .iter-warning {
    font-size: var(--text-sm);
    color: var(--color-warning, #d97706);
    margin: 0;
  }

</style>
