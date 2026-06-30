export function computeTargetSize(w: number, h: number, max = 1920): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= max) return { w, h };
  const scale = max / longest;
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

export async function compressImage(
  file: File,
  opts: { maxEdge?: number; quality?: number } = {}
): Promise<{ blob: Blob; w: number; h: number }> {
  const { maxEdge = 1920, quality = 0.85 } = opts;
  const bitmap = await createImageBitmap(file);
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
