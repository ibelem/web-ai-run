import type { Backend, TestResult, DownloadProgress, BenchmarkMetrics } from '../types';

export interface WorkerRequest {
  type: 'run';
  id: string;
  modelSource: { kind: 'url'; hfModelId: string; filePath: string } | { kind: 'buffer'; fileName: string; buffer: ArrayBuffer };
  runtime: 'onnx' | 'litert';
  backend: Backend;
  iterations: number;
  warmupRuns: number;
  runtimeVersion: string;
}

export type WorkerResponse =
  | { type: 'progress'; id: string; progress: DownloadProgress }
  | { type: 'status'; id: string; status: string }
  | { type: 'result'; id: string; result: TestResult };

let litertLoaded = false;
let litertMode: string | null = null;

const HF_MAIN = 'https://huggingface.co';
const HF_MIRROR = 'https://hf-mirror.com';
const HF_TEST_PATH = '/webml/models-moved/resolve/main/01.onnx';
let cachedHfBase: string | null = null;

async function getHfBase(): Promise<string> {
  if (cachedHfBase) return cachedHfBase;

  const checkDomain = async (base: string): Promise<boolean> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(`${base}${HF_TEST_PATH}`, {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeoutId);
      return res.ok;
    } catch {
      clearTimeout(timeoutId);
      return false;
    }
  };

  if (await checkDomain(HF_MAIN)) {
    cachedHfBase = HF_MAIN;
    return HF_MAIN;
  }

  if (await checkDomain(HF_MIRROR)) {
    cachedHfBase = HF_MIRROR;
    return HF_MIRROR;
  }

  cachedHfBase = HF_MAIN;
  return HF_MAIN;
}

