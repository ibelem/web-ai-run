import { createClient } from '@supabase/supabase-js';

const HF_API_BASE = 'https://huggingface.co/api';

const HF_ORGS = [
  { name: 'Xenova', runtime: 'onnx' },
  { name: 'onnx-community', runtime: 'onnx' },
  { name: 'webnn', runtime: 'onnx' },
  { name: 'webgpu', runtime: 'onnx' },
  { name: 'litert-community', runtime: 'litert' },
] as const;

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

function inferRuntime(filename: string): 'onnx' | 'litert' | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.onnx') && !SKIP_PATTERNS.some((s) => lower.includes(s))) return 'onnx';
  if (lower.endsWith('.tflite') || lower.endsWith('.litertlm')) return 'litert';
  return null;
}

function inferDataType(filename: string): string {
  const basename = filename.split('/').pop() ?? filename;
  const lower = basename.toLowerCase();
  for (const [pattern, dataType] of DATA_TYPE_PATTERNS) {
    if (pattern.test(lower)) return dataType;
  }
  return 'fp32';
}

interface ModelRow {
  hf_model_id: string;
  file_path: string;
  data_type: string;
  size_bytes: number;
  runtime: string;
  source_org: string;
  category: string;
  last_synced: string;
}

async function main() {
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars: PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const rows: ModelRow[] = [];
  const errors: string[] = [];
  const now = new Date().toISOString();

  for (const org of HF_ORGS) {
    console.log(`Fetching repos for ${org.name}...`);
    try {
      const reposRes = await fetch(
        `${HF_API_BASE}/models?author=${encodeURIComponent(org.name)}&limit=1000&full=true`
      );
      if (!reposRes.ok) {
        errors.push(`Failed to list ${org.name}: ${reposRes.status}`);
        continue;
      }

      const repos: any[] = await reposRes.json();
      console.log(`  Found ${repos.length} repos`);

      for (const repo of repos) {
        if (repo.private || repo.disabled) continue;

        const files: any[] = repo.siblings ?? [];
        const category = repo.pipeline_tag ?? 'uncategorized';

        for (const file of files) {
          const lower = file.rfilename.toLowerCase();
          if (SKIP_PATTERNS.some((s) => lower.includes(s))) continue;

          const runtime = inferRuntime(file.rfilename);
          if (!runtime) continue;

          rows.push({
            hf_model_id: repo.id,
            file_path: file.rfilename,
            data_type: inferDataType(file.rfilename),
            size_bytes: file.lfs?.size ?? file.size ?? 0,
            runtime,
            source_org: org.name,
            category,
            last_synced: now,
          });
        }
      }
    } catch (e) {
      errors.push(`Failed to process org ${org.name}: ${e}`);
    }
  }

  console.log(`\nTotal models found: ${rows.length}`);

  const BATCH_SIZE = 100;
  let upserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('models')
      .upsert(batch, { onConflict: 'hf_model_id,file_path' });

    if (error) {
      errors.push(`Upsert batch ${i} failed: ${error.message}`);
    } else {
      upserted += batch.length;
    }
  }

  console.log(`Upserted: ${upserted}`);
  if (errors.length > 0) {
    console.error(`\nErrors (${errors.length}):`);
    errors.slice(0, 20).forEach((e) => console.error(`  - ${e}`));
  }
}

main();
