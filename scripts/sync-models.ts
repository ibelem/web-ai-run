import { createClient } from '@supabase/supabase-js';

const HF_API_BASE = 'https://huggingface.co/api';

const SKIP_PATTERNS = ['.onnx.data', '.onnx_data'];
const CONCURRENCY = 10;

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
  [/[_-]q8/, 'int8'],
  [/[_-]quantized/, 'quantized'],
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
  task: string;
  last_synced: string;
}

async function fetchRepoFiles(
  repoId: string,
  orgName: string,
  task: string,
  now: string,
  errors: string[]
): Promise<ModelRow[]> {
  try {
    const res = await fetch(`${HF_API_BASE}/models/${repoId}/tree/main?recursive=true`);
    if (!res.ok) return [];

    const files: any[] = await res.json();
    const rows: ModelRow[] = [];

    for (const file of files) {
      if (file.type !== 'file') continue;
      const filePath: string = file.path ?? file.rfilename ?? '';
      const lower = filePath.toLowerCase();
      if (SKIP_PATTERNS.some((s) => lower.includes(s))) continue;

      const runtime = inferRuntime(filePath);
      if (!runtime) continue;

      rows.push({
        hf_model_id: repoId,
        file_path: filePath,
        data_type: inferDataType(filePath),
        size_bytes: file.lfs?.size ?? file.size ?? 0,
        runtime,
        source_org: orgName,
        task,
        last_synced: now,
      });
    }

    return rows;
  } catch (e) {
    errors.push(`Failed to list files for ${repoId}: ${e}`);
    return [];
  }
}

async function runConcurrent<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

async function main() {
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars: PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: orgsData, error: orgsError } = await supabase
    .from('orgs')
    .select('name')
    .eq('enabled', true)
    .order('name', { ascending: true });

  if (orgsError) {
    console.error('Failed to load orgs from DB:', orgsError.message);
    process.exit(1);
  }

  const HF_ORGS = orgsData ?? [];
  console.log(`Loaded ${HF_ORGS.length} enabled orgs from DB: ${HF_ORGS.map((o) => o.name).join(', ')}`);

  const rows: ModelRow[] = [];
  const errors: string[] = [];
  const now = new Date().toISOString();

  for (const org of HF_ORGS) {
    console.log(`Fetching repos for ${org.name}...`);
    try {
      const reposRes = await fetch(
        `${HF_API_BASE}/models?author=${encodeURIComponent(org.name)}&limit=1000`
      );
      if (!reposRes.ok) {
        errors.push(`Failed to list ${org.name}: ${reposRes.status}`);
        continue;
      }

      const repos: any[] = await reposRes.json();
      const activeRepos = repos.filter((r) => !r.private && !r.disabled);
      console.log(`  Found ${activeRepos.length} repos, fetching file trees (${CONCURRENCY} concurrent)...`);

      const tasks = activeRepos.map((repo) => () =>
        fetchRepoFiles(repo.id, org.name, repo.pipeline_tag ?? 'uncategorized', now, errors)
      );

      const results = await runConcurrent(tasks, CONCURRENCY);
      for (const repoRows of results) rows.push(...repoRows);

      console.log(`  Done. Running total: ${rows.length} model files`);
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

  // Delete rows for synced orgs that weren't touched this run — file was removed from HF
  const syncedOrgs = HF_ORGS.map((o) => o.name);
  const { error: deleteError, count: deleted } = await supabase
    .from('models')
    .delete({ count: 'exact' })
    .in('source_org', syncedOrgs)
    .lt('last_synced', now);

  if (deleteError) {
    errors.push(`Delete stale rows failed: ${deleteError.message}`);
  } else {
    console.log(`Deleted stale rows: ${deleted ?? 0}`);
  }

  if (errors.length > 0) {
    console.error(`\nErrors (${errors.length}):`);
    errors.slice(0, 20).forEach((e) => console.error(`  - ${e}`));
  }
}

main();
