import { describe, it, expect } from 'vitest';
import { getTypedArrayConstructor, float16ToNumber, generateRandomInput } from '$lib/engine/data-type';

describe('data-type', () => {
  it('getTypedArrayConstructor maps known types', () => {
    expect(getTypedArrayConstructor('float32')).toBe(Float32Array);
    expect(getTypedArrayConstructor('int8')).toBe(Int8Array);
    expect(getTypedArrayConstructor('uint8')).toBe(Uint8Array);
    expect(getTypedArrayConstructor('int32')).toBe(Int32Array);
    expect(getTypedArrayConstructor('int64')).toBe(BigInt64Array);
  });

  it('float16ToNumber converts known values', () => {
    expect(float16ToNumber(0x3c00)).toBeCloseTo(1.0);
    expect(float16ToNumber(0x0000)).toBe(0);
  });

  it('generateRandomInput creates typed array of correct length', () => {
    const arr = generateRandomInput('float32', 224 * 224 * 3) as Float32Array;
    expect(arr).toBeInstanceOf(Float32Array);
    expect(arr.length).toBe(224 * 224 * 3);
  });
});
