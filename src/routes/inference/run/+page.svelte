<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import { replaceState, beforeNavigate } from "$app/navigation";
  import { get } from "svelte/store";
  import type {
    Backend,
    TestItem,
    TestResult,
    RunConfig as RunConfigType,
    EnvironmentInfo,
  } from "$lib/engine/types";
  import {
    detectAvailableBackends,
    getBackendLabel,
  } from "$lib/engine/backends";
  import { buildTestQueue } from "$lib/engine/queue";
  import { detectEnvironment } from "$lib/engine/environment";
  import { ResultsWriter } from "$lib/engine/results-writer";
  import { runInWorker, terminateWorker } from "$lib/engine/worker/pool";
  import { auth, isAuthenticated } from "$lib/stores/auth";
  import { isRunning as isRunningStore } from "$lib/stores/benchmark";
  import { isAtLeast } from "$lib/types/roles";
  import type { SharedRunConfig } from "$lib/supabase/types";
  import { CPU_MODELS } from "$lib/data/cpu-models";
  import { OS_MODELS } from "$lib/data/os-models";
  import { fetchRuntimeVersions } from "$lib/engine/runtime-versions";
  import { inferDataType } from "$lib/huggingface/parser";
  import { loadOverrides, getOverride } from "$lib/overrides-cache";
  import { autoTitle } from "$lib/utils/auto-title";
  import BackendSelector from "$lib/components/BackendSelector.svelte";
  import FormatIcon from "$lib/components/FormatIcon.svelte";
  import NetronLink from "$lib/components/NetronLink.svelte";
  import RunConfigCmp from "$lib/components/RunConfig.svelte";
  import ProgressBar from "$lib/components/ProgressBar.svelte";
  import BenchmarkResults from "$lib/components/BenchmarkResults.svelte";

  interface ModelEntry {
    hf_model_id: string;
    file_path: string;
    data_type: string;
    runtime: "onnx" | "litert";
    size_bytes?: number;
  }

  function formatSize(bytes?: number): string {
    if (!bytes) return "";
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)}G`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)}M`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}K`;
    return `${bytes}B`;
  }

  const VALID_BACKENDS: Backend[] = [
    "wasm_1",
    "wasm_n",
    "webgpu",
    "webnn_cpu",
    "webnn_gpu",
    "webnn_npu",
  ];
  const VALID_ITERATIONS = [1, 10, 20, 50, 100, 500, 1000, 10000];

  const WEBNN_EP_OPTIONS = [
    { value: "", label: "Default / Unknown" },
    { value: "openvino", label: "ORT - OpenVINO EP" },
    { value: "webgpu", label: "ORT - WebGPU EP" },
    { value: "coreml", label: "CoreML" },
    { value: "litert", label: "LiteRT" },
    { value: "tflite", label: "TFLite" },
    { value: "cpu", label: "ORT - CPU EP" },
    { value: "dml", label: "ORT - DML EP" },
    { value: "qnn", label: "ORT - QNN EP" },
    { value: "nvtensorrtrtx", label: "ORT - NvTensorRTRTX EP" },
    { value: "migraphx", label: "ORT - MIGraphX EP" },
    { value: "vitisai", label: "ORT - VitisAI EP" },
  ] as const;

  function parseHash(): {
    models: ModelEntry[];
    backends: Backend[];
    iterations: number;
    upload: boolean;
    cpu: string;
    os: string;
    ort: string;
    litert: string;
    webnnEp: string;
    fdo: boolean;
  } {
    const hash = new URLSearchParams(location.hash.slice(1));

    const models: ModelEntry[] = (hash.get("models") ?? "")
      .split(",")
      .filter(Boolean)
      .map((seg) => {
        const [hf_model_id, file_path] = seg.split("|");
        const fp = file_path ?? "onnx/model.onnx";
        const runtime: "onnx" | "litert" =
          fp.endsWith(".tflite") || fp.endsWith(".litertlm")
            ? "litert"
            : "onnx";
        return {
          hf_model_id: hf_model_id ?? "",
          file_path: fp,
          data_type: inferDataType(fp),
          runtime,
        };
      })
      .filter((m) => m.hf_model_id);

    const rawBackends = (hash.get("backend") ?? "")
      .split(",")
      .filter(Boolean) as Backend[];
    const backends = rawBackends.filter((b) => VALID_BACKENDS.includes(b));

    const n = parseInt(hash.get("n") ?? "", 10);
    const iterations = VALID_ITERATIONS.includes(n) ? n : 50;

    return {
      models,
      backends: backends.length ? backends : ["webgpu"],
      iterations,
      upload: hash.get("upload") === "1",
      cpu: hash.get("cpu") ?? "",
      os: hash.get("os") ?? "",
      ort: hash.get("ort") ?? "",
      litert: hash.get("litert") ?? "",
      webnnEp: hash.get("webnn_ep") ?? "",
      // Default enabled; only "fdo=0" disables it.
      fdo: hash.get("fdo") !== "0",
    };
  }

  function writeHash() {
    if (isRunning) return;
    const params = new URLSearchParams();
    if (hashModels.length) {
      params.set(
        "models",
        hashModels.map((m) => `${m.hf_model_id}|${m.file_path}`).join(","),
      );
    }
    params.set("backend", selectedBackends.join(","));
    params.set("n", String(iterations));
    if (saveResults) params.set("upload", "1");
    if (cpuModel.trim()) params.set("cpu", cpuModel.trim());
    if (osModel.trim()) params.set("os", osModel.trim());

    if (usesOnnx && ortVersion) params.set("ort", ortVersion);
    if (usesLitert && litertVersion) params.set("litert", litertVersion);
    if (usesWebnn && webnnEp) params.set("webnn_ep", webnnEp);
    // Only written when explicitly disabled — enabled is the default.
    if (usesOnnx && canUseCustomOrt && !enableFdo) params.set("fdo", "0");
    replaceState(`#${params}`, {});
  }

  let availableBackends = $state<Backend[]>(["wasm_1"]);
  let selectedBackends = $state<Backend[]>(["webgpu"]);
  let iterations = $state(50);
  let saveResults = $state(false);
  // freeDimensionOverrides toggle — enabled by default; only exposed to
  // partner/intel/admin (see canUseCustomOrt). Off means fdo is not applied.
  let enableFdo = $state(true);
  // Live JSON of the sessionOptions passed to ort.InferenceSession.create()
  // for the active queue item, reported by the worker.
  let sessionOptionsText = $state("");
  let queue = $state<TestItem[]>([]);
  let results = $state<TestResult[]>([]);
  let isRunning = $state(false);
  $effect(() => { isRunningStore.set(isRunning); });
  let activeWriter: ResultsWriter | null = null;
  let currentRunItem: TestItem | null = null;
  let statusText = $state("");
  let runLogs = $state<string[]>([]);
  let logsEl = $state<HTMLDivElement | undefined>(undefined);
  let logsCopied = $state(false);

  $effect(() => {
    if (logsEl && runLogs.length) {
      logsEl.scrollTop = logsEl.scrollHeight;
    }
  });
  let downloadPercent = $state(0);
  let downloadLoaded = $state(0);
  let downloadTotal = $state(0);
  let environment = $state<EnvironmentInfo | null>(null);
  let hashModels = $state<ModelEntry[]>([]);
  let cpuModel = $state("");
  let osModel = $state("");
  let gpuDriverVersion = $state("");
  let npuDriverVersion = $state("");

  let ortVersion = $state("");
  let ortDevVersions = $state<string[]>([]);
  let ortStableVersions = $state<string[]>([]);
  let litertVersion = $state("");
  let litertDevVersions = $state<string[]>([]);
  let litertStableVersions = $state<string[]>([]);
  let webnnEp = $state("");
  let mounted = $state(false);
  let overridesMap = $state<Map<string, Record<string, number>>>(new Map());
  let queueFlushTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleQueueFlush() {
    if (queueFlushTimer) return;
    queueFlushTimer = setTimeout(() => {
      queue = [...queue];
      queueFlushTimer = null;
    }, 100);
  }

  const totalModels = $derived(hashModels.length);
  const usesOnnx = $derived(hashModels.some((m) => m.runtime === "onnx"));
  const usesLitert = $derived(hashModels.some((m) => m.runtime === "litert"));
  const usesWebnn = $derived(selectedBackends.some((b) => b.startsWith("webnn_")));
  const usesWebnnNpu = $derived(selectedBackends.includes("webnn_npu"));
  const isCustomOrt = $derived(ortVersion.startsWith("http"));
  // Custom build entry point is partner/intel/admin only; member and
  // logged-out users never see the option or the URL input (see Global
  // Constraints). This mirrors the existing isAtLeast(...,'intel') gate
  // used for GPU/NPU driver fields further down this same file.
  const canUseCustomOrt = $derived(isAtLeast($auth.role ?? "anonymous", "partner"));

  function handleOrtSelect(e: Event) {
    const value = (e.currentTarget as HTMLSelectElement).value;
    // Seed with "https://" rather than "" so the row's existing
    // `usesOnnx && ortVersion` guard (further down) stays truthy and the
    // custom-URL input doesn't disappear the instant it's selected.
    ortVersion = value === "__custom__" ? "https://" : value;
  }
  const webnnEpRequired = $derived(
    saveResults &&
    usesWebnn &&
    isAtLeast($auth.role ?? 'anonymous', 'intel') &&
    !webnnEp
  );

  type WarnKind = 'login_save' | 'login_multi' | 'login_both' | 'cpu_os' | 'drivers' | 'webnn_ep' | 'no_models';
  const warnings = $derived<WarnKind[]>([
    // login_save / login_multi / login_both — only ever one of the three
    ...(!$isAuthenticated && saveResults && totalModels > 1 ? ['login_both' as const] : []),
    ...(!$isAuthenticated && saveResults && totalModels <= 1 ? ['login_save' as const] : []),
    ...(!$isAuthenticated && !saveResults && totalModels > 1 ? ['login_multi' as const] : []),
    ...(saveResults && $isAuthenticated && (!cpuModel.trim() || !osModel.trim()) ? ['cpu_os' as const] : []),
    ...(saveResults && $isAuthenticated && isAtLeast($auth.role ?? 'anonymous', 'intel') && (!gpuDriverVersion.trim() || (usesWebnnNpu && !npuDriverVersion.trim())) ? ['drivers' as const] : []),
    ...(webnnEpRequired ? ['webnn_ep' as const] : []),
    ...(totalModels === 0 ? ['no_models' as const] : []),
  ]);

  const completedCount = $derived(
    queue.filter((i) => i.status === "completed" || i.status === "error")
      .length,
  );
  const totalQueue = $derived(queue.length);
  const activeItem = $derived(
    queue.find(
      (i) =>
        i.status === "downloading" ||
        i.status === "compiling" ||
        i.status === "running",
    ),
  );
  const nextItem = $derived(queue.find((i) => i.status === "pending"));

  const RUN_MODELS_KEY = "run_models";
  const RUN_PREFS_KEY = "run_prefs";

  interface RunPrefs {
    cpu?: string;
    os?: string;
    gpuDriver?: string;
    npuDriver?: string;
    webnnEp?: string;
    ort?: string;
    litert?: string;
  }

  function loadPrefs(): RunPrefs {
    try {
      return JSON.parse(localStorage.getItem(RUN_PREFS_KEY) ?? "{}");
    } catch {
      return {};
    }
  }

  function savePrefs() {
    try {
      const prefs: RunPrefs = {
        cpu: cpuModel,
        os: osModel,
        gpuDriver: gpuDriverVersion,
        npuDriver: npuDriverVersion,
        webnnEp,
        ort: ortVersion,
        litert: litertVersion,
      };
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
    void enableFdo;
    writeHash();
    savePrefs();
    shareUrl = "";
    shareId = "";
    // Persist current model selection so navigation away doesn't lose it
    try {
      if (hashModels.length > 0)
        sessionStorage.setItem(RUN_MODELS_KEY, JSON.stringify(hashModels));
      else sessionStorage.removeItem(RUN_MODELS_KEY);
    } catch {}
  });

  onMount(async () => {
    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Parse hash first (may come from a shared URL or sessionStorage redirect)
    const parsed = parseHash();

    // Priority order: hf_ext_models (from CartPanel) > hash models > persisted run_models
    try {
      const extRaw = sessionStorage.getItem("hf_ext_models");
      if (extRaw) {
        const stored: ModelEntry[] = JSON.parse(extRaw);
        sessionStorage.removeItem("hf_ext_models");
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
    enableFdo = parsed.fdo;

    const prefs = loadPrefs();
    cpuModel = parsed.cpu || prefs.cpu || "";
    osModel = parsed.os || prefs.os || "";
    gpuDriverVersion = prefs.gpuDriver || "";
    npuDriverVersion = prefs.npuDriver || "";
    webnnEp = parsed.webnnEp || prefs.webnnEp || "";

    availableBackends = await detectAvailableBackends();
    environment = await detectEnvironment();
    // Fetch latest runtime versions from npm, then apply hash > prefs > default order
    try {
      const v = await fetchRuntimeVersions();
      ortDevVersions = v.ort.dev;
      ortStableVersions = v.ort.stable;
      litertDevVersions = v.litert.dev;
      litertStableVersions = v.litert.stable;
      ortVersion =
        parsed.ort || prefs.ort || v.ort.dev[0] || v.ort.stable[0] || "";
      litertVersion =
        parsed.litert ||
        prefs.litert ||
        v.litert.dev[0] ||
        v.litert.stable[0] ||
        "";
    } catch {
      ortVersion = parsed.ort || prefs.ort || "";
      litertVersion = parsed.litert || prefs.litert || "";
    }

    loadOverrides()
      .then((m) => {
        overridesMap = m;
      })
      .catch(() => {});

    mounted = true;

    // Auto-resume if navigated with #resume=1 (from interrupted run banner)
    if (location.hash.includes('resume=1')) {
      history.replaceState(null, '', location.pathname);
      try {
        const raw = localStorage.getItem('interrupted_run');
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved?.queue && Array.isArray(saved.queue)) {
            queue = saved.queue.map((i: any) => ({ ...i, progress: 0 }));
            // Reset in-flight items to pending
            for (const item of queue) {
              if (item.status !== 'completed' && item.status !== 'error') {
                item.status = 'pending';
              }
            }
            queue = [...queue];
            // Restore previous results
            if (saved.results?.length) {
              results = saved.results;
            }
            // Restore run config
            if (saved.config) {
              const c = saved.config;
              if (c.iterations) iterations = c.iterations;
              if (c.saveResults != null) saveResults = c.saveResults;
              if (c.enableFdo != null) enableFdo = c.enableFdo;
              if (c.ortVersion) ortVersion = c.ortVersion;
              if (c.litertVersion) litertVersion = c.litertVersion;
              if (c.webnnEp) webnnEp = c.webnnEp;
              if (c.cpuModel) cpuModel = c.cpuModel;
              if (c.osModel) osModel = c.osModel;
              if (c.gpuDriverVersion) gpuDriverVersion = c.gpuDriverVersion;
              if (c.npuDriverVersion) npuDriverVersion = c.npuDriverVersion;
              if (c.backends?.length) selectedBackends = c.backends;
              if (c.models?.length) hashModels = c.models;
            }
            resumeBenchmark();
          }
        }
      } catch {}
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLSelectElement ||
      e.target instanceof HTMLTextAreaElement
    )
      return;
    if (
      e.key === "Enter" &&
      (e.ctrlKey || e.metaKey) &&
      !isRunning &&
      hashModels.length > 0
    ) {
      e.preventDefault();
      startBenchmark();
    } else if (e.key === "Escape" && isRunning) {
      e.preventDefault();
      stopBenchmark();
    }
  }

  function handleBeforeUnload(e: BeforeUnloadEvent) {
    if (!isRunning) return;

    // Best-effort sync write so an interrupted upload-row gets marked crashed,
    // not left in 'running' status forever.
    if (activeWriter && currentRunItem && activeWriter.hasResultId(currentRunItem)) {
      activeWriter.markCrashedSync(currentRunItem);
    }

    // Show browser confirmation prompt — gives user a chance to cancel close
    // for ANY active run, not just uploading ones.
    e.preventDefault();
    e.returnValue = "";
  }

  // SvelteKit in-app navigation: stop the user from clicking a nav link
  // mid-run. Browser-level beforeunload covers tab close / external links.
  beforeNavigate(({ cancel }) => {
    if (!isRunning) return;
    const ok = window.confirm(
      "A benchmark is still running. Leave this page and abandon the run?"
    );
    if (!ok) cancel();
  });

  onDestroy(() => {
    if (!browser) return;
    window.removeEventListener("keydown", handleKeydown);
    window.removeEventListener("beforeunload", handleBeforeUnload);
    terminateWorker();
  });

  function saveRunState() {
    try {
      const state = queue.map(i => ({ id: i.id, hf_model_id: i.hf_model_id, file_path: i.file_path, data_type: i.data_type, runtime: i.runtime, backend: i.backend, status: i.status, error: i.error }));
      const savedResults = results.map(r => ({
        id: r.id,
        test_item: r.test_item,
        metrics: r.metrics,
        error_message: r.error_message,
        capability: r.capability ?? null,
        warmup_ms: r.warmup_ms,
        iterations: r.iterations,
        iterations_completed: r.iterations_completed,
        started_at: r.started_at,
        completed_at: r.completed_at,
        inference_times: [],
      }));
      const config = { iterations, saveResults, enableFdo, ortVersion, litertVersion, webnnEp, cpuModel, osModel, gpuDriverVersion, npuDriverVersion, backends: selectedBackends, models: hashModels };
      localStorage.setItem('interrupted_run', JSON.stringify({ queue: state, config, results: savedResults, ts: Date.now() }));
    } catch {}
  }

  function clearRunState() {
    localStorage.removeItem('interrupted_run');
  }

  async function startBenchmark() {
    if (hashModels.length === 0) return;
    if (hashModels.length > 1 && !get(isAuthenticated)) {
      statusText = 'Sign in to run more than 1 model at a time.';
      return;
    }

    queue = buildTestQueue(hashModels, selectedBackends);
    isRunning = true;
    results = [];
    runLogs = [];
    saveRunState();

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
        },
        ortVersion,
        litertVersion,
        usesWebnn ? webnnEp : '',
        gpuDriverVersion.trim(),
        npuDriverVersion.trim(),
      );
    }
    activeWriter = writer;
    if (writer) await writer.cacheAccessToken();

    for (const item of queue) {
      if (!isRunning) break;
      currentRunItem = item;

      item.status = "downloading";
      sessionOptionsText = "";
      queue = [...queue];
      saveRunState();
      statusText = `Testing ${item.hf_model_id}...`;

      if (writer) {
        await writer.createResult(item, config.iterations);
      }

      const runtimeVersion =
        item.runtime === "onnx" ? ortVersion : litertVersion;
      const fdo =
        item.runtime === "onnx" && enableFdo
          ? getOverride(overridesMap, item.hf_model_id, item.file_path)
          : undefined;

      let result: TestResult;
      try {
        result = await runInWorker({
          modelSource: {
            kind: "url",
            hfModelId: item.hf_model_id,
            filePath: item.file_path,
          },
          runtime: item.runtime,
          backend: item.backend,
          iterations: config.iterations,
          warmupRuns: config.warmup_runs,
          runtimeVersion,
          freeDimensionOverrides: fdo,
          onSessionOptions: (opts) => {
            sessionOptionsText = JSON.stringify(opts);
          },
          onProgress: (progress) => {
            downloadPercent = progress.percent;
            downloadLoaded = progress.loaded_bytes;
            downloadTotal = progress.total_bytes;
            item.progress = progress.percent;
            item.status = "downloading";
            scheduleQueueFlush();
          },
          onStatus: (status) => {
            statusText = status;
            runLogs = [...runLogs, status];
            if (
              status.includes("Compil") ||
              status.includes("session") ||
              status.includes("Creating")
            )
              item.status = "compiling";
            else if (status.includes("Inferencing") || status.includes("Warm"))
              item.status = "running";
            scheduleQueueFlush();
          },
          onLogs: (logs) => {
            runLogs = [...runLogs, ...logs];
          },
        });
      } catch (err: any) {
        terminateWorker();
        const msg = err?.message ?? "Worker error";
        runLogs = [...runLogs, `Error: ${msg}`];
        result = {
          id: item.id,
          test_item: { ...item, status: "error", error: msg },
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
        item.status = "error";
        item.error = result.error_message;
        runLogs = [
          ...runLogs,
          `Error [${item.hf_model_id} / ${getBackendLabel(item.backend)}]: ${result.error_message}`,
        ];
      } else if (writer) {
        item.status = "uploading";
        statusText = `Uploading results for ${item.hf_model_id}...`;
        runLogs = [...runLogs, `Uploading results for ${item.hf_model_id} · ${getBackendLabel(item.backend)}...`];
      } else {
        item.status = "completed";
      }
      item.progress = 100;
      results = [...results, result];
      queue = [...queue];
      downloadPercent = 0;
      saveRunState();

      if (writer) {
        const saved = await writer.completeResult(item, result);
        if (result.error_message) {
          // Error row already persisted; keep it flagged as an error.
          item.status = "error";
        } else if (saved) {
          item.status = "completed";
          runLogs = [...runLogs, `Saved ${item.hf_model_id} · ${getBackendLabel(item.backend)}`];
        } else {
          // The run succeeded but the upload didn't land. Don't claim "Saved" —
          // surface it as a retryable failure so the result isn't silently lost.
          item.status = "error";
          item.error = "Upload failed — result not saved. Retry to upload.";
          runLogs = [...runLogs, `Upload FAILED for ${item.hf_model_id} · ${getBackendLabel(item.backend)} — not saved`];
        }
        queue = [...queue];
        saveRunState();
      }
      currentRunItem = null;
    }

    isRunning = false;
    activeWriter = null;
    currentRunItem = null;
    statusText = "Benchmark complete.";
    clearRunState();
  }

  const hasStoppedItems = $derived(
    !isRunning && queue.some(i => i.status === 'error' && i.error === 'Stopped by user')
  );

  async function resumeBenchmark() {
    if (queue.length === 0) return;

    // Reset stopped items back to pending
    for (const item of queue) {
      if (item.status === 'error' && item.error === 'Stopped by user') {
        item.status = 'pending';
        item.error = undefined;
        item.progress = 0;
      }
    }
    queue = [...queue];

    isRunning = true;
    statusText = 'Resuming...';

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
        },
        ortVersion,
        litertVersion,
        usesWebnn ? webnnEp : '',
        gpuDriverVersion.trim(),
        npuDriverVersion.trim(),
      );
    }
    activeWriter = writer;
    if (writer) await writer.cacheAccessToken();

    for (const item of queue) {
      if (!isRunning) break;
      if (item.status === 'completed' || item.status === 'error') continue;
      currentRunItem = item;

      item.status = 'downloading';
      sessionOptionsText = '';
      queue = [...queue];
      saveRunState();
      statusText = `Testing ${item.hf_model_id}...`;

      if (writer) {
        await writer.createResult(item, config.iterations);
      }

      const runtimeVersion =
        item.runtime === 'onnx' ? ortVersion : litertVersion;
      const fdo =
        item.runtime === 'onnx' && enableFdo
          ? getOverride(overridesMap, item.hf_model_id, item.file_path)
          : undefined;

      let result: TestResult;
      try {
        result = await runInWorker({
          modelSource: {
            kind: 'url',
            hfModelId: item.hf_model_id,
            filePath: item.file_path,
          },
          runtime: item.runtime,
          backend: item.backend,
          iterations: config.iterations,
          warmupRuns: config.warmup_runs,
          runtimeVersion,
          freeDimensionOverrides: fdo,
          onSessionOptions: (opts) => {
            sessionOptionsText = JSON.stringify(opts);
          },
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
            if (status.includes('Compil') || status.includes('session') || status.includes('Creating'))
              item.status = 'compiling';
            else if (status.includes('Inferencing') || status.includes('Warm'))
              item.status = 'running';
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
        runLogs = [...runLogs, `Error [${item.hf_model_id} / ${getBackendLabel(item.backend)}]: ${result.error_message}`];
      } else if (writer) {
        item.status = 'uploading';
        statusText = `Uploading results for ${item.hf_model_id}...`;
        runLogs = [...runLogs, `Uploading results for ${item.hf_model_id} · ${getBackendLabel(item.backend)}...`];
      } else {
        item.status = 'completed';
      }
      item.progress = 100;
      results = [...results, result];
      queue = [...queue];
      downloadPercent = 0;
      saveRunState();

      if (writer) {
        const saved = await writer.completeResult(item, result);
        if (result.error_message) {
          item.status = 'error';
        } else if (saved) {
          item.status = 'completed';
          runLogs = [...runLogs, `Saved ${item.hf_model_id} · ${getBackendLabel(item.backend)}`];
        } else {
          item.status = 'error';
          item.error = 'Upload failed — result not saved. Retry to upload.';
          runLogs = [...runLogs, `Upload FAILED for ${item.hf_model_id} · ${getBackendLabel(item.backend)} — not saved`];
        }
        queue = [...queue];
        saveRunState();
      }
      currentRunItem = null;
    }

    isRunning = false;
    activeWriter = null;
    currentRunItem = null;
    statusText = 'Benchmark complete.';
    clearRunState();
  }

  async function stopBenchmark() {
    if (queueFlushTimer) {
      clearTimeout(queueFlushTimer);
      queueFlushTimer = null;
    }
    isRunning = false;
    statusText = "Stopped.";
    terminateWorker();

    // Mark all non-finished items as stopped so spinners clear immediately
    for (const item of queue) {
      if (item.status !== "completed" && item.status !== "error") {
        item.status = "error";
        item.error = "Stopped by user";
      }
    }
    queue = [...queue];

    // Mark the in-flight row as error in the database
    if (activeWriter && currentRunItem && activeWriter.hasResultId(currentRunItem)) {
      const item = currentRunItem;
      await activeWriter.markStopped(item);
      runLogs = [...runLogs, `Stopped ${item.hf_model_id} · ${getBackendLabel(item.backend)}`];
    }
    activeWriter = null;
    currentRunItem = null;
    clearRunState();
  }

  let shareUrl = $state("");
  let shareId = $state("");
  let shareLoading = $state(false);

  async function shareConfig() {
    if (hashModels.length === 0) return;
    shareLoading = true;
    try {
      const config: SharedRunConfig = {
        models: hashModels.map((m) => ({
          hf_model_id: m.hf_model_id,
          file_path: m.file_path,
        })),
        backends: selectedBackends,
        iterations,
        upload: saveResults || undefined,
        cpu: cpuModel.trim() || undefined,
        os: osModel.trim() || undefined,
        ort: usesOnnx && ortVersion ? ortVersion : undefined,
        litert: usesLitert && litertVersion ? litertVersion : undefined,
        webnn_ep: usesWebnn && webnnEp ? webnnEp : undefined,
        fdo: usesOnnx && canUseCustomOrt && !enableFdo ? false : undefined,
      };
      const res = await fetch("/api/shared-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Failed to create share link");
      const { id } = await res.json();
      shareId = id;
      shareUrl = `${location.origin}/run/s/${id}`;
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      shareUrl = "";
    } finally {
      shareLoading = false;
    }
  }

  async function deleteShareUrl() {
    if (!shareId) return;
    await fetch(`/api/shared-config?id=${shareId}`, { method: "DELETE" });
    shareUrl = "";
    shareId = "";
  }

  async function retryItem(item: TestItem) {
    if (isRunning) return;
    item.status = "pending";
    item.progress = 0;
    queue = [...queue];
    isRunning = true;
    statusText = `Retrying ${item.hf_model_id}...`;

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
        },
        ortVersion,
        litertVersion,
        usesWebnn ? webnnEp : '',
        gpuDriverVersion.trim(),
        npuDriverVersion.trim(),
      );
    }
    activeWriter = writer;
    currentRunItem = item;
    if (writer) await writer.cacheAccessToken();

    item.status = "downloading";
    sessionOptionsText = "";
    queue = [...queue];
    if (writer) await writer.retryResult(item, config.iterations);

    const runtimeVersion = item.runtime === "onnx" ? ortVersion : litertVersion;
    const fdo2 =
      item.runtime === "onnx" && enableFdo
        ? getOverride(overridesMap, item.hf_model_id, item.file_path)
        : undefined;
    let result: TestResult;
    try {
      result = await runInWorker({
        modelSource: {
          kind: "url",
          hfModelId: item.hf_model_id,
          filePath: item.file_path,
        },
        runtime: item.runtime,
        backend: item.backend,
        iterations: config.iterations,
        warmupRuns: config.warmup_runs,
        runtimeVersion,
        freeDimensionOverrides: fdo2,
        onSessionOptions: (opts) => {
          sessionOptionsText = JSON.stringify(opts);
        },
        onProgress: (progress) => {
          downloadPercent = progress.percent;
          item.progress = progress.percent;
          item.status = "downloading";
          scheduleQueueFlush();
        },
        onStatus: (status) => {
          statusText = status;
          runLogs = [...runLogs, status];
          if (
            status.includes("Compil") ||
            status.includes("session") ||
            status.includes("Creating")
          )
            item.status = "compiling";
          else if (status.includes("Inferencing") || status.includes("Warm"))
            item.status = "running";
          scheduleQueueFlush();
        },
      });
    } catch (err: any) {
      terminateWorker();
      const msg = err?.message ?? "Worker error";
      runLogs = [...runLogs, `Error: ${msg}`];
      result = {
        id: item.id,
        test_item: { ...item, status: "error", error: msg },
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
      item.status = "error";
      item.error = result.error_message;
    } else if (writer) {
      item.status = "uploading";
      statusText = `Uploading results for ${item.hf_model_id}...`;
      runLogs = [...runLogs, `Uploading results for ${item.hf_model_id} · ${getBackendLabel(item.backend)}...`];
    } else {
      item.status = "completed";
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
          ),
      ),
      result,
    ];
    queue = [...queue];
    downloadPercent = 0;

    if (writer) {
      // Always flush to the DB (writes the error status too, so a failed retry
      // doesn't strand the row at 'running'). Only claim "Saved" on a clean run.
      const saved = await writer.completeResult(item, result);
      if (result.error_message) {
        item.status = "error";
      } else if (saved) {
        item.status = "completed";
        item.error = undefined;
        runLogs = [...runLogs, `Saved ${item.hf_model_id} · ${getBackendLabel(item.backend)}`];
      } else {
        item.status = "error";
        item.error = "Upload failed — result not saved. Retry to upload.";
        runLogs = [...runLogs, `Upload FAILED for ${item.hf_model_id} · ${getBackendLabel(item.backend)} — not saved`];
      }
      queue = [...queue];
    }

    isRunning = false;
    activeWriter = null;
    currentRunItem = null;
    statusText = result.error_message
      ? `Retry failed: ${result.error_message}`
      : item.status === "error"
        ? "Retry succeeded but upload failed — not saved."
        : "Retry complete.";
  }
