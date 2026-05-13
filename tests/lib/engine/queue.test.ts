import { describe, it, expect } from 'vitest';
import { buildTestQueue } from '$lib/engine/queue';

describe('queue', () => {
  it('builds cross-product of models x backends', () => {
    const models = [
      { hf_model_id: 'webnn/mobilenet-v2', file_path: 'onnx/model_fp16.onnx', data_type: 'fp16', runtime: 'onnx' as const },
    ];
    const backends = ['wasm_1', 'webgpu'] as const;
    const queue = buildTestQueue(models, [...backends]);
    expect(queue).toHaveLength(2);
    expect(queue[0].backend).toBe('wasm_1');
    expect(queue[1].backend).toBe('webgpu');
    expect(queue[0].status).toBe('pending');
  });

  it('generates unique IDs for each test item', () => {
    const models = [
      { hf_model_id: 'a/b', file_path: 'model.onnx', data_type: 'fp32', runtime: 'onnx' as const },
    ];
    const backends = ['wasm_1', 'wasm_n'] as const;
    const queue = buildTestQueue(models, [...backends]);
    expect(queue[0].id).not.toBe(queue[1].id);
  });
});
