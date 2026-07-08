// Helpers for /llm/custom — accept a list of locally-uploaded files, validate
// the bundle, derive available dtypes, and write everything into OPFS using
// the same key scheme the LLM worker expects (`llm--<hf>--<path>`). The page
// can then call runLlmInWorker() with a synthetic hfModelId of the form
// `__local__/<id>`; the worker recognises that prefix and skips its
// fetchHfTree/downloadBundle steps.

import { saveToOPFS } from './worker/shared/download';

// External-data file naming is authored in the model, not fixed — cover both the
// HuggingFace `.onnx_data[_N]` convention and the standard ONNX `.onnx.data[.N]`
// one. The graph's declared `location` (read by the worker) is the source of
// truth; here we only need to recognise the physical files.
const EXTERNAL_DATA_RE = /\.onnx[._]data(?:[._]\d+)?$/i;
// A canonical path is external-data for `graph` when it sits beside it: the same
// name plus a separator. Mirrors isDataSiblingOf in llm.worker.ts.
function isDataSiblingOf(path: string, graph: string): boolean {
  return path !== graph && path.startsWith(graph) && (path[graph.length] === '.' || path[graph.length] === '_');
}
function naturalCompare(a: string, b: string): number { return a.localeCompare(b, undefined, { numeric: true }); }

const REQUIRED_FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json'];

const OPTIONAL_FILES = [
  'generation_config.json',
  'special_tokens_map.json',
  'preprocessor_config.json',
  'processor_config.json',
  'chat_template.json',
];

/** OPFS key for an LLM file under a synthetic local model id. Matches llm.worker.ts. */
export function llmLocalOpfsKey(hfModelId: string, filePath: string): string {
  return `llm--${hfModelId.replace(/\//g, '--')}--${filePath.replace(/\//g, '--')}`;
}

/**
 * Convert a raw uploaded file to its canonical bundle path.
 * - `<anything>/onnx/<file>` → `onnx/<file>`
 * - `<anything>/<requiredOrOptional>` → `<requiredOrOptional>`
 * - everything else → null (filtered out)
 *
 * The user can drop a folder where the model lives at the top level OR inside
 * a wrapping directory like `Llama-3.2-1B-Instruct/onnx/...` — we just look
 * for the canonical names, anywhere in the relative path.
 */
function canonicalPath(file: File): string | null {
  // webkitRelativePath is set when the user drops a folder; falls back to name.
  const raw = (file as any).webkitRelativePath || file.name;
  const segments = raw.split('/').filter(Boolean);
  const name = segments[segments.length - 1];

  // Anything inside an `onnx/` directory keeps that prefix.
  const onnxIdx = segments.indexOf('onnx');
  if (onnxIdx >= 0 && onnxIdx === segments.length - 2) {
    return `onnx/${name}`;
  }

  if (REQUIRED_FILES.includes(name) || OPTIONAL_FILES.includes(name)) {
    return name;
  }

  // Loose ONNX graph or external-data file at top level — accept as `onnx/<name>`.
  if (name.endsWith('.onnx') || EXTERNAL_DATA_RE.test(name)) {
    return `onnx/${name}`;
  }

  return null;
}

/**
 * Map of canonical path → File. Files outside the recognised list are dropped.
 */
export function classifyFiles(picked: File[]): Map<string, File> {
  const map = new Map<string, File>();
  for (const f of picked) {
    const canonical = canonicalPath(f);
    if (!canonical) continue;
    // Last write wins — if the user drops the same canonical path twice,
    // we'll only keep one. Cheap to debug; rare in practice.
    map.set(canonical, f);
  }
  return map;
}

export interface DtypeStatus {
  dtype: string;
  available: boolean;
  /** Why the dtype is unavailable, or '' when available. */
  reason: string;
  /** Files (canonical paths) that need to be in OPFS to run this dtype. */
  requiredFiles: string[];
}

/**
 * Walk the canonical-path map, find every ONNX-with-dtype-suffix candidate,
 * and decide whether the dtype is runnable. The set of dtypes we surface is
 * the union of dtypes hinted by any present ONNX file. dtypes the user might
 * want but never appear in the bundle aren't shown — there's no way to
 * "expect" a dtype here without a list.
 */
