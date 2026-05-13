import { describe, it, expect } from 'vitest';
import { BACKENDS, getBackendLabel, detectAvailableBackends } from '$lib/engine/backends';

describe('backends', () => {
  it('exports 6 backend definitions', () => {
    expect(BACKENDS).toHaveLength(6);
  });

  it('getBackendLabel returns human-readable names', () => {
    expect(getBackendLabel('wasm_1')).toBe('Wasm (1 thread)');
    expect(getBackendLabel('webgpu')).toBe('WebGPU');
    expect(getBackendLabel('webnn_npu')).toBe('WebNN NPU');
  });

  it('detectAvailableBackends returns at least wasm_1', async () => {
    const available = await detectAvailableBackends();
    expect(available).toContain('wasm_1');
  });
});
