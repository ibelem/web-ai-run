<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { replaceState } from '$app/navigation';
  import { get } from 'svelte/store';
  import type { Backend, TestItem, TestResult, RunConfig as RunConfigType, EnvironmentInfo } from '$lib/engine/types';
  import { detectAvailableBackends } from '$lib/engine/backends';
  import { buildTestQueue } from '$lib/engine/queue';
  import { detectEnvironment } from '$lib/engine/environment';
  import { ResultsWriter } from '$lib/engine/results-writer';
  import { runInWorker, isWorkerSupported, terminateWorker } from '$lib/engine/worker/pool';
  import { auth, isAuthenticated } from '$lib/stores/auth';
  import type { SharedRunConfig } from '$lib/supabase/types';
  import { CPU_MODELS } from '$lib/data/cpu-models';
  import { OS_MODELS } from '$lib/data/os-models';
  import { fetchRuntimeVersions } from '$lib/engine/runtime-versions';
  import { inferDataType } from '$lib/huggingface/parser';
  import BackendSelector from '$lib/components/BackendSelector.svelte';
  import FormatIcon from '$lib/components/FormatIcon.svelte';
  import NetronLink from '$lib/components/NetronLink.svelte';
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

  const WEBNN_EP_OPTIONS = [
    { value: '', label: 'Default / Unknown' },
    { value: 'openvino', label: 'ORT - OpenVINO EP' },
    { value: 'webgpu', label: 'ORT - WebGPU EP' },
    { value: 'coreml', label: 'CoreML' },
    { value: 'litert', label: 'LiteRT' },
    { value: 'tflite', label: 'TFLite' },
    { value: 'cpu', label: 'ORT - CPU EP' },
    { value: 'dml', label: 'ORT - DML EP' },
    { value: 'qnn', label: 'ORT - QNN EP' },
    { value: 'nvtensorrtrtx', label: 'ORT - NvTensorRTRTX EP' },
    { value: 'migraphx', label: 'ORT - MIGraphX EP' },
    { value: 'vitisai', label: 'ORT - VitisAI EP' },
  ] as const;

  function parseHash(): { models: ModelEntry[]; backends: Backend[]; iterations: number; upload: boolean; cpu: string; ort: string; litert: string; webnnEp: string } {
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
      webnnEp: hash.get('webnn_ep') ?? '',
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
    if (webnnEp) params.set('webnn_ep', webnnEp);
    replaceState(`#${params}`, {});
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
  let webnnEp = $state('');
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

  const completedCount = $derived(queue.filter(i => i.status === 'completed' || i.status === 'error').length);
  const totalQueue = $derived(queue.length);
  const activeItem = $derived(queue.find(i => i.status === 'downloading' || i.status === 'compiling' || i.status === 'running'));
  const nextItem = $derived(queue.find(i => i.status === 'pending'));

  const RUN_MODELS_KEY = 'run_models';
  const RUN_PREFS_KEY = 'run_prefs';

  interface RunPrefs {
    cpu?: string;
    os?: string;
    webnnEp?: string;
    ort?: string;
    litert?: string;
  }

  function loadPrefs(): RunPrefs {
    try {
      return JSON.parse(localStorage.getItem(RUN_PREFS_KEY) ?? '{}');
    } catch { return {}; }
  }

  function savePrefs() {
    try {
      const prefs: RunPrefs = { cpu: cpuModel, os: osModel, webnnEp, ort: ortVersion, litert: litertVersion };
      localStorage.setItem(RUN_PREFS_KEY, JSON.stringify(prefs));
    } catch {}
  }

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
    void webnnEp;
    writeHash();
    savePrefs();
    shareUrl = '';
    shareId = '';
    // Persist current model selection so navigation away doesn't lose it
    try {
      if (hashModels.length > 0) sessionStorage.setItem(RUN_MODELS_KEY, JSON.stringify(hashModels));
      else sessionStorage.removeItem(RUN_MODELS_KEY);
    } catch {}
  });

  onMount(async () => {
    window.addEventListener('keydown', handleKeydown);

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

    const prefs = loadPrefs();
    cpuModel = parsed.cpu || prefs.cpu || '';
    osModel = parsed.os || prefs.os || '';
    webnnEp = parsed.webnnEp || prefs.webnnEp || '';

    availableBackends = await detectAvailableBackends();
    environment = await detectEnvironment();
    useWorker = isWorkerSupported();

    // Fetch latest runtime versions from npm, then apply hash > prefs > default order
    try {
      const v = await fetchRuntimeVersions();
      ortDevVersions = v.ort.dev;
      ortStableVersions = v.ort.stable;
      litertDevVersions = v.litert.dev;
      litertStableVersions = v.litert.stable;
      ortVersion = parsed.ort || prefs.ort || v.ort.dev[0] || v.ort.stable[0] || '';
      litertVersion = parsed.litert || prefs.litert || v.litert.dev[0] || v.litert.stable[0] || '';
    } catch {
      ortVersion = parsed.ort || prefs.ort || '';
      litertVersion = parsed.litert || prefs.litert || '';
    }

    mounted = true;
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isRunning && hashModels.length > 0) {
      e.preventDefault();
      startBenchmark();
    } else if (e.key === 'Escape' && isRunning) {
      e.preventDefault();
      stopBenchmark();
    }
  }

  onDestroy(() => {
    if (!browser) return;
    window.removeEventListener('keydown', handleKeydown);
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
        webnnEp,
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

  let shareUrl = $state('');
  let shareId = $state('');
  let shareLoading = $state(false);

  async function shareConfig() {
    if (hashModels.length === 0) return;
    shareLoading = true;
    try {
      const config: SharedRunConfig = {
        models: hashModels.map(m => ({ hf_model_id: m.hf_model_id, file_path: m.file_path })),
        backends: selectedBackends,
        iterations,
        upload: saveResults || undefined,
        cpu: cpuModel.trim() || undefined,
        os: osModel.trim() || undefined,
        ort: usesOnnx && ortVersion ? ortVersion : undefined,
        litert: usesLitert && litertVersion ? litertVersion : undefined,
        webnn_ep: webnnEp || undefined,
      };
      const res = await fetch('/api/shared-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error('Failed to create share link');
      const { id } = await res.json();
      shareId = id;
      shareUrl = `${location.origin}/run/s/${id}`;
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      shareUrl = '';
    } finally {
      shareLoading = false;
    }
  }

  async function deleteShareUrl() {
    if (!shareId) return;
    await fetch(`/api/shared-config?id=${shareId}`, { method: 'DELETE' });
    shareUrl = '';
    shareId = '';
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
  <header class="page-header page-header-row">
    <div>
      <h1>Benchmark</h1>
      <p>
        {#if totalModels > 0}
          {totalModels} model{totalModels > 1 ? 's' : ''} selected
        {:else}
          Select models from the Model page to benchmark.
        {/if}
      </p>
    </div>
    {#if $isAuthenticated && totalModels > 0 && !isRunning}
      <div class="share-row">
        <button class="btn-share" onclick={shareConfig} disabled={shareLoading} title="Create a short URL to share this benchmark configuration">
          {#if shareLoading}
            <span class="spinner spinner-sm"></span>
          {:else if shareUrl}
            Copied!
          {:else}
            Share
          {/if}
        </button>
        {#if shareUrl}
          <button class="btn-share-delete" onclick={deleteShareUrl} title="Delete shared link">Delete</button>
        {/if}
      </div>
    {/if}
  </header>

  <section class="config-section">
    <div class="top-config-grid">
      <BackendSelector bind:selected={selectedBackends} available={availableBackends} />
      <RunConfigCmp bind:iterations />
    </div>

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
        <div class="env-row">
          <span class="env-label">WebNN EP</span>
          <select class="version-select" bind:value={webnnEp}>
            {#each WEBNN_EP_OPTIONS as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </div>
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
      <span class="models-label">Models <span class="models-count">{totalModels}</span></span>
      <ul class="model-list">
        {#each hashModels as m}
          {@const ext = m.file_path.endsWith('.litertlm') ? 'litertlm' : m.file_path.endsWith('.tflite') ? 'tflite' : 'onnx'}
          <li class="model-item">
            <div class="model-item-left">
              <div class="model-item-top">
                <span class="model-item-repo">{m.hf_model_id}</span>
                {#if m.data_type}
                  <span class="dtype-chip" data-dtype={m.data_type}>{m.data_type === 'quantized' ? 'quant' : m.data_type}</span>
                {/if}
              </div>
              <div class="model-item-bottom">
                <FormatIcon format={ext} size={14} hfModelId={m.hf_model_id} filePath={m.file_path} />
                <NetronLink hfModelId={m.hf_model_id} filePath={m.file_path} />
                <span class="model-item-name">{m.file_path}</span>
              </div>
            </div>
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
              Your CPU model, GPU, OS, and browser will be saved alongside the benchmark scores to make the results meaningful
            </p>
          {:else}
            <p class="upload-disclosure upload-disclosure-warn">
              <a href="/login">Sign in</a> to upload results - we need an account to attribute the data.
            </p>
          {/if}
        {/if}
        <button class="btn-primary" onclick={startBenchmark} disabled={totalModels === 0 || (saveResults && (!$isAuthenticated || !cpuModel.trim() || !osModel.trim()))} title="Ctrl+Enter">
          Run Benchmark <kbd class="kbd-hint">Ctrl+Enter</kbd>
        </button>
        {#if saveResults && $isAuthenticated && (!cpuModel.trim() || !osModel.trim())}
          <p class="action-hint action-hint-warn">
            Fill in your CPU and OS above to enable result upload
          </p>
        {/if}
        {#if totalModels === 0}
          <p class="action-hint">No models selected. <a href="/browse">Browse models</a> to pick one, or <a href="/custom">upload your own</a>.</p>
        {/if}
      {:else}
        <button class="btn-stop" onclick={stopBenchmark} title="Esc">Stop <kbd class="kbd-hint">Esc</kbd></button>
      {/if}
    </div>
  </section>

  {#if isRunning || statusText}
    <section class="status-section">
      {#if isRunning && totalQueue > 0}
        <div class="progress-summary">
          <span class="progress-count">{completedCount}/{totalQueue} complete</span>
          {#if activeItem}
            <span class="progress-current">Running: {activeItem.hf_model_id.split('/')[1]} on {activeItem.backend}</span>
          {/if}
          {#if nextItem && !activeItem}
            <span class="progress-next">Next: {nextItem.hf_model_id.split('/')[1]} on {nextItem.backend}</span>
          {:else if nextItem}
            <span class="progress-next">Next: {nextItem.hf_model_id.split('/')[1]} on {nextItem.backend}</span>
          {/if}
        </div>
      {/if}
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
    padding: 0 0 var(--space-4) 0;
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
    color: var(--color-text-on-primary);
  }

  .btn-stop {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-error);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-error);
    cursor: pointer;
  }

  .actions :global(.btn-primary) {
    display: inline-flex;
    align-items: center;
  }

  .kbd-hint {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 400;
    padding: 1px 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.15);
    opacity: 0.7;
    margin-left: 6px;
  }

  .btn-stop .kbd-hint {
    background: rgba(229, 62, 62, 0.1);
  }

  .page-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .share-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .btn-share {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-primary);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    transition: background var(--transition-base);
  }

  .btn-share:hover:not(:disabled) {
    background: var(--color-accent-light);
  }

  .btn-share:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }



  .btn-share-delete {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-error);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-error);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background var(--transition-base);
  }

  .btn-share-delete:hover {
    background: rgba(229, 62, 62, 0.06);
  }

  .status-section {
    margin-bottom: var(--space-2);
  }

  .progress-summary {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }

  .progress-count {
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .progress-current {
    color: var(--color-primary);
  }

  .progress-next {
    color: var(--color-text-muted);
  }

  .status-text {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-half);
  }

  .queue-section, .results-section {
    margin-bottom: var(--space-3);
  }

  .top-config-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-2);
  }

  .env-rows {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-2);
  }

  .env-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .env-label {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .env-value {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    padding: var(--space-half) 0;
  }

  .cpu-input {
    width: 100%;
    min-width: 0;
  }

  .models-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
  }

  .models-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    font-size: 11px;
    letter-spacing: 0;
    text-transform: none;
  }

  .model-list {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
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


  /* dtype-chip and size-chip use global styles from app.css */
  .dtype-chip, .size-chip { margin-left: auto; }

  .version-select {
    color: var(--color-text-secondary);
    cursor: pointer;
    width: 100%;
  }

  @media (max-width: 768px) {
    .env-rows { grid-template-columns: repeat(2, 1fr); }
  }

  @media (max-width: 640px) {
    .page-header-row {
      flex-direction: column;
      align-items: flex-start;
    }

    .share-row {
      width: 100%;
    }

    .btn-share,
    .btn-share-delete {
      flex: 1;
      padding: 8px 12px;
      font-size: var(--text-sm);
    }

    .env-rows { grid-template-columns: 1fr; }
    .top-config-grid { grid-template-columns: 1fr; }

    .actions {
      flex-direction: column;
    }

    .actions :global(.btn-primary),
    .btn-stop {
      width: 100%;
      justify-content: center;
    }
  }
</style>
