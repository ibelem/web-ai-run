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
  <span class="config-label">Backends</span>
  <div class="backend-btns">
    {#each BACKENDS as backend}
      {@const avail = available.includes(backend.id)}
      <button
        class="backend-btn"
        class:active={selected.includes(backend.id)}
        class:unavailable={!avail}
        disabled={!avail}
        title={avail ? backend.description : `${backend.description}${backend.requiresFlag ? ' (needs browser flag)' : ' (not detected on this device)'}`}
        onclick={() => toggle(backend.id)}
      >
        {backend.label}
      </button>
    {/each}
  </div>
</div>

<style>
  .backend-selector {
    display: flex;
    align-items: flex-start;
    gap: var(--space-1);
    flex-wrap: wrap;
  }

  .config-label {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    white-space: nowrap;
    min-width: 103px;
  }

  .backend-btns {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-half);
  }

  .backend-btn {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    padding: var(--space-half) var(--space-1);
    min-height: 32px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-base);
  }

  @media (pointer: coarse) {
    .backend-btn { min-height: 44px; padding: var(--space-1) var(--space-2); }
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
