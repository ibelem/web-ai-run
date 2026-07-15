# Capability Column Generalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the `webnn_capability` column to `capability` and capture graph-delegation stats for the LiteRT.js WebGPU (TFLite GPU-delegate) backend, not just WebNN.

**Architecture:** A console-tap in the inference worker scrapes runtime log lines during model compile into a `CaptureState`, then `finalizeCapture` serializes it to JSONB. We add regexes for the GPU-delegate partition summary and per-op rejections (validated against a fixed TFLite op allowlist), make capture backend-agnostic, enable it for LiteRT WebGPU, rename the column end-to-end, and generalize the results-page table to show WebGPU rows alongside WebNN.

**Tech Stack:** SvelteKit 2 / Svelte 5, TypeScript, Vitest, Supabase (Postgres), ONNX Runtime Web + LiteRT.js (loaded from CDN inside Web Workers).

## Global Constraints

- **No autonomous git commits.** The user performs all git operations (project convention). Each task's final step stages changes and hands off; do **not** run `git commit` unless the user asks.
- **Two tap copies must stay textually in sync.** The parsing logic exists in `src/lib/engine/worker/shared/webnn-tap.ts` (module worker) AND inlined in `src/lib/engine/worker/inference.worker.ts` (classic worker that cannot use `import`). Any change to one must be mirrored verbatim in the other.
- **Inner JSONB field names are unchanged.** Only the column name and the TS interface name change: `webnn_capability` → `capability`, `WebNNCapability` → `Capability`. The object's fields (`partitions`, `total_nodes`, `supported_nodes`, `unsupported_ops`) stay identical.
- **Deploy ordering.** The DB migration (Task 4) renames the column; the `select(...)` column-list edits in Task 3 reference the new name. Apply the migration together with (or immediately before) the Task 3 code at deploy time.
- **Verification commands:** `npm test` (vitest) and `npm run check` (svelte-check/typecheck).

---

## File Structure

- `src/lib/engine/worker/shared/webnn-tap.ts` — shared tap: `CaptureState`, `Capability`, `tapMessage`, `startWebNNCapture`, `finalizeCapture`, `installConsoleWrappers`. Add `TFLITE_OPS`, GPU-delegate regexes, backend-agnostic finalize; export `tapMessage` for testing. (Tasks 1, 3)
- `tests/lib/engine/webnn-tap.test.ts` — NEW unit tests for the parser. (Task 1)
- `src/lib/engine/worker/inference.worker.ts` — inlined tap copy + `runOrt`/`runLitert`. Mirror parsing, enable WebGPU capture, rename. (Tasks 2, 3)
- `src/lib/engine/worker/llm.worker.ts` — imports `Capability`-adjacent names from webnn-tap. Rename import only. (Task 3)
- `src/lib/engine/types.ts` — `TestResult` + LLM row type. Rename. (Task 3)
- `src/lib/engine/results-writer.ts` — three write paths. Rename. (Task 3)
- `src/routes/inference/leaderboard/+page.ts`, `+page.svelte`; `src/routes/inference/trend/+page.ts`; `src/routes/inference/run/+page.svelte` — rename field + select-column lists. (Task 3)
- `src/lib/components/BenchmarkResults.svelte` — rename reads (Task 3), then generalize the table (Task 5).
- `supabase/migrations/039_rename_capability.sql` — NEW migration. (Task 4)

---

## Task 1: LiteRT GPU-delegate capture in the shared tap module

**Files:**
- Modify: `src/lib/engine/worker/shared/webnn-tap.ts`
- Test: `tests/lib/engine/webnn-tap.test.ts` (create)

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `export function tapMessage(msg: string, state: CaptureState): void` (add `export`)
  - `export const TFLITE_OPS: Set<string>`
  - `finalizeCapture(state: CaptureState, backend: string): WebNNCapability | null` — now backend-agnostic (name stays `WebNNCapability` until Task 3).
  - `CaptureState` (already exported): `{ partitions: number | undefined; total_nodes: number; supported_nodes: number; unsupported_ops: Set<string> }`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/engine/webnn-tap.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { tapMessage, finalizeCapture, type CaptureState } from '$lib/engine/worker/shared/webnn-tap';

function newState(): CaptureState {
  return { partitions: undefined, total_nodes: 0, supported_nodes: 0, unsupported_ops: new Set() };
}

