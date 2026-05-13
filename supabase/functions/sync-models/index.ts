import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const HF_API_BASE = 'https://huggingface.co/api';

const HF_ORGS = [
  { name: 'Xenova', runtime: 'onnx' },
  { name: 'onnx-community', runtime: 'onnx' },
  { name: 'webnn', runtime: 'onnx' },
  { name: 'webgpu', runtime: 'onnx' },
  { name: 'litert-community', runtime: 'litert' },
] as const;

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

function inferRuntime(filename: string): 'onnx' | 'litert' | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.onnx') && !lower.endsWith('.onnx.data')) return 'onnx';
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

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const rows: ModelRow[] = [];
  const errors: string[] = [];
  const now = new Date().toISOString();

  for (const org of HF_ORGS) {
    try {
      const reposRes = await fetch(
        `${HF_API_BASE}/models?author=${encodeURIComponent(org.name)}&limit=1000`
      );
      if (!reposRes.ok) {
        errors.push(`Failed to list ${org.name}: ${reposRes.status}`);
        continue;
      }

      const repos = await reposRes.json();

      for (const repo of repos) {
        if (repo.private || repo.disabled) continue;

        try {
          const filesRes = await fetch(
            `${HF_API_BASE}/models/${repo.id}/tree/main`
          );
          if (!filesRes.ok) continue;

          const files = await filesRes.json();
          const category = repo.pipeline_tag ?? 'uncategorized';

          for (const file of files) {
            const lower = file.rfilename.toLowerCase();
            if (SKIP_SUFFIXES.some((s) => lower.endsWith(s))) continue;

            const runtime = inferRuntime(file.rfilename);
            if (!runtime) continue;

            rows.push({
              hf_model_id: repo.id,
              file_path: file.rfilename,
              data_type: inferDataType(file.rfilename),
              size_bytes: file.lfs?.size ?? file.size,
              runtime,
              source_org: org.name,
              category,
              last_synced: now,
            });
          }
        } catch (e) {
          errors.push(`Failed to list files for ${repo.id}: ${e}`);
        }
      }
    } catch (e) {
      errors.push(`Failed to process org ${org.name}: ${e}`);
    }
  }

  let inserted = 0;
  let updated = 0;

  const BATCH_SIZE = 100;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error, count } = await supabase
      .from('models')
      .upsert(batch, { onConflict: 'hf_model_id,file_path', count: 'exact' });

    if (error) {
      errors.push(`Upsert batch ${i} failed: ${error.message}`);
    } else {
      inserted += count ?? batch.length;
    }
  }

  return new Response(
    JSON.stringify({
      synced: rows.length,
      inserted,
      errors: errors.length > 0 ? errors : undefined,
      orgs: HF_ORGS.map((o) => o.name),
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
