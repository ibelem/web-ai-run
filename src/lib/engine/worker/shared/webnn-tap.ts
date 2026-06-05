export interface CaptureState {
  partitions: number | undefined;
  total_nodes: number;
  supported_nodes: number;
  unsupported_ops: Set<string>;
}

export interface WebNNCapability {
  partitions?: number;
  total_nodes: number;
  supported_nodes: number;
  unsupported_ops: string[];
}

const TAP_DEBUG = true;

function tapMessage(msg: string, state: CaptureState) {
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

export function finalizeCapture(state: CaptureState, backend: string): WebNNCapability | null {
  if (TAP_DEBUG) (globalThis as any).__webnnTapDebug?.(`[TAP-FINALIZE] backend=${backend} total=${state.total_nodes} supported=${state.supported_nodes} ops=${[...state.unsupported_ops].join(',')} partitions=${state.partitions}`);
  if (!backend.startsWith('webnn_')) return null;
  if (state.total_nodes === 0 && state.supported_nodes === 0 && state.unsupported_ops.size === 0 && state.partitions === undefined) return null;
  const out: WebNNCapability = {
    total_nodes: state.total_nodes,
    supported_nodes: state.supported_nodes,
    unsupported_ops: [...state.unsupported_ops].sort(),
  };
  if (state.partitions !== undefined) out.partitions = state.partitions;
  return out;
}
