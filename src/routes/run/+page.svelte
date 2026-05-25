<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import type { Backend, TestItem, TestResult, RunConfig as RunConfigType, EnvironmentInfo } from '$lib/engine/types';
  import { detectAvailableBackends } from '$lib/engine/backends';
  import { buildTestQueue } from '$lib/engine/queue';
  import { detectEnvironment } from '$lib/engine/environment';
  import { ResultsWriter } from '$lib/engine/results-writer';
  import { runInWorker, isWorkerSupported, terminateWorker } from '$lib/engine/worker/pool';
  import { auth, isAuthenticated } from '$lib/stores/auth';
  import { CPU_MODELS } from '$lib/data/cpu-models';
  import { OS_MODELS } from '$lib/data/os-models';
  import { fetchRuntimeVersions } from '$lib/engine/runtime-versions';
  import { inferDataType } from '$lib/huggingface/parser';
  import BackendSelector from '$lib/components/BackendSelector.svelte';
  import FormatIcon from '$lib/components/FormatIcon.svelte';
  import RunConfigCmp from '$lib/components/RunConfig.svelte';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import TestQueue from '$lib/components/TestQueue.svelte';
  import BenchmarkResults from '$lib/components/BenchmarkResults.svelte';

  interface ModelEntry {
    hf_model_id: string;
    file_path: string;
    data_type: string;
    runtime: 'onnx' | 'litert';
    size_bytes?: number;
  }

  function formatSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)}G`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)}M`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}K`;
    return `${bytes}B`;
  }

  const VALID_BACKENDS: Backend[] = ['wasm_1', 'wasm_n', 'webgpu', 'webnn_cpu', 'webnn_gpu', 'webnn_npu'];
  const VALID_ITERATIONS = [1, 10, 20, 50, 100, 500, 1000, 10000];

  function parseHash(): { models: ModelEntry[]; backends: Backend[]; iterations: number; upload: boolean; cpu: string; ort: string; litert: string } {
    const hash = new URLSearchParams(location.hash.slice(1));

    const models: ModelEntry[] = (hash.get('models') ?? '')
      .split(',')
      .filter(Boolean)
      .map(seg => {
        const [hf_model_id, file_path] = seg.split('|');
        const fp = file_path ?? 'onnx/model.onnx';
        const runtime: 'onnx' | 'litert' = (fp.endsWith('.tflite') || fp.endsWith('.litertlm')) ? 'litert' : 'onnx';
        return { hf_model_id: hf_model_id ?? '', file_path: fp, data_type: inferDataType(fp), runtime };
      })
      .filter(m => m.hf_model_id);

    const rawBackends = (hash.get('backend') ?? '').split(',').filter(Boolean) as Backend[];
    const backends = rawBackends.filter(b => VALID_BACKENDS.includes(b));

    const n = parseInt(hash.get('n') ?? '', 10);
    const iterations = VALID_ITERATIONS.includes(n) ? n : 50;

    return {
      models,
      backends: backends.length ? backends : ['webgpu'],
      iterations,
      upload: hash.get('upload') === '1',
      cpu: hash.get('cpu') ?? '',
      os: hash.get('os') ?? '',
      ort: hash.get('ort') ?? '',
      litert: hash.get('litert') ?? '',
    };
  }

  function writeHash() {
    if (isRunning) return;
    const params = new URLSearchParams();
    if (hashModels.length) {
      params.set('models', hashModels.map(m => `${m.hf_model_id}|${m.file_path}`).join(','));
    }
    params.set('backend', selectedBackends.join(','));
    params.set('n', String(iterations));
    if (saveResults) params.set('upload', '1');
    if (cpuModel.trim()) params.set('cpu', cpuModel.trim());
    if (osModel.trim()) params.set('os', osModel.trim());

    if (usesOnnx && ortVersion) params.set('ort', ortVersion);
    if (usesLitert && litertVersion) params.set('litert', litertVersion);
    history.replaceState(null, '', `#${params}`);
  }

  let availableBackends = $state<Backend[]>(['wasm_1']);
  let selectedBackends = $state<Backend[]>(['webgpu']);
  let iterations = $state(50);
  let saveResults = $state(false);
  let queue = $state<TestItem[]>([]);
  let results = $state<TestResult[]>([]);
  let isRunning = $state(false);
  let statusText = $state('');
  let downloadPercent = $state(0);
  let environment = $state<EnvironmentInfo | null>(null);
  let useWorker = $state(true);
  let hashModels = $state<ModelEntry[]>([]);
  let cpuModel = $state('');
  let osModel = $state('');

  let ortVersion = $state('');
  let ortDevVersions = $state<string[]>([]);
  let ortStableVersions = $state<string[]>([]);
  let litertVersion = $state('');
  let litertDevVersions = $state<string[]>([]);
  let litertStableVersions = $state<string[]>([]);
  let mounted = $state(false);
  let queueFlushTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleQueueFlush() {
    if (queueFlushTimer) return;
    queueFlushTimer = setTimeout(() => {
      queue = [...queue];
      queueFlushTimer = null;
    }, 100);
  }

  const totalModels = $derived(hashModels.length);
  const usesOnnx = $derived(hashModels.some(m => m.runtime === 'onnx'));
  const usesLitert = $derived(hashModels.some(m => m.runtime === 'litert'));

  const RUN_MODELS_KEY = 'run_models';

  $effect(() => {
    if (!mounted) return;
    void selectedBackends;
    void iterations;
    void saveResults;
    void cpuModel;
    void osModel;

    void hashModels;
    void ortVersion;
    void litertVersion;
    writeHash();
    // Persist current model selection so navigation away doesn't lose it
    try {
      if (hashModels.length > 0) sessionStorage.setItem(RUN_MODELS_KEY, JSON.stringify(hashModels));
      else sessionStorage.removeItem(RUN_MODELS_KEY);
    } catch {}
  });

  onMount(async () => {
    // Parse hash first (may come from a shared URL or sessionStorage redirect)
    const parsed = parseHash();

    // Priority order: hf_ext_models (from CartPanel) > hash models > persisted run_models
    try {
      const extRaw = sessionStorage.getItem('hf_ext_models');
      if (extRaw) {
        const stored: ModelEntry[] = JSON.parse(extRaw);
        sessionStorage.removeItem('hf_ext_models');
        hashModels = stored;
      } else if (parsed.models.length > 0) {
        hashModels = parsed.models;
      } else {
        const persisted = sessionStorage.getItem(RUN_MODELS_KEY);
        hashModels = persisted ? JSON.parse(persisted) : [];
      }
    } catch {
      hashModels = parsed.models;
    }

    selectedBackends = parsed.backends;
    iterations = parsed.iterations;
    saveResults = parsed.upload;
    cpuModel = parsed.cpu;
    osModel = parsed.os;


    availableBackends = await detectAvailableBackends();
    environment = await detectEnvironment();
    useWorker = isWorkerSupported();

    // Fetch latest runtime versions from npm, then apply hash overrides
    try {
      const v = await fetchRuntimeVersions();
      ortDevVersions = v.ort.dev;
      ortStableVersions = v.ort.stable;
      litertDevVersions = v.litert.dev;
      litertStableVersions = v.litert.stable;
      ortVersion = parsed.ort || v.ort.dev[0] || v.ort.stable[0] || '';
      litertVersion = parsed.litert || v.litert.dev[0] || v.litert.stable[0] || '';
    } catch {
      ortVersion = parsed.ort || '';
      litertVersion = parsed.litert || '';
    }

    mounted = true;
  });

  onDestroy(() => {
    terminateWorker();
  });

  async function startBenchmark() {
    if (hashModels.length === 0) return;

    queue = buildTestQueue(hashModels, selectedBackends);
    isRunning = true;
    results = [];

    const config: RunConfigType = {
      iterations,
      warmup_runs: 3,
      backends: selectedBackends,
      save_results: saveResults,
    };

    const authState = get(auth);
    let writer: ResultsWriter | null = null;
    if (saveResults && authState.user && environment) {
      writer = new ResultsWriter(
        authState.user.id,
        {
          ...environment,
          cpu: cpuModel.trim() || environment.cpu,
          os: osModel.trim() || environment.os,
          os_version: environment.os_version,
        },
        ortVersion,
        litertVersion,
      );
    }

    for (const item of queue) {
      if (!isRunning) break;

      item.status = 'downloading';
      queue = [...queue];
      statusText = `Testing ${item.hf_model_id.split('/')[1]}...`;

      if (writer) {
        await writer.createResult(item, config.iterations);
      }

      const runtimeVersion = item.runtime === 'onnx' ? ortVersion : litertVersion;

      const result = await runInWorker({
        modelSource: { kind: 'url', hfModelId: item.hf_model_id, filePath: item.file_path },
        runtime: item.runtime,
        backend: item.backend,
        iterations: config.iterations,
        warmupRuns: config.warmup_runs,
        runtimeVersion,
        onProgress: (progress) => {
          downloadPercent = progress.percent;
          item.progress = progress.percent;
          item.status = 'downloading';
          scheduleQueueFlush();
        },
        onStatus: (status) => {
          statusText = status;
          if (status.includes('Compil') || status.includes('session')) item.status = 'compiling';
          else if (status.includes('Running') || status.includes('Warm')) item.status = 'running';
          queue = [...queue];
        },
      });

      if (queueFlushTimer) { clearTimeout(queueFlushTimer); queueFlushTimer = null; }
      item.status = result.error_message ? 'error' : 'completed';
      if (result.error_message) item.error = result.error_message;
      item.progress = 100;
      results = [...results, result];
      queue = [...queue];
      downloadPercent = 0;

      if (writer) {
        await writer.completeResult(item, result);
      }
    }

    isRunning = false;
    statusText = 'Benchmark complete.';
  }

  function stopBenchmark() {
    if (queueFlushTimer) { clearTimeout(queueFlushTimer); queueFlushTimer = null; }
    isRunning = false;
    statusText = 'Stopped.';
  }

  async function retryItem(item: TestItem) {
    if (isRunning) return;
    item.status = 'pending';
    item.progress = 0;
    queue = [...queue];
    isRunning = true;
    statusText = `Retrying ${item.hf_model_id.split('/')[1]}...`;

    const config: RunConfigType = {
      iterations,
      warmup_runs: 3,
      backends: selectedBackends,
      save_results: saveResults,
    };

    const authState = get(auth);
    let writer: ResultsWriter | null = null;
    if (saveResults && authState.user && environment) {
      writer = new ResultsWriter(
        authState.user.id,
        { ...environment, cpu: cpuModel.trim() || environment.cpu, os: osModel.trim() || environment.os, os_version: environment.os_version },
        ortVersion,
        litertVersion,
      );
    }

    item.status = 'downloading';
    queue = [...queue];
    if (writer) await writer.createResult(item, config.iterations);

    const runtimeVersion = item.runtime === 'onnx' ? ortVersion : litertVersion;
    const result = await runInWorker({
      modelSource: { kind: 'url', hfModelId: item.hf_model_id, filePath: item.file_path },
      runtime: item.runtime,
      backend: item.backend,
      iterations: config.iterations,
      warmupRuns: config.warmup_runs,
      runtimeVersion,
      onProgress: (progress) => {
        downloadPercent = progress.percent;
        item.progress = progress.percent;
        item.status = 'downloading';
        scheduleQueueFlush();
      },
      onStatus: (status) => {
        statusText = status;
        if (status.includes('Compil') || status.includes('session')) item.status = 'compiling';
        else if (status.includes('Running') || status.includes('Warm')) item.status = 'running';
        queue = [...queue];
      },
    });

    if (queueFlushTimer) { clearTimeout(queueFlushTimer); queueFlushTimer = null; }
    item.status = result.error_message ? 'error' : 'completed';
    if (result.error_message) item.error = result.error_message;
    else item.error = undefined;
    item.progress = 100;
    results = [...results.filter((r) => !(r.test_item.hf_model_id === item.hf_model_id && r.test_item.file_path === item.file_path && r.test_item.backend === item.backend)), result];
    queue = [...queue];
    downloadPercent = 0;
    if (writer) await writer.completeResult(item, result);

    isRunning = false;
    statusText = result.error_message ? `Retry failed: ${result.error_message}` : 'Retry complete.';
  }
