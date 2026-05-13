const MODEL_EXTENSIONS = ['.onnx', '.tflite', '.litertlm'];
const SKIP_SUFFIXES = ['.onnx.data'];

const DATA_TYPE_PATTERNS: [RegExp, string][] = [
  [/[_-]q4f16/, 'q4f16'],
  [/[_-]bnb4/, 'bnb4'],
  [/[_-]uint8/, 'uint8'],
  [/[_-]int4/, 'int4'],
  [/[_-]int8/, 'int8'],
  [/[_-]quantized/, 'int8'],
  [/[_-]fp16/, 'fp16'],
  [/[_-]fp32/, 'fp32'],
  [/[_-]q4(?!f)/, 'q4'],
];

export function inferRuntime(filename: string): 'onnx' | 'litert' | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.onnx') && !lower.endsWith('.onnx.data')) return 'onnx';
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

  for (const suffix of SKIP_SUFFIXES) {
    if (lower.endsWith(suffix)) return null;
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
