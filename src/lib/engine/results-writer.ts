import { createClient } from '$lib/supabase/client';
import type { TestItem, TestResult, EnvironmentInfo } from './types';

export class ResultsWriter {
  private supabase = createClient();
  private runId: string;
  private userId: string;
  private environment: EnvironmentInfo;
  private resultIds = new Map<string, string>();

  constructor(userId: string, environment: EnvironmentInfo) {
    this.runId = crypto.randomUUID();
    this.userId = userId;
    this.environment = environment;
  }

  async createResult(item: TestItem, iterations: number): Promise<string | null> {
    const row = {
      run_id: this.runId,
      user_id: this.userId,
      model_id: item.hf_model_id,
      backend: item.backend,
      data_type: item.data_type,
      status: 'running' as const,
      cpu: this.environment.cpu,
      gpu: this.environment.gpu,
      os: this.environment.os,
      os_version: this.environment.os_version,
      browser: this.environment.browser,
      browser_version: this.environment.browser_version,
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

    const update = {
      status: result.error_message ? 'error' : 'completed',
      error_message: result.error_message,
      metrics: result.metrics,
      iterations_completed: result.iterations_completed,
      completed_at: result.completed_at ?? new Date().toISOString(),
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
    };

    await (this.supabase.from('results') as any).update(update).eq('id', dbId);
  }

  getRunId(): string {
    return this.runId;
  }
}
