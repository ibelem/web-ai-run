// inference.worker.ts must stay type:'classic' because LiteRT's Emscripten
// WASM loader calls importScripts() internally, which is unavailable in module
// workers. All helpers are inlined here rather than imported from shared/.
// llm.worker.ts uses type:'module' and imports from shared/ safely.

// ── Inlined types (no import — classic worker) ────────────────────────────

type Backend = 'wasm_1' | 'wasm_n' | 'webgpu' | 'webnn_cpu' | 'webnn_gpu' | 'webnn_npu';

interface DownloadProgress {
  model_id: string;
  file_path: string;
  loaded_bytes: number;
  total_bytes: number;
  percent: number;
}

interface BenchmarkMetrics {
  compilation_ms: number | null;
  load_and_compile_ms: number | null;
  first_inference_ms: number;
  time_to_first_ms: number;
  average_ms: number;
  median_ms: number;
  best_ms: number;
  p90_ms: number;
  throughput_fps: number;
}

interface WebNNCapability {
  partitions?: number;
  total_nodes: number;
  supported_nodes: number;
  unsupported_ops: string[];
}

interface TestItem {
  id: string;
  hf_model_id: string;
  file_path: string;
  data_type: string;
  runtime: 'onnx' | 'litert';
  backend: Backend;
  status: string;
  progress: number;
  error?: string;
}

interface TestResult {
  id: string;
  test_item: TestItem;
  metrics: BenchmarkMetrics | null;
  inference_times: number[];
  warmup_ms: number;
  iterations: number;
  iterations_completed: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  logs?: string[];
  webnn_capability?: WebNNCapability | null;
}

// ── Inlined: computeMetrics ───────────────────────────────────────────────

function computeMetrics(times: number[], compilationMs: number | null, loadAndCompileMs: number | null, firstInferenceMs: number): BenchmarkMetrics {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const p90Index = Math.ceil(sorted.length * 0.9) - 1;
  return {
    compilation_ms: compilationMs,
    load_and_compile_ms: loadAndCompileMs,
    first_inference_ms: firstInferenceMs,
    time_to_first_ms: (compilationMs ?? loadAndCompileMs ?? 0) + firstInferenceMs,
    average_ms: avg,
    median_ms: median,
    best_ms: sorted[0],
    p90_ms: sorted[p90Index],
    throughput_fps: 1000 / avg,
  };
}

// ── Inlined: WebNN console tap ────────────────────────────────────────────

interface CaptureState {
  partitions: number | undefined;
  total_nodes: number;
  supported_nodes: number;
  unsupported_ops: Set<string>;
}

const TAP_DEBUG = true;
let activeCapture: CaptureState | null = null;

function tapMessage(msg: string) {
  if (!activeCapture) return;
  const state = activeCapture;
  if (TAP_DEBUG && (msg.includes('WebNN') || msg.includes('not delegatable') || msg.includes('Unsupported'))) {
    (globalThis as any).__webnnTapDebug?.(`[TAP] ${msg.slice(0, 300)}`);
  }
  const ortM = msg.match(/number of partitions supported by WebNN:\s*(\d+)[\s\S]*?number of nodes in the graph:\s*(\d+)[\s\S]*?number of nodes supported by WebNN:\s*(\d+)/i);
  if (ortM) {
    state.partitions = +ortM[1]; state.total_nodes = +ortM[2]; state.supported_nodes = +ortM[3];
    if (TAP_DEBUG) (globalThis as any).__webnnTapDebug?.(`[TAP-MATCH-ORT-CAP] partitions=${ortM[1]} total=${ortM[2]} supported=${ortM[3]}`);
    return;
  }
  const ortOp = msg.match(/Unsupported (?:operator|op(?:\s+type)?)\s*:?\s*(\w+)/i);
  if (ortOp) { state.unsupported_ops.add(ortOp[1]); if (TAP_DEBUG) (globalThis as any).__webnnTapDebug?.(`[TAP-MATCH-ORT-OP] op=${ortOp[1]}`); return; }
  const litertM = msg.match(/number of nodes in the graph[:\s]+(\d+)[\s,]+number of nodes supported by WebNN[:\s]+(\d+)/i);
  if (litertM) { state.total_nodes = +litertM[1]; state.supported_nodes = +litertM[2]; return; }
  const litertOp = msg.match(/\b([A-Z][A-Z0-9_]+)\s+not delegatable:[\s\S]*?Unsupported op/);
  if (litertOp) { state.unsupported_ops.add(litertOp[1]); }
}

function stringifyArgs(args: any[]): string {
  return args.map(a => { if (typeof a === 'string') return a; try { return JSON.stringify(a); } catch { return String(a); } }).join(' ');
}

{
  const orig = {
    log: console.log.bind(console), info: console.info.bind(console),
    warn: console.warn.bind(console), error: console.error.bind(console),
    debug: console.debug.bind(console), trace: console.trace.bind(console),
  };
  (globalThis as any).__webnnTapDebug = (msg: string) => orig.log(msg);
  const wrap = (fn: (...a: any[]) => void) => (...args: any[]) => {
    if (activeCapture) { try { tapMessage(stringifyArgs(args)); } catch {} }
    fn(...args);
  };
  console.log = wrap(orig.log); console.info = wrap(orig.info);
  console.warn = wrap(orig.warn); console.error = wrap(orig.error);
  console.debug = wrap(orig.debug); console.trace = wrap(orig.trace);
}

