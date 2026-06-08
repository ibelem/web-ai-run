import type { LLMWorkerRequest, LLMWorkerMessage, LLMBenchmarkResult, SingleRunResult, LLMBackend } from '../types';
import { getHfBase, getFromOPFS, saveToOPFS } from './shared/download';
import { installConsoleWrappers, startWebNNCapture, finalizeCapture } from './shared/webnn-tap';
import { average, stddev, percentile } from './shared/metrics';

// Install console wrappers at module load — same reason as inference.worker.ts.
installConsoleWrappers();

function post(msg: LLMWorkerMessage) {
  self.postMessage(msg);
}

function ts(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

let logBuffer: string[] = [];
function log(id: string, msg: string) { logBuffer.push(`${ts()} ${msg}`); }
function flushLogs(id: string) {
  if (logBuffer.length === 0) return;
  post({ type: 'logs', id, logs: logBuffer });
  logBuffer = [];
}

function getTransformersCdnUrl(version: string): string {
  return `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${version}/dist/transformers.js`;
}

function backendToDevice(b: LLMBackend): string {
  switch (b) {
    case 'wasm':       return 'wasm';
    case 'webgpu':     return 'webgpu';
    case 'webnn_cpu':  return 'webnn-cpu';
    case 'webnn_gpu':  return 'webnn-gpu';
    case 'webnn_npu':  return 'webnn-npu';
  }
}

// ── HF tree helpers ──────────────────────────────────────────────────────────

interface HFTreeEntry { path: string; size: number; type: string }
const treeCache = new Map<string, HFTreeEntry[]>();

async function fetchHfTree(hfModelId: string): Promise<HFTreeEntry[]> {
  if (treeCache.has(hfModelId)) return treeCache.get(hfModelId)!;
  const base = await getHfBase();
  const url = `${base}/api/models/${hfModelId}/tree/main?recursive=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HF tree fetch failed for ${hfModelId}: ${res.status}`);
  const data = await res.json();
  const entries: HFTreeEntry[] = (Array.isArray(data) ? data : data.siblings ?? []).map((e: any) => ({
    path: e.path ?? e.rfilename ?? '',
    size: e.size ?? 0,
    type: e.type ?? 'file',
  })).filter((e: HFTreeEntry) => e.type === 'file');
  treeCache.set(hfModelId, entries);
  return entries;
}

async function resolveLlmFileSet(hfModelId: string, dtype: string): Promise<string[]> {
  const tree = await fetchHfTree(hfModelId);
  const present = new Set(tree.map(f => f.path));

  const required = ['config.json', 'tokenizer.json', 'tokenizer_config.json'];
  const optional = ['generation_config.json', 'special_tokens_map.json'];
  for (const f of required) {
    if (!present.has(f)) throw new Error(`Required file missing in ${hfModelId}: ${f}`);
  }

  const suffix = dtype === 'fp32' ? '' : `_${dtype}`;
  const candidates = [
    `onnx/decoder_model_merged${suffix}.onnx`,
    `onnx/model${suffix}.onnx`,
    `onnx/decoder_model${suffix}.onnx`,
  ];
  const onnxPath = candidates.find(c => present.has(c));
  if (!onnxPath) throw new Error(`No ONNX file for dtype "${dtype}" in ${hfModelId}. Tried: ${candidates.join(', ')}`);

  const result = [...required, ...optional.filter(f => present.has(f)), onnxPath];

  // Check for external data sidecar — small graph file means weights are external
  const onnxEntry = tree.find(f => f.path === onnxPath)!;
  if (onnxEntry.size < 1_000_000) {
    const sidecar = `${onnxPath}_data`;
    if (!present.has(sidecar)) {
      throw new Error(`External data missing: ${sidecar} (graph is ${onnxEntry.size} bytes — too small to be self-contained)`);
    }
    result.push(sidecar);
    // Numbered sidecars: _data_1, _data_2, ...
    for (let i = 1; i <= 99; i++) {
      const ns = `${onnxPath}_data_${i}`;
      if (present.has(ns)) result.push(ns); else break;
    }
  }

  return result;
}

// ── Bundle download to OPFS ──────────────────────────────────────────────────

function opfsKey(hfModelId: string, filePath: string): string {
  return `llm--${hfModelId.replace(/\//g, '--')}--${filePath.replace(/\//g, '--')}`;
}

