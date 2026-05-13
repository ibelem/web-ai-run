import { describe, it, expect } from 'vitest';
import { buildModelUrl, getModelFileName } from '$lib/engine/model-cache';

describe('model-cache', () => {
  it('buildModelUrl constructs HuggingFace CDN URL', () => {
    const url = buildModelUrl('webnn/mobilenet-v2', 'onnx/model_fp16.onnx');
    expect(url).toBe('https://huggingface.co/webnn/mobilenet-v2/resolve/main/onnx/model_fp16.onnx');
  });

  it('getModelFileName creates safe filesystem name', () => {
    const name = getModelFileName('webnn/mobilenet-v2', 'onnx/model_fp16.onnx');
    expect(name).toBe('webnn--mobilenet-v2--onnx--model_fp16.onnx');
  });
});
