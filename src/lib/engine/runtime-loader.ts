import type { Backend } from './types';

let ortModule: any = null;
let litertModule: any = null;

export function getOrtCdnUrl(version: string, variant: 'all' | 'webgpu' = 'all'): string {
  const file = variant === 'webgpu' ? 'ort.webgpu.min.mjs' : 'ort.all.min.mjs';
  return `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/${file}`;
}

export function getLiteRtCdnUrl(version: string): string {
  return `https://cdn.jsdelivr.net/npm/@litertjs/core@${version}/dist/litert.mjs`;
}

export async function loadOrt(version: string, backend: Backend): Promise<any> {
  if (ortModule) return ortModule;

  const variant = backend === 'webgpu' ? 'webgpu' : 'all';
  const url = getOrtCdnUrl(version, variant);

  ortModule = await import(/* @vite-ignore */ url);
  return ortModule;
}

export async function loadLiteRt(version: string): Promise<any> {
  if (litertModule) return litertModule;

  const url = getLiteRtCdnUrl(version);
  litertModule = await import(/* @vite-ignore */ url);
  return litertModule;
}

export function getOrtExecutionProvider(backend: Backend): any {
  switch (backend) {
    case 'wasm_1':
      return { name: 'wasm', numThreads: 1 };
    case 'wasm_n':
      return { name: 'wasm' };
    case 'webgpu':
      return { name: 'webgpu' };
    case 'webnn_cpu':
      return { name: 'webnn', deviceType: 'cpu' };
    case 'webnn_gpu':
      return { name: 'webnn', deviceType: 'gpu' };
    case 'webnn_npu':
      return { name: 'webnn', deviceType: 'npu' };
  }
}

export function resetLoadedRuntimes(): void {
  ortModule = null;
  litertModule = null;
}
