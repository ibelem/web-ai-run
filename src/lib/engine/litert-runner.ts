import type { Backend, TestResult, DownloadProgress } from './types';
import { downloadModel } from './model-cache';
import { loadLiteRt } from './runtime-loader';
import { computeMetrics } from './metrics';

export interface LiteRtRunOptions {
  hf_model_id: string;
  file_path: string;
  backend: Backend;
  iterations: number;
  warmup_runs: number;
  litert_version: string;
  onProgress?: (progress: DownloadProgress) => void;
  onStatus?: (status: string) => void;
}

export async function runLiteRtInference(options: LiteRtRunOptions): Promise<TestResult> {
  const { hf_model_id, file_path, backend, iterations, warmup_runs, litert_version, onProgress, onStatus } = options;
  const startedAt = new Date().toISOString();
  const id = `${hf_model_id}::${file_path}::${backend}::${Date.now()}`;

  try {
    onStatus?.('Loading LiteRT.js...');
    const litert = await loadLiteRt(litert_version);

    onStatus?.('Downloading model...');
    const modelBuffer = await downloadModel(hf_model_id, file_path, onProgress);

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

    const metrics = computeMetrics(inferenceTimes, null, compilationMs, firstInferenceMs);

    return {
      id,
      test_item: {
        id,
        hf_model_id,
        file_path,
        data_type: file_path.includes('fp16') ? 'fp16' : 'fp32',
        runtime: 'litert',
        backend,
        status: 'completed',
        progress: 100,
      },
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
      test_item: {
        id,
        hf_model_id,
        file_path,
        data_type: file_path.includes('fp16') ? 'fp16' : 'fp32',
        runtime: 'litert',
        backend,
        status: 'error',
        progress: 0,
        error: err.message,
      },
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
