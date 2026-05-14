import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';

export interface LeaderboardRow {
  model_id: string;
  backend: string;
  data_type: string;
  metrics: {
    average_ms: number;
    median_ms: number;
    best_ms: number;
    p90_ms: number;
    throughput_fps: number;
    compilation_ms: number;
    first_inference_ms: number;
    time_to_first_ms: number;
  } | null;
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
    .select('model_id, backend, data_type, metrics, cpu, gpu, os, browser, started_at')
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
    .limit(200);

  const results: LeaderboardRow[] = (data as LeaderboardRow[]) ?? [];

  return {
    results,
    error: error?.message ?? null,
  };
};
