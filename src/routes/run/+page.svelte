<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import { replaceState } from "$app/navigation";
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
    ort: string;
    litert: string;
    webnnEp: string;
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
    if (webnnEp) params.set("webnn_ep", webnnEp);
    replaceState(`#${params}`, {});
  }

  let availableBackends = $state<Backend[]>(["wasm_1"]);
  let selectedBackends = $state<Backend[]>(["webgpu"]);
  let iterations = $state(50);
  let saveResults = $state(false);
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
    if (!isRunning || !activeWriter || !currentRunItem) return;
    if (!activeWriter.hasResultId(currentRunItem)) return;

    // Best-effort sync write using fetch keepalive
    activeWriter.markCrashedSync(currentRunItem);

    // Show browser confirmation prompt — gives user a chance to cancel close
    e.preventDefault();
    e.returnValue = "";
  }

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
        webnn_capability: r.webnn_capability ?? null,
        warmup_ms: r.warmup_ms,
        iterations: r.iterations,
        iterations_completed: r.iterations_completed,
        started_at: r.started_at,
        completed_at: r.completed_at,
        inference_times: [],
      }));
      const config = { iterations, saveResults, ortVersion, litertVersion, webnnEp, cpuModel, osModel, gpuDriverVersion, npuDriverVersion, backends: selectedBackends, models: hashModels };
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
        webnnEp,
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
      queue = [...queue];
      saveRunState();
      statusText = `Testing ${item.hf_model_id}...`;

      if (writer) {
        await writer.createResult(item, config.iterations);
      }

      const runtimeVersion =
        item.runtime === "onnx" ? ortVersion : litertVersion;
      const fdo =
        item.runtime === "onnx"
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
        await writer.completeResult(item, result);
        item.status = "completed";
        runLogs = [...runLogs, `Saved ${item.hf_model_id} · ${getBackendLabel(item.backend)}`];
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
        webnnEp,
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
      queue = [...queue];
      saveRunState();
      statusText = `Testing ${item.hf_model_id}...`;

      if (writer) {
        await writer.createResult(item, config.iterations);
      }

      const runtimeVersion =
        item.runtime === 'onnx' ? ortVersion : litertVersion;
      const fdo =
        item.runtime === 'onnx'
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
        await writer.completeResult(item, result);
        item.status = 'completed';
        runLogs = [...runLogs, `Saved ${item.hf_model_id} · ${getBackendLabel(item.backend)}`];
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
        webnn_ep: webnnEp || undefined,
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
        webnnEp,
        gpuDriverVersion.trim(),
        npuDriverVersion.trim(),
      );
    }
    activeWriter = writer;
    currentRunItem = item;
    if (writer) await writer.cacheAccessToken();

    item.status = "downloading";
    queue = [...queue];
    if (writer) await writer.retryResult(item, config.iterations);

    const runtimeVersion = item.runtime === "onnx" ? ortVersion : litertVersion;
    const fdo2 =
      item.runtime === "onnx"
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
      await writer.completeResult(item, result);
      item.status = "completed";
      item.error = undefined;
      runLogs = [...runLogs, `Saved ${item.hf_model_id} · ${getBackendLabel(item.backend)}`];
      queue = [...queue];
    }

    isRunning = false;
    activeWriter = null;
    currentRunItem = null;
    statusText = result.error_message
      ? `Retry failed: ${result.error_message}`
      : "Retry complete.";
  }
</script>

