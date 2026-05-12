import { describe, it, expect } from 'vitest';
import { canRunBenchmark } from '$lib/guards/benchmark-guard';

describe('canRunBenchmark', () => {
  describe('anonymous user', () => {
    it('allows /model tests', () => {
      const result = canRunBenchmark(false, 'model');
      expect(result).toEqual({ allowed: true });
    });

    it('blocks /recipe tests', () => {
      const result = canRunBenchmark(false, 'recipe');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Sign in');
    });

    it('blocks /custom tests', () => {
      const result = canRunBenchmark(false, 'custom');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Sign in');
    });
  });

  describe('authenticated user', () => {
    it('allows /model tests', () => {
      const result = canRunBenchmark(true, 'model');
      expect(result).toEqual({ allowed: true });
    });

    it('allows /recipe tests', () => {
      const result = canRunBenchmark(true, 'recipe');
      expect(result).toEqual({ allowed: true });
    });

    it('allows /custom tests', () => {
      const result = canRunBenchmark(true, 'custom');
      expect(result).toEqual({ allowed: true });
    });
  });
});
