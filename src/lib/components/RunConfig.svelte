<script lang="ts">
  let { iterations = $bindable(50), save_results = $bindable(false) }: { iterations: number; save_results: boolean } = $props();

  const iterationOptions = [1, 10, 20, 50, 100, 500, 1000, 10000];
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

  <label class="config-field checkbox">
    <input type="checkbox" bind:checked={save_results} />
    <span class="config-label">Save results</span>
  </label>
</div>

<style>
  .run-config {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .config-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .config-label {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .iter-group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-half);
  }

  .iter-btn {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    padding: var(--space-half) var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-base);
    white-space: nowrap;
  }

  .iter-btn:hover {
    border-color: var(--color-border-strong);
  }

  .iter-btn.active {
    background: var(--color-primary);
    color: #fff;
    border-color: var(--color-primary);
  }

  .config-field.checkbox {
    display: flex;
    align-items: center;
    gap: var(--space-half);
    cursor: pointer;
  }

  input[type="checkbox"] {
    cursor: pointer;
  }
</style>
