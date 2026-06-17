import { createClient } from '$lib/supabase/client';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { TestItem, TestResult, EnvironmentInfo } from './types';

export class ResultsWriter {
  private supabase = createClient();
  private runId: string;
  private userId: string;
  private environment: EnvironmentInfo;
  private ortVersion: string;
  private litertVersion: string;
  private webnnEp: string;
  private gpuDriverVersion: string;
  private npuDriverVersion: string;
  private resultIds = new Map<string, string>();

  constructor(userId: string, environment: EnvironmentInfo, ortVersion: string, litertVersion: string, webnnEp: string = '', gpuDriverVersion: string = '', npuDriverVersion: string = '') {
    this.runId = crypto.randomUUID();
    this.userId = userId;
    this.environment = environment;
    this.ortVersion = ortVersion;
    this.litertVersion = litertVersion;
    this.webnnEp = webnnEp;
    this.gpuDriverVersion = gpuDriverVersion;
    this.npuDriverVersion = npuDriverVersion;
  }

  /**
   * Run a Supabase write with bounded retries. The dominant failure mode on a
   * long multi-model run is an expired access token (silent 401) or a transient
   * network blip — both swallowed by the old code, which is how passing tests
   * went missing. We refresh the session before retrying so the next attempt
   * carries a fresh token, and surface the final outcome to the caller.
   */
  private async withRetry<T extends { error: any }>(
    label: string,
    op: () => Promise<T>,
    attempts = 3,
  ): Promise<{ ok: boolean; error: any }> {
    let lastError: any = null;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await op();
        if (!res.error) return { ok: true, error: null };
        lastError = res.error;
      } catch (e) {
        lastError = e;
      }
      // Refresh the token before the next try — covers the expired-session case.
      if (i < attempts - 1) {
        try { await this.supabase.auth.refreshSession(); } catch {}
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
    console.error(`[ResultsWriter] ${label} failed after ${attempts} attempts:`, lastError?.message ?? lastError);
    return { ok: false, error: lastError };
  }

  async createResult(item: TestItem, iterations: number): Promise<string | null> {
    const row = {
      run_id: this.runId,
      user_id: this.userId,
      model_id: item.hf_model_id,
      file_path: item.file_path,
      backend: item.backend,
      data_type: item.data_type,
      status: 'running' as const,
      cpu: this.environment.cpu,
      gpu: this.environment.gpu,
      os: this.environment.os,
      browser: this.environment.browser,
      browser_version: this.environment.browser_version,
      ort_version: item.runtime === 'onnx' ? this.ortVersion : '',
      litert_version: item.runtime === 'litert' ? this.litertVersion : '',
      webnn_ep: this.webnnEp || null,
      gpu_driver_version: this.gpuDriverVersion || null,
      npu_driver_version: this.npuDriverVersion || null,
      iterations,
      started_at: new Date().toISOString(),
    };

    let insertedId: string | null = null;
    const { ok } = await this.withRetry('createResult', async () => {
      const res = await (this.supabase
        .from('results') as any)
        .insert(row)
        .select('id')
        .single();
      if (!res.error && res.data) insertedId = (res.data as { id: string }).id;
      // Treat a missing id as an error so withRetry retries it.
      return { error: res.error ?? (res.data ? null : new Error('no id returned')) };
    });

    if (!ok || !insertedId) return null;

    this.resultIds.set(item.id, insertedId);
    return insertedId;
  }

  /**
   * Writes the final metrics for a completed/errored run.
   * Returns true only if the row was actually persisted — callers must not
   * report "Saved" unless this returns true.
   */
  async completeResult(item: TestItem, result: TestResult): Promise<boolean> {
    const dbId = this.resultIds.get(item.id);
    // No row id means createResult never landed. Try once to insert a fresh,
    // already-complete row so a passing test isn't lost just because the
    // initial 'running' insert failed.
    if (!dbId) {
      return this.insertCompleted(item, result);
    }

    const m = result.metrics;
    const update = {
      status: result.error_message ? 'error' : 'completed',
      error_message: result.error_message,
      iterations_completed: result.iterations_completed,
      completed_at: result.completed_at ?? new Date().toISOString(),
      compilation_ms:        m?.compilation_ms        ?? null,
      load_and_compile_ms:   m?.load_and_compile_ms   ?? null,
      first_inference_ms:    m?.first_inference_ms    ?? null,
      time_to_first_ms:   m?.time_to_first_ms   ?? null,
      average_ms:         m?.average_ms         ?? null,
      median_ms:          m?.median_ms          ?? null,
      best_ms:            m?.best_ms            ?? null,
      p90_ms:             m?.p90_ms             ?? null,
      throughput_fps:     m?.throughput_fps     ?? null,
      inference_times:    result.inference_times ?? [],
      logs:               result.logs ?? [],
      webnn_capability:   result.webnn_capability ?? null,
    };

    const { ok } = await this.withRetry('completeResult', () =>
      (this.supabase.from('results') as any).update(update).eq('id', dbId),
    );
    return ok;
  }