function getOrtCdnUrl(version: string): string {
  return `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/ort.webgpu.min.mjs`;
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

function post(msg: WorkerResponse) {
  self.postMessage(msg);
}

function ts(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function log(id: string, msg: string) {
  post({ type: 'status', id, status: `${ts()} ${msg}` });
}

async function downloadModel(hfModelId: string, filePath: string, id: string): Promise<ArrayBuffer> {
  const base = await getHfBase();
  log(id, `Models will be fetched from ${base.replace('https://', '')}`);
  const url = `${base}/${hfModelId}/resolve/main/${filePath}`;
  log(id, `Fetching model from ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);

  const contentLength = Number(response.headers.get('content-length') ?? 0);
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    post({
      type: 'progress',
      id,
      progress: { model_id: hfModelId, file_path: filePath, loaded_bytes: loaded, total_bytes: contentLength, percent: contentLength > 0 ? (loaded / contentLength) * 100 : 0 },
    });
  }

  const buffer = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer.buffer;
}

async function runOrt(req: WorkerRequest, modelBuffer: ArrayBuffer): Promise<TestResult> {
  const { id, backend, iterations, warmupRuns, runtimeVersion } = req;
  const startedAt = new Date().toISOString();
  const fileName = req.modelSource.kind === 'buffer' ? req.modelSource.fileName : req.modelSource.filePath;
  const hfModelId = req.modelSource.kind === 'buffer' ? `local/${req.modelSource.fileName}` : req.modelSource.hfModelId;

  log(id, `Loading ONNX Runtime Web v${runtimeVersion}...`);
  const url = getOrtCdnUrl(runtimeVersion);
  const ort = await import(/* @vite-ignore */ url);
  const cdnBase = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${runtimeVersion}/dist/`;
  ort.env.wasm.wasmPaths = cdnBase;
  ort.env.logLevel = 'verbose';
  ort.env.debug = false;

  if (backend === 'wasm_n') {
    ort.env.wasm.numThreads = 4;
  } else {
    ort.env.wasm.numThreads = 1;
  }
  ort.env.wasm.simd = true;

  const enableMLTensor = false;

  log(id, `Creating inference session with ${backend} backend`);
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

  const session = await ort.InferenceSession.create(modelBuffer, sessionOptions);
  const compilationMs = performance.now() - compilationStart;
  log(id, `Compilation Time: ${compilationMs.toFixed(2)} ms`);

  const feeds: Record<string, any> = {};
  for (const name of session.inputNames) {
    const inputMeta = session.inputMetadata?.[name];
    const dims = inputMeta?.dims ?? [1, 3, 224, 224];
    const type = inputMeta?.type ?? 'float32';
    const size = dims.reduce((a: number, b: number) => a * Math.abs(b), 1);
    const data = Float32Array.from({ length: size }, () => Math.random());
    feeds[name] = new ort.Tensor(type, data, dims);
  }

  let webgpuDevice: any = null;
  if (backend === 'webgpu' && enableMLTensor) {
    webgpuDevice = ort.env.webgpu.device;
  }

  let firstInferenceMs = 0;
  const warmupTimes: number[] = [];
  log(id, `Warming up (${warmupRuns} runs)...`);
  for (let i = 0; i < warmupRuns; i++) {
    const t0 = performance.now();
    await session.run(feeds);
    if (backend === 'webgpu' && enableMLTensor && webgpuDevice) {
      await webgpuDevice.queue.onSubmittedWorkDone();
    }
    const elapsed = performance.now() - t0;
    warmupTimes.push(elapsed);
    if (i === 0) firstInferenceMs = elapsed;
  }
  log(id, `Warmup times: [${warmupTimes.map(t => t.toFixed(2)).join(', ')}] ms`);
  log(id, `First Inference Time: ${firstInferenceMs.toFixed(2)} ms`);
  log(id, `Time to First Inference: ${(compilationMs + firstInferenceMs).toFixed(2)} ms`);

  const inferenceTimes: number[] = [];

  log(id, `Inferencing (${iterations} iterations)...`);
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const result = await session.run(feeds);
    if (backend === 'webgpu' && enableMLTensor && webgpuDevice) {
      await webgpuDevice.queue.onSubmittedWorkDone();
    }
    if (backend === 'webnn_gpu' && enableMLTensor && i === iterations - 1) {
      const promises = session.outputNames.map((name: string) => result[name].getData());
      await Promise.all(promises);
    }
    inferenceTimes.push(performance.now() - t0);
  }

  await session.release();
  const metrics = computeMetrics(inferenceTimes, compilationMs, null, firstInferenceMs);
  const dataType = fileName.includes('fp16') ? 'fp16' : 'fp32';
  const totalMs = inferenceTimes.reduce((a, b) => a + b, 0);

  log(id, `Average: ${metrics.average_ms.toFixed(2)} ms`);
  log(id, `Median: ${metrics.median_ms.toFixed(2)} ms`);
  log(id, `Best: ${metrics.best_ms.toFixed(2)} ms`);
  log(id, `P90: ${metrics.p90_ms.toFixed(2)} ms`);
  log(id, `Total (${iterations} runs): ${totalMs.toFixed(2)} ms`);
  log(id, `Throughput: ${metrics.throughput_fps.toFixed(2)} FPS`);
  log(id, `Test ${hfModelId} (${dataType}) with ${backend} backend completed`);

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
  };
}

async function runLiteRt(req: WorkerRequest, modelBuffer: ArrayBuffer): Promise<TestResult> {
  const { id, backend, iterations, warmupRuns, runtimeVersion } = req;
  const startedAt = new Date().toISOString();
  const fileName = req.modelSource.kind === 'buffer' ? req.modelSource.fileName : req.modelSource.filePath;
  const hfModelId = req.modelSource.kind === 'buffer' ? `local/${req.modelSource.fileName}` : req.modelSource.hfModelId;

  log(id, `Loading LiteRT.js v${runtimeVersion}...`);
  const url = getLiteRtCdnUrl(runtimeVersion);
  const litert = await import(/* @vite-ignore */ url);

  const isWebNN = backend.startsWith('webnn_');
  const isWebGPU = backend === 'webgpu';
  const needsJspi = isWebNN || isWebGPU;
  const needsThreads = backend === 'wasm_n';

  if (litert.loadLiteRt) {
    const wasmRoot = `https://cdn.jsdelivr.net/npm/@litertjs/core@${runtimeVersion}/wasm`;
    const requiredMode = needsJspi ? 'jspi' : (needsThreads ? 'threaded' : 'standard');

    if (litertLoaded && litertMode !== requiredMode) {
      log(id, `Switching LiteRT WASM mode from ${litertMode} to ${requiredMode}, unloading...`);
      try { litert.unloadLiteRt(); } catch {}
      litertLoaded = false;
    }

    if (!litertLoaded) {
      log(id, `Loading LiteRT WASM (${requiredMode})...`);
      // Inject locateFile so emscripten fetches .wasm from jsdelivr, not the worker origin.
      (globalThis as any).Module = {
        locateFile: (path: string) => `${wasmRoot}/${path}`,
      };
      try {
        if (needsJspi) {
          await litert.loadLiteRt(wasmRoot, { jspi: true });
        } else if (needsThreads) {
          try {
            await litert.loadLiteRt(wasmRoot, { threads: true });
          } catch {
            log(id, `Threads unavailable, falling back to single-threaded...`);
            await litert.loadLiteRt(wasmRoot, { threads: false });
          }
        } else {
          await litert.loadLiteRt(wasmRoot, { threads: false });
        }
        litertLoaded = true;
        litertMode = requiredMode;
      } finally {
        (globalThis as any).Module = undefined;
      }
    }
  }

  log(id, `Compiling model with ${backend} backend...`);
  const compilationStart = performance.now();
  const compileOpts: any = { accelerator: 'wasm' };
  if (isWebGPU) {
    compileOpts.accelerator = 'webgpu';
  } else if (isWebNN) {
    compileOpts.accelerator = 'webnn';
    const deviceType = backend.replace('webnn_', '');
    compileOpts.webNNOptions = { devicePreference: deviceType };
  }
  const model = await litert.loadAndCompile(new Uint8Array(modelBuffer), compileOpts);
  const compilationMs = performance.now() - compilationStart;
  log(id, `Load+Compile Time: ${compilationMs.toFixed(2)} ms`);

  let inputDetails: any[] = [];
  if (model.primarySignature?.getInputDetails) {
    inputDetails = model.primarySignature.getInputDetails();
  } else if (model.getInputDetails) {
    inputDetails = model.getInputDetails();
  }

  const SUPPORTED_DTYPES = new Set(['float32', 'int32']);
  const createTensors = () => {
    const tensors: any[] = [];
    for (const input of inputDetails) {
      const shape = Array.from(input.shape ?? [1, 224, 224, 3]) as number[];
      const name = (input.name ?? '').toLowerCase();
      let dtype = (input.dtype ?? input.type ?? 'float32').toLowerCase();
      if (!SUPPORTED_DTYPES.has(dtype)) dtype = 'float32';
      const size = shape.reduce((a: number, b: number) => a * Math.abs(b), 1);

      const needsOnes = name.includes('mask') || name.includes('segment') ||
        name.includes('token_type') || name.includes('frame_count');
      const data = needsOnes
        ? new Float32Array(size).fill(1)
        : Float32Array.from({ length: size }, () => Math.random());
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
  const warmupTimes: number[] = [];
  log(id, `Warming up (${warmupRuns} runs)...`);
  for (let i = 0; i < warmupRuns; i++) {
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
    // For WebGPU, move results back to CPU
    if (isWebGPU) {
      for (const result of (Array.isArray(outputs) ? outputs : [outputs])) {
        const cpuResult = await result.moveTo('wasm');
        cpuResult.delete?.();
      }
    }
    const elapsed = performance.now() - t0;
    warmupTimes.push(elapsed);
    if (i === 0) firstInferenceMs = elapsed;

    // Cleanup
    if (isWebGPU) {
      gpuTensors.forEach((t: any) => t.delete?.());
      inputTensors.forEach((t: any) => { try { t.delete?.(); } catch {} });
    }
    if (!isWebGPU && Array.isArray(outputs)) outputs.forEach((t: any) => t.delete?.());
  }
  log(id, `Warmup times: [${warmupTimes.map(t => t.toFixed(2)).join(', ')}] ms`);
  log(id, `First Inference Time: ${firstInferenceMs.toFixed(2)} ms`);
  log(id, `Time to First Inference: ${(compilationMs + firstInferenceMs).toFixed(2)} ms`);

  const inferenceTimes: number[] = [];

  log(id, `Inferencing (${iterations} iterations)...`);
  for (let i = 0; i < iterations; i++) {
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
    inferenceTimes.push(performance.now() - t0);

    // Cleanup
    if (isWebGPU) {
      gpuTensors.forEach((t: any) => t.delete?.());
      inputTensors.forEach((t: any) => { try { t.delete?.(); } catch {} });
    }
    if (!isWebGPU && Array.isArray(outputs)) outputs.forEach((t: any) => t.delete?.());
  }

  // Final cleanup: delete base tensors for WASM/WebNN path
  if (baseTensors) {
    baseTensors.forEach((t: any) => { try { t.delete?.(); } catch {} });
  }

  model.delete?.();
  const metrics = computeMetrics(inferenceTimes, null, compilationMs, firstInferenceMs);
  const dataType = fileName.includes('fp16') ? 'fp16' : 'fp32';
  const totalMs = inferenceTimes.reduce((a, b) => a + b, 0);

  log(id, `Average: ${metrics.average_ms.toFixed(2)} ms`);
  log(id, `Median: ${metrics.median_ms.toFixed(2)} ms`);
  log(id, `Best: ${metrics.best_ms.toFixed(2)} ms`);
  log(id, `P90: ${metrics.p90_ms.toFixed(2)} ms`);
  log(id, `Total (${iterations} runs): ${totalMs.toFixed(2)} ms`);
  log(id, `Throughput: ${metrics.throughput_fps.toFixed(2)} FPS`);
  log(id, `Test ${hfModelId} (${dataType}) with ${backend} backend completed`);

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
  };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;

  try {
    let modelBuffer: ArrayBuffer;

    if (req.modelSource.kind === 'buffer') {
      modelBuffer = req.modelSource.buffer;
    } else {
      modelBuffer = await downloadModel(req.modelSource.hfModelId, req.modelSource.filePath, req.id);
    }

    const result = req.runtime === 'onnx'
      ? await runOrt(req, modelBuffer)
      : await runLiteRt(req, modelBuffer);

    post({ type: 'result', id: req.id, result });
  } catch (err: any) {
    const fileName = req.modelSource.kind === 'buffer' ? req.modelSource.fileName : req.modelSource.filePath;
    const hfModelId = req.modelSource.kind === 'buffer' ? `local/${req.modelSource.fileName}` : req.modelSource.hfModelId;

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
    post({ type: 'result', id: req.id, result: errorResult });
  }
};