export function deriveDtypeStatus(files: Map<string, File>): DtypeStatus[] {
  const dtypeSet = new Set<string>();
  // Match `onnx/<base>_<dtype>.onnx` (with dtype) and `onnx/<base>.onnx` (fp32).
  for (const path of files.keys()) {
    if (!path.startsWith('onnx/') || !path.endsWith('.onnx')) continue;
    const base = path.slice(5, -5); // strip `onnx/` ... `.onnx`
    // <base>_<dtype>: dtype is everything after the last underscore
    const m = base.match(/_([a-z0-9]+)$/i);
    if (m) dtypeSet.add(m[1]);
    else    dtypeSet.add('fp32');
  }

  const dtypes: DtypeStatus[] = [];
  for (const dtype of dtypeSet) {
    const suffix = dtype === 'fp32' ? '' : `_${dtype}`;
    const primaryCandidates = [
      `onnx/decoder_model_merged${suffix}.onnx`,
      `onnx/model${suffix}.onnx`,
      `onnx/decoder_model${suffix}.onnx`,
    ];
    const primary = primaryCandidates.find(c => files.has(c));

    if (!primary) {
      dtypes.push({
        dtype,
        available: false,
        reason: `Missing primary ONNX (need one of: ${primaryCandidates.map(p => p.split('/').pop()).join(', ')})`,
        requiredFiles: [],
      });
      continue;
    }

    // All ONNX files matching the dtype suffix (multi-graph models like VLMs need
    // embed_tokens_<dtype>.onnx, vision_encoder_<dtype>.onnx, etc.)
    const onnxFiles: string[] = [];
    for (const path of files.keys()) {
      if (path.startsWith('onnx/') && path.endsWith(`${suffix}.onnx`)) {
        onnxFiles.push(path);
      }
    }

    // A too-small graph must ship external data beside it (any naming). We match
    // structurally instead of assuming `_data`, so `.onnx.data` counts too.
    const missingSidecars: string[] = [];
    for (const onnxPath of onnxFiles) {
      const onnxFile = files.get(onnxPath);
      const hasData = [...files.keys()].some(p => isDataSiblingOf(p, onnxPath));
      if (!hasData && onnxFile && onnxFile.size < 1_000_000 && onnxPath === primary) {
        missingSidecars.push(onnxPath.split('/').pop()!);
      }
    }

    if (missingSidecars.length > 0) {
      dtypes.push({
        dtype,
        available: false,
        reason: `Missing external data for: ${missingSidecars.join(', ')}`,
        requiredFiles: [],
      });
      continue;
    }

    // Required JSON files apply to every dtype.
    const missingRequired = REQUIRED_FILES.filter(f => !files.has(f));
    if (missingRequired.length > 0) {
      dtypes.push({
        dtype,
        available: false,
        reason: `Missing required file${missingRequired.length > 1 ? 's' : ''}: ${missingRequired.join(', ')}`,
        requiredFiles: [],
      });
      continue;
    }

    // Build the runtime file set: required + present optionals + all dtype-specific
    // ONNX files + their sidecars.
    const runtimeFiles: string[] = [
      ...REQUIRED_FILES,
      ...OPTIONAL_FILES.filter(f => files.has(f)),
    ];
    for (const onnxPath of onnxFiles) {
      runtimeFiles.push(onnxPath);
      const dataFiles = [...files.keys()]
        .filter(p => isDataSiblingOf(p, onnxPath))
        .sort(naturalCompare);
      runtimeFiles.push(...dataFiles);
    }

    dtypes.push({
      dtype,
      available: true,
      reason: '',
      requiredFiles: runtimeFiles,
    });
  }

  // Sort: available first, then alphabetical
  dtypes.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    return a.dtype.localeCompare(b.dtype);
  });

  return dtypes;
}

export interface BundleSummary {
  hasRequired: boolean;
  missingRequired: string[];
  presentOptional: string[];
  missingOptional: string[];
  dtypes: DtypeStatus[];
}

export function summarizeBundle(files: Map<string, File>): BundleSummary {
  const missingRequired = REQUIRED_FILES.filter(f => !files.has(f));
  const presentOptional = OPTIONAL_FILES.filter(f => files.has(f));
  const missingOptional = OPTIONAL_FILES.filter(f => !files.has(f));
  return {
    hasRequired: missingRequired.length === 0,
    missingRequired,
    presentOptional,
    missingOptional,
    dtypes: deriveDtypeStatus(files),
  };
}

/** Synthesize a stable id for a bundle. Hash the sorted file list + dtype. */
export async function synthesizeLocalId(files: Map<string, File>, dtype: string): Promise<string> {
  const parts: string[] = [dtype];
  for (const path of [...files.keys()].sort()) {
    const f = files.get(path)!;
    parts.push(`${path}:${f.size}:${f.lastModified}`);
  }
  const enc = new TextEncoder().encode(parts.join('|'));
  const hash = await crypto.subtle.digest('SHA-256', enc);
  const hex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `__local__/${hex.slice(0, 12)}`;
}

/**
 * Write every file required for `dtype` into OPFS under the key scheme the
 * LLM worker uses. Reports byte-progress so the UI can render a writing bar.
 */
export async function persistBundleToOpfs(
  hfModelId: string,
  files: Map<string, File>,
  dtypeStatus: DtypeStatus,
  onProgress?: (loaded: number, total: number, currentFile: string) => void,
): Promise<void> {
  if (!dtypeStatus.available) {
    throw new Error(`Cannot persist dtype "${dtypeStatus.dtype}": ${dtypeStatus.reason}`);
  }
  const total = dtypeStatus.requiredFiles.reduce((s, p) => s + (files.get(p)?.size ?? 0), 0);
  let loaded = 0;
  for (const path of dtypeStatus.requiredFiles) {
    const file = files.get(path);
    if (!file) throw new Error(`File "${path}" missing from bundle`);
    onProgress?.(loaded, total, path);
    const buf = await file.arrayBuffer();
    await saveToOPFS(llmLocalOpfsKey(hfModelId, path), buf);
    loaded += file.size;
    onProgress?.(loaded, total, path);
  }
}
