import { describe, it, expect } from 'vitest';
import { inferRuntime, inferDataType, parseModelFile } from '$lib/huggingface/parser';
import { HfClient } from '$lib/huggingface/client';
import { HF_ORGS } from '$lib/huggingface/orgs';
import { discoverModels } from '$lib/huggingface/discover';

describe('smoke test', () => {
  it('project is configured correctly', () => {
    expect(true).toBe(true);
  });
});

describe('Phase 2: HuggingFace Integration smoke test', () => {
  it('exports HF_ORGS with 5 organizations', () => {
    expect(HF_ORGS).toHaveLength(5);
  });

  it('HfClient is instantiable', () => {
    const client = new HfClient();
    expect(client).toBeDefined();
  });

  it('parser handles common model filenames', () => {
    expect(inferRuntime('model.onnx')).toBe('onnx');
    expect(inferRuntime('model.tflite')).toBe('litert');
    expect(inferDataType('model_fp16.onnx')).toBe('fp16');
  });

  it('discoverModels is callable', () => {
    expect(typeof discoverModels).toBe('function');
  });
});
