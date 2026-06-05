<script lang="ts">
  import type { Backend } from '$lib/engine/types';
  import { BACKENDS } from '$lib/engine/backends';

  let { selected = $bindable([]), available = [], backends: backendList = BACKENDS }: { selected: Backend[]; available: Backend[]; backends?: typeof BACKENDS } = $props();

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
  <div class="segment-group">
    {#each backendList as backend}
      {@const avail = available.includes(backend.id)}
      <button
        class="segment-btn"
        class:active={selected.includes(backend.id)}
        class:unavailable={!avail}
        disabled={!avail}
        onclick={() => toggle(backend.id)}
        title={avail ? backend.description : `${unavailableReason(backend)} ${backend.description}`}
        aria-label="{backend.label} ({avail ? 'available' : 'unavailable'})"
      >
        {backend.label}
        {#if !avail}<span class="na-tag" aria-hidden="true">N/A</span>{/if}
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
  }

  .segment-group {
    display: flex;
    align-items: stretch;
    width: 100%;
    border-radius: var(--radius-base);
    overflow: hidden;
  }

  .segment-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
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
    transition: background var(--transition-base), color var(--transition-base), border-color var(--transition-base);
  }

  .segment-btn:first-child {
    border-left: 1px solid var(--color-border);
  }

  .segment-btn:hover:not(:disabled):not(.active) {
    background: var(--color-accent-light);
    color: var(--color-primary);
  }

  .segment-btn.active:hover:not(:disabled) {
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

  .segment-btn.unavailable {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .na-tag {
    font-family: var(--font-ui);
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    opacity: 0.7;
  }

</style>
