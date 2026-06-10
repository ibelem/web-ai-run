import type { LLMWorkerRequest, LLMWorkerMessage, LLMBenchmarkResult } from '../types';

export interface LLMRunOptions {
  hfModelId: string;
  dtype: string;
  runtime: 'transformers';
  backend: LLMWorkerRequest['backend'];
  runtimeVersion: string;
  prompt: string;
  promptTokens?: number;
  maxNewTokens: number;
  runs: number;
  warmupRuns: number;
  timeoutMs?: number;
  localFiles?: string[];
  onDownloadStart?:    (totalBytes: number, fileCount: number, files: string[]) => void;
  onDownloadProgress?: (loaded: number, total: number, currentFile: string) => void;
  onDownloadDone?:     (cacheHit: boolean, durationMs: number) => void;
  onCompileStart?:     () => void;
  onCompileDone?:      (compileMs: number) => void;
  onGenerateStart?:    (runIndex: number, promptTokens: number) => void;
  onToken?:            (runIndex: number, token: string, tokenIndex: number, elapsedMs: number, tps: number) => void;
  onTtft?:             (runIndex: number, ttftMs: number) => void;
  onRunDone?:          (runIndex: number, runResult: import('../types').SingleRunResult) => void;
  onStatus?:           (status: string) => void;
  onLogs?:             (logs: string[]) => void;
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 min — LLMs on CPU can be slow
const IDLE_TERMINATE_MS  = 5 * 60 * 1000;  // 5 min idle → terminate

let workerInstance: Worker | null = null;
let lastModelKey: string | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function modelKey(hfModelId: string, dtype: string, runtime: string): string {
  return `${hfModelId}::${dtype}::${runtime}`;
}

function clearIdleTimer() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
}

function scheduleIdle() {
  clearIdleTimer();
  idleTimer = setTimeout(() => { terminateLlmWorker(); }, IDLE_TERMINATE_MS);
}

function getWorker(key: string): Worker {
  // If the model changed, kill the old worker (memory cleanup — ORT doesn't free reliably)
  if (workerInstance && lastModelKey !== key) {
    workerInstance.terminate();
    workerInstance = null;
    lastModelKey = null;
  }
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL('./llm.worker.ts', import.meta.url),
      { type: 'module' }
    );
    lastModelKey = key;
  }
  return workerInstance;
}

export function runLlmInWorker(options: LLMRunOptions): Promise<LLMBenchmarkResult> {
  return new Promise((resolve, reject) => {
    const key = modelKey(options.hfModelId, options.dtype, options.runtime);
    clearIdleTimer();

    const id = crypto.randomUUID();
    const worker = getWorker(key);
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      terminateLlmWorker();
      reject(new Error('LLM benchmark timed out'));
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const request: LLMWorkerRequest = {
      type: 'run',
      id,
      hfModelId: options.hfModelId,
      dtype: options.dtype,
      runtime: options.runtime,
      backend: options.backend,
      runtimeVersion: options.runtimeVersion,
      prompt: options.prompt,
      promptTokens: options.promptTokens,
      maxNewTokens: options.maxNewTokens,
      runs: options.runs,
      warmupRuns: options.warmupRuns,
      localFiles: options.localFiles,
    };

    function handleMessage(event: MessageEvent<LLMWorkerMessage>) {
      const msg = event.data;
      if (msg.id !== id) return;

      switch (msg.type) {
        case 'download-start':    options.onDownloadStart?.(msg.totalBytes, msg.fileCount, msg.files); break;
        case 'download-progress': options.onDownloadProgress?.(msg.loaded, msg.total, msg.currentFile); break;
        case 'download-done':     options.onDownloadDone?.(msg.cacheHit, msg.durationMs); break;
        case 'compile-start':     options.onCompileStart?.(); break;
        case 'compile-done':      options.onCompileDone?.(msg.compileMs); break;
        case 'generate-start':    options.onGenerateStart?.(msg.runIndex, msg.promptTokens); break;
        case 'token':             options.onToken?.(msg.runIndex, msg.token, msg.tokenIndex, msg.elapsedMs, msg.tps); break;
        case 'ttft':              options.onTtft?.(msg.runIndex, msg.ttftMs); break;
        case 'run-done':          options.onRunDone?.(msg.runIndex, msg.runResult); break;
        case 'progress':          options.onStatus?.(msg.status); break;
        case 'logs':              options.onLogs?.(msg.logs); break;
        case 'error':
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          scheduleIdle();
          reject(new Error(`[${msg.phase}] ${msg.message}`));
          break;
        case 'all-done':
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          scheduleIdle();
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
      terminateLlmWorker();
      reject(new Error(`LLM worker crashed: ${event.message} (${event.filename}:${event.lineno})`));
    }

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    worker.postMessage(request);
  });
}

export function terminateLlmWorker(): void {
  clearIdleTimer();
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
    lastModelKey = null;
  }
}
