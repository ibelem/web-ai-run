const MODEL_EXTENSIONS = ['.onnx', '.tflite', '.litertlm'];
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
