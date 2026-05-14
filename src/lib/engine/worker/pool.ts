import type { Backend, TestResult, DownloadProgress } from '../types';
import type { WorkerRequest, WorkerResponse } from './inference.worker';

export interface WorkerRunOptions {
  modelSource: WorkerRequest['modelSource'];
  runtime: 'onnx' | 'litert';
  backend: Backend;
  iterations: number;
  warmupRuns: number;
  runtimeVersion: string;
  onProgress?: (progress: DownloadProgress) => void;
  onStatus?: (status: string) => void;
}

let workerInstance: Worker | null = null;

function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL('./inference.worker.ts', import.meta.url),
      { type: 'module' }
    );
  }
  return workerInstance;
}

export function runInWorker(options: WorkerRunOptions): Promise<TestResult> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const worker = getWorker();

    const request: WorkerRequest = {
      type: 'run',
      id,
      modelSource: options.modelSource,
      runtime: options.runtime,
      backend: options.backend,
      iterations: options.iterations,
      warmupRuns: options.warmupRuns,
      runtimeVersion: options.runtimeVersion,
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
        case 'result':
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          resolve(msg.result);
          break;
      }
    }

    function handleError(event: ErrorEvent) {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      reject(new Error(event.message ?? 'Worker error'));
    }

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);

    if (options.modelSource.kind === 'buffer') {
      worker.postMessage(request, [options.modelSource.buffer]);
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