async function downloadBundle(id: string, hfModelId: string, files: string[]): Promise<Map<string, number>> {
  const tree = await fetchHfTree(hfModelId);
  const sizes = new Map<string, number>();
  let totalBytes = 0;
  for (const f of files) {
    const sz = tree.find(t => t.path === f)?.size ?? 0;
    sizes.set(f, sz);
    totalBytes += sz;
  }

  post({ type: 'download-start', id, totalBytes, fileCount: files.length, files });

  let cumulativeLoaded = 0;
  let cacheHits = 0;
  const tStart = performance.now();
  const base = await getHfBase();

  for (const file of files) {
    const key = opfsKey(hfModelId, file);
    const fileSize = sizes.get(file) ?? 0;
    const cached = await getFromOPFS(key, fileSize || undefined);

    if (cached) {
      cacheHits++;
      cumulativeLoaded += fileSize;
      post({ type: 'download-progress', id, loaded: cumulativeLoaded, total: totalBytes, currentFile: `${file} (cached)` });
      continue;
    }

    const url = `${base}/${hfModelId}/resolve/main/${file}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${file} (${res.status})`);

    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let fileLoaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      fileLoaded += value.byteLength;
      cumulativeLoaded += value.byteLength;
      post({ type: 'download-progress', id, loaded: cumulativeLoaded, total: totalBytes, currentFile: file });
    }

    if (fileSize > 0 && fileLoaded !== fileSize) {
      throw new Error(`Truncated download: ${file} (got ${fileLoaded}, expected ${fileSize})`);
    }

    const buf = new Uint8Array(fileLoaded);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
    await saveToOPFS(key, buf.buffer);
    log(id, `Cached ${file} (${(fileLoaded / 1_048_576).toFixed(1)} MB)`);
  }

  const durationMs = performance.now() - tStart;
  post({ type: 'download-done', id, cacheHit: cacheHits === files.length, durationMs });
  return sizes;
}

// ── Custom fetch override — routes Transformers.js / ORT through OPFS ───────

function setupOpfsFetch(hfModelId: string, files: string[], fileSizes: Map<string, number>): () => void {
  const entryByUrl = new Map<string, { key: string; size: number }>();
  for (const f of files) {
    const key = opfsKey(hfModelId, f);
    const size = fileSizes.get(f) ?? 0;
    // Match both huggingface.co and hf-mirror.com URLs
    for (const s of [`/${hfModelId}/resolve/main/${f}`, `/${hfModelId}/blob/main/${f}`]) {
      entryByUrl.set(s, { key, size });
    }
  }

  const origFetch = globalThis.fetch;

  (globalThis as any).fetch = async (input: any, init?: any) => {
    const url: string = typeof input === 'string' ? input : (input as Request).url;
    for (const [suffix, { key, size }] of entryByUrl) {
      if (url.includes(suffix)) {
        const buf = await getFromOPFS(key, size || undefined);
        if (buf) {
          return new Response(buf, {
            status: 200,
            headers: { 'content-length': String(buf.byteLength), 'content-type': 'application/octet-stream' },
          });
        }
      }
    }
    return origFetch(input, init);
  };

  return () => { (globalThis as any).fetch = origFetch; };
}

// ── Single generation run ────────────────────────────────────────────────────

