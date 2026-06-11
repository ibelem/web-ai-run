<script lang="ts">
  import { onMount } from 'svelte';
  import { createClient } from '$lib/supabase/client';
  import { inferFormat, stripExt } from '$lib/huggingface/parser';
  import { getBackendLabel } from '$lib/engine/backends';
  import FormatIcon from '$lib/components/FormatIcon.svelte';

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

  // Latest LLM runs, deduplicated by model — one row per distinct hf_model_id.
  interface LatestRun {
    backend: string;
    tps: number;
    hf_model_id: string;
    data_type: string;
    runtime: string;
    started_at: string;
  }

  let recentModels = $state<RecentModel[]>([]);
  let loadingModels = $state(true);
  let latestRuns = $state<LatestRun[]>([]);
  let loadingLatest = $state(true);

  onMount(async () => {
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

    // Latest LLM runs, deduplicated by model — pulled client-side. We grab
    // more rows than we need so we can keep only the newest run per
    // hf_model_id, then surface the 5 most-recently-tested distinct models.
    try {
      const { data: rows } = await (supabase.from('results_llm') as any)
        .select('backend, tps, hf_model_id, data_type, runtime, started_at')
        .eq('status', 'completed')
        .not('tps', 'is', null)
        .order('started_at', { ascending: false })
        .limit(100);
      if (rows) {
        const seen = new Set<string>();
        const deduped: LatestRun[] = [];
        for (const r of rows as LatestRun[]) {
          if (!r.hf_model_id || seen.has(r.hf_model_id)) continue;
          seen.add(r.hf_model_id);
          deduped.push(r);
          if (deduped.length === 5) break;
        }
        latestRuns = deduped;
      }
    } catch (e) {
      console.error('Failed to fetch LLM hero data:', e);
    }
    loadingLatest = false;
  });

  function formatRelative(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  // Bar widths scale to the fastest TPS in the visible set so the leader
  // hits ~95% and the tail stays proportional. With 1 row, leader fills.
  function barWidth(tps: number, max: number): number {
    if (max <= 0) return 0;
    const pct = (tps / max) * 95;
    return Math.max(8, Math.min(95, pct));
  }

  // Map a runtime backend ID to its design-token color variable.
  function backendColorVar(backend: string): string {
    switch (backend) {
      case 'webnn_gpu': return 'var(--color-backend-webnn-gpu)';
      case 'webnn_cpu': return 'var(--color-backend-webnn-cpu)';
      case 'webnn_npu': return 'var(--color-backend-webnn-npu)';
      case 'webgpu':    return 'var(--color-backend-webgpu)';
      case 'wasm_n':    return 'var(--color-backend-wasm-4)';
      case 'wasm_1':    return 'var(--color-backend-wasm-1)';
      default:          return 'var(--color-primary)';
    }
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
          <span class="hero-gradient">Benchmark on-device AI</span><br/>
          <span>on the open web</span>
        </h1>

        <p class="hero-subtitle">
          LiteRT.js, ONNX Runtime Web, WebNN, WebGPU, and Wasm. Run real ML models in your browser and compare performance across backends - no install, no server.
        </p>

        <div class="hero-ctas">
          <a href="/inference" class="hero-btn-primary">
            Inference&nbsp;<span aria-hidden="true">&rarr;</span>
          </a>
          <a href="/llm" class="hero-btn-secondary">
            LLM&nbsp;<span aria-hidden="true">&rarr;</span>
          </a>
        </div>

        <div class="hero-tags">
          <span class="hero-tag">WebNN</span>
          <span class="hero-tag">WebGPU</span>
          <span class="hero-tag">Wasm</span>
          <span class="hero-tag">.tflite</span>
          <span class="hero-tag">.litertlm</span>
          <span class="hero-tag">.task</span>
          <span class="hero-tag">.onnx</span>
          <span class="hero-tag">LiteRT.js</span>
          <span class="hero-tag">ONNX Runtime Web</span>
          <span class="hero-tag">HuggingFace</span>
        </div>
      </div>

      <div class="hero-right">
        <div class="hero-card-mock">
          {#if loadingLatest}
            <div class="mock-header">
              <div>
                <div class="mock-label">LLM Benchmark</div>
                <div class="mock-title">Loading live results...</div>
              </div>
            </div>
            <div class="mock-results">
              <div class="mock-row mock-row-empty"></div>
              <div class="mock-row mock-row-empty"></div>
              <div class="mock-row mock-row-empty"></div>
              <div class="mock-row mock-row-empty"></div>
              <div class="mock-row mock-row-empty"></div>
            </div>
          {:else if latestRuns.length === 0}
            <div class="mock-empty">
              <div class="mock-empty-label">LLM Benchmark</div>
              <div class="mock-empty-title">No runs yet</div>
              <p class="mock-empty-body">Be the first to publish an LLM benchmark on this site. It takes about a minute.</p>
              <a href="/llm" class="mock-empty-cta">Run a benchmark&nbsp;<span aria-hidden="true">&rarr;</span></a>
            </div>
          {:else}
            {@const max = Math.max(...latestRuns.map((r) => r.tps))}
            <div class="mock-header">
              <div>
                <div class="mock-label">LLM Benchmark · Latest runs</div>
                <div class="mock-title">{latestRuns.length} models tested recently</div>
                <div class="mock-meta">tokens / second · higher is better</div>
              </div>
              <a href="/llm" class="mock-badge" title="Run an LLM benchmark">Live</a>
            </div>
            <div class="mock-results">
              {#each latestRuns as r (r.hf_model_id)}
                <div class="mock-row">
                  <span class="mock-model" title="{r.hf_model_id}">{r.hf_model_id.split('/').pop()}</span>
                  <span class="mock-backend-chip" style:color={backendColorVar(r.backend)} style:border-color={backendColorVar(r.backend)}>
                    {getBackendLabel(r.backend)}
                  </span>
                  <div class="mock-bar-wrap">
                    <div
                      class="mock-bar"
                      style:width="{barWidth(r.tps, max)}%"
                      style:background={backendColorVar(r.backend)}
                    ></div>
                  </div>
                  <span class="mock-ms">{r.tps.toFixed(1)}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
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
          <a href="/inference/browse?q={encodeURIComponent(model.hf_model_id)}" class="model-row">
            <div class="model-info">
              <span class="model-repo">{model.hf_model_id}</span>
              <span class="model-file">{stripExt(model.file_path)}</span>
            </div>
            <div class="model-badges">
              <FormatIcon format={inferFormat(model.file_path)} size={14} />
              <span class="dtype-chip" data-dtype={model.data_type}>{model.data_type === 'quantized' ? 'quant' : model.data_type}</span>
            </div>
            <span class="model-synced">{formatRelative(model.last_synced)}</span>
          </a>
        {/each}
      </div>
      <a href="/inference/browse" class="view-all">View all models &rarr;</a>
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
    color: var(--color-primary);
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
    padding: var(--space-1) var(--space-3);
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
    padding: var(--space-1) var(--space-3);
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
    text-decoration: none;
    transition: background var(--transition-base);
  }

  a.mock-badge:hover {
    background: color-mix(in srgb, var(--color-accent) 22%, transparent);
  }

  .mock-results {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .mock-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 60px auto;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .mock-model {
    font-size: 12px;
    font-family: var(--font-mono);
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .mock-backend-chip {
    font-size: 10px;
    font-family: var(--font-mono);
    font-weight: 600;
    padding: 1px 5px;
    border-radius: var(--radius-sm);
    border: 1px solid;
    line-height: 1.4;
    white-space: nowrap;
  }

  .mock-bar-wrap {
    height: 6px;
    border-radius: 3px;
    background: var(--color-surface-sunken);
    overflow: hidden;
    width: 60px;
  }

  .mock-bar {
    height: 100%;
    border-radius: 3px;
    transition: width 600ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .mock-row-empty {
    height: 18px;
    background: var(--color-surface-sunken);
    border-radius: 3px;
    opacity: 0.5;
  }

  .mock-ms {
    font-size: 13px;
    font-family: var(--font-mono);
    font-weight: 600;
    color: var(--color-text-primary);
    min-width: 44px;
    text-align: right;
  }

  .mock-empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 8px 0;
  }

  .mock-empty-label {
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
  }

  .mock-empty-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .mock-empty-body {
    font-size: 13px;
    color: var(--color-text-secondary);
    margin-bottom: 6px;
  }

  .mock-empty-cta {
    display: inline-flex;
    align-items: center;
    padding: 6px 12px;
    border-radius: var(--radius-base);
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;
    color: var(--color-text-on-primary);
    background: var(--color-primary);
    transition: background var(--transition-base);
  }

  .mock-empty-cta:hover { background: var(--color-primary-hover); }

  @keyframes hero-ping {
    75%, 100% { transform: scale(2.4); opacity: 0; }
  }

  @keyframes hero-float {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-6px) rotate(0.3deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .pulse-ring { animation: none; }
    .hero-card-mock { animation: none; }
  }

  @media (max-width: 900px) {
    .hero-content { grid-template-columns: 1fr; padding: 32px 24px 16px; gap: 16px; }
    .hero-title { font-size: 32px; }
    .hero-subtitle { font-size: 15px; }
    .hero-left { padding-bottom: 16px; }
    .hero-right { display: flex; justify-content: center; padding-bottom: 16px; }
    .hero-card-mock { max-width: 100%; margin: 8px 0; }
    .mock-float-top, .mock-float-bottom { display: none; }
  }

  @media (max-width: 500px) {
    .hero-content { padding: 24px 16px 8px; }
    .hero-title { font-size: 26px; }
    .hero-ctas { flex-direction: column; align-items: stretch; }
    .hero-btn-primary, .hero-btn-secondary { justify-content: center; }
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

  .model-row:hover { background: var(--color-accent-light); }

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
    .model-list { grid-template-columns: repeat(2, 1fr); }
  }

  @media (max-width: 500px) {
    .model-list { grid-template-columns: 1fr; }
  }

  .view-all {
    font-size: var(--text-sm);
    color: var(--color-primary);
    text-decoration: none;
  }

  .view-all:hover { text-decoration: underline; }
</style>
