import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';

export interface LeaderboardRow {
  model_id: string;
  file_path: string;
  backend: string;
  data_type: string;
  ort_version: string;
  litert_version: string;
  webnn_ep: string;
  compilation_ms: number | null;
  load_and_compile_ms: number | null;
  first_inference_ms: number | null;
  time_to_first_ms: number | null;
  average_ms: number | null;
  median_ms: number | null;
  best_ms: number | null;
  p90_ms: number | null;
  throughput_fps: number | null;
  cpu: string;
  gpu: string;
  os: string;
  browser: string;
  started_at: string;
}

export const load: PageLoad = async () => {
  const supabase = createClient();

  const { data, error } = await (supabase
    .from('results') as any)
    .select('model_id, file_path, backend, data_type, ort_version, litert_version, webnn_ep, compilation_ms, load_and_compile_ms, first_inference_ms, time_to_first_ms, average_ms, median_ms, best_ms, p90_ms, throughput_fps, cpu, gpu, os, browser, started_at')
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
    .limit(200);

  const results: LeaderboardRow[] = (data as LeaderboardRow[]) ?? [];

  return {
    results,
    error: error?.message ?? null,
  };
};
