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

// ── LLM benchmark types ────────────────────────────────────────────────────

export type LLMBackend = 'wasm' | 'webgpu' | 'webnn_cpu' | 'webnn_gpu' | 'webnn_npu';

export type LLMRuntime = 'transformers'; // later: 'litertlm' | 'mediapipe'

export type LLMPhase = 'download' | 'compile' | 'generate';

export interface LLMRecipeModel {
  hf_model_id: string;
  data_type: string;      // 'fp32' | 'fp16' | 'q4f16' | 'int8' | ...
  size_bytes?: number;
}

export interface SingleRunResult {
  ttftMs: number;
  decodeMs: number;
  tps: number;
  e2eMs: number;
  outputTokens: number;
  promptTokens: number;
}

export interface LLMBenchmarkResult {
  ttftMsRuns: number[];
  decodeMsRuns: number[];
  tpsRuns: number[];
  e2eMsRuns: number[];

  ttftMs: number;
  ttftStddevMs: number;
  tpotMs: number;
  tps: number;
  tpsStddev: number;
  decodeMs: number;
  e2eMs: number;
  e2eStddevMs: number;
  e2eTps: number;

  promptTokens: number;
  outputTokens: number;
  compilationMs: number;
  warmupTtftMs: number;
}

export type LLMWorkerMessage =
  | { type: 'download-start';    id: string; totalBytes: number; fileCount: number; files: string[] }
  | { type: 'download-progress'; id: string; loaded: number; total: number; currentFile: string }
  | { type: 'download-done';     id: string; cacheHit: boolean; durationMs: number }
  | { type: 'compile-start';     id: string }
  | { type: 'compile-done';      id: string; compileMs: number }
  | { type: 'generate-start';    id: string; runIndex: number; promptTokens: number }
  | { type: 'token';             id: string; runIndex: number; token: string; tokenIndex: number; elapsedMs: number; tps: number }
  | { type: 'ttft';              id: string; runIndex: number; ttftMs: number }
  | { type: 'run-done';          id: string; runIndex: number; runResult: SingleRunResult }
  | { type: 'all-done';          id: string; result: LLMBenchmarkResult }
  | { type: 'error';             id: string; message: string; phase: LLMPhase }
  | { type: 'progress';          id: string; status: string }
  | { type: 'logs';              id: string; logs: string[] };

export interface LLMWorkerRequest {
  type: 'run';
  id: string;
  hfModelId: string;
  dtype: string;
  runtime: LLMRuntime;
  backend: LLMBackend;
  runtimeVersion: string;
  prompt: string;
  promptTokens?: number;
  maxNewTokens: number;
  runs: number;
  warmupRuns: number;
}

export interface ResultsLlmRow {
  id: string;
  user_id: string;
  run_id: string | null;
  hf_model_id: string;
  model_dir: string | null;
  data_type: string;
  backend: string;
  runtime: string;
  runtime_version: string;
  prompt: string;
  prompt_tokens: number | null;
  max_new_tokens: number;
  runs: number;
  warmup_runs: number;
  status: string;
  error_message: string | null;
  error_phase: string | null;
  ttft_ms: number | null;
  tpot_ms: number | null;
  tps: number | null;
  decode_ms: number | null;
  e2e_ms: number | null;
  e2e_tps: number | null;
  output_tokens: number | null;
  compilation_ms: number | null;
  load_and_compile_ms: number | null;
  warmup_ttft_ms: number | null;
  ttft_ms_runs: number[] | null;
  decode_ms_runs: number[] | null;
  tps_runs: number[] | null;
  e2e_ms_runs: number[] | null;
  cpu: string | null;
  gpu: string | null;
  os: string | null;
  browser: string | null;
  browser_version: string | null;
  gpu_driver_version: string | null;
  npu_driver_version: string | null;
  webnn_ep: string | null;
  webnn_capability: Record<string, any> | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface RunConfig {
  iterations: number;
  warmup_runs: number;
  backends: Backend[];
  save_results: boolean;
}
