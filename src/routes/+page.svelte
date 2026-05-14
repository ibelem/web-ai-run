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
    category: string;
    last_synced: string;
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
        .select('id, hf_model_id, file_path, data_type, size_bytes, runtime, source_org, category, last_synced')
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
    <h1 class="hero-title">Web AI Benchmark</h1>
    <p class="hero-subtitle">
      Measure ML inference performance across WebNN, WebGPU, and WebAssembly backends.
    </p>
  </section>

  <!-- Capabilities -->
  <section class="card capabilities">
    <h2 class="card-title">Detected Hardware</h2>
    {#if loadingEnv}
      <p class="muted">Detecting environment...</p>
    {:else if environment}
      <div class="env-grid">
        <div class="env-item">
          <span class="env-label">CPU</span>
          <span class="env-value">{environment.cpu}</span>
        </div>
        <div class="env-item">
          <span class="env-label">GPU</span>
          <span class="env-value">{environment.gpu}</span>
        </div>
        <div class="env-item">
          <span class="env-label">Memory</span>
          <span class="env-value">{environment.memory_gb ? `${environment.memory_gb} GB` : 'Unknown'}</span>
        </div>
        <div class="env-item">
          <span class="env-label">Browser</span>
          <span class="env-value">{environment.browser} {environment.browser_version}</span>
        </div>
      </div>

      <h3 class="backends-heading">Available Backends</h3>
      <div class="backends-list">
        {#each BACKENDS as backend}
          <div class="backend-item">
            <span class="backend-dot" class:available={availableBackends.includes(backend.id)} class:unavailable={!availableBackends.includes(backend.id)}></span>
            <span class="backend-label">{backend.label}</span>
          </div>
        {/each}
      </div>
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
              <span class="badge badge-runtime" data-runtime={model.runtime}>{model.runtime}</span>
              <span class="badge badge-dtype">{model.data_type}</span>
              <span class="badge badge-size">{formatSize(model.size_bytes)}</span>
              {#if model.category !== 'uncategorized'}
                <span class="badge badge-cat">{model.category}</span>
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
    max-width: 800px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .hero {
    text-align: center;
    padding: var(--space-5) 0 var(--space-3);
  }

  .hero-title {
    font-family: var(--font-ui);
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text-primary);
    margin-bottom: var(--space-1);
    letter-spacing: -0.02em;
  }

  .hero-subtitle {
    font-size: 16px;
    color: var(--color-text-secondary);
    max-width: 480px;
    margin: 0 auto;
    line-height: 1.5;
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
    gap: var(--space-2);
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

  .badge-runtime[data-runtime="onnx"] {
    color: var(--color-runtime-ort);
    border-color: var(--color-runtime-ort);
  }

  .badge-runtime[data-runtime="litert"] {
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
