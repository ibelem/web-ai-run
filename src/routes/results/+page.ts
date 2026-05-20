import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';

export interface ResultRow {
  id: string;
  run_id: string | null;
  model_id: string;
  file_path: string;
  backend: string;
  data_type: string;
  status: string;
  compilation_ms: number | null;
  load_and_compile_ms: number | null;
  first_inference_ms: number | null;
  time_to_first_ms: number | null;
  average_ms: number | null;
  median_ms: number | null;
  best_ms: number | null;
  p90_ms: number | null;
  throughput_fps: number | null;
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
    .select('id, run_id, model_id, file_path, backend, data_type, status, compilation_ms, load_and_compile_ms, first_inference_ms, time_to_first_ms, average_ms, median_ms, best_ms, p90_ms, throughput_fps, iterations, iterations_completed, started_at, completed_at, cpu, gpu, os, browser')
    .order('created_at', { ascending: false })
    .limit(100);

  const results: ResultRow[] = (data as ResultRow[]) ?? [];

  return {
    results,
    error: error?.message ?? null,
  };
};
