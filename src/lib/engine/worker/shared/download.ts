const HF_MAIN = 'https://huggingface.co';
const HF_MIRROR = 'https://hf-mirror.com';
const HF_TEST_PATH = '/webml/models-moved/resolve/main/01.onnx';
const HF_BASE_TTL_MS = 10 * 60 * 1000;
let cachedHfBase: string | null = null;
let cachedHfBaseAt = 0;

export async function getHfBase(): Promise<string> {
  if (cachedHfBase && Date.now() - cachedHfBaseAt < HF_BASE_TTL_MS) {
    return cachedHfBase;
  }
  const checkDomain = async (base: string): Promise<boolean> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(`${base}${HF_TEST_PATH}`, { method: 'HEAD', signal: controller.signal, cache: 'no-store' });
      clearTimeout(timeoutId);
      return res.ok;
    } catch {
      clearTimeout(timeoutId);
      return false;
    }
  };
  if (await checkDomain(HF_MAIN)) { cachedHfBase = HF_MAIN; cachedHfBaseAt = Date.now(); return HF_MAIN; }
  if (await checkDomain(HF_MIRROR)) { cachedHfBase = HF_MIRROR; cachedHfBaseAt = Date.now(); return HF_MIRROR; }
  cachedHfBase = HF_MAIN; cachedHfBaseAt = Date.now(); return HF_MAIN;
}

export function invalidateHfBase(): void {
  cachedHfBase = null;
  cachedHfBaseAt = 0;
}

export function pinHfBase(base: string): void {
  cachedHfBase = base;
  cachedHfBaseAt = Date.now();
}

export function sanitizeFileName(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, '--');
}

// Chunk size for reading large files from OPFS — 256 MB keeps heap pressure low.
const OPFS_READ_CHUNK = 256 * 1024 * 1024;

// Return the OPFS File handle (extends Blob — supports streaming, slicing, and
// zero-copy Response construction). Use this for large files instead of
// getFromOPFS which materializes the full ArrayBuffer in memory.
export async function getOPFSFile(fileName: string, expectedSize?: number): Promise<File | null> {
  try {
    const root = await navigator.storage.getDirectory();
    const modelsDir = await root.getDirectoryHandle('models', { create: true });
    const fileHandle = await modelsDir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    if (expectedSize !== undefined && expectedSize > 0 && file.size !== expectedSize) return null;
    return file;
  } catch {
    return null;
  }
}

export async function getFromOPFS(fileName: string, expectedSize?: number): Promise<ArrayBuffer | null> {
  try {
    const root = await navigator.storage.getDirectory();
    const modelsDir = await root.getDirectoryHandle('models', { create: true });
    const fileHandle = await modelsDir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    if (expectedSize !== undefined && expectedSize > 0 && file.size !== expectedSize) return null;

    const size = file.size;
    // For large files, read in chunks to avoid browser arrayBuffer() truncation bug.
    if (size > OPFS_READ_CHUNK) {
      const out = new Uint8Array(size);
      let offset = 0;
      while (offset < size) {
        const end = Math.min(offset + OPFS_READ_CHUNK, size);
        const chunk = await file.slice(offset, end).arrayBuffer();
        out.set(new Uint8Array(chunk), offset);
        offset = end;
      }
      return out.buffer;
    }

    const buf = await file.arrayBuffer();
    return buf;
  } catch {
    return null;
  }
}

export async function saveToOPFS(fileName: string, data: ArrayBuffer): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    const modelsDir = await root.getDirectoryHandle('models', { create: true });
    const fileHandle = await modelsDir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
  } catch {}
}

export interface DownloadFromHostResult {
  arrayBuffer: ArrayBuffer;
  cacheKey: string;
  useCache: boolean;
}

export interface AggProgress { total: number; prior: number }

export type ProgressCallback = (loaded: number, total: number, filePath: string) => void;

export async function downloadFromHost(
  base: string,
  hfModelId: string,
  filePath: string,
  onProgress: ProgressCallback,
  agg?: AggProgress,
): Promise<DownloadFromHostResult> {
  const url = `${base}/${hfModelId}/resolve/main/${filePath}`;

  let etag = '';
  let headOk = false;
  let expectedSize = 0;
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (head.ok) {
      headOk = true;
      etag = (head.headers.get('etag') ?? '').replace(/"/g, '');
      expectedSize = Number(head.headers.get('content-length') ?? 0);
    }
  } catch {}

  const useCache = headOk && etag !== '';
  const cacheKey = useCache ? sanitizeFileName(`${hfModelId}--${filePath}--${etag}`) : '';

  if (useCache) {
    const cached = await getFromOPFS(cacheKey);
    if (cached) {
      if (expectedSize > 0 && cached.byteLength !== expectedSize) {
        // size mismatch — fall through to refetch
      } else {
        return { arrayBuffer: cached, cacheKey, useCache };
      }
    }
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);

  const contentLength = Number(response.headers.get('content-length') ?? 0);
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    const aggLoaded = agg ? agg.prior + loaded : loaded;
    const aggTotal = agg ? agg.total : contentLength;
    onProgress(aggLoaded, aggTotal, filePath);
  }

  if (contentLength > 0 && loaded !== contentLength) {
    throw new Error(`Truncated download: received ${loaded} of ${contentLength} bytes`);
  }

  const buffer = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  return { arrayBuffer: buffer.buffer, cacheKey, useCache };
}