</script>

<div class="run-page" class:run-page-running={isRunning}>
  <header class="page-header page-header-row" class:hidden={isRunning}>
    <div class="page-header-text">
      <h1>Benchmark</h1>
      <p>
        {#if totalModels > 0}
          {totalModels} model{totalModels > 1 ? "s" : ""} selected
        {:else}
          Select models from the Model page to benchmark.
        {/if}
      </p>
    </div>
    {#if $isAuthenticated && totalModels > 0 && !isRunning}
      <div class="page-header-actions">
      <div class="share-row">
        <button
          class="btn-share"
          onclick={shareConfig}
          disabled={shareLoading}
          title="Create a short URL to share this benchmark configuration"
        >
          {#if shareLoading}
            <span class="spinner spinner-sm"></span>
          {:else if shareUrl}
            Copied!
          {:else}
            Share
          {/if}
        </button>
        {#if shareUrl}
          <button
            class="btn-share-delete"
            onclick={deleteShareUrl}
            title="Delete shared link">Delete</button
          >
        {/if}
      </div>
      </div>
    {/if}
  </header>

  <div class="running-center" class:running-center-active={isRunning}>
  {#if isRunning}
    <section class="status-section">
      {#if isRunning && totalQueue > 0}
        <div class="status-row status-row-top">
          <span class="status-model" title={activeItem?.hf_model_id ?? nextItem?.hf_model_id ?? ''}>
            {activeItem?.hf_model_id ?? nextItem?.hf_model_id ?? ''}
          </span>
          <span class="progress-count">Queue: {completedCount}/{totalQueue}</span>
        </div>
      {/if}
      <p class="status-text" aria-live="polite">{statusText}</p>
      <div
        class="progress-bar-slot"
        class:progress-bar-hidden={downloadTotal === 0}
        aria-hidden={downloadTotal === 0}
      >
        <ProgressBar percent={downloadPercent} label="Downloading" loadedBytes={downloadLoaded} totalBytes={downloadTotal} />
      </div>
      <div class="status-options-row">
        <span
          class="status-options-value status-text-clip status-options-tooltip"
          data-tooltip={sessionOptionsText || undefined}
          title={sessionOptionsText || undefined}
          >{sessionOptionsText || " "}</span
        >
      </div>
      {#if isRunning && totalQueue > 0 && (activeItem || nextItem)}
        <div class="status-row status-row-bottom">
          <span class="progress-current">
            {#if activeItem}
              <span class="status-fmt-icon status-fmt-icon-blink">
                <FormatIcon format={activeItem.file_path.endsWith('.tflite') ? 'tflite' : activeItem.file_path.endsWith('.litertlm') ? 'litertlm' : 'onnx'} size={13} />
              </span>
              <span class="status-text-clip">Running: {activeItem.file_path} · {activeItem.backend}</span>
            {/if}
          </span>
          <span class="progress-next">
            {#if nextItem}
              <span class="status-fmt-icon">
                <FormatIcon format={nextItem.file_path.endsWith('.tflite') ? 'tflite' : nextItem.file_path.endsWith('.litertlm') ? 'litertlm' : 'onnx'} size={13} />
              </span>
              <span class="status-text-clip">Next: {nextItem.file_path} · {nextItem.backend}</span>
            {/if}
          </span>
        </div>
      {/if}
    </section>
  {/if}

  {#if isRunning && (queue.length > 0 || results.length > 0)}
    <section class="results-section results-section-running">
      <BenchmarkResults {results} backends={selectedBackends} {queue} {isRunning} onretry={retryItem} />
    </section>
  {/if}

  {#if isRunning}
    <div class="run-controls">
      <button class="btn-stop" onclick={stopBenchmark} title="Esc">Stop <kbd class="kbd-hint">Esc</kbd></button>
    </div>
  {/if}

  </div>

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
                placeholder="Type your CPU model..."
                bind:value={cpuModel}
              />
              <datalist id="cpu-model-list">
                {#each CPU_MODELS as model}
                  <option value={model}></option>
                {/each}
              </datalist>
            </div>
            <div class="sb-row">
              <span class="sb-label">OS</span>
              <input
                class="sb-input"
                class:input-warn={!osModel.trim()}
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
            <div class="sb-row">
              <span class="sb-label">GPU drv</span>
              <input
                class="sb-input"
                class:input-warn={isAtLeast(
                  $auth.role ?? "anonymous",
                  "intel",
                ) && !gpuDriverVersion.trim()}
                type="text"
                placeholder="e.g. 32.0.101.8824"
                bind:value={gpuDriverVersion}
              />
            </div>
            {#if usesWebnnNpu}
              <div class="sb-row">
                <span class="sb-label">NPU drv</span>
                <input
                  class="sb-input"
                  class:input-warn={isAtLeast(
                    $auth.role ?? "anonymous",
                    "intel",
                  ) && !npuDriverVersion.trim()}
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
          {#if usesOnnx && ortVersion}
            <div class="sb-row">
              <span class="sb-label">ORT Web</span>
              <select
                class="sb-input"
                value={isCustomOrt && canUseCustomOrt ? "__custom__" : ortVersion}
                onchange={handleOrtSelect}
              >
                {#if canUseCustomOrt}
                  <option value="__custom__">Custom build…</option>
                {/if}
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
            {#if isCustomOrt && canUseCustomOrt}
              <div class="sb-row">
                <span class="sb-label">Dist URL</span>
                <input
                  class="sb-input"
                  type="text"
                  placeholder="https://.../ort.*.mjs"
                  bind:value={ortVersion}
                />
              </div>
            {/if}
            {#if canUseCustomOrt}
              <label class="save-toggle fdo-toggle" title="Apply freeDimensionOverrides when creating the ONNX session. Resolves dynamic input dims (e.g. batch_size) for WebNN backends. Turn off to create the session without them.">
                <input type="checkbox" bind:checked={enableFdo} />
                <span class="save-toggle-text">freeDimensionOverrides</span>
              </label>
            {/if}
          {/if}
          {#if usesLitert && litertVersion}
            <div class="sb-row">
              <span class="sb-label">LiteRT.js</span>
              <select class="sb-input" bind:value={litertVersion}>
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
          {#if saveResults && usesWebnn}
            <div class="sb-row">
              <span
                class="sb-label"
                title={'Not sure which EP to pick?\nOpen chrome://webnn-internals/ in a new tab, run the model once, then check the "Active Contexts" tab — the Runtime Backend and selected Execution Provider are listed there.'}
                >WebNN EP</span
              >
              <select
                class="sb-input"
                class:input-warn={webnnEpRequired}
                bind:value={webnnEp}
              >
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
            available={availableBackends}
          />
          <RunConfigCmp bind:iterations />
        </div>

        <div class="actions">
          <label class="save-toggle" title="Save this run to your account. Hardware details are required so results stay comparable across machines.">
            <input type="checkbox" bind:checked={saveResults} />
            <span class="save-toggle-text">Upload results</span>
          </label>
          <div class="run-action-row">
            <button
              class="btn-primary"
              onclick={startBenchmark}
              disabled={totalModels === 0 ||
                (!$isAuthenticated && totalModels > 1) ||
                (saveResults &&
                  (!$isAuthenticated ||
                    !cpuModel.trim() ||
                    !osModel.trim() ||
                    webnnEpRequired ||
                    (isAtLeast($auth.role ?? "anonymous", "intel") &&
                      (!gpuDriverVersion.trim() || (usesWebnnNpu && !npuDriverVersion.trim())))))}
              title="Ctrl+Enter"
            >
              Run Benchmark <kbd class="kbd-hint">Ctrl+Enter</kbd>
            </button>
            {#if hasStoppedItems}
              <button class="btn-resume" onclick={resumeBenchmark} title="Re-run only the stopped items, skipping completed and errored ones">
                Resume
              </button>
            {/if}
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
                    No models selected. <a href="/inference/browse">Browse models</a> to pick one, or <a href="/inference/custom">upload your own</a>.
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </aside>

      <div class="run-main">
        {#if queue.length > 0 || results.length > 0}
          <section class="results-section">
            <BenchmarkResults {results} backends={selectedBackends} {queue} {isRunning} onretry={retryItem} />
          </section>
        {/if}

        {#if runLogs.length > 0}
          <section class="logs-section">
            <div class="logs-header">
              <span class="models-label">Logs <span class="models-count">{runLogs.length}</span></span>
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

        {#if hashModels.length > 0}
          <span class="models-label"
            >Models <span class="models-count">{totalModels}</span></span
          >
          <ul class="model-list">
            {#each hashModels as m}
              {@const ext = m.file_path.endsWith(".litertlm")
                ? "litertlm"
                : m.file_path.endsWith(".tflite")
                  ? "tflite"
                  : "onnx"}
              <li class="model-item">
                <div class="model-item-left">
                  <div class="model-item-top">
                    <span class="model-item-repo">{m.hf_model_id}</span>
                    {#if m.data_type}
                      <span class="dtype-chip" data-dtype={m.data_type}
                        >{m.data_type === "quantized"
                          ? "quant"
                          : m.data_type}</span
                      >
                    {/if}
                  </div>
                  <div class="model-item-bottom">
                    <FormatIcon
                      format={ext}
                      size={14}
                      hfModelId={m.hf_model_id}
                      filePath={m.file_path}
                    />
                    <NetronLink
                      hfModelId={m.hf_model_id}
                      filePath={m.file_path}
                    />
                    <span class="model-item-name">{m.file_path}</span>
                  </div>
                </div>
                <button class="model-item-remove" title="Remove model" onclick={() => { hashModels = hashModels.filter(x => x !== m); }}>×</button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </section>
  {/if}
</div>

<style>
  .run-page {
    max-width: 100%;
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

  .logs-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-1);
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

  .logs-container::-webkit-scrollbar {
    width: 1px;
    height: 3px;
  }

  .logs-container::-webkit-scrollbar-button {
    width: 0;
    height: 0;
    display: none;
  }

  .logs-container::-webkit-scrollbar-track {
    background: transparent;
  }

  .logs-container::-webkit-scrollbar-thumb {
    background-color: var(--color-border-strong);
    border-radius: 3px;
  }

  .logs-section:hover .logs-container::-webkit-scrollbar-thumb {
    background-color: var(--color-primary);
  }

  .log-line {
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.6;
    color: var(--color-text-muted);
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

  .run-action-row :global(.btn-primary),
  .run-action-row :global(.btn-resume) {
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

  .save-toggle-text {
    white-space: nowrap;
  }

  /* freeDimensionOverrides toggle sits in the sidebar's runtime section —
     use the compact sidebar sizing rather than the larger action-row size. */
  .fdo-toggle {
    margin-bottom: 0;
    min-height: 28px;
    font-size: var(--text-xs);
  }
  .fdo-toggle input[type="checkbox"] {
    width: 15px;
    height: 15px;
  }

  .action-hint {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    margin-top: var(--space-1);
  }

  .action-hint-list {
    list-style: none;
    padding: 0;
    margin: var(--space-1) 0 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .action-hint-list .action-hint { margin-top: 0; }

  .action-hint a {
    color: var(--color-primary);
    text-decoration: none;
  }

  .action-hint a:hover {
    text-decoration: underline;
  }

  .action-hint-warn {
    color: var(--color-warning);
  }

  .action-hint-warn a {
    color: var(--color-warning);
    font-weight: 600;
  }

  .run-controls {
    display: flex;
    justify-content: center;
    margin-top: var(--space-2);
    margin-bottom: var(--space-3);
  }

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

  .btn-resume {
    display: inline-flex;
    align-items: center;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-primary);
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-resume:hover {
    background: var(--color-accent-light);
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

  .hidden {
    display: none !important;
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

  .status-options-value {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    flex: 1;
    display: block;
    text-align: left;
    position: relative;
  }

  .status-options-row {
    min-height: 18px;
    display: flex;
    align-items: center;
  }

  .status-options-tooltip[data-tooltip]:hover::after {
    content: attr(data-tooltip);
    position: absolute;
    left: 0;
    top: calc(100% + 6px);
    z-index: 20;
    max-width: min(92vw, 760px);
    padding: 8px 10px;
    border-radius: var(--radius-base);
    border: 1px solid var(--color-border-strong);
    background: var(--color-surface-raised);
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.45;
    white-space: normal;
    word-break: break-word;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    pointer-events: none;
  }

  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

  .progress-current {
    display: inline-flex;
    align-items: center;
    color: var(--color-text-muted);
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
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 0;
  }

  /* Reserve the slot's space when hidden so the section doesn't jump
     when the download phase ends and the bar disappears. */
  .progress-bar-hidden {
    visibility: hidden;
  }

  .results-section {
    margin-bottom: var(--space-3);
  }

  .results-section-running {
    width: 90vw;
    max-width: 760px;
    margin-inline: auto;
  }

  .logs-section {
    margin-bottom: var(--space-3);
  }

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
  .run-sidebar :global(.backend-selector .config-label),
  .run-sidebar :global(.run-config .config-label) {
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

  .models-label {
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
    grid-template-columns: repeat(3, 1fr);
    gap: 3px;
  }

  @media (max-width: 1100px) {
    .model-list {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 700px) {
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
    transition:
      border-color var(--transition-base),
      background var(--transition-base);
  }

  .model-item-remove {
    flex-shrink: 0;
    font-size: 14px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
    opacity: 0;
    transition: opacity var(--transition-base), color var(--transition-base);
  }

  .model-item:hover .model-item-remove {
    opacity: 1;
  }

  .model-item-remove:hover {
    color: var(--color-error);
  }

  .model-item:hover {
    border-color: var(--color-primary);
    background: var(--color-accent-light);
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
    font-size: var(--text-xs);
    color: var(--color-text-muted);
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

  .dtype-chip {
    margin-left: auto;
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
    .sb-row {
      grid-template-columns: 76px 1fr;
    }
  }

  @media (max-width: 640px) {
    .share-row {
      width: 100%;
    }

    .btn-share,
    .btn-share-delete {
      flex: 1;
      padding: 8px 12px;
      font-size: var(--text-sm);
    }

    .actions {
      flex-direction: column;
    }

    .actions :global(.btn-primary),
    .btn-stop,
    .btn-resume {
      width: 100%;
      justify-content: center;
    }
  }
</style>
