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
  idleTimeoutMs?: number;
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

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 min absolute cap — LLMs on CPU can be slow
const IDLE_TERMINATE_MS  = 5 * 60 * 1000;  // 5 min idle (after a run settles) → terminate
// Inactivity watchdog DURING a run: if the worker goes this long with no message
// at all, it's wedged (WASM OOM / stuck compile that never throws). Longer than
// the inference watchdog (2 min) because LLM compiles legitimately take minutes
// with no intermediate message — too-tight a threshold would false-trip them.
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

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
    // Tracks the latest phase the worker reported, so a hang message can say
    // *where* it wedged (download / compile / generate) instead of a generic stall.
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
      terminateLlmWorker();
      reject(new Error(message));
    }

    function resetWatchdog() {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        bail(`Stalled during ${lastPhase} — no response for ${Math.round(idleMs / 1000)}s (likely out of memory or an unsupported model for this backend)`);
      }, idleMs);
    }

    const timeoutId = setTimeout(() => {
      bail('LLM benchmark timed out');
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    resetWatchdog();

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

      // Any message means the worker is still alive — kick the inactivity timer.
      if (!settled) resetWatchdog();

      switch (msg.type) {
        case 'download-start':    lastPhase = 'download'; options.onDownloadStart?.(msg.totalBytes, msg.fileCount, msg.files); break;
        case 'download-progress': lastPhase = 'download'; options.onDownloadProgress?.(msg.loaded, msg.total, msg.currentFile); break;
        case 'download-done':     options.onDownloadDone?.(msg.cacheHit, msg.durationMs); break;
        case 'compile-start':     lastPhase = 'compile'; options.onCompileStart?.(); break;
        case 'compile-done':      options.onCompileDone?.(msg.compileMs); break;
        case 'generate-start':    lastPhase = 'generation'; options.onGenerateStart?.(msg.runIndex, msg.promptTokens); break;
        case 'token':             options.onToken?.(msg.runIndex, msg.token, msg.tokenIndex, msg.elapsedMs, msg.tps); break;
        case 'ttft':              options.onTtft?.(msg.runIndex, msg.ttftMs); break;
        case 'run-done':          options.onRunDone?.(msg.runIndex, msg.runResult); break;
        case 'progress':          options.onStatus?.(msg.status); break;
        case 'logs':              options.onLogs?.(msg.logs); break;
        case 'error':
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          if (idleTimer) clearTimeout(idleTimer);
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          // A model error inside the worker (e.g. transformers.js WASM
          // "Aborted()" / "memory access out of bounds") leaves the shared
          // Emscripten heap poisoned. The worker is only otherwise recycled
          // when the MODEL key changes — so a same-model, different-backend run
          // (our backends × models loop) would reuse the corpse and fail every
          // remaining backend instantly. Terminate so the next run is clean.
          terminateLlmWorker();
          reject(new Error(`[${msg.phase}] ${msg.message}`));
          break;
        case 'all-done':
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          if (idleTimer) clearTimeout(idleTimer);
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
      if (idleTimer) clearTimeout(idleTimer);
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
