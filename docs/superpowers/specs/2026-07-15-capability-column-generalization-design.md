# Generalize `webnn_capability` → `capability` (add LiteRT WebGPU delegation capture)

**Date:** 2026-07-15
**Status:** Design — awaiting review

## Problem

The `results.webnn_capability` JSONB column records graph-delegation info
(`total_nodes`, `supported_nodes`, `unsupported_ops`, and WebNN-only
`partitions`). It is only ever populated for **WebNN** backends because the
capture is gated on `backend.startsWith('webnn_')` in two places, and
`finalizeCapture()` returns `null` for any non-WebNN backend.

As a result, a LiteRT.js **WebGPU** run — e.g.
`litert-community/cait_xxs24_224/model.tflite` on `webnn_gpu`/`webgpu`, where
the TFLite GPU delegate reports `46 operations will run on the GPU, and the
remaining 1141 operations will run on the CPU` plus per-op rejections
(`BROADCAST_TO`, `RESHAPE`, `STRIDED_SLICE`, `TRANSPOSE`) — records nothing,
because those messages are a different format than the WebNN regexes match and
the backend is gated out anyway.

## Goals

1. Rename the column `webnn_capability` → `capability` (it is no longer
   WebNN-specific), across DB + all code.
2. Capture delegation capability for the **LiteRT.js WebGPU (GPU delegate)**
   path, in addition to the existing WebNN backends.
3. Generalize the results-page display so WebGPU rows appear alongside WebNN.

## Non-goals (deferred)

- **ONNX Runtime WebGPU capture.** ORT's WebGPU (JS EP) node-placement log
  format is unconfirmed; deferred to a follow-up once we have a sample console
  log from a real run. The infrastructure below is made backend-agnostic so
  adding it later is just a new regex + enabling capture in the ONNX path.
- Wiring up LLM (`results_llm`) capability capture — the LLM worker starts a
  capture but never finalizes/persists it (dead today). We only rename its
  column for schema consistency; no behavior change.

## Data shape (unchanged)

```ts
interface Capability {        // renamed from WebNNCapability
  partitions?: number;        // WebNN-only; omitted for WebGPU
  total_nodes: number;
  supported_nodes: number;
  unsupported_ops: string[];
}
```

For the LiteRT GPU delegate: `supported_nodes` = ops on GPU, `total_nodes` =
GPU + CPU, `unsupported_ops` = the distinct op types the delegate rejected,
`partitions` = omitted.

## Design

### 1. Database migration — `039_rename_capability.sql`

```sql
alter table public.results     rename column webnn_capability to capability;
alter table public.results_llm rename column webnn_capability to capability;

alter index if exists idx_results_webnn_capability_ops
  rename to idx_results_capability_ops;
```

`rename column` preserves all existing data and the GIN index contents. The
`results_llm` rename is cosmetic (column is unwritten today) but keeps both
tables consistent. **Deploy ordering:** apply this migration together with /
just before the code deploy, since the `select(...)` column lists below change
in lockstep.

### 2. Console-tap capture — add LiteRT GPU-delegate patterns

