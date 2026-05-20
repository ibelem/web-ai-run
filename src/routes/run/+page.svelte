<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import type { Backend, TestItem, TestResult, RunConfig as RunConfigType, EnvironmentInfo } from '$lib/engine/types';
  import { detectAvailableBackends } from '$lib/engine/backends';
  import { buildTestQueue } from '$lib/engine/queue';
  import { detectEnvironment } from '$lib/engine/environment';
  import { ResultsWriter } from '$lib/engine/results-writer';
  import { runInWorker, isWorkerSupported, terminateWorker } from '$lib/engine/worker/pool';
  import { auth } from '$lib/stores/auth';
  import { CPU_MODELS } from '$lib/data/cpu-models';
  import { fetchRuntimeVersions } from '$lib/engine/runtime-versions';
  import { inferDataType } from '$lib/huggingface/parser';
  import BackendSelector from '$lib/components/BackendSelector.svelte';
  import RunConfigCmp from '$lib/components/RunConfig.svelte';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import TestQueue from '$lib/components/TestQueue.svelte';
  import BenchmarkResults from '$lib/components/BenchmarkResults.svelte';

  interface ModelEntry {
    hf_model_id: string;
    file_path: string;
    data_type: string;
    runtime: 'onnx' | 'litert';
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
      osVersion: hash.get('osv') ?? '',
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
    if (osVersion.trim()) params.set('osv', osVersion.trim());
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
  let osVersion = $state('');
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

  $effect(() => {
    if (!mounted) return;
    void selectedBackends;
    void iterations;
    void saveResults;
    void cpuModel;
    void osModel;
    void osVersion;
    void hashModels;
    void ortVersion;
    void litertVersion;
    writeHash();
  });

  onMount(async () => {
    // Parse hash first (may come from a shared URL or sessionStorage redirect)
    const parsed = parseHash();

    // sessionStorage takes priority (set by ActionPanel when navigating from /model)
    try {
      const raw = sessionStorage.getItem('hf_ext_models');
      if (raw) {
        const stored: ModelEntry[] = JSON.parse(raw);
        sessionStorage.removeItem('hf_ext_models');
        hashModels = stored;
      } else {
        hashModels = parsed.models;
      }
    } catch {
      hashModels = parsed.models;
    }

    selectedBackends = parsed.backends;
    iterations = parsed.iterations;
    saveResults = parsed.upload;
    cpuModel = parsed.cpu;
    osModel = parsed.os;
    osVersion = parsed.osVersion;

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
          os_version: osVersion.trim() || environment.os_version,
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
          <div class="env-row">
            <span class="env-label">OS</span>
            <input
              class="cpu-input"
              type="text"
              placeholder="e.g. Windows 11, macOS 15, Android 15..."
              bind:value={osModel}
            />
          </div>
          <div class="env-row">
            <span class="env-label">OS Version</span>
            <input
              class="cpu-input"
              type="text"
              placeholder="e.g. 24H2, 15.4.1, 15..."
              bind:value={osVersion}
            />
          </div>
        {/if}
        {#if environment}
          <div class="env-row">
            <span class="env-label">GPU</span>
            <span class="env-value">{environment.gpu}</span>
          </div>
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
          <li class="model-item">
            <span class="model-item-repo">{m.hf_model_id}</span>
            <span class="model-item-name">{m.file_path.split('/').pop()}</span>
            {#if m.data_type}
              <span class="model-item-dtype" data-dtype={m.data_type}>{m.data_type}</span>
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
        <button class="btn-primary" onclick={startBenchmark} disabled={totalModels === 0 || (saveResults && (!cpuModel.trim() || !osModel.trim() || !osVersion.trim()))}>
          Run Benchmark
        </button>
        {#if totalModels === 0}
          <p class="action-hint">No models selected. <a href="/model">Browse models</a> to pick one, or <a href="/custom">upload your own</a>.</p>
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
      <TestQueue {queue} />
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
    gap: var(--space-1);
    margin-top: var(--space-6);
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
    outline: none;
    transition: border-color var(--transition-base);
    width: 260px;
    max-width: 100%;
    min-width: 0;
  }

  .cpu-input:focus {
    border-color: var(--color-focus-ring);
  }

  .model-list {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 3px;
  }

  @media (max-width: 600px) {
    .model-list {
      grid-template-columns: 1fr;
    }
  }

  .model-item {
    display: flex;
    align-items: baseline;
    gap: var(--space-1);
    padding: 5px 8px;
    background: var(--color-surface-sunken);
    border-radius: var(--radius-base);
    min-width: 0;
  }

  .model-item-repo {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
    max-width: 55%;
  }

  .model-item-name {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex: 1;
  }

  .model-item-dtype {
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 1px 5px;
    border-radius: var(--radius-base);
    border: 1px solid currentColor;
    white-space: nowrap;
    flex-shrink: 0;
    color: var(--color-text-muted);
  }

  .model-item-dtype[data-dtype="fp32"]      { color: var(--color-primary); border-color: var(--color-primary); }
  .model-item-dtype[data-dtype="fp16"]      { color: #8b5cf6; border-color: #8b5cf6; }
  .model-item-dtype[data-dtype="bf16"]      { color: #7c3aed; border-color: #7c3aed; }
  .model-item-dtype[data-dtype="int8"]      { color: #06b6d4; border-color: #06b6d4; }
  .model-item-dtype[data-dtype="uint8"]     { color: #0891b2; border-color: #0891b2; }
  .model-item-dtype[data-dtype="int4"]      { color: #10b981; border-color: #10b981; }
  .model-item-dtype[data-dtype="uint4"]     { color: #059669; border-color: #059669; }
  .model-item-dtype[data-dtype="q4"]        { color: #16a34a; border-color: #16a34a; }
  .model-item-dtype[data-dtype="q4f16"]     { color: #6366f1; border-color: #6366f1; }
  .model-item-dtype[data-dtype="quantized"] { color: #ea580c; border-color: #ea580c; }

  .version-select {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    padding: var(--space-half) var(--space-1);
    outline: none;
    cursor: pointer;
    transition: border-color var(--transition-base);
  }

  .version-select:focus {
    border-color: var(--color-focus-ring);
  }
</style>
