<script lang="ts">
  import type { ResultRow } from '../+page';
  import { getBackendLabel } from '$lib/engine/backends';
  import { page } from '$app/stores';

  let { data } = $props();

  const result = $derived(data.result as ResultRow | null);

  function modelName(id: string): string {
    return id.split('/').pop() ?? id;
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function runAgainHref(r: ResultRow): string {
    const params = new URLSearchParams();
    params.set('models', `${r.model_id}|${r.file_path}`);
    params.set('backend', r.backend);
    params.set('n', String(r.iterations));
    return `/run#${params}`;
  }

  const shareUrl = $derived($page.url.href);

  function copyLink() {
    navigator.clipboard.writeText(shareUrl).catch(() => {});
  }

  const ogTitle = $derived(
    result
      ? `${modelName(result.model_id)} — ${getBackendLabel(result.backend)} benchmark`
      : 'Benchmark result'
  );

  const ogDescription = $derived(
    result?.average_ms
      ? `${result.average_ms.toFixed(1)} ms avg · ${result.throughput_fps?.toFixed(1) ?? '—'} fps · ${result.data_type}`
      : 'Web AI Benchmark result'
  );
</script>

<svelte:head>
  <title>{ogTitle} | Web AI Benchmark</title>
  <meta name="description" content={ogDescription} />
  <meta property="og:title" content={ogTitle} />
  <meta property="og:description" content={ogDescription} />
  <meta property="og:type" content="article" />
  <meta property="og:url" content={shareUrl} />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={ogTitle} />
  <meta name="twitter:description" content={ogDescription} />
</svelte:head>

<div class="result-page">
  {#if data.error || !result}
    <div class="not-found">
      <p>Result not found.</p>
      <a href="/results" class="back-link">← Back to results</a>
    </div>
  {:else}
    <header class="page-header">
      <a href="/results" class="back-link">← Results</a>
      <div class="header-row">
        <div class="header-main">
          <h1 class="result-title" title={result.model_id}>{result.model_id}</h1>
          <p class="result-subtitle">{result.file_path}</p>
        </div>
        <div class="header-actions">
          <a class="btn-run-again" href={runAgainHref(result)}>↺ Run again</a>
          <button class="btn-copy" onclick={copyLink} title="Copy shareable link">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Share
          </button>
        </div>
      </div>
    </header>

    <div class="result-card">
      <div class="badges">
        <span class="badge">{getBackendLabel(result.backend)}</span>
        <span class="badge">{result.data_type}</span>
        <span class="badge status-{result.status}">{result.status}</span>
      </div>

      <div class="metrics-grid">
        <div class="metric-block">
          <span class="metric-value">{result.average_ms?.toFixed(2) ?? '—'}</span>
          <span class="metric-label">Avg ms</span>
        </div>
        <div class="metric-block">
          <span class="metric-value">{result.median_ms?.toFixed(2) ?? '—'}</span>
          <span class="metric-label">Median ms</span>
        </div>
        <div class="metric-block">
          <span class="metric-value">{result.best_ms?.toFixed(2) ?? '—'}</span>
          <span class="metric-label">Best ms</span>
        </div>
        <div class="metric-block">
          <span class="metric-value">{result.p90_ms?.toFixed(2) ?? '—'}</span>
          <span class="metric-label">p90 ms</span>
        </div>
        <div class="metric-block">
          <span class="metric-value">{result.throughput_fps?.toFixed(1) ?? '—'}</span>
          <span class="metric-label">fps</span>
        </div>
        <div class="metric-block">
          <span class="metric-value">{result.iterations_completed ?? result.iterations}</span>
          <span class="metric-label">Iterations</span>
        </div>
      </div>

      {#if result.load_and_compile_ms || result.compilation_ms}
        <div class="metrics-grid metrics-grid-sm">
          {#if result.load_and_compile_ms}
            <div class="metric-block">
              <span class="metric-value">{result.load_and_compile_ms.toFixed(0)}</span>
              <span class="metric-label">Load+compile ms</span>
            </div>
          {/if}
          {#if result.compilation_ms}
            <div class="metric-block">
              <span class="metric-value">{result.compilation_ms.toFixed(0)}</span>
              <span class="metric-label">Compile ms</span>
            </div>
          {/if}
          {#if result.first_inference_ms}
            <div class="metric-block">
              <span class="metric-value">{result.first_inference_ms.toFixed(0)}</span>
              <span class="metric-label">First inference ms</span>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <div class="hw-section">
      <h2 class="hw-title">Hardware and Software</h2>
      <dl class="hw-list">
        {#if result.gpu}
          <div class="hw-row">
            <dt>GPU</dt>
            <dd>{result.gpu}</dd>
          </div>
        {/if}
        {#if result.cpu}
          <div class="hw-row">
            <dt>CPU</dt>
            <dd>{result.cpu}</dd>
          </div>
        {/if}
        {#if result.os}
          <div class="hw-row">
            <dt>OS</dt>
            <dd>{result.os}</dd>
          </div>
        {/if}
        {#if result.browser}
          <div class="hw-row">
            <dt>Browser</dt>
            <dd>{result.browser}</dd>
          </div>
        {/if}
        {#if result.webnn_ep && result.backend.startsWith('webnn_')}
          <div class="hw-row">
            <dt>WebNN EP</dt>
            <dd>{result.webnn_ep}</dd>
          </div>
        {/if}
        {#if result.ort_version}
          <div class="hw-row">
            <dt>Framework</dt>
            <dd>ORT Web {result.ort_version}</dd>
          </div>
        {/if}
        {#if result.litert_version}
          <div class="hw-row">
            <dt>Framework</dt>
            <dd>LiteRT.js {result.litert_version}</dd>
          </div>
        {/if}
        <div class="hw-row">
          <dt>Date</dt>
          <dd>{formatDate(result.started_at)}</dd>
        </div>
      </dl>
    </div>
  {/if}
</div>

<style>
  .result-page {
    max-width: 640px;
  }

  .back-link {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    text-decoration: none;
    display: inline-block;
    margin-bottom: var(--space-2);
    transition: color var(--transition-base);
  }

  .back-link:hover {
    color: var(--color-text-primary);
  }

  .not-found {
    padding: var(--space-4);
    text-align: center;
    color: var(--color-text-muted);
  }

  .header-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .header-main {
    min-width: 0;
  }

  h1.result-title {
    font-size: var(--text-lg);
    font-weight: 600;
    font-family: var(--font-mono);
    color: var(--color-text-primary);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-subtitle {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    margin: 2px 0 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .header-actions {
    display: flex;
    gap: var(--space-1);
    align-items: center;
    flex-shrink: 0;
  }

  .btn-run-again {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: 5px 12px;
    border: none;
    border-radius: var(--radius-base);
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    text-decoration: none;
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-run-again:hover {
    background: var(--color-primary-hover);
  }

  .btn-copy {
    display: flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: 5px 12px;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: border-color var(--transition-base), color var(--transition-base), background var(--transition-base);
  }

  .btn-copy:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-accent-light);
  }

  .result-card {
    margin-top: var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }

  .badges {
    display: flex;
    gap: var(--space-half);
    margin-bottom: var(--space-3);
    flex-wrap: wrap;
  }

  .badge {
    font-size: var(--text-xs);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
  }

  .badge.status-completed {
    color: var(--color-success, #22c55e);
    border-color: var(--color-success, #22c55e);
  }

  .badge.status-error {
    color: var(--color-error);
    border-color: var(--color-error);
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
  }

  .metrics-grid-sm {
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border);
  }

  .metric-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .metric-value {
    font-family: var(--font-mono);
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-text-primary);
    line-height: 1.1;
  }

  .metric-label {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .hw-section {
    margin-top: var(--space-3);
  }

  .hw-title {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--color-text-muted);
    margin-bottom: var(--space-1);
  }

  .hw-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .hw-row {
    display: flex;
    gap: var(--space-2);
    font-size: var(--text-sm);
    padding: 3px 0;
    border-bottom: 1px solid var(--color-border);
  }

  .hw-row:last-child {
    border-bottom: none;
  }

  .hw-row dt {
    color: var(--color-text-muted);
    width: 80px;
    flex-shrink: 0;
    font-size: var(--text-xs);
    padding-top: 1px;
  }

  .hw-row dd {
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    margin: 0;
    word-break: break-word;
  }

  @media (max-width: 480px) {
    .metrics-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
