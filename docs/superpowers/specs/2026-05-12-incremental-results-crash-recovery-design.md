# Incremental Results & Crash Recovery

Status: APPROVED
Date: 2026-05-12
Branch: plan

## Problem

A recipe benchmark queue might have 10+ model+backend combinations. If model #3 running on WebGPU crashes the browser (OOM, GPU process kill), all progress is lost when using a batch-write-at-end strategy. Similarly, large models can hang for minutes during shader compilation or inference without ever crashing — blocking the entire queue indefinitely.

We need:
1. Each test result persisted to Supabase the moment it completes (incremental, not batch)
2. Crash detection and logging without relying on in-page JavaScript (which dies with the tab)
3. Timeout enforcement with per-phase limits
4. Queue resumption after crash or timeout

## Design

### Two-Phase Write (Crash Detection)

Every test item goes through this lifecycle:

```
[pending] → [running] → [completed | timeout | crashed | error]
```

**Before starting a test:** INSERT a record with `status: 'running'` into `results`.

**After completion:** UPDATE that record to `status: 'completed'` with metrics.

**On timeout:** UPDATE to `status: 'timeout'` with partial metrics (compilation time if inference timed out) and the `timeout_phase` that triggered it (`'download'`, `'compilation'`, or `'inference'`).

**On JS-catchable error:** UPDATE to `status: 'error'` with error message.

**On hard crash (tab dies):** The record stays `status: 'running'`. On next page load, query for own `'running'` records, mark them `status: 'crashed'`, and offer to resume the queue.

### Timeout Strategy

Separate timeouts per phase. Each phase has its own clock.

| Phase | Timeout | Rationale |
|-------|---------|-----------|
| Download stall | 60 seconds with no bytes received | Detects hung connections without penalizing slow-but-progressing downloads. |
| Compilation / model load | 5 minutes | WebGPU shader compilation for large models legitimately takes 2-3 min. 5 min covers edge cases. |
| First inference | 5 minutes (fixed) | No baseline yet. If a single forward pass exceeds 5 min, the model can't run practically on this hardware — log timeout and move on. |
| Subsequent iterations | 2x first inference time (floor: 1 min) | Adaptive: if first pass took 90s, timeout at 3 min. If first took 200ms, floor kicks in at 1 min. First inference is typically the slowest (cold caches, JIT warmup), so 2x is generous. |
| Total inference phase | 10 minutes | Hard cap regardless of per-iteration speed. |

**Design decision:** If the first inference exceeds 5 minutes, that IS the benchmark data. Log `status: 'timeout'`, `timeout_phase: 'inference'`, `iterations_completed: 0`, and advance the queue. "This model can't run practically on this device" is a useful signal for the hidden leaderboard.

**Timeout behavior:** When any phase exceeds its limit:
1. Abort the current operation (where possible — cancel pending inference)
2. Write `status: 'timeout'` with `timeout_phase: 'compilation' | 'inference'`
3. Include any partial metrics collected before timeout (e.g., compilation_ms if inference timed out)
4. Advance to the next item in the queue

**Skip-only-that-combo:** After a timeout on model3+WebGPU, the queue still attempts model4+WebGPU. This is optimistic — the GPU may recover between models. If cascading timeouts are observed in practice, the user can manually stop the queue.

### Incremental Persistence

Each test result is written to Supabase individually as it transitions through states:

```
Queue: [A+wasm, A+webgpu, B+wasm, B+webgpu, B+webnn_cpu]
                                    ↑ currently running

DB at this point:
  A+wasm     → completed (metrics)
  A+webgpu   → completed (metrics)  
  B+wasm     → completed (metrics)
  B+webgpu   → running   (no metrics yet)
  B+webnn_cpu → (not yet inserted)
```

Records are only INSERTed when the test item starts execution (not when the queue is created). This avoids cluttering the DB with `'pending'` rows that may never run if the user cancels.

### Queue State (Client-Side)

The queue definition (which items remain) is persisted in **localStorage** under a stable key:

```typescript
interface QueueState {
  run_id: string;           // UUID, groups all items in this run
  recipe_id: string | null; // null for ad-hoc /model runs
  items: QueueItem[];
  current_index: number;
  created_at: string;       // ISO timestamp
}

interface QueueItem {
  model_id: string;
  file_path: string;
  backend: string;
  data_type: string;
  result_id: string | null; // Supabase row ID once inserted
  status: 'pending' | 'running' | 'completed' | 'timeout' | 'crashed' | 'error';
}
```

On page load, if a `QueueState` exists in localStorage with `current_index < items.length`, the app offers to resume.

### Resume Flow

```
Page load
  → Check localStorage for QueueState
  → If found with incomplete items:
      → Query Supabase for own results where status = 'running'
      → Mark those as 'crashed' (UPDATE status, add crashed_at timestamp)
      → Update QueueItem.status in localStorage
      → Show resume prompt: "Your previous run was interrupted. Resume from item N?"
      → If yes: advance current_index past crashed item, continue queue
      → If no: clear localStorage queue state
```

### Timeout Implementation

```typescript
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout: ${label} exceeded ${ms}ms`));
    }, ms);

    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

const TIMEOUT_DOWNLOAD_STALL_MS = 60 * 1000;        // 60 seconds no progress
const TIMEOUT_COMPILATION_MS = 5 * 60 * 1000;       // 5 minutes
const TIMEOUT_FIRST_INFERENCE_MS = 5 * 60 * 1000;   // 5 minutes (no baseline)
const TIMEOUT_ITERATION_MULTIPLIER = 2;              // 2x first inference time
const TIMEOUT_ITERATION_FLOOR_MS = 60 * 1000;        // floor: 1 minute
const TIMEOUT_INFERENCE_TOTAL_MS = 10 * 60 * 1000;   // 10 minutes hard cap
```

For download (stall detection using ReadableStream progress monitoring):
```typescript
const DOWNLOAD_SOURCES = ['hf_cdn', 'hf_mirror', 'local'] as const;