export async function downloadSingleFile(
  primary: string,
  fallback: string,
  hfModelId: string,
  filePath: string,
  onProgress: ProgressCallback,
  agg?: AggProgress,
): Promise<DownloadFromHostResult> {
  try {
    return await downloadFromHost(primary, hfModelId, filePath, onProgress, agg);
  } catch (primaryErr: any) {
    invalidateHfBase();
    try {
      const result = await downloadFromHost(fallback, hfModelId, filePath, onProgress, agg);
      pinHfBase(fallback);
      return result;
    } catch (fallbackErr: any) {
      throw new Error(`Both ${primary} and ${fallback} failed: ${primaryErr?.message ?? primaryErr} / ${fallbackErr?.message ?? fallbackErr}`);
    }
  }
}

export interface DownloadedBundle {
  modelBuffer: ArrayBuffer;
  externalData: { path: string; data: ArrayBuffer }[];
}

async function probeSidecars(base: string, hfModelId: string, mainFilePath: string): Promise<string[]> {
  const fileBase = mainFilePath.replace(/\.onnx$/, '');
  const sidecars: string[] = [];
  const probe = async (path: string): Promise<boolean> => {
    try {
      const res = await fetch(`${base}/${hfModelId}/resolve/main/${path}`, { method: 'HEAD' });
      return res.ok;
    } catch { return false; }
  };
  const basePath = `${fileBase}.onnx_data`;
  if (await probe(basePath)) {
    sidecars.push(basePath);
    for (let i = 1; i <= 99; i++) {
      const np = `${fileBase}.onnx_data_${i}`;
      if (await probe(np)) sidecars.push(np);
      else break;
    }
  }
  return sidecars;
}

export async function downloadModelBundle(
  hfModelId: string,
  filePath: string,
  onProgress: ProgressCallback,
  onLog: (msg: string) => void,
): Promise<DownloadedBundle> {
  const primary = await getHfBase();
  const fallback = primary === HF_MAIN ? HF_MIRROR : HF_MAIN;

  const sidecarPaths = filePath.endsWith('.onnx') ? await probeSidecars(primary, hfModelId, filePath) : [];
  if (sidecarPaths.length > 0) onLog(`Found ${sidecarPaths.length} external data sidecar(s): ${sidecarPaths.join(', ')}`);

  let totalBytes = 0;
  const allPaths = [filePath, ...sidecarPaths];
  for (const p of allPaths) {
    try {
      const res = await fetch(`${primary}/${hfModelId}/resolve/main/${p}`, { method: 'HEAD' });
      totalBytes += Number(res.headers.get('content-length') ?? 0);
    } catch {}
  }

  let priorBytes = 0;
  const mainResult = await downloadSingleFile(primary, fallback, hfModelId, filePath, onProgress,
    totalBytes > 0 ? { total: totalBytes, prior: priorBytes } : undefined);
  if (mainResult.useCache) { await saveToOPFS(mainResult.cacheKey, mainResult.arrayBuffer); onLog(`Saved ${filePath} to OPFS cache`); }
  else { onLog(`HEAD unavailable — bypassing OPFS cache for ${filePath}`); }
  priorBytes += mainResult.arrayBuffer.byteLength;

  const externalData: { path: string; data: ArrayBuffer }[] = [];
  for (const sidecarPath of sidecarPaths) {
    const r = await downloadSingleFile(primary, fallback, hfModelId, sidecarPath, onProgress,
      totalBytes > 0 ? { total: totalBytes, prior: priorBytes } : undefined);
    if (r.useCache) { await saveToOPFS(r.cacheKey, r.arrayBuffer); onLog(`Saved ${sidecarPath} to OPFS cache`); }
    const sidecarName = sidecarPath.includes('/') ? sidecarPath.slice(sidecarPath.lastIndexOf('/') + 1) : sidecarPath;
    externalData.push({ path: sidecarName, data: r.arrayBuffer });
    priorBytes += r.arrayBuffer.byteLength;
  }

  return { modelBuffer: mainResult.arrayBuffer, externalData };
}
