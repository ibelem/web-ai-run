import { describe, it, expect } from 'vitest';
import { computeMetrics, median, percentile, average } from '$lib/engine/metrics';

describe('metrics', () => {
  it('median of odd-length array', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('median of even-length array', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('percentile 90 of sorted data', () => {
    const data = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(90, data)).toBe(90);
  });

  it('average', () => {
    expect(average([10, 20, 30])).toBe(20);
  });

  it('computeMetrics produces full BenchmarkMetrics', () => {
    const times = [10, 12, 11, 9, 13, 10, 11, 12, 10, 11];
    const result = computeMetrics(times, 50, 10);
    expect(result.compilation_ms).toBe(50);
    expect(result.first_inference_ms).toBe(10);
    expect(result.time_to_first_ms).toBe(60);
    expect(result.average_ms).toBeCloseTo(10.9, 1);
    expect(result.median_ms).toBe(11);
    expect(result.best_ms).toBe(9);
    expect(result.p90_ms).toBeGreaterThanOrEqual(12);
    expect(result.throughput_fps).toBeCloseTo(1000 / 10.9, 0);
  });
});
