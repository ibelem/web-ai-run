<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { isAuthenticated, auth } from '$lib/stores/auth';
  import { createClient } from '$lib/supabase/client';
  import { BACKENDS, detectAvailableBackends } from '$lib/engine/backends';
  import { detectEnvironment } from '$lib/engine/environment';
  import type { Backend, EnvironmentInfo } from '$lib/engine/types';

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

  function inferFormat(path: string): string {
    const lower = path.toLowerCase();
    if (lower.endsWith('.litertlm')) return 'litertlm';
    if (lower.endsWith('.tflite')) return 'tflite';
    if (lower.endsWith('.onnx')) return 'onnx';
    return 'unknown';
  }

  let environment = $state<EnvironmentInfo | null>(null);
  let availableBackends = $state<Backend[]>([]);
  let recentResults = $state<any[]>([]);
  let recentModels = $state<RecentModel[]>([]);
  let loadingEnv = $state(true);
  let loadingResults = $state(true);
  let loadingModels = $state(true);

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
        .limit(8);
      if (models) recentModels = models;
    } catch (e) {
      console.error('Failed to fetch models:', e);
    }
    loadingModels = false;

    const authState = get(auth);
    if (authState.session) {
      try {
        const { data } = await (supabase.from('results') as any)
          .select('id, model_id, backend, status, metrics, started_at')
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
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatSize(bytes: number): string {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${bytes} B`;
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
          <span class="hero-gradient">Benchmark AI</span><br/>
          <span>on the open web</span>
        </h1>

        <p class="hero-subtitle">
          LiteRT.js, ONNX Runtime Web, WebNN, WebGPU, and Wasm. Run real ML models in your browser and compare performance across backends — no install, no server.
        </p>

        <div class="hero-ctas">
          <a href="/model" class="hero-btn-primary">
            Start benchmarking <span aria-hidden="true">&rarr;</span>
          </a>
          <a href="#capabilities" class="hero-btn-secondary">See your environment</a>
        </div>

        <div class="hero-tags">
          <span class="hero-tag">WebNN · WebGPU · Wasm</span>
          <span class="hero-tag">.tflite .litertlm .onnx</span>
          <span class="hero-tag">LiteRT.js</span>
          <span class="hero-tag">ONNX Runtime Web</span>
          <span class="hero-tag">HuggingFace Models</span>
        </div>
      </div>

      <div class="hero-right">
        <div class="hero-card-mock">
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
        <div class="mock-float-badge mock-float-top">Average: 2.1ms</div>
        <div class="mock-float-badge mock-float-bottom">50 iterations</div>
      </div>
    </div>
  </section>

  <!-- Capabilities -->
  <section class="card capabilities">
    <h2 class="card-title">Detected Environment</h2>
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
      <p class="privacy-notice">Your device information is not recorded unless you explicitly agree when running a benchmark.</p>
    {/if}
  </section>

  <!-- Quick Actions -->
  <section class="quick-actions">
    <a href="/model" class="action-card">
      <h3 class="action-title">Browse & Run Models</h3>
      <p class="action-desc">Select models and benchmark them across backends.</p>
    </a>
    <a href="/recipe" class="action-card">
      <h3 class="action-title">Saved Recipes</h3>
      <p class="action-desc">Re-run curated benchmark suites with one click.</p>
    </a>
    <a href="/custom" class="action-card">
      <h3 class="action-title">Upload & Test</h3>
      <p class="action-desc">Bring your own ONNX or LiteRT model to benchmark.</p>
    </a>
  </section>

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
          <a href="/model?q={model.hf_model_id.split('/').pop()}" class="model-row">
            <div class="model-info">
              <span class="model-name">{model.hf_model_id.split('/').pop()}</span>
              <span class="model-org">{model.source_org}</span>
            </div>
            <div class="model-badges">
              <span class="badge badge-format" data-format={inferFormat(model.file_path)}>{inferFormat(model.file_path)}</span>
              <span class="badge badge-dtype">{model.data_type}</span>
              <span class="badge badge-size">{formatSize(model.size_bytes)}</span>
              {#if model.task !== 'uncategorized'}
                <span class="badge badge-cat">{model.task}</span>
              {/if}
            </div>
            <span class="model-synced">{formatRelative(model.last_synced)}</span>
          </a>
        {/each}
      </div>
      <a href="/model" class="view-all">View all models &rarr;</a>
    {/if}
  </section>

  <!-- Recent Results -->
  <section class="card recent-results">
    <h2 class="card-title">Recent Results</h2>
    {#if !$isAuthenticated}
      <p class="muted">Sign in to see your benchmark history.</p>
    {:else if loadingResults}
      <p class="muted">Loading results...</p>
    {:else if recentResults.length === 0}
      <p class="muted">No benchmark results yet. Run a model to get started.</p>
    {:else}
      <div class="results-table-wrap">
        <table class="results-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Backend</th>
              <th>Status</th>
              <th>Median</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {#each recentResults as result}
              <tr>
                <td class="mono">{result.model_id}</td>
                <td>{result.backend}</td>
                <td>
                  <span class="status-badge" class:completed={result.status === 'completed'} class:error={result.status === 'error'}>
                    {result.status}
                  </span>
                </td>
                <td class="mono">{result.metrics?.median_ms ? `${result.metrics.median_ms.toFixed(1)} ms` : '—'}</td>
                <td>{result.started_at ? formatDate(result.started_at) : '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
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
    background: radial-gradient(circle, rgba(0,199,253,0.22) 0%, rgba(0,199,253,0) 70%);
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
    gap: 8px;
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
    transform: translateY(-2px);
  }

  .pulse-ring {
    position: absolute;
    display: inline-flex;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: #00C7FD;
    opacity: 0.75;
    animation: hero-ping 1.8s cubic-bezier(0,0,0.2,1) infinite;
  }

  .pulse-core {
    position: relative;
    display: inline-flex;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #00C7FD;
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
    line-height: 1.05;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-bottom: 20px;
    color: var(--color-text-primary);
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
    padding: 12px 24px;
    border-radius: var(--radius-sm);
    font-size: 15px;
    font-weight: 600;
    text-decoration: none;
    color: #FFFFFF;
    background: linear-gradient(135deg, #063594, #00C7FD);
    transition: opacity var(--transition-base);
  }

  .hero-btn-primary:hover { opacity: 0.9; }

  .hero-btn-secondary {
    display: inline-flex;
    align-items: center;
    padding: 12px 24px;
    border-radius: var(--radius-sm);
    font-size: 15px;
    font-weight: 500;
    text-decoration: none;
    color: var(--color-text-primary);
    border: 1px solid var(--color-border);
    background: transparent;
    transition: background var(--transition-base);
  }

  .hero-btn-secondary:hover { background: var(--color-surface-sunken); }

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
    border-radius: 100px;
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
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    animation: hero-float 6s ease-in-out infinite;
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
    background: rgba(0,199,253,0.12);
    color: #00C7FD;
    border: 1px solid rgba(0,199,253,0.35);
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
    background: linear-gradient(90deg, #063594, #00C7FD);
  }

  .mock-bar-2 {
    width: 72%;
    background: #063594;
  }

  .mock-bar-3 {
    width: 40%;
    background: var(--color-backend-webgpu);
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
    color: #063594;
    border-color: #063594;
    box-shadow: 0 4px 12px rgba(9,83,222,0.15);
    transform: rotate(-4deg);
  }

  .mock-float-bottom {
    bottom: -12px;
    right: -16px;
    color: #00C7FD;
    border-color: #00C7FD;
    box-shadow: 0 4px 12px rgba(0,199,253,0.15);
    transform: rotate(3deg);
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

  @media (max-width: 768px) {
    .hero-content {
      grid-template-columns: 1fr;
      padding: 32px 24px;
      gap: 32px;
    }

    .hero-title {
      font-size: 32px;
    }

    .hero-right {
      display: none;
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

  .backends-heading {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-secondary);
    margin-bottom: var(--space-1);
  }

  .backends-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .backend-item {
    display: flex;
    align-items: center;
    gap: var(--space-half);
  }

  .backend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .backend-dot.available {
    background: var(--color-success);
  }

  .backend-dot.unavailable {
    background: var(--color-error);
  }

  .backend-label {
    font-size: var(--text-sm);
    color: var(--color-text-primary);
  }

  /* Quick Actions */
  .quick-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-4);
  }

  .action-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 20px;
    text-decoration: none;
    transition: border-color var(--transition-base), background var(--transition-base);
  }

  .action-card:hover {
    border-color: var(--color-primary);
    background: var(--color-accent-light);
  }

  .action-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: var(--space-half);
  }

  .action-desc {
    font-size: var(--text-base);
    color: var(--color-text-muted);
    line-height: 1.5;
  }

  /* Recent Models */
  .model-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-bottom: var(--space-2);
  }

  .model-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-1);
    border-radius: var(--radius-base);
    text-decoration: none;
    transition: background var(--transition-base);
  }

  .model-row:hover {
    background: var(--color-nav-item-hover);
  }

  .model-info {
    display: flex;
    align-items: baseline;
    gap: var(--space-1);
    flex: 1;
    min-width: 0;
  }

  .model-name {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model-org {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .model-badges {
    display: flex;
    gap: var(--space-half);
    flex-shrink: 0;
  }

  .badge {
    font-size: var(--text-xs);
    padding: 1px 5px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .badge-format[data-format="onnx"] {
    color: var(--color-runtime-ort);
    border-color: var(--color-runtime-ort);
  }

  .badge-format[data-format="tflite"],
  .badge-format[data-format="litertlm"] {
    color: var(--color-runtime-litert);
    border-color: var(--color-runtime-litert);
  }

  .model-synced {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    flex-shrink: 0;
    width: 50px;
    text-align: right;
  }

  .view-all {
    font-size: var(--text-sm);
    color: var(--color-primary);
    text-decoration: none;
  }

  .view-all:hover {
    text-decoration: underline;
  }

  /* Recent Results */
  .results-table-wrap {
    overflow-x: auto;
  }

  .results-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  .results-table th {
    text-align: left;
    font-weight: 600;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: var(--space-1) var(--space-1);
    border-bottom: 1px solid var(--color-border);
  }

  .results-table td {
    padding: var(--space-1) var(--space-1);
    color: var(--color-text-primary);
    border-bottom: 1px solid var(--color-border);
  }

  .mono {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .status-badge {
    font-size: var(--text-xs);
    font-weight: 600;
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    background: var(--color-surface-sunken);
    color: var(--color-text-muted);
  }

  .status-badge.completed {
    color: var(--color-success);
  }

  .status-badge.error {
    color: var(--color-error);
  }
</style>
