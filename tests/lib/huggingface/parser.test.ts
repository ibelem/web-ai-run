import { describe, it, expect } from 'vitest';
import { parseModelFile, inferDataType, inferRuntime } from '$lib/huggingface/parser';

describe('inferRuntime', () => {
  it('detects onnx from .onnx extension', () => {
    expect(inferRuntime('model_fp16.onnx')).toBe('onnx');
  });

  it('detects litert from .tflite extension', () => {
    expect(inferRuntime('mobilenet_v3_small.tflite')).toBe('litert');
  });

  it('returns null for non-model files', () => {
    expect(inferRuntime('config.json')).toBeNull();
    expect(inferRuntime('README.md')).toBeNull();
    expect(inferRuntime('tokenizer.json')).toBeNull();
  });

  it('detects onnx from nested path', () => {
    expect(inferRuntime('onnx/model.onnx')).toBe('onnx');
  });

  it('detects litert from .litertlm extension', () => {
    expect(inferRuntime('model.litertlm')).toBe('litert');
  });
});

describe('inferDataType', () => {
  it('detects fp32 from filename', () => {
    expect(inferDataType('model.onnx')).toBe('fp32');
    expect(inferDataType('model_fp32.onnx')).toBe('fp32');
  });

  it('detects fp16 from filename', () => {
    expect(inferDataType('model_fp16.onnx')).toBe('fp16');
  });

  it('detects int8 from filename', () => {
    expect(inferDataType('model_int8.onnx')).toBe('int8');
    expect(inferDataType('model_quantized.onnx')).toBe('int8');
  });

  it('detects int4 from filename', () => {
    expect(inferDataType('model_int4.onnx')).toBe('int4');
  });

  it('detects q4 from filename', () => {
    expect(inferDataType('model_q4.onnx')).toBe('q4');
    expect(inferDataType('model_q4f16.onnx')).toBe('q4f16');
  });

  it('detects uint8 from filename', () => {
    expect(inferDataType('model_uint8.onnx')).toBe('uint8');
  });

  it('detects bnb4 from filename', () => {
    expect(inferDataType('model_bnb4.onnx')).toBe('bnb4');
  });

  it('defaults to fp32 when no type marker found', () => {
    expect(inferDataType('model.onnx')).toBe('fp32');
    expect(inferDataType('decoder_model.onnx')).toBe('fp32');
  });

  it('handles path prefixes', () => {
    expect(inferDataType('onnx/model_fp16.onnx')).toBe('fp16');
  });
});

describe('parseModelFile', () => {
  it('parses a valid onnx model file', () => {
    const result = parseModelFile('model_fp16.onnx', 164_000_000, 'webnn/mobilenet-v2');
    expect(result).toEqual({
      file_path: 'model_fp16.onnx',
      data_type: 'fp16',
      size_bytes: 164_000_000,
      runtime: 'onnx',
    });
  });

  it('parses a valid tflite model file', () => {
    const result = parseModelFile('mobilenet_v3_small.tflite', 5_200_000, 'litert-community/MobileNet');
    expect(result).toEqual({
      file_path: 'mobilenet_v3_small.tflite',
      data_type: 'fp32',
      size_bytes: 5_200_000,
      runtime: 'litert',
    });
  });

  it('returns null for non-model files', () => {
    expect(parseModelFile('config.json', 1024, 'webnn/model')).toBeNull();
    expect(parseModelFile('README.md', 500, 'webnn/model')).toBeNull();
  });

  it('skips .onnx.data external data files', () => {
    expect(parseModelFile('model.onnx.data', 1_000_000_000, 'webnn/model')).toBeNull();
  });
});
