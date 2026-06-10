<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { detectAvailableBackends, BACKENDS } from '$lib/engine/backends';
  import { detectEnvironment } from '$lib/engine/environment';
  import { fetchRuntimeVersions } from '$lib/engine/runtime-versions';
  import { runLlmInWorker, terminateLlmWorker } from '$lib/engine/worker/llm-pool';
  import { isRunning as isRunningStore } from '$lib/stores/benchmark';
  import BackendSelector from '$lib/components/BackendSelector.svelte';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import { autoTitle } from '$lib/utils/auto-title';
  import {
    classifyFiles,
    summarizeBundle,
    synthesizeLocalId,
    persistBundleToOpfs,
    type DtypeStatus,
    type BundleSummary,
  } from '$lib/engine/llm-local-bundle';
  import type { LLMBenchmarkResult, LLMBackend, EnvironmentInfo, Backend } from '$lib/engine/types';

  const TOKEN_OPTIONS = [32, 64, 128, 256, 512, 1024, 2048];
  const RUN_OPTIONS = [1, 3, 5, 10];

  let availableBackends = $state<Backend[]>(['wasm_1']);
  let selectedBackends = $state<Backend[]>(['webgpu']);
  function toL(b: Backend): LLMBackend {
    if (b === 'wasm_1' || b === 'wasm_n') return 'wasm';
    return b as LLMBackend;
  }
  const backend = $derived<LLMBackend>(
    selectedBackends.length > 0 ? toL(selectedBackends[selectedBackends.length - 1]) : 'wasm'
  );
  // Force single-select on the BackendSelector.
  $effect(() => {
    if (selectedBackends.length > 1) selectedBackends = [selectedBackends[selectedBackends.length - 1]];
  });

  let transformersVersion = $state('4.2.0');
  let transformersVersions = $state<string[]>([]);

  const DEFAULT_PROMPT = 'Describe the key differences between CPU, GPU, and NPU for AI inference in two paragraphs.';
  const SYNTHETIC_STUB = 'The quick brown fox jumps over the lazy dog. ';
  // Rough heuristic: ~1.3 BPE tokens per word (English). Used only for the UI preview;
  // the worker uses the loaded tokenizer for the actual exact-N truncation.
  function previewSyntheticPrompt(targetTokens: number): string {
    const wordsPerStub = SYNTHETIC_STUB.trim().split(/\s+/).length;
    const tokensPerStub = Math.max(1, Math.round(wordsPerStub * 1.3));
    const repeats = Math.max(1, Math.ceil(targetTokens / tokensPerStub));
    return SYNTHETIC_STUB.repeat(repeats);
  }
  let prompt = $state(DEFAULT_PROMPT);
  let promptTokens = $state(128);
  const promptPreview = $derived(promptTokens > 0 ? previewSyntheticPrompt(promptTokens) : prompt);
  let maxNewTokens = $state(128);
  let runs = $state(3);
  let environment = $state<EnvironmentInfo | null>(null);

  // ── Upload state ────────────────────────────────────────────────────────
  let dragOver = $state(false);
  let uploadedFiles = $state<Map<string, File>>(new Map());
  let bundleSummary = $state<BundleSummary | null>(null);
  let selectedDtype = $state<string>('');
  let modelLabel = $state<string>('');
  let errorMessage = $state('');

  // ── Run state ───────────────────────────────────────────────────────────
  type Phase = 'idle' | 'persisting' | 'compile' | 'generate' | 'done' | 'error';
  let phase = $state<Phase>('idle');
  let phaseError = $state<{ phase: string; message: string } | null>(null);
  let isRunning = $state(false);
  $effect(() => { isRunningStore.set(isRunning); });

  let persistLoaded = $state(0);
  let persistTotal = $state(0);
  let persistFile = $state('');

  let compileStartMs = $state(0);
  let compileElapsedMs = $state(0);
  let compileIntervalId: ReturnType<typeof setInterval> | null = null;

  let tokenStream = $state('');
  let liveTps = $state(0);
  let liveTtft = $state<number | null>(null);
  let currentRun = $state(0);
  let tokenCount = $state(0);

  // Results history. Each entry is one full benchmark run; the table renders
  // them all so the user can compare backends/dtypes within the same session.
  interface ResultEntry {
    model: string;
    dtype: string;
    backend: LLMBackend;
    runs: number;
    promptTokens: number;
    maxNewTokens: number;
    transformersVersion: string;
    result: LLMBenchmarkResult | null;
    error: string | null;
  }
  let results = $state<ResultEntry[]>([]);
  let runLogs = $state<string[]>([]);
  let logsEl = $state<HTMLDivElement | undefined>(undefined);
  let tokenStreamEl = $state<HTMLDivElement | undefined>(undefined);
  let logsCopied = $state(false);

  $effect(() => { if (logsEl && runLogs.length) logsEl.scrollTop = logsEl.scrollHeight; });
  $effect(() => {
    void tokenStream;
    const el = tokenStreamEl;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  });

  // ── Event handlers ──────────────────────────────────────────────────────
  function handleKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isRunning && bundleSummary && selectedDtype) {
      e.preventDefault();
      startBenchmark();
    } else if (e.key === 'Escape' && isRunning) {
      e.preventDefault();
      stopBenchmark();
    }
  }

  onMount(async () => {
    if (browser) window.addEventListener('keydown', handleKeydown);
    environment = await detectEnvironment();
    availableBackends = await detectAvailableBackends();
    try {
      const v = await fetchRuntimeVersions();
      const all = [...(v.transformers?.stable ?? []), ...(v.transformers?.dev ?? [])];
      transformersVersions = all;
      transformersVersion = v.transformers?.stable[0] ?? v.transformers?.dev[0] ?? '4.2.0';
    } catch {}
  });

  onDestroy(() => {
    if (browser) window.removeEventListener('keydown', handleKeydown);
    terminateLlmWorker();
    if (compileIntervalId) clearInterval(compileIntervalId);
  });

  // ── File handling ───────────────────────────────────────────────────────
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const dt = e.dataTransfer;
    if (!dt) return;
    // Prefer items[] for folder support; fall back to files[]
    const files: File[] = [];
    if (dt.items && dt.items.length > 0 && typeof (dt.items[0] as any).webkitGetAsEntry === 'function') {
      const entries: any[] = [];
      for (let i = 0; i < dt.items.length; i++) {
        const entry = dt.items[i].webkitGetAsEntry();
        if (entry) entries.push(entry);
      }
      collectEntries(entries).then(fs => acceptFiles(fs));
      return;
    }
    if (dt.files) for (let i = 0; i < dt.files.length; i++) files.push(dt.files[i]);
    acceptFiles(files);
  }

  // Recursively walk webkitEntries; FileSystemFileEntry → File via .file()
  async function collectEntries(entries: any[]): Promise<File[]> {
    const out: File[] = [];
    async function walk(entry: any, prefix: string) {
      if (entry.isFile) {
        const f: File = await new Promise((res, rej) => entry.file(res, rej));
        // Stitch a webkitRelativePath onto the file so canonicalPath sees it.
        Object.defineProperty(f, 'webkitRelativePath', { value: `${prefix}${entry.name}`, configurable: true });
        out.push(f);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const children: any[] = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const c of children) await walk(c, `${prefix}${entry.name}/`);
      }
    }
    for (const e of entries) await walk(e, '');
    return out;
  }

  function handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files) return;
    const files: File[] = [];
    for (let i = 0; i < input.files.length; i++) files.push(input.files[i]);
    acceptFiles(files);
  }

  function acceptFiles(files: File[]) {
    errorMessage = '';
    // Coming-soon hint for LLM-only formats — match /inference/custom's tone
    const llmOnly = files.find(f => f.name.toLowerCase().match(/\.(litertlm|task)$/));
    if (llmOnly && files.length === 1) {
      errorMessage = '.litertlm and .task LLM formats: coming soon. The runner currently supports ONNX bundles via Transformers.js.';
      return;
    }

    const classified = classifyFiles(files);
    if (classified.size === 0) {
      errorMessage = 'No recognized model files. Drop a folder containing config.json, tokenizer.json, tokenizer_config.json, and onnx/<model>_<dtype>.onnx (plus any .onnx_data sidecars).';
      return;
    }

    uploadedFiles = classified;
    bundleSummary = summarizeBundle(classified);

    // Derive a friendly label from the dropped files
    const sample = files[0];
    const rel = (sample as any).webkitRelativePath || sample.name;
    const root = rel.split('/').filter(Boolean)[0];
    modelLabel = root && root !== sample.name ? root : '(local model)';

    // Auto-pick the first available dtype
    const firstAvailable = bundleSummary.dtypes.find(d => d.available);
    selectedDtype = firstAvailable?.dtype ?? '';
  }

  function clearBundle() {
    uploadedFiles = new Map();
    bundleSummary = null;
    selectedDtype = '';
    modelLabel = '';
    errorMessage = '';
    results = [];
    runLogs = [];
    tokenStream = '';
    phase = 'idle';
    phaseError = null;
  }

  const selectedDtypeStatus = $derived<DtypeStatus | null>(
    bundleSummary?.dtypes.find(d => d.dtype === selectedDtype) ?? null
  );
  const canRun = $derived(
    !!bundleSummary && bundleSummary.hasRequired &&
    !!selectedDtypeStatus && selectedDtypeStatus.available &&
    selectedBackends.length > 0
  );

  // ── Run pipeline ────────────────────────────────────────────────────────
  function startCompileTimer() {
    compileStartMs = performance.now();
    compileIntervalId = setInterval(() => { compileElapsedMs = performance.now() - compileStartMs; }, 200);
  }
  function stopCompileTimer() {
    if (compileIntervalId) { clearInterval(compileIntervalId); compileIntervalId = null; }
  }

  async function startBenchmark() {
    if (!bundleSummary || !selectedDtypeStatus || !selectedDtypeStatus.available) return;
    if (selectedBackends.length === 0) return;
    isRunning = true;
    phase = 'persisting';
    phaseError = null;
    runLogs = [];
    tokenStream = '';

    const meta: ResultEntry = {
      model: modelLabel || '(local model)',
      dtype: selectedDtype,
      backend,
      runs,
      promptTokens,
      maxNewTokens,
      transformersVersion,
      result: null,
      error: null,
    };

    try {
      const hfModelId = await synthesizeLocalId(uploadedFiles, selectedDtype);
      runLogs = [...runLogs, `Persisting ${selectedDtypeStatus.requiredFiles.length} files to OPFS...`];
      persistTotal = selectedDtypeStatus.requiredFiles.reduce((s, p) => s + (uploadedFiles.get(p)?.size ?? 0), 0);
      persistLoaded = 0;
      await persistBundleToOpfs(hfModelId, uploadedFiles, selectedDtypeStatus, (loaded, total, file) => {
        persistLoaded = loaded;
        persistTotal = total;
        persistFile = file;
      });
      runLogs = [...runLogs, `Persisted bundle as ${hfModelId}`];

      phase = 'compile';
      const r = await runLlmInWorker({
        hfModelId,
        dtype: selectedDtype,
        runtime: 'transformers',
        backend,
        runtimeVersion: transformersVersion,
        prompt,
        promptTokens,
        maxNewTokens,
        runs,
        warmupRuns: 1,
        // Unwrap from the $state proxy — postMessage's structured clone can't handle Proxy.
        localFiles: [...selectedDtypeStatus.requiredFiles],
        onCompileStart:     ()           => { phase = 'compile'; startCompileTimer(); },
        onCompileDone:      (ms)         => { stopCompileTimer(); compileElapsedMs = ms; runLogs = [...runLogs, `Compiled in ${(ms / 1000).toFixed(1)}s`]; },
        onGenerateStart:    (ri)         => { phase = 'generate'; currentRun = ri + 1; tokenStream = ''; liveTtft = null; liveTps = 0; tokenCount = 0; },
        onToken:            (ri, tok, idx, el) => {
          tokenStream += tok;
          tokenCount = idx + 1;
          if (liveTtft !== null && tokenCount > 1) {
            const decodeElapsed = el - liveTtft;
            if (decodeElapsed > 0) liveTps = ((tokenCount - 1) / decodeElapsed) * 1000;
          }
        },
        onTtft:             (_ri, ttft)  => { liveTtft = ttft; },
        onRunDone:          (ri, r)      => { runLogs = [...runLogs, `Run ${ri + 1}: TTFT=${r.ttftMs.toFixed(0)}ms TPS=${r.tps.toFixed(1)}`]; },
        onLogs:             (ls)         => { runLogs = [...runLogs, ...ls]; },
      });
      results = [...results, { ...meta, result: r }];
      phase = 'done';
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      runLogs = [...runLogs, `Error: ${msg}`];
      phaseError = { phase, message: msg.replace(/^\[[^\]]+\]\s*/, '') };
      results = [...results, { ...meta, error: msg }];
      phase = 'error';
    } finally {
      stopCompileTimer();
      isRunning = false;
    }
  }

  // ── Result formatting & export (mirrors /llm/run) ───────────────────────
  function fmt(n: number | null | undefined, digits = 0, unit = '') {
    if (n == null || isNaN(n as number)) return '—';
    return (n as number).toFixed(digits) + unit;
  }
  function fmtAvgStd(avg: number | null | undefined, std: number | null | undefined, digits = 0, unit = '') {
    if (avg == null || isNaN(avg as number)) return '—';
    const a = (avg as number).toFixed(digits);
    if (std == null || isNaN(std as number) || std === 0) return `${a}${unit}`;
    return `${a} ± ${(std as number).toFixed(digits)}${unit}`;
  }

  const RESULT_HEADERS = ['model', 'prompt_tokens', 'output_tokens', 'dtype', 'backend', 'compilation_ms', 'ttft_ms', 'ttft_stddev_ms', 'tps', 'tps_stddev', 'throughput_tps', 'tpot_ms', 'decode_ms', 'e2e_ms', 'e2e_stddev_ms', 'runs', 'warmup_ttft_ms'] as const;
  function resultRows() {
    return results
      .filter(r => r.result || r.error)
      .map(r => {
        const base = { model: r.model, dtype: r.dtype, backend: r.backend };
        if (r.error) return { ...base, error: r.error };
        const x = r.result!;
        return {
          ...base,
          prompt_tokens: x.promptTokens,
          output_tokens: x.outputTokens,
          compilation_ms: x.compilationMs,
          ttft_ms: x.ttftMs,
          ttft_stddev_ms: x.ttftStddevMs,
          tps: x.tps,
          tps_stddev: x.tpsStddev,
          throughput_tps: x.e2eTps,
          tpot_ms: x.tpotMs,
          decode_ms: x.decodeMs,
          e2e_ms: x.e2eMs,
          e2e_stddev_ms: x.e2eStddevMs,
          runs: r.runs,
          warmup_ttft_ms: x.warmupTtftMs,
        };
      });
  }
  function buildJSON(): string {
    return JSON.stringify({
      generated_at: new Date().toISOString(),
      transformers_version: transformersVersion,
      environment,
      results: resultRows(),
    }, null, 2);
  }
  function buildCSV(): string {
    const rows = resultRows();
    const header = RESULT_HEADERS.join(',');
    const body = rows.map(r => RESULT_HEADERS.map(k => {
      const v = (r as any)[k];
      if (v == null) return '';
      const s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    return `${header}\n${body}`;
  }
  function buildMD(): string {
    const rows = resultRows();
    const lines: string[] = ['# Custom LLM Benchmark Results', ''];
    lines.push(`- Transformers.js: \`${transformersVersion}\``);
    if (environment) lines.push(`- Env: ${environment.browser} ${environment.browser_version} · ${environment.os} · ${environment.gpu}`);
    lines.push('');
    lines.push('| Model | Prompt | Output | dtype | Backend | Compilation | TTFT | TPS | Throughput | TPOT | Decode | E2E |');
    lines.push('|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|');
    for (const r of rows) {
      if ((r as any).error) {
        lines.push(`| ${r.model} |  |  | ${r.dtype} | ${r.backend} | error: ${(r as any).error} |  |  |  |  |  |  |`);
        continue;
      }
      const x = r as any;
      const std = (avg: number, s: number, d = 0, u = '') =>
        s > 0 ? `${avg.toFixed(d)} ± ${s.toFixed(d)}${u}` : `${avg.toFixed(d)}${u}`;
      lines.push(`| ${r.model} | ${x.prompt_tokens} | ${x.output_tokens} | ${r.dtype} | ${r.backend} | ${x.compilation_ms.toFixed(0)} ms | ${std(x.ttft_ms, x.ttft_stddev_ms, 0, ' ms')} | ${std(x.tps, x.tps_stddev, 1, ' tok/s')} | ${x.throughput_tps.toFixed(1)} tok/s | ${x.tpot_ms.toFixed(1)} ms | ${x.decode_ms.toFixed(0)} ms | ${std(x.e2e_ms, x.e2e_stddev_ms, 0, ' ms')} |`);
    }
    return lines.join('\n');
  }
  function downloadFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  function timestamp() {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }
  let copiedFlag = $state<'md' | 'json' | 'csv' | null>(null);
  async function copyResults(kind: 'md' | 'json' | 'csv') {
    const text = kind === 'md' ? buildMD() : kind === 'json' ? buildJSON() : buildCSV();
    await navigator.clipboard.writeText(text);
    copiedFlag = kind;
    setTimeout(() => { if (copiedFlag === kind) copiedFlag = null; }, 2000);
  }
  function downloadResults(kind: 'md' | 'json' | 'csv') {
    const ts = timestamp();
    if (kind === 'md')   downloadFile(buildMD(),   `llm-custom-bench-${ts}.md`,   'text/markdown');
    if (kind === 'json') downloadFile(buildJSON(), `llm-custom-bench-${ts}.json`, 'application/json');
    if (kind === 'csv')  downloadFile(buildCSV(),  `llm-custom-bench-${ts}.csv`,  'text/csv');
  }

  function stopBenchmark() {
    terminateLlmWorker();
    stopCompileTimer();
    isRunning = false;
    phase = 'idle';
  }

  function fmtPersistPercent(): number {
    if (persistTotal === 0) return 0;
    return Math.round((persistLoaded / persistTotal) * 100);
  }
</script>

<div class="custom-page" class:run-page-running={isRunning}>
  {#if isRunning}
    <div class="running-center running-center-active">
      <section class="status-section">
        <div class="status-row status-row-top">
          <span class="status-model" title={modelLabel}>{modelLabel} · {selectedDtype}</span>
          <span class="progress-count">
            {#if phase === 'generate'}Run {currentRun}/{runs}{/if}
          </span>
        </div>

        {#if phase === 'persisting'}
          <p class="status-text">Persisting files to local cache…</p>
          <div class="progress-bar-slot">
            <ProgressBar percent={fmtPersistPercent()} label="Writing" loadedBytes={persistLoaded} totalBytes={persistTotal} />
          </div>
          {#if persistFile}
            <p class="status-text file-hint">{persistFile}</p>
          {/if}
        {/if}

        {#if phase === 'compile'}
          <p class="status-text">Compiling model… {(compileElapsedMs / 1000).toFixed(1)}s</p>
          <div class="progress-bar-slot">
            <div class="indeterminate-bar"><div class="indeterminate-inner"></div></div>
          </div>
        {/if}

        {#if phase === 'generate'}
          <div class="status-row">
            <span class="status-text">Generating…</span>
            <span class="status-badges">
              {#if liveTtft !== null}
                <span class="ttft-badge">TTFT {liveTtft.toFixed(0)} ms</span>
              {/if}
              {#if liveTps > 0}
                <span class="tps-live">{liveTps.toFixed(1)} tok/s</span>
              {/if}
            </span>
          </div>
          <div class="progress-bar-slot">
            <ProgressBar
              percent={Math.min(100, (tokenCount / maxNewTokens) * 100)}
              label="Generating"
            />
          </div>
          <div class="token-stream" bind:this={tokenStreamEl}>{tokenStream}</div>
        {/if}
      </section>

      <div class="run-controls">
        <button class="btn-stop" onclick={stopBenchmark} title="Esc">Stop <kbd class="kbd-hint">Esc</kbd></button>
      </div>
    </div>
  {:else if !bundleSummary}
    <header class="page-header">
      <h1>Custom LLM Benchmark</h1>
      <p>Upload a model bundle (ONNX + tokenizer/config) and benchmark it locally with Transformers.js.</p>
    </header>

    <div
      class="dropzone"
      class:drag-over={dragOver}
      role="button"
      tabindex="0"
      ondragover={(e) => { e.preventDefault(); dragOver = true; }}
      ondragleave={() => dragOver = false}
      ondrop={handleDrop}
      onclick={() => document.getElementById('llm-file-input')?.click()}
      onkeydown={(e) => { if (e.key === 'Enter') document.getElementById('llm-file-input')?.click(); }}
    >
      <svg class="drop-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      <p class="drop-text">Drop a model folder here or <span class="drop-browse">click to browse</span></p>
      <p class="drop-hint">Required: <code>config.json</code>, <code>tokenizer.json</code>, <code>tokenizer_config.json</code>, plus <code>onnx/&lt;model&gt;_&lt;dtype&gt;.onnx</code> (and any <code>.onnx_data</code> sidecars).</p>
      <p class="drop-hint drop-hint-todo">.litertlm, .task LLM formats: coming soon</p>
    </div>
    <input
      id="llm-file-input"
      type="file"
      multiple
      webkitdirectory
      style="display:none"
      onchange={handleFileInput}
    />

    <p class="cross-link-hint">
      Benchmarking a classical model (.onnx / .tflite)? <a href="/inference/custom">Use the inference custom runner →</a>
    </p>

    {#if errorMessage}
      <p class="error-text">{errorMessage}</p>
    {/if}
  {:else}
    <header class="page-header">
      <h1>Custom LLM Benchmark</h1>
      <p>{modelLabel} · {uploadedFiles.size} files</p>
    </header>

    <section class="run-layout">
      <aside class="run-sidebar" use:autoTitle>
        <div class="sb-section">
          <div class="sb-section-head"><span class="sb-section-title">Model</span></div>
          <div class="sb-row">
            <span class="sb-label">Data Type<span class="req-marker" title="Pick the dtype you want to benchmark — different dtypes have different speed/memory tradeoffs.">*</span></span>
            <select class="sb-input" bind:value={selectedDtype}>
              {#each bundleSummary.dtypes as d}
                <option
                  value={d.dtype}
                  disabled={!d.available}
                  title={d.available ? '' : d.reason}
                >{d.dtype}{d.available ? '' : ' — unavailable'}</option>
              {/each}
            </select>
          </div>
          {#if selectedDtypeStatus && !selectedDtypeStatus.available}
            <p class="sb-hint sb-hint-warn">{selectedDtypeStatus.reason}</p>
          {/if}
        </div>

        <div class="sb-section">
          <div class="sb-section-head"><span class="sb-section-title">JS ML Framework</span></div>
          <div class="sb-row">
            <span class="sb-label">Transformers.js</span>
            <select class="sb-input" bind:value={transformersVersion}>
              {#each transformersVersions as v}<option value={v}>{v}</option>{/each}
              {#if !transformersVersions.includes(transformersVersion)}
                <option value={transformersVersion}>{transformersVersion}</option>
              {/if}
            </select>
          </div>
        </div>

        <div class="sb-section">
          <div class="sb-section-head"><span class="sb-section-title">Test</span></div>
          <BackendSelector
            bind:selected={selectedBackends}
            available={availableBackends.filter(b => b !== 'wasm_n')}
            backends={BACKENDS.filter(b => b.id !== 'wasm_n')}
          />
          <div class="sb-row">
            <span class="sb-label" title="Prompt Tokens — number of input tokens fed to the model.">Prompt</span>
            <select class="sb-input" bind:value={promptTokens}>
              <option value={0}>Custom</option>
              {#each TOKEN_OPTIONS as t}<option value={t}>{t}</option>{/each}
            </select>
          </div>
          <div class="sb-row">
            <span class="sb-label" title="Max New Tokens — upper bound on generated tokens.">Max New</span>
            <select class="sb-input" bind:value={maxNewTokens}>
              {#each TOKEN_OPTIONS as t}<option value={t}>{t}</option>{/each}
            </select>
          </div>
          <div class="sb-row sb-row-stack">
            <span class="sb-label">Runs</span>
            <div class="segment-group">
              {#each RUN_OPTIONS as opt}
                <button class="segment-btn" class:active={runs === opt} onclick={() => (runs = opt)}>{opt}</button>
              {/each}
            </div>
          </div>
        </div>

        <div class="actions">
          <button class="btn-primary" onclick={startBenchmark} disabled={!canRun} title="Ctrl+Enter">
            Run Benchmark <kbd class="kbd-hint">Ctrl+Enter</kbd>
          </button>
          <button class="btn-ghost" onclick={clearBundle}>Clear bundle</button>
        </div>
      </aside>

      <div class="run-main">
        {#if results.some(r => r.result || r.error)}
          <div class="zone">
            <div class="zone-label">
              Results
              <span class="count-badge">{results.filter(r => r.result || r.error).length}</span>
              <div class="zone-label-actions results-export-row">
                <div class="export-group">
                  <span class="export-group-icon" title="Copy results">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  </span>
                  <button class="export-group-btn" class:active={copiedFlag === 'md'}   onclick={() => copyResults('md')}   title="Copy results as Markdown">{copiedFlag === 'md' ? 'Copied!' : 'MD'}</button>
                  <button class="export-group-btn" class:active={copiedFlag === 'json'} onclick={() => copyResults('json')} title="Copy results as JSON">{copiedFlag === 'json' ? 'Copied!' : 'JSON'}</button>
                  <button class="export-group-btn" class:active={copiedFlag === 'csv'}  onclick={() => copyResults('csv')}  title="Copy results as CSV">{copiedFlag === 'csv' ? 'Copied!' : 'CSV'}</button>
                </div>
                <div class="export-group">
                  <span class="export-group-icon" title="Download results">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </span>
                  <button class="export-group-btn" onclick={() => downloadResults('md')}   title="Download results as Markdown">MD</button>
                  <button class="export-group-btn" onclick={() => downloadResults('json')} title="Download results as JSON">JSON</button>
                  <button class="export-group-btn" onclick={() => downloadResults('csv')}  title="Download results as CSV">CSV</button>
                </div>
              </div>
            </div>
            <div class="results-table-wrap">
              <table class="results-table">
                <thead>
                  <tr>
                    <th class="col-model">Model</th>
                    <th class="col-num" title="Prompt Tokens (prompt_tokens) — number of input tokens fed to the model.">Prompt</th>
                    <th class="col-num" title="Output Tokens (output_tokens) — actual tokens generated. Equals Max New unless EOS stopped generation early.">Output</th>
                    <th>dtype</th>
                    <th>Backend</th>
                    <th class="col-num" title="Compilation time (ms)">Compilation</th>
                    <th class="col-num" title="Time To First Token (ms)">TTFT</th>
                    <th class="col-num" title="Tokens Per Second — decode-phase rate (tokens/s)">TPS</th>
                    <th class="col-num" title="Throughput — end-to-end token rate (tokens/s)">Throughput</th>
                    <th class="col-num" title="Time Per Output Token (ms)">TPOT</th>
                    <th class="col-num" title="Decode time (ms)">Decode</th>
                    <th class="col-num" title="End-to-end time (ms)">E2E</th>
                  </tr>
                </thead>
                <tbody>
                  {#each results as r}
                    {#if r.result || r.error}
                      <tr class:result-row-error={!!r.error}>
                        <td class="col-model" title={r.model}>{r.model}</td>
                        {#if r.result}
                          <td class="col-num">{r.result.promptTokens}</td>
                          <td class="col-num">{r.result.outputTokens}</td>
                        {:else}
                          <td class="col-num">—</td>
                          <td class="col-num">—</td>
                        {/if}
                        <td><span class="dtype-chip" data-dtype={r.dtype}>{r.dtype}</span></td>
                        <td>{r.backend}</td>
                        {#if r.result}
                          <td class="col-num">{fmt(r.result.compilationMs, 0, ' ms')}</td>
                          <td class="col-num">{fmtAvgStd(r.result.ttftMs, r.result.ttftStddevMs, 0, ' ms')}</td>
                          <td class="col-num">{fmtAvgStd(r.result.tps, r.result.tpsStddev, 1, ' tok/s')}</td>
                          <td class="col-num">{fmt(r.result.e2eTps, 1, ' tok/s')}</td>
                          <td class="col-num">{fmt(r.result.tpotMs, 1, ' ms')}</td>
                          <td class="col-num">{fmt(r.result.decodeMs, 0, ' ms')}</td>
                          <td class="col-num">{fmtAvgStd(r.result.e2eMs, r.result.e2eStddevMs, 0, ' ms')}</td>
                        {:else}
                          <td class="col-error-msg" colspan="7">{r.error}</td>
                        {/if}
                      </tr>
                    {/if}
                  {/each}
                </tbody>
              </table>
            </div>
            <p class="results-footer">TTFT/TPS/E2E shown as avg ± stddev across timed runs.</p>
          </div>
        {/if}

        {#if phaseError}
          <p class="error-text">[{phaseError.phase}] {phaseError.message}</p>
        {/if}

        {#if runLogs.length > 0}
          <div class="zone">
            <div class="zone-label">
              Logs
              <span class="count-badge">{runLogs.length}</span>
              <div class="zone-label-actions">
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
                  }}>
                    {logsCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
            <div class="logs-container" bind:this={logsEl}>
              {#each runLogs as log}<div class="log-line">{log}</div>{/each}
            </div>
          </div>
        {/if}

        <div class="sb-section-head"><span class="sb-section-title">Bundle</span></div>
        <div class="bundle-summary">
          <ul class="summary-list">
            {#each ['config.json', 'tokenizer.json', 'tokenizer_config.json'] as req}
              <li class="summary-item" class:summary-ok={uploadedFiles.has(req)} class:summary-bad={!uploadedFiles.has(req)}>
                <span class="summary-status">{uploadedFiles.has(req) ? '✓' : '✗'}</span>
                <code>{req}</code>
                <span class="summary-tag">required</span>
              </li>
            {/each}
            {#each bundleSummary.presentOptional as opt}
              <li class="summary-item summary-ok">
                <span class="summary-status">✓</span>
                <code>{opt}</code>
                <span class="summary-tag summary-tag-optional">optional</span>
              </li>
            {/each}
            {#each bundleSummary.missingOptional as opt}
              <li class="summary-item summary-skip">
                <span class="summary-status">—</span>
                <code>{opt}</code>
                <span class="summary-tag summary-tag-optional">optional · not present</span>
              </li>
            {/each}
            {#if selectedDtypeStatus && selectedDtypeStatus.available}
              <li class="summary-section-divider"></li>
              {#each selectedDtypeStatus.requiredFiles.filter(p => p.startsWith('onnx/')) as path}
                <li class="summary-item summary-ok">
                  <span class="summary-status">✓</span>
                  <code>{path}</code>
                  <span class="summary-tag">{(uploadedFiles.get(path)!.size / 1_048_576).toFixed(1)} MB</span>
                </li>
              {/each}
            {/if}
          </ul>
        </div>

        <div class="sb-section-head prompt-head">
          <span class="sb-section-title">
            Prompt
            {#if promptTokens > 0}
              <span class="prompt-disabled-badge" title="Synthetic prompt sized to ~{promptTokens} tokens">benchmark · ~{promptTokens} tok</span>
            {/if}
          </span>
        </div>
        <div class="prompt-box">
          {#if promptTokens > 0}
            <textarea
              class="prompt-input"
              rows="3"
              value={promptPreview}
              readonly
              title={`Synthetic ${promptTokens}-token prompt — preview only. The worker re-tokenizes with the model's actual tokenizer to get exactly ${promptTokens} tokens.`}
            ></textarea>
            <button
              type="button"
              class="prompt-switch-btn"
              onclick={() => { promptTokens = 0; }}
              title="Switch Prompt tokens to Custom and edit your own prompt"
            >Switch to Custom to ask a real question →</button>
            <p class="prompt-hint">
              Preview shows the synthetic stub repeated to ~{promptTokens} tokens; the worker re-truncates to exactly {promptTokens} using the model's tokenizer. Output text is meaningless by design — only TTFT, TPS, and decode time are the measurements that matter.
            </p>
          {:else}
            <textarea
              class="prompt-input"
              rows="3"
              bind:value={prompt}
            ></textarea>
            <button
              type="button"
              class="prompt-switch-btn"
              onclick={() => { promptTokens = 128; }}
              title="Switch back to a fixed-length synthetic prompt for reproducibility"
            >← Switch to fixed token length</button>
            <p class="prompt-hint">
              Custom mode: your prompt is used verbatim. Max New is an <strong>upper bound</strong> — the model may stop earlier if it emits an end-of-sequence token, so the Output count (and TPS / decode time) can be noisy at small token counts. Not directly comparable to other users' runs.
            </p>
          {/if}
        </div>

      </div>
    </section>
  {/if}
</div>

<style>
  .custom-page {
    max-width: 100%;
  }

  .page-header {
    margin-bottom: var(--space-3);
  }
  .page-header h1 {
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text-primary);
    margin-bottom: var(--space-half);
  }
  .page-header p {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  /* Dropzone */
  .dropzone {
    width: 100%;
    max-width: 560px;
    min-height: 200px;
    margin: 0 auto;
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
  .drop-browse { color: var(--color-primary); }
  .drop-hint {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin-top: 4px;
    line-height: 1.5;
  }
  .drop-hint code {
    font-family: var(--font-mono);
    background: var(--color-surface-sunken);
    padding: 1px 4px;
    border-radius: var(--radius-sm);
    font-size: 11px;
  }
  .drop-hint-todo { color: var(--color-warning, #d97706); }

  .cross-link-hint {
    max-width: 560px;
    margin: var(--space-2) auto 0;
    text-align: center;
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }
  .cross-link-hint a {
    color: var(--color-primary);
    text-decoration: none;
  }
  .cross-link-hint a:hover {
    text-decoration: underline;
  }

  .error-text {
    color: var(--color-error);
    font-size: var(--text-sm);
    text-align: center;
    margin-top: var(--space-2);
  }

  /* Sidebar layout */
  .run-layout {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: var(--space-3);
    align-items: start;
  }
  .run-sidebar {
    position: sticky;
    top: var(--space-2);
    align-self: start;
    display: flex;
    flex-direction: column;
    gap: 0;
    max-height: calc(100dvh - 80px);
    overflow-y: auto;
    padding-right: var(--space-1);
  }
  .run-sidebar::-webkit-scrollbar { width: 4px; }
  .run-sidebar::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 2px;
  }
  .run-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }

  .sb-section {
    margin-top: 5px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .sb-section:first-of-type {
    margin-top: 0;
    padding-top: 0;
  }
  .sb-section-head { margin-bottom: 4px; }
  .sb-section-title {
    font-family: var(--font-ui);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
  }
  .sb-row {
    display: grid;
    grid-template-columns: 88px 1fr;
    align-items: center;
    gap: 8px;
    min-height: 28px;
  }
  .sb-row-stack {
    grid-template-columns: 88px 1fr;
    align-items: center;
  }
  .sb-label {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .req-marker {
    color: var(--color-warning, #d97706);
    font-weight: 700;
    margin-left: 2px;
    cursor: help;
  }
  select.sb-input {
    width: 100%;
    height: 28px;
    min-width: 0;
    padding: 0 8px;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    cursor: pointer;
    color: var(--color-text-muted);
  }
  .sb-hint {
    font-size: 11px;
    color: var(--color-text-muted);
    line-height: 1.4;
    padding: 4px 0;
  }
  .sb-hint-warn { color: var(--color-warning, #d97706); }

  .run-sidebar :global(.backend-selector) { gap: 4px; }
  .run-sidebar :global(.backend-selector .config-label) {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
    color: var(--color-text-secondary);
  }
  .run-sidebar :global(.segment-btn) {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    height: 28px;
  }

  .segment-group {
    display: flex;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    overflow: hidden;
  }
  .segment-btn {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    height: 28px;
    flex: 1;
    background: none;
    color: var(--color-text-secondary);
    border: none;
    border-left: 1px solid var(--color-border);
    cursor: pointer;
    transition: background var(--transition-base), color var(--transition-base);
  }
  .segment-btn:first-child { border-left: none; }
  .segment-btn:hover { background: var(--color-nav-item-hover); color: var(--color-text-primary); }
  .segment-btn.active { background: var(--color-accent-light); color: var(--color-primary); }

  /* Actions */
  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
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
    transition: background var(--transition-base);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .btn-primary:hover:not(:disabled) { background: var(--color-primary-hover); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-ghost {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
  }
  .btn-ghost:hover { border-color: var(--color-primary); color: var(--color-primary); }
  .btn-stop {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: 6px 12px;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: border-color var(--transition-base), color var(--transition-base);
  }
  .btn-stop:hover {
    border-color: var(--color-error);
    color: var(--color-error);
  }
  .btn-stop:hover .kbd-hint {
    border-color: var(--color-error);
    color: var(--color-error);
  }
  .kbd-hint {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    padding: 0 4px;
  }
  .btn-stop .kbd-hint {
    display: inline-flex;
    align-items: center;
    padding: 0 5px;
    margin: 0;
    font-family: var(--font-mono);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    font-size: 10px;
  }

  /* Bundle summary */
  .bundle-summary {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    padding: var(--space-2);
    background: var(--color-surface);
  }
  .summary-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 2px 8px;
  }
  .summary-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    padding: 2px 4px;
    border-radius: var(--radius-sm);
    min-width: 0;
  }
  .summary-status { width: 14px; text-align: center; flex-shrink: 0; }
  .summary-ok { color: var(--color-text-secondary); }
  .summary-ok .summary-status { color: #16a34a; }
  .summary-bad { color: var(--color-error); }
  .summary-bad .summary-status { color: var(--color-error); }
  .summary-skip { color: var(--color-text-muted); }
  .summary-skip .summary-status { color: var(--color-text-muted); }
  .summary-item code {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: none;
    padding: 0;
    font-family: var(--font-mono);
  }
  .summary-tag {
    font-family: var(--font-ui);
    font-size: 10px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex-shrink: 0;
  }
  .summary-tag-optional { opacity: 0.7; }
  .summary-section-divider {
    grid-column: 1 / -1;
    height: 1px;
    background: var(--color-border);
    margin: 4px 0;
  }

  /* Prompt */
  .prompt-head .sb-section-title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .prompt-box {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .prompt-input {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    padding: 6px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
  }
  .prompt-input:focus-visible { border-color: var(--color-focus-ring); outline: none; }
  .prompt-input[readonly] {
    background: var(--color-surface-sunken);
    color: var(--color-text-muted);
    cursor: not-allowed;
  }
  .prompt-switch-btn {
    align-self: flex-start;
    background: none;
    border: none;
    padding: 0;
    font-family: var(--font-ui);
    font-size: 11px;
    color: var(--color-primary);
    cursor: pointer;
  }
  .prompt-switch-btn:hover { text-decoration: underline; }
  .prompt-disabled-badge {
    display: inline-flex;
    align-items: center;
    padding: 1px 5px;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-primary);
    background: var(--color-primary-lightest, var(--color-accent-light));
    border-radius: 3px;
  }
  .prompt-hint {
    font-size: 11px;
    color: var(--color-text-muted);
    margin: 0;
    line-height: 1.5;
  }

  /* Results table (mirrors /llm/run) */
  .results-export-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .results-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
  }
  .results-table-wrap::-webkit-scrollbar { width: 3px; height: 1px; }
  .results-table-wrap::-webkit-scrollbar-button { width: 0; height: 0; display: none; }
  .results-table-wrap::-webkit-scrollbar-track { background: transparent; }
  .results-table-wrap::-webkit-scrollbar-thumb {
    background-color: var(--color-border-strong);
    border-radius: 3px;
  }
  .zone:hover .results-table-wrap::-webkit-scrollbar-thumb {
    background-color: var(--color-primary);
  }
  .results-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-xs);
  }
  .results-table thead th {
    font-family: var(--font-ui);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted);
    text-align: center;
    padding: 6px 10px;
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
  }
  .results-table tbody td {
    font-family: var(--font-mono);
    color: var(--color-text-primary);
    text-align: center;
    padding: 6px 10px;
    border-bottom: 1px solid var(--color-border);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .results-table tbody tr:last-child td { border-bottom: none; }
  .results-table tbody tr:hover td { background: var(--color-surface-raised); }
  .results-table .col-model {
    max-width: 320px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .results-table tr.result-row-error td { color: var(--color-error); opacity: 0.85; }
  .col-error-msg {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-error);
  }
  .results-footer {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-text-muted);
    margin: 0;
  }

  /* Running view — mirrors /llm/run */
  .run-page-running {
    min-height: calc(100dvh - 56px);
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .running-center { display: contents; }
  .running-center-active {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
  }

  .status-section {
    width: 90vw;
    max-width: 760px;
    margin-inline: auto;
    display: flex;
    flex-direction: column;
    padding: var(--space-3) var(--space-6);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
  }

  .status-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    margin: var(--space-2) 0;
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

  .status-text {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 0;
  }
  .file-hint { color: var(--color-text-muted); opacity: 0.75; }

  .progress-bar-slot { margin: 4px 0; }

  .indeterminate-bar {
    height: 1px;
    border-radius: 2px;
    background: var(--color-surface-sunken);
    overflow: hidden;
    margin: 8px 0;
  }
  .indeterminate-inner {
    height: 100%;
    width: 40%;
    background: var(--color-primary);
    border-radius: 2px;
    animation: slide 1.4s ease-in-out infinite;
  }
  @keyframes slide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
  }

  .status-badges {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .ttft-badge {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    background: var(--color-accent-light);
    color: var(--color-primary);
  }
  .tps-live {
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
    color: var(--color-primary);
  }

  .token-stream {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-text-muted);
    height: 120px;
    overflow-y: auto;
    scroll-behavior: smooth;
    padding: var(--space-1);
    border-top: 1px solid var(--color-border);
    background: var(--color-surface);
    white-space: pre-wrap;
    word-break: break-word;
    margin-top: var(--space-1);
  }
  .token-stream::-webkit-scrollbar { width: 1px; height: 3px; }
  .token-stream::-webkit-scrollbar-button { width: 0; height: 0; display: none; }
  .token-stream::-webkit-scrollbar-track { background: transparent; }
  .token-stream::-webkit-scrollbar-thumb {
    background-color: var(--color-border-strong);
    border-radius: 3px;
  }

  .run-controls {
    display: flex;
    justify-content: center;
    margin-top: var(--space-2);
    margin-bottom: var(--space-3);
  }

  /* Logs (mirrors /llm/run) */
  .zone { display: flex; flex-direction: column; gap: var(--space-1); }
  .zone-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-ui);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
  }
  .zone-label-actions { margin-left: auto; }

  .count-badge {
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
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
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
  .export-group-btn:first-of-type { border-left: none; }
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

  @media (max-width: 1100px) {
    .summary-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 768px) {
    .run-layout { grid-template-columns: 1fr; }
    .run-sidebar { position: static; max-height: none; }
    .summary-list { grid-template-columns: 1fr; }
  }
</style>
