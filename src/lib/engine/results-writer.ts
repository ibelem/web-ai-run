import { createClient } from '$lib/supabase/client';
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
      os_version: this.environment.os_version,
      browser: this.environment.browser,
      browser_version: this.environment.browser_version,
      ort_version: item.runtime === 'onnx' ? this.ortVersion : '',
      litert_version: item.runtime === 'litert' ? this.litertVersion : '',
      webnn_ep: this.webnnEp || 'Default / Unknown',
      gpu_driver_version: this.gpuDriverVersion || null,
      npu_driver_version: this.npuDriverVersion || null,
      iterations,
    };

    const { data, error } = await (this.supabase
      .from('results') as any)
      .insert(row)
      .select('id')
      .single();

    if (error || !data) return null;

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
    };

    await (this.supabase.from('results') as any).update(update).eq('id', dbId);
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

    await (this.supabase.from('results') as any).update(update).eq('id', dbId);
  }

  getRunId(): string {
    return this.runId;
  }
}
