import { createClient } from '$lib/supabase/client';

const STORAGE_KEY = 'fdo_cache';
const META_KEY = 'fdo_cache_meta';
const FRESH_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  hf_model_id: string;
  file_path: string;
  overrides: Record<string, number>;
}

interface CacheMeta {
  cached_at: number;
}

function readCache(): CacheEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeCache(entries: CacheEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    localStorage.setItem(META_KEY, JSON.stringify({ cached_at: Date.now() }));
  } catch {}
}

function readMeta(): CacheMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function invalidateOverridesCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(META_KEY);
  } catch {}
}

async function fetchOverrides(): Promise<CacheEntry[]> {
  const supabase = createClient();
  const PAGE = 1000;
  const all: CacheEntry[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await (supabase
      .from('free_dimension_overrides') as any)
      .select('hf_model_id, file_path, overrides')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows: Array<{ hf_model_id: string; file_path: string; overrides: Record<string, number> }> = data ?? [];
    for (const r of rows) {
      all.push({
        hf_model_id: r.hf_model_id,
        file_path: r.file_path,
        overrides: r.overrides,
      });
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export async function loadOverrides(): Promise<Map<string, Record<string, number>>> {
  const meta = readMeta();
  const age = meta ? Date.now() - meta.cached_at : Infinity;

  let entries: CacheEntry[];
  if (meta && age < FRESH_MS) {
    entries = readCache();
    if (entries.length > 0) {
      return toMap(entries);
    }
  }

  try {
    entries = await fetchOverrides();
    writeCache(entries);
  } catch {
    entries = readCache();
  }
  return toMap(entries);
}

export function getOverride(
  map: Map<string, Record<string, number>>,
  hfModelId: string,
  filePath: string
): Record<string, number> | undefined {
  return map.get(`${hfModelId}|${filePath}`);
}

function toMap(entries: CacheEntry[]): Map<string, Record<string, number>> {
  const m = new Map<string, Record<string, number>>();
  for (const e of entries) {
    m.set(`${e.hf_model_id}|${e.file_path}`, e.overrides);
  }
  return m;
}
