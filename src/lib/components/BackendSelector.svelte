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

  function unavailableReason(backend: typeof BACKENDS[0]): string {
    if (backend.id === 'wasm_n') return 'SharedArrayBuffer not available in this browser.';
    if (backend.id === 'webgpu') return 'WebGPU not supported or no GPU adapter found.';
    if (backend.requiresFlag) return `Requires Chrome/Edge with WebNN flag enabled.`;
    return 'Not detected on this device.';
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
        onclick={() => toggle(backend.id)}
        title={avail ? backend.description : `${unavailableReason(backend)} ${backend.description}`}
        aria-label="{backend.label} ({avail ? 'available' : 'unavailable'})"
      >
        <span class="backend-label-text">{backend.label}</span>
        {#if !avail}<span class="backend-unavail-text" aria-hidden="true">N/A</span>{/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .backend-selector {
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

  .backend-btns {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: var(--space-half);
  }

  .backend-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
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
    width: 100%;
  }

  @media (pointer: coarse) {
    .backend-btn { min-height: 28px; padding: var(--space-1) var(--space-3); }
  }

  @media (max-width: 640px) {
    .backend-btns { grid-template-columns: repeat(3, 1fr); }
  }

  @media (max-width: 360px) {
    .backend-btns { grid-template-columns: repeat(2, 1fr); }
  }

  .backend-btn:hover:not(:disabled) {
    border-color: var(--color-border-strong);
  }

  .backend-btn.active {
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    border-color: var(--color-primary);
  }

  .backend-btn.unavailable {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .backend-unavail-text {
    font-family: var(--font-ui);
    font-size: 9px;
    line-height: 1;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

</style>
