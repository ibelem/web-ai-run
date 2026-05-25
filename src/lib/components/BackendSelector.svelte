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
        aria-label="{backend.label} ({avail ? 'available' : 'unavailable'})"
      >
        <span class="backend-dot" class:available={avail} aria-hidden="true"></span>
        <span class="backend-label-text">{backend.label}</span>
        {#if !avail}<span class="backend-unavail-text" aria-hidden="true">N/A</span>{/if}
        <span class="backend-help" title={avail ? backend.description : `${unavailableReason(backend)} ${backend.description}`} aria-label="Info: {avail ? backend.description : unavailableReason(backend)}">?</span>
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
    min-width: 80px;
  }

  .backend-btns {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-half);
  }

  .backend-btn {
    display: inline-flex;
    align-items: center;
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
  }

  @media (pointer: coarse) {
    .backend-btn { min-height: 44px; padding: var(--space-1) var(--space-2); }
  }

  .backend-btn:hover:not(:disabled) {
    border-color: var(--color-border-strong);
  }

  .backend-btn.active {
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    border-color: var(--color-primary);
  }

  .backend-btn.active .backend-dot.available {
    background: var(--color-text-on-primary);
    border-color: var(--color-text-on-primary);
  }

  .backend-btn.active .backend-help {
    color: rgba(255, 255, 255, 0.7);
    border-color: rgba(255, 255, 255, 0.4);
  }

  .backend-btn.unavailable {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .backend-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    background: none;
    border: 1.5px solid var(--color-text-muted);
  }

  .backend-dot.available {
    background: var(--color-success);
    border-color: var(--color-success);
  }

  .backend-unavail-text {
    font-family: var(--font-ui);
    font-size: 9px;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .backend-help {
    font-family: var(--font-ui);
    font-size: 9px;
    font-weight: 600;
    width: 14px;
    height: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 1px solid var(--color-border-strong);
    color: var(--color-text-muted);
    flex-shrink: 0;
    cursor: help;
  }
</style>
