import { describe, it, expect, vi, beforeEach } from 'vitest';

// Chainable Supabase mock — every builder method returns the chain, and the
// terminal call (.single() for inserts, .eq() for updates) is what we resolve.
const mockFrom = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();
const mockEq = vi.fn();
const mockRefreshSession = vi.fn();

const chainable = {
  insert: mockInsert,
  update: mockUpdate,
  select: mockSelect,
  single: mockSingle,
  eq: mockEq,
};

function resetChain() {
  mockFrom.mockReturnValue(chainable);
  mockInsert.mockReturnValue(chainable);
  mockUpdate.mockReturnValue(chainable);
  mockSelect.mockReturnValue(chainable);
  mockEq.mockReturnValue(chainable);
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

const ITEM = {
  id: 'item-1',
  hf_model_id: 'org/model',
  file_path: 'onnx/model.onnx',
  data_type: 'fp32',
  runtime: 'onnx' as const,
  backend: 'webgpu' as const,
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
    mockSingle
      .mockResolvedValueOnce({ data: null, error: { message: 'network' } })
      .mockResolvedValueOnce({ data: { id: 'row-1' }, error: null });

    const { ResultsWriter } = await import('$lib/engine/results-writer');
    const w = new ResultsWriter('user-1', ENV, '1.0.0', '');
    const id = await w.createResult(ITEM, 3);

    expect(id).toBe('row-1');
    expect(mockRefreshSession).toHaveBeenCalledTimes(1); // refreshed once before retry
    expect(w.hasResultId(ITEM)).toBe(true);
  });

  it('createResult returns null after exhausting retries', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'still down' } });

    const { ResultsWriter } = await import('$lib/engine/results-writer');
    const w = new ResultsWriter('user-1', ENV, '1.0.0', '');
    const id = await w.createResult(ITEM, 3);

    expect(id).toBeNull();
    expect(w.hasResultId(ITEM)).toBe(false);
    expect(mockSingle).toHaveBeenCalledTimes(3); // 3 attempts
  });

  it('completeResult returns false when the update never lands', async () => {
    // Seed a successful createResult so there's a dbId.
    mockSingle.mockResolvedValueOnce({ data: { id: 'row-1' }, error: null });
    const { ResultsWriter } = await import('$lib/engine/results-writer');
    const w = new ResultsWriter('user-1', ENV, '1.0.0', '');
    await w.createResult(ITEM, 3);

    // All update attempts fail.
    mockEq.mockResolvedValue({ error: { message: '401 expired' } });
    const ok = await w.completeResult(ITEM, makeResult());

    expect(ok).toBe(false);
    expect(mockUpdate).toHaveBeenCalledTimes(3);
  });

  it('completeResult returns true when the update lands', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'row-1' }, error: null });
    const { ResultsWriter } = await import('$lib/engine/results-writer');
    const w = new ResultsWriter('user-1', ENV, '1.0.0', '');
    await w.createResult(ITEM, 3);

    mockEq.mockResolvedValueOnce({ error: null });
    const ok = await w.completeResult(ITEM, makeResult());

    expect(ok).toBe(true);
  });

  it('completeResult falls back to a full insert when no row id exists', async () => {
    // createResult was never called (or failed) — no dbId stored.
    const { ResultsWriter } = await import('$lib/engine/results-writer');
    const w = new ResultsWriter('user-1', ENV, '1.0.0', '');
    expect(w.hasResultId(ITEM)).toBe(false);

    // The fallback insertCompleted path inserts a fully-formed row.
    mockSingle.mockResolvedValueOnce({ data: { id: 'recovered-1' }, error: null });
    const ok = await w.completeResult(ITEM, makeResult());

    expect(ok).toBe(true);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const row = mockInsert.mock.calls[0][0];
    expect(row.status).toBe('completed');
    expect(row.average_ms).toBe(8);
    expect(w.hasResultId(ITEM)).toBe(true); // id now tracked for any later writes
  });
});