async function runSingleGeneration(
  transformers: any,
  pipe: any,
  req: LLMWorkerRequest,
  runIndex: number,
): Promise<SingleRunResult> {
  let firstTokenTime: number | null = null;
  let chunkCount = 0;
  let tStart = 0;
  const isTimed = runIndex >= 0;
  const id = req.id;
  const tokenizer = pipe.tokenizer;

  // Build a streamer that does the bare minimum on the hot path:
  // - stamp firstTokenTime on the very first chunk (TTFT)
  // - count chunks (used for live progress; final token count is taken from output_ids)
  // - for timed runs only: postMessage each chunk so the UI can render the stream
  // No per-token TPS math, no decode() — TextStreamer already gives us a string.
  const streamer = new transformers.TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text: string) => {
      const now = performance.now();
      if (firstTokenTime === null) {
        firstTokenTime = now;
        if (isTimed) post({ type: 'ttft', id, runIndex, ttftMs: now - tStart });
      }
      chunkCount++;
      if (isTimed) {
        post({ type: 'token', id, runIndex, token: text, tokenIndex: chunkCount - 1, elapsedMs: now - tStart, tps: 0 });
      }
    },
  });

  tStart = performance.now();
  post({ type: 'generate-start', id, runIndex, promptTokens: 0 });

  const output = await pipe(req.prompt, {
    max_new_tokens: req.maxNewTokens,
    do_sample: false,
    return_full_text: false,
    streamer,
  });

  const tEnd = performance.now();
  const ttftMs = (firstTokenTime ?? tEnd) - tStart;
  const decodeMs = tEnd - (firstTokenTime ?? tStart);

  // Authoritative token count: prefer the model's generated_token_ids length,
  // fall back to chunk count (TextStreamer chunks ≈ tokens for most tokenizers).
  const genIds = output?.[0]?.generated_token_ids ?? output?.[0]?.output_token_ids;
  let outputTokens = chunkCount;
  if (genIds) {
    outputTokens = Array.isArray(genIds) ? genIds.length : (genIds.length ?? chunkCount);
  } else if (typeof output?.[0]?.generated_text === 'string' && tokenizer) {
    try { outputTokens = tokenizer.encode(output[0].generated_text).length; } catch {}
  }

  const result: SingleRunResult = {
    ttftMs,
    decodeMs,
    tps: outputTokens > 1 && decodeMs > 0 ? ((outputTokens - 1) / decodeMs) * 1000 : 0,
    e2eMs: tEnd - tStart,
    outputTokens,
    promptTokens: output?.[0]?.prompt_tokens ?? output?.[0]?.input_ids?.length ?? 0,
  };
  if (isTimed) post({ type: 'run-done', id, runIndex, runResult: result });
  return result;
}

function aggregateRuns(runs: SingleRunResult[], compilationMs: number, warmupTtftMs: number): LLMBenchmarkResult {
  const ttftArr = runs.map(r => r.ttftMs);
  const decodeArr = runs.map(r => r.decodeMs);
  const tpsArr = runs.map(r => r.tps);
  const e2eArr = runs.map(r => r.e2eMs);
  const avgTokens = Math.round(average(runs.map(r => r.outputTokens)));
  const avgDecodeMs = average(decodeArr);
  const tpotMs = avgTokens > 1 && avgDecodeMs > 0 ? avgDecodeMs / (avgTokens - 1) : 0;
  const avgE2e = average(e2eArr);
  return {
    ttftMsRuns: ttftArr,
    decodeMsRuns: decodeArr,
    tpsRuns: tpsArr,
    e2eMsRuns: e2eArr,
    ttftMs: average(ttftArr),
    ttftStddevMs: stddev(ttftArr),
    ttftP90Ms: percentile([...ttftArr].sort((a, b) => a - b), 0.9),
    tpotMs,
    tps: average(tpsArr),
    tpsStddev: stddev(tpsArr),
    decodeMs: avgDecodeMs,
    e2eMs: avgE2e,
    e2eStddevMs: stddev(e2eArr),
    e2eTps: avgTokens > 0 && avgE2e > 0 ? (avgTokens / avgE2e) * 1000 : 0,
    promptTokens: runs[0]?.promptTokens ?? 0,
    outputTokens: avgTokens,
    compilationMs,
    warmupTtftMs,
  };
}

// ── Transformers.js branch ───────────────────────────────────────────────────

