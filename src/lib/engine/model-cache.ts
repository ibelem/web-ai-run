import type { DownloadProgress } from './types';

const HF_CDN_BASE = 'https://huggingface.co';

export function buildModelUrl(hfModelId: string, filePath: string): string {
  return `${HF_CDN_BASE}/${hfModelId}/resolve/main/${filePath}`;
}

export function getModelFileName(hfModelId: string, filePath: string): string {
  return `${hfModelId.replace(/\//g, '--')}--${filePath.replace(/\//g, '--')}`;
}

export async function downloadModel(
  hfModelId: string,
  filePath: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<ArrayBuffer> {
  const fileName = getModelFileName(hfModelId, filePath);

  if ('storage' in navigator && 'getDirectory' in navigator.storage) {
    const cached = await getFromOPFS(fileName);
    if (cached) return cached;
  } else {
    const cached = await getFromCacheAPI(fileName);
    if (cached) return cached;
  }

  const url = buildModelUrl(hfModelId, filePath);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download model: ${response.status} ${response.statusText}`);
  }

  const contentLength = Number(response.headers.get('content-length') ?? 0);
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.({
      model_id: hfModelId,
      file_path: filePath,
      loaded_bytes: loaded,
      total_bytes: contentLength,
      percent: contentLength > 0 ? (loaded / contentLength) * 100 : 0,
    });
  }

  const buffer = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const arrayBuffer = buffer.buffer;

  if ('storage' in navigator && 'getDirectory' in navigator.storage) {
    await saveToOPFS(fileName, arrayBuffer);
  } else {
    await saveToCacheAPI(fileName, arrayBuffer, url);
  }

  return arrayBuffer;
}

async function getFromOPFS(fileName: string): Promise<ArrayBuffer | null> {
  try {
    const root = await navigator.storage.getDirectory();
    const modelsDir = await root.getDirectoryHandle('models', { create: true });
    const fileHandle = await modelsDir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return file.arrayBuffer();
  } catch {
    return null;
  }
}

async function saveToOPFS(fileName: string, data: ArrayBuffer): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const modelsDir = await root.getDirectoryHandle('models', { create: true });
  const fileHandle = await modelsDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

async function getFromCacheAPI(fileName: string): Promise<ArrayBuffer | null> {
  try {
    const cache = await caches.open('webai-models');
    const response = await cache.match(fileName);
    if (response) return response.arrayBuffer();
    return null;
  } catch {
    return null;
  }
}

async function saveToCacheAPI(fileName: string, data: ArrayBuffer, url: string): Promise<void> {
  const cache = await caches.open('webai-models');
  const response = new Response(data);
  await cache.put(url, response);
}

export async function clearModelCache(): Promise<void> {
  if ('storage' in navigator && 'getDirectory' in navigator.storage) {
    const root = await navigator.storage.getDirectory();
    try {
      await root.removeEntry('models', { recursive: true });
    } catch {}
  }
  try {
    await caches.delete('webai-models');
  } catch {}
}