function startWebNNCapture(): { state: CaptureState; restore: () => void } {
  const state: CaptureState = { partitions: undefined, total_nodes: 0, supported_nodes: 0, unsupported_ops: new Set() };
  activeCapture = state;
  return { state, restore: () => { if (activeCapture === state) activeCapture = null; } };
}

function finalizeCapture(state: CaptureState, backend: Backend): WebNNCapability | null {
  if (TAP_DEBUG) (globalThis as any).__webnnTapDebug?.(`[TAP-FINALIZE] backend=${backend} total=${state.total_nodes} supported=${state.supported_nodes} ops=${[...state.unsupported_ops].join(',')} partitions=${state.partitions}`);
  if (!backend.startsWith('webnn_')) return null;
  if (state.total_nodes === 0 && state.supported_nodes === 0 && state.unsupported_ops.size === 0 && state.partitions === undefined) return null;
  const out: WebNNCapability = { total_nodes: state.total_nodes, supported_nodes: state.supported_nodes, unsupported_ops: [...state.unsupported_ops].sort() };
  if (state.partitions !== undefined) out.partitions = state.partitions;
  return out;
}

// ── Inlined: HF base / OPFS / download ───────────────────────────────────
// Classic worker — can't import from ./shared/download (see top-of-file note),
// so this download stack is inlined. The LLM module worker uses ./shared for
// the getHfBase/OPFS primitives; keep any shared-primitive changes in sync.

const HF_MAIN = 'https://huggingface.co';
const HF_MIRROR = 'https://hf-mirror.com';
const HF_TEST_PATH = '/webml/models-moved/resolve/main/01.onnx';
const HF_BASE_TTL_MS = 10 * 60 * 1000;
let cachedHfBase: string | null = null;
let cachedHfBaseAt = 0;

async function getHfBase(): Promise<string> {
  if (cachedHfBase && Date.now() - cachedHfBaseAt < HF_BASE_TTL_MS) return cachedHfBase;
  const check = async (base: string): Promise<boolean> => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    try { const r = await fetch(`${base}${HF_TEST_PATH}`, { method: 'HEAD', signal: ctrl.signal, cache: 'no-store' }); clearTimeout(t); return r.ok; }
    catch { clearTimeout(t); return false; }
  };
  if (await check(HF_MAIN)) { cachedHfBase = HF_MAIN; cachedHfBaseAt = Date.now(); return HF_MAIN; }
  if (await check(HF_MIRROR)) { cachedHfBase = HF_MIRROR; cachedHfBaseAt = Date.now(); return HF_MIRROR; }
  cachedHfBase = HF_MAIN; cachedHfBaseAt = Date.now(); return HF_MAIN;
}

function sanitizeFileName(s: string): string { return s.replace(/[^a-zA-Z0-9._-]/g, '--'); }

async function getFromOPFS(fileName: string): Promise<ArrayBuffer | null> {
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('models', { create: true });
    const fh = await dir.getFileHandle(fileName);
    return (await fh.getFile()).arrayBuffer();
  } catch { return null; }
}

async function saveToOPFS(fileName: string, data: ArrayBuffer): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('models', { create: true });
    const fh = await dir.getFileHandle(fileName, { create: true });
    const w = await fh.createWritable();
    await w.write(data); await w.close();
  } catch {}
}

interface DownloadedBundle { modelBuffer: ArrayBuffer; externalData: { path: string; data: ArrayBuffer }[]; }