</script>

<div class="run-page">
  <header class="page-header">
    <h1>Benchmark</h1>
    <p>
      {#if totalModels > 0}
        {totalModels} model{totalModels > 1 ? 's' : ''} selected
      {:else}
        Select models from the Model page to benchmark.
      {/if}
    </p>
  </header>

  <section class="config-section">
    <BackendSelector bind:selected={selectedBackends} available={availableBackends} />
    <RunConfigCmp bind:iterations />

    {#if saveResults || environment}
      <div class="env-rows">
        {#if saveResults}
          <div class="env-row">
            <span class="env-label">CPU</span>
            <input
              class="cpu-input"
              type="text"
              list="cpu-model-list"
              placeholder="Type your CPU model..."
              bind:value={cpuModel}
            />
            <datalist id="cpu-model-list">
              {#each CPU_MODELS as model}
                <option value={model}></option>
              {/each}
            </datalist>
          </div>
        {/if}
        {#if environment}
          <div class="env-row">
            <span class="env-label">GPU</span>
            <span class="env-value">{environment.gpu}</span>
          </div>
        {/if}
        {#if saveResults}
          <div class="env-row">
            <span class="env-label">OS</span>
            <input
              class="cpu-input"
              type="text"
              list="os-model-list"
              placeholder="Type your OS..."
              bind:value={osModel}
            />
            <datalist id="os-model-list">
              {#each OS_MODELS as os}
                <option value={os}></option>
              {/each}
            </datalist>
          </div>
        {/if}
        {#if environment}
          <div class="env-row">
            <span class="env-label">Browser</span>
            <span class="env-value">{environment.browser} {environment.browser_version}</span>
          </div>
        {/if}
        {#if usesOnnx && ortVersion}
          <div class="env-row">
            <span class="env-label">ORT Web</span>
            <select class="version-select" bind:value={ortVersion}>
              {#if ortDevVersions.length}
                <optgroup label="Dev">
                  {#each ortDevVersions as v}
                    <option value={v}>{v}</option>
                  {/each}
                </optgroup>
              {/if}
              {#if ortStableVersions.length}
                <optgroup label="Stable">
                  {#each ortStableVersions as v}
                    <option value={v}>{v}</option>
                  {/each}
                </optgroup>
              {/if}
            </select>
          </div>
        {/if}
        {#if usesLitert && litertVersion}
          <div class="env-row">
            <span class="env-label">LiteRT.js</span>
            <select class="version-select" bind:value={litertVersion}>
              {#if litertDevVersions.length}
                <optgroup label="Dev">
                  {#each litertDevVersions as v}
                    <option value={v}>{v}</option>
                  {/each}
                </optgroup>
              {/if}
              {#if litertStableVersions.length}
                <optgroup label="Stable">
                  {#each litertStableVersions as v}
                    <option value={v}>{v}</option>
                  {/each}
                </optgroup>
              {/if}
            </select>
          </div>
        {/if}
      </div>
    {/if}

    {#if hashModels.length > 0}
      <ul class="model-list">
        {#each hashModels as m}
          {@const ext = m.file_path.endsWith('.litertlm') ? 'litertlm' : m.file_path.endsWith('.tflite') ? 'tflite' : 'onnx'}
          <li class="model-item">
            <div class="model-item-left">
              <div class="model-item-top">
                <span class="model-item-repo">{m.hf_model_id}</span>
              </div>
              <div class="model-item-bottom">
                <FormatIcon format={ext} size={14} />
                <span class="model-item-name">{m.file_path.split('/').pop()}</span>
              </div>
            </div>
            {#if m.data_type}
              <span class="model-item-dtype" data-dtype={m.data_type}>{m.data_type === 'quantized' ? 'quant' : m.data_type}</span>
            {/if}
            {#if m.size_bytes}
              <span class="model-item-size">{formatSize(m.size_bytes)}</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    <div class="actions">
      {#if !isRunning}
        <label class="save-results-label">
          <span class="custom-checkbox" class:checked={saveResults}>
            {#if saveResults}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            {/if}
          </span>
          <input type="checkbox" bind:checked={saveResults} />
          Upload results
        </label>
        {#if saveResults}
          {#if $isAuthenticated}
            <p class="upload-disclosure">
              Your CPU model, GPU, OS, and browser will be saved alongside the benchmark scores — this hardware context is what makes the results meaningful.
            </p>
          {:else}
            <p class="upload-disclosure upload-disclosure-warn">
              <a href="/login">Sign in</a> to upload results — we need an account to attribute the data.
            </p>
          {/if}
        {/if}
        <button class="btn-primary" onclick={startBenchmark} disabled={totalModels === 0 || (saveResults && (!$isAuthenticated || !cpuModel.trim() || !osModel.trim()))}>
          Run Benchmark
        </button>
        {#if saveResults && $isAuthenticated && (!cpuModel.trim() || !osModel.trim())}
          <p class="action-hint action-hint-warn">
            Fill in your CPU and OS above to enable result upload.
          </p>
        {/if}
        {#if totalModels === 0}
          <p class="action-hint">No models selected. <a href="/browse">Browse models</a> to pick one, or <a href="/custom">upload your own</a>.</p>
        {/if}
      {:else}
        <button class="btn-stop" onclick={stopBenchmark}>Stop</button>
      {/if}
    </div>
  </section>

  {#if isRunning || statusText}
    <section class="status-section">
      <p class="status-text">{statusText}</p>
      {#if downloadPercent > 0 && downloadPercent < 100}
        <ProgressBar percent={downloadPercent} label="Downloading" />
      {/if}
    </section>
  {/if}

  {#if queue.length > 0}
    <section class="queue-section">
      <TestQueue {queue} {isRunning} onretry={retryItem} />
    </section>
  {/if}

  {#if results.length > 0}
    <section class="results-section">
      <BenchmarkResults {results} />
    </section>
  {/if}
</div>

<style>
  .run-page {
    max-width: 100%;
  }

  .config-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
    padding: var(--space-4) 0;
  }

  .actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-6);
  }


  .upload-disclosure {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: 0;
    line-height: 1.5;
  }

  .upload-disclosure-warn {
    color: var(--color-error);
  }

  .upload-disclosure-warn a {
    color: var(--color-error);
    font-weight: 600;
    text-decoration: underline;
  }

  .action-hint {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin-top: var(--space-1);
  }

  .action-hint a {
    color: var(--color-primary);
    text-decoration: none;
  }

  .action-hint a:hover {
    text-decoration: underline;
  }

  .action-hint-warn {
    color: var(--color-warning, #d97706);
  }

  .save-results-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    user-select: none;
  }

  .save-results-label input[type="checkbox"] {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .custom-checkbox {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: 2px solid var(--color-border-strong);
    border-radius: 50%;
    background: transparent;
    color: transparent;
    flex-shrink: 0;
    transition: border-color var(--transition-base), background var(--transition-base), color var(--transition-base);
  }

  .save-results-label:hover .custom-checkbox {
    border-color: var(--color-primary);
  }

  .custom-checkbox.checked {
    border-color: var(--color-primary);
    background: var(--color-primary);
    color: #fff;
  }

  .btn-stop {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-error);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-error);
    cursor: pointer;
  }

  .status-section {
    margin-bottom: var(--space-2);
  }

  .status-text {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-half);
  }

  .queue-section, .results-section {
    margin-bottom: var(--space-3);
  }

  .env-rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .env-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .env-label {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    white-space: nowrap;
    width: 100px;
    flex-shrink: 0;
  }

  .env-value {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .cpu-input {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-half) var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    transition: border-color var(--transition-base);
    width: 260px;
    max-width: 100%;
    min-width: 0;
  }

  .cpu-input:focus-visible {
    border-color: var(--color-focus-ring);
  }

  .model-list {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3px;
  }

  @media (max-width: 900px) {
    .model-list {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 600px) {
    .model-list {
      grid-template-columns: 1fr;
    }
  }

  .model-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    min-width: 0;
    transition: border-color var(--transition-base), background var(--transition-base);
  }

  .model-item:hover {
    border-color: var(--color-primary);
    background:var(--color-accent-light);
  }

  .model-item-left {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    overflow: hidden;
    min-width: 0;
  }

  .model-item-top,
  .model-item-bottom {
    display: flex;
    align-items: center;
    gap: 5px;
    overflow: hidden;
    white-space: nowrap;
    min-width: 0;
  }

  .model-item-repo {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .model-item-name {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }


  .model-item-dtype {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    padding: 1px 7px;
    border-radius: var(--radius-sm);
    border: 1px solid;
    white-space: nowrap;
    flex-shrink: 0;
    line-height: 1.4;
  }

  .model-item-size {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    padding: 1px 7px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
    white-space: nowrap;
    flex-shrink: 0;
    line-height: 1.4;
  }

  .model-item-dtype[data-dtype="fp32"]      { color: var(--color-dt-fp32);      border-color: var(--color-dt-fp32); }
  .model-item-dtype[data-dtype="fp16"]      { color: var(--color-dt-fp16);      border-color: var(--color-dt-fp16); }
  .model-item-dtype[data-dtype="bf16"]      { color: var(--color-dt-bf16);      border-color: var(--color-dt-bf16); }
  .model-item-dtype[data-dtype="fp8"]       { color: var(--color-dt-fp8);       border-color: var(--color-dt-fp8); }
  .model-item-dtype[data-dtype="int8"]      { color: var(--color-dt-int8);      border-color: var(--color-dt-int8); }
  .model-item-dtype[data-dtype="uint8"]     { color: var(--color-dt-uint8);     border-color: var(--color-dt-uint8); }
  .model-item-dtype[data-dtype="int4"]      { color: var(--color-dt-int4);      border-color: var(--color-dt-int4); }
  .model-item-dtype[data-dtype="uint4"]     { color: var(--color-dt-uint4);     border-color: var(--color-dt-uint4); }
  .model-item-dtype[data-dtype="q4"]        { color: var(--color-dt-q4);        border-color: var(--color-dt-q4); }
  .model-item-dtype[data-dtype="q4f16"]     { color: var(--color-dt-q4f16);     border-color: var(--color-dt-q4f16); }
  .model-item-dtype[data-dtype="bnb4"]      { color: var(--color-dt-bnb4);      border-color: var(--color-dt-bnb4); }
  .model-item-dtype[data-dtype="quantized"] { color: var(--color-dt-quantized); border-color: var(--color-dt-quantized); }

  .version-select {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    padding: var(--space-half) var(--space-1);
    cursor: pointer;
    transition: border-color var(--transition-base);
  }

  .version-select:focus-visible {
    border-color: var(--color-focus-ring);
  }
</style>
