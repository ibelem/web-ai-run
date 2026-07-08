import { describe, it, expect } from 'vitest';
import { parseExternalDataLocations, isStandardDataFormat } from '$lib/engine/onnx-external-data';

// ── Minimal protobuf encoder (test fixtures only) ──────────────────────────

function varint(n: number): number[] {
  const out: number[] = [];
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n & 0x7f);
  return out;
}

function tag(field: number, wire: number): number[] {
  return varint(field * 8 + wire);
}

/** Length-delimited (wire type 2) field carrying arbitrary bytes/sub-message. */
function ld(field: number, payload: number[]): number[] {
  return [...tag(field, 2), ...varint(payload.length), ...payload];
}

function str(s: string): number[] {
  return [...new TextEncoder().encode(s)];
}

/** A StringStringEntryProto { 1: key, 2: value }. */
function entry(key: string, value: string): number[] {
  return [...ld(1, str(key)), ...ld(2, str(value))];
}

/** A TensorProto with data_location=EXTERNAL(14=1) and the given external_data entries. */
function externalTensor(entries: number[][]): number[] {
  const body: number[] = [];
  for (const e of entries) body.push(...ld(13, e)); // external_data (repeated)
  body.push(...tag(14, 0), ...varint(1)); // data_location = EXTERNAL
  return body;
}

/** Wrap initializers in GraphProto(field 5) inside ModelProto(field 7). */
function model(tensors: number[][]): Uint8Array {
  const graph: number[] = [];
  for (const t of tensors) graph.push(...ld(5, t)); // initializer (repeated)
  return new Uint8Array(ld(7, graph)); // ModelProto.graph
}

function locEntry(filename: string, offset = 0, length = 100): number[] {
  return externalTensor([
    entry('location', filename),
    entry('offset', String(offset)),
    entry('length', String(length)),
  ]);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('parseExternalDataLocations', () => {
  it('reads the standard .onnx_data location', () => {
    const bytes = model([locEntry('model.onnx_data')]);
    expect(parseExternalDataLocations(bytes)).toEqual(['model.onnx_data']);
  });

  it('reads the .onnx.data location', () => {
    const bytes = model([locEntry('model.onnx.data')]);
    expect(parseExternalDataLocations(bytes)).toEqual(['model.onnx.data']);
  });

  it('dedupes when many tensors point at one file', () => {
    const bytes = model([
      locEntry('model.onnx_data', 0, 100),
      locEntry('model.onnx_data', 100, 200),
      locEntry('model.onnx_data', 300, 50),
    ]);
    expect(parseExternalDataLocations(bytes)).toEqual(['model.onnx_data']);
  });

  it('returns multiple distinct locations in model order', () => {
    const bytes = model([
      locEntry('weights.onnx.data'),
      locEntry('embeddings.onnx.data'),
    ]);
    expect(parseExternalDataLocations(bytes)).toEqual([
      'weights.onnx.data',
      'embeddings.onnx.data',
    ]);
  });

  it('returns [] for a self-contained model (no external_data)', () => {
    // A tensor with inline raw_data (field 9), no external_data / location.
    const inlineTensor = [...ld(9, [1, 2, 3, 4, 5, 6, 7, 8])];
    const bytes = model([inlineTensor]);
    expect(parseExternalDataLocations(bytes)).toEqual([]);
  });

  it('returns [] for empty / garbage input', () => {
    expect(parseExternalDataLocations(new Uint8Array(0))).toEqual([]);
    expect(parseExternalDataLocations(new Uint8Array([0xff, 0xff, 0xff]))).toEqual([]);
  });

  it('finds a location nested inside a subgraph attribute', () => {
    // ModelProto.graph(7) → node(1) → attribute(5) → g(6: GraphProto) →
    // initializer(5) → external tensor. Exercises deep nesting.
    const innerTensor = locEntry('subgraph.onnx_data');
    const innerGraph = [...ld(5, innerTensor)];
    const attribute = [...ld(6, innerGraph)]; // AttributeProto.g
    const node = [...ld(5, attribute)]; // NodeProto.attribute
    const outerGraph = [...ld(1, node)]; // GraphProto.node
    const bytes = new Uint8Array(ld(7, outerGraph));
    expect(parseExternalDataLocations(bytes)).toEqual(['subgraph.onnx_data']);
  });

  it('accepts a raw ArrayBuffer as well as Uint8Array', () => {
    const u8 = model([locEntry('model.onnx_data')]);
    const ab = new ArrayBuffer(u8.byteLength);
    new Uint8Array(ab).set(u8);
    expect(parseExternalDataLocations(ab)).toEqual(['model.onnx_data']);
  });
});

describe('isStandardDataFormat', () => {
  it('treats a single .onnx_data as standard', () => {
    expect(isStandardDataFormat(['model.onnx_data'], 'model.onnx')).toBe(true);
  });

  it('treats numbered .onnx_data shards as standard', () => {
    expect(
      isStandardDataFormat(['model.onnx_data', 'model.onnx_data_1', 'model.onnx_data_2'], 'model.onnx'),
    ).toBe(true);
  });

  it('treats no external data as standard', () => {
    expect(isStandardDataFormat([], 'model.onnx')).toBe(true);
  });

  it('flags .onnx.data as non-standard', () => {
    expect(isStandardDataFormat(['model.onnx.data'], 'model.onnx')).toBe(false);
  });

  it('respects the dtype-suffixed graph name', () => {
    expect(isStandardDataFormat(['model_q4f16.onnx_data'], 'model_q4f16.onnx')).toBe(true);
    expect(isStandardDataFormat(['model.onnx_data'], 'model_q4f16.onnx')).toBe(false);
  });
});
