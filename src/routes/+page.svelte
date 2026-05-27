<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { isAuthenticated, auth } from '$lib/stores/auth';
  import { createClient } from '$lib/supabase/client';
  import { BACKENDS, detectAvailableBackends } from '$lib/engine/backends';
  import { detectEnvironment } from '$lib/engine/environment';
  import type { Backend, EnvironmentInfo } from '$lib/engine/types';
  import { inferFormat, stripExt } from '$lib/huggingface/parser';
  import HFSearch, { type SelectedHFModel } from '$lib/components/HFSearch.svelte';
  import FormatIcon from '$lib/components/FormatIcon.svelte';
  import HFUrlImport from '$lib/components/HFUrlImport.svelte';
  import { cart, cartCount } from '$lib/stores/cart';

  interface RecentModel {
    id: string;
    hf_model_id: string;
    file_path: string;
    data_type: string;
    size_bytes: number;
    runtime: 'onnx' | 'litert';
    source_org: string;
    task: string;
    last_synced: string;
  }

  let environment = $state<EnvironmentInfo | null>(null);
  let availableBackends = $state<Backend[]>([]);
  let recentResults = $state<any[]>([]);
  let recentModels = $state<RecentModel[]>([]);
  let loadingEnv = $state(true);
  let loadingResults = $state(true);
  let loadingModels = $state(true);

  // HF search section (authenticated only)
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

  onMount(async () => {
    try {
      const [env, backends] = await Promise.all([
        detectEnvironment(),
        detectAvailableBackends()
      ]);
      environment = env;
      availableBackends = backends;
    } catch (e) {
      console.error('Failed to detect environment:', e);
    } finally {
      loadingEnv = false;
    }

    const supabase = createClient();

    try {
      const { data: models } = await (supabase.from('models') as any)
        .select('id, hf_model_id, file_path, data_type, size_bytes, runtime, source_org, task, last_synced')
        .order('last_synced', { ascending: false })
        .limit(9);
      if (models) recentModels = models;
    } catch (e) {
      console.error('Failed to fetch models:', e);
    }
    loadingModels = false;

    const authState = get(auth);
    if (authState.session) {
      try {
        const { data } = await (supabase.from('results') as any)
          .select('id, model_id, backend, status, median_ms, started_at')
          .order('created_at', { ascending: false })
          .limit(5);
        if (data) recentResults = data;
      } catch (e) {
        console.error('Failed to fetch results:', e);
      }
    }
    loadingResults = false;
  });

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatRelative(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

</script>

<div class="dashboard">
  <!-- Hero / HF Search (mutually exclusive) -->
  {#if $auth.loading}
    <div class="auth-loading-placeholder"></div>
  {:else if $isAuthenticated}
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
                window.location.href = `/run#models=${encodeURIComponent(seg)}&backend=webgpu&n=50`;
              }}
            >Run model</button>
          {:else}
            <a href="/browse" class="hf-home-btn hf-home-btn-secondary">Browse</a>
          {/if}
        </div>
      </div>
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
    </section>
  {:else}
  <!-- Hero -->
  <section class="hero">
    <div class="hero-orb hero-orb-cyan" aria-hidden="true"></div>
    <div class="hero-orb hero-orb-blue" aria-hidden="true"></div>
    <div class="hero-grid" aria-hidden="true"></div>

    <div class="hero-content">
      <div class="hero-left">
        <div class="hero-eyebrow">
          <span class="pulse-dot">
            <span class="pulse-ring"></span>
            <span class="pulse-core"></span>
          </span>
          <span class="eyebrow-text">Live · On-device in-browser inference</span>
        </div>

        <h1 class="hero-title">
          <span class="hero-gradient">Benchmark on-device AI</span><br/>
          <span>on the open web</span>
        </h1>

        <p class="hero-subtitle">
          LiteRT.js, ONNX Runtime Web, WebNN, WebGPU, and Wasm. Run real ML models in your browser and compare performance across backends - no install, no server.
        </p>

        <div class="hero-ctas">
          <a href="/browse" class="hero-btn-primary">
            Start benchmarking <span aria-hidden="true">&rarr;</span>
          </a>
          <a href="#capabilities" class="hero-btn-secondary">See your environment</a>
        </div>

        <div class="hero-tags">
          <span class="hero-tag">WebNN</span>
          <span class="hero-tag">WebGPU</span>
          <span class="hero-tag">Wasm</span>
          <span class="hero-tag">.tflite</span>
          <span class="hero-tag">.litertlm</span>
          <span class="hero-tag">.onnx</span>
          <span class="hero-tag">LiteRT.js</span>
          <span class="hero-tag">ONNX Runtime Web</span>
          <span class="hero-tag">HuggingFace</span>
        </div>
      </div>

      <div class="hero-right">
        <div class="hero-card-mock">
          <div class="mock-float-badge mock-float-top">Average: 2.1ms</div>
          <div class="mock-float-badge mock-float-bottom">50 iterations</div>
          <div class="mock-header">
            <div>
              <div class="mock-label">mobilenet_v2 · onnx</div>
              <div class="mock-title">Image Classification</div>
              <div class="mock-meta">fp32 · 13.5 MB · Xenova</div>
            </div>
            <span class="mock-badge">WebNN</span>
          </div>
          <div class="mock-results">
            <div class="mock-row">
              <span class="mock-backend">WebNN GPU</span>
              <div class="mock-bar-wrap"><div class="mock-bar mock-bar-1"></div></div>
              <span class="mock-ms">2.1 ms</span>
            </div>
            <div class="mock-row">
              <span class="mock-backend">WebGPU</span>
              <div class="mock-bar-wrap"><div class="mock-bar mock-bar-2"></div></div>
              <span class="mock-ms">4.8 ms</span>
            </div>
            <div class="mock-row">
              <span class="mock-backend">Wasm x4</span>
              <div class="mock-bar-wrap"><div class="mock-bar mock-bar-3"></div></div>
              <span class="mock-ms">12.3 ms</span>
            </div>
            <div class="mock-row">
              <span class="mock-backend">Wasm x1</span>
              <div class="mock-bar-wrap"><div class="mock-bar mock-bar-4"></div></div>
              <span class="mock-ms">31.7 ms</span>
            </div>
          </div>
          <div class="mock-footer">
            <span class="mock-footer-label">Fastest</span>
            <span class="mock-footer-value">2.1 ms</span>
          </div>
        </div>
      </div>
    </div>
  </section>
  {/if}

  <!-- Capabilities -->
  {#if !$auth.loading && !$isAuthenticated}
  <section id="capabilities" class="card capabilities">
    <h2 class="card-title">Environment</h2>
    {#if loadingEnv}
      <p class="muted">Detecting environment...</p>
    {:else if environment}
      <div class="env-grid">
        <div class="env-item">
          <span class="env-label">GPU</span>
          <span class="env-value">{environment.gpu}</span>
        </div>
        <div class="env-item">
          <span class="env-label">Browser</span>
          <span class="env-value">{environment.browser} {environment.browser_version}</span>
        </div>
      </div>
      <p class="privacy-notice">Your environment information is NOT recorded unless you explicitly agree when running a benchmark.</p>
    {/if}
  </section>

  {/if}

  {#if !$auth.loading && !$isAuthenticated}

  <!-- Recent Model Updates -->
  <section class="card recent-models">
    <h2 class="card-title">Recent Model Updates</h2>
    {#if loadingModels}
      <p class="muted">Loading models...</p>
    {:else if recentModels.length === 0}
      <p class="muted">No models synced yet. Models are auto-discovered from HuggingFace.</p>
    {:else}
      <div class="model-list">
        {#each recentModels as model (model.id)}
          <a href="/browse?q={encodeURIComponent(model.hf_model_id)}" class="model-row">
            <div class="model-info">
              <span class="model-repo">{model.hf_model_id}</span>
              <span class="model-file">{stripExt(model.file_path)}</span>
            </div>
            <div class="model-badges">
              <FormatIcon format={inferFormat(model.file_path)} size={16} />
              <span class="dtype-chip" data-dtype={model.data_type}>{model.data_type === 'quantized' ? 'quant' : model.data_type}</span>
            </div>
            <span class="model-synced">{formatRelative(model.last_synced)}</span>
          </a>
        {/each}
      </div>
      <a href="/browse" class="view-all">View all models &rarr;</a>
    {/if}
  </section>
  {/if}
</div>

<style>
  .dashboard {
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .hero {
    position: relative;
    overflow: hidden;
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
  }

  .hero-orb {
    position: absolute;
    pointer-events: none;
    border-radius: 50%;
  }

  .hero-orb-cyan {
    top: -140px;
    right: -100px;
    width: 420px;
    height: 420px;
    background: radial-gradient(circle, color-mix(in srgb, var(--color-accent) 22%, transparent) 0%, transparent 70%);
    filter: blur(8px);
  }

  .hero-orb-blue {
    bottom: -120px;
    left: -80px;
    width: 360px;
    height: 360px;
    background: radial-gradient(circle, rgba(9,83,222,0.20) 0%, rgba(9,83,222,0) 70%);
    filter: blur(8px);
  }

  .hero-grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.35;
    background-image:
      linear-gradient(var(--color-border) 1px, transparent 1px),
      linear-gradient(90deg, var(--color-border) 1px, transparent 1px);
    background-size: 48px 48px;
    mask-image: radial-gradient(ellipse at center, black 40%, transparent 75%);
    -webkit-mask-image: radial-gradient(ellipse at center, black 40%, transparent 75%);
  }

  .hero-content {
    position: relative;
    display: grid;
    grid-template-columns: 1.15fr 1fr;
    gap: 40px;
    padding: 48px;
    align-items: center;
  }

  .hero-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-bottom: 20px;
  }

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
    animation: hero-ping 1.8s cubic-bezier(0,0,0.2,1) infinite;
  }

  .pulse-core {
    position: relative;
    display: inline-flex;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-accent);
  }

  .eyebrow-text {
    font-size: 12px;
    font-weight: 500;
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--color-text-muted);
  }

  .hero-title {
    font-size: 44px;
    line-height: 1.1;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-bottom: 20px;
    color: var(--color-text-primary);
  }

  .hero-gradient {
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .hero-subtitle {
    font-size: 17px;
    line-height: 1.6;
    color: var(--color-text-secondary);
    max-width: 540px;
    margin-bottom: 28px;
  }

  .hero-ctas {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 32px;
  }

  .hero-btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border: none;
    border-radius: var(--radius-base);
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    text-decoration: none;
    color: var(--color-text-on-primary);
    background: var(--color-primary);
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .hero-btn-primary:hover { background: var(--color-primary-hover); }

  .hero-btn-secondary {
    display: inline-flex;
    align-items: center;
    padding: 10px 20px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    text-decoration: none;
    color: var(--color-text-primary);
    background: transparent;
    transition: background var(--transition-base), border-color var(--transition-base);
  }

  .hero-btn-secondary:hover { background: var(--color-surface-sunken); border-color: var(--color-border-strong); }

  .hero-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .hero-tag {
    font-size: 12px;
    font-weight: 500;
    font-family: var(--font-mono);
    padding: 4px 10px;
    border-radius: var(--radius-base);
    background: var(--color-surface-sunken);
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
  }

  .hero-right {
    position: relative;
    display: flex;
    justify-content: center;
  }

  .hero-card-mock {
    position: relative;
    width: 100%;
    max-width: 360px;
    border-radius: var(--radius-lg);
    padding: 20px;
    margin: 20px 16px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    will-change: transform;
    animation: hero-float 6s ease-in-out infinite;
  }


  .mock-float-badge {
    position: absolute;
    font-size: 11px;
    font-family: var(--font-mono);
    font-weight: 500;
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    border: 1px solid;
  }

  .mock-float-top {
    top: -12px;
    left: -16px;
    color: var(--color-backend-webnn-gpu);
    border-color: var(--color-backend-webnn-gpu);
    transform: rotate(-4deg);
  }

  .mock-float-bottom {
    bottom: -12px;
    right: -16px;
    color: var(--color-accent);
    border-color: var(--color-accent);
    transform: rotate(3deg);
  }


  .mock-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 16px;
  }

  .mock-label {
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    margin-bottom: 4px;
  }

  .mock-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text-primary);
    line-height: 1.3;
  }

  .mock-meta {
    font-size: 12px;
    font-family: var(--font-mono);
    color: var(--color-text-muted);
    margin-top: 4px;
  }

  .mock-badge {
    font-size: 11px;
    font-family: var(--font-mono);
    font-weight: 500;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--color-accent) 12%, transparent);
    color: var(--color-accent);
    border: 1px solid color-mix(in srgb, var(--color-accent) 35%, transparent);
    white-space: nowrap;
  }

  .mock-results {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .mock-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .mock-backend {
    font-size: 13px;
    color: var(--color-text-secondary);
    min-width: 80px;
  }

  .mock-bar-wrap {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: var(--color-surface-sunken);
    overflow: hidden;
  }

  .mock-bar {
    height: 100%;
    border-radius: 3px;
  }

  .mock-bar-1 {
    width: 95%;
    background: var(--color-backend-webnn-gpu);
  }

  .mock-bar-2 {
    width: 72%;
    background: var(--color-backend-webgpu);
  }

  .mock-bar-3 {
    width: 40%;
    background: var(--color-backend-wasm-4);
  }

  .mock-bar-4 {
    width: 18%;
    background: var(--color-backend-wasm-1);
  }

  .mock-ms {
    font-size: 13px;
    font-family: var(--font-mono);
    font-weight: 600;
    color: var(--color-text-primary);
    min-width: 52px;
    text-align: right;
  }

  .mock-footer {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--color-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .mock-footer-label {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .mock-footer-value {
    font-size: 16px;
    font-weight: 700;
    font-family: var(--font-mono);
    color: var(--color-text-primary);
  }

  @keyframes hero-ping {
    75%, 100% {
      transform: scale(2.4);
      opacity: 0;
    }
  }

  @keyframes hero-float {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-6px) rotate(0.3deg); }
  }

  @media (max-width: 900px) {
    .hero-content {
      grid-template-columns: 1fr;
      padding: 32px 24px 16px;
      gap: 16px;
    }

    .hero-title {
      font-size: 32px;
    }

    .hero-subtitle {
      font-size: 15px;
    }

    .hero-left {
      padding-bottom: 16px;
    }

    .hero-right {
      display: flex;
      justify-content: center;
      padding-bottom: 16px;
    }

    .hero-card-mock {
      max-width: 100%;
      margin: 8px 0;
    }

    .mock-float-top,
    .mock-float-bottom {
      display: none;
    }
  }

  @media (max-width: 500px) {
    .hero-content {
      padding: 24px 16px 8px;
    }

    .hero-title {
      font-size: 26px;
    }

    .hero-ctas {
      flex-direction: column;
      align-items: stretch;
    }

    .hero-btn-primary,
    .hero-btn-secondary {
      justify-content: center;
    }
  }

  .auth-loading-placeholder {
    min-height: 50vh;
  }

  /* HF home search */
  .hf-home-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 50vh;
    text-align: center;
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
    outline: none; /* parent .hf-home-search-wrap provides focus-within ring */
    font-family: var(--font-ui);
    font-size: var(--text-base);
    color: var(--color-text-primary);
    padding: 14px 0;
    min-width: 0;
  }

  .hf-home-input::placeholder {
    color: var(--color-text-muted);
  }

  /* Remove browser search cancel button */
  .hf-home-input::-webkit-search-cancel-button {
    display: none;
  }

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
    padding: 10px 20px;
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

  .hf-home-btn-primary:hover {
    background: var(--color-primary-hover);
  }

  .hf-home-hint {
    display: flex;
    align-items: center;
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

  @media (max-width: 600px) {
    .hf-home-section {
      padding: 24px 16px 20px;
    }

    .hf-home-input {
      font-size: 15px;
    }

    .hf-home-btn {
      font-size: var(--text-sm);
      padding: 8px 14px;
    }

    .hf-home-hint {
      align-items: center;
      flex-wrap: wrap;
      font-size: var(--text-xs);
      justify-content: center;
    }

    .hf-home-hint code {
      word-break: break-all;
    }
  }

  .card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 20px;
  }

  .card-title {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: var(--space-2);
  }

  .muted {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  /* Capabilities */
  .env-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .env-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-half);
  }

  .env-label {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .env-value {
    font-size: var(--text-sm);
    font-family: var(--font-mono);
    color: var(--color-text-primary);
    word-break: break-word;
  }

  .privacy-notice {
    margin-top: var(--space-2);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-style: italic;
  }

  /* Quick Actions */

  /* Recent Models */
  .model-list {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    overflow: hidden;
    margin-bottom: var(--space-2);
  }

  .model-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: var(--color-surface-raised);
    text-decoration: none;
    min-width: 0;
    transition: background var(--transition-base);
  }

  .model-row:hover {
    background:var(--color-accent-light);
  }

  .model-info {
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
    overflow: hidden;
    line-height: 1.2;
  }

  .model-repo {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model-file {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model-badges {
    display: flex;
    gap: 3px;
    flex-shrink: 0;
  }


  .model-synced {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-text-muted);
    white-space: nowrap;
    flex-shrink: 0;
    text-align: right;
  }

  @media (max-width: 768px) {
    .model-list {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 500px) {
    .model-list {
      grid-template-columns: 1fr;
    }
  }

  .view-all {
    font-size: var(--text-sm);
    color: var(--color-primary);
    text-decoration: none;
  }

  .view-all:hover {
    text-decoration: underline;
  }

</style>
