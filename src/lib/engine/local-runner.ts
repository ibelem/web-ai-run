import type { Backend, TestResult } from './types';
import { loadOrt, getOrtExecutionProvider } from './runtime-loader';
import { loadLiteRt } from './runtime-loader';
import { computeMetrics } from './metrics';
import { inferDataType } from '$lib/huggingface/parser';

export interface LocalRunOptions {
  fileName: string;
  modelBuffer: ArrayBuffer;
  runtime: 'onnx' | 'litert';
  backend: Backend;
  iterations: number;
  warmup_runs: number;
  runtimeVersion: string;
  onStatus?: (status: string) => void;
}

export async function runLocalInference(options: LocalRunOptions): Promise<TestResult> {
  const { fileName, modelBuffer, runtime, backend, iterations, warmup_runs, runtimeVersion, onStatus } = options;
  const startedAt = new Date().toISOString();
  const id = `local::${fileName}::${backend}::${Date.now()}`;
  const dataType = inferDataType(fileName);

  if (runtime === 'onnx') {
    return runLocalOrt({ id, fileName, modelBuffer, backend, iterations, warmup_runs, runtimeVersion, dataType, startedAt, onStatus });
  }
  return runLocalLiteRt({ id, fileName, modelBuffer, backend, iterations, warmup_runs, runtimeVersion, dataType, startedAt, onStatus });
}

interface InternalOpts {
  id: string;
  fileName: string;
  modelBuffer: ArrayBuffer;
  backend: Backend;
  iterations: number;
  warmup_runs: number;
  runtimeVersion: string;
  dataType: string;
  startedAt: string;
  onStatus?: (status: string) => void;
}

async function runLocalOrt(opts: InternalOpts): Promise<TestResult> {
  const { id, fileName, modelBuffer, backend, iterations, warmup_runs, runtimeVersion, dataType, startedAt, onStatus } = opts;

  try {
    onStatus?.('Loading ONNX Runtime...');
    const ort = await loadOrt(runtimeVersion, backend);

    onStatus?.('Creating inference session...');
    const compilationStart = performance.now();
    const executionProvider = getOrtExecutionProvider(backend);
    const session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: [executionProvider],
    });
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

    onStatus?.('Warming up...');
    for (let i = 0; i < warmup_runs; i++) {
      await session.run(feeds);
    }

    const inferenceTimes: number[] = [];
    let firstInferenceMs = 0;

    for (let i = 0; i < iterations; i++) {
      onStatus?.(`Running inference ${i + 1}/${iterations}...`);
      const t0 = performance.now();
      await session.run(feeds);
      const elapsed = performance.now() - t0;
      inferenceTimes.push(elapsed);
      if (i === 0) firstInferenceMs = elapsed;
    }

    await session.release();
    const metrics = computeMetrics(inferenceTimes, compilationMs, firstInferenceMs);

    return {
      id,
      test_item: { id, hf_model_id: `local/${fileName}`, file_path: fileName, data_type: dataType, runtime: 'onnx', backend, status: 'completed', progress: 100 },
      metrics,
      inference_times: inferenceTimes,
      warmup_ms: warmup_runs > 0 ? inferenceTimes[0] ?? 0 : 0,
      iterations,
      iterations_completed: iterations,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      error_message: null,
    };
  } catch (err: any) {
    return {
      id,
      test_item: { id, hf_model_id: `local/${fileName}`, file_path: fileName, data_type: dataType, runtime: 'onnx', backend, status: 'error', progress: 0, error: err.message },
      metrics: null,
      inference_times: [],
      warmup_ms: 0,
      iterations,
      iterations_completed: 0,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      error_message: err.message,
    };
  }
}

async function runLocalLiteRt(opts: InternalOpts): Promise<TestResult> {
  const { id, fileName, modelBuffer, backend, iterations, warmup_runs, runtimeVersion, dataType, startedAt, onStatus } = opts;

  try {
    onStatus?.('Loading LiteRT.js...');
    const litert = await loadLiteRt(runtimeVersion);

    onStatus?.('Compiling model...');
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

    onStatus?.('Warming up...');
    for (let i = 0; i < warmup_runs; i++) {
      const inputs = createTensors();
      await model.run(inputs);
      inputs.forEach((t: any) => t.delete?.());
    }

    const inferenceTimes: number[] = [];
    let firstInferenceMs = 0;

    for (let i = 0; i < iterations; i++) {
      onStatus?.(`Running inference ${i + 1}/${iterations}...`);
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

    return {
      id,
      test_item: { id, hf_model_id: `local/${fileName}`, file_path: fileName, data_type: dataType, runtime: 'litert', backend, status: 'completed', progress: 100 },
      metrics,
      inference_times: inferenceTimes,
      warmup_ms: warmup_runs > 0 ? inferenceTimes[0] ?? 0 : 0,
      iterations,
      iterations_completed: iterations,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      error_message: null,
    };
  } catch (err: any) {
    return {
      id,
      test_item: { id, hf_model_id: `local/${fileName}`, file_path: fileName, data_type: dataType, runtime: 'litert', backend, status: 'error', progress: 0, error: err.message },
      metrics: null,
      inference_times: [],
      warmup_ms: 0,
      iterations,
      iterations_completed: 0,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      error_message: err.message,
    };
  }
}
