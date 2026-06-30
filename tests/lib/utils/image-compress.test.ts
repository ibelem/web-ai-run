import { describe, it, expect } from 'vitest';
import { computeTargetSize, compressImage, ImageValidationError, MAX_ATTACHMENT_BYTES } from '$lib/utils/image-compress';

describe('compressImage validation', () => {
  it('rejects non-image files', async () => {
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    await expect(compressImage(file)).rejects.toBeInstanceOf(ImageValidationError);
  });
  it('rejects images over the size cap', async () => {
    const big = new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], 'huge.png', { type: 'image/png' });
    await expect(compressImage(big)).rejects.toBeInstanceOf(ImageValidationError);
  });
});

describe('computeTargetSize', () => {
  it('leaves small images unchanged', () => {
    expect(computeTargetSize(800, 600, 1920)).toEqual({ w: 800, h: 600 });
  });
  it('scales landscape down to max edge', () => {
    expect(computeTargetSize(3840, 2160, 1920)).toEqual({ w: 1920, h: 1080 });
  });
  it('scales portrait down to max edge', () => {
    expect(computeTargetSize(2160, 3840, 1920)).toEqual({ w: 1080, h: 1920 });
  });
  it('rounds to integer pixels', () => {
    const r = computeTargetSize(1000, 333, 500);
    expect(Number.isInteger(r.w)).toBe(true);
    expect(Number.isInteger(r.h)).toBe(true);
  });
});
