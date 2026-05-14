<script lang="ts">
  import type { Backend } from '$lib/engine/types';
  import { BACKENDS } from '$lib/engine/backends';

  let { selected = $bindable([]), available = [] }: { selected: Backend[]; available: Backend[] } = $props();

  function toggle(id: Backend) {
    if (selected.includes(id)) {
      selected = selected.filter((b) => b !== id);
    } else {
      selected = [...selected, id];
    }
  }
</script>

<div class="backend-selector">
  {#each BACKENDS as backend}
    <button
      class="backend-btn"
      class:active={selected.includes(backend.id)}
      class:unavailable={!available.includes(backend.id)}
      disabled={!available.includes(backend.id)}
      onclick={() => toggle(backend.id)}
    >
      {backend.label}
    </button>
  {/each}
</div>

<style>
  .backend-selector {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-half);
  }

  .backend-btn {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    padding: var(--space-half) var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .backend-btn:hover:not(:disabled) {
    border-color: var(--color-border-strong);
  }

  .backend-btn.active {
    background: var(--color-primary);
    color: #FFFFFF;
    border-color: var(--color-primary);
  }

  .backend-btn.unavailable {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
