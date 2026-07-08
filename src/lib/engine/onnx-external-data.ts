// Extract ONNX external-data `location` filenames from a serialized ONNX model.
//
// ONNX stores large tensors out-of-line: each external TensorProto carries
// `external_data` — a repeated `StringStringEntryProto { key, value }` — where
// the entry with key "location" names the sidecar file. ONNX Runtime loads
// *exactly* that string, so it is the ground truth for both downloading the
// sidecar and registering it (ORT `externalData[].path` /
// Transformers.js `session_options.externalData[].path`).
//
// This is a minimal, dependency-free protobuf wire-format walk. It recursively
// descends length-delimited (wire type 2) sub-messages and, for any message
// whose field 1 decodes to the string "location", records field 2 as a
// filename. That finds the location entry wherever it lives (graph
// initializers, sparse initializers, subgraph/attribute tensors) without
// hard-coding the ONNX schema. The exact `key === "location"` match makes false
// positives essentially impossible.
//
// NOTE: inference.worker.ts is a classic worker with no static imports, so it
// carries an inlined copy of this function. Keep the two in sync.

const MAX_DEPTH = 24;

/**
 * Returns the distinct external-data `location` strings referenced by the
 * model, in first-seen (model) order. Returns `[]` for a self-contained model
 * or when the bytes can't be parsed as an ONNX graph.
 */
export function parseExternalDataLocations(input: ArrayBuffer | Uint8Array): string[] {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  const found = new Set<string>();
  const utf8 = new TextDecoder('utf-8', { fatal: false });

  // Read a base-128 varint at `pos`. Returns [value, nextPos], or null on
  // overrun / implausible size. Uses number arithmetic (not <<) so lengths
  // beyond 32 bits don't wrap — the graph is small when weights are external,
  // but a length varint can still exceed 2^31.
  function readVarint(pos: number): [number, number] | null {
    let result = 0;
    let shift = 0;
    let p = pos;
    while (p < buf.length) {
      const b = buf[p++];
      result += (b & 0x7f) * Math.pow(2, shift);
      if ((b & 0x80) === 0) return [result, p];
      shift += 7;
      if (shift > 56) return null; // implausibly large — bail
    }
    return null;
  }

  function tryDecode(start: number, end: number): string | null {
    if (start > end || end > buf.length) return null;
    return utf8.decode(buf.subarray(start, end));
  }

  function scan(start: number, end: number, depth: number): void {
    if (depth > MAX_DEPTH) return;
    let key1: string | null = null;
    let val2: string | null = null;
    let p = start;
    while (p < end) {
      const tag = readVarint(p);
      if (!tag) return;
      p = tag[1];
      const field = Math.floor(tag[0] / 8);
      const wire = tag[0] & 7;
      if (wire === 0) {
        // varint
        const v = readVarint(p);
        if (!v) return;
        p = v[1];
      } else if (wire === 1) {
        p += 8; // 64-bit
      } else if (wire === 5) {
        p += 4; // 32-bit
      } else if (wire === 2) {
        // length-delimited: string, bytes, or sub-message
        const lenR = readVarint(p);
        if (!lenR) return;
        const subStart = lenR[1];
        const subEnd = subStart + lenR[0];
        if (subEnd > end) return; // truncated — not a valid field of this message
        if (field === 1) key1 = tryDecode(subStart, subEnd);
        else if (field === 2) val2 = tryDecode(subStart, subEnd);
        // Descend: a `location` entry may be nested arbitrarily deep.
        scan(subStart, subEnd, depth + 1);
        p = subEnd;
      } else {
        return; // wire types 3/4 (groups) / 6 don't occur in ONNX — malformed
      }
    }
    if (key1 === 'location' && val2) found.add(val2);
  }

  scan(0, buf.length, 0);
  return [...found];
}

/**
 * The external-data file names Transformers.js's `use_external_data_format`
 * (Path A) would generate for a graph — `<graph>.onnx_data` and, for a shard
 * count > 1, `<graph>.onnx_data_1 … _N-1`. A model whose declared locations are
 * all in this set can stay on Path A; anything else needs an explicit
 * `session_options.externalData` registration (Path B).
 *
 * @param graphFileName the ONNX graph's base name, e.g. "model_q4f16.onnx"
 */
export function isStandardDataFormat(locations: string[], graphFileName: string): boolean {
  if (locations.length === 0) return true;
  const base = `${graphFileName}_data`;
  return locations.every(
    (loc) => loc === base || new RegExp(`^${escapeRegExp(base)}_\\d+$`).test(loc),
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
