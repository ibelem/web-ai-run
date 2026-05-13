import type { Backend, TestItem, TestResult, RunConfig, DownloadProgress } from './types';
import { runOrtInference } from './ort-runner';
import { runLiteRtInference } from './litert-runner';

interface QueueModel {
  hf_model_id: string;
  file_path: string;
  data_type: string;
  runtime: 'onnx' | 'litert';
}

export function buildTestQueue(models: QueueModel[], backends: Backend[]): TestItem[] {
  const queue: TestItem[] = [];

  for (const model of models) {
    for (const backend of backends) {
      queue.push({
        id: `${model.hf_model_id}::${model.file_path}::${backend}::${crypto.randomUUID()}`,
        hf_model_id: model.hf_model_id,
        file_path: model.file_path,
        data_type: model.data_type,
        runtime: model.runtime,
        backend,
        status: 'pending',
        progress: 0,
      });
    }
  }

  return queue;
}

export interface QueueCallbacks {
  onItemStart?: (item: TestItem) => void;
  onItemProgress?: (item: TestItem, progress: DownloadProgress) => void;
  onItemStatus?: (item: TestItem, status: string) => void;
  onItemComplete?: (item: TestItem, result: TestResult) => void;
  onQueueComplete?: (results: TestResult[]) => void;
}

export async function processQueue(
  queue: TestItem[],
  config: RunConfig,
  runtimeVersions: { ort: string; litert: string },
  callbacks?: QueueCallbacks
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const item of queue) {
    item.status = 'downloading';
    callbacks?.onItemStart?.(item);

    let result: TestResult;

    if (item.runtime === 'onnx') {
      result = await runOrtInference({
        hf_model_id: item.hf_model_id,
        file_path: item.file_path,
        backend: item.backend,
        iterations: config.iterations,
        warmup_runs: config.warmup_runs,
        ort_version: runtimeVersions.ort,
        onProgress: (p) => {
          item.progress = p.percent;
          item.status = 'downloading';
          callbacks?.onItemProgress?.(item, p);
        },
        onStatus: (s) => {
          if (s.includes('Compil') || s.includes('session')) item.status = 'compiling';
          else if (s.includes('Running') || s.includes('Warm')) item.status = 'running';
          callbacks?.onItemStatus?.(item, s);
        },
      });
    } else {
      result = await runLiteRtInference({
        hf_model_id: item.hf_model_id,
        file_path: item.file_path,
        backend: item.backend,
        iterations: config.iterations,
        warmup_runs: config.warmup_runs,
        litert_version: runtimeVersions.litert,
        onProgress: (p) => {
          item.progress = p.percent;
          item.status = 'downloading';
          callbacks?.onItemProgress?.(item, p);
        },
        onStatus: (s) => {
          if (s.includes('Compil')) item.status = 'compiling';
          else if (s.includes('Running') || s.includes('Warm')) item.status = 'running';
          callbacks?.onItemStatus?.(item, s);
        },
      });
    }

    item.status = result.error_message ? 'error' : 'completed';
    item.progress = 100;
    results.push(result);
    callbacks?.onItemComplete?.(item, result);
  }

  callbacks?.onQueueComplete?.(results);
  return results;
}
