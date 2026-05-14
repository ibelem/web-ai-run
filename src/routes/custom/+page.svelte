<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { isAuthenticated } from '$lib/stores/auth';
  import { createClient } from '$lib/supabase/client';
  import { detectAvailableBackends } from '$lib/engine/backends';
  import { detectEnvironment } from '$lib/engine/environment';
  import { runInWorker, terminateWorker } from '$lib/engine/worker/pool';
  import { inferRuntime } from '$lib/huggingface/parser';
  import BackendSelector from '$lib/components/BackendSelector.svelte';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import BenchmarkResults from '$lib/components/BenchmarkResults.svelte';
  import type { Backend, TestResult, EnvironmentInfo } from '$lib/engine/types';

  let showSignInModal = $state(false);
  let availableBackends = $state<Backend[]>(['wasm_1']);
  let selectedBackends = $state<Backend[]>(['wasm_1']);
  let iterations = $state(10);
  let environment = $state<EnvironmentInfo | null>(null);

  let file = $state<File | null>(null);
  let dragOver = $state(false);
  let isRunning = $state(false);
  let statusText = $state('');
  let results = $state<TestResult[]>([]);
  let errorMessage = $state('');

  onMount(async () => {
    availableBackends = await detectAvailableBackends();
    environment = await detectEnvironment();
  });

  onDestroy(() => {
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

  function validateAndSetFile(f: File) {
    const runtime = inferRuntime(f.name);
    if (!runtime) {
      errorMessage = 'Unsupported file type. Please use .onnx, .tflite, or .litertlm files.';
      file = null;
      return;
    }
    errorMessage = '';
    file = f;
  }

  function formatSize(bytes: number): string {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  async function startBenchmark() {
    if (!$isAuthenticated) {
      showSignInModal = true;
      return;
    }
    if (!file) return;

    const runtime = inferRuntime(file.name);
    if (!runtime) return;

    isRunning = true;
    results = [];
    errorMessage = '';
    statusText = 'Reading file...';

    const modelBuffer = await file.arrayBuffer();

    for (const backend of selectedBackends) {
      if (!isRunning) break;
      statusText = `Running on ${backend}...`;
      const result = await runInWorker({
        modelSource: { kind: 'buffer', fileName: file.name, buffer: modelBuffer.slice(0) },
        runtime,
        backend,
        iterations,
        warmupRuns: 3,
        runtimeVersion: runtime === 'onnx' ? '1.21.0' : '1.1.0',
        onStatus: (s) => { statusText = s; },
      });
      results = [...results, result];
    }

    isRunning = false;
    statusText = 'Benchmark complete.';
  }

  function clearFile() {
    file = null;
    results = [];
    statusText = '';
    errorMessage = '';
  }

  async function signIn(provider: 'github' | 'google') {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    });
  }
</script>

<div class="custom-page">
  <header class="page-header">
    <h1>Custom Benchmark</h1>
    <p>Upload your own model file and benchmark it locally in the browser.</p>
  </header>

  {#if !file}
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
      <svg class="drop-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      <p class="drop-text">Drop a model file here or click to browse</p>
      <p class="drop-hint">Supports .onnx, .tflite, .litertlm</p>
    </div>
    <input
      id="file-input"
      type="file"
      accept=".onnx,.tflite,.litertlm"
      style="display:none"
      onchange={handleFileInput}
    />
  {:else}
    <div class="file-info">
      <div class="file-details">
        <span class="file-name">{file.name}</span>
        <span class="file-size">{formatSize(file.size)}</span>
        <span class="file-runtime badge">{inferRuntime(file.name)}</span>
      </div>
      <button class="btn-clear" onclick={clearFile}>Remove</button>
    </div>

    <section class="config-section">
      <BackendSelector bind:selected={selectedBackends} available={availableBackends} />

      <label class="iterations-field">
        <span class="field-label">Iterations</span>
        <input type="number" min="1" max="1000" bind:value={iterations} class="field-input" />
      </label>

      <div class="actions">
        {#if !isRunning}
          <button class="btn-primary" onclick={startBenchmark}>
            Run Benchmark
          </button>
        {:else}
          <button class="btn-stop" onclick={() => isRunning = false}>Stop</button>
        {/if}
      </div>
    </section>
  {/if}

  {#if errorMessage}
    <p class="error-text">{errorMessage}</p>
  {/if}

  {#if statusText}
    <section class="status-section">
      <p class="status-text">{statusText}</p>
    </section>
  {/if}

  {#if results.length > 0}
    <section class="results-section">
      <BenchmarkResults {results} />
    </section>
  {/if}

  {#if environment && file}
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

{#if showSignInModal}
  <div class="dialog-backdrop" role="presentation" onclick={() => showSignInModal = false}>
    <div
      class="dialog-panel"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="signin-title"
      onclick={(e) => e.stopPropagation()}
    >
      <h2 id="signin-title">Sign in to continue</h2>
      <p class="dialog-body">Running custom benchmarks requires a free account.</p>
      <div class="dialog-actions">
        <button class="btn-secondary" onclick={() => signIn('github')}>Sign in with GitHub</button>
        <button class="btn-secondary" onclick={() => signIn('google')}>Sign in with Google</button>
        <button class="btn-ghost" onclick={() => showSignInModal = false}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .custom-page {
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

  .dropzone {
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
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }

  .iterations-field {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .field-label {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .field-input {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    width: 80px;
    outline: none;
  }

  .field-input:focus { border-color: var(--color-focus-ring); }

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

  .error-text {
    color: var(--color-error);
    font-size: var(--text-sm);
    margin-bottom: var(--space-2);
  }

  .status-section {
    margin-bottom: var(--space-2);
  }

  .status-text {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .results-section {
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

  .dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: var(--z-overlay);
    display: grid;
    place-items: center;
  }

  .dialog-panel {
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-lg);
    padding: var(--space-3);
    max-width: 400px;
    width: calc(100% - var(--space-4));
    box-shadow: var(--shadow-overlay);
  }

  .dialog-panel h2 {
    font-size: var(--text-lg);
    font-weight: 300;
    margin-bottom: var(--space-1);
  }

  .dialog-body {
    margin-bottom: var(--space-2);
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .dialog-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .btn-secondary {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: 10px 20px;
    min-height: 40px;
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-primary);
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-secondary:hover { background: var(--color-accent-light); }

  .btn-ghost {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: 10px 20px;
    min-height: 40px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-ghost:hover { background: var(--color-surface-sunken); }
</style>