<div class="run-page" class:run-page-running={isRunning}>
  <header class="page-header page-header-row" class:hidden={isRunning}>
    <div>
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
        class:progress-bar-hidden={downloadPercent <= 0 || downloadPercent >= 100}
      >
        <ProgressBar percent={downloadPercent} label="Downloading" loadedBytes={downloadLoaded} totalBytes={downloadTotal} />
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

  {#if !isRunning}
    <section class="config-section">
      <div class="top-config-grid">
        <BackendSelector
          bind:selected={selectedBackends}
          available={availableBackends}
        />
        <RunConfigCmp bind:iterations />
      </div>

      {#if saveResults || environment}
        <div class="env-rows">
          {#if saveResults}
            <div class="env-row">
              <span class="env-label"
                >CPU<span class="req-badge" class:req-done={cpuModel.trim()}
                  >req</span
                ></span
              >
              <input
                class="cpu-input"
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
          {/if}
          {#if environment}
            <div class="env-row">
              <span class="env-label">GPU</span>
              <span class="env-value">{environment.gpu}</span>
            </div>
          {/if}
          {#if saveResults}
            <div class="env-row">
              <span class="env-label"
                >GPU Driver{#if isAtLeast($auth.role ?? "anonymous", "intel")}<span
                    class="req-badge"
                    class:req-done={gpuDriverVersion.trim()}>req</span
                  >{/if}</span
              >
              <input
                class="cpu-input"
                class:input-warn={isAtLeast(
                  $auth.role ?? "anonymous",
                  "intel",
                ) && !gpuDriverVersion.trim()}
                type="text"
                placeholder="e.g. 32.0.101.8824"
                bind:value={gpuDriverVersion}
              />
            </div>
            <div class="env-row">
              <span class="env-label"
                >NPU Driver{#if isAtLeast($auth.role ?? "anonymous", "intel")}<span
                    class="req-badge"
                    class:req-done={npuDriverVersion.trim()}>req</span
                  >{/if}</span
              >
              <input
                class="cpu-input"
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
          {#if saveResults}
            <div class="env-row">
              <span class="env-label"
                >OS<span class="req-badge" class:req-done={osModel.trim()}
                  >req</span
                ></span
              >
              <input
                class="cpu-input"
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
          {/if}
          {#if environment}
            <div class="env-row">
              <span class="env-label">Browser</span>
              <span class="env-value"
                >{environment.browser} {environment.browser_version}</span
              >
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

      <div class="actions">
        <label class="save-toggle">
          <input type="checkbox" bind:checked={saveResults} />
          <span class="save-toggle-text">Upload results</span>
        </label>
        <div class="run-action-row">
          <button
            class="btn-primary"
            onclick={startBenchmark}
            disabled={totalModels === 0 ||
              (saveResults &&
                (!$isAuthenticated ||
                  !cpuModel.trim() ||
                  !osModel.trim() ||
                  (isAtLeast($auth.role ?? "anonymous", "intel") &&
                    (!gpuDriverVersion.trim() || !npuDriverVersion.trim()))))}
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
        {#if saveResults && !$isAuthenticated}
          <p class="action-hint action-hint-warn">
            <a href="/login">Sign in</a> to save results — we need an account to attribute the data.
          </p>
        {:else if saveResults && $isAuthenticated && (!cpuModel.trim() || !osModel.trim())}
          <p class="action-hint action-hint-warn">
            Fill in your CPU and OS above to enable result upload
          </p>
        {:else if saveResults && $isAuthenticated && isAtLeast($auth.role ?? "anonymous", "intel") && (!gpuDriverVersion.trim() || !npuDriverVersion.trim())}
          <p class="action-hint action-hint-warn">
            GPU Driver and NPU Driver versions are required for intel/admin roles
          </p>
        {/if}
        {#if totalModels === 0}
          <p class="action-hint">
            No models selected. <a href="/browse">Browse models</a> to pick
            one, or <a href="/custom">upload your own</a>.
          </p>
        {:else if totalModels > 1 && !$isAuthenticated}
          <p class="action-hint action-hint-warn">
            <a href="/login">Sign in</a> to run more than 1 model at a time.
          </p>
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
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }

  .run-action-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
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

  .action-hint {
    font-size: var(--text-xs);
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

  .btn-stop .kbd-hint {
    background: rgba(229, 62, 62, 0.1);
  }

  .hidden {
    display: none !important;
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
    width: 90vw;
    max-width: 760px;
    margin-inline: auto;
    display: flex;
    flex-direction: column;
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

  .progress-bar-slot {
    min-height: 20px;
  }

  .progress-bar-hidden {
    visibility: hidden;
    height: 0;
    min-height: 0;
    overflow: hidden;
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
    display: inline-flex;
    align-items: center;
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .req-badge {
    display: inline-flex;
    align-items: center;
    margin-left: 0;
    padding: 1px 4px 0 4px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-error);
    opacity: 0.85;
    transition:
      color var(--transition-base),
      border-color var(--transition-base);
  }

  .req-badge.req-done {
    color: var(--color-text-muted);
    border-color: var(--color-border);
    opacity: 0.6;
  }

  .env-value {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
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

  .cpu-input.input-warn {
    border-color: var(--color-warning, #f59e0b) !important;
  }

  .cpu-input.input-warn:focus,
  .cpu-input.input-warn:focus-visible {
    border-color: var(--color-warning, #f59e0b) !important;
    outline-color: var(--color-warning, #f59e0b);
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

  .version-select {
    color: var(--color-text-muted);
    cursor: pointer;
    width: 100%;
  }

  @media (max-width: 768px) {
    .env-rows {
      grid-template-columns: repeat(2, 1fr);
    }
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

    .env-rows {
      grid-template-columns: 1fr;
    }
    .top-config-grid {
      grid-template-columns: 1fr;
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
