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
      webnn_ep: this.webnnEp || 'Default / Unknown',
      gpu_driver_version: this.gpuDriverVersion || null,
      npu_driver_version: this.npuDriverVersion || null,
      iterations,
      started_at: new Date().toISOString(),
    };

    const { data, error } = await (this.supabase
      .from('results') as any)
      .insert(row)
      .select('id')
      .single();

    if (error || !data) {
      console.error('[ResultsWriter] createResult failed:', error?.message);
      return null;
    }

    this.resultIds.set(item.id, (data as { id: string }).id);
    return (data as { id: string }).id;
  }

  async completeResult(item: TestItem, result: TestResult): Promise<void> {
    const dbId = this.resultIds.get(item.id);
    if (!dbId) return;

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

    console.log('[ResultsWriter] completeResult update payload:', { dbId, webnn_capability: update.webnn_capability });

    const { error } = await (this.supabase.from('results') as any).update(update).eq('id', dbId);
    if (error) console.error('[ResultsWriter] completeResult failed:', error.message, { dbId, status: update.status });
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
    const { data: existing } = await (this.supabase.from('results') as any)
      .select('id')
      .eq('user_id', this.userId)
      .eq('model_id', item.hf_model_id)
      .eq('file_path', item.file_path)
      .eq('backend', item.backend)
      .in('status', ['error', 'timeout'])
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

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
