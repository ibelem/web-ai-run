import { describe, it, expect, vi, beforeEach } from 'vitest';

// Supabase's PostgREST query builder is a *thenable* — you await the builder
// itself, and every method (.insert/.update/.select/.eq/.in/.order/.limit/
// .single) returns the same builder. So instead of guessing which method is
// the "terminal", we model one chain object that resolves to the next response
// in a FIFO queue each time it's awaited. Each test enqueues one response per
// awaited statement, in call order.
const mockFrom = vi.fn();
const mockInsert = vi.fn();
const mockRefreshSession = vi.fn();

let responseQueue: any[] = [];
function enqueue(...responses: any[]) {
  responseQueue.push(...responses);
}

const chain: any = new Proxy(
  {
    // Thenable: awaiting the builder pulls the next queued response.
    then(resolve: (v: any) => void) {
      const next = responseQueue.shift() ?? { data: null, error: null };
      resolve(next);
    },
  },
  {
    get(target, prop) {
      if (prop === 'then') return (target as any).then;
      // .insert is spied so tests can assert it was (or wasn't) called.
      if (prop === 'insert') return mockInsert;
      // Every other builder method returns the same chain.
      return () => chain;
    },
  },
);

function resetChain() {
  responseQueue = [];
  mockFrom.mockReturnValue(chain);
  mockInsert.mockReturnValue(chain);
}

vi.mock('$lib/supabase/client', () => ({
  createClient: () => ({
    from: mockFrom,
    auth: { refreshSession: mockRefreshSession },
  }),
}));

vi.mock('$env/static/public', () => ({
  PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
}));

const ENV = {
  cpu: 'Test CPU', gpu: 'Test GPU', os: 'Test OS',
  browser: 'Chrome', browser_version: '120',
} as any;

import type { TestItem } from '$lib/engine/types';

const ITEM: TestItem = {
  id: 'item-1',
  hf_model_id: 'org/model',
  file_path: 'onnx/model.onnx',
  data_type: 'fp32',
  runtime: 'onnx',
  backend: 'webgpu',
  status: 'pending',
  progress: 0,
};

function makeResult(overrides: any = {}) {
  return {
    id: 'item-1',
    test_item: ITEM,
    metrics: {
      compilation_ms: 10, load_and_compile_ms: null, first_inference_ms: 5,
      time_to_first_ms: 15, average_ms: 8, median_ms: 8, best_ms: 7,
      p90_ms: 9, throughput_fps: 125,
    },
    inference_times: [8, 8, 9],
    warmup_ms: 5,
    iterations: 3,
    iterations_completed: 3,
    started_at: '2026-06-17T00:00:00.000Z',
    completed_at: '2026-06-17T00:00:01.000Z',
    error_message: null,
    ...overrides,
  };
}

describe('ResultsWriter — durable saves', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChain();
    mockRefreshSession.mockResolvedValue({ data: {}, error: null });
  });

  it('createResult retries after a transient failure and succeeds', async () => {
    // First insert errors, second returns an id.
    enqueue(
      { data: null, error: { message: 'network' } },
      { data: { id: 'row-1' }, error: null },
    );

    const { ResultsWriter } = await import('$lib/engine/results-writer');
    const w = new ResultsWriter('user-1', ENV, '1.0.0', '');
    const id = await w.createResult(ITEM, 3);

    expect(id).toBe('row-1');
    expect(mockRefreshSession).toHaveBeenCalledTimes(1); // refreshed once before retry
    expect(w.hasResultId(ITEM)).toBe(true);
  });

  it('createResult returns null after exhausting retries', async () => {
    enqueue(
      { data: null, error: { message: 'still down' } },
      { data: null, error: { message: 'still down' } },
      { data: null, error: { message: 'still down' } },
    );

    const { ResultsWriter } = await import('$lib/engine/results-writer');
    const w = new ResultsWriter('user-1', ENV, '1.0.0', '');
    const id = await w.createResult(ITEM, 3);

    expect(id).toBeNull();
    expect(w.hasResultId(ITEM)).toBe(false);
  });

  it('completeResult returns false when the update never lands', async () => {
    // 1 response for the seed createResult, then 3 failed update attempts.
    enqueue(
      { data: { id: 'row-1' }, error: null },
      { error: { message: '401 expired' } },
      { error: { message: '401 expired' } },
      { error: { message: '401 expired' } },
    );
    const { ResultsWriter } = await import('$lib/engine/results-writer');
    const w = new ResultsWriter('user-1', ENV, '1.0.0', '');
    await w.createResult(ITEM, 3);

    const ok = await w.completeResult(ITEM, makeResult());

    expect(ok).toBe(false);
  });

  it('completeResult returns true when the update lands', async () => {
    enqueue(
      { data: { id: 'row-1' }, error: null }, // createResult
      { error: null },                        // update
    );
    const { ResultsWriter } = await import('$lib/engine/results-writer');
    const w = new ResultsWriter('user-1', ENV, '1.0.0', '');
    await w.createResult(ITEM, 3);

    const ok = await w.completeResult(ITEM, makeResult());

    expect(ok).toBe(true);
  });

  it('retryResult reclaims an existing row when MULTIPLE stale rows exist (no duplicate insert)', async () => {
    const { ResultsWriter } = await import('$lib/engine/results-writer');
    const w = new ResultsWriter('user-1', ENV, '1.0.0', '');

    // The reclaim query (select…in…order…limit) resolves to a LIST. With 2+
    // stale error rows the old .single() returned null and we wrongly inserted
    // a new row. The fix takes rows[0]; here the list has 2 rows.
    enqueue(
      { data: [{ id: 'stale-newest' }, { id: 'stale-older' }], error: null }, // reclaim select
      { error: null },                                                        // reclaim update
    );

    const id = await w.retryResult(ITEM, 3);

    expect(id).toBe('stale-newest');     // reclaimed the newest, not a new row
    expect(mockInsert).not.toHaveBeenCalled(); // crucially: NO duplicate insert
    expect(w.hasResultId(ITEM)).toBe(true);
  });

  it('retryResult inserts a fresh row only when no stale row exists', async () => {
    const { ResultsWriter } = await import('$lib/engine/results-writer');
    const w = new ResultsWriter('user-1', ENV, '1.0.0', '');

    enqueue(
      { data: [], error: null },              // reclaim select — nothing to reclaim
      { data: { id: 'brand-new' }, error: null }, // createResult insert
    );

    const id = await w.retryResult(ITEM, 3);

    expect(id).toBe('brand-new');
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('completeResult falls back to a full insert when no row id exists', async () => {
    // createResult was never called (or failed) — no dbId stored.
    const { ResultsWriter } = await import('$lib/engine/results-writer');
    const w = new ResultsWriter('user-1', ENV, '1.0.0', '');
    expect(w.hasResultId(ITEM)).toBe(false);

    // The fallback insertCompleted path inserts a fully-formed row.
    enqueue({ data: { id: 'recovered-1' }, error: null });
    const ok = await w.completeResult(ITEM, makeResult());

    expect(ok).toBe(true);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const row = mockInsert.mock.calls[0][0];
    expect(row.status).toBe('completed');
    expect(row.average_ms).toBe(8);
    expect(w.hasResultId(ITEM)).toBe(true); // id now tracked for any later writes
  });
});
