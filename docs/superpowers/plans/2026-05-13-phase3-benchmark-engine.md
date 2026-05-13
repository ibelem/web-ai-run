# Phase 3: Benchmark Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core benchmark engine that downloads ML models, runs inference across multiple backends, collects timing metrics, and displays results — making webai.run actually useful.

**Architecture:** Browser-only execution. Models downloaded from HuggingFace CDN, cached in OPFS (fallback: Cache API). Runtimes (ONNX Runtime Web, LiteRT.js) loaded dynamically from CDN. Sequential test queue processes model x backend combinations. Metrics collected via `performance.now()`. Results displayed in a sortable table, optionally saved to Supabase.

**Tech Stack:** SvelteKit 5, TypeScript, ONNX Runtime Web (dynamic CDN), LiteRT.js (dynamic CDN), OPFS/Cache API, Web Workers (future), Supabase (results storage)

---

## File Structure

```
src/lib/engine/
├── types.ts              # All engine type definitions
├── backends.ts           # Backend constants and capability detection
├── model-cache.ts        # OPFS/Cache API download + caching with progress
├── runtime-loader.ts     # Dynamic loading of ORT and LiteRT.js from CDN
├── ort-runner.ts         # ONNX Runtime inference session management
├── litert-runner.ts      # LiteRT.js inference execution
├── metrics.ts            # Statistical calculations (median, p90, average)
├── queue.ts              # Test queue builder and sequential processor
├── environment.ts        # Hardware/browser detection (CPU, GPU, OS, browser)
└── data-type.ts          # Float16/BigInt type conversion utilities

src/lib/stores/
├── benchmark.ts          # Benchmark state store (queue, progress, results)

src/lib/components/
├── BenchmarkRunner.svelte    # Main benchmark execution UI
├── TestQueue.svelte          # Queue display with status indicators
├── BenchmarkResults.svelte   # Sortable results table
├── ProgressBar.svelte        # Model download / inference progress
├── EnvironmentInfo.svelte    # Hardware detection display
├── BackendSelector.svelte    # Backend toggle buttons
├── RunConfig.svelte          # Iterations selector

src/routes/run/
├── +page.svelte          # Benchmark execution page
├── +page.ts              # Load selected models/recipe
```

---

### Task 1: Engine Types

**Files:**
- Create: `src/lib/engine/types.ts`

- [ ] **Step 1: Define all engine type interfaces**

```typescript
// src/lib/engine/types.ts

export type Backend = 'wasm_1' | 'wasm_n' | 'webgpu' | 'webnn_cpu' | 'webnn_gpu' | 'webnn_npu';

export type TestStatus = 'pending' | 'downloading' | 'compiling' | 'running' | 'completed' | 'error';

export interface TestItem {
  id: string;
  hf_model_id: string;
  file_path: string;
  data_type: string;
  runtime: 'onnx' | 'litert';
  backend: Backend;
  status: TestStatus;
  progress: number;
  error?: string;
}

export interface BenchmarkMetrics {
  compilation_ms: number;
  first_inference_ms: number;
  time_to_first_ms: number;
  average_ms: number;
  median_ms: number;
  best_ms: number;
  p90_ms: number;
  throughput_fps: number;
}

export interface TestResult {
  id: string;
  test_item: TestItem;
  metrics: BenchmarkMetrics | null;
  inference_times: number[];
  warmup_ms: number;
  iterations: number;
  iterations_completed: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export interface DownloadProgress {
  model_id: string;
  file_path: string;
  loaded_bytes: number;
  total_bytes: number;
  percent: number;
}

export interface EnvironmentInfo {
  cpu: string;
  gpu: string;
  gpu_vendor: string;
  os: string;
  os_version: string;
  browser: string;
  browser_version: string;
  memory_gb: number;
  thread_count: number;
}

export interface RuntimeVersions {
  ort: { stable: string; dev: string; selected: string };
  litert: { stable: string; dev: string; selected: string };
}

export interface RunConfig {
  iterations: number;
  warmup_runs: number;
  backends: Backend[];
  save_results: boolean;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/engine/types.ts
git commit -m "feat: add benchmark engine type definitions"
```

---

### Task 2: Backend Constants and Capability Detection

**Files:**
- Create: `src/lib/engine/backends.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/engine/backends.test.ts
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
```

- [ ] **Step 2: Implement backends module**

```typescript
// src/lib/engine/backends.ts
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
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/lib/engine/backends.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/engine/backends.ts tests/lib/engine/backends.test.ts
git commit -m "feat: add backend definitions and capability detection"
```

---

### Task 3: Statistical Metrics Calculation

**Files:**
- Create: `src/lib/engine/metrics.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/engine/metrics.test.ts
import { describe, it, expect } from 'vitest';
import { computeMetrics, median, percentile, average } from '$lib/engine/metrics';

describe('metrics', () => {
  it('median of odd-length array', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('median of even-length array', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('percentile 90 of sorted data', () => {
    const data = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(90, data)).toBe(91);
  });

  it('average', () => {
    expect(average([10, 20, 30])).toBe(20);
  });

  it('computeMetrics produces full BenchmarkMetrics', () => {
    const times = [10, 12, 11, 9, 13, 10, 11, 12, 10, 11];
    const result = computeMetrics(times, 50, 10);
    expect(result.compilation_ms).toBe(50);
    expect(result.first_inference_ms).toBe(10);
    expect(result.time_to_first_ms).toBe(60);
    expect(result.average_ms).toBeCloseTo(10.9, 1);
    expect(result.median_ms).toBe(11);
    expect(result.best_ms).toBe(9);
    expect(result.p90_ms).toBeGreaterThanOrEqual(12);
    expect(result.throughput_fps).toBeCloseTo(1000 / 10.9, 0);
  });
});
```

- [ ] **Step 2: Implement metrics module**

