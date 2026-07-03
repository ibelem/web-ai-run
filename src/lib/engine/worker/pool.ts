import type { Backend, TestResult, DownloadProgress, WorkerRequest, WorkerResponse } from '../types';

export interface WorkerRunOptions {
  modelSource: WorkerRequest['modelSource'];
  runtime: 'onnx' | 'litert';
  backend: Backend;
  iterations: number;
  warmupRuns: number;
  runtimeVersion: string;
  freeDimensionOverrides?: Record<string, number>;
  timeoutMs?: number;
  idleTimeoutMs?: number;
  onProgress?: (progress: DownloadProgress) => void;
  onStatus?: (status: string) => void;
  onLogs?: (logs: string[]) => void;
  onSessionOptions?: (sessionOptions: unknown) => void;
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

// Absolute ceiling for a single (model, backend) run. A run that legitimately
// takes longer than this is pathological; bail rather than hang forever.
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
// The worker posts status/progress/logs messages constantly while it's alive
// (download chunks, per-iteration "Inferencing X/N", compile status). If we go
// this long with NO message, the worker is wedged — a WebGPU/WebNN OOM or a
// stuck compile that never throws. Surface it fast instead of waiting out the
// full absolute timeout, which reads to the user as a frozen page.
const DEFAULT_IDLE_TIMEOUT_MS = 2 * 60 * 1000;

export function runInWorker(options: WorkerRunOptions): Promise<TestResult> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const worker = getWorker();
    let settled = false;
    // Tracks the latest phase the worker reported, so a hang message can say
    // *where* it hung (download / compile / inference) instead of a generic stall.
    let lastPhase = 'startup';

    const idleMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    function bail(message: string) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (idleTimer) clearTimeout(idleTimer);
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      terminateWorker();
      reject(new Error(message));
    }

    function resetIdleTimer() {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        bail(`Stalled during ${lastPhase} — no response for ${Math.round(idleMs / 1000)}s (likely out of memory or an unsupported model for this backend)`);
      }, idleMs);
    }

    const timeoutId = setTimeout(() => {
      bail('Timed out after 10 minutes');
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    resetIdleTimer();

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

      // Any message means the worker is still alive — kick the inactivity timer.
      if (!settled) resetIdleTimer();

      switch (msg.type) {
        case 'progress':
          lastPhase = 'download';
          options.onProgress?.(msg.progress);
          break;
        case 'status':
          if (/compil|session|creating/i.test(msg.status)) lastPhase = 'compilation';
          else if (/inferenc|warm/i.test(msg.status)) lastPhase = 'inference';
          options.onStatus?.(msg.status);
          break;
        case 'logs':
          options.onLogs?.(msg.logs);
          break;
        case 'session-options':
          options.onSessionOptions?.(msg.sessionOptions);
          break;
        case 'result': {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          if (idleTimer) clearTimeout(idleTimer);
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          const res = msg.result as TestResult;
          // A model that errored inside the worker (e.g. LiteRT WASM "Aborted()"
          // or "memory access out of bounds") posts a normal result with an
          // error_message rather than throwing — so the page's try/catch never
          // fires and never recycles the worker. But a fatal WASM abort poisons
          // the shared Emscripten heap, so EVERY subsequent model on the reused
          // worker fails instantly. Terminate here so the next run starts from a
          // clean worker + fresh WASM module.
          if (res.error_message) terminateWorker();
          resolve(res);
          break;
        }
      }
    }

    function handleError(event: ErrorEvent) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (idleTimer) clearTimeout(idleTimer);
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
