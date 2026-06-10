<script lang="ts">
  import HFSearch, { type SelectedHFModel } from '$lib/components/HFSearch.svelte';
  import HFUrlImport from '$lib/components/HFUrlImport.svelte';
  import { cart, cartCount } from '$lib/stores/cart';

  let hfSearchQuery = $state('');
  let hfModels = $state<SelectedHFModel[]>([]);

  $effect(() => {
    hfModels = $cart.filter((m) => !m.id) as SelectedHFModel[];
  });

  $effect(() => {
    const cartHF = $cart.filter((m) => !m.id);
    const added = hfModels.filter(
      (m) => !cartHF.some((c) => c.hf_model_id === m.hf_model_id && c.file_path === m.file_path)
    );
    const removed = cartHF.filter(
      (c) => !hfModels.some((m) => m.hf_model_id === c.hf_model_id && m.file_path === c.file_path)
    );
    for (const m of added) cart.add(m);
    for (const m of removed) cart.remove(m.hf_model_id, m.file_path);
  });

  const isHFUrl = $derived((() => {
    try { return new URL(hfSearchQuery.trim()).hostname === 'huggingface.co'; }
    catch { return false; }
  })());
</script>

<div class="dashboard">
  <section class="hf-home-section">
    <div class="hf-home-search-wrap">
      <svg class="hf-home-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        class="hf-home-input"
        type="search"
        placeholder="onnx-community/yolov10x"
        bind:value={hfSearchQuery}
        autocomplete="off"
        spellcheck="false"
      />
      <div class="hf-home-actions">
        {#if $cartCount === 1}
          {@const m = $cart[0]}
          <button
            class="hf-home-btn hf-home-btn-primary"
            onclick={() => {
              const seg = `${m.hf_model_id}|${m.file_path}`;
              window.location.href = `/inference/run#models=${encodeURIComponent(seg)}&backend=webgpu&n=50`;
            }}
          >Run model</button>
        {:else}
          <a href="/inference/browse" class="hf-home-btn hf-home-btn-secondary">Browse</a>
        {/if}
      </div>
    </div>
    <div class="hf-home-results">
      {#if isHFUrl}
        <HFUrlImport url={hfSearchQuery.trim()} bind:selectedHFModels={hfModels} />
      {:else if hfSearchQuery.trim()}
        <HFSearch searchQuery={hfSearchQuery} bind:selectedHFModels={hfModels} />
      {:else}
        <p class="hf-home-hint">
          <span class="pulse-dot" aria-hidden="true">
            <span class="pulse-ring"></span>
            <span class="pulse-core"></span>
          </span>
          Paste a HuggingFace org name, model ID (e.g. <code>onnx-community/yolov10x</code>), or model URL.
        </p>
      {/if}
    </div>
  </section>
</div>

<style>
  .dashboard {
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .hf-home-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 50vh;
    text-align: center;
  }

  .hf-home-results {
    width: 100%;
    max-width: 960px;
    margin: var(--space-2) auto 0;
    text-align: left;
  }

  .hf-home-search-wrap {
    display: flex;
    align-items: center;
    gap: 0;
    width: 100%;
    max-width: 600px;
    margin: 0 auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface-raised);
    padding: 0 0 0 10px;
    transition: border-color var(--transition-base), box-shadow var(--transition-base);
  }

  .hf-home-search-wrap:focus-within {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(9, 83, 222, 0.08);
  }

  .hf-home-search-icon {
    color: var(--color-text-muted);
    flex-shrink: 0;
    margin-right: 10px;
  }

  .hf-home-input {
    flex: 1;
    border: none !important;
    background: none;
    outline: none;
    font-family: var(--font-ui);
    font-size: var(--text-base);
    color: var(--color-text-primary);
    padding: 14px 0;
    min-width: 0;
  }

  .hf-home-input::placeholder { color: var(--color-text-muted); }
  .hf-home-input::-webkit-search-cancel-button { display: none; }

  .hf-home-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    padding-left: 8px;
  }

  .hf-home-btn {
    display: inline-flex;
    align-items: center;
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-base);
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-top-width: 0 !important;
    border-bottom-width: 0 !important;
    border-right-width: 0 !important;
    white-space: nowrap;
    text-decoration: none;
    cursor: pointer;
    transition: background var(--transition-base), border-color var(--transition-base);
  }

  .hf-home-btn-secondary {
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-secondary);
  }

  .hf-home-btn-secondary:hover {
    color: var(--color-text-on-primary);
    background: var(--color-primary);
  }

  .hf-home-btn-primary {
    border: none;
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    transition: background var(--transition-base);
  }

  .hf-home-btn-primary:hover { background: var(--color-primary-hover); }

  .hf-home-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .hf-home-hint code {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    background: var(--color-surface-sunken);
    padding: 1px 3px;
    border-radius: var(--radius-sm);
  }

  /* Pulse used in the empty-state hint */
  .pulse-dot {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 8px;
    height: 8px;
    flex-shrink: 0;
    margin-right: 8px;
  }

  .pulse-ring {
    position: absolute;
    display: inline-flex;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: var(--color-accent);
    opacity: 0.75;
    animation: hf-ping 1.8s cubic-bezier(0,0,0.2,1) infinite;
  }

  .pulse-core {
    position: relative;
    display: inline-flex;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-accent);
  }

  @keyframes hf-ping {
    75%, 100% { transform: scale(2.4); opacity: 0; }
  }

  @media (max-width: 600px) {
    .hf-home-section {
      padding: 24px 1var(--space-1) var(--space-3);
    }
    .hf-home-input { font-size: 15px; }
    .hf-home-btn { font-size: var(--text-sm); padding: 8px 14px; }
    .hf-home-hint {
      align-items: center;
      flex-wrap: wrap;
      font-size: var(--text-xs);
      justify-content: center;
    }
    .hf-home-hint code { word-break: break-all; }
  }
</style>
