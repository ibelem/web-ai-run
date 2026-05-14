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
  import BackendSelector from '$lib/components/BackendSelector.svelte';
  import RunConfigCmp from '$lib/components/RunConfig.svelte';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import TestQueue from '$lib/components/TestQueue.svelte';
  import BenchmarkResults from '$lib/components/BenchmarkResults.svelte';

  let { data } = $props();

  let availableBackends = $state<Backend[]>(['wasm_1']);
  let selectedBackends = $state<Backend[]>(['wasm_1']);
  let iterations = $state(10);
  let saveResults = $state(false);
  let queue = $state<TestItem[]>([]);
  let results = $state<TestResult[]>([]);
  let isRunning = $state(false);
  let statusText = $state('');
  let downloadPercent = $state(0);
  let environment = $state<EnvironmentInfo | null>(null);
  let useWorker = $state(true);

  onMount(async () => {
    availableBackends = await detectAvailableBackends();
    environment = await detectEnvironment();
    useWorker = isWorkerSupported();
  });

  onDestroy(() => {
    terminateWorker();
  });

  async function startBenchmark() {
    if (data.modelIds.length === 0) return;

    const models = data.modelIds.map((id: string) => ({
      hf_model_id: id,
      file_path: 'onnx/model.onnx',
      data_type: 'fp32',
      runtime: 'onnx' as const,
    }));

    queue = buildTestQueue(models, selectedBackends);
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
      writer = new ResultsWriter(authState.user.id, environment);
    }

    for (const item of queue) {
      if (!isRunning) break;

      item.status = 'downloading';
      queue = [...queue];
      statusText = `Testing ${item.hf_model_id.split('/')[1]}...`;

      if (writer) {
        await writer.createResult(item, config.iterations);
      }

      const runtimeVersion = item.runtime === 'onnx' ? '1.21.0' : '1.1.0';

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
        },
        onStatus: (status) => {
          statusText = status;
          if (status.includes('Compil') || status.includes('session')) item.status = 'compiling';
          else if (status.includes('Running') || status.includes('Warm')) item.status = 'running';
        },
      });

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
    isRunning = false;
    statusText = 'Stopped.';
  }
</script>

<div class="run-page">
  <header class="page-header">
    <h1>Benchmark</h1>
    <p>
      {#if data.modelIds.length > 0}
        {data.modelIds.length} model{data.modelIds.length > 1 ? 's' : ''} selected
      {:else}
        Select models from the Model page to benchmark.
      {/if}
    </p>
  </header>

  <section class="config-section">
    <BackendSelector bind:selected={selectedBackends} available={availableBackends} />
    <RunConfigCmp bind:iterations bind:save_results={saveResults} />

    <div class="actions">
      {#if !isRunning}
        <button class="btn-primary" onclick={startBenchmark} disabled={data.modelIds.length === 0}>
          Run Benchmark
        </button>
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

  {#if environment}
    <section class="env-section">
      <details>
        <summary class="env-summary">Environment</summary>
        <div class="env-grid">
          <span class="env-label">CPU</span><span class="env-value">{environment.cpu}</span>
          <span class="env-label">GPU</span><span class="env-value">{environment.gpu}</span>
          <span class="env-label">OS</span><span class="env-value">{environment.os} {environment.os_version}</span>
          <span class="env-label">Browser</span><span class="env-value">{environment.browser} {environment.browser_version}</span>
          <span class="env-label">Memory</span><span class="env-value">{environment.memory_gb} GB</span>
          <span class="env-label">Threads</span><span class="env-value">{environment.thread_count}</span>
        </div>
      </details>
    </section>
  {/if}
</div>

<style>
  .run-page {
    max-width: 100%;
  }

  .page-header {
    margin-bottom: var(--space-3);
  }

  .page-header h1 {
    font-size: var(--text-xl);
    font-weight: 700;
    letter-spacing: -0.01em;
    margin-bottom: var(--space-half);
  }

  .page-header p {
    font-size: var(--text-base);
    color: var(--color-text-secondary);
  }

  .config-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .actions {
    display: flex;
    gap: var(--space-1);
  }

  .btn-primary {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: 10px 20px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--color-primary);
    color: #FFFFFF;
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-primary:hover { background: var(--color-primary-hover); }
  .btn-primary:disabled { background: var(--color-disabled); color: var(--color-text-muted); cursor: not-allowed; }

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

  .env-section {
    margin-top: var(--space-3);
  }

  .env-summary {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
  }

  .env-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-half) var(--space-2);
    margin-top: var(--space-1);
    font-size: var(--text-xs);
    font-family: var(--font-mono);
  }

  .env-label { color: var(--color-text-muted); }
  .env-value { color: var(--color-text-primary); }
</style>