The tap logic is duplicated in two files (a classic worker can't import):
`src/lib/engine/worker/shared/webnn-tap.ts` (module worker / LLM) and an inline
copy in `src/lib/engine/worker/inference.worker.ts` (classic worker; the one
that actually runs vision LiteRT). Update **both** to keep them in sync; the
functional effect lands in the inline copy.

Add to `tapMessage()`:

```ts
// LiteRT / TFLite GPU delegate partition summary
//   "46 operations will run on the GPU, and the remaining 1141 operations will run on the CPU."
const gpuSummary = msg.match(
  /(\d+)\s+operations will run on the GPU,\s*and the remaining\s+(\d+)\s+operations will run on the CPU/i
);
if (gpuSummary) {
  state.supported_nodes = +gpuSummary[1];
  state.total_nodes = +gpuSummary[1] + +gpuSummary[2];
  return;
}

// LiteRT / TFLite GPU delegate per-op rejection
//   "BROADCAST_TO: Operation is not supported."
//   "RESHAPE: Tensor dimensions must be less than 5."
const gpuOp = msg.match(/^([A-Z][A-Z0-9_]+):\s+\S/);
if (gpuOp && TFLITE_OPS.has(gpuOp[1])) {
  state.unsupported_ops.add(gpuOp[1]);
  return;
}
```

The captured token is validated against `TFLITE_OPS` — a `Set` of known TFLite
BuiltinOperator names — rather than filtered by a log-level blocklist. TFLite op
names are drawn from a fixed vocabulary (all-caps, may contain digits/underscores:
`CONV_2D`, `DEPTHWISE_CONV_2D`, `MAX_POOL_2D`, `AVERAGE_POOL_2D`, `RELU`, `RELU6`,
`TANH`, `SIGMOID`, `ADD`, `SUB`, `MUL`, `DIV`, `EXP`, `FULLY_CONNECTED`, `SOFTMAX`,
`CONCATENATION`, `RESHAPE`, `GATHER`, `BROADCAST_TO`, `STRIDED_SLICE`, `TRANSPOSE`,
…). An allowlist makes false positives impossible (`GPU:`, `CPU:`, `OP:`,
`WARNING:` never match), at the cost of under-capturing a novel op absent from the
set — the safer failure direction (missing data beats polluted data). The set is
seeded from the TFLite BuiltinOperator enum; ops from the report
(`BROADCAST_TO`, `RESHAPE`, `STRIDED_SLICE`, `TRANSPOSE`) plus the common ops
above are included. Defined once as a module-level constant, shared textually
between the two tap copies. The set is seeded **broadly** — the full curated
TFLite op vocabulary (~150 ops, grouped by category: NN layers, activations,
pooling, shaping/array, math/reduction/logic, matrix, vision/signal,
quantization/variable, control-flow) with parenthetical aliases stripped
(`LOGISTIC (Sigmoid)` → `LOGISTIC`, `PACK (Stack)` → `PACK`) — to minimize
under-capture. The exact list lives in the implementation plan. Still validated
against a real `cait_xxs24_224` WebGPU run before shipping.

Ordering: keep the existing WebNN patterns first; the GPU-summary/op patterns
are additive and only match the delegate's distinct wording.

### 3. Make capture backend-agnostic

- `finalizeCapture(state, backend)`: drop the `!backend.startsWith('webnn_')`
  early return. Return `null` only when there is no meaningful node-count info
  (`total_nodes === 0 && supported_nodes === 0 && partitions === undefined`) —
  this still discards stray op-only captures. Keep emitting `partitions` only
  when defined.
- LiteRT path (`inference.worker.ts` `runLitert`): start capture for **WebGPU
  as well as WebNN** — `const captureCap = isWebNN || isWebGPU;`
- ONNX path (`runOrt`): leave capture gated to `webnn_` for now, with a
  `// TODO: enable for webgpu once ORT JS-EP placement log format is confirmed`.

### 4. Rename `webnn_capability` → `capability` in code

Field/type/variable rename across (exhaustive list from grep):

- `src/lib/engine/types.ts` — `WebNNCapability` interface → `Capability`;
  `TestResult.webnn_capability` (L48) and the `results_llm` row type's
  `webnn_capability` (L220) → `capability`.
- `src/lib/engine/worker/inference.worker.ts` — inline `WebNNCapability`
  interface → `Capability`; `TestResult.webnn_capability` (L61); the two
  `let webnn_capability` locals (L673, L921); the two `finalizeCapture`
  assignments (L701, L968); the two result-object keys (L754, L1032).
- `src/lib/engine/worker/shared/webnn-tap.ts` — `WebNNCapability` → `Capability`.
- `src/lib/engine/worker/llm.worker.ts` — no literal `webnn_capability`;
  update the type import name if it references `WebNNCapability`.
- `src/lib/engine/results-writer.ts` — three `webnn_capability:` keys
  (L131, L181, L261) → `capability:` and the `result.webnn_capability` reads.
- `src/routes/inference/leaderboard/+page.ts` — interface field (L19) and the
  `select(...)` column list (L66).
- `src/routes/inference/trend/+page.ts` — `select(...)` column list (L44).
- `src/routes/inference/leaderboard/+page.svelte` — `r.webnn_capability`
  (L338, L348) and the explanatory comment (L474).
- `src/routes/inference/run/+page.svelte` — `r.webnn_capability` mapping (L497).
- `src/lib/components/BenchmarkResults.svelte` — see §5.

The LLM leaderboard/results routes use `select('*')`, so they need no column-name
edits; the renamed column simply flows through.

### 5. Generalize the results table (`BenchmarkResults.svelte`)

- `webnnBackends` → `capabilityBackends` = `BACKEND_ORDER.filter(b => (b.startsWith('webnn_') || b === 'webgpu') && backends.includes(b))`.
- `partialDelegationRows`: unchanged logic, iterate `capabilityBackends`.
- Rename all `row.byBackend[b]?.webnn_capability` reads (L132, L246, L259, L272,
  L468) → `capability`.
- Section title (L423) `"WebNN Partial Delegation"` → `"Partial Delegation / GPU Offload"`.
- Keep the 4 sub-columns (Partitions / Total / Supported / Unsupported); the
  Partitions cell already renders `cap.partitions ?? '-'`, so WebGPU rows show
  `-` automatically.
- Export helpers (`toCapMarkdown` / `toCapJSON` / `toCapCSV`) iterate
  `capabilityBackends` and read `capability` — same rename.

## Testing / verification

- Unit: extend the tap tests (if present) with the GPU-summary and op-rejection
  strings from the report; assert `supported=46, total=1187, ops` include the 4.
- `npm run check` / typecheck passes after the rename.
- Manual: run `cait_xxs24_224/model.tflite` on the LiteRT WebGPU backend and
  confirm the `capability` column populates and the row shows in the generalized
  table. Confirm existing WebNN rows still populate (no regression).
- Confirm the migration applied and old rows' data survived the rename.

## Risks

- **Op-name under-capture.** The `TFLITE_OPS` allowlist eliminates false
  positives but will silently drop any rejected op whose name isn't in the set.
  Mitigated by seeding from the TFLite BuiltinOperator enum; eyeball a real
  `cait_xxs24_224` run's console to confirm every rejected op was recorded, and
  add any stragglers.
- **Deploy ordering.** Column rename + `select` list edits must ship together,
  else reads reference a missing column briefly.