async function downloadFromHostInline(base: string, hfModelId: string, filePath: string, onProgress: (l: number, t: number, fp: string) => void, agg?: { total: number; prior: number }): Promise<{ arrayBuffer: ArrayBuffer; cacheKey: string; useCache: boolean }> {
  const url = `${base}/${hfModelId}/resolve/main/${filePath}`;
  let etag = '', headOk = false, expectedSize = 0;
  try { const h = await fetch(url, { method: 'HEAD' }); if (h.ok) { headOk = true; etag = (h.headers.get('etag') ?? '').replace(/"/g, ''); expectedSize = Number(h.headers.get('content-length') ?? 0); } } catch {}
  const useCache = headOk && etag !== '';
  const cacheKey = useCache ? sanitizeFileName(`${hfModelId}--${filePath}--${etag}`) : '';
  if (useCache) {
    const cached = await getFromOPFS(cacheKey);
    if (cached && !(expectedSize > 0 && cached.byteLength !== expectedSize)) return { arrayBuffer: cached, cacheKey, useCache };
  }
  const res = await fetch(url); if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const contentLength = Number(res.headers.get('content-length') ?? 0);
  const reader = res.body!.getReader();
  let arrayBuffer: ArrayBuffer;
  if (contentLength > 0) {
    // Known size: stream directly into one pre-sized buffer. Holding the
    // streamed chunks AND then allocating a second full-size buffer to
    // concatenate doubled peak memory (~2× file size) and OOM'd multi-GB
    // external-data files with "Array buffer allocation failed".
    const buf = new Uint8Array(contentLength); let loaded = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      if (loaded + value.byteLength > contentLength) throw new Error(`Size mismatch: received more than ${contentLength} bytes`);
      buf.set(value, loaded); loaded += value.byteLength;
      onProgress(agg ? agg.prior + loaded : loaded, agg ? agg.total : contentLength, filePath);
    }
    if (loaded !== contentLength) throw new Error(`Truncated: ${loaded}/${contentLength}`);
    arrayBuffer = buf.buffer;
  } else {
    // Unknown size (no content-length): accumulate chunks, then concatenate.
    const chunks: Uint8Array[] = []; let loaded = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      chunks.push(value); loaded += value.byteLength;
      onProgress(agg ? agg.prior + loaded : loaded, agg ? agg.total : contentLength, filePath);
    }
    const buf = new Uint8Array(loaded); let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
    arrayBuffer = buf.buffer;
  }
  return { arrayBuffer, cacheKey, useCache };
}

async function probeSidecars(base: string, hfModelId: string, mainFilePath: string): Promise<string[]> {
  const fileBase = mainFilePath.replace(/\.onnx$/, '');
  const probe = async (p: string) => { try { return (await fetch(`${base}/${hfModelId}/resolve/main/${p}`, { method: 'HEAD' })).ok; } catch { return false; } };
  const sidecars: string[] = [];
  // Single-file external data: model.onnx_data
  if (await probe(`${fileBase}.onnx_data`)) sidecars.push(`${fileBase}.onnx_data`);
  // Sharded external data: model.onnx_data_1 .. _N (1-based). These can exist
  // WITHOUT a base .onnx_data, so probe them independently of the check above.
  for (let i = 1; i <= 99; i++) {
    const np = `${fileBase}.onnx_data_${i}`;
    if (await probe(np)) sidecars.push(np);
    else break;
  }
  return sidecars;
}

async function downloadModel(hfModelId: string, filePath: string, id: string): Promise<DownloadedBundle> {
  const primary = await getHfBase();
  const fallback = primary === HF_MAIN ? HF_MIRROR : HF_MAIN;
  const sidecarPaths = filePath.endsWith('.onnx') ? await probeSidecars(primary, hfModelId, filePath) : [];
  if (sidecarPaths.length > 0) log(id, `Found ${sidecarPaths.length} sidecar(s): ${sidecarPaths.join(', ')}`);

  let totalBytes = 0;
  for (const p of [filePath, ...sidecarPaths]) {
    try { totalBytes += Number((await fetch(`${primary}/${hfModelId}/resolve/main/${p}`, { method: 'HEAD' })).headers.get('content-length') ?? 0); } catch {}
  }

  const tryDownload = async (base: string, fp: string, priorBytes: number) => {
    try { return await downloadFromHostInline(base, hfModelId, fp, (l, t, fp2) => post({ type: 'progress', id, progress: { model_id: hfModelId, file_path: fp2, loaded_bytes: l, total_bytes: t, percent: t > 0 ? (l / t) * 100 : 0 } }), totalBytes > 0 ? { total: totalBytes, prior: priorBytes } : undefined); }
    catch (e1: any) {
      // An out-of-memory error (RangeError: Array buffer allocation failed) is
      // a local resource limit, not a host problem — the bytes already arrived.
      // Retrying the mirror just re-downloads the same file and fails the same
      // way, so fail fast with a clear message instead.
      if (e1 instanceof RangeError || /allocation failed/i.test(e1?.message ?? '')) {
        throw new Error(`Out of memory loading ${fp}: ${e1?.message}. The file is too large to hold in memory on this device/browser.`);
      }
      log(id, `Primary ${base} failed: ${e1?.message}; retrying ${fallback}`);
      cachedHfBase = null; cachedHfBaseAt = 0;
      try { const r = await downloadFromHostInline(fallback, hfModelId, fp, (l, t, fp2) => post({ type: 'progress', id, progress: { model_id: hfModelId, file_path: fp2, loaded_bytes: l, total_bytes: t, percent: t > 0 ? (l / t) * 100 : 0 } }), totalBytes > 0 ? { total: totalBytes, prior: priorBytes } : undefined); cachedHfBase = fallback; cachedHfBaseAt = Date.now(); return r; }
      catch (e2: any) { throw new Error(`Both hosts failed: ${e1?.message} / ${e2?.message}`); }
    }
  };

  let priorBytes = 0;
  const mainResult = await tryDownload(primary, filePath, priorBytes);
  if (mainResult.useCache) { await saveToOPFS(mainResult.cacheKey, mainResult.arrayBuffer); log(id, `Saved ${filePath} to OPFS cache`); }
  else log(id, `HEAD unavailable — bypassing OPFS cache for ${filePath}`);
  priorBytes += mainResult.arrayBuffer.byteLength;

  const externalData: { path: string; data: ArrayBuffer }[] = [];
  for (const sp of sidecarPaths) {
    const r = await tryDownload(primary, sp, priorBytes);
    if (r.useCache) { await saveToOPFS(r.cacheKey, r.arrayBuffer); log(id, `Saved ${sp} to OPFS cache`); }
    const name = sp.includes('/') ? sp.slice(sp.lastIndexOf('/') + 1) : sp;
    externalData.push({ path: name, data: r.arrayBuffer });
    priorBytes += r.arrayBuffer.byteLength;
  }
  return { modelBuffer: mainResult.arrayBuffer, externalData };
}

// ── Worker types ──────────────────────────────────────────────────────────

interface WorkerRequest {
  type: 'run';
  id: string;
  modelSource:
    | { kind: 'url'; hfModelId: string; filePath: string }
    | { kind: 'buffer'; fileName: string; buffer: ArrayBuffer; externalData?: { path: string; data: ArrayBuffer }[] };
  runtime: 'onnx' | 'litert';
  backend: Backend;
  iterations: number;
  warmupRuns: number;
  runtimeVersion: string;
  freeDimensionOverrides?: Record<string, number>;
}

type WorkerResponse =
  | { type: 'progress'; id: string; progress: DownloadProgress }
  | { type: 'status'; id: string; status: string }
  | { type: 'logs'; id: string; logs: string[] }
  | { type: 'session-options'; id: string; sessionOptions: unknown }
  | { type: 'result'; id: string; result: TestResult };

let litertLoaded = false;
let litertMode: string | null = null;
let litertLoadedVersion: string | null = null;

function getOrtDistUrls(runtimeVersion: string): { moduleUrl: string; wasmBase: string } {
  if (/^https?:\/\//i.test(runtimeVersion)) {
    const moduleUrl = runtimeVersion;
    const wasmBase = moduleUrl.slice(0, moduleUrl.lastIndexOf('/') + 1);
    return { moduleUrl, wasmBase };
  }
  const wasmBase = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${runtimeVersion}/dist/`;
  return { moduleUrl: `${wasmBase}ort.jspi.min.mjs`, wasmBase };
}

function getLiteRtCdnUrl(version: string): string {
  return `https://esm.sh/@litertjs/core@${version}`;
}

function getOrtExecutionProvider(backend: Backend): any {
  switch (backend) {
    case 'wasm_1': return { name: 'wasm', numThreads: 1 };
    case 'wasm_n': return { name: 'wasm' };
    case 'webgpu': return { name: 'webgpu' };
    case 'webnn_cpu': return { name: 'webnn', deviceType: 'cpu' };
    case 'webnn_gpu': return { name: 'webnn', deviceType: 'gpu' };
    case 'webnn_npu': return { name: 'webnn', deviceType: 'npu' };
  }
}

function post(msg: WorkerResponse) {
  self.postMessage(msg);
}

function ts(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

let logBuffer: string[] = [];

function log(id: string, msg: string) {
  logBuffer.push(`${ts()} ${msg}`);
}

function sendStatus(id: string, msg: string) {
  const line = `${ts()} ${msg}`;
  logBuffer.push(line);
  post({ type: 'status', id, status: line });
}

function flushLogs(id: string) {
  if (logBuffer.length === 0) return;
  post({ type: 'logs', id, logs: logBuffer });
  logBuffer = [];
}

async function runOrt(req: WorkerRequest, bundle: DownloadedBundle): Promise<TestResult> {
  const { modelBuffer, externalData } = bundle;
  const { id, backend, iterations, warmupRuns, runtimeVersion } = req;
  const startedAt = new Date().toISOString();
  const fileName = req.modelSource.kind === 'buffer' ? req.modelSource.fileName : req.modelSource.filePath;
  const hfModelId = req.modelSource.kind === 'buffer' ? 'local' : req.modelSource.hfModelId;

  sendStatus(id, `Loading ONNX Runtime Web v${runtimeVersion}...`);
  const { moduleUrl, wasmBase } = getOrtDistUrls(runtimeVersion);
  const ort = await import(/* @vite-ignore */ moduleUrl);
  ort.env.wasm.wasmPaths = wasmBase;
  ort.env.logLevel = 'verbose';
  ort.env.debug = false;

  if (backend === 'wasm_n') {
    ort.env.wasm.numThreads = 4;
  } else {
    ort.env.wasm.numThreads = 1;
  }
  ort.env.wasm.simd = true;

  const enableMLTensor = false;

  sendStatus(id, `Creating inference session with ${backend} backend`);
  const compilationStart = performance.now();
  const executionProvider = getOrtExecutionProvider(backend);
  const sessionOptions: any = {
    executionProviders: [executionProvider],
    logSeverityLevel: 0,
    logVerbosityLevel: 0,
  };

  if (backend === 'webgpu' && enableMLTensor) {
    sessionOptions.preferredOutputLocation = 'gpu-buffer';
  }
  if (backend === 'webnn_gpu' && enableMLTensor) {
    sessionOptions.preferredOutputLocation = 'ml-tensor';
  }

  // WebNN requires fully-static shapes at MLGraph compile time, so dynamic dims
  // (e.g. "batch_size") must be resolved here. WebGPU/WASM handle dynamic shapes
  // at runtime in their kernels and don't need this.
  if (backend.startsWith('webnn_') && req.freeDimensionOverrides && Object.keys(req.freeDimensionOverrides).length > 0) {
    sessionOptions.freeDimensionOverrides = req.freeDimensionOverrides;
    log(id, `freeDimensionOverrides: ${JSON.stringify(req.freeDimensionOverrides)}`);
  }

  if (externalData.length > 0) {
    // ORT Web expects each entry's `data` as a Uint8Array (or path/URL string),
    // not a bare ArrayBuffer. Wrap so both the upload and URL-download paths
    // hand it the documented type.
    sessionOptions.externalData = externalData.map((e) => ({ path: e.path, data: new Uint8Array(e.data) }));
    log(id, `External data: ${externalData.map(e => e.path).join(', ')}`);
  }

  // Report the exact sessionOptions passed to InferenceSession.create() so the
  // page can surface them. Swap the externalData ArrayBuffers for their path
  // strings — the buffers aren't meaningfully displayable and bloat the message.
  // Log level fields are noise for display, so omit them.
  const { logSeverityLevel: _lsl, logVerbosityLevel: _lvl, ...displaySessionOptions } = sessionOptions as any;
  if (sessionOptions.externalData) {
    displaySessionOptions.externalData = sessionOptions.externalData.map((e: any) => e.path);
  }
  post({ type: 'session-options', id, sessionOptions: displaySessionOptions });

  const captureWebnn = backend.startsWith('webnn_');
  const cap = captureWebnn ? startWebNNCapture() : null;

  let session: any;
  try {
    session = await ort.InferenceSession.create(modelBuffer, sessionOptions);
  } catch (e) {
    cap?.restore();
    throw e;
  }
  const compilationMs = performance.now() - compilationStart;
  log(id, `Compilation Time: ${compilationMs.toFixed(2)} ms`);

  const feeds: Record<string, any> = {};
  for (const name of session.inputNames) {
    // inputMetadata may be a Record<string, ...> (ORT spec), an array of {name, ...}
    // objects, or a Map-like in some ORT-Web versions. Handle all three shapes.
    const meta = session.inputMetadata;
    let inputMeta: any;
    if (Array.isArray(meta)) inputMeta = meta.find((m: any) => m.name === name);
    else if (meta && typeof meta.get === 'function') inputMeta = meta.get(name);
    else inputMeta = meta?.[name];

    // If the model declares an input but we have no metadata for it, skip it. ORT
    // will surface "missing input X" — a clearer failure than guessing a vision
    // shape like [1, 3, 224, 224] for what might actually be e.g. an attention mask.
    if (!inputMeta) {
      log(id, `Skipping input "${name}" — no metadata available; ORT will report if it's required`);
      continue;
    }

    // ORT Web uses `dims`; some builds surface `shape` with string dynamic-dim names (e.g. "batch_size")
    const rawDims: (number | string)[] = inputMeta.dims ?? inputMeta.shape ?? [];
    const freeDims: Record<string, number> = req.freeDimensionOverrides ?? {};
    // Resolve dynamic dims: named strings use freeDimensionOverrides if set, then fall back to 1.
    // Numeric -1 is just "dynamic" — there's no name to look up, so default to 1.
    const dims: number[] = rawDims.map((d: number | string) => {
      if (typeof d === 'string') return freeDims[d] ?? 1;
      return d < 0 ? 1 : d;
    });
    const type = inputMeta?.type ?? 'float32';
    const size = Math.max(0, dims.reduce((a: number, b: number) => a * b, 1));
    // Pick the typed array that matches the tensor's element type. ORT Web's Tensor
    // constructor expects exactly the right buffer kind — passing Float32Array for
    // an int64 tensor (or vice-versa) throws or silently produces garbage.
    let typedArray: any;
    switch (type) {
      case 'float32': typedArray = Float32Array; break;
      case 'float64': typedArray = Float64Array; break;
      case 'float16':
        // Newer browsers/ORT versions support Float16Array natively; older ones
        // expect a Uint16Array carrying the raw float16 bit pattern. Fill with zeros
        // either way — values don't matter for benchmarking, just shape.
        typedArray = (typeof (globalThis as any).Float16Array !== 'undefined')
          ? (globalThis as any).Float16Array : Uint16Array;
        break;
      case 'int4':    typedArray = Int8Array;    break; // packed 2-per-byte; ORT accepts Int8Array
      case 'int8':    typedArray = Int8Array;    break;
      case 'int16':   typedArray = Int16Array;   break;
      case 'int32':   typedArray = Int32Array;   break;
      case 'int64':   typedArray = BigInt64Array; break;
      case 'uint8':   typedArray = Uint8Array;   break;
      case 'uint16':  typedArray = Uint16Array;  break;
      case 'uint32':  typedArray = Uint32Array;  break;
      case 'uint64':  typedArray = BigUint64Array; break;
      case 'bool':    typedArray = Uint8Array;   break;
      default:        typedArray = Float32Array; break;
    }
    let data: any;
    if (type === 'int64' || type === 'uint64') {
      data = typedArray.from({ length: size }, () => BigInt(0));
    } else if (type === 'float32' || type === 'float64' || type === 'float16') {
      data = typedArray.from({ length: size }, () => Math.random());
    } else {
      // Integer / bool types: zero-fill is safe and matches the reference (Math.random()
      // would truncate to 0 anyway for Int8/Uint8/etc.).
      data = new typedArray(size);
    }
    feeds[name] = new ort.Tensor(type, data, dims);
  }

  let webgpuDevice: any = null;
  if (backend === 'webgpu' && enableMLTensor) {
    webgpuDevice = ort.env.webgpu.device;
  }

  let firstInferenceMs = 0;
  let webnn_capability: WebNNCapability | null = null;
  const warmupTimes: number[] = [];
  const inferenceTimes: number[] = [];
  const total = warmupRuns + iterations;
  const progressStep = Math.max(1, Math.floor(iterations / 10));

  if (warmupRuns > 0) {
    sendStatus(id, `Warming up (${warmupRuns} run${warmupRuns !== 1 ? 's' : ''})...`);
  } else {
    sendStatus(id, `Inferencing 0/${iterations}...`);
  }

  try {
    for (let i = 0; i < total; i++) {
      const t0 = performance.now();
      const result = await session.run(feeds);
      if (backend === 'webgpu' && enableMLTensor && webgpuDevice) {
        await webgpuDevice.queue.onSubmittedWorkDone();
      }
      if (backend === 'webnn_gpu' && enableMLTensor && i === total - 1) {
        const promises = session.outputNames.map((name: string) => result[name].getData());
        await Promise.all(promises);
      }
      const elapsed = performance.now() - t0;

      if (i === 0) {
        // First run ever (warmup or benchmark) — WebNN delegate has logged everything.
        firstInferenceMs = elapsed;
        if (cap) { cap.restore(); webnn_capability = finalizeCapture(cap.state, backend); }
      }

      if (i < warmupRuns) {
        warmupTimes.push(elapsed);
        // Switch to "Inferencing" status when warmup finishes
        if (i === warmupRuns - 1 && iterations > 0) {
          sendStatus(id, `Inferencing 0/${iterations}...`);
        }
      } else {
        inferenceTimes.push(elapsed);
        const benchI = i - warmupRuns;
        if ((benchI + 1) % progressStep === 0 || benchI === iterations - 1) {
          sendStatus(id, `Inferencing ${benchI + 1}/${iterations}...`);
        }
      }
    }
  } finally {
    // Always release the session — even on a mid-run throw — to avoid leaking the
    // ORT session handle when the worker is reused for another request.
    try { await session.release(); } catch {}
    // Make sure console wrappers are always restored, even on early exit.
    cap?.restore();
  }

  log(id, `First Inference Time: ${firstInferenceMs.toFixed(2)} ms`);
  log(id, `Time to First Inference: ${(compilationMs + firstInferenceMs).toFixed(2)} ms`);

  const metrics = computeMetrics(inferenceTimes, compilationMs, null, firstInferenceMs);
  const dataType = fileName.includes('fp16') ? 'fp16' : 'fp32';
  const totalMs = inferenceTimes.reduce((a, b) => a + b, 0);

  log(id, `Inference times (ms): [${inferenceTimes.map(t => t.toFixed(2)).join(', ')}]`);
  log(id, `Average: ${metrics.average_ms.toFixed(2)} ms`);
  log(id, `Median: ${metrics.median_ms.toFixed(2)} ms`);
  log(id, `Best: ${metrics.best_ms.toFixed(2)} ms`);
  log(id, `P90: ${metrics.p90_ms.toFixed(2)} ms`);
  log(id, `Total (${iterations} runs): ${totalMs.toFixed(2)} ms`);
  log(id, `Throughput: ${metrics.throughput_fps.toFixed(2)} FPS`);
  log(id, `Test ${hfModelId} (${dataType}) with ${backend} backend completed`);
  flushLogs(id);

  return {
    id,
    test_item: { id, hf_model_id: hfModelId, file_path: fileName, data_type: dataType, runtime: 'onnx', backend, status: 'completed', progress: 100 },
    metrics,
    inference_times: inferenceTimes,
    warmup_ms: firstInferenceMs,
    iterations,
    iterations_completed: iterations,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    error_message: null,
    webnn_capability,
  };
}

async function runLiteRt(req: WorkerRequest, bundle: DownloadedBundle): Promise<TestResult> {
  const { modelBuffer } = bundle; // LiteRT.js doesn't support external data
  const { id, backend, iterations, warmupRuns, runtimeVersion } = req;
  const startedAt = new Date().toISOString();
  const fileName = req.modelSource.kind === 'buffer' ? req.modelSource.fileName : req.modelSource.filePath;
  const hfModelId = req.modelSource.kind === 'buffer' ? 'local' : req.modelSource.hfModelId;

  sendStatus(id, `Loading LiteRT.js v${runtimeVersion}...`);
  const url = getLiteRtCdnUrl(runtimeVersion);
  const litert = await import(/* @vite-ignore */ url);

  const isWebNN = backend.startsWith('webnn_');
  const isWebGPU = backend === 'webgpu';
  const needsJspi = isWebNN || isWebGPU;
  const needsThreads = backend === 'wasm_n';

  if (litert.loadLiteRt) {
    const wasmRoot = `https://cdn.jsdelivr.net/npm/@litertjs/core@${runtimeVersion}/wasm`;
    const requiredMode = needsJspi ? 'jspi' : (needsThreads ? 'threaded' : 'standard');

    if (litertLoaded && (litertMode !== requiredMode || litertLoadedVersion !== runtimeVersion)) {
      log(id, `Reloading LiteRT WASM (${litertLoadedVersion} → ${runtimeVersion}, ${litertMode} → ${requiredMode})...`);
      try { litert.unloadLiteRt(); } catch {}
      litertLoaded = false;
      litertMode = null;
      litertLoadedVersion = null;
    }

    if (!litertLoaded) {
      log(id, `Loading LiteRT WASM (${requiredMode})...`);
      // Emscripten in a worker resolves .wasm and pthread worker JS relative to
      // self.location.href (our inference worker URL, not the CDN).
      // - locateFile: redirects .wasm binary fetches to the CDN
      // - mainScriptUrlOrBlob: redirects pthread sub-worker spawning to the CDN
      //   threaded JS file (otherwise pthreads load our inference worker as their
      //   host script and hang waiting for an em-pthread init that never arrives)
      const moduleOverrides: Record<string, any> = {
        locateFile: (path: string) => `${wasmRoot}/${path}`,
      };
      if (needsThreads) {
        // Workers can't be spawned from a cross-origin URL even if it's CORS-accessible.
        // Fetch the threaded JS as text and create a same-origin blob URL for pthreads.
        const threadedJsUrl = `${wasmRoot}/litert_wasm_threaded_internal.js`;
        const resp = await fetch(threadedJsUrl);
        const text = await resp.text();
        moduleOverrides['mainScriptUrlOrBlob'] = URL.createObjectURL(
          new Blob([text], { type: 'application/javascript' })
        );
      }
      (globalThis as any).Module = moduleOverrides;
      try {
        if (needsJspi) {
          await litert.loadLiteRt(wasmRoot, { jspi: true });
        } else if (needsThreads) {
          await litert.loadLiteRt(wasmRoot, { threads: true });
        } else {
          await litert.loadLiteRt(wasmRoot, { threads: false });
        }
        litertLoaded = true;
        litertMode = requiredMode;
        litertLoadedVersion = runtimeVersion;
      } catch (e: any) {
        if (e?.message?.includes('already load')) {
          litertLoaded = true;
          litertMode = requiredMode;
          litertLoadedVersion = runtimeVersion;
        } else {
          throw e;
        }
      } finally {
        (globalThis as any).Module = undefined;
      }
    }
  }

  sendStatus(id, `Compiling model with ${backend} backend...`);
  const compilationStart = performance.now();
  const compileOpts: any = { accelerator: 'wasm' };
  if (isWebGPU) {
    compileOpts.accelerator = 'webgpu';
  } else if (isWebNN) {
    compileOpts.accelerator = 'webnn';
    const deviceType = backend.replace('webnn_', '');
    compileOpts.webNNOptions = { devicePreference: deviceType };
  }

  const captureWebnn = isWebNN;
  const cap = captureWebnn ? startWebNNCapture() : null;

  let model: any;
  try {
    model = await litert.loadAndCompile(new Uint8Array(modelBuffer), compileOpts);
  } catch (e) {
    cap?.restore();
    throw e;
  }
  const compilationMs = performance.now() - compilationStart;
  log(id, `Load+Compile Time: ${compilationMs.toFixed(2)} ms`);

  let inputDetails: any[] = [];
  if (model.primarySignature?.getInputDetails) {
    inputDetails = model.primarySignature.getInputDetails();
  } else if (model.getInputDetails) {
    inputDetails = model.getInputDetails();
  }

  // LiteRT.js officially supports only float32 / int32 / uint8 (see
  // references/LiteRT/.../datatypes.ts). The Tensor constructor INFERS dtype from
  // the TypedArray's class — passing a Float32Array with dtype='int32' silently
  // creates a float32 tensor, which then mismatches the model and crashes run().
  // So the dtype string we pass is documentation; the typed-array choice is
  // what actually matters.
  const SUPPORTED_DTYPES = new Set(['float32', 'int32', 'uint8']);
  const createTensors = () => {
    const tensors: any[] = [];
    for (const input of inputDetails) {
      const shape = Array.from(input.shape ?? [1, 224, 224, 3]) as number[];
      const name = (input.name ?? '').toLowerCase();
      let dtype = (input.dtype ?? input.type ?? 'float32').toLowerCase();
      if (!SUPPORTED_DTYPES.has(dtype)) dtype = 'float32';
      const size = shape.reduce((a: number, b: number) => a * Math.abs(b), 1);

      // Mask / segment / token_type / frame_count inputs typically expect 1s
      // (attend to everything, single segment, frame index 1, etc.).
      const needsOnes = name.includes('mask') || name.includes('segment') ||
        name.includes('token_type') || name.includes('frame_count');

      // Build the TypedArray that matches the resolved dtype. LiteRT will infer
      // the tensor's element type from this constructor.
      let data: any;
      if (dtype === 'int32') {
        data = needsOnes
          ? new Int32Array(size).fill(1)
          // Random int32 values tend to OOB embedding tables and produce model
          // crashes, so use 0 by default — safe and consistent across runs.
          : new Int32Array(size);
      } else if (dtype === 'uint8') {
        data = needsOnes
          ? new Uint8Array(size).fill(1)
          // For quantized vision models, uint8 pixels in 0..255 are valid; use
          // random bytes which exercise the full range.
          : Uint8Array.from({ length: size }, () => Math.floor(Math.random() * 256));
      } else {
        data = needsOnes
          ? new Float32Array(size).fill(1)
          : Float32Array.from({ length: size }, () => Math.random());
      }
      tensors.push(new litert.Tensor(data, shape, dtype));
    }
    if (tensors.length === 0) {
      const data = Float32Array.from({ length: 1 * 224 * 224 * 3 }, () => Math.random());
      tensors.push(new litert.Tensor(data, [1, 224, 224, 3], 'float32'));
    }
    return tensors;
  };

  // For WASM/WebNN, create base tensors once and reuse; for WebGPU, create fresh each iteration
  let baseTensors: any[] | null = null;
  if (!isWebGPU) {
    baseTensors = createTensors();
  }

  let firstInferenceMs = 0;
  let webnn_capability: WebNNCapability | null = null;
  const warmupTimes: number[] = [];
  const inferenceTimes: number[] = [];
  const total = warmupRuns + iterations;
  const progressStep2 = Math.max(1, Math.floor(iterations / 10));

  if (warmupRuns > 0) {
    sendStatus(id, `Warming up (${warmupRuns} run${warmupRuns !== 1 ? 's' : ''})...`);
  } else {
    sendStatus(id, `Inferencing 0/${iterations}...`);
  }

  try {
    for (let i = 0; i < total; i++) {
      let inputTensors: any[];
      if (isWebGPU) {
        inputTensors = createTensors();
      } else {
        inputTensors = baseTensors!;
      }

      const gpuTensors: any[] = [];
      let processedInputs: any[];
      if (isWebGPU) {
        processedInputs = [];
        for (const tensor of inputTensors) {
          const gpuTensor = await tensor.moveTo('webgpu');
          gpuTensors.push(gpuTensor);
          processedInputs.push(gpuTensor);
        }
      } else {
        processedInputs = inputTensors;
      }

      const t0 = performance.now();
      const outputs = await model.run(processedInputs);
      if (isWebGPU) {
        for (const result of (Array.isArray(outputs) ? outputs : [outputs])) {
          const cpuResult = await result.moveTo('wasm');
          cpuResult.delete?.();
        }
      }
      const elapsed = performance.now() - t0;

      if (i === 0) {
        // First run ever — WebNN delegate has logged everything it will. Restore capture.
        firstInferenceMs = elapsed;
        if (cap) { cap.restore(); webnn_capability = finalizeCapture(cap.state, backend); }
      }

      if (i < warmupRuns) {
        warmupTimes.push(elapsed);
        if (i === warmupRuns - 1 && iterations > 0) {
          sendStatus(id, `Inferencing 0/${iterations}...`);
        }
      } else {
        inferenceTimes.push(elapsed);
        const benchI = i - warmupRuns;
        if ((benchI + 1) % progressStep2 === 0 || benchI === iterations - 1) {
          sendStatus(id, `Inferencing ${benchI + 1}/${iterations}...`);
        }
      }

      // Cleanup per-iteration
      if (isWebGPU) {
        gpuTensors.forEach((t: any) => t.delete?.());
        inputTensors.forEach((t: any) => { try { t.delete?.(); } catch {} });
      }
      if (!isWebGPU && Array.isArray(outputs)) outputs.forEach((t: any) => t.delete?.());
    }

    log(id, `Warmup times: [${warmupTimes.map(t => t.toFixed(2)).join(', ')}] ms`);
  } finally {
    // Always release WASM-allocated resources, even on a mid-run throw — otherwise
    // the worker leaks LiteRT tensor buffers and the model handle into the heap.
    if (baseTensors) {
      for (const t of baseTensors) {
        try { t.delete?.(); } catch {}
      }
    }
    try { model.delete?.(); } catch {}
    // Make sure console wrappers are always restored, even on early exit.
    cap?.restore();
  }
  log(id, `First Inference Time: ${firstInferenceMs.toFixed(2)} ms`);
  log(id, `Time to First Inference: ${(compilationMs + firstInferenceMs).toFixed(2)} ms`);
  const metrics = computeMetrics(inferenceTimes, null, compilationMs, firstInferenceMs);
  const dataType = fileName.includes('fp16') ? 'fp16' : 'fp32';
  const totalMs = inferenceTimes.reduce((a, b) => a + b, 0);

  log(id, `Inference times (ms): [${inferenceTimes.map(t => t.toFixed(2)).join(', ')}]`);
  log(id, `Average: ${metrics.average_ms.toFixed(2)} ms`);
  log(id, `Median: ${metrics.median_ms.toFixed(2)} ms`);
  log(id, `Best: ${metrics.best_ms.toFixed(2)} ms`);
  log(id, `P90: ${metrics.p90_ms.toFixed(2)} ms`);
  log(id, `Total (${iterations} runs): ${totalMs.toFixed(2)} ms`);
  log(id, `Throughput: ${metrics.throughput_fps.toFixed(2)} FPS`);
  log(id, `Test ${hfModelId} (${dataType}) with ${backend} backend completed`);
  flushLogs(id);

  return {
    id,
    test_item: { id, hf_model_id: hfModelId, file_path: fileName, data_type: dataType, runtime: 'litert', backend, status: 'completed', progress: 100 },
    metrics,
    inference_times: inferenceTimes,
    warmup_ms: firstInferenceMs,
    iterations,
    iterations_completed: iterations,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    error_message: null,
    webnn_capability,
  };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (!req || req.type !== 'run') return;

  try {
    let modelBuffer: ArrayBuffer;

    let bundle: DownloadedBundle;
    if (req.modelSource.kind === 'buffer') {
      bundle = { modelBuffer: req.modelSource.buffer, externalData: req.modelSource.externalData ?? [] };
    } else {
      bundle = await downloadModel(req.modelSource.hfModelId, req.modelSource.filePath, req.id);
    }

    const result = req.runtime === 'onnx'
      ? await runOrt(req, bundle)
      : await runLiteRt(req, bundle);

    post({ type: 'result', id: req.id, result });
  } catch (err: any) {
    const fileName = req.modelSource.kind === 'buffer' ? req.modelSource.fileName : req.modelSource.filePath;
    const hfModelId = req.modelSource.kind === 'buffer' ? 'local' : req.modelSource.hfModelId;

    const errorResult: TestResult = {
      id: req.id,
      test_item: { id: req.id, hf_model_id: hfModelId, file_path: fileName, data_type: 'fp32', runtime: req.runtime, backend: req.backend, status: 'error', progress: 0, error: err.message },
      metrics: null,
      inference_times: [],
      warmup_ms: 0,
      iterations: req.iterations,
      iterations_completed: 0,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      error_message: err.message,
    };
    flushLogs(req.id);
    post({ type: 'result', id: req.id, result: errorResult });
  }
};
