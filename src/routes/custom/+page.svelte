<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import type { Backend, TestItem, TestResult, RunConfig as RunConfigType, EnvironmentInfo } from '$lib/engine/types';
  import { detectAvailableBackends, getBackendLabel } from '$lib/engine/backends';
  import { detectEnvironment } from '$lib/engine/environment';
  import { runInWorker, terminateWorker } from '$lib/engine/worker/pool';
  import { fetchRuntimeVersions } from '$lib/engine/runtime-versions';
  import { inferRuntime } from '$lib/huggingface/parser';
  import { isRunning as isRunningStore } from '$lib/stores/benchmark';
  import BackendSelector from '$lib/components/BackendSelector.svelte';
  import FormatIcon from '$lib/components/FormatIcon.svelte';
  import RunConfigCmp from '$lib/components/RunConfig.svelte';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import BenchmarkResults from '$lib/components/BenchmarkResults.svelte';

  let availableBackends = $state<Backend[]>(['wasm_1']);
  let selectedBackends = $state<Backend[]>(['webgpu']);
  let iterations = $state(50);
  let environment = $state<EnvironmentInfo | null>(null);

  let file = $state<File | null>(null);
  let modelBuffer = $state<ArrayBuffer | null>(null);
  let dragOver = $state(false);
  let isRunning = $state(false);
  $effect(() => { isRunningStore.set(isRunning); });
  let statusText = $state('');
  let results = $state<TestResult[]>([]);
  let queue = $state<TestItem[]>([]);
  let runLogs = $state<string[]>([]);
  let logsEl = $state<HTMLDivElement | undefined>(undefined);
  let logsCopied = $state(false);
  let errorMessage = $state('');
  let downloadPercent = $state(0);
  let downloadLoaded = $state(0);
  let downloadTotal = $state(0);

  let ortVersion = $state('');
  let ortDevVersions = $state<string[]>([]);
  let ortStableVersions = $state<string[]>([]);
  let litertVersion = $state('');
  let litertDevVersions = $state<string[]>([]);
  let litertStableVersions = $state<string[]>([]);
  let fdoText = $state('');

  function parseFdo(text: string): Record<string, number> | undefined {
    const trimmed = text.trim();
    if (!trimmed) return undefined;
    const out: Record<string, number> = {};
    const pairs = trimmed.split(',');
    for (const p of pairs) {
      const [k, v] = p.split(':').map(s => s.trim());
      if (!k || !v) continue;
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }

  const fdoParsed = $derived(parseFdo(fdoText));

  let queueFlushTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleQueueFlush() {
    if (queueFlushTimer) return;
    queueFlushTimer = setTimeout(() => {
      queue = [...queue];
      queueFlushTimer = null;
    }, 100);
  }

  $effect(() => {
    if (logsEl && runLogs.length) {
      logsEl.scrollTop = logsEl.scrollHeight;
    }
  });

  const runtime = $derived(file ? inferRuntime(file.name) : null);
  const usesOnnx = $derived(runtime === 'onnx');
  const usesLitert = $derived(runtime === 'litert');

  const completedCount = $derived(
    queue.filter((i) => i.status === 'completed' || i.status === 'error').length
  );
  const totalQueue = $derived(queue.length);
  const activeItem = $derived(
    queue.find((i) => i.status === 'downloading' || i.status === 'compiling' || i.status === 'running')
  );
  const nextItem = $derived(queue.find((i) => i.status === 'pending'));

  function handleKeydown(e: KeyboardEvent) {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLSelectElement ||
      e.target instanceof HTMLTextAreaElement
    )
      return;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isRunning && file) {
      e.preventDefault();
      startBenchmark();
    } else if (e.key === 'Escape' && isRunning) {
      e.preventDefault();
      stopBenchmark();
    }
  }

  onMount(async () => {
    if (browser) window.addEventListener('keydown', handleKeydown);
    availableBackends = await detectAvailableBackends();
    environment = await detectEnvironment();

    try {
      const versions = await fetchRuntimeVersions();
      ortDevVersions = versions.ort.dev;
      ortStableVersions = versions.ort.stable;
      ortVersion = versions.ort.dev[0] ?? versions.ort.stable[0] ?? '1.21.0';
      litertDevVersions = versions.litert.dev;
      litertStableVersions = versions.litert.stable;
      litertVersion = versions.litert.dev[0] ?? versions.litert.stable[0] ?? '2.5.2';
    } catch {
      ortVersion = '1.21.0';
      litertVersion = '2.5.2';
    }
  });

  onDestroy(() => {
    if (browser) window.removeEventListener('keydown', handleKeydown);
    terminateWorker();
  });

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const droppedFile = e.dataTransfer?.files?.[0];
    if (droppedFile) validateAndSetFile(droppedFile);
  }

  function handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const selected = input.files?.[0];
    if (selected) validateAndSetFile(selected);
  }

  async function validateAndSetFile(f: File) {
    const r = inferRuntime(f.name);
    if (!r) {
      errorMessage = 'Unsupported file type. Please use .onnx, .tflite, or .litertlm files.';
      file = null;
      modelBuffer = null;
      return;
    }
    errorMessage = '';
    file = f;
    modelBuffer = await f.arrayBuffer();
  }

  function formatSize(bytes: number): string {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  function fileFormat(name: string): string {
    if (name.endsWith('.tflite')) return 'tflite';
    if (name.endsWith('.litertlm')) return 'litertlm';
    return 'onnx';
  }

  async function startBenchmark() {
    if (!file || !modelBuffer || !runtime) return;
    if (selectedBackends.length === 0) return;

    isRunning = true;
    results = [];
    runLogs = [];
    errorMessage = '';
    statusText = 'Preparing benchmark...';

    const fileName = file.name;
    const dataType = fileName.includes('fp16') ? 'fp16' : 'fp32';

    queue = selectedBackends.map((backend, idx) => ({
      id: `${idx}-${backend}`,
      hf_model_id: `local/${fileName}`,
      file_path: fileName,
      data_type: dataType,
      runtime,
      backend,
      status: 'pending',
      progress: 0,
    }));

    const config: RunConfigType = {
      iterations,
      warmup_runs: 3,
      backends: selectedBackends,
      save_results: false,
    };

    for (const item of queue) {
      if (!isRunning) break;
      item.status = 'downloading';
      queue = [...queue];
      statusText = `Testing ${item.backend}...`;

      const runtimeVersion = item.runtime === 'onnx' ? ortVersion : litertVersion;

      let result: TestResult;
      try {
        result = await runInWorker({
          modelSource: { kind: 'buffer', fileName, buffer: modelBuffer.slice(0) },
          runtime: item.runtime,
          backend: item.backend,
          iterations: config.iterations,
          warmupRuns: config.warmup_runs,
          runtimeVersion,
          freeDimensionOverrides: item.runtime === 'onnx' ? fdoParsed : undefined,
          onProgress: (progress) => {
            downloadPercent = progress.percent;
            downloadLoaded = progress.loaded_bytes;
            downloadTotal = progress.total_bytes;
            item.progress = progress.percent;
            item.status = 'downloading';
            scheduleQueueFlush();
          },
          onStatus: (status) => {
            statusText = status;
            runLogs = [...runLogs, status];
            if (status.includes('Compil') || status.includes('session') || status.includes('Creating')) item.status = 'compiling';
            else if (status.includes('Inferencing') || status.includes('Warm')) item.status = 'running';
            scheduleQueueFlush();
          },
          onLogs: (logs) => {
            runLogs = [...runLogs, ...logs];
          },
        });
      } catch (err: any) {
        terminateWorker();
        const msg = err?.message ?? 'Worker error';
        runLogs = [...runLogs, `Error: ${msg}`];
        result = {
          id: item.id,
          test_item: { ...item, status: 'error', error: msg },
          metrics: null,
          inference_times: [],
          warmup_ms: 0,
          iterations: config.iterations,
          iterations_completed: 0,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          error_message: msg,
        };
      }

      if (queueFlushTimer) {
        clearTimeout(queueFlushTimer);
        queueFlushTimer = null;
      }
      if (result.error_message) {
        item.status = 'error';
        item.error = result.error_message;
        runLogs = [...runLogs, `Error [${fileName} / ${getBackendLabel(item.backend)}]: ${result.error_message}`];
      } else {
        item.status = 'completed';
        item.error = undefined;
      }
      item.progress = 100;
      results = [...results, result];
      queue = [...queue];
      downloadPercent = 0;
    }

    isRunning = false;
    statusText = 'Benchmark complete.';
  }

  function stopBenchmark() {
    if (queueFlushTimer) {
      clearTimeout(queueFlushTimer);
      queueFlushTimer = null;
    }
    isRunning = false;
    statusText = 'Stopped.';
    terminateWorker();

    for (const item of queue) {
      if (item.status !== 'completed' && item.status !== 'error') {
        item.status = 'error';
        item.error = 'Stopped by user';
      }
    }
    queue = [...queue];
  }

  async function retryItem(item: TestItem) {
    if (isRunning) return;
    if (!modelBuffer || !file) return;

    item.status = 'pending';
    item.progress = 0;
    item.error = undefined;
    queue = [...queue];
    isRunning = true;
    statusText = `Retrying ${item.backend}...`;

    const fileName = file.name;
    item.status = 'downloading';
    queue = [...queue];

    const runtimeVersion = item.runtime === 'onnx' ? ortVersion : litertVersion;

    let result: TestResult;
    try {
      result = await runInWorker({
        modelSource: { kind: 'buffer', fileName, buffer: modelBuffer.slice(0) },
        runtime: item.runtime,
        backend: item.backend,
        iterations,
        warmupRuns: 3,
        runtimeVersion,
        freeDimensionOverrides: item.runtime === 'onnx' ? fdoParsed : undefined,
        onProgress: (progress) => {
          downloadPercent = progress.percent;
          item.progress = progress.percent;
          item.status = 'downloading';
          scheduleQueueFlush();
        },
        onStatus: (status) => {
          statusText = status;
          runLogs = [...runLogs, status];
          if (status.includes('Compil') || status.includes('session') || status.includes('Creating')) item.status = 'compiling';
          else if (status.includes('Inferencing') || status.includes('Warm')) item.status = 'running';
          scheduleQueueFlush();
        },
        onLogs: (logs) => {
          runLogs = [...runLogs, ...logs];
        },
      });
    } catch (err: any) {
      terminateWorker();
      const msg = err?.message ?? 'Worker error';
      runLogs = [...runLogs, `Error: ${msg}`];
      result = {
        id: item.id,
        test_item: { ...item, status: 'error', error: msg },
        metrics: null,
        inference_times: [],
        warmup_ms: 0,
        iterations,
        iterations_completed: 0,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        error_message: msg,
      };
    }

    if (queueFlushTimer) {
      clearTimeout(queueFlushTimer);
      queueFlushTimer = null;
    }
    if (result.error_message) {
      item.status = 'error';
      item.error = result.error_message;
    } else {
      item.status = 'completed';
      item.error = undefined;
    }
    item.progress = 100;
    results = [
      ...results.filter(
        (r) =>
          !(
            r.test_item.hf_model_id === item.hf_model_id &&
            r.test_item.file_path === item.file_path &&
            r.test_item.backend === item.backend
          )
      ),
      result,
    ];
    queue = [...queue];
    downloadPercent = 0;

    isRunning = false;
    statusText = result.error_message ? `Retry failed: ${result.error_message}` : 'Retry complete.';
  }

  function clearFile() {
    file = null;
    modelBuffer = null;
    results = [];
    queue = [];
    runLogs = [];
    statusText = '';
    errorMessage = '';
  }
</script>

<div class="custom-page" class:run-page-running={isRunning}>
  <header class="page-header" class:hidden={isRunning}>
    <h1>Custom Benchmark</h1>
    <p>Upload your own model file and benchmark it locally in the browser.</p>
  </header>

  {#if !file && !isRunning}
    <div
      class="dropzone"
      class:drag-over={dragOver}
      role="button"
      tabindex="0"
      ondragover={(e) => { e.preventDefault(); dragOver = true; }}
      ondragleave={() => dragOver = false}
      ondrop={handleDrop}
      onclick={() => document.getElementById('file-input')?.click()}
      onkeydown={(e) => { if (e.key === 'Enter') document.getElementById('file-input')?.click(); }}
    >
      <svg class="drop-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      <p class="drop-text">Drop a model file here or <span class="drop-browse">click to browse</span></p>
      <p class="drop-hint">Supports .onnx, .tflite, .litertlm</p>
    </div>
    <input
      id="file-input"
      type="file"
      accept=".onnx,.tflite,.litertlm"
      style="display:none"
      onchange={handleFileInput}
    />
  {/if}

  {#if errorMessage}
    <p class="error-text">{errorMessage}</p>
  {/if}

  {#if file && !isRunning}
    <div class="file-info">
      <div class="file-details">
        <FormatIcon format={fileFormat(file.name)} size={16} />
        <span class="file-name">{file.name}</span>
        <span class="file-size">{formatSize(file.size)}</span>
        {#if runtime}<span class="badge">{runtime}</span>{/if}
      </div>
      <button class="btn-clear" onclick={clearFile}>Remove</button>
    </div>
  {/if}

  <div class="running-center" class:running-center-active={isRunning}>
    {#if isRunning}
      <section class="status-section">
        {#if totalQueue > 0}
          <div class="status-row status-row-top">
            <span class="status-model" title={file?.name ?? ''}>{file?.name ?? ''}</span>
            <span class="progress-count">Queue: {completedCount}/{totalQueue}</span>
          </div>
        {/if}
        <p class="status-text">{statusText}</p>
        <div
          class="progress-bar-slot"
          class:progress-bar-hidden={downloadPercent <= 0 || downloadPercent >= 100}
        >
          <ProgressBar percent={downloadPercent} label="Loading" loadedBytes={downloadLoaded} totalBytes={downloadTotal} />
        </div>
        {#if totalQueue > 0 && (activeItem || nextItem)}
          <div class="status-row status-row-bottom">
            <span class="progress-current">
              {#if activeItem}
                <span class="status-fmt-icon status-fmt-icon-blink">
                  <FormatIcon format={fileFormat(activeItem.file_path)} size={13} />
                </span>
                <span class="status-text-clip">Running: {activeItem.file_path} · {activeItem.backend}</span>
              {/if}
            </span>
            <span class="progress-next">
              {#if nextItem}
                <span class="status-fmt-icon">
                  <FormatIcon format={fileFormat(nextItem.file_path)} size={13} />
                </span>
                <span class="status-text-clip">Next: {nextItem.file_path} · {nextItem.backend}</span>
              {/if}
            </span>
          </div>
        {/if}
      </section>
    {/if}

    {#if queue.length > 0 || results.length > 0}
      <section class="results-section" class:results-section-running={isRunning}>
        <BenchmarkResults {results} backends={selectedBackends} {queue} {isRunning} onretry={retryItem} />
      </section>
    {/if}

    {#if isRunning}
      <div class="run-controls">
        <button class="btn-stop" onclick={stopBenchmark} title="Esc">Stop <kbd class="kbd-hint">Esc</kbd></button>
      </div>
    {/if}
  </div>

  {#if runLogs.length > 0 && !isRunning}
    <section class="logs-section">
      <div class="logs-header">
        <h3 class="logs-title">Logs ({runLogs.length})</h3>
        <div class="export-group">
          <span class="export-group-icon">
            {#if logsCopied}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            {:else}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            {/if}
          </span>
          <button class="export-group-btn" class:active={logsCopied} onclick={async () => {
            await navigator.clipboard.writeText(runLogs.join('\n'));
            logsCopied = true;
            setTimeout(() => { logsCopied = false; }, 2000);
          }} title="Copy all logs">
            {logsCopied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
      <div class="logs-container" bind:this={logsEl}>
        {#each runLogs as log}
          <div class="log-line">{log}</div>
        {/each}
      </div>
    </section>
  {/if}

  {#if file && !isRunning}
    <section class="config-section">
      <div class="top-config-grid">
        <BackendSelector bind:selected={selectedBackends} available={availableBackends} />
        <RunConfigCmp bind:iterations />
      </div>

      <div class="env-rows">
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
        {#if usesOnnx}
          <div class="env-row env-row-fdo">
            <span class="env-label" title="Free Dimension Overrides — only used for WebNN backends with dynamic input shapes">FDO</span>
            <input
              class="fdo-input"
              type="text"
              placeholder="batch_size: 1, height: 224, width: 224"
              bind:value={fdoText}
            />
          </div>
        {/if}
      </div>

      <div class="actions">
        <button
          class="btn-primary"
          onclick={startBenchmark}
          disabled={selectedBackends.length === 0}
          title="Ctrl+Enter"
        >
          Run Benchmark <kbd class="kbd-hint">Ctrl+Enter</kbd>
        </button>
      </div>
    </section>
  {/if}
</div>

<style>
  .custom-page {
    max-width: 100%;
  }

  .hidden {
    display: none !important;
  }

  .run-page-running {
    min-height: calc(100dvh - 56px);
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .running-center {
    display: contents;
  }

  .running-center-active {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
  }

  .dropzone {
    width: 100%;
    max-width: 560px;
    min-height: 200px;
    margin-inline: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-5) var(--space-3);
    text-align: center;
    cursor: pointer;
    transition: border-color var(--transition-base), background var(--transition-base);
  }

  .dropzone:hover, .dropzone.drag-over {
    border-color: var(--color-primary);
    background: var(--color-accent-light);
  }

  .drop-icon {
    color: var(--color-text-muted);
    margin-bottom: var(--space-2);
  }

  .drop-text {
    font-size: var(--text-base);
    color: var(--color-text-primary);
    margin-bottom: var(--space-half);
  }

  .drop-hint {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .drop-browse {
    color: var(--color-primary);
  }

  .file-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-2);
  }

  .file-details {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .file-name {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--color-text-primary);
    font-weight: 500;
  }

  .file-size {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .badge {
    font-size: var(--text-xs);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
  }

  .btn-clear {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    padding: 4px 10px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .btn-clear:hover { color: var(--color-error); border-color: var(--color-error); }

  .config-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .top-config-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-2);
  }

  @media (max-width: 768px) {
    .top-config-grid {
      grid-template-columns: 1fr;
    }
  }

  .env-rows {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-1) var(--space-3);
  }

  @media (max-width: 768px) {
    .env-rows {
      grid-template-columns: 1fr;
    }
  }

  .env-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    font-family: var(--font-mono);
  }

  .env-label {
    color: var(--color-text-muted);
    min-width: 80px;
    flex-shrink: 0;
  }

  .env-value {
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .version-select {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    padding: 3px 6px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-primary);
    flex: 1;
    min-width: 0;
  }

  .version-select:focus-visible { border-color: var(--color-focus-ring); }

  .env-row-fdo {
    grid-column: 1 / -1;
  }

  .fdo-input {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    padding: 4px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-primary);
    flex: 1;
    min-width: 0;
  }

  .fdo-input:focus-visible { border-color: var(--color-focus-ring); }

  .actions {
    display: flex;
    justify-content: center;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .btn-primary {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border: none;
    border-radius: var(--radius-base);
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    cursor: pointer;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

  .kbd-hint {
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 1px 4px;
    margin-left: 4px;
    border: 1px solid currentColor;
    border-radius: var(--radius-sm);
    opacity: 0.6;
  }

  .error-text {
    color: var(--color-error);
    font-size: var(--text-sm);
    margin-bottom: var(--space-2);
  }

  .status-section {
    width: 90vw;
    max-width: 50vw;
    margin-inline: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-6);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    margin-bottom: var(--space-3);
  }

  .status-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }

  .status-model {
    font-weight: 600;
    color: var(--color-primary);
    font-size: var(--text-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .progress-count {
    color: var(--color-text-muted);
    flex-shrink: 0;
    font-size: var(--text-xs);
  }

  .status-fmt-icon {
    display: inline-flex;
    align-items: center;
    vertical-align: middle;
    margin-right: 4px;
    flex-shrink: 0;
  }

  .status-fmt-icon-blink {
    animation: blink 1.2s ease-in-out infinite;
  }

  .status-text-clip {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

  .progress-current {
    display: inline-flex;
    align-items: center;
    color: var(--color-primary);
    overflow: hidden;
    flex: 0 0 50%;
    max-width: 50%;
    font-size: var(--text-xs);
  }

  .progress-next {
    display: inline-flex;
    align-items: center;
    color: var(--color-text-muted);
    overflow: hidden;
    flex: 0 0 50%;
    max-width: 50%;
    font-size: var(--text-xs);
    text-align: right;
    justify-content: flex-end;
  }

  @media (max-width: 768px) {
    .status-row {
      flex-direction: column;
      gap: 2px;
    }
    .progress-next {
      text-align: left;
    }
  }

  .status-text {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 0;
  }

  .progress-bar-slot {
    min-height: 20px;
  }

  .progress-bar-hidden {
    visibility: hidden;
    height: 0;
    min-height: 0;
    overflow: hidden;
  }

  .run-controls {
    display: flex;
    justify-content: center;
    margin-top: var(--space-1);
  }

  .results-section {
    margin-bottom: var(--space-3);
  }

  .results-section-running {
    width: 90vw;
    max-width: 50vw;
    margin-inline: auto;
  }

  .logs-section {
    margin-bottom: var(--space-3);
  }

  .logs-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-1);
  }

  .logs-title {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .export-group {
    display: inline-flex;
    align-items: stretch;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    overflow: hidden;
  }

  .export-group-icon {
    display: flex;
    align-items: center;
    padding: 0 6px;
    color: var(--color-text-muted);
    border-right: 1px solid var(--color-border);
  }

  .export-group-btn {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 3px 7px;
    border: none;
    border-left: 1px solid var(--color-border);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background var(--transition-base), color var(--transition-base);
  }

  .export-group-btn:first-of-type {
    border-left: none;
  }

  .export-group-btn:hover, .export-group-btn.active {
    background: var(--color-accent-light);
    color: var(--color-primary);
  }

  .logs-container {
    height: 120px;
    overflow-y: auto;
    scroll-behavior: smooth;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    padding: var(--space-1);
    background: var(--color-surface);
  }

  .log-line {
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.6;
    color: var(--color-text-secondary);
    white-space: pre-wrap;
    word-break: break-all;
  }

  @media (max-width: 640px) {
    .file-info {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-1);
    }

    .file-details {
      flex-wrap: wrap;
    }

    .file-name {
      word-break: break-all;
    }
  }
</style>
