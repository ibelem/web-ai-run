export interface OrgConfig {
  name: string;
  runtime: 'onnx' | 'litert' | 'mixed';
}

export const HF_ORGS: OrgConfig[] = [
  { name: 'Xenova', runtime: 'onnx' },
  { name: 'onnx-community', runtime: 'onnx' },
  { name: 'webnn', runtime: 'onnx' },
  { name: 'webgpu', runtime: 'onnx' },
  { name: 'litert-community', runtime: 'litert' },
];

export const HF_API_BASE = 'https://huggingface.co/api';
