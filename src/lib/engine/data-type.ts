type TypedArrayConstructor =
  | typeof Float32Array
  | typeof Float64Array
  | typeof Int8Array
  | typeof Int16Array
  | typeof Int32Array
  | typeof Uint8Array
  | typeof Uint16Array
  | typeof Uint32Array
  | typeof BigInt64Array;

const TYPE_MAP: Record<string, TypedArrayConstructor> = {
  float32: Float32Array,
  float64: Float64Array,
  float16: Uint16Array,
  int8: Int8Array,
  int16: Int16Array,
  int32: Int32Array,
  int64: BigInt64Array,
  uint8: Uint8Array,
  uint16: Uint16Array,
  uint32: Uint32Array,
  bool: Uint8Array,
};

export function getTypedArrayConstructor(dtype: string): TypedArrayConstructor {
  return TYPE_MAP[dtype] ?? Float32Array;
}

export function float16ToNumber(h: number): number {
  const sign = (h >> 15) & 0x1;
  const exp = (h >> 10) & 0x1f;
  const mant = h & 0x3ff;

  if (exp === 0) {
    if (mant === 0) return sign === 0 ? 0 : -0;
    const val = mant / 1024 * Math.pow(2, -14);
    return sign === 0 ? val : -val;
  }

  if (exp === 0x1f) {
    return mant === 0 ? (sign === 0 ? Infinity : -Infinity) : NaN;
  }

  const val = Math.pow(2, exp - 15) * (1 + mant / 1024);
  return sign === 0 ? val : -val;
}

export function generateRandomInput(dtype: string, length: number): ArrayBufferView {
  const Ctor = getTypedArrayConstructor(dtype);

  if (Ctor === BigInt64Array) {
    return BigInt64Array.from({ length }, () => BigInt(Math.floor(Math.random() * 100)));
  }

  return (Ctor as any).from({ length }, () => Math.random());
}
