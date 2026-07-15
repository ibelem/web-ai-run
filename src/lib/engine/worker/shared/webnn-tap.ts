export interface CaptureState {
  partitions: number | undefined;
  total_nodes: number;
  supported_nodes: number;
  unsupported_ops: Set<string>;
}

export interface Capability {
  partitions?: number;
  total_nodes: number;
  supported_nodes: number;
  unsupported_ops: string[];
}

// Known TFLite BuiltinOperator names. The GPU-delegate rejection log lines look
// like "OP_NAME: <reason>"; we only treat the prefix as an unsupported op when
// it's in this set, so log-level prefixes (WARNING/ERROR/…) and labels (GPU/CPU)
// can never be misread as ops. Broad on purpose — under-capturing a novel op is
// safer than polluting the data. Keep in sync with the inline copy in
// inference.worker.ts.
export const TFLITE_OPS = new Set<string>([
  // NN layers
  'CONV_2D','DEPTHWISE_CONV_2D','FULLY_CONNECTED','EMBEDDING_LOOKUP','RNN','LSTM',
  'BIDIRECTIONAL_SEQUENCE_RNN','BIDIRECTIONAL_SEQUENCE_LSTM','UNIDIRECTIONAL_SEQUENCE_RNN',
  'UNIDIRECTIONAL_SEQUENCE_LSTM','CONV_3D','CONV_3D_TRANSPOSE','TRANSPOSE_CONV',
  'LOCAL_RESPONSE_NORMALIZATION','L2_NORMALIZATION',
  // Activations
  'RELU','RELU_N1_TO_1','RELU6','LEAKY_RELU','PRELU','LOGISTIC','TANH','SOFTMAX',
  'HARD_SWISH','ELU','GELU',
  // Pooling
  'AVERAGE_POOL_2D','MAX_POOL_2D','L2_POOL_2D',
  // Shaping / array
  'RESHAPE','RESIZE_BILINEAR','RESIZE_NEAREST_NEIGHBOR','CONCATENATION','SPLIT','SPLIT_V',
  'SLICE','STRIDED_SLICE','TRANSPOSE','SQUEEZE','EXPAND_DIMS','GATHER','GATHER_ND','SCATTER_ND',
  'PACK','UNPACK','PAD','PADV2','TILE','REVERSE_SEQUENCE','REVERSE_V2','SHAPE','RANK','SIZE',
  'BROADCAST_TO','BROADCAST_ARGS','SPACE_TO_BATCH_ND','BATCH_TO_SPACE_ND','SPACE_TO_DEPTH',
  'DEPTH_TO_SPACE','FLATTEN',
  // Math / reduction / logic
  'ADD','SUB','MUL','DIV','FLOOR_DIV','FLOOR_MOD','MOD','ABS','NEG','EXP','LOG','SQRT','RSQRT',
  'SQUARE','POW','ROUND','CEIL','FLOOR','SIN','COS','LOG_SOFTMAX','SUM','REDUCE_PROD','REDUCE_MAX',
  'REDUCE_MIN','REDUCE_ANY','REDUCE_ALL','MEAN','CUMSUM','ARG_MAX','ARG_MIN','EQUAL','NOT_EQUAL',
  'GREATER','GREATER_EQUAL','LESS','LESS_EQUAL','LOGICAL_AND','LOGICAL_OR','LOGICAL_NOT','SELECT',
  'SELECT_V2','WHERE',
  // Matrix
  'BATCH_MATMUL','MATRIX_DIAG','MATRIX_SET_DIAG',
  // Vision / signal
  'NON_MAX_SUPPRESSION_V4','NON_MAX_SUPPRESSION_V5','RFFT2D','COMPLEX_ABS','IMAG','REAL',
  // Quantization / variables
  'QUANTIZE','DEQUANTIZE','FAKE_QUANT','DENSIFY','CAST','HASHTABLE','HASHTABLE_LOOKUP',
  'HASHTABLE_FIND','HASHTABLE_IMPORT','HASHTABLE_SIZE','VAR_HANDLE','READ_VARIABLE','ASSIGN_VARIABLE',
  // Control flow / eval
  'CALL_ONCE','IF','WHILE','TOPK_V2','UNIQUE','SEGMENT_SUM','DYNAMIC_UPDATE_SLICE',
]);

const TAP_DEBUG = true;

