# ONNX external-data: read the location from the model

**Date:** 2026-07-08
**Status:** Approved (design), pending implementation
**Scope:** `/inference/run`, `/inference/custom`, `/llm/run`, `/llm/custom`

## Problem

Custom LLM/inference models fail with:

```
FAIL : Failed to load external data file "model.onnx.data", error: File not found in preloaded files.
```

The app assumes ONNX external-data files are named with the HuggingFace/optimum
convention `model.onnx_data` (single) or `model.onnx_data_1 … _N` (sharded).
Some models instead use the standard ONNX save convention `model.onnx.data`.
Two things break for those:

1. **Discovery** — we HEAD-probe / tree-match only `.onnx_data*`, so we never
   download `model.onnx.data`. On `/inference/run` the probe loop also emits
   benign-but-noisy `404`s for non-existent `.onnx_data_1`.
2. **Registration** — ONNX Runtime loads the exact `location` string baked into
   each external tensor (`TensorProto.external_data`, key `location`). We (and
   Transformers.js) register the buffer under `model.onnx_data`, so ORT asking
   for `model.onnx.data` finds nothing.

### Ground truth

The external-data filename is **not** a convention to guess — it is authored
inside the `.onnx` file. Each external tensor carries
`external_data: [{ key: "location", value: "<filename>" }]`. ORT loads exactly
that string. So the fix is to **read the location(s) from the model** and use
them for both download and registration.

### Transformers.js behaviour (confirmed)

- `model-loader.js:getExternalDataChunkNames` only ever produces
  `${fullName}_data` / `${fullName}_data_N`. It cannot emit `.onnx.data`.
- Two code paths in `getModelDataFiles`:
  - **Path A** — `use_external_data_format` is a count (or per-file Record of
    counts). Transformers.js *invents* the `_data` names. Per-graph correct, but
    naming is fixed.
  - **Path B** — caller sets `session_options.externalData = [{path, data}]`.
    Transformers.js passes it straight through; `path` is whatever we set.
- `session.js:77` copies `options.session_options` **fresh per graph file**, and
  `session_options.externalData` is a single array in `options`. So a global
  Path B array is shared across *all* graphs of a multi-graph model (VLMs:
  `embed_tokens`, `vision_encoder`, `decoder_model_merged`) — each session would
  mount every graph's data (memory blow-up / OOM). Path A avoids this because it
  derives names per-graph.

## Design

### 1. Shared parser — `src/lib/engine/onnx-external-data.ts`

```
parseExternalDataLocations(bytes: ArrayBuffer | Uint8Array): string[]
```

Returns the distinct `external_data.location` strings, in model order; `[]` when
the model has no external data.

Implementation: a minimal, dependency-free protobuf wire-format walk. It
recursively descends length-delimited (wire type 2) sub-messages and, for any
message whose field 1 decodes to the string `"location"`, records field 2 as a
filename. This finds `StringStringEntryProto{location}` wherever it appears
(initializers, sparse initializers, subgraph/attribute tensors) without
hard-coding ONNX schema paths, and the exact `key === "location"` match makes
false positives essentially impossible. Guards: recursion-depth cap, bounds
checks, malformed-branch bail. The `.onnx` graph is tiny when weights are
external, so this is cheap.

No CDN/library dependency (onnxruntime-web and transformers are already
CDN-loaded; no protobuf lib is bundled).

`llm.worker.ts` (module worker) imports this directly. `inference.worker.ts` is
a **classic** worker with zero static imports (Emscripten `importScripts`
constraint — see its header comment), so it carries an inlined copy with a
"keep in sync with onnx-external-data.ts" note, matching the file's existing
inlined download stack.

### 2. `inference.worker.ts` — non-LLM, raw ORT (`/inference/run` + `/inference/custom`)

**`url` (`/inference/run`):**
1. Download the `.onnx` graph.
2. `parseExternalDataLocations(graph)` → locations.
3. Resolve each location to physical files via an inlined **HF tree listing**
   (`/api/models/{id}/tree/main?recursive=1`) — exact file, or its
   `<location>_N` shards, with sizes. This replaces the `_data_1..99` HEAD-probe
   loop, eliminating the 404s. Bounded HEAD-probe only as a fallback if the tree
   is unavailable.
