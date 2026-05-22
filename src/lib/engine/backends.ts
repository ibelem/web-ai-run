import type { Backend } from './types';

export interface BackendDef {
  id: Backend;
  label: string;
  description: string;
  runtime: 'onnx' | 'litert' | 'both';
  requiresFlag: boolean;
}

export const BACKENDS: BackendDef[] = [
  { id: 'wasm_1',     label: 'Wasm',           description: 'CPU via WebAssembly, single thread. Works in every browser.',                                        runtime: 'both', requiresFlag: false },
  { id: 'wasm_n',     label: 'Wasm (Threads)', description: 'CPU via WebAssembly with multi-threading. Requires SharedArrayBuffer (most modern browsers).',        runtime: 'both', requiresFlag: false },
  { id: 'webgpu',     label: 'WebGPU',         description: 'GPU acceleration via the WebGPU API. Fast for large models on modern desktop browsers.',             runtime: 'both', requiresFlag: false },
  { id: 'webnn_cpu',  label: 'WebNN CPU',      description: 'Hardware-accelerated neural network inference on CPU via WebNN. Requires a Chrome/Edge flag.',        runtime: 'both', requiresFlag: true  },
  { id: 'webnn_gpu',  label: 'WebNN GPU',      description: 'Hardware-accelerated neural network inference on GPU via WebNN. Requires a Chrome/Edge flag.',        runtime: 'both', requiresFlag: true  },
  { id: 'webnn_npu',  label: 'WebNN NPU',      description: 'Neural network inference on a dedicated NPU via WebNN. Requires a Copilot+ PC and Chrome/Edge flag.', runtime: 'both', requiresFlag: true  },
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
