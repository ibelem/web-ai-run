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

const HF_CDN_BASE = 'https://huggingface.co';

function getOrtCdnUrl(version: string, backend: Backend): string {
  const file = backend === 'webgpu' ? 'ort.webgpu.min.mjs' : 'ort.all.min.mjs';
  return `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/${file}`;
}

function getLiteRtCdnUrl(version: string): string {
  return `https://cdn.jsdelivr.net/npm/@anthropic-ai/litert@${version}/dist/litert.mjs`;
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

function computeMetrics(times: number[], compilationMs: number, firstInferenceMs: number): BenchmarkMetrics {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const p90Index = Math.ceil(sorted.length * 0.9) - 1;

  return {
    compilation_ms: compilationMs,
    first_inference_ms: firstInferenceMs,
    time_to_first_ms: compilationMs + firstInferenceMs,
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

async function downloadModel(hfModelId: string, filePath: string, id: string): Promise<ArrayBuffer> {
  const url = `${HF_CDN_BASE}/${hfModelId}/resolve/main/${filePath}`;
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

  post({ type: 'status', id, status: 'Loading ONNX Runtime...' });
  const url = getOrtCdnUrl(runtimeVersion, backend);
  const ort = await import(/* @vite-ignore */ url);

  post({ type: 'status', id, status: 'Creating inference session...' });
  const compilationStart = performance.now();
  const executionProvider = getOrtExecutionProvider(backend);
  const session = await ort.InferenceSession.create(modelBuffer, { executionProviders: [executionProvider] });
  const compilationMs = performance.now() - compilationStart;

  const feeds: Record<string, any> = {};
  for (const name of session.inputNames) {
    const inputMeta = session.inputMetadata?.[name];
    const dims = inputMeta?.dims ?? [1, 3, 224, 224];
    const type = inputMeta?.type ?? 'float32';
    const size = dims.reduce((a: number, b: number) => a * Math.abs(b), 1);
    const data = Float32Array.from({ length: size }, () => Math.random());
    feeds[name] = new ort.Tensor(type, data, dims);
  }

  post({ type: 'status', id, status: 'Warming up...' });
  for (let i = 0; i < warmupRuns; i++) {
    await session.run(feeds);
  }

  const inferenceTimes: number[] = [];
  let firstInferenceMs = 0;

  for (let i = 0; i < iterations; i++) {
    post({ type: 'status', id, status: `Running inference ${i + 1}/${iterations}...` });
    const t0 = performance.now();
    await session.run(feeds);
    const elapsed = performance.now() - t0;
    inferenceTimes.push(elapsed);
    if (i === 0) firstInferenceMs = elapsed;
  }

  await session.release();
  const metrics = computeMetrics(inferenceTimes, compilationMs, firstInferenceMs);
  const dataType = fileName.includes('fp16') ? 'fp16' : 'fp32';

  return {
    id,
    test_item: { id, hf_model_id: hfModelId, file_path: fileName, data_type: dataType, runtime: 'onnx', backend, status: 'completed', progress: 100 },
    metrics,
    inference_times: inferenceTimes,
    warmup_ms: warmupRuns > 0 ? inferenceTimes[0] ?? 0 : 0,
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

  post({ type: 'status', id, status: 'Loading LiteRT.js...' });
  const url = getLiteRtCdnUrl(runtimeVersion);
  const litert = await import(/* @vite-ignore */ url);

  post({ type: 'status', id, status: 'Compiling model...' });
  const compilationStart = performance.now();
  const compileOpts: any = {};
  if (backend === 'webgpu') compileOpts.delegate = 'webgpu';
  else if (backend.startsWith('webnn_')) {
    compileOpts.delegate = 'webnn';
    compileOpts.deviceType = backend.replace('webnn_', '');
  }
  const model = await litert.loadAndCompile(new Uint8Array(modelBuffer), compileOpts);
  const compilationMs = performance.now() - compilationStart;

  const inputDetails = model.getInputDetails?.() ?? model.primarySignature?.getInputDetails?.() ?? [];
  const createTensors = () => {
    const tensors: any[] = [];
    for (const input of inputDetails) {
      const shape = input.shape ?? [1, 224, 224, 3];
      const dtype = input.dtype ?? 'float32';
      const size = shape.reduce((a: number, b: number) => a * Math.abs(b), 1);
      const data = Float32Array.from({ length: size }, () => Math.random());
      tensors.push(litert.createTensor(data, shape, dtype));
    }
    if (tensors.length === 0) {
      const data = Float32Array.from({ length: 1 * 3 * 224 * 224 }, () => Math.random());
      tensors.push(litert.createTensor(data, [1, 3, 224, 224], 'float32'));
    }
    return tensors;
  };

  post({ type: 'status', id, status: 'Warming up...' });
  for (let i = 0; i < warmupRuns; i++) {
    const inputs = createTensors();
    await model.run(inputs);
    inputs.forEach((t: any) => t.delete?.());
  }

  const inferenceTimes: number[] = [];
  let firstInferenceMs = 0;

  for (let i = 0; i < iterations; i++) {
    post({ type: 'status', id, status: `Running inference ${i + 1}/${iterations}...` });
    const inputs = createTensors();
    const t0 = performance.now();
    const outputs = await model.run(inputs);
    const elapsed = performance.now() - t0;
    inferenceTimes.push(elapsed);
    if (i === 0) firstInferenceMs = elapsed;
    inputs.forEach((t: any) => t.delete?.());
    if (Array.isArray(outputs)) outputs.forEach((t: any) => t.delete?.());
  }

  model.delete?.();
  const metrics = computeMetrics(inferenceTimes, compilationMs, firstInferenceMs);
  const dataType = fileName.includes('fp16') ? 'fp16' : 'fp32';

  return {
    id,
    test_item: { id, hf_model_id: hfModelId, file_path: fileName, data_type: dataType, runtime: 'litert', backend, status: 'completed', progress: 100 },
    metrics,
    inference_times: inferenceTimes,
    warmup_ms: warmupRuns > 0 ? inferenceTimes[0] ?? 0 : 0,
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
      post({ type: 'status', id: req.id, status: 'Downloading model...' });
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