async function downloadWithStallDetection(
  url: string,
  onProgress: (loaded: number, total: number) => void
): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);

  const reader = response.body!.getReader();
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  let lastProgressAt = performance.now();

  while (true) {
    const readPromise = reader.read();

    // Check for stall: if no new bytes in 60s, abort
    const result = await Promise.race([
      readPromise,
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reader.cancel();
          reject(new Error('Download stalled: no bytes received for 60s'));
        }, TIMEOUT_DOWNLOAD_STALL_MS);
      })
    ]);

    if (result.done) break;

    chunks.push(result.value);
    loaded += result.value.byteLength;
    lastProgressAt = performance.now();
    onProgress(loaded, contentLength);
  }

  const buffer = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer.buffer;
}

async function downloadModel(
  sources: { hf_cdn: string; hf_mirror: string; local: string },
  onProgress: (loaded: number, total: number) => void
): Promise<ArrayBuffer> {
  for (const source of DOWNLOAD_SOURCES) {
    const url = sources[source];
    if (!url) continue;
    try {
      return await downloadWithStallDetection(url, onProgress);
    } catch (err) {
      console.warn(`Download from ${source} failed:`, err);
      // Try next source
    }
  }
  throw new Error('All download sources exhausted');
}
```

For compilation:
```typescript
const session = await withTimeout(
  runtime.loadModel(modelBuffer),
  TIMEOUT_COMPILATION_MS,
  'compilation'
);
```

For inference (adaptive timeout):
```typescript
const inferenceStart = performance.now();
let firstInferenceMs: number | null = null;

for (let i = 0; i < iterations; i++) {
  // Check total inference phase timeout
  if (performance.now() - inferenceStart > TIMEOUT_INFERENCE_TOTAL_MS) {
    throw new Error('Timeout: total inference phase exceeded 10 min');
  }

  // Adaptive per-iteration timeout
  const iterationTimeout = firstInferenceMs === null
    ? TIMEOUT_FIRST_INFERENCE_MS
    : Math.max(firstInferenceMs * TIMEOUT_ITERATION_MULTIPLIER, TIMEOUT_ITERATION_FLOOR_MS);

  const result = await withTimeout(
    runtime.run(session, inputTensors),
    iterationTimeout,
    `inference iteration ${i + 1}`
  );

  if (firstInferenceMs === null) {
    firstInferenceMs = result.duration;
  }

  metrics.push(result.duration);
}
```

### Schema Changes

The `results` table from Phase 1 migrations needs these additional fields:

```sql
-- Add to results table
alter table public.results add column run_id uuid;
alter table public.results add column status text not null default 'completed'
  check (status in ('running', 'completed', 'timeout', 'crashed', 'error'));
alter table public.results add column timeout_phase text
  check (timeout_phase in ('download', 'compilation', 'inference') or timeout_phase is null);
alter table public.results add column error_message text;
alter table public.results add column started_at timestamptz not null default now();
alter table public.results add column completed_at timestamptz;

create index idx_results_run on public.results(run_id);
create index idx_results_status on public.results(user_id, status);
```

Updated results row lifecycle:
1. INSERT: `status='running'`, `started_at=now()`, `metrics=null`
2. UPDATE on success: `status='completed'`, `completed_at=now()`, `metrics={...}`
3. UPDATE on timeout: `status='timeout'`, `completed_at=now()`, `timeout_phase='compilation'|'inference'`, partial metrics if available
4. UPDATE on crash recovery: `status='crashed'`, `completed_at=now()` (set during next page load)
5. UPDATE on JS error: `status='error'`, `completed_at=now()`, `error_message='...'`

### Partial Metrics

When a timeout occurs, we preserve whatever data was collected before the failure:

| Timeout phase | Available metrics |
|---------------|-------------------|
| Download | None (model never arrived) |
| Compilation | None (model never loaded into runtime) |
| Inference (after some iterations) | compilation_ms, first_inference_ms, plus whatever iterations completed |

Partial metrics are stored in the same `metrics` JSONB field. A `null` `metrics` field means "never got any data" (compilation timeout or crash). A non-null `metrics` with fewer iterations than requested means "partial run".

Add an `iterations_completed` field to distinguish:
```sql
alter table public.results add column iterations_completed integer default 0;
```

### Run Grouping

All items in a single "Run Benchmark" click share a `run_id` (UUID). This allows:
- Querying all results from one benchmark run
- Showing a run summary: "8/10 completed, 1 timeout, 1 crashed"
- The hidden leaderboard can filter to only `status='completed'` results

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| User closes tab voluntarily mid-run | Same as crash — `'running'` records found on next visit, marked `'crashed'`, resume offered |
| User navigates away within the app | Queue paused, `'running'` record updated to `'error'` with message "user navigated away". On return to the page, resume offered. |
| Network offline during result write | Retry with exponential backoff (3 attempts, 1s/2s/4s). If all fail, store result in localStorage, sync on reconnect. |
| Multiple tabs | Lock via `BroadcastChannel`. Only one tab can run benchmarks. Second tab shows "Benchmark running in another tab." |
| Session expires mid-queue | Pause queue, show sign-in modal. After re-auth, resume. (Only applies to /recipe and /custom — /model doesn't require auth.) |

### What This Does NOT Cover

- Server-side timeout enforcement (all timeouts are client-side; the server trusts the client's status reports)
- Automatic retry of timed-out tests (user can manually re-run)
- Backend quarantine (if WebGPU times out on model 3, model 4 still tries WebGPU)
- Queue priority reordering (items execute in declared order)
