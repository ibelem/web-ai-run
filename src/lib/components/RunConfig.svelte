<script lang="ts">
  let { iterations = $bindable(10), save_results = $bindable(false) }: { iterations: number; save_results: boolean } = $props();

  const iterationOptions = [1, 10, 20, 50, 100, 500, 1000];
</script>

<div class="run-config">
  <label class="config-field">
    <span class="config-label">Iterations</span>
    <select bind:value={iterations}>
      {#each iterationOptions as opt}
        <option value={opt}>{opt}</option>
      {/each}
    </select>
  </label>

  <label class="config-field checkbox">
    <input type="checkbox" bind:checked={save_results} />
    <span class="config-label">Save results to database</span>
  </label>
</div>

<style>
  .run-config {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .config-field {
    display: flex;
    align-items: center;
    gap: var(--space-half);
  }

  .config-field.checkbox {
    cursor: pointer;
  }

  .config-label {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  select {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    padding: 2px var(--space-half);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-primary);
  }

  input[type="checkbox"] {
    cursor: pointer;
  }
</style>
