import type { Backend, TestResult, DownloadProgress } from './types';
import { downloadModel } from './model-cache';
import { loadOrt, getOrtExecutionProvider } from './runtime-loader';
import { computeMetrics } from './metrics';

export interface OrtRunOptions {
  hf_model_id: string;
  file_path: string;
  backend: Backend;
  iterations: number;
  warmup_runs: number;
  ort_version: string;
  onProgress?: (progress: DownloadProgress) => void;
  onStatus?: (status: string) => void;
}

export async function runOrtInference(options: OrtRunOptions): Promise<TestResult> {
  const { hf_model_id, file_path, backend, iterations, warmup_runs, ort_version, onProgress, onStatus } = options;
  const startedAt = new Date().toISOString();
  const id = `${hf_model_id}::${file_path}::${backend}::${Date.now()}`;

  try {
    onStatus?.('Loading ONNX Runtime...');
    const ort = await loadOrt(ort_version, backend);

    onStatus?.('Downloading model...');
    const modelBuffer = await downloadModel(hf_model_id, file_path, onProgress);

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

    const metrics = computeMetrics(inferenceTimes, compilationMs, null, firstInferenceMs);

    return {
      id,
      test_item: {
        id,
        hf_model_id,
        file_path,
        data_type: file_path.includes('fp16') ? 'fp16' : 'fp32',
        runtime: 'onnx',
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
        runtime: 'onnx',
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
