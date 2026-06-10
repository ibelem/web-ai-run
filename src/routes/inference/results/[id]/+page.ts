import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';
import type { ResultRow } from '../+page.server';

export const load: PageLoad = async ({ params }) => {
  const supabase = createClient();

  const { data, error } = await (supabase
    .from('results') as any)
    .select('id, run_id, model_id, file_path, backend, data_type, status, webnn_ep, ort_version, litert_version, compilation_ms, load_and_compile_ms, first_inference_ms, time_to_first_ms, average_ms, median_ms, best_ms, p90_ms, throughput_fps, iterations, iterations_completed, started_at, completed_at, cpu, gpu, os, browser')
    .eq('id', params.id)
    .single();

  return {
    result: (data as ResultRow) ?? null,
    error: error?.message ?? null,
  };
};