async function runTransformers(req: LLMWorkerRequest): Promise<void> {
  const { id } = req;

  // Phase 1: Download
  log(id, `Resolving file set for ${req.hfModelId} dtype=${req.dtype}`);
  let fileSet: string[];
  try {
    fileSet = await resolveLlmFileSet(req.hfModelId, req.dtype);
  } catch (e: any) {
    post({ type: 'error', id, message: e?.message ?? String(e), phase: 'download' });
    return;
  }
  log(id, `File set: ${fileSet.join(', ')}`);

  let fileSizes: Map<string, number>;
  try {
    fileSizes = await downloadBundle(id, req.hfModelId, fileSet);
  } catch (e: any) {
    post({ type: 'error', id, message: e?.message ?? String(e), phase: 'download' });
    return;
  }
  flushLogs(id);

  // Phase 2: Compile
  post({ type: 'compile-start', id });
  const restoreFetch = setupOpfsFetch(req.hfModelId, fileSet, fileSizes);

  // If the fileSet includes external data sidecars, tell Transformers.js explicitly.
  // The model's config.json uses un-suffixed keys (e.g. "model.onnx") so for dtype
  // variants like "model_q4f16.onnx" the auto-detection in Transformers.js returns 0
  // chunks, leaving ORT to look for the sidecar on disk — which fails in a browser.
  const onnxFile = fileSet.find(f => f.endsWith('.onnx'));
  const sidecars = fileSet.filter(f => /\.onnx_data(_\d+)?$/.test(f));
  const useExternalDataFormat = onnxFile && sidecars.length > 0
    ? { [onnxFile.split('/').pop()!]: sidecars.length }
    : undefined;

  const tjsUrl = getTransformersCdnUrl(req.runtimeVersion);
  log(id, `Loading @huggingface/transformers@${req.runtimeVersion}`);
  const transformers = await import(/* @vite-ignore */ tjsUrl);

  transformers.env.allowLocalModels = false;
  transformers.env.allowRemoteModels = true;
  transformers.env.useBrowserCache = false;

  const device = backendToDevice(req.backend);
  const captureWebnn = req.backend.startsWith('webnn_');
  const cap = captureWebnn ? startWebNNCapture() : null;

  const compileStart = performance.now();
  let pipe: any;
  try {
    pipe = await transformers.pipeline('text-generation', req.hfModelId, {
      dtype: req.dtype,
      device,
      ...(useExternalDataFormat ? { use_external_data_format: useExternalDataFormat } : {}),
      progress_callback: (p: any) => {
        if (p?.status === 'initiate' && p?.file) log(id, `Loading: ${p.file}`);
      },
    });
  } catch (e: any) {
    cap?.restore();
    restoreFetch();
    post({ type: 'error', id, message: e?.message ?? String(e), phase: 'compile' });
    return;
  }
  const compilationMs = performance.now() - compileStart;
  cap?.restore();
  restoreFetch();

  post({ type: 'compile-done', id, compileMs: compilationMs });
  log(id, `Compilation: ${compilationMs.toFixed(0)} ms`);

  // Synthesize a prompt of exact token count for reproducible TTFT (like onnxruntime-genai -l)
  let effectivePrompt = req.prompt;
  if (req.promptTokens && req.promptTokens > 0 && pipe.tokenizer) {
    try {
      const stub = 'The quick brown fox jumps over the lazy dog. ';
      let candidate = '';
      while (true) {
        candidate += stub;
        const ids = pipe.tokenizer.encode(candidate);
        if (ids.length >= req.promptTokens) break;
      }
      const ids = pipe.tokenizer.encode(candidate).slice(0, req.promptTokens);
      effectivePrompt = pipe.tokenizer.decode(ids, { skip_special_tokens: true });
      log(id, `Synthesized prompt: ${req.promptTokens} tokens`);
    } catch (e: any) {
      log(id, `Prompt synthesis failed (${e?.message ?? e}) — falling back to user prompt`);
    }
  }
  const runReq: LLMWorkerRequest = { ...req, prompt: effectivePrompt };
  flushLogs(id);

  // Phase 3: Generate
  const total = req.warmupRuns + req.runs;
  const timedRuns: SingleRunResult[] = [];
  let warmupTtftMs = 0;

  try {
    for (let i = 0; i < total; i++) {
      const isWarmup = i < req.warmupRuns;
      const runIndex = isWarmup ? -1 : i - req.warmupRuns;
      const r = await runSingleGeneration(transformers, pipe, runReq, runIndex);
      if (isWarmup) {
        warmupTtftMs = r.ttftMs;
        log(id, `Warmup TTFT: ${r.ttftMs.toFixed(0)} ms, TPS: ${r.tps.toFixed(1)}`);
      } else {
        timedRuns.push(r);
        log(id, `Run ${runIndex + 1}/${req.runs}: TTFT=${r.ttftMs.toFixed(0)}ms TPS=${r.tps.toFixed(1)} tokens=${r.outputTokens}`);
      }
    }
  } catch (e: any) {
    try { await pipe.dispose?.(); } catch {}
    flushLogs(id);
    post({ type: 'error', id, message: e?.message ?? String(e), phase: 'generate' });
    return;
  }

  try { await pipe.dispose?.(); } catch {}
  flushLogs(id);

  const result = aggregateRuns(timedRuns, compilationMs, warmupTtftMs);
  post({ type: 'all-done', id, result });
}

// ── Message handler ──────────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent<LLMWorkerRequest>) => {
  const req = event.data;
  if (!req || req.type !== 'run') return;

  if (req.runtime === 'transformers') {
    await runTransformers(req);
  } else {
    post({ type: 'error', id: req.id, message: `Runtime "${req.runtime}" not yet implemented`, phase: 'compile' });
  }
};
