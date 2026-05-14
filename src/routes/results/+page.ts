import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';

export interface ResultRow {
  id: string;
  run_id: string | null;
  model_id: string;
  backend: string;
  data_type: string;
  status: string;
  metrics: {
    compilation_ms: number;
    first_inference_ms: number;
    time_to_first_ms: number;
    average_ms: number;
    median_ms: number;
    best_ms: number;
    p90_ms: number;
    throughput_fps: number;
  } | null;
  iterations: number;
  iterations_completed: number;
  started_at: string;
  completed_at: string | null;
  cpu: string;
  gpu: string;
  os: string;
  browser: string;
}

export const load: PageLoad = async () => {
  const supabase = createClient();

  const { data, error } = await (supabase
    .from('results') as any)
    .select('id, run_id, model_id, backend, data_type, status, metrics, iterations, iterations_completed, started_at, completed_at, cpu, gpu, os, browser')
    .order('created_at', { ascending: false })
    .limit(100);

  const results: ResultRow[] = (data as ResultRow[]) ?? [];

  return {
    results,
    error: error?.message ?? null,
  };
};