describe('webnn-tap GPU-delegate capture', () => {
  it('parses the TFLite GPU-delegate partition summary and op rejections', () => {
    const state = newState();
    tapMessage('BROADCAST_TO: Operation is not supported.', state);
    tapMessage('RESHAPE: Tensor dimensions must be less than 5. reshape_10', state);
    tapMessage('STRIDED_SLICE: Slice does not support shrink_axis_mask parameter.', state);
    tapMessage('TRANSPOSE: Permutation for transpose is invalid.', state);
    tapMessage('46 operations will run on the GPU, and the remaining 1141 operations will run on the CPU.', state);

    const cap = finalizeCapture(state, 'webgpu');
    expect(cap).toEqual({
      total_nodes: 1187,
      supported_nodes: 46,
      unsupported_ops: ['BROADCAST_TO', 'RESHAPE', 'STRIDED_SLICE', 'TRANSPOSE'],
    });
  });

  it('ignores non-op all-caps prefixes (log levels, GPU/CPU labels)', () => {
    const state = newState();
    tapMessage('WARNING: something happened', state);
    tapMessage('GPU: initialized', state);
    tapMessage('ERROR: bad thing', state);
    tapMessage('46 operations will run on the GPU, and the remaining 4 operations will run on the CPU.', state);

    const cap = finalizeCapture(state, 'webgpu');
    expect(cap).toEqual({ total_nodes: 50, supported_nodes: 46, unsupported_ops: [] });
  });

  it('still parses ORT WebNN capability lines (no regression)', () => {
    const state = newState();
    tapMessage(
      'number of partitions supported by WebNN: 2, number of nodes in the graph: 100, number of nodes supported by WebNN: 80',
      state,
    );
    const cap = finalizeCapture(state, 'webnn_gpu');
    expect(cap).toEqual({ partitions: 2, total_nodes: 100, supported_nodes: 80, unsupported_ops: [] });
  });

  it('returns null when no node-count info was captured (stray ops only)', () => {
    const state = newState();
    tapMessage('RESHAPE: Tensor dimensions must be less than 5.', state);
    expect(finalizeCapture(state, 'webgpu')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- webnn-tap`
Expected: FAIL — `tapMessage` is not exported (import error) and/or GPU-summary assertions fail.

- [ ] **Step 3: Add `TFLITE_OPS`, export `tapMessage`, add GPU regexes, make finalize backend-agnostic**

In `src/lib/engine/worker/shared/webnn-tap.ts`, add this constant just below the `WebNNCapability` interface (after line 13):

```ts
// Known TFLite BuiltinOperator names. The GPU-delegate rejection log lines look
// like "OP_NAME: <reason>"; we only treat the prefix as an unsupported op when
// it's in this set, so log-level prefixes (WARNING/ERROR/…) and labels (GPU/CPU)
// can never be misread as ops. Broad on purpose — under-capturing a novel op is
// safer than polluting the data. Keep in sync with the inline copy in
// inference.worker.ts.
export const TFLITE_OPS = new Set<string>([
  // NN layers
  'CONV_2D','DEPTHWISE_CONV_2D','FULLY_CONNECTED','EMBEDDING_LOOKUP','RNN','LSTM',
  'BIDIRECTIONAL_SEQUENCE_RNN','BIDIRECTIONAL_SEQUENCE_LSTM','UNIDIRECTIONAL_SEQUENCE_RNN',
  'UNIDIRECTIONAL_SEQUENCE_LSTM','CONV_3D','CONV_3D_TRANSPOSE','TRANSPOSE_CONV',
  'LOCAL_RESPONSE_NORMALIZATION','L2_NORMALIZATION',
  // Activations
  'RELU','RELU_N1_TO_1','RELU6','LEAKY_RELU','PRELU','LOGISTIC','TANH','SOFTMAX',
  'HARD_SWISH','ELU','GELU',
  // Pooling
  'AVERAGE_POOL_2D','MAX_POOL_2D','L2_POOL_2D',
  // Shaping / array
  'RESHAPE','RESIZE_BILINEAR','RESIZE_NEAREST_NEIGHBOR','CONCATENATION','SPLIT','SPLIT_V',
  'SLICE','STRIDED_SLICE','TRANSPOSE','SQUEEZE','EXPAND_DIMS','GATHER','GATHER_ND','SCATTER_ND',
  'PACK','UNPACK','PAD','PADV2','TILE','REVERSE_SEQUENCE','REVERSE_V2','SHAPE','RANK','SIZE',
  'BROADCAST_TO','BROADCAST_ARGS','SPACE_TO_BATCH_ND','BATCH_TO_SPACE_ND','SPACE_TO_DEPTH',
  'DEPTH_TO_SPACE','FLATTEN',
  // Math / reduction / logic
  'ADD','SUB','MUL','DIV','FLOOR_DIV','FLOOR_MOD','MOD','ABS','NEG','EXP','LOG','SQRT','RSQRT',
  'SQUARE','POW','ROUND','CEIL','FLOOR','SIN','COS','LOG_SOFTMAX','SUM','REDUCE_PROD','REDUCE_MAX',
  'REDUCE_MIN','REDUCE_ANY','REDUCE_ALL','MEAN','CUMSUM','ARG_MAX','ARG_MIN','EQUAL','NOT_EQUAL',
  'GREATER','GREATER_EQUAL','LESS','LESS_EQUAL','LOGICAL_AND','LOGICAL_OR','LOGICAL_NOT','SELECT',
  'SELECT_V2','WHERE',
  // Matrix
  'BATCH_MATMUL','MATRIX_DIAG','MATRIX_SET_DIAG',
  // Vision / signal
  'NON_MAX_SUPPRESSION_V4','NON_MAX_SUPPRESSION_V5','RFFT2D','COMPLEX_ABS','IMAG','REAL',
  // Quantization / variables
  'QUANTIZE','DEQUANTIZE','FAKE_QUANT','DENSIFY','CAST','HASHTABLE','HASHTABLE_LOOKUP',
  'HASHTABLE_FIND','HASHTABLE_IMPORT','HASHTABLE_SIZE','VAR_HANDLE','READ_VARIABLE','ASSIGN_VARIABLE',
  // Control flow / eval
  'CALL_ONCE','IF','WHILE','TOPK_V2','UNIQUE','SEGMENT_SUM','DYNAMIC_UPDATE_SLICE',
]);
```

Change the function signature on line 17 from `function tapMessage(...)` to `export function tapMessage(...)`.

Add the two GPU-delegate patterns to `tapMessage`, immediately before the closing `}` of the function (after the existing `litertOp` block, currently line 44):

```ts
  // LiteRT / TFLite GPU-delegate partition summary:
  //   "46 operations will run on the GPU, and the remaining 1141 operations will run on the CPU."
  const gpuSummary = msg.match(/(\d+)\s+operations will run on the GPU,\s*and the remaining\s+(\d+)\s+operations will run on the CPU/i);
  if (gpuSummary) {
    state.supported_nodes = +gpuSummary[1];
    state.total_nodes = +gpuSummary[1] + +gpuSummary[2];
    if (TAP_DEBUG) (globalThis as any).__webnnTapDebug?.(`[TAP-MATCH-GPU-CAP] gpu=${gpuSummary[1]} cpu=${gpuSummary[2]}`);
    return;
  }
  // LiteRT / TFLite GPU-delegate per-op rejection: "RESHAPE: Tensor dimensions must be less than 5."
  const gpuOp = msg.match(/^([A-Z][A-Z0-9_]+):\s+\S/);
  if (gpuOp && TFLITE_OPS.has(gpuOp[1])) {
    state.unsupported_ops.add(gpuOp[1]);
    if (TAP_DEBUG) (globalThis as any).__webnnTapDebug?.(`[TAP-MATCH-GPU-OP] op=${gpuOp[1]}`);
    return;
  }
```

In `finalizeCapture` (currently lines 85–96), delete the backend gate and drop `unsupported_ops.size` from the emptiness check. Replace:

```ts
  if (!backend.startsWith('webnn_')) return null;
  if (state.total_nodes === 0 && state.supported_nodes === 0 && state.unsupported_ops.size === 0 && state.partitions === undefined) return null;
```

with:

```ts
  // Backend-agnostic: WebNN, LiteRT GPU-delegate, and (later) ORT WebGPU all
  // populate this. Require some node-count info so stray op-only captures → null.
  if (state.total_nodes === 0 && state.supported_nodes === 0 && state.partitions === undefined) return null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- webnn-tap`
Expected: PASS (4 tests).

- [ ] **Step 5: Stage changes and hand off**

```bash
git add src/lib/engine/worker/shared/webnn-tap.ts tests/lib/engine/webnn-tap.test.ts
```
Suggested message (user commits): `feat(engine): capture LiteRT GPU-delegate op partitioning in console tap`

---

## Task 2: Mirror capture into the inference worker + enable WebGPU capture

**Files:**
- Modify: `src/lib/engine/worker/inference.worker.ts`

**Interfaces:**
- Consumes: the exact parsing logic authored in Task 1 (mirrored verbatim — the classic worker cannot import it).
- Produces: `runLitert` now records capability for WebGPU as well as WebNN.

- [ ] **Step 1: Add `TFLITE_OPS` to the inline tap block**

In `src/lib/engine/worker/inference.worker.ts`, immediately before `const TAP_DEBUG = true;` (line 96), insert the **same** `TFLITE_OPS` constant as in Task 1 Step 3 (copy it verbatim, but without the `export` keyword — this is a classic worker):

```ts
const TFLITE_OPS = new Set<string>([
  'CONV_2D','DEPTHWISE_CONV_2D','FULLY_CONNECTED','EMBEDDING_LOOKUP','RNN','LSTM',
  'BIDIRECTIONAL_SEQUENCE_RNN','BIDIRECTIONAL_SEQUENCE_LSTM','UNIDIRECTIONAL_SEQUENCE_RNN',
  'UNIDIRECTIONAL_SEQUENCE_LSTM','CONV_3D','CONV_3D_TRANSPOSE','TRANSPOSE_CONV',
  'LOCAL_RESPONSE_NORMALIZATION','L2_NORMALIZATION',
  'RELU','RELU_N1_TO_1','RELU6','LEAKY_RELU','PRELU','LOGISTIC','TANH','SOFTMAX',
  'HARD_SWISH','ELU','GELU',
  'AVERAGE_POOL_2D','MAX_POOL_2D','L2_POOL_2D',
  'RESHAPE','RESIZE_BILINEAR','RESIZE_NEAREST_NEIGHBOR','CONCATENATION','SPLIT','SPLIT_V',
  'SLICE','STRIDED_SLICE','TRANSPOSE','SQUEEZE','EXPAND_DIMS','GATHER','GATHER_ND','SCATTER_ND',
  'PACK','UNPACK','PAD','PADV2','TILE','REVERSE_SEQUENCE','REVERSE_V2','SHAPE','RANK','SIZE',
  'BROADCAST_TO','BROADCAST_ARGS','SPACE_TO_BATCH_ND','BATCH_TO_SPACE_ND','SPACE_TO_DEPTH',
  'DEPTH_TO_SPACE','FLATTEN',
  'ADD','SUB','MUL','DIV','FLOOR_DIV','FLOOR_MOD','MOD','ABS','NEG','EXP','LOG','SQRT','RSQRT',
  'SQUARE','POW','ROUND','CEIL','FLOOR','SIN','COS','LOG_SOFTMAX','SUM','REDUCE_PROD','REDUCE_MAX',
  'REDUCE_MIN','REDUCE_ANY','REDUCE_ALL','MEAN','CUMSUM','ARG_MAX','ARG_MIN','EQUAL','NOT_EQUAL',
  'GREATER','GREATER_EQUAL','LESS','LESS_EQUAL','LOGICAL_AND','LOGICAL_OR','LOGICAL_NOT','SELECT',
  'SELECT_V2','WHERE',
  'BATCH_MATMUL','MATRIX_DIAG','MATRIX_SET_DIAG',
  'NON_MAX_SUPPRESSION_V4','NON_MAX_SUPPRESSION_V5','RFFT2D','COMPLEX_ABS','IMAG','REAL',
  'QUANTIZE','DEQUANTIZE','FAKE_QUANT','DENSIFY','CAST','HASHTABLE','HASHTABLE_LOOKUP',
  'HASHTABLE_FIND','HASHTABLE_IMPORT','HASHTABLE_SIZE','VAR_HANDLE','READ_VARIABLE','ASSIGN_VARIABLE',
  'CALL_ONCE','IF','WHILE','TOPK_V2','UNIQUE','SEGMENT_SUM','DYNAMIC_UPDATE_SLICE',
]);
```

- [ ] **Step 2: Add the GPU-delegate patterns to the inline `tapMessage`**

In the inline `tapMessage` (currently lines 99–117), immediately before the closing `}` (after the `litertOp` block on line 116), insert the same two blocks as Task 1 Step 3:

```ts
  const gpuSummary = msg.match(/(\d+)\s+operations will run on the GPU,\s*and the remaining\s+(\d+)\s+operations will run on the CPU/i);
  if (gpuSummary) {
    state.supported_nodes = +gpuSummary[1];
    state.total_nodes = +gpuSummary[1] + +gpuSummary[2];
    if (TAP_DEBUG) (globalThis as any).__webnnTapDebug?.(`[TAP-MATCH-GPU-CAP] gpu=${gpuSummary[1]} cpu=${gpuSummary[2]}`);
    return;
  }
  const gpuOp = msg.match(/^([A-Z][A-Z0-9_]+):\s+\S/);
  if (gpuOp && TFLITE_OPS.has(gpuOp[1])) {
    state.unsupported_ops.add(gpuOp[1]);
    if (TAP_DEBUG) (globalThis as any).__webnnTapDebug?.(`[TAP-MATCH-GPU-OP] op=${gpuOp[1]}`);
    return;
  }
```

- [ ] **Step 3: Make the inline `finalizeCapture` backend-agnostic**

In the inline `finalizeCapture` (currently lines 145–152), replace:

```ts
  if (!backend.startsWith('webnn_')) return null;
  if (state.total_nodes === 0 && state.supported_nodes === 0 && state.unsupported_ops.size === 0 && state.partitions === undefined) return null;
```

with:

```ts
  if (state.total_nodes === 0 && state.supported_nodes === 0 && state.partitions === undefined) return null;
```

- [ ] **Step 4: Enable capture for WebGPU in `runLitert`**

In `runLitert`, change line 844 from:

```ts
  const captureWebnn = isWebNN;
```

to:

```ts
  // Capture delegation for WebNN (partitions) and LiteRT WebGPU (GPU delegate).
  const captureWebnn = isWebNN || isWebGPU;
```

Leave `runOrt`'s gate (line 586, `const captureWebnn = backend.startsWith('webnn_');`) as-is but add a comment above it:

```ts
  // TODO: enable for 'webgpu' once ORT JS-EP node-placement log format is confirmed.
  const captureWebnn = backend.startsWith('webnn_');
```

- [ ] **Step 5: Verify typecheck passes**

Run: `npm run check`
Expected: PASS (0 errors). No unit test — the parsing logic itself is covered by Task 1's tests against the identical shared copy.

- [ ] **Step 6: Stage changes and hand off**

```bash
git add src/lib/engine/worker/inference.worker.ts
```
Suggested message (user commits): `feat(engine): record capability for LiteRT WebGPU (GPU delegate)`

---

## Task 3: Rename `webnn_capability` → `capability` end-to-end

**Files:**
- Modify: `src/lib/engine/types.ts`, `src/lib/engine/worker/shared/webnn-tap.ts`, `src/lib/engine/worker/inference.worker.ts`, `src/lib/engine/worker/llm.worker.ts`, `src/lib/engine/results-writer.ts`, `src/routes/inference/leaderboard/+page.ts`, `src/routes/inference/leaderboard/+page.svelte`, `src/routes/inference/trend/+page.ts`, `src/routes/inference/run/+page.svelte`, `src/lib/components/BenchmarkResults.svelte`

**Interfaces:**
- Consumes: everything from Tasks 1–2.
- Produces: DB-facing field is now `capability`; the type is `Capability`. Must align with the migrated column (Task 4).

This is one atomic rename — typecheck ties the typed files together, so do all edits before verifying.

- [ ] **Step 1: Rename the type + field in `types.ts`**

In `src/lib/engine/types.ts`:
- Line 29: `export interface WebNNCapability {` → `export interface Capability {`
- Line 48: `webnn_capability?: WebNNCapability | null;` → `capability?: Capability | null;`
- Line 220 (LLM row type): `webnn_capability: Record<string, any> | null;` → `capability: Record<string, any> | null;`

- [ ] **Step 2: Rename in the two tap copies**

In `src/lib/engine/worker/shared/webnn-tap.ts`:
- Line 8: `export interface WebNNCapability {` → `export interface Capability {`
- Line 85 return type + line 89: `: WebNNCapability | null` and `const out: WebNNCapability =` → `Capability`.

In `src/lib/engine/worker/inference.worker.ts`:
- Line 30: `interface WebNNCapability {` → `interface Capability {`
- Line 61: `webnn_capability?: WebNNCapability | null;` → `capability?: Capability | null;`
- Line 145 / 149: `WebNNCapability` return type + `const out: WebNNCapability =` → `Capability`.
- Line 673 / 921: `let webnn_capability: WebNNCapability | null = null;` → `let capability: Capability | null = null;`
- Line 701 / 968: `webnn_capability = finalizeCapture(...)` → `capability = finalizeCapture(...)`
- Line 754 / 1032 (result object key): `webnn_capability,` → `capability,`

- [ ] **Step 3: Rename the import in `llm.worker.ts`**

In `src/lib/engine/worker/llm.worker.ts` line 3, if it imports the `WebNNCapability` type name, rename it to `Capability`. (The runtime imports `installConsoleWrappers, startWebNNCapture, finalizeCapture` — those names are unchanged; only a type import, if present, needs renaming.)

- [ ] **Step 4: Rename in `results-writer.ts`**

In `src/lib/engine/results-writer.ts`:
- Line 131: `webnn_capability:   result.webnn_capability ?? null,` → `capability:   result.capability ?? null,`
- Line 181: `webnn_capability:      result.webnn_capability ?? null,` → `capability:      result.capability ?? null,`
- Line 261: `webnn_capability: null,` → `capability: null,`

- [ ] **Step 5: Rename in the inference route loaders + pages**

- `src/routes/inference/leaderboard/+page.ts`:
  - Line 19: `webnn_capability: WebNNCapability | null;` → `capability: Capability | null;` (and rename the local `WebNNCapability` interface if declared in this file — line 4 — to `Capability`).
  - Line 66 select list: replace the substring `webnn_capability` with `capability`.
- `src/routes/inference/trend/+page.ts` line 44 select list: replace `webnn_capability` with `capability`.
- `src/routes/inference/leaderboard/+page.svelte`:
  - Lines 338, 348: `const cap = r.webnn_capability;` → `const cap = r.capability;`
  - Line 474 comment: change `The webnn_capability column` → `The capability column`.
- `src/routes/inference/run/+page.svelte` line 497: `webnn_capability: r.webnn_capability ?? null,` → `capability: r.capability ?? null,`

- [ ] **Step 6: Rename the reads in `BenchmarkResults.svelte`**

In `src/lib/components/BenchmarkResults.svelte`, replace `webnn_capability` with `capability` at lines 132, 246, 259, 272, 468 (all are `row.byBackend[b]?.webnn_capability`). Leave the `webnnBackends` variable and the section title alone — those change in Task 5.

- [ ] **Step 7: Verify typecheck + tests pass**

Run: `npm run check`
Expected: PASS (0 errors). If svelte-check reports a lingering `webnn_capability` or `WebNNCapability`, fix it — grep to confirm none remain in `src/`:

Run: `git grep -n "webnn_capability\|WebNNCapability" -- src`
Expected: no output.

Run: `npm test`
Expected: PASS (existing `results-writer.test.ts` does not reference the old name, so it stays green; if it asserts the full insert row, update the key there too).

- [ ] **Step 8: Stage changes and hand off**

```bash
git add src/
```
Suggested message (user commits): `refactor(engine): rename webnn_capability column to capability`

---

## Task 4: Database migration — rename both columns

**Files:**
- Create: `supabase/migrations/039_rename_capability.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `results.capability` and `results_llm.capability` columns; renamed index. Must be applied together with Task 3's code at deploy.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/039_rename_capability.sql`:

```sql
alter table public.results     rename column webnn_capability to capability;
alter table public.results_llm rename column webnn_capability to capability;

alter index if exists idx_results_webnn_capability_ops
  rename to idx_results_capability_ops;
```

- [ ] **Step 2: Verify against the schema**

Confirm the source column names match prior migrations: `results.webnn_capability` (migration 029) and `results_llm.webnn_capability` (migration 034), and the index name `idx_results_webnn_capability_ops` (migration 029). `rename column` preserves data and index contents.

Run: `git grep -n "webnn_capability" -- supabase/migrations`
Expected: only matches in `029_*.sql` and `034_*.sql` (the original definitions) — those are historical and stay as written; the new `039` renames them forward.

- [ ] **Step 3: Stage changes and hand off**

```bash
git add supabase/migrations/039_rename_capability.sql
```
Suggested message (user commits): `feat(db): rename webnn_capability column to capability`
**Note to user:** apply this migration to Supabase at the same deploy as the Task 3 code.

---

## Task 5: Generalize the results table for WebGPU

**Files:**
- Modify: `src/lib/components/BenchmarkResults.svelte`

**Interfaces:**
- Consumes: the renamed `capability` field (Task 3) and WebGPU capability data (Task 2).
- Produces: the "Partial Delegation / GPU Offload" table now includes WebGPU backends.

- [ ] **Step 1: Broaden the backend set**

In `src/lib/components/BenchmarkResults.svelte`, replace the `webnnBackends` derived (lines 124–126):

```ts
  const webnnBackends = $derived(
    BACKEND_ORDER.filter(b => b.startsWith('webnn_') && backends.includes(b))
  );
```

with:

```ts
  // Backends that report graph delegation/offload capability: WebNN + WebGPU.
  const capabilityBackends = $derived(
    BACKEND_ORDER.filter(b => (b.startsWith('webnn_') || b === 'webgpu') && backends.includes(b))
  );
```

- [ ] **Step 2: Update every `webnnBackends` reference to `capabilityBackends`**

Replace `webnnBackends` with `capabilityBackends` at its other use sites: the `partialDelegationRows` derived (line 131), the export helpers `toCapMarkdown`/`toCapJSON`/`toCapCSV` (lines 245, 258, 266, 271), and the template `{#each webnnBackends as ...}` blocks (lines 449, 454, 467). After this step:

Run: `git grep -n "webnnBackends" -- src/lib/components/BenchmarkResults.svelte`
Expected: no output.

- [ ] **Step 3: Retitle the section and gate**

- Line 421 gate: `{#if partialDelegationRows.length > 0 && webnnBackends.length > 0 && !isRunning}` → `{#if partialDelegationRows.length > 0 && capabilityBackends.length > 0 && !isRunning}`
- Line 423 title: `WebNN Partial Delegation ({partialDelegationRows.length})` → `Partial Delegation / GPU Offload ({partialDelegationRows.length})`

(The Partitions cell already renders `cap.partitions ?? '-'` at line 470, so WebGPU rows — which omit `partitions` — show `-` automatically. No further template change needed.)

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run check`
Expected: PASS (0 errors).

- [ ] **Step 5: Manual verification (records real behavior)**

Run a LiteRT WebGPU benchmark on `litert-community/cait_xxs24_224/model.tflite` (backend `webgpu`) via `npm run dev`. Confirm:
1. The row appears under the "Partial Delegation / GPU Offload" table with Total/Supported/Unsupported populated and Partitions showing `-`.
2. The `capability` DB column is written (check the row in Supabase).
3. Every op the console rejects (`BROADCAST_TO`, `RESHAPE`, `STRIDED_SLICE`, `TRANSPOSE`, …) appears in the Unsupported list. If any rejected op is missing, add its name to `TFLITE_OPS` in **both** tap copies.
4. An existing WebNN run still populates capability (no regression).

- [ ] **Step 6: Stage changes and hand off**

```bash
git add src/lib/components/BenchmarkResults.svelte
```
Suggested message (user commits): `feat(ui): show WebGPU rows in the partial-delegation table`

---

## Self-Review

**Spec coverage:**
- Rename column `webnn_capability` → `capability` (results + results_llm) → Tasks 3, 4. ✓
- Capture LiteRT WebGPU (GPU-delegate) capability → Tasks 1, 2. ✓
- Backend-agnostic `finalizeCapture` → Tasks 1, 2. ✓
- `TFLITE_OPS` allowlist (broad, curated list) → Tasks 1, 2. ✓
- Generalize display table + exports → Task 5. ✓
- ORT WebGPU deferred (TODO left in `runOrt`) → Task 2 Step 4. ✓
- Two tap copies kept in sync → Tasks 1, 2 (identical code blocks). ✓

**Placeholder scan:** No TBDs; all code blocks are concrete. Manual-verification step (Task 5 Step 5) is inherent to browser-only runtime behavior, not a placeholder.

**Type consistency:** `Capability` (renamed from `WebNNCapability`), field `capability`, inner fields `partitions`/`total_nodes`/`supported_nodes`/`unsupported_ops`, `TFLITE_OPS: Set<string>`, `tapMessage(msg, state)`, `finalizeCapture(state, backend)` — consistent across all tasks.

**Deploy ordering:** Task 4 migration + Task 3 code ship together — called out in Global Constraints and Task 4 Step 3.
