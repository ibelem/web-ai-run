import type { BenchmarkMetrics } from './types';

export function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function percentile(p: number, arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export function average(arr: number[]): number {
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

export function computeMetrics(
  inferenceTimes: number[],
  compilationMs: number,
  firstInferenceMs: number
): BenchmarkMetrics {
  return {
    compilation_ms: compilationMs,
    first_inference_ms: firstInferenceMs,
    time_to_first_ms: compilationMs + firstInferenceMs,
    average_ms: average(inferenceTimes),
    median_ms: median(inferenceTimes),
    best_ms: Math.min(...inferenceTimes),
    p90_ms: percentile(90, inferenceTimes),
    throughput_fps: 1000 / average(inferenceTimes),
  };
}
