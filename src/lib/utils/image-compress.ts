export function computeTargetSize(w: number, h: number, max = 1920): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= max) return { w, h };
  const scale = max / longest;
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5MB before compression

export class ImageValidationError extends Error {}

export async function compressImage(
  file: File,
  opts: { maxEdge?: number; quality?: number; maxBytes?: number } = {}
): Promise<{ blob: Blob; w: number; h: number }> {
  const { maxEdge = 1920, quality = 0.85, maxBytes = MAX_ATTACHMENT_BYTES } = opts;
  if (!file.type.startsWith('image/')) {
    throw new ImageValidationError('Only image files can be attached.');
  }
  if (file.size > maxBytes) {
    throw new ImageValidationError(`Image is too large (max ${Math.round(maxBytes / (1024 * 1024))}MB).`);
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageValidationError('That image format could not be read by your browser.');
  }
  const { w, h } = computeTargetSize(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/webp', quality)
  );
  return { blob, w, h };
}