export function tapMessage(msg: string, state: CaptureState) {
  if (TAP_DEBUG && (msg.includes('WebNN') || msg.includes('not delegatable') || msg.includes('Unsupported'))) {
    (globalThis as any).__webnnTapDebug?.(`[TAP] ${msg.slice(0, 300)}`);
  }

  const ortM = msg.match(/number of partitions supported by WebNN:\s*(\d+)[\s\S]*?number of nodes in the graph:\s*(\d+)[\s\S]*?number of nodes supported by WebNN:\s*(\d+)/i);
  if (ortM) {
    state.partitions = +ortM[1];
    state.total_nodes = +ortM[2];
    state.supported_nodes = +ortM[3];
    if (TAP_DEBUG) (globalThis as any).__webnnTapDebug?.(`[TAP-MATCH-ORT-CAP] partitions=${ortM[1]} total=${ortM[2]} supported=${ortM[3]}`);
    return;
  }
  const ortOp = msg.match(/Unsupported (?:operator|op(?:\s+type)?)\s*:?\s*(\w+)/i);
  if (ortOp) {
    state.unsupported_ops.add(ortOp[1]);
    if (TAP_DEBUG) (globalThis as any).__webnnTapDebug?.(`[TAP-MATCH-ORT-OP] op=${ortOp[1]}`);
    return;
  }
  const litertM = msg.match(/number of nodes in the graph[:\s]+(\d+)[\s,]+number of nodes supported by WebNN[:\s]+(\d+)/i);
  if (litertM) {
    state.total_nodes = +litertM[1];
    state.supported_nodes = +litertM[2];
    if (TAP_DEBUG) (globalThis as any).__webnnTapDebug?.(`[TAP-MATCH-LITERT] total=${litertM[1]} supported=${litertM[2]}`);
    return;
  }
  const litertOp = msg.match(/\b([A-Z][A-Z0-9_]+)\s+not delegatable:[\s\S]*?Unsupported op/);
  if (litertOp) { state.unsupported_ops.add(litertOp[1]); return; }
  // LiteRT / TFLite GPU-delegate partition summary:
  //   "46 operations will run on the GPU, and the remaining 1141 operations will run on the CPU."
  const gpuSummary = msg.match(/(\d+)\s+operations will run on the GPU,\s*and the remaining\s+(\d+)\s+operations will run on the CPU/i);
  if (gpuSummary) {
    state.supported_nodes = +gpuSummary[1];
    state.total_nodes = +gpuSummary[1] + +gpuSummary[2];
    if (TAP_DEBUG) (globalThis as any).__webnnTapDebug?.(`[TAP-MATCH-GPU-CAP] gpu=${gpuSummary[1]} cpu=${gpuSummary[2]}`);
    return;
  }
  // LiteRT / TFLite GPU-delegate per-op rejection: "RESHAPE: Tensor dimensions must be less than 5."
  const gpuOp = msg.match(/^([A-Z][A-Z0-9_]+):\s+\S/);
  if (gpuOp && TFLITE_OPS.has(gpuOp[1])) {
    state.unsupported_ops.add(gpuOp[1]);
    if (TAP_DEBUG) (globalThis as any).__webnnTapDebug?.(`[TAP-MATCH-GPU-OP] op=${gpuOp[1]}`);
    return;
  }
}

function stringifyArgs(args: any[]): string {
  return args.map(a => {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ');
}

let activeCapture: CaptureState | null = null;

// Must be called ONCE at worker module load — emscripten binds console refs at WASM init.
export function installConsoleWrappers(): void {
  const orig = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
    trace: console.trace.bind(console),
  };
  (globalThis as any).__webnnTapDebug = (msg: string) => orig.log(msg);
  const wrap = (fn: (...a: any[]) => void) => (...args: any[]) => {
    if (activeCapture) { try { tapMessage(stringifyArgs(args), activeCapture); } catch {} }
    fn(...args);
  };
  console.log = wrap(orig.log);
  console.info = wrap(orig.info);
  console.warn = wrap(orig.warn);
  console.error = wrap(orig.error);
  console.debug = wrap(orig.debug);
  console.trace = wrap(orig.trace);
}

export function startWebNNCapture(): { state: CaptureState; restore: () => void } {
  const state: CaptureState = { partitions: undefined, total_nodes: 0, supported_nodes: 0, unsupported_ops: new Set() };
  activeCapture = state;
  return { state, restore: () => { if (activeCapture === state) activeCapture = null; } };
}

export function finalizeCapture(state: CaptureState, backend: string): Capability | null {
  if (TAP_DEBUG) (globalThis as any).__webnnTapDebug?.(`[TAP-FINALIZE] backend=${backend} total=${state.total_nodes} supported=${state.supported_nodes} ops=${[...state.unsupported_ops].join(',')} partitions=${state.partitions}`);
  // Backend-agnostic: WebNN, LiteRT GPU-delegate, and (later) ORT WebGPU all
  // populate this. Require some node-count info so stray op-only captures → null.
  if (state.total_nodes === 0 && state.supported_nodes === 0 && state.partitions === undefined) return null;
  const out: Capability = {
    total_nodes: state.total_nodes,
    supported_nodes: state.supported_nodes,
    unsupported_ops: [...state.unsupported_ops].sort(),
  };
  if (state.partitions !== undefined) out.partitions = state.partitions;
  return out;
}