  /**
   * Fallback path: insert a row that's already in its final state. Used when
   * the initial 'running' insert failed but the run itself succeeded, so the
   * metrics still get persisted instead of silently dropped.
   */
  private async insertCompleted(item: TestItem, result: TestResult): Promise<boolean> {
    const m = result.metrics;
    const row = {
      run_id: this.runId,
      user_id: this.userId,
      model_id: item.hf_model_id,
      file_path: item.file_path,
      backend: item.backend,
      data_type: item.data_type,
      status: result.error_message ? 'error' : 'completed',
      error_message: result.error_message,
      cpu: this.environment.cpu,
      gpu: this.environment.gpu,
      os: this.environment.os,
      browser: this.environment.browser,
      browser_version: this.environment.browser_version,
      ort_version: item.runtime === 'onnx' ? this.ortVersion : '',
      litert_version: item.runtime === 'litert' ? this.litertVersion : '',
      webnn_ep: this.webnnEp || null,
      gpu_driver_version: this.gpuDriverVersion || null,
      npu_driver_version: this.npuDriverVersion || null,
      iterations: result.iterations,
      iterations_completed: result.iterations_completed,
      started_at: result.started_at ?? new Date().toISOString(),
      completed_at: result.completed_at ?? new Date().toISOString(),
      compilation_ms:        m?.compilation_ms        ?? null,
      load_and_compile_ms:   m?.load_and_compile_ms   ?? null,
      first_inference_ms:    m?.first_inference_ms    ?? null,
      time_to_first_ms:      m?.time_to_first_ms      ?? null,
      average_ms:            m?.average_ms            ?? null,
      median_ms:             m?.median_ms             ?? null,
      best_ms:               m?.best_ms               ?? null,
      p90_ms:                m?.p90_ms                ?? null,
      throughput_fps:        m?.throughput_fps        ?? null,
      inference_times:       result.inference_times ?? [],
      logs:                  result.logs ?? [],
      webnn_capability:      result.webnn_capability ?? null,
    };

    let insertedId: string | null = null;
    const { ok } = await this.withRetry('insertCompleted', async () => {
      const res = await (this.supabase.from('results') as any).insert(row).select('id').single();
      if (!res.error && res.data) insertedId = (res.data as { id: string }).id;
      return { error: res.error ?? (res.data ? null : new Error('no id returned')) };
    });
    if (ok && insertedId) this.resultIds.set(item.id, insertedId);
    return ok;
  }

  async markTimeout(item: TestItem, phase: 'download' | 'compilation' | 'inference'): Promise<void> {
    const dbId = this.resultIds.get(item.id);
    if (!dbId) return;

    const update = {
      status: 'timeout',
      timeout_phase: phase,
      completed_at: new Date().toISOString(),
      logs: [`[timeout] phase=${phase}`],
    };

    const { error } = await (this.supabase.from('results') as any).update(update).eq('id', dbId);
    if (error) console.error('[ResultsWriter] markTimeout failed:', error.message);
  }

  async markStopped(item: TestItem): Promise<void> {
    const dbId = this.resultIds.get(item.id);
    if (!dbId) return;

    const update = {
      status: 'error',
      error_message: 'Stopped by user',
      completed_at: new Date().toISOString(),
    };

    const { error } = await (this.supabase.from('results') as any).update(update).eq('id', dbId);
    if (error) console.error('[ResultsWriter] markStopped failed:', error.message);
  }

  async retryResult(item: TestItem, iterations: number): Promise<string | null> {
    // Reclaim the most recent non-completed row for this exact (model, file,
    // backend). Use a plain list + take [0] — NOT .single(), which returns
    // null whenever the match count isn't exactly 1 (including 2+ rows). With
    // several stale error rows around, .single() silently missed and we
    // inserted a fresh row, leaving the old error row behind → duplicate
    // (one error + one success) on every retry.
    const { data: rows } = await (this.supabase.from('results') as any)
      .select('id')
      .eq('user_id', this.userId)
      .eq('model_id', item.hf_model_id)
      .eq('file_path', item.file_path)
      .eq('backend', item.backend)
      .in('status', ['error', 'timeout', 'running', 'crashed'])
      .order('started_at', { ascending: false })
      .limit(1);

    const existing = Array.isArray(rows) ? rows[0] : null;

    if (existing?.id) {
      const update = {
        status: 'running',
        error_message: null,
        started_at: new Date().toISOString(),
        completed_at: null,
        iterations,
        iterations_completed: 0,
        compilation_ms: null,
        load_and_compile_ms: null,
        first_inference_ms: null,
        time_to_first_ms: null,
        average_ms: null,
        median_ms: null,
        best_ms: null,
        p90_ms: null,
        throughput_fps: null,
        inference_times: [],
        logs: [],
        webnn_capability: null,
      };
      const { error } = await (this.supabase.from('results') as any).update(update).eq('id', existing.id);
      if (error) {
        console.error('[ResultsWriter] retryResult update failed:', error.message);
        return null;
      }
      this.resultIds.set(item.id, existing.id);
      return existing.id;
    }

    // No existing error row found, create a new one
    return this.createResult(item, iterations);
  }

  private accessToken: string | null = null;

  async cacheAccessToken(): Promise<void> {
    try {
      const { data } = await this.supabase.auth.getSession();
      this.accessToken = data.session?.access_token ?? null;
    } catch {
      this.accessToken = null;
    }
  }

  /**
   * Best-effort sync mark for in-flight rows on tab close. Uses fetch keepalive so
   * the request survives the unload — async fetch would be cancelled.
   * Requires accessToken to be cached ahead of time (auth.getSession is async).
   */
  markCrashedSync(item: TestItem): void {
    const dbId = this.resultIds.get(item.id);
    if (!dbId || !this.accessToken) return;

    try {
      const url = `${PUBLIC_SUPABASE_URL}/rest/v1/results?id=eq.${dbId}`;
      const body = JSON.stringify({
        status: 'crashed',
        error_message: 'Tab closed or browser crashed during run',
        completed_at: new Date().toISOString(),
      });
      fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': PUBLIC_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${this.accessToken}`,
          'Prefer': 'return=minimal',
        },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }

  hasResultId(item: TestItem): boolean {
    return this.resultIds.has(item.id);
  }

  getRunId(): string {
    return this.runId;
  }
}
