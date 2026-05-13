import { writable, derived } from 'svelte/store';
import type { TestItem, TestResult, RunConfig, DownloadProgress } from '$lib/engine/types';

export const testQueue = writable<TestItem[]>([]);
export const testResults = writable<TestResult[]>([]);
export const isRunning = writable(false);
export const currentStatus = writable('');
export const downloadProgress = writable<DownloadProgress | null>(null);

export const runConfig = writable<RunConfig>({
  iterations: 10,
  warmup_runs: 3,
  backends: ['wasm_1'],
  save_results: false,
});

export const completedCount = derived(testQueue, ($q) =>
  $q.filter((item) => item.status === 'completed' || item.status === 'error').length
);

export const totalCount = derived(testQueue, ($q) => $q.length);

export function resetBenchmark(): void {
  testQueue.set([]);
  testResults.set([]);
  isRunning.set(false);
  currentStatus.set('');
  downloadProgress.set(null);
}