4. Register each location with `path = location` (concatenating shards into one
   buffer where a location is split).

**`buffer` (`/inference/custom`):** unchanged in the worker — the page already
sends `externalData: [{ path: fileName, data }]`, and for drag-drop the dropped
filename **is** the location. Only the page's sidecar *classification* changes
(§4).

**No external data:** locations `[]` → single-file download with today's
progress behaviour, untouched.

### 3. `llm.worker.ts` — Transformers.js, per-graph hybrid (`/llm/run` + `/llm/custom`)

After the bundle is staged in OPFS, read each graph `.onnx` from OPFS and parse
its locations. For each graph:

- **Standard** (every location matches the `${graphBaseName}_data[_N]`
  convention Path A produces): keep Path A — add the graph's shard count to the
  `use_external_data_format` Record. Zero change for today's working
  (incl. multi-graph VLM) models.
- **Non-standard** (any location Path A would not produce, e.g.
  `model.onnx.data`): use Path B — append `{ path: location, data: <relative
  file path served from OPFS> }` to `session_options.externalData`, and do **not**
  add a count for this graph.

The two coexist per-graph safely: a graph with a count uses Path A and ignores
`session_options.externalData`; a graph with no count (num_chunks 0) uses the
externalData entries. Non-standard graphs are single-graph text models in
practice, so the shared-array caveat is moot.

Discovery (`resolveLlmFileSet`) must also stop assuming `.onnx_data`: enumerate a
graph's external-data files from the HF tree by matching the parsed location
base (exact + `_N` shards) rather than the hard-coded `_data` pattern. Shard
merging in `setupOpfsFetch`/`buildShardGroups` is preserved, re-keyed on the
discovered base instead of the literal `.onnx_data` regex.

### 4. `/inference/custom` page — sidecar classification

`isSidecar(name)` currently matches only `/\.onnx_data(?:_\d+)?$/`. Broaden it to
also recognise `.onnx.data` (and `.onnx.data.N`) so `model.onnx.data` is
classified as a data file, not mistaken for the primary. Registration path stays
`f.name` (the dropped filename = the location).

### 5. Progress bars

The worker→page message contract (`download-start` / `download-progress` /
`download-done` with `totalBytes`, `loaded`, `total`, `currentFile`; and
inference's `progress` with `loaded_bytes`/`total_bytes`/`percent`) is
**unchanged**, so pages render without edits. Care points:

- **Accurate total:** compute from the real (now correctly-named) file set —
  HF tree sizes (`/run`), `file.size` (drop). The bar no longer under/over-counts.
- **Per-file:** keep emitting `currentFile` per file/shard.
- **Monotonic:** on `/inference/run`, the tiny graph is fetched first (status
  only, no percentage), then external-file progress is reported with the graph's
  bytes already counted as `prior` — so the percentage climbs 0→100 without a
  reset when the big files start.

### 6. Fallback

If `parseExternalDataLocations` returns `[]` but ORT still demands an external
file, fall back to the legacy `.onnx_data` guess — never worse than today.

## Testing

Unit-test `parseExternalDataLocations` (vitest) against constructed protobuf
fixtures:
- single `.onnx_data`
- single `.onnx.data`
- multi-file / sharded base
- no external data → `[]`
- nested (location inside a subgraph/attribute) still found

Manual: rerun the failing `/llm/custom` `.onnx.data` model; confirm a standard
`.onnx_data` HF model (single- and multi-graph) still loads; confirm no `404`
noise on `/inference/run`; confirm progress bars advance per-file to 100%.

## Out of scope

- Rewriting/patching model bytes.
- Arbitrary non-HF custom URLs for inference (the inference `url` source is
  always HF; `custom` is buffer).
- `.litertlm` / `.task` (LiteRT has no external-data mechanism).
