export const MODEL_EXTENSIONS = ['.onnx', '.tflite', '.litertlm'];

export const DTYPE_ORDER = ['fp32', 'fp16', 'bf16', 'fp8', 'int8', 'uint8', 'int4', 'uint4', 'q4', 'q4f16', 'bnb4', 'quantized'];

export function sortByDtype<T extends { dataType: string }>(variants: T[]): T[] {
  return [...variants].sort((a, b) => {
    const ai = DTYPE_ORDER.indexOf(a.dataType);
    const bi = DTYPE_ORDER.indexOf(b.dataType);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.dataType.localeCompare(b.dataType);
  });
}
// Matches .onnx.data (old style) and .onnx_data, .onnx_data_1, .onnx_data_N (new style)
const SKIP_PATTERNS = ['.onnx.data', '.onnx_data'];

const DATA_TYPE_PATTERNS: [RegExp, string][] = [
  [/[_-]q4f16/, 'q4f16'],
  [/[_-]bnb4/, 'bnb4'],
  [/[_-]fp8/, 'fp8'],
  [/[_-]bf16/, 'bf16'],
  [/[_-]fp16/, 'fp16'],
  [/[_-]fp32/, 'fp32'],
  [/[_-]uint8/, 'uint8'],
  [/[_-]uint4/, 'uint4'],
  [/[_-]int4/, 'int4'],
  [/[_-]int8/, 'int8'],
  [/[_-]q8/, 'int8'],        // shorthand alias for int8
  [/[_-]quantized/, 'int8'], // legacy Xenova convention
  [/[_-]q4(?!f)/, 'q4'],
];

export function inferRuntime(filename: string): 'onnx' | 'litert' | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.onnx') && !SKIP_PATTERNS.some((s) => lower.includes(s))) return 'onnx';
  if (lower.endsWith('.tflite') || lower.endsWith('.litertlm')) return 'litert';
  return null;
}

export function inferDataType(filename: string): string {
  const basename = filename.split('/').pop() ?? filename;
  const lower = basename.toLowerCase();

  for (const [pattern, dataType] of DATA_TYPE_PATTERNS) {
    if (pattern.test(lower)) return dataType;
  }

  return 'fp32';
}

export function inferFormat(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.litertlm')) return 'litertlm';
  if (lower.endsWith('.tflite')) return 'tflite';
  if (lower.endsWith('.onnx')) return 'onnx';
  return 'unknown';
}

export function stripExt(path: string): string {
  // Remove file extension from the full path (preserving directory prefix)
  const dot = path.lastIndexOf('.');
  const noExt = dot > 0 ? path.slice(0, dot) : path;
  // Strip dtype suffix from the last path segment only
  const slash = noExt.lastIndexOf('/');
  const dir = slash >= 0 ? noExt.slice(0, slash + 1) : '';
  const base = slash >= 0 ? noExt.slice(slash + 1) : noExt;
  return dir + base.replace(/[_-](q4f16|bnb4|fp8|bf16|fp16|fp32|uint8|uint4|int4|int8|q8|quantized|q4)$/i, '');
}

export interface ParsedFile {
  file_path: string;
  data_type: string;
  size_bytes: number;
  runtime: 'onnx' | 'litert';
}

export function parseModelFile(
  filename: string,
  sizeBytes: number,
  _hfModelId: string
): ParsedFile | null {
  const lower = filename.toLowerCase();

  for (const pattern of SKIP_PATTERNS) {
    if (lower.includes(pattern)) return null;
  }

  const runtime = inferRuntime(filename);
  if (!runtime) return null;

  return {
    file_path: filename,
    data_type: inferDataType(filename),
    size_bytes: sizeBytes,
    runtime,
  };
}
