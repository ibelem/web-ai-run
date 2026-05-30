export type Backend = 'wasm_1' | 'wasm_n' | 'webgpu' | 'webnn_cpu' | 'webnn_gpu' | 'webnn_npu';

export type TestStatus = 'pending' | 'downloading' | 'compiling' | 'running' | 'uploading' | 'completed' | 'error';

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
  compilation_ms: number | null;
  load_and_compile_ms: number | null;
  first_inference_ms: number;
  time_to_first_ms: number;
  average_ms: number;
  median_ms: number;
  best_ms: number;
  p90_ms: number;
  throughput_fps: number;
}

export interface WebNNCapability {
  partitions?: number;
  total_nodes: number;
  supported_nodes: number;
  unsupported_ops: string[];
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
  logs?: string[];
  webnn_capability?: WebNNCapability | null;
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