```typescript
// src/lib/engine/metrics.ts
import type { BenchmarkMetrics } from './types';

export function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function percentile(p: number, arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export function average(arr: number[]): number {
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

export function computeMetrics(
  inferenceTimes: number[],
  compilationMs: number,
  firstInferenceMs: number
): BenchmarkMetrics {
  return {
    compilation_ms: compilationMs,
    first_inference_ms: firstInferenceMs,
    time_to_first_ms: compilationMs + firstInferenceMs,
    average_ms: average(inferenceTimes),
    median_ms: median(inferenceTimes),
    best_ms: Math.min(...inferenceTimes),
    p90_ms: percentile(90, inferenceTimes),
    throughput_fps: 1000 / average(inferenceTimes),
  };
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/lib/engine/metrics.test.ts`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/engine/metrics.ts tests/lib/engine/metrics.test.ts
git commit -m "feat: add statistical metrics calculation (median, p90, throughput)"
```

---

### Task 4: Model Download and Caching (OPFS / Cache API)

**Files:**
- Create: `src/lib/engine/model-cache.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/engine/model-cache.test.ts
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
```

- [ ] **Step 2: Implement model cache module**

```typescript
// src/lib/engine/model-cache.ts
import type { DownloadProgress } from './types';

const HF_CDN_BASE = 'https://huggingface.co';

export function buildModelUrl(hfModelId: string, filePath: string): string {
  return `${HF_CDN_BASE}/${hfModelId}/resolve/main/${filePath}`;
}

export function getModelFileName(hfModelId: string, filePath: string): string {
  return `${hfModelId.replace(/\//g, '--')}--${filePath.replace(/\//g, '--')}`;
}

