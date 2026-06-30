import { describe, it, expect } from 'vitest';
import { computeTargetSize } from '$lib/utils/image-compress';

describe('computeTargetSize', () => {
  it('leaves small images unchanged', () => {
    expect(computeTargetSize(800, 600, 1920)).toEqual({ w: 800, h: 600 });
  });
  it('scales landscape down to max edge', () => {
    expect(computeTargetSize(3840, 2160, 1920)).toEqual({ w: 1920, h: 1080 });
  });
  it('scales portrait down to max edge', () => {
    expect(computeTargetSize(2160, 3840, 1920)).toEqual({ w: 1080, h: 1920 });
  });
  it('rounds to integer pixels', () => {
    const r = computeTargetSize(1000, 333, 500);
    expect(Number.isInteger(r.w)).toBe(true);
    expect(Number.isInteger(r.h)).toBe(true);
  });
});
