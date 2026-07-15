import { describe, it, expect } from 'vitest';
import { tapMessage, finalizeCapture, type CaptureState } from '$lib/engine/worker/shared/webnn-tap';

function newState(): CaptureState {
  return { partitions: undefined, total_nodes: 0, supported_nodes: 0, unsupported_ops: new Set() };
}

describe('webnn-tap GPU-delegate capture', () => {
  it('parses the TFLite GPU-delegate partition summary and op rejections', () => {
    const state = newState();
    tapMessage('BROADCAST_TO: Operation is not supported.', state);
    tapMessage('RESHAPE: Tensor dimensions must be less than 5. reshape_10', state);
    tapMessage('STRIDED_SLICE: Slice does not support shrink_axis_mask parameter.', state);
    tapMessage('TRANSPOSE: Permutation for transpose is invalid.', state);
    tapMessage('46 operations will run on the GPU, and the remaining 1141 operations will run on the CPU.', state);

    const cap = finalizeCapture(state, 'webgpu');
    expect(cap).toEqual({
      total_nodes: 1187,
      supported_nodes: 46,
      unsupported_ops: ['BROADCAST_TO', 'RESHAPE', 'STRIDED_SLICE', 'TRANSPOSE'],
    });
  });

  it('ignores non-op all-caps prefixes (log levels, GPU/CPU labels)', () => {
    const state = newState();
    tapMessage('WARNING: something happened', state);
    tapMessage('GPU: initialized', state);
    tapMessage('ERROR: bad thing', state);
    tapMessage('46 operations will run on the GPU, and the remaining 4 operations will run on the CPU.', state);

    const cap = finalizeCapture(state, 'webgpu');
    expect(cap).toEqual({ total_nodes: 50, supported_nodes: 46, unsupported_ops: [] });
  });

  it('still parses ORT WebNN capability lines (no regression)', () => {
    const state = newState();
    tapMessage(
      'number of partitions supported by WebNN: 2, number of nodes in the graph: 100, number of nodes supported by WebNN: 80',
      state,
    );
    const cap = finalizeCapture(state, 'webnn_gpu');
    expect(cap).toEqual({ partitions: 2, total_nodes: 100, supported_nodes: 80, unsupported_ops: [] });
  });

  it('returns null when no node-count info was captured (stray ops only)', () => {
    const state = newState();
    tapMessage('RESHAPE: Tensor dimensions must be less than 5.', state);
    expect(finalizeCapture(state, 'webgpu')).toBeNull();
  });
});