export async function downloadModel(
  hfModelId: string,
  filePath: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<ArrayBuffer> {
  const fileName = getModelFileName(hfModelId, filePath);

  // Try OPFS first
  if ('storage' in navigator && 'getDirectory' in navigator.storage) {
    const cached = await getFromOPFS(fileName);
    if (cached) return cached;
  } else {
    // Fallback: Cache API
    const cached = await getFromCacheAPI(fileName);
    if (cached) return cached;
  }

  // Download from HuggingFace
  const url = buildModelUrl(hfModelId, filePath);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download model: ${response.status} ${response.statusText}`);
  }

  const contentLength = Number(response.headers.get('content-length') ?? 0);
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.({
      model_id: hfModelId,
      file_path: filePath,
      loaded_bytes: loaded,
      total_bytes: contentLength,
      percent: contentLength > 0 ? (loaded / contentLength) * 100 : 0,
    });
  }

  const buffer = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const arrayBuffer = buffer.buffer;

  // Cache the downloaded model
  if ('storage' in navigator && 'getDirectory' in navigator.storage) {
    await saveToOPFS(fileName, arrayBuffer);
  } else {
    await saveToCacheAPI(fileName, arrayBuffer, url);
  }

  return arrayBuffer;
}

async function getFromOPFS(fileName: string): Promise<ArrayBuffer | null> {
  try {
    const root = await navigator.storage.getDirectory();
    const modelsDir = await root.getDirectoryHandle('models', { create: true });
    const fileHandle = await modelsDir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return file.arrayBuffer();
  } catch {
    return null;
  }
}

async function saveToOPFS(fileName: string, data: ArrayBuffer): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const modelsDir = await root.getDirectoryHandle('models', { create: true });
  const fileHandle = await modelsDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

async function getFromCacheAPI(fileName: string): Promise<ArrayBuffer | null> {
  try {
    const cache = await caches.open('webai-models');
    const response = await cache.match(fileName);
    if (response) return response.arrayBuffer();
    return null;
  } catch {
    return null;
  }
}

async function saveToCacheAPI(fileName: string, data: ArrayBuffer, url: string): Promise<void> {
  const cache = await caches.open('webai-models');
  const response = new Response(data);
  await cache.put(url, response);
}

export async function clearModelCache(): Promise<void> {
  if ('storage' in navigator && 'getDirectory' in navigator.storage) {
    const root = await navigator.storage.getDirectory();
    try {
      await root.removeEntry('models', { recursive: true });
    } catch {}
  }
  try {
    await caches.delete('webai-models');
  } catch {}
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/lib/engine/model-cache.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/engine/model-cache.ts tests/lib/engine/model-cache.test.ts
git commit -m "feat: add model download and OPFS/Cache API caching with progress"
```

---

### Task 5: Data Type Conversion Utilities

**Files:**
- Create: `src/lib/engine/data-type.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/engine/data-type.test.ts
import { describe, it, expect } from 'vitest';
import { getTypedArrayConstructor, float16ToNumber, generateRandomInput } from '$lib/engine/data-type';

describe('data-type', () => {
  it('getTypedArrayConstructor maps known types', () => {
    expect(getTypedArrayConstructor('float32')).toBe(Float32Array);
    expect(getTypedArrayConstructor('int8')).toBe(Int8Array);
    expect(getTypedArrayConstructor('uint8')).toBe(Uint8Array);
    expect(getTypedArrayConstructor('int32')).toBe(Int32Array);
    expect(getTypedArrayConstructor('int64')).toBe(BigInt64Array);
  });

  it('float16ToNumber converts known values', () => {
    // 0x3C00 = 1.0 in float16
    expect(float16ToNumber(0x3c00)).toBeCloseTo(1.0);
    // 0x0000 = 0.0
    expect(float16ToNumber(0x0000)).toBe(0);
  });

  it('generateRandomInput creates typed array of correct length', () => {
    const arr = generateRandomInput('float32', 224 * 224 * 3);
    expect(arr).toBeInstanceOf(Float32Array);
    expect(arr.length).toBe(224 * 224 * 3);
  });
});
```

- [ ] **Step 2: Implement data-type module**

```typescript
// src/lib/engine/data-type.ts

type TypedArrayConstructor =
  | typeof Float32Array
  | typeof Float64Array
  | typeof Int8Array
  | typeof Int16Array
  | typeof Int32Array
  | typeof Uint8Array
  | typeof Uint16Array
  | typeof Uint32Array
  | typeof BigInt64Array;

const TYPE_MAP: Record<string, TypedArrayConstructor> = {
  float32: Float32Array,
  float64: Float64Array,
  float16: Uint16Array,
  int8: Int8Array,
  int16: Int16Array,
  int32: Int32Array,
  int64: BigInt64Array,
  uint8: Uint8Array,
  uint16: Uint16Array,
  uint32: Uint32Array,
  bool: Uint8Array,
};

export function getTypedArrayConstructor(dtype: string): TypedArrayConstructor {
  return TYPE_MAP[dtype] ?? Float32Array;
}

export function float16ToNumber(h: number): number {
  const sign = (h >> 15) & 0x1;
  const exp = (h >> 10) & 0x1f;
  const mant = h & 0x3ff;

  if (exp === 0) {
    if (mant === 0) return sign === 0 ? 0 : -0;
    // Denormalized
    const val = mant / 1024 * Math.pow(2, -14);
    return sign === 0 ? val : -val;
  }

  if (exp === 0x1f) {
    return mant === 0 ? (sign === 0 ? Infinity : -Infinity) : NaN;
  }

  const val = Math.pow(2, exp - 15) * (1 + mant / 1024);
  return sign === 0 ? val : -val;
}

export function generateRandomInput(dtype: string, length: number): ArrayBufferView {
  const Ctor = getTypedArrayConstructor(dtype);

  if (Ctor === BigInt64Array) {
    return BigInt64Array.from({ length }, () => BigInt(Math.floor(Math.random() * 100)));
  }

  return (Ctor as any).from({ length }, () => Math.random());
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/lib/engine/data-type.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/engine/data-type.ts tests/lib/engine/data-type.test.ts
git commit -m "feat: add data type conversion utilities (float16, typed arrays)"
```

---

### Task 6: Runtime Loader (ONNX Runtime Web + LiteRT.js)

**Files:**
- Create: `src/lib/engine/runtime-loader.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/engine/runtime-loader.test.ts
import { describe, it, expect } from 'vitest';
import { getOrtCdnUrl, getLiteRtCdnUrl } from '$lib/engine/runtime-loader';

describe('runtime-loader', () => {
  it('getOrtCdnUrl builds correct jsdelivr URL', () => {
    const url = getOrtCdnUrl('1.21.0', 'webgpu');
    expect(url).toContain('jsdelivr');
    expect(url).toContain('1.21.0');
    expect(url).toContain('webgpu');
  });

  it('getLiteRtCdnUrl builds correct URL', () => {
    const url = getLiteRtCdnUrl('1.1.0');
    expect(url).toContain('jsdelivr');
    expect(url).toContain('1.1.0');
  });
});
```

- [ ] **Step 2: Implement runtime loader**

```typescript
// src/lib/engine/runtime-loader.ts
import type { Backend } from './types';

let ortModule: any = null;
let litertModule: any = null;

export function getOrtCdnUrl(version: string, variant: 'all' | 'webgpu' = 'all'): string {
  const file = variant === 'webgpu' ? 'ort.webgpu.min.mjs' : 'ort.all.min.mjs';
  return `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/${file}`;
}

export function getLiteRtCdnUrl(version: string): string {
  return `https://cdn.jsdelivr.net/npm/@anthropic-ai/litert@${version}/dist/litert.mjs`;
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
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/lib/engine/runtime-loader.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/engine/runtime-loader.ts tests/lib/engine/runtime-loader.test.ts
git commit -m "feat: add dynamic runtime loader for ORT and LiteRT.js from CDN"
```

---

### Task 7: ONNX Runtime Inference Runner

**Files:**
- Create: `src/lib/engine/ort-runner.ts`

- [ ] **Step 1: Implement the ONNX runner**

```typescript
// src/lib/engine/ort-runner.ts
import type { Backend, BenchmarkMetrics, TestResult } from './types';
import { downloadModel } from './model-cache';
import { loadOrt, getOrtExecutionProvider } from './runtime-loader';
import { computeMetrics } from './metrics';
import type { DownloadProgress } from './types';

export interface OrtRunOptions {
  hf_model_id: string;
  file_path: string;
  backend: Backend;
  iterations: number;
  warmup_runs: number;
  ort_version: string;
  onProgress?: (progress: DownloadProgress) => void;
  onStatus?: (status: string) => void;
}

export async function runOrtInference(options: OrtRunOptions): Promise<TestResult> {
  const { hf_model_id, file_path, backend, iterations, warmup_runs, ort_version, onProgress, onStatus } = options;
  const startedAt = new Date().toISOString();
  const id = `${hf_model_id}::${file_path}::${backend}::${Date.now()}`;

  try {
    // Load runtime
    onStatus?.('Loading ONNX Runtime...');
    const ort = await loadOrt(ort_version, backend);

    // Download model
    onStatus?.('Downloading model...');
    const modelBuffer = await downloadModel(hf_model_id, file_path, onProgress);

    // Create session
    onStatus?.('Creating inference session...');
    const compilationStart = performance.now();
    const executionProvider = getOrtExecutionProvider(backend);
    const session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: [executionProvider],
    });
    const compilationMs = performance.now() - compilationStart;

    // Build input feeds from session metadata
    const feeds: Record<string, any> = {};
    for (const name of session.inputNames) {
      const inputMeta = session.inputMetadata?.[name];
      const dims = inputMeta?.dims ?? [1, 3, 224, 224];
      const type = inputMeta?.type ?? 'float32';
      const size = dims.reduce((a: number, b: number) => a * Math.abs(b), 1);
      const data = Float32Array.from({ length: size }, () => Math.random());
      feeds[name] = new ort.Tensor(type, data, dims);
    }

    // Warmup
    onStatus?.('Warming up...');
    for (let i = 0; i < warmup_runs; i++) {
      await session.run(feeds);
    }

    // Timed runs
    const inferenceTimes: number[] = [];
    let firstInferenceMs = 0;

    for (let i = 0; i < iterations; i++) {
      onStatus?.(`Running inference ${i + 1}/${iterations}...`);
      const t0 = performance.now();
      await session.run(feeds);
      const elapsed = performance.now() - t0;
      inferenceTimes.push(elapsed);
      if (i === 0) firstInferenceMs = elapsed;
    }

    // Cleanup
    await session.release();

    const metrics = computeMetrics(inferenceTimes, compilationMs, firstInferenceMs);

    return {
      id,
      test_item: {
        id,
        hf_model_id,
        file_path,
        data_type: file_path.includes('fp16') ? 'fp16' : 'fp32',
        runtime: 'onnx',
        backend,
        status: 'completed',
        progress: 100,
      },
      metrics,
      inference_times: inferenceTimes,
      warmup_ms: warmup_runs > 0 ? inferenceTimes[0] ?? 0 : 0,
      iterations,
      iterations_completed: iterations,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      error_message: null,
    };
  } catch (err: any) {
    return {
      id,
      test_item: {
        id,
        hf_model_id,
        file_path,
        data_type: file_path.includes('fp16') ? 'fp16' : 'fp32',
        runtime: 'onnx',
        backend,
        status: 'error',
        progress: 0,
        error: err.message,
      },
      metrics: null,
      inference_times: [],
      warmup_ms: 0,
      iterations,
      iterations_completed: 0,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      error_message: err.message,
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/engine/ort-runner.ts
git commit -m "feat: add ONNX Runtime inference runner with metrics collection"
```

---

### Task 8: LiteRT.js Inference Runner

**Files:**
- Create: `src/lib/engine/litert-runner.ts`

- [ ] **Step 1: Implement the LiteRT runner**

```typescript
// src/lib/engine/litert-runner.ts
import type { Backend, TestResult, DownloadProgress } from './types';
import { downloadModel } from './model-cache';
import { loadLiteRt } from './runtime-loader';
import { computeMetrics } from './metrics';

export interface LiteRtRunOptions {
  hf_model_id: string;
  file_path: string;
  backend: Backend;
  iterations: number;
  warmup_runs: number;
  litert_version: string;
  onProgress?: (progress: DownloadProgress) => void;
  onStatus?: (status: string) => void;
}

export async function runLiteRtInference(options: LiteRtRunOptions): Promise<TestResult> {
  const { hf_model_id, file_path, backend, iterations, warmup_runs, litert_version, onProgress, onStatus } = options;
  const startedAt = new Date().toISOString();
  const id = `${hf_model_id}::${file_path}::${backend}::${Date.now()}`;

  try {
    // Load runtime
    onStatus?.('Loading LiteRT.js...');
    const litert = await loadLiteRt(litert_version);

    // Download model
    onStatus?.('Downloading model...');
    const modelBuffer = await downloadModel(hf_model_id, file_path, onProgress);

    // Compile model
    onStatus?.('Compiling model...');
    const compilationStart = performance.now();

    const compileOpts: any = {};
    if (backend === 'webgpu') compileOpts.delegate = 'webgpu';
    else if (backend.startsWith('webnn_')) {
      compileOpts.delegate = 'webnn';
      compileOpts.deviceType = backend.replace('webnn_', '');
    }

    const model = await litert.loadAndCompile(new Uint8Array(modelBuffer), compileOpts);
    const compilationMs = performance.now() - compilationStart;

    // Discover inputs from model metadata
    const inputDetails = model.getInputDetails?.() ?? model.primarySignature?.getInputDetails?.() ?? [];

    // Create input tensors
    const createTensors = () => {
      const tensors: any[] = [];
      for (const input of inputDetails) {
        const shape = input.shape ?? [1, 224, 224, 3];
        const dtype = input.dtype ?? 'float32';
        const size = shape.reduce((a: number, b: number) => a * Math.abs(b), 1);
        const data = Float32Array.from({ length: size }, () => Math.random());
        tensors.push(litert.createTensor(data, shape, dtype));
      }
      if (tensors.length === 0) {
        const data = Float32Array.from({ length: 1 * 3 * 224 * 224 }, () => Math.random());
        tensors.push(litert.createTensor(data, [1, 3, 224, 224], 'float32'));
      }
      return tensors;
    };

    // Warmup
    onStatus?.('Warming up...');
    for (let i = 0; i < warmup_runs; i++) {
      const inputs = createTensors();
      await model.run(inputs);
      inputs.forEach((t: any) => t.delete?.());
    }

    // Timed runs
    const inferenceTimes: number[] = [];
    let firstInferenceMs = 0;

    for (let i = 0; i < iterations; i++) {
      onStatus?.(`Running inference ${i + 1}/${iterations}...`);
      const inputs = createTensors();
      const t0 = performance.now();
      const outputs = await model.run(inputs);
      const elapsed = performance.now() - t0;
      inferenceTimes.push(elapsed);
      if (i === 0) firstInferenceMs = elapsed;
      inputs.forEach((t: any) => t.delete?.());
      if (Array.isArray(outputs)) outputs.forEach((t: any) => t.delete?.());
    }

    // Cleanup
    model.delete?.();

    const metrics = computeMetrics(inferenceTimes, compilationMs, firstInferenceMs);

    return {
      id,
      test_item: {
        id,
        hf_model_id,
        file_path,
        data_type: file_path.includes('fp16') ? 'fp16' : 'fp32',
        runtime: 'litert',
        backend,
        status: 'completed',
        progress: 100,
      },
      metrics,
      inference_times: inferenceTimes,
      warmup_ms: warmup_runs > 0 ? inferenceTimes[0] ?? 0 : 0,
      iterations,
      iterations_completed: iterations,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      error_message: null,
    };
  } catch (err: any) {
    return {
      id,
      test_item: {
        id,
        hf_model_id,
        file_path,
        data_type: file_path.includes('fp16') ? 'fp16' : 'fp32',
        runtime: 'litert',
        backend,
        status: 'error',
        progress: 0,
        error: err.message,
      },
      metrics: null,
      inference_times: [],
      warmup_ms: 0,
      iterations,
      iterations_completed: 0,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      error_message: err.message,
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/engine/litert-runner.ts
git commit -m "feat: add LiteRT.js inference runner with tensor lifecycle management"
```

---

### Task 9: Test Queue Builder and Processor

**Files:**
- Create: `src/lib/engine/queue.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/engine/queue.test.ts
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
```

- [ ] **Step 2: Implement queue module**

```typescript
// src/lib/engine/queue.ts
import type { Backend, TestItem, TestResult, RunConfig, DownloadProgress } from './types';
import { runOrtInference } from './ort-runner';
import { runLiteRtInference } from './litert-runner';

interface QueueModel {
  hf_model_id: string;
  file_path: string;
  data_type: string;
  runtime: 'onnx' | 'litert';
}

export function buildTestQueue(models: QueueModel[], backends: Backend[]): TestItem[] {
  const queue: TestItem[] = [];

  for (const model of models) {
    for (const backend of backends) {
      queue.push({
        id: `${model.hf_model_id}::${model.file_path}::${backend}::${crypto.randomUUID()}`,
        hf_model_id: model.hf_model_id,
        file_path: model.file_path,
        data_type: model.data_type,
        runtime: model.runtime,
        backend,
        status: 'pending',
        progress: 0,
      });
    }
  }

  return queue;
}

export interface QueueCallbacks {
  onItemStart?: (item: TestItem) => void;
  onItemProgress?: (item: TestItem, progress: DownloadProgress) => void;
  onItemStatus?: (item: TestItem, status: string) => void;
  onItemComplete?: (item: TestItem, result: TestResult) => void;
  onQueueComplete?: (results: TestResult[]) => void;
}

export async function processQueue(
  queue: TestItem[],
  config: RunConfig,
  runtimeVersions: { ort: string; litert: string },
  callbacks?: QueueCallbacks
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const item of queue) {
    item.status = 'downloading';
    callbacks?.onItemStart?.(item);

    let result: TestResult;

    if (item.runtime === 'onnx') {
      result = await runOrtInference({
        hf_model_id: item.hf_model_id,
        file_path: item.file_path,
        backend: item.backend,
        iterations: config.iterations,
        warmup_runs: config.warmup_runs,
        ort_version: runtimeVersions.ort,
        onProgress: (p) => {
          item.progress = p.percent;
          item.status = 'downloading';
          callbacks?.onItemProgress?.(item, p);
        },
        onStatus: (s) => {
          if (s.includes('Compil') || s.includes('session')) item.status = 'compiling';
          else if (s.includes('Running') || s.includes('Warm')) item.status = 'running';
          callbacks?.onItemStatus?.(item, s);
        },
      });
    } else {
      result = await runLiteRtInference({
        hf_model_id: item.hf_model_id,
        file_path: item.file_path,
        backend: item.backend,
        iterations: config.iterations,
        warmup_runs: config.warmup_runs,
        litert_version: runtimeVersions.litert,
        onProgress: (p) => {
          item.progress = p.percent;
          item.status = 'downloading';
          callbacks?.onItemProgress?.(item, p);
        },
        onStatus: (s) => {
          if (s.includes('Compil')) item.status = 'compiling';
          else if (s.includes('Running') || s.includes('Warm')) item.status = 'running';
          callbacks?.onItemStatus?.(item, s);
        },
      });
    }

    item.status = result.error_message ? 'error' : 'completed';
    item.progress = 100;
    results.push(result);
    callbacks?.onItemComplete?.(item, result);
  }

  callbacks?.onQueueComplete?.(results);
  return results;
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/lib/engine/queue.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/engine/queue.ts tests/lib/engine/queue.test.ts
git commit -m "feat: add test queue builder and sequential processor"
```

---

### Task 10: Environment Detection

**Files:**
- Create: `src/lib/engine/environment.ts`

- [ ] **Step 1: Implement environment detection**

```typescript
// src/lib/engine/environment.ts
import type { EnvironmentInfo } from './types';

export async function detectEnvironment(): Promise<EnvironmentInfo> {
  const ua = navigator.userAgent;

  const browser = detectBrowser(ua);
  const os = detectOS(ua);
  const gpu = await detectGPU();

  return {
    cpu: navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} cores` : 'Unknown',
    gpu: gpu.renderer,
    gpu_vendor: gpu.vendor,
    os: os.name,
    os_version: os.version,
    browser: browser.name,
    browser_version: browser.version,
    memory_gb: (navigator as any).deviceMemory ?? 0,
    thread_count: navigator.hardwareConcurrency ?? 1,
  };
}

function detectBrowser(ua: string): { name: string; version: string } {
  if (ua.includes('Edg/')) {
    const match = ua.match(/Edg\/([\d.]+)/);
    return { name: 'Edge', version: match?.[1] ?? '' };
  }
  if (ua.includes('Chrome/')) {
    const match = ua.match(/Chrome\/([\d.]+)/);
    return { name: 'Chrome', version: match?.[1] ?? '' };
  }
  if (ua.includes('Firefox/')) {
    const match = ua.match(/Firefox\/([\d.]+)/);
    return { name: 'Firefox', version: match?.[1] ?? '' };
  }
  if (ua.includes('Safari/') && !ua.includes('Chrome')) {
    const match = ua.match(/Version\/([\d.]+)/);
    return { name: 'Safari', version: match?.[1] ?? '' };
  }
  return { name: 'Unknown', version: '' };
}

function detectOS(ua: string): { name: string; version: string } {
  if (ua.includes('Windows NT')) {
    const match = ua.match(/Windows NT ([\d.]+)/);
    const ver = match?.[1] ?? '';
    const name = ver.startsWith('10') ? 'Windows' : 'Windows';
    return { name, version: ver };
  }
  if (ua.includes('Mac OS X')) {
    const match = ua.match(/Mac OS X ([\d_]+)/);
    return { name: 'macOS', version: match?.[1]?.replace(/_/g, '.') ?? '' };
  }
  if (ua.includes('Linux')) {
    return { name: 'Linux', version: '' };
  }
  if (ua.includes('Android')) {
    const match = ua.match(/Android ([\d.]+)/);
    return { name: 'Android', version: match?.[1] ?? '' };
  }
  return { name: 'Unknown', version: '' };
}

async function detectGPU(): Promise<{ vendor: string; renderer: string }> {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        return {
          vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),
          renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
        };
      }
    }
  } catch {}
  return { vendor: 'Unknown', renderer: 'Unknown' };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/engine/environment.ts
git commit -m "feat: add hardware/browser environment detection"
```

---

### Task 11: Benchmark State Store

**Files:**
- Create: `src/lib/stores/benchmark.ts`

- [ ] **Step 1: Implement the benchmark store**

```typescript
// src/lib/stores/benchmark.ts
import { writable, derived } from 'svelte/store';
import type { TestItem, TestResult, RunConfig, DownloadProgress } from '$lib/engine/types';

export const testQueue = writable<TestItem[]>([]);
export const testResults = writable<TestResult[]>([]);
export const isRunning = writable(false);
export const currentStatus = writable('');
export const downloadProgress = writable<DownloadProgress | null>(null);

export const runConfig = writable<RunConfig>({
  iterations: 10,
  warmup_runs: 3,
  backends: ['wasm_1'],
  save_results: false,
});

export const completedCount = derived(testQueue, ($q) =>
  $q.filter((item) => item.status === 'completed' || item.status === 'error').length
);

export const totalCount = derived(testQueue, ($q) => $q.length);

export function resetBenchmark(): void {
  testQueue.set([]);
  testResults.set([]);
  isRunning.set(false);
  currentStatus.set('');
  downloadProgress.set(null);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/stores/benchmark.ts
git commit -m "feat: add benchmark state store (queue, results, progress)"
```

---

### Task 12: UI Components — BackendSelector, RunConfig, ProgressBar

**Files:**
- Create: `src/lib/components/BackendSelector.svelte`
- Create: `src/lib/components/RunConfig.svelte`
- Create: `src/lib/components/ProgressBar.svelte`

- [ ] **Step 1: Create BackendSelector component**

```svelte
<!-- src/lib/components/BackendSelector.svelte -->
<script lang="ts">
  import type { Backend } from '$lib/engine/types';
  import { BACKENDS, getBackendLabel } from '$lib/engine/backends';

  let { selected = $bindable([]), available = [] }: { selected: Backend[]; available: Backend[] } = $props();

  function toggle(id: Backend) {
    if (selected.includes(id)) {
      selected = selected.filter((b) => b !== id);
    } else {
      selected = [...selected, id];
    }
  }
</script>

<div class="backend-selector">
  {#each BACKENDS as backend}
    <button
      class="backend-btn"
      class:active={selected.includes(backend.id)}
      class:unavailable={!available.includes(backend.id)}
      disabled={!available.includes(backend.id)}
      onclick={() => toggle(backend.id)}
    >
      {backend.label}
    </button>
  {/each}
</div>

<style>
  .backend-selector {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-half);
  }

  .backend-btn {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    padding: var(--space-half) var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .backend-btn:hover:not(:disabled) {
    border-color: var(--color-border-strong);
  }

  .backend-btn.active {
    background: var(--color-text-primary);
    color: var(--color-surface);
    border-color: var(--color-text-primary);
  }

  .backend-btn.unavailable {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
```

- [ ] **Step 2: Create RunConfig component**

```svelte
<!-- src/lib/components/RunConfig.svelte -->
<script lang="ts">
  let { iterations = $bindable(10), save_results = $bindable(false) }: { iterations: number; save_results: boolean } = $props();

  const iterationOptions = [1, 10, 20, 50, 100, 500, 1000];
</script>

<div class="run-config">
  <label class="config-field">
    <span class="config-label">Iterations</span>
    <select bind:value={iterations}>
      {#each iterationOptions as opt}
        <option value={opt}>{opt}</option>
      {/each}
    </select>
  </label>

  <label class="config-field checkbox">
    <input type="checkbox" bind:checked={save_results} />
    <span class="config-label">Save results to database</span>
  </label>
</div>

<style>
  .run-config {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .config-field {
    display: flex;
    align-items: center;
    gap: var(--space-half);
  }

  .config-field.checkbox {
    cursor: pointer;
  }

  .config-label {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  select {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    padding: 2px var(--space-half);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-primary);
  }

  input[type="checkbox"] {
    cursor: pointer;
  }
</style>
```

- [ ] **Step 3: Create ProgressBar component**

```svelte
<!-- src/lib/components/ProgressBar.svelte -->
<script lang="ts">
  let { percent = 0, label = '' }: { percent: number; label: string } = $props();
</script>

<div class="progress-wrapper">
  {#if label}
    <span class="progress-label">{label}</span>
  {/if}
  <div class="progress-track">
    <div class="progress-fill" style="width: {Math.min(100, percent)}%"></div>
  </div>
  <span class="progress-percent">{percent.toFixed(0)}%</span>
</div>

<style>
  .progress-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .progress-label {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    min-width: 80px;
  }

  .progress-track {
    flex: 1;
    height: 4px;
    background: var(--color-surface-sunken);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--color-info);
    border-radius: 2px;
    transition: width 150ms ease;
  }

  .progress-percent {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    min-width: 32px;
    text-align: right;
  }
</style>
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/BackendSelector.svelte src/lib/components/RunConfig.svelte src/lib/components/ProgressBar.svelte
git commit -m "feat: add BackendSelector, RunConfig, and ProgressBar components"
```

---

### Task 13: UI Components — TestQueue and BenchmarkResults

**Files:**
- Create: `src/lib/components/TestQueue.svelte`
- Create: `src/lib/components/BenchmarkResults.svelte`

- [ ] **Step 1: Create TestQueue component**

```svelte
<!-- src/lib/components/TestQueue.svelte -->
<script lang="ts">
  import type { TestItem } from '$lib/engine/types';
  import { getBackendLabel } from '$lib/engine/backends';

  let { queue = [] }: { queue: TestItem[] } = $props();

  const statusIcons: Record<string, string> = {
    pending: '○',
    downloading: '◎',
    compiling: '◉',
    running: '●',
    completed: '✓',
    error: '✗',
  };
</script>

<div class="test-queue">
  <h3 class="queue-title">Test Queue ({queue.length})</h3>
  <div class="queue-list">
    {#each queue as item}
      <div class="queue-item" class:active={item.status === 'running' || item.status === 'downloading' || item.status === 'compiling'} class:done={item.status === 'completed'} class:failed={item.status === 'error'}>
        <span class="status-icon">{statusIcons[item.status]}</span>
        <span class="item-model">{item.hf_model_id.split('/')[1]}</span>
        <span class="item-file">{item.file_path.split('/').pop()}</span>
        <span class="item-backend">{getBackendLabel(item.backend)}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .test-queue {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-2);
  }

  .queue-title {
    font-size: var(--text-sm);
    font-weight: 500;
    margin-bottom: var(--space-1);
    color: var(--color-text-secondary);
  }

  .queue-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .queue-item {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-half) var(--space-1);
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
  }

  .queue-item.active {
    background: var(--color-surface-sunken);
    color: var(--color-text-primary);
  }

  .queue-item.done { color: var(--color-success); }
  .queue-item.failed { color: var(--color-error); }

  .status-icon { width: 12px; text-align: center; }
  .item-model { flex: 1; }
  .item-file { color: var(--color-text-muted); }
  .item-backend { min-width: 100px; text-align: right; }
</style>
```

- [ ] **Step 2: Create BenchmarkResults component**

```svelte
<!-- src/lib/components/BenchmarkResults.svelte -->
<script lang="ts">
  import type { TestResult } from '$lib/engine/types';
  import { getBackendLabel } from '$lib/engine/backends';

  let { results = [] }: { results: TestResult[] } = $props();

  let sortBy = $state<string>('median_ms');
  let sortAsc = $state(true);

  const sortedResults = $derived(
    [...results]
      .filter((r) => r.metrics)
      .sort((a, b) => {
        const aVal = (a.metrics as any)?.[sortBy] ?? 0;
        const bVal = (b.metrics as any)?.[sortBy] ?? 0;
        return sortAsc ? aVal - bVal : bVal - aVal;
      })
  );

  function toggleSort(col: string) {
    if (sortBy === col) sortAsc = !sortAsc;
    else { sortBy = col; sortAsc = true; }
  }

  function fmt(ms: number): string {
    return ms < 1 ? ms.toFixed(3) : ms.toFixed(2);
  }
</script>

<div class="results-wrapper">
  <h3 class="results-title">Results ({results.filter((r) => r.metrics).length})</h3>

  {#if sortedResults.length > 0}
    <div class="results-table-wrapper">
      <table class="results-table">
        <thead>
          <tr>
            <th>Model</th>
            <th>Backend</th>
            <th class="sortable" onclick={() => toggleSort('compilation_ms')}>Load+Compile</th>
            <th class="sortable" onclick={() => toggleSort('first_inference_ms')}>1st Inference</th>
            <th class="sortable" onclick={() => toggleSort('median_ms')}>Median</th>
            <th class="sortable" onclick={() => toggleSort('average_ms')}>Average</th>
            <th class="sortable" onclick={() => toggleSort('best_ms')}>Best</th>
            <th class="sortable" onclick={() => toggleSort('p90_ms')}>P90</th>
            <th class="sortable" onclick={() => toggleSort('throughput_fps')}>FPS</th>
          </tr>
        </thead>
        <tbody>
          {#each sortedResults as result}
            <tr>
              <td class="model-col">{result.test_item.hf_model_id.split('/')[1]}</td>
              <td>{getBackendLabel(result.test_item.backend)}</td>
              <td class="metric">{fmt(result.metrics!.compilation_ms)}</td>
              <td class="metric">{fmt(result.metrics!.first_inference_ms)}</td>
              <td class="metric highlight">{fmt(result.metrics!.median_ms)}</td>
              <td class="metric">{fmt(result.metrics!.average_ms)}</td>
              <td class="metric">{fmt(result.metrics!.best_ms)}</td>
              <td class="metric">{fmt(result.metrics!.p90_ms)}</td>
              <td class="metric">{fmt(result.metrics!.throughput_fps)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <p class="no-results">No results yet. Run a benchmark to see metrics.</p>
  {/if}
</div>

<style>
  .results-wrapper {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-2);
  }

  .results-title {
    font-size: var(--text-sm);
    font-weight: 500;
    margin-bottom: var(--space-1);
    color: var(--color-text-secondary);
  }

  .results-table-wrapper {
    overflow-x: auto;
  }

  .results-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-xs);
    font-family: var(--font-mono);
  }

  .results-table th {
    text-align: left;
    padding: var(--space-half) var(--space-1);
    font-weight: 500;
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
  }

  .results-table th.sortable {
    cursor: pointer;
  }

  .results-table th.sortable:hover {
    color: var(--color-text-primary);
  }

  .results-table td {
    padding: var(--space-half) var(--space-1);
    border-bottom: 1px solid var(--color-border);
  }

  .results-table tr:last-child td {
    border-bottom: none;
  }

  .model-col {
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .metric {
    text-align: right;
    color: var(--color-text-secondary);
  }

  .metric.highlight {
    color: var(--color-text-primary);
    font-weight: 500;
  }

  .no-results {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    padding: var(--space-2) 0;
  }
</style>
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/TestQueue.svelte src/lib/components/BenchmarkResults.svelte
git commit -m "feat: add TestQueue and BenchmarkResults UI components"
```

---

### Task 14: Benchmark Runner Page (/run)

**Files:**
- Create: `src/routes/run/+page.ts`
- Create: `src/routes/run/+page.svelte`

- [ ] **Step 1: Create the page load**

```typescript
// src/routes/run/+page.ts
import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';

export const load: PageLoad = async ({ url }) => {
  const modelIds = url.searchParams.get('models')?.split(',') ?? [];
  const recipeId = url.searchParams.get('recipe');

  if (modelIds.length === 0 && !recipeId) {
    return { models: [], recipe: null };
  }

  const supabase = createClient();

  if (recipeId) {
    const { data: recipe } = await supabase
      .from('recipes')
      .select('*')
      .eq('id', recipeId)
      .single();
    return { models: [], recipe };
  }

  const { data: models } = await supabase
    .from('models')
    .select('id, hf_model_id, file_path, data_type, size_bytes, runtime, source_org, category')
    .in('id', modelIds);

  return { models: models ?? [], recipe: null };
};
```

- [ ] **Step 2: Create the benchmark page**

```svelte
<!-- src/routes/run/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Backend, TestItem, TestResult, RunConfig as RunConfigType } from '$lib/engine/types';
  import { detectAvailableBackends } from '$lib/engine/backends';
  import { buildTestQueue, processQueue } from '$lib/engine/queue';
  import { detectEnvironment } from '$lib/engine/environment';
  import BackendSelector from '$lib/components/BackendSelector.svelte';
  import RunConfigCmp from '$lib/components/RunConfig.svelte';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import TestQueue from '$lib/components/TestQueue.svelte';
  import BenchmarkResults from '$lib/components/BenchmarkResults.svelte';

  let { data } = $props();

  let availableBackends = $state<Backend[]>(['wasm_1']);
  let selectedBackends = $state<Backend[]>(['wasm_1']);
  let iterations = $state(10);
  let saveResults = $state(false);
  let queue = $state<TestItem[]>([]);
  let results = $state<TestResult[]>([]);
  let isRunning = $state(false);
  let statusText = $state('');
  let downloadPercent = $state(0);
  let environment = $state<any>(null);

  onMount(async () => {
    availableBackends = await detectAvailableBackends();
    environment = await detectEnvironment();
  });

  function buildQueue() {
    const models = data.models.map((m: any) => ({
      hf_model_id: m.hf_model_id,
      file_path: m.file_path,
      data_type: m.data_type,
      runtime: m.runtime,
    }));
    queue = buildTestQueue(models, selectedBackends);
  }

  async function startBenchmark() {
    if (queue.length === 0) buildQueue();
    if (queue.length === 0) return;

    isRunning = true;
    results = [];

    const config: RunConfigType = {
      iterations,
      warmup_runs: 3,
      backends: selectedBackends,
      save_results: saveResults,
    };

    const newResults = await processQueue(
      queue,
      config,
      { ort: '1.21.0', litert: '1.1.0' },
      {
        onItemStart: (item) => {
          queue = [...queue];
          statusText = `Testing ${item.hf_model_id.split('/')[1]}...`;
        },
        onItemProgress: (_item, progress) => {
          downloadPercent = progress.percent;
        },
        onItemStatus: (_item, status) => {
          statusText = status;
        },
        onItemComplete: (_item, result) => {
          results = [...results, result];
          queue = [...queue];
          downloadPercent = 0;
        },
      }
    );

    results = newResults;
    isRunning = false;
    statusText = 'Benchmark complete.';
  }

  function stopBenchmark() {
    isRunning = false;
    statusText = 'Stopped.';
  }
</script>

<div class="run-page">
  <header class="page-header">
    <h1>Benchmark</h1>
    <p>
      {#if data.models.length > 0}
        {data.models.length} model{data.models.length > 1 ? 's' : ''} selected
      {:else}
        Select models from the Model page to benchmark.
      {/if}
    </p>
  </header>

  <section class="config-section">
    <BackendSelector bind:selected={selectedBackends} available={availableBackends} />
    <RunConfigCmp bind:iterations bind:save_results={saveResults} />

    <div class="actions">
      {#if !isRunning}
        <button class="btn-primary" onclick={startBenchmark} disabled={data.models.length === 0}>
          Run Benchmark
        </button>
      {:else}
        <button class="btn-stop" onclick={stopBenchmark}>Stop</button>
      {/if}
    </div>
  </section>

  {#if isRunning || statusText}
    <section class="status-section">
      <p class="status-text">{statusText}</p>
      {#if downloadPercent > 0 && downloadPercent < 100}
        <ProgressBar percent={downloadPercent} label="Downloading" />
      {/if}
    </section>
  {/if}

  {#if queue.length > 0}
    <section class="queue-section">
      <TestQueue {queue} />
    </section>
  {/if}

  {#if results.length > 0}
    <section class="results-section">
      <BenchmarkResults {results} />
    </section>
  {/if}

  {#if environment}
    <section class="env-section">
      <details>
        <summary class="env-summary">Environment</summary>
        <div class="env-grid">
          <span class="env-label">CPU</span><span class="env-value">{environment.cpu}</span>
          <span class="env-label">GPU</span><span class="env-value">{environment.gpu}</span>
          <span class="env-label">OS</span><span class="env-value">{environment.os} {environment.os_version}</span>
          <span class="env-label">Browser</span><span class="env-value">{environment.browser} {environment.browser_version}</span>
          <span class="env-label">Memory</span><span class="env-value">{environment.memory_gb} GB</span>
          <span class="env-label">Threads</span><span class="env-value">{environment.thread_count}</span>
        </div>
      </details>
    </section>
  {/if}
</div>

<style>
  .run-page {
    max-width: 100%;
  }

  .page-header {
    margin-bottom: var(--space-3);
  }

  .page-header h1 {
    font-size: var(--text-xl);
    font-weight: 300;
    margin-bottom: var(--space-half);
  }

  .page-header p {
    font-size: var(--text-base);
    color: var(--color-text-secondary);
  }

  .config-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .actions {
    display: flex;
    gap: var(--space-1);
  }

  .btn-primary {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius-base);
    background: var(--color-text-primary);
    color: var(--color-surface);
    cursor: pointer;
  }

  .btn-primary:hover { opacity: 0.85; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-stop {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-error);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-error);
    cursor: pointer;
  }

  .status-section {
    margin-bottom: var(--space-2);
  }

  .status-text {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-half);
  }

  .queue-section, .results-section {
    margin-bottom: var(--space-3);
  }

  .env-section {
    margin-top: var(--space-3);
  }

  .env-summary {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
  }

  .env-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-half) var(--space-2);
    margin-top: var(--space-1);
    font-size: var(--text-xs);
    font-family: var(--font-mono);
  }

  .env-label { color: var(--color-text-muted); }
  .env-value { color: var(--color-text-primary); }
</style>
```

- [ ] **Step 3: Add /run to nav**

In `src/routes/+layout.svelte`, add to navItems:

```typescript
const navItems = [
  { href: '/model', label: 'Model' },
  { href: '/run', label: 'Run' },
  { href: '/recipe', label: 'Recipe' },
  { href: '/custom', label: 'Custom' }
];
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/run/+page.ts src/routes/run/+page.svelte src/routes/+layout.svelte
git commit -m "feat: add /run benchmark page with queue, progress, and results"
```

---

### Task 15: Model Selection Integration (Model Page → Run Page)

**Files:**
- Modify: `src/lib/components/ModelCard.svelte`
- Modify: `src/routes/model/+page.svelte`

- [ ] **Step 1: Add selection state to model page**

Add a `selectedModels` set to the model page. Each ModelCard gets a checkbox. A "Run Selected" button at the top navigates to `/run?models=id1,id2,...`.

In `src/routes/model/+page.svelte`, add:
```typescript
let selectedIds = $state<Set<string>>(new Set());

function toggleSelect(id: string) {
  const next = new Set(selectedIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds = next;
}

function runSelected() {
  const ids = [...selectedIds].join(',');
  window.location.href = `/run?models=${ids}`;
}
```

Add a "Run Selected" button in the page header when selections exist.

- [ ] **Step 2: Update ModelCard to accept selection props**

Add `selected` and `ontoggle` props to ModelCard. Show a checkbox or visual selected state.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/ModelCard.svelte src/routes/model/+page.svelte
git commit -m "feat: add model selection and 'Run Selected' flow to /run page"
```

---

### Task 16: Type Check and Final Verification

- [ ] **Step 1: Run svelte-kit sync**

Run: `npx svelte-kit sync`

- [ ] **Step 2: Run type check**

Run: `npx svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors (excluding pre-existing a11y warnings)

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Fix any issues found**

- [ ] **Step 5: Commit fixes**

```bash
git add -A
git commit -m "fix: resolve type errors and test failures in benchmark engine"
```
