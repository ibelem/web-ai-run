<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { replaceState, beforeNavigate } from '$app/navigation';
  import { createClient } from '$lib/supabase/client';
  import { detectEnvironment } from '$lib/engine/environment';
  import { detectAvailableBackends, BACKENDS, getBackendLabel } from '$lib/engine/backends';
  import { fetchRuntimeVersions } from '$lib/engine/runtime-versions';
  import { runLlmInWorker, terminateLlmWorker } from '$lib/engine/worker/llm-pool';
  import { isRunning as isRunningStore } from '$lib/stores/benchmark';
  import { auth, isAuthenticated } from '$lib/stores/auth';
  import { isAtLeast } from '$lib/types/roles';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import BackendSelector from '$lib/components/BackendSelector.svelte';
  import { CPU_MODELS } from '$lib/data/cpu-models';
  import { OS_MODELS } from '$lib/data/os-models';
  import { autoTitle } from '$lib/utils/auto-title';
  import type { LLMBenchmarkResult, LLMRecipeModel, LLMBackend, EnvironmentInfo } from '$lib/engine/types';
  import type { Backend } from '$lib/engine/types';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // ── Hash-based URL state (shareable links) ───────────────────────────────
  const TOKEN_OPTIONS = [32, 64, 128, 256, 512, 1024, 2048];
  const RUN_OPTIONS = [1, 3, 5, 10];

  interface ParsedHash {
    models: LLMRecipeModel[];
    backends: LLMBackend[];
    runs: number;
    promptTokens: number;
    maxNewTokens: number;
    tjs: string;
    webnnEp: string;
    cpu: string;
    os: string;
    gpuDrv: string;
    npuDrv: string;
    upload: boolean;
  }

  function parseHash(): ParsedHash {
    const empty: ParsedHash = { models: [], backends: ['webgpu'], runs: 3, promptTokens: 128, maxNewTokens: 128, tjs: '', webnnEp: '', cpu: '', os: '', gpuDrv: '', npuDrv: '', upload: false };
    if (!browser) return empty;
    const h = new URLSearchParams(location.hash.slice(1));
    const rawModels = (h.get('llm') ?? '')
      .split(',')
      .filter(Boolean)
      .map(seg => {
        const [hf_model_id, data_type] = seg.split('|');
        return hf_model_id && data_type ? { hf_model_id, data_type } as LLMRecipeModel : null;
      })
      .filter(Boolean) as LLMRecipeModel[];
    // Accept `backends=a,b,c` (preferred) or `backend=a` (legacy single).
    const validBackends: LLMBackend[] = ['wasm', 'webgpu', 'webnn_cpu', 'webnn_gpu', 'webnn_npu'];
    const rawBackends = (h.get('backends') ?? h.get('backend') ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean) as LLMBackend[];
    const filtered = rawBackends.filter(b => validBackends.includes(b));
    const parsedBackends: LLMBackend[] = filtered.length ? Array.from(new Set(filtered)) : ['webgpu'];
    const rawRuns = parseInt(h.get('runs') ?? '', 10);
    const parsedRuns = RUN_OPTIONS.includes(rawRuns) ? rawRuns : 3;
    const parseTokenOpt = (s: string | null, fallback: number, allowZero = false) => {
      const n = parseInt(s ?? '', 10);
      if (allowZero && n === 0) return 0;
      return TOKEN_OPTIONS.includes(n) ? n : fallback;
    };
    const parsedIn  = parseTokenOpt(h.get('in'),  128, true);
    const parsedOut = parseTokenOpt(h.get('out') ?? h.get('tokens'), 128);
    return {
      models: rawModels,
      backends: parsedBackends,
      runs: parsedRuns,
      promptTokens: parsedIn,
      maxNewTokens: parsedOut,
      tjs: h.get('tjs') ?? '',
      webnnEp: h.get('webnn_ep') ?? '',
      cpu: h.get('cpu') ?? '',
      os: h.get('os') ?? '',
      gpuDrv: h.get('gpu_drv') ?? '',
      npuDrv: h.get('npu_drv') ?? '',
      upload: h.get('upload') === '1',
    };
  }

  function writeHash() {
    if (!browser || isRunning) return;
    const params = new URLSearchParams();
    if (models.length) {
      params.set('llm', models.map(m => `${m.hf_model_id}|${m.data_type}`).join(','));
    }
    params.set('backends', selectedBackends.map(b => toL(b)).join(','));
    params.set('runs', String(runs));
    params.set('in', String(promptTokens));
    params.set('out', String(maxNewTokens));
    if (transformersVersion) params.set('tjs', transformersVersion);
    if (anyWebnn && webnnEp) params.set('webnn_ep', webnnEp);
    if (cpuModel.trim()) params.set('cpu', cpuModel.trim());
    if (osModel.trim()) params.set('os', osModel.trim());
    if (gpuDriverVersion.trim()) params.set('gpu_drv', gpuDriverVersion.trim());
    if (npuDriverVersion.trim()) params.set('npu_drv', npuDriverVersion.trim());
    if (saveResults) params.set('upload', '1');
    try {
      replaceState(`#${params}`, {});
    } catch {
      // Router may not be ready yet during initial hydration; the next state
      // change will trigger writeHash() again once the router is available.
    }
  }

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

  const DEFAULT_PROMPT = 'Describe the key differences between CPU, GPU, and NPU for AI inference in two paragraphs.';
  const SYNTHETIC_STUB = 'The quick brown fox jumps over the lazy dog. ';
  // Rough heuristic: ~1.3 BPE tokens per word (English). Used only for a UI preview;
  // the worker uses the loaded tokenizer for the actual exact-N truncation.
  function previewSyntheticPrompt(targetTokens: number): string {
    const wordsPerStub = SYNTHETIC_STUB.trim().split(/\s+/).length;
    const tokensPerStub = Math.max(1, Math.round(wordsPerStub * 1.3));
    const repeats = Math.max(1, Math.ceil(targetTokens / tokensPerStub));
    return SYNTHETIC_STUB.repeat(repeats);
  }
  const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000];

  let availableBackends = $state<Backend[]>(['wasm_1']);
  let selectedBackends = $state<Backend[]>(['webgpu']);

  // Map inference Backend to LLMBackend (wasm_1/wasm_n → 'wasm')
  function toL(b: Backend): LLMBackend {
    if (b === 'wasm_1' || b === 'wasm_n') return 'wasm';
    return b as LLMBackend;
  }

  // Multi-backend: each (model, backend) pair is one run, executed sequentially.
  // The result rows below carry their own backend field so the table can show
  // each row's actual backend.
  const llmBackends = $derived<LLMBackend[]>(
    selectedBackends.length > 0
      ? Array.from(new Set(selectedBackends.map(toL)))
      : ['wasm']
  );
  const anyWebnn = $derived(llmBackends.some(b => b.startsWith('webnn_')));
  const anyWebnnNpu = $derived(llmBackends.includes('webnn_npu'));
  let transformersVersion = $state('4.2.0');
  let transformersVersions = $state<string[]>([]);
  let prompt = $state(DEFAULT_PROMPT);
  let promptTokens = $state(128);
  const promptPreview = $derived(promptTokens > 0 ? previewSyntheticPrompt(promptTokens) : prompt);
  let maxNewTokens = $state(128);
  let runs = $state(3);
  let saveResults = $state(false);

  // Hardware / software env fields — required when saving
  let cpuModel = $state('');
  let osModel = $state('');
  let gpuDriverVersion = $state('');
  let npuDriverVersion = $state('');
  let webnnEp = $state('');
  const webnnEpRequired = $derived(
    saveResults &&
    anyWebnn &&
    isAtLeast($auth.role ?? 'anonymous', 'intel') &&
    !webnnEp
  );

  // Shared hardware/env prefs key — same shape as /run's RUN_PREFS_KEY so
  // values entered on either page pre-fill the other. /run-llm only writes
  // fields it owns (no ort/litert) and merges the rest on save.
  const RUN_PREFS_KEY = 'run_prefs';
  interface SharedPrefs {
    cpu?: string;
    os?: string;
    gpuDriver?: string;
    npuDriver?: string;
    webnnEp?: string;
    ort?: string;     // owned by /run
    litert?: string;  // owned by /run
    tjs?: string;     // owned by /run-llm
  }
  function loadPrefs(): SharedPrefs {
    if (!browser) return {};
    try { return JSON.parse(localStorage.getItem(RUN_PREFS_KEY) ?? '{}'); } catch { return {}; }
  }
  function savePrefs() {
    if (!browser) return;
    try {
      const existing = loadPrefs();
      const prefs: SharedPrefs = {
        ...existing,
        cpu: cpuModel,
        os: osModel,
        gpuDriver: gpuDriverVersion,
        npuDriver: npuDriverVersion,
        webnnEp,
        tjs: transformersVersion,
      };
      localStorage.setItem(RUN_PREFS_KEY, JSON.stringify(prefs));
    } catch {}
  }

  let models = $state<LLMRecipeModel[]>([]);
  let activeModelIdx = $state(0);

  type WarnKind = 'login_save' | 'login_multi' | 'login_both' | 'cpu_os' | 'drivers' | 'webnn_ep' | 'no_models';
  const warnings = $derived<WarnKind[]>([
    // login_save / login_multi / login_both — only ever one of the three
    ...(!$isAuthenticated && saveResults && models.length > 1 ? ['login_both' as const] : []),
    ...(!$isAuthenticated && saveResults && models.length <= 1 ? ['login_save' as const] : []),
    ...(!$isAuthenticated && !saveResults && models.length > 1 ? ['login_multi' as const] : []),
    ...(saveResults && $isAuthenticated && (!cpuModel.trim() || !osModel.trim()) ? ['cpu_os' as const] : []),
    ...(saveResults && $isAuthenticated && isAtLeast($auth.role ?? 'anonymous', 'intel') && (!gpuDriverVersion.trim() || (anyWebnnNpu && !npuDriverVersion.trim())) ? ['drivers' as const] : []),
    ...(webnnEpRequired ? ['webnn_ep' as const] : []),
    ...(models.length === 0 ? ['no_models' as const] : []),
  ]);

  type Phase = 'idle' | 'download' | 'compile' | 'generate' | 'done' | 'error';
  let phase = $state<Phase>('idle');
  let phaseError = $state<{ phase: string; message: string } | null>(null);

  let downloadLoaded = $state(0);
  let downloadTotal = $state(0);
  let downloadCurrentFile = $state('');

  let compileStartMs = $state(0);
  let compileElapsedMs = $state(0);
  let compileIntervalId: ReturnType<typeof setInterval> | null = null;

  let tokenStream = $state('');
  let liveTps = $state(0);
  let liveTtft = $state<number | null>(null);
  let currentRun = $state(0);
  let tokenCount = $state(0);

  let results = $state<{ model: LLMRecipeModel; backend: LLMBackend; result: LLMBenchmarkResult | null; error: string | null }[]>([]);
  let runLogs = $state<string[]>([]);
  let logsEl = $state<HTMLDivElement | undefined>(undefined);
  let tokenStreamEl = $state<HTMLDivElement | undefined>(undefined);
  let logsCopied = $state(false);
  let isRunning = $state(false);
  $effect(() => { isRunningStore.set(isRunning); });

  let environment = $state<EnvironmentInfo | null>(null);
  const supabase = createClient();
  let userId = $state<string | null>(null);

  $effect(() => { if (logsEl && runLogs.length) logsEl.scrollTop = logsEl.scrollHeight; });

  // Auto-scroll the token stream to the bottom only if the user is already pinned
  // near the bottom — lets them scroll up to read history without being snapped back.
  $effect(() => {
    void tokenStream;
    const el = tokenStreamEl;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  });

  let mounted = $state(false);

  // Write hash whenever key state changes (but not while running, and only after mount)
  $effect(() => {
    if (mounted && !isRunning) {
      void models; void selectedBackends; void runs; void promptTokens; void maxNewTokens;
      void transformersVersion; void webnnEp; void cpuModel; void osModel;
      void gpuDriverVersion; void npuDriverVersion; void saveResults;
      writeHash();
      savePrefs();
    }
  });

  onMount(async () => {
    environment = await detectEnvironment();
    availableBackends = await detectAvailableBackends();
    const { data: { session } } = await supabase.auth.getSession();
    userId = session?.user.id ?? null;

    // Priority: hash params > sessionStorage > query params
    const parsed = parseHash();
    if (parsed.models.length > 0) {
      models = parsed.models;
      runs = parsed.runs;
      promptTokens = parsed.promptTokens;
      maxNewTokens = parsed.maxNewTokens;
      // map parsed backends back to UI backends (wasm → wasm_1)
      const backendToUi = (b: LLMBackend): Backend => b === 'wasm' ? 'wasm_1' : b as Backend;
      selectedBackends = parsed.backends.map(backendToUi);
    }
    // Priority: hash > localStorage prefs. Falls back to defaults if neither has a value.
    const prefs = loadPrefs();
    transformersVersion = parsed.tjs || prefs.tjs || transformersVersion;
    webnnEp = parsed.webnnEp || prefs.webnnEp || '';
    cpuModel = parsed.cpu || prefs.cpu || '';
    osModel = parsed.os || prefs.os || '';
    gpuDriverVersion = parsed.gpuDrv || prefs.gpuDriver || '';
    npuDriverVersion = parsed.npuDrv || prefs.npuDriver || '';
    if (parsed.upload) saveResults = parsed.upload;
    if (parsed.models.length === 0) {
      const stored = browser && sessionStorage.getItem('llm_recipe_models');
      if (stored) { try { models = JSON.parse(stored); sessionStorage.removeItem('llm_recipe_models'); } catch {} }
      const urlModel = $page.url.searchParams.get('model');
      const urlDtype = $page.url.searchParams.get('dtype');
      if (urlModel && urlDtype && models.length === 0) {
        models = [{ hf_model_id: urlModel, data_type: urlDtype }];
      }
    }

    try {
      const v = await fetchRuntimeVersions();
      const all = [...(v.transformers?.stable ?? []), ...(v.transformers?.dev ?? [])];
      transformersVersions = all;
      // Don't override a version restored from URL hash or localStorage prefs
      if (!parsed.tjs && !prefs.tjs) {
        transformersVersion = v.transformers?.stable[0] ?? v.transformers?.dev[0] ?? '4.2.0';
      }
    } catch {}

    // Enable hash-writing only after all state has been restored, so the first
    // run of the $effect doesn't fire before the router is ready.
    mounted = true;

    // Auto-resume if navigated with #resume=1 (from interrupted run banner)
    if (browser && location.hash.includes('resume=1')) {
      history.replaceState(null, '', location.pathname);
      try {
        const raw = localStorage.getItem(LLM_INTERRUPTED_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved?.state && Array.isArray(saved.state)) {
            // Restore config first so models/backend/etc are set before runAll()
            const c = saved.config;
            if (c) {
              if (c.runs) runs = c.runs;
              if (c.promptTokens != null) promptTokens = c.promptTokens;
              if (c.maxNewTokens) maxNewTokens = c.maxNewTokens;
              if (c.prompt) prompt = c.prompt;
              if (c.transformersVersion) transformersVersion = c.transformersVersion;
              if (c.webnnEp) webnnEp = c.webnnEp;
              if (c.saveResults != null) saveResults = c.saveResults;
              if (c.cpuModel) cpuModel = c.cpuModel;
              if (c.osModel) osModel = c.osModel;
              if (c.gpuDriverVersion) gpuDriverVersion = c.gpuDriverVersion;
              if (c.npuDriverVersion) npuDriverVersion = c.npuDriverVersion;
              if (c.models?.length) models = c.models;
              const backendToUi = (b: LLMBackend): Backend => b === 'wasm' ? 'wasm_1' : b as Backend;
              if (Array.isArray(c.backends) && c.backends.length) {
                selectedBackends = (c.backends as LLMBackend[]).map(backendToUi);
              } else if (c.backend) {
                selectedBackends = [backendToUi(c.backend as LLMBackend)];
              }
            }
            // Restore previous results (completed entries skip on resume)
            results = saved.state.map((s: any) => ({
              model: s.model,
              backend: (s.backend as LLMBackend) ?? llmBackends[0],
              result: s.result ?? null,
              error: (s.status === 'completed') ? null : s.error,
            }));
            // Kick off the run, telling it to keep already-completed entries
            runAll({ resume: true });
          }
        }
      } catch {}
    }

    if (browser) window.addEventListener('beforeunload', handleBeforeUnload);
  });

  onDestroy(() => {
    if (browser) window.removeEventListener('beforeunload', handleBeforeUnload);
    terminateLlmWorker();
    stopCompileTimer();
  });

  function startCompileTimer() {
    compileStartMs = performance.now();
    compileIntervalId = setInterval(() => { compileElapsedMs = performance.now() - compileStartMs; }, 200);
  }
  function stopCompileTimer() {
    if (compileIntervalId) { clearInterval(compileIntervalId); compileIntervalId = null; }
  }

  async function runAll(opts: { resume?: boolean } = {}) {
    if (models.length === 0 || isRunning) return;
    isRunning = true;
    // Build the (backend, model) cartesian — outer loop is backends so all
    // models share each backend's compiled state in cache where possible.
    const plan = llmBackends.flatMap(b => models.map(m => ({ backend: b, model: m })));
    if (!opts.resume) {
      results = plan.map(({ model, backend: b }) => ({ model, backend: b, result: null, error: null }));
    }
    runLogs = [];
    phaseError = null;
    saveLlmRunState();

    for (let i = 0; i < plan.length; i++) {
      const { model: m, backend: b } = plan[i];
      activeModelIdx = i;
      // On resume, skip rows that already have a successful result
      if (opts.resume && results[i]?.result) continue;
      phase = 'download';
      downloadLoaded = 0; downloadTotal = 0; downloadCurrentFile = '';
      tokenStream = ''; liveTps = 0; liveTtft = null; currentRun = 0; tokenCount = 0;

      try {
        const result = await runLlmInWorker({
          hfModelId: m.hf_model_id,
          dtype: m.data_type,
          runtime: 'transformers',
          backend: b,
          runtimeVersion: transformersVersion,
          prompt,
          promptTokens,
          maxNewTokens,
          runs,
          warmupRuns: 1,
          onDownloadStart:    (total, count, files) => { phase = 'download'; downloadTotal = total; runLogs = [...runLogs, `[${getBackendLabel(b)}] Downloading ${count} files (${(total / 1_073_741_824).toFixed(2)} GB)`]; },
          onDownloadProgress: (loaded, total, file)  => { downloadLoaded = loaded; downloadTotal = total; downloadCurrentFile = file; },
          onDownloadDone:     (hit, ms)               => { runLogs = [...runLogs, `[${getBackendLabel(b)}] Download ${hit ? '(cached)' : 'complete'} in ${(ms / 1000).toFixed(1)}s`]; },
          onCompileStart:     ()                      => { phase = 'compile'; startCompileTimer(); },
          onCompileDone:      (ms)                    => { stopCompileTimer(); compileElapsedMs = ms; runLogs = [...runLogs, `[${getBackendLabel(b)}] Compiled in ${(ms / 1000).toFixed(1)}s`]; },
          onGenerateStart:    (ri)                    => { phase = 'generate'; currentRun = ri + 1; tokenStream = ''; liveTtft = null; liveTps = 0; tokenCount = 0; },
          onToken:            (ri, tok, idx, el, _tps) => {
            tokenStream += tok;
            tokenCount = idx + 1;
            // Derive live TPS on the page (worker stays off the per-token hot path).
            if (liveTtft !== null && tokenCount > 1) {
              const decodeElapsed = el - liveTtft;
              if (decodeElapsed > 0) liveTps = ((tokenCount - 1) / decodeElapsed) * 1000;
            }
          },
          onTtft:             (_ri, ttft)              => { liveTtft = ttft; },
          onRunDone:          (ri, r)                 => { runLogs = [...runLogs, `[${getBackendLabel(b)}] Run ${ri + 1}: TTFT=${r.ttftMs.toFixed(0)}ms TPS=${r.tps.toFixed(1)}`]; },
          onLogs:             (ls)                    => { runLogs = [...runLogs, ...ls]; },
        });

        results[i] = { model: m, backend: b, result, error: null };
        saveLlmRunState();
        if (saveResults && userId) await persistResult(m, b, result);
      } catch (e: any) {
        const msg = e.message ?? String(e);
        results[i] = { model: m, backend: b, result: null, error: msg };
        runLogs = [...runLogs, `[${getBackendLabel(b)}] Error: ${msg}`];
        phaseError = { phase, message: msg.replace(/^\[[^\]]+\]\s*/, '') };
        saveLlmRunState();
      }
    }

    stopCompileTimer();
    phase = 'done';
    isRunning = false;
    clearLlmRunState();
  }

  function stopBenchmark() {
    terminateLlmWorker();
    stopCompileTimer();
    isRunning = false;
    phase = 'idle';
    // Mark current model as stopped so resume picks it up
    if (results[activeModelIdx] && !results[activeModelIdx].result) {
      results[activeModelIdx] = { ...results[activeModelIdx], error: results[activeModelIdx].error ?? 'Stopped by user' };
    }
    saveLlmRunState();
  }

  // ── Crash/interruption recovery ─────────────────────────────────────────────
  const LLM_INTERRUPTED_KEY = 'interrupted_llm_run';

  function saveLlmRunState() {
    if (!browser) return;
    try {
      const state = results.map((r) => ({
        model: r.model,
        backend: r.backend,
        // Keep completed/error entries; mark active/pending entries as pending so resume re-runs them
        status: r.result ? 'completed' : (r.error ? 'error' : 'pending'),
        error: r.error,
        // Strip non-serializable / large fields from result; keep just the metrics
        result: r.result,
      }));
      const config = {
        backends: llmBackends, runs, promptTokens, maxNewTokens, prompt,
        transformersVersion, webnnEp, saveResults,
        cpuModel, osModel, gpuDriverVersion, npuDriverVersion,
        models,
      };
      localStorage.setItem(LLM_INTERRUPTED_KEY, JSON.stringify({ state, config, ts: Date.now() }));
    } catch {}
  }

  function clearLlmRunState() {
    if (!browser) return;
    try { localStorage.removeItem(LLM_INTERRUPTED_KEY); } catch {}
  }

  function handleBeforeUnload(e: BeforeUnloadEvent) {
    if (!isRunning) return;
    saveLlmRunState();
    // Show browser confirmation prompt — gives user a chance to cancel close
    e.preventDefault();
    e.returnValue = '';
  }

  // SvelteKit in-app navigation: stop the user from clicking a nav link
  // mid-run. Browser-level beforeunload covers tab close / external links.
  beforeNavigate(({ cancel }) => {
    if (!isRunning) return;
    const ok = window.confirm(
      'A benchmark is still running. Leave this page and abandon the run?'
    );
    if (!ok) cancel();
  });

  async function persistResult(m: LLMRecipeModel, b: LLMBackend, r: LLMBenchmarkResult) {
    if (!userId) return;
    await (supabase.from('results_llm') as any).insert({
      user_id: userId,
      run_id: crypto.randomUUID(),
      hf_model_id: m.hf_model_id,
      data_type: m.data_type,
      backend: b,
      runtime: 'transformers',
      runtime_version: transformersVersion,
      prompt,
      prompt_tokens: r.promptTokens,
      max_new_tokens: maxNewTokens,
      runs,
      warmup_runs: 1,
      status: 'completed',
      ttft_ms: r.ttftMs,
      tpot_ms: r.tpotMs,
      tps: r.tps,
      decode_ms: r.decodeMs,
      e2e_ms: r.e2eMs,
      e2e_tps: r.e2eTps,
      output_tokens: r.outputTokens,
      compilation_ms: r.compilationMs,
      warmup_ttft_ms: r.warmupTtftMs,
      ttft_ms_runs: r.ttftMsRuns,
      decode_ms_runs: r.decodeMsRuns,
      tps_runs: r.tpsRuns,
      e2e_ms_runs: r.e2eMsRuns,
      cpu: cpuModel.trim() || environment?.cpu,
      gpu: environment?.gpu,
      os: osModel.trim() || environment?.os,
      browser: environment?.browser,
      browser_version: environment?.browser_version,
      gpu_driver_version: gpuDriverVersion.trim() || null,
      npu_driver_version: npuDriverVersion.trim() || null,
      webnn_ep: b.startsWith('webnn_') && webnnEp ? webnnEp : null,
      completed_at: new Date().toISOString(),
    });
  }

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

  // ── Results export (Markdown / JSON / CSV — copy or download) ────────────
  const RESULT_HEADERS = ['model', 'prompt_tokens', 'output_tokens', 'dtype', 'backend', 'compilation_ms', 'ttft_ms', 'ttft_stddev_ms', 'tps', 'tps_stddev', 'throughput_tps', 'tpot_ms', 'decode_ms', 'e2e_ms', 'e2e_stddev_ms', 'runs', 'warmup_ttft_ms'] as const;

  function resultRows() {
    return results
      .filter(r => r.result || r.error)
      .map(r => {
        const base = { model: r.model.hf_model_id, dtype: r.model.data_type, backend: r.backend };
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
          runs,
          warmup_ttft_ms: x.warmupTtftMs,
        };
      });
  }

  function buildJSON(): string {
    return JSON.stringify({
      generated_at: new Date().toISOString(),
      backends: llmBackends, runs, prompt_tokens: promptTokens, max_new_tokens: maxNewTokens,
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
    const lines: string[] = ['# LLM Benchmark Results', ''];
    lines.push(`- Backends: ${llmBackends.map(b => `\`${b}\``).join(', ')}  · Runs: ${runs}  · Prompt tokens: ${promptTokens || 'custom'}  · Max new tokens: ${maxNewTokens}`);
    lines.push(`- Transformers.js: \`${transformersVersion}\``);
    if (environment) lines.push(`- Env: ${environment.browser} ${environment.browser_version} · ${environment.os} · ${environment.gpu}`);
    lines.push('');
    lines.push('| Model | Prompt | Output | dtype | Compilation | TTFT | TPS | Throughput | TPOT | Decode | E2E |');
    lines.push('|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|');
    for (const r of rows) {
      if ((r as any).error) {
        lines.push(`| ${r.model} |  |  | ${r.dtype} | error: ${(r as any).error} |  |  |  |  |  |  |`);
        continue;
      }
      const x = r as any;
      const std = (avg: number, s: number, d = 0, u = '') =>
        s > 0 ? `${avg.toFixed(d)} ± ${s.toFixed(d)}${u}` : `${avg.toFixed(d)}${u}`;
      lines.push(`| ${r.model} | ${x.prompt_tokens} | ${x.output_tokens} | ${r.dtype} | ${x.compilation_ms.toFixed(0)} ms | ${std(x.ttft_ms, x.ttft_stddev_ms, 0, ' ms')} | ${std(x.tps, x.tps_stddev, 1, ' tok/s')} | ${x.throughput_tps.toFixed(1)} tok/s | ${x.tpot_ms.toFixed(1)} ms | ${x.decode_ms.toFixed(0)} ms | ${std(x.e2e_ms, x.e2e_stddev_ms, 0, ' ms')} |`);
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
  async function copy(kind: 'md' | 'json' | 'csv') {
    const text = kind === 'md' ? buildMD() : kind === 'json' ? buildJSON() : buildCSV();
    await navigator.clipboard.writeText(text);
    copiedFlag = kind;
    setTimeout(() => { if (copiedFlag === kind) copiedFlag = null; }, 2000);
  }
  function download(kind: 'md' | 'json' | 'csv') {
    const ts = timestamp();
    if (kind === 'md')   downloadFile(buildMD(),   `llm-bench-${ts}.md`,   'text/markdown');
    if (kind === 'json') downloadFile(buildJSON(), `llm-bench-${ts}.json`, 'application/json');
    if (kind === 'csv')  downloadFile(buildCSV(),  `llm-bench-${ts}.csv`,  'text/csv');
  }
</script>

<div class="run-page" class:run-page-running={isRunning}>
  <header class="page-header page-header-row" class:hidden={isRunning}>
    <div class="page-header-text">
      <h1>LLM Benchmark</h1>
      <p>
        {#if models.length > 0}
          {models.length} LLM{models.length > 1 ? 's' : ''} selected
        {:else}
          Select models from LLM Recipes to benchmark.
        {/if}
      </p>
    </div>
  </header>

  <div class="running-center" class:running-center-active={isRunning}>

  {#if isRunning}
    {@const activeRow = results[activeModelIdx]}
    <section class="status-section">
      <div class="status-row status-row-top">
        <span class="status-model" title={activeRow?.model.hf_model_id ?? ''}>
          {activeRow?.model.hf_model_id ?? ''}
          {#if activeRow?.model.data_type}
            · {activeRow.model.data_type}
          {/if}
          {#if activeRow?.backend}
            · {getBackendLabel(activeRow.backend)}
          {/if}
        </span>
        <span class="progress-count">
          {#if phase === 'generate'}Run {currentRun}/{runs}{/if}{#if results.length > 1}{#if phase === 'generate'}{' · '}{/if}{activeModelIdx + 1}/{results.length}{/if}
        </span>
      </div>

      <!-- Phase 1: Download -->
      {#if phase === 'download'}
        <p class="status-text" aria-live="polite">Downloading model…</p>
        <div class="progress-bar-slot" class:progress-bar-hidden={downloadTotal === 0}>
          <ProgressBar
            percent={downloadTotal > 0 ? (downloadLoaded / downloadTotal) * 100 : 0}
            label="Downloading"
            loadedBytes={downloadLoaded}
            totalBytes={downloadTotal}
          />
        </div>
        {#if downloadCurrentFile}
          <p class="status-text file-hint">{downloadCurrentFile}</p>
        {/if}
      {/if}

      <!-- Phase 2: Compile -->
      {#if phase === 'compile'}
        <p class="status-text" aria-live="polite">Compiling model… {(compileElapsedMs / 1000).toFixed(1)}s</p>
        <div class="progress-bar-slot">
          <div class="indeterminate-bar"><div class="indeterminate-inner"></div></div>
        </div>
      {/if}

      <!-- Phase 3: Generate -->
      {#if phase === 'generate'}
        <div class="status-row">
          <span class="status-text" aria-live="polite">Generating…</span>
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
  {/if}

  {#if isRunning && results.some(r => r.result || r.error)}
    <section class="results-section results-section-running">
      <div class="results-table-wrap">
        <table class="results-table">
          <thead>
            <tr>
              <th class="col-model">Model</th>
              <th class="col-num" title="Prompt Tokens (prompt_tokens) — number of input tokens fed to the model. With a synthetic prompt this is exact (re-tokenized by the model's tokenizer). 'Custom' prompts show the actual token count from the run.">Prompt</th>
              <th class="col-num" title="Output Tokens (output_tokens) — actual number of tokens the model generated this run. Equals Max New unless an end-of-sequence token stopped generation early.">Output</th>
              <th>dtype</th>
              <th>Backend</th>
              <th class="col-num" title="Compilation time (ms)&#10;Formula: pipeline-ready time − pipeline-start time&#10;Includes: read weights from OPFS cache, parse ONNX graph, compile kernels (WebGPU shaders / WebNN graph / WASM), upload weights to device memory.&#10;Excludes: model download (measured separately in the Download phase) and generation runs.">Compilation</th>
              <th class="col-num" title="Time To First Token (ms)&#10;Formula: firstTokenTime − promptStartTime&#10;Includes prompt encoding + prefill + first decode step. The latency a user feels before any output appears. Shown as avg ± stddev across timed runs.">TTFT</th>
              <th class="col-num" title="Tokens Per Second — decode-phase rate (tokens/s)&#10;Formula: (outputTokens − 1) / decodeMs × 1000&#10;Excludes TTFT. Industry-standard 'how fast does it stream' number. Shown as avg ± stddev.">TPS</th>
              <th class="col-num" title="Throughput — end-to-end token rate (tokens/s)&#10;Formula: outputTokens / e2eMs × 1000&#10;Includes TTFT in the denominator, so it reflects the full user-visible wait. Always ≤ TPS.">Throughput</th>
              <th class="col-num" title="Time Per Output Token (ms)&#10;Formula: decodeMs / (outputTokens − 1)&#10;Inverse of TPS (TPOT ≈ 1000 / TPS). The average time the model takes to produce each token after the first.">TPOT</th>
              <th class="col-num" title="Decode time (ms)&#10;Formula: tEnd − firstTokenTime&#10;Total time spent generating tokens after TTFT. E2E = TTFT + Decode.">Decode</th>
              <th class="col-num" title="End-to-end time (ms)&#10;Formula: tEnd − promptStartTime  (= TTFT + Decode)&#10;Total wall time for one generation. Shown as avg ± stddev.">E2E</th>
            </tr>
          </thead>
          <tbody>
            {#each results as r}
              {#if r.result || r.error}
                <tr class:result-row-error={!!r.error}>
                  <td class="col-model" title={r.model.hf_model_id}>{r.model.hf_model_id}</td>
                  {#if r.result}
                    <td class="col-num">{r.result.promptTokens}</td>
                    <td class="col-num">{r.result.outputTokens}</td>
                  {:else}
                    <td class="col-num">—</td>
                    <td class="col-num">—</td>
                  {/if}
                  <td><span class="dtype-chip" data-dtype={r.model.data_type}>{r.model.data_type}</span></td>
                  <td>{getBackendLabel(r.backend)}</td>
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
    </section>
  {/if}

  {#if isRunning}
    <div class="run-controls">
      <button class="btn-stop" onclick={stopBenchmark} title="Esc">Stop <kbd class="kbd-hint">Esc</kbd></button>
    </div>
  {/if}

  </div><!-- /running-center -->

  {#if phaseError && !isRunning}
    {#if phaseError.message.includes('too large') || phaseError.message.includes('RangeError')}
      <div class="error-banner"><p class="action-hint">Try a smaller dtype (q4f16, int8) or a different model.</p></div>
    {:else if phaseError.phase === 'download'}
      <div class="error-banner"><p class="action-hint">Check your network connection or try again.</p></div>
    {/if}
  {/if}

  {#if !isRunning}
    <section class="config-section run-layout">
      <aside class="run-sidebar" use:autoTitle>
        {#if environment}
          <div class="detected-strip">
            <span class="detected-chip" title={environment.gpu}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="22" x2="18" y2="22"/><line x1="12" y1="18" x2="12" y2="22"/></svg>
              <strong>{environment.gpu}</strong>
            </span>
            <span class="detected-chip" title="{environment.browser} {environment.browser_version}">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="21.17" y1="8" x2="12" y2="8"/><line x1="3.95" y1="6.06" x2="8.54" y2="14"/><line x1="10.88" y1="21.94" x2="15.46" y2="14"/></svg>
              <strong>{environment.browser.replace(/^(Google|Microsoft|Apple|Mozilla)\s+/, '')} {environment.browser_version}</strong>
            </span>
          </div>
        {/if}

        {#if saveResults}
          <div class="sb-section">
            <div class="sb-section-head">
              <span class="sb-section-title">Hardware</span>
              <span class="sb-section-hint">All fields required to upload</span>
            </div>
            <div class="sb-row">
              <span class="sb-label">CPU</span>
              <input
                class="sb-input"
                class:input-warn={!cpuModel.trim()}
                type="text"
                list="cpu-model-list"
                placeholder="Type your CPU model…"
                bind:value={cpuModel}
              />
              <datalist id="cpu-model-list">
                {#each CPU_MODELS as m}<option value={m}></option>{/each}
              </datalist>
            </div>
            <div class="sb-row">
              <span class="sb-label">OS</span>
              <input
                class="sb-input"
                class:input-warn={!osModel.trim()}
                type="text"
                list="os-model-list"
                placeholder="Type your OS…"
                bind:value={osModel}
              />
              <datalist id="os-model-list">
                {#each OS_MODELS as o}<option value={o}></option>{/each}
              </datalist>
            </div>
            <div class="sb-row">
              <span class="sb-label">GPU drv</span>
              <input
                class="sb-input"
                class:input-warn={isAtLeast($auth.role ?? 'anonymous', 'intel') && !gpuDriverVersion.trim()}
                type="text"
                placeholder="e.g. 32.0.101.8824"
                bind:value={gpuDriverVersion}
              />
            </div>
            {#if anyWebnnNpu}
              <div class="sb-row">
                <span class="sb-label">NPU drv</span>
                <input
                  class="sb-input"
                  class:input-warn={isAtLeast($auth.role ?? 'anonymous', 'intel') && !npuDriverVersion.trim()}
                  type="text"
                  placeholder="e.g. 32.0.100.4778"
                  bind:value={npuDriverVersion}
                />
              </div>
            {/if}
          </div>
        {/if}

        <div class="sb-section">
          <div class="sb-section-head"><span class="sb-section-title">JS ML Framework · Runtime</span></div>
          <div class="sb-row">
            <span class="sb-label">Transformers.js</span>
            <select class="sb-input" bind:value={transformersVersion}>
              {#each transformersVersions as v}<option value={v}>{v}</option>{/each}
              {#if !transformersVersions.includes(transformersVersion)}
                <option value={transformersVersion}>{transformersVersion}</option>
              {/if}
            </select>
          </div>
          {#if saveResults && anyWebnn}
            <div class="sb-row">
              <span
                class="sb-label"
                title={'Not sure which EP to pick?\nOpen chrome://webnn-internals/ in a new tab, run the model once, then check the "Active Contexts" tab — the Runtime Backend and selected Execution Provider are listed there.'}
                >WebNN EP</span>
              <select class="sb-input" class:input-warn={webnnEpRequired} bind:value={webnnEp}>
                {#each WEBNN_EP_OPTIONS as opt}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
              </select>
            </div>
          {/if}
        </div>

        <div class="sb-section">
          <div class="sb-section-head"><span class="sb-section-title">Test</span></div>
          <BackendSelector
            bind:selected={selectedBackends}
            available={availableBackends.filter(b => b !== 'wasm_n')}
            backends={BACKENDS.filter(b => b.id !== 'wasm_n')}
          />
          <div class="sb-row">
            <span class="sb-label" title="Prompt Tokens — number of input tokens fed to the model (prompt_tokens). Synthesizes a prompt of exactly this many tokens for reproducibility (like onnxruntime-genai -l). Larger = more prefill work, longer TTFT. Set to 'Custom' to use your typed prompt verbatim (not reproducible across users).">Prompt</span>
            <select class="sb-input" bind:value={promptTokens}>
              <option value={0}>Custom</option>
              {#each TOKEN_OPTIONS as t}<option value={t}>{t}</option>{/each}
            </select>
          </div>
          <div class="sb-row">
            <span class="sb-label" title="Max New Tokens — the upper bound passed to model.generate() (max_new_tokens). The model stops at this count, or earlier if it emits an end-of-sequence token. The actual count generated is shown as 'Output' in the results table. Larger = longer decode phase, more stable TPS measurement.">Max New</span>
            <select class="sb-input" bind:value={maxNewTokens}>
              {#each TOKEN_OPTIONS as t}<option value={t}>{t}</option>{/each}
            </select>
          </div>
          <div class="sb-row sb-row-stack runs-row">
            <span class="sb-label">Runs</span>
            <div class="segment-group runs-segment">
              {#each RUN_OPTIONS as opt}
                <button
                  class="segment-btn"
                  class:active={runs === opt}
                  onclick={() => (runs = opt)}
                >{opt}</button>
              {/each}
            </div>
          </div>
        </div>

        <div class="actions">
          <label class="save-toggle">
            <input type="checkbox" bind:checked={saveResults} />
            <span class="save-toggle-text">Upload results</span>
          </label>
          <div class="run-action-row">
            <button
              class="btn-primary"
              onclick={runAll}
              disabled={models.length === 0 || (!$isAuthenticated && models.length > 1) || (saveResults && (!$isAuthenticated || !cpuModel.trim() || !osModel.trim() || webnnEpRequired || (isAtLeast($auth.role ?? 'anonymous', 'intel') && (!gpuDriverVersion.trim() || (anyWebnnNpu && !npuDriverVersion.trim())))))}
              title="Ctrl+Enter"
            >
              Run Benchmark <kbd class="kbd-hint">Ctrl+Enter</kbd>
            </button>
          </div>
          {#if warnings.length > 0}
            <ul class="action-hint-list">
              {#each warnings as w}
                <li class="action-hint" class:action-hint-warn={w !== 'no_models'}>
                  {#if w === 'login_save'}
                    <a href="/login">Sign in</a> to save results. The CPU, GPU and hardware details help put your performance scores in context.
                  {:else if w === 'login_multi'}
                    <a href="/login">Sign in</a> to run more than 1 model at a time.
                  {:else if w === 'login_both'}
                    <a href="/login">Sign in</a> to save results and run more than 1 model at a time. The CPU, GPU and hardware details help put your performance scores in context.
                  {:else if w === 'cpu_os'}
                    Add hardware details. Providing CPU, GPU and system info helps make benchmark results more useful and comparable.
                  {:else if w === 'drivers'}
                    Provide GPU and NPU driver versions to continue. This is required for Intel accounts.
                  {:else if w === 'webnn_ep'}
                    Choose an Execution Provider from the sidebar to run the WebNN backend. Required for Intel accounts.
                  {:else if w === 'no_models'}
                    No LLMs selected. <a href="/llm/recipe">Choose a recipe</a> to load one or more language models before running a benchmark.
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
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
                  <button class="export-group-btn" class:active={copiedFlag === 'md'}   onclick={() => copy('md')}   title="Copy results as Markdown">{copiedFlag === 'md' ? 'Copied!' : 'MD'}</button>
                  <button class="export-group-btn" class:active={copiedFlag === 'json'} onclick={() => copy('json')} title="Copy results as JSON">{copiedFlag === 'json' ? 'Copied!' : 'JSON'}</button>
                  <button class="export-group-btn" class:active={copiedFlag === 'csv'}  onclick={() => copy('csv')}  title="Copy results as CSV">{copiedFlag === 'csv' ? 'Copied!' : 'CSV'}</button>
                </div>
                <div class="export-group">
                  <span class="export-group-icon" title="Download results">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </span>
                  <button class="export-group-btn" onclick={() => download('md')}   title="Download results as Markdown">MD</button>
                  <button class="export-group-btn" onclick={() => download('json')} title="Download results as JSON">JSON</button>
                  <button class="export-group-btn" onclick={() => download('csv')}  title="Download results as CSV">CSV</button>
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
                        <td class="col-model" title={r.model.hf_model_id}>{r.model.hf_model_id}</td>
                        {#if r.result}
                          <td class="col-num">{r.result.promptTokens}</td>
                          <td class="col-num">{r.result.outputTokens}</td>
                        {:else}
                          <td class="col-num">—</td>
                          <td class="col-num">—</td>
                        {/if}
                        <td><span class="dtype-chip" data-dtype={r.model.data_type}>{r.model.data_type}</span></td>
                        <td>{getBackendLabel(r.backend)}</td>
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
            <p class="results-footer">{runs} run{runs !== 1 ? 's' : ''} · TTFT/TPS/E2E shown as avg ± stddev</p>
          </div>
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
              {#each runLogs as logLine}
                <div class="log-line">{logLine}</div>
              {/each}
            </div>
          </div>
        {/if}

        {#if models.length === 0}
          <div class="empty-models">
            {#if data.recipes && data.recipes.length > 0}
              <p class="empty-hint">Select a recipe to run:</p>
              <ul class="recipe-pick-list">
                {#each data.recipes as r (r.id)}
                  <li>
                    <button class="recipe-pick-btn" onclick={() => {
                      models = (r.models ?? []).map((m: any) => ({ hf_model_id: m.hf_model_id, data_type: m.data_type, size_bytes: m.size_bytes }));
                    }}>
                      <span class="recipe-pick-name">{r.name}</span>
                      <span class="recipe-pick-count">{(r.models ?? []).length} model{(r.models ?? []).length !== 1 ? 's' : ''}</span>
                    </button>
                  </li>
                {/each}
              </ul>
              <p class="empty-or">or <a href="/llm/recipe/new">create a recipe</a> · <a href="/llm/recipe">browse all</a></p>
            {:else}
              <p>No LLM recipes yet. <a href="/llm/recipe/new">Create a recipe</a> or use <code>/llm/run#llm=org/repo|dtype</code></p>
            {/if}
          </div>
        {:else}
          <div class="zone">
            <div class="zone-label">
              LLMs
              <span class="count-badge">{models.length}</span>
            </div>
            <ul class="model-list">
              {#each models as m, i}
                <li class="model-item">
                  <div class="model-item-left">
                    <span class="model-item-repo">{m.hf_model_id}</span>
                  </div>
                  <span class="dtype-chip" data-dtype={m.data_type}>{m.data_type}</span>
                  <button class="remove-btn" onclick={() => { models = models.filter((_, idx) => idx !== i); }} aria-label="Remove">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        <div class="env-row env-row-prompt">
          <span class="env-label" title={promptTokens > 0 ? 'Preview of the synthetic prompt — the worker re-truncates to exactly the chosen count using the model\'s actual tokenizer, so reproducibility is exact across users.' : 'Used as-is when Prompt tokens is "Custom".'}>Prompt{#if promptTokens > 0}<span class="prompt-disabled-badge">benchmark · ~{promptTokens} tok</span>{/if}</span>
          {#if promptTokens > 0}
            <div class="prompt-readonly-wrap">
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
            </div>
          {:else}
            <textarea
              class="prompt-input"
              rows="3"
              bind:value={prompt}
            ></textarea>
          {/if}
        </div>
        {#if promptTokens > 0}
          <p class="prompt-hint">
            Preview shows the synthetic stub repeated to ~{promptTokens} tokens; the worker re-truncates to exactly {promptTokens} using the model's tokenizer. Output text is meaningless by design — only TTFT, TPS, and decode time are the measurements that matter.
          </p>
        {:else}
          <p class="prompt-hint">
            Custom mode: your prompt is used verbatim. Max New is an <strong>upper bound</strong> — the model may stop earlier if it emits an end-of-sequence token, so the Output count (and TPS / decode time) can be noisy at small token counts. Not directly comparable to other users' runs.
          </p>
        {/if}
      </div>
    </section>
  {/if}
</div>

<style>
  .run-page { max-width: 100%; }

  .hidden { display: none !important; }

  code {
    font-size: var(--text-xs);
  }

  .empty-models a {
    color: var(--color-primary);
    text-decoration: none;
  }

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



  /* Status section — matches run/+page.svelte exactly */
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

  .file-hint {
    color: var(--color-text-muted);
    opacity: 0.75;
  }

  /* Keep the slot's space reserved when hidden so the section doesn't jump
     between "downloadTotal == 0" and the first progress event. */
  .progress-bar-hidden { visibility: hidden; }

  .indeterminate-bar { height: 1px; border-radius: 2px; background: var(--color-surface-sunken); overflow: hidden; margin: 8px 0; }
  .indeterminate-inner { height: 100%; width: 40%; background: var(--color-primary); border-radius: 2px; animation: slide 1.4s ease-in-out infinite; }
  @keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }

  @media (prefers-reduced-motion: reduce) {
    .indeterminate-inner { animation: none; width: 100%; opacity: 0.6; }
  }

  .status-badges { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .ttft-badge { font-family: var(--font-mono); font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: var(--radius-sm); background: var(--color-accent-light); color: var(--color-primary); }
  .tps-live { font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: var(--color-primary); }

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

  .token-stream::-webkit-scrollbar {
    width: 1px;
    height: 3px;
  }
  .token-stream::-webkit-scrollbar-button { width: 0; height: 0; display: none; }
  .token-stream::-webkit-scrollbar-track { background: transparent; }
  .token-stream::-webkit-scrollbar-thumb {
    background-color: var(--color-border-strong);
    border-radius: 3px;
  }
  .token-stream:hover::-webkit-scrollbar-thumb {
    background-color: var(--color-primary);
  }

  /* Results */
  .results-section { margin-bottom: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); }

  .results-section-running {
    width: 90vw;
    max-width: 760px;
    margin-inline: auto;
  }

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

  .results-table-wrap::-webkit-scrollbar {
    width: 3px;
    height: 1px;
  }
  .results-table-wrap::-webkit-scrollbar-button { width: 0; height: 0; display: none; }
  .results-table-wrap::-webkit-scrollbar-track { background: transparent; }
  .results-table-wrap::-webkit-scrollbar-thumb {
    background-color: var(--color-border-strong);
    border-radius: 3px;
  }
  .zone:hover .results-table-wrap::-webkit-scrollbar-thumb,
  .results-section:hover .results-table-wrap::-webkit-scrollbar-thumb {
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

  /* Stop */
  .run-controls { display: flex; justify-content: center; margin-top: var(--space-2); margin-bottom: var(--space-3); }

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
    border-color: var(--color-error); color: var(--color-error); 
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

  /* Error banner */
  .error-banner {
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-error);
    border-radius: var(--radius-base);
    background: color-mix(in srgb, var(--color-error) 6%, transparent);
    color: var(--color-error);
    font-size: var(--text-sm);
    margin-bottom: var(--space-3);
  }

  .action-hint {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    margin-top: var(--space-1);
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
  .export-group-btn:hover, .export-group-btn.active { background: var(--color-accent-light); color: var(--color-primary); }

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

  /* Config — matches run/+page.svelte */
  .config-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
    padding: 0 0 var(--space-4) 0;
  }

  .empty-models {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-base);
    border: 1px dashed var(--color-border);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .empty-hint {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--color-text-muted);
    margin: 0 0 var(--space-1);
  }

  .recipe-pick-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin: 0 0 var(--space-1);
  }

  .recipe-pick-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
    padding: 7px 10px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface-raised);
    text-align: left;
    cursor: pointer;
    transition: border-color var(--transition-base), background var(--transition-base);
  }

  .recipe-pick-btn:hover {
    border-color: var(--color-primary);
    background: var(--color-accent-light);
  }

  .recipe-pick-name {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .recipe-pick-count {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .empty-or {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: 0;
    text-align: center;
  }

  .empty-or a { color: var(--color-primary); text-decoration: none; }
  .empty-or a:hover { text-decoration: underline; }

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

  .model-list {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }

  @media (max-width: 900px) { .model-list { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 600px) { .model-list { grid-template-columns: 1fr; } }

  .model-item {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: 8px 10px;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    min-width: 0;
    transition: border-color var(--transition-base), background var(--transition-base);
  }

  .model-item:hover { border-color: var(--color-primary); background: var(--color-accent-light); }
  .model-item-left { flex: 1; min-width: 0; overflow: hidden; }

  .model-item-repo {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }

  .remove-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: var(--radius-sm);
    border: none;
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: color var(--transition-base), background var(--transition-base);
  }

  .remove-btn:hover { color: var(--color-error); background: color-mix(in srgb, var(--color-error) 10%, transparent); }
  .remove-btn:focus-visible { color: var(--color-error); outline: 2px solid var(--color-focus-ring); outline-offset: 2px; }

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

  .detected-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: var(--space-1);
  }
  .detected-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: calc(50% - 3px);
    padding: 3px 8px;
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 500;
    color: var(--color-text-secondary);
    background: var(--color-surface-sunken);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .detected-chip svg { flex-shrink: 0; color: var(--color-text-muted); }
  .detected-chip strong {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .sb-section {
    margin-top: 5px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .sb-section:first-of-type {
    border-top: none;
    margin-top: 0;
    padding-top: 0;
  }

  .sb-section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-1);
    margin-bottom: 4px;
  }
  .sb-section-title {
    font-family: var(--font-ui);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
  }
  .sb-section-hint {
    font-family: var(--font-ui);
    font-size: 10px;
    font-weight: 500;
    color: var(--color-text-muted);
    opacity: 0.7;
  }

  .sb-row {
    display: grid;
    grid-template-columns: 68px 1fr;
    align-items: center;
    gap: 8px;
    min-height: 28px;
  }
  .sb-label {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-transform: none;
    letter-spacing: 0;
  }
  input.sb-input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]),
  select.sb-input {
    width: 100%;
    height: 28px;
    min-width: 0;
    padding: 0 8px;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }
  select.sb-input {
    cursor: pointer;
    color: var(--color-text-muted);
  }

  /* Normalize embedded components inside the sidebar:
     labels stay --font-ui (prose), values/buttons use --font-mono (identifiers). */
  .run-sidebar :global(.backend-selector) {
    gap: 4px;
  }
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
  .sb-input.input-warn {
    border-color: var(--color-warning, #f59e0b) !important;
  }
  .sb-input.input-warn:focus,
  .sb-input.input-warn:focus-visible {
    border-color: var(--color-warning, #f59e0b) !important;
    outline-color: var(--color-warning, #f59e0b);
  }

  .env-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .env-label {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .action-hint {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    margin-top: var(--space-1);
  }

  .action-hint-warn { color: var(--color-warning, #d97706); }
  .action-hint a { color: inherit; font-weight: 600; }

  .action-hint-list {
    list-style: none;
    padding: 0;
    margin: var(--space-1) 0 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .action-hint-list .action-hint { margin-top: 0; }

  .runs-row .sb-label {
    display: block;
    margin-bottom: 4px;
  }
  .runs-row .segment-group {
    display: flex;
    align-items: stretch;
    width: 100%;
    border-radius: var(--radius-base);
    overflow: hidden;
  }
  .runs-row .segment-btn {
    flex: 1 1 0;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    padding: 0 4px;
    height: 28px;
    box-sizing: border-box;
    border: 1px solid var(--color-border);
    border-left: none;
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    white-space: nowrap;
    text-align: center;
    transition: background var(--transition-base), color var(--transition-base), border-color var(--transition-base);
  }
  .runs-row .segment-btn:first-child { border-left: 1px solid var(--color-border); }
  .runs-row .segment-btn:hover:not(.active) {
    background: var(--color-accent-light);
    color: var(--color-primary);
  }
  .runs-row .segment-btn.active {
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    border-color: var(--color-primary);
  }
  .runs-row .segment-btn.active + .segment-btn { border-left-color: var(--color-primary); }

  .prompt-input {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    font-family: var(--font-ui);
    font-size: var(--text-xs);
  }

  .prompt-input:focus-visible { border-color: var(--color-focus-ring); outline: none; }
  .prompt-input:disabled,
  .prompt-input[readonly] {
    background: var(--color-surface-sunken);
    color: var(--color-text-muted);
    cursor: not-allowed;
  }

  .prompt-readonly-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
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
    margin-left: 6px;
    padding: 1px 5px;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-primary);
    background: var(--color-primary-lightest);
    border-radius: 3px;
  }

  .prompt-disabled-badge:hover {
    background: var(--color-primary);
    color: var(--color-text-on-primary);
  }

  .prompt-hint {
    font-size: 11px;
    color: var(--color-text-muted);
    margin: -4px 0 0;
    line-height: 1.5;
  }

  .actions {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2);
    margin-top: var(--space-3);
    padding-top: var(--space-2);
  }

  .run-action-row {
    display: flex;
    align-items: stretch;
    gap: var(--space-2);
    flex-wrap: wrap;
    width: 100%;
  }

  .run-action-row :global(.btn-primary) {
    flex: 1 1 100%;
    width: 100%;
    justify-content: center;
  }

  .save-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
    margin-bottom: var(--space-1);
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .save-toggle input[type="checkbox"] {
    appearance: none;
    width: 18px;
    height: 18px;
    border: 2px solid var(--color-border-strong);
    border-radius: 50%;
    cursor: pointer;
    transition: border-color var(--transition-base), background var(--transition-base);
  }

  .save-toggle input[type="checkbox"]:focus-visible {
    outline: 2px solid var(--color-focus-ring);
    outline-offset: 2px;
  }

  .save-toggle input[type="checkbox"]:hover {
    border-color: var(--color-primary);
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 12 12' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M3 6.5L5 8.5L9 4' stroke='%230953DE' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-size: 12px;
    background-position: center;
    background-repeat: no-repeat;
  }

  .save-toggle input[type="checkbox"]:checked {
    background: var(--color-primary);
    border-color: var(--color-primary);
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 12 12' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M3 6.5L5 8.5L9 4' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-size: 12px;
    background-position: center;
    background-repeat: no-repeat;
  }

  .save-toggle-text { white-space: nowrap; }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border: none;
    border-radius: var(--radius-base);
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-primary:not(:disabled):hover { background: var(--color-primary-hover); }

  .kbd-hint {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 400;
    padding: 1px 4px;
    border-radius: 2px;
    background: rgba(255,255,255,0.15);
    opacity: 0.7;
    margin-left: 6px;
  }

  @media (max-width: 900px) {
    .run-layout {
      grid-template-columns: 1fr;
    }
    .run-sidebar {
      position: static;
      max-height: none;
      overflow-y: visible;
      padding-right: 0;
    }
  }

  @media (max-width: 768px) {
    .sb-row { grid-template-columns: 76px 1fr; }
  }
</style>
