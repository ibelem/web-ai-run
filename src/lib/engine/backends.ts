import type { Backend } from './types';

export interface BackendDef {
  id: Backend;
  label: string;
  runtime: 'onnx' | 'litert' | 'both';
  requiresFlag: boolean;
}

export const BACKENDS: BackendDef[] = [
  { id: 'wasm_1', label: 'Wasm (1 thread)', runtime: 'both', requiresFlag: false },
  { id: 'wasm_n', label: 'Wasm (multi-thread)', runtime: 'both', requiresFlag: false },
  { id: 'webgpu', label: 'WebGPU', runtime: 'both', requiresFlag: false },
  { id: 'webnn_cpu', label: 'WebNN CPU', runtime: 'both', requiresFlag: true },
  { id: 'webnn_gpu', label: 'WebNN GPU', runtime: 'both', requiresFlag: true },
  { id: 'webnn_npu', label: 'WebNN NPU', runtime: 'both', requiresFlag: true },
];

export function getBackendLabel(id: Backend): string {
  return BACKENDS.find((b) => b.id === id)?.label ?? id;
}

export async function detectAvailableBackends(): Promise<Backend[]> {
  const available: Backend[] = ['wasm_1'];

  if (typeof SharedArrayBuffer !== 'undefined') {
    available.push('wasm_n');
  }

  if ('gpu' in navigator) {
    try {
      const adapter = await (navigator as any).gpu?.requestAdapter();
      if (adapter) available.push('webgpu');
    } catch {}
  }

  if ('ml' in navigator) {
    available.push('webnn_cpu');
    available.push('webnn_gpu');
    available.push('webnn_npu');
  }

  return available;
}
