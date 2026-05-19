import { createClient } from '@supabase/supabase-js';

const HF_API_BASE = 'https://huggingface.co/api';

const SKIP_PATTERNS = ['.onnx.data', '.onnx_data'];
const CONCURRENCY = 5;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX = 450;                  // stay under HF's 500 req/5min limit

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

function parseLinkNext(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Proactive rate limiter: tracks requests in the current window and pauses
// before sending if the budget is exhausted, rather than waiting for a 429.
const rateLimiter = {
  windowStart: Date.now(),
  count: 0,
  async throttle() {
    const now = Date.now();
    if (now - this.windowStart >= RATE_LIMIT_WINDOW_MS) {
      this.windowStart = now;
      this.count = 0;
    }
    if (this.count >= RATE_LIMIT_MAX) {
      const wait = RATE_LIMIT_WINDOW_MS - (now - this.windowStart) + 1000;
      console.log(`  Rate limit budget reached (${this.count} req). Pausing ${Math.ceil(wait / 1000)}s...`);
      await sleep(wait);
      this.windowStart = Date.now();
      this.count = 0;
    }
    this.count++;
  },
};

async function hfFetch(url: string): Promise<Response> {
  await rateLimiter.throttle();
  const res = await fetch(url);
  // Fallback: if a 429 slips through despite throttling, wait out the window and retry once.
  if (res.status === 429) {
    const wait = RATE_LIMIT_WINDOW_MS + 1000;
    console.warn(`  Unexpected 429. Waiting ${Math.ceil(wait / 1000)}s before retry...`);
    await sleep(wait);
    rateLimiter.windowStart = Date.now();
    rateLimiter.count = 0;
    await rateLimiter.throttle();
    return fetch(url);
  }
  return res;
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

async function fetchAllRepos(orgName: string, errors: string[]): Promise<any[]> {
  const repos: any[] = [];
  let url: string | null = `${HF_API_BASE}/models?author=${encodeURIComponent(orgName)}&limit=1000`;
  let page = 1;

  while (url) {
    const res = await hfFetch(url);
    if (!res.ok) {
      errors.push(`Failed to list ${orgName} page ${page}: ${res.status}`);
      break;
    }
    const batch: any[] = await res.json();
    repos.push(...batch);
    url = parseLinkNext(res.headers.get('Link'));
    if (url) page++;
  }

  return repos;
}

// Returns null if the fetch failed (rate limit or network error) — caller must not delete stale rows for this repo.
// Returns ModelRow[] (possibly empty) if the fetch succeeded — repo was reachable and had 0 supported files.
async function fetchRepoFiles(
  repoId: string,
  orgName: string,
  task: string,
  now: string,
  errors: string[]
): Promise<ModelRow[] | null> {
  try {
    const rows: ModelRow[] = [];
    let url: string | null = `${HF_API_BASE}/models/${repoId}/tree/main?recursive=true`;

    while (url) {
      const res = await hfFetch(url);
      if (!res.ok) {
        errors.push(`Failed to fetch tree for ${repoId}: ${res.status}`);
        return null;
      }

      const files: any[] = await res.json();

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

      url = parseLinkNext(res.headers.get('Link'));
    }

    return rows;
  } catch (e) {
    errors.push(`Failed to list files for ${repoId}: ${e}`);
    return null;
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
    .order('name', { ascending: true });

  if (orgsError) {
    console.error('Failed to load orgs from DB:', orgsError.message);
    process.exit(1);
  }

  const HF_ORGS = orgsData ?? [];
  console.log(`Loaded ${HF_ORGS.length} orgs from DB: ${HF_ORGS.map((o) => o.name).join(', ')}`);

  const rows: ModelRow[] = [];
  const errors: string[] = [];
  const fetchedRepoIds: string[] = [];
  const now = new Date().toISOString();

  for (const org of HF_ORGS) {
    console.log(`Fetching repos for ${org.name}...`);
    try {
      const repos = await fetchAllRepos(org.name, errors);
      const activeRepos = repos.filter((r) => !r.private && !r.disabled);
      console.log(`  Found ${activeRepos.length} repos, fetching file trees (${CONCURRENCY} concurrent)...`);

      const tasks = activeRepos.map((repo) => () =>
        fetchRepoFiles(repo.id, org.name, repo.pipeline_tag ?? 'uncategorized', now, errors)
      );

      const results = await runConcurrent(tasks, CONCURRENCY);
      const successfulRepoIds: string[] = [];
      for (let i = 0; i < results.length; i++) {
        const repoRows = results[i];
        if (repoRows !== null) {
          successfulRepoIds.push(activeRepos[i].id);
          rows.push(...repoRows);
        }
      }
      fetchedRepoIds.push(...successfulRepoIds);

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

  // Delete stale rows only for repos we successfully fetched this run.
  // This avoids wiping rows for repos that failed due to rate limits or network errors.
  const DELETE_BATCH = 50;
  let deleted = 0;
  for (let i = 0; i < fetchedRepoIds.length; i += DELETE_BATCH) {
    const batch = fetchedRepoIds.slice(i, i + DELETE_BATCH);
    const { error: deleteError, count } = await supabase
      .from('models')
      .delete({ count: 'exact' })
      .in('hf_model_id', batch)
      .lt('last_synced', now);

    if (deleteError) {
      errors.push(`Delete stale rows failed: ${deleteError.message}`);
    } else {
      deleted += count ?? 0;
    }
  }
  console.log(`Deleted stale rows: ${deleted}`);

  if (errors.length > 0) {
    console.error(`\nErrors (${errors.length}):`);
    errors.slice(0, 20).forEach((e) => console.error(`  - ${e}`));
  }
}

main();
