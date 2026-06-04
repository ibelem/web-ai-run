import type { Backend, TestResult, DownloadProgress } from '../types';
import type { WorkerRequest, WorkerResponse } from './inference.worker';

export interface WorkerRunOptions {
  modelSource: WorkerRequest['modelSource'];
  runtime: 'onnx' | 'litert';
  backend: Backend;
  iterations: number;
  warmupRuns: number;
  runtimeVersion: string;
  freeDimensionOverrides?: Record<string, number>;
  timeoutMs?: number;
  onProgress?: (progress: DownloadProgress) => void;
  onStatus?: (status: string) => void;
  onLogs?: (logs: string[]) => void;
}

let workerInstance: Worker | null = null;

function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL('./inference.worker.ts', import.meta.url),
      { type: 'classic' }
    );
  }
  return workerInstance;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export function runInWorker(options: WorkerRunOptions): Promise<TestResult> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const worker = getWorker();
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      terminateWorker();
      reject(new Error('Timed out after 10 minutes'));
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const request: WorkerRequest = {
      type: 'run',
      id,
      modelSource: options.modelSource,
      runtime: options.runtime,
      backend: options.backend,
      iterations: options.iterations,
      warmupRuns: options.warmupRuns,
      runtimeVersion: options.runtimeVersion,
      freeDimensionOverrides: options.freeDimensionOverrides,
    };

    function handleMessage(event: MessageEvent<WorkerResponse>) {
      const msg = event.data;
      if (msg.id !== id) return;

      switch (msg.type) {
        case 'progress':
          options.onProgress?.(msg.progress);
          break;
        case 'status':
          options.onStatus?.(msg.status);
          break;
        case 'logs':
          options.onLogs?.(msg.logs);
          break;
        case 'result':
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          resolve(msg.result);
          break;
      }
    }

    function handleError(event: ErrorEvent) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      const msg = event.message || event.filename
        ? `Worker error: ${event.message} (${event.filename}:${event.lineno})`
        : 'Worker crashed (check browser console for details)';
      reject(new Error(msg));
    }

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);

    if (options.modelSource.kind === 'buffer') {
      const transferList: ArrayBuffer[] = [options.modelSource.buffer];
      for (const e of options.modelSource.externalData ?? []) {
        transferList.push(e.data);
      }
      worker.postMessage(request, transferList);
    } else {
      worker.postMessage(request);
    }
  });
}

export function terminateWorker(): void {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
}

export function isWorkerSupported(): boolean {
  return typeof Worker !== 'undefined';
}
