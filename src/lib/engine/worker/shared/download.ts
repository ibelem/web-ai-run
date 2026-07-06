// Shared worker primitives: HuggingFace host selection + OPFS read/write.
//
// These are the only download helpers shared across workers. The ONNX inference
// worker (inference.worker.ts) is a *classic* worker — LiteRT's Emscripten
// loader calls importScripts(), which module workers don't support — so it
// can't ESM-import from here and keeps its own inlined download stack. The LLM
// worker (llm.worker.ts) is a module worker and imports these directly. Keep
// this module limited to primitives both can agree on; per-model bundle
// download logic lives with its consumer.

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
