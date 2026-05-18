const DB_NAME = 'web-ai-run-models';
const DB_VERSION = 1;
const STORE = 'models';
const META_KEY = 'model_cache_meta';

// Serve from cache only if fetched within this window
const FRESH_MS = 60 * 60 * 1000;       // 1 hour
// Delta-fetch (new rows only) within this window; beyond it → full refresh
const DELTA_MS = 24 * 60 * 60 * 1000;  // 24 hours

interface Meta {
  cached_at: number;
  max_last_synced: string;
}

export type FetchMode = { full: true } | { full: false; since: string };

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readMeta(): Meta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeMeta(meta: Meta): void {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch {}
}

function clearMeta(): void {
  try { localStorage.removeItem(META_KEY); } catch {}
}

function getAll<T>(db: IDBDatabase): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

function upsert<T>(db: IDBDatabase, rows: T[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const row of rows) store.put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function replaceAll<T>(db: IDBDatabase, rows: T[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const clear = store.clear();
    clear.onsuccess = () => {
      for (const row of rows) store.put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    clear.onerror = () => reject(clear.error);
  });
}

function maxLastSynced(rows: { last_synced: string }[]): string {
  return rows.reduce((max, r) => (r.last_synced > max ? r.last_synced : max), '');
}

export async function loadModels<T extends { id: string; last_synced: string }>(
  fetchFn: (mode: FetchMode) => Promise<T[]>
): Promise<T[]> {
  // Server-side render: no IndexedDB, fetch directly
  if (typeof indexedDB === 'undefined') {
    return fetchFn({ full: true });
  }

  const meta = readMeta();
  const now = Date.now();
  const age = meta ? now - meta.cached_at : Infinity;

  try {
    const db = await openDB();

    // Within fresh window: serve from cache without any network call
    if (meta && age < FRESH_MS) {
      const cached = await getAll<T>(db);
      if (cached.length > 0) return cached;
      // Cache empty despite meta (e.g. cleared by browser) — fall through
    }

    if (meta && age < DELTA_MS) {
      // Delta fetch: only rows newer than our watermark
      const delta = await fetchFn({ full: false, since: meta.max_last_synced });
      if (delta.length > 0) await upsert(db, delta);
      const all = await getAll<T>(db);
      writeMeta({ cached_at: now, max_last_synced: maxLastSynced(all) });
      return all;
    } else {
      // Full refresh: clears stale/disabled rows atomically
      const all = await fetchFn({ full: true });
      await replaceAll(db, all);
      writeMeta({ cached_at: now, max_last_synced: maxLastSynced(all) });
      return all;
    }
  } catch {
    // IndexedDB unavailable or corrupted — degrade gracefully
    clearMeta();
    return fetchFn({ full: true });
  }
}

export function invalidateModelCache(): void {
  clearMeta();
}
